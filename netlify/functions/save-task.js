const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    // 1. Parse data from frontend
    const { 
      student_email, 
      student_name, 
      phone_data, // Object like: { "SĐT HV": "090...", "SĐT Cha": "091..." }
      access_token 
    } = JSON.parse(event.body);

    // 2. Validate Token
    if (!access_token) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    // 3. Init Supabase with Service Role (Admin)
    const supabaseAdmin = createClient(
      process.env.SUPABASE_URL,
     process.env.SUPABASE_SERVICE_KEY
    );

    // 4. Verify User
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(access_token);
    if (authError || !user) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Invalid User Token' }) };
    }

    // 5. Prepare Payload for 'phone_numbers' table
    const payload = {
      created_by: user.id,
      student_email,
      student_name,
      // Map frontend labels to database columns
      sdt_hv:  phone_data['SĐT HV'] || null,
      sdt_cha: phone_data['SĐT Cha'] || null,
      sdt_me:  phone_data['SĐT Mẹ'] || null,
      sdt_chi: phone_data['SĐT Chị'] || null,
      sdt_ba:  phone_data['SĐT Bà'] || null,
      sdt_ong: phone_data['SĐT Ông'] || null
    };

    // 6. Insert Data
    const { data, error: dbError } = await supabaseAdmin
      .from('phone_numbers')
      .insert([payload])
      .select();

    if (dbError) throw dbError;

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, data }),
    };

  } catch (error) {
    console.error('Save Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};