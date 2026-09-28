const db = require('../config/database');

/**
 * WhatsApp Dynamic Template Service
 * Meta WhatsApp Business Platform is the SOLE AUTHORITATIVE SOURCE of truth.
 * No hardcoded template definitions exist in source code.
 */

function getMetaCredentials() {
  const wabaId = process.env.META_WABA_ID || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '1015283491554000';
  const token = process.env.META_ACCESS_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_NUMBER_ID || '1387211441132836';
  return { wabaId, token, phoneNumberId };
}

/**
 * Extracts and parses structured components from Meta template definition
 */
function parseMetaComponents(components = []) {
  let headerText = '';
  let bodyText = '';
  let footerText = '';
  let buttons = [];
  const variables = [];

  if (!Array.isArray(components)) return { headerText, bodyText, footerText, buttons, variables };

  for (const comp of components) {
    if (comp.type === 'HEADER') {
      if (comp.format === 'TEXT') {
        headerText = comp.text || '';
      }
    } else if (comp.type === 'BODY') {
      bodyText = comp.text || '';
      // Extract named parameters from example if present
      if (comp.example?.body_text_named_params) {
        comp.example.body_text_named_params.forEach(p => {
          variables.push({
            name: p.param_name,
            example: p.example || '',
            type: 'named'
          });
        });
      } else if (comp.example?.body_text?.[0]) {
        // Extract positional parameters from example
        comp.example.body_text[0].forEach((ex, idx) => {
          variables.push({
            index: idx + 1,
            placeholder: `{{${idx + 1}}}`,
            example: ex || '',
            type: 'positional'
          });
        });
      } else {
        // Fallback: extract placeholders using regex
        const matches = bodyText.match(/\{\{([^{}]+)\}\}/g) || [];
        matches.forEach(m => {
          const raw = m.replace(/[{}]/g, '').trim();
          const isNum = /^\d+$/.test(raw);
          variables.push({
            name: isNum ? undefined : raw,
            index: isNum ? parseInt(raw, 10) : undefined,
            placeholder: m,
            type: isNum ? 'positional' : 'named'
          });
        });
      }
    } else if (comp.type === 'FOOTER') {
      footerText = comp.text || '';
    } else if (comp.type === 'BUTTONS') {
      buttons = Array.isArray(comp.buttons) ? comp.buttons : [];
    }
  }

  return { headerText, bodyText, footerText, buttons, variables };
}

/**
 * Synchronize all templates from Meta WhatsApp Business Platform
 * Idempotent, safe, and logs audit trail.
 */
async function syncTemplatesFromMeta() {
  const { wabaId, token } = getMetaCredentials();
  const syncStartTime = new Date();

  if (!token) {
    throw new Error('Meta WhatsApp Access Token (META_ACCESS_TOKEN) is not configured.');
  }
  if (!wabaId) {
    throw new Error('Meta WhatsApp Business Account ID (META_WABA_ID) is not configured.');
  }

  const url = `https://graph.facebook.com/v21.0/${wabaId}/message_templates?fields=id,name,status,category,language,components,parameter_format&limit=100`;

  let response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
  } catch (netErr) {
    throw new Error(`Failed to connect to Meta Graph API: ${netErr.message}`);
  }

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    const errMsg = errData?.error?.message || `Meta API HTTP ${response.status}`;
    throw new Error(`Meta Graph API returned error: ${errMsg}`);
  }

  const data = await response.json();
  const metaTemplates = Array.isArray(data?.data) ? data.data : [];

  let addedCount = 0;
  let updatedCount = 0;
  let deactivatedCount = 0;
  const metaIdsSeen = new Set();

  for (const mt of metaTemplates) {
    if (!mt || !mt.name) continue;
    metaIdsSeen.add(String(mt.id));

    const { headerText, bodyText, footerText, buttons, variables } = parseMetaComponents(mt.components);
    const paramFormat = mt.parameter_format || (/\{\{[a-zA-Z_]/.test(bodyText) ? 'NAMED' : 'POSITIONAL');
    const autoAudience = (mt.name.toLowerCase().includes('technician') || mt.name.toLowerCase().includes('tech')) 
      ? 'technician' 
      : 'customer';

    // Format human-friendly display name
    const formattedName = mt.name
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());

    // Check if template exists in SQLite
    let existing = null;
    try {
      existing = db.prepare('SELECT * FROM notification_templates WHERE meta_template_id = ? OR meta_template_name = ?').get(String(mt.id), mt.name);
    } catch (_) {}

    if (existing) {
      // UPDATE existing template from Meta
      try {
        db.prepare(`
          UPDATE notification_templates SET
            meta_template_id = ?,
            meta_template_name = ?,
            meta_language = ?,
            meta_category = ?,
            meta_status = ?,
            parameter_format = ?,
            whatsapp_body = ?,
            header_text = ?,
            footer_text = ?,
            buttons_json = ?,
            components_json = ?,
            variables_json = ?,
            sync_status = 'SYNCED',
            is_active = 1,
            last_synced_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(
          String(mt.id),
          mt.name,
          mt.language || 'en_US',
          mt.category || 'UTILITY',
          mt.status || 'APPROVED',
          paramFormat,
          bodyText,
          headerText,
          footerText,
          JSON.stringify(buttons),
          JSON.stringify(mt.components || []),
          JSON.stringify(variables),
          existing.id
        );
        updatedCount++;
      } catch (err) {
        console.warn(`[TemplateSync] Failed to update template ${mt.name}:`, err.message);
      }
    } else {
      // INSERT new template from Meta
      try {
        const cleanKey = mt.name.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 50);
        db.prepare(`
          INSERT INTO notification_templates (
            meta_template_id, template_key, name, meta_template_name,
            meta_language, meta_category, meta_status, parameter_format,
            whatsapp_body, header_text, footer_text, buttons_json,
            components_json, variables_json, audience, trigger_event,
            channel, is_active, sync_status, last_synced_at, email_subject, email_body,
            created_at, updated_at
          ) VALUES (
            ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?,
            'whatsapp', 1, 'SYNCED', CURRENT_TIMESTAMP, ?, ?,
            CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          )
        `).run(
          String(mt.id),
          cleanKey,
          formattedName,
          mt.name,
          mt.language || 'en_US',
          mt.category || 'UTILITY',
          mt.status || 'APPROVED',
          paramFormat,
          bodyText,
          headerText,
          footerText,
          JSON.stringify(buttons),
          JSON.stringify(mt.components || []),
          JSON.stringify(variables),
          autoAudience,
          cleanKey,
          `[Eco Green Solar] ${formattedName}`,
          bodyText
        );
        addedCount++;
      } catch (err) {
        console.warn(`[TemplateSync] Failed to insert new template ${mt.name}:`, err.message);
      }
    }
  }

  // Deactivate templates that were marked SYNCED but are no longer in Meta
  try {
    const allLocal = db.prepare("SELECT id, meta_template_id, name FROM notification_templates WHERE sync_status = 'SYNCED'").all();
    for (const loc of allLocal) {
      if (loc.meta_template_id && !metaIdsSeen.has(String(loc.meta_template_id))) {
        db.prepare("UPDATE notification_templates SET sync_status = 'DELETED_IN_META', is_active = 0 WHERE id = ?").run(loc.id);
        deactivatedCount++;
      }
    }
  } catch (_) {}

  // Log sync audit record
  try {
    db.prepare(`
      INSERT INTO template_sync_logs (
        sync_started_at, sync_completed_at, total_meta_templates,
        added_count, updated_count, deactivated_count, status
      ) VALUES (?, CURRENT_TIMESTAMP, ?, ?, ?, ?, 'SUCCESS')
    `).run(
      syncStartTime.toISOString(),
      metaTemplates.length,
      addedCount,
      updatedCount,
      deactivatedCount
    );
  } catch (logErr) {
    console.warn('[TemplateSync] Audit log note:', logErr.message);
  }

  // Fetch updated templates
  let currentList = [];
  try {
    currentList = db.prepare('SELECT * FROM notification_templates ORDER BY audience ASC, id ASC').all();
  } catch (_) {}

  return {
    success: true,
    totalMeta: metaTemplates.length,
    addedCount,
    updatedCount,
    deactivatedCount,
    lastSyncedAt: new Date().toISOString(),
    templates: currentList
  };
}

/**
 * Builds the WhatsApp Cloud API payload dynamically from the stored Meta template definition.
 * Strictly avoids hardcoded template structures.
 */
function buildDynamicPayload(template, targetPhone, context = {}) {
  const cleanPhone = String(targetPhone).replace(/\D/g, '');
  const formattedPhone = cleanPhone.startsWith('91') && cleanPhone.length === 12 
    ? cleanPhone 
    : (cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone);

  const components = template.components_json 
    ? (typeof template.components_json === 'string' ? JSON.parse(template.components_json) : template.components_json)
    : [];

  const paramFormat = template.parameter_format || 'POSITIONAL';
  const metaTemplateName = template.meta_template_name || template.template_key;
  const metaLanguage = template.meta_language || 'en_US';

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: formattedPhone,
    type: 'template',
    template: {
      name: metaTemplateName,
      language: { code: metaLanguage },
      components: []
    }
  };

  // Helper to resolve application context variable safely
  const resolveValue = (key) => {
    if (!key) return '';
    const norm = String(key).toLowerCase().replace(/[^a-z0-9_]/g, '');
    
    // Explicit standard aliases
    if (norm === 'portal_url' || norm === 'technician_portal_url' || norm === 'tech_portal_url') {
      return context.portal_url || context.technician_portal_url || 'https://complain.ecogreensolar.co.in/technician';
    }
    if (norm === 'feedback_url' || norm === 'tracking_url' || norm === 'track_url') {
      return context.feedback_url || context.tracking_url || 'https://complain.ecogreensolar.co.in';
    }
    if (norm === 'complaint_id' || norm === 'ticket_id') {
      return context.complaint_id || context.ticket_id || 'Ticket';
    }
    if (norm === 'reopen_reason' || norm === 'reason') {
      return context.reopen_reason || context.reason || 'Follow-up requested';
    }
    if (norm === 'new_technician_name' || norm === 'new_tech') {
      return context.new_technician_name || 'assigned specialist';
    }
    if (norm === 'charges_line') {
      return context.charges_line || '';
    }
    if (norm === 'date') {
      return context.date || new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    // Direct context match or case-insensitive match
    if (context[key] !== undefined && context[key] !== null) return String(context[key]);
    for (const [k, v] of Object.entries(context)) {
      if (k.toLowerCase().replace(/[^a-z0-9_]/g, '') === norm) {
        return v !== undefined && v !== null ? String(v) : '';
      }
    }
    return '';
  };

  // Process BODY parameters dynamically
  const bodyComp = components.find(c => c.type === 'BODY');
  if (bodyComp) {
    const bodyParameters = [];

    if (paramFormat === 'NAMED' && bodyComp.example?.body_text_named_params) {
      for (const p of bodyComp.example.body_text_named_params) {
        const rawParamName = p.param_name;
        // Meta enforces max 20 chars on parameter_name in the send payload
        const safeParamName = rawParamName.length > 20 
          ? (rawParamName === 'technician_portal_url' ? 'portal_url' : rawParamName.slice(0, 20))
          : rawParamName;

        const val = resolveValue(rawParamName) || p.example || '-';
        bodyParameters.push({
          type: 'text',
          parameter_name: safeParamName,
          text: String(val)
        });
      }
    } else if (paramFormat === 'POSITIONAL' && bodyComp.example?.body_text?.[0]) {
      const examples = bodyComp.example.body_text[0];
      for (let i = 0; i < examples.length; i++) {
        const idx = i + 1;
        // Context positional lookup or fallback to common variable array
        const posValue = resolveValue(idx) || (context.positionalParams && context.positionalParams[i]) || examples[i] || '-';
        bodyParameters.push({
          type: 'text',
          text: String(posValue)
        });
      }
    } else {
      // Regex extraction from body text
      const matches = (bodyComp.text || '').match(/\{\{([^{}]+)\}\}/g) || [];
      for (const m of matches) {
        const raw = m.replace(/[{}]/g, '').trim();
        const isNum = /^\d+$/.test(raw);
        if (isNum) {
          const idx = parseInt(raw, 10);
          const val = (context.positionalParams && context.positionalParams[idx - 1]) || resolveValue(idx) || '-';
          bodyParameters.push({ type: 'text', text: String(val) });
        } else {
          const safeName = raw.length > 20 ? (raw === 'technician_portal_url' ? 'portal_url' : raw.slice(0, 20)) : raw;
          const val = resolveValue(raw) || '-';
          bodyParameters.push({ type: 'text', parameter_name: safeName, text: String(val) });
        }
      }
    }

    if (bodyParameters.length > 0) {
      payload.template.components.push({
        type: 'body',
        parameters: bodyParameters
      });
    }
  }

  return payload;
}

module.exports = {
  syncTemplatesFromMeta,
  buildDynamicPayload,
  parseMetaComponents,
  getMetaCredentials
};
