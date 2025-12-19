const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Fetch all records to extract unique values
    const { data, error } = await supabase
      .from('phone_numbers_recordings')
      .select('phone_number, call_type, disposition');

    if (error) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: error.message }),
      };
    }

    // Extract unique values
    const callTypes = [...new Set(data.map(r => r.call_type).filter(Boolean))].sort();
    const dispositions = [...new Set(data.map(r => r.disposition).filter(Boolean))].sort();
    const phoneNumbers = [...new Set(data.map(r => r.phone_number).filter(Boolean))].sort();

    return {
      statusCode: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        callTypes,
        dispositions,
        phoneNumbers
      }),
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};