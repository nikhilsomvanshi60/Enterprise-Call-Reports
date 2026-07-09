const ExcelJS = require('exceljs');

async function listSheets() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('Bill-Invoice  Dharmesh.xlsx');
  wb.eachSheet((ws, id) => {
    console.log(`Sheet: '${ws.name}' - Rows: ${ws.rowCount}`);
  });
}

listSheets().catch(console.error);
