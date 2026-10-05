const fetch = globalThis.fetch;

const META_PHONE_NUMBER_ID = '1387211441132836';
const META_ACCESS_TOKEN = 'EAAeu6xsMl2sBSUlmL0tvSALfdQ39gr2g6cu86UfSZAJFf0ml2NvIrgxBZCrClykIx7fZATeANImtUraemtzYplsBFGWgMSCJZBT5JKRlZBAogI9IFf6BtfW8w3JPRBZB17RZBlFAxM1EXrywEDpFdHcn1Ub8PQaYEjBLhkhwYDMkqMJhYfU8QKegqSN2mu66N7hpwZDZD';
const TEST_PHONE = '916352454247';

async function sendTemplate(name, templatePayload) {
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${META_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${META_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: TEST_PHONE,
        type: 'template',
        template: templatePayload
      })
    });
    const data = await res.json();
    if (res.ok && data.messages?.[0]?.id) {
      console.log(`✅ [${name}] SENT SUCCESS! Message ID: ${data.messages[0].id}`);
      return true;
    } else {
      console.error(`❌ [${name}] FAILED:`, JSON.stringify(data.error || data));
      return false;
    }
  } catch (err) {
    console.error(`❌ [${name}] ERROR:`, err.message);
    return false;
  }
}

async function runAllTests() {
  console.log(`Starting WhatsApp Template Dispatch Tests to ${TEST_PHONE}...\n`);

  // 1. technician_work_order (Single Technician Work Order - NAMED)
  await sendTemplate('technician_work_order', {
    name: 'technician_work_order',
    language: { code: 'en_US' },
    components: [{
      type: 'body',
      parameters: [
        { type: 'text', parameter_name: 'technician_name', text: 'Hardevsinh Vaghela' },
        { type: 'text', parameter_name: 'complaint_id', text: 'EGS-2026-000103' },
        { type: 'text', parameter_name: 'customer_name', text: 'SONAGRA DHANIBEN' },
        { type: 'text', parameter_name: 'customer_phone', text: '+916352454247' },
        { type: 'text', parameter_name: 'customer_address', text: 'SURENDRANAGAR' },
        { type: 'text', parameter_name: 'product_type', text: 'Solar Rooftop Systems' },
        { type: 'text', parameter_name: 'issue_category', text: 'Inverter Fault' },
        { type: 'text', parameter_name: 'notes', text: 'Check DC voltage & inverter display' },
        { type: 'text', parameter_name: 'priority', text: 'Medium' },
        { type: 'text', parameter_name: 'expected_visit_date', text: 'Tomorrow, 10:00 AM' }
      ]
    }]
  });

  await new Promise(r => setTimeout(r, 1000));

  // 2. technician_dual_team_work_order (Team Work Order - POSITIONAL, 12 params)
  await sendTemplate('technician_dual_team_work_order', {
    name: 'technician_dual_team_work_order',
    language: { code: 'en_US' },
    components: [{
      type: 'body',
      parameters: [
        { type: 'text', text: 'TEST - TECH' },
        { type: 'text', text: 'Hardevsinh Vaghela' },
        { type: 'text', text: 'EGS-2026-000103' },
        { type: 'text', text: '8141349909' },
        { type: 'text', text: 'SONAGRA DHANIBEN' },
        { type: 'text', text: '+916352454247' },
        { type: 'text', text: 'SURENDRANAGAR' },
        { type: 'text', text: 'Solar Rooftop Systems' },
        { type: 'text', text: 'Inverter Fault' },
        { type: 'text', text: 'Check DC voltage & inverter display' },
        { type: 'text', text: 'Medium' },
        { type: 'text', text: 'Tomorrow, 10:00 AM' }
      ]
    }]
  });

  await new Promise(r => setTimeout(r, 1000));

  // 3. technician_work_order_reassigned (Single Technician Reassigned - POSITIONAL, 10 params)
  await sendTemplate('technician_work_order_reassigned', {
    name: 'technician_work_order_reassigned',
    language: { code: 'en_US' },
    components: [{
      type: 'body',
      parameters: [
        { type: 'text', text: 'Hardevsinh Vaghela' },
        { type: 'text', text: 'EGS-2026-000103' },
        { type: 'text', text: 'SONAGRA DHANIBEN' },
        { type: 'text', text: '+916352454247' },
        { type: 'text', text: 'SURENDRANAGAR' },
        { type: 'text', text: 'Inverter Fault' },
        { type: 'text', text: 'Solar Rooftop Systems' },
        { type: 'text', text: 'High' },
        { type: 'text', text: 'Tomorrow, 11:00 AM' },
        { type: 'text', text: 'https://complain.ecogreensolar.co.in/technician' }
      ]
    }]
  });

  await new Promise(r => setTimeout(r, 1000));

  // 4. technician_job_transferred_notice (Technician unassigned/transferred notice - NAMED)
  await sendTemplate('technician_job_transferred_notice', {
    name: 'technician_job_transferred_notice',
    language: { code: 'en' },
    components: [{
      type: 'body',
      parameters: [
        { type: 'text', parameter_name: 'technician_name', text: 'Jay Bhai' },
        { type: 'text', parameter_name: 'complaint_id', text: 'EGS-2026-000103' },
        { type: 'text', parameter_name: 'customer_name', text: 'SONAGRA DHANIBEN' }
      ]
    }]
  });

  await new Promise(r => setTimeout(r, 1000));

  // 5. customer_technician_reassigned (Customer reassigned alert - NAMED)
  await sendTemplate('customer_technician_reassigned', {
    name: 'customer_technician_reassigned',
    language: { code: 'en' },
    components: [{
      type: 'body',
      parameters: [
        { type: 'text', parameter_name: 'customer_name', text: 'SONAGRA DHANIBEN' },
        { type: 'text', parameter_name: 'complaint_id', text: 'EGS-2026-000103' },
        { type: 'text', parameter_name: 'product_type', text: 'Solar Rooftop Systems' },
        { type: 'text', parameter_name: 'technician_name', text: 'Hardevsinh Vaghela' },
        { type: 'text', parameter_name: 'feedback_url', text: 'https://complain.ecogreensolar.co.in/track/EGS-2026-000103' }
      ]
    }]
  });

  await new Promise(r => setTimeout(r, 1000));

  // 6. technician_assigned (Customer initial assignment alert - POSITIONAL, 4 params)
  await sendTemplate('technician_assigned', {
    name: 'technician_assigned',
    language: { code: 'en_US' },
    components: [{
      type: 'body',
      parameters: [
        { type: 'text', text: 'SONAGRA DHANIBEN' },
        { type: 'text', text: 'EGS-2026-000103' },
        { type: 'text', text: 'TEST - TECH & Hardevsinh Vaghela' },
        { type: 'text', text: 'https://complain.ecogreensolar.co.in/track/EGS-2026-000103' }
      ]
    }]
  });

  await new Promise(r => setTimeout(r, 1000));

  // 7. technician_team_work_order_reassigned (Team Reassigned Work Order - POSITIONAL, 12 params)
  await sendTemplate('technician_team_work_order_reassigned', {
    name: 'technician_team_work_order_reassigned',
    language: { code: 'en_US' },
    components: [{
      type: 'body',
      parameters: [
        { type: 'text', text: 'TEST - TECH' },
        { type: 'text', text: 'Hardevsinh Vaghela' },
        { type: 'text', text: 'EGS-2026-000103' },
        { type: 'text', text: '8141349909' },
        { type: 'text', text: 'SONAGRA DHANIBEN' },
        { type: 'text', text: '+916352454247' },
        { type: 'text', text: 'SURENDRANAGAR' },
        { type: 'text', text: 'Solar Rooftop Systems' },
        { type: 'text', text: 'Inverter Fault' },
        { type: 'text', text: 'Check DC voltage & inverter display' },
        { type: 'text', text: 'High' },
        { type: 'text', text: 'Tomorrow, 11:00 AM' }
      ]
    }]
  });

  await new Promise(r => setTimeout(r, 1000));

  // 8. technician_team_partner_updated (Team Partner Updated - POSITIONAL, 12 params)
  await sendTemplate('technician_team_partner_updated', {
    name: 'technician_team_partner_updated',
    language: { code: 'en_US' },
    components: [{
      type: 'body',
      parameters: [
        { type: 'text', text: 'TEST - TECH' },
        { type: 'text', text: 'Hardevsinh Vaghela' },
        { type: 'text', text: 'EGS-2026-000103' },
        { type: 'text', text: '8141349909' },
        { type: 'text', text: 'SONAGRA DHANIBEN' },
        { type: 'text', text: '+916352454247' },
        { type: 'text', text: 'SURENDRANAGAR' },
        { type: 'text', text: 'Solar Rooftop Systems' },
        { type: 'text', text: 'Inverter Fault' },
        { type: 'text', text: 'Check DC voltage & inverter display' },
        { type: 'text', text: 'High' },
        { type: 'text', text: 'Tomorrow, 11:00 AM' }
      ]
    }]
  });

  await new Promise(r => setTimeout(r, 1000));

  // 9. technician_team_removed_notice (Notice to removed team member - POSITIONAL, 3 params)
  await sendTemplate('technician_team_removed_notice', {
    name: 'technician_team_removed_notice',
    language: { code: 'en_US' },
    components: [{
      type: 'body',
      parameters: [
        { type: 'text', text: 'Hardevsinh Vaghela' },
        { type: 'text', text: 'EGS-2026-000103' },
        { type: 'text', text: 'SONAGRA DHANIBEN' }
      ]
    }]
  });

  console.log('\nAll test dispatches completed!');
}

runAllTests().catch(console.error);
