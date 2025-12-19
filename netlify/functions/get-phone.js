const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { id, column } = JSON.parse(event.body);

    // Security: Whitelist allowed columns to prevent arbitrary access
    const allowedMap = {
      'HV': 'sdt_hv',
      'Cha': 'sdt_cha',
      'Mẹ': 'sdt_me',
      'Chị': 'sdt_chi',
      'Bà': 'sdt_ba',
      'Ông': 'sdt_ong'
    };

    const dbColumn = allowedMap[column];
    if (!dbColumn) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid type' }) };
    }

    // Connect to Supabase
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    // Fetch only the specific phone number
    const { data, error } = await supabase
      .from('phone_numbers')
      .select(dbColumn)
      .eq('id', id)
      .single();

    if (error) throw error;

    return {
      statusCode: 200,
      body: JSON.stringify({ phone: data[dbColumn] }),
    };

  } catch (error) {
    console.error('Fetch Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};