const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const db = require('../config/database');

const DEFAULT_NETWORK_PATH = '\\\\As6302t-989d\\work\\2023-24\\Solar Rooftop\\NP - Site Visit, 3D\\SUMIT\\All Customer - FINAL.xls';

/**
 * Helper to convert Excel date (serial number or string) to YYYY-MM-DD
 */
function parseExcelDate(val) {
  if (!val) return null;

  try {
    // If numeric serial number (e.g. 43462)
    if (typeof val === 'number') {
      const parsed = XLSX.SSF.parse_date_code(val);
      if (parsed && parsed.y && parsed.m && parsed.d) {
        const yyyy = String(parsed.y);
        const mm = String(parsed.m).padStart(2, '0');
        const dd = String(parsed.d).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
      }
    }

    // If string date
    if (typeof val === 'string') {
      const trimmed = val.trim();
      // Handle format like '2018-12-03 00:00:00' or '2018-12-03'
      if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
        return trimmed.substring(0, 10);
      }
      // Handle format like 'DD/MM/YYYY'
      if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(trimmed)) {
        const parts = trimmed.split(' ')[0].split('/');
        const dd = parts[0].padStart(2, '0');
        const mm = parts[1].padStart(2, '0');
        const yyyy = parts[2];
        return `${yyyy}-${mm}-${dd}`;
      }
      const d = new Date(trimmed);
      if (!isNaN(d.getTime())) {
        return d.toISOString().split('T')[0];
      }
    }
  } catch (err) {
    console.warn('Date parsing error for:', val, err.message);
  }

  return null;
}

/**
 * Calculate 5-year warranty from invoice or installation date
 */
function calculateWarranty(dateStr) {
  if (!dateStr) {
    return { isInWarranty: 0, expiryDate: null, ageYears: null };
  }

  try {
    const [year, month, day] = dateStr.split('-').map(Number);
    const startDate = new Date(year, month - 1, day);
    const expiryDate = new Date(year + 5, month - 1, day);
    const today = new Date();

    const diffMs = today.getTime() - startDate.getTime();
    const ageYears = Math.max(0, (diffMs / (1000 * 60 * 60 * 24 * 365.25)).toFixed(1));

    const isInWarranty = today.getTime() <= expiryDate.getTime() ? 1 : 0;
    const expiryStr = expiryDate.toISOString().split('T')[0];

    return {
      isInWarranty,
      expiryDate: expiryStr,
      ageYears: Number(ageYears)
    };
  } catch (err) {
    return { isInWarranty: 0, expiryDate: null, ageYears: null };
  }
}

/**
 * Sync customers from Excel file into SQLite installed_customers table
 */
async function syncCustomersFromExcel(sourcePathOrBuffer = null) {
  let targetSource = sourcePathOrBuffer;
  if (!targetSource) {
    const candidates = [
      path.join(__dirname, '..', 'data', 'customers.xlsx'),
      path.join(__dirname, '..', 'data', 'customers.xls'),
      path.join(__dirname, '..', 'data', 'All Customer - FINAL.xls'),
      path.join(__dirname, '..', 'data', 'All Customer - FINAL.xlsx'),
      DEFAULT_NETWORK_PATH
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        targetSource = c;
        break;
      }
    }
  }

  if (!targetSource) {
    throw new Error('No Excel file found. Please upload your updated Excel file (.xlsx or .xls) using the dashboard.');
  }

  console.log(`[ExcelSync] Starting sync from: ${typeof targetSource === 'string' ? targetSource : 'Uploaded Buffer'}`);

  let wb;
  if (Buffer.isBuffer(targetSource)) {
    wb = XLSX.read(targetSource, { type: 'buffer' });
  } else {
    if (!fs.existsSync(targetSource)) {
      throw new Error(`Excel file not found at path: ${targetSource}`);
    }
    wb = XLSX.readFile(targetSource);
  }

  // Find the 'ALL CUSTOMER' sheet (case-insensitive, trims trailing space)
  const sheetName = wb.SheetNames.find(name => name.trim().toUpperCase() === 'ALL CUSTOMER') || wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`Sheet 'ALL CUSTOMER' not found in workbook. Available sheets: ${wb.SheetNames.join(', ')}`);
  }

  const rawRows = XLSX.utils.sheet_to_json(sheet);
  console.log(`[ExcelSync] Read ${rawRows.length} rows from sheet '${sheetName}'`);

  const insertStmt = db.prepare(`
    INSERT INTO installed_customers (
      sr_no, order_no, scheme, pv_capacity, consumer_no, consumer_mobile,
      customer_name, city_village, installation_date, dealer_name,
      invoice_no, invoice_date, panel_make, inverter_make, inverter_serial,
      is_in_warranty, warranty_expiry_date
    ) VALUES (
      @sr_no, @order_no, @scheme, @pv_capacity, @consumer_no, @consumer_mobile,
      @customer_name, @city_village, @installation_date, @dealer_name,
      @invoice_no, @invoice_date, @panel_make, @inverter_make, @inverter_serial,
      @is_in_warranty, @warranty_expiry_date
    )
  `);

  let insertedCount = 0;
  let inWarrantyCount = 0;
  let outWarrantyCount = 0;

  // Execute in a single SQLite transaction for microsecond speed
  const runTransaction = db.transaction((rows) => {
    // Clear previous customer records
    db.prepare('DELETE FROM installed_customers').run();

    for (const r of rows) {
      const customerName = (r['Customer Name'] || r['customer_name'] || '').toString().trim();
      if (!customerName) continue; // Skip blank header or footer rows

      const invoiceDateStr = parseExcelDate(r['Invoice Date'] || r['invoice_date']);
      const installDateStr = parseExcelDate(r['Date of Installation of Solar Meter'] || r['installation_date']);
      const referenceDate = invoiceDateStr || installDateStr;

      const warrantyInfo = calculateWarranty(referenceDate);
      if (warrantyInfo.isInWarranty) inWarrantyCount++;
      else outWarrantyCount++;

      const consumerMobile = (r['Consumer Mobile'] || r['Mobile'] || r['Phone'] || '').toString().trim();
      const consumerNo = (r['Consumer No.'] || r['Consumer No'] || '').toString().trim();
      const invoiceNo = (r['Invoice No '] || r['Invoice No'] || '').toString().trim();
      const inverterSerial = (r['Inverter Sr. No.'] || r['Inverter Serial'] || '').toString().trim();
      const cityVillage = (r['City/Village'] || r['City'] || '').toString().trim();
      const dealerName = (r['Dealer Name'] || r['Dealer'] || '').toString().trim();

      insertStmt.run({
        sr_no: r['Sr No.'] || r['Sr. No.'] || null,
        order_no: (r['Order No'] || '').toString().trim() || null,
        scheme: (r['Scheme'] || '').toString().trim() || null,
        pv_capacity: parseFloat(r['PV Capacity']) || null,
        consumer_no: consumerNo || null,
        consumer_mobile: consumerMobile || null,
        customer_name: customerName,
        city_village: cityVillage || null,
        installation_date: installDateStr,
        dealer_name: dealerName || null,
        invoice_no: invoiceNo || null,
        invoice_date: invoiceDateStr,
        panel_make: (r['Panel Make'] || '').toString().trim() || null,
        inverter_make: (r['Inverter Make'] || '').toString().trim() || null,
        inverter_serial: inverterSerial || null,
        is_in_warranty: warrantyInfo.isInWarranty,
        warranty_expiry_date: warrantyInfo.expiryDate
      });

      insertedCount++;
    }
  });

  runTransaction(rawRows);

  console.log(`[ExcelSync] Successfully synced ${insertedCount} customers. In-Warranty: ${inWarrantyCount}, Out-of-Warranty: ${outWarrantyCount}`);

  return {
    totalSynced: insertedCount,
    inWarrantyCount,
    outWarrantyCount,
    sourcePath: typeof targetSource === 'string' ? targetSource : 'Uploaded File'
  };
}

module.exports = {
  syncCustomersFromExcel,
  parseExcelDate,
  calculateWarranty,
  DEFAULT_NETWORK_PATH
};
