const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { validateQuery, schemas } = require('../middleware/validate');
const { query } = require('../db');
const logger = require('../utils/logger');

// ────────────────────────────────────────────────────────────────────────────
// AUDIT ROUTES  /audit
// ────────────────────────────────────────────────────────────────────────────
const auditRouter = express.Router();
auditRouter.use(requireAuth);

auditRouter.get('/', validateQuery(schemas.auditLogQuery), async (req, res) => {
  const { actionType, fileId, fileName, startDate, endDate, page, limit } = req.query;
  const offset = (page - 1) * limit;
  const conditions = ['a.user_id = $1'];
  const params = [req.user.id];
  let i = 2;

  if (actionType) { conditions.push(`a.action_type = $${i++}`); params.push(actionType); }
  if (fileId)     { conditions.push(`a.file_id = $${i++}`); params.push(fileId); }
  if (fileName)   { conditions.push(`a.file_name ILIKE $${i++}`); params.push(`%${fileName}%`); }
  if (startDate)  { conditions.push(`a.created_at >= $${i++}`); params.push(startDate); }
  if (endDate)    { conditions.push(`a.created_at <= $${i++}`); params.push(endDate); }

  const where = conditions.join(' AND ');
  try {
    const [{ rows }, { rows: countRows }] = await Promise.all([
      query(`SELECT a.id, a.action_type, a.file_name, a.ip_address, a.user_agent, a.metadata, a.is_anomalous, a.created_at
             FROM audit_logs a WHERE ${where} ORDER BY a.created_at DESC LIMIT $${i} OFFSET $${i+1}`,
            [...params, limit, offset]),
      query(`SELECT COUNT(*) AS total FROM audit_logs a WHERE ${where}`, params),
    ]);
    res.json({ logs: rows, total: parseInt(countRows[0].total), page, limit });
  } catch (err) {
    logger.error('Audit log error:', err.message);
    res.status(500).json({ error: 'Failed to load audit log' });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// NOTIFICATION ROUTES  /notifications
// ────────────────────────────────────────────────────────────────────────────
const notificationsRouter = express.Router();
notificationsRouter.use(requireAuth);

notificationsRouter.get('/', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, type, title, body, is_read, related_file_id, created_at
       FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [req.user.id]
    );
    const unreadCount = rows.filter((n) => !n.is_read).length;
    res.json({ notifications: rows, unreadCount });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load notifications' });
  }
});

notificationsRouter.patch('/:id/read', async (req, res) => {
  try {
    await query('UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark notification read' });
  }
});

notificationsRouter.post('/read-all', async (req, res) => {
  try {
    await query('UPDATE notifications SET is_read = TRUE WHERE user_id = $1', [req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark all notifications read' });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// ANOMALY ROUTES  /anomalies
// ────────────────────────────────────────────────────────────────────────────
const anomaliesRouter = express.Router();
anomaliesRouter.use(requireAuth);

anomaliesRouter.get('/', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT ae.id, ae.anomaly_type, ae.severity, ae.statistical_basis, ae.is_acknowledged,
              ae.created_at, ae.related_file_id, f.file_name
       FROM anomaly_events ae LEFT JOIN files f ON f.id = ae.related_file_id
       WHERE ae.user_id = $1 ORDER BY ae.created_at DESC LIMIT 100`,
      [req.user.id]
    );
    const activeCount = rows.filter((a) => !a.is_acknowledged).length;
    res.json({ anomalies: rows, activeCount });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load anomalies' });
  }
});

anomaliesRouter.patch('/:id/acknowledge', async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE anomaly_events SET is_acknowledged = TRUE
       WHERE id = $1 AND user_id = $2 RETURNING id`,
      [req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Anomaly not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to acknowledge anomaly' });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// ANALYTICS ROUTES  /analytics
// ────────────────────────────────────────────────────────────────────────────
const analyticsRouter = express.Router();
analyticsRouter.use(requireAuth);

// Storage used over time (daily snapshots from audit log)
analyticsRouter.get('/storage', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT DATE(created_at) AS date,
              SUM(CASE WHEN action_type = 'file_upload' OR action_type = 'version_upload' THEN (metadata->>'sizeBytes')::bigint ELSE 0 END) AS uploaded_bytes,
              SUM(CASE WHEN action_type = 'file_delete' THEN -(metadata->>'sizeBytes')::bigint ELSE 0 END) AS deleted_bytes
       FROM audit_logs
       WHERE user_id = $1 AND created_at > NOW() - INTERVAL '90 days'
         AND action_type IN ('file_upload', 'version_upload', 'file_delete')
         AND metadata->>'sizeBytes' IS NOT NULL
       GROUP BY 1 ORDER BY 1`,
      [req.user.id]
    );

    // Compute running total
    let runningTotal = 0;
    const series = rows.map((r) => {
      runningTotal += (parseInt(r.uploaded_bytes || 0) - parseInt(r.deleted_bytes || 0));
      return { date: r.date, storageBytes: Math.max(0, runningTotal) };
    });

    res.json({ series, currentBytes: req.user.storage_used_bytes, quotaBytes: req.user.storage_quota_bytes });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load storage analytics' });
  }
});

// File type breakdown
analyticsRouter.get('/breakdown', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT
         CASE
           WHEN mime_type ILIKE 'image/%' THEN 'Images'
           WHEN mime_type ILIKE 'video/%' THEN 'Videos'
           WHEN mime_type IN ('application/pdf') THEN 'Documents'
           WHEN mime_type ILIKE 'text/%' OR mime_type IN ('application/json', 'application/xml') THEN 'Code & Text'
           WHEN mime_type ILIKE 'audio/%' THEN 'Audio'
           ELSE 'Other'
         END AS category,
         COUNT(*) AS file_count,
         COALESCE(SUM(size_bytes), 0) AS total_bytes
       FROM files WHERE owner_id = $1 AND is_deleted = FALSE
       GROUP BY 1 ORDER BY total_bytes DESC`,
      [req.user.id]
    );
    res.json({ breakdown: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load file type breakdown' });
  }
});

// Upload activity heatmap (last 52 weeks)
analyticsRouter.get('/activity', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT DATE(created_at) AS date, COUNT(*) AS count
       FROM audit_logs
       WHERE user_id = $1 AND action_type IN ('file_upload', 'version_upload')
         AND created_at > NOW() - INTERVAL '365 days'
       GROUP BY 1 ORDER BY 1`,
      [req.user.id]
    );
    res.json({ activity: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load activity data' });
  }
});

// Most accessed files
analyticsRouter.get('/top-files', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT f.id, f.file_name, f.size_bytes, f.mime_type,
              COUNT(a.id) AS access_count
       FROM files f
       JOIN audit_logs a ON a.file_id = f.id
       WHERE f.owner_id = $1 AND f.is_deleted = FALSE
         AND a.action_type IN ('file_download', 'file_preview', 'share_link_accessed')
       GROUP BY f.id ORDER BY access_count DESC LIMIT 10`,
      [req.user.id]
    );
    res.json({ topFiles: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load top files' });
  }
});

// Largest files
analyticsRouter.get('/largest-files', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, file_name, size_bytes, mime_type, uploaded_at
       FROM files WHERE owner_id = $1 AND is_deleted = FALSE
       ORDER BY size_bytes DESC LIMIT 10`,
      [req.user.id]
    );
    res.json({ largestFiles: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load largest files' });
  }
});

module.exports = { auditRouter, notificationsRouter, anomaliesRouter, analyticsRouter };
