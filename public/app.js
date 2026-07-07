document.addEventListener('DOMContentLoaded', () => {
  // ============================================================
  // DOM ELEMENTS
  // ============================================================

  // Auth
  const passcodeOverlay   = document.getElementById('passcodeOverlay');
  const passcodeInput     = document.getElementById('passcodeInput');
  const verifyPasscodeBtn = document.getElementById('verifyPasscodeBtn');
  const passcodeError     = document.getElementById('passcodeError');

  // Main Form
  const callForm          = document.getElementById('callForm');
  const dateTimeInput     = document.getElementById('dateTime');
  const statusGrid        = document.getElementById('statusGrid');
  const callStatusInput   = document.getElementById('callStatus');
  const resolveDateGroup  = document.getElementById('resolveDateGroup');
  const resolveDateInput  = document.getElementById('resolveDate');
  const userInput         = document.getElementById('user');
  const departmentInput   = document.getElementById('department');
  const problemsTextarea  = document.getElementById('problems');
  const actionTextarea    = document.getElementById('action');
  const remarksTextarea   = document.getElementById('remarks');
  const speechLangSelect  = document.getElementById('speechLang');
  const submitBtn         = document.getElementById('submitBtn');

  // Voice Dictation
  const dictateProblemsBtn = document.getElementById('dictateProblemsBtn');
  const dictateActionBtn   = document.getElementById('dictateActionBtn');
  const dictateRemarksBtn  = document.getElementById('dictateRemarksBtn');
  const problemsWave       = document.getElementById('problemsWave');
  const actionWave         = document.getElementById('actionWave');
  const remarksWave        = document.getElementById('remarksWave');

  // Theme & Banner
  const themeToggleBtn  = document.getElementById('themeToggleBtn');
  const themeToggleIcon = document.getElementById('themeToggleIcon');
  const themeToggleText = document.getElementById('themeToggleText');
  const offlineBanner   = document.getElementById('offlineBanner');

  // Overlay
  const successOverlay  = document.getElementById('successOverlay');
  const newLogBtn       = document.getElementById('newLogBtn');

  // Edit & Active Reports
  const editModeBanner    = document.getElementById('editModeBanner');
  const editModeUser      = document.getElementById('editModeUser');
  const cancelEditFormBtn = document.getElementById('cancelEditFormBtn');
  const refreshActiveBtn  = document.getElementById('refreshActiveBtn');
  const activeReportsList = document.getElementById('activeReportsList');

  // Add Department
  const newDepartmentGroup   = document.getElementById('newDepartmentGroup');
  const newDepartmentInput   = document.getElementById('newDepartmentInput');
  const saveNewDepartmentBtn = document.getElementById('saveNewDepartmentBtn');

  // Forgot Passcode
  const forgotPasscodeBtn      = document.getElementById('forgotPasscodeBtn');
  const forgotPinModal         = document.getElementById('forgotPinModal');
  const closeForgotPinModalBtn = document.getElementById('closeForgotPinModalBtn');
  const confirmForgotPinBtn    = document.getElementById('confirmForgotPinBtn');

  // Change PIN Modal
  const mobileChangePinBtn          = document.getElementById('mobileChangePinBtn');
  const mobileChangePinModal        = document.getElementById('mobileChangePinModal');
  const closeMobileChangePinModalBtn= document.getElementById('closeMobileChangePinModalBtn');
  const cancelMobileChangePinBtn    = document.getElementById('cancelMobileChangePinBtn');
  const mobilePinForm               = document.getElementById('mobilePinForm');
  const mobileCurrentPin            = document.getElementById('mobileCurrentPin');
  const mobileNewPin                = document.getElementById('mobileNewPin');
  const mobileConfirmPin            = document.getElementById('mobileConfirmPin');
  const mobilePinError              = document.getElementById('mobilePinError');

  // Holidays Section
  const mobileAddHolidayBtn    = document.getElementById('mobileAddHolidayBtn');
  const mobileHolidayForm      = document.getElementById('mobileHolidayForm');
  const mobileHolidayDate      = document.getElementById('mobileHolidayDate');
  const mobileHolidayType      = document.getElementById('mobileHolidayType');
  const mobileHolidayUserGroup = document.getElementById('mobileHolidayUserGroup');
  const mobileHolidayUser      = document.getElementById('mobileHolidayUser');
  const mobileHolidayDesc      = document.getElementById('mobileHolidayDesc');
  const mobileHolidayError     = document.getElementById('mobileHolidayError');
  const cancelMobileHolidayBtn = document.getElementById('cancelMobileHolidayBtn');
  const saveMobileHolidayBtn   = document.getElementById('saveMobileHolidayBtn');
  const mobileHolidaysList     = document.getElementById('mobileHolidaysList');

  // ============================================================
  // STATE
  // ============================================================
  let editingReportId   = null;
  let activeReportsData = [];
  let departmentsData   = [];
  let mobileHolidaysData= [];

  // ============================================================
  // AUTH TOKEN
  // ============================================================
  function getAuthToken() {
    return localStorage.getItem('auth_pin') || '';
  }

  // ============================================================
  // INACTIVITY TIMER (10 min)
  // ============================================================
  let inactivityTimeout;
  const INACTIVITY_TIME = 10 * 60 * 1000;

  function resetInactivityTimer() {
    clearTimeout(inactivityTimeout);
    if (getAuthToken()) {
      inactivityTimeout = setTimeout(handleSessionExpiry, INACTIVITY_TIME);
    }
  }

  function handleSessionExpiry() {
    localStorage.removeItem('auth_pin');
    showPasscodePrompt();
    if (passcodeError) {
      passcodeError.innerHTML = '⚠️ Session expired due to inactivity.<br>Please verify PIN again.';
      passcodeError.style.display = 'block';
    }
  }

  ['mousedown','mousemove','keypress','scroll','touchstart'].forEach(evt => {
    document.addEventListener(evt, resetInactivityTimer, { passive: true });
  });

  // ============================================================
  // AUTHENTICATION
  // ============================================================
  async function testAuthentication(pin) {
    try {
      const res = await fetch('/api/reports', {
        method: 'GET',
        headers: { 'Bypass-Tunnel-Reminder': 'true', 'X-Auth-Token': pin }
      });
      return res.ok;
    } catch {
      return !navigator.onLine && getAuthToken() !== '';
    }
  }

  async function initAuth() {
    const savedPin = getAuthToken();
    if (savedPin) {
      const valid = await testAuthentication(savedPin);
      if (valid) {
        unlockApp();
      } else {
        localStorage.removeItem('auth_pin');
        showPasscodePrompt();
      }
    } else {
      showPasscodePrompt();
    }
  }

  function unlockApp() {
    if (passcodeOverlay) {
      passcodeOverlay.style.opacity       = '0';
      passcodeOverlay.style.pointerEvents = 'none';
    }
    updateOnlineStatus();
    resetInactivityTimer();
    fetchDepartments();
    fetchActiveReports();
    fetchMobileHolidays();
  }

  function showPasscodePrompt() {
    if (passcodeOverlay) {
      passcodeOverlay.style.opacity       = '1';
      passcodeOverlay.style.pointerEvents = 'auto';
    }
    if (passcodeInput) { passcodeInput.value = ''; passcodeInput.focus(); }
    clearTimeout(inactivityTimeout);
  }

  async function handleVerifyPIN() {
    if (!passcodeInput) return;
    const pin = passcodeInput.value.trim();
    if (!pin) return;

    if (verifyPasscodeBtn) { verifyPasscodeBtn.disabled = true; verifyPasscodeBtn.textContent = 'Verifying...'; }
    if (passcodeError) passcodeError.style.display = 'none';

    const valid = await testAuthentication(pin);
    if (valid) {
      localStorage.setItem('auth_pin', pin);
      if (passcodeOverlay) {
        passcodeOverlay.style.transition  = 'opacity 0.3s ease';
        passcodeOverlay.style.opacity     = '0';
        passcodeOverlay.style.pointerEvents = 'none';
      }
      unlockApp();
    } else {
      if (passcodeError) { passcodeError.textContent = '❌ Invalid Security PIN! Try again.'; passcodeError.style.display = 'block'; }
      if (passcodeInput) { passcodeInput.value = ''; passcodeInput.focus(); }
    }
    if (verifyPasscodeBtn) { verifyPasscodeBtn.disabled = false; verifyPasscodeBtn.textContent = 'Verify PIN'; }
  }

  if (verifyPasscodeBtn) verifyPasscodeBtn.addEventListener('click', handleVerifyPIN);
  if (passcodeInput)     passcodeInput.addEventListener('keypress', e => { if (e.key === 'Enter') handleVerifyPIN(); });

  // ============================================================
  // DATE & TIME DEFAULT
  // ============================================================
  function setDefaultDateTime() {
    if (!dateTimeInput) return;
    const now = new Date();
    const local = new Date(now - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    dateTimeInput.value = local;
  }
  setDefaultDateTime();

  // ============================================================
  // THEME TOGGLE
  // ============================================================
  const savedTheme = localStorage.getItem('theme') || 'dark';
  if (savedTheme === 'light') {
    document.body.classList.add('light-theme');
    if (themeToggleIcon) themeToggleIcon.textContent = '☀️';
    if (themeToggleText) themeToggleText.textContent = 'Light Mode';
  }

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      document.body.classList.toggle('light-theme');
      const isLight = document.body.classList.contains('light-theme');
      localStorage.setItem('theme', isLight ? 'light' : 'dark');
      if (themeToggleIcon) themeToggleIcon.textContent = isLight ? '☀️' : '🌙';
      if (themeToggleText) themeToggleText.textContent = isLight ? 'Light Mode' : 'Dark Mode';
    });
  }

  // ============================================================
  // STATUS PILL SELECTION
  // ============================================================
  if (statusGrid) {
    statusGrid.addEventListener('click', e => {
      const pill = e.target.closest('.status-pill');
      if (!pill) return;
      statusGrid.querySelectorAll('.status-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const status = pill.getAttribute('data-status');
      if (callStatusInput) callStatusInput.value = status;
      if (status === 'Resolved') {
        if (resolveDateGroup) resolveDateGroup.style.display = 'block';
        if (resolveDateInput) resolveDateInput.value = new Date().toISOString().split('T')[0];
      } else {
        if (resolveDateGroup) resolveDateGroup.style.display = 'none';
        if (resolveDateInput) resolveDateInput.value = '';
      }
    });
  }

  // ============================================================
  // VOICE DICTATION
  // ============================================================
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    if (dictateProblemsBtn && problemsTextarea && problemsWave) setupDictation(dictateProblemsBtn, problemsTextarea, problemsWave);
    if (dictateActionBtn  && actionTextarea   && actionWave)    setupDictation(dictateActionBtn,   actionTextarea,   actionWave);
    if (dictateRemarksBtn && remarksTextarea  && remarksWave)   setupDictation(dictateRemarksBtn,  remarksTextarea,  remarksWave);
  } else {
    [dictateProblemsBtn, dictateActionBtn, dictateRemarksBtn].forEach(btn => {
      if (btn) { btn.style.opacity = '0.3'; btn.title = 'Voice typing not supported in this browser'; }
    });
  }

  function setupDictation(button, textarea, waveEl) {
    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.interimResults = false;
    let isRec = false;

    rec.onstart  = () => { isRec = true;  button.classList.add('recording');    waveEl.classList.add('active'); };
    rec.onresult = e  => { const t = e.results[0][0].transcript; textarea.value = textarea.value.trim() ? textarea.value.trim() + ' ' + t : t; textarea.dispatchEvent(new Event('input')); };
    rec.onerror  = () => stopRec();
    rec.onend    = () => stopRec();

    function startRec() { try { rec.lang = speechLangSelect ? speechLangSelect.value : 'en-IN'; rec.start(); } catch(e){} }
    function stopRec()  { isRec = false; button.classList.remove('recording'); waveEl.classList.remove('active'); try { rec.stop(); } catch(e){} }

    button.addEventListener('click', () => isRec ? stopRec() : startRec());
  }

  // ============================================================
  // DEPARTMENTS
  // ============================================================
  async function fetchDepartments() {
    const token = getAuthToken();
    if (!token) return;
    try {
      const res = await fetch('/api/departments', { headers: { 'Bypass-Tunnel-Reminder': 'true', 'X-Auth-Token': token } });
      if (res.ok) { departmentsData = await res.json(); populateDepartmentsDropdown(); }
    } catch (e) { console.error('fetchDepartments error:', e); }
  }

  function populateDepartmentsDropdown() {
    if (!departmentInput) return;
    departmentInput.innerHTML = '<option value="">Select Department</option>';
    departmentsData.forEach(d => {
      const o = document.createElement('option'); o.value = d; o.textContent = d;
      departmentInput.appendChild(o);
    });
    const addOpt = document.createElement('option'); addOpt.value = '__new__'; addOpt.textContent = '➕ Add New Department...';
    departmentInput.appendChild(addOpt);
  }

  if (departmentInput) {
    departmentInput.addEventListener('change', () => {
      if (departmentInput.value === '__new__') {
        if (newDepartmentGroup) { newDepartmentGroup.style.display = 'flex'; }
        if (newDepartmentInput) { newDepartmentInput.value = ''; newDepartmentInput.focus(); }
      } else {
        if (newDepartmentGroup) newDepartmentGroup.style.display = 'none';
      }
    });
  }

  if (saveNewDepartmentBtn) {
    saveNewDepartmentBtn.addEventListener('click', async () => {
      const name = newDepartmentInput ? newDepartmentInput.value.trim() : '';
      if (!name) return;
      saveNewDepartmentBtn.disabled = true; saveNewDepartmentBtn.textContent = 'Adding...';
      try {
        const res = await fetch('/api/departments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Bypass-Tunnel-Reminder': 'true', 'X-Auth-Token': getAuthToken() },
          body: JSON.stringify({ name })
        });
        if (res.ok) {
          const r = await res.json();
          departmentsData = r.departments;
          populateDepartmentsDropdown();
          if (departmentInput) departmentInput.value = name;
          if (newDepartmentGroup) newDepartmentGroup.style.display = 'none';
          if (newDepartmentInput) newDepartmentInput.value = '';
        } else {
          const err = await res.json();
          alert('Error: ' + (err.error || 'Failed to add department'));
          if (departmentInput) departmentInput.value = '';
          if (newDepartmentGroup) newDepartmentGroup.style.display = 'none';
        }
      } catch (e) { alert('Network error. Failed to add department.'); }
      finally { saveNewDepartmentBtn.disabled = false; saveNewDepartmentBtn.textContent = 'Add'; }
    });
  }

  // ============================================================
  // ACTIVE REPORTS (Pending / In Progress)
  // ============================================================
  async function fetchActiveReports() {
    const token = getAuthToken();
    if (!token) return;
    try {
      const res = await fetch('/api/reports', { headers: { 'Bypass-Tunnel-Reminder': 'true', 'X-Auth-Token': token } });
      if (res.ok) {
        const all = await res.json();
        activeReportsData = all.filter(r => r.status === 'Pending' || r.status === 'In Progress');
        renderActiveReportsList();
      }
    } catch (e) { console.error('fetchActiveReports error:', e); }
  }

  function renderActiveReportsList() {
    if (!activeReportsList) return;
    if (activeReportsData.length === 0) {
      activeReportsList.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;text-align:center;margin:1rem 0;">No active/pending reports found.</p>';
      return;
    }
    activeReportsList.innerHTML = '';
    activeReportsData.forEach(item => {
      const el = document.createElement('div');
      el.className = 'active-report-item';
      el.style.cssText = 'background:rgba(255,255,255,0.02);border:1px solid var(--border-color);padding:0.75rem;border-radius:var(--radius-sm);display:flex;justify-content:space-between;align-items:center;gap:0.5rem;';
      const statusClass = item.status === 'In Progress' ? 'busy' : 'no-answer';
      el.innerHTML = `
        <div style="flex:1;min-width:0;">
          <div style="display:flex;gap:0.5rem;align-items:center;font-size:0.72rem;color:var(--text-secondary);margin-bottom:0.25rem;">
            <span class="dot ${statusClass}" style="width:8px;height:8px;"></span>
            <strong style="color:var(--text-primary);">${escapeHTML(item.user)}</strong>
            <span>•</span><span>${escapeHTML(item.department)}</span>
            <span>•</span><span>${new Date(item.dateTime).toLocaleDateString()}</span>
          </div>
          <div style="font-size:0.8rem;font-weight:500;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHTML(item.problems)}</div>
        </div>
        <button type="button" class="btn btn-secondary edit-active-btn" data-id="${item.id}" style="padding:0.35rem 0.65rem;font-size:0.75rem;flex-shrink:0;margin-top:0;border-radius:6px;">✏️ Edit</button>
      `;
      activeReportsList.appendChild(el);
    });
    activeReportsList.querySelectorAll('.edit-active-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const report = activeReportsData.find(r => r.id === btn.getAttribute('data-id'));
        if (report) startEditing(report);
      });
    });
  }

  function startEditing(report) {
    editingReportId = report.id;
    if (dateTimeInput)     dateTimeInput.value     = report.dateTime ? report.dateTime.slice(0, 16) : '';
    if (userInput)         userInput.value         = report.user || '';
    if (departmentInput)   departmentInput.value   = report.department || '';
    if (problemsTextarea)  problemsTextarea.value  = report.problems || '';
    if (actionTextarea)    actionTextarea.value    = report.action || '';
    if (remarksTextarea)   remarksTextarea.value   = report.remarks || '';
    if (callStatusInput)   callStatusInput.value   = report.status || 'Pending';
    if (resolveDateInput)  resolveDateInput.value  = report.resolveDate || '';
    if (resolveDateGroup)  resolveDateGroup.style.display = report.status === 'Resolved' ? 'block' : 'none';

    if (statusGrid) {
      statusGrid.querySelectorAll('.status-pill').forEach(p => {
        p.classList.remove('active');
        if (p.getAttribute('data-status') === report.status) p.classList.add('active');
      });
    }
    if (editModeUser)   editModeUser.textContent    = report.user;
    if (editModeBanner) editModeBanner.style.display = 'flex';
    if (submitBtn) submitBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
      Update Report on PC
    `;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEditing() {
    editingReportId = null;
    if (editModeBanner) editModeBanner.style.display = 'none';
    if (newDepartmentGroup) newDepartmentGroup.style.display = 'none';
    if (newDepartmentInput) newDepartmentInput.value = '';
    if (callForm) callForm.reset();
    if (statusGrid) {
      statusGrid.querySelectorAll('.status-pill').forEach(p => p.classList.remove('active'));
      const def = statusGrid.querySelector('[data-status="Pending"]');
      if (def) def.classList.add('active');
    }
    if (callStatusInput)  callStatusInput.value = 'Pending';
    if (resolveDateGroup) resolveDateGroup.style.display = 'none';
    setDefaultDateTime();
    if (submitBtn) submitBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
      Send Report to PC
    `;
  }

  function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }

  // ============================================================
  // ONLINE / OFFLINE STATUS
  // ============================================================
  function updateOnlineStatus() {
    if (navigator.onLine) {
      if (offlineBanner) offlineBanner.classList.remove('active');
      if (getAuthToken()) syncOfflineQueue();
    } else {
      if (offlineBanner) offlineBanner.classList.add('active');
    }
  }
  window.addEventListener('online',  updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);

  // ============================================================
  // OFFLINE QUEUE
  // ============================================================
  function getOfflineQueue()   { try { return JSON.parse(localStorage.getItem('NIK_reports_queue')) || []; } catch { return []; } }
  function saveOfflineQueue(q) { localStorage.setItem('NIK_reports_queue', JSON.stringify(q)); }

  function queueReportOffline(reportData, isUpdate = false, id = null) {
    const q = getOfflineQueue();
    q.push({ data: reportData, isUpdate, id, timestamp: Date.now() });
    saveOfflineQueue(q);
    showToastNotification('📶 Saved offline. Will sync when connected.');
    if (successOverlay) successOverlay.classList.add('show');
  }

  async function syncOfflineQueue() {
    const q = getOfflineQueue();
    if (!q.length) return;
    for (const report of q) {
      try {
        const url    = report.isUpdate ? `/api/reports/${report.id}` : '/api/reports';
        const method = report.isUpdate ? 'PUT' : 'POST';
        const res    = await fetch(url, {
          method, body: JSON.stringify(report.isUpdate ? report.data : report),
          headers: { 'Content-Type': 'application/json', 'Bypass-Tunnel-Reminder': 'true', 'X-Auth-Token': getAuthToken() }
        });
        if (res.status === 401) { localStorage.removeItem('auth_pin'); showPasscodePrompt(); return; }
        if (!res.ok) throw new Error('sync failed');
      } catch { return; }
    }
    saveOfflineQueue([]);
    showToastNotification(`✅ ${q.length} reports synced to PC!`);
    fetchActiveReports();
  }

  // ============================================================
  // TOAST NOTIFICATION
  // ============================================================
  function showToastNotification(msg) {
    const t = document.createElement('div');
    t.className = 'offline-banner active';
    t.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:2000;background:var(--status-connected);color:#fff;padding:0.75rem 1.5rem;border-radius:8px;';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => { t.style.transition = 'opacity 0.5s ease'; t.style.opacity = '0'; setTimeout(() => t.remove(), 500); }, 4000);
  }

  // ============================================================
  // FORM SUBMIT (New + Edit)
  // ============================================================
  if (callForm) {
    callForm.addEventListener('submit', async e => {
      e.preventDefault();

      if (departmentInput && departmentInput.value === '__new__') {
        alert('⚠️ Please save the new department name by clicking "Add" button first.');
        if (newDepartmentInput) newDepartmentInput.focus();
        return;
      }

      if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = editingReportId ? 'Updating...' : 'Sending...'; }

      const data = {
        dateTime:    dateTimeInput   ? dateTimeInput.value   : '',
        user:        userInput       ? userInput.value       : '',
        department:  departmentInput ? departmentInput.value : '',
        problems:    problemsTextarea? problemsTextarea.value: '',
        action:      actionTextarea  ? actionTextarea.value  : '',
        status:      callStatusInput ? callStatusInput.value : 'Pending',
        resolveDate: resolveDateInput? resolveDateInput.value: '',
        remarks:     remarksTextarea ? remarksTextarea.value : ''
      };

      if (!navigator.onLine) {
        queueReportOffline(data, !!editingReportId, editingReportId);
        if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = editingReportId ? 'Update Report on PC' : 'Send Report to PC'; }
        return;
      }

      try {
        const url    = editingReportId ? `/api/reports/${editingReportId}` : '/api/reports';
        const method = editingReportId ? 'PUT' : 'POST';
        const res    = await fetch(url, {
          method, body: JSON.stringify(data),
          headers: { 'Content-Type': 'application/json', 'Bypass-Tunnel-Reminder': 'true', 'X-Auth-Token': getAuthToken() }
        });

        if (res.status === 401) { localStorage.removeItem('auth_pin'); showPasscodePrompt(); return; }

        if (res.ok) {
          if (successOverlay) {
            const h = successOverlay.querySelector('h2');
            const p = successOverlay.querySelector('p');
            if (h) h.textContent = editingReportId ? 'Report Updated!' : 'Report Sent!';
            if (p) p.textContent = editingReportId ? 'Report updated on PC successfully.' : 'Report saved to PC database.';
            successOverlay.classList.add('show');
          }
          if (editingReportId) { editingReportId = null; if (editModeBanner) editModeBanner.style.display = 'none'; }
          fetchActiveReports();
          fetchDepartments();
          resetInactivityTimer();
        } else {
          const err = await res.json();
          alert('Failed: ' + (err.error || 'Server error'));
        }
      } catch (err) {
        console.error('Submit error:', err);
        queueReportOffline(data, !!editingReportId, editingReportId);
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
            Send Report to PC
          `;
        }
      }
    });
  }

  // ============================================================
  // RESET FORM (Log Another)
  // ============================================================
  if (newLogBtn) newLogBtn.addEventListener('click', () => { cancelEditing(); if (successOverlay) successOverlay.classList.remove('show'); resetInactivityTimer(); });
  if (cancelEditFormBtn) cancelEditFormBtn.addEventListener('click', cancelEditing);
  if (refreshActiveBtn)  refreshActiveBtn.addEventListener('click',  fetchActiveReports);

  // ============================================================
  // FORGOT PIN MODAL
  // ============================================================
  if (forgotPasscodeBtn) {
    forgotPasscodeBtn.addEventListener('click', e => { e.preventDefault(); if (forgotPinModal) forgotPinModal.style.display = 'flex'; });
  }
  if (closeForgotPinModalBtn) closeForgotPinModalBtn.addEventListener('click', () => { if (forgotPinModal) forgotPinModal.style.display = 'none'; });
  if (confirmForgotPinBtn)    confirmForgotPinBtn.addEventListener('click',    () => { if (forgotPinModal) forgotPinModal.style.display = 'none'; });
  if (forgotPinModal) forgotPinModal.addEventListener('click', e => { if (e.target === forgotPinModal) forgotPinModal.style.display = 'none'; });

  // ============================================================
  // CHANGE PIN MODAL
  // ============================================================
  function openMobilePinModal()  { if (mobileChangePinModal) { mobileChangePinModal.style.display = 'flex'; if (mobilePinError) mobilePinError.style.display = 'none'; if (mobilePinForm) mobilePinForm.reset(); } }
  function closeMobilePinModal() { if (mobileChangePinModal) mobileChangePinModal.style.display = 'none'; }

  if (mobileChangePinBtn)           mobileChangePinBtn.addEventListener('click',         openMobilePinModal);
  if (closeMobileChangePinModalBtn) closeMobileChangePinModalBtn.addEventListener('click', closeMobilePinModal);
  if (cancelMobileChangePinBtn)     cancelMobileChangePinBtn.addEventListener('click',    closeMobilePinModal);
  if (mobileChangePinModal) mobileChangePinModal.addEventListener('click', e => { if (e.target === mobileChangePinModal) closeMobilePinModal(); });

  if (mobilePinForm) {
    mobilePinForm.addEventListener('submit', async e => {
      e.preventDefault();
      const currentPin = mobileCurrentPin ? mobileCurrentPin.value : '';
      const newPin     = mobileNewPin     ? mobileNewPin.value     : '';
      const confirmPin = mobileConfirmPin ? mobileConfirmPin.value : '';

      if (mobilePinError) mobilePinError.style.display = 'none';

      if (!currentPin || !newPin || !confirmPin) { if (mobilePinError) { mobilePinError.textContent = '❌ All fields are required.'; mobilePinError.style.display = 'block'; } return; }
      if (newPin !== confirmPin) { if (mobilePinError) { mobilePinError.textContent = '❌ New PINs do not match!'; mobilePinError.style.display = 'block'; } return; }
      if (newPin.length < 4)    { if (mobilePinError) { mobilePinError.textContent = '❌ PIN must be at least 4 characters.'; mobilePinError.style.display = 'block'; } return; }

      try {
        const res = await fetch('/api/security/update-pin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Bypass-Tunnel-Reminder': 'true', 'X-Auth-Token': getAuthToken() },
          body: JSON.stringify({ currentPin, newPin })
        });
        const result = await res.json();
        if (res.ok) {
          localStorage.setItem('auth_pin', newPin);
          closeMobilePinModal();
          showToastNotification('✅ Security PIN updated successfully!');
          resetInactivityTimer();
        } else {
          if (mobilePinError) { mobilePinError.textContent = '❌ ' + (result.error || 'Failed to update PIN.'); mobilePinError.style.display = 'block'; }
        }
      } catch {
        if (mobilePinError) { mobilePinError.textContent = '❌ Network error. Could not reach server.'; mobilePinError.style.display = 'block'; }
      }
    });
  }

  // ============================================================
  // HOLIDAYS & LEAVES (Mobile)
  // ============================================================
  async function fetchMobileHolidays() {
    const token = getAuthToken();
    if (!token) return;
    try {
      const res = await fetch('/api/holidays', { headers: { 'Bypass-Tunnel-Reminder': 'true', 'X-Auth-Token': token } });
      if (res.ok) { mobileHolidaysData = await res.json(); renderMobileHolidays(); }
    } catch {
      if (mobileHolidaysList) mobileHolidaysList.innerHTML = '<p style="color:var(--text-muted);font-size:0.82rem;text-align:center;margin:1rem 0;">Unable to load holidays (offline?).</p>';
    }
  }

  function renderMobileHolidays() {
    if (!mobileHolidaysList) return;
    if (!mobileHolidaysData.length) {
      mobileHolidaysList.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;text-align:center;margin:1rem 0;">Koi chuti declare nahi ki gayi hai.</p>';
      return;
    }
    const sorted = [...mobileHolidaysData].sort((a, b) => new Date(b.date) - new Date(a.date));
    mobileHolidaysList.innerHTML = '';
    sorted.forEach(h => {
      const card = document.createElement('div');
      card.style.cssText = 'background:rgba(245,158,11,0.07);border:1px solid rgba(245,158,11,0.25);border-radius:10px;padding:0.75rem 1rem;display:flex;flex-direction:column;gap:0.3rem;';
      const tc = h.type === 'Personal Leave' ? '#ef4444' : h.type === 'Festival Holiday' ? '#f59e0b' : '#6366f1';
      const ti = h.type === 'Personal Leave' ? '🏥' : h.type === 'Festival Holiday' ? '🎉' : '🏢';
      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.5rem;">
          <div>
            <div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:0.15rem;">📅 ${h.date}</div>
            <div style="font-size:0.92rem;font-weight:600;color:var(--text-primary);">${escapeHTML(h.description)}</div>
            <div style="display:flex;gap:0.5rem;align-items:center;margin-top:0.35rem;flex-wrap:wrap;">
              <span style="font-size:0.75rem;font-weight:600;padding:0.1rem 0.45rem;border-radius:20px;background:${tc}22;color:${tc};border:1px solid ${tc}44;">${ti} ${h.type}</span>
              <span style="font-size:0.78rem;color:var(--text-muted);">${h.user === 'All' ? '👥 All Staff' : '👤 ' + escapeHTML(h.user)}</span>
            </div>
          </div>
          <button data-hid="${h.id}" class="mob-del-hol" style="background:none;border:none;cursor:pointer;font-size:1.1rem;color:var(--text-muted);flex-shrink:0;padding:0.2rem;" title="Delete">🗑️</button>
        </div>
      `;
      mobileHolidaysList.appendChild(card);
    });
    mobileHolidaysList.querySelectorAll('.mob-del-hol').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (confirm('Is chuti ko delete karna chahte hain?')) await deleteMobileHoliday(btn.getAttribute('data-hid'));
      });
    });
  }

  async function deleteMobileHoliday(id) {
    const token = getAuthToken();
    if (!token) return;
    try {
      const res = await fetch(`/api/holidays/${id}`, { method: 'DELETE', headers: { 'Bypass-Tunnel-Reminder': 'true', 'X-Auth-Token': token } });
      if (res.ok) { await fetchMobileHolidays(); showToastNotification('🗑️ Holiday deleted.'); }
      else { const e = await res.json(); showToastNotification('❌ ' + (e.error || 'Delete failed.')); }
    } catch { showToastNotification('❌ Network error. Delete failed.'); }
  }

  if (mobileAddHolidayBtn) {
    mobileAddHolidayBtn.addEventListener('click', () => {
      if (!mobileHolidayForm) return;
      const showing = mobileHolidayForm.style.display === 'flex';
      mobileHolidayForm.style.display = showing ? 'none' : 'flex';
      if (!showing) {
        if (mobileHolidayDate)  mobileHolidayDate.value  = new Date().toISOString().slice(0, 10);
        if (mobileHolidayError) mobileHolidayError.style.display = 'none';
      }
    });
  }

  if (cancelMobileHolidayBtn) {
    cancelMobileHolidayBtn.addEventListener('click', () => {
      if (mobileHolidayForm)  mobileHolidayForm.style.display  = 'none';
      if (mobileHolidayError) mobileHolidayError.style.display = 'none';
    });
  }

  if (mobileHolidayType) {
    mobileHolidayType.addEventListener('change', () => {
      if (!mobileHolidayUserGroup) return;
      mobileHolidayUserGroup.style.display = mobileHolidayType.value === 'Personal Leave' ? 'flex' : 'none';
      if (mobileHolidayType.value !== 'Personal Leave' && mobileHolidayUser) mobileHolidayUser.value = '';
    });
  }

  if (saveMobileHolidayBtn) {
    saveMobileHolidayBtn.addEventListener('click', async () => {
      const date  = mobileHolidayDate ? mobileHolidayDate.value.trim()  : '';
      const type  = mobileHolidayType ? mobileHolidayType.value          : 'Personal Leave';
      const user  = (mobileHolidayUser ? mobileHolidayUser.value.trim() : '') || 'All';
      const desc  = mobileHolidayDesc ? mobileHolidayDesc.value.trim()  : '';

      if (!date || !desc) {
        if (mobileHolidayError) { mobileHolidayError.textContent = '❌ Date aur Reason zaroor bharein.'; mobileHolidayError.style.display = 'block'; }
        return;
      }
      saveMobileHolidayBtn.disabled = true; saveMobileHolidayBtn.textContent = 'Saving...';
      try {
        const res = await fetch('/api/holidays', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Bypass-Tunnel-Reminder': 'true', 'X-Auth-Token': getAuthToken() },
          body: JSON.stringify({ date, type, user, description: desc })
        });
        const result = await res.json();
        if (res.ok) {
          if (mobileHolidayForm)  mobileHolidayForm.style.display  = 'none';
          if (mobileHolidayDate)  mobileHolidayDate.value  = '';
          if (mobileHolidayDesc)  mobileHolidayDesc.value  = '';
          if (mobileHolidayUser)  mobileHolidayUser.value  = '';
          if (mobileHolidayError) mobileHolidayError.style.display = 'none';
          await fetchMobileHolidays();
          showToastNotification('✅ Holiday/Leave saved!');
        } else {
          if (mobileHolidayError) { mobileHolidayError.textContent = '❌ ' + (result.error || 'Server error.'); mobileHolidayError.style.display = 'block'; }
        }
      } catch {
        if (mobileHolidayError) { mobileHolidayError.textContent = '❌ Network error. Please try again.'; mobileHolidayError.style.display = 'block'; }
      } finally {
        saveMobileHolidayBtn.disabled = false; saveMobileHolidayBtn.textContent = 'Save Holiday';
      }
    });
  }

  // ============================================================
  // START APP
  // ============================================================
  initAuth();
});
