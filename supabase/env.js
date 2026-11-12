// Defaults for the Edge Function. Real secrets (ADMIN_PASSWORD, VAULT_SECRET_KEY, ...) are set as Edge Function secrets in
// the Supabase dashboard and always win over these. Must be the first import in edge.js.
// (Deno.env is read-only in the Edge runtime, so config reads a merged plain object instead: globalThis.__GTA_ENV.)
import { createHash } from 'node:crypto';
const real = globalThis.Deno ? Deno.env.toObject() : { ...process.env };
const env = { ...real };
const dflt = (k, v) => { if (!env[k] && v) env[k] = v; };
const projectUrl = env.SUPABASE_URL || '';
for (const [k, v] of Object.entries(globalThis.__GTA_DEFAULTS || {})) dflt(k, v); // e.g. CRON_SECRET from the deploy wrapper
dflt('NETWORK', 'devnet');
dflt('DB_DRIVER', 'supabase');
dflt('CHAIN_DRIVER', 'solana');
dflt('DB_PREFIX', env.NETWORK === 'mainnet-beta' ? 'mainnet_' : 'devnet_');
dflt('PERMASTORE', 'none');
dflt('STORAGE_DRIVER', 'supabase');
dflt('RUN_JOBS', 'false'); // background jobs are triggered by pg_cron -> POST /jobs/run
dflt('PUBLIC_BASE_URL', env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + env.VERCEL_PROJECT_PRODUCTION_URL + '/api' : projectUrl + '/functions/v1/gta-api');
dflt('ASSETS_BASE_URL', env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + env.VERCEL_PROJECT_PRODUCTION_URL : 'https://gta-m-ten.vercel.app');
dflt('JWT_SECRET', createHash('sha256').update('gta-jwt:' + (env.SUPABASE_SERVICE_ROLE_KEY || 'dev')).digest('hex'));
globalThis.__GTA_ENV = env;
