/**
 * Lightweight AWS SigV4 Presigner using native Web Crypto (SubtleCrypto)
 * Fully compatible with Cloudflare Workers runtime (Zero npm dependencies)
 */

async function hmacSha256(key, message) {
  const cryptoKey = typeof key === 'string'
    ? await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    : key;
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, typeof message === 'string' ? new TextEncoder().encode(message) : message);
  return signature;
}

async function sha256Hex(data) {
  const buffer = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function toHex(arrayBuffer) {
  return Array.from(new Uint8Array(arrayBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function getSigningKey(secretKey, dateStr, region, service) {
  const kDate = await crypto.subtle.importKey('raw', await hmacSha256('AWS4' + secretKey, dateStr), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const kRegion = await crypto.subtle.importKey('raw', await hmacSha256(kDate, region), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const kService = await crypto.subtle.importKey('raw', await hmacSha256(kRegion, service), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const kSigning = await crypto.subtle.importKey('raw', await hmacSha256(kService, 'aws4_request'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return kSigning;
}

function formatDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  const yyyy = date.getUTCFullYear();
  const mm = pad(date.getUTCMonth() + 1);
  const dd = pad(date.getUTCDate());
  const hh = pad(date.getUTCHours());
  const min = pad(date.getUTCMinutes());
  const ss = pad(date.getUTCSeconds());
  return {
    dateStamp: `${yyyy}${mm}${dd}`,
    amzDate: `${yyyy}${mm}${dd}T${hh}${min}${ss}Z`
  };
}

/**
 * Generate AWS SigV4 Presigned URL for Cloudflare R2
 * 
 * @param {Object} options
 * @param {string} options.accountId - Cloudflare Account ID
 * @param {string} options.accessKeyId - R2 S3 Access Key ID
 * @param {string} options.secretAccessKey - R2 S3 Secret Access Key
 * @param {string} options.bucket - R2 Bucket Name
 * @param {string} options.key - Object key (path)
 * @param {string} options.method - HTTP Method (e.g. 'PUT')
 * @param {Object} [options.queryParams] - Extra query parameters (e.g. { partNumber: 1, uploadId: 'xyz' })
 * @param {Object} [options.headers] - Required headers to sign (e.g. { 'content-type': 'video/mp4' })
 * @param {number} [options.expiresInSeconds=1800] - URL validity in seconds (default: 30 minutes)
 * @returns {Promise<string>} Fully signed presigned URL
 */
export async function getR2PresignedUrl({
  accountId,
  accessKeyId,
  secretAccessKey,
  bucket,
  key,
  method = 'PUT',
  queryParams = {},
  headers = {},
  expiresInSeconds = 1800
}) {
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !key) {
    throw new Error('Missing required credentials or parameters for R2 presigned URL.');
  }

  const host = `${accountId}.r2.cloudflarestorage.com`;
  const region = 'auto';
  const service = 's3';
  const now = new Date();
  const { dateStamp, amzDate } = formatDate(now);
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;

  // Encode path segments safely
  const encodedKey = key.split('/').map(segment => encodeURIComponent(segment)).join('/');
  const canonicalUri = `/${bucket}/${encodedKey}`;

  // Headers to sign (must include host)
  const canonicalHeadersObj = {
    host: host.toLowerCase()
  };
  for (const [hName, hVal] of Object.entries(headers)) {
    canonicalHeadersObj[hName.toLowerCase()] = String(hVal).trim();
  }

  const sortedHeaderKeys = Object.keys(canonicalHeadersObj).sort();
  const canonicalHeaders = sortedHeaderKeys.map(k => `${k}:${canonicalHeadersObj[k]}\n`).join('');
  const signedHeaders = sortedHeaderKeys.join(';');

  // Query parameters for presigning
  const allQueryParams = {
    ...queryParams,
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKeyId}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresInSeconds),
    'X-Amz-SignedHeaders': signedHeaders
  };

  const sortedQueryKeys = Object.keys(allQueryParams).sort();
  const canonicalQueryString = sortedQueryKeys
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(allQueryParams[k])}`)
    .join('&');

  const payloadHash = 'UNSIGNED-PAYLOAD';

  const canonicalRequest = [
    method.toUpperCase(),
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join('\n');

  const hashedCanonicalRequest = await sha256Hex(canonicalRequest);

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    hashedCanonicalRequest
  ].join('\n');

  const signingKey = await getSigningKey(secretAccessKey, dateStamp, region, service);
  const signatureBuffer = await crypto.subtle.sign('HMAC', signingKey, new TextEncoder().encode(stringToSign));
  const signatureHex = toHex(signatureBuffer);

  return `https://${host}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signatureHex}`;
}
