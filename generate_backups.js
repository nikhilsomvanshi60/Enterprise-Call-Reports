const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const DATA_DIR = path.join(__dirname, 'data');
const BILLS_FILE = path.join(DATA_DIR, 'bills.json');
const BILLS_CSV_FILE = path.join(DATA_DIR, 'bills.csv');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');

function escapeCSV(val) {
  if (val === null || val === undefined) return '';
  let str = String(val).replace(/"/g, '""');
  if (str.includes(',') || str.includes('\n') || str.includes('\r') || str.includes('"')) {
    return `"${str}"`;
  }
  return str;
}

function writeBillsCSV(bills) {
  const headers = ['Date', 'ChallanNo', 'Supplier', 'ItemDesc', 'Qty', 'Amount', 'PONumber', 'Purpose', 'Remarks', 'HandOver'];
  let csvContent = headers.join(',') + '\n';
  bills.forEach(b => {
    const csvRow = [
      b.date, b.challanNo, b.supplier, b.itemDesc, b.qty, b.amount, b.poNumber, b.purpose, b.remarks, b.handOver
    ];
    csvContent += csvRow.map(escapeCSV).join(',') + '\n';
  });
  fs.writeFileSync(BILLS_CSV_FILE, csvContent, 'utf8');
}

async function generateBillsWorkbook(bills) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Bills & Invoices');

  worksheet.columns = [
    { header: 'Bill Date', key: 'date', width: 15 },
    { header: 'Bill / Challan No.', key: 'challanNo', width: 20 },
    { header: 'Supplier', key: 'supplier', width: 25 },
    { header: 'Item Description', key: 'itemDesc', width: 40 },
    { header: 'Qty', key: 'qty', width: 10 },
    { header: 'Amount', key: 'amount', width: 15 },
    { header: 'PO Number', key: 'poNumber', width: 15 },
    { header: 'Purpose', key: 'purpose', width: 20 },
    { header: 'Remarks', key: 'remarks', width: 25 },
    { header: 'Hand Over to / Date', key: 'handOver', width: 25 }
  ];

  worksheet.views = [{ showGridLines: true }];
  const headerRow = worksheet.getRow(1);
  headerRow.height = 25;
  headerRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF10B981' } };
    cell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  bills.forEach((b, i) => {
    const row = worksheet.addRow({
      date: b.date || '',
      challanNo: b.challanNo || '',
      supplier: b.supplier || '',
      itemDesc: b.itemDesc || '',
      qty: parseFloat(b.qty) || 0,
      amount: parseFloat(b.amount) || 0,
      poNumber: b.poNumber || '',
      purpose: b.purpose || '',
      remarks: b.remarks || '',
      handOver: b.handOver || ''
    });
    row.eachCell(cell => {
      cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    });
  });

  return workbook;
}

async function saveBillsDiskExcel(bills) {
  try {
    const workbook = await generateBillsWorkbook(bills);
    await workbook.xlsx.writeFile(path.join(DATA_DIR, 'bills.xlsx'));
  } catch (err) {
    console.error('⚠️ Failed to save Excel bills to disk:', err);
  }
}

function createBackup() {
  try {
    const today = new Date().toISOString().split('T')[0];
    if (fs.existsSync(BILLS_FILE)) {
      fs.copyFileSync(BILLS_FILE, path.join(BACKUPS_DIR, `bills_backup_${today}.json`));
    }
    if (fs.existsSync(BILLS_CSV_FILE)) {
      fs.copyFileSync(BILLS_CSV_FILE, path.join(BACKUPS_DIR, `bills_backup_${today}.csv`));
    }
  } catch (err) {
    console.error('⚠️ Failed to create database backup:', err);
  }
}

async function run() {
  const bills = JSON.parse(fs.readFileSync(BILLS_FILE, 'utf8'));
  writeBillsCSV(bills);
  await saveBillsDiskExcel(bills);
  createBackup();
  console.log('Initial backup and export files generated.');
}

run();
