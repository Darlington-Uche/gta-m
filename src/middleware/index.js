import { ZodError } from 'zod';
import { config } from '../config/index.js';
import { AppError, forbidden, unauthorized } from '../lib/errors.js';
import { isAdminToken, verifyToken } from '../services/auth.service.js';
import { log } from '../lib/logger.js';
import { getDoc } from '../lib/db.js';

export function requireUser(req, _res, next) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return next(unauthorized());
  try {
    const p = verifyToken(h.slice(7));
    req.user = { wallet: p.sub, admin: isAdminToken(p) };
    next();
  } catch (e) { next(e); }
}
export function requireAdmin(req, res, next) {
  requireUser(req, res, (err) => {
    if (err) return next(err);
    if (!req.user.admin) return next(forbidden('Admin only'));
    next();
  });
}
export async function requireCron(req, _res, next) {
  try {
    const sent = req.headers['x-cron-secret'];
    if (!sent) return next(forbidden('Bad cron secret'));
    if (config.jobs.cronSecret && sent === config.jobs.cronSecret) return next();
    // Edge deploys keep the cron secret in the database (the code bundle is public, so it can't carry it)
    const d = await getDoc('meta', 'cron');
    if (d?.secret && sent === d.secret) return next();
    next(forbidden('Bad cron secret'));
  } catch (e) { next(e); }
}
export function optionalUser(req, _res, next) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) { try { const p = verifyToken(h.slice(7)); req.user = { wallet: p.sub, admin: isAdminToken(p) }; } catch { /* ignore */ } }
  next();
}

export function notFoundHandler(req, res) { res.status(404).json({ ok: false, error: { code: 'not_found', message: `No route ${req.method} ${req.path}` } }); }
export function errorHandler(err, _req, res, _next) {
  if (err instanceof ZodError) return res.status(400).json({ ok: false, error: { code: 'validation', message: 'Invalid request', details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) } });
  if (err instanceof AppError) return res.status(err.status).json({ ok: false, error: { code: err.code, message: err.message, details: err.details } });
  if (err?.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ ok: false, error: { code: 'file_too_large', message: 'Max file size is 50MB' } });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ ok: false, error: { code: 'bad_json', message: 'Invalid JSON body' } });
  log.error('unhandled', err);
  res.status(500).json({ ok: false, error: { code: 'internal', message: 'Something went wrong' } });
}
