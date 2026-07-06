const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const localtunnel = require('localtunnel');
const qrcode = require('qrcode-terminal');
const crypto = require('crypto');
const ExcelJS = require('exceljs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================================================
// ADVANCED SECURITY MIDDLEWARES
// ==========================================================================

// 1. HTTP Security Headers (Helmet-like protection)
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// 2. Custom IP-Based Rate Limiter (Max 60 requests per minute per IP)
const ipRequests = new Map();
setInterval(() => ipRequests.clear(), 60000); // Reset limiter every minute

app.use((req, res, next) => {
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const currentCount = ipRequests.get(ip) || 0;
  if (currentCount >= 60) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }
  ipRequests.set(ip, currentCount + 1);
  next();
});

// 3. Cryptographic SHA-256 Hashing PIN Helper
function hashPin(pin) {
  return crypto.createHash('sha256').update(String(pin).trim()).digest('hex');
}

// Security PIN Verification Loader
const SECURITY_FILE = path.join(__dirname, 'data', 'security_config.json');
function getPinHash() {
  if (!fs.existsSync(SECURITY_FILE)) {
    fs.mkdirSync(path.dirname(SECURITY_FILE), { recursive: true });
    fs.writeFileSync(SECURITY_FILE, JSON.stringify({ pin: hashPin('8989') }, null, 2), 'utf8');
  }
  try {
    const data = JSON.parse(fs.readFileSync(SECURITY_FILE, 'utf8'));
    let rawPin = data.pin || '8989';
    if (/^[a-fA-F0-9]{64}$/.test(rawPin)) {
      return rawPin;
    }
    const hashed = hashPin(rawPin);
    fs.writeFileSync(SECURITY_FILE, JSON.stringify({ pin: hashed }, null, 2), 'utf8');
    return hashed;
  } catch (e) {
    return hashPin('8989');
  }
}

// 4. API Authorization Middleware (X-Auth-Token header checks & update-pin protection)
app.use((req, res, next) => {
  if (req.path.startsWith('/api/reports') || req.path === '/api/security/update-pin' || req.path.startsWith('/api/departments') || req.path.startsWith('/api/holidays')) {
    const token = req.headers['x-auth-token'];
    if (!token || hashPin(token) !== getPinHash()) {
      return res.status(401).json({ error: 'Unauthorized: Invalid Security PIN.' });
    }
  }
  next();
});

// 5. Server-Side Input Sanitizer (Prevents HTML/Script injection - XSS)
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

// Paths
const DATA_DIR = path.join(__dirname, 'data');
const JSON_FILE = path.join(DATA_DIR, 'reports.json');
const CSV_FILE = path.join(DATA_DIR, 'reports.csv');
const TUNNEL_FILE = path.join(__dirname, 'public', 'tunnel_info.txt');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Helper to escape values for CSV
function escapeCSV(val) {
  if (val === null || val === undefined) return '';
  let str = String(val).replace(/"/g, '""');
  if (str.includes(',') || str.includes('\n') || str.includes('\r') || str.includes('"')) {
    return `"${str}"`;
  }
  return str;
}

// Read reports from JSON file
function readReports() {
  if (!fs.existsSync(JSON_FILE)) {
    return [];
  }
  try {
    const data = fs.readFileSync(JSON_FILE, 'utf8');
    return JSON.parse(data || '[]');
  } catch (err) {
    console.error('Error reading JSON file, returning empty array:', err);
    return [];
  }
}

// Automated Database Backup Helper
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
if (!fs.existsSync(BACKUPS_DIR)) {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
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
    console.log(`💾 Auto-backup created for date: ${today}`);
  } catch (err) {
    console.error('⚠️ Failed to create database backup:', err);
  }
}

// Write reports to styled native Excel spreadsheet on disk
// Generate styled workbook grouped by date with 2 lines gaps and holiday row indicators
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

  // Compile sorted list of unique dates
  const datesSet = new Set();
  reports.forEach(r => {
    if (r.dateTime) {
      datesSet.add(r.dateTime.slice(0, 10));
    }
  });
  holidays.forEach(h => {
    if (h.date) {
      datesSet.add(h.date);
    }
  });

  if (datesSet.size === 0) {
    datesSet.add(new Date().toISOString().slice(0, 10));
  }

  // Sort descending (newest at top)
  const sortedDates = Array.from(datesSet).sort((a, b) => new Date(b) - new Date(a));

  worksheet.views = [{ showGridLines: true }];
  worksheet.getRow(1).height = 28;

  // Header Style
  const headerRow = worksheet.getRow(1);
  headerRow.eachCell(cell => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4F46E5' } // Indigo color
    };
    cell.font = {
      name: 'Segoe UI',
      size: 11,
      bold: true,
      color: { argb: 'FFFFFFFF' }
    };
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
    
    // Check Sunday (0 = Sunday)
    const isSunday = dateObj.getDay() === 0;

    // Check Public Holidays (India)
    const monthDay = dateStr.slice(5);
    let publicHolidayName = null;
    if (monthDay === '01-26') publicHolidayName = 'Republic Day';
    else if (monthDay === '08-15') publicHolidayName = 'Independence Day';
    else if (monthDay === '10-02') publicHolidayName = 'Gandhi Jayanti';
    else if (monthDay === '12-25') publicHolidayName = 'Christmas Day';

    // Custom holidays/leaves
    const customHols = holidays.filter(h => h.date === dateStr);

    // Reports for this day
    const dayReports = reports.filter(r => r.dateTime && r.dateTime.slice(0, 10) === dateStr);

    if (dayReports.length === 0 && (isSunday || publicHolidayName || customHols.length > 0)) {
      if (customHols.length > 0) {
        customHols.forEach(h => {
          writeHolidayRow(worksheet, dateStr, h.user, h.type, h.description);
        });
      } else if (publicHolidayName) {
        writeHolidayRow(worksheet, dateStr, 'All', 'Public Holiday', `${publicHolidayName} Holiday - Aaj nahi aana aapa unga`);
      } else if (isSunday) {
        writeHolidayRow(worksheet, dateStr, 'All', 'Weekly Off', 'Sunday Off - Aaj nahi aana aapa unga');
      }
    } else {
      // Write custom holidays/leaves for the day first
      if (customHols.length > 0) {
        customHols.forEach(h => {
          writeHolidayRow(worksheet, dateStr, h.user, h.type, h.description);
        });
      } else if (publicHolidayName) {
        writeHolidayRow(worksheet, dateStr, 'All', 'Public Holiday', `${publicHolidayName} Holiday - Work Logged`);
      } else if (isSunday) {
        writeHolidayRow(worksheet, dateStr, 'All', 'Weekly Off', 'Sunday Work Logged');
      }

      // Write normal reports
      dayReports.forEach(r => {
        writeReportRow(worksheet, r);
      });
    }

    // Insert 2 blank spacer rows between date groups
    if (i < sortedDates.length - 1) {
      const spacer1 = worksheet.addRow([]);
      spacer1.height = 15;
      const spacer2 = worksheet.addRow([]);
      spacer2.height = 15;
      
      // Clear borders for spacers to make it look like a physical gap
      spacer1.eachCell(cell => { cell.border = {}; });
      spacer2.eachCell(cell => { cell.border = {}; });
    }
  }

  return workbook;
}

function writeHolidayRow(worksheet, date, user, type, desc) {
  const row = worksheet.addRow({
    dateTime: date,
    user: user,
    department: type,
    problems: desc,
    action: '',
    status: 'Holiday',
    resolveDate: '',
    remarks: ''
  });
  row.height = 24;

  row.eachCell((cell, colNumber) => {
    cell.font = { name: 'Segoe UI', size: 10, bold: true, italic: true };
    cell.alignment = { vertical: 'middle' };
    
    // Highlight with light amber background fill
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFEF3C7' } // Amber background
    };
    
    cell.font.color = { argb: 'FF92400E' }; // Amber/Dark Orange text
    
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFF59E0B' } },
      left: { style: 'thin', color: { argb: 'FFF59E0B' } },
      bottom: { style: 'thin', color: { argb: 'FFF59E0B' } },
      right: { style: 'thin', color: { argb: 'FFF59E0B' } }
    };

    const key = worksheet.columns[colNumber - 1].key;
    if (key === 'dateTime' || key === 'status') {
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    }
  });
}

function writeReportRow(worksheet, r) {
  const row = worksheet.addRow({
    dateTime: r.dateTime || '',
    user: r.user || '',
    department: r.department || '',
    problems: r.problems || '',
    action: r.action || '',
    status: r.status || '',
    resolveDate: r.resolveDate || '',
    remarks: r.remarks || ''
  });
  row.height = 24;

  const rowNumber = row.number;

  row.eachCell((cell, colNumber) => {
    cell.font = { name: 'Segoe UI', size: 10 };
    cell.alignment = { vertical: 'middle' };

    // Zebra striping
    if (rowNumber % 2 === 0) {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF8FAFC' }
      };
    }

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
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFD1FAE5' }
        };
        cell.font.color = { argb: 'FF065F46' };
      } else if (statusVal === 'in progress') {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFEF3C7' }
        };
        cell.font.color = { argb: 'FF92400E' };
      } else {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFEE2E2' }
        };
        cell.font.color = { argb: 'FF991B1B' };
      }
    }
  });
}

// Write reports to styled native Excel spreadsheet on disk
async function saveDiskExcel(reports) {
  try {
    const holidays = readHolidays();
    const workbook = await generateStyledWorkbook(reports, holidays);
    const filePath = path.join(DATA_DIR, 'reports.xlsx');
    await workbook.xlsx.writeFile(filePath);
    console.log('📈 Styled reports.xlsx saved successfully.');
  } catch (err) {
    console.error('⚠️ Failed to save Excel reports to disk:', err);
  }
}

// Write reports to JSON and CSV files
function saveReport(report) {
  const reports = readReports();
  reports.unshift(report);
  fs.writeFileSync(JSON_FILE, JSON.stringify(reports, null, 2), 'utf8');

  // Save to CSV
  const isNewCSV = !fs.existsSync(CSV_FILE);
  const headers = [
    'Date', 'User', 'Department', 'Problems', 'Action', 'Status', 'ResolveDate', 'Remarks'
  ];
  
  let csvLine = '';
  if (isNewCSV) {
    csvLine += headers.join(',') + '\n';
  }
  
  const csvRow = [
    report.dateTime,
    report.user,
    report.department,
    report.problems,
    report.action,
    report.status,
    report.resolveDate,
    report.remarks
  ];
  
  csvLine += csvRow.map(escapeCSV).join(',') + '\n';
  fs.appendFileSync(CSV_FILE, csvLine, 'utf8');
  
  saveDiskExcel(reports);
  createBackup();
}

// ==========================================================================
// DEPARTMENTS DATABASE HELPERS & API
// ==========================================================================
const DEPARTMENTS_FILE = path.join(DATA_DIR, 'departments.json');

function readDepartments() {
  if (!fs.existsSync(DEPARTMENTS_FILE)) {
    const defaults = ["Design", "Electrical Design", "Account", "QC", "Store", "Marketing", "Service"];
    fs.writeFileSync(DEPARTMENTS_FILE, JSON.stringify(defaults, null, 2), 'utf8');
    return defaults;
  }
  try {
    const data = fs.readFileSync(DEPARTMENTS_FILE, 'utf8');
    return JSON.parse(data || '[]');
  } catch (e) {
    return ["Design", "Electrical Design", "Account", "QC", "Store", "Marketing", "Service"];
  }
}

// API: Get departments list
app.get('/api/departments', (req, res) => {
  res.json(readDepartments());
});

// API: Add new department name
app.post('/api/departments', (req, res) => {
  const { name } = req.body;
  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Department name is required.' });
  }
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
    console.error('Error saving department:', err);
    res.status(500).json({ error: 'Failed to save department name.' });
  }
});

// ==========================================================================
// HOLIDAYS & LEAVES DATABASE HELPERS & API
// ==========================================================================
const HOLIDAYS_FILE = path.join(DATA_DIR, 'holidays.json');

function readHolidays() {
  if (!fs.existsSync(HOLIDAYS_FILE)) {
    fs.writeFileSync(HOLIDAYS_FILE, JSON.stringify([], null, 2), 'utf8');
    return [];
  }
  try {
    const data = fs.readFileSync(HOLIDAYS_FILE, 'utf8');
    return JSON.parse(data || '[]');
  } catch (e) {
    return [];
  }
}

// API: Get all holidays/leaves
app.get('/api/holidays', (req, res) => {
  res.json(readHolidays());
});

// API: Save new custom holiday/leave
app.post('/api/holidays', (req, res) => {
  const { date, type, user, description } = req.body;
  if (!date || !type || !description) {
    return res.status(400).json({ error: 'Date, Type, and Description are required.' });
  }

  const holidays = readHolidays();
  
  // Prevent duplicate logs for same date and user/event
  const exists = holidays.some(h => h.date === date && h.user === (user || 'All'));
  if (exists) {
    return res.status(400).json({ error: 'A holiday/leave is already registered for this date.' });
  }

  const newHoliday = {
    id: 'hol_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    date,
    type,
    user: user || 'All',
    description: sanitizeString(description.trim())
  };

  holidays.push(newHoliday);
  
  try {
    fs.writeFileSync(HOLIDAYS_FILE, JSON.stringify(holidays, null, 2), 'utf8');
    // Regenerate reports.xlsx
    saveDiskExcel(readReports());
    res.status(201).json({ success: true, holidays: holidays, newHoliday });
  } catch (err) {
    console.error('Error saving holiday:', err);
    res.status(500).json({ error: 'Failed to save holiday/leave.' });
  }
});

// API: Delete holiday/leave
app.delete('/api/holidays/:id', (req, res) => {
  const { id } = req.params;
  const holidays = readHolidays();
  const updated = holidays.filter(h => h.id !== id);

  if (holidays.length === updated.length) {
    return res.status(404).json({ error: 'Holiday/leave not found.' });
  }

  try {
    fs.writeFileSync(HOLIDAYS_FILE, JSON.stringify(updated, null, 2), 'utf8');
    // Regenerate reports.xlsx
    saveDiskExcel(readReports());
    res.json({ success: true, message: 'Holiday/leave deleted.' });
  } catch (err) {
    console.error('Error deleting holiday:', err);
    res.status(500).json({ error: 'Failed to delete holiday/leave.' });
  }
});

// API: Get all reports
app.get('/api/reports', (req, res) => {
  const reports = readReports();
  res.json(reports);
});

// API: Save new report
app.post('/api/reports', (req, res) => {
  const { dateTime, user, department, problems, action, status, resolveDate, remarks } = req.body;
  
  if (!user || !problems || !status) {
    return res.status(400).json({ error: 'User, Problems, and Status are required.' });
  }

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
    console.error('Error saving report:', err);
    res.status(500).json({ error: 'Failed to save report to database.' });
  }
});

// API: Delete report
app.delete('/api/reports/:id', (req, res) => {
  const { id } = req.params;
  const reports = readReports();
  const updatedReports = reports.filter(r => r.id !== id);
  
  if (reports.length === updatedReports.length) {
    return res.status(404).json({ error: 'Report not found.' });
  }

  try {
    fs.writeFileSync(JSON_FILE, JSON.stringify(updatedReports, null, 2), 'utf8');
    
    // Re-create the CSV file
    const headers = [
      'Date', 'User', 'Department', 'Problems', 'Action', 'Status', 'ResolveDate', 'Remarks'
    ];
    let csvContent = headers.join(',') + '\n';
    
    updatedReports.forEach(report => {
      const csvRow = [
        report.dateTime,
        report.user,
        report.department,
        report.problems,
        report.action,
        report.status,
        report.resolveDate,
        report.remarks
      ];
      csvContent += csvRow.map(escapeCSV).join(',') + '\n';
    });
    
    fs.writeFileSync(CSV_FILE, csvContent, 'utf8');
    saveDiskExcel(updatedReports);
    createBackup();
    res.json({ success: true, message: 'Report deleted.' });
  } catch (err) {
    console.error('Error deleting report:', err);
    res.status(500).json({ error: 'Failed to delete report.' });
  }
});

// API: Update report
app.put('/api/reports/:id', (req, res) => {
  const { id } = req.params;
  const { dateTime, user, department, problems, action, status, resolveDate, remarks } = req.body;

  if (!user || !problems || !status) {
    return res.status(400).json({ error: 'User, Problems, and Status are required.' });
  }

  const reports = readReports();
  const reportIndex = reports.findIndex(r => r.id === id);

  if (reportIndex === -1) {
    return res.status(404).json({ error: 'Report not found.' });
  }

  // Update fields
  reports[reportIndex] = {
    ...reports[reportIndex],
    dateTime: dateTime || reports[reportIndex].dateTime,
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
    const headers = [
      'Date', 'User', 'Department', 'Problems', 'Action', 'Status', 'ResolveDate', 'Remarks'
    ];
    let csvContent = headers.join(',') + '\n';
    
    reports.forEach(report => {
      const csvRow = [
        report.dateTime,
        report.user,
        report.department,
        report.problems,
        report.action,
        report.status,
        report.resolveDate,
        report.remarks
      ];
      csvContent += csvRow.map(escapeCSV).join(',') + '\n';
    });
    
    fs.writeFileSync(CSV_FILE, csvContent, 'utf8');
    saveDiskExcel(reports);
    createBackup();
    res.json({ success: true, message: 'Report updated.', report: reports[reportIndex] });
  } catch (err) {
    console.error('Error updating report:', err);
    res.status(500).json({ error: 'Failed to update report.' });
  }
});

// API: Export filtered reports to styled Excel
app.post('/api/reports/export', async (req, res) => {
  try {
    const { filteredReports } = req.body;
    if (!Array.isArray(filteredReports)) {
      return res.status(400).json({ error: 'Invalid reports list.' });
    }
    
    const holidays = readHolidays();
    const workbook = await generateStyledWorkbook(filteredReports, holidays);
    
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=Call_Reports.xlsx'
    );
    
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Error generating Excel file:', err);
    res.status(500).json({ error: 'Failed to generate Excel file.' });
  }
});

// API: Update Security PIN
app.post('/api/security/update-pin', (req, res) => {
  const { currentPin, newPin } = req.body;
  const activeHash = getPinHash();
  const token = req.headers['x-auth-token'];

  if (!token || hashPin(token) !== activeHash) {
    return res.status(401).json({ error: 'Unauthorized: Invalid token.' });
  }
  if (!currentPin || !newPin) {
    return res.status(400).json({ error: 'Current PIN and New PIN are required.' });
  }
  if (hashPin(currentPin) !== activeHash) {
    return res.status(400).json({ error: 'Incorrect Current PIN.' });
  }
  if (newPin.trim().length < 4) {
    return res.status(400).json({ error: 'New PIN must be at least 4 characters long.' });
  }

  try {
    const hashedNew = hashPin(newPin);
    fs.writeFileSync(SECURITY_FILE, JSON.stringify({ pin: hashedNew }, null, 2), 'utf8');
    res.json({ success: true, message: 'Security PIN updated successfully.' });
  } catch (err) {
    console.error('Error saving new PIN:', err);
    res.status(500).json({ error: 'Failed to update PIN.' });
  }
});

// Start express server
app.listen(PORT, () => {
  console.log(`\n💻 Local server is running at: http://localhost:${PORT}`);
  console.log(`📊 PC Dashboard accessible at: http://localhost:${PORT}/dashboard.html`);
  
  // Create / verify styled Excel spreadsheet on startup
  saveDiskExcel(readReports());

  startTunnel();
});

async function startTunnel() {
  const NGROK_CONFIG = path.join(DATA_DIR, 'ngrok_config.json');

  // 1. Try Ngrok if user has configured it for a permanent static domain
  if (fs.existsSync(NGROK_CONFIG)) {
    try {
      const config = JSON.parse(fs.readFileSync(NGROK_CONFIG, 'utf8'));
      if (config.domain && config.domain.trim() !== '') {
        console.log(`🔄 Starting permanent secure tunnel via Ngrok (Domain: ${config.domain})...`);
        
        // Spawn npx ngrok with -y flag
        const ngrok = spawn('npx', [
          '-y', 'ngrok', 'http', 
          `--domain=${config.domain.trim()}`, 
          PORT.toString()
        ], { shell: true });
        
        const url = `https://${config.domain.trim()}`;
        
        console.log('\n==================================================================');
        console.log('🟢 Call Logger Global Tunnel Established (Ngrok Static Domain)!');
        console.log(`🔗 Mobile Web App URL: ${url}`);
        console.log('🔒 Private & secure tunnel. No password or passcode required.');
        console.log('   (This URL is permanent and will NEVER change!)');
        console.log('==================================================================\n');
        
        console.log('📱 Scan this QR code with your mobile camera to open the app directly:');
        qrcode.generate(url, { small: true });

        // Write tunnel info to file for dashboard
        fs.writeFileSync(TUNNEL_FILE, 
          `Mobile URL: ${url}\n` +
          `Tunnel Password (Public IP): None (Ngrok Static Tunnel)\n` +
          `Last Started: ${new Date().toLocaleString()}\n` +
          `PC Dashboard: http://localhost:${PORT}/dashboard.html\n`
        );

        ngrok.stdout.on('data', (data) => {
          console.log(`[Ngrok Log] ${data.toString().trim()}`);
        });

        ngrok.stderr.on('data', (data) => {
          console.error(`[Ngrok Error] ${data.toString().trim()}`);
        });

        ngrok.on('close', (code) => {
          console.log(`🛑 Ngrok tunnel closed with code ${code}. Reconnecting in 5 seconds...`);
          setTimeout(startTunnel, 5000);
        });

        return;
      }
    } catch (ngrokErr) {
      console.error('⚠️ Failed to start Ngrok tunnel, falling back to localtunnel...', ngrokErr);
    }
  }

  // 2. Try localtunnel for a fixed URL
  console.log('🔄 Attempting to connect via localtunnel...');
  const SUBDOMAIN = 'NIK-report-logger';
  try {
    const tunnel = await localtunnel({ 
      port: PORT, 
      subdomain: SUBDOMAIN 
    });
    
    if (tunnel.url) {
      console.log('\n==================================================================');
      console.log('🟢 Call Logger Global Tunnel Established (Localtunnel)!');
      console.log(`🔗 Mobile Web App URL: ${tunnel.url}`);
      console.log('🔑 Passcode: Your PC public IP address (found in dashboard)');
      console.log('==================================================================\n');
      
      console.log('📱 Scan this QR code with your mobile camera to open the app directly:');
      qrcode.generate(tunnel.url, { small: true });

      // Fetch public IP for passcode
      let publicIP = 'Unknown';
      try {
        const response = await fetch('https://api.ipify.org?format=json');
        if (response.ok) {
          const data = await response.json();
          publicIP = data.ip;
        }
      } catch (e) {}

      // Write tunnel info to file for dashboard
      fs.writeFileSync(TUNNEL_FILE, 
        `Mobile URL: ${tunnel.url}\n` +
        `Tunnel Password (Public IP): ${publicIP}\n` +
        `Last Started: ${new Date().toLocaleString()}\n` +
        `PC Dashboard: http://localhost:${PORT}/dashboard.html\n`
      );

      tunnel.on('close', () => {
        console.log('🛑 Localtunnel closed. Retrying connection...');
        setTimeout(startTunnel, 5000);
      });
      
      return;
    }
  } catch (err) {
    console.log('⚠️ Localtunnel service is currently busy or offline.');
  }

  // 3. Fallback to localhost.run
  console.log('👉 Falling back to stable passcode-free tunnel (localhost.run)...');
  startSshTunnel();
}

function startSshTunnel() {
  const ssh = spawn('ssh', [
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'ServerAliveInterval=10',
    '-o', 'ServerAliveCountMax=3',
    '-R', `80:127.0.0.1:${PORT}`,
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
      console.log('🔒 Private & secure tunnel. No password or passcode required.');
      console.log('==================================================================\n');
      
      console.log('📱 Scan this QR code with your mobile camera to open the app directly:');
      qrcode.generate(tunnelUrl, { small: true });

      // Write tunnel info to file for dashboard
      fs.writeFileSync(TUNNEL_FILE, 
        `Mobile URL: ${tunnelUrl}\n` +
        `Tunnel Password (Public IP): None (Private)\n` +
        `Last Started: ${new Date().toLocaleString()}\n` +
        `PC Dashboard: http://localhost:${PORT}/dashboard.html\n`
      );
    }
  };

  ssh.stdout.on('data', handleData);
  ssh.stderr.on('data', handleData);

  ssh.on('close', (code) => {
    console.log(`🛑 SSH Tunnel connection closed with code ${code}. Reconnecting in 5 seconds...`);
    setTimeout(startTunnel, 5000);
  });
}
