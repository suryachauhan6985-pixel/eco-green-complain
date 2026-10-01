const { Client } = require('pg');

const connStr = 'postgresql://postgres.pirlkhjljjnwuunpqwbb:Ge%40286296ecogreen@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres';

async function run() {
  const c = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });
  await c.connect();

  const res = await c.query('SELECT id, name, username, email, role, phone, is_active FROM users ORDER BY id ASC');
  console.log('=== Users in Database ===');
  console.table(res.rows);

  await c.end();
}

run().catch(console.error);
