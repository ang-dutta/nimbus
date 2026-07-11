const express = require('express');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const router = express.Router();

const { requireAuth } = require('../middleware/auth');
const { validate, validateQuery, schemas } = require('../middleware/validate');
const { query, withTransaction } = require('../db');
const { generateUploadUrl, generateDownloadUrl, generatePreviewUrl, buildVersionedKey } = require('../services/s3');
const { logAction, createNotification } = require('../services/audit');
const { scanCredentials } = require('../services/credentialScanner');
const { checkForAnomalies } = require('../services/anomaly');
const logger = require('../utils/logger');
const Joi = require('joi');

const uploadLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, message: { error: 'Upload rate limit exceeded' } });

// All file routes require auth
router.use(requireAuth);

// ── GET /files — list user's files ──────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT f.id, f.file_name, f.current_s3_key, f.size_bytes, f.mime_type,
              f.uploaded_at, f.last_accessed_at, f.is_shared,
              (SELECT COUNT(*) FROM file_versions WHERE file_id = f.id) AS version_count,
              (SELECT COUNT(*) FROM share_links WHERE file_id = f.id AND is_active = TRUE) AS active_shares
       FROM files f
       WHERE f.owner_id = $1 AND f.is_deleted = FALSE
       ORDER BY f.uploaded_at DESC`,
      [req.user.id]
    );
    res.json({ files: rows });
  } catch (err) {
    logger.error('List files error:', err.message);
    res.status(500).json({ error: 'Failed to list files' });
  }
});

// ── GET /files/trash — soft-deleted files ────────────────────────────────────
router.get('/trash', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, file_name, size_bytes, mime_type, deleted_at
       FROM files WHERE owner_id = $1 AND is_deleted = TRUE
       ORDER BY deleted_at DESC`,
      [req.user.id]
    );
    res.json({ files: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list trash' });
  }
});

// ── GET /files/search — full-text search ────────────────────────────────────
router.get('/search', validateQuery(Joi.object({
  q: Joi.string().min(1).max(255).required(),
  mimeType: Joi.string().optional(),
})), async (req, res) => {
  try {
    const { q, mimeType } = req.query;
    const { rows } = await query(
      `SELECT id, file_name, size_bytes, mime_type, uploaded_at, is_shared
       FROM files
       WHERE owner_id = $1
         AND is_deleted = FALSE
         AND search_vector @@ plainto_tsquery('english', $2)
         ${mimeType ? "AND mime_type ILIKE $3" : ''}
       ORDER BY ts_rank(search_vector, plainto_tsquery('english', $2)) DESC
       LIMIT 50`,
      mimeType ? [req.user.id, q, `%${mimeType}%`] : [req.user.id, q]
    );
    res.json({ files: rows, query: q });
  } catch (err) {
    logger.error('Search error:', err.message);
    res.status(500).json({ error: 'Search failed' });
  }
});

// ── POST /files/upload — initiate upload (get presigned URL) ─────────────────
router.post('/upload', uploadLimiter, validate(schemas.fileUploadRequest), async (req, res) => {
  const { fileName, contentType, sizeBytes } = req.body;
  const userId = req.user.id;

  try {
    // Check storage quota
    if (req.user.storage_used_bytes + sizeBytes > req.user.storage_quota_bytes) {
      return res.status(413).json({ error: 'Storage quota exceeded' });
    }

    // Check if file already exists (for versioning)
    const { rows: existing } = await query(
      'SELECT id, current_s3_key FROM files WHERE owner_id = $1 AND file_name = $2 AND is_deleted = FALSE',
      [userId, fileName]
    );

    let fileId, versionNumber, s3Key;

    await withTransaction(async (client) => {
      if (existing.length > 0) {
        // New version of existing file
        fileId = existing[0].id;
        const { rows: vRows } = await client.query(
          'SELECT MAX(version_number) AS max FROM file_versions WHERE file_id = $1',
          [fileId]
        );
        versionNumber = (vRows[0].max || 0) + 1;
        s3Key = buildVersionedKey(fileId, versionNumber, fileName);

        // Insert version row (S3 key will be confirmed after upload completes)
        await client.query(
          `INSERT INTO file_versions (file_id, version_number, s3_key, size_bytes, uploaded_by)
           VALUES ($1, $2, $3, $4, $5)`,
          [fileId, versionNumber, s3Key, sizeBytes, userId]
        );
      } else {
        // New file
        fileId = uuidv4();
        versionNumber = 1;
        s3Key = buildVersionedKey(fileId, versionNumber, fileName);

        await client.query(
          `INSERT INTO files (id, owner_id, file_name, current_s3_key, size_bytes, mime_type)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [fileId, userId, fileName, s3Key, sizeBytes, contentType]
        );
        await client.query(
          `INSERT INTO file_versions (file_id, version_number, s3_key, size_bytes, uploaded_by)
           VALUES ($1, $2, $3, $4, $5)`,
          [fileId, versionNumber, s3Key, sizeBytes, userId]
        );
      }
    });

    const uploadUrl = await generateUploadUrl(s3Key, contentType);

    await logAction({
      userId,
      actionType: versionNumber > 1 ? 'version_upload' : 'file_upload',
      fileId,
      fileName,
      ipAddress: req.clientIp,
      userAgent: req.headers['user-agent'],
      metadata: { versionNumber, sizeBytes },
    });

    res.json({ fileId, s3Key, uploadUrl, versionNumber, isNewVersion: versionNumber > 1 });
  } catch (err) {
    logger.error('Upload error:', err.message);
    res.status(500).json({ error: 'Failed to initiate upload' });
  }
});

// ── POST /files/upload/confirm — confirm upload complete, update metadata ────
router.post('/upload/confirm', async (req, res) => {
  const { fileId, s3Key } = req.body;
  try {
    await query(
      `UPDATE files SET current_s3_key = $1, uploaded_at = NOW() WHERE id = $2 AND owner_id = $3`,
      [s3Key, fileId, req.user.id]
    );
    // Update user storage usage
    await query(
      `UPDATE users SET storage_used_bytes = (
        SELECT COALESCE(SUM(fv.size_bytes), 0) FROM file_versions fv
        JOIN files f ON f.id = fv.file_id
        WHERE f.owner_id = $1 AND f.is_deleted = FALSE
      ) WHERE id = $1`,
      [req.user.id]
    );

    // Quota warning at 80%
    const { rows } = await query('SELECT storage_used_bytes, storage_quota_bytes FROM users WHERE id = $1', [req.user.id]);
    const { storage_used_bytes, storage_quota_bytes } = rows[0];
    const pct = storage_used_bytes / storage_quota_bytes;
    if (pct >= 0.8) {
      await createNotification({
        userId: req.user.id,
        type: 'quota_warning',
        title: pct >= 1 ? 'Storage quota full' : 'Storage quota at 80%',
        body: `You've used ${Math.round(pct * 100)}% of your ${formatBytes(storage_quota_bytes)} storage quota.`,
      });
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to confirm upload' });
  }
});

// ── GET /files/:id/download — generate presigned download URL ────────────────
router.get('/:id/download', async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT * FROM files WHERE id = $1 AND owner_id = $2 AND is_deleted = FALSE',
      [req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'File not found' });

    const file = rows[0];
    const url = await generateDownloadUrl(file.current_s3_key, 900, file.file_name);

    await query('UPDATE files SET last_accessed_at = NOW() WHERE id = $1', [file.id]);
    await logAction({ userId: req.user.id, actionType: 'file_download', fileId: file.id, fileName: file.file_name, ipAddress: req.clientIp, userAgent: req.headers['user-agent'] });
    await checkForAnomalies({ userId: req.user.id, fileId: file.id, actionType: 'file_download', ipAddress: req.clientIp, hour: new Date().getUTCHours() });

    res.json({ url, fileName: file.file_name });
  } catch (err) {
    logger.error('Download error:', err.message);
    res.status(500).json({ error: 'Failed to generate download URL' });
  }
});

// ── GET /files/:id/preview — presigned preview URL (no forced download) ──────
router.get('/:id/preview', async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT * FROM files WHERE id = $1 AND owner_id = $2 AND is_deleted = FALSE',
      [req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'File not found' });

    const url = await generatePreviewUrl(rows[0].current_s3_key);
    await logAction({ userId: req.user.id, actionType: 'file_preview', fileId: rows[0].id, fileName: rows[0].file_name, ipAddress: req.clientIp });

    res.json({ url, mimeType: rows[0].mime_type });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate preview URL' });
  }
});

// ── PATCH /files/:id/rename ──────────────────────────────────────────────────
router.patch('/:id/rename', validate(schemas.renameFile), async (req, res) => {
  try {
    const { fileName } = req.body;
    const { rows } = await query(
      'UPDATE files SET file_name = $1 WHERE id = $2 AND owner_id = $3 AND is_deleted = FALSE RETURNING id, file_name',
      [fileName, req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'File not found' });

    await logAction({ userId: req.user.id, actionType: 'file_rename', fileId: rows[0].id, fileName: rows[0].file_name, ipAddress: req.clientIp, metadata: { newName: fileName } });
    res.json({ file: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Rename failed' });
  }
});

// ── DELETE /files/:id — soft delete ─────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE files SET is_deleted = TRUE, deleted_at = NOW()
       WHERE id = $1 AND owner_id = $2 AND is_deleted = FALSE
       RETURNING id, file_name`,
      [req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'File not found' });

    await logAction({ userId: req.user.id, actionType: 'file_delete', fileId: rows[0].id, fileName: rows[0].file_name, ipAddress: req.clientIp });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Delete failed' });
  }
});

// ── POST /files/:id/restore — restore from trash ─────────────────────────────
router.post('/:id/restore', async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE files SET is_deleted = FALSE, deleted_at = NULL
       WHERE id = $1 AND owner_id = $2 AND is_deleted = TRUE
       RETURNING id, file_name`,
      [req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'File not found in trash' });

    await logAction({ userId: req.user.id, actionType: 'file_restore', fileId: rows[0].id, fileName: rows[0].file_name, ipAddress: req.clientIp });
    await createNotification({ userId: req.user.id, type: 'file_restore', title: 'File restored', body: `"${rows[0].file_name}" has been restored from trash.`, relatedFileId: rows[0].id });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Restore failed' });
  }
});

// ── GET /files/:id/versions ──────────────────────────────────────────────────
router.get('/:id/versions', async (req, res) => {
  try {
    const { rows: fileRows } = await query('SELECT id FROM files WHERE id = $1 AND owner_id = $2', [req.params.id, req.user.id]);
    if (!fileRows[0]) return res.status(404).json({ error: 'File not found' });

    const { rows } = await query(
      `SELECT fv.id, fv.version_number, fv.s3_key, fv.size_bytes, fv.uploaded_at, u.display_name AS uploaded_by_name
       FROM file_versions fv JOIN users u ON u.id = fv.uploaded_by
       WHERE fv.file_id = $1
       ORDER BY fv.version_number DESC`,
      [req.params.id]
    );
    res.json({ versions: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list versions' });
  }
});

// ── POST /files/:id/versions/:versionId/restore ──────────────────────────────
router.post('/:id/versions/:versionId/restore', async (req, res) => {
  try {
    const { rows: vRows } = await query(
      `SELECT fv.* FROM file_versions fv
       JOIN files f ON f.id = fv.file_id
       WHERE fv.id = $1 AND fv.file_id = $2 AND f.owner_id = $3`,
      [req.params.versionId, req.params.id, req.user.id]
    );
    if (!vRows[0]) return res.status(404).json({ error: 'Version not found' });

    const version = vRows[0];
    const { rows: fileRows } = await query('SELECT * FROM files WHERE id = $1', [req.params.id]);
    const file = fileRows[0];

    // Create a new version copying the old S3 key forward
    const { rows: maxRows } = await query('SELECT MAX(version_number) AS max FROM file_versions WHERE file_id = $1', [file.id]);
    const newVersionNumber = (maxRows[0].max || 0) + 1;
    const newS3Key = buildVersionedKey(file.id, newVersionNumber, file.file_name);

    // In a real implementation, you'd S3 copy the object. Here we reference the same key.
    // (S3 CopyObject would be used in production)
    await query(
      `INSERT INTO file_versions (file_id, version_number, s3_key, size_bytes, uploaded_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [file.id, newVersionNumber, newS3Key, version.size_bytes, req.user.id]
    );
    await query('UPDATE files SET current_s3_key = $1 WHERE id = $2', [newS3Key, file.id]);

    await logAction({ userId: req.user.id, actionType: 'version_restore', fileId: file.id, fileName: file.file_name, metadata: { restoredFromVersion: version.version_number, newVersion: newVersionNumber } });
    await createNotification({ userId: req.user.id, type: 'version_restore', title: 'File version restored', body: `"${file.file_name}" has been restored to version ${version.version_number}.`, relatedFileId: file.id });

    res.json({ ok: true, newVersionNumber });
  } catch (err) {
    logger.error('Version restore error:', err.message);
    res.status(500).json({ error: 'Version restore failed' });
  }
});

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1073741824).toFixed(1) + ' GB';
}

module.exports = router;
