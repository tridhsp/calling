// send-push-notification.js
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const { user_email, title, body, data } = JSON.parse(event.body);
    
    if (!user_email) {
      return { statusCode: 400, body: JSON.stringify({ error: 'user_email required' }) };
    }

    // Get Supabase client
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    // Get FCM token for this user
    const { data: tokenData, error: tokenError } = await supabase
      .from('fcm_tokens')
      .select('fcm_token')
      .eq('user_email', user_email)
      .single();

    if (tokenError || !tokenData) {
      console.log('No FCM token found for user:', user_email);
      return { statusCode: 404, body: JSON.stringify({ error: 'No FCM token found' }) };
    }

    // Send push notification via FCM HTTP v1 API
    const message = {
      message: {
        token: tokenData.fcm_token,
        notification: {
          title: title || 'Incoming Call',
          body: body || 'You have an incoming call'
        },
        data: data || {},
        webpush: {
          notification: {
            icon: '/favicon.ico',
            requireInteraction: true,
            vibrate: [200, 100, 200]
          },
          fcm_options: {
            link: '/'
          }
        }
      }
    };

 // Get access token for FCM
    const accessToken = await getAccessToken();
    
    // Read project ID from local file
    const serviceAccount = require('./firebase-service-account.json');
    
    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(message)
      }
    );

    const result = await response.json();
    
    if (!response.ok) {
      console.error('FCM Error:', result);
      return { statusCode: 500, body: JSON.stringify({ error: 'FCM send failed', details: result }) };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, messageId: result.name })
    };

  } catch (error) {
    console.error('Push notification error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};

// Get OAuth2 access token for FCM
async function getAccessToken() {
  const { GoogleAuth } = require('google-auth-library');
  
  // Read service account from local file (safe - not served to frontend)
  const serviceAccount = require('./firebase-service-account.json');
  
  const auth = new GoogleAuth({
    credentials: serviceAccount,
    scopes: ['https://www.googleapis.com/auth/firebase.messaging']
  });
  
  const client = await auth.getClient();
  const accessToken = await client.getAccessToken();
  
  return accessToken.token;
}