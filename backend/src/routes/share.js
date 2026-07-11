const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');
const router = express.Router();

const { requireAuth } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');
const { query } = require('../db');
const { generateDownloadUrl, generatePreviewUrl } = require('../services/s3');
const { logAction, createNotification } = require('../services/audit');
const { checkForAnomalies, checkPasswordBruteForce } = require('../services/anomaly');
const { sendShareAccessEmail, sendShareLinkExpiredEmail } = require('../services/email');
const logger = require('../utils/logger');

const shareLimiter = rateLimit({ windowMs: 60 * 1000, max: 20 });

// ── POST /files/:id/share — create share link (auth required) ────────────────
router.post('/files/:id/share', requireAuth, validate(schemas.createShareLink), async (req, res) => {
  const { expiresAt, password, permission, isOneTime, maxAccessCount, notifyOnAccess } = req.body;

  try {
    const { rows: fileRows } = await query(
      'SELECT * FROM files WHERE id = $1 AND owner_id = $2 AND is_deleted = FALSE',
      [req.params.id, req.user.id]
    );
    if (!fileRows[0]) return res.status(404).json({ error: 'File not found' });

    const token = uuidv4().replace(/-/g, '');
    const passwordHash = password ? await bcrypt.hash(password, 12) : null;

    const { rows } = await query(
      `INSERT INTO share_links
         (file_id, token, created_by, expires_at, password_hash, permission, is_one_time, max_access_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, token`,
      [req.params.id, token, req.user.id, expiresAt || null, passwordHash, permission, isOneTime, maxAccessCount || null]
    );

    await query('UPDATE files SET is_shared = TRUE WHERE id = $1', [req.params.id]);
    await logAction({ userId: req.user.id, actionType: 'share_link_created', fileId: req.params.id, fileName: fileRows[0].file_name, ipAddress: req.clientIp, metadata: { token, permission, isOneTime, hasPassword: !!password } });

    res.json({
      shareLink: { id: rows[0].id, token: rows[0].token },
      url: `${process.env.APP_URL}/share/${rows[0].token}`,
    });
  } catch (err) {
    logger.error('Create share link error:', err.message);
    res.status(500).json({ error: 'Failed to create share link' });
  }
});

// ── GET /share/links — list all share links for the auth'd user ──────────────
router.get('/links', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT sl.id, sl.token, sl.file_id, f.file_name, sl.created_at,
              sl.expires_at, sl.permission, sl.is_one_time, sl.max_access_count,
              sl.access_count, sl.is_active,
              sl.password_hash IS NOT NULL AS has_password,
              (SELECT json_agg(json_build_object('accessed_at', sa.accessed_at, 'ip_address', sa.ip_address, 'country', sa.country_code))
               FROM share_accesses sa WHERE sa.share_link_id = sl.id ORDER BY sa.accessed_at DESC LIMIT 5) AS recent_accesses
       FROM share_links sl
       JOIN files f ON f.id = sl.file_id
       WHERE sl.created_by = $1
       ORDER BY sl.created_at DESC`,
      [req.user.id]
    );
    res.json({ links: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list share links' });
  }
});

// ── DELETE /share/links/:id — revoke a share link ───────────────────────────
router.delete('/links/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE share_links SET is_active = FALSE
       WHERE id = $1 AND created_by = $2
       RETURNING id, file_id, token`,
      [req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Share link not found' });

    await logAction({ userId: req.user.id, actionType: 'share_link_revoked', fileId: rows[0].file_id, metadata: { token: rows[0].token } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to revoke share link' });
  }
});

// ── GET /share/:token — public share resolution (no auth required) ───────────
router.get('/:token', shareLimiter, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT sl.*, f.file_name, f.mime_type, f.size_bytes, f.current_s3_key,
              f.owner_id, u.email AS owner_email
       FROM share_links sl
       JOIN files f ON f.id = sl.file_id
       JOIN users u ON u.id = f.owner_id
       WHERE sl.token = $1 AND f.is_deleted = FALSE`,
      [req.params.token]
    );

    if (!rows[0]) return res.status(404).json({ error: 'Share link not found' });
    const link = rows[0];

    // Check link validity
    if (!link.is_active) return res.status(410).json({ error: 'This share link has been revoked.' });
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      await query('UPDATE share_links SET is_active = FALSE WHERE id = $1', [link.id]);
      return res.status(410).json({ error: 'This share link has expired.' });
    }
    if (link.max_access_count && link.access_count >= link.max_access_count) {
      await query('UPDATE share_links SET is_active = FALSE WHERE id = $1', [link.id]);
      return res.status(410).json({ error: 'This share link has reached its access limit.' });
    }

    // If password protected, return metadata only — client must POST password next
    if (link.password_hash) {
      return res.json({
        requiresPassword: true,
        fileName: link.file_name,
        permission: link.permission,
        mimeType: link.mime_type,
        sizeBytes: link.size_bytes,
      });
    }

    await resolveAccess(link, req, res);
  } catch (err) {
    logger.error('Share resolve error:', err.message);
    res.status(500).json({ error: 'Failed to resolve share link' });
  }
});

// ── POST /share/:token/access — submit password for protected links ──────────
router.post('/:token/access', shareLimiter, validate(schemas.sharePasswordAttempt), async (req, res) => {
  const { password } = req.body;

  try {
    const { rows } = await query(
      `SELECT sl.*, f.file_name, f.mime_type, f.size_bytes, f.current_s3_key, f.owner_id, u.email AS owner_email
       FROM share_links sl JOIN files f ON f.id = sl.file_id JOIN users u ON u.id = f.owner_id
       WHERE sl.token = $1 AND f.is_deleted = FALSE`,
      [req.params.token]
    );

    if (!rows[0]) return res.status(404).json({ error: 'Share link not found' });
    const link = rows[0];

    if (!link.is_active) return res.status(410).json({ error: 'Share link has been revoked.' });

    if (!link.password_hash) return res.status(400).json({ error: 'This link is not password protected.' });

    const correct = await bcrypt.compare(password, link.password_hash);
    if (!correct) {
      await logAction({ actionType: 'share_link_password_fail', fileId: link.file_id, fileName: link.file_name, ipAddress: req.clientIp, metadata: { shareLinkId: link.id } });
      await checkPasswordBruteForce(link.id, link.owner_id);
      return res.status(401).json({ error: 'Incorrect password.' });
    }

    await resolveAccess(link, req, res);
  } catch (err) {
    logger.error('Share password verify error:', err.message);
    res.status(500).json({ error: 'Failed to verify password' });
  }
});

async function resolveAccess(link, req, res) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip;

  // Increment access count
  await query('UPDATE share_links SET access_count = access_count + 1 WHERE id = $1', [link.id]);

  // Record access
  await query(
    'INSERT INTO share_accesses (share_link_id, ip_address, user_agent) VALUES ($1, $2, $3)',
    [link.id, ip, req.headers['user-agent']]
  );

  // One-time: deactivate after first access
  if (link.is_one_time) {
    await query('UPDATE share_links SET is_active = FALSE WHERE id = $1', [link.id]);
  }

  await logAction({
    userId: link.owner_id,
    actionType: 'share_link_accessed',
    fileId: link.file_id,
    fileName: link.file_name,
    ipAddress: ip,
    userAgent: req.headers['user-agent'],
    metadata: { shareLinkId: link.id, permission: link.permission },
  });

  // Anomaly check
  await checkForAnomalies({
    userId: link.owner_id,
    fileId: link.file_id,
    shareLinkId: link.id,
    actionType: 'share_link_accessed',
    ipAddress: ip,
    hour: new Date().getUTCHours(),
  });

  // Notification to owner
  await createNotification({
    userId: link.owner_id,
    type: 'share_accessed',
    title: `"${link.file_name}" was accessed`,
    body: `Your shared file was ${link.permission === 'download' ? 'downloaded' : 'viewed'} from ${ip}.`,
    relatedFileId: link.file_id,
  });

  // Generate the appropriate URL based on permission
  let fileUrl;
  if (link.permission === 'download') {
    fileUrl = await generateDownloadUrl(link.current_s3_key, 900, link.file_name);
  } else {
    fileUrl = await generatePreviewUrl(link.current_s3_key);
  }

  res.json({
    fileName: link.file_name,
    mimeType: link.mime_type,
    sizeBytes: link.size_bytes,
    permission: link.permission,
    fileUrl,
    accessCount: link.access_count + 1,
  });
}

module.exports = router;
