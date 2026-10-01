const fetch = globalThis.fetch;

const META_PHONE_NUMBER_ID = '1387211441132836';
const META_ACCESS_TOKEN = 'EAAeu6xsMl2sBSUlmL0tvSALfdQ39gr2g6cu86UfSZAJFf0ml2NvIrgxBZCrClykIx7fZATeANImtUraemtzYplsBFGWgMSCJZBT5JKRlZBAogI9IFf6BtfW8w3JPRBZB17RZBlFAxM1EXrywEDpFdHcn1Ub8PQaYEjBLhkhwYDMkqMJhYfU8QKegqSN2mu66N7hpwZDZD';
const TEST_PHONE = '916352454247'; // Test admin/technician phone

async function testTemplates() {
  console.log('Testing Meta Cloud API with approved templates...');

  // 1. technician_work_order
  console.log('\n--- 1. Testing technician_work_order ---');
  const payloadWorkOrder = {
    messaging_product: 'whatsapp',
    to: TEST_PHONE,
    type: 'template',
    template: {
      name: 'technician_work_order',
      language: { code: 'en_US' },
      components: [{
        type: 'body',
        parameters: [
          { type: 'text', parameter_name: 'technician_name', text: 'Rohit Kumar' },
          { type: 'text', parameter_name: 'complaint_id', text: 'EGS-2026-000101' },
          { type: 'text', parameter_name: 'customer_name', text: 'Sahil Test' },
          { type: 'text', parameter_name: 'customer_phone', text: '9845012345' },
          { type: 'text', parameter_name: 'customer_address', text: 'Sector 5, Gandhinagar' },
          { type: 'text', parameter_name: 'product_type', text: 'Solar Rooftop Systems' },
          { type: 'text', parameter_name: 'issue_category', text: 'Inverter Fault' },
          { type: 'text', parameter_name: 'notes', text: 'Check DC wire voltage' },
          { type: 'text', parameter_name: 'priority', text: 'High' },
          { type: 'text', parameter_name: 'expected_visit_date', text: 'Tomorrow, 11:30 AM' }
        ]
      }]
    }
  };

  const res1 = await fetch(`https://graph.facebook.com/v21.0/${META_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${META_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payloadWorkOrder)
  });
  const data1 = await res1.json();
  console.log('technician_work_order result:', res1.status, data1);

  // 2. technician_pending_visit_reminder
  console.log('\n--- 2. Testing technician_pending_visit_reminder ---');
  const payloadReminder = {
    messaging_product: 'whatsapp',
    to: TEST_PHONE,
    type: 'template',
    template: {
      name: 'technician_pending_visit_reminder',
      language: { code: 'en' },
      components: [{
        type: 'body',
        parameters: [
          { type: 'text', parameter_name: 'technician_name', text: 'Rohit Kumar' },
          { type: 'text', parameter_name: 'complaint_id', text: 'EGS-2026-000101' },
          { type: 'text', parameter_name: 'customer_name', text: 'Sahil Test' },
          { type: 'text', parameter_name: 'customer_phone', text: '9845012345' },
          { type: 'text', parameter_name: 'customer_address', text: 'Sector 5, Gandhinagar' },
          { type: 'text', parameter_name: 'expected_visit_date', text: 'Tomorrow, 11:30 AM' }
        ]
      }]
    }
  };

  const res2 = await fetch(`https://graph.facebook.com/v21.0/${META_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${META_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payloadReminder)
  });
  const data2 = await res2.json();
  console.log('technician_pending_visit_reminder result:', res2.status, data2);

  // 3. complaint_closed__feedback_request
  console.log('\n--- 3. Testing complaint_closed__feedback_request ---');
  const payloadClosed = {
    messaging_product: 'whatsapp',
    to: TEST_PHONE,
    type: 'template',
    template: {
      name: 'complaint_closed__feedback_request',
      language: { code: 'en' },
      components: [{
        type: 'body',
        parameters: [
          { type: 'text', parameter_name: 'customer_name', text: 'Sahil Test' },
          { type: 'text', parameter_name: 'complaint_id', text: 'EGS-2026-000101' },
          { type: 'text', parameter_name: 'feedback_url', text: 'https://complain.ecogreensolar.co.in/track/EGS-2026-000101' }
        ]
      }]
    }
  };

  const res3 = await fetch(`https://graph.facebook.com/v21.0/${META_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${META_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payloadClosed)
  });
  const data3 = await res3.json();
  console.log('complaint_closed__feedback_request result:', res3.status, data3);

  // 4. complaint_reopened_notification
  console.log('\n--- 4. Testing complaint_reopened_notification ---');
  const payloadReopened = {
    messaging_product: 'whatsapp',
    to: TEST_PHONE,
    type: 'template',
    template: {
      name: 'complaint_reopened_notification',
      language: { code: 'en' },
      components: [{
        type: 'body',
        parameters: [
          { type: 'text', parameter_name: 'customer_name', text: 'Sahil Test' },
          { type: 'text', parameter_name: 'complaint_id', text: 'EGS-2026-000101' },
          { type: 'text', parameter_name: 'feedback_url', text: 'https://complain.ecogreensolar.co.in/track/EGS-2026-000101' }
        ]
      }]
    }
  };

  const res4 = await fetch(`https://graph.facebook.com/v21.0/${META_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${META_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payloadReopened)
  });
  const data4 = await res4.json();
  console.log('complaint_reopened_notification result:', res4.status, data4);
}

testTemplates().catch(console.error);
