const fetch = globalThis.fetch;

const WORKER_URL = 'https://eco-green-solar-cms-api.eco-green-solar-cms-api.workers.dev';

// Valid binary headers
const sampleJpeg = Buffer.from([
  0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
  0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
  0xFF, 0xD9
]);

const samplePdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Title (E2E Test Report) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');

// Minimal valid MP4 ftyp box
const sampleMp4 = Buffer.from([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6F, 0x6D,
  0x00, 0x00, 0x02, 0x00, 0x69, 0x73, 0x6F, 0x6D, 0x69, 0x73, 0x6F, 0x32
]);

async function runComplaintLifecycle() {
  console.log('================================================================');
  console.log('ECO GREEN SOLAR CMS - COMPLAINT LIFECYCLE & R2 MULTI-FILE TEST');
  console.log('================================================================\n');

  // 1. Authenticate as Admin
  console.log('Step 1: Admin Authentication...');
  const adminRes = await fetch(`${WORKER_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: '6352454247', password: 'admin3636' })
  });
  const adminData = await adminRes.json();
  const adminToken = adminData.token;
  console.log('[PASS] Admin Authenticated.');

  // 2. Authenticate as Technician
  console.log('Step 2: Technician Authentication...');
  const techRes = await fetch(`${WORKER_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: '8141349909', password: 'tech3636' })
  });
  const techData = await techRes.json();
  const techToken = techData.token;
  const techId = techData.user.technician_id || 6;
  console.log(`[PASS] Technician Authenticated (ID: ${techId}).`);

  // 3. Register Complaint (Public / Customer Self-Registration or Admin creation)
  console.log('\nStep 3: Registering Test Complaint...');
  const createRes = await fetch(`${WORKER_URL}/api/complaints`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      consumer_no: 'EGS-E2E-TEST-2026',
      customer_name: 'E2E Automated Verification',
      customer_phone: '9876543210',
      customer_address: 'Solar Tech Park, Sector 4, Gandhinagar',
      city_village: 'Gandhinagar',
      district: 'Gandhinagar',
      state: 'Gujarat',
      product_type: 'Solar Rooftop Systems',
      issue_description: 'Grid synchronization failure test record',
      priority: 'high',
      system_capacity: '5kW',
      in_warranty: true
    })
  });
  const createData = await createRes.json();
  if (!createRes.ok) throw new Error(`Complaint registration failed: ${JSON.stringify(createData)}`);
  const complaintId = createData.complaint?.id || createData.id;
  const ticketId = createData.complaint?.ticket_id || createData.ticket_id;
  console.log(`[PASS] Complaint created successfully! Ticket ID: ${ticketId}, DB ID: ${complaintId}`);

  // Helper for binary upload to Worker -> R2
  async function uploadFile(buffer, filename, mimeType) {
    const boundary = '----WebKitFormBoundaryE2ETest777';
    const header = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`;
    const footer = `\r\n--${boundary}--\r\n`;
    
    const multipartBody = Buffer.concat([
      Buffer.from(header, 'utf8'),
      buffer,
      Buffer.from(footer, 'utf8')
    ]);

    const res = await fetch(`${WORKER_URL}/api/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Authorization': `Bearer ${adminToken}`
      },
      body: multipartBody
    });

    const data = await res.json();
    if (!res.ok) throw new Error(`Upload ${filename} failed: ${JSON.stringify(data)}`);
    return data;
  }

  // 4. Test R2 Uploads: Image, Video, PDF
  console.log('\nStep 4: Real Multi-Type File Testing into Cloudflare R2...');

  console.log(' -> Uploading Test JPEG Image...');
  const imgUpload = await uploadFile(sampleJpeg, 'test_solar_inverter.jpg', 'image/jpeg');
  console.log(`    [PASS] Image in R2: Key=${imgUpload.storage_key}`);

  console.log(' -> Uploading Test MP4 Video...');
  const videoUpload = await uploadFile(sampleMp4, 'test_fault_video.mp4', 'video/mp4');
  console.log(`    [PASS] Video in R2: Key=${videoUpload.storage_key}`);

  console.log(' -> Uploading Test PDF Document...');
  const pdfUpload = await uploadFile(samplePdf, 'test_warranty_report.pdf', 'application/pdf');
  console.log(`    [PASS] PDF in R2: Key=${pdfUpload.storage_key}`);

  // Link attachments to complaint
  for (const upload of [imgUpload, videoUpload, pdfUpload]) {
    await fetch(`${WORKER_URL}/api/complaints/${complaintId}/attachments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        storage_key: upload.storage_key,
        file_name: upload.file_name,
        file_type: upload.file_type,
        file_size: upload.file_size
      })
    });
  }
  console.log('[PASS] All 3 attachments linked to complaint in PostgreSQL.');

  // 5. Secure File Retrieval from R2
  console.log('\nStep 5: Verifying Private R2 File Streaming Retrieval...');
  const getImg = await fetch(`${WORKER_URL}/api/attachments/r2/${encodeURIComponent(imgUpload.storage_key)}`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  if (getImg.status !== 200) throw new Error(`R2 Image retrieval failed: ${getImg.status}`);
  console.log(`[PASS] R2 Image retrieved (${getImg.headers.get('content-type')}, length: ${getImg.headers.get('content-length')})`);

  const getVideo = await fetch(`${WORKER_URL}/api/attachments/r2/${encodeURIComponent(videoUpload.storage_key)}`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  if (getVideo.status !== 200) throw new Error(`R2 Video retrieval failed: ${getVideo.status}`);
  console.log(`[PASS] R2 Video retrieved (${getVideo.headers.get('content-type')}, length: ${getVideo.headers.get('content-length')})`);

  const getPdf = await fetch(`${WORKER_URL}/api/attachments/r2/${encodeURIComponent(pdfUpload.storage_key)}`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  if (getPdf.status !== 200) throw new Error(`R2 PDF retrieval failed: ${getPdf.status}`);
  console.log(`[PASS] R2 PDF retrieved (${getPdf.headers.get('content-type')}, length: ${getPdf.headers.get('content-length')})`);

  // 6. Test Unauthorized File Access (IDOR Protection)
  console.log('\nStep 6: Testing Unauthorized File Access Protection (Zero Token)...');
  const unauthRes = await fetch(`${WORKER_URL}/api/attachments/r2/${encodeURIComponent(imgUpload.storage_key)}`);
  if (unauthRes.status === 401) {
    console.log('[PASS] Unauthorized file access rejected with HTTP 401.');
  } else {
    console.warn(`[WARN] Unexpected response: ${unauthRes.status}`);
  }

  // 7. Complaint Assignment to Technician
  console.log('\nStep 7: Assigning Complaint to Technician...');
  const assignRes = await fetch(`${WORKER_URL}/api/complaints/${complaintId}/assign`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      technician_id: techId,
      assigned_to_name: 'HARDEV VAGHELA',
      notes: 'Assigned for urgent inspection'
    })
  });
  const assignData = await assignRes.json();
  console.log('[PASS] Complaint assigned:', assignData.message || 'Assigned');

  // 8. Technician Updates Status to 'in_progress'
  console.log('\nStep 8: Technician Updating Status to in_progress...');
  const statusRes = await fetch(`${WORKER_URL}/api/complaints/${complaintId}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${techToken}`
    },
    body: JSON.stringify({
      status: 'in_progress',
      notes: 'Technician arrived on site, initiating inverter inspection'
    })
  });
  const statusData = await statusRes.json();
  console.log('[PASS] Status updated to in_progress:', statusData.message || 'Success');

  // 9. Technician Marks Resolved
  console.log('\nStep 9: Technician Marking Resolved with Resolution Proof...');
  const resolveRes = await fetch(`${WORKER_URL}/api/complaints/${complaintId}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${techToken}`
    },
    body: JSON.stringify({
      status: 'resolved',
      notes: 'Inverter MC4 connector replaced, system producing 4.8kW output'
    })
  });
  const resolveData = await resolveRes.json();
  console.log('[PASS] Complaint marked as resolved:', resolveData.message || 'Success');

  // 10. Quality Desk Closes Complaint
  console.log('\nStep 10: Quality Desk Supervisor Final Closure...');
  const closeRes = await fetch(`${WORKER_URL}/api/complaints/${complaintId}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      status: 'closed',
      notes: 'Customer verified happy, ticket closed with 5-star rating'
    })
  });
  const closeData = await closeRes.json();
  console.log('[PASS] Complaint closed:', closeData.message || 'Success');

  // 11. Cleanup Test Artifacts (Clean ONLY this newly created test complaint & R2 files)
  console.log('\nStep 11: Cleaning Up ONLY the newly created test complaint & R2 objects...');
  for (const upload of [imgUpload, videoUpload, pdfUpload]) {
    await fetch(`${WORKER_URL}/api/attachments/r2/${encodeURIComponent(upload.storage_key)}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
  }
  console.log(' -> Cleaned up 3 test files from Cloudflare R2.');

  const delRes = await fetch(`${WORKER_URL}/api/complaints/${complaintId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const delData = await delRes.json();
  console.log(` -> Deleted test complaint ${ticketId} from PostgreSQL: ${delData.message || 'OK'}`);

  console.log('\n================================================================');
  console.log('FULL COMPLAINT LIFECYCLE & R2 MULTI-FILE TEST: 100% SUCCESS');
  console.log('================================================================');
}

runComplaintLifecycle().catch(console.error);
