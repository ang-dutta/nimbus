const { query } = require('../db');
const { logAction, createNotification } = require('./audit');
const logger = require('../utils/logger');

const SPIKE_STDDEV_THRESHOLD = parseFloat(process.env.ANOMALY_SPIKE_STDDEV_THRESHOLD || '3.0');
const SPIKE_WINDOW_MINUTES = parseInt(process.env.ANOMALY_SPIKE_WINDOW_MINUTES || '5', 10);
const FAILED_PASSWORD_THRESHOLD = parseInt(process.env.ANOMALY_FAILED_PASSWORD_ATTEMPTS || '5', 10);

/**
 * Recompute the access frequency baseline for a user from their audit log.
 * Called by the background cron job.
 */
async function recomputeBaseline(userId) {
  // Get hourly access counts for the last 30 days
  const { rows: hourly } = await query(
    `SELECT date_trunc('hour', created_at) AS hour, COUNT(*) AS cnt
     FROM audit_logs
     WHERE user_id = $1
       AND action_type IN ('file_download', 'file_preview', 'share_link_accessed')
       AND created_at > NOW() - INTERVAL '30 days'
     GROUP BY 1`,
    [userId]
  );

  if (hourly.length < 5) {
    // Not enough data yet; skip baseline computation
    return;
  }

  const counts = hourly.map((r) => parseFloat(r.cnt));
  const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
  const variance = counts.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / counts.length;
  const stddev = Math.sqrt(variance);

  // Typical access hours (most common hour-of-day across all entries)
  const { rows: hourDist } = await query(
    `SELECT EXTRACT(HOUR FROM created_at)::int AS hr, COUNT(*) AS cnt
     FROM audit_logs
     WHERE user_id = $1 AND created_at > NOW() - INTERVAL '30 days'
     GROUP BY 1 ORDER BY cnt DESC LIMIT 10`,
    [userId]
  );
  const topHours = hourDist.map((r) => r.hr);
  const typicalStart = topHours.length ? Math.min(...topHours) : 0;
  const typicalEnd = topHours.length ? Math.max(...topHours) : 23;

  // Typical countries
  const { rows: countries } = await query(
    `SELECT DISTINCT metadata->>'country' AS country
     FROM audit_logs
     WHERE user_id = $1 AND metadata->>'country' IS NOT NULL
       AND created_at > NOW() - INTERVAL '30 days'`,
    [userId]
  );
  const typicalCountries = countries.map((r) => r.country).filter(Boolean);

  await query(
    `INSERT INTO access_baselines
       (user_id, mean_access_frequency, stddev_access_frequency, typical_hours_start, typical_hours_end, typical_countries, computed_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       mean_access_frequency   = EXCLUDED.mean_access_frequency,
       stddev_access_frequency = EXCLUDED.stddev_access_frequency,
       typical_hours_start     = EXCLUDED.typical_hours_start,
       typical_hours_end       = EXCLUDED.typical_hours_end,
       typical_countries       = EXCLUDED.typical_countries,
       computed_at             = NOW()`,
    [userId, mean, stddev, typicalStart, typicalEnd, JSON.stringify(typicalCountries)]
  );

  logger.debug(`Baseline recomputed for user ${userId}: mean=${mean.toFixed(2)}, stddev=${stddev.toFixed(2)}`);
}

/**
 * Run anomaly checks for a specific access event.
 * Called inline after each significant access action.
 */
async function checkForAnomalies({ userId, fileId, shareLinkId, actionType, ipAddress, country, hour }) {
  const anomalies = [];

  // Load user baseline
  const { rows: baselineRows } = await query(
    'SELECT * FROM access_baselines WHERE user_id = $1',
    [userId]
  );
  const baseline = baselineRows[0] || null;

  // ── Check 1: Access frequency spike ──────────────────────────────────────
  if (fileId) {
    const { rows: recentAccess } = await query(
      `SELECT COUNT(*) AS cnt FROM audit_logs
       WHERE user_id = $1
         AND file_id = $2
         AND action_type IN ('file_download', 'file_preview', 'share_link_accessed')
         AND created_at > NOW() - INTERVAL '${SPIKE_WINDOW_MINUTES} minutes'`,
      [userId, fileId]
    );

    const recentCount = parseInt(recentAccess[0].cnt, 10);

    if (baseline && baseline.stddev_access_frequency > 0) {
      const zScore = (recentCount - baseline.mean_access_frequency) / baseline.stddev_access_frequency;
      if (zScore > SPIKE_STDDEV_THRESHOLD) {
        anomalies.push({
          type: 'access_frequency_spike',
          severity: zScore > 5 ? 'critical' : 'high',
          basis: `File accessed ${recentCount} times in ${SPIKE_WINDOW_MINUTES} minutes — ${zScore.toFixed(1)} standard deviations above baseline (mean: ${baseline.mean_access_frequency.toFixed(1)}, stddev: ${baseline.stddev_access_frequency.toFixed(1)})`,
        });
      }
    } else if (recentCount >= 50) {
      // No baseline yet — use hard threshold
      anomalies.push({
        type: 'access_frequency_spike',
        severity: 'high',
        basis: `File accessed ${recentCount} times in ${SPIKE_WINDOW_MINUTES} minutes (no baseline established yet)`,
      });
    }
  }

  // ── Check 2: New geography ────────────────────────────────────────────────
  if (country && baseline) {
    const typical = baseline.typical_countries || [];
    if (typical.length > 0 && !typical.includes(country)) {
      anomalies.push({
        type: 'new_geography',
        severity: 'high',
        basis: `Access from new country: ${country}. Previously seen countries: ${typical.join(', ')}.`,
      });
    }
  }

  // ── Check 3: Off-hours access ─────────────────────────────────────────────
  if (hour !== undefined && baseline && shareLinkId) {
    const { typical_hours_start: start, typical_hours_end: end } = baseline;
    if (start !== null && end !== null && (hour < start || hour > end)) {
      anomalies.push({
        type: 'off_hours_access',
        severity: 'medium',
        basis: `Share link accessed at hour ${hour} UTC, outside typical window ${start}:00–${end}:00 UTC.`,
      });
    }
  }

  // ── Persist anomaly events ────────────────────────────────────────────────
  for (const anomaly of anomalies) {
    const { rows } = await query(
      `INSERT INTO anomaly_events
         (user_id, anomaly_type, severity, related_file_id, related_share_link_id, statistical_basis)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [userId, anomaly.type, anomaly.severity, fileId, shareLinkId, anomaly.basis]
    );

    // Log to audit with anomalous flag
    await logAction({
      userId,
      actionType: 'anomaly_detected',
      fileId,
      metadata: { anomalyType: anomaly.type, severity: anomaly.severity, basis: anomaly.basis },
      isAnomalous: true,
    });

    // Push notification
    await createNotification({
      userId,
      type: 'anomaly',
      title: `Security alert: ${formatAnomalyType(anomaly.type)}`,
      body: anomaly.basis,
      relatedFileId: fileId,
    });

    logger.warn(`Anomaly detected for user ${userId}: ${anomaly.type} (${anomaly.severity})`);
  }

  return anomalies;
}

/**
 * Check for repeated failed password attempts on a share link.
 */
async function checkPasswordBruteForce(shareLinkId, userId) {
  const { rows } = await query(
    `SELECT COUNT(*) AS cnt FROM audit_logs
     WHERE metadata->>'shareLinkId' = $1
       AND action_type = 'share_link_password_fail'
       AND created_at > NOW() - INTERVAL '10 minutes'`,
    [shareLinkId]
  );

  const count = parseInt(rows[0].cnt, 10);
  if (count >= FAILED_PASSWORD_THRESHOLD) {
    await query(
      `INSERT INTO anomaly_events
         (user_id, anomaly_type, severity, related_share_link_id, statistical_basis)
       VALUES ($1, 'repeated_password_failure', 'high', $2, $3)`,
      [userId, shareLinkId, `${count} failed password attempts in 10 minutes on share link.`]
    );

    await createNotification({
      userId,
      type: 'anomaly',
      title: 'Repeated failed password attempts on shared file',
      body: `${count} failed attempts in 10 minutes — possible brute-force attack on your share link.`,
    });
  }
}

function formatAnomalyType(type) {
  return {
    access_frequency_spike: 'Unusual access frequency',
    new_geography: 'Access from new location',
    off_hours_access: 'Off-hours access',
    repeated_password_failure: 'Repeated failed password attempts',
  }[type] || type;
}

module.exports = { recomputeBaseline, checkForAnomalies, checkPasswordBruteForce };
