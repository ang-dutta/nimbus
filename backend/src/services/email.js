const sgMail = require('@sendgrid/mail');
const logger = require('../utils/logger');

sgMail.setApiKey(process.env.SENDGRID_API_KEY || '');

const FROM = process.env.SENDGRID_FROM_EMAIL || 'noreply@nimbus.app';
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

/**
 * Generic email sender with a clean, minimal template.
 */
async function sendEmail({ to, subject, preheader, headline, body, ctaLabel, ctaUrl }) {
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; background: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .wrapper { max-width: 560px; margin: 40px auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .header { background: #0f172a; padding: 24px 32px; }
    .header span { color: #e2e8f0; font-size: 18px; font-weight: 600; letter-spacing: -0.3px; }
    .header span em { color: #60a5fa; font-style: normal; }
    .body { padding: 32px; color: #1e293b; }
    .body h2 { margin: 0 0 12px; font-size: 20px; font-weight: 600; color: #0f172a; }
    .body p { margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #475569; }
    .cta { display: inline-block; background: #2563eb; color: #fff !important; padding: 12px 24px; border-radius: 6px; font-size: 14px; font-weight: 600; text-decoration: none; }
    .footer { padding: 20px 32px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header"><span>nim<em>bus</em></span></div>
    <div class="body">
      <h2>${headline}</h2>
      <p>${body}</p>
      ${ctaLabel && ctaUrl ? `<a href="${ctaUrl}" class="cta">${ctaLabel}</a>` : ''}
    </div>
    <div class="footer">
      You're receiving this from Nimbus. <a href="${APP_URL}/dashboard/notifications" style="color:#64748b;">Manage notifications</a>
    </div>
  </div>
</body>
</html>`;

  try {
    await sgMail.send({
      to,
      from: FROM,
      subject,
      text: `${headline}\n\n${body}${ctaUrl ? `\n\n${ctaLabel}: ${ctaUrl}` : ''}`,
      html,
    });
    logger.info(`Email sent to ${to}: ${subject}`);
  } catch (err) {
    logger.error('SendGrid error:', err.response?.body || err.message);
  }
}

// ─── Named email types ──────────────────────────────────────────────────────

async function sendShareAccessEmail({ to, fileName, ip, accessedAt }) {
  return sendEmail({
    to,
    subject: `Your shared file "${fileName}" was accessed`,
    headline: 'Someone accessed your shared file',
    body: `"${fileName}" was viewed or downloaded at ${new Date(accessedAt).toUTCString()} from IP ${ip || 'unknown'}.`,
    ctaLabel: 'View share details',
    ctaUrl: `${APP_URL}/dashboard/shared`,
  });
}

async function sendScanFlaggedEmail({ to, fileName, findings }) {
  const summary = findings.slice(0, 3).map((f) => `• ${f.patternName} (${f.severity}) at line ${f.lineNumber}`).join('\n');
  return sendEmail({
    to,
    subject: `Security alert: "${fileName}" contains exposed credentials`,
    headline: 'Credential exposure detected',
    body: `Your file "${fileName}" was flagged by Nimbus's security scanner:<br><br><code style="font-size:13px;color:#dc2626">${summary.replace(/\n/g, '<br>')}</code><br><br>The upload proceeded because you acknowledged the warning, but we strongly recommend revoking any exposed credentials immediately.`,
    ctaLabel: 'View scan results',
    ctaUrl: `${APP_URL}/dashboard`,
  });
}

async function sendAnomalyEmail({ to, anomalyType, basis }) {
  return sendEmail({
    to,
    subject: `Security alert: ${formatAnomalyType(anomalyType)} detected`,
    headline: `${formatAnomalyType(anomalyType)} on your account`,
    body: basis,
    ctaLabel: 'Review security alerts',
    ctaUrl: `${APP_URL}/dashboard/security`,
  });
}

async function sendShareLinkExpiredEmail({ to, fileName }) {
  return sendEmail({
    to,
    subject: `Share link for "${fileName}" has expired`,
    headline: 'Share link expired',
    body: `The share link for "${fileName}" has reached its expiry date or access limit and is no longer active.`,
    ctaLabel: 'Create a new share link',
    ctaUrl: `${APP_URL}/dashboard/shared`,
  });
}

function formatAnomalyType(type) {
  return {
    access_frequency_spike: 'Unusual access frequency',
    new_geography: 'Access from new location',
    off_hours_access: 'Off-hours file access',
    repeated_password_failure: 'Repeated failed password attempts',
  }[type] || type;
}

module.exports = {
  sendEmail,
  sendShareAccessEmail,
  sendScanFlaggedEmail,
  sendAnomalyEmail,
  sendShareLinkExpiredEmail,
};
