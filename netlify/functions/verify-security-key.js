const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { key, adminOnly } = JSON.parse(event.body);

    if (!key) {
      return {
        statusCode: 400,
        body: JSON.stringify({ valid: false, error: 'No key provided' })
      };
    }

// Initialize Supabase with service role key (has full access)
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY // <--- Sửa thành tên đúng như trên Netlify của bạn
    );

    let query = supabase
      .from('security_key_for_teachers')
      .select('id');

    if (adminOnly) {
      // Check only admin_key column
      query = query.eq('admin_key', key);
    } else {
      // Check both admin_key and teacher_key
      query = query.or(`admin_key.eq.${key},teacher_key.eq.${key}`);
    }

    const { data, error } = await query.limit(1);

    if (error) {
      console.error('Database error:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({ valid: false, error: 'Database error' })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        valid: data && data.length > 0 
      })
    };

  } catch (error) {
    console.error('Verification error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ valid: false, error: 'Server error' })
    };
  }
};