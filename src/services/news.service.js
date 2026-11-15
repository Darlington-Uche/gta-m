// News: the latest posts from a few X accounts, read through FxTwitter (no key, no X API).
// Pulled at most about every 5 minutes (with a little jitter) so we never hammer the source.
import { col, getDoc, now, queryDocs } from '../lib/db.js';
import { log } from '../lib/logger.js';
import { getSettings } from './settings.service.js';

const accounts = async () => ((await getSettings()).newsAccounts || []).map((s) => String(s).trim().replace(/^@/, '').toLowerCase()).filter(Boolean);
const BASE = (process.env.FXTWITTER_BASE || 'https://api.fxtwitter.com').replace(/\/$/, '');
const EVERY = 5 * 60_000, KEEP = 300;

const pick = (s, handle) => {
  const m = s.media || {}, photos = (m.photos || []).map((p) => p.url).filter(Boolean).slice(0, 4), v = (m.videos || [])[0];
  return {
    tweetId: String(s.id), handle: handle.toLowerCase(), author: s.author?.screen_name || handle, name: s.author?.name || handle, avatar: s.author?.avatar_url || null,
    text: String(s.text || '').slice(0, 1200), url: s.url || `https://x.com/${handle}/status/${s.id}`,
    createdAt: s.created_timestamp ? s.created_timestamp * 1000 : Date.parse(s.created_at) || now(),
    photos, video: v ? { url: v.url, thumb: v.thumbnail_url || null } : null,
    likes: s.likes || 0, reposts: s.reposts || 0, replies: s.replies || 0, views: s.views || 0,
    repostedBy: s.reposted_by ? s.reposted_by.screen_name : (s.author?.screen_name && s.author.screen_name.toLowerCase() !== handle.toLowerCase() ? handle : null),
    quote: s.quote && s.quote.type !== 'tombstone' ? { name: s.quote.author?.name || '', handle: s.quote.author?.screen_name || '', text: String(s.quote.text || '').slice(0, 400), photo: s.quote.media?.photos?.[0]?.url || null, url: s.quote.url || null } : null
  };
};

async function fetchHandle(handle, since) {
  const u = `${BASE}/2/profile/${encodeURIComponent(handle)}/statuses?count=20${since ? `&since=${since}` : ''}`;
  const r = await fetch(u, { headers: { 'user-agent': 'GTA-Marketplace-News/1.0' }, signal: AbortSignal.timeout(8000) });
  if (r.status === 204) return [];
  if (!r.ok) throw new Error(`fxtwitter ${handle}: HTTP ${r.status}`);
  const j = await r.json();
  return (j.results || []).filter((s) => s && s.type !== 'thread' && s.id).map((s) => pick(s, handle));
}

/** Pull new posts if the last pull was ~5 minutes ago (jittered). force skips the wait. */
export async function pullNews({ force = false } = {}) {
  if (process.env.CHAIN_DRIVER === 'mock' && !force) return { skipped: 'test' }; // tests and demos never reach out
  const st = (await getDoc('meta', 'news')) || {}, t = now();
  if (!force && st.nextAt && t < st.nextAt) return { skipped: true, nextInSec: Math.round((st.nextAt - t) / 1000) };
  // claim the slot first so overlapping requests don't all pull
  await col('meta').doc('news').set({ ...st, lastAt: t, nextAt: t + EVERY + Math.round((Math.random() - 0.5) * 60_000) }, { merge: true });
  const newest = { ...(st.newest || {}) }; let added = 0; const errors = [];
  for (const h of await accounts()) {
    try {
      const posts = await fetchHandle(h, newest[h] ? Math.floor(newest[h] / 1000) : null);
      for (const p of posts) { await col('news').doc('x_' + p.tweetId).set({ ...p, pulledAt: t }); added++; newest[h] = Math.max(newest[h] || 0, p.createdAt); }
    } catch (e) { errors.push(e.message); log.warn('news pull', e.message); }
  }
  await col('meta').doc('news').set({ newest, lastAdded: added, lastErrors: errors }, { merge: true });
  if (added) { // keep the store small
    const all = (await queryDocs(col('news'))).sort((a, b) => b.createdAt - a.createdAt);
    await Promise.all(all.slice(KEEP).map((n) => col('news').doc('x_' + n.tweetId).delete()));
  }
  return { added, errors };
}

export async function listNews({ limit = 40, handle } = {}) {
  await pullNews().catch((e) => log.warn('news', e.message)); // cheap when not due
  const h = handle ? String(handle).toLowerCase() : null;
  const all = (await queryDocs(col('news'))).filter((n) => !h || n.handle === h).sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
  const acc = await accounts();
  return { news: all.filter((n) => acc.includes(n.handle)).map(({ pulledAt, ...n }) => n), accounts: acc };
}
