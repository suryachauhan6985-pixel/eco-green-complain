const { Client } = require('pg');
const XLSX = require('xlsx');
const fs = require('fs');

const connStr = 'postgresql://postgres.pirlkhjljjnwuunpqwbb:Ge%40286296ecogreen@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres';
const client = new Client({ connectionString: connStr });

function extractDealerContactInfo(rawStr) {
  if (!rawStr || !String(rawStr).trim()) {
    return { contactPerson: null, primaryMobile: null, alternateMobiles: [], rawContact: rawStr || '' };
  }

  const orig = String(rawStr).trim();
  let text = orig;

  // 1. Check for contact person in parentheses: e.g. "(DILIPBHAI S. MORI)" or "(DARSHANBHAI)"
  let contactPerson = null;
  const parenMatch = text.match(/\(([^)]+)\)/);
  if (parenMatch) {
    const inside = parenMatch[1].trim();
    if (/[a-zA-Z]{2,}/.test(inside)) {
      contactPerson = inside.replace(/^mr\.?\s*|^mrs\.?\s*|^shri\s*/i, '').trim();
      text = text.replace(parenMatch[0], ' ');
    }
  }

  // 2. Remove standard prefixes like "MO.:", "MO.", "MO.NO.:", "MOBILE:", "PHONE:", "PH.:", "M.:", "CONTECT NO.:"
  let cleaned = text.replace(/^(?:MO\.?|MO\.NO\.?|MOBILE|PHONE|PH\.?|M\.?|CONTECT(?:\s+NO\.?)?|CONTACT(?:\s+NO\.?)?)\s*[:.\-]?\s*/gi, ' ');
  cleaned = cleaned.replace(/\b(?:MO\.?|MO\.NO\.?|MOBILE|PHONE|PH\.?|CONTECT|CONTACT)\s*[:.\-]?\s*/gi, ' ');

  // 3. Extract any remaining person name if not already found
  // e.g. "RAJUBHAI - 94264 57351" or "9426041577 - HARIBHAI" or "98982 33244 DHAVAL PATEL" or "8264684299 DHARMESHBHAI"
  if (!contactPerson) {
    // Alphabetic prefix before number
    const prefixNameMatch = cleaned.match(/^([A-Za-z\s.]{3,30})\s*[-:]\s*(?:\d|\+)/);
    if (prefixNameMatch && !/^(?:mo|mobile|phone|call|whatsapp|no)$/i.test(prefixNameMatch[1].trim())) {
      contactPerson = prefixNameMatch[1].trim();
      cleaned = cleaned.slice(prefixNameMatch[0].length - 1);
    } else {
      // Alphabetic suffix after numbers
      const suffixNameMatch = cleaned.match(/(?:[-:,]\s*)?([A-Za-z\s.]{3,35})\s*[-:]*$/);
      if (suffixNameMatch && !/^(?:mo|mobile|phone|call|whatsapp|etc|no)$/i.test(suffixNameMatch[1].trim())) {
        contactPerson = suffixNameMatch[1].replace(/[-:]+$/, '').trim();
        cleaned = cleaned.slice(0, suffixNameMatch.index);
      }
    }
  }

  if (contactPerson) {
    contactPerson = contactPerson.replace(/^[-:,\s]+|[-:,\s]+$/g, '').trim();
    if (contactPerson.length < 2 || /^(?:mo|mobile|phone|null|na|no|no\.)$/i.test(contactPerson)) {
      contactPerson = null;
    }
  }

  // 4. Parse phone numbers:
  const segments = cleaned.split(/[,;\/|]|\band\b/i);
  const mobileNumbers = [];
  const landlineNumbers = [];

  for (const seg of segments) {
    const digitsOnly = seg.replace(/\D/g, '');

    // 10 digits starting with 6, 7, 8, 9
    if (/^[6-9]\d{9}$/.test(digitsOnly)) {
      mobileNumbers.push(digitsOnly);
    }
    // 11 digits starting with 0 then 6-9
    else if (/^0[6-9]\d{9}$/.test(digitsOnly)) {
      mobileNumbers.push(digitsOnly.slice(1));
    }
    // 12 digits starting with 91 then 6-9
    else if (/^91[6-9]\d{9}$/.test(digitsOnly)) {
      mobileNumbers.push(digitsOnly.slice(2));
    }
    // Multiple mobile numbers inside a single segment
    else if (digitsOnly.length > 10) {
      const matches = digitsOnly.match(/[6-9]\d{9}/g);
      if (matches && matches.length > 0) {
        for (const m of matches) mobileNumbers.push(m);
      } else {
        landlineNumbers.push(digitsOnly);
      }
    }
    // Landline
    else if (digitsOnly.length >= 6) {
      landlineNumbers.push(digitsOnly);
    }
  }

  const uniqueMobiles = Array.from(new Set(mobileNumbers));
  const uniqueLandlines = Array.from(new Set(landlineNumbers));

  // Prioritize 10-digit mobile number as primary
  const primaryMobile = uniqueMobiles.length > 0 ? uniqueMobiles[0] : (uniqueLandlines.length > 0 ? uniqueLandlines[0] : null);
  const alternateMobiles = uniqueMobiles.slice(1);
  if (uniqueMobiles.length > 0 && uniqueLandlines.length > 0) {
    alternateMobiles.push(...uniqueLandlines);
  }

  return {
    contactPerson,
    primaryMobile,
    alternateMobiles,
    rawContact: orig
  };
}

async function run() {
  await client.connect();
  console.log('Connected to Supabase PostgreSQL database.');

  const excelPath = 'c:\\Users\\Administrator\\Desktop\\DEALER NAME&NO.xlsx';
  if (!fs.existsSync(excelPath)) {
    throw new Error('DEALER NAME&NO.xlsx not found at ' + excelPath);
  }

  const wb = XLSX.readFile(excelPath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  console.log(`Read ${rows.length} rows from ${excelPath}`);

  // Recreate / truncate dealers table
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
    TRUNCATE TABLE dealers RESTART IDENTITY;
  `);

  let inserted = 0;
  let mobilesFound = 0;
  let personsFound = 0;

  const CHUNK_SIZE = 50;
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const valueClauses = [];
    const values = [];
    let pIdx = 1;

    for (const r of chunk) {
      const name = String(r[0] || '').trim();
      if (!name) continue;

      const rawColB = String(r[1] || '').trim();
      const extracted = extractDealerContactInfo(rawColB);

      if (extracted.primaryMobile) mobilesFound++;
      if (extracted.contactPerson) personsFound++;

      const alternatesJson = extracted.alternateMobiles.length > 0 ? JSON.stringify(extracted.alternateMobiles) : null;

      valueClauses.push(`($${pIdx}, $${pIdx+1}, $${pIdx+2}, $${pIdx+3}, $${pIdx+4})`);
      values.push(name, extracted.contactPerson, extracted.primaryMobile, alternatesJson, extracted.rawContact);
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

  console.log(`\n==============================================`);
  console.log(`Successfully re-seeded ${inserted} dealers into database!`);
  console.log(`Dealers with Primary Mobile: ${mobilesFound}/${inserted}`);
  console.log(`Dealers with Contact Person: ${personsFound}/${inserted}`);
  console.log(`==============================================\n`);

  await client.end();
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
