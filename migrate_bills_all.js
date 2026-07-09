const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

async function migrateData() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.join(__dirname, '1 Bill-Invoice  Dharmesh.xlsx'));
  
  const outPath = path.join(__dirname, 'data', 'bills.json');
  const bills = [];

  wb.eachSheet((ws) => {
    console.log(`Processing sheet ${ws.name}, rows: ${ws.rowCount}`);
    for (let i = 3; i <= ws.rowCount; i++) {
      const row = ws.getRow(i);
      if (!row.hasValues) continue;

      const getVal = (col) => {
        const cell = row.getCell(col);
        if (!cell.value) return '';
        if (cell.value instanceof Date) {
          return cell.value.toISOString().slice(0, 10);
        }
        if (cell.value && cell.value.richText) {
          return cell.value.richText.map(t => t.text).join('');
        }
        return String(cell.value).trim();
      };

      const date = getVal(1);
      const refCode = getVal(2);
      const challanNo = getVal(3);
      const supplier = getVal(4);
      const itemDesc = getVal(5);
      
      if ((!date || date === '-') && (!supplier || supplier === '-') && (!itemDesc || itemDesc === '-')) {
        continue;
      }

      bills.push({
        id: 'bill_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5) + '_' + i,
        date: date === '-' ? '' : date,
        refCode: refCode === '-' ? '' : refCode,
        challanNo: challanNo === '-' ? '' : challanNo,
        supplier: supplier === '-' ? '' : supplier,
        itemDesc: itemDesc === '-' ? '' : itemDesc,
        qty: parseFloat(getVal(6).replace(/,/g, '')) || 0,
        amount: parseFloat(getVal(7).replace(/,/g, '')) || 0,
        poNumber: getVal(8) === '-' ? '' : getVal(8),
        purpose: getVal(9) === '-' ? '' : getVal(9),
        remarks: getVal(10) === '-' ? '' : getVal(10),
        handOver: getVal(11) === '-' ? '' : getVal(11)
      });
    }
  });

  fs.writeFileSync(outPath, JSON.stringify(bills, null, 2), 'utf8');
  console.log(`Successfully parsed ${bills.length} bills from all sheets combined!`);
}

migrateData().catch(console.error);
