const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { JWT_SECRET } = require('../middleware/auth');

async function login(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1').get(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Find technician record if user is technician
    let technicianId = null;
    if (user.role === 'technician') {
      const tech = db.prepare('SELECT id FROM technicians WHERE user_id = ?').get(user.id);
      if (tech) technicianId = tech.id;
    }

    const token = jwt.sign(
      {
        id: user.id,
        name: user.name,
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
    const user = db.prepare('SELECT id, name, email, role, phone, created_at FROM users WHERE id = ?').get(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    let technicianId = null;
    if (user.role === 'technician') {
      const tech = db.prepare('SELECT id FROM technicians WHERE user_id = ?').get(user.id);
      if (tech) technicianId = tech.id;
    }

    res.json({ user: { ...user, technicianId } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
}

function listUsers(req, res) {
  try {
    const users = db.prepare('SELECT id, name, email, role, phone, is_active, created_at FROM users ORDER BY id ASC').all();
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users list' });
  }
}

async function createUser(req, res) {
  try {
    const { name, email, password, role, phone, area_zone, specialization } = req.body;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'Name, email, password and role are required' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const insert = db.prepare(`
      INSERT INTO users (name, email, password_hash, role, phone)
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = insert.run(name, email, passwordHash, role, phone || null);
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
      user: { id: userId, name, email, role, phone }
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

module.exports = { login, getMe, listUsers, createUser, deleteUser };
