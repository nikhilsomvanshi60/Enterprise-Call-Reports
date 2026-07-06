document.addEventListener('DOMContentLoaded', () => {
  // Authentication Elements
  const passcodeOverlay = document.getElementById('passcodeOverlay');
  const passcodeInput = document.getElementById('passcodeInput');
  const verifyPasscodeBtn = document.getElementById('verifyPasscodeBtn');
  const passcodeError = document.getElementById('passcodeError');

  // State
  let reports = [];
  let departments = [];
  let deptChartInstance = null;
  let statusChartInstance = null;

  // Elements
  const changePinBtn = document.getElementById('changePinBtn');
  const refreshBtn = document.getElementById('refreshBtn');
  const exportCsvBtn = document.getElementById('exportCsvBtn');
  const searchFilter = document.getElementById('searchFilter');
  const statusFilter = document.getElementById('statusFilter');
  const dateFilter = document.getElementById('dateFilter');
  const tableBody = document.getElementById('reportsTableBody');
  const tunnelStatusEl = document.getElementById('tunnelStatus');

  // Theme Elements
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const themeToggleIcon = document.getElementById('themeToggleIcon');
  const themeToggleText = document.getElementById('themeToggleText');

  // Edit Modal Elements
  const editModal = document.getElementById('editModal');
  const editForm = document.getElementById('editForm');
  const editReportIdInput = document.getElementById('editReportId');
  const editDateTimeInput = document.getElementById('editDateTime');
  const editUserInput = document.getElementById('editUser');
  const editDepartmentSelect = document.getElementById('editDepartment');
  const editStatusSelect = document.getElementById('editStatus');
  const editResolveDateGroup = document.getElementById('editResolveDateGroup');
  const editResolveDateInput = document.getElementById('editResolveDate');
  const editProblemsInput = document.getElementById('editProblems');
  const editActionInput = document.getElementById('editAction');
  const editRemarksInput = document.getElementById('editRemarks');

  const closeModalBtn = document.getElementById('closeModalBtn');
  const cancelEditBtn = document.getElementById('cancelEditBtn');

  // Change PIN Modal Elements
  const pinModal = document.getElementById('pinModal');
  const pinForm = document.getElementById('pinForm');
  const currentPinInput = document.getElementById('currentPinInput');
  const newPinInput = document.getElementById('newPinInput');
  const confirmPinInput = document.getElementById('confirmPinInput');
  const pinError = document.getElementById('pinError');
  const closePinModalBtn = document.getElementById('closePinModalBtn');
  const cancelPinBtn = document.getElementById('cancelPinBtn');

  // KPI elements
  const statTotalCalls = document.getElementById('statTotalCalls');
  const statAnswerRate = document.getElementById('statAnswerRate');
  const statTotalDuration = document.getElementById('statTotalDuration');
  const statAvgDuration = document.getElementById('statAvgDuration');

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

  // Authenticate PIN with the PC backend
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

        loadTunnelInfo();
        fetchReports();
        fetchDepartments();
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
    clearTimeout(inactivityTimeout); // Pause timer on passcode screen
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

      loadTunnelInfo();
      fetchReports();
      fetchDepartments();
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

  // 1. Light / Dark Theme Toggle
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
    renderCharts(getFilteredReports());
  });

  // 2. Load Tunnel Information
  async function loadTunnelInfo() {
    try {
      const response = await fetch('/tunnel_info.txt');
      if (response.ok) {
        const text = await response.text();
        const lines = text.split('\n');
        let url = '';

        lines.forEach(line => {
          if (line.startsWith('Mobile URL:')) {
            url = line.replace('Mobile URL:', '').trim();
          }
        });

        if (url) {
          tunnelStatusEl.innerHTML = `
            <span class="dot connected" style="width: 8px; height: 8px;"></span>
            <span>Global: <a href="${url}" target="_blank" class="tunnel-link">${url}</a> </span>
          `;
          return;
        }
      }

      tunnelStatusEl.innerHTML = `
        <span class="dot busy" style="width: 8px; height: 8px;"></span>
        <span>Local Mode | Open on mobile via PC network</span>
      `;
    } catch (err) {
      console.error('Error fetching tunnel info:', err);
      tunnelStatusEl.innerHTML = `
        <span class="dot busy" style="width: 8px; height: 8px;"></span>
        <span>Local Mode | Tunnel details unavailable</span>
      `;
    }
  }

  // 3. Render Real-Time Charts using Chart.js
  function renderCharts(filteredData) {
    const isLight = document.body.classList.contains('light-theme');
    const labelColor = isLight ? '#09090b' : '#f4f4f5';
    const gridColor = isLight ? 'rgba(9, 9, 11, 0.05)' : 'rgba(255, 255, 255, 0.05)';

    // A. Aggregate Departments
    let depts = [...departments];
    if (depts.length === 0) {
      depts = Array.from(new Set(reports.map(r => r.department).filter(Boolean)));
    }
    if (depts.length === 0) {
      depts = ['Design', 'Electrical Design', 'Account', 'QC', 'Store', 'Marketing', 'Service'];
    }
    const deptCounts = depts.map(d => filteredData.filter(r => r.department === d).length);

    const ctxDept = document.getElementById('deptChart').getContext('2d');
    if (deptChartInstance) {
      deptChartInstance.destroy();
    }

    deptChartInstance = new Chart(ctxDept, {
      type: 'bar',
      data: {
        labels: depts,
        datasets: [{
          label: 'Issues Reported',
          data: deptCounts,
          backgroundColor: '#6366f1',
          borderColor: '#4f46e5',
          borderWidth: 1,
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { enabled: true }
        },
        scales: {
          x: {
            grid: { color: gridColor },
            ticks: { color: labelColor, font: { family: 'Outfit' } }
          },
          y: {
            grid: { color: gridColor },
            ticks: { color: labelColor, stepSize: 1, font: { family: 'Outfit' } },
            beginAtZero: true
          }
        }
      }
    });

    // B. Aggregate Statuses
    const statuses = ['Pending', 'In Progress', 'Resolved'];
    const statusCounts = statuses.map(s => filteredData.filter(r => r.status === s).length);

    const ctxStatus = document.getElementById('statusChart').getContext('2d');
    if (statusChartInstance) {
      statusChartInstance.destroy();
    }

    statusChartInstance = new Chart(ctxStatus, {
      type: 'doughnut',
      data: {
        labels: statuses,
        datasets: [{
          data: statusCounts,
          backgroundColor: ['#ef4444', '#f59e0b', '#10b981'],
          borderWidth: isLight ? 2 : 1,
          borderColor: isLight ? '#fff' : '#141419'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: {
              color: labelColor,
              font: { family: 'Outfit', size: 12 }
            }
          }
        }
      }
    });
  }

  // 4. Calculate & Render KPI Statistics
  function updateKPIs(filteredData) {
    const total = filteredData.length;
    statTotalCalls.textContent = total;

    const resolvedCount = filteredData.filter(r => r.status === 'Resolved').length;
    statTotalDuration.textContent = resolvedCount;

    const rate = total > 0 ? Math.round((resolvedCount / total) * 100) : 0;
    statAnswerRate.textContent = `${rate}%`;

    const pendingInProgressCount = filteredData.filter(r => r.status === 'Pending' || r.status === 'In Progress').length;
    statAvgDuration.textContent = pendingInProgressCount;
  }

  // Helper: Format ISO datetime
  function formatDateTime(isoString) {
    try {
      const date = new Date(isoString);
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch (e) {
      return isoString;
    }
  }

  // Helper: Format resolve date
  function formatResolveDate(dateString) {
    if (!dateString) return '<span style="color:var(--text-muted)">-</span>';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch (e) {
      return dateString;
    }
  }

  // Helper: Time ago display
  function getTimeAgo(dateStr) {
    try {
      const diff = new Date() - new Date(dateStr);
      const seconds = Math.floor(diff / 1000);
      if (seconds < 60) return 'just now';
      const minutes = Math.floor(seconds / 60);
      if (minutes < 60) return `${minutes}m ago`;
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return `${hours}h ago`;
      const days = Math.floor(hours / 24);
      return `${days}d ago`;
    } catch (e) {
      return '';
    }
  }

  // 5. Get current filtered array
  function getFilteredReports() {
    const searchQuery = searchFilter.value.toLowerCase().trim();
    const statusVal = statusFilter.value;
    const dateVal = dateFilter.value;

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);

    const sevenDaysAgo = new Date(startOfToday);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const thirtyDaysAgo = new Date(startOfToday);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    return reports.filter(r => {
      const matchesSearch =
        (r.user || '').toLowerCase().includes(searchQuery) ||
        (r.department || '').toLowerCase().includes(searchQuery) ||
        (r.problems || '').toLowerCase().includes(searchQuery) ||
        (r.action || '').toLowerCase().includes(searchQuery) ||
        (r.remarks || '').toLowerCase().includes(searchQuery);

      const matchesStatus = statusVal === 'ALL' || r.status === statusVal;

      let matchesDate = true;
      if (r.dateTime) {
        const reportDate = new Date(r.dateTime);
        if (dateVal === 'TODAY') {
          matchesDate = reportDate >= startOfToday;
        } else if (dateVal === 'YESTERDAY') {
          matchesDate = reportDate >= startOfYesterday && reportDate < startOfToday;
        } else if (dateVal === 'WEEK') {
          matchesDate = reportDate >= sevenDaysAgo;
        } else if (dateVal === 'MONTH') {
          matchesDate = reportDate >= thirtyDaysAgo;
        }
      }

      return matchesSearch && matchesStatus && matchesDate;
    });
  }

  // 6. Render Activity Timeline Dynamic List (Material Style)
  function renderTimeline() {
    const timelineEl = document.getElementById('activityTimeline');
    if (!timelineEl) return;

    // Take last 5 logged reports by date
    const sorted = [...reports].sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime)).slice(0, 5);

    if (sorted.length === 0) {
      timelineEl.innerHTML = `
        <p style="color: var(--text-muted); font-size: 0.85rem; text-align: center; margin-top: 2rem;">No recent activities.</p>
      `;
      return;
    }

    timelineEl.innerHTML = '';
    sorted.forEach(item => {
      const timelineItem = document.createElement('div');
      timelineItem.className = 'timeline-item';

      let nodeClass = 'pending';
      if (item.status === 'In Progress') nodeClass = 'busy';
      if (item.status === 'Resolved') nodeClass = 'connected';

      const timeAgoText = getTimeAgo(item.dateTime || item.dateLogged);

      timelineItem.innerHTML = `
        <div class="timeline-node ${nodeClass}"></div>
        <div class="timeline-details">
          <div class="timeline-meta">
            <span class="timeline-user">${escapeHTML(item.user)}</span> • <span>${timeAgoText}</span>
          </div>
          <div class="timeline-prob">${escapeHTML(item.problems)}</div>
        </div>
      `;
      timelineEl.appendChild(timelineItem);
    });
  }

  // 7. Render Table Rows
  function renderTable() {
    const filtered = getFilteredReports();

    updateKPIs(filtered);
    renderCharts(filtered);
    renderTimeline(); // Refresh Activity Feed

    if (filtered.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" class="no-data-msg">No matching reports found.</td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = '';

    filtered.forEach(report => {
      const mainRow = document.createElement('tr');
      mainRow.id = `row-${report.id}`;

      let badgeClass = 'pending';
      if (report.status === 'In Progress') badgeClass = 'busy';
      if (report.status === 'Resolved') badgeClass = 'connected';

      mainRow.innerHTML = `
        <td>${formatDateTime(report.dateTime)}</td>
        <td style="font-weight: 500;">${escapeHTML(report.user)}</td>
        <td>${escapeHTML(report.department)}</td>
        <td><span class="badge ${badgeClass}">${report.status}</span></td>
        <td>${formatResolveDate(report.resolveDate)}</td>
        <td style="text-align: center; display: flex; justify-content: center; gap: 0.35rem;">
          <button class="row-action-btn toggle-btn" data-id="${report.id}" title="Toggle Details">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </button>
          <button class="row-action-btn edit-btn" data-id="${report.id}" title="Edit Report">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          </button>
          <button class="row-action-btn delete-btn" data-id="${report.id}" title="Delete Log">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
          </button>
        </td>
      `;

      const detailRow = document.createElement('tr');
      detailRow.id = `detail-${report.id}`;
      detailRow.className = 'detail-row';

      detailRow.innerHTML = `
        <td colspan="6">
          <div class="detail-content">
            <div class="detail-block">
              <h4>Problems</h4>
              <p>${escapeHTML(report.problems) || '<span style="color:var(--text-muted)">No problems logged.</span>'}</p>
            </div>
            <div class="detail-block">
              <h4>Action Taken / Planned</h4>
              <p>${escapeHTML(report.action) || '<span style="color:var(--text-muted)">No action details logged.</span>'}</p>
            </div>
            <div class="detail-block" style="grid-column: span 2;">
              <h4>Remarks</h4>
              <p>${escapeHTML(report.remarks) || '<span style="color:var(--text-muted)">No remarks logged.</span>'}</p>
            </div>
          </div>
        </td>
      `;

      tableBody.appendChild(mainRow);
      tableBody.appendChild(detailRow);
    });

    tableBody.querySelectorAll('.toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const dRow = document.getElementById(`detail-${id}`);
        const isExpanded = dRow.classList.toggle('expanded');
        btn.style.transform = isExpanded ? 'rotate(180deg)' : 'rotate(0)';
      });
    });

    tableBody.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        openEditModal(id);
      });
    });

    tableBody.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        deleteReport(id);
      });
    });
  }

  // 8. Live Record Editor Modal
  function openEditModal(id) {
    const report = reports.find(r => r.id === id);
    if (!report) return;

    editReportIdInput.value = report.id;
    editDateTimeInput.value = report.dateTime ? report.dateTime.slice(0, 16) : '';
    editUserInput.value = report.user || '';
    editDepartmentSelect.value = report.department || '';
    editStatusSelect.value = report.status || 'Pending';
    editResolveDateInput.value = report.resolveDate || '';
    editProblemsInput.value = report.problems || '';
    editActionInput.value = report.action || '';
    editRemarksInput.value = report.remarks || '';

    handleEditStatusChange();
    editModal.classList.add('show');
  }

  function closeEditModal() {
    editModal.classList.remove('show');
    editForm.reset();
  }

  function handleEditStatusChange() {
    if (editStatusSelect.value === 'Resolved') {
      editResolveDateGroup.style.display = 'block';
      if (!editResolveDateInput.value) {
        editResolveDateInput.value = new Date().toISOString().split('T')[0];
      }
    } else {
      editResolveDateGroup.style.display = 'none';
      editResolveDateInput.value = '';
    }
  }

  editStatusSelect.addEventListener('change', handleEditStatusChange);
  closeModalBtn.addEventListener('click', closeEditModal);
  cancelEditBtn.addEventListener('click', closeEditModal);

  editModal.addEventListener('click', (e) => {
    if (e.target === editModal) closeEditModal();
  });

  // Handle Edit Submit
  editForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = editReportIdInput.value;
    const updatedData = {
      dateTime: editDateTimeInput.value,
      user: editUserInput.value,
      department: editDepartmentSelect.value,
      status: editStatusSelect.value,
      resolveDate: editResolveDateInput.value,
      problems: editProblemsInput.value,
      action: editActionInput.value,
      remarks: editRemarksInput.value
    };

    try {
      const response = await fetch(`/api/reports/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Bypass-Tunnel-Reminder': 'true',
          'X-Auth-Token': getAuthToken()
        },
        body: JSON.stringify(updatedData)
      });

      if (response.status === 401) {
        localStorage.removeItem('auth_pin');
        showPasscodePrompt();
        closeEditModal();
        return;
      }

      if (response.ok) {
        closeEditModal();
        fetchReports();
        resetInactivityTimer();
      } else {
        alert('Failed to save changes.');
      }
    } catch (err) {
      console.error('Error updating report:', err);
      alert('Network error. Failed to reach the PC server.');
    }
  });

  // 9. Change PIN Modal Logics
  changePinBtn.addEventListener('click', () => {
    pinModal.classList.add('show');
    currentPinInput.focus();
  });

  function closePinModal() {
    pinModal.classList.remove('show');
    pinForm.reset();
    pinError.style.display = 'none';
  }

  closePinModalBtn.addEventListener('click', closePinModal);
  cancelPinBtn.addEventListener('click', closePinModal);

  pinModal.addEventListener('click', (e) => {
    if (e.target === pinModal) closePinModal();
  });

  pinForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const currentPin = currentPinInput.value;
    const newPin = newPinInput.value;
    const confirmPin = confirmPinInput.value;

    pinError.style.display = 'none';

    if (newPin !== confirmPin) {
      pinError.textContent = '❌ New PIN and Confirm PIN do not match!';
      pinError.style.display = 'block';
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
        closePinModal();
        alert('✅ Security PIN updated successfully!');
        resetInactivityTimer();
      } else {
        pinError.textContent = `❌ ${result.error || 'Failed to update PIN.'}`;
        pinError.style.display = 'block';
      }
    } catch (err) {
      console.error('Error updating PIN:', err);
      pinError.textContent = '❌ Network error. Could not reach server.';
      pinError.style.display = 'block';
    }
  });

  // Escape HTML Helper
  function escapeHTML(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Delete API call
  async function deleteReport(id) {
    if (!confirm('Are you sure you want to delete this report? It will be permanently removed.')) {
      return;
    }

    try {
      const response = await fetch(`/api/reports/${id}`, {
        method: 'DELETE',
        headers: {
          'Bypass-Tunnel-Reminder': 'true',
          'X-Auth-Token': getAuthToken()
        }
      });

      if (response.status === 401) {
        localStorage.removeItem('auth_pin');
        showPasscodePrompt();
        return;
      }

      if (response.ok) {
        fetchReports();
        resetInactivityTimer();
      } else {
        alert('Failed to delete report.');
      }
    } catch (err) {
      console.error('Error deleting report:', err);
      alert('Network error. Could not reach PC server.');
    }
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
        departments = await response.json();
        populateEditDepartmentsDropdown();
      }
    } catch (err) {
      console.error('Error fetching departments:', err);
    }
  }

  function populateEditDepartmentsDropdown() {
    if (!editDepartmentSelect) return;
    editDepartmentSelect.innerHTML = '';
    departments.forEach(dept => {
      const opt = document.createElement('option');
      opt.value = dept;
      opt.textContent = dept;
      editDepartmentSelect.appendChild(opt);
    });
  }

  // Fetch reports from PC backend API
  async function fetchReports() {
    await fetchDepartments();

    try {
      const response = await fetch('/api/reports', {
        headers: {
          'Bypass-Tunnel-Reminder': 'true',
          'X-Auth-Token': getAuthToken()
        }
      });

      if (response.status === 401) {
        localStorage.removeItem('auth_pin');
        showPasscodePrompt();
        return;
      }

      if (response.ok) {
        reports = await response.json();
        renderTable();
      } else {
        tableBody.innerHTML = `
          <tr>
            <td colspan="6" class="no-data-msg" style="color: var(--status-noanswer);">
              Error: Failed to fetch data from local API.
            </td>
          </tr>
        `;
      }
    } catch (err) {
      console.error('Error fetching reports:', err);
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" class="no-data-msg" style="color: var(--status-noanswer);">
            Server Offline: Verify the Node server is running on the PC.
          </td>
        </tr>
      `;
    }
  }

  // Export current filtered set as styled Excel
  async function exportCSV() {
    const filtered = getFilteredReports();

    if (filtered.length === 0) {
      alert('No filtered records match the export criteria.');
      return;
    }

    exportCsvBtn.disabled = true;
    exportCsvBtn.innerHTML = 'Generating...';

    try {
      const response = await fetch('/api/reports/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Bypass-Tunnel-Reminder': 'true',
          'X-Auth-Token': getAuthToken()
        },
        body: JSON.stringify({ filteredReports: filtered })
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `Vash_Reports_Export_${new Date().toISOString().slice(0, 10)}.xlsx`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        const err = await response.json();
        alert('Export failed: ' + (err.error || 'Server error'));
      }
    } catch (err) {
      console.error('Export error:', err);
      alert('Network error. Failed to download Excel.');
    } finally {
      exportCsvBtn.disabled = false;
      exportCsvBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
        Export Excel (Styled)
      `;
      resetInactivityTimer();
    }
  }

  // Filter events
  searchFilter.addEventListener('input', () => {
    renderTable();
    resetInactivityTimer();
  });
  statusFilter.addEventListener('change', () => {
    renderTable();
    resetInactivityTimer();
  });
  dateFilter.addEventListener('change', () => {
    renderTable();
    resetInactivityTimer();
  });

  // Action events
  refreshBtn.addEventListener('click', () => {
    fetchReports();
    resetInactivityTimer();
  });
  exportCsvBtn.addEventListener('click', exportCSV);

  // Run Auth Check on startup
  initAuth();

  // Auto-refresh every 30 seconds
  setInterval(() => {
    if (getAuthToken()) {
      fetchReports();
    }
  }, 30000);
});
