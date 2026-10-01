const { Client } = require('pg');

const connStr = 'postgresql://postgres.pirlkhjljjnwuunpqwbb:Ge%40286296ecogreen@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres';

async function run() {
  const c = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });
  await c.connect();

  const res = await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name");
  console.log('=== All Tables in public schema ===');
  console.log(res.rows.map(r => r.table_name));

  for (const t of res.rows.map(r => r.table_name)) {
    const cols = await c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position", [t]);
    console.log(`\nTable ${t} (${cols.rows.length} cols):`);
    console.log(cols.rows.map(col => `  ${col.column_name} (${col.data_type})`).join('\n'));
  }

  await c.end();
}

run().catch(console.error);
