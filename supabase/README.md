# Running the API on Supabase (Edge Function)

The same Express API runs as ONE Edge Function (`gta-api`) with Supabase Postgres as its database (`gta.docs`, a document store
that mirrors the Firestore interface the code was written against). No separate server to host.

- URL: `https://<project-ref>.supabase.co/functions/v1/gta-api`  (put it in the frontend's `js/config.js` as `API_URL`)
- Build: `npm run build:edge` -> `supabase/dist/index.ts` (one minified file; npm deps pinned as `npm:` imports)
- Secrets (Edge Functions -> Secrets): `ADMIN_PASSWORD`, `VAULT_SECRET_KEY` (optional: `RPC_URL`, `COLLECTION_AUTHORITY_SECRET_KEY`, `ADMIN_WALLETS`)
  `SUPABASE_URL`, `SUPABASE_DB_URL`, `SUPABASE_SERVICE_ROLE_KEY` are provided by Supabase automatically.
- Background jobs: a pg_cron job (`gta-jobs`, every minute) POSTs `/jobs/run` with the `x-cron-secret` header.
- Seed/refresh the catalog from the frontend: admin panel -> or `POST /admin/seed` (body `{ "url": ".../js/data.js" }`).
- Tests on Postgres semantics: `npm run test:pg` (uses an in-process Postgres, PGlite).
