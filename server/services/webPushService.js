const webpush = require('web-push');
const db = require('../config/database');

const VAPID_PUBLIC_KEY = 'BG7RGa45M_-DXtXhZsTXDBUrBfFGtXp9INDkked5RDSRTt2zSF-1Hs3wvcDVFVuVJ__DVMgDnT1MSvFONbXED4g';
const VAPID_PRIVATE_KEY = 'GIcMcXDimGXyGgZxkrclowVeZHarWWhPFJkKzChdC1A';
const VAPID_SUBJECT = 'mailto:info@ecogreensolar.co.in';

let isConfigured = false;
function ensureVapidConfig() {
  if (!isConfigured) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    isConfigured = true;
  }
}

function savePushSubscription({ endpoint, p256dh, auth, userId, role, phone }) {
  if (!endpoint || !p256dh || !auth) {
    throw new Error('endpoint, p256dh, and auth keys are required');
  }

  const stmt = db.prepare(`
    INSERT INTO push_subscriptions (endpoint, p256dh, auth, user_id, role, phone, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(endpoint) DO UPDATE SET
      p256dh = excluded.p256dh,
      auth = excluded.auth,
      user_id = COALESCE(excluded.user_id, push_subscriptions.user_id),
      role = COALESCE(excluded.role, push_subscriptions.role),
      phone = COALESCE(excluded.phone, push_subscriptions.phone),
      updated_at = CURRENT_TIMESTAMP
  `);

  return stmt.run(
    endpoint,
    p256dh,
    auth,
    userId ? String(userId) : null,
    role || 'staff',
    phone ? String(phone) : null
  );
}

function removePushSubscription(endpoint) {
  if (!endpoint) return;
  db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
}

async function sendToSubscription(subRow, payload) {
  ensureVapidConfig();

  const pushSubscription = {
    endpoint: subRow.endpoint,
    keys: {
      p256dh: subRow.p256dh,
      auth: subRow.auth
    }
  };

  const stringifiedPayload = typeof payload === 'string' ? payload : JSON.stringify(payload);

  try {
    await webpush.sendNotification(pushSubscription, stringifiedPayload, {
      TTL: 86400,
      urgency: 'high'
    });
    return { success: true, endpoint: subRow.endpoint };
  } catch (err) {
    console.warn(`[WebPush] Failed sending to ${subRow.endpoint?.slice(0, 35)}...:`, err.statusCode || err.message);
    if (err.statusCode === 404 || err.statusCode === 410) {
      removePushSubscription(subRow.endpoint);
    }
    return { success: false, endpoint: subRow.endpoint, error: err.message };
  }
}

async function dispatchPushToRoles(roles, payload) {
  try {
    const roleList = Array.isArray(roles) ? roles : [roles];
    const isAll = roleList.includes('all');

    let rows = [];
    if (isAll) {
      rows = db.prepare('SELECT * FROM push_subscriptions').all() || [];
    } else {
      const placeholders = roleList.map(() => '?').join(', ');
      rows = db.prepare(`SELECT * FROM push_subscriptions WHERE role IN (${placeholders})`).all(...roleList) || [];
    }

    if (!rows.length) return { sent: 0, total: 0 };

    const promises = rows.map(sub => sendToSubscription(sub, payload));
    const results = await Promise.allSettled(promises);
    const sentCount = results.filter(r => r.status === 'fulfilled' && r.value?.success).length;

    return { sent: sentCount, total: rows.length };
  } catch (err) {
    console.error('[WebPush] Error dispatching to roles:', err.message);
    return { sent: 0, error: err.message };
  }
}

async function dispatchPushToTechnician(techId, techPhone, payload) {
  try {
    const conditions = [];
    const params = [];

    if (techId) {
      params.push(String(techId));
      conditions.push('user_id = ?');
    }
    if (techPhone) {
      const cleanPhone = String(techPhone).replace(/\D/g, '').slice(-10);
      params.push(`%${cleanPhone}%`);
      conditions.push('phone LIKE ?');
    }

    if (!conditions.length) return { sent: 0 };

    const sql = `SELECT * FROM push_subscriptions WHERE role = 'technician' AND (${conditions.join(' OR ')})`;
    const rows = db.prepare(sql).all(...params) || [];

    if (!rows.length) return { sent: 0, total: 0 };

    const promises = rows.map(sub => sendToSubscription(sub, payload));
    const results = await Promise.allSettled(promises);
    const sentCount = results.filter(r => r.status === 'fulfilled' && r.value?.success).length;

    return { sent: sentCount, total: rows.length };
  } catch (err) {
    console.error('[WebPush] Error dispatching to technician:', err.message);
    return { sent: 0, error: err.message };
  }
}

module.exports = {
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY,
  VAPID_SUBJECT,
  savePushSubscription,
  removePushSubscription,
  dispatchPushToRoles,
  dispatchPushToTechnician
};
