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
