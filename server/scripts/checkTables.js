const { Client } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

async function check() {
  const c = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await c.connect();
  const res = await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name");
  console.log('Tables in Supabase public schema:', res.rows.map(x => x.table_name));
  await c.query("NOTIFY pgrst, 'reload schema'");
  console.log('Notified PostgREST to reload schema cache.');
  await c.end();
}

check().catch(console.error);
