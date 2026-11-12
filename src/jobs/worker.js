// Background jobs. Runs in-process (RUN_JOBS=true) on a single always-on instance such as Railway.
// A Firestore lease makes it safe if two instances ever overlap during a deploy.
import { config } from '../config/index.js';
import { col, now, runTx } from '../lib/db.js';
import { reconcilePtx } from '../services/pendingTx.service.js';
import { processPayouts } from '../services/payouts.service.js';
import { expireOffers } from '../services/offers.service.js';
import { reconcileOwners } from '../services/ownership.service.js';
import { log } from '../lib/logger.js';

const HOLDER = `${process.pid}_${Math.random().toString(36).slice(2, 8)}`;
let lastOwnerSync = 0;

async function lease(ms) {
  return runTx(async (tx) => {
    const ref = col('config').doc('jobLease');
    const s = await tx.get(ref);
    const cur = s.exists ? s.data() : null;
    if (cur && cur.until > now() && cur.holder !== HOLDER) return false;
    tx.set(ref, { holder: HOLDER, until: now() + ms });
    return true;
  });
}

export async function runJobsOnce({ force = false } = {}) {
  const report = {};
  const step = async (name, fn) => { try { report[name] = await fn(); } catch (e) { report[name] = 'error: ' + e.message; log.error(`job ${name}`, e); } };
  await step('reconcileTx', reconcilePtx);
  await step('expireOffers', expireOffers);
  await step('payouts', processPayouts);
  if (force || now() - lastOwnerSync > 10 * 60_000) { lastOwnerSync = now(); await step('reconcileOwners', () => reconcileOwners()); }
  return report;
}

export function startWorker() {
  if (!config.jobs.enabled) return log.info('jobs disabled (RUN_JOBS=false)');
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      if (await lease(config.jobs.intervalMs * 3)) {
        const r = await runJobsOnce();
        const interesting = Object.entries(r).filter(([, v]) => v && (typeof v === 'string' || (Array.isArray(v) ? v.length : v > 0)));
        if (interesting.length) log.info('jobs', Object.fromEntries(interesting));
      }
    } catch (e) { log.error('worker tick', e); } finally { busy = false; }
  };
  setInterval(tick, config.jobs.intervalMs).unref?.();
  log.info(`jobs running every ${config.jobs.intervalMs / 1000}s`);
}
