import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../db.js';
import { authenticateToken, requireRole, JWT_SECRET } from '../auth.js';

const authRoutes = new Hono();

// POST /api/auth/login
authRoutes.post('/login', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { identifier, email, username, phone, password } = body;
    const loginId = (identifier || username || email || phone || '').trim();
    if (!loginId || !password) {
      return c.json({ error: 'Username/Email and password required' }, 400);
    }

    const cleanDigits = loginId.replace(/[^0-9]/g, '');
    const userRes = await query(
      `SELECT * FROM users 
       WHERE LOWER(email) = LOWER($1) 
          OR LOWER(username) = LOWER($1) 
          OR ($2 != '' AND (phone LIKE '%' || $2 OR phone LIKE $2 || '%'))
       ORDER BY is_active DESC, id DESC`,
      [loginId, cleanDigits.length >= 10 ? cleanDigits.slice(-10) : ''],
      c.env,
      c.executionCtx
    );

    if (userRes.rows.length === 0) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    let user = null;
    let anyActive = false;
    for (const candidate of userRes.rows) {
      if (candidate.is_active !== 0) anyActive = true;
      const valid = await bcrypt.compare(password, candidate.password_hash);
      if (valid) {
        user = candidate;
        break;
      }
    }

    if (!user) {
      return c.json({ error: anyActive ? 'Invalid credentials' : 'Account is deactivated' }, 401);
    }

    if (user.is_active === 0) {
      return c.json({ error: 'Account is deactivated' }, 403);
    }

    let technicianId = null;
    if (user.role === 'technician') {
      const techRes = await query(
        `SELECT id FROM technicians 
         WHERE user_id = $1 
            OR ($2 != '' AND (phone LIKE '%' || $2 OR phone LIKE $2 || '%'))
         ORDER BY id DESC LIMIT 1`,
        [user.id, cleanDigits.length >= 10 ? cleanDigits.slice(-10) : ''],
        c.env,
        c.executionCtx
      );
      technicianId = techRes.rows[0]?.id || null;
      if (technicianId) {
        await query(
          'UPDATE technicians SET user_id = $1 WHERE id = $2 AND (user_id IS NULL OR user_id != $1)',
          [user.id, technicianId],
          c.env,
          c.executionCtx
        ).catch(() => {});
      }
    }

    const secret = c.env?.JWT_SECRET || JWT_SECRET;
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        name: user.name,
        phone: user.phone,
        technician_id: technicianId
      },
      secret,
      { expiresIn: '30d' }
    );

    return c.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        phone: user.phone,
        technician_id: technicianId
      }
    });
  } catch (err) {
    return c.json({ error: 'Internal server error: ' + err.message }, 500);
  }
});

// GET /api/auth/me
authRoutes.get('/me', authenticateToken, async (c) => {
  try {
    const user = c.get('user');
    const userRes = await query(
      'SELECT id, name, username, email, role, phone, is_active FROM users WHERE id = $1',
      [user.id],
      c.env,
      c.executionCtx
    );
    if (userRes.rows.length === 0) return c.json({ error: 'User not found' }, 404);
    return c.json({ user: { ...userRes.rows[0], technician_id: user.technician_id } });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /api/auth/users
authRoutes.get('/users', authenticateToken, async (c) => {
  try {
    const r = await query(
      'SELECT id, name, username, email, role, phone, is_active, created_at FROM users ORDER BY id ASC',
      [],
      c.env,
      c.executionCtx
    );
    return c.json({ users: r.rows });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /api/auth/create-user
authRoutes.post('/create-user', authenticateToken, requireRole('admin'), async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    let { name, email, password, role, phone, username, area_zone, specialization } = body;
    if (!name || !name.trim()) return c.json({ error: 'Full Name is required' }, 400);
    if (!password || password.length < 6) return c.json({ error: 'Password must be at least 6 characters' }, 400);

    const validRoles = ['admin', 'staff', 'technician', 'customer'];
    if (!validRoles.includes(role)) role = 'staff';

    const cleanPhone = (phone || '').replace(/\D/g, '');
    const cleanUsername = (username || '').trim().toLowerCase() || cleanPhone || (email ? email.split('@')[0] : 'user_' + Date.now());

    const existing = await query(
      'SELECT id FROM users WHERE LOWER(username) = LOWER($1) OR ($2 != \'\' AND LOWER(email) = LOWER($2)) LIMIT 1',
      [cleanUsername, email || ''],
      c.env,
      c.executionCtx
    );
    if (existing.rows.length > 0) {
      return c.json({ error: 'User with this username or email already exists' }, 400);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const insUser = await query(
      `INSERT INTO users (name, username, email, password_hash, role, phone, is_active, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 1, CURRENT_TIMESTAMP)
       RETURNING id, name, username, email, role, phone, is_active, created_at`,
      [name.trim(), cleanUsername, email ? email.trim().toLowerCase() : null, passwordHash, role, cleanPhone || null],
      c.env,
      c.executionCtx
    );
    const newUser = insUser.rows[0];

    // Auto-create in technicians table if role is technician
    if (role === 'technician') {
      await query(
        `INSERT INTO technicians (name, phone, area_zone, specialization, is_available, user_id, created_at)
         VALUES ($1, $2, $3, $4, 1, $5, CURRENT_TIMESTAMP)`,
        [name.trim(), cleanPhone, area_zone || 'All Zones', specialization || 'Solar Rooftop & Inverter Systems', newUser.id],
        c.env,
        c.executionCtx
      ).catch(() => {});
    }

    return c.json({ success: true, user: newUser }, 201);
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// PUT /api/auth/users/:id
authRoutes.put('/users/:id', authenticateToken, async (c) => {
  try {
    const id = c.req.param('id');
    const user = c.get('user');
    if (user.role !== 'admin' && String(user.id) !== String(id)) {
      return c.json({ error: 'Unauthorized access' }, 403);
    }

    const body = await c.req.json().catch(() => ({}));
    const { name, email, phone, role, is_active } = body;
    const cleanPhone = (phone || '').replace(/\D/g, '');

    await query(
      `UPDATE users 
       SET name = COALESCE($1, name),
           email = COALESCE($2, email),
           phone = COALESCE($3, phone),
           role = CASE WHEN $4::text IS NOT NULL AND $5 = 'admin' THEN $4 ELSE role END,
           is_active = CASE WHEN $6::int IS NOT NULL AND $5 = 'admin' THEN $6 ELSE is_active END
       WHERE id = $7`,
      [name || null, email || null, cleanPhone || null, role || null, user.role, is_active !== undefined ? Number(is_active) : null, id],
      c.env,
      c.executionCtx
    );

    return c.json({ success: true });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /api/auth/admin-reset-password
authRoutes.post('/admin-reset-password', authenticateToken, requireRole('admin'), async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { user_id, new_password } = body;
    if (!user_id || !new_password || new_password.length < 6) {
      return c.json({ error: 'User ID and new password (min 6 characters) required' }, 400);
    }
    const hash = await bcrypt.hash(new_password, 10);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, user_id], c.env, c.executionCtx);
    return c.json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /api/auth/change-my-password
authRoutes.post('/change-my-password', authenticateToken, async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json().catch(() => ({}));
    const { current_password, new_password } = body;
    if (!current_password || !new_password || new_password.length < 6) {
      return c.json({ error: 'Current password and new password (min 6 characters) required' }, 400);
    }

    const r = await query('SELECT password_hash FROM users WHERE id = $1', [user.id], c.env, c.executionCtx);
    if (r.rows.length === 0) return c.json({ error: 'User not found' }, 404);

    const valid = await bcrypt.compare(current_password, r.rows[0].password_hash);
    if (!valid) return c.json({ error: 'Current password is incorrect' }, 400);

    const hash = await bcrypt.hash(new_password, 10);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, user.id], c.env, c.executionCtx);
    return c.json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// PUT /api/auth/profile
authRoutes.put('/profile', authenticateToken, async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json().catch(() => ({}));
    const { name, email, phone } = body;
    const cleanPhone = (phone || '').replace(/\D/g, '');

    await query(
      `UPDATE users 
       SET name = COALESCE($1, name),
           email = COALESCE($2, email),
           phone = COALESCE($3, phone)
       WHERE id = $4`,
      [name || null, email || null, cleanPhone || null, user.id],
      c.env,
      c.executionCtx
    );

    return c.json({ success: true, message: 'Profile updated' });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// DELETE /api/auth/users/:id
authRoutes.delete('/users/:id', authenticateToken, requireRole('admin'), async (c) => {
  try {
    const id = c.req.param('id');
    await query('UPDATE users SET is_active = 0 WHERE id = $1', [id], c.env, c.executionCtx);
    return c.json({ success: true, message: 'User deactivated' });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

export default authRoutes;
