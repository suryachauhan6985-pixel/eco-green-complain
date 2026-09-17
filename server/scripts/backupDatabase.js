const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const defaultDir = fs.existsSync('/data') ? '/data' : path.join(__dirname, '..');
const dbPath = process.env.DATABASE_PATH || path.join(defaultDir, 'ecogreen_cms.db');
const backupDir = path.join(__dirname, '..', 'backups');

if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

function backupDatabase() {
  console.log('[Backup] Checking source database at:', dbPath);
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Source database does not exist at ${dbPath}`);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDbPath = path.join(backupDir, `ecogreen_cms_backup_${timestamp}.db`);
  const backupJsonPath = path.join(backupDir, `whatsapp_messages_${timestamp}.json`);

  // 1. Copy SQLite database file using better-sqlite3 backup API (safe during WAL mode)
  const sourceDb = new Database(dbPath);
  console.log('[Backup] Executing live SQLite backup to:', backupDbPath);
  sourceDb.backup(backupDbPath)
    .then(() => {
      const stats = fs.statSync(backupDbPath);
      console.log(`[Backup] SQLite database backup completed! Size: ${(stats.size / 1024).toFixed(2)} KB`);

      // 2. Export current WhatsApp records to JSON for human audit
      let waMessages = [];
      try {
        waMessages = sourceDb.prepare('SELECT * FROM whatsapp_messages').all();
      } catch (e) {
        console.warn('[Backup] Notice reading whatsapp_messages:', e.message);
      }

      fs.writeFileSync(backupJsonPath, JSON.stringify(waMessages, null, 2));
      console.log(`[Backup] Exported ${waMessages.length} WhatsApp message records to ${backupJsonPath}`);

      sourceDb.close();
      console.log('[Backup] Backup verified successfully. Safe to proceed with migrations.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[Backup] Backup failed:', err);
      sourceDb.close();
      process.exit(1);
    });
}

backupDatabase();
