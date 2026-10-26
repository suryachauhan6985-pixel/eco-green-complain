import jwt from 'jsonwebtoken';

export const JWT_SECRET = 'ecogreen_solar_cms_secret_key_2026';

export async function authenticateToken(c, next) {
  const authHeader = c.req.header('authorization');
  let token = authHeader && authHeader.split(' ')[1];

  // Restrict query token parameter strictly to export and streaming endpoints where custom headers cannot be passed
  if (!token) {
    const path = c.req.path || '';
    if (path.includes('/export-csv') || path.includes('/attachments/')) {
      token = c.req.query('token');
    }
  }

  if (!token) return c.json({ error: 'Access token required' }, 401);

  try {
    const secret = c.env?.JWT_SECRET || (c.env?.ENVIRONMENT === 'production' ? null : JWT_SECRET);
    if (!secret) {
      return c.json({ error: 'JWT_SECRET is not configured on this server' }, 500);
    }
    const user = jwt.verify(token, secret);
    c.set('user', user);
    await next();
  } catch (err) {
    return c.json({ error: 'Invalid or expired token' }, 403);
  }
}

export async function optionalAuth(c, next) {
  const authHeader = c.req.header('authorization');
  let token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    const path = c.req.path || '';
    if (path.includes('/export-csv') || path.includes('/attachments/')) {
      token = c.req.query('token');
    }
  }

  if (token) {
    try {
      const secret = c.env?.JWT_SECRET || (c.env?.ENVIRONMENT === 'production' ? null : JWT_SECRET);
      if (secret) {
        const user = jwt.verify(token, secret);
        c.set('user', user);
      }
    } catch (_) {}
  }
  await next();
}

export function requireRole(...roles) {
  return async (c, next) => {
    const user = c.get('user');
    if (!user || !roles.includes(user.role)) {
      return c.json({ error: 'Unauthorized access' }, 403);
    }
    await next();
  };
}
