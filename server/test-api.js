const app = require('./server');
const http = require('http');

async function runTests() {
  const PORT = 5002;
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(PORT, resolve));
  console.log(`Test server running on port ${PORT}...`);

  const baseUrl = `http://localhost:${PORT}/api`;
  let adminToken = '';
  let staffToken = '';
  let techToken = '';
  let testComplaintId = null;
  let testTicketId = '';

  try {
    // 1. Health check
    console.log('\n[1/11] Checking API Health...');
    const healthRes = await fetch(`${baseUrl}/health`);
    const healthData = await healthRes.json();
    if (healthData.status !== 'ok') throw new Error('Health check failed');
    console.log('✅ Health check passed:', healthData.service);

    // 2. Auth Login - Admin & Staff & Tech
    console.log('\n[2/11] Testing User Authentication...');
    const adminLogin = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@ecogreensolar.com', password: 'admin123' })
    });
    const adminData = await adminLogin.json();
    if (!adminData.token) throw new Error('Admin login failed');
    adminToken = adminData.token;
    console.log('✅ Admin login success: ', adminData.user.name, `(${adminData.user.role})`);

    const staffLogin = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'staff@ecogreensolar.com', password: 'staff123' })
    });
    const staffData = await staffLogin.json();
    staffToken = staffData.token;
    console.log('✅ Staff login success: ', staffData.user.name, `(${staffData.user.role})`);

    // 3. Register Complaint (Support Staff)
    console.log('\n[3/11] Registering New Complaint...');
    const registerRes = await fetch(`${baseUrl}/complaints`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${staffToken}`
      },
      body: JSON.stringify({
        customer_name: 'Harish Nambiar',
        customer_phone: '+919880011223',
        customer_email: 'harish.n@example.com',
        customer_address: 'Plot 55, Green Valley, Sarjapur Road, Bengaluru',
        product_type: 'Solar Rooftop Systems',
        product_serial: 'EGS-RT-10KW-9912',
        installation_id: 'INST-BLR-2025-883',
        issue_category: 'No Power Output',
        issue_description: 'Grid inverter trips immediately upon switching on AC isolator.',
        priority: 'High'
      })
    });
    const registerData = await registerRes.json();
    if (!registerData.complaint) throw new Error('Complaint registration failed');
    testComplaintId = registerData.complaint.id;
    testTicketId = registerData.complaint.ticket_id;
    console.log(`✅ Complaint registered successfully: ${testTicketId} (Status: ${registerData.complaint.status})`);

    // 4. Assign Technician
    console.log('\n[4/11] Assigning Technician to Complaint...');
    const assignRes = await fetch(`${baseUrl}/complaints/${testComplaintId}/assign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${staffToken}`
      },
      body: JSON.stringify({
        technician_id: 1, // Rohit Kumar
        expected_visit_date: '2026-09-15'
      })
    });
    const assignData = await assignRes.json();
    if (assignData.complaint.status !== 'Assigned') throw new Error('Technician assignment failed');
    console.log(`✅ Assigned to technician. Status updated to: ${assignData.complaint.status}`);

    // 5. Add Timeline Follow-up Note
    console.log('\n[5/11] Adding Field Visit Note...');
    const noteRes = await fetch(`${baseUrl}/complaints/${testComplaintId}/note`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${staffToken}`
      },
      body: JSON.stringify({
        status: 'In Progress',
        notes: 'Technician reached site. Checked string voltages: String 1 is 380V, String 2 has open circuit.',
        notify_customer: true
      })
    });
    const noteData = await noteRes.json();
    console.log('✅ Timeline note added:', noteData.message);

    // 6. Resolve Complaint
    console.log('\n[6/11] Resolving Complaint with Parts Used & Notes...');
    const resolveRes = await fetch(`${baseUrl}/complaints/${testComplaintId}/resolve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${staffToken}`
      },
      body: JSON.stringify({
        resolution_notes: 'Crimped loose MC4 negative connector on rooftop string 2. Tested full 8.2 kW power output.',
        spare_parts_used: '2x Amphenol MC4 Connectors, 1x Heat-shrink sleeve'
      })
    });
    const resolveData = await resolveRes.json();
    if (resolveData.complaint.status !== 'Resolved') throw new Error('Resolution failed');
    console.log(`✅ Complaint marked as Resolved: ${resolveData.complaint.ticket_id}`);

    // 7. Public Customer Tracking
    console.log('\n[7/11] Testing Public Customer Tracking by Ticket ID...');
    const trackRes = await fetch(`${baseUrl}/complaints/track/${testTicketId}`);
    const trackData = await trackRes.json();
    if (!trackData.complaint) throw new Error('Public tracking failed');
    console.log(`✅ Public tracking verified for ${trackData.complaint.customer_name} (Status: ${trackData.complaint.status})`);

    // 8. Close Complaint
    console.log('\n[8/11] Closing Complaint...');
    const closeRes = await fetch(`${baseUrl}/complaints/${testComplaintId}/close`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        closure_remarks: 'Customer verbally confirmed inverter is operating normally.'
      })
    });
    const closeData = await closeRes.json();
    if (closeData.complaint.status !== 'Closed') throw new Error('Close complaint failed');
    console.log(`✅ Complaint marked as Closed: ${closeData.complaint.ticket_id}`);

    // 9. Submit Customer Satisfaction Feedback
    console.log('\n[9/11] Submitting Customer Feedback & 5-Star Rating...');
    const feedbackRes = await fetch(`${baseUrl}/complaints/${testComplaintId}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rating: 5,
        feedback_comments: 'Very quick resolution, technician arrived on time and fixed the connector.'
      })
    });
    const feedbackData = await feedbackRes.json();
    console.log('✅ Feedback recorded:', feedbackData.message);

    // 10. Check Notification Logs & Simulator
    console.log('\n[10/11] Checking Notification Audit Trail & Simulator...');
    const notifRes = await fetch(`${baseUrl}/notifications/logs?complaint_id=${testComplaintId}`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const notifData = await notifRes.json();
    console.log(`✅ Found ${notifData.logs.length} notification audit entries for ${testTicketId}`);

    const simRes = await fetch(`${baseUrl}/notifications/simulated`);
    const simData = await simRes.json();
    console.log(`✅ Simulated live message buffer contains ${simData.messages.length} messages`);

    // 11. Dashboard Analytics & CSV Export
    console.log('\n[11/11] Verifying Dashboard Analytics & CSV Report Export...');
    const metricsRes = await fetch(`${baseUrl}/reports/metrics`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const metricsData = await metricsRes.json();
    console.log(`✅ Metrics verified: Total=${metricsData.counts.total}, Closed=${metricsData.counts.closed_count}, AvgRating=${metricsData.customerSatisfaction.averageRating}`);

    const csvRes = await fetch(`${baseUrl}/reports/export-csv`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const csvText = await csvRes.text();
    if (!csvText.includes('Ticket ID') || !csvText.includes(testTicketId)) {
      throw new Error('CSV export missing expected header or ticket data');
    }
    console.log(`✅ CSV report generated successfully (${csvText.split('\n').length} rows)`);

    console.log('\n======================================================');
    console.log('🎉 ALL BACKEND INTEGRATION TESTS PASSED 100% SUCCESFULLY!');
    console.log('======================================================\n');
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  } finally {
    server.close();
    process.exit(0);
  }
}

runTests();
