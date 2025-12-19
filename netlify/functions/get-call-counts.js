const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// 1. Get start of "Today" in Bangkok Time (UTC+7)
  // This resets the count at 00:00 Bangkok time (which is 17:00 UTC previous day)
  const now = new Date();
  const offset = 7 * 60 * 60 * 1000; // Bangkok is UTC+7
  
  // Shift time to Bangkok zone, reset to midnight, then shift back to UTC
  const bangkokDate = new Date(now.getTime() + offset);
  bangkokDate.setUTCHours(0, 0, 0, 0); 
  const todayISO = new Date(bangkokDate.getTime() - offset).toISOString();

  // 2. Fetch calls made TODAY
  const { data: calls, error: callError } = await supabase
    .from('phone_numbers_tracking')
    .select('number_called')
    .gte('call_date_and_time', todayISO);

  // 3. Fetch grants given TODAY
  const { data: grants, error: grantError } = await supabase
    .from('phone_numbers_grants')
    .select('granted_email')
    .gte('date_and_time', todayISO);

  if (callError || grantError) {
    return { statusCode: 500, body: JSON.stringify({}) };
  }

  // 4. Count calls per Number
  const counts = {};
  (calls || []).forEach(row => {
    const num = row.number_called;
    if (num) counts[num] = (counts[num] || 0) + 1;
  });

  // 5. Count bonuses per Email
  const bonuses = {};
  (grants || []).forEach(row => {
    const email = row.granted_email;
    if (email) bonuses[email] = (bonuses[email] || 0) + 1;
  });

  // Return both
  return {
    statusCode: 200,
    body: JSON.stringify({ counts, bonuses }),
    headers: { 'Content-Type': 'application/json' }
  };
};