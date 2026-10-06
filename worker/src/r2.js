export const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/3gpp',
  'video/x-msvideo',
  'video/mpeg'
]);

export const DANGEROUS_EXTENSIONS = new Set([
  'html', 'htm', 'svg', 'js', 'exe', 'bat', 'cmd', 'sh', 'php', 'py', 'pl', 'jsp', 'cgi', 'vbs'
]);

export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export function validateFileMetadata(filename = '', mimetype = '', size = 0) {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  const mime = (mimetype || '').toLowerCase();

  if (DANGEROUS_EXTENSIONS.has(ext)) {
    throw new Error(`File extension .${ext} is prohibited for security.`);
  }

  if (!ALLOWED_MIME_TYPES.has(mime) && !mime.startsWith('image/') && !mime.startsWith('video/')) {
    throw new Error('Invalid file type. Only photos (JPEG, PNG, WebP), PDF documents, and videos (MP4, WebM, MOV, 3GP) are permitted.');
  }

  if (size > MAX_FILE_SIZE) {
    throw new Error(`File size exceeds the 50MB maximum limit.`);
  }

  return { ext, mime };
}

export function validateFileBinary(buffer, mimeType = '', filename = '') {
  if (!buffer || buffer.byteLength === 0) {
    throw new Error('Empty file content payload.');
  }

  const bytes = new Uint8Array(buffer.slice(0, 16));
  const mime = (mimeType || '').toLowerCase();
  const ext = (filename.split('.').pop() || '').toLowerCase();

  // JPEG magic bytes: FF D8 FF
  if (mime === 'image/jpeg' || ext === 'jpg' || ext === 'jpeg') {
    if (bytes.length < 3 || bytes[0] !== 0xFF || bytes[1] !== 0xD8 || bytes[2] !== 0xFF) {
      throw new Error('Corrupted or invalid JPEG image: missing JPEG file signature (FF D8 FF).');
    }
  }

  // PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
  if (mime === 'image/png' || ext === 'png') {
    if (bytes.length < 8 || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4E || bytes[3] !== 0x47) {
      throw new Error('Corrupted or invalid PNG image: missing PNG file signature.');
    }
  }

  // PDF magic bytes: %PDF- (25 50 44 46 2D)
  if (mime === 'application/pdf' || ext === 'pdf') {
    if (bytes.length < 5 || bytes[0] !== 0x25 || bytes[1] !== 0x50 || bytes[2] !== 0x44 || bytes[3] !== 0x46 || bytes[4] !== 0x2D) {
      throw new Error('Corrupted or invalid PDF document: missing %PDF- file signature.');
    }
  }

  // WebP magic bytes: RIFF....WEBP
  if (mime === 'image/webp' || ext === 'webp') {
    if (bytes.length < 12 || bytes[0] !== 0x52 || bytes[1] !== 0x49 || bytes[2] !== 0x46 || bytes[3] !== 0x46) {
      throw new Error('Corrupted or invalid WebP image: missing RIFF header.');
    }
  }

  return true;
}

export function getMimeTypeFromKey(key = '') {
  const ext = (key.split('.').pop() || '').toLowerCase();
  const map = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    pdf: 'application/pdf',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    '3gp': 'video/3gpp',
    avi: 'video/x-msvideo'
  };
  return map[ext] || 'application/octet-stream';
}

export function generateStorageKey(complaintIdentifier, filename = 'attachment') {
  return generateComplaintStorageKey(complaintIdentifier, filename);
}

export function generateComplaintStorageKey(ticketId, filename = 'attachment') {
  const ext = (filename.split('.').pop() || 'bin').toLowerCase();
  const cleanBase = filename
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 30);
  const uniqueId = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const folder = ticketId ? `complaints/${String(ticketId).trim()}` : 'complaints/general';
  return `${folder}/${uniqueId}_${cleanBase}.${ext}`;
}

export function generateWhatsAppStorageKey(contactPhone, mediaId, filename = '') {
  const cleanPhone = String(contactPhone || 'unknown').replace(/\D/g, '');
  const ext = filename ? (filename.split('.').pop() || '').toLowerCase() : '';
  const suffix = ext ? `.${ext}` : '';
  return `whatsapp_media/${cleanPhone}/${mediaId}${suffix}`;
}

export async function putR2Object(bucket, key, data, contentType) {
  if (!bucket) throw new Error('Cloudflare R2 MEDIA_BUCKET binding is missing.');
  return await bucket.put(key, data, {
    httpMetadata: {
      contentType: contentType || 'application/octet-stream',
      cacheControl: 'private, max-age=86400'
    }
  });
}

export async function getR2Object(bucket, key, options) {
  if (!bucket) throw new Error('Cloudflare R2 MEDIA_BUCKET binding is missing.');
  return await bucket.get(key, options);
}

export async function deleteR2Object(bucket, key) {
  if (!bucket) throw new Error('Cloudflare R2 MEDIA_BUCKET binding is missing.');
  return await bucket.delete(key);
}

/**
 * Recursively list and delete all objects in Cloudflare R2 matching a prefix (e.g. complaints/TKT-01/ or whatsapp_media/9198765/)
 */
export async function deleteR2Prefix(bucket, prefix) {
  if (!bucket || !prefix) return 0;
  let deletedCount = 0;
  let cursor = undefined;

  do {
    const listRes = await bucket.list({ prefix, cursor, limit: 1000 }).catch(err => {
      console.warn(`[deleteR2Prefix Warn] List failed for prefix ${prefix}:`, err.message);
      return null;
    });

    if (!listRes || !listRes.objects || listRes.objects.length === 0) {
      break;
    }

    const keys = listRes.objects.map(o => o.key);
    await Promise.all(keys.map(k => bucket.delete(k).catch(() => {})));
    deletedCount += keys.length;

    cursor = listRes.truncated ? listRes.cursor : undefined;
  } while (cursor);

  return deletedCount;
}

export async function listR2Keys(bucket, prefix, limit = 100) {
  if (!bucket) return [];
  const listRes = await bucket.list({ prefix, limit }).catch(() => null);
  return (listRes?.objects || []).map(o => o.key);
}

export async function moveR2Object(bucket, oldKey, newKey) {
  if (!bucket) throw new Error('Cloudflare R2 MEDIA_BUCKET binding is missing.');
  if (oldKey === newKey) return true;
  const obj = await bucket.get(oldKey);
  if (!obj) return false;
  await bucket.put(newKey, obj.body, {
    httpMetadata: obj.httpMetadata,
    customMetadata: obj.customMetadata
  });
  await bucket.delete(oldKey).catch(() => {});
  return true;
}


