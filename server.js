const express = require('express');
require('dotenv').config();
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const localtunnel = require('localtunnel');
const qrcode = require('qrcode-terminal');
const crypto = require('crypto');
const ExcelJS = require('exceljs');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { initializeApp, cert } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const bcrypt = require('bcryptjs');

// Initialize Firebase Admin SDK
const serviceAccount = require('./firebase-service-account.json');
initializeApp({
  credential: cert(serviceAccount),
  databaseURL: `https://${serviceAccount.project_id}-default-rtdb.firebaseio.com`
});
const db = getDatabase();

// Load configurations
const DATA_DIR = path.join(__dirname, 'data');
const JSON_FILE = path.join(DATA_DIR, 'reports.json');
const CSV_FILE = path.join(DATA_DIR, 'reports.csv');
const TUNNEL_FILE = path.join(__dirname, 'public', 'tunnel_info.txt');
const SECURITY_FILE = path.join(DATA_DIR, 'security_config.json');
const DEPARTMENTS_FILE = path.join(DATA_DIR, 'departments.json');
const HOLIDAYS_FILE = path.join(DATA_DIR, 'holidays.json');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const NETWORK_CONFIG_FILE = path.join(DATA_DIR, 'network_config.json');

// Ensure data and backup directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });

// Read Network config with default values
let netConfig = {
  bindIp: "0.0.0.0",
  mobilePort: 3000,
  dashboardPort: 3001,
  allowedDomainUsers: [".\\Administrator"],
  allowedDomainGroups: [],
  enableADAuth: false
};
if (fs.existsSync(NETWORK_CONFIG_FILE)) {
  try {
    netConfig = { ...netConfig, ...JSON.parse(fs.readFileSync(NETWORK_CONFIG_FILE, 'utf8')) };
  } catch (e) {
    console.error("⚠️ Failed to parse network_config.json, using defaults.");
  }
} else {
  fs.writeFileSync(NETWORK_CONFIG_FILE, JSON.stringify(netConfig, null, 2), 'utf8');
}

// -------------------------------------------------------------
// EXPRESS APP INSTANCES
// -------------------------------------------------------------
const appMobile = express();
const appDashboard = express();

// Common Middleware
[appMobile, appDashboard].forEach(app => {
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  
  // Custom X-Frame & Security Headers
  app.use((req, res, next) => {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
  });
});

// Serve public static assets with dual-port routing restrictions
// appMobile serves everything except dashboard files to keep them secure
appMobile.use((req, res, next) => {
  const filePath = req.path.toLowerCase();
  if (filePath.includes('dashboard.html')) {
    // Graceful redirect for cached mobile logins or incorrect URLs
    const queryStr = Object.keys(req.query).length ? '?' + new URLSearchParams(req.query).toString() : '';
    return res.redirect('/' + queryStr);
  } else if (filePath.includes('dashboard.js')) {
    return res.status(403).send('Forbidden: Access is restricted to the administrator port.');
  }
  next();
});
appMobile.use(express.static(path.join(__dirname, 'public')));

// appDashboard serves dashboard-specific files securely
// Restrict appDashboard from serving index.html (the mobile app) to keep them clean
appDashboard.use((req, res, next) => {
  const filePath = req.path.toLowerCase();
  if (filePath === '/' || filePath === '/index.html') {
    return res.redirect('/dashboard.html');
  }
  next();
});

// Custom IP-Based Rate Limiter per Server instance
const ipRequestsMobile = new Map();
const ipRequestsDashboard = new Map();
setInterval(() => { ipRequestsMobile.clear(); ipRequestsDashboard.clear(); }, 60000);

function rateLimiter(ipRequestsMap, maxRequests = 100) {
  return (req, res, next) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const currentCount = ipRequestsMap.get(ip) || 0;
    if (currentCount >= maxRequests) {
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }
    ipRequestsMap.set(ip, currentCount + 1);
    next();
  };
}
appMobile.use(rateLimiter(ipRequestsMobile, 120));
appDashboard.use(rateLimiter(ipRequestsDashboard, 60));

// -------------------------------------------------------------
// ACTIVE DIRECTORY & LOCAL WINDOWS USER AUTH MIDDLEWARE
// -------------------------------------------------------------
const ACTIVE_SESSIONS = new Map(); // Store temporary tokens

// Middleware to protect Port 3001 Dashboard assets
function dashboardAuthMiddleware(req, res, next) {
  const pathLower = req.path.toLowerCase();
  if (pathLower.includes('login.html') || pathLower.startsWith('/api/auth/') || pathLower.includes('style.css') || pathLower.includes('dashboard.js') || pathLower.includes('app.js')) {
    return next();
  }

  // Check for session token
  const token = req.headers['authorization'] || req.query.token;
  if (token && ACTIVE_SESSIONS.has(token)) {
    const session = ACTIVE_SESSIONS.get(token);
    session.lastActive = Date.now();
    req.user = session;
    return next();
  }

  if (req.method === 'GET' && !req.path.startsWith('/api/')) {
    return res.redirect('/login.html');
  }

  return res.status(401).json({ error: 'Unauthorized: Login required.' });
}

// API Authorization Middleware (Firebase Session Token) for Mobile
function tokenAuth(req, res, next) {
  const token = req.headers['authorization'] || req.headers['x-auth-token'] || req.query.token;
  if (token && ACTIVE_SESSIONS.has(token)) {
    const session = ACTIVE_SESSIONS.get(token);
    session.lastActive = Date.now();
    req.user = session;
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized: Login required.' });
}

function sanitizeString(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

// -------------------------------------------------------------
// DATABASE READ/WRITE HELPERS
// -------------------------------------------------------------
function escapeCSV(val) {
  if (val === null || val === undefined) return '';
  let str = String(val).replace(/"/g, '""');
  if (str.includes(',') || str.includes('\n') || str.includes('\r') || str.includes('"')) {
    return `"${str}"`;
  }
  return str;
}

function readReports() {
  if (!fs.existsSync(JSON_FILE)) return [];
  try {
    const data = fs.readFileSync(JSON_FILE, 'utf8');
    return JSON.parse(data || '[]');
  } catch (err) {
    return [];
  }
}

function createBackup() {
  try {
    const today = new Date().toISOString().split('T')[0];
    if (fs.existsSync(JSON_FILE)) {
      fs.copyFileSync(JSON_FILE, path.join(BACKUPS_DIR, `reports_backup_${today}.json`));
    }
    if (fs.existsSync(CSV_FILE)) {
      fs.copyFileSync(CSV_FILE, path.join(BACKUPS_DIR, `reports_backup_${today}.csv`));
    }
  } catch (err) {
    console.error('⚠️ Failed to create database backup:', err);
  }
}

function saveReport(report) {
  const reports = readReports();
  reports.unshift(report);
  fs.writeFileSync(JSON_FILE, JSON.stringify(reports, null, 2), 'utf8');

  // Save to CSV
  const isNewCSV = !fs.existsSync(CSV_FILE);
  const headers = ['Date', 'User', 'Department', 'Problems', 'Action', 'Status', 'ResolveDate', 'Remarks'];
  let csvLine = isNewCSV ? headers.join(',') + '\n' : '';
  const csvRow = [
    report.dateTime, report.user, report.department, report.problems,
    report.action, report.status, report.resolveDate, report.remarks
  ];
  csvLine += csvRow.map(escapeCSV).join(',') + '\n';
  fs.appendFileSync(CSV_FILE, csvLine, 'utf8');
  
  saveDiskExcel(reports);
  createBackup();
}

function readDepartments() {
  if (!fs.existsSync(DEPARTMENTS_FILE)) {
    const defaults = ["Design", "Electrical Design", "Account", "QC", "Store", "Marketing", "Service"];
    fs.writeFileSync(DEPARTMENTS_FILE, JSON.stringify(defaults, null, 2), 'utf8');
    return defaults;
  }
  try {
    return JSON.parse(fs.readFileSync(DEPARTMENTS_FILE, 'utf8') || '[]');
  } catch (e) {
    return ["Design", "Electrical Design", "Account", "QC", "Store", "Marketing", "Service"];
  }
}

function readHolidays() {
  if (!fs.existsSync(HOLIDAYS_FILE)) {
    fs.writeFileSync(HOLIDAYS_FILE, JSON.stringify([], null, 2), 'utf8');
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(HOLIDAYS_FILE, 'utf8') || '[]');
  } catch (e) {
    return [];
  }
}

// -------------------------------------------------------------
// EXCELJS WORKBOOK GENERATION
// -------------------------------------------------------------
async function generateStyledWorkbook(reports, holidays) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Call Reports Log');

  worksheet.columns = [
    { header: 'Date', key: 'dateTime', width: 18 },
    { header: 'User', key: 'user', width: 22 },
    { header: 'Department', key: 'department', width: 22 },
    { header: 'Problems', key: 'problems', width: 45 },
    { header: 'Action', key: 'action', width: 45 },
    { header: 'Status', key: 'status', width: 15 },
    { header: 'Resolve Date', key: 'resolveDate', width: 18 },
    { header: 'Remarks', key: 'remarks', width: 30 }
  ];

  const datesSet = new Set();
  reports.forEach(r => { if (r.dateTime) datesSet.add(r.dateTime.slice(0, 10)); });
  holidays.forEach(h => { if (h.date) datesSet.add(h.date); });
  if (datesSet.size === 0) datesSet.add(new Date().toISOString().slice(0, 10));

  const sortedDates = Array.from(datesSet).sort((a, b) => new Date(b) - new Date(a));
  worksheet.views = [{ showGridLines: true }];
  worksheet.getRow(1).height = 28;

  // Header Style
  const headerRow = worksheet.getRow(1);
  headerRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
    cell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'medium', color: { argb: 'FF94A3B8' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
    };
  });

  for (let i = 0; i < sortedDates.length; i++) {
    const dateStr = sortedDates[i];
    const dateObj = new Date(dateStr);
    const isSunday = dateObj.getDay() === 0;

    const monthDay = dateStr.slice(5);
    let publicHolidayName = null;
    if (monthDay === '01-26') publicHolidayName = 'Republic Day';
    else if (monthDay === '08-15') publicHolidayName = 'Independence Day';
    else if (monthDay === '10-02') publicHolidayName = 'Gandhi Jayanti';
    else if (monthDay === '12-25') publicHolidayName = 'Christmas Day';

    const customHols = holidays.filter(h => h.date === dateStr);
    const dayReports = reports.filter(r => r.dateTime && r.dateTime.slice(0, 10) === dateStr);

    if (dayReports.length === 0 && (isSunday || publicHolidayName || customHols.length > 0)) {
      if (customHols.length > 0) {
        customHols.forEach(h => writeHolidayRow(worksheet, dateStr, h.user, h.type, h.description));
      } else if (publicHolidayName) {
        writeHolidayRow(worksheet, dateStr, 'All', 'Public Holiday', `${publicHolidayName} Holiday - Aaj nahi aana aapa unga`);
      } else if (isSunday) {
        writeHolidayRow(worksheet, dateStr, 'All', 'Weekly Off', 'Sunday Off - Aaj nahi aana aapa unga');
      }
    } else {
      if (customHols.length > 0) {
        customHols.forEach(h => writeHolidayRow(worksheet, dateStr, h.user, h.type, h.description));
      } else if (publicHolidayName) {
        writeHolidayRow(worksheet, dateStr, 'All', 'Public Holiday', `${publicHolidayName} Holiday - Work Logged`);
      } else if (isSunday) {
        writeHolidayRow(worksheet, dateStr, 'All', 'Weekly Off', 'Sunday Work Logged');
      }
      dayReports.forEach(r => writeReportRow(worksheet, r));
    }

    // Insert 2 blank spacer rows between date groups
    if (i < sortedDates.length - 1) {
      const spacer1 = worksheet.addRow([]);
      spacer1.height = 15;
      const spacer2 = worksheet.addRow([]);
      spacer2.height = 15;
      spacer1.eachCell(cell => { cell.border = {}; });
      spacer2.eachCell(cell => { cell.border = {}; });
    }
  }
  return workbook;
}

function writeHolidayRow(worksheet, date, user, type, desc) {
  const row = worksheet.addRow({
    dateTime: date, user, department: type, problems: desc,
    action: '', status: 'Holiday', resolveDate: '', remarks: ''
  });
  row.height = 24;
  row.eachCell((cell, colNumber) => {
    cell.font = { name: 'Segoe UI', size: 10, bold: true, italic: true };
    cell.alignment = { vertical: 'middle' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
    cell.font.color = { argb: 'FF92400E' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFF59E0B' } },
      left: { style: 'thin', color: { argb: 'FFF59E0B' } },
      bottom: { style: 'thin', color: { argb: 'FFF59E0B' } },
      right: { style: 'thin', color: { argb: 'FFF59E0B' } }
    };
    const key = worksheet.columns[colNumber - 1].key;
    if (key === 'dateTime' || key === 'status') cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
}

function writeReportRow(worksheet, r) {
  const row = worksheet.addRow({
    dateTime: r.dateTime || '', user: r.user || '', department: r.department || '',
    problems: r.problems || '', action: r.action || '', status: r.status || '',
    resolveDate: r.resolveDate || '', remarks: r.remarks || ''
  });
  row.height = 24;
  const rowNumber = row.number;
  row.eachCell((cell, colNumber) => {
    cell.font = { name: 'Segoe UI', size: 10 };
    cell.alignment = { vertical: 'middle' };
    if (rowNumber % 2 === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
    };
    const key = worksheet.columns[colNumber - 1].key;
    if (key === 'dateTime' || key === 'status' || key === 'resolveDate') {
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    } else {
      cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    }
    if (key === 'status') {
      const statusVal = String(cell.value).toLowerCase();
      cell.font = { name: 'Segoe UI', size: 10, bold: true };
      if (statusVal === 'resolved') {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
        cell.font.color = { argb: 'FF065F46' };
      } else if (statusVal === 'in progress') {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
        cell.font.color = { argb: 'FF92400E' };
      } else {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
        cell.font.color = { argb: 'FF991B1B' };
      }
    }
  });
}

async function saveDiskExcel(reports) {
  try {
    const holidays = readHolidays();
    const workbook = await generateStyledWorkbook(reports, holidays);
    await workbook.xlsx.writeFile(path.join(DATA_DIR, 'reports.xlsx'));
  } catch (err) {
    console.error('⚠️ Failed to save Excel reports to disk:', err);
  }
}

// -------------------------------------------------------------
// MOBILE PORT ROUTING (Port 3000)
// -------------------------------------------------------------

// API: Get departments list
appMobile.get('/api/departments', tokenAuth, (req, res) => {
  res.json(readDepartments());
});

// API: Add new department name
appMobile.post('/api/departments', tokenAuth, (req, res) => {
  const { name } = req.body;
  if (!name || name.trim() === '') return res.status(400).json({ error: 'Department name is required.' });
  const sanitized = sanitizeString(name.trim());
  const list = readDepartments();
  if (list.map(d => d.toLowerCase()).includes(sanitized.toLowerCase())) {
    return res.status(400).json({ error: 'Department already exists.' });
  }
  list.push(sanitized);
  try {
    fs.writeFileSync(DEPARTMENTS_FILE, JSON.stringify(list, null, 2), 'utf8');
    res.status(201).json({ success: true, departments: list });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save department name.' });
  }
});

// API: Get active/pending reports (Read active list on Mobile)
appMobile.get('/api/reports', tokenAuth, (req, res) => {
  res.json(readReports());
});

// API: Save new report
appMobile.post('/api/reports', tokenAuth, (req, res) => {
  const { dateTime, user, department, problems, action, status, resolveDate, remarks } = req.body;
  if (!user || !problems || !status) return res.status(400).json({ error: 'User, Problems, and Status are required.' });
  
  const newReport = {
    id: 'rep_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    dateLogged: new Date().toISOString(),
    dateTime: dateTime || new Date().toISOString(),
    user: sanitizeString(user.trim()),
    department: sanitizeString(department.trim()),
    problems: sanitizeString(problems.trim()),
    action: sanitizeString((action || '').trim()),
    status: sanitizeString(status.trim()),
    resolveDate: sanitizeString((resolveDate || '').trim()),
    remarks: sanitizeString((remarks || '').trim())
  };
  try {
    saveReport(newReport);
    res.status(201).json({ success: true, report: newReport });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save report to database.' });
  }
});

// API: Update report from mobile
appMobile.put('/api/reports/:id', tokenAuth, (req, res) => {
  const { id } = req.params;
  const { dateTime, user, department, problems, action, status, resolveDate, remarks } = req.body;
  if (!user || !problems || !status) return res.status(400).json({ error: 'User, Problems, and Status are required.' });

  const reports = readReports();
  const index = reports.findIndex(r => r.id === id);
  if (index === -1) return res.status(404).json({ error: 'Report not found.' });

  reports[index] = {
    ...reports[index],
    dateTime: dateTime || reports[index].dateTime,
    user: sanitizeString(user.trim()),
    department: sanitizeString(department.trim()),
    problems: sanitizeString(problems.trim()),
    action: sanitizeString((action || '').trim()),
    status: sanitizeString(status.trim()),
    resolveDate: sanitizeString((resolveDate || '').trim()),
    remarks: sanitizeString((remarks || '').trim())
  };

  try {
    fs.writeFileSync(JSON_FILE, JSON.stringify(reports, null, 2), 'utf8');
    // Re-create the CSV file
    const headers = ['Date', 'User', 'Department', 'Problems', 'Action', 'Status', 'ResolveDate', 'Remarks'];
    let csvContent = headers.join(',') + '\n';
    reports.forEach(report => {
      const csvRow = [
        report.dateTime, report.user, report.department, report.problems,
        report.action, report.status, report.resolveDate, report.remarks
      ];
      csvContent += csvRow.map(escapeCSV).join(',') + '\n';
    });
    fs.writeFileSync(CSV_FILE, csvContent, 'utf8');
    saveDiskExcel(reports);
    createBackup();
    res.json({ success: true, message: 'Report updated.', report: reports[index] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update report.' });
  }
});

// API: Get all holidays/leaves (Mobile read access)
appMobile.get('/api/holidays', tokenAuth, (req, res) => {
  res.json(readHolidays());
});

// API: Save new custom holiday/leave from mobile
appMobile.post('/api/holidays', tokenAuth, (req, res) => {
  const { date, type, user, description } = req.body;
  if (!date || !type || !description) return res.status(400).json({ error: 'Date, Type, and Description are required.' });
  const holidays = readHolidays();
  const exists = holidays.some(h => h.date === date && h.user === (user || 'All'));
  if (exists) return res.status(400).json({ error: 'A holiday/leave is already registered for this date.' });

  const newHoliday = {
    id: 'hol_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    date, type, user: user || 'All', description: sanitizeString(description.trim())
  };
  holidays.push(newHoliday);
  try {
    fs.writeFileSync(HOLIDAYS_FILE, JSON.stringify(holidays, null, 2), 'utf8');
    saveDiskExcel(readReports());
    res.status(201).json({ success: true, holidays, newHoliday });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save holiday/leave.' });
  }
});

// API: Delete holiday/leave from mobile
appMobile.delete('/api/holidays/:id', tokenAuth, (req, res) => {
  const { id } = req.params;
  const holidays = readHolidays();
  const updated = holidays.filter(h => h.id !== id);
  if (holidays.length === updated.length) return res.status(404).json({ error: 'Holiday/leave not found.' });
  try {
    fs.writeFileSync(HOLIDAYS_FILE, JSON.stringify(updated, null, 2), 'utf8');
    saveDiskExcel(readReports());
    res.json({ success: true, message: 'Holiday/leave deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete holiday/leave.' });
  }
});

// -------------------------------------------------------------
// ADMIN DASHBOARD ROUTING (Port 3001) - Secure Auth
// -------------------------------------------------------------
appDashboard.use(dashboardAuthMiddleware);

// Redirect root URL on Port 3001 directly to dashboard.html
appDashboard.get('/', (req, res) => {
  res.redirect('/dashboard.html');
});

[appMobile, appDashboard].forEach(app => {
  // API: Firebase Register handler
  app.post('/api/auth/register', async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, Email and Password are required.' });
    }

    try {
      const usersRef = db.ref('users');
      const existingUser = await usersRef.orderByChild('email').equalTo(email.toLowerCase()).once('value');
      if (existingUser.exists()) {
        return res.status(400).json({ error: 'User already exists with this email.' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      await usersRef.push({
        name,
        email: email.toLowerCase(),
        password: hashedPassword,
        createdAt: Date.now()
      });

      res.json({ success: true, message: 'Registration successful.' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to register user.' });
    }
  });

  // API: Firebase Login handler
  app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and Password are required.' });
    }

    try {
      const usersRef = db.ref('users');
      const snapshot = await usersRef.orderByChild('email').equalTo(email.toLowerCase()).once('value');
      if (!snapshot.exists()) {
        return res.status(401).json({ error: 'Invalid email or password.' });
      }

      const userObj = snapshot.val();
      const userId = Object.keys(userObj)[0];
      const user = userObj[userId];

      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid email or password.' });
      }

      // Generate a session token
      const token = 'sess_' + crypto.randomBytes(32).toString('hex');
      ACTIVE_SESSIONS.set(token, {
        userId: userId,
        email: user.email,
        name: user.name,
        loginTime: Date.now(),
        lastActive: Date.now()
      });

      // Cleanup session database after 2 hours idle
      setTimeout(() => {
        ACTIVE_SESSIONS.delete(token);
      }, 2 * 60 * 60 * 1000);

      res.json({ success: true, message: 'Authentication successful.', token });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to login.' });
    }
  });

  // API: Firebase Forgot Password handler
  app.post('/api/auth/forgot-password', async (req, res) => {
    const { email, newPassword } = req.body;
    if (!email || !newPassword) {
      return res.status(400).json({ error: 'Email and New Password are required.' });
    }

    try {
      const usersRef = db.ref('users');
      const snapshot = await usersRef.orderByChild('email').equalTo(email.toLowerCase()).once('value');
      if (!snapshot.exists()) {
        return res.status(404).json({ error: 'User not found.' });
      }

      const userObj = snapshot.val();
      const userId = Object.keys(userObj)[0];
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      
      await usersRef.child(userId).update({
        password: hashedPassword
      });

      res.json({ success: true, message: 'Password updated successfully.' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to update password.' });
    }
  });
});

// ============================================================
// AI API: Text Translation & Grammar Correction
// ============================================================
[appMobile, appDashboard].forEach(app => {
  app.post('/api/ai/improve-text', async (req, res) => {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'Text is required.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'AI API Key is missing. Please set GEMINI_API_KEY.' });
    }

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

      const prompt = `You are a professional IT support text enhancer.
The user provided the following text (which might be in Hindi, Hinglish, or broken English).
Please translate it to perfect, grammatically correct professional English.
Output ONLY the final corrected text, without any quotes, conversational filler, or explanations.

Text:
"${text}"`;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text().trim();
      
      res.json({ success: true, correctedText: responseText });
    } catch (error) {
      console.error('AI Error:', error);
      res.status(500).json({ error: 'Failed to improve text via AI.' });
    }
  });
});

// API: Get all reports (Dashboard full access)
appDashboard.get('/api/reports', (req, res) => {
  res.json(readReports());
});

// API: Update report
appDashboard.put('/api/reports/:id', (req, res) => {
  const { id } = req.params;
  const { dateTime, user, department, problems, action, status, resolveDate, remarks } = req.body;
  if (!user || !problems || !status) return res.status(400).json({ error: 'User, Problems, and Status are required.' });

  const reports = readReports();
  const index = reports.findIndex(r => r.id === id);
  if (index === -1) return res.status(404).json({ error: 'Report not found.' });

  reports[index] = {
    ...reports[index],
    dateTime: dateTime || reports[index].dateTime,
    user: sanitizeString(user.trim()),
    department: sanitizeString(department.trim()),
    problems: sanitizeString(problems.trim()),
    action: sanitizeString((action || '').trim()),
    status: sanitizeString(status.trim()),
    resolveDate: sanitizeString((resolveDate || '').trim()),
    remarks: sanitizeString((remarks || '').trim())
  };

  try {
    fs.writeFileSync(JSON_FILE, JSON.stringify(reports, null, 2), 'utf8');
    // Re-create the CSV file
    const headers = ['Date', 'User', 'Department', 'Problems', 'Action', 'Status', 'ResolveDate', 'Remarks'];
    let csvContent = headers.join(',') + '\n';
    reports.forEach(report => {
      const csvRow = [
        report.dateTime, report.user, report.department, report.problems,
        report.action, report.status, report.resolveDate, report.remarks
      ];
      csvContent += csvRow.map(escapeCSV).join(',') + '\n';
    });
    fs.writeFileSync(CSV_FILE, csvContent, 'utf8');
    saveDiskExcel(reports);
    createBackup();
    res.json({ success: true, message: 'Report updated.', report: reports[index] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update report.' });
  }
});

// API: Delete report
appDashboard.delete('/api/reports/:id', (req, res) => {
  const { id } = req.params;
  const reports = readReports();
  const updated = reports.filter(r => r.id !== id);
  if (reports.length === updated.length) return res.status(404).json({ error: 'Report not found.' });

  try {
    fs.writeFileSync(JSON_FILE, JSON.stringify(updated, null, 2), 'utf8');
    // Re-create the CSV file
    const headers = ['Date', 'User', 'Department', 'Problems', 'Action', 'Status', 'ResolveDate', 'Remarks'];
    let csvContent = headers.join(',') + '\n';
    updated.forEach(report => {
      const csvRow = [
        report.dateTime, report.user, report.department, report.problems,
        report.action, report.status, report.resolveDate, report.remarks
      ];
      csvContent += csvRow.map(escapeCSV).join(',') + '\n';
    });
    fs.writeFileSync(CSV_FILE, csvContent, 'utf8');
    saveDiskExcel(updated);
    createBackup();
    res.json({ success: true, message: 'Report deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete report.' });
  }
});

// API: Export filtered reports to styled Excel
appDashboard.post('/api/reports/export', async (req, res) => {
  try {
    const { filteredReports } = req.body;
    if (!Array.isArray(filteredReports)) return res.status(400).json({ error: 'Invalid reports list.' });
    const holidays = readHolidays();
    const workbook = await generateStyledWorkbook(filteredReports, holidays);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=Call_Reports.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate Excel file.' });
  }
});

// API: Get all holidays/leaves
appDashboard.get('/api/holidays', (req, res) => {
  res.json(readHolidays());
});

// API: Save new custom holiday/leave
appDashboard.post('/api/holidays', (req, res) => {
  const { date, type, user, description } = req.body;
  if (!date || !type || !description) return res.status(400).json({ error: 'Date, Type, and Description are required.' });
  const holidays = readHolidays();
  const exists = holidays.some(h => h.date === date && h.user === (user || 'All'));
  if (exists) return res.status(400).json({ error: 'A holiday/leave is already registered for this date.' });

  const newHoliday = {
    id: 'hol_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    date, type, user: user || 'All', description: sanitizeString(description.trim())
  };
  holidays.push(newHoliday);
  try {
    fs.writeFileSync(HOLIDAYS_FILE, JSON.stringify(holidays, null, 2), 'utf8');
    saveDiskExcel(readReports());
    res.status(201).json({ success: true, holidays, newHoliday });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save holiday/leave.' });
  }
});

// API: Delete holiday/leave
appDashboard.delete('/api/holidays/:id', (req, res) => {
  const { id } = req.params;
  const holidays = readHolidays();
  const updated = holidays.filter(h => h.id !== id);
  if (holidays.length === updated.length) return res.status(404).json({ error: 'Holiday/leave not found.' });
  try {
    fs.writeFileSync(HOLIDAYS_FILE, JSON.stringify(updated, null, 2), 'utf8');
    saveDiskExcel(readReports());
    res.json({ success: true, message: 'Holiday/leave deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete holiday/leave.' });
  }
});

// API: Fetch all registered users
appDashboard.get('/api/users', async (req, res) => {
  try {
    const snapshot = await db.ref('users').once('value');
    const users = [];
    if (snapshot.exists()) {
      snapshot.forEach(child => {
        const data = child.val();
        users.push({
          id: child.key,
          name: data.name,
          email: data.email,
          createdAt: data.createdAt
        });
      });
    }
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users.' });
  }
});

// API: Delete user
appDashboard.delete('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.ref('users').child(id).remove();
    res.json({ success: true, message: 'User deleted successfully.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete user.' });
  }
});

// API: Reset user password
appDashboard.put('/api/users/:id/password', async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db.ref('users').child(id).update({ password: hashedPassword });
    res.json({ success: true, message: 'Password reset successfully.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reset password.' });
  }
});

// Serve public static assets for dashboard AFTER auth middleware filters them
appDashboard.use(express.static(path.join(__dirname, 'public')));


// -------------------------------------------------------------
// SERVER BINDING & LAUNCH
// -------------------------------------------------------------
const IP = netConfig.bindIp;

// Start Mobile server
appMobile.listen(netConfig.mobilePort, IP, () => {
  console.log(`\n📱 NIK Call Report Mobile Server is running at: http://${IP === '0.0.0.0' ? 'localhost' : IP}:${netConfig.mobilePort}`);
  
  // Create / verify styled Excel spreadsheet on startup
  saveDiskExcel(readReports());
  
  // Start secure tunnel to expose Mobile Port 3000 to internet
  startTunnel();
});

// Start PC Dashboard Server
appDashboard.listen(netConfig.dashboardPort, IP, () => {
  console.log(`📊 IT-Daily Call Report Dashboard is running at: http://${IP === '0.0.0.0' ? 'localhost' : IP}:${netConfig.dashboardPort}/dashboard.html`);
});


async function startTunnel() {
  const NGROK_CONFIG = path.join(DATA_DIR, 'ngrok_config.json');
  const tunnelExposePort = netConfig.mobilePort;

  // 1. Try Ngrok if user has configured it for a permanent static domain
  if (fs.existsSync(NGROK_CONFIG)) {
    try {
      const config = JSON.parse(fs.readFileSync(NGROK_CONFIG, 'utf8'));
      if (config.domain && config.domain.trim() !== '') {
        console.log(`🔄 Starting permanent secure tunnel via Ngrok (Domain: ${config.domain})...`);
        const ngrok = spawn('npx', [
          '-y', 'ngrok', 'http', 
          `--domain=${config.domain.trim()}`, 
          tunnelExposePort.toString()
        ], { shell: true });
        
        const url = `https://${config.domain.trim()}`;
        console.log('\n==================================================================');
        console.log('🟢 Call Logger Global Tunnel Established (Ngrok Static Domain)!');
        console.log(`🔗 Mobile Web App URL: ${url}`);
        console.log('==================================================================\n');
        
        qrcode.generate(url, { small: true });

        fs.writeFileSync(TUNNEL_FILE, 
          `Mobile URL: ${url}\n` +
          `Tunnel Password (Public IP): None (Ngrok Static Tunnel)\n` +
          `Last Started: ${new Date().toLocaleString()}\n` +
          `PC Dashboard: http://localhost:${netConfig.dashboardPort}/dashboard.html\n`
        );

        ngrok.on('close', (code) => {
          console.log(`🛑 Ngrok tunnel closed with code ${code}. Reconnecting in 5 seconds...`);
          setTimeout(startTunnel, 5000);
        });
        return;
      }
    } catch (e) {
      console.error('⚠️ Ngrok fallback...', e);
    }
  }

  // 2. Try localtunnel
  console.log('🔄 Attempting to connect via localtunnel...');
  try {
    const tunnel = await localtunnel({ port: tunnelExposePort, subdomain: 'NIK-report-logger' });
    if (tunnel.url) {
      console.log('\n==================================================================');
      console.log('🟢 Call Logger Global Tunnel Established (Localtunnel)!');
      console.log(`🔗 Mobile Web App URL: ${tunnel.url}`);
      console.log('==================================================================\n');
      qrcode.generate(tunnel.url, { small: true });

      let publicIP = 'Unknown';
      try {
        const response = await fetch('https://api.ipify.org?format=json');
        if (response.ok) publicIP = (await response.json()).ip;
      } catch (e) {}

      fs.writeFileSync(TUNNEL_FILE, 
        `Mobile URL: ${tunnel.url}\n` +
        `Tunnel Password (Public IP): ${publicIP}\n` +
        `Last Started: ${new Date().toLocaleString()}\n` +
        `PC Dashboard: http://localhost:${netConfig.dashboardPort}/dashboard.html\n`
      );

      tunnel.on('close', () => {
        setTimeout(startTunnel, 5000);
      });
      return;
    }
  } catch (err) {}

  // 3. Fallback to localhost.run
  startSshTunnel();
}

function startSshTunnel() {
  const ssh = spawn('ssh', [
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'ServerAliveInterval=10',
    '-R', `80:127.0.0.1:${netConfig.mobilePort}`,
    'nokey@localhost.run'
  ]);
  
  let tunnelUrl = '';
  const handleData = (data) => {
    const output = data.toString();
    const match = output.match(/https:\/\/(?!admin\.)[a-zA-Z0-9-.]+\.(?:lhr\.life|lhrtunnel\.link|localhost\.run)/);
    if (match && !tunnelUrl) {
      tunnelUrl = match[0];
      console.log('\n==================================================================');
      console.log('🟢 Call Logger Global Tunnel Established (localhost.run)!');
      console.log(`🔗 Mobile Web App URL: ${tunnelUrl}`);
      console.log('==================================================================\n');
      qrcode.generate(tunnelUrl, { small: true });

      fs.writeFileSync(TUNNEL_FILE, 
        `Mobile URL: ${tunnelUrl}\n` +
        `Tunnel Password (Public IP): None (Private)\n` +
        `Last Started: ${new Date().toLocaleString()}\n` +
        `PC Dashboard: http://localhost:${netConfig.dashboardPort}/dashboard.html\n`
      );
    }
  };

  ssh.stdout.on('data', handleData);
  ssh.stderr.on('data', handleData);
  ssh.on('close', () => setTimeout(startTunnel, 5000));
}
