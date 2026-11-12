// Vercel serverless entry: the whole Express API runs as one function (/api/* is rewritten to this function, see vercel.json).
import '../supabase/env.js'; // merges defaults into globalThis.__GTA_ENV (DB_DRIVER=supabase, STORAGE_DRIVER=supabase, ...)
import { buildApp } from '../src/app.js';
import { chain } from '../src/services/chain/index.js';

let app;
let ready;
export default async function handler(req, res) {
  try {
    ready ||= chain.init();
    await ready;
    app ||= buildApp();
  } catch (e) {
    ready = null;
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: { code: 'init_failed', message: e.message } }));
    return;
  }
  if (req.url.startsWith('/api')) req.url = req.url.slice(4) || '/'; // the site calls /api/*; routes inside are root-relative
  return app(req, res);
}
