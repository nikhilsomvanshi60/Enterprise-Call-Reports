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

  // Edit & Active Reports Elements
  const editModeBanner = document.getElementById('editModeBanner');
  const editModeUser = document.getElementById('editModeUser');
  const cancelEditFormBtn = document.getElementById('cancelEditFormBtn');
  const refreshActiveBtn = document.getElementById('refreshActiveBtn');
  const activeReportsList = document.getElementById('activeReportsList');

  // Add Department Custom Elements
  const newDepartmentGroup = document.getElementById('newDepartmentGroup');
  const newDepartmentInput = document.getElementById('newDepartmentInput');
  const saveNewDepartmentBtn = document.getElementById('saveNewDepartmentBtn');

  // Forgot Passcode Elements
  const forgotPasscodeBtn = document.getElementById('forgotPasscodeBtn');
  const forgotPinModal = document.getElementById('forgotPinModal');
  const closeForgotPinModalBtn = document.getElementById('closeForgotPinModalBtn');
  const confirmForgotPinBtn = document.getElementById('confirmForgotPinBtn');

  // Change Passcode Modal Elements
  const mobileChangePinBtn = document.getElementById('mobileChangePinBtn');
  const mobileChangePinModal = document.getElementById('mobileChangePinModal');
  const closeMobileChangePinModalBtn = document.getElementById('closeMobileChangePinModalBtn');
  const cancelMobileChangePinBtn = document.getElementById('cancelMobileChangePinBtn');
  const mobilePinForm = document.getElementById('mobilePinForm');
  const mobileCurrentPin = document.getElementById('mobileCurrentPin');
  const mobileNewPin = document.getElementById('mobileNewPin');
  const mobileConfirmPin = document.getElementById('mobileConfirmPin');
  const mobilePinError = document.getElementById('mobilePinError');

  // Mobile Holiday Elements
  const mobileHolidaysSection = document.getElementById('mobileHolidaysSection');
  const mobileAddHolidayBtn = document.getElementById('mobileAddHolidayBtn');
  const mobileHolidayForm = document.getElementById('mobileHolidayForm');
  const mobileHolidayDate = document.getElementById('mobileHolidayDate');
  const mobileHolidayType = document.getElementById('mobileHolidayType');
  const mobileHolidayUserGroup = document.getElementById('mobileHolidayUserGroup');
  const mobileHolidayUser = document.getElementById('mobileHolidayUser');
  const mobileHolidayDesc = document.getElementById('mobileHolidayDesc');
  const mobileHolidayError = document.getElementById('mobileHolidayError');
  const cancelMobileHolidayBtn = document.getElementById('cancelMobileHolidayBtn');
  const saveMobileHolidayBtn = document.getElementById('saveMobileHolidayBtn');
  const mobileHolidaysList = document.getElementById('mobileHolidaysList');

  let editingReportId = null;
  let activeReportsData = [];
  let departmentsData = [];
  let mobileHolidaysData = [];

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
        fetchActiveReports(); // Load reports list!
        fetchDepartments(); // Load departments!
        fetchMobileHolidays(); // Load holidays!
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
      fetchActiveReports(); // Load reports list!
      fetchDepartments(); // Load departments!
      fetchMobileHolidays(); // Load holidays!
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

  // Dynamic Departments Functions
  async function fetchDepartments() {
    const token = getAuthToken();
    if (!token) return;

    try {
      const response = await fetch('/api/departments', {
        headers: {
          'Bypass-Tunnel-Reminder': 'true',
          'X-Auth-Token': token
        }
      });
      if (response.ok) {
        departmentsData = await response.json();
        populateDepartmentsDropdown();
      }
    } catch (err) {
      console.error('Error fetching departments:', err);
    }
  }

  function populateDepartmentsDropdown() {
    if (!departmentInput) return;
    departmentInput.innerHTML = '<option value="">Select Department</option>';
    departmentsData.forEach(dept => {
      const opt = document.createElement('option');
      opt.value = dept;
      opt.textContent = dept;
      departmentInput.appendChild(opt);
    });
    
    const newOpt = document.createElement('option');
    newOpt.value = '__new__';
    newOpt.textContent = '➕ Add New Department...';
    departmentInput.appendChild(newOpt);
  }

  departmentInput.addEventListener('change', () => {
    if (departmentInput.value === '__new__') {
      newDepartmentGroup.style.display = 'flex';
      newDepartmentInput.value = '';
      newDepartmentInput.focus();
    } else {
      newDepartmentGroup.style.display = 'none';
    }
  });

  saveNewDepartmentBtn.addEventListener('click', async () => {
    const newName = newDepartmentInput.value.trim();
    if (!newName) return;

    saveNewDepartmentBtn.disabled = true;
    saveNewDepartmentBtn.textContent = 'Adding...';

    try {
      const response = await fetch('/api/departments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Bypass-Tunnel-Reminder': 'true',
          'X-Auth-Token': getAuthToken()
        },
        body: JSON.stringify({ name: newName })
      });

      if (response.ok) {
        const result = await response.json();
        departmentsData = result.departments;
        populateDepartmentsDropdown();
        departmentInput.value = newName;
        newDepartmentGroup.style.display = 'none';
        newDepartmentInput.value = '';
      } else {
        const errData = await response.json();
        alert('Error: ' + (errData.error || 'Failed to add department'));
        departmentInput.value = '';
        newDepartmentGroup.style.display = 'none';
      }
    } catch (err) {
      console.error('Error adding department:', err);
      alert('Network error. Failed to add department.');
    } finally {
      saveNewDepartmentBtn.disabled = false;
      saveNewDepartmentBtn.textContent = 'Add';
    }
  });

  // Active Reports Functions
  async function fetchActiveReports() {
    const token = getAuthToken();
    if (!token) return;

    try {
      const response = await fetch('/api/reports', {
        headers: {
          'Bypass-Tunnel-Reminder': 'true',
          'X-Auth-Token': token
        }
      });

      if (response.ok) {
        const data = await response.json();
        activeReportsData = data.filter(r => r.status === 'Pending' || r.status === 'In Progress');
        renderActiveReportsList();
      }
    } catch (err) {
      console.error('Error fetching active reports:', err);
    }
  }

  function renderActiveReportsList() {
    if (!activeReportsList) return;

    if (activeReportsData.length === 0) {
      activeReportsList.innerHTML = `
        <p style="color: var(--text-muted); font-size: 0.85rem; text-align: center; margin: 1rem 0;">No active/pending reports found.</p>
      `;
      return;
    }

    activeReportsList.innerHTML = '';
    activeReportsData.forEach(item => {
      const itemEl = document.createElement('div');
      itemEl.className = 'active-report-item';
      itemEl.style.cssText = 'background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-color); padding: 0.75rem; border-radius: var(--radius-sm); display: flex; justify-content: space-between; align-items: center; gap: 0.5rem;';
      
      const itemStatusClass = item.status === 'In Progress' ? 'busy' : 'no-answer';
      
      itemEl.innerHTML = `
        <div style="flex: 1; min-width: 0;">
          <div style="display: flex; gap: 0.5rem; align-items: center; font-size: 0.72rem; color: var(--text-secondary); margin-bottom: 0.25rem;">
            <span class="dot ${itemStatusClass}" style="width: 8px; height: 8px;"></span>
            <strong style="color: var(--text-primary);">${escapeHTML(item.user)}</strong>
            <span>•</span>
            <span>${item.department}</span>
            <span>•</span>
            <span>${new Date(item.dateTime).toLocaleDateString()}</span>
          </div>
          <div style="font-size: 0.8rem; font-weight: 500; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            ${escapeHTML(item.problems)}
          </div>
        </div>
        <button type="button" class="btn btn-secondary edit-active-btn" data-id="${item.id}" style="padding: 0.35rem 0.65rem; font-size: 0.75rem; flex-shrink: 0; margin-top: 0; border-radius: 6px;">
          ✏️ Edit
        </button>
      `;
      activeReportsList.appendChild(itemEl);
    });

    activeReportsList.querySelectorAll('.edit-active-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const report = activeReportsData.find(r => r.id === id);
        if (report) {
          startEditing(report);
        }
      });
    });
  }

  function startEditing(report) {
    editingReportId = report.id;

    dateTimeInput.value = report.dateTime ? report.dateTime.slice(0, 16) : '';
    userInput.value = report.user || '';
    departmentInput.value = report.department || '';
    problemsTextarea.value = report.problems || '';
    actionTextarea.value = report.action || '';
    remarksTextarea.value = report.remarks || '';
    callStatusInput.value = report.status || 'Pending';
    
    if (report.resolveDate) {
      resolveDateInput.value = report.resolveDate;
    } else {
      resolveDateInput.value = '';
    }

    statusGrid.querySelectorAll('.status-pill').forEach(p => {
      p.classList.remove('active');
      if (p.getAttribute('data-status') === report.status) {
        p.classList.add('active');
      }
    });

    if (report.status === 'Resolved') {
      resolveDateGroup.style.display = 'block';
    } else {
      resolveDateGroup.style.display = 'none';
    }

    editModeUser.textContent = report.user;
    editModeBanner.style.display = 'flex';
    
    submitBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
      Update Report on PC
    `;

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEditing() {
    editingReportId = null;
    editModeBanner.style.display = 'none';
    newDepartmentGroup.style.display = 'none';
    newDepartmentInput.value = '';
    callForm.reset();
    
    statusGrid.querySelectorAll('.status-pill').forEach(p => p.classList.remove('active'));
    const defaultPill = statusGrid.querySelector('[data-status="Pending"]');
    if (defaultPill) defaultPill.classList.add('active');
    callStatusInput.value = 'Pending';
    resolveDateGroup.style.display = 'none';
    
    setDefaultDateTime();
    
    submitBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
      Send Report to PC
    `;
  }

  function escapeHTML(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
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
      return JSON.parse(localStorage.getItem('NIK_reports_queue')) || [];
    } catch (e) {
      return [];
    }
  }

  function queueReportOffline(reportData, isUpdate = false, id = null) {
    const queue = getOfflineQueue();
    if (isUpdate) {
      queue.push({ action: 'update', id: id, data: reportData });
    } else {
      queue.push(reportData);
    }
    localStorage.setItem('NIK_reports_queue', JSON.stringify(queue));
  }

  async function syncOfflineQueue() {
    const queue = getOfflineQueue();
    if (queue.length === 0) return;

    console.log(`🔄 Syncing ${queue.length} offline report(s)...`);
    
    for (const report of queue) {
      try {
        const isUpdate = report.action === 'update';
        const url = isUpdate ? `/api/reports/${report.id}` : '/api/reports';
        const method = isUpdate ? 'PUT' : 'POST';
        const bodyData = isUpdate ? report.data : report;

        const response = await fetch(url, {
          method: method,
          headers: {
            'Content-Type': 'application/json',
            'Bypass-Tunnel-Reminder': 'true',
            'X-Auth-Token': getAuthToken()
          },
          body: JSON.stringify(bodyData)
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

    localStorage.setItem('NIK_reports_queue', '[]');
    showToastNotification(`✅ ${queue.length} reports successfully synced to PC!`);
    fetchActiveReports();
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

    if (departmentInput.value === '__new__') {
      alert('⚠️ Please save your new department name first by clicking the "Add" button, or select a different department.');
      newDepartmentInput.focus();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = editingReportId ? 'Updating...' : 'Sending...';

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
      queueReportOffline(data, !!editingReportId, editingReportId);
      submitBtn.disabled = false;
      submitBtn.innerHTML = editingReportId ? 'Update Report on PC' : 'Send Report to PC';
      
      successOverlay.querySelector('h2').textContent = editingReportId ? 'Update Saved Offline!' : 'Saved Offline!';
      successOverlay.querySelector('p').textContent = 'No internet connection. Saved locally and will sync when connection is restored.';
      successOverlay.classList.add('show');
      return;
    }

    try {
      const url = editingReportId ? `/api/reports/${editingReportId}` : '/api/reports';
      const method = editingReportId ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method: method,
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
        submitBtn.innerHTML = editingReportId ? 'Update Report on PC' : 'Send Report to PC';
        return;
      }

      if (response.ok) {
        successOverlay.querySelector('h2').textContent = editingReportId ? 'Report Updated!' : 'Report Sent!';
        successOverlay.querySelector('p').textContent = editingReportId 
          ? 'Your report has been successfully updated on the PC database.'
          : 'Your report has been successfully saved to your PC database.';
        successOverlay.classList.add('show');
        
        if (editingReportId) {
          editingReportId = null;
          editModeBanner.style.display = 'none';
        }
        
        fetchActiveReports();
        fetchDepartments();
        resetInactivityTimer();
      } else {
        const errorData = await response.json();
        alert('Failed: ' + (errorData.error || 'Server error'));
      }
    } catch (err) {
      console.error('Network error, saving locally:', err);
      queueReportOffline(data, !!editingReportId, editingReportId);
      successOverlay.querySelector('h2').textContent = editingReportId ? 'Update Saved Offline!' : 'Saved Offline (Network Error)!';
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
    cancelEditing();
    successOverlay.classList.remove('show');
    resetInactivityTimer();
  });

  cancelEditFormBtn.addEventListener('click', cancelEditing);
  refreshActiveBtn.addEventListener('click', fetchActiveReports);

  // Forgot PIN Listeners
  forgotPasscodeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    forgotPinModal.style.display = 'flex';
  });
  closeForgotPinModalBtn.addEventListener('click', () => {
    forgotPinModal.style.display = 'none';
  });
  confirmForgotPinBtn.addEventListener('click', () => {
    forgotPinModal.style.display = 'none';
  });
  forgotPinModal.addEventListener('click', (e) => {
    if (e.target === forgotPinModal) forgotPinModal.style.display = 'none';
  });

  // Change PIN Listeners (Mobile View)
  mobileChangePinBtn.addEventListener('click', () => {
    mobileChangePinModal.style.display = 'flex';
    mobileCurrentPin.focus();
  });

  function closeMobilePinModal() {
    mobileChangePinModal.style.display = 'none';
    mobilePinForm.reset();
    mobilePinError.style.display = 'none';
  }

  closeMobileChangePinModalBtn.addEventListener('click', closeMobilePinModal);
  cancelMobileChangePinBtn.addEventListener('click', closeMobilePinModal);
  mobileChangePinModal.addEventListener('click', (e) => {
    if (e.target === mobileChangePinModal) closeMobilePinModal();
  });

  mobilePinForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const currentPin = mobileCurrentPin.value;
    const newPin = mobileNewPin.value;
    const confirmPin = mobileConfirmPin.value;

    mobilePinError.style.display = 'none';

    if (newPin !== confirmPin) {
      mobilePinError.textContent = '❌ New PIN and Confirm PIN do not match!';
      mobilePinError.style.display = 'block';
      return;
    }

    try {
      const response = await fetch('/api/security/update-pin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Bypass-Tunnel-Reminder': 'true',
          'X-Auth-Token': getAuthToken()
        },
        body: JSON.stringify({ currentPin, newPin })
      });

      const result = await response.json();

      if (response.ok) {
        localStorage.setItem('auth_pin', newPin); // Save new pin in browser
        closeMobilePinModal();
        showToastNotification('✅ Security PIN updated successfully!');
        resetInactivityTimer();
      } else {
        mobilePinError.textContent = `❌ ${result.error || 'Failed to update PIN.'}`;
        mobilePinError.style.display = 'block';
      }
    } catch (err) {
      console.error('Error updating PIN:', err);
      mobilePinError.textContent = '❌ Network error. Could not reach server.';
      mobilePinError.style.display = 'block';
    }
  });

  // Mobile Holidays & Leaves Logic
  // =========================================================================
  async function fetchMobileHolidays() {
    const token = getAuthToken();
    if (!token) return;
    try {
      const response = await fetch('/api/holidays', {
        headers: { 'Bypass-Tunnel-Reminder': 'true', 'X-Auth-Token': token }
      });
      if (response.ok) {
        mobileHolidaysData = await response.json();
        renderMobileHolidays();
      }
    } catch (err) {
      if (mobileHolidaysList) {
        mobileHolidaysList.innerHTML = '<p style="color:var(--text-muted);font-size:0.82rem;text-align:center;margin:1rem 0;">Unable to load holidays (offline?).</p>';
      }
    }
  }

  function renderMobileHolidays() {
    if (!mobileHolidaysList) return;
    if (mobileHolidaysData.length === 0) {
      mobileHolidaysList.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;text-align:center;margin:1rem 0;">Koi chuti declare nahi ki gayi hai.</p>';
      return;
    }

    const sorted = [...mobileHolidaysData].sort((a, b) => new Date(b.date) - new Date(a.date));
    mobileHolidaysList.innerHTML = '';

    sorted.forEach(h => {
      const card = document.createElement('div');
      card.style.cssText = 'background:rgba(245,158,11,0.07);border:1px solid rgba(245,158,11,0.25);border-radius:10px;padding:0.75rem 1rem;display:flex;flex-direction:column;gap:0.3rem;position:relative;';

      const typeColor = h.type === 'Personal Leave' ? '#ef4444' : h.type === 'Festival Holiday' ? '#f59e0b' : '#6366f1';
      const typeIcon = h.type === 'Personal Leave' ? '🏥' : h.type === 'Festival Holiday' ? '🎉' : '🏢';

      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.5rem;">
          <div>
            <div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:0.15rem;">📅 ${h.date}</div>
            <div style="font-size:0.92rem;font-weight:600;color:var(--text-primary);">${h.description}</div>
            <div style="display:flex;gap:0.5rem;align-items:center;margin-top:0.35rem;flex-wrap:wrap;">
              <span style="font-size:0.75rem;font-weight:600;padding:0.1rem 0.45rem;border-radius:20px;background:${typeColor}22;color:${typeColor};border:1px solid ${typeColor}44;">${typeIcon} ${h.type}</span>
              <span style="font-size:0.78rem;color:var(--text-muted);">${h.user === 'All' ? '👥 All Staff' : '👤 ' + h.user}</span>
            </div>
          </div>
          <button data-id="${h.id}" class="mob-del-holiday" title="Delete" style="background:none;border:none;cursor:pointer;font-size:1.1rem;color:var(--text-muted);flex-shrink:0;padding:0.2rem;">🗑️</button>
        </div>
      `;
      mobileHolidaysList.appendChild(card);
    });

    mobileHolidaysList.querySelectorAll('.mob-del-holiday').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (confirm('Is chuti ko delete karna chahte hain?')) {
          await deleteMobileHoliday(id);
        }
      });
    });
  }

  async function deleteMobileHoliday(id) {
    const token = getAuthToken();
    if (!token) return;
    try {
      const response = await fetch(`/api/holidays/${id}`, {
        method: 'DELETE',
        headers: { 'Bypass-Tunnel-Reminder': 'true', 'X-Auth-Token': token }
      });
      if (response.ok) {
        await fetchMobileHolidays();
        showToastNotification('🗑️ Holiday/leave deleted.');
      } else {
        const err = await response.json();
        showToastNotification('❌ ' + (err.error || 'Delete failed.'));
      }
    } catch (err) {
      showToastNotification('❌ Network error. Delete failed.');
    }
  }

  // Toggle add-holiday form
  mobileAddHolidayBtn.addEventListener('click', () => {
    const isVisible = mobileHolidayForm.style.display === 'flex';
    mobileHolidayForm.style.display = isVisible ? 'none' : 'flex';
    if (!isVisible) {
      // Set today's date as default
      const today = new Date().toISOString().slice(0, 10);
      mobileHolidayDate.value = today;
      mobileHolidayError.style.display = 'none';
    }
  });

  cancelMobileHolidayBtn.addEventListener('click', () => {
    mobileHolidayForm.style.display = 'none';
    mobileHolidayError.style.display = 'none';
  });

  mobileHolidayType.addEventListener('change', () => {
    if (mobileHolidayType.value === 'Personal Leave') {
      mobileHolidayUserGroup.style.display = 'flex';
    } else {
      mobileHolidayUserGroup.style.display = 'none';
      mobileHolidayUser.value = '';
    }
  });

  saveMobileHolidayBtn.addEventListener('click', async () => {
    const date = mobileHolidayDate.value;
    const type = mobileHolidayType.value;
    const user = mobileHolidayUser.value.trim() || 'All';
    const description = mobileHolidayDesc.value.trim();

    if (!date || !description) {
      mobileHolidayError.textContent = '❌ Date aur Reason zaroor bharein.';
      mobileHolidayError.style.display = 'block';
      return;
    }

    saveMobileHolidayBtn.disabled = true;
    saveMobileHolidayBtn.textContent = 'Saving...';

    try {
      const response = await fetch('/api/holidays', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Bypass-Tunnel-Reminder': 'true',
          'X-Auth-Token': getAuthToken()
        },
        body: JSON.stringify({ date, type, user, description })
      });

      const result = await response.json();
      if (response.ok) {
        mobileHolidayForm.style.display = 'none';
        mobileHolidayDate.value = '';
        mobileHolidayDesc.value = '';
        mobileHolidayUser.value = '';
        mobileHolidayError.style.display = 'none';
        await fetchMobileHolidays();
        showToastNotification('✅ Holiday/Leave saved!');
      } else {
        mobileHolidayError.textContent = '❌ ' + (result.error || 'Server error.');
        mobileHolidayError.style.display = 'block';
      }
    } catch (err) {
      mobileHolidayError.textContent = '❌ Network error. Please try again.';
      mobileHolidayError.style.display = 'block';
    } finally {
      saveMobileHolidayBtn.disabled = false;
      saveMobileHolidayBtn.textContent = 'Save Holiday';
    }
  });

  // Run Auth Check on startup
  initAuth();
});
