const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const connStr = process.env.DATABASE_URL || 'postgresql://postgres.pirlkhjljjnwuunpqwbb:Ge%40286296ecogreen@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres';

async function backup() {
  const c = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });
  await c.connect();

  const res = await c.query('SELECT * FROM complaint_timelines ORDER BY id ASC');
  const backupDir = path.join(__dirname, '..', 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  const filename = path.join(backupDir, `complaint_timelines_backup_${Date.now()}.json`);
  fs.writeFileSync(filename, JSON.stringify(res.rows, null, 2), 'utf8');

  console.log(`Backup completed: ${res.rows.length} rows written to ${filename}`);
  await c.end();
}

backup().catch(console.error);
