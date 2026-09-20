const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const db = require('../config/database');
const supabaseSync = require('../services/supabaseSyncService');
const supabaseConfig = require('../config/supabase');

async function migrateAllToSupabase() {
  console.log('====================================================');
  console.log('  ECO GREEN SOLAR CMS - MIGRATE TO SUPABASE');
  console.log('====================================================');

  if (!supabaseConfig.isEnabled) {
    console.error('❌ Supabase is not configured. Please add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to server/.env first.');
    process.exit(1);
  }

  const tables = [
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
    'whatsapp_messages',
    'whatsapp_raw_events'
  ];

  console.log(`Starting data migration for ${tables.length} tables...\n`);

  let totalMigrated = 0;
  let failedTables = [];

  for (const table of tables) {
    try {
      // Check if table exists in local DB
      const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
      if (!tableExists) {
        console.log(`⏩ Skipping ${table}: table does not exist locally.`);
        continue;
      }

      const res = await supabaseSync.pushTableToCloud(table, db);
      if (res && res.success) {
        console.log(`✅ [${table}] ${res.count || 0} rows migrated successfully.`);
        totalMigrated += (res.count || 0);
      } else {
        console.warn(`⚠️ [${table}] Migration warning: ${res?.error || 'Unknown error'}`);
        failedTables.push({ table, error: res?.error });
      }
    } catch (err) {
      console.error(`❌ [${table}] Failed to migrate:`, err.message);
      failedTables.push({ table, error: err.message });
    }
  }

  console.log('\n----------------------------------------------------');
  console.log(`🎉 Migration Completed! Total rows pushed to Supabase: ${totalMigrated}`);
  if (failedTables.length > 0) {
    console.log(`⚠️ ${failedTables.length} tables encountered errors (Make sure supabase_schema.sql was run in Supabase SQL Editor).`);
    failedTables.forEach(f => console.log(`   - ${f.table}: ${f.error}`));
  } else {
    console.log('🌟 All tables are 100% synchronized with Supabase Cloud!');
  }
  console.log('====================================================\n');
}

migrateAllToSupabase()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal migration failure:', err);
    process.exit(1);
  });
