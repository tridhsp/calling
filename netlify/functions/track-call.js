const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    // 1. Parse data
    const { teacher_email, student_email, number_called } = JSON.parse(event.body);

    // 2. Init Supabase
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    // 3. Insert Log
    const { error } = await supabase
      .from('phone_numbers_tracking')
      .insert([{
        teacher_email: teacher_email || 'unknown',
        student_email: student_email || 'unknown',
        number_called: number_called,
        call_date_and_time: new Date().toISOString()
      }]);

    if (error) throw error;

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true }),
    };

  } catch (error) {
    console.error('Tracking Error:', error);
    // Return 200 even on error so we don't block the actual call flow
    return {
      statusCode: 200,
      body: JSON.stringify({ error: error.message }),
    };
  }
};