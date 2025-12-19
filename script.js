// =============================================================
// GLOBAL ERROR RECOVERY SYSTEM
// =============================================================

// Track error counts to avoid showing too many notifications
window.appErrorCount = 0;
window.appLastErrorTime = 0;
const APP_ERROR_COOLDOWN = 30000; // 30 seconds between error notifications
const APP_MAX_ERRORS_BEFORE_REFRESH = 5; // Suggest refresh after 5 errors

// Global error handler - catches uncaught errors
window.onerror = function(message, source, lineno, colno, error) {
  handleAppError(message, source, error);
  return true; // Prevents default browser error handling
};

// Promise rejection handler - catches unhandled promise rejections
window.addEventListener('unhandledrejection', function(event) {
  handleAppError(event.reason?.message || 'Promise rejected', 'Promise', event.reason);
  event.preventDefault(); // Prevents default browser error handling
});

// Central error handler function
function handleAppError(message, source, error) {
  const now = Date.now();
  
  // Ignore non-critical errors
  const ignoredErrors = [
    'favicon',
    'favicon.ico',
    'ResizeObserver',
    'Script error',
    'Loading chunk',
    'Loading CSS chunk',
    'network error',
    'Failed to fetch',
    'NetworkError',
    'AbortError',
    'NS_BINDING_ABORTED',
    'ChunkLoadError',
    'play() request was interrupted',
    'user denied permission',
    'NotAllowedError'
  ];
  
  const errorString = String(message || '').toLowerCase();
  const sourceString = String(source || '').toLowerCase();
  
  // Check if this is an ignorable error
  for (const ignored of ignoredErrors) {
    if (errorString.includes(ignored.toLowerCase()) || sourceString.includes(ignored.toLowerCase())) {
      console.warn('[App] Ignored error:', message);
      return;
    }
  }
  
  // Log the error
  console.error('[App Error]', message, '\nSource:', source, '\nError:', error);
  
  // Update error count
  window.appErrorCount++;
  
  // Check cooldown to avoid spam
  if (now - window.appLastErrorTime < APP_ERROR_COOLDOWN) {
    console.log('[App] Error notification on cooldown');
    return;
  }
  
  window.appLastErrorTime = now;
  
  // Check if we should suggest a refresh
  if (window.appErrorCount >= APP_MAX_ERRORS_BEFORE_REFRESH) {
    showAppErrorNotification(
      'Ứng dụng gặp nhiều lỗi. Vui lòng tải lại trang để tiếp tục sử dụng.',
      true // Critical - show refresh button prominently
    );
  } else {
    // Try to recover automatically first
    attemptAutoRecovery(error);
  }
}

// Try to recover from common errors automatically
function attemptAutoRecovery(error) {
  console.log('[App] Attempting auto-recovery...');
  
  try {
    // 1. Try to reconnect VBot if it's the issue
    if (window.VBotWebCall && window.VBotWebCall.client) {
      const vbotClient = window.VBotWebCall.client;
      let isConnected = false;
      
      try {
        if (typeof vbotClient.isConnected === 'function') {
          isConnected = vbotClient.isConnected();
        } else if (vbotClient.connected !== undefined) {
          isConnected = vbotClient.connected;
        }
      } catch (e) {}
      
      if (!isConnected) {
        console.log('[App] VBot disconnected, reconnecting...');
        try {
          vbotClient.connect();
          updateStatusIndicator('vbot', 'yellow');
          setTimeout(() => updateStatusIndicator('vbot', 'green'), 2000);
        } catch (e) {
          console.warn('[App] VBot reconnect failed:', e);
        }
      }
    }
    
    // 2. Try to resume audio context if suspended
    if (typeof audioCtx !== 'undefined' && audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    
    // 3. Clear any stuck ringtone
    if (typeof stopRingtone === 'function' && typeof currentRt !== 'undefined' && currentRt) {
      if (!currentSession) { // Only if no active call
        stopRingtone(false);
      }
    }
    
    console.log('[App] Auto-recovery completed');
    
  } catch (recoveryError) {
    console.error('[App] Auto-recovery failed:', recoveryError);
    showAppErrorNotification('Ứng dụng gặp sự cố. Nếu vấn đề tiếp tục, vui lòng tải lại trang.', false);
  }
}

// Show error notification to user
function showAppErrorNotification(message, isCritical) {
  const errorSection = document.getElementById('appErrorSection');
  const errorMessage = document.getElementById('appErrorMessage');
  
  if (errorSection && errorMessage) {
    errorMessage.textContent = message;
    errorSection.style.display = 'block';
    
    // Auto-hide after 15 seconds if not critical
    if (!isCritical) {
      setTimeout(() => {
        errorSection.style.display = 'none';
      }, 15000);
    }
  } else {
    // Fallback: Create simple notification
    showSimpleErrorNotification(message, isCritical);
  }
}

// Simple fallback notification
function showSimpleErrorNotification(message, isCritical) {
  // Remove existing notification
  const existing = document.getElementById('simpleErrorNotification');
  if (existing) existing.remove();
  
  const notification = document.createElement('div');
  notification.id = 'simpleErrorNotification';
  notification.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: ${isCritical ? '#dc2626' : '#f59e0b'};
    color: white;
    padding: 12px 20px;
    border-radius: 10px;
    box-shadow: 0 4px 15px rgba(0,0,0,0.2);
    z-index: 99999;
    font-family: 'Inter', Arial, sans-serif;
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 12px;
    max-width: 90%;
  `;
  
  notification.innerHTML = `
    <i class="fa-solid fa-exclamation-circle"></i>
    <span>${message}</span>
    ${isCritical ? '<button onclick="location.reload()" style="background:white; color:#dc2626; border:none; padding:6px 12px; border-radius:6px; font-weight:600; cursor:pointer; margin-left:8px;">Tải lại</button>' : ''}
    <button onclick="this.parentElement.remove()" style="background:transparent; border:none; color:white; cursor:pointer; font-size:18px; margin-left:8px;">&times;</button>
  `;
  
  document.body.appendChild(notification);
  
  // Auto-hide after 15 seconds if not critical
  if (!isCritical) {
    setTimeout(() => notification.remove(), 15000);
  }
}

// Handle resource loading errors (images, scripts, stylesheets)
document.addEventListener('error', function(event) {
  const target = event.target;
  
  // Only handle resource errors (not script runtime errors)
  if (target.tagName === 'IMG' || target.tagName === 'LINK' || target.tagName === 'SCRIPT') {
    const src = target.src || target.href || 'unknown';
    
    // Ignore non-critical resources
    if (src.includes('favicon') || src.includes('icon') || src.includes('font')) {
      console.warn('[App] Non-critical resource failed to load:', src);
      return;
    }
    
    // Log but don't show notification for most resources
    console.warn('[App] Resource failed to load:', src);
  }
}, true);


// Reset error count when page is stable for 5 minutes
setInterval(() => {
  if (Date.now() - window.appLastErrorTime > 300000) { // 5 minutes
    window.appErrorCount = 0;
  }
}, 60000);



// =============================================================
// AUDIO ACTIVATION OVERLAY - Ensures browser allows audio/ringtone
// =============================================================
function showAudioActivationOverlay() {
  return new Promise((resolve) => {
    // REMOVED session check - show EVERY time for reliable ringtone

    // Create overlay container
    const overlay = document.createElement('div');
    overlay.id = 'audio-activation-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: linear-gradient(135deg, #e0e5ec 0%, #d4dbe6 50%, #f0e6f6 100%);
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      z-index: 100000;
      font-family: 'Inter', Arial, sans-serif;
    `;

    // Create icon container
    const iconDiv = document.createElement('div');
    iconDiv.style.cssText = `
      width: 120px;
      height: 120px;
      background: rgba(102, 126, 234, 0.15);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 30px;
      animation: pulse 2s ease-in-out infinite;
    `;
    iconDiv.innerHTML = `
      <svg width="55" height="55" viewBox="0 0 24 24" fill="none" stroke="#667eea" stroke-width="2">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
        <path d="M14.05 2a9 9 0 0 1 8 7.94" opacity="0.7"/>
        <path d="M14.05 6A5 5 0 0 1 18 10" opacity="0.5"/>
      </svg>
    `;

    // Create title
    const title = document.createElement('h2');
    title.textContent = 'Bật Nhận Cuộc Gọi';
    title.style.cssText = `
      margin-bottom: 12px;
      font-size: 28px;
      font-weight: 700;
      color: #374151;
    `;

    // Create subtitle
    const subtitle = document.createElement('p');
    subtitle.textContent = 'Nhấn nút bên dưới để ứng dụng có thể phát chuông khi có cuộc gọi đến';
    subtitle.style.cssText = `
      margin-bottom: 40px;
      color: #6b7280;
      font-size: 15px;
      text-align: center;
      padding: 0 20px;
      max-width: 320px;
    `;

    // Create button
    const btn = document.createElement('button');
    btn.innerHTML = '🔔 BẮT ĐẦU';
    btn.style.cssText = `
      padding: 18px 60px;
      font-size: 20px;
      font-weight: 700;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 50px;
      cursor: pointer;
      box-shadow: 0 8px 30px rgba(102, 126, 234, 0.4);
      transition: transform 0.2s, box-shadow 0.2s;
      text-transform: uppercase;
      letter-spacing: 1px;
    `;

    // Create footer note
    const footerNote = document.createElement('p');
    footerNote.innerHTML = '<i class="fa-solid fa-shield-check"></i> Bước bắt buộc để nhận cuộc gọi';
    footerNote.style.cssText = `
      margin-top: 40px;
      color: #9ca3af;
      font-size: 13px;
      display: flex;
      align-items: center;
      gap: 8px;
    `;

    // Create style for animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes pulse {
        0% { box-shadow: 0 0 0 0 rgba(102, 126, 234, 0.3); }
        70% { box-shadow: 0 0 0 20px rgba(102, 126, 234, 0); }
        100% { box-shadow: 0 0 0 0 rgba(102, 126, 234, 0); }
      }
    `;

    // Append all elements
    overlay.appendChild(style);
    overlay.appendChild(iconDiv);
    overlay.appendChild(title);
    overlay.appendChild(subtitle);
    overlay.appendChild(btn);
    overlay.appendChild(footerNote);
    document.body.appendChild(overlay);

    // Hover effects
    btn.onmouseenter = () => {
      btn.style.transform = 'scale(1.05)';
      btn.style.boxShadow = '0 12px 40px rgba(102, 126, 234, 0.5)';
    };
    btn.onmouseleave = () => {
      btn.style.transform = 'scale(1)';
      btn.style.boxShadow = '0 8px 30px rgba(102, 126, 234, 0.4)';
    };

    // CLICK HANDLER - Improved with double-click prevention and visual feedback
    let isProcessing = false;

    btn.onclick = async function (e) {
      // Prevent double-clicks
      if (isProcessing) {
        console.log('Already processing, ignoring click');
        return;
      }
      isProcessing = true;

      // Disable button immediately
      btn.disabled = true;
      btn.style.opacity = '0.7';
      btn.style.cursor = 'wait';
      btn.innerHTML = '⏳ Đang xử lý...';

      console.log('Button clicked!');

      // Play silent audio to unlock audio context
      try {
        const silentAudio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA');
        await silentAudio.play().catch(() => { });

        // Also unlock AudioContext
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        await ctx.resume().catch(() => { });

        // Small delay to ensure audio is unlocked
        await new Promise(r => setTimeout(r, 100));
      } catch (e) {
        console.log('Audio unlock attempt:', e);
      }

      // Mark as activated for this session
      sessionStorage.setItem('audioActivated', 'true');

      // Show success feedback
      btn.innerHTML = '✓ Thành công!';
      btn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';

      // Fade out and remove overlay
      await new Promise(r => setTimeout(r, 200));
      overlay.style.transition = 'opacity 0.3s';
      overlay.style.opacity = '0';
      setTimeout(() => {
        overlay.remove();
        resolve();
      }, 300);
    };
  });
}

// CRITICAL: Early ringtone function - available before full init
// This allows index.html to trigger ringtone for early invites
window.playEarlyRingtone = function () {
  console.log('Early ringtone triggered');

  // Try to play a simple beep if audio context exists
  try {
    const ctx = window.AudioContext || window.webkitAudioContext;
    if (ctx) {
      const audioCtx = new ctx();
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 800;
      gain.gain.value = 0.1;
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();

      // Store reference so it can be stopped later
      window.earlyBeepOsc = osc;
      window.earlyBeepGain = gain;
      window.earlyBeepCtx = audioCtx;

      console.log('Early beep started');
    }
  } catch (e) {
    console.warn('Early ringtone failed:', e);
  }
};

window.stopEarlyRingtone = function () {
  try {
    if (window.earlyBeepOsc) {
      window.earlyBeepOsc.stop();
      window.earlyBeepOsc.disconnect();
      window.earlyBeepOsc = null;
    }
    if (window.earlyBeepGain) {
      window.earlyBeepGain.disconnect();
      window.earlyBeepGain = null;
    }
  } catch (e) { }
};


/* -----------------------------------------------------------
   Supabase auth with strong session persistence
   - Persists session in localStorage
   - Auto-refreshes tokens
   - Proactively refreshes shortly before expiry
   ----------------------------------------------------------- */
let client;
let refreshTimer = null;
let vbotInitialized = false;
let currentSession = null;
let vbotClientReady = false;
let isIncomingCall = false;  // Track if current call is incoming
let lastCallStatus = null;   // Track latest VBot session statusUpdate
let callConnected = false;   // True only after the call is answered/accepted
// --- Store call counts globally ---
let globalCallCounts = {};
// --- Prevent duplicate invite handling ---
let lastInviteTimestamp = 0;
let lastInviteCallerId = null;
const INVITE_DEBOUNCE_MS = 2000; // Ignore duplicate invites within 2 seconds


// =============================================================
// FIREBASE PUSH NOTIFICATIONS
// =============================================================

// Your Firebase config (copy from Step 3)
const firebaseConfig = {
  apiKey: "AIzaSyCUDOcVN9XhjlVPBdUjsFJZ7j63VRESoPQ",
  authDomain: "vbot-call-notificaion.firebaseapp.com",
  projectId: "vbot-call-notificaion",
  storageBucket: "vbot-call-notificaion.firebasestorage.app",
  messagingSenderId: "662455511920",
  appId: "1:662455511920:web:6f6f63cb31ed3d9cf63db5",
  measurementId: "G-CMBT5SBQBF"
};

// Your VAPID key (copy from Step 4)
const VAPID_KEY = "BCxik3EvayPxRO4to3NdC1NS1CVW2MZGFdvSu2SzVT_CMMnUUsc4-S1wLYEPCHwv_3uDvWDHFbowMLQCJzNhHQ0";

let firebaseApp = null;
let firebaseMessaging = null;
let fcmToken = null;
// --- STATUS INDICATOR FUNCTIONS ---
function updateStatusIndicator(type, status) {
  // type: 'firebase', 'keepAlive', 'vbot'
  // status: 'green', 'yellow', 'red'
  const statusMap = {
    'firebase': 'firebaseStatus',
    'keepAlive': 'keepAliveStatus',
    'vbot': 'vbotStatus'
  };

  const elementId = statusMap[type];
  if (!elementId) return;

  const element = document.getElementById(elementId);
  if (!element) return;

  const dot = element.querySelector('.status-dot');
  if (dot) {
    dot.classList.remove('red', 'green', 'yellow');
    dot.classList.add(status);
  }
}

function showStatusIndicator() {
  const indicator = document.getElementById('connectionStatus');
  if (indicator) {
    indicator.style.display = 'flex';
  }
}

// Initialize Firebase for push notifications
// Initialize Firebase for push notifications
async function initFirebasePush() {
  // IMPORTANT: Don't let Firebase errors break VBot functionality
  try {
    console.log('Starting Firebase Push initialization...');

    // Check if browser supports notifications
    if (!('Notification' in window)) {
      console.log('This browser does not support notifications');
      return;
    }

    // Check if service workers are supported
    if (!('serviceWorker' in navigator)) {
      console.log('Service workers not supported');
      return;
    }

    // Initialize Firebase (check if already initialized)
    if (!firebaseApp) {
      try {
        // Check if Firebase app already exists
        firebaseApp = firebase.app();
        console.log('Firebase app already initialized');
      } catch (e) {
        // No existing app, initialize new one
        firebaseApp = firebase.initializeApp(firebaseConfig);
        console.log('Firebase app newly initialized');
      }
    }

    firebaseMessaging = firebase.messaging();

    // Register service worker (check if already registered)
    let registration;
    try {
      const existingRegistration = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
      if (existingRegistration) {
        registration = existingRegistration;
        console.log('Service Worker already registered:', registration);
      } else {
        registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
        console.log('Service Worker newly registered:', registration);
      }

      // IMPORTANT: Wait for service worker to be ready/activated
      // This fixes "Subscription failed - no active Service Worker" error
      if (registration.installing || registration.waiting) {
        console.log('Waiting for Service Worker to activate...');
        await new Promise((resolve) => {
          const sw = registration.installing || registration.waiting;
          sw.addEventListener('statechange', (e) => {
            if (e.target.state === 'activated') {
              console.log('Service Worker activated');
              resolve();
            }
          });
          // Timeout after 10 seconds
          setTimeout(resolve, 10000);
        });
      }

      // Extra safety: ensure service worker is ready
      await navigator.serviceWorker.ready;
      console.log('Service Worker is ready');

    } catch (swError) {
      console.error('Service Worker registration failed:', swError);
      return; // Exit if service worker fails
    }

    // Request notification permission
    const permission = await Notification.requestPermission();
    console.log('Notification permission:', permission);

    if (permission === 'granted') {
      // Get FCM token with retry logic
      let retryCount = 0;
      const maxRetries = 3;

      while (retryCount < maxRetries) {
        try {
          fcmToken = await firebaseMessaging.getToken({
            vapidKey: VAPID_KEY,
            serviceWorkerRegistration: registration
          });
          break; // Success, exit loop
        } catch (tokenError) {
          retryCount++;
          console.log(`FCM token attempt ${retryCount} failed:`, tokenError.message);
          if (retryCount < maxRetries) {
            // Wait 2 seconds before retry
            await new Promise(resolve => setTimeout(resolve, 2000));
          } else {
            throw tokenError; // All retries failed
          }
        }
      }

      console.log('FCM Token:', fcmToken);

      // Save token to your database (so server can send notifications)
      await saveFCMToken(fcmToken);

      // Handle foreground messages
      firebaseMessaging.onMessage((payload) => {
        console.log('Foreground message received:', payload);

        // ALL devices process Firebase messages (multi-device ringing mode)
        // Each device shows notification independently

        // IMPORTANT: Don't interfere if VBot is already handling a call
        if (currentSession || isIncomingCall) {
          console.log('VBot already handling call, ignoring Firebase message');
          return;
        }

        // If it's an incoming call notification and we're in foreground,
        // the normal VBot handler should work. But we can show a notification too.
        if (payload.data && payload.data.type === 'incoming_call') {
          // Show notification even in foreground
          new Notification(payload.notification?.title || 'Incoming Call', {
            body: payload.notification?.body || 'You have an incoming call',
            icon: '/favicon.ico',
            requireInteraction: true
          });
        }
      });

      console.log('Firebase Push Notifications initialized successfully!');
      updateStatusIndicator('firebase', 'green');
      return fcmToken;
    } else {
      console.log('Notification permission denied');
      updateStatusIndicator('firebase', 'yellow');
    }
} catch (error) {
    console.error('Firebase Push init error:', error);
    updateStatusIndicator('firebase', 'red');
    // IMPORTANT: Don't let Firebase errors break the app
    // VBot should still work even if Firebase fails
    console.log('Firebase failed but app will continue working');
    
    // Show a non-critical warning to user
    showSimpleWarningNotification('Thông báo đẩy (Push) không hoạt động. Ứng dụng vẫn nhận cuộc gọi bình thường.');
  }
}

// Show a simple warning notification (yellow, auto-hides)
function showSimpleWarningNotification(message) {
  const existing = document.getElementById('simpleWarningNotification');
  if (existing) existing.remove();
  
  const notification = document.createElement('div');
  notification.id = 'simpleWarningNotification';
  notification.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
    color: white;
    padding: 12px 20px;
    border-radius: 10px;
    box-shadow: 0 4px 15px rgba(245, 158, 11, 0.3);
    z-index: 99989;
    font-family: 'Inter', Arial, sans-serif;
    font-size: 13px;
    display: flex;
    align-items: center;
    gap: 10px;
    max-width: 90%;
  `;
  
  notification.innerHTML = `
    <i class="fa-solid fa-exclamation-triangle"></i>
    <span>${message}</span>
    <button onclick="this.parentElement.remove()" style="background:transparent; border:none; color:white; cursor:pointer; font-size:16px; margin-left:8px; opacity:0.8;">&times;</button>
  `;
  
  document.body.appendChild(notification);
  
  // Auto-hide after 8 seconds
  setTimeout(() => {
    if (notification.parentElement) {
      notification.style.transition = 'opacity 0.3s';
      notification.style.opacity = '0';
      setTimeout(() => notification.remove(), 300);
    }
  }, 8000);
}

// Save FCM token to Supabase
async function saveFCMToken(token) {
  if (!token || !client) return;

  try {
    const { data: { user } } = await client.auth.getUser();
    if (!user) return;

    // Save to Supabase
    const { error } = await client
      .from('fcm_tokens')
      .upsert({
        user_email: user.email,
        fcm_token: token,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_email'
      });

    if (error) {
      console.error('Error saving FCM token:', error);
    } else {
      console.log('FCM token saved to database');
    }
  } catch (e) {
    console.error('Error saving FCM token:', e);
  }
}


// --- KEEP-ALIVE SYSTEM (Prevent tab from sleeping) ---
// --- KEEP-ALIVE SYSTEM (Prevent tab from sleeping) ---
let keepAliveWorker = null;
let keepAliveAudio = null;
let keepAliveSilentAudio = null;
let wakeLock = null;
let periodicReconnectInterval = null;
let audioContextCheckerInterval = null;
let lastVBotActivity = Date.now();
// --- TAB LEADER ELECTION (for handling incoming calls in only one tab) ---
let isLeaderTab = window.VBOT_IS_LEADER || false;
const TAB_ID = window.VBOT_TAB_ID || (Date.now() + '-' + Math.random().toString(36).substr(2, 9));
const LEADER_KEY = 'vbot_leader_tab';
const LEADER_HEARTBEAT_KEY = 'vbot_leader_heartbeat';
const HEARTBEAT_INTERVAL = 2000; // 2 seconds
const LEADER_TIMEOUT = 5000; // 5 seconds without heartbeat = leader is dead


// --- LEADER ELECTION FUNCTIONS ---
function checkAndBecomeLeader() {
  const now = Date.now();
  const lastHeartbeat = parseInt(localStorage.getItem(LEADER_HEARTBEAT_KEY) || '0');
  const currentLeader = localStorage.getItem(LEADER_KEY);

  // If no leader OR leader hasn't sent heartbeat in LEADER_TIMEOUT, take over
  if (!currentLeader || (now - lastHeartbeat > LEADER_TIMEOUT)) {
    localStorage.setItem(LEADER_KEY, TAB_ID);
    localStorage.setItem(LEADER_HEARTBEAT_KEY, now.toString());
    isLeaderTab = true;
    console.log('This tab is now the LEADER for incoming calls');
    return true;
  }

  // Check if this tab is already the leader
  if (currentLeader === TAB_ID) {
    localStorage.setItem(LEADER_HEARTBEAT_KEY, now.toString());
    isLeaderTab = true;
    return true;
  }

  isLeaderTab = false;
  return false;
}

function startLeaderHeartbeat() {
  // Initial check
  checkAndBecomeLeader();

  // Keep sending heartbeats if we're the leader
  setInterval(() => {
    if (isLeaderTab) {
      localStorage.setItem(LEADER_HEARTBEAT_KEY, Date.now().toString());
    } else {
      // Try to become leader if current leader is dead
      checkAndBecomeLeader();
    }
  }, HEARTBEAT_INTERVAL);
}

// Listen for storage changes (another tab might take over)
window.addEventListener('storage', (e) => {
  if (e.key === LEADER_KEY) {
    if (e.newValue === TAB_ID && !isLeaderTab) {
      // This tab just became the leader
      isLeaderTab = true;
      console.log('This tab just became the LEADER');

      // Connect VBot now that we're the leader
      if (window.VBotWebCall && window.VBotWebCall.client && !window.vbotConnected) {
        console.log('VBot: New leader connecting...');
        window.VBotWebCall.client.connect();
        window.vbotConnected = true;
      }
    } else if (e.newValue !== TAB_ID && isLeaderTab) {
      // This tab lost leadership
      isLeaderTab = false;
      console.log('Another tab became the leader - disconnecting VBot');

      // Disconnect VBot since we're no longer the leader
      if (window.VBotWebCall && window.VBotWebCall.client && window.vbotConnected) {
        try {
          window.VBotWebCall.client.disconnect();
          window.vbotConnected = false;
          console.log('VBot: Disconnected (no longer leader)');
        } catch (e) {
          console.warn('VBot disconnect failed:', e);
        }
      }
    }
  }
});

// When this tab closes, release leadership and cleanup keep-alive
window.addEventListener('beforeunload', () => {
  if (isLeaderTab) {
    localStorage.removeItem(LEADER_KEY);
    localStorage.removeItem(LEADER_HEARTBEAT_KEY);

    // Disconnect VBot cleanly
    if (window.VBotWebCall && window.VBotWebCall.client) {
      try {
        window.VBotWebCall.client.disconnect();
        window.vbotConnected = false;
      } catch (e) { }
    }
  }
  // Cleanup keep-alive resources
  stopKeepAlive();
});

// When tab becomes visible again, try to reclaim leadership
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    // Small delay to avoid race conditions
    setTimeout(() => {
      const wasLeader = isLeaderTab;
      checkAndBecomeLeader();

      // If we just became leader, connect VBot
      if (isLeaderTab && !wasLeader) {
        console.log('Tab became leader after visibility change');
        if (window.VBotWebCall && window.VBotWebCall.client && !window.vbotConnected) {
          console.log('VBot: New leader connecting after visibility change...');
          window.VBotWebCall.client.connect();
          window.vbotConnected = true;
        }
      }

      // If we're the leader and VBot is initialized, make sure it's connected
      if (isLeaderTab && window.VBotWebCall && window.VBotWebCall.client) {
        try {
          const vbotClient = window.VBotWebCall.client;
          let isConnected = false;
          if (typeof vbotClient.isConnected === 'function') {
            isConnected = vbotClient.isConnected();
          } else if (vbotClient.connected !== undefined) {
            isConnected = vbotClient.connected;
          }

          if (!isConnected) {
            console.log('Leader tab reconnecting VBot...');
            vbotClient.connect();
            window.vbotConnected = true;
          }
        } catch (e) {
          console.warn('Error checking VBot connection:', e);
        }
      }
    }, 500);
  }
});

// =============================================================
// KEEP-ALIVE SYSTEM - Prevents browser from sleeping the tab
// =============================================================

function startKeepAlive() {
  console.log('Starting keep-alive system...');
  updateStatusIndicator('keepAlive', 'green');

  // 1. Web Worker Keep-Alive (most reliable - not throttled in background)
  startWorkerKeepAlive();

  // 2. Silent Audio Keep-Alive (backup method)
  startAudioKeepAlive();

  // 3. Wake Lock API (prevents screen sleep on mobile)
  requestWakeLock();

  // 4. Periodic VBot connection ping
  startConnectionPing();

  // 5. NEW: Periodic forced reconnect (every 3 minutes as preventive measure)
  startPeriodicReconnect();

  // 6. NEW: AudioContext resurrection checker
  startAudioContextChecker();
}

function stopKeepAlive() {
  console.log('Stopping keep-alive system...');

  if (keepAliveWorker) {
    keepAliveWorker.terminate();
    keepAliveWorker = null;
  }

  if (keepAliveAudio) {
    try {
      if (keepAliveAudio.oscillator) keepAliveAudio.oscillator.stop();
      if (keepAliveAudio.audioCtx) keepAliveAudio.audioCtx.close();
    } catch (e) { }
    keepAliveAudio = null;
  }

  // Stop silent audio element
  if (keepAliveSilentAudio) {
    keepAliveSilentAudio.pause();
    keepAliveSilentAudio = null;
  }

  // Clear intervals
  if (periodicReconnectInterval) {
    clearInterval(periodicReconnectInterval);
    periodicReconnectInterval = null;
  }

  if (audioContextCheckerInterval) {
    clearInterval(audioContextCheckerInterval);
    audioContextCheckerInterval = null;
  }

  releaseWakeLock();
}

// Method 1: Web Worker (runs even when tab is throttled)
function startWorkerKeepAlive() {
  try {
    const workerCode = `
      let pingCount = 0;
      setInterval(() => {
        pingCount++;
        self.postMessage({ type: 'keepalive', count: pingCount });
      }, 5000);
    `;

    const blob = new Blob([workerCode], { type: 'application/javascript' });
    keepAliveWorker = new Worker(URL.createObjectURL(blob));

    keepAliveWorker.onmessage = (e) => {
      if (e.data.type === 'keepalive') {
        // This runs every 5 seconds even in background
        checkVBotConnection();

        // Also try to resume any suspended audio
        if (keepAliveAudio && keepAliveAudio.audioCtx && keepAliveAudio.audioCtx.state === 'suspended') {
          keepAliveAudio.audioCtx.resume().catch(() => { });
        }
        if (keepAliveSilentAudio && keepAliveSilentAudio.paused) {
          keepAliveSilentAudio.play().catch(() => { });
        }
      }
    };

    console.log('Worker keep-alive started');
  } catch (e) {
    console.warn('Worker keep-alive failed:', e);
  }
}

// Method 2: Silent audio (tricks browser into thinking tab is active)
function startAudioKeepAlive() {
  // Method 2a: Oscillator-based (backup)
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    // Use 20Hz (still inaudible but browser recognizes it better than 1Hz)
    gainNode.gain.value = 0.001;
    oscillator.frequency.value = 20;

    oscillator.start();

    keepAliveAudio = { oscillator, gainNode, audioCtx };
    console.log('Oscillator keep-alive started');
  } catch (e) {
    console.warn('Oscillator keep-alive failed:', e);
  }

  // Method 2b: Silent audio file loop (MORE RELIABLE)
  try {
    // Base64 encoded 1-second silent MP3
    const silentMp3 = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7v/////////////////////////////////' +
      '////////////////////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7v/////////////////////////////////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

    keepAliveSilentAudio = new Audio(silentMp3);
    keepAliveSilentAudio.loop = true;
    keepAliveSilentAudio.volume = 0.01;

    // Play with user gesture fallback
    const playPromise = keepAliveSilentAudio.play();
    if (playPromise) {
      playPromise.catch(() => {
        // Will be started on first user interaction
        console.log('Silent audio waiting for user interaction');
      });
    }

    console.log('Silent audio keep-alive started');
  } catch (e) {
    console.warn('Silent audio keep-alive failed:', e);
  }
}

// Method 3: Wake Lock API (mobile devices)
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      console.log('Wake lock acquired');

      wakeLock.addEventListener('release', () => {
        console.log('Wake lock released');
      });
    }
  } catch (e) {
    console.warn('Wake lock failed:', e);
  }
}

function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release();
    wakeLock = null;
  }
}

// Re-acquire wake lock when tab becomes visible
document.addEventListener('visibilitychange', async () => {
  if (!document.hidden && !wakeLock) {
    await requestWakeLock();
  }
});

// Method 4: Periodic VBot connection check and ping
let connectionPingInterval = null;

function startConnectionPing() {
  if (connectionPingInterval) return;

  connectionPingInterval = setInterval(() => {
    checkVBotConnection();
  }, 10000); // Every 10 seconds

  console.log('Connection ping started');
}

function checkVBotConnection() {
  if (!isLeaderTab) return;
  if (!window.VBotWebCall || !window.VBotWebCall.client) return;

  const vbotClient = window.VBotWebCall.client;

  try {
    let isConnected = true;

    if (typeof vbotClient.isConnected === 'function') {
      isConnected = vbotClient.isConnected();
    } else if (vbotClient.connected !== undefined) {
      isConnected = vbotClient.connected;
    }

    if (!isConnected) {
      console.log('Keep-alive: VBot disconnected, reconnecting...');
      vbotClient.connect();
      lastVBotActivity = Date.now();
    } else {
      // Connection seems OK, update activity
      lastVBotActivity = Date.now();

      // NEW: Try to send a ping if the SDK supports it
      try {
        if (typeof vbotClient.ping === 'function') {
          vbotClient.ping();
        } else if (typeof vbotClient.sendMessage === 'function') {
          // Some SDKs use sendMessage for keep-alive
          vbotClient.sendMessage({ type: 'ping' });
        }
      } catch (pingErr) {
        // Ping not supported, that's OK
      }
    }
  } catch (e) {
    console.warn('Keep-alive connection check failed:', e);
    // On error, try to reconnect
    try {
      vbotClient.connect();
    } catch (reconnectErr) { }
  }
}

// Method 5: Periodic forced reconnect (prevents silent connection death)
function startPeriodicReconnect() {
  if (periodicReconnectInterval) return;

  periodicReconnectInterval = setInterval(() => {
    if (!isLeaderTab) return;
    if (!window.VBotWebCall || !window.VBotWebCall.client) return;

    const timeSinceActivity = Date.now() - lastVBotActivity;

    // If no activity for 2 minutes, force reconnect
    if (timeSinceActivity > 120000) {
      console.log('Keep-alive: No VBot activity for 2 min, forcing reconnect...');
      forceVBotReconnect();
    }
  }, 60000); // Check every 1 minute

  console.log('Periodic reconnect checker started');
}

// Force VBot to reconnect
function forceVBotReconnect() {
  if (!window.VBotWebCall || !window.VBotWebCall.client) return;

  const vbotClient = window.VBotWebCall.client;

  try {
    // Disconnect first
    if (typeof vbotClient.disconnect === 'function') {
      vbotClient.disconnect();
    }

    // Small delay then reconnect
    setTimeout(() => {
      try {
        vbotClient.connect();
        lastVBotActivity = Date.now();
        console.log('VBot force reconnected successfully');
      } catch (e) {
        console.error('VBot force reconnect failed:', e);
      }
    }, 1000);
  } catch (e) {
    console.error('VBot disconnect failed:', e);
  }
}

// Method 6: AudioContext resurrection checker
function startAudioContextChecker() {
  if (audioContextCheckerInterval) return;

  audioContextCheckerInterval = setInterval(() => {
    // Check oscillator AudioContext
    if (keepAliveAudio && keepAliveAudio.audioCtx) {
      if (keepAliveAudio.audioCtx.state === 'suspended') {
        console.log('AudioContext suspended, resuming...');
        keepAliveAudio.audioCtx.resume().catch(() => { });
      }
    }

    // Check silent audio is still playing
    if (keepAliveSilentAudio) {
      if (keepAliveSilentAudio.paused) {
        console.log('Silent audio paused, restarting...');
        keepAliveSilentAudio.play().catch(() => { });
      }
    }

    // Also resume main audioCtx if exists
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => { });
    }
  }, 10000); // Check every 10 seconds

  console.log('AudioContext checker started');
}

// Update activity timestamp whenever VBot does something
function updateVBotActivity() {
  lastVBotActivity = Date.now();
}

// VBot Retry Notification
window.showVBotRetryNotification = function(retryCount) {
  const existing = document.getElementById('vbotRetryNotification');
  if (existing) existing.remove();
  
  const notification = document.createElement('div');
  notification.id = 'vbotRetryNotification';
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
    color: white;
    padding: 12px 20px;
    border-radius: 10px;
    box-shadow: 0 4px 15px rgba(59, 130, 246, 0.4);
    z-index: 99999;
    font-family: 'Inter', Arial, sans-serif;
    display: flex;
    align-items: center;
    gap: 12px;
  `;
  notification.innerHTML = `
    <i class="fa-solid fa-sync fa-spin"></i>
    <span>Đang kết nối lại VBot (${retryCount}/2)...</span>
  `;
  document.body.appendChild(notification);
  
  setTimeout(() => notification.remove(), 4000);
};

// VBot Failed Notification
window.showVBotFailedNotification = function() {
  const existing = document.getElementById('vbotFailedNotification');
  if (existing) existing.remove();
  
  const notification = document.createElement('div');
  notification.id = 'vbotFailedNotification';
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
    color: white;
    padding: 15px 25px;
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(239, 68, 68, 0.4);
    z-index: 99999;
    font-family: 'Inter', Arial, sans-serif;
    display: flex;
    align-items: center;
    gap: 15px;
  `;
  notification.innerHTML = `
    <div style="font-size: 24px;">⚠️</div>
    <div>
      <div style="font-weight: 600; margin-bottom: 3px;">Không thể kết nối VBot</div>
      <div style="font-size: 13px; opacity: 0.9;">Vui lòng tải lại trang để thử lại.</div>
    </div>
    <button onclick="location.reload()" style="
      background: white;
      color: #dc2626;
      border: none;
      padding: 8px 16px;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
    ">Tải lại</button>
  `;
  document.body.appendChild(notification);
  
  updateStatusIndicator('vbot', 'red');
};

// NEW: VBot Health Check - call this to diagnose why calls aren't coming
window.vbotHealthCheck = function () {
  const status = {
    // Token status
    hasToken: !!window.VBOT_ACCESS_TOKEN,
    slot: window.VBOT_SLOT || 'none',
    outboundOnly: window.VBOT_OUTBOUND_ONLY || false,
    isPriority: window.VBOT_IS_PRIORITY || false,

    // VBot status
    vbotReady: window.vbotReady || false,
    vbotConnected: window.vbotConnected || false,
    vbotInitialized: typeof vbotInitialized !== 'undefined' ? vbotInitialized : false,
    listenersAttached: window.vbotListenersAttached || false,

    // Session status
    sessionId: window.VBOT_SESSION_ID || 'none',
    kicked: window.VBOT_KICKED || false,
    heartbeatFailures: window.VBOT_HEARTBEAT_FAILURES || 0,

    // Current call status
    hasActiveSession: !!currentSession,
    isIncomingCall: typeof isIncomingCall !== 'undefined' ? isIncomingCall : false,
    callConnected: typeof callConnected !== 'undefined' ? callConnected : false,
    
    // Audio status
    ringtoneKilled: typeof ringtoneKilledForCall !== 'undefined' ? ringtoneKilledForCall : false,
    isPlayingRingtone: typeof isPlayingRingtone !== 'undefined' ? isPlayingRingtone : false,
    audioUnlocked: typeof audioUnlocked !== 'undefined' ? audioUnlocked : false
  };

  console.log('========== VBOT HEALTH CHECK ==========');
  console.table(status);

  // Diagnose problems
  const problems = [];
  const warnings = [];

  if (!status.hasToken) {
    problems.push('❌ No VBot token - cannot make or receive calls');
  }
  if (status.outboundOnly) {
    warnings.push('⚠️ OUTBOUND-ONLY MODE - Can make calls but CANNOT receive incoming calls');
  }
  if (!status.vbotReady) {
    problems.push('❌ VBot SDK not ready');
  }
  if (!status.vbotConnected) {
    problems.push('❌ VBot not connected to server');
  }
  if (!status.listenersAttached) {
    problems.push('❌ VBot invite listeners not attached');
  }
  if (status.kicked) {
    problems.push('❌ Session was kicked by another user');
  }
  if (status.heartbeatFailures > 0) {
    warnings.push(`⚠️ ${status.heartbeatFailures} heartbeat failure(s) detected`);
  }
  if (!status.audioUnlocked) {
    warnings.push('⚠️ Audio not unlocked - ringtone may not play');
  }
  if (status.ringtoneKilled && !status.hasActiveSession) {
    warnings.push('⚠️ Ringtone kill switch is ON but no active call - may need reset');
  }

  if (problems.length === 0 && warnings.length === 0) {
    console.log('✅ All systems OK - should receive calls');
  } else {
    if (problems.length > 0) {
      console.log('PROBLEMS FOUND:');
      problems.forEach(p => console.log(p));
    }
    if (warnings.length > 0) {
      console.log('WARNINGS:');
      warnings.forEach(w => console.log(w));
    }
  }

  console.log('========================================');

  // Return structured result
  const result = {
    healthy: problems.length === 0,
    problems: problems,
    warnings: warnings,
    status: status
  };
  
  // Also show alert for easy viewing
  if (problems.length > 0) {
    alert('VBot Problems:\n\n' + problems.join('\n') + (warnings.length > 0 ? '\n\nWarnings:\n' + warnings.join('\n') : ''));
  } else if (warnings.length > 0) {
    alert('✅ VBot OK but with warnings:\n\n' + warnings.join('\n') + '\n\nSlot: ' + status.slot + '\nPriority: ' + status.isPriority);
  } else {
    alert('✅ VBot OK - Should receive calls\n\nSlot: ' + status.slot + '\nPriority: ' + status.isPriority);
  }

  return result;
};

// Quick reset function for debugging
window.vbotReset = function() {
  console.log('Resetting VBot state...');
  currentSession = null;
  isIncomingCall = false;
  callConnected = false;
  lastCallStatus = null;
  resetRingtoneKillSwitch();
  stopRingtone(false);
  stopBeep();
  hideCallUI();
  lastInviteCallerId = null;
  lastInviteTimestamp = 0;
  if (window.VBotWebCall) window.VBotWebCall.session = null;
  console.log('VBot state reset complete');
  alert('VBot state has been reset. You should now be able to receive calls.');
};


async function fetchCallCounts(retryCount = 0) {
  const maxRetries = 2;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const res = await fetch('/.netlify/functions/get-call-counts', {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      globalCallCounts = await res.json();
      return true;
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (e) {
    if (e.name === 'AbortError') {
      console.warn('Call counts fetch timed out');
    } else {
      console.error('Error fetching counts:', e);
    }

    // NEW: Retry logic
    if (retryCount < maxRetries) {
      console.log(`Retrying fetchCallCounts (${retryCount + 1}/${maxRetries})...`);
      await new Promise(r => setTimeout(r, 2000)); // Wait 2 seconds
      return fetchCallCounts(retryCount + 1);
    }

    // Keep existing counts if all retries fail
    return false;
  }
}
// ---------------------------------------

/* --- RINGTONES (UPBEAT) + BEEP FALLBACK --- */
// Rotate through multiple upbeat files; if play() is blocked or files missing,
// we fall back to a quiet WebAudio "beep" so you still hear something.

// Use your hosted ringtone (single-item list is fine)
const RINGTONE_LIST = [
  'https://content.tansinh.info/k-pop-ringtone-no-copyright-357142_14122025_09-18-31.mp3'
];

let audioCtx, beepOsc, beepGain;
let currentRt = null;   // currently playing HTMLAudioElement
let rtIndex = 0;        // will rotate 1 -> 2 -> 3 -> 1...
let audioUnlocked = false;  // Track if user has interacted with page
let isPlayingRingtone = false; // Prevent race conditions
let ringtoneKilledForCall = false; // KILL SWITCH: Once true, ringtone cannot play until reset
let lastRingtoneCallId = null; // Track which call the ringtone is for

// --- WebAudio fallback (beep) ---
function startBeep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') { audioCtx.resume().catch(() => { }); }
    if (beepOsc) return; // already beeping
    beepOsc = audioCtx.createOscillator();
    beepGain = audioCtx.createGain();
    beepOsc.type = 'sine';
    beepOsc.frequency.value = 800; // beep tone
    beepGain.gain.value = 0.06;    // quiet but audible
    beepOsc.connect(beepGain);
    beepGain.connect(audioCtx.destination);
    beepOsc.start();
  } catch (e) {
    console.warn('Beep fallback failed:', e);
  }
}
function stopBeep() {
  try {
    if (beepOsc) { beepOsc.stop(); beepOsc.disconnect(); beepOsc = null; }
    if (beepGain) { beepGain.disconnect(); beepGain = null; }
  } catch { }
}

// --- Pick next ringtone url ---
function nextRingtoneUrl() {
  const url = RINGTONE_LIST[rtIndex % RINGTONE_LIST.length];
  rtIndex++;
  return url;
}

async function playUpbeatRingtone(callId = null) {
  // KILL SWITCH CHECK: If ringtone was killed for this call, do NOT play
  if (ringtoneKilledForCall) {
    console.log('Ringtone blocked by kill switch');
    return;
  }

  // If the flag is stuck ON but nothing is actually playing, reset it
  if (isPlayingRingtone && !(currentRt || beepOsc)) {
    isPlayingRingtone = false;
  }

  // Prevent multiple simultaneous play attempts (only if something is truly playing)
  if (isPlayingRingtone && (currentRt || beepOsc)) return;

  isPlayingRingtone = true;
  if (callId) lastRingtoneCallId = callId;

  // Always try to resume AudioContext (some browsers suspend it after idle/background)
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') await audioCtx.resume().catch(() => { });
  } catch { }

  // Stop old HTMLAudio
  try {
    if (currentRt) {
      currentRt.pause();
      currentRt.currentTime = 0;
      currentRt.onerror = null;
      currentRt.onplaying = null;
      currentRt = null;
    }
  } catch { }

  // Start beep immediately as a safety net (if browser allows)
  startBeep();

  // Small delay to ensure cleanup
  await new Promise(r => setTimeout(r, 50));

  // CRITICAL: Check kill switch AGAIN after the delay (race condition fix)
  if (ringtoneKilledForCall) {
    console.log('Ringtone blocked by kill switch (after delay)');
    stopBeep();
    isPlayingRingtone = false;
    return;
  }

  const url = nextRingtoneUrl();

  try {
    // FINAL CHECK before creating audio
    if (ringtoneKilledForCall) {
      stopBeep();
      isPlayingRingtone = false;
      return;
    }

    const a = new Audio(url);
    a.preload = 'auto';
    a.loop = true;
    a.volume = 1.0;
    a.playsInline = true;

    a.onplaying = () => {
      // If kill switch was activated while loading, stop immediately
      if (ringtoneKilledForCall) {
        a.pause();
        a.src = '';
        return;
      }
      // MP3 is actually playing -> stop beep fallback
      stopBeep();
    };

    a.onerror = () => {
      console.warn('Ringtone failed to load:', url);
      if (!ringtoneKilledForCall) {
        startBeep();
      }
      if (!beepOsc) isPlayingRingtone = false;
    };

    currentRt = a;

    // Try to play (may be blocked by autoplay policy)
    await a.play();

    // Check AGAIN after play started
    if (ringtoneKilledForCall) {
      a.pause();
      a.src = '';
      currentRt = null;
      stopBeep();
      console.log('Ringtone stopped immediately after play (kill switch)');
      return;
    }

    console.log('Ringtone playing successfully');
  } catch (e) {
    console.warn('Ringtone play failed:', e && e.name ? e.name : e);

    if (!ringtoneKilledForCall) {
      startBeep();
    }

    if (!beepOsc) isPlayingRingtone = false;
  }
}


// --- Unlock audio on first user interaction (click, touch, keypress) ---
function unlockAudio() {
  if (audioUnlocked) return;

  try {
    // Warm-up: create one audio and immediately stop it, so future play() works
    const warm = new Audio(RINGTONE_LIST[0]);
    warm.volume = 0.01; // Nearly silent
    warm.play().then(() => {
      warm.pause();
      warm.currentTime = 0;
      audioUnlocked = true;
      console.log('Audio unlocked successfully');
    }).catch(() => { });
  } catch { }

  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    audioCtx.resume().then(() => {
      audioUnlocked = true;
    }).catch(() => { });
  } catch { }
}

// Listen for multiple interaction types to unlock audio
['click', 'touchstart', 'keydown', 'scroll', 'mousemove'].forEach(event => {
  document.addEventListener(event, unlockAudio, { once: true, passive: true });
});

// CRITICAL: Also try to unlock audio on page load with user gesture simulation
// Some browsers allow this for trusted events
document.addEventListener('DOMContentLoaded', () => {
  // Attempt silent audio unlock
  setTimeout(() => {
    try {
      const silentAudio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==');
      silentAudio.volume = 0.001;
      silentAudio.play().then(() => {
        silentAudio.pause();
        audioUnlocked = true;
        console.log('Audio auto-unlocked on load');
      }).catch(() => { });
    } catch (e) { }

    // Also try AudioContext
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => { });
      }
    } catch (e) { }
  }, 100);
});

// Single visibilitychange listener (not inside forEach)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    // Tab became visible - re-enable audio
    try {
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => { });
      }
    } catch { }

    // If an incoming call is currently ringing, try starting ringtone again
    if (isIncomingCall && currentSession && !callConnected && !ringtoneKilledForCall) {
      playUpbeatRingtone();
    }

    // Sync UI with current call state
    const modal = document.getElementById('callModal');
    if (currentSession && modal && !modal.classList.contains('active')) {
      // Call is active but UI is hidden - show it
      if (callConnected) {
        showCallUI(document.getElementById('callNumber')?.textContent || '---', 'OUT');
        startCallTimer();
      } else if (isIncomingCall) {
        showIncomingCallUI(document.getElementById('callNumber')?.textContent || 'Unknown');
      }
    }

    // CRITICAL: Check for any early invites that arrived while tab was hidden
    // We dispatch a custom event that setupVBotListeners will handle
    if (window.vbotEarlyInvites && window.vbotEarlyInvites.length > 0 && window.vbotMainListenerReady) {
      console.log('Processing early invites after tab visible');
      const invitesToProcess = [...window.vbotEarlyInvites];
      window.vbotEarlyInvites = [];

      invitesToProcess.forEach(item => {
        if (Date.now() - item.timestamp < 30000) {
          try {
            if (item.session.state !== 'terminated') {
              // Dispatch event for the VBot listener to handle
              window.dispatchEvent(new CustomEvent('vbot-process-invite', { detail: item.session }));
            }
          } catch (e) {
            console.warn('Error checking session state:', e);
          }
        }
      });
    }

  } else {
    // Tab became hidden - reduce audio resource usage but don't stop calls
    // Just stop the beep fallback to save resources
    stopBeep();
  }
});

// --- Stop everything (ringtone + beep) ---
function stopRingtone(activateKillSwitch = true) {
  console.log('stopRingtone called, killSwitch:', activateKillSwitch);

  // ACTIVATE KILL SWITCH to prevent any re-triggering
  if (activateKillSwitch) {
    ringtoneKilledForCall = true;
  }

  isPlayingRingtone = false;

  // Force stop ALL possible audio sources
  try {
    if (currentRt) {
      currentRt.pause();
      currentRt.currentTime = 0;
      currentRt.onended = null;
      currentRt.onerror = null;
      currentRt.onplaying = null;
      currentRt.src = ''; // Clear source to force stop
      currentRt.load(); // Reset the audio element
      currentRt = null;
      console.log('Ringtone audio element stopped');
    }
  } catch (e) {
    console.warn('Error stopping ringtone:', e);
  }

  // AGGRESSIVE: Stop ALL audio elements on page that might be ringtones
  try {
    document.querySelectorAll('audio').forEach(audio => {
      // Check for ringtone URL patterns
      if (audio.src && (
        audio.src.includes('ringtone') ||
        audio.src.includes('content.tansinh.info') ||
        audio.src.includes('k-pop')
      )) {
        audio.pause();
        audio.src = '';
        audio.load();
      }
    });
  } catch (e) { }

  stopBeep();

  // EXTRA SAFETY: Stop again after a short delay (catches async race conditions)
  setTimeout(() => {
    try {
      if (currentRt) {
        currentRt.pause();
        currentRt.src = '';
        currentRt = null;
      }
      stopBeep();
    } catch (e) { }
  }, 100);

  setTimeout(() => {
    try {
      if (currentRt) {
        currentRt.pause();
        currentRt.src = '';
        currentRt = null;
      }
      stopBeep();
    } catch (e) { }
  }, 300);
}

// Reset kill switch (call this when a NEW call starts or current call ends)
function resetRingtoneKillSwitch() {
  ringtoneKilledForCall = false;
  lastRingtoneCallId = null;
  console.log('Ringtone kill switch reset');
}
/* -------------------------- */

/* --- OUTGOING CALL TONE --- */
const OUTGOING_TONE_URL = 'https://content.tansinh.info/ring-tone-68676_14122025_09-25-50.mp3';
let outgoingTone = null;

function playOutgoingTone() {
  try {
    stopOutgoingTone();
    outgoingTone = new Audio(OUTGOING_TONE_URL);
    outgoingTone.loop = true;
    outgoingTone.volume = 1.0;

    // Add error handling
    outgoingTone.onerror = () => {
      console.warn('Outgoing tone failed to load');
    };

    outgoingTone.play()
      .then(() => console.log('Outgoing tone playing'))
      .catch((e) => {
        console.warn('Outgoing tone blocked:', e.name);
      });
  } catch (e) {
    console.warn('Outgoing tone error:', e);
  }
}

function stopOutgoingTone() {
  try {
    if (outgoingTone) {
      outgoingTone.pause();
      outgoingTone.onended = null;
      outgoingTone.onerror = null;
      outgoingTone = null;
      console.log('Outgoing tone stopped');
    }
  } catch (e) {
    console.warn('Error stopping outgoing tone:', e);
  }
}



/* --------- Helper: schedule proactive refresh --------- */
function scheduleProactiveRefresh(session) {
  if (!session || !session.expires_at || !client) return;

  clearTimeout(refreshTimer);

  const expMs = session.expires_at * 1000; // seconds -> ms
  const now = Date.now();

  // Refresh 2 minutes before expiry (or immediately if already close)
  const TWO_MIN = 2 * 60 * 1000;
  const delay = Math.max(0, expMs - now - TWO_MIN);

  refreshTimer = setTimeout(async () => {
    try {
      const { data, error } = await client.auth.refreshSession();
      if (error) {
        console.error('Refresh session failed:', error);
        return;
      }
      if (data?.session) {
        // Schedule the next refresh with the new session
        scheduleProactiveRefresh(data.session);
      }
    } catch (err) {
      console.error('Error while refreshing session:', err);
    }
  }, delay);
}

/* --------- Central session handler --------- */
let appAlreadyShown = false; // Prevent showing app multiple times

function handleSession(session) {
  if (session) {
    scheduleProactiveRefresh(session);
    // Only show app once - prevents double overlay on refresh
    if (!appAlreadyShown) {
      appAlreadyShown = true;
      showApp();
    }
  } else {
    clearTimeout(refreshTimer);
    appAlreadyShown = false; // Reset when signed out
    showLogin();
  }
}

/* --------- Supabase init --------- */
async function initSupabase() {
  const msgEl = document.getElementById('message');
  const MAX_RETRIES = 3;
  let retryCount = 0;

  async function attemptInit() {
    try {
      const res = await fetch('/.netlify/functions/supabase-credentials');
      if (!res.ok) throw new Error('Failed to load credentials');

      const { SUPABASE_URL, SUPABASE_ANON_KEY } = await res.json();

      client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          storage: window.localStorage,
          detectSessionInUrl: true
        }
      });

      // Track if we've already handled the initial session
      let initialSessionHandled = false;

      // React to sign in / sign out / token refresh / initial session
      client.auth.onAuthStateChange((event, session) => {
        console.log('Auth state change:', event);

        // Handle INITIAL_SESSION only once
        if (event === 'INITIAL_SESSION') {
          if (!initialSessionHandled) {
            initialSessionHandled = true;
            handleSession(session);
          }
          return;
        }

        // Handle sign in/out normally
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
          handleSession(session);
        }
      });
    } catch (err) {
      console.error('Supabase init error (attempt ' + (retryCount + 1) + '):', err);
      retryCount++;

      if (retryCount < MAX_RETRIES) {
        // Wait 2 seconds then retry
        await new Promise(r => setTimeout(r, 2000));
        return attemptInit();
      }

      if (msgEl) {
        msgEl.textContent = 'Không thể kết nối Supabase. Vui lòng thử lại sau.';
        msgEl.className = 'error';
      }
      showLogin();
    }
  }

  await attemptInit();
}

/* --------------- Toggle password visibility --------------- */
function setupPasswordToggle() {
  const toggle = document.getElementById('togglePwd');
  if (!toggle) return;
  toggle.addEventListener('click', () => {
    const pwd = document.getElementById('password');
    if (!pwd) return;
    pwd.type = pwd.type === 'password' ? 'text' : 'password';
  });
}

/* ---------------- Login handler ---------------- */
function setupLoginHandler() {
  const btn = document.getElementById('login');
  if (!btn) return;

  const submit = async () => {
    const msgEl = document.getElementById('message');
    if (msgEl) {
      msgEl.textContent = '';
      msgEl.className = '';
    }

    if (!client) {
      if (msgEl) {
        msgEl.textContent = 'Supabase đang khởi tạo, vui lòng đợi…';
        msgEl.className = 'error';
      }
      return;
    }

    const emailEl = document.getElementById('email');
    const pwdEl = document.getElementById('password');
    const email = emailEl?.value.trim();
    const password = pwdEl?.value ?? '';

    if (!email || !password) {
      if (msgEl) {
        msgEl.textContent = 'Vui lòng điền đầy đủ thông tin.';
        msgEl.className = 'error';
      }
      return;
    }

    const { error } = await client.auth.signInWithPassword({ email, password });

    if (error) {
      if (msgEl) {
        msgEl.textContent = error.message;
        msgEl.className = 'error';
      }
    } else {
      // onAuthStateChange will handle UI & scheduling
    }
  };

  btn.addEventListener('click', submit);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit();
  });
}

async function showApp() {
  // IMMEDIATELY hide login card BEFORE showing overlay
  // This prevents the brief flash of login screen
  const card = document.getElementById('loginCard');
  if (card) card.style.display = 'none';

  // Show audio activation overlay first (ensures ringtone will work)
  await showAudioActivationOverlay();

  // --- NEW: Security Check (Restricts access to Teacher/Admin/Super Admin) ---
  if (client) {
    const { data: { user } } = await client.auth.getUser();
    if (user) {
      // Fetch user role
      const { data: roleCheck } = await client
        .from('user_roles')
        .select('role')
        .eq('email', user.email)
        .single();

      // Define allowed roles
      const allowed = ['Teacher', 'Admin', 'Super Admin'];

      // If no role found, or role is not in the allowed list
      if (!roleCheck || !allowed.includes(roleCheck.role)) {
        // 1. Sign out quietly in the background
        await client.auth.signOut();

        // 2. Show the fake error screen immediately
        showFake404();

        // 3. Stop the function so the real app never loads
        return;
      }
    }
  }
  // --------------------------------------------------------------------------
  const tableContainer = document.getElementById('mainContent');
  const searchSection = document.getElementById('searchSection');

  // 1. Recover the active view from LocalStorage (defaults to 'search')
  const activeView = localStorage.getItem('activeView') || 'search';

  // 2. Apply visibility based on stored state
  if (activeView === 'list') {
    if (tableContainer) tableContainer.style.display = 'block';
    if (searchSection) searchSection.style.display = 'none';
    loadDashboardData(); // Load data because we are in list view
  } else {
    if (tableContainer) tableContainer.style.display = 'none';
    if (searchSection) searchSection.style.display = 'block';
    refreshTopBadges(); // <--- NEW: Always load badges even in search mode
  }

  // Show connection status indicator
  showStatusIndicator();

  // 3. Start leader election FIRST (before anything else)
  startLeaderHeartbeat();

  // 3.5 Request VBot token with user email (PRIORITY SYSTEM)
  if (client) {
    const { data: { user } } = await client.auth.getUser();
    if (user && user.email && typeof window.requestVBotToken === 'function') {
      const gotToken = window.requestVBotToken(user.email);
      if (!gotToken) {
        console.warn('VBot: Could not get token - user may not receive calls');
      }
    }
  }

  // 4. Always initialize VBot (now isLeaderTab is already set)
  initVBotPlugin();

  // 5. Start keep-alive system to prevent tab from sleeping
  startKeepAlive();

  // 6. Initialize Firebase Push Notifications
  initFirebasePush();

  // Logout button logic (remains the same)
  let btn = document.getElementById('logoutBtn');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'logoutBtn';
    btn.className = 'logout-icon';
    btn.addEventListener('click', async () => {
      if (!client) return;
      await client.auth.signOut();
    });
    btn.innerHTML = '<i class="fa-solid fa-power-off" aria-hidden="true"></i>';
    btn.title = 'Log out';
    btn.setAttribute('aria-label', 'Log out');
    document.body.appendChild(btn);
  }

  // --- CHECK USER ROLE (Admin / Super Admin) ---
  if (client) {
    const { data: { user } } = await client.auth.getUser();
    if (user && user.email) {
      const { data: roleData, error } = await client
        .from('user_roles')
        .select('role')
        .eq('email', user.email)
        .single();

      // Define buttons
      const addBtn = document.getElementById('addBtn');
      const listBtn = document.getElementById('listBtn');
      const grantBtn = document.getElementById('grantBtn');
      const trackingBtn = document.getElementById('trackingBtn');
      const priorityBtn = document.getElementById('priorityBtn');

      // Modified: ONLY Admin & Super Admin can see ALL buttons
      if (roleData && ['Admin', 'Super Admin'].includes(roleData.role)) {
        if (addBtn) addBtn.style.display = 'grid';
        if (listBtn) listBtn.style.display = 'grid';
        if (grantBtn) grantBtn.style.display = 'grid';
        if (trackingBtn) trackingBtn.style.display = 'grid';
        if (priorityBtn) priorityBtn.style.display = 'grid';
      }
    }
  }

}

function showLogin() {
  // Stop keep-alive when logged out
  stopKeepAlive();

  const card = document.getElementById('loginCard');
  if (card) card.style.display = 'block';

  // --- NEW: HIDE TRACKING BUTTON ---
  const trackingBtn = document.getElementById('trackingBtn');
  if (trackingBtn) {
    trackingBtn.style.display = 'none';
  }
  // ---------------------------------

  // Hide the table container
  const tableContainer = document.getElementById('mainContent');
  if (tableContainer) tableContainer.style.display = 'none';

  // Hide the search section
  const searchSection = document.getElementById('searchSection');
  if (searchSection) searchSection.style.display = 'none';

  const btn = document.getElementById('logoutBtn');
  if (btn) btn.remove();

  const email = document.getElementById('email');
  if (email) email.focus();
}

/* ---------------- Modal Logic ---------------- */
function setupModal() {
  const addBtn = document.getElementById('addBtn');
  const modal = document.getElementById('taskModal');
  const closeBtn = document.getElementById('closeModal');

  if (!addBtn || !modal) return;

  // Open modal (SECURED)
  addBtn.addEventListener('click', () => {
    showAdminSecurityInput(() => {
      // Original Logic runs only after success
      const nameDisplay = document.getElementById('userNameDisplay');
      const input = document.getElementById('taskTitle');

      if (nameDisplay) nameDisplay.innerHTML = '<i class="fa-regular fa-user"></i> <span>Select a student...</span>';
      if (input) input.value = '';

      modal.classList.add('active');
    });
  });

  // Close modal (Cancel button)
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      modal.classList.remove('active');
    });
  }

  // Close if clicking outside the white box
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('active');
    }
  });
}

/* ---------------- Autocomplete Logic ---------------- */
function setupAutocomplete() {
  const input = document.getElementById('taskTitle');
  const list = document.getElementById('suggestionList');
  let debounceTimer;

  if (!input || !list) return;

  // 1. Listen for typing
  input.addEventListener('input', (e) => {
    const value = e.target.value.trim();

    // Clear previous timer (this is the debounce magic)
    clearTimeout(debounceTimer);

    // Hide if less than 4 letters
    if (value.length < 4) {
      list.classList.remove('active');
      return;
    }

    // Set new timer for 1 second (1000ms)
    debounceTimer = setTimeout(async () => {
      if (!client) return;

      // 1. Fetch potential students from user_roles
      const { data: candidates, error } = await client
        .from('user_roles')
        .select('email')
        .ilike('email', `%${value}%`)
        .limit(10); // Fetch more initially to allow for filtering

      if (error || !candidates || candidates.length === 0) {
        list.classList.remove('active');
        return;
      }

      // 2. Check which emails already exist in phone_numbers table
      const emailsToCheck = candidates.map(c => c.email);
      const { data: existingRows } = await client
        .from('phone_numbers')
        .select('student_email')
        .in('student_email', emailsToCheck);

      // Create a list of emails that are already taken
      const existingSet = new Set((existingRows || []).map(r => r.student_email));

      // 3. Filter out the existing ones
      const filteredData = candidates.filter(c => !existingSet.has(c.email));

      if (filteredData.length === 0) {
        list.classList.remove('active');
        return;
      }

      // Render items
      list.innerHTML = '';
      filteredData.forEach(item => {
        const li = document.createElement('li');
        li.textContent = item.email;

        // Handle click on suggestion
        li.addEventListener('click', async () => {
          input.value = item.email;
          list.classList.remove('active');

          // 1. Get the display element
          const nameDisplay = document.getElementById('userNameDisplay');
          if (nameDisplay) nameDisplay.textContent = "Loading...";

          // 2. Fetch full_name from 'user_roles' table
          const { data, error } = await client
            .from('user_roles')
            .select('full_name')
            .eq('email', item.email)
            .single();

          // 3. Display the result
          if (nameDisplay) {
            if (data && data.full_name) {
              nameDisplay.textContent = data.full_name;
            } else {
              nameDisplay.textContent = "Name not found";
            }
          }
        });

        list.appendChild(li);
      });

      list.classList.add('active');
    }, 1000); // 1 second wait
  });

  // 2. Hide list if clicking outside
  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !list.contains(e.target)) {
      list.classList.remove('active');
    }
  });
}

/* ---------------- Phone Modal Logic ---------------- */
function setupPhoneModal() {
  const openBtn = document.getElementById('openPhoneModalBtn');
  const phoneModal = document.getElementById('phoneModal');
  const cancelBtn = document.getElementById('cancelPhone');
  const saveBtn = document.getElementById('savePhone');
  const listDisplay = document.getElementById('phoneListDisplay');

  // Open the phone popup
  if (openBtn) {
    openBtn.addEventListener('click', (e) => {
      e.preventDefault();

      // 1. Get the dropdown element
      const select = document.getElementById('phoneType');

      // 2. See what is already in the list (look for existing badges)
      const usedTypes = Array.from(listDisplay.querySelectorAll('.phone-type-badge'))
        .map(el => el.textContent.trim());

      // 3. Hide options that are already used
      let firstValidOption = null;
      Array.from(select.options).forEach(opt => {
        if (usedTypes.includes(opt.value)) {
          opt.style.display = 'none'; // Hide duplicate
          opt.disabled = true;
        } else {
          opt.style.display = 'block'; // Show available
          opt.disabled = false;
          if (!firstValidOption) firstValidOption = opt.value;
        }
      });

      // 4. Check if anything is left to add
      if (!firstValidOption) {
        alert("Bạn đã thêm đầy đủ tất cả các loại số điện thoại!");
        return;
      }

      // 5. Select the first available option and open modal
      select.value = firstValidOption;
      document.getElementById('phoneNumber').value = '';
      phoneModal.classList.add('active');
    });
  }

  // Close the phone popup
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      phoneModal.classList.remove('active');
    });
  }

  // Save and Display
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const type = document.getElementById('phoneType').value;
      const number = document.getElementById('phoneNumber').value.trim();

      if (!number) return; // Don't save empty numbers

      // Create HTML for the new item
      const item = document.createElement('div');
      item.className = 'phone-item-card'; // Use new card class
      item.innerHTML = `
        <div style="display:flex; align-items:center;">
          <span class="phone-type-badge">${type}</span>
          <span class="phone-number-text">${number}</span>
        </div>
        <i class="fa-solid fa-trash-can" style="cursor:pointer; color:#ef4444;" onclick="this.parentElement.remove()"></i>
      `;

      listDisplay.appendChild(item);
      phoneModal.classList.remove('active');
    });
  }
}


/* ---------------- Grant Modal Logic with Autocomplete ---------------- */
function setupGrantModal() {
  const grantBtn = document.getElementById('grantBtn');
  const modal = document.getElementById('grantModal');
  const closeBtn = document.getElementById('closeGrantModal');
  const submitBtn = document.getElementById('submitGrantBtn');
  const input = document.getElementById('grantEmailInput');

  if (!grantBtn || !modal || !input) return;

  // --- 1. Inject Suggestion List DOM ---
  // We dynamically add the UL if it doesn't exist yet
  let grantList = document.getElementById('grantSuggestionList');
  if (!grantList) {
    grantList = document.createElement('ul');
    grantList.id = 'grantSuggestionList';
    grantList.className = 'suggestions-list'; // Reusing your existing CSS class
    input.parentNode.appendChild(grantList);
  }

  // --- 2. Autocomplete Logic ---
  let debounceTimer;

  input.addEventListener('input', (e) => {
    const value = e.target.value.trim();
    clearTimeout(debounceTimer);

    // Hide if less than 4 chars
    if (value.length < 4) {
      grantList.classList.remove('active');
      return;
    }

    debounceTimer = setTimeout(async () => {
      if (!client) return;

      // Query 'phone_numbers' table for student_email
      const { data, error } = await client
        .from('phone_numbers')
        .select('student_email')
        .ilike('student_email', `%${value}%`)
        .limit(6);

      if (error || !data || data.length === 0) {
        grantList.classList.remove('active');
        return;
      }

      // Render suggestions
      grantList.innerHTML = '';
      data.forEach(item => {
        const li = document.createElement('li');
        // Use a generic icon or specific one if you prefer
        li.innerHTML = `<i class="fa-solid fa-user-graduate" style="color:#ccc; margin-right:8px;"></i> ${item.student_email}`;

        li.addEventListener('click', () => {
          input.value = item.student_email;
          grantList.classList.remove('active');
        });
        grantList.appendChild(li);
      });

      grantList.classList.add('active');
    }, 500); // 500ms delay
  });

  // Hide list when clicking outside
  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !grantList.contains(e.target)) {
      grantList.classList.remove('active');
    }
  });


  // --- 3. Open/Close Logic (SECURED) ---
  grantBtn.addEventListener('click', () => {
    showAdminSecurityInput(() => {
      input.value = '';
      grantList.classList.remove('active');
      modal.classList.add('active');
      setTimeout(() => input.focus(), 100);
    });
  });

  const closeModal = () => modal.classList.remove('active');
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });


  // --- 4. Submit Logic (Connect to Backend) ---
  if (submitBtn) {
    // Clone button to remove old listeners
    const newSubmitBtn = submitBtn.cloneNode(true);
    submitBtn.parentNode.replaceChild(newSubmitBtn, submitBtn);

    newSubmitBtn.addEventListener('click', async () => {
      const email = input.value.trim();
      if (!email) return alert("Vui lòng nhập email.");

      // Check Auth
      if (!client) return;
      const { data: { session } } = await client.auth.getSession();
      if (!session) return alert("Vui lòng đăng nhập lại.");

      // --- NEW: Verify Role Before Submitting ---
      const { data: roleCheck } = await client
        .from('user_roles')
        .select('role')
        .eq('email', session.user.email)
        .single();

      if (!roleCheck || (roleCheck.role !== 'Admin' && roleCheck.role !== 'Super Admin')) {
        alert("Chỉ Admin mới có quyền cấp truy cập.");
        return;
      }
      // ------------------------------------------

      // UI Loading State
      const originalText = newSubmitBtn.textContent;
      newSubmitBtn.textContent = "Đang xử lý...";
      newSubmitBtn.disabled = true;

      try {
        const res = await fetch('/.netlify/functions/grant-access', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            granted_email: email,
            access_token: session.access_token
          })
        });

        const result = await res.json();

        if (res.ok) {
          alert(`Đã cấp quyền thành công cho: ${email}`);
          closeModal();
        } else {
          throw new Error(result.error || "Lỗi không xác định");
        }

      } catch (err) {
        console.error(err);
        alert("Thất bại: " + err.message);
      } finally {
        newSubmitBtn.textContent = originalText;
        newSubmitBtn.disabled = false;
      }
    });
  }
}

/* ---------------- Save Handler ---------------- */
function setupSaveHandler() {
  const saveBtn = document.getElementById('saveTask');

  if (!saveBtn) return;

  saveBtn.addEventListener('click', async () => {
    // --- 1. Gather Data ---

    // Get Email
    const emailInput = document.getElementById('taskTitle');
    const email = emailInput?.value.trim();

    // Get Name (Handle the <i> icon and <span> structure)
    const nameDisplay = document.getElementById('userNameDisplay');
    let name = "Unknown";
    if (nameDisplay) {
      // If it has a span, use that, otherwise use full text
      const span = nameDisplay.querySelector('span');
      name = span ? span.textContent : nameDisplay.textContent;
    }

    if (!email || email.length < 3) {
      alert("Please select a valid student email first.");
      return;
    }

    // Get Phone Numbers from the visual list
    const phoneItems = document.querySelectorAll('#phoneListDisplay .phone-item-card');
    const phoneDataMap = {};

    phoneItems.forEach(card => {
      // We grab the text from the two spans we created: badge and number text
      const type = card.querySelector('.phone-type-badge').textContent.trim();
      const number = card.querySelector('.phone-number-text').textContent.trim();

      if (type && number) {
        phoneDataMap[type] = number;
      }
    });

    // --- 2. Check Auth ---
    if (!client) return;
    const { data: { session } } = await client.auth.getSession();
    if (!session) {
      alert("You must be logged in to save data.");
      return;
    }

    // --- 3. UI State (Loading) ---
    const originalText = saveBtn.textContent;
    saveBtn.textContent = "Saving...";
    saveBtn.disabled = true;

    try {
      // --- 4. Send to Netlify Function ---
      const response = await fetch('/.netlify/functions/save-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_email: email,
          student_name: name,
          phone_data: phoneDataMap,
          access_token: session.access_token
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to save');
      }

      // --- 5. Success ---
      alert('Phone numbers saved successfully!');

      // Close modal
      const modal = document.getElementById('taskModal');
      if (modal) modal.classList.remove('active');

      // Clear the phone list for next time (Optional)
      const listDisplay = document.getElementById('phoneListDisplay');
      if (listDisplay) listDisplay.innerHTML = '';
      if (emailInput) emailInput.value = '';

    } catch (err) {
      console.error(err);
      alert('Error saving: ' + err.message);
    } finally {
      // Reset button
      saveBtn.textContent = originalText;
      saveBtn.disabled = false;
    }
  });
}


/* ---------------- Boot ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  // Wrap initSupabase in try-catch for safety
  try {
    initSupabase();
  } catch (e) {
    console.error('Failed to initialize Supabase:', e);
    showAppErrorNotification('Không thể khởi tạo kết nối. Vui lòng tải lại trang.', true);
  }

  // NEW: Monitor network status with enhanced recovery
  window.addEventListener('online', () => {
    console.log('Network: Back online');
    const warning = document.getElementById('offlineWarning');
    if (warning) warning.remove();

    // Reconnect VBot if needed
    if (window.VBotWebCall && window.VBotWebCall.client) {
      window.VBotWebCall.client.connect();
    }

    // Also trigger VBot reconnect system
    if (typeof window.triggerVBotReconnect === 'function') {
      setTimeout(() => {
        window.triggerVBotReconnect();
      }, 1000);
    }

    // Re-check if VBot needs to be reinitialized
    if (!window.vbotReady && !vbotInitialized) {
      console.log('Network back - reinitializing VBot...');
      setTimeout(() => {
        initVBotPlugin();
      }, 2000);
    }
  });

  window.addEventListener('offline', () => {
    console.log('Network: Offline');
    if (!document.getElementById('offlineWarning')) {
      const warning = document.createElement('div');
      warning.id = 'offlineWarning';
      warning.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        background: #ef4444;
        color: white;
        padding: 10px;
        text-align: center;
        font-weight: 600;
        z-index: 99999;
      `;
      warning.innerHTML = '<i class="fa-solid fa-wifi-slash"></i> Mất kết nối internet';
      document.body.appendChild(warning);
    }
  });

  setupPasswordToggle();
  setupLoginHandler();
  setupModal();
  setupAutocomplete();
  setupPhoneModal();
  setupGrantModal();
  setupSaveHandler();
  setupMainSearch(); // <-- Add this line

  // New Logic: Toggle List View (Exclusive Mode)
  const listBtn = document.getElementById('listBtn');
  const mainContent = document.getElementById('mainContent');
  const searchSection = document.getElementById('searchSection');

  if (listBtn && mainContent) {
    listBtn.addEventListener('click', () => {
      showAdminSecurityInput(() => {
        // Check current state of the list
        const isHidden = (mainContent.style.display === 'none' || mainContent.style.display === '');

        if (isHidden) {
          // Show List, Hide Search
          mainContent.style.display = 'block';
          if (searchSection) searchSection.style.display = 'none';

          // Save state to LocalStorage
          localStorage.setItem('activeView', 'list');
          loadDashboardData();
        } else {
          // Hide List, Show Search
          mainContent.style.display = 'none';
          if (searchSection) searchSection.style.display = 'block';

          // Save state to LocalStorage
          localStorage.setItem('activeView', 'search');
        }
      });
    });
  }
});

/* ---------------- Calculate & Update Dashboard Stats ---------------- */
/* ---------------- Calculate & Update Dashboard Stats ---------------- */
function updateDashboardStats(data) {
  if (!data) return;

  // 1. Total emails (Total records)
  const total = data.length;

  // 2. Missing "Mẹ" (sdt_me is null or empty)
  const noMom = data.filter(r => !r.sdt_me || r.sdt_me.trim() === '').length;

  // 3. Missing "Cha" (sdt_cha is null or empty)
  const noDad = data.filter(r => !r.sdt_cha || r.sdt_cha.trim() === '').length;

  // 4. Missing "HV" (Student has no phone number) - NEW LOGIC
  const noStudentPhone = data.filter(r => !r.sdt_hv || r.sdt_hv.trim() === '').length;

  // 5. Only Student (Has sdt_hv, but NO parents/relatives)
  const onlyStudent = data.filter(r => {
    const hasStudent = r.sdt_hv && r.sdt_hv.trim() !== '';
    const hasCha = r.sdt_cha && r.sdt_cha.trim() !== '';
    const hasMe = r.sdt_me && r.sdt_me.trim() !== '';
    const hasChi = r.sdt_chi && r.sdt_chi.trim() !== '';
    const hasBa = r.sdt_ba && r.sdt_ba.trim() !== '';
    const hasOng = r.sdt_ong && r.sdt_ong.trim() !== '';

    // Only student phone exists, all others are empty
    return hasStudent && !hasCha && !hasMe && !hasChi && !hasBa && !hasOng;
  }).length;

  // Update DOM
  const elTotal = document.getElementById('statTotal');
  const elOnly = document.getElementById('statOnlyStudent');
  const elNoDad = document.getElementById('statNoDad');
  const elNoMom = document.getElementById('statNoMom');
  const elNoStudent = document.getElementById('statNoStudentPhone'); // New Element

  if (elTotal) elTotal.textContent = total;
  if (elOnly) elOnly.textContent = onlyStudent;
  if (elNoDad) elNoDad.textContent = noDad;
  if (elNoMom) elNoMom.textContent = noMom;
  if (elNoStudent) elNoStudent.textContent = noStudentPhone; // New Update
}

/* ---------------- Data Loader ---------------- */
async function loadDashboardData() {
  if (!client) return;

  // --- NEW: Update counts before showing table ---
  await fetchCallCounts();

  const tbody = document.querySelector('#phoneTable tbody');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Loading data...</td></tr>';

  const { data, error } = await client
    .from('phone_numbers')
    .select('*')
    .order('created_at', { ascending: false });

  // NEW: Check missing students immediately after data loads
  if (!error && data) {
    updateDashboardStats(data); // <--- Added this line
    checkMissingData(data);
  }

  if (error) {

    console.error('Error fetching data:', error);
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:red;">Error loading data</td></tr>';
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">No data found</td></tr>';
    return;
  }

  tbody.innerHTML = '';

  // 1. Helper function to create badge - NOW ACCEPTS studentEmail
  const makeSecureBadge = (rowId, hasVal, label, badgeClass, studentName, studentEmail) => {
    if (!hasVal) return '<span style="color:#ccc;">—</span>';

    // Safely access counts and bonuses
    const actualCalls = (globalCallCounts.counts && globalCallCounts.counts[hasVal]) || 0;

    // Use the passed email instead of 'row' (which caused the error)
    const bonusCalls = (globalCallCounts.bonuses && globalCallCounts.bonuses[studentEmail]) || 0;

    const limit = 2 + bonusCalls;

    if (actualCalls >= limit) {
      // Return a grayed-out button
      return `
        <button 
          class="badge" 
          style="background:#f3f4f6; color:#9ca3af; cursor:not-allowed; border:none; display:flex; align-items:center; gap:6px;"
          title="Đã gọi ${actualCalls} lần">
          <i class="fa-solid fa-phone-slash"></i> Đã gọi (${actualCalls})
        </button>
      `;
    }

    // Normal button
    return `
      <button 
        class="badge ${badgeClass}" 
        style="cursor:pointer; border:none; display:flex; align-items:center; gap:6px;"
        data-row-id="${rowId}"
        data-label="${label}"
        data-student-name="${studentName || 'Unknown'}">
        <i class="fa-solid fa-phone"></i> Gọi ${label}
      </button>
    `;
  };

  // 2. Render Rows
  data.forEach(row => {
    const sName = row.student_name || 'Unknown';
    const sEmail = row.student_email || ''; // Grab email here

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${sName}</strong><br><span class="email-sub">${sEmail}</span></td>
      <td>${makeSecureBadge(row.id, row.sdt_hv, 'HV', 'badge-hv', sName, sEmail)}</td>
      <td>${makeSecureBadge(row.id, row.sdt_cha, 'Cha', 'badge-cha', sName, sEmail)}</td>
      <td>${makeSecureBadge(row.id, row.sdt_me, 'Mẹ', 'badge-me', sName, sEmail)}</td>
      <td>${makeSecureBadge(row.id, row.sdt_chi, 'Chị', 'badge-chi', sName, sEmail)}</td>
      <td>${makeSecureBadge(row.id, row.sdt_ba, 'Bà', 'badge-ba', sName, sEmail)}</td>
      <td>${makeSecureBadge(row.id, row.sdt_ong, 'Ông', 'badge-ong', sName, sEmail)}</td>
      <td>
        <div style="display:flex; gap:8px;">
          <button class="edit-btn" data-json='${JSON.stringify(row)}' style="background:#e0f2fe; color:#0284c7; border:none; width:32px; height:32px; border-radius:8px; cursor:pointer;"><i class="fa-solid fa-pen"></i></button>
          <button class="delete-btn" data-id="${row.id}" style="background:#fee2e2; color:#dc2626; border:none; width:32px; height:32px; border-radius:8px; cursor:pointer;"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Add click handlers for all call badges
  tbody.querySelectorAll('.badge[data-row-id]').forEach(btn => {
    btn.addEventListener('click', function () {
      const rowId = this.getAttribute('data-row-id');
      const label = this.getAttribute('data-label');
      const name = this.getAttribute('data-student-name');

      // CALL THE NEW CONFIRMATION POPUP
      showCallConfirmation(rowId, label, name);
    });
  });




  // --- ADDED HANDLERS FOR EDIT & DELETE ---

  // 1. Delete Handler
  tbody.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.currentTarget.getAttribute('data-id');
      if (confirm('Bạn có chắc chắn muốn xóa học viên này khỏi danh sách?')) {
        await deleteStudentTask(id);
      }
    });
  });

  // 2. Edit Handler
  tbody.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const rowData = JSON.parse(e.currentTarget.getAttribute('data-json'));
      openEditModal(rowData);
    });
  });


}


// NEW: Track call with retry logic
async function trackCallWithRetry(trackData, maxRetries) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch('/.netlify/functions/track-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(trackData)
      });

      if (res.ok) {
        console.log('Call tracking succeeded');
        return true;
      }
    } catch (err) {
      console.warn(`Tracking attempt ${attempt} failed:`, err);
    }

    // Wait before retry (exponential backoff)
    if (attempt < maxRetries) {
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }

  // Store failed tracking locally for later retry
  const failedTracks = JSON.parse(localStorage.getItem('failedCallTracks') || '[]');
  failedTracks.push({ ...trackData, timestamp: Date.now() });
  localStorage.setItem('failedCallTracks', JSON.stringify(failedTracks.slice(-50))); // Keep last 50
  console.warn('Call tracking stored locally for retry');
  return false;
}


async function secureCall(rowId, type) {
  try {
    document.body.style.cursor = 'wait';

    // NEW: Check VBot connection first
    if (!window.vbotReady || !window.VBotWebCall || !window.VBotWebCall.client) {
      document.body.style.cursor = 'default';
      alert('Hệ thống gọi chưa sẵn sàng. Vui lòng tải lại trang (F5).');
      return;
    }

    // 1. Fetch phone number
    const response = await fetch('/.netlify/functions/get-phone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: rowId, column: type })
    });

    const result = await response.json();
    document.body.style.cursor = 'default';

    if (!response.ok || !result.phone) {
      alert('Không thể lấy số điện thoại. Vui lòng thử lại.');
      return;
    }

    // NEW: Validate phone number format
    const cleanedPhone = result.phone.replace(/\D/g, '');
    if (cleanedPhone.length < 9 || cleanedPhone.length > 11) {
      alert('Số điện thoại không hợp lệ: ' + result.phone);
      return;
    }

    // NEW: Validate user session before making call
    if (!client) {
      alert('Phiên làm việc hết hạn. Vui lòng đăng nhập lại.');
      showLogin();
      return;
    }

    const { data: { session } } = await client.auth.getSession();
    if (!session) {
      alert('Phiên làm việc hết hạn. Vui lòng đăng nhập lại.');
      showLogin();
      return;
    }

    // 2. Check if VBot is loaded
    if (typeof makeVBotCall !== 'function') {
      alert('Lỗi: Hàm gọi chưa được tải. Vui lòng tải lại trang (F5).');
      return;
    }

    // 3. Build a display name AND prepare tracking data
    let displayName = result.phone;
    let studentEmail = 'unknown';

    try {
      // Updated select to fetch student_email as well
      const { data: row, error } = await client
        .from('phone_numbers')
        .select('student_name, student_email')
        .eq('id', rowId)
        .single();

      if (!error && row) {
        if (row.student_email) studentEmail = row.student_email;
        if (row.student_name) {
          const prefixMap = { 'HV': '', 'Cha': '(Cha) ', 'Mẹ': '(Mẹ) ', 'Chị': '(Chị) ', 'Ông': '(Ông) ', 'Bà': '(Bà) ' };
          const prefix = prefixMap[type] ?? '';
          displayName = (prefix + row.student_name).trim();
        }
      }
    } catch (e) {
      console.warn('Error fetching student details:', e);
    }

    // --- TRACKING START ---
    try {
      // Get current logged-in teacher/admin
      const { data: { user } } = await client.auth.getUser();
      const teacherEmail = user ? user.email : 'unknown';

      // NEW: Track call with retry logic
      const trackData = {
        teacher_email: teacherEmail,
        student_email: studentEmail,
        number_called: result.phone
      };

      trackCallWithRetry(trackData, 3); // 3 retry attempts

    } catch (trackErr) {
      console.warn('Tracking setup failed', trackErr);
    }
    // --- TRACKING END ---
    // --- TRACKING END ---

    // 4. Make the call (pass displayName)
    await makeVBotCall(result.phone, type, displayName);


  } catch (err) {
    document.body.style.cursor = 'default';
    console.error(err);
    alert('Error connecting call: ' + err.message);
  }
}

// Resolve incoming caller number to a display name using table "phone_numbers"
async function resolveIncomingName(rawNumber) {
  if (!client || !rawNumber) return null; // 'client' here is your Supabase client

  try {
    const { data, error } = await client
      .from('phone_numbers')
      .select('student_name,sdt_hv,sdt_cha,sdt_me,sdt_chi,sdt_ba,sdt_ong')
      .or(
        [
          `sdt_hv.eq.${rawNumber}`,
          `sdt_cha.eq.${rawNumber}`,
          `sdt_me.eq.${rawNumber}`,
          `sdt_chi.eq.${rawNumber}`,
          `sdt_ba.eq.${rawNumber}`,
          `sdt_ong.eq.${rawNumber}`
        ].join(',')
      )
      .maybeSingle();

    if (error || !data) return null;

    // Determine which column matched and build the label
    const map = [
      ['sdt_hv', ''],
      ['sdt_cha', '(Cha) '],
      ['sdt_me', '(Mẹ) '],
      ['sdt_chi', '(Chị) '],
      ['sdt_ba', '(Bà) '],
      ['sdt_ong', '(Ông) ']
    ];

    for (const [col, prefix] of map) {
      if (data[col] && String(data[col]) === String(rawNumber)) {
        return (prefix + (data.student_name || '')).trim();
      }
    }

    return null;
  } catch {
    return null;
  }
}



/* ============================================================
   CALL UI FUNCTIONS
   ============================================================ */

function createCallUI() {
  if (!document.getElementById('callModalStyles')) {
    const s = document.createElement('style');
    s.id = 'callModalStyles';
    s.textContent = `
      /* ========== PREMIUM CALL MODAL V2 ========== */
      
      /* Card - Wider with Side-by-Side Layout */
      .call-card {
        width: 92%;
        max-width: 420px;
        margin: 0 auto;
        padding: 24px;
        border-radius: 24px;
        background: #ffffff;
        box-shadow: 
          0 25px 60px -15px rgba(0,0,0,0.3),
          0 0 0 1px rgba(0,0,0,0.05);
        display: grid;
        grid-template-columns: 90px 1fr;
        grid-template-rows: auto auto auto auto;
        column-gap: 20px;
        row-gap: 2px;
        align-items: center;
        position: relative;
        overflow: hidden;
      }
      
      /* Subtle top accent line */
      .call-card::before {
        content: "";
        position: absolute;
        top: 0; left: 24px; right: 24px;
        height: 3px;
        border-radius: 0 0 3px 3px;
        background: linear-gradient(90deg, #6366f1, #a855f7, #ec4899);
      }
      .call-card.incoming::before {
        background: linear-gradient(90deg, #22c55e, #10b981, #14b8a6);
      }

      /* Avatar - Left Column, Spans All Rows */
      .call-ava-wrap {
        grid-column: 1;
        grid-row: 1 / 5;
        position: relative;
        width: 80px;
        height: 80px;
        justify-self: center;
        align-self: center;
      }

      .call-ava {
        width: 80px;
        height: 80px;
        border-radius: 50%;
        background: linear-gradient(145deg, #6366f1 0%, #8b5cf6 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        color: #fff;
        font-size: 32px;
        box-shadow: 0 8px 24px rgba(99,102,241,0.35);
        position: relative;
        z-index: 2;
      }

      /* Single Pulse Ring */
      .pulse-ring {
        position: absolute;
        inset: -8px;
        border-radius: 50%;
        border: 2px solid rgba(99,102,241,0.3);
        animation: pulse-ring 1.8s ease-out infinite;
      }
      @keyframes pulse-ring {
        0% { transform: scale(0.9); opacity: 1; }
        100% { transform: scale(1.35); opacity: 0; }
      }

      /* Text Elements - Right Column */
      .call-title {
        grid-column: 2;
        margin: 0;
        font-size: 0.85rem;
        font-weight: 600;
        color: #64748b;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .call-number {
        grid-column: 2;
        margin: 0;
        font-size: 1.4rem;
        font-weight: 700;
        color: #0f172a;
        line-height: 1.3;
      }

      .call-sub {
        grid-column: 2;
        margin: 4px 0 0;
        font-size: 0.9rem;
        color: #94a3b8;
        font-weight: 500;
      }

      .call-timer {
        grid-column: 2;
        margin: 4px 0 0;
        font-size: 1.5rem;
        font-weight: 700;
        color: #0f172a;
        font-variant-numeric: tabular-nums;
      }

      /* Controls Row - Full Width */
      .call-controls {
        grid-column: 1 / -1;
        display: flex;
        justify-content: center;
        gap: 12px;
        margin-top: 20px;
        padding-top: 16px;
        border-top: 1px solid #f1f5f9;
      }

      /* Mute Button */
      .btn-circle {
        width: 50px;
        height: 50px;
        border-radius: 50%;
        border: none;
        cursor: pointer;
        background: #f1f5f9;
        color: #475569;
        font-size: 18px;
        transition: all 0.2s ease;
      }
      .btn-circle:hover {
        background: #e2e8f0;
        transform: scale(1.05);
      }
      .btn-circle:active {
        transform: scale(0.95);
      }

      /* End Call Button */
      .btn-end {
        flex: 1;
        max-width: 200px;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        justify-content: center;
        padding: 14px 24px;
        border-radius: 50px;
        border: none;
        cursor: pointer;
        font-weight: 600;
        font-size: 0.95rem;
        color: #fff;
        background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
        box-shadow: 0 4px 14px rgba(239,68,68,0.4);
        transition: all 0.2s ease;
      }
      .btn-end:hover {
        transform: translateY(-1px);
        box-shadow: 0 6px 20px rgba(239,68,68,0.5);
      }
      .btn-end:active {
        transform: scale(0.98);
      }

      /* ===== INCOMING CALL ===== */
      .call-card.incoming .call-ava {
        background: linear-gradient(145deg, #22c55e 0%, #16a34a 100%);
        box-shadow: 0 8px 24px rgba(34,197,94,0.35);
      }
.call-card.incoming .pulse-ring {
        border-color: rgba(34,197,94,0.3);
      }

      /* Hide mute/end controls for incoming (before answer) */
      .call-card.incoming .call-controls {
        display: none;
      }

      /* Incoming Action Buttons */
      .incoming-actions {
        grid-column: 1 / -1;
        display: flex;
        gap: 12px;
        margin-top: 20px;
        padding-top: 16px;
        border-top: 1px solid #f1f5f9;
      }

      .btn-accept, .btn-reject {
        flex: 1;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        justify-content: center;
        padding: 14px 16px;
        border-radius: 14px;
        border: none;
        cursor: pointer;
        font-weight: 600;
        font-size: 0.95rem;
        color: #fff;
        transition: all 0.2s ease;
      }

      .btn-accept {
        background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
        box-shadow: 0 4px 14px rgba(34,197,94,0.3);
      }
      .btn-accept:hover {
        transform: translateY(-1px);
        box-shadow: 0 6px 18px rgba(34,197,94,0.4);
      }

      .btn-reject {
        background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
        box-shadow: 0 4px 14px rgba(239,68,68,0.3);
      }
      .btn-reject:hover {
        transform: translateY(-1px);
        box-shadow: 0 6px 18px rgba(239,68,68,0.4);
      }

      .btn-accept:active, .btn-reject:active {
        transform: scale(0.97);
      }

      /* ===== OUTGOING CALL ===== */
      .call-card.is-outgoing .call-ava-wrap::after {
        content: "";
        position: absolute;
        inset: -10px;
        border-radius: 50%;
        border: 2.5px solid transparent;
        border-top-color: #a78bfa;
        border-right-color: #6366f1;
        animation: spinner 0.9s linear infinite;
        z-index: 1;
      }
      @keyframes spinner { to { transform: rotate(360deg); } }

      /* Animated Dots */
      .call-sub .typing {
        display: inline-flex;
        gap: 4px;
        margin-left: 4px;
        vertical-align: middle;
      }
      .call-sub .typing span {
        width: 5px;
        height: 5px;
        border-radius: 50%;
        background: #94a3b8;
        animation: dot-pulse 1.2s ease-in-out infinite;
      }
      .call-sub .typing span:nth-child(2) { animation-delay: 0.15s; }
      .call-sub .typing span:nth-child(3) { animation-delay: 0.3s; }

      @keyframes dot-pulse {
        0%, 60%, 100% { opacity: 0.4; transform: scale(1); }
        30% { opacity: 1; transform: scale(1.2); }
      }

      /* ===== MOBILE ===== */
      @media (max-width: 400px) {
        .call-card {
          grid-template-columns: 70px 1fr;
          padding: 20px;
          column-gap: 14px;
        }
        .call-ava-wrap, .call-ava {
          width: 70px;
          height: 70px;
        }
        .call-ava { font-size: 26px; }
        .call-number { font-size: 1.2rem; }
        .btn-accept, .btn-reject { padding: 12px 14px; font-size: 0.9rem; }
      }
    `;

    document.head.appendChild(s);
  }

  if (document.getElementById('callModal')) return;

  const callModal = document.createElement('div');
  callModal.id = 'callModal';
  callModal.className = 'modal-overlay';
  callModal.style.zIndex = '3000';
  callModal.innerHTML = `
    <div class="call-card">
      <div class="call-ava-wrap">
        <div class="pulse-ring"></div>
        <div class="call-ava"><i class="fa-solid fa-phone"></i></div>
      </div>

      <p id="callTitle" class="call-title">Đang gọi</p>
      <p id="callNumber" class="call-number">---</p>
      <p id="callStatus" class="call-sub">Đang kết nối...</p>
      <p id="callDuration" class="call-timer" style="display:none;">00:00</p>

      <div class="call-controls">
        <button id="muteBtn" class="btn-circle" title="Tắt mic" onclick="toggleMute()">
          <i class="fa-solid fa-microphone"></i>
        </button>
<button id="endCallBtn" class="btn-end" onclick="handleEndCallClick()">
          <i class="fa-solid fa-phone-slash"></i> Kết thúc
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(callModal);
}


function showCallUI(displayText, type) {
  createCallUI();
  const modal = document.getElementById('callModal');

  const card = modal?.querySelector('.call-card');
  if (card) {
    card.classList.remove('incoming');
    card.classList.add('is-outgoing');
  }

  // Update texts
  document.getElementById('callNumber').textContent = displayText || '---';
  document.getElementById('callTitle').textContent = 'CUỘC GỌI ĐI';
  const statusEl = document.getElementById('callStatus');
  if (statusEl) statusEl.innerHTML = 'Đang kết nối<span class="typing"><span></span><span></span><span></span></span>';

  // Reset UI
  document.getElementById('callDuration').style.display = 'none';
  document.getElementById('callStatus').style.display = 'block';

  // Show controls for outgoing calls
  const controls = document.querySelector('.call-controls');
  if (controls) controls.style.display = 'flex';
  const endBtn = document.getElementById('endCallBtn');
  if (endBtn) endBtn.style.display = 'inline-flex';
  const actions = document.getElementById('incomingActions');
  if (actions) actions.remove();

  if (modal) modal.classList.add('active');
}



function showIncomingCallUI(phoneNumber) {
  createCallUI();
  const modal = document.getElementById('callModal');

  const card = modal?.querySelector('.call-card');
  if (card) {
    card.classList.remove('is-outgoing');
    card.classList.add('incoming');
  }

  // Header texts
  document.getElementById('callNumber').textContent = phoneNumber || "Unknown";
  document.getElementById('callTitle').textContent = 'CUỘC GỌI ĐẾN';

  // Animated dots while ringing
  const st = document.getElementById('callStatus');
  if (st) st.innerHTML = 'Đang đổ chuông<span class="typing"><span></span><span></span><span></span></span>';

  // Hide the controls until answered
  const controls = document.querySelector('.call-controls');
  if (controls) controls.style.display = 'none';

  // Remove any previous incoming buttons
  const oldActions = document.getElementById('incomingActions');
  if (oldActions) oldActions.remove();

  const actionContainer = document.createElement('div');
  actionContainer.id = 'incomingActions';
  actionContainer.className = 'incoming-actions';


// Answer (green gradient)
  const answerBtn = document.createElement('button');
  answerBtn.className = 'btn-accept';
  answerBtn.innerHTML = '<i class="fa-solid fa-phone"></i> <span>Trả lời</span>';
  
  // Prevent double-click on answer button
  let answerInProgress = false;
  
  answerBtn.onclick = async () => {
    // Debounce - prevent multiple clicks
    if (answerInProgress) {
      console.log('Answer already in progress, ignoring click');
      return;
    }
    answerInProgress = true;
    
    // Disable button visually
    answerBtn.disabled = true;
    answerBtn.style.opacity = '0.6';
    answerBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Đang kết nối...</span>';
    
    // Stop ringtone IMMEDIATELY and forcefully
    console.log('Answer button clicked - stopping ringtone');
    stopRingtone();

    // Double-check: force stop any lingering audio
    if (currentRt) {
      try { currentRt.pause(); currentRt = null; } catch { }
    }

    if (currentSession) {
      try {
        // REQUEST MICROPHONE PERMISSION BEFORE ACCEPTING
        // This is required because session.accept() needs media streams
        try {
          console.log('Requesting microphone permission before accepting call...');
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach(track => track.stop()); // Release - SDK will acquire its own
          console.log('Microphone permission granted');
        } catch (micError) {
          console.error('Microphone error:', micError);
          if (micError.name === 'NotAllowedError') {
            alert('Vui lòng cấp quyền truy cập microphone để nghe máy.');
          } else if (micError.name === 'NotFoundError') {
            alert('Không tìm thấy microphone. Vui lòng kết nối microphone.');
} else {
            alert('Lỗi microphone: ' + micError.message);
          }
          // Reset button state on mic error
          answerInProgress = false;
          answerBtn.disabled = false;
          answerBtn.style.opacity = '1';
          answerBtn.innerHTML = '<i class="fa-solid fa-phone"></i> <span>Trả lời</span>';
          return; // Don't try to accept if mic permission failed
        }

        await currentSession.accept();
        console.log('Call accepted successfully');

        callConnected = true; // NEW: call is now connected/answered

        // NEW: Re-sync the plugin's session pointer after accept (helps some builds)
        if (window.VBotWebCall) {
          window.VBotWebCall.session = currentSession;
        }



        // Wait for the accepted() promise to confirm connection
        try {
          const { accepted } = await Promise.race([
            currentSession.accepted(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000))
          ]);
          console.log('Call connection confirmed:', accepted);
        } catch (e) {
          console.warn('Accept confirmation timeout, continuing anyway');
        }

        actionContainer.remove();

        // Show controls and remove incoming class
        const card = document.querySelector('#callModal .call-card');
        if (card) card.classList.remove('incoming');
        const controls = document.querySelector('.call-controls');
        if (controls) controls.style.display = 'flex';
        const endBtn = document.getElementById('endCallBtn');
        if (endBtn) endBtn.style.display = 'inline-flex';

        startCallTimer();
        updateCallStatus('Đang gọi');
} catch (err) {
        console.error("Accept failed:", err);
        alert("Lỗi khi nghe máy: " + err.message);
        hideCallUI();
        currentSession = null;
        answerInProgress = false;
      }
    }
    
    // Reset button state after a delay if something went wrong
    setTimeout(() => {
      if (answerInProgress && !callConnected) {
        console.warn('Answer seems stuck, resetting state');
        answerInProgress = false;
        if (answerBtn) {
          answerBtn.disabled = false;
          answerBtn.style.opacity = '1';
          answerBtn.innerHTML = '<i class="fa-solid fa-phone"></i> <span>Trả lời</span>';
        }
      }
    }, 10000); // 10 second timeout
    
  };

// Reject (red gradient)
  const rejectBtn = document.createElement('button');
  rejectBtn.className = 'btn-reject';
  rejectBtn.innerHTML = '<i class="fa-solid fa-phone-slash"></i> <span>Từ chối</span>';
  
  // Prevent double-click on reject button
  let rejectInProgress = false;
  
  rejectBtn.onclick = async () => {
    // Debounce - prevent multiple clicks
    if (rejectInProgress) {
      console.log('Reject already in progress, ignoring click');
      return;
    }
    rejectInProgress = true;
    
    // Disable button visually
    rejectBtn.disabled = true;
    rejectBtn.style.opacity = '0.6';
    
    console.log('Reject button clicked - stopping ringtone');
    stopRingtone();

    // Force stop any lingering audio
    if (currentRt) {
      try { currentRt.pause(); currentRt = null; } catch { }
    }

    if (currentSession) {
      try {
        await currentSession.reject();
        console.log('Call rejected successfully');

        // Wait for termination confirmation (with timeout)
        try {
          await Promise.race([
            currentSession.terminated(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
          ]);
          console.log('Rejection confirmed by server');
        } catch (e) {
          console.warn('Rejection wait timeout');
        }
      } catch (err) { 
        console.error('Reject failed:', err);
      }
currentSession = null;
      isIncomingCall = false;
      callConnected = false;

      // CRITICAL: Also clear VBot's session reference
      if (window.VBotWebCall) {
        window.VBotWebCall.session = null;
      }
      
      // CRITICAL: Reset debounce variables to prevent ghost popups
      lastInviteCallerId = null;
      lastInviteTimestamp = 0;
      
      // Reset ringtone kill switch for next call
      resetRingtoneKillSwitch();
    }
    hideCallUI();
  };

  actionContainer.appendChild(answerBtn);
  actionContainer.appendChild(rejectBtn);

  // Append to the new card container (not .modal-content)
  const modalContent = modal.querySelector('.call-card') || modal.querySelector('.modal-content');
  if (modalContent) modalContent.appendChild(actionContainer);

  if (modal) modal.classList.add('active');
}


function updateCallStatus(status) {
  const statusEl = document.getElementById('callStatus');
  if (statusEl) statusEl.textContent = status;
}

function hideCallUI() {
  const modal = document.getElementById('callModal');
  if (modal) modal.classList.remove('active');

  const card = document.querySelector('#callModal .call-card');
  if (card) card.classList.remove('is-outgoing', 'incoming');

  stopCallTimer();

  const actions = document.getElementById('incomingActions');
  if (actions) actions.remove();

  const endBtn = document.getElementById('endCallBtn');
  if (endBtn) endBtn.style.display = 'flex';
}


let callTimerInterval = null;
let callStartTime = null;

function startCallTimer() {
  callStartTime = Date.now();
  document.getElementById('callDuration').style.display = 'block';
  document.getElementById('callStatus').style.display = 'none';

  callTimerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
    const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const secs = (elapsed % 60).toString().padStart(2, '0');
    document.getElementById('callDuration').textContent = mins + ':' + secs;
  }, 1000);
}

function stopCallTimer() {
  if (callTimerInterval) {
    clearInterval(callTimerInterval);
    callTimerInterval = null;
  }
}

/* ============================================================
   VBOT WEB SDK INTEGRATION
   ============================================================ */

async function initVBotPlugin() {
  if (vbotInitialized) return;
  console.log('VBot: Initializing SDK Mode...');

  // REMOVED: Leader check - ALL devices should initialize VBot for multi-device ringing
  // Each device will handle calls independently

  // Wait for vbotReady flag from index.html
  const waitForLib = setInterval(() => {
    if (window.vbotReady && window.VBotWebCall && window.VBotWebCall.client) {
      clearInterval(waitForLib);
      console.log('VBot: Client detected, setting up listeners...');
      setupVBotListeners();
    }
  }, 500);

  // Timeout after 15 seconds - with auto-retry
  setTimeout(() => {
    clearInterval(waitForLib);
    if (!vbotInitialized) {
      console.error('VBot: Timed out waiting for client - attempting recovery');

      // Try to recover by reinitializing
      window.vbotScriptRetryCount = (window.vbotScriptRetryCount || 0) + 1;

      if (window.vbotScriptRetryCount <= 2) {
        console.log('VBot: Script retry attempt ' + window.vbotScriptRetryCount + '/2');

        // Reset flags and try again
        vbotInitialized = false;
        window.vbotReady = false;

        // Show notification
        if (typeof window.showVBotRetryNotification === 'function') {
          window.showVBotRetryNotification(window.vbotScriptRetryCount);
        }

        // Wait and retry
        setTimeout(() => {
          initVBotPlugin();
        }, 3000);
      } else {
        // Max retries - show failure notification
        if (typeof window.showVBotFailedNotification === 'function') {
          window.showVBotFailedNotification();
        }
      }
    }
  }, 15000);

  function setupVBotListeners() {
    const vbot = window.VBotWebCall.client; // rename to avoid shadowing Supabase 'client'

    // CRITICAL FIX: Process any early invites that arrived before we were ready
    vbot.on('invite', handleIncomingInvite);

    // Listen for custom event from visibilitychange handler
    window.addEventListener('vbot-process-invite', (e) => {
      if (e.detail) {
        console.log('Processing invite from visibility event');
        handleIncomingInvite(e.detail);
      }
    });

    // Mark main listener as ready (early listener will stop storing)
    window.vbotMainListenerReady = true;

    // Check for early invites and process them
    if (window.vbotEarlyInvites && window.vbotEarlyInvites.length > 0) {
      console.log('VBot: Processing', window.vbotEarlyInvites.length, 'early invite(s)');

      // Stop early ringtone before processing
      if (typeof window.stopEarlyRingtone === 'function') {
        window.stopEarlyRingtone();
      }

      window.vbotEarlyInvites.forEach(item => {
        // Only process if less than 30 seconds old
        if (Date.now() - item.timestamp < 30000) {
          // CRITICAL: Validate session is still active before processing
          try {
            const state = item.session.state;
            if (state === 'terminated' || state === 'Terminated' || state === 'failed') {
              console.log('Early invite session already ended, skipping');
              return;
            }
          } catch (e) {
            console.warn('Could not check session state:', e);
          }

          handleIncomingInvite(item.session);
        } else {
          console.log('Early invite too old, skipping');
          // Try to reject stale session
          try { item.session.reject(); } catch (e) { }
        }
      });
      window.vbotEarlyInvites = [];
    }

function handleIncomingInvite(session) {
      console.log('Incoming Invite Event Received');

      // Check if session is valid
      if (!session) {
        console.error('VBot: Invalid session received');
        return;
      }

      // COMPREHENSIVE SESSION VALIDATION
      try {
        // Check multiple possible termination states
        const terminatedStates = ['terminated', 'Terminated', 'failed', 'Failed', 'cancelled', 'Cancelled', 'rejected', 'Rejected'];
        const currentState = session.state || session.status || '';
        
        if (terminatedStates.includes(currentState)) {
          console.log('Session already ended (state:', currentState, '), ignoring');
          return;
        }
        
        // Also check if session has required methods
        if (typeof session.accept !== 'function' && typeof session.answer !== 'function') {
          console.error('VBot: Session missing accept/answer method, invalid session');
          return;
        }
      } catch (e) {
        console.warn('Error validating session:', e);
        // Continue anyway - let the call attempt proceed
      }

      // REMOVED: Leader check - ALL devices should ring for incoming calls
      // Each device handles the invite independently
      console.log('Processing incoming call (multi-device mode)');

      // DUPLICATE PREVENTION: Check if this is a duplicate invite
      const now = Date.now();
      let callerId = 'unknown';
      try {
        if (session.phoneNumber) {
          callerId = session.phoneNumber;
        } else if (session.remoteIdentity && session.remoteIdentity.uri) {
          callerId = session.remoteIdentity.uri.user;
        }
      } catch (e) { }

      // If same caller within debounce window, ignore
      if (callerId === lastInviteCallerId && (now - lastInviteTimestamp) < INVITE_DEBOUNCE_MS) {
        console.log('Duplicate invite ignored for:', callerId);
        return;
      }

      // If there's already an active call, ignore new invites
      if (currentSession && (isIncomingCall || callConnected)) {
        console.log('Already handling a call, ignoring new invite');
        try { session.reject(); } catch (e) { }
        return;
      }

      lastInviteTimestamp = now;
      lastInviteCallerId = callerId;

      console.log('Leader tab handling incoming call from:', callerId);

      // Update activity timestamp
      updateVBotActivity();

      // RESET kill switch for this NEW call
      resetRingtoneKillSwitch();

      // 1) start ringtone
      playUpbeatRingtone();

      // 2) extract the caller number safely
      let callerNumber = "Unknown";
      try {
        if (session.phoneNumber) {
          callerNumber = session.phoneNumber;
        } else if (session.remoteIdentity && session.remoteIdentity.uri) {
          callerNumber = session.remoteIdentity.uri.user;
        } else if (session.remote_identity && session.remote_identity.uri) {
          callerNumber = session.remote_identity.uri.user;
        }
      } catch (e) {
        console.warn("Could not parse caller ID:", e);
      }

      currentSession = session;
      isIncomingCall = true;          // incoming call
      callConnected = false;          // NOT answered yet
      lastCallStatus = null;          // reset for this call

      // CRITICAL: Sync with VBot's internal session reference
      if (window.VBotWebCall) {
        window.VBotWebCall.session = session;
      }

      // NEW: Track incoming status updates (so hangup logic is correct)
      session.on('statusUpdate', (status) => {
        lastCallStatus = status;
        console.log('VBot statusUpdate (incoming):', status);

        // If the SDK reports active, mark connected AND stop ringtone
        if (status === 'active' || status === 'on_hold') {
          callConnected = true;
          // CRITICAL: Stop ringtone when call becomes active
          stopRingtone();
          console.log('Call active - ringtone stopped via statusUpdate');
        }

        // Also stop ringtone if call is terminated or cancelled
        if (status === 'terminated' || status === 'cancelled' || status === 'failed') {
          stopRingtone();
        }
      });


// 4) resolve name from phone_numbers and show popup
      setTimeout(async () => {
        const display = await resolveIncomingName(callerNumber);
        showIncomingCallUI(display || callerNumber);
      }, 50);
      
      // 5) SAFETY: Auto-cleanup if call is stuck ringing for too long (60 seconds)
      const incomingCallTimeout = setTimeout(() => {
        if (isIncomingCall && !callConnected && currentSession === session) {
          console.warn('Incoming call timeout - stuck ringing for 60s, cleaning up');
          try {
            stopRingtone(false);
            stopBeep();
            hideCallUI();
            // Don't reject - the call may have already been handled elsewhere
            currentSession = null;
            isIncomingCall = false;
resetRingtoneKillSwitch();
            lastInviteCallerId = null;
            lastInviteTimestamp = 0;
            if (window.VBotWebCall) window.VBotWebCall.session = null;
          } catch (e) {
            console.error('Error in timeout cleanup:', e);
          }
        }
      }, 60000); // 60 seconds timeout
      
      // Clear timeout when call is answered or terminated
      session.on('accepted', () => clearTimeout(incomingCallTimeout));
      session.on('terminated', () => clearTimeout(incomingCallTimeout));
      session.on('failed', () => clearTimeout(incomingCallTimeout));
      session.on('cancelled', () => clearTimeout(incomingCallTimeout));


// Track if we've already handled termination for this session
      let terminationHandled = false;
      
      session.on('terminated', () => {
        // Prevent double-handling of termination
        if (terminationHandled) {
          console.log('Termination already handled, skipping');
          return;
        }
        terminationHandled = true;
        
        console.log('Call terminated event received');
        stopRingtone(false); // Don't need kill switch on termination
        stopOutgoingTone();

        callConnected = false;
        lastCallStatus = null;

        // Force cleanup any audio - with extra safety
        try {
          if (currentRt) {
            currentRt.pause();
            currentRt.src = '';
            currentRt.load();
            currentRt = null;
          }
        } catch (e) { console.warn('Error cleaning up ringtone:', e); }
        
        try {
          if (outgoingTone) {
            outgoingTone.pause();
            outgoingTone.src = '';
            outgoingTone = null;
          }
        } catch (e) { console.warn('Error cleaning up outgoing tone:', e); }

        // Stop beep fallback too
        stopBeep();

        hideCallUI();
        currentSession = null;
        isIncomingCall = false;

        // RESET kill switch for next call
        resetRingtoneKillSwitch();

        // CRITICAL: Also clear VBot's session reference
        if (window.VBotWebCall) {
          window.VBotWebCall.session = null;
        }
        
        // Reset debounce to allow new calls immediately
        lastInviteCallerId = null;
        lastInviteTimestamp = 0;
        
        console.log('Call cleanup complete, ready for new calls');
      });
      
      // Also handle 'failed' and 'cancelled' events for extra safety
      session.on('failed', () => {
        console.log('Call failed event received');
        if (!terminationHandled) {
          terminationHandled = true;
          stopRingtone(false);
          stopOutgoingTone();
          stopBeep();
          hideCallUI();
          currentSession = null;
          isIncomingCall = false;
          callConnected = false;
          resetRingtoneKillSwitch();
          if (window.VBotWebCall) window.VBotWebCall.session = null;
        }
      });
      
      session.on('cancelled', () => {
        console.log('Call cancelled event received (caller hung up)');
        if (!terminationHandled) {
          terminationHandled = true;
          stopRingtone(false);
          stopOutgoingTone();
          stopBeep();
          hideCallUI();
          currentSession = null;
          isIncomingCall = false;
          callConnected = false;
          resetRingtoneKillSwitch();
          if (window.VBotWebCall) window.VBotWebCall.session = null;
        }
      });


    }


    // ALL devices connect to VBot (multi-device ringing mode)
    if (!window.vbotConnected) {
      console.log('VBot: Connecting to VBot server...');
      vbot.connect();
      window.vbotConnected = true;
    }

    // Mark that listeners are attached
    vbotInitialized = true;
    window.vbotListenersAttached = true;
    console.log('VBot: Listeners attached successfully');

    // DIAGNOSTIC: Verify connection after 5 seconds
    setTimeout(() => {
      const diagnostics = {
        vbotReady: window.vbotReady,
        vbotConnected: window.vbotConnected,
        vbotInitialized: vbotInitialized,
        listenersAttached: window.vbotListenersAttached,
        slot: window.VBOT_SLOT,
        outboundOnly: window.VBOT_OUTBOUND_ONLY,
        isPriority: window.VBOT_IS_PRIORITY,
        hasToken: !!window.VBOT_ACCESS_TOKEN
      };
      console.log('VBot DIAGNOSTICS:', JSON.stringify(diagnostics));


    }, 5000);

    // === NEW: Listen for VBot connection events ===
vbot.on('connected', () => {
      console.log('VBot: Connected successfully');
      window.vbotConnected = true;
      window.vbotLastConnectedTime = Date.now();
      updateStatusIndicator('vbot', 'green');

      // Remove any warning
      const warning = document.getElementById('connectionWarning');
      if (warning) warning.remove();
    });

    vbot.on('disconnected', () => {
      console.log('VBot: Disconnected');
      window.vbotConnected = false;
      updateStatusIndicator('vbot', 'yellow');

      // Trigger reconnect (all devices)
      triggerVBotReconnect();
    });

    vbot.on('error', (error) => {
      console.error('VBot: Error event:', error);
      updateStatusIndicator('vbot', 'red');
    });

    vbot.on('reconnecting', () => {
      console.log('VBot: Reconnecting...');
      updateStatusIndicator('vbot', 'yellow');
    });

vbot.on('reconnected', () => {
      console.log('VBot: Reconnected successfully');
      window.vbotConnected = true;
      window.vbotLastConnectedTime = Date.now();
      updateStatusIndicator('vbot', 'green');

      const warning = document.getElementById('connectionWarning');
      if (warning) warning.remove();
    });
    
    // NEW: Connection watchdog - checks every 30 seconds if VBot is still connected
    setInterval(() => {
      if (!window.vbotConnected && window.VBotWebCall && window.VBotWebCall.client) {
        console.log('VBot Watchdog: Connection lost, attempting reconnect...');
        try {
          window.VBotWebCall.client.connect();
        } catch (e) {
          console.error('VBot Watchdog: Reconnect failed:', e);
        }
      }
    }, 30000); // Check every 30 seconds

    // NEW: Function to show persistent warning
    function showPersistentOutboundWarning() {
      // Remove existing warning first
      const existing = document.getElementById('outbound-only-warning');
      if (existing) existing.remove();

      const warning = document.createElement('div');
      warning.id = 'outbound-only-warning';
      warning.style.cssText = `
        position: fixed;
        top: 10px;
        left: 50%;
        transform: translateX(-50%);
        background: linear-gradient(135deg, #ff9500 0%, #ff6b00 100%);
        color: white;
        padding: 10px 20px;
        border-radius: 10px;
        z-index: 99999;
        font-family: 'Inter', Arial, sans-serif;
        font-size: 13px;
        font-weight: 600;
        box-shadow: 0 4px 15px rgba(255, 107, 0, 0.4);
        display: flex;
        align-items: center;
        gap: 10px;
      `;
      warning.innerHTML = `
        <i class="fa-solid fa-exclamation-triangle"></i>
        <span>CHẾ ĐỘ GỌI ĐI - Không nhận được cuộc gọi đến</span>
        <button onclick="location.reload()" style="
          background: white;
          color: #ff6b00;
          border: none;
          padding: 5px 10px;
          border-radius: 6px;
          font-weight: 600;
          cursor: pointer;
          font-size: 12px;
          margin-left: 10px;
        ">Thử lại</button>
      `;
      document.body.appendChild(warning);
    }
  window.showPersistentOutboundWarning = showPersistentOutboundWarning;

    // NEW: Show app error section when critical errors occur
    window.showAppError = function(message) {
      const section = document.getElementById('appErrorSection');
      const msgEl = document.getElementById('appErrorMessage');
      if (section && msgEl) {
        msgEl.textContent = message || 'Ứng dụng gặp sự cố. Vui lòng tải lại trang để tiếp tục sử dụng.';
        section.style.display = 'block';
      }
    };

    window.hideAppError = function() {
      const section = document.getElementById('appErrorSection');
      if (section) {
        section.style.display = 'none';
      }
    };

    vbotInitialized = true;
    vbotClientReady = true;
    updateStatusIndicator('vbot', 'green');
    console.log('VBot: Fully initialized and ready for calls');

    // === IMPROVED: Robust VBot Reconnection System ===
    let reconnectAttempts = 0;
    let reconnectDelay = 2000; // Start with 2 seconds
    const maxReconnectDelay = 30000; // Max 30 seconds between attempts
    const maxReconnectAttempts = 50; // Give up after 50 attempts (about 10+ minutes)
    let reconnectTimeout = null;
    let lastSuccessfulConnection = Date.now();
    let isReconnecting = false;

    // Make this function globally accessible
    window.triggerVBotReconnect = function () {
      if (isReconnecting) return;
      // Removed isLeaderTab check - all devices reconnect

      isReconnecting = true;
      attemptReconnect();
    };

    function attemptReconnect() {
      // Removed isLeaderTab check - all devices reconnect
      if (!window.VBotWebCall || !window.VBotWebCall.client) {
        isReconnecting = false;
        return;
      }

// Check if we've exceeded max attempts
      if (reconnectAttempts >= maxReconnectAttempts) {
        console.error('VBot: Max reconnect attempts reached. Please reload the page.');
        isReconnecting = false;
        showConnectionWarning();
        updateStatusIndicator('vbot', 'red');
        // Show the nice error section
        if (window.showAppError) {
          window.showAppError('Không thể kết nối lại với hệ thống cuộc gọi. Vui lòng tải lại trang.');
        }
        return;
      }

      const vbotClient = window.VBotWebCall.client;

      try {
        // Check if already connected before attempting
        let alreadyConnected = false;
        try {
          if (typeof vbotClient.isConnected === 'function') {
            alreadyConnected = vbotClient.isConnected();
          } else if (vbotClient.connected !== undefined) {
            alreadyConnected = vbotClient.connected;
          }
        } catch (e) { }

        if (alreadyConnected) {
          console.log('VBot: Already connected, stopping reconnect');
          reconnectAttempts = 0;
          reconnectDelay = 2000;
          isReconnecting = false;
          lastSuccessfulConnection = Date.now();
          updateStatusIndicator('vbot', 'green');

          const warning = document.getElementById('connectionWarning');
          if (warning) warning.remove();
          return;
        }

        // Attempt to connect
        vbotClient.connect();
        reconnectAttempts++;

        console.log(`VBot: Reconnect attempt ${reconnectAttempts}/${maxReconnectAttempts} (next retry in ${reconnectDelay / 1000}s)`);
        updateStatusIndicator('vbot', 'yellow');

        // Schedule next attempt with exponential backoff
        reconnectTimeout = setTimeout(() => {
          // Check connection status again
          let stillDisconnected = true;
          try {
            if (typeof vbotClient.isConnected === 'function') {
              stillDisconnected = !vbotClient.isConnected();
            } else if (vbotClient.connected !== undefined) {
              stillDisconnected = !vbotClient.connected;
            }
          } catch (e) { }

          if (stillDisconnected) {
            // Increase delay with exponential backoff
            reconnectDelay = Math.min(reconnectDelay * 1.5, maxReconnectDelay);
            attemptReconnect();
          } else {
            // Connected!
            console.log('VBot: Reconnected successfully after', reconnectAttempts, 'attempts');
            reconnectAttempts = 0;
            reconnectDelay = 2000;
            isReconnecting = false;
            lastSuccessfulConnection = Date.now();
            updateStatusIndicator('vbot', 'green');

            const warning = document.getElementById('connectionWarning');
            if (warning) warning.remove();
          }
        }, reconnectDelay);

      } catch (e) {
        console.error('VBot reconnect error:', e);

        // Still schedule next attempt on error
        reconnectDelay = Math.min(reconnectDelay * 1.5, maxReconnectDelay);
        reconnectTimeout = setTimeout(attemptReconnect, reconnectDelay);
      }
    }

    // Health check every 3 seconds (more responsive)
    setInterval(() => {
      // Removed isLeaderTab check - all devices do health check
      if (!window.VBotWebCall || !window.VBotWebCall.client) return;

      const vbotClient = window.VBotWebCall.client;
      let isConnected = true;

      try {
        if (typeof vbotClient.isConnected === 'function') {
          isConnected = vbotClient.isConnected();
        } else if (vbotClient.connected !== undefined) {
          isConnected = vbotClient.connected;
        }
      } catch (e) {
        console.warn('Could not check VBot connection:', e);
        isConnected = false;
      }

      if (!isConnected) {
        // Update status
        updateStatusIndicator('vbot', 'yellow');

        // Start reconnect if not already running
        if (!isReconnecting && !reconnectTimeout) {
          console.log('VBot: Connection lost - starting reconnect');
          window.triggerVBotReconnect();
        }

        // Show warning after 10 seconds of disconnection
        if (Date.now() - lastSuccessfulConnection > 10000) {
          showConnectionWarning();
        }
      } else {
        // Connection is good
        lastSuccessfulConnection = Date.now();

        if (reconnectTimeout) {
          clearTimeout(reconnectTimeout);
          reconnectTimeout = null;
        }

        if (isReconnecting) {
          console.log('VBot: Connection restored');
          reconnectAttempts = 0;
          reconnectDelay = 2000;
          isReconnecting = false;
        }

        updateStatusIndicator('vbot', 'green');

        const warning = document.getElementById('connectionWarning');
        if (warning) warning.remove();
      }
    }, 3000); // Check every 3 seconds

    // Network recovery - aggressive reconnect
    window.addEventListener('online', () => {
      console.log('Network restored - triggering VBot reconnect');

      if (window.VBotWebCall && window.VBotWebCall.client) {
        // Clear existing reconnect attempts
        if (reconnectTimeout) {
          clearTimeout(reconnectTimeout);
          reconnectTimeout = null;
        }

        // Reset counters for fresh start
        reconnectAttempts = 0;
        reconnectDelay = 1000; // Start very fast after network restore
        isReconnecting = false;

        // Wait a moment for network to stabilize, then reconnect
        setTimeout(() => {
          try {
            window.VBotWebCall.client.connect();
            console.log('VBot: Immediate reconnect after network restore');

            // Also trigger the reconnect system as backup
            setTimeout(() => {
              if (!window.vbotConnected) {
                window.triggerVBotReconnect();
              }
            }, 3000);
          } catch (e) {
            console.warn('VBot immediate reconnect failed:', e);
            window.triggerVBotReconnect();
          }
        }, 500);
      }
    });

    // Also handle visibility change - reconnect when tab becomes visible
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        // Tab became visible - check connection
        setTimeout(() => {
          if (window.VBotWebCall && window.VBotWebCall.client) {
            let isConnected = false;
            try {
              const vbotClient = window.VBotWebCall.client;
              if (typeof vbotClient.isConnected === 'function') {
                isConnected = vbotClient.isConnected();
              } else if (vbotClient.connected !== undefined) {
                isConnected = vbotClient.connected;
              }
            } catch (e) { }

            if (!isConnected) {
              console.log('VBot: Tab visible but disconnected - reconnecting');
              window.triggerVBotReconnect();
            }
          }
        }, 1000);
      }
    });
  }

}


async function makeVBotCall(phoneNumber, type, displayLabel) {
  // NEW: Check microphone permission first
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(track => track.stop()); // Release immediately
  } catch (micError) {
    console.error('Microphone error:', micError);
    if (micError.name === 'NotAllowedError') {
      alert('Vui lòng cấp quyền truy cập microphone để thực hiện cuộc gọi.');
    } else if (micError.name === 'NotFoundError') {
      alert('Không tìm thấy microphone. Vui lòng kết nối microphone.');
    } else {
      alert('Lỗi microphone: ' + micError.message);
    }
    return;
  }

  // Wait up to 8 seconds for SDK to be ready
  let waitCount = 0;
  while (!window.vbotReady && waitCount < 80) {
    await new Promise(r => setTimeout(r, 100));
    waitCount++;
  }

  // Final check
  if (!window.vbotReady || !window.VBotWebCall || !window.VBotWebCall.client) {
    console.error('VBot status:', {
      vbotReady: window.vbotReady,
      VBotWebCall: !!window.VBotWebCall,
      client: window.VBotWebCall ? !!window.VBotWebCall.client : false
    });
    alert("VBot SDK chưa sẵn sàng. Vui lòng tải lại trang (F5).");
    return;
  }

  const client = window.VBotWebCall.client;
  const labelToShow = displayLabel || phoneNumber;
  showCallUI(labelToShow, type);
  updateCallStatus('Đang kết nối...');
  playOutgoingTone(); // <-- start dialing tone



  // Helper function to retry transient errors
  async function retryOperation(operation, maxRetries = 2, delayMs = 1000) {
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (err) {
        lastError = err;
        const isTransient = err.message && (
          err.message.includes('network') ||
          err.message.includes('fetch') ||
          err.message.includes('timeout') ||
          err.message.includes('Failed to fetch') ||
          err.name === 'TypeError'
        );

        if (isTransient && attempt < maxRetries) {
          console.log(`Retry attempt ${attempt}/${maxRetries} after transient error:`, err.message);
          updateCallStatus(`Đang thử lại (${attempt}/${maxRetries})...`);
          await new Promise(r => setTimeout(r, delayMs * attempt));
        } else {
          throw err;
        }
      }
    }
    throw lastError;
  }

  try {
    // 1. Get Hotline with retry
    const hotlines = await retryOperation(async () => {
      const result = await client.getHotlines();
      if (!result || result.length === 0) {
        throw new Error('hotline_empty');
      }
      return result;
    }, 2, 1000);

    const hotlineNumber = hotlines[0].phoneNumber || hotlines[0];
    console.log('Using hotline:', hotlineNumber);

    // 2. Make the call with retry for transient errors
    const session = await retryOperation(async () => {
      return await client.invite(phoneNumber, hotlineNumber);
    }, 2, 1500);
    currentSession = session;
    isIncomingCall = false;  // NEW: Mark as outgoing call

    // CRITICAL: Sync with VBot's internal session reference
    if (window.VBotWebCall) {
      window.VBotWebCall.session = session;
    }

    // NEW: Track status so hangup logic can pick cancel/reject/terminate correctly
    session.on('statusUpdate', (status) => {
      lastCallStatus = status;
      if (window.VBotWebCall) window.VBotWebCall.session = session;
      console.log('VBot statusUpdate (outgoing):', status);
      updateVBotActivity(); // Keep connection alive
    });



    // Stop tone if the call ends before pickup
    session.on('terminated', () => { stopOutgoingTone(); });

    // 3. Handle Ringing Events [cite: 17]
    session.on('progressUpdate', response => {

      if (response.message.statusCode === 180 || response.message.statusCode === 183) {
        updateCallStatus('Đang đổ chuông...');
      }
    });

    const { accepted, rejectCause } = await session.accepted();

    if (!accepted) {
      stopOutgoingTone(); // <-- stop sound if declined/busy
      updateCallStatus('Cuộc gọi bị từ chối/bận');
      setTimeout(hideCallUI, 2000);
      return;
    }

    stopOutgoingTone();
    const card = document.querySelector('#callModal .call-card');
    if (card) card.classList.remove('is-outgoing');
    startCallTimer();
    updateCallStatus('Đang gọi');



    // 6. Wait for Termination [cite: 17]
    await session.terminated();
    hideCallUI();

  } catch (e) {
    console.error('VBot call error:', e);
    stopOutgoingTone();
    hideCallUI();

    // Classify error type for better user feedback
    let errorMsg = "Lỗi cuộc gọi: ";
    let shouldReconnect = false;

    const errorMessage = e.message || '';

    if (errorMessage.includes('hotline_empty') || errorMessage.includes('hotline')) {
      errorMsg += "Không tìm thấy hotline. Vui lòng liên hệ Admin.";
    } else if (errorMessage.includes('network') || errorMessage.includes('fetch') || errorMessage.includes('Failed to fetch')) {
      errorMsg += "Lỗi kết nối mạng. Vui lòng kiểm tra internet và thử lại.";
      shouldReconnect = true;
    } else if (errorMessage.includes('permission') || errorMessage.includes('microphone')) {
      errorMsg += "Không có quyền truy cập microphone. Vui lòng cấp quyền trong cài đặt trình duyệt.";
    } else if (errorMessage.includes('timeout')) {
      errorMsg += "Hết thời gian chờ. Máy chủ có thể đang bận. Vui lòng thử lại.";
      shouldReconnect = true;
    } else if (errorMessage.includes('busy') || errorMessage.includes('486')) {
      errorMsg += "Đường dây đang bận. Vui lòng thử lại sau.";
    } else if (errorMessage.includes('not registered') || errorMessage.includes('offline')) {
      errorMsg += "VBot chưa sẵn sàng. Vui lòng tải lại trang.";
      shouldReconnect = true;
    } else {
      errorMsg += errorMessage || "Lỗi không xác định. Vui lòng thử lại hoặc tải lại trang.";
    }

    alert(errorMsg);

    // Try to reconnect VBot if it seems disconnected
    if (shouldReconnect && window.VBotWebCall && window.VBotWebCall.client) {
      console.log('Attempting VBot reconnection after call error...');
      try {
        window.VBotWebCall.client.connect();
      } catch (reconnectErr) {
        console.warn('Reconnect attempt failed:', reconnectErr);
      }
    }
  }
}

async function endCurrentCall() {
  // Prefer currentSession first (more reliable), but also try VBotWebCall.session as backup
  const pluginSession = (window.VBotWebCall && window.VBotWebCall.session) ? window.VBotWebCall.session : null;
  const primarySession = currentSession || null;

  // Build list of unique session objects to try
  const targets = [];
  if (primarySession) targets.push(primarySession);
  if (pluginSession && pluginSession !== primarySession) targets.push(pluginSession);

  const wasIncoming = isIncomingCall;

  if (targets.length === 0) {
    console.log('No active session to end');
    stopOutgoingTone();
    stopRingtone();
    hideCallUI();
    return;
  }

  stopOutgoingTone();
  stopRingtone();
  updateCallStatus('Đang kết thúc...');

  console.log('Ending call...', {
    wasIncoming,
    callConnected,
    lastCallStatus
  });

  const safeCall = async (s, fnName) => {
    const fn = s && s[fnName];
    if (typeof fn !== 'function') return;
    try {
      console.log(`Hangup step: ${fnName}()`);
      await fn.call(s);
    } catch (e) {
      console.warn(`${fnName}() failed:`, e && e.message ? e.message : e);
    }
  };

  // If call is answered/connected, ALWAYS terminate (this fixes your incoming hangup problem)
  try {
    if (callConnected) {
      for (const s of targets) {
        await safeCall(s, 'terminate');
      }
    } else {
      // Not connected yet: use correct action
      if (wasIncoming) {
        for (const s of targets) await safeCall(s, 'reject');
      } else {
        for (const s of targets) await safeCall(s, 'cancel');
      }
    }

    // Extra safety: after a short delay, try terminate again (helps some edge cases)
    await new Promise(r => setTimeout(r, 250));
    for (const s of targets) {
      await safeCall(s, 'terminate');
    }
  } finally {
    // Cleanup AFTER attempting hangup
    currentSession = null;
    isIncomingCall = false;
    callConnected = false;
    lastCallStatus = null;

    if (window.VBotWebCall) window.VBotWebCall.session = null;

    hideCallUI();
    console.log('Call end process completed');
  }
}



// Wrapper to handle the end call button click properly
async function handleEndCallClick() {
  const endBtn = document.getElementById('endCallBtn');

  // Prevent double-clicking
  if (endBtn) {
    endBtn.disabled = true;
    endBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang kết thúc...';
  }

  try {
    await endCurrentCall();
  } catch (e) {
    console.error('Error ending call:', e);
  } finally {
    // Reset button state (in case UI wasn't hidden)
    if (endBtn) {
      endBtn.disabled = false;
      endBtn.innerHTML = '<i class="fa-solid fa-phone-slash"></i> Kết thúc';
    }
  }
}


function toggleMute() {
  if (currentSession && currentSession.media && currentSession.media.input) {
    currentSession.media.input.muted = !currentSession.media.input.muted;
    const isMuted = currentSession.media.input.muted;
    const muteBtn = document.getElementById('muteBtn');
    if (muteBtn) {
      if (isMuted) {
        muteBtn.innerHTML = '<i class="fa-solid fa-microphone-slash"></i>';
        muteBtn.style.background = '#ef4444';
        muteBtn.style.color = 'white';
      } else {
        muteBtn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
        muteBtn.style.background = '#e5e7eb';
        muteBtn.style.color = 'inherit';
      }
    }
  } else {
    console.log('Cannot toggle mute - no active session');
  }
}

function sendDTMF(digit) {
  if (currentSession) {
    currentSession.dtmf(digit);
  }
}

function sendDTMF(digit) {
  if (currentSession) {
    currentSession.dtmf(digit);
  }
}

// Improved: Show connection warning with auto-reconnect info
function showConnectionWarning() {
  // Check if warning already exists
  if (document.getElementById('connectionWarning')) return;

  const warning = document.createElement('div');
  warning.id = 'connectionWarning';
  warning.style.cssText = `
    position: fixed;
    top: 60px;
    left: 50%;
    transform: translateX(-50%);
    background: #fef3c7;
    border: 1px solid #f59e0b;
    color: #92400e;
    padding: 12px 20px;
    border-radius: 10px;
    font-size: 0.9rem;
    font-weight: 500;
    z-index: 9999;
    display: flex;
    align-items: center;
    gap: 10px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    max-width: 90%;
  `;
  warning.innerHTML = `
    <i class="fa-solid fa-triangle-exclamation"></i>
    <span>Đang kết nối lại... <span id="reconnectStatus">Vui lòng đợi</span></span>
    <button id="forceReconnectBtn" style="background:#f59e0b; color:#fff; border:none; padding:6px 12px; border-radius:6px; cursor:pointer; font-weight:600;">Thử lại</button>
    <button onclick="location.reload()" style="background:#ef4444; color:#fff; border:none; padding:6px 12px; border-radius:6px; cursor:pointer; font-weight:600;">Tải lại</button>
  `;
  document.body.appendChild(warning);

  // Add manual reconnect button handler
  document.getElementById('forceReconnectBtn').addEventListener('click', () => {
    if (window.VBotWebCall && window.VBotWebCall.client) {
      try {
        window.VBotWebCall.client.connect();
        document.getElementById('reconnectStatus').textContent = 'Đang thử...';

        // Check result after 3 seconds
        setTimeout(() => {
          const statusEl = document.getElementById('reconnectStatus');
          if (statusEl) {
            let connected = false;
            try {
              const c = window.VBotWebCall.client;
              connected = typeof c.isConnected === 'function' ? c.isConnected() : c.connected;
            } catch (e) { }

            if (connected) {
              const w = document.getElementById('connectionWarning');
              if (w) w.remove();
            } else {
              statusEl.textContent = 'Vui lòng đợi';
            }
          }
        }, 3000);
      } catch (e) {
        console.error('Manual reconnect failed:', e);
      }
    }
  });
}

/* ============================================================
   CONFIRMATION MODAL LOGIC
   ============================================================ */

function createConfirmationModal() {
  if (document.getElementById('confirmModal')) return;

  const modal = document.createElement('div');
  modal.id = 'confirmModal';
  modal.className = 'modal-overlay';
  modal.style.zIndex = '3000';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 320px; text-align: center; padding: 32px 24px;">
      <div style="font-size: 48px; color: var(--primary); margin-bottom: 16px;">
        <i class="fa-solid fa-headset"></i>
      </div>
      <h3 style="margin: 0 0 8px 0; color: #1f2937;">Xác nhận gọi</h3>
      <p id="confirmMessage" style="color: #6b7280; margin-bottom: 24px; line-height: 1.5; font-size: 0.95rem;">
        Bạn có chắc muốn thực hiện cuộc gọi?
      </p>
      <div style="display: flex; gap: 12px; justify-content: center;">
        <button id="confirmCancelBtn" class="btn" style="background: #f3f4f6; color: #4b5563; border: 1px solid #e5e7eb; width: auto; flex: 1;">
          Hủy
        </button>
        <button id="confirmYesBtn" class="btn" style="background: var(--primary); color: white; width: auto; flex: 1;">
          <i class="fa-solid fa-phone"></i> Gọi ngay
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  // Close on Cancel
  document.getElementById('confirmCancelBtn').addEventListener('click', () => {
    modal.classList.remove('active');
  });

  // Close on outside click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('active');
  });
}

function showCallConfirmation(rowId, label, studentName) {
  createConfirmationModal(); // Ensure HTML exists

  const modal = document.getElementById('confirmModal');
  const msg = document.getElementById('confirmMessage');
  const yesBtn = document.getElementById('confirmYesBtn');

  // Update the message
  msg.innerHTML = `Bạn có chắc chắn muốn gọi cho <br><strong style="color:#111;">${studentName}</strong> (${label})?`;

  // Handle the "Call" click (Using cloneNode to wipe previous event listeners)
  const newYesBtn = yesBtn.cloneNode(true);
  yesBtn.parentNode.replaceChild(newYesBtn, yesBtn);

  newYesBtn.addEventListener('click', () => {
    modal.classList.remove('active'); // Close confirmation modal
    //Cx: Trigger Security Popup instead of calling immediately
    showSecurityInput(rowId, label);
  });
  // Show the modal
  modal.classList.add('active');
}


/* ============================================================
   MAIN PAGE SEARCH FUNCTIONALITY
   ============================================================ */

function setupMainSearch() {
  const input = document.getElementById('mainSearchInput');
  const list = document.getElementById('mainSuggestionList');
  const clearBtn = document.getElementById('clearSearchBtn');
  let debounceTimer;

  if (!input || !list) return;

  // Show/hide clear button
  input.addEventListener('input', (e) => {
    const value = e.target.value.trim();

    // Show clear button if there's text
    if (clearBtn) {
      clearBtn.style.display = value.length > 0 ? 'grid' : 'none';
    }

    // Clear previous timer
    clearTimeout(debounceTimer);

    // Hide suggestions if less than 4 characters
    if (value.length < 4) {
      list.classList.remove('active');
      list.innerHTML = '';
      return;
    }

    // Debounce: wait 500ms after typing stops
    debounceTimer = setTimeout(async () => {
      if (!client) return;

      // Search phone_numbers table by student_email (starts with)
      const { data, error } = await client
        .from('phone_numbers')
        .select('id, student_email, student_name')
        .ilike('student_email', `${value}%`)
        .order('student_name', { ascending: true })
        .limit(8);

      if (error) {
        console.error('Search error:', error);
        list.classList.remove('active');
        return;
      }

      if (!data || data.length === 0) {
        list.innerHTML = `
          <li class="no-results">
            <i class="fa-regular fa-face-frown"></i>
            Không tìm thấy kết quả
          </li>
        `;
        list.classList.add('active');
        return;
      }

      // Render suggestions
      list.innerHTML = '';
      data.forEach(item => {
        const li = document.createElement('li');
        li.innerHTML = `
          <div class="suggestion-avatar">
            <i class="fa-solid fa-user"></i>
          </div>
          <div class="suggestion-info">
            <div class="suggestion-name">${item.student_name || 'Chưa có tên'}</div>
            <div class="suggestion-email">${item.student_email}</div>
          </div>
        `;

        // Handle click on suggestion
        li.addEventListener('click', () => {
          selectStudent(item);
          list.classList.remove('active');
          input.value = item.student_email;
        });

        list.appendChild(li);
      });

      list.classList.add('active');
    }, 500);
  });

  // Clear button click
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      input.value = '';
      clearBtn.style.display = 'none';
      list.classList.remove('active');
      list.innerHTML = '';

      // Hide selected student card
      const selectedCard = document.getElementById('selectedStudentCard');
      if (selectedCard) selectedCard.style.display = 'none';

      // Hide today's calls section
      const todaySection = document.getElementById('todayCallsSection');
      if (todaySection) todaySection.style.display = 'none';

      input.focus();
    });
  }

  // Hide list when clicking outside
  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !list.contains(e.target)) {
      list.classList.remove('active');
    }
  });
}

async function selectStudent(student) {
  const card = document.getElementById('selectedStudentCard');
  const nameEl = document.getElementById('selectedStudentName');
  const emailEl = document.getElementById('selectedStudentEmail');
  const buttonsContainer = document.getElementById('studentPhoneButtons');

  // NEW: Get the message element
  const msgEl = document.getElementById('cardMessageDisplay');

  if (!card || !buttonsContainer) return;

  // NEW: Clear any old messages
  if (msgEl) msgEl.textContent = '';

  // Update student info
  nameEl.textContent = student.student_name || 'Chưa có tên';
  emailEl.textContent = student.student_email;

  // Fetch full phone data for this student
  const { data, error } = await client
    .from('phone_numbers')
    .select('*')
    .eq('id', student.id)
    .single();

  if (error || !data) {
    console.error('Error fetching student data:', error);
    return;
  }

  // Phone types configuration
  const phoneTypes = [
    { key: 'sdt_hv', label: 'HV', btnClass: 'btn-hv', icon: 'fa-user-graduate' },
    { key: 'sdt_cha', label: 'Cha', btnClass: 'btn-cha', icon: 'fa-person' },
    { key: 'sdt_me', label: 'Mẹ', btnClass: 'btn-me', icon: 'fa-person-dress' },
    { key: 'sdt_chi', label: 'Chị', btnClass: 'btn-chi', icon: 'fa-person-dress' },
    { key: 'sdt_ba', label: 'Bà', btnClass: 'btn-ba', icon: 'fa-person-cane' },
    { key: 'sdt_ong', label: 'Ông', btnClass: 'btn-ong', icon: 'fa-person-cane' },
  ];

  // Generate buttons
  buttonsContainer.innerHTML = '';

  // --- NEW: Refresh counts before showing card ---
  await fetchCallCounts();

  // Track blocked numbers to show message immediately
  let blockedLabels = [];

  phoneTypes.forEach(type => {
    const hasPhone = !!data[type.key];
    const phoneNumber = data[type.key];

    // Check limit
    const actualCalls = (globalCallCounts.counts && globalCallCounts.counts[phoneNumber]) || 0;

    // Get bonus using the selected student's email
    const bonusCalls = (globalCallCounts.bonuses && globalCallCounts.bonuses[student.student_email]) || 0;

    const limit = 2 + bonusCalls;
    const isLimit = actualCalls >= limit;

    const btn = document.createElement('button');

    // If limit reached, make it gray
    if (isLimit) {
      btn.className = `phone-call-btn disabled`;
      // Force gray styling
      btn.style.background = '#e5e7eb';
      btn.style.color = '#9ca3af';
      btn.style.cursor = 'not-allowed';
      btn.innerHTML = `
        <i class="fa-solid fa-phone-slash"></i>
     <span>${type.label} (${actualCalls}/${limit})</span>
      `;

      // Add to list so we can show message automatically
      blockedLabels.push(type.label);

    } else {
      // Normal Button Logic
      btn.className = `phone-call-btn ${type.btnClass} ${!hasPhone ? 'disabled' : ''}`;
      btn.innerHTML = `
        <i class="fa-solid fa-phone"></i>
        <span>${type.label}</span>
      `;

      if (hasPhone) {
        btn.addEventListener('click', () => {
          const labelMap = {
            'HV': 'HV', 'Cha': 'Cha', 'Mẹ': 'Mẹ',
            'Chị': 'Chị', 'Bà': 'Bà', 'Ông': 'Ông'
          };
          showCallConfirmation(data.id, labelMap[type.label], data.student_name || 'Unknown');
        });
      }
    }

    buttonsContainer.appendChild(btn);
  });

  // Display message immediately if any numbers are blocked
  if (msgEl && blockedLabels.length > 0) {
    msgEl.textContent = `${blockedLabels.join(', ')} đã vượt quá số lần gọi hôm nay`;
  }
  // Show the card
  card.style.display = 'block';

  // NEW: Load today's call history for this student
  await loadTodayCallsForStudent(student.student_email, data);
}

/* ============================================================
   TODAY'S CALL HISTORY FOR STUDENT
   ============================================================ */

async function loadTodayCallsForStudent(studentEmail, phoneData) {
  const section = document.getElementById('todayCallsSection');
  const grid = document.getElementById('todayCallsGrid');

  if (!section || !grid) return;

  // Clear previous data
  grid.innerHTML = '<div class="today-calls-empty"><i class="fa-solid fa-spinner fa-spin"></i>Đang tải...</div>';
  section.style.display = 'block';

  try {
    // Get all phone numbers for this student
    const phoneNumbers = [];
    const phoneLabels = {};

    const phoneTypes = [
      { key: 'sdt_hv', label: '' },
      { key: 'sdt_cha', label: '(Cha)' },
      { key: 'sdt_me', label: '(Mẹ)' },
      { key: 'sdt_chi', label: '(Chị)' },
      { key: 'sdt_ba', label: '(Bà)' },
      { key: 'sdt_ong', label: '(Ông)' }
    ];

    phoneTypes.forEach(type => {
      if (phoneData[type.key]) {
        const cleanNumber = String(phoneData[type.key]).replace(/\D/g, '');
        phoneNumbers.push(phoneData[type.key]);
        phoneNumbers.push(cleanNumber);
        phoneLabels[cleanNumber] = type.label;
        phoneLabels[phoneData[type.key]] = type.label;
      }
    });

    if (phoneNumbers.length === 0) {
      grid.innerHTML = '<div class="today-calls-empty"><i class="fa-regular fa-folder-open"></i>Không có số điện thoại</div>';
      return;
    }

    // Get today's date in Bangkok timezone (format: MM/DD/YYYY)
    const bangkokNow = new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' });
    const bangkokDate = new Date(bangkokNow);
    const month = String(bangkokDate.getMonth() + 1).padStart(2, '0');
    const day = String(bangkokDate.getDate()).padStart(2, '0');
    const year = bangkokDate.getFullYear();
    const todayPrefix = `${month}/${day}/${year}`;

    console.log('Searching for calls on:', todayPrefix);
    console.log('Phone numbers to search:', phoneNumbers);

    // Fetch today's calls for these phone numbers
    // call_date is TEXT format like "12/16/2025 16:12:54"
    const { data: calls, error } = await client
      .from('phone_numbers_recordings')
      .select('*')
      .in('phone_number', phoneNumbers)
      .like('call_date', `${todayPrefix}%`)
      .order('call_date', { ascending: false });

    if (error) {
      console.error('Error fetching today calls:', error);
      grid.innerHTML = '<div class="today-calls-empty"><i class="fa-solid fa-exclamation-triangle"></i>Lỗi tải dữ liệu</div>';
      return;
    }

    if (!calls || calls.length === 0) {
      section.style.display = 'none';
      return;
    }

    // Render call cards
    grid.innerHTML = '';
    const studentName = phoneData.student_name || 'Unknown';

    calls.forEach(call => {
      const card = createTodayCallCard(call, studentName, phoneLabels);
      grid.appendChild(card);
    });

  } catch (err) {
    console.error('Error in loadTodayCallsForStudent:', err);
    grid.innerHTML = '<div class="today-calls-empty"><i class="fa-solid fa-exclamation-triangle"></i>Lỗi tải dữ liệu</div>';
  }
}

function createTodayCallCard(call, studentName, phoneLabels) {
  const card = document.createElement('div');
  card.className = 'today-call-card';

  // Format date (call_date is already text like "12/16/2025 16:12:54")
  const dateStr = call.call_date || '--';

  // Determine call type badge
  const callType = (call.call_type || 'OUT').toUpperCase();
  const isIncoming = callType === 'IN';
  const typeLabel = isIncoming ? 'INCALL' : 'OUTCALL';
  const typeClass = isIncoming ? 'incall' : '';

  // Determine status badge
  let badgeClass = 'status-default';
  const disposition = (call.disposition || '').toLowerCase();
  if (disposition.includes('answer') && !disposition.includes('no')) badgeClass = 'status-answered';
  else if (disposition.includes('miss') || disposition.includes('busy') || disposition.includes('fail') || disposition.includes('cancel')) badgeClass = 'status-missed';
  else if (disposition === 'completed') badgeClass = 'status-answered';

  // Get relationship label
  const cleanNumber = String(call.phone_number).replace(/\D/g, '');
  const relationLabel = phoneLabels[cleanNumber] || phoneLabels[call.phone_number] || '';
  const displayName = relationLabel ? `${relationLabel} ${studentName}` : studentName;

  // Audio HTML
  let audioHtml = '<span style="font-size:0.8rem; color:#ccc;">Không có ghi âm</span>';
  const audioUrl = call.original_vbot_url || call.recording_url;
  if (audioUrl) {
    audioHtml = `<audio controls src="${audioUrl}" preload="none" style="width:100%; height:32px;"></audio>`;
  }

  // Status text
  const statusText = call.disposition || 'Unknown';
  const statusDisplay = statusText.toUpperCase();

  card.innerHTML = `
    <div class="tc-header">
      <span><i class="fa-regular fa-calendar"></i> ${dateStr}</span>
      <span class="badge-type ${typeClass}">${typeLabel}</span>
    </div>
    <div class="tc-body">
      <div>
        <div class="tc-phone">${displayName}</div>
        <div class="tc-mem">Mem: ${call.member_no || '--'}</div>
      </div>
      <span class="badge-status ${badgeClass}">${statusDisplay}</span>
    </div>
    <div style="font-size:0.85rem; color:#666;">
      <i class="fa-regular fa-clock"></i> Thời lượng: <strong>${call.duration ? call.duration + 's' : '00:00:00s'}</strong>
    </div>
    <div class="tc-footer">
      ${audioHtml}
      <div style="font-size:0.75rem; color:#9ca3af; margin-top:5px;">${call.processing_status || ''}</div>
    </div>
  `;

  return card;
}

/* ============================================================
   EDIT & DELETE LOGIC
   ============================================================ */

async function deleteStudentTask(id) {
  if (!client) return;
  const { data: { session } } = await client.auth.getSession();
  if (!session) return alert("Vui lòng đăng nhập lại.");

  document.body.style.cursor = 'wait';

  try {
    const res = await fetch('/.netlify/functions/delete-task', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, access_token: session.access_token })
    });

    if (res.ok) {
      alert("Đã xóa thành công!");
      loadDashboardData(); // Reload table
    } else {
      alert("Lỗi khi xóa. Vui lòng thử lại.");
    }
  } catch (err) {
    console.error(err);
    alert("Lỗi server.");
  } finally {
    document.body.style.cursor = 'default';
  }
}

function openEditModal(row) {
  const modal = document.getElementById('editStudentModal');
  if (!modal) return;

  // Fill data
  document.getElementById('editRowId').value = row.id;
  document.getElementById('editStudentName').value = row.student_name || '';

  // Map DB columns to inputs
  document.getElementById('editHV').value = row.sdt_hv || '';
  document.getElementById('editCha').value = row.sdt_cha || '';
  document.getElementById('editMe').value = row.sdt_me || '';
  document.getElementById('editChi').value = row.sdt_chi || '';
  document.getElementById('editBa').value = row.sdt_ba || '';
  document.getElementById('editOng').value = row.sdt_ong || '';

  modal.classList.add('active');

  // Setup Save Button
  const saveBtn = document.getElementById('saveEditBtn');
  // Remove old listeners to prevent duplicates
  const newSaveBtn = saveBtn.cloneNode(true);
  saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);

  newSaveBtn.addEventListener('click', async () => {
    await saveEditedTask();
  });

  // Setup Cancel Button
  const cancelBtn = document.getElementById('cancelEditBtn');
  cancelBtn.onclick = () => modal.classList.remove('active');
}

async function saveEditedTask() {
  const id = document.getElementById('editRowId').value;
  const btn = document.getElementById('saveEditBtn');

  if (!client) return;
  const { data: { session } } = await client.auth.getSession();
  if (!session) return alert("Vui lòng đăng nhập.");

  const phoneData = {
    'SĐT HV': document.getElementById('editHV').value.trim(),
    'SĐT Cha': document.getElementById('editCha').value.trim(),
    'SĐT Mẹ': document.getElementById('editMe').value.trim(),
    'SĐT Chị': document.getElementById('editChi').value.trim(),
    'SĐT Bà': document.getElementById('editBa').value.trim(),
    'SĐT Ông': document.getElementById('editOng').value.trim(),
  };

  btn.textContent = "Đang lưu...";
  btn.disabled = true;

  try {
    const res = await fetch('/.netlify/functions/edit-task', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, phone_data: phoneData, access_token: session.access_token })
    });

    if (res.ok) {
      alert("Cập nhật thành công!");
      document.getElementById('editStudentModal').classList.remove('active');
      loadDashboardData(); // Refresh table
    } else {
      const err = await res.json();
      alert("Lỗi: " + (err.error || "Không thể lưu"));
    }
  } catch (e) {
    console.error(e);
    alert("Lỗi kết nối.");
  } finally {
    btn.textContent = "Lưu thay đổi";
    btn.disabled = false;
  }
}


/* ============================================================
   NEW: MISSING CONTACTS LOGIC (Fixed for column "email")
   ============================================================ */

async function checkMissingStudents(currentPhoneData) {
  if (!client) return;

  // 1. Fetch all students from 'danh_sach_hv'.
  // We select the column 'email' because that is the correct name in this table.
  const { data: allStudents, error } = await client
    .from('danh_sach_hv')
    .select('email');

  if (error || !allStudents) {
    console.error("Could not fetch danh_sach_hv:", error);
    return;
  }

  // 2. Extract emails from the phone_numbers list (currentPhoneData).
  // In the 'phone_numbers' table, the column is still 'student_email'.
  const existingEmails = new Set(currentPhoneData.map(row => row.student_email));

  // 3. Filter: Keep students found in 'danh_sach_hv' but NOT in 'existingEmails'.
  // We compare s.email (source) against existingEmails.
  const missing = allStudents.filter(s => s.email && !existingEmails.has(s.email));

  // 4. Update UI
  const statBox = document.getElementById('missingStats');
  const countSpan = document.getElementById('missingCount');
  const viewBtn = document.getElementById('btnViewMissing');

  if (missing.length > 0) {
    statBox.style.display = 'flex';
    countSpan.textContent = missing.length;

    // Attach click event to the button
    // Clone node to prevent duplicate listeners
    const newBtn = viewBtn.cloneNode(true);
    viewBtn.parentNode.replaceChild(newBtn, viewBtn);

    newBtn.addEventListener('click', () => {
      showMissingModal(missing);
    });
  } else {
    statBox.style.display = 'none';
  }
}

function showMissingModal(arg1, arg2, arg3) {
  const modal = document.getElementById('missingModal');
  const ul = document.getElementById('missingList');
  const closeBtn = document.getElementById('closeMissingModal');
  const titleEl = modal ? modal.querySelector('h3') : null;

  if (!modal || !ul) return;

  // --- Logic to handle different call signatures ---
  let listData = [];
  let titleText = 'Thông báo';

  if (Array.isArray(arg1)) {
    // Case 1: Called as showMissingModal(listOfObjects) -> Old logic
    listData = arg1;
    titleText = 'Học viên chưa có SĐT';
  } else {
    // Case 2: Called as showMissingModal(title, subtitle, listOfStrings) -> New logic
    titleText = arg1; // 1st arg is Title
    // arg2 is subtitle (ignored or you can add a P tag for it)
    listData = arg3 || []; // 3rd arg is the Array
  }

  // Update Modal Title
  if (titleEl) titleEl.textContent = titleText;

  // Clear previous list
  ul.innerHTML = '';

  // Populate list
  if (Array.isArray(listData)) {
    listData.forEach(item => {
      // Handle if item is String (new logic) or Object (old logic)
      const emailText = (typeof item === 'object' && item.email) ? item.email : item;

      const li = document.createElement('li');
      li.className = 'missing-item';
      li.innerHTML = `
        <i class="fa-regular fa-envelope"></i>
        <span>${emailText}</span>
      `;
      ul.appendChild(li);
    });
  }

  // Show modal
  modal.classList.add('active');

  // Handle close
  const closeModal = () => modal.classList.remove('active');

  // Clean up old listeners (Clone node trick)
  if (closeBtn) {
    const newCloseBtn = closeBtn.cloneNode(true);
    closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
    newCloseBtn.addEventListener('click', closeModal);
  }

  // Close on outside click
  modal.onclick = (e) => {
    if (e.target === modal) closeModal();
  };
}


/* ============================================================
   NEW: MISSING CONTACTS & TEACHERS LOGIC
   ============================================================ */

async function checkMissingData(currentPhoneData) {
  if (!client) return;

  const existingEmails = new Set(currentPhoneData.map(row => row.student_email));
  let hasMissingStudent = false;
  let hasMissingTeacher = false;

  // --- 1. CHECK MISSING STUDENTS (Top Right Badge Only) ---
  // UPDATED: Now we select archive_state too
  const { data: allStudents } = await client.from('danh_sach_hv').select('email, archive_state');

  if (allStudents) {
    // UPDATED: We exclude students if archive_state is true
    const missingStudents = allStudents.filter(s =>
      s.email &&
      !existingEmails.has(s.email) &&
      s.archive_state !== true
    );

    // Update Top Badge Student
    const topBadgeS = document.getElementById('topBadgeStudent');
    const topCountS = document.getElementById('topCountStudent');

    if (topBadgeS && missingStudents.length > 0) {
      hasMissingStudent = true;
      topBadgeS.style.display = 'flex';
      topCountS.textContent = missingStudents.length;
      // Add click listener
      const newBadge = topBadgeS.cloneNode(true);
      topBadgeS.parentNode.replaceChild(newBadge, topBadgeS);
      newBadge.onclick = () => showMissingModal('Học viên chưa có SĐT', 'Danh sách cần bổ sung:', missingStudents.map(s => s.email));
    } else if (topBadgeS) {
      topBadgeS.style.display = 'none';
    }
  }

  // --- 2. CHECK MISSING TEACHERS (Top Right Badge Only) ---
  const { data: allStaff } = await client
    .from('user_roles')
    .select('email, role')
    .in('role', ['Teacher', 'Admin', 'Super Admin']);

  if (allStaff) {
    const missingStaff = allStaff.filter(t => t.email && !existingEmails.has(t.email));

    // Update Top Badge Teacher
    const topBadgeT = document.getElementById('topBadgeTeacher');
    const topCountT = document.getElementById('topCountTeacher');

    if (topBadgeT && missingStaff.length > 0) {
      hasMissingTeacher = true;
      topBadgeT.style.display = 'flex';
      topCountT.textContent = missingStaff.length;
      // Add click listener
      const newBadgeT = topBadgeT.cloneNode(true);
      topBadgeT.parentNode.replaceChild(newBadgeT, topBadgeT);
      newBadgeT.onclick = () => showMissingModal('GV/Admin chưa có SĐT', 'Danh sách cần bổ sung:', missingStaff.map(t => t.email));
    } else if (topBadgeT) {
      topBadgeT.style.display = 'none';
    }
  }

  // --- 3. SHOW/HIDE TOP CONTAINER ---
  const container = document.getElementById('topBadges');
  if (container) {
    container.style.display = (hasMissingStudent || hasMissingTeacher) ? 'flex' : 'none';
  }
}


// --- NEW: Helper to load badges without rendering the whole table ---
async function refreshTopBadges() {
  if (!client) return;

  // Fetch data to calculate badges
  const { data, error } = await client
    .from('phone_numbers')
    .select('*');

  if (!error && data) {
    checkMissingData(data);     // Update Top Right Badges
    updateDashboardStats(data); // Update background stats
  }
}


// --- NEW: Fake 404 Error Screen for Unauthorized Users ---
function showFake404() {
  const overlay = document.createElement('div');
  // Use high z-index and solid white background to cover the whole app
  overlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:#ffffff; z-index:99999; display:grid; place-items:center; font-family:sans-serif;';

  overlay.innerHTML = `
    <div style="text-align:center; padding:20px;">
      <h1 style="font-size:80px; margin:0; color:#e5e7eb; font-weight:800;">404</h1>
      <h2 style="font-size:24px; margin:10px 0; color:#1f2937;">Page Not Found</h2>
      <p style="color:#6b7280; font-size:16px; margin-bottom:30px;">The requested resource could not be found on this server.</p>
      <button onclick="window.location.reload()" style="padding:10px 24px; background:#1f2937; color:#fff; border:none; border-radius:6px; cursor:pointer; font-weight:500;">Go Back</button>
    </div>
  `;

  document.body.appendChild(overlay);
}


/* ============================================================
   NEW: SECURITY KEY LOGIC
   ============================================================ */

function createSecurityModal() {
  if (document.getElementById('securityModal')) return;

  const modal = document.createElement('div');
  modal.id = 'securityModal';
  modal.className = 'modal-overlay';
  modal.style.zIndex = '3100';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 350px; text-align: center; padding: 24px;">
      <div style="width: 50px; height: 50px; background: #fee2e2; color: #dc2626; border-radius: 50%; display: inline-grid; place-items: center; font-size: 1.5rem; margin-bottom: 12px; margin-left: auto; margin-right: auto;">
        <i class="fa-solid fa-lock"></i>
      </div>
      <h3 style="margin: 0 0 8px 0; color: #1f2937;">Bảo mật</h3>
      
      <p id="securityMessage" style="color: #6b7280; font-size: 0.9rem; margin-bottom: 20px;">
        Vui lòng nhập mã xác thực để tiếp tục.
      </p>

      <div class="field" style="text-align: left;">
        <input type="password" id="securityKeyInput" placeholder="Nhập mã bảo mật..." autocomplete="off" style="text-align: center; letter-spacing: 2px; font-weight: bold;" />
      </div>
      
      <p id="securityError" style="color: #ef4444; font-size: 0.85rem; margin-top: -8px; margin-bottom: 16px; display: none;">
        <i class="fa-solid fa-circle-exclamation"></i> Mã không chính xác
      </p>

      <div style="display: flex; gap: 10px;">
        <button id="secCancelBtn" class="btn" style="background: #f3f4f6; color: #374151; border: 1px solid #e5e7eb; flex: 1;">Hủy</button>
        <button id="secConfirmBtn" class="btn" style="background: #dc2626; color: white; flex: 1;">Xác nhận</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById('secCancelBtn').addEventListener('click', () => {
    document.getElementById('securityModal').classList.remove('active');
  });
}

function showSecurityInput(rowId, label) {
  createSecurityModal();

  const modal = document.getElementById('securityModal');
  const input = document.getElementById('securityKeyInput');
  const errorMsg = document.getElementById('securityError');
  const confirmBtn = document.getElementById('secConfirmBtn');

  // NEW: Set specific text for CALLS
  const msgEl = document.getElementById('securityMessage');
  if (msgEl) msgEl.textContent = "Vui lòng nhập mã xác thực để thực hiện cuộc gọi.";

  // Reset UI
  input.value = '';
  errorMsg.style.display = 'none';
  modal.classList.add('active');
  setTimeout(() => input.focus(), 100);

  // Handle Verify Click
  const newBtn = confirmBtn.cloneNode(true);

  // FIX: Reset button state so it is clickable again
  newBtn.disabled = false;
  newBtn.textContent = "Xác nhận";

  confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);

  newBtn.addEventListener('click', async () => {
    const enteredKey = input.value.trim();
    if (!enteredKey) return;

    newBtn.textContent = "Đang kiểm tra...";
    newBtn.disabled = true;

    const isValid = await verifyKeyInDB(enteredKey);

    if (isValid) {
      modal.classList.remove('active');
      secureCall(rowId, label);
    } else {
      errorMsg.style.display = 'block';
      newBtn.textContent = "Xác nhận";
      newBtn.disabled = false;
    }
  });
}

async function verifyKeyInDB(key) {
  if (!key) return false;

  try {
    const response = await fetch('/.netlify/functions/verify-security-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, adminOnly: false })
    });

    if (!response.ok) {
      console.error("Security check failed");
      return false;
    }

    const result = await response.json();
    return result.valid === true;
  } catch (e) {
    console.error("Security verification error:", e);
    return false;
  }
}


/* ============================================================
   NEW: ADMIN ONLY SECURITY LOGIC
   ============================================================ */

function showAdminSecurityInput(onSuccessCallback) {
  createSecurityModal();

  const modal = document.getElementById('securityModal');
  const input = document.getElementById('securityKeyInput');
  const errorMsg = document.getElementById('securityError');
  const confirmBtn = document.getElementById('secConfirmBtn');

  // NEW: Set specific text for ADMIN TASKS
  const msgEl = document.getElementById('securityMessage');
  if (msgEl) msgEl.textContent = "Vui lòng nhập mã Admin để thực hiện tác vụ này.";

  // Reset UI
  input.value = '';
  errorMsg.style.display = 'none';
  modal.classList.add('active');
  setTimeout(() => input.focus(), 100);

  // Handle Verify Click
  const newBtn = confirmBtn.cloneNode(true);

  // FIX: Reset button state so it is clickable again
  newBtn.disabled = false;
  newBtn.textContent = "Xác nhận";

  confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);

  newBtn.addEventListener('click', async () => {
    const enteredKey = input.value.trim();
    if (!enteredKey) return;

    newBtn.textContent = "Đang kiểm tra...";
    newBtn.disabled = true;

    const isAdmin = await verifyAdminKeyInDB(enteredKey);

    if (isAdmin) {
      modal.classList.remove('active');
      if (typeof onSuccessCallback === 'function') onSuccessCallback();
    } else {
      errorMsg.style.display = 'block';
      newBtn.textContent = "Xác nhận";
      newBtn.disabled = false;
    }
  });
}

async function verifyAdminKeyInDB(key) {
  if (!key) return false;

  try {
    const response = await fetch('/.netlify/functions/verify-security-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, adminOnly: true })
    });

    if (!response.ok) {
      console.error("Admin check failed");
      return false;
    }

    const result = await response.json();
    return result.valid === true;
  } catch (e) {
    console.error("Admin verification error:", e);
    return false;
  }
}