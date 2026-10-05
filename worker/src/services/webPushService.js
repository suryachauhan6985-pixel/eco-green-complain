import { buildPushPayload } from '@block65/webcrypto-web-push';
import { query } from '../db.js';

export const VAPID_PUBLIC_KEY = 'BG7RGa45M_-DXtXhZsTXDBUrBfFGtXp9INDkked5RDSRTt2zSF-1Hs3wvcDVFVuVJ__DVMgDnT1MSvFONbXED4g';
export const VAPID_PRIVATE_KEY = 'GIcMcXDimGXyGgZxkrclowVeZHarWWhPFJkKzChdC1A';
export const VAPID_SUBJECT = 'mailto:info@ecogreensolar.co.in';

/**
 * Register or update a browser push subscription
 */
export async function savePushSubscription({ endpoint, p256dh, auth, userId, role, phone }, env, ctx) {
  if (!endpoint || !p256dh || !auth) {
    throw new Error('endpoint, p256dh, and auth keys are required');
  }

  const sql = `
    INSERT INTO push_subscriptions (endpoint, p256dh, auth, user_id, role, phone, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
    ON CONFLICT (endpoint) DO UPDATE SET
      p256dh = EXCLUDED.p256dh,
      auth = EXCLUDED.auth,
      user_id = COALESCE(EXCLUDED.user_id, push_subscriptions.user_id),
      role = COALESCE(EXCLUDED.role, push_subscriptions.role),
      phone = COALESCE(EXCLUDED.phone, push_subscriptions.phone),
      updated_at = CURRENT_TIMESTAMP
    RETURNING id;
  `;

  const res = await query(sql, [
    endpoint,
    p256dh,
    auth,
    userId ? String(userId) : null,
    role || 'staff',
    phone ? String(phone) : null
  ], env, ctx);

  return res.rows[0];
}

/**
 * Unsubscribe / delete a push subscription
 */
export async function removePushSubscription(endpoint, env, ctx) {
  if (!endpoint) return;
  await query('DELETE FROM push_subscriptions WHERE endpoint = $1', [endpoint], env, ctx);
}

/**
 * Send a web push notification to a single subscription using Web Crypto API
 */
async function sendToSubscription(subRow, payload, env, ctx) {
  const pushSubscription = {
    endpoint: subRow.endpoint,
    keys: {
      p256dh: subRow.p256dh,
      auth: subRow.auth
    }
  };

  const vapid = {
    subject: VAPID_SUBJECT,
    publicKey: VAPID_PUBLIC_KEY,
    privateKey: VAPID_PRIVATE_KEY
  };

  try {
    const pushPayload = await buildPushPayload(
      {
        data: typeof payload === 'string' ? payload : JSON.stringify(payload),
        options: { ttl: 86400, urgency: 'high' }
      },
      pushSubscription,
      vapid
    );

    const resp = await fetch(subRow.endpoint, {
      method: 'POST',
      headers: pushPayload.headers,
      body: pushPayload.body
    });

    if (resp.status === 201 || resp.status === 200 || resp.status === 202) {
      return { success: true, endpoint: subRow.endpoint };
    }

    const respText = await resp.text().catch(() => '');
    console.warn(`[WebPush] Server rejected push (${resp.status}): ${respText}`);

    // 404 or 410 indicates the subscription is expired or revoked by user
    if (resp.status === 404 || resp.status === 410) {
      console.log(`[WebPush] Pruning expired subscription: ${subRow.endpoint?.slice(0, 35)}...`);
      await removePushSubscription(subRow.endpoint, env, ctx).catch(() => {});
    }

    return { success: false, endpoint: subRow.endpoint, status: resp.status, error: respText };
  } catch (err) {
    console.warn(`[WebPush] Error preparing/sending push to ${subRow.endpoint?.slice(0, 35)}...:`, err.message);
    return { success: false, endpoint: subRow.endpoint, error: err.message };
  }
}

/**
 * Dispatch push notifications to roles (e.g. ['admin', 'staff'] or 'technician' or 'all')
 */
export async function dispatchPushToRoles(roles, payload, env, ctx) {
  try {
    const rawRoles = Array.isArray(roles) ? roles : [roles];
    const isAll = rawRoles.includes('all');

    let rows = [];
    if (isAll) {
      const res = await query('SELECT * FROM push_subscriptions', [], env, ctx);
      rows = res.rows || [];
    } else {
      const expanded = new Set(rawRoles);
      if (expanded.has('admin') || expanded.has('staff')) {
        expanded.add('admin');
        expanded.add('staff');
      }
      const roleList = Array.from(expanded);
      const placeholders = roleList.map((_, i) => `$${i + 1}`).join(', ');
      const res = await query(`SELECT * FROM push_subscriptions WHERE role IN (${placeholders})`, roleList, env, ctx);
      rows = res.rows || [];
    }

    if (!rows.length) {
      console.log('[WebPush] No push subscriptions registered for roles:', roles);
      return { sent: 0, total: 0 };
    }

    const promises = rows.map(sub => sendToSubscription(sub, payload, env, ctx));
    const results = await Promise.allSettled(promises);
    const sentCount = results.filter(r => r.status === 'fulfilled' && r.value?.success).length;
    console.log(`[WebPush] Dispatched push to ${sentCount}/${rows.length} subscribers.`);

    return { sent: sentCount, total: rows.length };
  } catch (err) {
    console.error('[WebPush] Error dispatching to roles:', err.message);
    return { sent: 0, error: err.message };
  }
}

/**
 * Dispatch push notification to a specific technician by ID or phone
 */
export async function dispatchPushToTechnician(techId, techPhone, payload, env, ctx) {
  try {
    const conditions = [];
    const params = [];

    if (techId) {
      params.push(String(techId));
      conditions.push(`user_id = $${params.length}`);
    }
    if (techPhone) {
      const cleanPhone = String(techPhone).replace(/\D/g, '').slice(-10);
      params.push(`%${cleanPhone}%`);
      conditions.push(`phone LIKE $${params.length}`);
    }

    let rows = [];
    if (conditions.length) {
      const sql = `SELECT * FROM push_subscriptions WHERE role = 'technician' AND (${conditions.join(' OR ')})`;
      const res = await query(sql, params, env, ctx);
      rows = res.rows || [];
    }

    // Fallback: If specific tech not yet registered, broadcast to all technician devices
    if (!rows.length) {
      const res = await query(`SELECT * FROM push_subscriptions WHERE role = 'technician'`, [], env, ctx);
      rows = res.rows || [];
    }

    if (!rows.length) return { sent: 0, total: 0 };

    const promises = rows.map(sub => sendToSubscription(sub, payload, env, ctx));
    const results = await Promise.allSettled(promises);
    const sentCount = results.filter(r => r.status === 'fulfilled' && r.value?.success).length;

    return { sent: sentCount, total: rows.length };
  } catch (err) {
    console.error('[WebPush] Error dispatching to technician:', err.message);
    return { sent: 0, error: err.message };
  }
}

/**
 * Dispatch push notification to a specific user by user_id
 */
export async function dispatchPushToUser(userId, payload, env, ctx) {
  try {
    if (!userId) return { sent: 0 };
    const res = await query('SELECT * FROM push_subscriptions WHERE user_id = $1', [String(userId)], env, ctx);
    const rows = res.rows || [];

    if (!rows.length) return { sent: 0, total: 0 };

    const promises = rows.map(sub => sendToSubscription(sub, payload, env, ctx));
    const results = await Promise.allSettled(promises);
    const sentCount = results.filter(r => r.status === 'fulfilled' && r.value?.success).length;

    return { sent: sentCount, total: rows.length };
  } catch (err) {
    console.error('[WebPush] Error dispatching to user:', err.message);
    return { sent: 0, error: err.message };
  }
}

/**
 * Send an immediate test push to a specific endpoint
 */
export async function sendTestPush(subscription, env, ctx) {
  return sendToSubscription(subscription, {
    title: '☀️ Eco Green Support — Test Alert',
    body: 'OS-level background push notification is active and working properly!',
    url: '/complaints',
    tag: `test-push-${Date.now()}`
  }, env, ctx);
}
