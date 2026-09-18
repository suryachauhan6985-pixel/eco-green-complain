const db = require('../config/database');
const bcrypt = require('bcryptjs');

function listTechnicians(req, res) {
  try {
    const technicians = db.prepare(`
      SELECT 
        t.*,
        u.username,
        (SELECT COUNT(*) FROM complaints c WHERE c.assigned_technician_id = t.id AND c.status IN ('Assigned', 'In Progress', 'On Hold')) as active_tickets_count,
        (SELECT COUNT(*) FROM complaints c WHERE c.assigned_technician_id = t.id AND c.status IN ('Resolved', 'Closed')) as resolved_tickets_count,
        (SELECT ROUND(AVG(c.rating), 1) FROM complaints c WHERE c.assigned_technician_id = t.id AND c.rating IS NOT NULL) as average_rating,
        COALESCE((SELECT SUM(c.payment_collected) FROM complaints c WHERE c.assigned_technician_id = t.id), 0) as total_collected,
        COALESCE((SELECT SUM(c.payment_collected) FROM complaints c WHERE c.assigned_technician_id = t.id AND c.company_settlement_status = 'Settled with Company'), 0) as total_settled_with_company,
        COALESCE((SELECT SUM(c.payment_collected) FROM complaints c WHERE c.assigned_technician_id = t.id AND (c.company_settlement_status IS NULL OR c.company_settlement_status != 'Settled with Company')), 0) as cash_in_hand_due
      FROM technicians t
      LEFT JOIN users u ON t.user_id = u.id
      ORDER BY t.name ASC
    `).all();

    res.json({ technicians });
  } catch (err) {
    console.error('List technicians error:', err);
    res.status(500).json({ error: 'Failed to fetch technicians' });
  }
}

function getTechnician(req, res) {
  try {
    const { id } = req.params;
    const tech = db.prepare(`
      SELECT 
        t.*,
        COALESCE((SELECT SUM(c.payment_collected) FROM complaints c WHERE c.assigned_technician_id = t.id), 0) as total_collected,
        COALESCE((SELECT SUM(c.payment_collected) FROM complaints c WHERE c.assigned_technician_id = t.id AND c.company_settlement_status = 'Settled with Company'), 0) as total_settled_with_company,
        COALESCE((SELECT SUM(c.payment_collected) FROM complaints c WHERE c.assigned_technician_id = t.id AND (c.company_settlement_status IS NULL OR c.company_settlement_status != 'Settled with Company')), 0) as cash_in_hand_due
      FROM technicians t
      WHERE t.id = ?
    `).get(id);

    if (!tech) {
      return res.status(404).json({ error: 'Technician not found' });
    }

    const assignedComplaints = db.prepare(`
      SELECT * FROM complaints 
      WHERE assigned_technician_id = ?
      ORDER BY 
        CASE status 
          WHEN 'Assigned' THEN 1 
          WHEN 'In Progress' THEN 2 
          WHEN 'On Hold' THEN 3 
          ELSE 4 
        END,
        created_at DESC
    `).all(id);

    res.json({ technician: tech, complaints: assignedComplaints });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch technician details' });
  }
}

function updateTechnician(req, res) {
  try {
    const { id } = req.params;
    let { name, username, phone, email, password } = req.body;

    const tech = db.prepare('SELECT * FROM technicians WHERE id = ?').get(id);
    if (!tech) {
      return res.status(404).json({ error: 'Technician not found' });
    }

    if (username) {
      username = username.trim().toLowerCase();
      const existing = db.prepare('SELECT id FROM users WHERE LOWER(username) = ? AND id != ?').get(username, tech.user_id || 0);
      if (existing) {
        return res.status(400).json({ error: 'This User ID / Username is already taken' });
      }
    }

    db.prepare(`
      UPDATE technicians 
      SET name = COALESCE(?, name),
          phone = COALESCE(?, phone),
          email = COALESCE(?, email)
      WHERE id = ?
    `).run(name || null, phone || null, email || null, id);

    // Sync to user table if linked
    if (tech.user_id) {
      let passwordHash = null;
      if (password && password.trim()) {
        passwordHash = bcrypt.hashSync(password.trim(), 10);
      }

      if (passwordHash) {
        db.prepare(`
          UPDATE users 
          SET name = COALESCE(?, name),
              username = COALESCE(?, username),
              phone = COALESCE(?, phone),
              email = COALESCE(?, email),
              password_hash = ?
          WHERE id = ?
        `).run(name || null, username || null, phone || null, email || null, passwordHash, tech.user_id);
      } else {
        db.prepare(`
          UPDATE users 
          SET name = COALESCE(?, name),
              username = COALESCE(?, username),
              phone = COALESCE(?, phone),
              email = COALESCE(?, email)
          WHERE id = ?
        `).run(name || null, username || null, phone || null, email || null, tech.user_id);
      }
    }

    const updated = db.prepare(`
      SELECT t.*, u.username
      FROM technicians t
      LEFT JOIN users u ON t.user_id = u.id
      WHERE t.id = ?
    `).get(id);
    res.json({ message: 'Technician updated successfully', technician: updated });
  } catch (err) {
    console.error('Update technician error:', err);
    res.status(500).json({ error: 'Failed to update technician: ' + err.message });
  }
}

function updateAvailability(req, res) {
  try {
    const { id } = req.params;
    const { is_available } = req.body;

    db.prepare('UPDATE technicians SET is_available = ? WHERE id = ?').run(is_available ? 1 : 0, id);
    res.json({ message: 'Availability updated successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update technician availability' });
  }
}

function deleteTechnician(req, res) {
  try {
    const { id } = req.params;
    const tech = db.prepare('SELECT user_id FROM technicians WHERE id = ?').get(id);
    db.prepare('DELETE FROM technicians WHERE id = ?').run(id);
    if (tech && tech.user_id) {
      db.prepare('DELETE FROM users WHERE id = ?').run(tech.user_id);
    }
    res.json({ message: 'Technician deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete technician: ' + err.message });
  }
}

module.exports = { listTechnicians, getTechnician, updateTechnician, updateAvailability, deleteTechnician };
