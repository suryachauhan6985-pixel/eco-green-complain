const bcrypt = require('bcryptjs');
const db = require('../config/database');
const supabaseConfig = require('../config/supabase');
const tursoSync = require('../services/tursoSyncService');

async function cleanAll() {
  console.log('=== ECO GREEN SOLAR: TOTAL DATABASE CLEANUP ===');
  const passwordHash = await bcrypt.hash('admin3636', 10);

  // 1. CLEAN LOCAL SQLITE
  console.log('\n[1/3] Cleaning Local SQLite...');
  db.prepare(`
    INSERT INTO users (id, name, email, password_hash, role, phone, is_active)
    VALUES (1, 'Admin Supervisor', 'admin@ecogreensolar.com', ?, 'admin', '6352454247', 1)
    ON CONFLICT(id) DO UPDATE SET
      password_hash = excluded.password_hash,
      phone = '6352454247',
      email = 'admin@ecogreensolar.com',
      role = 'admin',
      is_active = 1
  `).run(passwordHash);

  db.prepare('DELETE FROM users WHERE id != 1').run();
  db.prepare('DELETE FROM technicians').run();
  db.prepare('DELETE FROM complaints').run();
  db.prepare('DELETE FROM complaint_timelines').run();
  db.prepare('DELETE FROM complaint_attachments').run();
  try {
    db.prepare("DELETE FROM whatsapp_messages WHERE wam_id LIKE 'wam_seed%' OR message_body LIKE '%localhost:5173%'").run();
  } catch (_) {}
  console.log(' Local SQLite cleaned. Only Admin (6352454247) exists.');

  // 2. CLEAN SUPABASE CLOUD
  if (supabaseConfig.isEnabled && supabaseConfig.client) {
    console.log('\n[2/3] Cleaning Supabase Cloud Database...');
    const supa = supabaseConfig.client;
    try {
      await supa.from('complaint_attachments').delete().neq('id', 0);
      await supa.from('complaint_timelines').delete().neq('id', 0);
      await supa.from('complaints').delete().neq('id', 0);
      await supa.from('technicians').delete().neq('id', 0);
      await supa.from('users').delete().neq('id', 1);

      // Upsert single Admin user in Supabase
      const { error: supaErr } = await supa.from('users').upsert({
        id: 1,
        name: 'Admin Supervisor',
        email: 'admin@ecogreensolar.com',
        password_hash: passwordHash,
        role: 'admin',
        phone: '6352454247',
        is_active: 1
      });
      if (supaErr) {
        console.warn('Supabase upsert admin notice:', supaErr.message);
      } else {
        console.log(' Supabase Cloud cleaned. Only Admin (6352454247) active.');
      }
    } catch (e) {
      console.warn('Supabase cleaning error:', e.message);
    }
  }

  // 3. CLEAN TURSO CLOUD
  if (tursoSync.isEnabled && tursoSync.client) {
    console.log('\n[3/3] Cleaning Turso Cloud Database...');
    const turso = tursoSync.client;
    try {
      await turso.execute('DELETE FROM complaint_attachments');
      await turso.execute('DELETE FROM complaint_timelines');
      await turso.execute('DELETE FROM complaints');
      await turso.execute('DELETE FROM technicians');
      await turso.execute('DELETE FROM users WHERE id != 1');
      await turso.execute({
        sql: `INSERT INTO users (id, name, email, password_hash, role, phone, is_active)
              VALUES (1, 'Admin Supervisor', 'admin@ecogreensolar.com', ?, 'admin', '6352454247', 1)
              ON CONFLICT(id) DO UPDATE SET
                password_hash = excluded.password_hash,
                phone = '6352454247',
                email = 'admin@ecogreensolar.com',
                role = 'admin',
                is_active = 1`,
        args: [passwordHash]
      });
      console.log(' Turso Cloud cleaned. Only Admin (6352454247) active.');
    } catch (e) {
      console.warn('Turso cleaning error:', e.message);
    }
  }

  console.log('\n=== ALL DATABASES CLEANED & VERIFIED ===');
  const userCheck = db.prepare('SELECT id, name, role, phone, email FROM users').all();
  console.log('Remaining Users:');
  console.table(userCheck);
  console.log('Complaints Count:', db.prepare('SELECT count(*) as c FROM complaints').get().c);
  console.log('Technicians Count:', db.prepare('SELECT count(*) as c FROM technicians').get().c);
}

cleanAll()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal cleanup error:', err);
    process.exit(1);
  });
