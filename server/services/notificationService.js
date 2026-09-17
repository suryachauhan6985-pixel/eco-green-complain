const EventEmitter = require('events');
const db = require('../config/database');
const { sendWhatsAppMessage } = require('./whatsappProvider');
const { sendEmail } = require('./emailProvider');

class NotificationService extends EventEmitter {
  constructor() {
    super();
    this.simulatedBuffer = []; // In-memory buffer for real-time live preview in UI
  }

  getSimulatedBuffer() {
    return this.simulatedBuffer.slice(0, 50);
  }

  clearSimulatedBuffer() {
    this.simulatedBuffer = [];
  }

  renderTemplate(templateString, data) {
    if (!templateString) return '';
    return templateString.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return data[key] !== undefined && data[key] !== null ? String(data[key]) : '';
    });
  }

  getTemplate(templateKey) {
    if (templateKey === 'technician_work_order') {
      return {
        template_key: 'technician_work_order',
        name: 'Technician Field Work Order',
        whatsapp_body: '{{whatsapp_body}}',
        email_subject: 'Work Order: {{complaint_id}}',
        email_body: '{{whatsapp_body}}'
      };
    }
    const row = db.prepare('SELECT * FROM notification_templates WHERE template_key = ?').get(templateKey);
    return row;
  }

  async dispatchAsync(notificationPayload) {
    // Non-blocking async queue
    setImmediate(async () => {
      try {
        await this.dispatch(notificationPayload);
      } catch (err) {
        console.error('Async notification dispatch error:', err);
      }
    });
  }

  async dispatch({ complaintId, templateKey, data, channels = ['whatsapp', 'email'], forceWhatsAppTo, forceEmailTo }) {
    const template = this.getTemplate(templateKey);
    if (!template) {
      console.warn(`[NotificationService] Template key "${templateKey}" not found`);
      return;
    }

    const complaint = complaintId 
      ? db.prepare('SELECT * FROM complaints WHERE id = ?').get(complaintId)
      : null;

      const liveAppUrl = (process.env.APP_URL && !process.env.APP_URL.includes('localhost'))
        ? process.env.APP_URL
        : 'https://eco-green-complain.vprotech.online';

      const mergedData = {
        customer_name: complaint?.customer_name || data?.customer_name || 'Valued Customer',
        complaint_id: complaint?.ticket_id || data?.ticket_id || '',
        product_type: complaint?.product_type || data?.product_type || '',
        issue_category: complaint?.issue_category || data?.issue_category || '',
        status: complaint?.status || data?.status || '',
        technician_name: data?.technician_name || 'Eco Green Service Specialist',
        technician_phone: data?.technician_phone || '+91 78784 44414',
        expected_visit_date: data?.expected_visit_date || 'Within 24-48 Hours',
        notes: data?.notes || '',
        estimated_charges: complaint?.estimated_charges || data?.estimated_charges || 0,
        charges_line: (complaint?.notify_charges || data?.notify_charges) && (complaint?.estimated_charges || data?.estimated_charges) > 0
          ? `\n💰 *Estimated Service Charge:* ₹${complaint?.estimated_charges || data?.estimated_charges}`
          : '',
        feedback_url: `${liveAppUrl}/track/${complaint?.ticket_id || data?.ticket_id || ''}`,
        date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
        ...data
      };

      const targetPhone = forceWhatsAppTo || complaint?.customer_phone || data?.phone;
      const targetEmail = forceEmailTo || complaint?.customer_email || data?.email;

      // Send WhatsApp if phone present and channel selected
      if (channels.includes('whatsapp') && targetPhone) {
        const { normalizePhone } = require('../utils/phoneNormalizer');
        const canonicalTargetPhone = normalizePhone(targetPhone);
        const renderedWhatsApp = this.renderTemplate(template.whatsapp_body, mergedData);
        let status = 'sent';
        let errorMsg = null;
        let providerName = process.env.WHATSAPP_PROVIDER || 'SIMULATED';
        let sendRes = null;

        try {
          sendRes = await sendWhatsAppMessage({
            to: canonicalTargetPhone,
            message: renderedWhatsApp,
            templateName: templateKey,
            variables: mergedData
          });
          providerName = sendRes.provider;
        } catch (err) {
          status = 'failed';
          errorMsg = err.message;
          console.error(`WhatsApp dispatch failed to ${canonicalTargetPhone}:`, err.message);
        }

        const messageDelivered = sendRes?.deliveredMessage || renderedWhatsApp;

        const logStmt = db.prepare(`
          INSERT INTO notification_logs (complaint_id, channel, recipient, template_key, rendered_content, status, error_message, provider)
          VALUES (?, 'whatsapp', ?, ?, ?, ?, ?, ?)
        `);
        const logResult = logStmt.run(
          complaintId || null,
          canonicalTargetPhone,
          templateKey,
          messageDelivered,
          status,
          errorMsg,
          providerName
        );

        // Also record into whatsapp_messages for the 2-way chat conversation
        try {
          db.prepare(`
            INSERT INTO whatsapp_messages (
              complaint_id, phone, sender_type, sender_name, message_body, status, wam_id, template_name, failure_reason
            ) VALUES (?, ?, 'company', 'Eco Green Solar', ?, ?, ?, ?, ?)
          `).run(
            complaintId || null,
            canonicalTargetPhone,
            messageDelivered,
            status,
            sendRes?.messageId || null,
            templateKey,
            errorMsg || null
          );
        } catch (waMsgErr) {
          console.warn('[NotificationService] Error saving to whatsapp_messages:', waMsgErr.message);
        }

      const logItem = {
        id: logResult.lastInsertRowid,
        complaint_id: complaintId,
        ticket_id: mergedData.complaint_id,
        channel: 'whatsapp',
        recipient: targetPhone,
        template_key: templateKey,
        rendered_content: renderedWhatsApp,
        status,
        error_message: errorMsg,
        provider: providerName,
        created_at: new Date().toISOString()
      };

      this.simulatedBuffer.unshift(logItem);
      this.emit('notification', logItem);
    }

    // Send Email if email present and channel selected
    if (channels.includes('email') && targetEmail) {
      const renderedSubject = this.renderTemplate(template.email_subject, mergedData);
      const renderedEmailBody = this.renderTemplate(template.email_body, mergedData);
      let status = 'sent';
      let errorMsg = null;
      let providerName = process.env.EMAIL_PROVIDER || 'SIMULATED';

      try {
        const details = [
          { label: 'Ticket ID', value: mergedData.complaint_id },
          { label: 'Product Type', value: mergedData.product_type },
          { label: 'Current Status', value: mergedData.status }
        ];
        if (mergedData.technician_name && mergedData.technician_name !== 'Eco Green Service Specialist') {
          details.push({ label: 'Assigned Technician', value: `${mergedData.technician_name} (${mergedData.technician_phone || 'N/A'})` });
        }
        if (mergedData.expected_visit_date) {
          details.push({ label: 'Expected Visit Date', value: mergedData.expected_visit_date });
        }

        const res = await sendEmail({
          to: targetEmail,
          subject: renderedSubject,
          bodyText: renderedEmailBody,
          title: renderedSubject,
          ticketId: mergedData.complaint_id,
          details
        });
        providerName = res.provider;
      } catch (err) {
        status = 'failed';
        errorMsg = err.message;
        console.error(`Email dispatch failed to ${targetEmail}:`, err.message);
      }

      const logStmt = db.prepare(`
        INSERT INTO notification_logs (complaint_id, channel, recipient, template_key, rendered_content, status, error_message, provider)
        VALUES (?, 'email', ?, ?, ?, ?, ?, ?)
      `);
      const logResult = logStmt.run(
        complaintId || null,
        targetEmail,
        templateKey,
        `Subject: ${renderedSubject}\n\n${renderedEmailBody}`,
        status,
        errorMsg,
        providerName
      );

      const logItem = {
        id: logResult.lastInsertRowid,
        complaint_id: complaintId,
        ticket_id: mergedData.complaint_id,
        channel: 'email',
        recipient: targetEmail,
        template_key: templateKey,
        subject: renderedSubject,
        rendered_content: renderedEmailBody,
        status,
        error_message: errorMsg,
        provider: providerName,
        created_at: new Date().toISOString()
      };

      this.simulatedBuffer.unshift(logItem);
      this.emit('notification', logItem);
    }
  }

  async resendNotification(logId) {
    const log = db.prepare('SELECT * FROM notification_logs WHERE id = ?').get(logId);
    if (!log) {
      throw new Error('Notification log entry not found');
    }

    let status = 'sent';
    let errorMsg = null;
    let providerName = log.channel === 'whatsapp' 
      ? (process.env.WHATSAPP_PROVIDER || 'SIMULATED')
      : (process.env.EMAIL_PROVIDER || 'SIMULATED');

    try {
      if (log.channel === 'whatsapp') {
        await sendWhatsAppMessage({
          to: log.recipient,
          message: log.rendered_content,
          templateName: log.template_key
        });
      } else {
        const subjectMatch = log.rendered_content.match(/^Subject: (.*)\n\n([\s\S]*)$/);
        const subject = subjectMatch ? subjectMatch[1] : 'Eco Green Solar Update';
        const bodyText = subjectMatch ? subjectMatch[2] : log.rendered_content;

        await sendEmail({
          to: log.recipient,
          subject,
          bodyText,
          title: subject
        });
      }
    } catch (err) {
      status = 'failed';
      errorMsg = err.message;
    }

    // Insert new attempt log
    const stmt = db.prepare(`
      INSERT INTO notification_logs (complaint_id, channel, recipient, template_key, rendered_content, status, error_message, provider)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const newLog = stmt.run(
      log.complaint_id,
      log.channel,
      log.recipient,
      log.template_key,
      log.rendered_content,
      status,
      errorMsg,
      providerName
    );

    const logItem = {
      id: newLog.lastInsertRowid,
      complaint_id: log.complaint_id,
      channel: log.channel,
      recipient: log.recipient,
      template_key: log.template_key,
      rendered_content: log.rendered_content,
      status,
      error_message: errorMsg,
      provider: providerName,
      created_at: new Date().toISOString()
    };

    this.simulatedBuffer.unshift(logItem);
    this.emit('notification', logItem);

    return logItem;
  }
}

module.exports = new NotificationService();
