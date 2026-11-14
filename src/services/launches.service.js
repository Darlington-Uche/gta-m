// Launchpad. Two kinds of drops share one shape:
//  - creator launches: anyone submits a collection (details, pre-reveal art, mint stages). Admins verify it is GTA-themed, then approve.
//  - platform drops: our own era collections (GTA IV, Vice City, ...) with mint stages set from the admin site.
// A stage = { id, name, kind: 'allowlist' | 'public', priceUsd, start, end, perWallet, allowlist: [wallets] }.
// The mint itself (contract + random pick + reveal) is wired in a later step; this stores and serves everything the pages need.
import { col, getDoc, newId, now, queryDocs } from '../lib/db.js';
import { saveUpload } from './storage.service.js';
import { notify } from './notifications.service.js';
import { listCollections, invalidateCollections } from './collections.service.js';
import { bad, conflict, forbidden, notFound } from '../lib/errors.js';
import { config } from '../config/index.js';

const fromB64 = (f) => {
  if (!f || !f.data) return null;
  const buffer = Buffer.from(String(f.data), 'base64'), b = buffer;
  const mimetype = b[0] === 0xff && b[1] === 0xd8 ? 'image/jpeg' : b[0] === 0x89 && b[1] === 0x50 ? 'image/png' : b.slice(0, 3).toString() === 'GIF' ? 'image/gif' : b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP' ? 'image/webp' : null;
  if (!mimetype) throw bad('bad_file_type', 'Images must be JPG, PNG, GIF or WebP');
  return { buffer, size: buffer.length, mimetype };
};
const cleanStages = (stages) => (stages || []).map((s, i) => ({
  id: s.id || 'st' + (i + 1), name: s.name || (s.kind === 'allowlist' ? 'Allowlist' : 'Public'), kind: s.kind === 'allowlist' ? 'allowlist' : 'public',
  priceUsd: Math.max(0, +s.priceUsd || 0), start: +s.start || null, end: +s.end || null, perWallet: Math.max(1, Math.min(100, +s.perWallet || 1)),
  allowlist: s.kind === 'allowlist' ? [...new Set((s.allowlist || []).map((w) => String(w).trim()).filter((w) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(w)))].slice(0, 5000) : []
})).sort((a, b) => (a.start || 0) - (b.start || 0));
const checkStages = (stages) => {
  if (!stages.length) throw bad('no_stages', 'Add at least one mint stage');
  for (const s of stages) { if (!s.start) throw bad('stage_start', `${s.name}: set a start time`); if (s.end && s.end <= s.start) throw bad('stage_end', `${s.name}: the end must be after the start`); if (s.kind === 'allowlist' && !s.allowlist.length) throw bad('stage_allowlist', `${s.name}: add at least one wallet to the allowlist`); }
};

/* ---------- creator launches ---------- */
export async function createLaunch({ wallet, body }) {
  const mine = await queryDocs(col('launches').where('wallet', '==', wallet));
  if (mine.filter((l) => l.status === 'review').length >= 3) throw conflict('too_many_pending', 'You already have 3 collections waiting for review');
  const stages = cleanStages(body.stages); checkStages(stages);
  const up = async (f, folder) => { const file = fromB64(f); return file ? (await saveUpload(file, folder)).url : null; };
  const logo = await up(body.logo, 'launches'), banner = await up(body.banner, 'launches'), preReveal = await up(body.preReveal, 'launches');
  if (!logo) throw bad('no_logo', 'Add a collection logo');
  const id = newId('launches');
  const doc = {
    wallet, name: body.name, symbol: body.symbol, description: body.description, theme: body.theme || 'other', links: body.links || {},
    logo, banner: banner || logo, preReveal: preReveal || logo, revealMode: body.revealMode, revealAt: body.revealMode === 'date' ? +body.revealAt || null : null,
    supply: body.supply, royaltyPct: body.royaltyPct, stages, art: [], minted: 0, status: wallet === config.auth.platformWallet ? 'approved' : 'review', createdAt: now(), updatedAt: now()
  };
  await col('launches').doc(id).set(doc);
  return { id, ...doc };
}
export async function addLaunchArt({ wallet, id, file }) {
  const l = await getDoc('launches', id); if (!l) throw notFound('Launch not found');
  if (l.wallet !== wallet) throw forbidden('Not your collection');
  if (l.status === 'rejected') throw conflict('rejected', 'This collection was not approved');
  if ((l.art || []).length >= (l.supply || 500)) throw bad('supply_full', `All ${l.supply} artworks are uploaded. That is the max supply.`);
  const f = fromB64(file); if (!f) throw bad('no_file', 'Missing image');
  const saved = await saveUpload(f, 'launches/' + id);
  const art = [...(l.art || []), { url: saved.url, at: now() }], n = art.length;
  await col('launches').doc(id).update({ art, updatedAt: now() });
  // every uploaded piece becomes a mintable (hidden until minted) artwork of the drop
  await col('items').doc(`${id}-${n}`).set({ title: `${l.name} #${n}`, description: l.description || '', image: saved.url, era: ['vi', 'v', 'iv', 'sa', 'vice'].includes(l.theme) ? l.theme : 'vi', collectionId: id, collectionName: l.name,
    category: 'Characters', rarity: 'Common', tags: [], artist: l.wallet === config.auth.platformWallet ? 'GTA Marketplace' : l.wallet, creator: l.wallet, launchId: id, dropOnly: true, status: 'unminted', priceUsd: null,
    preReveal: l.revealMode === 'instant' ? null : l.preReveal, revealMode: l.revealMode, revealAt: l.revealAt || null, likes: 0, createdAt: now() });
  return { count: art.length, url: saved.url };
}
/** Creator (or admin) reveals the collection now: every minted and future piece shows its real art. */
export async function revealLaunch({ id, wallet, admin }) {
  const l = await getDoc('launches', id); if (!l) throw notFound('Collection not found');
  if (l.wallet !== wallet && !admin) throw forbidden('Not your collection');
  const t = now(); await col('launches').doc(id).update({ revealedAt: t, revealMode: 'instant' });
  const its = await queryDocs(col('items').where('launchId', '==', id));
  await Promise.all(its.map((i) => col('items').doc(i.id).update({ revealedAt: t })));
  return { revealed: its.length };
}
export async function revealPlatformDrop(collectionId) {
  const t = now(), c = (await listCollections()).find((x) => x.id === collectionId); if (!c || !c.drop) throw notFound('No drop for this collection');
  await col('collections').doc(collectionId).set({ drop: { ...c.drop, revealedAt: t } }, { merge: true }); invalidateCollections();
  const its = await queryDocs(col('items').where('dropId', '==', 'gta-' + collectionId));
  await Promise.all(its.map((i) => col('items').doc(i.id).update({ revealedAt: t })));
  return { revealed: its.length };
}
export const myLaunches = (wallet) => queryDocs(col('launches').where('wallet', '==', wallet)).then((r) => r.sort((a, b) => b.createdAt - a.createdAt));
export const listLaunches = (status) => queryDocs(status ? col('launches').where('status', '==', status) : col('launches')).then((r) => r.sort((a, b) => b.createdAt - a.createdAt));
export async function reviewLaunch({ id, by, approve, reason }) {
  const l = await getDoc('launches', id); if (!l) throw notFound('Launch not found');
  if (l.status !== 'review') throw conflict('already_reviewed', `This collection is ${l.status}`);
  await col('launches').doc(id).update({ status: approve ? 'approved' : 'rejected', reviewedBy: by, reviewedAt: now(), reason: approve ? null : reason || null });
  await notify(l.wallet, approve ? 'launch_approved' : 'launch_rejected', approve ? 'Collection verified' : 'Collection not approved', approve ? `${l.name} passed verification and is listed on the launchpad.` : `${l.name}: ${reason || 'did not pass verification.'}`, { launchId: id });
  return { ok: true };
}

/* ---------- platform drops (our era collections) ---------- */
export async function setPlatformDrop({ id, drop, by }) {
  const c = (await listCollections()).find((x) => x.id === id); if (!c) throw notFound('Collection not found');
  const stages = cleanStages(drop.stages); if (drop.published) checkStages(stages);
  const next = { stages, supply: drop.supply ?? null, revealMode: drop.revealMode || 'instant', revealAt: drop.revealMode === 'date' ? +drop.revealAt || null : null, preReveal: drop.preReveal || null, published: !!drop.published, updatedAt: now(), updatedBy: by };
  await col('collections').doc(id).set({ drop: next }, { merge: true }); invalidateCollections();
  return next;
}

/* ---------- what the launchpad pages read ---------- */
export const stageState = (s, t = now()) => (s.start && t < s.start ? 'upcoming' : s.end && t >= s.end ? 'ended' : 'live');
function shape(d, t = now()) {
  const live = d.stages.find((s) => stageState(s, t) === 'live'), next = d.stages.find((s) => stageState(s, t) === 'upcoming');
  const soldOut = d.supply && d.minted >= d.supply;
  const status = soldOut ? 'ended' : live ? 'live' : next ? 'upcoming' : d.stages.length ? 'ended' : 'upcoming';
  const revealed = d.revealMode === 'instant' || (d.revealMode === 'date' && d.revealAt && t >= d.revealAt) || !!d.revealedAt;
  return { ...d, status, soldOut: !!soldOut, currentStage: live ? live.id : null, nextStage: next ? next.id : null, startsAt: d.stages[0]?.start || null, revealed,
    stages: d.stages.map((s) => ({ ...s, state: stageState(s, t), allowlistSize: s.allowlist ? s.allowlist.length : 0, allowlist: undefined })) };
}
export async function listDrops() {
  const [cols, launches, items] = await Promise.all([listCollections(), queryDocs(col('launches')), queryDocs(col('items'))]);
  const count = new Map(), minted = new Map();
  for (const i of items) { if (i.hidden) continue; const k = i.collectionId || i.era; count.set(k, (count.get(k) || 0) + 1); if (i.status === 'minted') minted.set(k, (minted.get(k) || 0) + 1); }
  const platform = cols.filter((c) => c.drop && c.drop.published).map((c) => ({ id: 'gta-' + c.id, kind: 'platform', collectionId: c.id, name: c.name, creator: 'GTA Marketplace', verified: true, logo: c.cover || c.banner, banner: c.banner || c.cover, preReveal: c.drop.preReveal || c.cover, description: c.blurb || '', theme: c.id, supply: c.drop.supply || count.get(c.id) || 0, artCount: count.get(c.id) || 0, minted: minted.get(c.id) || 0, stages: c.drop.stages, revealMode: c.drop.revealMode, revealAt: c.drop.revealAt, revealedAt: c.drop.revealedAt || null, royaltyPct: 5 }));
  const creator = launches.filter((l) => l.status === 'approved' || l.status === 'live').map((l) => ({ id: l.id, kind: 'creator', name: l.name, symbol: l.symbol, creator: l.wallet, creatorName: l.wallet === config.auth.platformWallet ? 'GTA Marketplace' : null, verified: true, logo: l.logo, banner: l.banner, preReveal: l.preReveal, description: l.description, theme: l.theme, supply: l.supply, minted: l.minted || 0, stages: l.stages, revealMode: l.revealMode, revealAt: l.revealAt, royaltyPct: l.royaltyPct, links: l.links, artCount: (l.art || []).length, revealedAt: l.revealedAt || null }));
  const t = now();
  return [...platform, ...creator].map((d) => shape(d, t));
}
export async function getDrop(id, wallet) {
  const d = (await listDrops()).find((x) => x.id === id); if (!d) throw notFound('Drop not found');
  // per-wallet eligibility for allowlist stages, without sending the whole list to the browser
  if (wallet) {
    const raw = d.kind === 'platform' ? (await listCollections()).find((c) => 'gta-' + c.id === id).drop.stages : (await getDoc('launches', id)).stages;
    d.stages = d.stages.map((s) => { const r = raw.find((x) => x.id === s.id); return { ...s, eligible: s.kind === 'public' || !!(r && r.allowlist && r.allowlist.includes(wallet)) }; });
  }
  return d;
}
