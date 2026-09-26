const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { JWT_SECRET } = require('../middleware/auth');

async function login(req, res) {
  try {
    const rawIdentifier = (req.body.identifier || req.body.email || req.body.username || '').trim();
    const { password } = req.body;
    if (!rawIdentifier || !password) {
      return res.status(400).json({ error: 'User ID / Username and password are required' });
    }

    const noAt = rawIdentifier.replace(/^@+/, '').trim().toLowerCase();
    const prefix = noAt.split('@')[0].split('.')[0].trim();
    const cleanDigits = rawIdentifier.replace(/\D/g, '');
    const last10Phone = cleanDigits.length >= 10 ? cleanDigits.slice(-10) : '';
    const numericMatch = rawIdentifier.match(/^(?:tech[-_ ]*|staff[-_ ]*|id[-_ ]*|#)?(\d+)$/i);
    const numericId = numericMatch ? parseInt(numericMatch[1], 10) : null;

    const user = db.prepare(`
      SELECT * FROM users 
      WHERE is_active = 1 AND (
        LOWER(username) = ?
        OR LOWER(email) = ?
        OR LOWER(username) = ?
        OR LOWER(email) = ?
        OR LOWER(name) = ?
        OR (? != '' AND (LOWER(username) LIKE ? OR LOWER(username) LIKE ?))
        OR (? != '' AND (LOWER(email) LIKE ? OR LOWER(email) LIKE ?))
        OR (? != '' AND REPLACE(REPLACE(COALESCE(phone, ''), ' ', ''), '+', '') LIKE ?)
        OR (? IS NOT NULL AND id = ?)
        OR (? IS NOT NULL AND id IN (SELECT user_id FROM technicians WHERE id = ?))
        OR id IN (
          SELECT user_id FROM technicians 
          WHERE user_id IS NOT NULL AND (
            LOWER(name) = ?
            OR LOWER(email) = ?
            OR (? != '' AND REPLACE(REPLACE(COALESCE(phone, ''), ' ', ''), '+', '') LIKE ?)
          )
        )
      )
      LIMIT 1
    `).get(
      noAt, noAt,
      rawIdentifier.toLowerCase(), rawIdentifier.toLowerCase(),
      rawIdentifier.toLowerCase(),
      prefix, `${prefix}@%`, `${prefix}.%`,
      prefix, `${prefix}@%`, `${prefix}.%`,
      last10Phone, `%${last10Phone}%`,
      numericId, numericId,
      numericId, numericId,
      rawIdentifier.toLowerCase(),
      noAt,
      last10Phone, `%${last10Phone}%`
    );

    if (!user) {
      return res.status(401).json({ error: 'Invalid User ID or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid User ID or password' });
    }

    // Find technician record if user is technician
    let technicianId = null;
    if (user.role === 'technician') {
      let tech = db.prepare('SELECT id FROM technicians WHERE user_id = ?').get(user.id);
      if (!tech) {
        tech = db.prepare(`
          SELECT id FROM technicians 
          WHERE LOWER(email) = LOWER(?) 
             OR (? != '' AND REPLACE(REPLACE(phone, ' ', ''), '+', '') LIKE ?)
             OR LOWER(name) = LOWER(?)
          LIMIT 1
        `).get(user.email || '', last10Phone, `%${last10Phone}%`, user.name || '');
        if (tech) {
          try {
            db.prepare('UPDATE technicians SET user_id = ? WHERE id = ?').run(user.id, tech.id);
          } catch (_) {}
        }
      }
      if (tech) technicianId = tech.id;
    }

    const token = jwt.sign(
      {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        technicianId
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        phone: user.phone,
        technicianId
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during authentication' });
  }
}

function getMe(req, res) {
  try {
    const user = db.prepare('SELECT id, name, username, email, role, phone, created_at FROM users WHERE id = ?').get(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    let technicianId = null;
    if (user.role === 'technician') {
      let tech = db.prepare('SELECT id FROM technicians WHERE user_id = ?').get(user.id);
      if (!tech) {
        tech = db.prepare(`
          SELECT id FROM technicians 
          WHERE LOWER(email) = LOWER(?) 
             OR LOWER(name) = LOWER(?)
          LIMIT 1
        `).get(user.email || '', user.name || '');
        if (tech) {
          try {
            db.prepare('UPDATE technicians SET user_id = ? WHERE id = ?').run(user.id, tech.id);
          } catch (_) {}
        }
      }
      if (tech) technicianId = tech.id;
    }

    res.json({ user: { ...user, technicianId } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
}

function listUsers(req, res) {
  try {
    const users = db.prepare('SELECT id, name, username, email, role, phone, is_active, created_at FROM users ORDER BY id ASC').all();
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users list' });
  }
}

async function createUser(req, res) {
  try {
    let { name, username, email, password, role, phone, area_zone, specialization } = req.body;
    if (!name || !password || !role) {
      return res.status(400).json({ error: 'Name, password and role are required' });
    }

    if (!username || !username.trim()) {
      username = (name.toLowerCase().replace(/[^a-z0-9]/g, '.') + '.' + Math.floor(100 + Math.random() * 900)).replace(/\.+/g, '.');
    } else {
      username = username.trim().toLowerCase();
    }

    if (!email || !email.trim()) {
      const emailUserPart = username.replace(/[^a-z0-9._-]/g, '.');
      email = `${emailUserPart}@ecogreensolar.internal`;
    } else {
      email = email.trim();
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ? OR LOWER(username) = ?').get(email, username);
    if (existing) {
      return res.status(400).json({ error: 'User with this User ID / Username or email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const insert = db.prepare(`
      INSERT INTO users (name, username, email, password_hash, role, phone)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = insert.run(name, username, email, passwordHash, role, phone || null);
    const userId = result.lastInsertRowid;

    if (role === 'technician') {
      const insertTech = db.prepare(`
        INSERT INTO technicians (user_id, name, phone, email, area_zone, specialization)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      insertTech.run(
        userId,
        name,
        phone || '',
        email,
        area_zone || 'General Zone',
        specialization || 'All Products'
      );
    }

    res.status(201).json({
      message: 'User created successfully',
      user: { id: userId, name, username, email, role, phone }
    });
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ error: 'Failed to create user' });
  }
}

function deleteUser(req, res) {
  try {
    const { id } = req.params;
    db.prepare('DELETE FROM technicians WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
}

async function updateUser(req, res) {
  try {
    const { id } = req.params;
    let { name, username, email, role, phone, password } = req.body;

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (username) {
      username = username.trim().toLowerCase();
      const existingUser = db.prepare('SELECT id FROM users WHERE LOWER(username) = ? AND id != ?').get(username, id);
      if (existingUser) {
        return res.status(400).json({ error: 'User with this User ID / Username already exists' });
      }
    }

    if (email && email !== user.email) {
      const existing = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, id);
      if (existing) {
        return res.status(400).json({ error: 'Email is already taken by another user' });
      }
    }

    let passwordHash = user.password_hash;
    if (password && password.trim()) {
      passwordHash = await bcrypt.hash(password.trim(), 10);
    }

    db.prepare(`
      UPDATE users 
      SET name = COALESCE(?, name),
          username = COALESCE(?, username),
          email = COALESCE(?, email),
          role = COALESCE(?, role),
          phone = COALESCE(?, phone),
          password_hash = ?
      WHERE id = ?
    `).run(name || null, username || null, email || null, role || null, phone || null, passwordHash, id);

    // If technician, also sync technician record
    db.prepare(`
      UPDATE technicians 
      SET name = COALESCE(?, name),
          email = COALESCE(?, email),
          phone = COALESCE(?, phone)
      WHERE user_id = ?
    `).run(name || null, email || null, phone || null, id);

    const updated = db.prepare('SELECT id, name, username, email, role, phone, is_active FROM users WHERE id = ?').get(id);
    res.json({ message: 'User updated successfully', user: updated });
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ error: 'Failed to update user: ' + err.message });
  }
}

async function adminResetPassword(req, res) {
  try {
    const { userId, technicianId, newPassword } = req.body;
    if (!newPassword || newPassword.trim().length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters long' });
    }

    const passwordHash = await bcrypt.hash(newPassword.trim(), 10);
    let targetUserId = userId;

    if (!targetUserId && technicianId) {
      const tech = db.prepare('SELECT id, user_id, name, email, phone FROM technicians WHERE id = ?').get(technicianId);
      if (!tech) {
        return res.status(404).json({ error: 'Technician not found' });
      }

      if (tech.user_id) {
        targetUserId = tech.user_id;
      } else {
        const matchingUser = db.prepare('SELECT id FROM users WHERE email = ? OR phone = ? LIMIT 1').get(tech.email || '', tech.phone || '');
        if (matchingUser) {
          targetUserId = matchingUser.id;
          try {
            db.prepare('UPDATE technicians SET user_id = ? WHERE id = ?').run(targetUserId, technicianId);
          } catch (_) {}
        } else {
          const username = (tech.name.toLowerCase().replace(/[^a-z0-9]/g, '.') + '.' + tech.id);
          const email = tech.email || `${username}@ecogreensolar.internal`;
          const insertRes = db.prepare(`
            INSERT INTO users (name, username, email, password_hash, role, phone, is_active)
            VALUES (?, ?, ?, ?, 'technician', ?, 1)
          `).run(tech.name, username, email, passwordHash, tech.phone || '');
          targetUserId = insertRes.lastInsertRowid;
          try {
            db.prepare('UPDATE technicians SET user_id = ? WHERE id = ?').run(targetUserId, technicianId);
          } catch (_) {}
          return res.json({
            success: true,
            message: `User account created and password securely set for ${tech.name}`
          });
        }
      }
    }

    if (!targetUserId) {
      return res.status(400).json({ error: 'Target user ID or technician ID is required' });
    }

    const updateStmt = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?');
    const result = updateStmt.run(passwordHash, targetUserId);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'User account not found' });
    }

    const updatedUser = db.prepare('SELECT id, name, username, email, role FROM users WHERE id = ?').get(targetUserId);
    res.json({
      success: true,
      message: `Password securely updated for ${updatedUser.name} (@${updatedUser.username || updatedUser.email?.split('@')[0]})`,
      user: updatedUser
    });
  } catch (err) {
    console.error('Admin reset password error:', err);
    res.status(500).json({ error: 'Failed to reset password: ' + err.message });
  }
}

async function changeMyPassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.trim().length < 4) {
      return res.status(400).json({ error: 'New password must be at least 4 characters long' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'User account not found' });

    if (currentPassword && currentPassword.trim()) {
      const valid = await bcrypt.compare(currentPassword.trim(), user.password_hash);
      if (!valid) {
        return res.status(400).json({ error: 'Current password does not match' });
      }
    }

    const hash = await bcrypt.hash(newPassword.trim(), 10);
    db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(hash, req.user.id);

    res.json({
      success: true,
      message: `Password updated successfully for ${user.name}`
    });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Failed to change password: ' + err.message });
  }
}

function updateProfile(req, res) {
  try {
    const { name, phone, email, username } = req.body;
    db.prepare(`
      UPDATE users 
      SET name = COALESCE(?, name),
          phone = COALESCE(?, phone),
          email = COALESCE(?, email),
          username = COALESCE(?, username),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(name?.trim() || null, phone?.trim() || null, email?.trim() || null, username?.trim().toLowerCase() || null, req.user.id);

    const user = db.prepare('SELECT id, name, username, email, role, phone FROM users WHERE id = ?').get(req.user.id);
    res.json({ user, message: 'Profile updated successfully' });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Failed to update profile: ' + err.message });
  }
}

module.exports = { login, getMe, listUsers, createUser, updateUser, deleteUser, adminResetPassword, changeMyPassword, updateProfile };
