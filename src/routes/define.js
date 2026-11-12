// Tiny route DSL so every route is declared as DATA (method, path, auth, validation, handler).
// That table drives Express AND the generated docs/API.md, so the docs can never drift from the code.
//
//   { method, path, auth: 'public' | 'user' | 'admin' | 'cron', summary, body?, query?, params?, upload?, handler(req) }
import { optionalUser, requireAdmin, requireCron, requireUser } from '../middleware/index.js';

const AUTH = { public: optionalUser, user: requireUser, admin: requireAdmin, cron: requireCron };

export function mount(router, routes) {
  for (const r of routes) {
    const chain = [AUTH[r.auth || 'public']];
    if (r.upload) chain.push(r.upload);
    chain.push(async (req, res, next) => {
      try {
        req.valid = {
          body: r.body ? r.body.parse(req.body ?? {}) : req.body,
          query: r.query ? r.query.parse(req.query) : req.query,
          params: r.params ? r.params.parse(req.params) : req.params
        };
        const out = await r.handler(req, res);
        if (!res.headersSent && out !== undefined) res.json({ ok: true, ...out });
      } catch (e) { next(e); }
    });
    router[r.method](r.path, ...chain);
  }
}
