const { Client } = require('pg');
const bcrypt = require('bcryptjs');

const connStr = 'postgresql://postgres.pirlkhjljjnwuunpqwbb:Ge%40286296ecogreen@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres';

async function check() {
  const c = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const res = await c.query('SELECT id, name, username, phone, role, password_hash FROM users');
  const common = [
    'admin3636', '123456', 'password', 'admin123', 'admin', 'eco123', 'ecogreen', 'ecogreen123',
    'tech3636', 'staff3636', 'hardev123', 'jignesh123', '12345678'
  ];
  for (const u of res.rows) {
    const list = [...common, u.phone, u.username, u.name.toLowerCase().replace(/\s+/g, '')];
    let matched = false;
    for (const p of list) {
      if (bcrypt.compareSync(p, u.password_hash)) {
        console.log(`Matched user ${u.name} (${u.role}): password="${p}"`);
        matched = true;
        break;
      }
    }
    if (!matched) {
      console.log(`User ${u.name} (${u.role}, phone: ${u.phone}) hash does not match common list`);
    }
  }
  await c.end();
}

check().catch(console.error);
