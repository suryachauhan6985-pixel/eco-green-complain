const { Client } = require('pg');
const connStr = 'postgresql://postgres.pirlkhjljjnwuunpqwbb:Ge%40286296ecogreen@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres';

async function run() {
  const c = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const res = await c.query("SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'complaints'::regclass");
  console.log('All Constraints:', res.rows);
  await c.end();
}

run().catch(console.error);
