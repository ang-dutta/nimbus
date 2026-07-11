const { verifyFirebaseToken } = require('../utils/firebase');
const { query } = require('../db');
const logger = require('../utils/logger');

/**
 * Middleware: verifies the Firebase ID token from the Authorization header.
 * On success, attaches req.user = { id, email, displayName }.
 * On failure, returns 401.
 */
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  const idToken = authHeader.slice(7);

  try {
    const decoded = await verifyFirebaseToken(idToken);

    // Ensure the user exists in our DB (upsert on first request)
    const { rows } = await query(
      `INSERT INTO users (id, email, display_name, avatar_url)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email
       RETURNING id, email, display_name, storage_used_bytes, storage_quota_bytes`,
      [decoded.uid, decoded.email, decoded.name || null, decoded.picture || null]
    );

    req.user = rows[0];
    req.clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip;
    next();
  } catch (err) {
    logger.warn('Auth failure:', err.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { requireAuth };
