document.addEventListener('DOMContentLoaded', () => {
  // Authentication Elements removed (handled by login.html)

  // State
  let reports = [];
  let departments = [];
  let holidaysData = [];
  let allowedUsers = [];
  let deptChartInstance = null;
  let statusChartInstance = null;

  // Elements
  const refreshBtn = document.getElementById('refreshBtn');
  const exportCsvBtn = document.getElementById('exportCsvBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const searchFilter = document.getElementById('searchFilter');
  const statusFilter = document.getElementById('statusFilter');
  const dateFilter = document.getElementById('dateFilter');
  const tableBody = document.getElementById('reportsTableBody');
  const tunnelStatusEl = document.getElementById('tunnelStatus');
  
  const tabUsersBtn = document.getElementById('tabUsersBtn');
  const tabUsersContent = document.getElementById('tabUsersContent');
  const usersTableBody = document.getElementById('usersTableBody');
  
  const resetPasswordModal = document.getElementById('resetPasswordModal');
  const resetPasswordForm = document.getElementById('resetPasswordForm');
  const resetPasswordUserId = document.getElementById('resetPasswordUserId');
  const resetPasswordUserName = document.getElementById('resetPasswordUserName');
  const newPasswordInput = document.getElementById('newPasswordInput');
  const resetPasswordError = document.getElementById('resetPasswordError');
  const closeResetPasswordModalBtn = document.getElementById('closeResetPasswordModalBtn');
  const cancelResetPasswordBtn = document.getElementById('cancelResetPasswordBtn');

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

  const aiPolishEditProblemsBtn = document.getElementById('aiPolishEditProblemsBtn');
  const aiPolishEditActionBtn = document.getElementById('aiPolishEditActionBtn');
  const aiPolishEditRemarksBtn = document.getElementById('aiPolishEditRemarksBtn');

  const closeModalBtn = document.getElementById('closeModalBtn');
  const cancelEditBtn = document.getElementById('cancelEditBtn');

  // Tab Elements
  const tabReportsBtn = document.getElementById('tabReportsBtn');
  const tabHolidaysBtn = document.getElementById('tabHolidaysBtn');
  const tabReportsContent = document.getElementById('tabReportsContent');
  const tabHolidaysContent = document.getElementById('tabHolidaysContent');
  const tabBillsBtn = document.getElementById('tabBillsBtn');
  const tabBillsContent = document.getElementById('tabBillsContent');

  // Bills Elements
  const billsTableBody = document.getElementById('billsTableBody');
  const addBillBtn = document.getElementById('addBillBtn');
  const exportBillsBtn = document.getElementById('exportBillsBtn');
  const addBillFormContainer = document.getElementById('addBillFormContainer');
  const closeAddBillBtn = document.getElementById('closeAddBillBtn');
  const billForm = document.getElementById('billForm');
  let billsData = [];

  // Holiday Elements
  const holidayForm = document.getElementById('holidayForm');
  const holidayDate = document.getElementById('holidayDate');
  const holidayType = document.getElementById('holidayType');
  const holidayUserGroup = document.getElementById('holidayUserGroup');
  const holidayUser = document.getElementById('holidayUser');
  const holidayDesc = document.getElementById('holidayDesc');
  const holidaysTableBody = document.getElementById('holidaysTableBody');

  // PIN modal elements removed

  // KPI elements
  const statTotalCalls = document.getElementById('statTotalCalls');
  const statAnswerRate = document.getElementById('statAnswerRate');
  const statTotalDuration = document.getElementById('statTotalDuration');
  const statAvgDuration = document.getElementById('statAvgDuration');

  function captureTokenFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (!token) return;

    sessionStorage.setItem('ad_session_token', token);
    params.delete('token');
    const cleanQuery = params.toString();
    const cleanUrl = `${window.location.pathname}${cleanQuery ? `?${cleanQuery}` : ''}${window.location.hash}`;
    window.history.replaceState({}, document.title, cleanUrl);
  }

  captureTokenFromUrl();

  function getADSessionToken() {
    return sessionStorage.getItem('ad_session_token') || '';
  }

  function initPointerEffects() {
    // Disabled heavy pointer effects to improve dashboard performance and prevent lag.
  }

  initPointerEffects();

  // Initialize Authentication Check
  async function initAuth() {
    const token = getADSessionToken();
    if (!token) {
      // If token is missing, redirect to login page
      window.location.href = '/login.html';
      return;
    }
    
    // Test if session is still valid on backend
    try {
      const response = await fetch('/api/reports', {
        headers: {
          'Authorization': token,
          'Bypass-Tunnel-Reminder': 'true'
        }
      });
      
      if (!response.ok) {
        sessionStorage.removeItem('ad_session_token');
        window.location.href = '/login.html';
        return;
      }
    } catch (e) {
      // Offline fallback or failure
    }

    loadTunnelInfo();
    fetchReports();
    fetchDepartments();
    fetchHolidays();
  }

  function showAccessUsersError(message) {
    if (!accessUsersError) return;
    accessUsersError.textContent = message || '';
    accessUsersError.style.display = message ? 'block' : 'none';
  }

  function showResetPasswordError(message) {
    if (!resetPasswordError) return;
    resetPasswordError.textContent = message || '';
    resetPasswordError.style.display = message ? 'block' : 'none';
  }

  async function fetchUsers() {
    if (!usersTableBody) return;
    try {
      const response = await fetch('/api/users', {
        headers: {
          'Authorization': getADSessionToken(),
          'Bypass-Tunnel-Reminder': 'true'
        }
      });
      if (!response.ok) throw new Error('Unable to load users');
      allowedUsers = await response.json();
      renderUsers();
    } catch (err) {
      usersTableBody.innerHTML = '<tr><td colspan="4" class="no-data-msg">Unable to load users.</td></tr>';
    }
  }

  function renderUsers() {
    if (!usersTableBody) return;
    if (!allowedUsers.length) {
      usersTableBody.innerHTML = '<tr><td colspan="4" class="no-data-msg">No users registered.</td></tr>';
      return;
    }

    usersTableBody.innerHTML = allowedUsers.map(user => {
      const joinedDate = new Date(user.createdAt).toLocaleDateString();
      return `
        <tr>
          <td style="font-weight: 600;">${escapeHTML(user.name)}</td>
          <td>${escapeHTML(user.email)}</td>
          <td>${joinedDate}</td>
          <td style="text-align: center;">
            <button class="btn-reset-password btn-action" data-id="${user.id}" data-name="${escapeHTML(user.name)}" style="background: none; border: 1px solid var(--primary); border-radius: 4px; padding: 4px 8px; cursor: pointer; color: var(--primary); font-weight: 600; font-size: 0.8rem; margin-right: 0.5rem;">Reset Pass</button>
            <button class="btn-delete-user btn-action" data-id="${user.id}" data-name="${escapeHTML(user.name)}" style="background: none; border: none; cursor: pointer; color: var(--status-noanswer); font-weight: 700; font-size: 0.8rem;">Delete</button>
          </td>
        </tr>
      `;
    }).join('');

    usersTableBody.querySelectorAll('.btn-delete-user').forEach(btn => {
      btn.addEventListener('click', () => deleteUser(btn.dataset.id, btn.dataset.name));
    });
    
    usersTableBody.querySelectorAll('.btn-reset-password').forEach(btn => {
      btn.addEventListener('click', () => {
        resetPasswordUserId.value = btn.dataset.id;
        resetPasswordUserName.textContent = btn.dataset.name;
        newPasswordInput.value = '';
        showResetPasswordError('');
        resetPasswordModal.classList.add('show');
      });
    });
  }

  async function deleteUser(id, name) {
    if (!confirm(`Are you sure you want to completely delete the user: ${name}?`)) return;
    try {
      const response = await fetch(`/api/users/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': getADSessionToken(),
          'Bypass-Tunnel-Reminder': 'true'
        }
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to delete user.');
      fetchUsers();
    } catch (err) {
      alert(err.message || 'Failed to delete user.');
    }
  }

  resetPasswordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = resetPasswordUserId.value;
    const newPassword = newPasswordInput.value;
    if (!newPassword || newPassword.length < 6) {
      showResetPasswordError('Password must be at least 6 characters.');
      return;
    }

    try {
      const response = await fetch(`/api/users/${id}/password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': getADSessionToken(),
          'Bypass-Tunnel-Reminder': 'true'
        },
        body: JSON.stringify({ newPassword })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to reset password.');
      resetPasswordModal.classList.remove('show');
      alert('Password reset successfully.');
    } catch (err) {
      showResetPasswordError(err.message || 'Failed to reset password.');
    }
  });

  if (closeResetPasswordModalBtn) {
    closeResetPasswordModalBtn.addEventListener('click', () => {
      resetPasswordModal.classList.remove('show');
    });
  }
  
  if (cancelResetPasswordBtn) {
    cancelResetPasswordBtn.addEventListener('click', () => {
      resetPasswordModal.classList.remove('show');
    });
  }

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
    const mutedColor = isLight ? '#52525b' : '#a1a1aa';
    const gridColor = isLight ? 'rgba(9, 9, 11, 0.08)' : 'rgba(255, 255, 255, 0.07)';

    // A. Aggregate Departments as a ranked horizontal chart
    const deptCanvas = document.getElementById('deptChart');
    const deptMeta = document.getElementById('deptChartMeta');
    const ctxDept = deptCanvas.getContext('2d');
    if (deptChartInstance) {
      deptChartInstance.destroy();
    }

    const knownDepts = departments.length ? departments : Array.from(new Set(reports.map(r => r.department).filter(Boolean)));
    const deptMap = new Map(knownDepts.map(dept => [dept, 0]));
    filteredData.forEach(report => {
      const dept = report.department || 'Unassigned';
      deptMap.set(dept, (deptMap.get(dept) || 0) + 1);
    });

    let deptRows = Array.from(deptMap.entries())
      .map(([name, count]) => ({ name, count }))
      .filter(row => row.count > 0)
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

    const totalDeptIssues = deptRows.reduce((sum, row) => sum + row.count, 0);
    const hiddenDeptCount = Math.max(0, deptRows.length - 8);
    deptRows = deptRows.slice(0, 8);

    if (deptMeta) {
      deptMeta.textContent = totalDeptIssues
        ? `${totalDeptIssues} issues${hiddenDeptCount ? `, top 8 shown` : ''}`
        : 'No matching issues';
    }

    const deptLabels = deptRows.length ? deptRows.map(row => row.name) : ['No issues'];
    const deptCounts = deptRows.length ? deptRows.map(row => row.count) : [0];
    const maxDeptCount = Math.max(1, ...deptCounts);
    const deptPalette = ['#2563eb', '#14b8a6', '#f59e0b', '#ef4444', '#8b5cf6', '#22c55e', '#f97316', '#06b6d4'];
    const deptColors = deptCounts.map((_, index) => deptRows.length ? deptPalette[index % deptPalette.length] : 'rgba(161, 161, 170, 0.28)');

    deptChartInstance = new Chart(ctxDept, {
      type: 'bar',
      data: {
        labels: deptLabels,
        datasets: [{
          label: 'Issues Reported',
          data: deptCounts,
          backgroundColor: deptColors,
          borderColor: deptColors,
          borderWidth: 1,
          borderRadius: 6,
          borderSkipped: false,
          barThickness: 18,
          maxBarThickness: 22
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: 650,
          easing: 'easeOutQuart'
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            displayColors: false,
            backgroundColor: isLight ? '#ffffff' : '#18181b',
            titleColor: labelColor,
            bodyColor: mutedColor,
            borderColor: isLight ? 'rgba(9, 9, 11, 0.12)' : 'rgba(255, 255, 255, 0.12)',
            borderWidth: 1,
            padding: 12,
            callbacks: {
              label: (context) => {
                const value = context.parsed.x || 0;
                const pct = totalDeptIssues ? Math.round((value / totalDeptIssues) * 100) : 0;
                return `${value} issue${value === 1 ? '' : 's'} • ${pct}% of current view`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: gridColor },
            ticks: {
              color: mutedColor,
              precision: 0,
              stepSize: maxDeptCount <= 8 ? 1 : undefined,
              font: { family: 'Outfit', size: 11 }
            },
            suggestedMax: maxDeptCount + 1,
            beginAtZero: true,
            border: { display: false }
          },
          y: {
            grid: { display: false },
            ticks: {
              color: labelColor,
              font: { family: 'Outfit', size: 12, weight: 600 },
              callback: function(value) {
                const label = this.getLabelForValue(value);
                return label.length > 16 ? `${label.slice(0, 15)}...` : label;
              }
            },
            border: { display: false }
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

  // 9. AI Polish Feature
  async function improveTextViaAI(text, buttonEl) {
    if (!text || text.trim() === '') return text;
    
    if (buttonEl) buttonEl.classList.add('loading');
    
    try {
      const res = await fetch('/api/ai/improve-text', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': getADSessionToken(),
          'Bypass-Tunnel-Reminder': 'true'
        },
        body: JSON.stringify({ text })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        return data.correctedText;
      } else if (data.error && data.error.includes('GEMINI_API_KEY')) {
        alert('Server is missing Gemini API Key. Please provide it to the admin.');
      }
    } catch (e) {
      console.error('AI Polish error:', e);
    } finally {
      if (buttonEl) buttonEl.classList.remove('loading');
    }
    return text;
  }

  function setupAIPolishBtn(btn, textarea) {
    if (!btn || !textarea) return;
    btn.addEventListener('click', async () => {
      const currentText = textarea.value;
      if (!currentText.trim()) return;
      const improved = await improveTextViaAI(currentText, btn);
      if (improved && improved !== currentText) {
        textarea.value = improved;
        textarea.dispatchEvent(new Event('input'));
      }
    });
  }

  setupAIPolishBtn(aiPolishEditProblemsBtn, editProblemsInput);
  setupAIPolishBtn(aiPolishEditActionBtn, editActionInput);
  setupAIPolishBtn(aiPolishEditRemarksBtn, editRemarksInput);

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
          'Authorization': getADSessionToken()
        },
        body: JSON.stringify(updatedData)
      });

      if (response.status === 401) {
        sessionStorage.removeItem('ad_session_token');
        window.location.href = '/login.html';
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
          'Authorization': getADSessionToken()
        }
      });

      if (response.status === 401) {
        sessionStorage.removeItem('ad_session_token');
        window.location.href = '/login.html';
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
    const token = getADSessionToken();
    if (!token) return;

    try {
      const response = await fetch('/api/departments', {
        headers: {
          'Bypass-Tunnel-Reminder': 'true',
          'Authorization': token
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
          'Authorization': getADSessionToken()
        }
      });

      if (response.status === 401) {
        sessionStorage.removeItem('ad_session_token');
        window.location.href = '/login.html';
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
          'Authorization': getADSessionToken()
        },
        body: JSON.stringify({ filteredReports: filtered })
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `NIK_Reports_Export_${new Date().toISOString().slice(0, 10)}.xlsx`);
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
    }
  }

  // Filter events
  searchFilter.addEventListener('input', () => {
    renderTable();
  });
  statusFilter.addEventListener('change', () => {
    renderTable();
  });
  dateFilter.addEventListener('change', () => {
    renderTable();
  });

  // Tab Navigation Listeners
  tabReportsBtn.addEventListener('click', () => {
    setActiveTab('reports');
  });

  tabHolidaysBtn.addEventListener('click', () => {
    setActiveTab('holidays');
  });
  
  tabUsersBtn.addEventListener('click', () => {
    setActiveTab('users');
  });

  if (tabBillsBtn) {
    tabBillsBtn.addEventListener('click', () => {
      setActiveTab('bills');
    });
  }

  function setActiveTab(tab) {
    [tabReportsBtn, tabHolidaysBtn, tabUsersBtn, tabBillsBtn].forEach(btn => {
      if (!btn) return;
      btn.classList.remove('active-tab');
      btn.style.border = '1px solid transparent';
      btn.style.background = 'transparent';
      btn.style.color = 'var(--text-secondary)';
    });
    
    [tabReportsContent, tabHolidaysContent, tabUsersContent, tabBillsContent].forEach(content => {
      if (!content) return;
      content.style.display = 'none';
    });

    let activeBtn = tabReportsBtn;
    let activeContent = tabReportsContent;
    
    if (tab === 'reports') {
      activeBtn = tabReportsBtn;
      activeContent = tabReportsContent;
    } else if (tab === 'holidays') {
      activeBtn = tabHolidaysBtn;
      activeContent = tabHolidaysContent;
      fetchHolidays();
    } else if (tab === 'users') {
      activeBtn = tabUsersBtn;
      activeContent = tabUsersContent;
      fetchUsers();
    } else if (tab === 'bills') {
      activeBtn = tabBillsBtn;
      activeContent = tabBillsContent;
      fetchBills();
    }
    
    if (activeBtn) {
      activeBtn.classList.add('active-tab');
      activeBtn.style.border = '1px solid var(--primary)';
      activeBtn.style.background = 'rgba(99, 102, 241, 0.1)';
      activeBtn.style.color = 'var(--primary)';
    }
    if (activeContent) {
      activeContent.style.display = 'block';
    }
  }

  // Holiday API Management Functions
  async function fetchHolidays() {
    const token = getADSessionToken();
    if (!token) return;

    try {
      const response = await fetch('/api/holidays', {
        headers: {
          'Bypass-Tunnel-Reminder': 'true',
          'Authorization': token
        }
      });
      if (response.ok) {
        holidaysData = await response.json();
        renderHolidaysTable();
      }
    } catch (err) {
      console.error('Error fetching holidays:', err);
    }
  }

  function renderHolidaysTable() {
    if (!holidaysTableBody) return;
    
    if (holidaysData.length === 0) {
      holidaysTableBody.innerHTML = `
        <tr>
          <td colspan="5" class="no-data-msg">No holidays or leaves declared.</td>
        </tr>
      `;
      return;
    }

    const sorted = [...holidaysData].sort((a, b) => new Date(b.date) - new Date(a.date));

    holidaysTableBody.innerHTML = '';
    sorted.forEach(h => {
      const tr = document.createElement('tr');
      
      const typeBadge = h.type === 'Personal Leave' ? 'status-pill pending' : 'status-pill inprogress';

      tr.innerHTML = `
        <td><strong>${h.date}</strong></td>
        <td>${h.user === 'All' ? '<span style="color: var(--primary); font-weight: 500;">All Staff</span>' : h.user}</td>
        <td><span class="${typeBadge}" style="display: inline-block; padding: 0.15rem 0.5rem; font-size: 0.75rem;">${h.type}</span></td>
        <td>${h.description}</td>
        <td style="text-align: center;">
          <button class="btn-delete-holiday btn-action" data-id="${h.id}" title="Delete Leave" style="background: none; border: none; cursor: pointer; font-size: 1rem; color: var(--status-noanswer);">🗑️</button>
        </td>
      `;
      holidaysTableBody.appendChild(tr);
    });

    holidaysTableBody.querySelectorAll('.btn-delete-holiday').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = btn.getAttribute('data-id');
        if (confirm('Are you sure you want to delete this holiday/leave declaration?')) {
          await deleteHoliday(id);
        }
      });
    });
  }

  async function deleteHoliday(id) {
    const token = getADSessionToken();
    if (!token) return;

    try {
      const response = await fetch(`/api/holidays/${id}`, {
        method: 'DELETE',
        headers: {
          'Bypass-Tunnel-Reminder': 'true',
          'Authorization': token
        }
      });
      if (response.ok) {
        fetchHolidays();
      } else {
        const err = await response.json();
        alert('Delete failed: ' + (err.error || 'Server error'));
      }
    } catch (err) {
      console.error('Delete error:', err);
      alert('Failed to delete holiday due to a network error.');
    }
  }

  holidayType.addEventListener('change', () => {
    if (holidayType.value === 'Personal Leave') {
      holidayUserGroup.style.display = 'flex';
      holidayUser.required = true;
    } else {
      holidayUserGroup.style.display = 'none';
      holidayUser.required = false;
      holidayUser.value = '';
    }
  });

  holidayForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const payload = {
      date: holidayDate.value,
      type: holidayType.value,
      user: holidayUser.value || 'All',
      description: holidayDesc.value
    };

    try {
      const response = await fetch('/api/holidays', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Bypass-Tunnel-Reminder': 'true',
          'Authorization': getADSessionToken()
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      if (response.ok) {
        holidayForm.reset();
        holidayUserGroup.style.display = 'flex';
        holidayUser.required = true;
        
        fetchHolidays();
      } else {
        alert('Failed: ' + (result.error || 'Server error'));
      }
    } catch (err) {
      console.error('Add holiday error:', err);
      alert('Failed to add holiday due to a network error.');
    }
  });
  // Bills API Management Functions
  async function fetchBills() {
    const token = getADSessionToken();
    if (!token) return;

    try {
      const response = await fetch('/api/bills', {
        headers: {
          'Bypass-Tunnel-Reminder': 'true',
          'Authorization': token
        }
      });
      if (response.ok) {
        billsData = await response.json();
        renderBillsTable();
      } else if (response.status === 404) {
        // If API doesn't exist yet
        billsData = [];
        renderBillsTable();
      }
    } catch (err) {
      console.error('Error fetching bills:', err);
      if (billsTableBody) {
        billsTableBody.innerHTML = '<tr><td colspan="11" class="no-data-msg">Error loading bills. Backend API may not be ready.</td></tr>';
      }
    }
  }

  function renderBillsTable() {
    if (!billsTableBody) return;
    
    if (!billsData || billsData.length === 0) {
      billsTableBody.innerHTML = '<tr><td colspan="12" class="no-data-msg">No bills or invoices found.</td></tr>';
      document.getElementById('totalBillQty').textContent = '0';
      document.getElementById('totalBillAmount').textContent = '0.00';
      return;
    }

    const sorted = [...billsData].sort((a, b) => new Date(b.date) - new Date(a.date));

    billsTableBody.innerHTML = '';
    let tQty = 0;
    let tAmt = 0;

    sorted.forEach(b => {
      const qty = parseFloat(b.qty) || 0;
      const amt = parseFloat(b.amount) || 0;
      tQty += qty;
      tAmt += amt;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHTML(b.date)}</td>
        <td>${escapeHTML(b.refCode || '-')}</td>
        <td>${escapeHTML(b.challanNo)}</td>
        <td>${escapeHTML(b.supplier)}</td>
        <td>${escapeHTML(b.itemDesc)}</td>
        <td>${qty}</td>
        <td>${amt.toFixed(2)}</td>
        <td>${escapeHTML(b.poNumber || '-')}</td>
        <td>${escapeHTML(b.purpose || '-')}</td>
        <td>${escapeHTML(b.remarks || '-')}</td>
        <td>${escapeHTML(b.handOver || '-')}</td>
        <td style="position: sticky; right: 0; background: var(--bg-card); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); z-index: 1; border-left: 2px solid var(--border-color); text-align: center; box-shadow: -4px 0 10px rgba(0,0,0,0.1);">
          <button class="btn-delete-bill" data-id="${b.id}" style="background: none; border: none; font-size: 1.2rem; cursor: pointer; color: var(--status-noanswer);" title="Delete Bill">🗑️</button>
        </td>
      `;
      billsTableBody.appendChild(tr);
    });

    document.getElementById('totalBillQty').textContent = tQty;
    document.getElementById('totalBillAmount').textContent = tAmt.toFixed(2);

    billsTableBody.querySelectorAll('.btn-delete-bill').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = btn.getAttribute('data-id');
        if (confirm('Are you sure you want to delete this bill?')) {
          await deleteBill(id);
        }
      });
    });
  }

  async function deleteBill(id) {
    const token = getADSessionToken();
    if (!token) return;

    try {
      const response = await fetch(`/api/bills/${id}`, {
        method: 'DELETE',
        headers: {
          'Bypass-Tunnel-Reminder': 'true',
          'Authorization': token
        }
      });
      if (response.ok) {
        fetchBills();
      } else {
        const err = await response.json();
        alert('Delete failed: ' + (err.error || 'Server error'));
      }
    } catch (err) {
      console.error('Delete error:', err);
      alert('Failed to delete bill due to a network error.');
    }
  }

  if (addBillBtn) {
    addBillBtn.addEventListener('click', () => {
      addBillFormContainer.style.display = 'block';
    });
  }

  if (closeAddBillBtn) {
    closeAddBillBtn.addEventListener('click', () => {
      addBillFormContainer.style.display = 'none';
      billForm.reset();
      resetBillItems();
    });
  }

  const billItemsContainer = document.getElementById('billItemsContainer');
  const btnAddBillItem = document.getElementById('btnAddBillItem');

  if (btnAddBillItem && billItemsContainer) {
    btnAddBillItem.addEventListener('click', () => {
      const row = document.createElement('div');
      row.className = 'bill-item-row';
      row.style = 'display: flex; gap: 10px; margin-bottom: 10px; align-items: flex-start;';
      row.innerHTML = `
        <div style="flex: 3;">
          <textarea class="billItemDesc" placeholder="Item Description" rows="2" required style="width: 100%; resize: vertical; border: none; background: rgba(255,255,255,0.05); color: var(--text-primary); padding: 0.5rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color);"></textarea>
        </div>
        <div style="flex: 1;">
          <input type="number" class="billQty" placeholder="Qty" step="0.01" required>
        </div>
        <div style="flex: 1;">
          <input type="number" class="billAmount" placeholder="Amount" step="0.01" required>
        </div>
        <button type="button" class="btn-remove-item" style="background: none; border: none; color: var(--status-noanswer); font-size: 1.2rem; cursor: pointer; padding: 5px;" title="Remove Item">✖</button>
      `;
      billItemsContainer.appendChild(row);
    });

    billItemsContainer.addEventListener('click', (e) => {
      if (e.target.classList.contains('btn-remove-item')) {
        const rows = billItemsContainer.querySelectorAll('.bill-item-row');
        if (rows.length > 1) {
          e.target.closest('.bill-item-row').remove();
        } else {
          alert('At least one item is required.');
        }
      }
    });
  }

  function resetBillItems() {
    if (billItemsContainer) {
      billItemsContainer.innerHTML = `
        <div class="bill-item-row" style="display: flex; gap: 10px; margin-bottom: 10px; align-items: flex-start;">
          <div style="flex: 3;">
            <textarea class="billItemDesc" placeholder="Item Description" rows="2" required style="width: 100%; resize: vertical; border: none; background: rgba(255,255,255,0.05); color: var(--text-primary); padding: 0.5rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color);"></textarea>
          </div>
          <div style="flex: 1;">
            <input type="number" class="billQty" placeholder="Qty" step="0.01" required>
          </div>
          <div style="flex: 1;">
            <input type="number" class="billAmount" placeholder="Amount" step="0.01" required>
          </div>
          <button type="button" class="btn-remove-item" style="background: none; border: none; color: var(--status-noanswer); font-size: 1.2rem; cursor: pointer; padding: 5px;" title="Remove Item">✖</button>
        </div>
      `;
    }
  }

  if (billForm) {
    billForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const items = [];
      const itemRows = document.querySelectorAll('.bill-item-row');
      itemRows.forEach(row => {
        items.push({
          itemDesc: row.querySelector('.billItemDesc').value,
          qty: row.querySelector('.billQty').value,
          amount: row.querySelector('.billAmount').value
        });
      });

      const payload = {
        date: document.getElementById('billDate').value,
        refCode: document.getElementById('billRefCode').value,
        challanNo: document.getElementById('billChallanNo').value,
        supplier: document.getElementById('billSupplier').value,
        poNumber: document.getElementById('billPONumber').value,
        purpose: document.getElementById('billPurpose').value,
        remarks: document.getElementById('billRemarks').value,
        handOver: document.getElementById('billHandOver').value,
        items: items
      };

      try {
        const response = await fetch('/api/bills', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Bypass-Tunnel-Reminder': 'true',
            'Authorization': getADSessionToken()
          },
          body: JSON.stringify(payload)
        });

        if (response.ok) {
          billForm.reset();
          resetBillItems();
          addBillFormContainer.style.display = 'none';
          fetchBills();
        } else {
          const result = await response.json();
          alert('Failed: ' + (result.error || 'Server error'));
        }
      } catch (err) {
        console.error('Add bill error:', err);
        alert('Failed to add bill due to a network error. Ensure backend supports /api/bills.');
      }
    });
  }

  // Export Bills as Excel
  if (exportBillsBtn) {
    exportBillsBtn.addEventListener('click', async () => {
      if (!billsData || billsData.length === 0) {
        alert('No bills to export.');
        return;
      }
      exportBillsBtn.disabled = true;
      exportBillsBtn.innerHTML = 'Generating...';

      try {
        const response = await fetch('/api/bills/export', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Bypass-Tunnel-Reminder': 'true',
            'Authorization': getADSessionToken()
          },
          body: JSON.stringify({ bills: billsData }) // In future could be filteredBills
        });

        if (response.ok) {
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.setAttribute('href', url);
          link.setAttribute('download', `NIK_Bills_Export_${new Date().toISOString().slice(0, 10)}.xlsx`);
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
        alert('Network error. Failed to download Bills Excel.');
      } finally {
        exportBillsBtn.disabled = false;
        exportBillsBtn.innerHTML = '📥 Export Excel';
      }
    });
  }


  refreshBtn.addEventListener('click', () => {
    fetchReports();
  });
  exportCsvBtn.addEventListener('click', exportCSV);
  
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to log out from this AD session?')) {
        sessionStorage.removeItem('ad_session_token');
        window.location.href = '/login.html';
      }
    });
  }

  // Run Auth Check on startup
  initAuth();

  // Auto-refresh every 30 seconds
  setInterval(() => {
    fetchReports();
  }, 30000);
});
