// The NFT catalog. Every artwork is an "item" from day one; it only gets an on-chain asset when someone mints it.
import { col, db, getDoc, newId, now, queryDocs, runTx } from '../lib/db.js';
import { config } from '../config/index.js';
import { ERAS, CATEGORIES, RARITIES } from '../lib/constants.js';
import { bad, conflict, notFound } from '../lib/errors.js';
import { getSolUsd } from './priceOracle.js';
import { usdToLamportsCeil, lamportsToSol, roundUsd } from '../lib/money.js';
import { listCollections } from './collections.service.js';

/* ---------- cached read model (catalog sizes in the thousands are fine in memory) ---------- */
const CATALOG_TTL_MS = 60_000; // every write path calls invalidateCatalog(), so this only caps drift from outside edits
let cache = { at: 0, data: null };
let inflight = null;
export const invalidateCatalog = () => { cache = { at: 0, data: null }; inflight = null; };

async function loadCatalog() {
  if (cache.data && now() - cache.at < CATALOG_TTL_MS) return cache.data;
  if (inflight) return inflight; // concurrent requests share one read
  const p = (inflight = readCatalog().finally(() => { if (inflight === p) inflight = null; }));
  return p;
}

async function readCatalog() {
  const [items, listings, offers, colls] = await Promise.all([
    queryDocs(col('items')),
    queryDocs(col('listings').where('status', '==', 'active')),
    queryDocs(col('offers').where('status', '==', 'active')),
    listCollections()
  ]);
  const collBy = new Map(colls.map((c) => [c.id, c]));
  const listingBy = new Map(listings.map((l) => [l.id, l]));
  const offersBy = new Map();
  for (const o of offers) { if (!offersBy.has(o.itemId)) offersBy.set(o.itemId, []); offersBy.get(o.itemId).push(o); }
  cache = { at: now(), data: { collBy, items, listingBy, offersBy } };
  return cache.data;
}

export function publicItem(it, cat, solUsd) {
  const listing = cat.listingBy.get(it.id) || null;
  const offers = (cat.offersBy.get(it.id) || []).sort((a, b) => b.lamports - a.lamports);
  const minted = it.status === 'minted';
  const era = ERAS[it.era];
  const coll = cat.collBy?.get(it.collectionId || it.era);
  const collLive = !!(coll && coll.status === 'live' && coll.address);
  const solOf = (usd) => (solUsd ? roundUsd(usd / solUsd * 1000) / 1000 : null);
  return {
    id: it.id, title: it.title, description: it.description || '', image: it.image, artist: it.artist || 'GTA Marketplace',
    collectionId: it.collectionId || it.era, collection: { id: it.collectionId || it.era, name: coll?.name || era?.label, live: collLive, address: it.collection || coll?.address || null },
    era: it.era, eraLabel: era?.label, eraShort: era?.short, category: it.category, rarity: it.rarity, tags: it.tags || [],
    status: it.status, minted, asset: it.asset || null, owner: it.owner || null, mintedAt: it.mintedAt || null,
    likes: it.likes || 0,
    primary: minted ? null : { priceUsd: it.priceUsd, priceSol: solOf(it.priceUsd), free: it.priceUsd === 0, available: it.status === 'unminted' && collLive },
    listing: listing ? { priceUsd: listing.priceUsd, priceSol: solOf(listing.priceUsd), seller: listing.seller } : null,
    offers: { count: offers.length, topUsd: offers[0] ? offers[0].usdAtPlacement : null, topSol: offers[0] ? lamportsToSol(offers[0].lamports) : null },
    // one number the grid can show: what it costs right now (primary price, listing price, or top offer as a hint)
    displayPriceUsd: minted ? (listing ? listing.priceUsd : null) : it.priceUsd,
    createdAt: it.createdAt
  };
}

export async function listItems(q = {}) {
  const cat = await loadCatalog();
  const solUsd = await getSolUsd().catch(() => null);
  let rows = cat.items.filter((i) => !i.hidden);
  const count = (k) => Object.entries(rows.reduce((m, i) => (i[k] ? ((m[i[k]] = (m[i[k]] || 0) + 1), m) : m), {})).map(([value, n]) => ({ value, n }));
  const facets = { category: count('category'), rarity: count('rarity'), era: count('era') }; // what actually exists, so the site only offers filters that match something
  const arr = (v) => (Array.isArray(v) ? v : v ? [v] : []);
  if (q.era) rows = rows.filter((i) => arr(q.era).includes(i.era));
  if (q.category) rows = rows.filter((i) => arr(q.category).includes(i.category));
  if (q.rarity) rows = rows.filter((i) => arr(q.rarity).includes(i.rarity));
  if (q.hasOffers === 'true') rows = rows.filter((i) => cat.offersBy.has(i.id));
  if (q.owner) rows = rows.filter((i) => i.owner === q.owner);
  if (q.q) { const n = q.q.toLowerCase(); rows = rows.filter((i) => `${i.title} ${i.category} ${i.era} ${(i.tags || []).join(' ')}`.toLowerCase().includes(n)); }
  if (q.status === 'unminted') rows = rows.filter((i) => i.status !== 'minted');
  if (q.status === 'minted') rows = rows.filter((i) => i.status === 'minted');
  if (q.status === 'listed') rows = rows.filter((i) => cat.listingBy.has(i.id));
  if (q.status === 'free') rows = rows.filter((i) => i.status !== 'minted' && i.priceUsd === 0);
  const priceOf = (i) => (i.status === 'minted' ? cat.listingBy.get(i.id)?.priceUsd ?? null : i.priceUsd);
  if (q.minUsd != null) rows = rows.filter((i) => priceOf(i) != null && priceOf(i) >= q.minUsd);
  if (q.maxUsd != null) rows = rows.filter((i) => priceOf(i) != null && priceOf(i) <= q.maxUsd);
  const sorters = {
    recent: (a, b) => b.createdAt - a.createdAt,
    price_low: (a, b) => (priceOf(a) ?? Infinity) - (priceOf(b) ?? Infinity),
    price_high: (a, b) => (priceOf(b) ?? -1) - (priceOf(a) ?? -1),
    liked: (a, b) => (b.likes || 0) - (a.likes || 0),
    offers: (a, b) => (cat.offersBy.get(b.id)?.length || 0) - (cat.offersBy.get(a.id)?.length || 0)
  };
  rows = [...rows].sort(sorters[q.sort || 'recent']);
  const total = rows.length, limit = q.limit || 24, page = q.page || 1;
  return { total, page, limit, items: rows.slice((page - 1) * limit, page * limit).map((i) => publicItem(i, cat, solUsd)), solUsd, facets };
}

export async function getPublicItem(id) {
  const cat = await loadCatalog();
  const it = cat.items.find((i) => i.id === String(id) && !i.hidden);
  if (!it) throw notFound('Artwork not found');
  return publicItem(it, cat, await getSolUsd().catch(() => null));
}
export async function itemsOwnedBy(wallet) {
  const cat = await loadCatalog();
  const solUsd = await getSolUsd().catch(() => null);
  return cat.items.filter((i) => i.owner === wallet).map((i) => publicItem(i, cat, solUsd));
}

export const getItemRaw = async (id) => { const it = await getDoc('items', String(id)); if (!it) throw notFound('Artwork not found'); return it; };

/** Quote helper used by all flows so the number shown is the number charged. */
export async function quoteUsd(usd) {
  const solUsd = await getSolUsd();
  return { usd, solUsd, lamports: usd > 0 ? usdToLamportsCeil(usd, solUsd) : 0, sol: usd > 0 ? lamportsToSol(usdToLamportsCeil(usd, solUsd)) : 0 };
}

/* ---------- NFT metadata (what wallets/explorers read via the on-chain uri) ---------- */
export function metadataFor(it, perm = null) {
  const era = ERAS[it.era];
  const image = perm?.image || it.image, mime = perm?.mime || 'image/png';
  return {
    name: it.title, symbol: 'GTAM', description: it.description || `${it.title} — GTA-inspired artwork`,
    image, external_url: `${config.assetsBaseUrl || config.publicBaseUrl}/artwork.html?id=${it.id}`,
    attributes: [
      { trait_type: 'Era', value: era?.label || it.era },
      { trait_type: 'Category', value: it.category },
      { trait_type: 'Rarity', value: it.rarity },
      ...(it.tags || []).slice(0, 5).map((t) => ({ trait_type: 'Tag', value: t }))
    ],
    properties: { category: 'image', files: [{ uri: image, type: mime }] }
  };
}
export const metadataUri = (it) => `${config.publicBaseUrl}/metadata/${encodeURIComponent(it.id)}.json`;

/* ---------- admin: create / edit ---------- */
function checkFields(f, partial) {
  if (f.era && !ERAS[f.era]) throw bad('bad_era', `era must be one of ${Object.keys(ERAS).join(', ')}`);
  if (f.category && !CATEGORIES.includes(f.category)) throw bad('bad_category', `category must be one of ${CATEGORIES.join(', ')}`);
  if (f.rarity && !RARITIES.includes(f.rarity)) throw bad('bad_rarity', `rarity must be one of ${RARITIES.join(', ')}`);
  if (!partial && !f.title) throw bad('missing_fields', 'title is required');
}
export async function createItem(f, by) {
  checkFields(f, false);
  const id = f.id ? String(f.id) : newId('items');
  await runTx(async (tx) => {
    const ref = col('items').doc(id);
    if ((await tx.get(ref)).exists) throw conflict('exists', `Item ${id} already exists`);
    tx.set(ref, {
      title: f.title, description: f.description || '', image: f.image || '', era: f.era || 'vice', category: f.category || 'Artwork', rarity: f.rarity || 'Common',
      tags: f.tags || [], artist: f.artist || null, collectionId: f.collectionId || f.era || 'vice', priceUsd: f.priceUsd ?? 0, status: 'unminted', hidden: !!f.hidden, asset: null, owner: null, likes: 0, createdBy: by || null, createdAt: now(),
      ...(f.submissionId ? { submissionId: f.submissionId, submittedBy: f.submittedBy } : {})
    });
  });
  invalidateCatalog();
  return getItemRaw(id);
}
export async function updateItem(id, patch) {
  checkFields(patch, true);
  const allowed = ['title', 'description', 'image', 'era', 'category', 'rarity', 'tags', 'priceUsd', 'hidden'];
  const data = Object.fromEntries(Object.entries(patch).filter(([k, v]) => allowed.includes(k) && v !== undefined));
  await runTx(async (tx) => {
    const ref = col('items').doc(String(id));
    const s = await tx.get(ref);
    if (!s.exists) throw notFound('Artwork not found');
    const cur = s.data();
    // once minted, the on-chain asset's name/uri are fixed; price changes only matter for unminted items
    if (cur.status === 'minted' && 'priceUsd' in data) delete data.priceUsd;
    tx.update(ref, { ...data, updatedAt: now() });
  });
  invalidateCatalog();
  return getItemRaw(id);
}
export async function deleteItem(id) {
  const cur = await getItemRaw(id);
  if (cur.status !== 'unminted') throw conflict('not_deletable', 'Only artworks that nobody has collected yet can be deleted (hide it instead).');
  await col('items').doc(String(id)).delete();
  invalidateCatalog();
  return { id: String(id) };
}
/** Bulk price change: the lever for "token went up, raise NFT prices". Only unminted items have a primary price. */
export async function bulkPrice({ ids, filter = {}, mode, value }) {
  const all = await queryDocs(col('items'));
  let rows = all.filter((i) => i.status === 'unminted');
  if (ids?.length) rows = rows.filter((i) => ids.includes(i.id));
  if (filter.era) rows = rows.filter((i) => i.era === filter.era);
  if (filter.category) rows = rows.filter((i) => i.category === filter.category);
  if (filter.rarity) rows = rows.filter((i) => i.rarity === filter.rarity);
  if (filter.onlyPaid) rows = rows.filter((i) => i.priceUsd > 0);
  const next = (p) => Math.max(0, roundUsd(mode === 'set' ? value : mode === 'percent' ? p * (1 + value / 100) : p + value));
  const changes = rows.map((i) => ({ id: i.id, from: i.priceUsd, to: next(i.priceUsd) })).filter((c) => c.from !== c.to);
  for (let i = 0; i < changes.length; i += 400) {
    const batch = db.batch();
    changes.slice(i, i + 400).forEach((c) => batch.update(col('items').doc(c.id), { priceUsd: c.to, updatedAt: now() }));
    await batch.commit();
  }
  invalidateCatalog();
  return { changed: changes.length, sample: changes.slice(0, 10) };
}

/* ---------- likes ---------- */
/** Who is liking: the connected wallet, or an anonymous browser id (so likes — and "trending" — don't need a wallet). */
export function likerOf(req) {
  if (req.user?.wallet) return req.user.wallet;
  const v = String(req.headers['x-visitor-id'] || '');
  if (/^[A-Za-z0-9_-]{16,64}$/.test(v)) return `anon:${v}`;
  return null;
}
export async function toggleLike(wallet, itemId) {
  const likeRef = col('likes').doc(`${itemId}_${wallet}`), itemRef = col('items').doc(String(itemId));
  const liked = await runTx(async (tx) => {
    const [l, i] = await Promise.all([tx.get(likeRef), tx.get(itemRef)]);
    if (!i.exists) throw notFound('Artwork not found');
    const likes = i.data().likes || 0;
    if (l.exists) { tx.delete(likeRef); tx.update(itemRef, { likes: Math.max(0, likes - 1) }); return false; }
    tx.set(likeRef, { wallet, itemId: String(itemId), createdAt: now() }); tx.update(itemRef, { likes: likes + 1 }); return true;
  });
  invalidateCatalog();
  return { liked };
}
export async function likedBy(wallet) {
  return (await queryDocs(col('likes').where('wallet', '==', wallet))).map((l) => l.itemId);
}
