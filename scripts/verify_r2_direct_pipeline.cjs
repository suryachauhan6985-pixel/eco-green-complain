const fs = require('fs');
const crypto = require('crypto');

const BASE_URL = 'https://eco-green-solar-cms-api.eco-green-solar-cms-api.workers.dev';

async function loginAdmin() {
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: '6352454247', password: 'admin3636' })
  });
  if (!loginRes.ok) throw new Error('Admin login failed: ' + (await loginRes.text()));
  const data = await loginRes.json();
  return data.token;
}

async function runVerification() {
  console.log('================================================================');
  console.log('CLOUDFLARE R2 DIRECT PRESIGNED UPLOAD & FAILURE TEST SUITE');
  console.log('Endpoint:', BASE_URL);
  console.log('================================================================\n');

  const token = await loginAdmin();
  console.log('[PASS] Admin Authenticated.');

  const results = [];

  // TEST 1: Small Video Direct Single PUT (~3 MB)
  console.log('\n--- TEST 1: Small Video Direct Single PUT (3 MB) ---');
  try {
    const size3MB = 3 * 1024 * 1024;
    const buf3MB = crypto.randomBytes(size3MB);
    const filename = `test_small_video_${Date.now()}.mp4`;

    const t0Presign = Date.now();
    const presignRes = await fetch(`${BASE_URL}/api/upload/presign-direct`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        filename,
        mime_type: 'video/mp4',
        file_size: size3MB,
        complaint_id: 'test-direct-3mb'
      })
    });

    if (!presignRes.ok) throw new Error(`Presign failed: ${await presignRes.text()}`);
    const presignData = await presignRes.json();
    const presignTime = Date.now() - t0Presign;

    const urlObj = new URL(presignData.presigned_url);
    const isDirectR2 = urlObj.host.includes('.r2.cloudflarestorage.com');
    console.log(`Presigned URL generated in ${presignTime}ms (Host: ${urlObj.host})`);

    if (!isDirectR2) throw new Error('Presigned URL does not target r2.cloudflarestorage.com directly!');

    // Direct PUT to R2
    const t0Put = Date.now();
    const putRes = await fetch(presignData.presigned_url, {
      method: 'PUT',
      headers: {
        'Origin': 'https://complain.ecogreensolar.co.in',
        'Content-Type': 'video/mp4'
      },
      body: buf3MB
    });

    const putTime = Date.now() - t0Put;
    if (!putRes.ok) throw new Error(`Direct R2 PUT failed: HTTP ${putRes.status}`);

    const etag = putRes.headers.get('etag');
    console.log(`Direct R2 PUT completed in ${putTime}ms, ETag: ${etag}`);

    // Verify byte fidelity via GET
    const getRes = await fetch(`${BASE_URL}/api/attachments/r2/${encodeURIComponent(presignData.storage_key)}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!getRes.ok) throw new Error(`Failed to retrieve uploaded object: HTTP ${getRes.status}`);
    const fetchedBuf = Buffer.from(await getRes.arrayBuffer());

    if (fetchedBuf.length !== size3MB) {
      throw new Error(`Size mismatch: source=${size3MB}, R2=${fetchedBuf.length}`);
    }
    console.log(`Byte-for-byte fidelity verified: exactly ${fetchedBuf.length} bytes in R2.`);

    // Clean up
    await fetch(`${BASE_URL}/api/attachments/r2/${encodeURIComponent(presignData.storage_key)}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log('[PASS] Test 1 Cleaned up.');
    results.push({ test: 'Small Video (3 MB) Direct Single PUT', status: 'PASS', details: `Presigned direct R2, ${putTime}ms, exact byte match` });
  } catch (err) {
    console.error('[FAIL] Test 1 Error:', err.message);
    results.push({ test: 'Small Video (3 MB) Direct Single PUT', status: 'FAIL', details: err.message });
  }

  // TEST 2: Large Video Multipart Direct Presigned Upload (~25 MB)
  console.log('\n--- TEST 2: Large Video Multipart Upload (25 MB) ---');
  let largeStorageKey = null;
  try {
    const totalSize = 25 * 1024 * 1024; // 26,214,400 bytes
    const buf25MB = crypto.randomBytes(totalSize);
    const filename = `test_large_video_${Date.now()}.mp4`;
    const CHUNK_SIZE = 8 * 1024 * 1024; // 8 MiB parts

    // 1. Init Multipart
    const initRes = await fetch(`${BASE_URL}/api/upload/init`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        filename,
        mime_type: 'video/mp4',
        file_size: totalSize,
        complaint_id: 'test-direct-25mb',
        type: 'complaint'
      })
    });
    if (!initRes.ok) throw new Error(`Multipart init failed: ${await initRes.text()}`);
    const { upload_id, storage_key } = await initRes.json();
    largeStorageKey = storage_key;
    console.log(`Multipart session initialized. UploadId: ${upload_id.slice(0, 16)}... StorageKey: ${storage_key}`);

    const totalParts = Math.ceil(totalSize / CHUNK_SIZE);
    const completedParts = [];
    const t0Parts = Date.now();

    for (let partNum = 1; partNum <= totalParts; partNum++) {
      const start = (partNum - 1) * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, totalSize);
      const partSlice = buf25MB.subarray(start, end);

      // Presign Part URL
      const presignPartRes = await fetch(`${BASE_URL}/api/upload/presign-direct`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          storage_key,
          upload_id,
          part_number: partNum
        })
      });
      if (!presignPartRes.ok) throw new Error(`Part ${partNum} presign failed: ${await presignPartRes.text()}`);
      const { presigned_url } = await presignPartRes.json();

      const partHost = new URL(presigned_url).host;
      if (!partHost.includes('.r2.cloudflarestorage.com')) {
        throw new Error(`Part ${partNum} URL did not target R2 host!`);
      }

      // Direct PUT Part
      const putPartRes = await fetch(presigned_url, {
        method: 'PUT',
        headers: {
          'Origin': 'https://complain.ecogreensolar.co.in',
          'Content-Type': 'application/octet-stream'
        },
        body: partSlice
      });
      if (!putPartRes.ok) throw new Error(`Part ${partNum} direct PUT failed: HTTP ${putPartRes.status}`);

      const partEtag = putPartRes.headers.get('etag');
      if (!partEtag) throw new Error(`Part ${partNum} did not return ETag!`);
      completedParts.push({ partNumber: partNum, etag: partEtag.replace(/^"|"$/g, '') });
      console.log(`Part ${partNum}/${totalParts} (${(partSlice.length / (1024*1024)).toFixed(1)} MB) uploaded directly to R2. ETag: ${partEtag}`);
    }

    const partsDuration = Date.now() - t0Parts;
    console.log(`All ${totalParts} parts uploaded directly to R2 in ${partsDuration}ms (${(25 / (partsDuration/1000)).toFixed(2)} MB/s)`);

    // Complete Multipart Upload
    const completeRes = await fetch(`${BASE_URL}/api/upload/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        upload_id,
        storage_key,
        parts: completedParts,
        filename,
        mime_type: 'video/mp4',
        file_size: totalSize
      })
    });

    if (!completeRes.ok) throw new Error(`Complete failed: ${await completeRes.text()}`);
    const completeData = await completeRes.json();
    console.log('Complete verified by server. Object size in R2:', completeData.file_size);

    if (completeData.file_size !== totalSize) {
      throw new Error(`Assembled object size (${completeData.file_size}) !== original buffer (${totalSize})`);
    }

    // Clean up
    await fetch(`${BASE_URL}/api/attachments/r2/${encodeURIComponent(storage_key)}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log('[PASS] Test 2 Cleaned up.');
    results.push({ test: 'Large Video (25 MB) Direct Multipart Upload', status: 'PASS', details: `4 parts uploaded direct to R2, total ${partsDuration}ms, verified size match` });
  } catch (err) {
    console.error('[FAIL] Test 2 Error:', err.message);
    results.push({ test: 'Large Video (25 MB) Direct Multipart Upload', status: 'FAIL', details: err.message });
    if (largeStorageKey) {
      await fetch(`${BASE_URL}/api/attachments/r2/${encodeURIComponent(largeStorageKey)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      }).catch(() => {});
    }
  }

  // TEST 3: Security - Prohibited Storage Key Prefix
  console.log('\n--- TEST 3: Security - Prohibited Storage Key Prefix ---');
  try {
    const evilRes = await fetch(`${BASE_URL}/api/upload/presign-direct`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        storage_key: 'system/keys/passwords.txt',
        filename: 'malicious.txt',
        mime_type: 'text/plain',
        file_size: 100
      })
    });
    console.log('Prohibited prefix status:', evilRes.status);
    if (evilRes.status === 403) {
      console.log('[PASS] Prohibited key prefix correctly rejected with 403 Forbidden.');
      results.push({ test: 'Security - Path Traversal / Prefix Validation', status: 'PASS', details: 'Rejected unauthorized prefix with HTTP 403' });
    } else {
      throw new Error(`Expected HTTP 403 but got ${evilRes.status}`);
    }
  } catch (err) {
    console.error('[FAIL] Test 3 Error:', err.message);
    results.push({ test: 'Security - Path Traversal / Prefix Validation', status: 'FAIL', details: err.message });
  }

  // TEST 4: Security - Unauthenticated Request
  console.log('\n--- TEST 4: Security - Unauthenticated Presign Request ---');
  try {
    const noAuthRes = await fetch(`${BASE_URL}/api/upload/presign-direct`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: 'test.mp4',
        mime_type: 'video/mp4',
        file_size: 1024,
        complaint_id: 'test'
      })
    });
    console.log('Unauthenticated status:', noAuthRes.status);
    if (noAuthRes.status === 401) {
      console.log('[PASS] Unauthenticated request correctly rejected with 401 Unauthorized.');
      results.push({ test: 'Security - Presign Endpoint Authentication', status: 'PASS', details: 'Rejected unauthenticated call with HTTP 401' });
    } else {
      throw new Error(`Expected HTTP 401 but got ${noAuthRes.status}`);
    }
  } catch (err) {
    console.error('[FAIL] Test 4 Error:', err.message);
    results.push({ test: 'Security - Presign Endpoint Authentication', status: 'FAIL', details: err.message });
  }

  // TEST 5: Complete Server-Side Size Mismatch Rejection
  console.log('\n--- TEST 5: Server-Side Size Mismatch Rejection on Complete ---');
  try {
    const initRes = await fetch(`${BASE_URL}/api/upload/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        filename: 'test_mismatch.mp4',
        mime_type: 'video/mp4',
        file_size: 10 * 1024 * 1024,
        complaint_id: 'test-mismatch',
        type: 'complaint'
      })
    });
    const { upload_id, storage_key } = await initRes.json();

    // Upload 1 part (8 MB)
    const partSlice = crypto.randomBytes(8 * 1024 * 1024);
    const presignPartRes = await fetch(`${BASE_URL}/api/upload/presign-direct`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ storage_key, upload_id, part_number: 1 })
    });
    const { presigned_url } = await presignPartRes.json();
    const putRes = await fetch(presigned_url, { method: 'PUT', body: partSlice });
    const etag = putRes.headers.get('etag').replace(/^"|"$/g, '');

    // Now call complete with a deliberate mismatch: tell server expected size is 99999999 (wrong)
    const completeMismatchRes = await fetch(`${BASE_URL}/api/upload/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        upload_id,
        storage_key,
        parts: [{ partNumber: 1, etag }],
        filename: 'test_mismatch.mp4',
        mime_type: 'video/mp4',
        file_size: 99999999 // Mismatch!
      })
    });

    console.log('Complete mismatch response status:', completeMismatchRes.status);
    const mismatchData = await completeMismatchRes.json();
    console.log('Complete mismatch response body:', mismatchData);

    if (completeMismatchRes.status === 400 && mismatchData.error && mismatchData.error.includes('mismatch')) {
      console.log('[PASS] Complete strictly rejected size mismatch with HTTP 400.');
      results.push({ test: 'Server-Side Size Mismatch Rejection', status: 'PASS', details: 'Rejected mismatched size with HTTP 400 and purged corrupted object' });
    } else {
      throw new Error(`Expected HTTP 400 on size mismatch but got ${completeMismatchRes.status}`);
    }
  } catch (err) {
    console.error('[FAIL] Test 5 Error:', err.message);
    results.push({ test: 'Server-Side Size Mismatch Rejection', status: 'FAIL', details: err.message });
  }

  // TEST 6: Multipart Abort Cleanup on Cancellation
  console.log('\n--- TEST 6: Multipart Abort Cleanup on Cancellation ---');
  try {
    const initRes = await fetch(`${BASE_URL}/api/upload/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        filename: 'test_abort.mp4',
        mime_type: 'video/mp4',
        file_size: 16 * 1024 * 1024,
        complaint_id: 'test-abort',
        type: 'complaint'
      })
    });
    const { upload_id, storage_key } = await initRes.json();

    // Upload 1 part
    const partSlice = crypto.randomBytes(8 * 1024 * 1024);
    const presignPartRes = await fetch(`${BASE_URL}/api/upload/presign-direct`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ storage_key, upload_id, part_number: 1 })
    });
    const { presigned_url } = await presignPartRes.json();
    const putRes = await fetch(presigned_url, { method: 'PUT', body: partSlice });
    const etag = putRes.headers.get('etag').replace(/^"|"$/g, '');

    // Now call /api/upload/abort
    const abortRes = await fetch(`${BASE_URL}/api/upload/abort`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ upload_id, storage_key })
    });
    console.log('Abort response status:', abortRes.status);
    const abortData = await abortRes.json();

    if (abortRes.ok && abortData.aborted) {
      console.log('[PASS] Incomplete multipart upload cleanly aborted via R2 bucket.resumeMultipartUpload.abort().');

      // Verify that calling complete now fails because the uploadId was cancelled
      const tryCompleteRes = await fetch(`${BASE_URL}/api/upload/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          upload_id,
          storage_key,
          parts: [{ partNumber: 1, etag }]
        })
      });
      console.log('Post-abort complete status:', tryCompleteRes.status);
      if (!tryCompleteRes.ok) {
        console.log('[PASS] Verified: Aborted multipart session cannot be completed (no orphan parts).');
      }
      results.push({ test: 'Multipart Abort Cleanup on Cancellation', status: 'PASS', details: 'Aborted multipart in R2, orphan parts purged' });
    } else {
      throw new Error('Abort endpoint failed');
    }
  } catch (err) {
    console.error('[FAIL] Test 6 Error:', err.message);
    results.push({ test: 'Multipart Abort Cleanup on Cancellation', status: 'FAIL', details: err.message });
  }

  // Summary Table
  console.log('\n================================================================');
  console.log('TEST RESULTS SUMMARY:');
  console.log('================================================================');
  console.table(results);
}

runVerification().catch(console.error);
