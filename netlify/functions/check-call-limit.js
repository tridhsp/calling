const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async (event) => {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { localstorage_id, fingerprint_id } = JSON.parse(event.body);

    // Get IP address from headers
    const ip_address = event.headers['x-forwarded-for']?.split(',')[0]?.trim() 
                    || event.headers['client-ip'] 
                    || event.headers['x-real-ip']
                    || null;

    if (!localstorage_id && !fingerprint_id && !ip_address) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'No identifier provided' })
      };
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get today's date in Bangkok timezone (UTC+7)
    const now = new Date();
    const bangkokOffset = 7 * 60;
    const bangkokTime = new Date(now.getTime() + (bangkokOffset + now.getTimezoneOffset()) * 60000);
    
    const startOfDayBangkok = new Date(bangkokTime);
    startOfDayBangkok.setHours(0, 0, 0, 0);
    const startOfDayUTC = new Date(startOfDayBangkok.getTime() - bangkokOffset * 60000);

    const endOfDayBangkok = new Date(bangkokTime);
    endOfDayBangkok.setHours(23, 59, 59, 999);
    const endOfDayUTC = new Date(endOfDayBangkok.getTime() - bangkokOffset * 60000);

    // Check by fingerprint (most reliable)
    let count = 0;

    if (fingerprint_id) {
      const { count: fpCount, error: fpError } = await supabase
        .from('phone_number_widget_logs')
        .select('*', { count: 'exact', head: true })
        .eq('fingerprint_id', fingerprint_id)
        .gte('created_at', startOfDayUTC.toISOString())
        .lte('created_at', endOfDayUTC.toISOString());

      if (!fpError && fpCount > count) {
        count = fpCount;
      }
    }

    // Also check by localStorage ID
    if (localstorage_id) {
      const { count: lsCount, error: lsError } = await supabase
        .from('phone_number_widget_logs')
        .select('*', { count: 'exact', head: true })
        .eq('localstorage_id', localstorage_id)
        .gte('created_at', startOfDayUTC.toISOString())
        .lte('created_at', endOfDayUTC.toISOString());

      if (!lsError && lsCount > count) {
        count = lsCount;
      }
    }

    // Also check by IP address
    if (ip_address && ip_address !== 'unknown') {
      const { count: ipCount, error: ipError } = await supabase
        .from('phone_number_widget_logs')
        .select('*', { count: 'exact', head: true })
        .eq('ip_address', ip_address)
        .gte('created_at', startOfDayUTC.toISOString())
        .lte('created_at', endOfDayUTC.toISOString());

      if (!ipError && ipCount > count) {
        count = ipCount;
      }
    }

    const isBlocked = count >= 4;

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        success: true, 
        call_count: count,
        is_blocked: isBlocked
      })
    };

  } catch (err) {
    console.error('Error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};