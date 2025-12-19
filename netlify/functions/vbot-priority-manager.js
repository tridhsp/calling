// vbot-priority-manager.js
// Netlify function to manage priority email list for VBot token allocation

const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    const params = event.queryStringParameters || {};
    const action = params.action || 'list';

    // ========== ACTION: LIST all priority emails ==========
    if (action === 'list') {
      const { data, error } = await supabase
        .from('phone_numbers_vbot_prioritize')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ success: true, priorities: data || [] }),
      };
    }

    // ========== ACTION: ADD a priority email ==========
    if (action === 'add') {
      const email = params.email?.toLowerCase().trim();
      const addedBy = params.added_by || 'system';

      if (!email) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Email is required' }),
        };
      }

      // Check if email already exists
      const { data: existing } = await supabase
        .from('phone_numbers_vbot_prioritize')
        .select('email')
        .eq('email', email)
        .single();

      if (existing) {
        // If exists but inactive, reactivate it
        const { data, error } = await supabase
          .from('phone_numbers_vbot_prioritize')
          .update({ is_active: true, added_by: addedBy })
          .eq('email', email)
          .select()
          .single();

        if (error) throw error;

        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({ 
            success: true, 
            message: 'Email Ä‘Ã£ Ä‘Æ°á»£c kÃ­ch hoáº¡t láº¡i',
            priority: data 
          }),
        };
      }

      // Insert new priority email
      const { data, error } = await supabase
        .from('phone_numbers_vbot_prioritize')
        .insert({
          email: email,
          is_active: true,
          added_by: addedBy,
        })
        .select()
        .single();

      if (error) throw error;

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ 
          success: true, 
          message: 'Email Ä‘Ã£ Ä‘Æ°á»£c thÃªm vÃ o danh sÃ¡ch Æ°u tiÃªn',
          priority: data 
        }),
      };
    }

    // ========== ACTION: REMOVE a priority email ==========
    if (action === 'remove') {
      const email = params.email?.toLowerCase().trim();

      if (!email) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Email is required' }),
        };
      }

      // Soft delete - just set is_active to false
      const { data, error } = await supabase
        .from('phone_numbers_vbot_prioritize')
        .update({ is_active: false })
        .eq('email', email)
        .select()
        .single();

      if (error) throw error;

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ 
          success: true, 
          message: 'Email Ä‘Ã£ Ä‘Æ°á»£c xÃ³a khá»i danh sÃ¡ch Æ°u tiÃªn',
        }),
      };
    }

    // ========== ACTION: CHECK if email is priority ==========
    if (action === 'check') {
      const email = params.email?.toLowerCase().trim();

      if (!email) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Email is required' }),
        };
      }

      const { data } = await supabase
        .from('phone_numbers_vbot_prioritize')
        .select('email, is_active')
        .eq('email', email)
        .eq('is_active', true)
        .single();

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ 
          success: true, 
          is_priority: !!data,
        }),
      };
    }

    // ========== ACTION: GET currently active sessions with priority status ==========
    if (action === 'sessions') {
      const { data: sessions } = await supabase
        .from('vbot_token_sessions')
        .select('slot_number, user_email, last_heartbeat, is_priority')
        .order('slot_number', { ascending: true });

      const now = new Date();
      const HEARTBEAT_TIMEOUT_MS = 30000;
      const timeoutThreshold = new Date(now.getTime() - HEARTBEAT_TIMEOUT_MS);

      const activeSessions = (sessions || []).map(s => ({
        slot: s.slot_number,
        email: s.user_email || null,
        is_active: s.last_heartbeat ? new Date(s.last_heartbeat) > timeoutThreshold : false,
        is_priority: s.is_priority || false,
        last_seen: s.last_heartbeat,
      }));

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ success: true, sessions: activeSessions }),
      };
    }

    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Invalid action. Use: list, add, remove, check, sessions' }),
    };

  } catch (error) {
    console.error('Priority manager error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: error.message }),
    };
  }
};