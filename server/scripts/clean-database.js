const bcrypt = require('bcryptjs');
const db = require('../config/database');

async function runCleanup() {
  console.log('[Cleanup] Starting database cleanup...');

  const passwordHash = await bcrypt.hash('admin3636', 10);

  // 1. Ensure only Admin Supervisor exists with phone 6352454247 and password admin3636
  const updateAdmin = db.prepare(`
    INSERT INTO users (id, name, email, password_hash, role, phone, is_active)
    VALUES (1, 'Admin Supervisor', 'admin@ecogreensolar.com', ?, 'admin', '6352454247', 1)
    ON CONFLICT(id) DO UPDATE SET
      password_hash = excluded.password_hash,
      phone = '6352454247',
      email = 'admin@ecogreensolar.com',
      role = 'admin',
      is_active = 1
  `);
  updateAdmin.run(passwordHash);

  // 2. Remove all other users
  const deletedUsers = db.prepare('DELETE FROM users WHERE id != 1').run();
  console.log(`[Cleanup] Deleted ${deletedUsers.changes} dummy users.`);

  // 3. Remove all technicians
  const deletedTechs = db.prepare('DELETE FROM technicians').run();
  console.log(`[Cleanup] Deleted ${deletedTechs.changes} dummy technicians.`);

  // 4. Remove all complaints
  const deletedComplaints = db.prepare('DELETE FROM complaints').run();
  console.log(`[Cleanup] Deleted ${deletedComplaints.changes} complaints.`);

  // 5. Remove all complaint timelines
  const deletedTimelines = db.prepare('DELETE FROM complaint_timelines').run();
  console.log(`[Cleanup] Deleted ${deletedTimelines.changes} complaint timelines.`);

  // 6. Remove all complaint attachments
  const deletedAttachments = db.prepare('DELETE FROM complaint_attachments').run();
  console.log(`[Cleanup] Deleted ${deletedAttachments.changes} complaint attachments.`);

  // 7. Clean up dummy whatsapp messages
  try {
    const deletedMsgs = db.prepare("DELETE FROM whatsapp_messages WHERE wam_id LIKE 'wam_seed%' OR wam_id LIKE 'wam_javia%' OR message_body LIKE '%localhost:5173%'").run();
    console.log(`[Cleanup] Cleaned ${deletedMsgs.changes} dummy seed whatsapp messages.`);
  } catch (e) {
    console.log('[Cleanup] WhatsApp messages check:', e.message);
  }

  // 8. Verification query
  const remainingUsers = db.prepare('SELECT id, name, role, phone, email FROM users').all();
  const techCount = db.prepare('SELECT count(*) as count FROM technicians').get().count;
  const compCount = db.prepare('SELECT count(*) as count FROM complaints').get().count;

  console.log('--------------------------------------------------');
  console.log('[Verification] Active Users in Database:');
  console.table(remainingUsers);
  console.log(`[Verification] Active Technicians: ${techCount}`);
  console.log(`[Verification] Active Complaints: ${compCount}`);
  console.log('--------------------------------------------------');
  console.log('Database cleanup completed successfully!');
}

runCleanup()
  .then(() => {
    setTimeout(() => process.exit(0), 3000); // Give 3s for Supabase & Turso sync hooks to push
  })
  .catch((err) => {
    console.error('Error during cleanup:', err);
    process.exit(1);
  });
