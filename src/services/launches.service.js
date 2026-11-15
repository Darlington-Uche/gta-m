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
import { chain } from './chain/index.js';
import { invalidateCatalog } from './items.service.js';
import { createPtx, newPtxId, publicPtx, registerHandler } from './pendingTx.service.js';

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

/* ---------- creator launches ----------
   Simple on purpose: a draft (look + art) → publish. One mint phase (price, per-wallet, start, how long).
   Supply = the art you uploaded (at least 10). Everything stays hidden while minting and reveals when it ends or sells out. */
export const MIN_ART = 10, MAX_ART = 20;
const phase = (p) => { const start = +p.start || now(), hours = Math.max(1, Math.min(24 * 30, +p.hours || 24));
  return [{ id: 'mint', name: 'Mint', kind: 'public', priceUsd: Math.max(0, +p.priceUsd || 0), start, end: start + hours * 36e5, perWallet: Math.max(1, Math.min(50, +p.perWallet || 1)), allowlist: [] }]; };
const up = async (f, folder) => { const file = fromB64(f); return file ? (await saveUpload(file, folder)).url : null; };
const own = async (wallet, id) => { const l = await getDoc('launches', id); if (!l) throw notFound('Collection not found'); if (l.wallet !== wallet) throw forbidden('Not your collection'); return l; };
const symbolOf = (name) => (String(name).replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase() || 'GTA');

export async function createLaunch({ wallet, body }) {
  const drafts = (await queryDocs(col('launches').where('wallet', '==', wallet))).filter((l) => l.status === 'draft');
  if (drafts.length >= 5) throw conflict('too_many_drafts', 'Finish or delete one of your drafts first');
  const logo = await up(body.logo, 'launches'), banner = await up(body.banner, 'launches');
  if (!logo) throw bad('no_logo', 'Add a logo');
  const id = newId('launches'), stages = phase(body.mint || {});
  const doc = { wallet, name: body.name, symbol: body.symbol || symbolOf(body.name), description: body.description || '', theme: body.theme || 'other', links: body.links || {},
    logo, banner: banner || logo, preReveal: logo, revealMode: 'date', revealAt: stages[0].end, supply: 0, royaltyPct: body.royaltyPct ?? 5, stages, art: [], minted: 0, status: 'draft', createdAt: now(), updatedAt: now() };
  await col('launches').doc(id).set(doc);
  return { id, ...doc };
}
export async function addLaunchArt({ wallet, id, file, rarity }) {
  const l = await own(wallet, id);
  if (l.status === 'rejected') throw conflict('rejected', 'This collection was taken down');
  if (l.status !== 'draft' && l.stages[0] && now() >= l.stages[0].start) throw conflict('minting', 'Art can only be added before the mint starts');
  if ((l.art || []).length >= MAX_ART) throw bad('too_much_art', `Up to ${MAX_ART} pieces per collection`);
  const f = fromB64(file); if (!f) throw bad('no_file', 'Missing image');
  const saved = await saveUpload(f, 'launches/' + id);
  const n = (l.art || []).length + 1, r = ['Common', 'Rare', 'Epic', 'Legendary'].includes(rarity) ? rarity : 'Common';
  const art = [...(l.art || []), { url: saved.url, rarity: r, at: now() }];
  await col('launches').doc(id).update({ art, supply: art.length, updatedAt: now() });
  // each piece becomes a hidden drop item: nobody sees it until it is minted and revealed
  await col('items').doc(`${id}-${n}`).set({ title: `${l.name} #${n}`, description: l.description || '', image: saved.url, era: ['vi', 'v', 'iv', 'sa', 'vice'].includes(l.theme) ? l.theme : 'vi', collectionId: id, collectionName: l.name,
    category: 'Characters', rarity: r, tags: [], artist: l.wallet === config.auth.platformWallet ? 'GTA Marketplace' : l.wallet, creator: l.wallet, launchId: id, dropOnly: true, status: 'unminted', priceUsd: null,
    preReveal: l.preReveal || l.logo, revealMode: 'date', revealAt: l.revealAt || null, likes: 0, createdAt: now() });
  return { count: art.length, url: saved.url };
}
/** Draft → live on Drops. Needs a logo and at least 10 pieces. No review: it goes straight up (admins can take it down). */
export async function publishLaunch({ wallet, id, mint }) {
  const l = await own(wallet, id);
  if (l.status !== 'draft') throw conflict('already_live', 'Already published');
  if ((l.art || []).length < MIN_ART) throw bad('need_art', `Add at least ${MIN_ART} pieces (you have ${(l.art || []).length})`);
  if (!l.address) throw conflict('not_onchain', 'Sign to put your collection on-chain first');
  const stages = mint ? phase(mint) : l.stages;
  if (stages[0].start < now() - 60e3) stages[0].start = now(), stages[0].end = Math.max(stages[0].end, now() + 36e5);
  await col('launches').doc(id).update({ status: 'approved', stages, revealAt: stages[0].end, supply: l.art.length, publishedAt: now() });
  const its = await queryDocs(col('items').where('launchId', '==', id));
  await Promise.all(its.map((i) => col('items').doc(i.id).update({ revealAt: stages[0].end })));
  return { id, status: 'approved' };
}
/** The creator puts their collection on Solana: they sign + pay, they own it; we are its update delegate (mint + reveal). */
export async function prepareOnchain({ wallet, id }) {
  const l = await own(wallet, id);
  if (l.address) throw conflict('already_onchain', 'This collection is already on-chain');
  if (l.status === 'rejected') throw conflict('taken_down', 'This collection was taken down');
  const built = await chain.buildCreateCollectionTx({ creator: wallet, name: l.name.slice(0, 32), uri: `${config.publicBaseUrl}/metadata/launch-${id}.json` });
  const ptx = await createPtx({ id: newPtxId(), kind: 'launch_collection', wallet, refId: id, data: { launchId: id, address: built.address }, built });
  return { ...publicPtx(ptx), txB64: built.txB64, address: built.address };
}
registerHandler('launch_collection', {
  async finalize(ptx) {
    const l = await getDoc('launches', ptx.data.launchId); if (!l || l.address) return;
    await col('launches').doc(ptx.data.launchId).update({ address: ptx.data.address, collectionSig: ptx.signature || null, onchainAt: now(), onchainBy: ptx.wallet });
  },
  async rollback() {}
});
/** One-time nudge for collections published before creators signed their own on-chain collection. */
export async function nudgeOffchain() {
  const ls = (await queryDocs(col('launches'))).filter((l) => (l.status === 'approved' || l.status === 'live') && !l.address && !l.onchainNudgedAt);
  for (const l of ls) {
    await notify(l.wallet, 'onchain_needed', 'Put your collection on-chain', `${l.name} needs one signature from you before anyone can mint. Open your drop and tap "Put on-chain".`, { launchId: l.id }).catch(() => {});
    await col('launches').doc(l.id).update({ onchainNudgedAt: now() });
  }
  return { nudged: ls.length };
}
export async function deleteDraft({ wallet, id }) {
  const l = await own(wallet, id); if (l.status !== 'draft') throw conflict('not_draft', 'Only drafts can be deleted');
  const its = await queryDocs(col('items').where('launchId', '==', id));
  await Promise.all([...its.map((i) => col('items').doc(i.id).delete()), col('launches').doc(id).delete()]);
  return { ok: true };
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
/** When a mint ends, the pieces nobody minted are discarded and the supply becomes what was actually minted. */
export async function closeEndedMints(limit = 10) {
  const t = now(), ls = (await queryDocs(col('launches'))).filter((l) => (l.status === 'approved' || l.status === 'live') && !l.closedAt && l.stages?.[0]?.end && t > l.stages[0].end + 120_000).slice(0, limit);
  let closed = 0;
  for (const l of ls) {
    const its = await queryDocs(col('items').where('launchId', '==', l.id));
    if (its.some((i) => i.status === 'reserved')) continue; // a mint is still settling; try next round
    const left = its.filter((i) => i.status !== 'minted'), minted = its.length - left.length;
    await Promise.all(left.map((i) => col('items').doc(i.id).delete()));
    await col('launches').doc(l.id).update({ supply: minted, minted, closedAt: t, discarded: left.length });
    closed++;
  }
  return { closed };
}
export async function revealIfDone(dropId) {
  const l = await getDoc('launches', dropId); if (!l || l.revealedAt) return;
  if ((l.minted || 0) >= (l.supply || Infinity)) await revealLaunch({ id: dropId, admin: true });
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
export async function setLaunchItemsHidden(id, hidden) {
  const its = await queryDocs(col('items').where('launchId', '==', id));
  await Promise.all(its.map((i) => col('items').doc(i.id).update(hidden ? { hidden: true, takenDown: true } : { hidden: i.dropOnly && i.status !== 'minted' ? i.hidden || false : false, takenDown: false })));
  invalidateCollections(); invalidateCatalog();
}
export async function reviewLaunch({ id, by, approve, reason }) {
  const l = await getDoc('launches', id); if (!l) throw notFound('Launch not found');
  if (approve ? l.status !== 'review' : l.status === 'rejected') throw conflict('already_reviewed', `This collection is ${l.status}`); // reject = take down, any time
  await col('launches').doc(id).update({ status: approve ? 'approved' : 'rejected', reviewedBy: by, reviewedAt: now(), reason: approve ? null : reason || null });
  if (!approve) await setLaunchItemsHidden(id, true); // taken down: off Explore, collection pages, feeds and search
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
  const creator = launches.filter((l) => l.status === 'approved' || l.status === 'live').map((l) => ({ id: l.id, kind: 'creator', name: l.name, symbol: l.symbol, creator: l.wallet, creatorName: l.wallet === config.auth.platformWallet ? 'GTA Marketplace' : null, verified: true, onchain: !!l.address, address: l.address || null, logo: l.logo, banner: l.banner, preReveal: l.preReveal, description: l.description, theme: l.theme, supply: l.supply, minted: l.minted || 0, stages: l.stages, revealMode: l.revealMode, revealAt: l.revealAt, royaltyPct: l.royaltyPct, links: l.links, artCount: (l.art || []).length, revealedAt: l.revealedAt || null }));
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
