// students.js - Separated JavaScript for Students Page

// Wait for VBot widget to be ready
customElements.whenDefined('vbot-quick-dial-widget').then(async () => {
  // Elements
  const widget = document.querySelector('#tansinh-widget');
  const callBtn = document.querySelector('#call-btn');
  const endBtn = document.querySelector('#end-btn');
  const phoneInput = document.querySelector('#phone-input');
  const statusBox = document.querySelector('#status-box');
  const turnstileContainer = document.querySelector('#turnstile-container');
  const inputSection = document.querySelector('#input-section');
  const callingSection = document.querySelector('#calling-section');
  const callTimer = document.querySelector('#call-timer');
  const callSubtitle = document.querySelector('#call-subtitle');
  const clearBtn = document.querySelector('#clear-btn');

  // Name popup elements
  const namePopupOverlay = document.querySelector('#name-popup-overlay');
  const namePopupInput = document.querySelector('#name-popup-input');
  const namePopupOk = document.querySelector('#name-popup-ok');
  const namePopupSkip = document.querySelector('#name-popup-skip');
  const blockedMessage = document.querySelector('#blocked-message');

  // State variables
  let visitorFingerprint = null;
  let token = '';
  let timerInterval = null;
  let callStartTime = null;
  let isUserBlocked = false;

  // ============================================
  // FINGERPRINT FUNCTIONS
  // ============================================

  const getFingerprint = async () => {
    try {
      const fp = await FingerprintJS.load();
      const result = await fp.get();
      visitorFingerprint = result.visitorId;
      console.log('Fingerprint ID:', visitorFingerprint);
      return visitorFingerprint;
    } catch (err) {
      console.error('Error getting fingerprint:', err);
      return getLocalStorageId();
    }
  };

  const getLocalStorageId = () => {
    let id = localStorage.getItem('tansinh_user_id');
    if (!id) {
      id = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('tansinh_user_id', id);
    }
    return id;
  };

  // ============================================
  // CALL LIMIT CHECK (via Netlify Function)
  // ============================================

  const checkCallLimit = async () => {
    try {
      const response = await fetch('/.netlify/functions/check-call-limit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          localstorage_id: getLocalStorageId(),
          fingerprint_id: visitorFingerprint
        })
      });
      const result = await response.json();
      console.log('Call limit check:', result);

      if (result.is_blocked) {
        isUserBlocked = true;
        inputSection.classList.add('hidden');
        blockedMessage.classList.remove('hidden');
        statusBox.classList.add('hidden');
        callSubtitle.innerHTML = 'Bạn đã đạt giới hạn cuộc gọi hôm nay.';
      }

      return result;
    } catch (err) {
      console.error('Error checking call limit:', err);
      return { is_blocked: false, call_count: 0 };
    }
  };

  // ============================================
  // HELPER FUNCTIONS
  // ============================================

  const setStatus = (message, type = 'info') => {
    statusBox.textContent = message;
    statusBox.className = 'status-box ' + type;
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  const startTimer = () => {
    callStartTime = Date.now();
    timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
      callTimer.textContent = formatTime(elapsed);
    }, 1000);
  };

  const stopTimer = () => {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  };

  const showCallingUI = () => {
    inputSection.classList.add('hidden');
    callingSection.classList.remove('hidden');
    callSubtitle.classList.add('hidden');
    callTimer.textContent = '00:00';
  };

  const showInputUI = () => {
    inputSection.classList.remove('hidden');
    callingSection.classList.add('hidden');
    callSubtitle.classList.remove('hidden');
    stopTimer();
  };

  // ============================================
  // LOG CALL TO DATABASE (via Netlify Function)
  // ============================================

  const logCallToDatabase = async (inputName) => {
    try {
      const response = await fetch('/.netlify/functions/log-widget-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input_name: inputName || '',
          localstorage_id: getLocalStorageId(),
          fingerprint_id: visitorFingerprint
        })
      });
      const result = await response.json();
      console.log('Call logged:', result);
    } catch (err) {
      console.error('Error logging call:', err);
    }
  };

  // ============================================
  // TURNSTILE VERIFICATION
  // ============================================

  const renderTurnstile = async () => {
    try {
      const { turnstileSiteKey, expiresAt } = await widget.init();
      setStatus('Vui lòng xác thực bên dưới', 'info');

      turnstileContainer.classList.remove('hidden');
      turnstileContainer.innerHTML = '';
      window.turnstile.render(turnstileContainer, {
        sitekey: turnstileSiteKey,
        callback: (t) => {
          token = t;
          callBtn.disabled = false;
          setStatus('Sẵn sàng gọi! Nhấn nút gọi bên trên.', 'success');
          turnstileContainer.classList.add('hidden');
        },
        'expired-callback': () => {
          token = '';
          callBtn.disabled = true;
          setStatus('Xác thực hết hạn, vui lòng thử lại.', 'error');
        },
      });
    } catch (e) {
      setStatus('Lỗi khởi tạo: ' + (e?.message || 'Không xác định'), 'error');
    }
  };

  // ============================================
  // CALL FUNCTIONS
  // ============================================

  const proceedWithCall = async (inputName) => {
    const phone = phoneInput.value.trim();

    try {
      setStatus('Đang kết nối...', 'calling');
      showCallingUI();
      logCallToDatabase(inputName);
      await widget.connect(phone, token);
    } catch (e) {
      setStatus('Lỗi: ' + (e?.message || 'Không xác định'), 'error');
      showInputUI();
      token = '';
      callBtn.disabled = true;
      renderTurnstile();
    }
  };

  // ============================================
  // EVENT HANDLERS
  // ============================================

  // Clear phone button
  clearBtn.onclick = () => {
    phoneInput.value = '';
    phoneInput.focus();
  };

  // Call button - show name popup first
  callBtn.onclick = async () => {
    if (!token) return;
    if (isUserBlocked) return;

    const phone = phoneInput.value.trim();
    if (!phone) {
      setStatus('Vui lòng nhập số điện thoại!', 'error');
      return;
    }

    // Check call limit EVERY time before allowing call
    setStatus('Đang kiểm tra...', 'info');
    callBtn.disabled = true;

    const limitResult = await checkCallLimit();

    if (limitResult.is_blocked || isUserBlocked) {
      return;
    }

    // Re-enable button if not blocked
    callBtn.disabled = false;
    setStatus('Sẵn sàng gọi! Nhấn nút gọi bên trên.', 'success');

    // Show name popup
    namePopupInput.value = '';
    namePopupOk.disabled = true;
    namePopupOverlay.classList.remove('hidden');
  };

  // Enable/disable OK button based on input length
  namePopupInput.addEventListener('input', () => {
    const nameLength = namePopupInput.value.trim().length;
    namePopupOk.disabled = nameLength < 3;
  });

  // Handle name popup OK button
  namePopupOk.onclick = async () => {
    const inputName = namePopupInput.value.trim();
    namePopupOverlay.classList.add('hidden');
    await proceedWithCall(inputName);
  };

  // Handle name popup Skip button
  namePopupSkip.onclick = async () => {
    namePopupOverlay.classList.add('hidden');
    await proceedWithCall('');
  };

  // End call button
  endBtn.onclick = () => widget.endCall();

  // ============================================
  // VBOT EVENT LISTENERS
  // ============================================

  widget.addEventListener('vbot:onCallProgress', () => {
    setStatus('Đang đổ chuông...', 'calling');
  });

  widget.addEventListener('vbot:onCallAccepted', () => {
    setStatus('Cuộc gọi đã kết nối!', 'success');
    startTimer();
  });

  widget.addEventListener('vbot:onCallEnded', () => {
    setStatus('Cuộc gọi đã kết thúc.', 'info');
    showInputUI();
    token = '';
    renderTurnstile();
  });

  widget.addEventListener('vbot:onCallFailed', (e) => {
    const reason = e.detail?.cause?.message || e.detail?.cause?.code || e.detail?.cause || 'Không xác định';
    setStatus('Gọi thất bại: ' + reason, 'error');
    showInputUI();
    token = '';
    renderTurnstile();
  });

  widget.addEventListener('vbot:onSessionExpired', () => {
    setStatus('Phiên hết hạn, đang khởi tạo lại...', 'error');
    token = '';
    renderTurnstile();
  });

  // ============================================
  // INITIALIZE
  // ============================================

  const initialize = async () => {
    await getFingerprint();
    await checkCallLimit();

    if (!isUserBlocked) {
      if (window.turnstile) {
        renderTurnstile();
      } else {
        window.addEventListener('load', renderTurnstile);
      }
    }
  };

  initialize();
});
