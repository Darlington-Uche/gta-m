import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config/index.js';
import { buildRouter } from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/index.js';
import { UPLOAD_DIR } from './services/storage.service.js';

export function buildApp() {
  const app = express();
  app.set('trust proxy', 1); // Railway / any reverse proxy
  app.use((_q, r, n) => { r.set('Cache-Control', 'no-store'); n(); });
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: config.corsOrigins.length ? config.corsOrigins : true, credentials: false, maxAge: 600 }));
  app.use(express.json({ limit: '6mb' })); // one JSON parser (base64 artwork uploads need the room; a second parser breaks on the Edge runtime)
  app.use(rateLimit({ windowMs: config.rateLimit.windowMs, limit: config.rateLimit.max, standardHeaders: true, legacyHeaders: false }));
  app.use(/^\/items\/[^/]+\/like$/, rateLimit({ windowMs: 60_000, limit: 40, standardHeaders: true, legacyHeaders: false })); // anonymous likes: cap per IP
  app.use('/auth/admin-login', rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: true, legacyHeaders: false })); // brute-force guard
  app.use('/auth', rateLimit({ windowMs: 60_000, limit: config.rateLimit.authMax, standardHeaders: true, legacyHeaders: false }));
  if (config.storageDriver === 'local') app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '1d' }));
  app.use(buildRouter());
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
