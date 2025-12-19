// netlify/functions/vbot-webhook.js
// netlify/functions/vbot-webhook.js
const fetch = require('node-fetch');
const { S3 } = require('aws-sdk');
const { createClient } = require('@supabase/supabase-js');
const { GoogleAuth } = require('google-auth-library');

// R2 Configuration
const s3 = new S3({
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  region: 'auto',
  signatureVersion: 'v4',
  s3ForcePathStyle: true,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.R2_BUCKET_NAME_STUDENTS_TEACHERS || 'teachersandlearners';

// CORS headers for VBot console testing
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
  // Handle CORS preflight request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: '',
    };
  }

  // Allow GET for testing, POST for actual webhook
  if (event.httpMethod === 'GET') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ status: 'Webhook is active' }),
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    let payload = {};

    // Log raw data for debugging
    console.log('Raw body:', event.body);
    console.log('Headers:', JSON.stringify(event.headers, null, 2));

    // Try to parse the body
    if (event.body) {
      try {
        // First try JSON
        payload = JSON.parse(event.body);
      } catch (jsonError) {
        // If JSON fails, try form-urlencoded
        console.log('JSON parse failed, trying form-urlencoded');
        try {
          const params = new URLSearchParams(event.body);

          // Parse nested keys like data[phone], data[hotline] into proper object
          for (const [key, value] of params.entries()) {
            // Check for nested keys like "data[phone]" or "data[0][phone]"
            const match = key.match(/^(\w+)\[(.+)\]$/);
            if (match) {
              const [, parent, child] = match;
              if (!payload[parent]) {
                payload[parent] = {};
              }
              // Handle array-style keys like data[0][phone]
              const arrayMatch = child.match(/^(\d+)\]\[(.+)$/);
              if (arrayMatch) {
                const [, index, field] = arrayMatch;
                if (!Array.isArray(payload[parent])) {
                  payload[parent] = [];
                }
                if (!payload[parent][index]) {
                  payload[parent][index] = {};
                }
                payload[parent][index][field] = value;
              } else {
                payload[parent][child] = value;
              }
            } else {
              try {
                payload[key] = JSON.parse(value);
              } catch {
                payload[key] = value;
              }
            }
          }

          // Convert data object to array format if it looks like call data
          if (payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
            // If data has phone/hotline directly, wrap in array
            if (payload.data.phone || payload.data.hotline || payload.data.record_file) {
              payload.data = [payload.data];
            }
          }

        } catch (formError) {
          console.log('Form parse also failed:', formError);
          return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({
              success: true,
              message: 'Webhook received (could not parse body)',
              receivedBody: event.body?.substring(0, 200)
            }),
          };
        }
      }
    } else {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ success: true, message: 'Webhook ping received' }),
      };
    }

    console.log('VBot Webhook received:', JSON.stringify(payload, null, 2));

    // DEBUG: Check environment variables
    console.log('ENV CHECK:', {
      hasSupabaseUrl: !!process.env.SUPABASE_URL,
      hasSupabaseKey: !!process.env.SUPABASE_SERVICE_KEY,
      hasR2AccountId: !!process.env.R2_ACCOUNT_ID,
      hasR2AccessKey: !!process.env.R2_ACCESS_KEY_ID,
      hasR2SecretKey: !!process.env.R2_SECRET_ACCESS_KEY,
      bucket: BUCKET
    });

    // Initialize Supabase
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );


    // HISTORY_CALL sends data as ARRAY of call records
    // Other events send data as object
    let callRecords = [];

    if (Array.isArray(payload.data)) {
      // HISTORY_CALL format - data is array
      callRecords = payload.data;
    } else if (payload.data && typeof payload.data === 'object') {
      // Single call record format
      callRecords = [payload.data];
    } else {
      // No valid data - return success (might be a test)
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          message: 'No call data in payload',
          payload: payload
        })
      };
    }

    // Process each call record
    console.log('Processing callRecords count:', callRecords.length);

    for (const callData of callRecords) {
      console.log('Processing callData:', JSON.stringify(callData, null, 2));

// Get recording URLs from this call with STRICT VALIDATION
      let recordingUrls = [];

      if (callData.record_file) {
        let rawUrls = [];
        
        // Handle both array and string formats
        if (Array.isArray(callData.record_file)) {
          rawUrls = callData.record_file;
        } else if (typeof callData.record_file === 'string') {
          rawUrls = [callData.record_file];
        }
        
        // Validate each URL
        recordingUrls = rawUrls.filter(url => {
          if (!url || typeof url !== 'string') return false;
          
          const trimmedUrl = url.trim();
          
          // Must be at least 20 characters (reasonable URL length)
          if (trimmedUrl.length < 20) return false;
          
          // Must start with http:// or https://
          if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) return false;
          
          // Must contain a domain (at least one dot after protocol)
          const afterProtocol = trimmedUrl.replace(/^https?:\/\//, '');
          if (!afterProtocol.includes('.')) return false;
          
          // Must not be a placeholder URL
          const lowerUrl = trimmedUrl.toLowerCase();
          if (lowerUrl.includes('example.com') || lowerUrl.includes('placeholder') || lowerUrl.includes('test.test')) return false;
          
          return true;
        });
      }

      console.log('Validated recording URLs:', recordingUrls.length > 0 ? recordingUrls : 'NONE VALID');
      
      // Log if we filtered out invalid URLs
      if (callData.record_file && recordingUrls.length === 0) {
        console.log('WARNING: record_file was provided but no valid URLs found. Raw value:', callData.record_file);
      }

// SMART CALL TYPE DETECTION - try multiple field names
      let callType = null;
      if (callData.type_call) {
        callType = callData.type_call;
      } else if (callData.direction) {
        callType = callData.direction;
      } else if (callData.call_direction) {
        callType = callData.call_direction;
      } else if (callData.type) {
        callType = callData.type;
      }
      
      // Normalize call type to standard values
      if (callType) {
        const normalized = String(callType).toUpperCase().trim();
        if (normalized.includes('OUT') || normalized.includes('OUTBOUND') || normalized === 'O') {
          callType = 'OUT';
        } else if (normalized.includes('IN') || normalized.includes('INBOUND') || normalized === 'I') {
          callType = 'IN';
        }
      }
      
      // If still no call type, try to infer from caller/callee structure
      if (!callType) {
        // If there's a callee but caller is our hotline, it's outgoing
        if (callData.callee && callData.callee[0] && callData.callee[0].phone) {
          callType = 'OUT';
        } else if (callData.caller && callData.caller[0] && callData.caller[0].phone) {
          callType = 'IN';
        } else {
          callType = 'OUT'; // Default to OUT if we can't determine
        }
      }
      
      console.log('Detected call type:', callType);

      // SMART PHONE NUMBER DETECTION based on call direction
      let phoneNumber = 'unknown';
      
      if (callType === 'OUT') {
        // For OUTGOING calls: we want the callee's phone (person being called)
        if (callData.callee && callData.callee[0] && callData.callee[0].phone) {
          phoneNumber = callData.callee[0].phone;
        } else if (callData.caller && callData.caller[0] && callData.caller[0].phone) {
          phoneNumber = callData.caller[0].phone;
        } else if (callData.phone) {
          phoneNumber = callData.phone;
        }
      } else {
        // For INCOMING calls: we want the caller's phone (person who called)
        if (callData.caller && callData.caller[0] && callData.caller[0].phone) {
          phoneNumber = callData.caller[0].phone;
        } else if (callData.callee && callData.callee[0] && callData.callee[0].phone) {
          phoneNumber = callData.callee[0].phone;
        } else if (callData.phone) {
          phoneNumber = callData.phone;
        }
      }
      
      console.log('Selected phone number:', phoneNumber, 'for call type:', callType);

// IMMEDIATELY insert call data to Supabase (without recording URL yet)
      let insertedRecordId = null;
      try {
        const callDate = callData.date_create || new Date().toISOString();
        
        // CHECK FOR DUPLICATE: Same phone + same call_date within 60 seconds
        const { data: existing } = await supabase
          .from('phone_numbers_recordings')
          .select('id')
          .eq('phone_number', phoneNumber)
          .gte('call_date', new Date(new Date(callDate).getTime() - 60000).toISOString())
          .lte('call_date', new Date(new Date(callDate).getTime() + 60000).toISOString())
          .limit(1);

        if (existing && existing.length > 0) {
          console.log('DUPLICATE DETECTED: Record already exists for', phoneNumber, 'at', callDate);
          console.log('Existing record id:', existing[0].id);
          continue; // Skip to next record
        }

        const immediateData = {
          phone_number: phoneNumber,
          hotline: callData.hotline_number || callData.hotline || null,
      call_type: callType,
          duration: callData.time_call || callData.duration_call || null,
          disposition: callData.disposition || null,
          recording_url: null, // Will be updated by background job
          original_vbot_url: recordingUrls[0] || null,
          call_date: callDate,
          member_no: callData.caller?.[0]?.member_no || callData.callee?.[0]?.member_no || null,
        };

        const { data: insertedRow, error: insertError } = await supabase
          .from('phone_numbers_recordings')
          .insert([immediateData])
          .select('id')
          .single();

        if (insertError) {
          console.error('Immediate insert error:', insertError);
        } else {
          insertedRecordId = insertedRow.id;
          console.log('Immediate insert OK, id:', insertedRecordId);
        }
      } catch (e) {
        console.error('Immediate insert failed:', e);
      }

// Just log - the separate process-recordings function will handle R2 upload later
      console.log('Record saved, R2 upload will be handled by process-recordings function');
    }

// NEW: Send push notification for incoming calls
    for (const callData of callRecords) {
      const callType = callData.type_call || callData.direction || 'OUT';
      const normalizedType = String(callType).toUpperCase();
      
      // Only send push for INCOMING calls
      if (normalizedType.includes('IN') || normalizedType === 'I') {
        let callerPhone = 'Unknown';
        if (callData.caller && callData.caller[0] && callData.caller[0].phone) {
          callerPhone = callData.caller[0].phone;
        } else if (callData.phone) {
          callerPhone = callData.phone;
        }
        
        // Send push to all teachers
        await sendPushToAllTeachers(supabase, callerPhone);
      }
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        message: `Inserted ${callRecords.length} call records. R2 upload handled separately.`,
        recordsProcessed: callRecords.length,
      }),
    };

  } catch (error) {
    console.error('Webhook error:', error);
    return {
      statusCode: 200, // Return 200 even on error so VBot doesn't retry
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: error.message,
        stack: error.stack
      }),
    };
  }
};


// NEW: Send push notification to all teachers
async function sendPushToAllTeachers(supabase, callerPhone) {
  try {
    // Get all FCM tokens
    const { data: tokens, error } = await supabase
      .from('fcm_tokens')
      .select('fcm_token, user_email');
    
    if (error || !tokens || tokens.length === 0) {
      console.log('No FCM tokens found');
      return;
    }
    
    console.log(`Sending push to ${tokens.length} devices`);
    
    // Get Firebase access token
    const accessToken = await getFirebaseAccessToken();
    if (!accessToken) {
      console.error('Could not get Firebase access token');
      return;
    }
    
    // Send to each device
    for (const tokenData of tokens) {
      try {
        const message = {
          message: {
            token: tokenData.fcm_token,
            notification: {
              title: '📞 Cuộc gọi đến',
              body: `Số: ${callerPhone}`
            },
            data: {
              type: 'incoming_call',
              phone: callerPhone
            },
            webpush: {
              notification: {
                icon: 'https://files.tansinh.info/ads/tridhsp_1752750602636_ad_tridhsp_1752750602636.png',
                requireInteraction: true,
                vibrate: [200, 100, 200]
              },
              fcm_options: {
                link: '/'
              }
            }
          }
        };
        
        const serviceAccount = require('./firebase-service-account.json');
        const response = await fetch(
          `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(message)
          }
        );
        
        if (!response.ok) {
          const errText = await response.text();
          console.error(`Push failed for ${tokenData.user_email}:`, errText);
        } else {
          console.log(`Push sent to ${tokenData.user_email}`);
        }
      } catch (e) {
        console.error(`Push error for ${tokenData.user_email}:`, e.message);
      }
    }
  } catch (e) {
    console.error('sendPushToAllTeachers error:', e);
  }
}

// Get Firebase access token using service account
async function getFirebaseAccessToken() {
  try {
    // Read service account from local file (safe - not served to frontend)
    const serviceAccount = require('./firebase-service-account.json');
    
    const auth = new GoogleAuth({
      credentials: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/firebase.messaging']
    });
    
    const client = await auth.getClient();
    const accessTokenResponse = await client.getAccessToken();
    
    return accessTokenResponse.token;
  } catch (e) {
    console.error('getFirebaseAccessToken error:', e);
    return null;
  }
}