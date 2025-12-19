const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { id, phone_data, access_token } = JSON.parse(event.body);

    if (!access_token) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser(access_token);
    if (authError || !user) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Invalid Token' }) };
    }

    // Map the incoming simple keys to database columns
// Map the incoming simple keys to database columns
    const updates = {
      sdt_hv: phone_data['SĐT HV'] || null,
      sdt_cha: phone_data['SĐT Cha'] || null,
      sdt_me: phone_data['SĐT Mẹ'] || null,
      sdt_chi: phone_data['SĐT Chị'] || null,
      sdt_ba: phone_data['SĐT Bà'] || null,
      sdt_ong: phone_data['SĐT Ông'] || null
      // updated_at line removed because the column does not exist in your table
    };
    const { error } = await supabase
      .from('phone_numbers')
      .update(updates)
      .eq('id', id);

    if (error) throw error;

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true }),
    };

  } catch (error) {
    console.error('Edit Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};