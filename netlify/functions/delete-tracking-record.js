const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
    // Only allow POST requests
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    try {
        const { id } = JSON.parse(event.body);
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_KEY; // Matches your Netlify Env Variable
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Verify User
        const authHeader = event.headers.authorization;
        if (!authHeader) throw new Error('Missing Auth Header');
        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) throw new Error('Unauthorized');

        // Verify Role is Super Admin
        const { data: roleData, error: roleError } = await supabase
            .from('user_roles')
            .select('role')
            .eq('email', user.email)
            .single();

        if (roleError || !roleData || roleData.role !== 'Super Admin') {
            return { statusCode: 403, body: JSON.stringify({ error: 'Access Denied: Super Admin only.' }) };
        }

        // Perform Delete (Table name must match your database)
        const { error: deleteError } = await supabase
            .from('phone_numbers_recordings')
            .delete()
            .eq('id', id);

        if (deleteError) throw deleteError;

        return { statusCode: 200, body: JSON.stringify({ message: 'Deleted' }) };

    } catch (err) {
        return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
};