require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const logger = require('./utils/logger');
const { connectDB } = require('./db');
const { initializeJobs } = require('./jobs');

const fileRoutes = require('./routes/files');
const shareRoutes = require('./routes/share');
const scanRoutes = require('./routes/scan');
const { auditRouter, notificationsRouter, anomaliesRouter, analyticsRouter } = require('./routes/audit');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
}));
app.use(morgan('combined', { stream: { write: (msg) => logger.http(msg.trim()) } }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 500, standardHeaders: true, legacyHeaders: false }));

app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.use('/files', fileRoutes);
app.use('/share', shareRoutes);
app.use('/scan', scanRoutes);
app.use('/audit', auditRouter);
app.use('/notifications', notificationsRouter);
app.use('/anomalies', anomaliesRouter);
app.use('/analytics', analyticsRouter);

app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

async function start() {
  try {
    await connectDB();
    logger.info('Database connected');
    initializeJobs();
    logger.info('Background jobs initialized');
    app.listen(PORT, () => logger.info(`Nimbus backend running on port ${PORT} [${process.env.NODE_ENV}]`));
  } catch (err) {
    logger.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
module.exports = app;
