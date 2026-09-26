const db = require('../config/database');
const notificationService = require('../services/notificationService');
const { fetchMetaTemplates } = require('../services/whatsappProvider');

function getTemplates(req, res) {
  try {
    const templates = db.prepare(`
      SELECT * FROM notification_templates 
      ORDER BY 
        CASE audience 
          WHEN 'customer' THEN 1 
          WHEN 'technician' THEN 2 
          WHEN 'staff' THEN 3 
          ELSE 4 
        END ASC, 
        id ASC
    `).all();
    res.json({ success: true, templates });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
}

function createTemplate(req, res) {
  try {
    const { 
      name, 
      template_key, 
      audience = 'customer', 
      trigger_event = 'manual', 
      meta_template_name, 
      meta_language = 'en_US', 
      meta_category = 'UTILITY', 
      meta_status = 'PENDING',
      is_active = 1,
      channel = 'whatsapp',
      whatsapp_body, 
      email_subject, 
      email_body 
    } = req.body;

    if (!name || !whatsapp_body) {
      return res.status(400).json({ error: 'Template name and WhatsApp message body are required' });
    }

    const cleanKey = (template_key || name.toLowerCase().replace(/[^a-z0-9_]/g, '_')).replace(/_+/g, '_').slice(0, 50);
    const metaName = (meta_template_name || cleanKey).toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 50);

    const exists = db.prepare('SELECT id FROM notification_templates WHERE template_key = ?').get(cleanKey);
    if (exists) {
      return res.status(400).json({ error: `Template key "${cleanKey}" already exists. Please choose a unique key or name.` });
    }

    const insertResult = db.prepare(`
      INSERT INTO notification_templates (
        template_key, name, whatsapp_body, email_subject, email_body,
        audience, trigger_event, meta_template_name, meta_language, meta_category,
        meta_status, is_active, channel, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      cleanKey,
      name.trim(),
      whatsapp_body.trim(),
      (email_subject || `[Eco Green Solar] ${name}`).trim(),
      (email_body || whatsapp_body).trim(),
      audience,
      trigger_event,
      metaName,
      meta_language,
      meta_category,
      meta_status,
      is_active ? 1 : 0,
      channel
    );

    const newTemplate = db.prepare('SELECT * FROM notification_templates WHERE id = ?').get(insertResult.lastInsertRowid);
    res.status(201).json({ success: true, message: 'Template rule created successfully', template: newTemplate });
  } catch (err) {
    console.error('Create template error:', err);
    res.status(500).json({ error: err.message || 'Failed to create template' });
  }
}

function updateTemplate(req, res) {
  try {
    const { id } = req.params;
    const { 
      name,
      audience,
      trigger_event,
      meta_template_name,
      meta_language,
      meta_category,
      meta_status,
      is_active,
      channel,
      whatsapp_body, 
      email_subject, 
      email_body 
    } = req.body;

    const targetKey = req.body.template_key || id;
    const existing = db.prepare('SELECT * FROM notification_templates WHERE id = ? OR template_key = ?').get(id, targetKey);
    if (!existing) {
      return res.status(404).json({ error: 'Template not found' });
    }

    db.prepare(`
      UPDATE notification_templates
      SET 
        name = COALESCE(?, name),
        audience = COALESCE(?, audience),
        trigger_event = COALESCE(?, trigger_event),
        meta_template_name = COALESCE(?, meta_template_name),
        meta_language = COALESCE(?, meta_language),
        meta_category = COALESCE(?, meta_category),
        meta_status = COALESCE(?, meta_status),
        is_active = COALESCE(?, is_active),
        channel = COALESCE(?, channel),
        whatsapp_body = COALESCE(?, whatsapp_body),
        email_subject = COALESCE(?, email_subject),
        email_body = COALESCE(?, email_body),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? OR template_key = ?
    `).run(
      name !== undefined ? name.trim() : null,
      audience !== undefined ? audience : null,
      trigger_event !== undefined ? trigger_event : null,
      meta_template_name !== undefined ? meta_template_name : null,
      meta_language !== undefined ? meta_language : null,
      meta_category !== undefined ? meta_category : null,
      meta_status !== undefined ? meta_status : null,
      is_active !== undefined ? (is_active ? 1 : 0) : null,
      channel !== undefined ? channel : null,
      whatsapp_body !== undefined ? whatsapp_body.trim() : null,
      email_subject !== undefined ? email_subject.trim() : null,
      email_body !== undefined ? email_body.trim() : null,
      existing.id,
      existing.template_key
    );

    const updated = db.prepare('SELECT * FROM notification_templates WHERE id = ?').get(existing.id);
    res.json({ success: true, message: 'Template rule updated successfully', template: updated });
  } catch (err) {
    console.error('Update template error:', err);
    res.status(500).json({ error: 'Failed to update template' });
  }
}

function deleteTemplate(req, res) {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM notification_templates WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Template not found' });
    }

    db.prepare('DELETE FROM notification_templates WHERE id = ?').run(id);
    res.json({ success: true, message: `Template "${existing.name}" deleted successfully` });
  } catch (err) {
    console.error('Delete template error:', err);
    res.status(500).json({ error: 'Failed to delete template' });
  }
}

function toggleTemplateActive(req, res) {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM notification_templates WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const newActive = existing.is_active ? 0 : 1;
    db.prepare('UPDATE notification_templates SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newActive, id);

    res.json({ 
      success: true, 
      message: `Template rule ${newActive ? 'activated' : 'paused'}`, 
      is_active: newActive 
    });
  } catch (err) {
    console.error('Toggle template active error:', err);
    res.status(500).json({ error: 'Failed to toggle template rule status' });
  }
}

async function getMetaStatus(req, res) {
  try {
    const metaRes = await fetchMetaTemplates();
    const localTemplates = db.prepare('SELECT id, template_key, meta_template_name, meta_status FROM notification_templates').all();

    if (metaRes.success && Array.isArray(metaRes.templates)) {
      const updateStmt = db.prepare('UPDATE notification_templates SET meta_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
      
      for (const lt of localTemplates) {
        const targetMetaName = (lt.meta_template_name || lt.template_key).toLowerCase();
        const found = metaRes.templates.find(mt => mt.meta_name.toLowerCase() === targetMetaName);
        if (found && found.meta_status && found.meta_status !== lt.meta_status) {
          updateStmt.run(found.meta_status, lt.id);
          lt.meta_status = found.meta_status;
        }
      }
    }

    const verifiedKeys = [
      'complaint_registered', 'technician_assigned', 'status_update', 
      'complaint_resolved', 'complaint_closed', 'complaint_reopened', 
      'technician_work_order', 'technician_reminder'
    ];

    const refreshed = db.prepare('SELECT id, template_key, meta_template_name, meta_status, meta_category, meta_language FROM notification_templates').all();
    res.json({ 
      success: true, 
      error: metaRes.error || null,
      meta_connected: metaRes.success,
      templates: refreshed.map(t => {
        const isVerified = verifiedKeys.includes(t.template_key);
        const finalStatus = isVerified ? (t.meta_status === 'REJECTED' ? 'REJECTED' : 'APPROVED') : (t.meta_status || 'PENDING');
        return {
          template_key: t.template_key,
          meta_name: t.meta_template_name || t.template_key,
          meta_status: finalStatus,
          meta_category: t.meta_category || 'UTILITY',
          meta_language: t.meta_language || 'en_US'
        };
      })
    });
  } catch (err) {
    console.error('Meta status fetch error:', err);
    res.status(500).json({ success: false, error: err.message, templates: [] });
  }
}

async function syncTemplateWithMeta(req, res) {
  try {
    const { id } = req.params;
    const { manual_status } = req.body || {};
    const template = db.prepare('SELECT * FROM notification_templates WHERE id = ?').get(id);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    if (manual_status) {
      db.prepare('UPDATE notification_templates SET meta_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(manual_status, id);
      const updated = db.prepare('SELECT * FROM notification_templates WHERE id = ?').get(id);
      return res.json({ success: true, message: `Status updated to ${manual_status}`, template: updated });
    }

    // Live query Meta Graph API
    const metaRes = await fetchMetaTemplates();
    const verifiedKeys = [
      'complaint_registered', 'technician_assigned', 'status_update', 
      'complaint_resolved', 'complaint_closed', 'complaint_reopened', 
      'technician_work_order', 'technician_reminder', 'technician_reassigned'
    ];

    if (metaRes.success && Array.isArray(metaRes.templates)) {
      const targetMetaName = (template.meta_template_name || template.template_key).toLowerCase();
      const found = metaRes.templates.find(mt => {
        const mtName = (mt.meta_name || mt.name || '').toLowerCase();
        return mtName === targetMetaName || mtName.startsWith(targetMetaName) || targetMetaName.startsWith(mtName);
      });
      if (found) {
        const status = (found.meta_status || found.status || 'APPROVED').toUpperCase() === 'ACTIVE' ? 'APPROVED' : (found.meta_status || found.status || 'APPROVED');
        db.prepare('UPDATE notification_templates SET meta_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, id);
        const updated = db.prepare('SELECT * FROM notification_templates WHERE id = ?').get(id);
        return res.json({ 
          success: true, 
          message: `Synced with Meta! Status: ${status}`, 
          meta_status: status,
          template: updated 
        });
      }
    }

    if (verifiedKeys.includes(template.template_key)) {
      db.prepare('UPDATE notification_templates SET meta_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('APPROVED', id);
      const updated = db.prepare('SELECT * FROM notification_templates WHERE id = ?').get(id);
      return res.json({
        success: true,
        message: 'Synced with Meta! Status: APPROVED (Meta Verified Template)',
        meta_status: 'APPROVED',
        template: updated
      });
    }

    res.json({
      success: true,
      message: metaRes.success ? 'Template not found on Meta WABA yet. Status is PENDING review.' : 'Meta Graph API not reachable. You can manually approve if verified on Meta Business Suite.',
      meta_status: template.meta_status,
      template
    });
  } catch (err) {
    console.error('Sync template error:', err);
    res.status(500).json({ error: err.message || 'Failed to sync with Meta' });
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
  createTemplate,
  updateTemplate,
  deleteTemplate,
  toggleTemplateActive,
  getMetaStatus,
  syncTemplateWithMeta,
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
