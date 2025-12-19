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
    const { input_name, localstorage_id, fingerprint_id } = JSON.parse(event.body);

    // Get IP address from headers
    const ip_address = event.headers['x-forwarded-for']?.split(',')[0]?.trim() 
                    || event.headers['client-ip'] 
                    || event.headers['x-real-ip']
                    || 'unknown';

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await supabase
      .from('phone_number_widget_logs')
      .insert([
        {
          input_name: input_name || null,
          localstorage_id: localstorage_id,
          fingerprint_id: fingerprint_id || null,
          ip_address: ip_address
        }
      ])
      .select();

    if (error) {
      console.error('Supabase error:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: error.message })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, data })
    };

  } catch (err) {
    console.error('Error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};