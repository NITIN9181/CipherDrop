import express from 'express';
import cors from 'cors';
import { secretsRouter } from './routes/secrets';
import { auditRouter } from './routes/audit';
import { initDatabase } from './services/audit-db';
import { rateLimiter } from './middleware/ratelimit';
import { logger } from './services/logger';

const app = express();
const port = process.env.PORT || 3001;

// CORS setup
const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:4321';
app.use(cors({
  origin: frontendOrigin,
  credentials: true,
}));

// Body parser
app.use(express.json());

// Security Headers Middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; connect-src 'self'");
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  next();
});

// Rate limit applied to POST /api/secrets
app.use('/api/secrets', (req, res, next) => {
  if (req.method === 'POST' && req.path === '/') {
    rateLimiter(req, res, next);
  } else {
    next();
  }
});

// Route registration
// Register auditRouter first so /api/secrets/:id/audit is evaluated before /api/secrets/:id
app.use('/api/secrets', auditRouter);
app.use('/api/secrets', secretsRouter);

// Database initialization & Startup
async function startServer() {
  await initDatabase();
  app.listen(port, () => {
    logger.info(`Backend Express server listening on port ${port}`);
  });
}

startServer().catch((err) => {
  logger.error({ err }, 'Failed to start Express server');
  process.exit(1);
});
