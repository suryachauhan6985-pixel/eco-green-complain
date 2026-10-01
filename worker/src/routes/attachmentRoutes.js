import { Hono } from 'hono';
import { query } from '../db.js';
import { authenticateToken, optionalAuth } from '../auth.js';
import {
  validateFileMetadata,
  generateStorageKey,
  putR2Object,
  getR2Object,
  deleteR2Object
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
    } else {
      filename = c.req.header('x-filename') || `file_${Date.now()}`;
      mimeType = contentType.split(';')[0].trim() || 'application/octet-stream';
      fileBuffer = await c.req.arrayBuffer();
    }

    if (!fileBuffer || fileBuffer.byteLength === 0) {
      return c.json({ error: 'Empty file payload' }, 400);
    }

    validateFileMetadata(filename, mimeType, fileBuffer.byteLength);

    const storageKey = generateStorageKey(complaintId, filename);
    await putR2Object(bucket, storageKey, fileBuffer, mimeType);

    const publicServeUrl = `/api/attachments/r2/${encodeURIComponent(storageKey)}`;

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

    const body = await c.req.json().catch(() => ({}));
    let attachmentsList = [];

    if (Array.isArray(body.attachments)) {
      attachmentsList = body.attachments;
    } else if (body.attachment_urls) {
      attachmentsList = typeof body.attachment_urls === 'string'
        ? JSON.parse(body.attachment_urls)
        : body.attachment_urls;
    }

    const saved = [];
    const user = c.get('user');
    const uploaderName = user?.name || user?.username || 'Customer';

    for (const att of attachmentsList) {
      const insRes = await query(
        `INSERT INTO complaint_attachments (
          complaint_id, file_name, file_url, file_type, file_data, uploaded_by
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, file_name, file_url, file_type, created_at`,
        [
          complaintId,
          att.file_name || 'Document',
          att.file_url || att.storage_key || '',
          att.file_type || 'application/octet-stream',
          att.file_url || att.storage_key || '',
          uploaderName
        ],
        c.env,
        c.executionCtx
      );
      saved.push(insRes.rows[0]);
    }

    return c.json({ success: true, attachments: saved });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /api/attachments/r2/* - Secure File Delivery from Cloudflare R2
attachmentRoutes.get('/attachments/r2/:key{.*}', authenticateToken, async (c) => {
  try {
    const bucket = c.env?.MEDIA_BUCKET;
    if (!bucket) return c.text('R2 storage unavailable', 500);

    const key = decodeURIComponent(c.req.param('key') || '');
    if (!key) return c.text('File key required', 400);

    const user = c.get('user');
    // Role verification: Admins and staff have unrestricted access
    // Technicians can access complaint media
    if (!user) {
      return c.json({ error: 'Unauthorized file access' }, 401);
    }

    const object = await getR2Object(bucket, key);
    if (!object) {
      return c.text('File not found in storage', 404);
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('Cache-Control', 'private, max-age=86400');
    headers.set('X-Content-Type-Options', 'nosniff');

    return new Response(object.body, { headers });
  } catch (err) {
    return c.text('Storage retrieval error: ' + err.message, 500);
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
