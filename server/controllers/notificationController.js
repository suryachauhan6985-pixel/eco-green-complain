const db = require('../config/database');
const notificationService = require('../services/notificationService');

function getTemplates(req, res) {
  try {
    const templates = db.prepare('SELECT * FROM notification_templates ORDER BY id ASC').all();
    res.json({ templates });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
}

function updateTemplate(req, res) {
  try {
    const { id } = req.params;
    const { whatsapp_body, email_subject, email_body } = req.body;

    if (!whatsapp_body || !email_subject || !email_body) {
      return res.status(400).json({ error: 'Template content cannot be empty' });
    }

    db.prepare(`
      UPDATE notification_templates
      SET whatsapp_body = ?, email_subject = ?, email_body = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(whatsapp_body, email_subject, email_body, id);

    const updated = db.prepare('SELECT * FROM notification_templates WHERE id = ?').get(id);
    res.json({ message: 'Template updated successfully', template: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update template' });
  }
}

function getLogs(req, res) {
  try {
    const { complaint_id, channel, limit = 50 } = req.query;
    let query = `
      SELECT 
        l.*,
        c.ticket_id,
        c.customer_name
      FROM notification_logs l
      LEFT JOIN complaints c ON l.complaint_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (complaint_id) {
      query += ` AND l.complaint_id = ? `;
      params.push(complaint_id);
    }
    if (channel) {
      query += ` AND l.channel = ? `;
      params.push(channel);
    }

    query += ` ORDER BY l.created_at DESC LIMIT ? `;
    params.push(parseInt(limit));

    const logs = db.prepare(query).all(...params);
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch notification logs' });
  }
}

async function resendLog(req, res) {
  try {
    const { id } = req.params;
    const result = await notificationService.resendNotification(id);
    res.json({ message: 'Notification resent successfully', result });
  } catch (err) {
    console.error('Resend notification error:', err);
    res.status(500).json({ error: 'Failed to resend notification: ' + err.message });
  }
}

function getSimulatedMessages(req, res) {
  try {
    const messages = notificationService.getSimulatedBuffer();
    res.json({ messages });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch simulated messages' });
  }
}

function clearSimulated(req, res) {
  try {
    notificationService.clearSimulatedBuffer();
    res.json({ message: 'Simulated messages cleared' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear simulated messages' });
  }
}

// Server-Sent Events (SSE) stream for live updates to the Simulated Inbox drawer
function subscribeSimulatedEvents(req, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const listener = (notification) => {
    res.write(`data: ${JSON.stringify(notification)}\n\n`);
  };

  notificationService.on('notification', listener);

  req.on('close', () => {
    notificationService.removeListener('notification', listener);
    res.end();
  });
}

function listInAppNotifications(req, res) {
  try {
    const rows = db.prepare('SELECT * FROM in_app_notifications ORDER BY created_at DESC LIMIT 100').all();
    const notifications = rows.map(r => {
      let readBy = [];
      try {
        readBy = JSON.parse(r.read_by || '[]');
      } catch (_) {
        readBy = [];
      }
      return {
        id: r.id,
        type: r.type,
        ticketId: r.ticket_id,
        complaintId: r.complaint_id,
        title: r.title,
        message: r.message,
        customerName: r.customer_name,
        targetRole: r.target_role,
        targetTechnicianId: r.target_technician_id,
        targetTechnicianName: r.target_technician_name,
        performedByName: r.performed_by_name,
        performedByRole: r.performed_by_role,
        performedByUserId: r.performed_by_user_id,
        readBy,
        createdAt: r.created_at
      };
    });
    res.json({ notifications });
  } catch (err) {
    console.error('List in-app notifications error:', err);
    res.status(500).json({ error: 'Failed to fetch in-app notifications' });
  }
}

function createInAppNotification(req, res) {
  try {
    const notif = req.body;
    const notifId = notif.id || `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const readBy = Array.isArray(notif.readBy) ? JSON.stringify(notif.readBy) : '[]';

    db.prepare(`
      INSERT OR REPLACE INTO in_app_notifications (
        id, type, ticket_id, complaint_id, title, message, customer_name,
        target_role, target_technician_id, target_technician_name,
        performed_by_name, performed_by_role, performed_by_user_id, read_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
    `).run(
      notifId,
      notif.type || 'info',
      notif.ticketId || null,
      notif.complaintId || null,
      notif.title || 'Notification',
      notif.message || '',
      notif.customerName || '',
      notif.targetRole || 'all',
      notif.targetTechnicianId || null,
      notif.targetTechnicianName || '',
      notif.performedByName || 'System',
      notif.performedByRole || 'system',
      notif.performedByUserId || null,
      readBy,
      notif.createdAt || null
    );

    res.status(201).json({ success: true, id: notifId });
  } catch (err) {
    console.error('Create in-app notification error:', err);
    res.status(500).json({ error: 'Failed to create in-app notification' });
  }
}

function markInAppNotificationRead(req, res) {
  try {
    const { id } = req.params;
    const userKeys = [];
    if (req.user) {
      if (req.user.id) userKeys.push(String(req.user.id).toLowerCase());
      if (req.user.username) userKeys.push(String(req.user.username).toLowerCase());
      if (req.user.email) userKeys.push(String(req.user.email).toLowerCase());
      if (req.user.phone) userKeys.push(String(req.user.phone).slice(-10));
      if (req.user.technicianId) userKeys.push(String(req.user.technicianId).toLowerCase());
      if (req.user.role) userKeys.push(String(req.user.role).toLowerCase());
    }
    if (req.body?.userKey) userKeys.push(String(req.body.userKey).toLowerCase());
    if (req.body?.userId) userKeys.push(String(req.body.userId).toLowerCase());
    if (req.body?.username) userKeys.push(String(req.body.username).toLowerCase());
    if (userKeys.length === 0) userKeys.push('read');

    const notifs = db.prepare('SELECT id, read_by FROM in_app_notifications WHERE id = ? OR ticket_id = ?').all(id, id);
    const updateStmt = db.prepare('UPDATE in_app_notifications SET read_by = ? WHERE id = ?');

    for (const n of notifs) {
      let existingReads = [];
      try { existingReads = JSON.parse(n.read_by || '[]'); } catch (_) { existingReads = []; }
      const merged = Array.from(new Set([...existingReads, ...userKeys]));
      updateStmt.run(JSON.stringify(merged), n.id);
    }

    res.json({ success: true, count: notifs.length });
  } catch (err) {
    console.error('Mark notification read error:', err);
    res.status(500).json({ error: 'Failed to mark notification read' });
  }
}

function markAllInAppNotificationsRead(req, res) {
  try {
    const userKeys = [];
    if (req.user) {
      if (req.user.id) userKeys.push(String(req.user.id).toLowerCase());
      if (req.user.username) userKeys.push(String(req.user.username).toLowerCase());
      if (req.user.email) userKeys.push(String(req.user.email).toLowerCase());
      if (req.user.technicianId) userKeys.push(String(req.user.technicianId).toLowerCase());
      if (req.user.role) userKeys.push(String(req.user.role).toLowerCase());
    }
    if (req.body?.userKey) userKeys.push(String(req.body.userKey).toLowerCase());
    if (userKeys.length === 0) userKeys.push('read');

    const notifs = db.prepare('SELECT id, read_by FROM in_app_notifications').all();
    const updateStmt = db.prepare('UPDATE in_app_notifications SET read_by = ? WHERE id = ?');

    for (const n of notifs) {
      let existingReads = [];
      try { existingReads = JSON.parse(n.read_by || '[]'); } catch (_) { existingReads = []; }
      const merged = Array.from(new Set([...existingReads, ...userKeys]));
      updateStmt.run(JSON.stringify(merged), n.id);
    }

    res.json({ success: true, count: notifs.length });
  } catch (err) {
    console.error('Mark all notifications read error:', err);
    res.status(500).json({ error: 'Failed to mark all notifications read' });
  }
}

function clearInAppNotifications(req, res) {
  try {
    db.prepare('DELETE FROM in_app_notifications').run();
    res.json({ success: true, message: 'All in-app notifications cleared' });
  } catch (err) {
    console.error('Clear in-app notifications error:', err);
    res.status(500).json({ error: 'Failed to clear in-app notifications' });
  }
}

module.exports = {
  getTemplates,
  updateTemplate,
  getLogs,
  resendLog,
  getSimulatedMessages,
  clearSimulated,
  subscribeSimulatedEvents,
  listInAppNotifications,
  createInAppNotification,
  markInAppNotificationRead,
  markAllInAppNotificationsRead,
  clearInAppNotifications
};
