const cron = require('node-cron');
const { query } = require('../db');
const { recomputeBaseline } = require('../services/anomaly');
const { deleteObject } = require('../services/s3');
const logger = require('../utils/logger');

function initializeJobs() {
  // ── Recompute access baselines every hour ────────────────────────────────
  cron.schedule('0 * * * *', async () => {
    logger.info('[cron] Recomputing access baselines...');
    try {
      const { rows: users } = await query('SELECT id FROM users');
      for (const user of users) {
        try {
          await recomputeBaseline(user.id);
        } catch (err) {
          logger.error(`Baseline recomputation failed for user ${user.id}:`, err.message);
        }
      }
      logger.info(`[cron] Baselines recomputed for ${users.length} users`);
    } catch (err) {
      logger.error('[cron] Baseline job failed:', err.message);
    }
  });

  // ── Hard-delete soft-deleted files after 7-day retention window ──────────
  cron.schedule('0 2 * * *', async () => {
    logger.info('[cron] Running hard-delete for expired trash...');
    try {
      const { rows: expired } = await query(
        `SELECT id, current_s3_key, file_name FROM files
         WHERE is_deleted = TRUE
           AND deleted_at < NOW() - INTERVAL '7 days'`
      );

      for (const file of expired) {
        try {
          // Delete all versions from S3
          const { rows: versions } = await query(
            'SELECT s3_key FROM file_versions WHERE file_id = $1',
            [file.id]
          );
          for (const v of versions) {
            await deleteObject(v.s3_key);
          }
          // Delete the current key
          await deleteObject(file.current_s3_key);

          // Remove from DB (cascades to versions, share_links, audit_logs FK)
          await query('DELETE FROM files WHERE id = $1', [file.id]);
          logger.info(`[cron] Hard-deleted file ${file.id} (${file.file_name})`);
        } catch (err) {
          logger.error(`[cron] Failed to hard-delete file ${file.id}:`, err.message);
        }
      }

      logger.info(`[cron] Hard-deleted ${expired.length} files`);
    } catch (err) {
      logger.error('[cron] Hard-delete job failed:', err.message);
    }
  });

  // ── Expire share links that have passed their expiry date ────────────────
  cron.schedule('*/15 * * * *', async () => {
    try {
      const { rowCount } = await query(
        `UPDATE share_links SET is_active = FALSE
         WHERE is_active = TRUE AND expires_at IS NOT NULL AND expires_at < NOW()`
      );
      if (rowCount > 0) {
        logger.info(`[cron] Expired ${rowCount} share links`);
      }
    } catch (err) {
      logger.error('[cron] Share link expiry job failed:', err.message);
    }
  });

  // ── Update user storage_used_bytes (reconciliation) every 6 hours ────────
  cron.schedule('0 */6 * * *', async () => {
    try {
      await query(`
        UPDATE users u
        SET storage_used_bytes = (
          SELECT COALESCE(SUM(fv.size_bytes), 0)
          FROM file_versions fv
          JOIN files f ON f.id = fv.file_id
          WHERE f.owner_id = u.id AND f.is_deleted = FALSE
        )
      `);
      logger.info('[cron] Storage usage reconciled for all users');
    } catch (err) {
      logger.error('[cron] Storage reconciliation failed:', err.message);
    }
  });
}

module.exports = { initializeJobs };
