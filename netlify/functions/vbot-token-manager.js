// vbot-token-manager.js
// Manages dynamic allocation of VBot SDK tokens to teachers
// PRIORITY SYSTEM: Priority users always get slots, can kick non-priority users

const { createClient } = require('@supabase/supabase-js');

const HEARTBEAT_TIMEOUT_MS = 30000; // 30 seconds - session considered dead if no heartbeat

exports.handler = async (event) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
    const action = params.action || 'request';
    const sessionId = params.session_id;
    const userEmail = params.user_email;

    // Map slot numbers to environment variable names
    const tokenEnvMap = {
      1: 'VBOT_TOKEN_SDK',
      2: 'VBOT_TOKEN_SDK_2',
      3: 'VBOT_TOKEN_SDK_3',
      4: 'VBOT_TOKEN_SDK_4',
      5: 'VBOT_TOKEN_SDK_5',
    };

    // IMPORTANT: Only consider slots that have actual tokens configured
    // This prevents assigning users to slots without real tokens
    const availableSlotNumbers = Object.keys(tokenEnvMap)
      .map(Number)
      .filter(slot => !!process.env[tokenEnvMap[slot]]);

    console.log('Available token slots:', availableSlotNumbers);

    // Helper function to check if email is in priority list
    async function isPriorityUser(email) {
      if (!email) return false;
      const { data } = await supabase
        .from('phone_numbers_vbot_prioritize')
        .select('email')
        .eq('email', email.toLowerCase())
        .eq('is_active', true)
        .single();
      return !!data;
    }

    // ========== ACTION: REQUEST A TOKEN ==========
    if (action === 'request') {
      if (!sessionId) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'session_id required' }),
        };
      }

      const now = new Date();
      const timeoutThreshold = new Date(now.getTime() - HEARTBEAT_TIMEOUT_MS);

      // Check if requesting user is priority
      const requestingUserIsPriority = await isPriorityUser(userEmail);

      // First, check if this session already has a slot
      const { data: existingSession } = await supabase
        .from('vbot_token_sessions')
        .select('*')
        .eq('session_id', sessionId)
        .single();

     if (existingSession) {
        const existingToken = process.env[tokenEnvMap[existingSession.slot_number]];

        // Check if existing slot has a valid token
        if (existingToken && availableSlotNumbers.includes(existingSession.slot_number)) {
          // Valid token - update heartbeat, email, and priority with retry
          let updateSuccess = false;
          let updateRetries = 0;
          const MAX_UPDATE_RETRIES = 3;
          
          while (!updateSuccess && updateRetries < MAX_UPDATE_RETRIES) {
            const { error: updateError } = await supabase
              .from('vbot_token_sessions')
              .update({
                last_heartbeat: now.toISOString(),
                is_priority: requestingUserIsPriority,
                user_email: userEmail || existingSession.user_email
              })
              .eq('slot_number', existingSession.slot_number);
            
            if (!updateError) {
              updateSuccess = true;
            } else {
              updateRetries++;
              console.warn(`Heartbeat update retry ${updateRetries}/${MAX_UPDATE_RETRIES}:`, updateError.message);
              if (updateRetries < MAX_UPDATE_RETRIES) {
                await new Promise(r => setTimeout(r, 500)); // Wait 500ms before retry
              }
            }
          }

          return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({
              success: true,
              slot: existingSession.slot_number,
              token: existingToken,
              is_priority: requestingUserIsPriority,
              message: 'Existing session renewed',
            }),
          };
        } else {
          // Existing slot has NO valid token - release it and find a new one
          console.log(`Session ${sessionId} has invalid slot ${existingSession.slot_number} (no token), releasing...`);
          await supabase
            .from('vbot_token_sessions')
            .update({
              session_id: null,
              user_email: null,
              last_heartbeat: null,
              is_priority: false,
            })
            .eq('slot_number', existingSession.slot_number);
          // Continue to find a new slot below...
        }
      }

      // Look for an available slot (no session or dead session)
      // IMPORTANT: Only look at slots that have actual tokens configured
      const { data: allSlots } = await supabase
        .from('vbot_token_sessions')
        .select('*')
        .in('slot_number', availableSlotNumbers)
        .order('slot_number', { ascending: true });

      console.log('All slots from DB:', JSON.stringify(allSlots));
      console.log('Available slot numbers:', availableSlotNumbers);
      console.log('Timeout threshold:', timeoutThreshold.toISOString());

      // If no slots exist in DB, we need to create them or return error
      if (!allSlots || allSlots.length === 0) {
        console.error('No slots found in database for available tokens!');
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({
            success: false,
            no_slot: true,
            is_priority: false,
            message: 'Không có kênh nào được cấu hình. Vui lòng liên hệ admin.',
          }),
        };
      }

      // Find empty slot or slot with dead session
      let availableSlot = null;
      for (const slot of allSlots) {
        // Empty slot (no session_id)
        if (!slot.session_id) {
          console.log(`Slot ${slot.slot_number} is empty - taking it`);
          availableSlot = slot;
          break;
        }
        // Slot with no heartbeat = dead
        if (!slot.last_heartbeat) {
          console.log(`Slot ${slot.slot_number} has no heartbeat - taking it`);
          availableSlot = slot;
          break;
        }
        // Slot with old heartbeat = dead
        const lastHeartbeat = new Date(slot.last_heartbeat);
        if (lastHeartbeat < timeoutThreshold) {
          console.log(`Slot ${slot.slot_number} heartbeat expired (${slot.last_heartbeat}) - taking it`);
          availableSlot = slot;
          break;
        }
        console.log(`Slot ${slot.slot_number} is active (${slot.user_email}, heartbeat: ${slot.last_heartbeat})`);
      }

      // If no available slot, try to find a kickable slot
      if (!availableSlot) {
// If no available slot, try to find a kickable slot
      if (!availableSlot) {
        if (requestingUserIsPriority) {
          // Priority user can kick non-priority users
          // Find the oldest non-priority session
          const nonPrioritySlots = allSlots.filter(slot => {
            // Only consider slots that have active sessions
            if (!slot.session_id) return false;
            if (!slot.last_heartbeat) return false; // No heartbeat = treat as dead, not kickable
            const heartbeat = new Date(slot.last_heartbeat);
            if (heartbeat < timeoutThreshold) return false; // Dead session = not really taken
            // Only kickable if not priority
            return !slot.is_priority;
          });

          if (nonPrioritySlots.length > 0) {
            // Sort by last_heartbeat ascending (oldest first)
            nonPrioritySlots.sort((a, b) => new Date(a.last_heartbeat) - new Date(b.last_heartbeat));
            const targetSlot = nonPrioritySlots[0];
            
            // CRITICAL: Double-check the slot is still non-priority before kicking
            // This prevents race condition where slot became priority between query and kick
            const { data: freshSlotData } = await supabase
              .from('vbot_token_sessions')
              .select('is_priority, session_id, last_heartbeat')
              .eq('slot_number', targetSlot.slot_number)
              .single();
            
            if (freshSlotData && !freshSlotData.is_priority && freshSlotData.session_id) {
              // Still valid to kick
              availableSlot = targetSlot;
              console.log(`Priority user kicking non-priority session from slot ${availableSlot.slot_number}: ${availableSlot.user_email}`);
            } else {
              // Slot changed - try another non-priority slot or give up
              console.log(`Slot ${targetSlot.slot_number} changed status, looking for another...`);
              const otherSlots = nonPrioritySlots.slice(1);
              for (const altSlot of otherSlots) {
                const { data: altFresh } = await supabase
                  .from('vbot_token_sessions')
                  .select('is_priority, session_id')
                  .eq('slot_number', altSlot.slot_number)
                  .single();
                if (altFresh && !altFresh.is_priority && altFresh.session_id) {
                  availableSlot = altSlot;
                  console.log(`Priority user kicking from alternate slot ${altSlot.slot_number}`);
                  break;
                }
              }
            }
          }
          } else {
            // Check if there are actually any dead priority sessions we can take
            const deadPrioritySlots = allSlots.filter(slot => {
              if (!slot.last_heartbeat) return true; // No heartbeat = dead
              const heartbeat = new Date(slot.last_heartbeat);
              return heartbeat < timeoutThreshold; // Timed out = dead
            });

            if (deadPrioritySlots.length > 0) {
              // There's a dead session - take it!
              availableSlot = deadPrioritySlots[0];
              console.log(`Priority user taking dead slot ${availableSlot.slot_number}`);
            } else {
              // All slots are taken by ACTIVE priority users - cannot kick
              return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify({
                  success: false,
                  no_slot: true,
                  is_priority: true,
                  message: 'Tất cả kênh đều đang được sử dụng bởi người dùng ưu tiên',
                }),
              };
            }
          }
        } else {
          // Non-priority user - check if there are dead priority sessions they can take
          const deadSlots = allSlots.filter(slot => {
            if (!slot.session_id) return true; // Empty slot
            if (!slot.last_heartbeat) return true; // No heartbeat = dead
            const heartbeat = new Date(slot.last_heartbeat);
            return heartbeat < timeoutThreshold; // Timed out = dead
          });

          if (deadSlots.length > 0) {
            // There's a dead session - non-priority can take it!
            availableSlot = deadSlots[0];
            console.log(`Non-priority user taking dead slot ${availableSlot.slot_number}`);
          } else {
            // All slots are truly active - give token WITHOUT identity
            // This allows user to make OUTGOING calls but NOT receive incoming calls
            const outboundOnlyToken = process.env.VBOT_TOKEN_SDK; // Use first token for outbound
            console.log(`Non-priority user getting outbound-only token (all slots busy)`);
            return {
              statusCode: 200,
              headers: corsHeaders,
              body: JSON.stringify({
                success: true,
                slot: 0, // Special slot number indicating outbound-only
                token: outboundOnlyToken,
                is_priority: false,
                outbound_only: true,
                message: 'Tất cả kênh đang bận. Bạn có thể GỌI ĐI nhưng không nhận được cuộc gọi đến.',
              }),
            };
          }
        }
      }

      // Assign the slot to this new session
      await supabase
        .from('vbot_token_sessions')
        .update({
          session_id: sessionId,
          user_email: userEmail || null,
          last_heartbeat: now.toISOString(),
          is_priority: requestingUserIsPriority,
        })
        .eq('slot_number', availableSlot.slot_number);

      const token = process.env[tokenEnvMap[availableSlot.slot_number]];

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          slot: availableSlot.slot_number,
          token: token,
          is_priority: requestingUserIsPriority,
          message: requestingUserIsPriority ? 'Token assigned (Priority User)' : 'Token assigned',
        }),
      };
    }

    // ========== ACTION: HEARTBEAT (keep session alive) ==========
    if (action === 'heartbeat') {
      if (!sessionId) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'session_id required' }),
        };
      }

      const now = new Date();

      // Check current priority status (might have changed)
      const currentIsPriority = await isPriorityUser(userEmail);

      const { data: session, error } = await supabase
        .from('vbot_token_sessions')
        .update({
          last_heartbeat: now.toISOString(),
          is_priority: currentIsPriority
        })
        .eq('session_id', sessionId)
        .select()
        .single();

      if (error || !session) {
        // Session was replaced - DON'T kick completely!
        // Instead, downgrade to outbound-only mode so user can still make calls
        const outboundToken = process.env.VBOT_TOKEN_SDK;
        console.log(`Session ${sessionId} was replaced, downgrading to outbound-only`);
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({
            success: true,
            downgraded: true,
            slot: 0,
            token: outboundToken,
            outbound_only: true,
            is_priority: currentIsPriority,
            message: 'Bạn đã chuyển sang chế độ gọi đi. Có thể gọi nhưng không nhận được cuộc gọi đến.',
          }),
        };
      }

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          slot: session.slot_number,
          is_priority: currentIsPriority,
          message: 'Heartbeat received',
        }),
      };
    }

    // ========== ACTION: RELEASE (when teacher leaves) ==========
    if (action === 'release') {
      if (!sessionId) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'session_id required' }),
        };
      }

      await supabase
        .from('vbot_token_sessions')
        .update({
          session_id: null,
          user_email: null,
          last_heartbeat: null,
          is_priority: false,
        })
        .eq('session_id', sessionId);

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          message: 'Token released',
        }),
      };
    }

    // ========== ACTION: STATUS (check all slots) ==========
    if (action === 'status') {
      // Only show slots that have actual tokens configured
      const { data: allSlots } = await supabase
        .from('vbot_token_sessions')
        .select('slot_number, user_email, last_heartbeat, is_priority')
        .in('slot_number', availableSlotNumbers)
        .order('slot_number', { ascending: true });

      const now = new Date();
      const timeoutThreshold = new Date(now.getTime() - HEARTBEAT_TIMEOUT_MS);

      const status = allSlots.map(slot => ({
        slot: slot.slot_number,
        user: slot.user_email || 'Empty',
        active: slot.last_heartbeat ? new Date(slot.last_heartbeat) > timeoutThreshold : false,
        lastSeen: slot.last_heartbeat,
        is_priority: slot.is_priority || false,
      }));

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ slots: status }),
      };
    }

    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Invalid action' }),
    };

  } catch (error) {
    console.error('Token manager error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: error.message }),
    };
  }
};