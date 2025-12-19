const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Fetch ALL data - pagination will be handled on frontend
  const { data, error } = await supabase
    .from('phone_numbers_recordings')
    .select('id, phone_number, call_type, duration, disposition, recording_url, original_vbot_url, call_date, member_no, processing_status, hotline')
    .order('call_date', { ascending: false });

  if (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  };
};