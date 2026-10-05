const XLSX = require('xlsx');
const { Client } = require('pg');

const filePath = '\\\\As6302t-989d\\work\\2023-24\\Solar Rooftop\\NP - Site Visit, 3D\\Gautam\\Complain  - Rooftop\\All Customer - FINAL.xls';
const connStr = 'postgresql://postgres.pirlkhjljjnwuunpqwbb:Ge%40286296ecogreen@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres';

const getExcelVal = (row, aliases) => {
  if (!row || typeof row !== 'object') return '';
  const keys = Object.keys(row);
  for (const alias of aliases) {
    if (row[alias] !== undefined && row[alias] !== null && String(row[alias]).trim() !== '') {
      return row[alias];
    }
    const normAlias = alias.toLowerCase().replace(/[^a-z0-9]/g, '');
    const foundKey = keys.find(k => k.toLowerCase().replace(/[^a-z0-9]/g, '') === normAlias);
    if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null && String(row[foundKey]).trim() !== '') {
      return row[foundKey];
    }
  }
  return '';
};

const parseExcelDate = (val) => {
  if (!val) return null;
  if (val instanceof Date && !isNaN(val.getTime())) {
    return val;
  }
  if (typeof val === 'number' && !isNaN(val) && val > 1000) {
    const jsDate = new Date(Math.round((val - 25569) * 86400 * 1000));
    if (!isNaN(jsDate.getTime())) return jsDate;
  }
  const rawStr = String(val).trim();
  if (!rawStr) return null;
  if (/^\d{5}$/.test(rawStr)) {
    const num = Number(rawStr);
    const jsDate = new Date(Math.round((num - 25569) * 86400 * 1000));
    if (!isNaN(jsDate.getTime())) return jsDate;
  }
  const str = rawStr.split(' ')[0].split('T')[0].trim();
  const dmy4Match = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (dmy4Match) {
    const d = new Date(parseInt(dmy4Match[3], 10), parseInt(dmy4Match[2], 10) - 1, parseInt(dmy4Match[1], 10));
    if (!isNaN(d.getTime())) return d;
  }
  const dmy2Match = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})$/);
  if (dmy2Match) {
    const rawY = parseInt(dmy2Match[3], 10);
    const year = rawY < 50 ? 2000 + rawY : 1900 + rawY;
    const d = new Date(year, parseInt(dmy2Match[2], 10) - 1, parseInt(dmy2Match[1], 10));
    if (!isNaN(d.getTime())) return d;
  }
  const ymd4Match = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (ymd4Match) {
    const d = new Date(parseInt(ymd4Match[1], 10), parseInt(ymd4Match[2], 10) - 1, parseInt(ymd4Match[3], 10));
    if (!isNaN(d.getTime())) return d;
  }
  const parsed = new Date(rawStr);
  if (!isNaN(parsed.getTime())) return parsed;
  return null;
};

const formatDate = (d) => {
  if (!d || isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

async function syncAll() {
  console.log('Reading workbook:', filePath);
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const sheetName = wb.SheetNames.find(s => {
    const n = s.trim().toUpperCase();
    return n === 'ALL CUSTOMER' || n === 'ALL CUSTOMERS' || n === 'CUSTOMERS' || n === 'CUSTOMER' || n === 'SHEET1';
  }) || wb.SheetNames[0];

  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  console.log(`Extracted ${rows.length} rows from sheet '${sheetName}'`);

  const today = new Date();
  const mapped = [];
  let inWarrantyCount = 0;
  let outWarrantyCount = 0;

  for (const r of rows) {
    const customerName = String(getExcelVal(r, [
      'Customer Name', 'CustomerName', 'Name of Customer', 'Consumer Name', 'Client Name', 'Name', 'Customer'
    ])).trim();
    if (!customerName) continue;

    const rawMeterDate = getExcelVal(r, [
      'Date of Installation of Solar Meter', 'Date of Installation', 'Installation Date', 'Install Date',
      'Date of Commissioning', 'Commissioning Date', 'DOC', 'DOI', 'Installation Dt',
      'Meter Installation Date', 'Meter Date', 'Date of Solar Meter Installation',
      'Date of Commissioning of Solar PV System', 'Commissioning Dt', 'Solar Meter Inst Date',
      'Connection Date', 'Work Completion Date'
    ]);
    const rawInvDate = getExcelVal(r, [
      'Invoice Date', 'InvoiceDate', 'Inv Date', 'Bill Date', 'Date'
    ]);

    const installD = parseExcelDate(rawMeterDate);
    const invD = parseExcelDate(rawInvDate);
    const refD = installD || invD;

    let isInWarranty = 0;
    let expiryDateStr = null;

    if (refD && !isNaN(refD.getTime())) {
      const expiry = new Date(refD);
      expiry.setFullYear(expiry.getFullYear() + 5);
      expiryDateStr = formatDate(expiry);
      isInWarranty = today <= expiry ? 1 : 0;
    }

    if (isInWarranty) inWarrantyCount++;
    else outWarrantyCount++;

    const srVal = getExcelVal(r, ['Sr No.', 'Sr. No.', 'Sr No', 'Sr#', 'S.No']);
    const srNo = (srVal !== '' && !isNaN(srVal)) ? parseInt(srVal, 10) : null;

    const pvVal = getExcelVal(r, ['PV Capacity', 'PV Capacity (kW)', 'Capacity', 'Capacity (kW)', 'Plant Capacity']);
    const pvCapacity = (pvVal !== '' && !isNaN(pvVal)) ? parseFloat(pvVal) : null;

    mapped.push({
      sr_no: srNo,
      order_no: String(getExcelVal(r, [
        'Order No', 'Order No.', 'Order Number', 'Order_No', 'order_no', 'Order', 'Order Id', 'Order ID',
        'SO No', 'SO Number', 'SO No.', 'SO#', 'Order#', 'Sales Order', 'Sales Order No', 'Sales Order Number',
        'Work Order', 'Work Order No', 'WO No', 'Application No', 'Application Number', 'App No', 'App No.',
        'Registration No', 'Reg No', 'Ref No', 'Reference No'
      ])).trim() || null,
      scheme: String(getExcelVal(r, ['Scheme', 'Project Scheme', 'Scheme Name', 'Govt Scheme'])).trim() || null,
      pv_capacity: pvCapacity,
      consumer_no: String(getExcelVal(r, ['Consumer No.', 'Consumer No', 'Consumer Number', 'CA No', 'Account No', 'K No'])).trim() || null,
      consumer_mobile: String(getExcelVal(r, ['Consumer Mobile', 'Mobile', 'Mobile No', 'Phone', 'Phone No', 'Contact', 'Contact No'])).trim() || null,
      customer_name: customerName,
      city_village: String(getExcelVal(r, ['City/Village', 'City', 'Village', 'Location', 'Town', 'District'])).trim() || null,
      installation_date: formatDate(installD) || formatDate(invD),
      dealer_name: String(getExcelVal(r, ['Dealer Name', 'Dealer', 'Agency', 'Vendor', 'Channel Partner'])).trim() || null,
      invoice_no: String(getExcelVal(r, ['Invoice No ', 'Invoice No.', 'Invoice No', 'Invoice Number', 'Bill No', 'Inv No'])).trim() || null,
      invoice_date: formatDate(invD) || formatDate(installD),
      panel_make: String(getExcelVal(r, ['Panel Make', 'Panel Manufacturer', 'Module Make', 'Panel Brand'])).trim() || null,
      inverter_make: String(getExcelVal(r, ['Inverter Make', 'Inverter Manufacturer', 'Inverter Brand'])).trim() || null,
      inverter_serial: String(getExcelVal(r, ['Inverter Sr. No.', 'Inverter Sr No', 'Inverter Serial', 'Inverter Serial No', 'Serial No'])).trim() || null,
      is_in_warranty: isInWarranty,
      warranty_expiry_date: expiryDateStr
    });
  }

  console.log(`Mapped ${mapped.length} valid customers. In Warranty: ${inWarrantyCount}, Out of Warranty: ${outWarrantyCount}`);

  const client = new Client({ connectionString: connStr });
  await client.connect();
  console.log('Connected to Supabase PostgreSQL database.');

  console.log('Clearing existing installed_customers table...');
  await client.query('DELETE FROM installed_customers;');

  console.log('Inserting in bulk multi-row chunks of 100...');
  const chunkSize = 100;
  let inserted = 0;
  const startTime = Date.now();

  for (let i = 0; i < mapped.length; i += chunkSize) {
    const chunk = mapped.slice(i, i + chunkSize);
    const valueClauses = [];
    const values = [];
    let pIdx = 1;

    for (const c of chunk) {
      valueClauses.push(`($${pIdx}, $${pIdx+1}, $${pIdx+2}, $${pIdx+3}, $${pIdx+4}, $${pIdx+5}, $${pIdx+6}, $${pIdx+7}, $${pIdx+8}, $${pIdx+9}, $${pIdx+10}, $${pIdx+11}, $${pIdx+12}, $${pIdx+13}, $${pIdx+14}, $${pIdx+15}, $${pIdx+16})`);
      values.push(
        c.sr_no,
        c.order_no,
        c.scheme,
        c.pv_capacity,
        c.consumer_no,
        c.consumer_mobile,
        c.customer_name.slice(0, 250),
        c.city_village,
        c.installation_date,
        c.dealer_name,
        c.invoice_no,
        c.invoice_date,
        c.panel_make,
        c.inverter_make,
        c.inverter_serial,
        c.is_in_warranty,
        c.warranty_expiry_date
      );
      pIdx += 17;
      inserted++;
    }

    const sql = `
      INSERT INTO installed_customers (
        sr_no, order_no, scheme, pv_capacity, consumer_no, consumer_mobile,
        customer_name, city_village, installation_date, dealer_name,
        invoice_no, invoice_date, panel_make, inverter_make, inverter_serial,
        is_in_warranty, warranty_expiry_date
      ) VALUES ${valueClauses.join(', ')}
    `;
    await client.query(sql, values);
    process.stdout.write(`Inserted ${inserted} / ${mapped.length}...\r`);
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\nSuccessfully inserted all ${inserted} customers in ${duration}s!`);

  // Verify counts in DB
  const finalStats = await client.query(`
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE is_in_warranty = 1) as in_w,
      COUNT(*) FILTER (WHERE is_in_warranty = 0 OR is_in_warranty IS NULL) as out_w
    FROM installed_customers;
  `);
  console.log('Final database counts:', finalStats.rows[0]);

  // Update customer_directory_stats table
  const tot = parseInt(finalStats.rows[0].total, 10);
  const inW = parseInt(finalStats.rows[0].in_w, 10);
  const outW = parseInt(finalStats.rows[0].out_w, 10);
  await client.query(`
    INSERT INTO customer_directory_stats (total_customers, in_warranty_count, out_warranty_count, updated_at)
    VALUES ($1, $2, $3, NOW())
  `, [tot, inW, outW]);
  console.log('Updated customer_directory_stats table!');

  await client.end();
}

syncAll().catch(console.error);
