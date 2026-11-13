import { col, queryDocs } from '../lib/db.js';
import { ERAS } from '../lib/constants.js';
import { roundUsd } from '../lib/money.js';
import { listCollections } from './collections.service.js';

const sales = () => queryDocs(col('sales'));

let statsCache = { at: 0, value: null };
export async function platformStats() {
  if (statsCache.value && Date.now() - statsCache.at < 30_000) return statsCache.value;
  const value = await computeStats();
  statsCache = { at: Date.now(), value };
  return value;
}

async function computeStats() {
  const [items, sl, offers, listings] = await Promise.all([queryDocs(col('items')), sales(), queryDocs(col('offers').where('status', '==', 'active')), queryDocs(col('listings').where('status', '==', 'active'))]);
  const minted = items.filter((i) => i.status === 'minted');
  return {
    items: items.length, minted: minted.length, unminted: items.filter((i) => i.status !== 'minted').length,
    holders: new Set(minted.map((i) => i.owner).filter(Boolean)).size,
    activeOffers: offers.length, activeListings: listings.length,
    sales: sl.length, volumeUsd: roundUsd(sl.reduce((s, x) => s + (x.usd || 0), 0)),
    secondarySales: sl.filter((s) => s.type !== 'mint').length
  };
}

/** The frontend's "Collections" page: one collection per game era. */
const memo = (fn, ttl) => { let c = { at: 0, v: null, args: '' }; return async (...a) => { const k = JSON.stringify(a); if (c.v && c.args === k && Date.now() - c.at < ttl) return c.v; const v = await fn(...a); c = { at: Date.now(), v, args: k }; return v; }; };
export const collectionsSummary = memo(async function collectionsSummaryRaw() {
  const [items, sl, listings, reg] = await Promise.all([queryDocs(col('items')), sales(), queryDocs(col('listings').where('status', '==', 'active')), listCollections()]);
  const regBy = new Map(reg.map((c) => [c.id, c]));
  const cidOf = (i) => i.collectionId || i.era;
  const listBy = new Map(listings.map((l) => [l.id, l]));
  const eraOf = new Map(items.map((i) => [i.id, cidOf(i)]));
  const ids = [...new Set([...Object.keys(ERAS), ...reg.map((c) => c.id), ...items.map(cidOf)])];
  return ids.map((era) => {
    const meta = ERAS[era] || { label: era, short: era };
    const r = regBy.get(era);
    const mine = items.filter((i) => cidOf(i) === era && !i.hidden);
    const floors = mine.map((i) => (i.status === 'minted' ? listBy.get(i.id)?.priceUsd : i.priceUsd)).filter((p) => p != null);
    const mineSales = sl.filter((s) => eraOf.get(s.itemId) === era), DAY = 864e5, t = Date.now();
    const vol = mineSales.reduce((a, s) => a + (s.usd || 0), 0);
    const v24 = mineSales.filter((s) => t - s.createdAt < DAY).reduce((a, s) => a + (s.usd || 0), 0), vPrev = mineSales.filter((s) => t - s.createdAt >= DAY && t - s.createdAt < 2 * DAY).reduce((a, s) => a + (s.usd || 0), 0);
    const n24 = mineSales.filter((s) => t - s.createdAt < DAY).length;
    return {
      id: era, era: ERAS[era] ? era : mine[0]?.era || era, name: r?.name || meta.label, blurb: r?.blurb || '', cover: r?.cover || '', banner: r?.banner || '', short: meta.short, address: r?.address || null, live: !!(r && r.status === 'live' && r.address), cover: [...mine].sort((a, b) => (b.priceUsd || 0) - (a.priceUsd || 0))[0]?.image || null, covers: mine.slice(0, 4).map((i) => i.image),
      items: mine.length, minted: mine.filter((i) => i.status === 'minted').length,
      owners: new Set(mine.map((i) => i.owner).filter(Boolean)).size,
      floorUsd: floors.length ? Math.min(...floors) : null, volumeUsd: roundUsd(vol), vol24Usd: roundUsd(v24), sales24: n24, change24: vPrev > 0 ? Math.round(((v24 - vPrev) / vPrev) * 1000) / 10 : v24 > 0 ? null : 0, isNew24: vPrev === 0 && v24 > 0, likes: mine.reduce((a, i) => a + (i.likes || 0), 0)
    };
  }).filter((c) => c.items > 0);
}, 20_000);

export const recentActivity = memo(async function recentActivityRaw(limit = 30) {
  const [sl, items] = await Promise.all([sales(), queryDocs(col('items'))]);
  const by = new Map(items.map((i) => [i.id, i]));
  return sl.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit).map((s) => ({
    type: s.type, itemId: s.itemId, title: by.get(s.itemId)?.title, image: by.get(s.itemId)?.image,
    buyer: s.buyer, seller: s.seller, usd: s.usd, lamports: s.lamports, signature: s.signature, at: s.createdAt
  }));
}, 20_000);
export async function salesForWallet(wallet) {
  const all = await sales();
  return all.filter((s) => s.buyer === wallet || s.seller === wallet).sort((a, b) => b.createdAt - a.createdAt)
    .map((s) => ({ ...s, role: s.buyer === wallet ? 'buyer' : 'seller' }));
}
