const { Client } = require('pg');
const XLSX = require('xlsx');

const connStr = 'postgresql://postgres.pirlkhjljjnwuunpqwbb:Ge%40286296ecogreen@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres';
const client = new Client({ connectionString: connStr });

function parsePhoneNumbers(rawStr) {
  if (!rawStr) return [];
  const s = String(rawStr).replace(/mo\.?:?/gi, ' ').replace(/phone:?/gi, ' ').replace(/mobile:?/gi, ' ');
  const parts = s.split(/[,;\/|&\n]|(?:\band\b)/i);
  const phones = [];
  for (const part of parts) {
    const digits = part.replace(/\D/g, '');
    if (digits.length >= 10) {
      if (digits.length === 12 && digits.startsWith('91')) {
        phones.push(digits.slice(2));
      } else if (digits.length === 11 && digits.startsWith('0')) {
        phones.push(digits.slice(1));
      } else if (digits.length === 10) {
        phones.push(digits);
      } else if (digits.length > 10) {
        for (let i = 0; i <= digits.length - 10; i += 10) {
          const sub = digits.slice(i, i + 10);
          if (sub.length === 10) phones.push(sub);
        }
      }
    }
  }
  return Array.from(new Set(phones));
}

async function run() {
  await client.connect();
  console.log('Connected to Supabase PostgreSQL!');

  // 1. Create dealers table & add complaint columns
  await client.query(`
    CREATE TABLE IF NOT EXISTS dealers (
      id SERIAL PRIMARY KEY,
      dealer_name TEXT NOT NULL,
      contact_person TEXT,
      primary_contact TEXT,
      alternate_contacts TEXT,
      raw_contact TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_dealers_name ON dealers (LOWER(dealer_name));
    
    ALTER TABLE complaints ADD COLUMN IF NOT EXISTS dealer_contact TEXT;
    ALTER TABLE complaints ADD COLUMN IF NOT EXISTS dealer_contact_person TEXT;
    ALTER TABLE complaints ADD COLUMN IF NOT EXISTS dealer_alternate_contacts TEXT;
  `);
  console.log('Schema verified/created.');

  // 2. Read DEALER NAME&NO - Copy.xlsx
  const wb = XLSX.readFile('c:\\Users\\Administrator\\Desktop\\DEALER NAME&NO - Copy.xlsx');
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);
  console.log(`Found ${rows.length} dealers in Excel.`);

  // Truncate and re-insert in batch chunks
  await client.query('TRUNCATE TABLE dealers RESTART IDENTITY');

  const CHUNK_SIZE = 100;
  let inserted = 0;

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const valueClauses = [];
    const values = [];
    let pIdx = 1;

    for (const r of chunk) {
      const name = String(r['DEALER NAME'] || '').trim();
      if (!name) continue;
      const person = String(r['CONTACT PERSON'] || '').trim() || null;
      const rawContact = String(r['CONTACT NO.'] || '').trim() || null;
      const phones = parsePhoneNumbers(rawContact);
      const primary = phones.length > 0 ? phones[0] : (rawContact ? rawContact.slice(0, 50) : null);
      const alternates = phones.length > 1 ? JSON.stringify(phones.slice(1)) : null;

      valueClauses.push(`($${pIdx}, $${pIdx+1}, $${pIdx+2}, $${pIdx+3}, $${pIdx+4})`);
      values.push(name, person, primary, alternates, rawContact);
      pIdx += 5;
      inserted++;
    }

    if (valueClauses.length > 0) {
      await client.query(
        `INSERT INTO dealers (dealer_name, contact_person, primary_contact, alternate_contacts, raw_contact) VALUES ${valueClauses.join(', ')}`,
        values
      );
    }
  }

  console.log(`Successfully batch inserted ${inserted} dealers into database!`);

  const countRes = await client.query('SELECT COUNT(*) as cnt FROM dealers');
  console.log('Database dealers count:', countRes.rows[0].cnt);

  const sampleRes = await client.query('SELECT * FROM dealers LIMIT 3');
  console.log('Sample rows:', sampleRes.rows);

  // Also check if data.xlsx on Desktop exists and append sheet "dealer name & contact" if not already present
  const dataXlsxPath = 'c:\\Users\\Administrator\\Desktop\\data.xlsx';
  try {
    const dataWb = XLSX.readFile(dataXlsxPath);
    const hasDealerSheet = dataWb.SheetNames.some(s => s.trim().toLowerCase().includes('dealer'));
    if (!hasDealerSheet) {
      XLSX.utils.book_append_sheet(dataWb, sheet, 'dealer name & contact');
      XLSX.writeFile(dataWb, dataXlsxPath);
      console.log('Appended "dealer name & contact" sheet to ' + dataXlsxPath);
    } else {
      console.log('data.xlsx already has dealer sheet');
    }
  } catch(e) {
    console.warn('Could not update data.xlsx:', e.message);
  }

  await client.end();
}

run().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
