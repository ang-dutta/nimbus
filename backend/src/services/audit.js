const { query } = require('../db');
const { pushRealtimeNotification } = require('../utils/firebase');
const logger = require('../utils/logger');

/**
 * Log a file action to the audit_logs table.
 * All parameters are optional except userId and actionType.
 */
async function logAction({
  userId,
  actionType,
  fileId = null,
  fileName = null,
  ipAddress = null,
  userAgent = null,
  metadata = {},
  isAnomalous = false,
}) {
  try {
    const { rows } = await query(
      `INSERT INTO audit_logs
         (user_id, action_type, file_id, file_name, ip_address, user_agent, metadata, is_anomalous)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [userId, actionType, fileId, fileName, ipAddress, userAgent, JSON.stringify(metadata), isAnomalous]
    );
    return rows[0].id;
  } catch (err) {
    // Audit logging should never crash the main request
    logger.error('Failed to write audit log:', err.message);
    return null;
  }
}

/**
 * Create a notification in PostgreSQL and push it to Firebase Realtime Database.
 */
async function createNotification({ userId, type, title, body, relatedFileId = null }) {
  try {
    // Persist in Postgres
    const { rows } = await query(
      `INSERT INTO notifications (user_id, type, title, body, related_file_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [userId, type, title, body, relatedFileId]
    );

    // Push to Firebase for real-time delivery
    await pushRealtimeNotification(userId, {
      dbId: rows[0].id,
      type,
      title,
      body,
      relatedFileId,
    });

    return rows[0].id;
  } catch (err) {
    logger.error('Failed to create notification:', err.message);
    return null;
  }
}

/**
 * Human-readable action type labels used in the audit log UI.
 */
const ACTION_LABELS = {
  file_upload: 'File uploaded',
  file_download: 'File downloaded',
  file_preview: 'File previewed',
  file_rename: 'File renamed',
  file_delete: 'File deleted',
  file_restore: 'File restored from trash',
  file_hard_delete: 'File permanently deleted',
  version_upload: 'New version uploaded',
  version_restore: 'Version restored',
  share_link_created: 'Share link created',
  share_link_revoked: 'Share link revoked',
  share_link_accessed: 'Share link accessed',
  share_link_expired: 'Share link expired',
  share_link_password_fail: 'Share link password failed',
  scan_triggered: 'Security scan triggered',
  scan_flagged: 'Security scan flagged issues',
  anomaly_detected: 'Anomaly detected',
  quota_warning: 'Storage quota warning',
};

module.exports = { logAction, createNotification, ACTION_LABELS };
