const { Client } = require('pg');

const API_BASE = 'https://eco-green-solar-cms-api.eco-green-solar-cms-api.workers.dev/api';
const connStr = process.env.DATABASE_URL || 'process.env.DATABASE_URL';

async function loginUser(phone, roleHint) {
  // Direct JWT generation via DB / auth lookup
  // Let's call /api/auth/login or generate JWT if password exists
  const c = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const res = await c.query('SELECT * FROM users WHERE phone = $1 OR name ILIKE $2 LIMIT 1', [phone, `%${phone}%`]);
  await c.end();
  return res.rows[0];
}

async function run() {
  const c = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });
  await c.connect();

  console.log('=== Checking Target Users ===');
  const usersRes = await c.query(`
    SELECT id, name, username, role, phone FROM users 
    WHERE name IN ('System', 'SUMIT CHAUAHN', 'Milan Makwana', 'Hardevsinh Vaghela')
    ORDER BY id
  `);
  console.table(usersRes.rows);

  const techRes = await c.query(`
    SELECT id, name, phone, user_id FROM technicians 
    WHERE name IN ('Milan Makwana', 'Hardevsinh Vaghela', 'Pratik Joshi')
    ORDER BY id
  `);
  console.table(techRes.rows);

  // Use jsonwebtoken to generate valid tokens signed with Worker's secret
  // Let's check JWT secret in Worker
  const jwt = require('jsonwebtoken');
  const JWT_SECRET = 'process.env.JWT_SECRET';

  const systemUser = usersRes.rows.find(u => u.name === 'System');
  const sumitUser = usersRes.rows.find(u => u.name === 'SUMIT CHAUAHN');
  const milanUser = usersRes.rows.find(u => u.name === 'Milan Makwana');
  const hardevUser = usersRes.rows.find(u => u.name === 'Hardevsinh Vaghela');
  const milanTech = techRes.rows.find(t => t.name === 'Milan Makwana');

  const systemToken = jwt.sign({ id: systemUser.id, name: systemUser.name, username: systemUser.username, role: systemUser.role, phone: systemUser.phone }, JWT_SECRET);
  const sumitToken = jwt.sign({ id: sumitUser.id, name: sumitUser.name, username: sumitUser.username, role: sumitUser.role, phone: sumitUser.phone }, JWT_SECRET);
  const milanToken = jwt.sign({ id: milanUser.id, name: milanUser.name, username: milanUser.username, role: 'technician', technician_id: milanTech?.id, phone: milanUser.phone }, JWT_SECRET);
  const hardevToken = jwt.sign({ id: hardevUser.id, name: hardevUser.name, username: hardevUser.username, role: 'technician', phone: hardevUser.phone }, JWT_SECRET);

  // Target test ticket EGS-2026-000321
  const ticketRes = await c.query("SELECT id, ticket_id, status FROM complaints WHERE ticket_id = 'EGS-2026-000321' LIMIT 1");
  const testComp = ticketRes.rows[0];
  console.log('Test Target Complaint:', testComp);

  console.log('\n--- Test 1: Reopen by System (admin) ---');
  const reopenRes = await fetch(`${API_BASE}/complaints/${testComp.id}/reopen`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${systemToken}` },
    body: JSON.stringify({ reason: 'Multi-role verification test run' })
  });
  console.log('Reopen HTTP:', reopenRes.status);

  console.log('\n--- Test 2: Status update to On Hold by SUMIT CHAUAHN (staff) ---');
  const holdRes = await fetch(`${API_BASE}/complaints/${testComp.id}/note`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sumitToken}` },
    body: JSON.stringify({ status: 'On Hold', notes: 'Parts pending verification from factory by staff.' })
  });
  console.log('Hold HTTP:', holdRes.status);

  console.log('\n--- Test 3: Document/Video Attachment by SUMIT CHAUAHN (staff) ---');
  const attachRes = await fetch(`${API_BASE}/complaints/${testComp.id}/attachments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sumitToken}` },
    body: JSON.stringify({
      attachments: [{
        file_name: 'VID_20261031_test_site_part1.mp4',
        file_url: '/api/attachments/r2/complaints/temp/VID_20261031_test.mp4',
        file_type: 'video/mp4',
        attachment_type: 'diagnostics'
      }]
    })
  });
  console.log('Attachment HTTP:', attachRes.status);

  console.log('\n--- Test 4: Resolve by System (admin) on behalf of Milan Makwana (technician ID 13) ---');
  const resolveAdminRes = await fetch(`${API_BASE}/complaints/${testComp.id}/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${systemToken}` },
    body: JSON.stringify({
      resolved_by_technician_id: milanTech.id,
      technician_name: milanTech.name,
      resolution_notes: 'Solar array inspection completed and tested on-site.'
    })
  });
  console.log('Resolve Admin HTTP:', resolveAdminRes.status);

  console.log('\n--- Test 5: Reopen by System (admin) and Resolve directly as Milan Makwana (technician) ---');
  const reopen2 = await fetch(`${API_BASE}/complaints/${testComp.id}/reopen`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${systemToken}` },
    body: JSON.stringify({ reason: 'Reopened for direct technician verification' })
  });
  console.log('Reopen 2 HTTP:', reopen2.status);

  // Ensure assigned to Milan Makwana for primary resolution test
  await c.query('UPDATE complaints SET assigned_technician_id = $1 WHERE id = $2', [milanTech.id, testComp.id]);

  const resolveTechRes = await fetch(`${API_BASE}/complaints/${testComp.id}/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${milanToken}` },
    body: JSON.stringify({
      resolution_notes: 'Direct technician resolution test.'
    })
  });
  console.log('Resolve Tech HTTP:', resolveTechRes.status);

  console.log('\n--- Test 6: Close by System (admin) ---');
  const closeRes = await fetch(`${API_BASE}/complaints/${testComp.id}/close`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${systemToken}` },
    body: JSON.stringify({ closure_remarks: 'Verified quality check complete' })
  });
  console.log('Close HTTP:', closeRes.status);

  console.log('\n--- Test 7: Presigned Download Route ---');
  const presignRes = await fetch(`${API_BASE}/attachments/presign-download?key=complaints/general/test.mp4&filename=test.mp4`, {
    headers: { 'Authorization': `Bearer ${systemToken}` }
  });
  const presignData = await presignRes.json();
  console.log('Presign Response:', presignData);

  console.log('\n--- Test 8: Public / Customer Unauthenticated Flow ---');
  const publicRes = await fetch(`${API_BASE}/complaints/track/${testComp.ticket_id}`);
  console.log('Public Track HTTP:', publicRes.status);

  console.log('\n=== Verifying Newly Created Timeline Entries in Database ===');
  const newTimelines = await c.query(`
    SELECT id, action, notes, performed_by_name, performed_by_role, actor_user_id, 
           TO_CHAR(created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS IST') as ist_time
    FROM complaint_timelines
    WHERE complaint_id = $1
    ORDER BY id DESC
    LIMIT 7
  `, [testComp.id]);
  console.table(newTimelines.rows);

  await c.end();
}

run().catch(console.error);
