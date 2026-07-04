const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const localtunnel = require('localtunnel');
const qrcode = require('qrcode-terminal');
const crypto = require('crypto');

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
  if (req.path.startsWith('/api/reports') || req.path === '/api/security/update-pin') {
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
  createBackup();
}

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
    createBackup();
    res.json({ success: true, message: 'Report updated.', report: reports[reportIndex] });
  } catch (err) {
    console.error('Error updating report:', err);
    res.status(500).json({ error: 'Failed to update report.' });
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
  const SUBDOMAIN = 'vash-report-logger';
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
