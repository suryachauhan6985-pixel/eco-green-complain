const { Pool } = require('pg');
const XLSX = require('xlsx');

const pool = new Pool({
  connectionString: 'postgresql://postgres.pirlkhjljjnwuunpqwbb:Ge%40286296ecogreen@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres'
});

const excelPath = '\\\\As6302t-989d\\work\\2023-24\\Solar Rooftop\\NP - Site Visit, 3D\\Gautam\\Complain  - Rooftop\\All Customer - FINAL.xls';

async function syncOrderNumbers() {
  console.log('Reading Excel file...');
  const workbook = XLSX.readFile(excelPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]]; // 'ALL CUSTOMER '
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
  console.log(`Loaded ${rows.length} rows from Excel sheet.`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TEMP TABLE temp_customer_orders (
        sr_no INT,
        order_no TEXT,
        consumer_no TEXT,
        consumer_mobile TEXT,
        customer_name TEXT,
        inverter_serial TEXT
      );
    `);

    // Prepare batch inserts into temp table
    const batchSize = 400;
    for (let i = 0; i < rows.length; i += batchSize) {
      const slice = rows.slice(i, i + batchSize);
      const values = [];
      const params = [];
      let pIdx = 1;

      for (const r of slice) {
        const srNo = r['Sr No.'] ? parseInt(r['Sr No.'], 10) : null;
        const orderNo = r['Order No'] !== null && r['Order No'] !== undefined ? String(r['Order No']).trim() : null;
        const consNo = r['Consumer No.'] !== null && r['Consumer No.'] !== undefined ? String(r['Consumer No.']).trim() : null;
        const mob = r['Consumer Mobile'] !== null && r['Consumer Mobile'] !== undefined ? String(r['Consumer Mobile']).trim() : null;
        const name = r['Customer Name'] !== null && r['Customer Name'] !== undefined ? String(r['Customer Name']).trim() : null;
        const invSr = r['Inverter Sr. No.'] !== null && r['Inverter Sr. No.'] !== undefined ? String(r['Inverter Sr. No.']).trim() : null;

        if (orderNo) {
          values.push(`($${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++})`);
          params.push(srNo, orderNo, consNo, mob, name, invSr);
        }
      }

      if (values.length > 0) {
        await client.query(`
          INSERT INTO temp_customer_orders (sr_no, order_no, consumer_no, consumer_mobile, customer_name, inverter_serial)
          VALUES ${values.join(', ')}
        `, params);
      }
    }

    console.log('Temp table populated. Running UPDATE on installed_customers...');

    // Update by consumer_no first
    const res1 = await client.query(`
      UPDATE installed_customers ic
      SET order_no = t.order_no
      FROM temp_customer_orders t
      WHERE ic.order_no IS NULL
        AND ic.consumer_no IS NOT NULL
        AND ic.consumer_no != ''
        AND ic.consumer_no = t.consumer_no
        AND t.order_no IS NOT NULL;
    `);
    console.log(`Updated by consumer_no: ${res1.rowCount} rows`);

    // Update by customer_name and consumer_mobile
    const res2 = await client.query(`
      UPDATE installed_customers ic
      SET order_no = t.order_no
      FROM temp_customer_orders t
      WHERE ic.order_no IS NULL
        AND ic.customer_name = t.customer_name
        AND RIGHT(REGEXP_REPLACE(ic.consumer_mobile, '[^0-9]', '', 'g'), 10) = RIGHT(REGEXP_REPLACE(t.consumer_mobile, '[^0-9]', '', 'g'), 10)
        AND t.order_no IS NOT NULL;
    `);
    console.log(`Updated by name & mobile: ${res2.rowCount} rows`);

    // Update by sr_no if still null
    const res3 = await client.query(`
      UPDATE installed_customers ic
      SET order_no = t.order_no
      FROM temp_customer_orders t
      WHERE ic.order_no IS NULL
        AND ic.sr_no IS NOT NULL
        AND ic.sr_no = t.sr_no
        AND t.order_no IS NOT NULL;
    `);
    console.log(`Updated by sr_no: ${res3.rowCount} rows`);

    await client.query('COMMIT');

    // Verify stats
    const stats = await client.query(`
      SELECT count(*) as total, count(order_no) as with_order_no FROM installed_customers;
    `);
    console.log('Final Stats:', stats.rows[0]);

    // Check sample customers
    const sample = await client.query(`
      SELECT customer_name, order_no, consumer_mobile, consumer_no, dealer_name 
      FROM installed_customers 
      WHERE customer_name ILIKE '%KHANDHAR%' OR customer_name ILIKE '%INUSBHAI%'
      LIMIT 5;
    `);
    console.log('Sample verified rows:');
    console.dir(sample.rows, { depth: null });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

syncOrderNumbers().catch(console.error);
