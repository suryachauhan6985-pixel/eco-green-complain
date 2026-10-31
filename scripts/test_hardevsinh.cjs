const { Client } = require('pg');
const jwt = require('jsonwebtoken');

const API_BASE = 'https://eco-green-solar-cms-api.eco-green-solar-cms-api.workers.dev/api';
const connStr = process.env.DATABASE_URL || 'process.env.DATABASE_URL';
const JWT_SECRET = 'process.env.JWT_SECRET';

async function testHardevsinh() {
  const c = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });
  await c.connect();

  const userRes = await c.query("SELECT * FROM users WHERE name = 'Hardevsinh Vaghela' LIMIT 1");
  const hardevUser = userRes.rows[0];
  const techRes = await c.query("SELECT * FROM technicians WHERE name = 'Hardevsinh Vaghela' LIMIT 1");
  const hardevTech = techRes.rows[0];

  const ticketRes = await c.query("SELECT id, ticket_id, status FROM complaints WHERE ticket_id = 'EGS-2026-000321' LIMIT 1");
  const testComp = ticketRes.rows[0];

  const token = jwt.sign({
    id: hardevUser.id,
    name: hardevUser.name,
    username: hardevUser.username,
    role: 'technician',
    technician_id: hardevTech.id,
    phone: hardevUser.phone
  }, JWT_SECRET);

  // Reopen ticket first via System token
  const systemRes = await c.query("SELECT * FROM users WHERE name = 'System' LIMIT 1");
  const systemToken = jwt.sign({
    id: systemRes.rows[0].id,
    name: systemRes.rows[0].name,
    role: 'admin',
    phone: systemRes.rows[0].phone
  }, JWT_SECRET);

  await fetch(`${API_BASE}/complaints/${testComp.id}/reopen`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${systemToken}` },
    body: JSON.stringify({ reason: 'Reopened for Hardevsinh Vaghela test' })
  });

  // Assign to Hardevsinh Vaghela
  await c.query('UPDATE complaints SET assigned_technician_id = $1 WHERE id = $2', [hardevTech.id, testComp.id]);

  // Hardevsinh adds a visit note
  const noteRes = await fetch(`${API_BASE}/complaints/${testComp.id}/note`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ status: 'In Progress', notes: 'Arrived at farm location, checking solar pump inverter.' })
  });
  console.log('Hardevsinh Note HTTP:', noteRes.status);

  // Hardevsinh resolves
  const resolveRes = await fetch(`${API_BASE}/complaints/${testComp.id}/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      resolution_notes: 'Inverter output voltage calibrated. Pump operating at full capacity.'
    })
  });
  console.log('Hardevsinh Resolve HTTP:', resolveRes.status);

  // Verify DB
  const timelines = await c.query(`
    SELECT id, action, notes, performed_by_name, performed_by_role, actor_user_id,
           TO_CHAR(created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS IST') as ist_time
    FROM complaint_timelines
    WHERE complaint_id = $1
    ORDER BY id DESC
    LIMIT 2
  `, [testComp.id]);
  console.table(timelines.rows);

  await c.end();
}

testHardevsinh().catch(console.error);
