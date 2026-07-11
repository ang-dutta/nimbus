const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();

const { requireAuth } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');
const { query } = require('../db');
const { scanCredentials } = require('../services/credentialScanner');
const { scanInfrastructure } = require('../services/infraScanner');
const { logAction } = require('../services/audit');
const { sendScanFlaggedEmail } = require('../services/email');
const logger = require('../utils/logger');
const Joi = require('joi');

// Tighter rate limit for scan endpoints (they're compute-heavy)
const scanLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, message: { error: 'Scan rate limit exceeded. Please wait before scanning again.' } });

router.use(requireAuth);
router.use(scanLimiter);

// ── POST /scan/credentials ───────────────────────────────────────────────────
router.post('/credentials', validate(schemas.credentialScanRequest), async (req, res) => {
  const { content, fileName, fileId } = req.body;

  try {
    const result = scanCredentials(content, fileName);

    if (!result.shouldScan) {
      return res.json({ shouldScan: false, findings: [], riskScore: 0 });
    }

    // Persist scan result
    const { rows } = await query(
      `INSERT INTO scan_results (file_id, user_id, scan_type, findings, risk_score)
       VALUES ($1, $2, 'credential', $3, $4) RETURNING id`,
      [fileId || null, req.user.id, JSON.stringify(result.findings), result.riskScore]
    );

    const actionType = result.findings.length > 0 ? 'scan_flagged' : 'scan_triggered';
    await logAction({
      userId: req.user.id,
      actionType,
      fileId: fileId || null,
      fileName,
      ipAddress: req.clientIp,
      metadata: { findingCount: result.findings.length, riskScore: result.riskScore },
    });

    // Send email if critical findings and user has email
    if (result.findings.some((f) => f.severity === 'critical')) {
      const { rows: userRows } = await query('SELECT email FROM users WHERE id = $1', [req.user.id]);
      if (userRows[0]?.email) {
        sendScanFlaggedEmail({ to: userRows[0].email, fileName, findings: result.findings }).catch(() => {});
      }
    }

    res.json({
      scanId: rows[0].id,
      shouldScan: true,
      findings: result.findings,
      riskScore: result.riskScore,
      hasCritical: result.findings.some((f) => f.severity === 'critical'),
    });
  } catch (err) {
    logger.error('Credential scan error:', err.message);
    res.status(500).json({ error: 'Scan failed' });
  }
});

// ── POST /scan/infrastructure ────────────────────────────────────────────────
router.post('/infrastructure', validate(Joi.object({
  accessKeyId: Joi.string().length(20).pattern(/^AKIA/).required(),
  secretAccessKey: Joi.string().min(40).max(40).required(),
  region: Joi.string().default('us-east-1'),
})), async (req, res) => {
  const { accessKeyId, secretAccessKey, region } = req.body;

  // IMPORTANT: credentials are never logged or persisted
  logger.info(`Infrastructure scan triggered by user ${req.user.id} for region ${region}`);

  try {
    const report = await scanInfrastructure({ accessKeyId, secretAccessKey, region });

    // Persist the report (without the credentials)
    await query(
      `INSERT INTO scan_results (user_id, scan_type, findings, risk_score)
       VALUES ($1, 'infrastructure', $2, $3)`,
      [req.user.id, JSON.stringify(report.checks), report.riskScore]
    );

    await logAction({
      userId: req.user.id,
      actionType: 'scan_triggered',
      ipAddress: req.clientIp,
      metadata: { scanType: 'infrastructure', region, riskScore: report.riskScore },
    });

    res.json(report);
  } catch (err) {
    logger.error('Infrastructure scan error:', err.message);
    res.status(500).json({ error: 'Infrastructure scan failed. Check that your credentials have sufficient IAM permissions.' });
  }
});

// ── GET /scan/history ────────────────────────────────────────────────────────
router.get('/history', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, file_id, scan_type, risk_score, scanned_at,
              json_array_length(findings) AS finding_count
       FROM scan_results WHERE user_id = $1
       ORDER BY scanned_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json({ scans: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load scan history' });
  }
});

module.exports = router;
