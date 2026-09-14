const db = require('../config/database');

function listTechnicians(req, res) {
  try {
    const technicians = db.prepare(`
      SELECT 
        t.*,
        (SELECT COUNT(*) FROM complaints c WHERE c.assigned_technician_id = t.id AND c.status IN ('Assigned', 'In Progress', 'On Hold')) as active_tickets_count,
        (SELECT COUNT(*) FROM complaints c WHERE c.assigned_technician_id = t.id AND c.status IN ('Resolved', 'Closed')) as resolved_tickets_count,
        (SELECT ROUND(AVG(c.rating), 1) FROM complaints c WHERE c.assigned_technician_id = t.id AND c.rating IS NOT NULL) as average_rating
      FROM technicians t
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
    const tech = db.prepare('SELECT * FROM technicians WHERE id = ?').get(id);
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

module.exports = { listTechnicians, getTechnician, updateAvailability, deleteTechnician };
