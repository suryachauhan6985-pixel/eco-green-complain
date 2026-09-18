const { createClient } = require('@libsql/client');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TURSO_URL = process.env.TURSO_DATABASE_URL || 'libsql://ecogreen-db-suryachauhan6985-pixel.aws-ap-south-1.turso.io';
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN || 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODk3MTQ4OTksImlkIjoiMDFhMGIzNTEtYjUwMS03MzIyLWE1NzItNTcxNzU3MDE4ZGRjIiwia2lkIjoiWjVmbFlqUVZfYk50Tm9nZWxZdFp2eEJHUFE2ZVlYMHAxX29aV2Y0aFlxVSIsInJpZCI6ImQ0NmQ1MTM3LWYyZTAtNDExYy1hNzM1LTAwMDUyNzQzYzcwZiJ9.xTnzaXC7ZVGAJOiV1VTr-CXPI1xDpNlXEv-qwgUF5UytnjltkZVvxp5_M8ZpLMvMdZFbY17C4rIwi6lZiD_WAA';

const localDbPath = path.join(__dirname, '..', 'ecogreen_cms.db');

async function migrateAllToTurso() {
  console.log('--- STARTING TURSO CLOUD MIGRATION ---');
  console.log('Connecting to Turso Cloud:', TURSO_URL);

  const turso = createClient({
    url: TURSO_URL,
    authToken: TURSO_TOKEN
  });

  const localDb = new Database(localDbPath);

  // Table order respecting foreign keys
  const orderedTableNames = [
    'users',
    'technicians',
    'products',
    'installed_customers',
    'complaints',
    'complaint_attachments',
    'complaint_timelines',
    'notification_templates',
    'notification_logs',
    'issue_categories',
    'whatsapp_auth_keys',
    'whatsapp_messages',
    'whatsapp_number_registry',
    'whatsapp_outgoing_queue',
    'whatsapp_raw_events',
    'whatsapp_relay_heartbeat',
    'whatsapp_session_meta'
  ];

  // 1. Get all table schemas
  const tableSchemas = localDb.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
  const schemaMap = new Map(tableSchemas.map(t => [t.name, t.sql]));

  console.log(`Found ${tableSchemas.length} tables to prepare in Turso Cloud...`);

  for (const name of orderedTableNames) {
    const sql = schemaMap.get(name);
    if (!sql) continue;
    try {
      console.log(`Creating table [${name}] in Turso...`);
      const createSql = sql.replace(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?([`"']?[\w]+[`"']?)/i, 'CREATE TABLE IF NOT EXISTS $1');
      await turso.execute(createSql);
    } catch (err) {
      console.warn(`Note on creating table ${name}:`, err.message);
    }
  }

  // Disable FK constraints during bulk import
  try {
    await turso.execute('PRAGMA foreign_keys = OFF;');
  } catch (e) {
    console.warn('PRAGMA foreign_keys:', e.message);
  }

  // 2. Sync data for each table in ordered sequence
  for (const tableName of orderedTableNames) {
    const countRow = localDb.prepare(`SELECT COUNT(*) as c FROM "${tableName}"`).get();
    const total = countRow.c;
    console.log(`\nSyncing table [${tableName}] (${total} rows)...`);

    if (total === 0) continue;

    const rows = localDb.prepare(`SELECT * FROM "${tableName}"`).all();
    if (rows.length === 0) continue;

    const columns = Object.keys(rows[0]);
    const colNames = columns.map(c => `"${c}"`).join(', ');
    const placeholders = columns.map(() => '?').join(', ');
    const insertSql = `INSERT OR REPLACE INTO "${tableName}" (${colNames}) VALUES (${placeholders})`;

    const batchSize = 100;
    for (let i = 0; i < rows.length; i += batchSize) {
      const chunk = rows.slice(i, i + batchSize);
      const statements = chunk.map(row => ({
        sql: insertSql,
        args: columns.map(col => row[col] !== undefined ? row[col] : null)
      }));

      try {
        await turso.batch(statements, 'write');
        process.stdout.write(`  Migrated ${Math.min(i + batchSize, total)} / ${total} rows\r`);
      } catch (err) {
        console.error(`\nError inserting batch in ${tableName} at index ${i}:`, err.message);
      }
    }
    console.log(`\n  Done [${tableName}]: ${total} rows migrated.`);
  }

  // 3. Verification
  console.log('\n--- VERIFYING TURSO CLOUD ROW COUNTS ---');
  for (const tableName of orderedTableNames) {
    try {
      const res = await turso.execute(`SELECT COUNT(*) as c FROM "${tableName}"`);
      const cloudCount = Number(res.rows[0].c);
      const localCount = localDb.prepare(`SELECT COUNT(*) as c FROM "${tableName}"`).get().c;
      const match = cloudCount === localCount ? '✅ MATCH' : `⚠️ MISMATCH (Cloud: ${cloudCount}, Local: ${localCount})`;
      console.log(`Table ${tableName}: ${cloudCount} records ${match}`);
    } catch (err) {
      console.error(`Error counting ${tableName}:`, err.message);
    }
  }

  localDb.close();
  console.log('\n✅ TURSO CLOUD INITIAL MIGRATION FINISHED SUCCESSFULLY!');
}

migrateAllToTurso().catch(err => {
  console.error('Fatal migration error:', err);
  process.exit(1);
});
