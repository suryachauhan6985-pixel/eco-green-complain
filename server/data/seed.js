const bcrypt = require('bcryptjs');
const db = require('../config/database');

async function seedDatabase(forceReset = false) {
  console.log('Seeding Eco Green Solar CMS Database...');

  if (forceReset) {
    db.prepare('DELETE FROM complaint_timelines').run();
    db.prepare('DELETE FROM complaint_attachments').run();
    db.prepare('DELETE FROM notification_logs').run();
    db.prepare('DELETE FROM complaints').run();
    db.prepare('DELETE FROM technicians').run();
    db.prepare('DELETE FROM users').run();
    console.log('Tables cleared for fresh seed.');
  }

  // 1. Seed Users
  const passwordHash = await bcrypt.hash('admin123', 10);
  const staffHash = await bcrypt.hash('staff123', 10);
  const techHash = await bcrypt.hash('tech123', 10);

  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (id, name, email, password_hash, role, phone)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  insertUser.run(1, 'Admin Supervisor', 'admin@ecogreensolar.com', passwordHash, 'admin', '+919900011223');
  insertUser.run(2, 'Pooja Sharma (Helpdesk)', 'staff@ecogreensolar.com', staffHash, 'staff', '+919900022334');
  insertUser.run(3, 'Rohit Kumar', 'rohit.tech@ecogreensolar.com', techHash, 'technician', '+919876543210');
  insertUser.run(4, 'Vikram Singh', 'vikram.tech@ecogreensolar.com', techHash, 'technician', '+919876543211');
  insertUser.run(5, 'Suresh Patel', 'suresh.tech@ecogreensolar.com', techHash, 'technician', '+919876543212');
  insertUser.run(6, 'Manoj Sharma', 'manoj.tech@ecogreensolar.com', techHash, 'technician', '+919876543213');

  // 2. Seed Technicians
  const insertTech = db.prepare(`
    INSERT OR IGNORE INTO technicians (id, user_id, name, phone, email, area_zone, specialization, is_available)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertTech.run(1, 3, 'Rohit Kumar', '+919876543210', 'rohit.tech@ecogreensolar.com', 'North Zone (Indiranagar / Hebbal)', 'Solar Rooftop Systems', 1);
  insertTech.run(2, 4, 'Vikram Singh', '+919876543211', 'vikram.tech@ecogreensolar.com', 'South Zone (Jayanagar / Koramangala)', 'Solar Water Heaters', 1);
  insertTech.run(3, 5, 'Suresh Patel', '+919876543212', 'suresh.tech@ecogreensolar.com', 'East Zone (Whitefield / Marathahalli)', 'Heat Pumps', 1);
  insertTech.run(4, 6, 'Manoj Sharma', '+919876543213', 'manoj.tech@ecogreensolar.com', 'West Zone (Rajajinagar / Malleshwaram)', 'All Products', 1);

  // 3. Seed Notification Templates
  const insertTemplate = db.prepare(`
    INSERT OR REPLACE INTO notification_templates (template_key, name, whatsapp_body, email_subject, email_body)
    VALUES (?, ?, ?, ?, ?)
  `);

  insertTemplate.run(
    'complaint_registered',
    'Complaint Registered Notification',
    `☀️ *Eco Green Solar Support*\n\nDear {{customer_name}}, your service complaint has been successfully registered.\n\n📌 *Ticket ID:* {{complaint_id}}\n🔧 *Product:* {{product_type}}\n📅 *Date:* {{date}}{{charges_line}}\n\nOur team is reviewing your ticket and will assign a technician shortly.\n\n🔗 *Track Live Status:* {{feedback_url}}\n\nHelpline: 1800-ECO-SOLAR | Eco Green Solar Care`,
    `[Eco Green Solar] Service Complaint Registered - {{complaint_id}}`,
    `Dear {{customer_name}},\n\nThank you for contacting Eco Green Solar Care. Your service complaint has been successfully registered.\n\nTicket ID: {{complaint_id}}\nProduct: {{product_type}}\nIssue: {{issue_category}}\n\nOur technical support team is reviewing your ticket and will assign a specialist technician shortly. You can track your complaint status live at any time.`
  );

  insertTemplate.run(
    'technician_assigned',
    'Technician Assigned Notification',
    `☀️ *Eco Green Solar Update*\n\nHello {{customer_name}}, a service technician has been assigned to your complaint *{{complaint_id}}*.\n\n👨‍🔧 *Technician:* {{technician_name}}\n📅 *Expected Visit:* {{expected_visit_date}}\n\nKindly provide site and rooftop access to our service technician upon arrival.\n\n🔗 *Track Status:* {{feedback_url}}\n- Eco Green Solar`,
    `[Eco Green Solar] Technician Assigned - {{complaint_id}}`,
    `Dear {{customer_name}},\n\nA certified technician has been assigned to resolve your complaint.\n\nTechnician Name: {{technician_name}}\nExpected Visit Date: {{expected_visit_date}}\n\nKindly provide site and rooftop access to our service technician upon arrival.`
  );

  insertTemplate.run(
    'status_update',
    'Status & Follow-up Note Update',
    `☀️ *Eco Green Solar Alert*\n\nUpdate on Complaint *{{complaint_id}}* ({{product_type}}):\nStatus: *{{status}}*\n\n📝 *Notes:* {{notes}}\n\n🔗 *Track Live:* {{feedback_url}}\n- Eco Green Solar`,
    `[Eco Green Solar] Status Update - Ticket {{complaint_id}}`,
    `Dear {{customer_name}},\n\nAn update has been logged for your complaint ticket {{complaint_id}}.\n\nCurrent Status: {{status}}\nUpdate Details: {{notes}}\n\nWe remain committed to resolving your issue promptly.`
  );

  insertTemplate.run(
    'complaint_resolved',
    'Complaint Resolved Notification',
    `☀️ *Eco Green Solar Resolution*\n\nDear {{customer_name}}, your complaint *{{complaint_id}}* has been marked as *RESOLVED* by technician {{technician_name}}.\n\n✅ *Resolution Notes:* {{notes}}\n\nOur quality desk will verify and close the ticket shortly. If you have any questions, please contact our helpline.\n\n🔗 *View Details:* {{feedback_url}}\n- Eco Green Solar`,
    `[Eco Green Solar] Issue Resolved - Ticket {{complaint_id}}`,
    `Dear {{customer_name}},\n\nOur field technician has addressed the issue on your {{product_type}} (Ticket ID: {{complaint_id}}).\n\nResolution Summary: {{notes}}\n\nOur support desk will verify the resolution and close the ticket. If you need any further assistance, please let us know.`
  );

  insertTemplate.run(
    'complaint_closed',
    'Complaint Closed & Feedback Request',
    `☀️ *Eco Green Solar Closure*\n\nDear {{customer_name}}, your complaint *{{complaint_id}}* has been resolved and closed. Thank you for choosing clean energy!\n\n⭐ *Please rate your service experience (1-5 Stars):*\n{{feedback_url}}\n\nYour feedback helps us continuously improve!\n- Eco Green Solar Care`,
    `[Eco Green Solar] Complaint Closed - {{complaint_id}} | Please Rate Us`,
    `Dear {{customer_name}},\n\nYour service complaint under ticket ID {{complaint_id}} is now closed.\n\nWe hope our service technician resolved your issue to your satisfaction.\n\nPlease take 30 seconds to rate your service experience by clicking the link below.`
  );

  insertTemplate.run(
    'complaint_reopened',
    'Complaint Reopened Notification',
    `☀️ *Eco Green Solar Priority Alert*\n\nDear {{customer_name}}, your complaint *{{complaint_id}}* has been *REOPENED* upon your request.\n\nA senior service supervisor will review the case and arrange an expedited follow-up.\n\n🔗 *Track:* {{feedback_url}}\n- Eco Green Solar`,
    `[Eco Green Solar] Complaint Reopened - {{complaint_id}}`,
    `Dear {{customer_name}},\n\nWe have received your request to reopen complaint ticket {{complaint_id}}.\n\nOur senior operations lead will review the service history and arrange an immediate re-inspection.`
  );

  // 4. Seed Rich Sample Complaints
  const complaintCount = db.prepare('SELECT COUNT(*) as count FROM complaints').get().count;
  if (complaintCount === 0 || forceReset) {
    const insertComplaint = db.prepare(`
      INSERT INTO complaints (
        ticket_id, customer_name, customer_phone, customer_email, customer_address,
        product_type, product_serial, installation_id, issue_category, issue_description,
        priority, status, assigned_technician_id, expected_visit_date, resolution_notes,
        spare_parts_used, rating, feedback_comments, created_at, assigned_at, resolved_at, closed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertTimeline = db.prepare(`
      INSERT INTO complaint_timelines (complaint_id, action, notes, performed_by_name, performed_by_role, notify_customer, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const complaintsData = [
      {
        ticket: 'EGS-2026-000101', name: 'Ananya Sharma', phone: '+919845012345', email: 'ananya.s@example.com',
        addr: 'Villa 42, Palm Meadows, Whitefield, Bengaluru', prod: 'Solar Rooftop Systems',
        serial: 'EGS-RT-5KW-8842', instId: 'INST-BLR-2024-098', cat: 'Inverter Fault / Error Code',
        desc: 'Inverter showing constant red error light E-04 and zero generation since yesterday morning.',
        prio: 'High', status: 'In Progress', techId: 1, visitDate: '2026-09-14',
        resNotes: null, parts: null, rating: null, comments: null,
        created: '2026-09-12 10:30:00', assigned: '2026-09-12 11:15:00', resolved: null, closed: null,
        timeline: [
          { action: 'Registered', note: 'Customer registered complaint via helpline.', by: 'Pooja Sharma', role: 'staff' },
          { action: 'Assigned', note: 'Assigned to Rohit Kumar (Rooftop specialist).', by: 'Pooja Sharma', role: 'staff' },
          { action: 'In Progress', note: 'Technician visited site, tested DC array. Surge protector tripped.', by: 'Rohit Kumar', role: 'technician' }
        ]
      },
      {
        ticket: 'EGS-2026-000102', name: 'Rajesh Kulkarni', phone: '+919886098765', email: 'rajesh.k@example.com',
        addr: '14/B, 7th Main, 4th Block, Jayanagar, Bengaluru', prod: 'Solar Water Heaters',
        serial: 'EGS-SWH-200L-331', instId: 'INST-BLR-2023-412', cat: 'Water Leakage from Tank',
        desc: 'Water continuous dripping from the cold water inlet union joint on terrace tank.',
        prio: 'Medium', status: 'Assigned', techId: 2, visitDate: '2026-09-15',
        resNotes: null, parts: null, rating: null, comments: null,
        created: '2026-09-13 09:15:00', assigned: '2026-09-13 10:00:00', resolved: null, closed: null,
        timeline: [
          { action: 'Registered', note: 'Customer reported pipe leakage.', by: 'Pooja Sharma', role: 'staff' },
          { action: 'Assigned', note: 'Assigned to Vikram Singh for inspection.', by: 'Pooja Sharma', role: 'staff' }
        ]
      },
      {
        ticket: 'EGS-2026-000103', name: 'Kavita Menon', phone: '+919945033445', email: 'kavita.m@example.com',
        addr: 'Flat 602, Prestige Lakeside, Marathahalli, Bengaluru', prod: 'Heat Pumps',
        serial: 'EGS-HP-300L-091', instId: 'INST-BLR-2025-019', cat: 'Display Error Code (F1/F2)',
        desc: 'Water is only warm, not reaching set 55C. Display panel showing Code F2.',
        prio: 'High', status: 'Unassigned', techId: null, visitDate: null,
        resNotes: null, parts: null, rating: null, comments: null,
        created: '2026-09-14 08:20:00', assigned: null, resolved: null, closed: null,
        timeline: [
          { action: 'Registered', note: 'Complaint submitted via web customer portal.', by: 'Kavita Menon', role: 'customer' }
        ]
      },
      {
        ticket: 'EGS-2026-000104', name: 'Deepak Verma', phone: '+919731055667', email: 'deepak.v@example.com',
        addr: 'No. 88, Defence Colony, Indiranagar, Bengaluru', prod: 'Solar Rooftop Systems',
        serial: 'EGS-RT-3KW-5521', instId: 'INST-BLR-2024-118', cat: 'Grid Breaker Tripping',
        desc: 'Grid feed breaker kept tripping during peak afternoon sun.',
        prio: 'High', status: 'Resolved', techId: 1, visitDate: '2026-09-12',
        resNotes: 'Replaced faulty 32A MCB breaker in AC distribution box and tightened solar cable terminals.',
        parts: '1x Schneider 32A 2-Pole MCB, 2x Cable ties', rating: 5, comments: 'Quick resolution!',
        created: '2026-09-11 11:00:00', assigned: '2026-09-11 12:30:00', resolved: '2026-09-12 16:30:00', closed: null,
        timeline: [
          { action: 'Registered', note: 'Customer logged tripping issue.', by: 'Pooja Sharma', role: 'staff' },
          { action: 'Assigned', note: 'Assigned to Rohit Kumar.', by: 'Pooja Sharma', role: 'staff' },
          { action: 'Resolved', note: 'Faulty MCB replaced. System tested at 2.8kW generation.', by: 'Rohit Kumar', role: 'technician' }
        ]
      },
      {
        ticket: 'EGS-2026-000105', name: 'Meera Rao', phone: '+919844077889', email: 'meera.r@example.com',
        addr: '78, 2nd Cross, JP Nagar 3rd Phase, Bengaluru', prod: 'Solar Water Heaters',
        serial: 'EGS-SWH-150L-102', instId: 'INST-BLR-2023-221', cat: 'Scale Formation / Descaling',
        desc: 'Routine annual descaling and air vent valve inspection.',
        prio: 'Low', status: 'Closed', techId: 2, visitDate: '2026-09-08',
        resNotes: 'Complete tank flushing and chemical descaling completed. Anode rod replaced.',
        parts: '1x Sacrificial Magnesium Anode Rod (300mm)', rating: 5, comments: 'Super prompt service by technician Vikram!',
        created: '2026-09-07 14:00:00', assigned: '2026-09-07 15:00:00', resolved: '2026-09-08 17:00:00', closed: '2026-09-09 10:00:00',
        timeline: [
          { action: 'Registered', note: 'AMC service scheduled.', by: 'Pooja Sharma', role: 'staff' },
          { action: 'Assigned', note: 'Assigned to Vikram Singh.', by: 'Pooja Sharma', role: 'staff' },
          { action: 'Resolved', note: 'Descaling completed.', by: 'Vikram Singh', role: 'technician' },
          { action: 'Closed', note: 'Verified with customer and closed ticket. Customer rated 5 stars.', by: 'Pooja Sharma', role: 'staff' }
        ]
      },
      {
        ticket: 'EGS-2026-000106', name: 'Harish Nambiar', phone: '+919880011223', email: 'harish.n@example.com',
        addr: 'Plot 55, Green Valley, Sarjapur Road, Bengaluru', prod: 'Heat Pumps',
        serial: 'EGS-HP-500L-301', instId: 'INST-BLR-2025-072', cat: 'Circulation Pump Failure',
        desc: 'Commercial 500L heat pump circulation pump vibrating loudly with clicking sounds and low water throughput.',
        prio: 'High', status: 'In Progress', techId: 3, visitDate: '2026-09-14',
        resNotes: null, parts: null, rating: null, comments: null,
        created: '2026-09-13 14:00:00', assigned: '2026-09-13 15:10:00', resolved: null, closed: null,
        timeline: [
          { action: 'Registered', note: 'Complaint registered by staff.', by: 'Pooja Sharma', role: 'staff' },
          { action: 'Assigned', note: 'Assigned to Suresh Patel.', by: 'Pooja Sharma', role: 'staff' }
        ]
      },
      {
        ticket: 'EGS-2026-000107', name: 'Sunita Narayanan', phone: '+919740022334', email: 'sunita.n@example.com',
        addr: 'B-304, Brigade Gateway, Malleshwaram, Bengaluru', prod: 'Solar Rooftop Systems',
        serial: 'EGS-RT-10KW-409', instId: 'INST-BLR-2024-411', cat: 'Monitoring App Offline',
        desc: 'Solar Wi-Fi data logger stopped transmitting to the cloud portal since router password change.',
        prio: 'Low', status: 'Assigned', techId: 4, visitDate: '2026-09-15',
        resNotes: null, parts: null, rating: null, comments: null,
        created: '2026-09-13 17:30:00', assigned: '2026-09-14 09:00:00', resolved: null, closed: null,
        timeline: [
          { action: 'Registered', note: 'Customer requested Wi-Fi logger setup.', by: 'Pooja Sharma', role: 'staff' },
          { action: 'Assigned', note: 'Assigned to Manoj Sharma.', by: 'Pooja Sharma', role: 'staff' }
        ]
      },
      {
        ticket: 'EGS-2026-000108', name: 'Arjun Somani', phone: '+919811199887', email: 'arjun.s@example.com',
        addr: 'House 12, Sector 15, HSR Layout, Bengaluru', prod: 'Solar Water Heaters',
        serial: 'EGS-SWH-300L-512', instId: 'INST-BLR-2023-789', cat: 'Low Water Temperature',
        desc: 'Water temperature does not exceed 35°C even after a full sunny day.',
        prio: 'Medium', status: 'Unassigned', techId: null, visitDate: null,
        resNotes: null, parts: null, rating: null, comments: null,
        created: '2026-09-14 07:45:00', assigned: null, resolved: null, closed: null,
        timeline: [
          { action: 'Registered', note: 'Customer registered online ticket.', by: 'Arjun Somani', role: 'customer' }
        ]
      },
      {
        ticket: 'EGS-2026-000109', name: 'Priyanka Sen', phone: '+919830055443', email: 'priyanka.sen@example.com',
        addr: 'Villa 18, Silver County, Haralur Road, Bengaluru', prod: 'Heat Pumps',
        serial: 'EGS-HP-200L-188', instId: 'INST-BLR-2025-104', cat: 'Compressor Tripping',
        desc: 'Compressor starts with a click and trips within 45 seconds.',
        prio: 'High', status: 'On Hold', techId: 3, visitDate: '2026-09-13',
        resNotes: 'Awaiting OEM capacitor and low pressure switch replacement part.',
        parts: 'Start capacitor 45uF (Awaiting stock)', rating: null, comments: null,
        created: '2026-09-12 15:20:00', assigned: '2026-09-12 16:00:00', resolved: null, closed: null,
        timeline: [
          { action: 'Registered', note: 'Compressor tripping reported.', by: 'Pooja Sharma', role: 'staff' },
          { action: 'Assigned', note: 'Assigned to Suresh Patel.', by: 'Pooja Sharma', role: 'staff' },
          { action: 'On Hold', note: 'Part requisition placed with warehouse.', by: 'Suresh Patel', role: 'technician' }
        ]
      },
      {
        ticket: 'EGS-2026-000110', name: 'Girish Hegde', phone: '+919845566778', email: 'girish.h@example.com',
        addr: '45, 11th Main, Malleshwaram, Bengaluru', prod: 'Solar Rooftop Systems',
        serial: 'EGS-RT-5KW-2201', instId: 'INST-BLR-2024-287', cat: 'Cable / Connector Damage',
        desc: 'DC cable chewed by rodents on terrace mounting rack causing low insulation resistance fault.',
        prio: 'High', status: 'Resolved', techId: 1, visitDate: '2026-09-13',
        resNotes: 'Re-routed solar DC cables inside heavy-duty UV conduit. Replaced 4 damaged MC4 connectors.',
        parts: '4x MC4 Connectors, 6m UV-resistant conduit pipe', rating: 5, comments: 'Excellent neat conduit work.',
        created: '2026-09-12 09:00:00', assigned: '2026-09-12 10:00:00', resolved: '2026-09-13 13:45:00', closed: null,
        timeline: [
          { action: 'Registered', note: 'Insulation fault reported.', by: 'Pooja Sharma', role: 'staff' },
          { action: 'Assigned', note: 'Assigned to Rohit Kumar.', by: 'Pooja Sharma', role: 'staff' },
          { action: 'Resolved', note: 'Cables re-routed and MC4 connectors replaced.', by: 'Rohit Kumar', role: 'technician' }
        ]
      },
      {
        ticket: 'EGS-2026-000111', name: 'Siddharth Roy', phone: '+919820033112', email: 'siddharth.r@example.com',
        addr: 'Penthouse 1401, Salarpuria Sattva, Bellandur, Bengaluru', prod: 'Solar Water Heaters',
        serial: 'EGS-SWH-250L-904', instId: 'INST-BLR-2023-655', cat: 'Electrical Backup Heater Fault',
        desc: 'Electrical backup heater thermostat trips main house MCB as soon as switched on.',
        prio: 'Medium', status: 'Reopened', techId: 2, visitDate: '2026-09-14',
        resNotes: 'Heater was replaced earlier but customer reports trip recurred under load.',
        parts: '2kW Immersion element', rating: null, comments: null,
        created: '2026-09-10 12:00:00', assigned: '2026-09-10 14:00:00', resolved: null, closed: null,
        timeline: [
          { action: 'Registered', note: 'Thermostat tripping reported.', by: 'Pooja Sharma', role: 'staff' },
          { action: 'Reopened', note: 'Customer requested reopening due to persistent issue.', by: 'Siddharth Roy', role: 'customer' }
        ]
      },
      {
        ticket: 'EGS-2026-000112', name: 'Ramesh Sundaram', phone: '+919840044556', email: 'ramesh.s@example.com',
        addr: '102, 5th Cross, Basavanagudi, Bengaluru', prod: 'Solar Rooftop Systems',
        serial: 'EGS-RT-7KW-7711', instId: 'INST-BLR-2024-340', cat: 'AMC / Panel Cleaning',
        desc: 'Bi-annual professional demineralized water cleaning and structural bolt torque check.',
        prio: 'Low', status: 'Closed', techId: 4, visitDate: '2026-09-09',
        resNotes: 'Cleaned all 18 mono-perc modules. Generation increased from 24 kWh/day to 33 kWh/day.',
        parts: 'Cleaning consumable pack', rating: 5, comments: 'Very thorough cleaning. Highly satisfied.',
        created: '2026-09-08 10:00:00', assigned: '2026-09-08 11:00:00', resolved: '2026-09-09 15:30:00', closed: '2026-09-10 09:30:00',
        timeline: [
          { action: 'Registered', note: 'AMC cleaning scheduled.', by: 'Pooja Sharma', role: 'staff' },
          { action: 'Assigned', note: 'Assigned to Manoj Sharma.', by: 'Pooja Sharma', role: 'staff' },
          { action: 'Resolved', note: 'Panel cleaning completed.', by: 'Manoj Sharma', role: 'technician' },
          { action: 'Closed', note: 'Customer rated 5 stars.', by: 'Pooja Sharma', role: 'staff' }
        ]
      }
    ];

    for (const c of complaintsData) {
      const res = insertComplaint.run(
        c.ticket, c.name, c.phone, c.email, c.addr,
        c.prod, c.serial, c.instId, c.cat, c.desc,
        c.prio, c.status, c.techId, c.visitDate, c.resNotes,
        c.parts, c.rating, c.comments, c.created, c.assigned, c.resolved, c.closed
      );
      const compId = res.lastInsertRowid;

      if (c.timeline) {
        for (const t of c.timeline) {
          insertTimeline.run(compId, t.action, t.note, t.by, t.role, 1, c.created);
        }
      }
    }

    console.log(`Successfully seeded ${complaintsData.length} realistic complaints and timelines.`);
  }

  console.log('Database seeded successfully!');
}

module.exports = { seedDatabase };

if (require.main === module) {
  seedDatabase(true).then(() => process.exit(0));
}
