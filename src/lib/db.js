// Single place that talks to Firestore (firebase-admin). All collection names are prefixed per network.
import { config } from '../config/index.js';
import { MemoryFirestore, memInc } from './memoryDb.js';
import { PgFirestore, pgInc } from './pgDb.js';

let db;
let incFn;

if (config.dbDriver === 'memory') {
  db = new MemoryFirestore();
  incFn = memInc;
} else if (config.dbDriver === 'supabase') {
  // Supabase Postgres via the direct connection string (auto-injected in Edge Functions as SUPABASE_DB_URL).
  const { default: postgres } = await import('postgres');
  const sql = postgres(config.supabase.dbUrl, { max: 3, prepare: false, idle_timeout: 20, connect_timeout: 15 });
  db = new PgFirestore({ query: (t, p) => sql.unsafe(t, p), tx: (fn) => sql.begin((t) => fn((text, params) => t.unsafe(text, params))) });
  incFn = pgInc;
} else if (config.dbDriver === 'pglite') {
  // tests only: in-process Postgres
  const { PGlite } = await import('@electric-sql/pglite');
  const pg = new PGlite();
  await pg.exec(`create schema gta; create table gta.docs (path text primary key, col text not null, id text not null, data jsonb not null default '{}'::jsonb, v bigint not null default 1, updated_at timestamptz not null default now());`);
  db = new PgFirestore({ query: async (t, p) => (await pg.query(t, p)).rows, tx: (fn) => pg.transaction((t) => fn(async (text, params) => (await t.query(text, params)).rows)) });
  incFn = pgInc;
} else {
  const { initializeApp, getApps, cert, applicationDefault } = await import('firebase-admin/app');
  const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
  const { serviceAccountBase64, serviceAccountJson, storageBucket } = config.firebase;
  if (!getApps().length) {
    const opts = { storageBucket };
    if (serviceAccountBase64) opts.credential = cert(JSON.parse(Buffer.from(serviceAccountBase64, 'base64').toString('utf8')));
    else if (serviceAccountJson) opts.credential = cert(JSON.parse(serviceAccountJson));
    else opts.credential = applicationDefault(); // GOOGLE_APPLICATION_CREDENTIALS
    initializeApp(opts);
  }
  db = getFirestore();
  db.settings({ ignoreUndefinedProperties: true });
  incFn = (n) => FieldValue.increment(n);
}

export { db };
export const col = (name) => db.collection(config.dbPrefix + name);
export const inc = incFn;
export const runTx = (fn) => db.runTransaction(fn);
export const now = () => Date.now();
export const newId = (name) => col(name).doc().id;

export const getDoc = async (name, id) => {
  const s = await col(name).doc(String(id)).get();
  return s.exists ? { id: s.id, ...s.data() } : null;
};
export const queryDocs = async (q) => (await q.get()).docs.map((d) => ({ id: d.id, ...d.data() }));
