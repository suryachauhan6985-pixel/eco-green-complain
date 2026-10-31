const { Client } = require('pg');

const connStr = process.env.DATABASE_URL || 'process.env.DATABASE_URL';

async function audit() {
  const c = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });
  await c.connect();

  console.log('=== Checking complaint_timelines columns ===');
  const colsRes = await c.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'complaint_timelines'
    ORDER BY ordinal_position;
  `);
  console.table(colsRes.rows);

  console.log('=== Checking Users ===');
  const usersRes = await c.query('SELECT id, name, role, phone FROM users ORDER BY id');
  const userMap = new Map();
  usersRes.rows.forEach(u => userMap.set(String(u.id), u));

  console.log('=== Checking Technicians ===');
  const techRes = await c.query('SELECT id, name, phone, user_id FROM technicians ORDER BY id');
  const techMap = new Map();
  techRes.rows.forEach(t => techMap.set(String(t.id), t));

  console.log('=== Checking Complaints where resolved_by_technician_id is populated ===');
  const compRes = await c.query(`
    SELECT id, ticket_id, status, assigned_technician_id, resolved_by_technician_id, resolved_at
    FROM complaints
    WHERE resolved_by_technician_id IS NOT NULL AND resolved_by_technician_id != ''
    ORDER BY id ASC;
  `);
  console.log(`Total complaints with resolved_by_technician_id: ${compRes.rows.length}`);

  console.log('=== Auditing Timeline entries for action = Resolved ===');
  const timelineRes = await c.query(`
    SELECT ct.id as entry_id, ct.complaint_id, c.ticket_id, ct.action, ct.notes, ct.performed_by_name, ct.performed_by_role, ct.created_at,
           c.resolved_by_technician_id
    FROM complaint_timelines ct
    JOIN complaints c ON c.id = ct.complaint_id
    WHERE ct.action = 'Resolved'
    ORDER BY ct.id ASC;
  `);

  const collisionRows = [];

  for (const t of timelineRes.rows) {
    const rawName = (t.performed_by_name || '').trim();
    const role = (t.performed_by_role || '').trim();
    const resolvedTechId = t.resolved_by_technician_id ? String(t.resolved_by_technician_id).trim() : null;

    // Check if performed_by_role is admin/staff but performed_by_name is a technician name
    const matchingTech = Array.from(techMap.values()).find(tech => (tech.name || '').trim().toLowerCase() === rawName.toLowerCase());
    const matchingAdminUser = Array.from(userMap.values()).find(u => (u.name || '').trim().toLowerCase() === rawName.toLowerCase());

    const isTechNameWithAdminRole = matchingTech && (!matchingAdminUser || matchingAdminUser.role === 'technician') && ['admin', 'staff', 'superadmin'].includes(role);
    
    // Check if resolved_by_technician_id actually matches a user_id of an admin
    const adminUserWithThisId = resolvedTechId ? userMap.get(resolvedTechId) : null;
    const techWithThisId = resolvedTechId ? techMap.get(resolvedTechId) : null;
    const isCollisionId = adminUserWithThisId && ['admin', 'staff', 'superadmin'].includes(adminUserWithThisId.role);

    if (isTechNameWithAdminRole || (isCollisionId && techWithThisId && techWithThisId.name !== adminUserWithThisId.name)) {
      collisionRows.push({
        entry_id: t.entry_id,
        ticket_id: t.ticket_id,
        action: t.action,
        timeline_timestamp_utc: t.created_at,
        recorded_name: rawName,
        recorded_role: role,
        resolved_by_tech_id: resolvedTechId,
        tech_with_id: techWithThisId ? techWithThisId.name : 'None',
        admin_user_with_id: adminUserWithThisId ? `${adminUserWithThisId.name} (${adminUserWithThisId.role})` : 'None',
        notes_snippet: (t.notes || '').substring(0, 60)
      });
    }
  }

  console.log(`Found ${collisionRows.length} suspicious/collision entries:`);
  console.table(collisionRows);

  await c.end();
}

audit().catch(console.error);
