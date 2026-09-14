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

module.exports = {
  getTemplates,
  updateTemplate,
  getLogs,
  resendLog,
  getSimulatedMessages,
  clearSimulated,
  subscribeSimulatedEvents
};
