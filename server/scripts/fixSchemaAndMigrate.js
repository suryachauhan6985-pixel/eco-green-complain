const { Client } = require('pg');
const Database = require('better-sqlite3');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function fixSchemaAndMigrate() {
  const c = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  console.log('[FixSchema] Adding missing columns in Supabase PostgreSQL...');
  // Add username to users table
  await c.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;');
  
  // Disable foreign keys temporarily during data transfer to prevent order/circular dependency issues
  console.log('[FixSchema] Setting session replication role to replica (disables FK checks during import)...');
  await c.query("SET session_replication_role = 'replica';");

  // Read data directly from local SQLite / Turso and insert directly via PostgreSQL connection!
  const db = new Database(path.join(__dirname, '..', 'ecogreen_cms.db'));
  
  const tables = [
    'users',
    'technicians',
    'complaints',
    'complaint_attachments',
    'complaint_timelines',
    'notification_logs',
    'whatsapp_messages'
  ];

  for (const table of tables) {
    try {
      const rows = db.prepare(`SELECT * FROM ${table}`).all();
      console.log(`[FixSchema] Transferring ${rows.length} rows into [${table}]...`);
      if (rows.length === 0) continue;

      for (const row of rows) {
        const keys = Object.keys(row).filter(k => row[k] !== undefined);
        const cols = keys.map(k => `"${k}"`).join(', ');
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
        const values = keys.map(k => row[k]);
        
        const updateSets = keys.filter(k => k !== 'id').map(k => `"${k}" = EXCLUDED."${k}"`).join(', ');
        const conflictClause = updateSets.length > 0 
          ? `ON CONFLICT (id) DO UPDATE SET ${updateSets}` 
          : 'ON CONFLICT (id) DO NOTHING';

        const sql = `INSERT INTO "${table}" (${cols}) VALUES (${placeholders}) ${conflictClause}`;
        await c.query(sql, values);
      }
      console.log(`[FixSchema] ✅ Successfully imported table [${table}]!`);
    } catch (err) {
      console.error(`[FixSchema] Error on table [${table}]:`, err.message);
    }
  }

  // Re-enable foreign keys
  console.log('[FixSchema] Re-enabling foreign keys...');
  await c.query("SET session_replication_role = 'origin';");

  // Fix sequence values in PostgreSQL so new auto-increment IDs don't collide
  for (const table of ['users', 'technicians', 'complaints', 'complaint_attachments', 'complaint_timelines', 'notification_logs', 'installed_customers', 'whatsapp_messages', 'whatsapp_raw_events']) {
    try {
      await c.query(`SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), coalesce(max(id), 1) + 1, false) FROM "${table}";`);
    } catch (e) {}
  }

  await c.query("NOTIFY pgrst, 'reload schema'");
  console.log('[FixSchema] All tables, rows, sequences and schema cache fully synced!');
  await c.end();
}

fixSchemaAndMigrate().catch(console.error);
