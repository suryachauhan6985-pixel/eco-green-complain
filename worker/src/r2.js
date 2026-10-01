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

export function generateStorageKey(complaintId, filename = 'attachment') {
  const ext = (filename.split('.').pop() || 'bin').toLowerCase();
  const cleanBase = filename
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 30);
  const uniqueId = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const folder = complaintId ? `complaints/${complaintId}` : 'complaints/general';
  return `${folder}/${uniqueId}_${cleanBase}.${ext}`;
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

export async function getR2Object(bucket, key) {
  if (!bucket) throw new Error('Cloudflare R2 MEDIA_BUCKET binding is missing.');
  return await bucket.get(key);
}

export async function deleteR2Object(bucket, key) {
  if (!bucket) throw new Error('Cloudflare R2 MEDIA_BUCKET binding is missing.');
  return await bucket.delete(key);
}
