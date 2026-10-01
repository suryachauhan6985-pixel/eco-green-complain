const { Client } = require('pg');
const connStr = 'postgresql://postgres.pirlkhjljjnwuunpqwbb:Ge%40286296ecogreen@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres';

async function run() {
  const c = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const tables = await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name LIKE '%whatsapp%' OR table_name LIKE '%template%')");
  console.log('Tables found:', tables.rows.map(r => r.table_name));

  for (const t of tables.rows) {
    const cols = await c.query("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position", [t.table_name]);
    console.log(`\nColumns for ${t.table_name}:`);
    console.log(cols.rows.map(col => `  - ${col.column_name}: ${col.data_type} (${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'})`).join('\n'));

    const count = await c.query(`SELECT COUNT(*) FROM ${t.table_name}`);
    console.log(`Row count: ${count.rows[0].count}`);
  }
  await c.end();
}
run().catch(console.error);
