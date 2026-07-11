const Joi = require('joi');

/**
 * Returns a middleware that validates req.body against the given Joi schema.
 * Passes a 400 with details on failure, calls next() on success.
 */
function validate(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.details.map((d) => d.message),
      });
    }
    req.body = value;
    next();
  };
}

/**
 * Returns a middleware that validates req.query.
 */
function validateQuery(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query, { abortEarly: false, allowUnknown: false });
    if (error) {
      return res.status(400).json({
        error: 'Invalid query parameters',
        details: error.details.map((d) => d.message),
      });
    }
    req.query = value;
    next();
  };
}

// ─── Shared Joi schemas ────────────────────────────────────────────────────

const schemas = {
  fileUploadRequest: Joi.object({
    fileName: Joi.string().max(255).required(),
    contentType: Joi.string().max(127).required(),
    sizeBytes: Joi.number().integer().min(1).max(5 * 1024 * 1024 * 1024).required(), // max 5 GB
  }),

  renameFile: Joi.object({
    fileName: Joi.string().max(255).required(),
  }),

  createShareLink: Joi.object({
    expiresAt: Joi.date().iso().min('now').optional().allow(null),
    password: Joi.string().max(128).optional().allow(null, ''),
    permission: Joi.string().valid('view', 'download').default('view'),
    isOneTime: Joi.boolean().default(false),
    maxAccessCount: Joi.number().integer().min(1).optional().allow(null),
    notifyOnAccess: Joi.boolean().default(false),
  }),

  sharePasswordAttempt: Joi.object({
    password: Joi.string().max(128).required(),
  }),

  credentialScanRequest: Joi.object({
    content: Joi.string().max(5 * 1024 * 1024).required(), // 5 MB max text content
    fileName: Joi.string().max(255).required(),
    fileId: Joi.string().optional().allow(null),
  }),

  auditLogQuery: Joi.object({
    actionType: Joi.string().optional(),
    fileId: Joi.string().optional(),
    fileName: Joi.string().optional(),
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(25),
  }),
};

module.exports = { validate, validateQuery, schemas };
