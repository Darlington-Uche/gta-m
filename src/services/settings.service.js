// Runtime settings the admin can change without redeploying (Firestore: config/settings).
import { col, now } from '../lib/db.js';
import { SETTINGS_DEFAULTS } from '../config/index.js';

let cache = { at: 0, value: null };
const merge = (base, over) => {
  const out = { ...base };
  for (const [k, v] of Object.entries(over || {})) out[k] = v && typeof v === 'object' && !Array.isArray(v) ? { ...(base[k] || {}), ...v } : v;
  return out;
};

export async function getSettings() {
  if (cache.value && now() - cache.at < 60_000) return cache.value;
  const s = await col('config').doc('settings').get();
  cache = { at: now(), value: merge(SETTINGS_DEFAULTS, s.exists ? s.data() : {}) };
  return cache.value;
}
export async function updateSettings(patch) {
  const cur = await getSettings();
  const next = merge(cur, patch);
  await col('config').doc('settings').set(next);
  cache = { at: now(), value: next };
  return next;
}
export const resetSettingsCache = () => { cache = { at: 0, value: null }; };

/** Offers are only accepted during the window when enabled (e.g. open 2h out of every 6h, anchored at 00:00 UTC). */
export function bidWindowState(settings, at = new Date()) {
  const w = settings.bidWindow;
  if (!w?.enabled) return { enabled: false, open: true };
  const cycle = w.cycleMinutes * 60_000, open = w.openMinutes * 60_000;
  const midnight = Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate());
  const pos = (at.getTime() - midnight) % cycle;
  const isOpen = pos < open;
  const start = at.getTime() - pos;
  return { enabled: true, open: isOpen, opensAt: isOpen ? start : start + cycle, closesAt: isOpen ? start + open : null, cycleMinutes: w.cycleMinutes, openMinutes: w.openMinutes };
}
