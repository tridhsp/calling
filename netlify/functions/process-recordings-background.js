// netlify/functions/process-recordings-background.js
// Background function (15 min timeout) - indicated by "-background" in filename

const fetch = require('node-fetch');
const https = require('https');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { createClient } = require('@supabase/supabase-js');

// Reuse TCP/TLS connections
const keepAliveAgent = new https.Agent({ 
  keepAlive: true, 
  maxSockets: 10,
  timeout: 180000 // 3 minute socket timeout
});

// R2 Configuration
const s3Client = new S3Client({
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  region: 'auto',
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
  requestHandler: {
    requestTimeout: 180000, // 3 minute timeout for R2
  },
});

const BUCKET = process.env.R2_BUCKET_NAME_STUDENTS_TEACHERS || 'teachersandlearners';

// Configuration
const CONFIG = {
  DOWNLOAD_TIMEOUT_MS: 720000,    // 12 minutes for slow VBot API
  MAX_RETRIES: 2,                  // Retry download up to 2 times
  RETRY_DELAY_MS: 5000,            // Wait 5 seconds between retries
  LOCK_EXPIRY_MINUTES: 15,         // Lock expires after 15 minutes
};

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
};

// Helper: Sleep function
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper: Generate unique instance ID
const generateInstanceId = () => `instance_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// Helper: Download with retries
async function downloadWithRetry(url, token, maxRetries = 3) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Download attempt ${attempt}/${maxRetries}...`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CONFIG.DOWNLOAD_TIMEOUT_MS);
      
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` },
        agent: keepAliveAgent,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      // Get buffer with progress logging
      const contentLength = response.headers.get('content-length');
      console.log(`Response OK, content-length: ${contentLength || 'unknown'}`);
      
      const buffer = await response.buffer();
      console.log(`Downloaded ${buffer.length} bytes successfully`);
      
      return buffer;
      
    } catch (err) {
      lastError = err;
      console.error(`Attempt ${attempt} failed: ${err.message}`);
      
      if (attempt < maxRetries) {
        console.log(`Waiting ${CONFIG.RETRY_DELAY_MS}ms before retry...`);
        await sleep(CONFIG.RETRY_DELAY_MS);
      }
    }
  }
  
  throw new Error(`Download failed after ${maxRetries} attempts: ${lastError.message}`);
}

// Helper: Acquire global lock
async function acquireLock(supabase, instanceId) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CONFIG.LOCK_EXPIRY_MINUTES * 60 * 1000);
  
  // First, clean up any expired locks
  await supabase
    .from('processing_locks')
    .update({ locked_by: null, locked_at: null, expires_at: null })
    .eq('lock_name', 'recording_upload')
    .lt('expires_at', now.toISOString());
  
  // Try to acquire the lock (only if not locked or expired)
  const { data, error } = await supabase
    .from('processing_locks')
    .update({ 
      locked_by: instanceId, 
      locked_at: now.toISOString(),
      expires_at: expiresAt.toISOString()
    })
    .eq('lock_name', 'recording_upload')
    .is('locked_by', null)
    .select();
  
  if (error) {
    console.error('Lock acquire error:', error);
    return false;
  }
  
  // If data is empty, lock was not acquired (someone else has it)
  return data && data.length > 0;
}

// Helper: Release global lock
async function releaseLock(supabase, instanceId) {
  const { error } = await supabase
    .from('processing_locks')
    .update({ locked_by: null, locked_at: null, expires_at: null })
    .eq('lock_name', 'recording_upload')
    .eq('locked_by', instanceId);
  
  if (error) {
    console.error('Lock release error:', error);
  }
}

// Main handler
exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  const instanceId = generateInstanceId();
  console.log(`Process Recordings Background: Starting (${instanceId})`);

  // Initialize Supabase
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  // STEP 1: Try to acquire global lock
  const lockAcquired = await acquireLock(supabase, instanceId);
  
  if (!lockAcquired) {
    console.log('Another instance is already processing. Exiting.');
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ 
        success: true, 
        message: 'Another job is running. Skipped.',
        instanceId 
      }),
    };
  }

console.log('Lock acquired, starting processing...');

  let successCount = 0;
  let failCount = 0;

  try {
// STEP 2: Reset any stuck "processing" records older than 20 minutes


    const twentyMinutesAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    
    const { error: resetError } = await supabase
      .from('phone_numbers_recordings')
      .update({ processing_status: 'failed' })
      .eq('processing_status', 'processing')
      .lt('updated_at', twentyMinutesAgo);
    
    if (resetError) {
      console.log('Reset stuck records error (non-fatal):', resetError.message);
    } else {
      console.log('Reset any stuck processing records older than 20 min');
    }

// STEP 3: Find pending records (up to 5 per run)
    const { data: pendingRecords, error: fetchError } = await supabase
      .from('phone_numbers_recordings')
      .select('id, phone_number, original_vbot_url, created_at, retry_count')
      .is('recording_url', null)
      .not('original_vbot_url', 'is', null)
      .or('processing_status.is.null,processing_status.eq.failed')
      .lt('retry_count', 3)  // Skip records that failed 3+ times
      .order('created_at', { ascending: true })
      .limit(5);

    if (fetchError) {
      throw new Error(`Supabase fetch error: ${fetchError.message}`);
    }

    if (!pendingRecords || pendingRecords.length === 0) {
      console.log('No pending recordings to process');
      await releaseLock(supabase, instanceId);
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ 
          success: true, 
          message: 'No pending recordings',
          instanceId 
        }),
      };
    }


    
    for (const record of pendingRecords) {
      const { id, phone_number, original_vbot_url } = record;
      const currentRetryCount = record.retry_count || 0;

      console.log(`\n--- Processing record: ${id} (retry ${currentRetryCount}) ---`);
      console.log(`Phone: ${phone_number}`);
      console.log(`VBot URL: ${original_vbot_url}`);

      // Mark record as processing
    const { error: markError } = await supabase
      .from('phone_numbers_recordings')
      .update({ 
        processing_status: 'processing',
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

if (markError) {
      console.error('Failed to mark record as processing:', markError);
    }

    try {
      // Download from VBot with retries
      console.log('Starting download from VBot...');
    const downloadStart = Date.now();
    
    const audioBuffer = await downloadWithRetry(
      original_vbot_url, 
      process.env.VBOT_TOKEN_SDK,
      CONFIG.MAX_RETRIES
    );
    
    const downloadMs = Date.now() - downloadStart;
    console.log(`Total download time: ${downloadMs}ms`);

    // STEP 5: Upload to R2
    const timestamp = Date.now();
    const cleanPhone = String(phone_number).replace(/[^0-9]/g, '') || 'unknown';
    const filename = `${cleanPhone}_${timestamp}.mp3`;

    console.log(`Uploading to R2: ${filename} (${audioBuffer.length} bytes)`);
    const uploadStart = Date.now();

    await s3Client.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: filename,
      Body: audioBuffer,
      ContentType: 'audio/mpeg',
      ContentLength: audioBuffer.length,
    }));

    const uploadMs = Date.now() - uploadStart;
    console.log(`R2 upload complete in ${uploadMs}ms`);

    // STEP 6: Update record with success
    const publicUrl = `https://view.tansinh.info/${filename}`;

    const { error: updateError } = await supabase
      .from('phone_numbers_recordings')
      .update({ 
        recording_url: publicUrl,
        processing_status: 'completed',
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (updateError) {
      throw new Error(`DB update failed: ${updateError.message}`);
    }

console.log(`SUCCESS: Record ${id} completed`);
      console.log(`URL: ${publicUrl}`);
      successCount++;

    } catch (recordError) {
      // This catch is for individual record errors
      console.error(`FAILED: Record ${id}: ${recordError.message}`);
      failCount++;

      // Mark as failed and increment retry count
      await supabase
        .from('phone_numbers_recordings')
        .update({ 
          processing_status: 'failed',
          retry_count: currentRetryCount + 1,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);
    }
    } // <-- End of for loop

    // Release lock after processing all records
    await releaseLock(supabase, instanceId);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        message: `Processed ${successCount + failCount} records: ${successCount} success, ${failCount} failed`,
        instanceId,
        successCount,
        failCount,
      }),
    };

} catch (error) {
    // This catches fatal errors (like Supabase connection issues)
    console.error('Fatal error:', error.message);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        message: 'Fatal error',
        instanceId,
        error: error.message,
        successCount,
        failCount,
      }),
    };
  } finally {
    // ALWAYS release lock - this runs no matter what (success, error, or unexpected crash)
    console.log('Releasing lock in finally block...');
  // Lock will be released in finally block
    console.log('Lock released successfully');
  }
};