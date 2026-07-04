document.addEventListener('DOMContentLoaded', () => {
  // Authentication Elements
  const passcodeOverlay = document.getElementById('passcodeOverlay');
  const passcodeInput = document.getElementById('passcodeInput');
  const verifyPasscodeBtn = document.getElementById('verifyPasscodeBtn');
  const passcodeError = document.getElementById('passcodeError');

  // Input & Form Elements
  const callForm = document.getElementById('callForm');
  const dateTimeInput = document.getElementById('dateTime');
  const statusGrid = document.getElementById('statusGrid');
  const callStatusInput = document.getElementById('callStatus');
  const resolveDateGroup = document.getElementById('resolveDateGroup');
  const resolveDateInput = document.getElementById('resolveDate');
  
  const userInput = document.getElementById('user');
  const departmentInput = document.getElementById('department');
  const problemsTextarea = document.getElementById('problems');
  const actionTextarea = document.getElementById('action');
  const remarksTextarea = document.getElementById('remarks');
  const speechLangSelect = document.getElementById('speechLang');
  
  // Dictation Elements
  const dictateProblemsBtn = document.getElementById('dictateProblemsBtn');
  const dictateActionBtn = document.getElementById('dictateActionBtn');
  const dictateRemarksBtn = document.getElementById('dictateRemarksBtn');
  
  // Waveform Elements
  const problemsWave = document.getElementById('problemsWave');
  const actionWave = document.getElementById('actionWave');
  const remarksWave = document.getElementById('remarksWave');

  // Theme & Banner Elements
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const themeToggleIcon = document.getElementById('themeToggleIcon');
  const themeToggleText = document.getElementById('themeToggleText');
  const offlineBanner = document.getElementById('offlineBanner');
  
  // Overlay Elements
  const successOverlay = document.getElementById('successOverlay');
  const newLogBtn = document.getElementById('newLogBtn');
  const submitBtn = document.getElementById('submitBtn');

  // Global Auth PIN storage helper
  function getAuthToken() {
    return localStorage.getItem('auth_pin') || '';
  }

  // Sliding Inactivity Session Expiry (10 minutes)
  let inactivityTimeout;
  const INACTIVITY_TIME = 10 * 60 * 1000; // 10 minutes in ms

  function resetInactivityTimer() {
    clearTimeout(inactivityTimeout);
    if (getAuthToken()) {
      inactivityTimeout = setTimeout(handleSessionExpiry, INACTIVITY_TIME);
    }
  }

  function handleSessionExpiry() {
    localStorage.removeItem('auth_pin'); // Clear token
    showPasscodePrompt();
    passcodeError.innerHTML = '⚠️ Session expired due to inactivity.<br>Please verify PIN again.';
    passcodeError.style.display = 'block';
  }

  // Register events to monitor user activity and reset timeout
  const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
  activityEvents.forEach(evt => {
    document.addEventListener(evt, resetInactivityTimer, { passive: true });
  });

  // 1. Authenticate PIN with the PC backend
  async function testAuthentication(pin) {
    try {
      const response = await fetch('/api/reports', {
        method: 'GET',
        headers: {
          'Bypass-Tunnel-Reminder': 'true',
          'X-Auth-Token': pin
        }
      });
      return response.ok;
    } catch (err) {
      if (!navigator.onLine && getAuthToken() !== '') {
        return true;
      }
      return false;
    }
  }

  // Initialize Authentication Check
  async function initAuth() {
    const savedPin = getAuthToken();
    if (savedPin) {
      const isValid = await testAuthentication(savedPin);
      if (isValid) {
        passcodeOverlay.style.opacity = '0';
        passcodeOverlay.style.pointerEvents = 'none';
        updateOnlineStatus();
        resetInactivityTimer(); // Start inactivity clock
      } else {
        localStorage.removeItem('auth_pin');
        showPasscodePrompt();
      }
    } else {
      showPasscodePrompt();
    }
  }

  function showPasscodePrompt() {
    passcodeOverlay.style.opacity = '1';
    passcodeOverlay.style.pointerEvents = 'auto';
    passcodeInput.value = '';
    passcodeInput.focus();
    clearTimeout(inactivityTimeout); // Pause timer during passcode screen
  }

  // Handle Verify PIN Button Click
  async function handleVerifyPIN() {
    const enteredPin = passcodeInput.value.trim();
    if (!enteredPin) return;

    verifyPasscodeBtn.disabled = true;
    verifyPasscodeBtn.textContent = 'Verifying...';
    passcodeError.style.display = 'none';

    const isValid = await testAuthentication(enteredPin);
    if (isValid) {
      localStorage.setItem('auth_pin', enteredPin);
      passcodeOverlay.style.transition = 'opacity 0.3s ease';
      passcodeOverlay.style.opacity = '0';
      passcodeOverlay.style.pointerEvents = 'none';
      updateOnlineStatus();
      resetInactivityTimer(); // Start timer
    } else {
      passcodeError.textContent = '❌ Invalid Security PIN! Try again.';
      passcodeError.style.display = 'block';
      passcodeInput.value = '';
      passcodeInput.focus();
    }
    verifyPasscodeBtn.disabled = false;
    verifyPasscodeBtn.textContent = 'Verify PIN';
  }

  verifyPasscodeBtn.addEventListener('click', handleVerifyPIN);
  passcodeInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleVerifyPIN();
  });

  // 2. Initialize Date & Time to current local time
  function setDefaultDateTime() {
    const now = new Date();
    const tzOffset = now.getTimezoneOffset() * 60000; 
    const localISOTime = (new Date(now - tzOffset)).toISOString().slice(0, 16);
    dateTimeInput.value = localISOTime;
  }
  setDefaultDateTime();

  // 3. Light / Dark Theme Toggle
  const currentTheme = localStorage.getItem('theme') || 'dark';
  if (currentTheme === 'light') {
    document.body.classList.add('light-theme');
    themeToggleIcon.textContent = '☀️';
    themeToggleText.textContent = 'Light Mode';
  }

  themeToggleBtn.addEventListener('click', () => {
    document.body.classList.toggle('light-theme');
    const isLight = document.body.classList.contains('light-theme');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
    themeToggleIcon.textContent = isLight ? '☀️' : '🌙';
    themeToggleText.textContent = isLight ? 'Light Mode' : 'Dark Mode';
  });

  // 4. Status Pill Selection
  statusGrid.addEventListener('click', (e) => {
    const pill = e.target.closest('.status-pill');
    if (!pill) return;

    statusGrid.querySelectorAll('.status-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    
    const selectedStatus = pill.getAttribute('data-status');
    callStatusInput.value = selectedStatus;

    if (selectedStatus === 'Resolved') {
      resolveDateGroup.style.display = 'block';
      const today = new Date().toISOString().split('T')[0];
      resolveDateInput.value = today;
    } else {
      resolveDateGroup.style.display = 'none';
      resolveDateInput.value = '';
    }
  });

  // 5. Voice Dictation (Speech-to-Text) with Localized Language
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  
  if (SpeechRecognition) {
    setupDictation(dictateProblemsBtn, problemsTextarea, problemsWave);
    setupDictation(dictateActionBtn, actionTextarea, actionWave);
    setupDictation(dictateRemarksBtn, remarksTextarea, remarksWave);
  } else {
    [dictateProblemsBtn, dictateActionBtn, dictateRemarksBtn].forEach(btn => {
      btn.style.opacity = '0.3';
      btn.title = 'Voice typing not supported in this browser';
    });
  }

  function setupDictation(button, textarea, waveElement) {
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;

    let isRecording = false;

    recognition.onstart = () => {
      isRecording = true;
      button.classList.add('recording');
      waveElement.classList.add('active');
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      const currentValue = textarea.value.trim();
      textarea.value = currentValue 
        ? currentValue + ' ' + transcript 
        : transcript;
      textarea.dispatchEvent(new Event('input'));
    };

    recognition.onerror = () => {
      stopRecording();
    };

    recognition.onend = () => {
      stopRecording();
    };

    function startRecording() {
      try {
        // Dynamic Language selection (en-IN, en-US, hi-IN)
        recognition.lang = speechLangSelect.value || 'en-IN';
        recognition.start();
      } catch (err) {
        console.error(err);
      }
    }

    function stopRecording() {
      isRecording = false;
      button.classList.remove('recording');
      waveElement.classList.remove('active');
      try {
        recognition.stop();
      } catch (err) {
        // Already stopped
      }
    }

    button.addEventListener('click', () => {
      if (isRecording) {
        stopRecording();
      } else {
        startRecording();
      }
    });
  }

  // 6. Offline Queue & Synchronization
  function updateOnlineStatus() {
    if (navigator.onLine) {
      offlineBanner.classList.remove('active');
      if (getAuthToken()) {
        syncOfflineQueue();
      }
    } else {
      offlineBanner.classList.add('active');
    }
  }

  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);

  function getOfflineQueue() {
    try {
      return JSON.parse(localStorage.getItem('vash_reports_queue')) || [];
    } catch (e) {
      return [];
    }
  }

  function queueReportOffline(reportData) {
    const queue = getOfflineQueue();
    queue.push(reportData);
    localStorage.setItem('vash_reports_queue', JSON.stringify(queue));
  }

  async function syncOfflineQueue() {
    const queue = getOfflineQueue();
    if (queue.length === 0) return;

    console.log(`🔄 Syncing ${queue.length} offline report(s)...`);
    
    for (const report of queue) {
      try {
        const response = await fetch('/api/reports', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Bypass-Tunnel-Reminder': 'true',
            'X-Auth-Token': getAuthToken()
          },
          body: JSON.stringify(report)
        });

        if (response.status === 401) {
          localStorage.removeItem('auth_pin');
          showPasscodePrompt();
          return;
        }

        if (!response.ok) {
          throw new Error('Sync failed');
        }
      } catch (err) {
        console.error('Failed to sync report, keeping in queue:', err);
        return; 
      }
    }

    localStorage.setItem('vash_reports_queue', '[]');
    showToastNotification(`✅ ${queue.length} reports successfully synced to PC!`);
  }

  function showToastNotification(message) {
    const toast = document.createElement('div');
    toast.className = 'offline-banner active';
    toast.style.position = 'fixed';
    toast.style.bottom = '20px';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%)';
    toast.style.zIndex = '2000';
    toast.style.background = 'var(--status-connected)';
    toast.style.color = '#fff';
    toast.style.padding = '0.75rem 1.5rem';
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.style.transition = 'opacity 0.5s ease';
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 500);
    }, 4000);
  }

  // 7. Submit Form data
  callForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    submitBtn.disabled = true;
    submitBtn.innerHTML = 'Sending...';

    const data = {
      dateTime: dateTimeInput.value,
      user: userInput.value,
      department: departmentInput.value,
      problems: problemsTextarea.value,
      action: actionTextarea.value,
      status: callStatusInput.value,
      resolveDate: resolveDateInput.value,
      remarks: remarksTextarea.value
    };

    if (!navigator.onLine) {
      queueReportOffline(data);
      submitBtn.disabled = false;
      submitBtn.innerHTML = 'Send Report to PC';
      
      successOverlay.querySelector('h2').textContent = 'Saved Offline!';
      successOverlay.querySelector('p').textContent = 'No internet connection. Your report has been saved locally and will auto-sync when online.';
      successOverlay.classList.add('show');
      return;
    }

    try {
      const response = await fetch('/api/reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Bypass-Tunnel-Reminder': 'true',
          'X-Auth-Token': getAuthToken()
        },
        body: JSON.stringify(data)
      });

      if (response.status === 401) {
        localStorage.removeItem('auth_pin');
        showPasscodePrompt();
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Send Report to PC';
        return;
      }

      if (response.ok) {
        successOverlay.querySelector('h2').textContent = 'Report Sent!';
        successOverlay.querySelector('p').textContent = 'Your report has been successfully saved to your PC database.';
        successOverlay.classList.add('show');
        resetInactivityTimer(); // Reset timeout on successful activity
      } else {
        const errorData = await response.json();
        alert('Failed to send report: ' + (errorData.error || 'Server error'));
      }
    } catch (err) {
      console.error('Network error, saving locally:', err);
      queueReportOffline(data);
      successOverlay.querySelector('h2').textContent = 'Saved Offline (Network Error)!';
      successOverlay.querySelector('p').textContent = 'Could not reach server. Saved locally and will sync when connection is restored.';
      successOverlay.classList.add('show');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
        Send Report to PC
      `;
    }
  });

  // 8. Reset Form
  newLogBtn.addEventListener('click', () => {
    callForm.reset();
    statusGrid.querySelectorAll('.status-pill').forEach(p => p.classList.remove('active'));
    const defaultPill = statusGrid.querySelector('[data-status="Pending"]');
    if (defaultPill) defaultPill.classList.add('active');
    callStatusInput.value = 'Pending';
    resolveDateGroup.style.display = 'none';
    
    setDefaultDateTime();
    successOverlay.classList.remove('show');
    resetInactivityTimer();
  });

  // Run Auth Check on startup
  initAuth();
});
