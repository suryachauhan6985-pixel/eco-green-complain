import { Hono } from 'hono';
import { query } from '../db.js';
import { authenticateToken, optionalAuth } from '../auth.js';
import {
  validateFileMetadata,
  validateFileBinary,
  getMimeTypeFromKey,
  generateStorageKey,
  generateComplaintStorageKey,
  generateWhatsAppStorageKey,
  putR2Object,
  getR2Object,
  deleteR2Object,
  moveR2Object
} from '../r2.js';

const attachmentRoutes = new Hono();

// POST /api/upload - Direct Cloudflare R2 Upload
attachmentRoutes.post('/upload', optionalAuth, async (c) => {
  try {
    const bucket = c.env?.MEDIA_BUCKET;
    if (!bucket) {
      return c.json({ error: 'Cloudflare R2 MEDIA_BUCKET binding is unavailable' }, 500);
    }

    const contentType = c.req.header('content-type') || '';
    let fileBuffer;
    let filename = 'file';
    let mimeType = 'application/octet-stream';
    let complaintId = c.req.query('complaint_id') || 'temp';
    let uploadType = c.req.query('type') || '';
    let contactPhone = c.req.query('phone') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await c.req.parseBody();
      const file = formData.file || formData.attachment || formData.closing_photo;
      if (!file) {
        return c.json({ error: 'No file provided in form data' }, 400);
      }
      filename = file.name || 'document';
      mimeType = file.type || 'application/octet-stream';
      fileBuffer = await file.arrayBuffer();
      if (formData.complaint_id) complaintId = formData.complaint_id;
      if (formData.type) uploadType = formData.type;
      if (formData.phone) contactPhone = formData.phone;
    } else {
      filename = c.req.header('x-filename') || `file_${Date.now()}`;
      mimeType = contentType.split(';')[0].trim() || 'application/octet-stream';
      fileBuffer = await c.req.arrayBuffer();
    }

    if (!fileBuffer || fileBuffer.byteLength === 0) {
      return c.json({ error: 'Empty file payload' }, 400);
    }

    validateFileMetadata(filename, mimeType, fileBuffer.byteLength);
    validateFileBinary(fileBuffer, mimeType, filename);

    let storageKey;
    if (uploadType === 'whatsapp' || contactPhone) {
      const cleanPhone = String(contactPhone || 'general').replace(/\D/g, '') || 'general';
      const uniqueId = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      storageKey = generateWhatsAppStorageKey(cleanPhone, uniqueId, filename);
    } else {
      // Resolve numeric complaint ID to official ticket_id if possible
      if (complaintId && complaintId !== 'temp' && complaintId !== 'general') {
        const compLookup = await query(
          'SELECT ticket_id FROM complaints WHERE id::text = $1 OR ticket_id = $1 LIMIT 1',
          [complaintId],
          c.env,
          c.executionCtx
        ).catch(() => ({ rows: [] }));
        if (compLookup.rows?.[0]?.ticket_id) {
          complaintId = compLookup.rows[0].ticket_id;
        }
      }
      storageKey = generateComplaintStorageKey(complaintId, filename);
    }

    await putR2Object(bucket, storageKey, fileBuffer, mimeType);

    const publicServeUrl = `/api/attachments/r2/${storageKey}`;

    return c.json({
      success: true,
      storage_key: storageKey,
      file_url: publicServeUrl,
      file_name: filename,
      file_type: mimeType,
      file_size: fileBuffer.byteLength
    });
  } catch (err) {
    return c.json({ error: err.message }, 400);
  }
});

// POST /api/complaints/:id/attachments - Save Attachment Metadata
attachmentRoutes.post('/complaints/:id/attachments', optionalAuth, async (c) => {
  try {
    const id = c.req.param('id');
    const compRes = await query(
      'SELECT id, ticket_id FROM complaints WHERE id::text = $1 OR ticket_id = $1 LIMIT 1',
      [id],
      c.env,
      c.executionCtx
    );
    if (compRes.rows.length === 0) return c.json({ error: 'Complaint not found' }, 404);
    const complaintId = compRes.rows[0].id;
    const ticketFolder = compRes.rows[0].ticket_id || compRes.rows[0].id;

    const user = c.get('user');
    // If request has authenticated user, only admin and staff can attach documents to existing complaint
    if (user && user.role !== 'admin' && user.role !== 'staff') {
      return c.json({ error: 'Unauthorized: Only Admin and Staff can attach documents to Issue Description & Diagnostics.' }, 403);
    }
    const uploaderName = user?.name || user?.username || 'Helpdesk';

    const contentType = c.req.header('content-type') || '';
    let body = {};
    let formFiles = [];

    if (contentType.includes('multipart/form-data') || contentType.includes('application/x-www-form-urlencoded')) {
      body = await c.req.parseBody({ all: true }).catch(() => ({}));
      if (body.attachments) {
        formFiles = Array.isArray(body.attachments) ? body.attachments : [body.attachments];
      }
      if (body.file) {
        formFiles.push(body.file);
      }
    } else {
      body = await c.req.json().catch(() => ({}));
    }

    let attachmentsList = [];
    if (body.attachment_urls) {
      try {
        const parsed = typeof body.attachment_urls === 'string'
          ? JSON.parse(body.attachment_urls)
          : body.attachment_urls;
        if (Array.isArray(parsed)) {
          attachmentsList.push(...parsed);
        }
      } catch (_) {}
    }

    if (Array.isArray(body.attachments)) {
      for (const item of body.attachments) {
        if (typeof item === 'object' && item && (item.file_url || item.storage_key)) {
          attachmentsList.push(item);
        }
      }
    }

    // Process any binary files submitted directly via multipart form
    const bucket = c.env?.MEDIA_BUCKET;
    for (const file of formFiles) {
      if (file && typeof file === 'object' && typeof file.arrayBuffer === 'function') {
        try {
          const fileBuffer = await file.arrayBuffer();
          if (fileBuffer && fileBuffer.byteLength > 0 && bucket) {
            const filename = file.name || 'document';
            const mimeType = file.type || 'application/octet-stream';
            validateFileMetadata(filename, mimeType, fileBuffer.byteLength);
            validateFileBinary(fileBuffer, mimeType, filename);
            const storageKey = generateStorageKey(ticketFolder, filename);
            await putR2Object(bucket, storageKey, fileBuffer, mimeType);
            attachmentsList.push({
              file_name: filename,
              file_type: mimeType,
              file_size: fileBuffer.byteLength,
              file_url: `/api/attachments/r2/${storageKey}`,
              storage_key: storageKey
            });
          }
        } catch (fileErr) {
          console.warn('Binary upload to R2 in attachments failed:', fileErr.message);
        }
      }
    }

    const saved = [];
    for (const att of attachmentsList) {
      let fileUrl = att.file_url || (att.storage_key ? `/api/attachments/r2/${att.storage_key}` : '');
      if (!fileUrl && !att.file_name) continue;

      if (fileUrl && fileUrl.includes('complaints/temp/') && bucket && ticketFolder) {
        const oldKey = fileUrl.replace(/^.*\/api\/attachments\/r2\//, '').replace(/^\/+/, '');
        const newKey = oldKey.replace(/^complaints\/temp\//, `complaints/${ticketFolder}/`);
        try {
          const moved = await moveR2Object(bucket, oldKey, newKey);
          if (moved) {
            fileUrl = `/api/attachments/r2/${newKey}`;
          }
        } catch (e) {
          console.error('Failed to relocate temp attachment in R2:', e);
        }
      }

      const targetType = att.attachment_type || body.attachment_type || 'registration';
      const insRes = await query(
        `INSERT INTO complaint_attachments (
          complaint_id, file_name, file_url, file_type, file_data, uploaded_by, attachment_type
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, file_name, file_url, file_type, file_data, uploaded_by, attachment_type, created_at`,
        [
          complaintId,
          att.file_name || 'Document',
          fileUrl,
          att.file_type || 'application/octet-stream',
          fileUrl,
          uploaderName,
          targetType
        ],
        c.env,
        c.executionCtx
      );
      if (insRes.rows.length > 0) {
        saved.push(insRes.rows[0]);
      }
    }

    // Timeline event
    if (saved.length > 0) {
      await query(
        `INSERT INTO complaint_timelines (complaint_id, action, notes, performed_by_name, performed_by_role, notify_customer)
         VALUES ($1, $2, $3, $4, $5, 0)`,
        [
          complaintId,
          'Document Attached',
          `${saved.length} document/photo(s) attached by ${uploaderName}: ${saved.map(s => s.file_name).join(', ')}`,
          uploaderName,
          user?.role || 'staff'
        ],
        c.env,
        c.executionCtx
      ).catch(() => {});
    }

    return c.json({ success: true, attachments: saved });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /api/attachments/r2/* - Secure File Delivery from Cloudflare R2
attachmentRoutes.get('/attachments/r2/:key{.*}', optionalAuth, async (c) => {
  try {
    const bucket = c.env?.MEDIA_BUCKET;
    if (!bucket) return c.text('R2 storage unavailable', 500);

    const rawKey = c.req.param('key') || '';
    const cleanKey = decodeURIComponent(rawKey).replace(/^\/+/, '');
    if (!cleanKey) return c.text('File key required', 400);

    // Path traversal defense
    if (cleanKey.includes('..') || cleanKey.includes('\\')) {
      return c.json({ error: 'Invalid object key' }, 400);
    }

    const user = c.get('user');

    // Access control:
    // If authenticated user (admin, staff, technician, customer): allowed
    // If no token in header or query, verify that key is a legitimate complaint attachment or whatsapp media in PostgreSQL
    if (!user) {
      const matchInDb = await query(
        `SELECT id FROM complaint_attachments 
         WHERE file_url LIKE '%' || $1 OR file_data LIKE '%' || $1
         UNION 
         SELECT id FROM complaints 
         WHERE closing_photo_url LIKE '%' || $1
         UNION
         SELECT id FROM whatsapp_messages
         WHERE media_url LIKE '%' || $1
         LIMIT 1`,
        [cleanKey],
        c.env,
        c.executionCtx
      ).catch(() => ({ rows: [] }));

      if (matchInDb.rows.length === 0) {
        // Also allow if complaintId part of key exists in complaints table
        const keyParts = cleanKey.split('/');
        const folderId = keyParts[1];
        const compExists = folderId && folderId !== 'general' ? await query(
          'SELECT id FROM complaints WHERE id::text = $1 OR ticket_id = $1 LIMIT 1',
          [folderId],
          c.env,
          c.executionCtx
        ).catch(() => ({ rows: [] })) : { rows: [] };

        if (compExists.rows.length === 0) {
          return c.json({ error: 'Unauthorized file access' }, 401);
        }
      }
    }

    const rangeHeader = c.req.header('range');
    let getOptions = {};
    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
      if (match) {
        const start = match[1] !== '' ? parseInt(match[1], 10) : undefined;
        const end = match[2] !== '' ? parseInt(match[2], 10) : undefined;
        if (start !== undefined && end !== undefined) {
          getOptions.range = { offset: start, length: end - start + 1 };
        } else if (start !== undefined) {
          getOptions.range = { offset: start };
        } else if (end !== undefined) {
          getOptions.range = { suffix: end };
        }
      }
    }

    const object = await getR2Object(bucket, cleanKey, getOptions);
    if (!object) {
      // Check if this object belonged to a closed complaint older than 30 days
      const keyParts = cleanKey.split('/');
      const folderId = keyParts[1];
      if (folderId && folderId !== 'general' && folderId !== 'temp') {
        const checkClosed = await query(
          "SELECT ticket_id, status, closed_at, documents_purged FROM complaints WHERE (ticket_id = $1 OR id::text = $1) LIMIT 1",
          [folderId],
          c.env,
          c.executionCtx
        ).catch(() => ({ rows: [] }));
        if (checkClosed.rows.length > 0) {
          const comp = checkClosed.rows[0];
          const isClosed = ['Closed', 'closed'].includes(comp.status);
          const closedDate = comp.closed_at ? new Date(comp.closed_at) : null;
          const isExpired = comp.documents_purged === 1 || (isClosed && closedDate && (Date.now() - closedDate.getTime()) >= 30 * 24 * 60 * 60 * 1000);
          if (isExpired) {
            return c.json({ 
              error: 'This document has been permanently removed from cloud storage because the complaint was closed more than 30 days ago in accordance with data retention policy.',
              purged: true,
              expired: true
            }, 410);
          }
        }
      }
      return c.text('File not found in storage', 404);
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=3600');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Accept-Ranges', 'bytes');

    const mimeType = object.httpMetadata?.contentType || getMimeTypeFromKey(cleanKey);
    headers.set('Content-Type', mimeType);

    const filename = cleanKey.split('/').pop() || 'attachment';
    const isDownload = c.req.query('download') === '1';
    headers.set('Content-Disposition', `${isDownload ? 'attachment' : 'inline'}; filename="${filename}"`);
    headers.set('Access-Control-Allow-Origin', '*');

    if (rangeHeader && object.range) {
      const offset = object.range.offset ?? 0;
      const length = object.range.length ?? (object.size - offset);
      headers.set('Content-Range', `bytes ${offset}-${offset + length - 1}/${object.size}`);
      headers.set('Content-Length', String(length));
      return new Response(object.body, { headers, status: 206 });
    }

    headers.set('Content-Length', String(object.size));
    return new Response(object.body, { headers, status: 200 });
  } catch (err) {
    return c.text('Storage retrieval error: ' + err.message, 500);
  }
});

// POST /api/attachments/sync-temp - Relocate all temp attachments to their complaint ticket folders in R2 and database
attachmentRoutes.post('/sync-temp', authenticateToken, async (c) => {
  try {
    const bucket = c.env?.MEDIA_BUCKET;
    if (!bucket) return c.json({ error: 'R2 storage unavailable' }, 500);

    const res = await query(
      `SELECT a.id, a.complaint_id, a.file_name, a.file_url, c.ticket_id 
       FROM complaint_attachments a
       JOIN complaints c ON a.complaint_id = c.id
       WHERE a.file_url LIKE '%complaints/temp/%'`,
      [],
      c.env,
      c.executionCtx
    );

    const migrated = [];
    for (const row of res.rows) {
      if (!row.ticket_id) continue;
      const oldKey = row.file_url.replace(/^.*\/api\/attachments\/r2\//, '').replace(/^\/+/, '');
      const newKey = oldKey.replace(/^complaints\/temp\//, `complaints/${row.ticket_id}/`);
      
      const moved = await moveR2Object(bucket, oldKey, newKey);
      if (moved) {
        const newUrl = `/api/attachments/r2/${newKey}`;
        await query(
          'UPDATE complaint_attachments SET file_url = $1, file_data = $1 WHERE id = $2',
          [newUrl, row.id],
          c.env,
          c.executionCtx
        );
        migrated.push({ id: row.id, oldKey, newKey, newUrl });
      }
    }

    return c.json({
      success: true,
      migrated_count: migrated.length,
      migrated
    });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// DELETE /api/attachments/r2/* - Direct R2 Object Deletion
attachmentRoutes.delete('/attachments/r2/:key{.*}', authenticateToken, async (c) => {
  try {
    const bucket = c.env?.MEDIA_BUCKET;
    if (!bucket) return c.json({ error: 'R2 storage unavailable' }, 500);
    const key = decodeURIComponent(c.req.param('key') || '');
    if (!key) return c.json({ error: 'File key required' }, 400);

    const user = c.get('user');
    if (!user || (user.role !== 'admin' && user.role !== 'staff')) {
      return c.json({ error: 'Unauthorized to delete storage attachments' }, 403);
    }

    await deleteR2Object(bucket, key);
    return c.json({ success: true, message: 'R2 object deleted' });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});


// GET /api/attachments/:id - Backward Compatibility Endpoint
attachmentRoutes.get('/attachments/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const attRes = await query(
      'SELECT * FROM complaint_attachments WHERE id::text = $1 LIMIT 1',
      [id],
      c.env,
      c.executionCtx
    );
    if (attRes.rows.length === 0) return c.text('Attachment not found', 404);

    const att = attRes.rows[0];
    const fileUrl = att.file_url || att.file_data || '';

    // If R2 storage key or path
    if (fileUrl.includes('complaints/')) {
      const match = fileUrl.match(/(complaints\/[^\s?#]+)/);
      if (match && c.env?.MEDIA_BUCKET) {
        const r2Obj = await getR2Object(c.env.MEDIA_BUCKET, match[1]);
        if (r2Obj) {
          const headers = new Headers();
          r2Obj.writeHttpMetadata(headers);
          headers.set('Cache-Control', 'private, max-age=86400');
          return new Response(r2Obj.body, { headers });
        }
      }
    }

    // If external URL (e.g. Supabase Storage), redirect
    if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) {
      return c.redirect(fileUrl, 302);
    }

    // If base64 data
    if (fileUrl.startsWith('data:')) {
      const parts = fileUrl.split(',');
      const mime = parts[0].match(/:(.*?);/)?.[1] || 'application/octet-stream';
      const binary = Uint8Array.from(atob(parts[1]), ch => ch.charCodeAt(0));
      return new Response(binary, {
        headers: {
          'Content-Type': mime,
          'Cache-Control': 'private, max-age=86400'
        }
      });
    }

    return c.text('Attachment format unrecognized', 404);
  } catch (err) {
    return c.text('Attachment error: ' + err.message, 500);
  }
});

// DELETE /api/attachments/:id
attachmentRoutes.delete('/attachments/:id', authenticateToken, async (c) => {
  try {
    const user = c.get('user');
    if (!user || (user.role !== 'admin' && user.role !== 'staff')) {
      return c.json({ error: 'Unauthorized: Only Admin and Staff can delete documents from Issue Description & Diagnostics.' }, 403);
    }

    const id = c.req.param('id');
    const attRes = await query('SELECT * FROM complaint_attachments WHERE id::text = $1', [id], c.env, c.executionCtx);
    if (!attRes.rows.length) return c.json({ error: 'Attachment not found' }, 404);

    const att = attRes.rows[0];
    if (att.complaint_id) {
      const compRes = await query('SELECT status FROM complaints WHERE id = $1', [att.complaint_id], c.env, c.executionCtx);
      if (compRes.rows.length && ['Resolved', 'Closed'].includes(compRes.rows[0].status)) {
        return c.json({ error: `Attachments cannot be deleted from a ${compRes.rows[0].status} complaint.` }, 400);
      }
    }

    // If stored in R2, delete object
    if (att.file_url && att.file_url.includes('complaints/') && c.env?.MEDIA_BUCKET) {
      const match = att.file_url.match(/(complaints\/[^\s?#]+)/);
      if (match) {
        await deleteR2Object(c.env.MEDIA_BUCKET, match[1]).catch(() => {});
      }
    }

    await query('DELETE FROM complaint_attachments WHERE id::text = $1', [id], c.env, c.executionCtx);
    return c.json({ success: true, message: 'Attachment deleted' });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

export default attachmentRoutes;
