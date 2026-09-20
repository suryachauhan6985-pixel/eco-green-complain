const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function initSupabase() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL not set in server/.env');
    process.exit(1);
  }

  console.log('[Supabase Init] Connecting via PostgreSQL pooler...');
  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('[Supabase Init] Connected to PostgreSQL successfully!');

    const sqlPath = path.join(__dirname, '..', 'data', 'supabase_schema.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('[Supabase Init] Executing schema DDL (12 tables + 20 indexes)...');
    await client.query(sql);
    console.log('[Supabase Init] Schema successfully executed! All tables are active in Supabase!');

    await client.end();
    console.log('[Supabase Init] Starting data migration from Turso to Supabase...');
    require('./migrateToSupabase');
  } catch (err) {
    console.error('[Supabase Init] Failed:', err.message);
    process.exit(1);
  }
}

initSupabase();
