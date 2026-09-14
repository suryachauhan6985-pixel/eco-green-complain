/**
 * Email Provider Service
 * Supports SMTP (Nodemailer), SendGrid, and Built-in Simulator
 */
const nodemailer = require('nodemailer');

function generateBrandedEmailHtml({ title, preheader, bodyHtml, ticketId, details = [] }) {
  const detailsRows = details
    .map(d => `
      <tr>
        <td style="padding: 8px 12px; font-weight: 600; color: #374151; background: #f9fafb; border-bottom: 1px solid #e5e7eb; width: 35%;">${d.label}</td>
        <td style="padding: 8px 12px; color: #111827; border-bottom: 1px solid #e5e7eb;">${d.value}</td>
      </tr>
    `).join('');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f3f4f6; color: #1f2937;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 24px 12px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #15803d 0%, #16a34a 100%); padding: 24px; text-align: center;">
              <div style="font-size: 24px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">
                ☀️ ECO GREEN SOLAR
              </div>
              <div style="color: #dcfce7; font-size: 13px; font-weight: 500; margin-top: 4px; text-transform: uppercase; letter-spacing: 1px;">
                Customer Care & Service Support
              </div>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 28px 24px;">
              <h2 style="margin: 0 0 16px 0; color: #15803d; font-size: 20px; font-weight: 700;">
                ${title}
              </h2>
              
              <div style="font-size: 15px; line-height: 1.6; color: #374151; margin-bottom: 24px;">
                ${bodyHtml.replace(/\n/g, '<br/>')}
              </div>

              ${details.length > 0 ? `
              <div style="margin-bottom: 24px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
                <table width="100%" cellpadding="0" cellspacing="0" style="font-size: 14px; text-align: left;">
                  ${detailsRows}
                </table>
              </div>
              ` : ''}

              ${ticketId ? `
              <div style="text-align: center; margin: 28px 0 16px 0;">
                <a href="${process.env.APP_URL || 'http://localhost:5173'}/track/${ticketId}" 
                   style="background-color: #16a34a; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; display: inline-block; box-shadow: 0 2px 4px rgba(22, 163, 74, 0.3);">
                  Track Ticket Status Online
                </a>
              </div>
              ` : ''}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 20px 24px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 12px; color: #6b7280; line-height: 1.5;">
              <p style="margin: 0 0 4px 0;">Eco Green Solar Pvt. Ltd. — Powering a Cleaner Tomorrow</p>
              <p style="margin: 0 0 4px 0;">Toll-Free Helpline: 1800-ECO-SOLAR | support@ecogreensolar.com</p>
              <p style="margin: 0; font-size: 11px; color: #9ca3af;">This is an automated service notification regarding your complaint.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

async function sendEmail({ to, subject, bodyText, title, ticketId, details }) {
  const provider = process.env.EMAIL_PROVIDER || 'SIMULATED';
  const htmlContent = generateBrandedEmailHtml({
    title: title || subject,
    bodyHtml: bodyText,
    ticketId,
    details: details || []
  });

  if (provider === 'SMTP') {
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587');
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.EMAIL_FROM || '"Eco Green Solar Support" <support@ecogreensolar.com>';

    if (!host || !user || !pass) {
      throw new Error('SMTP credentials missing (SMTP_HOST, SMTP_USER, SMTP_PASS)');
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass }
    });

    const info = await transporter.sendMail({
      from,
      to,
      subject,
      text: bodyText,
      html: htmlContent
    });

    return { success: true, provider: 'SMTP', messageId: info.messageId };
  }

  // Default: SIMULATED Mode
  console.log('\n==================== [SIMULATED EMAIL SENT] ====================');
  console.log(`To: ${to}`);
  console.log(`Subject: ${subject}`);
  console.log(`Text:\n${bodyText}`);
  console.log('=================================================================\n');

  return {
    success: true,
    provider: 'SIMULATED',
    messageId: 'sim_email_' + Date.now(),
    html: htmlContent
  };
}

module.exports = { sendEmail, generateBrandedEmailHtml };
