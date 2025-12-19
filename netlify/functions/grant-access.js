const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { granted_email, access_token } = JSON.parse(event.body);

    if (!access_token) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    // 1. Init Supabase
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    // 2. Verify User (The "Teacher" granting access)
    const { data: { user }, error: authError } = await supabase.auth.getUser(access_token);
    if (authError || !user) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Invalid Token' }) };
    }

    // 3. Insert Record
    const { error: insertError } = await supabase
      .from('phone_numbers_grants')
      .insert([{
        teacher_email: user.email,     // The logged-in user
        granted_email: granted_email,  // The email selected from autocomplete
        date_and_time: new Date().toISOString()
      }]);

    if (insertError) throw insertError;

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true }),
    };

  } catch (error) {
    console.error('Grant Access Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};