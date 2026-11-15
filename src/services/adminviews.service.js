// Admin-only read models: every creator collection with its numbers, and wallet look-ups (with block/unblock).
import { col, getDoc, now, queryDocs } from '../lib/db.js';
import { itemsOwnedBy } from './items.service.js';
import { offersMadeBy, offersReceivedBy } from './offers.service.js';
import { salesForWallet } from './stats.service.js';
import { notFound, bad } from '../lib/errors.js';
import { setLaunchItemsHidden } from './launches.service.js';

const r2 = (n) => Math.round(n * 100) / 100;
export async function adminCollections() {
  const [ls, items, sales] = await Promise.all([queryDocs(col('launches')), queryDocs(col('items')), queryDocs(col('sales'))]);
  const owner = new Map(); const byItem = new Map(items.map((i) => [i.id, i]));
  return ls.filter((l) => l.status !== 'draft').sort((a, b) => (b.publishedAt || b.createdAt || 0) - (a.publishedAt || a.createdAt || 0)).map((l) => {
    const mine = new Set(items.filter((i) => i.launchId === l.id).map((i) => i.id));
    const ss = sales.filter((s) => mine.has(String(s.itemId)));
    const mints = ss.filter((s) => s.type === 'mint'), trades = ss.filter((s) => s.type !== 'mint');
    const stage = (l.stages || [])[0] || {};
    return { id: l.id, name: l.name, symbol: l.symbol, logo: l.logo, creator: l.wallet, status: l.status, reason: l.reason || null, supply: l.supply || 0, minted: l.minted || 0, mintPriceUsd: stage.priceUsd ?? 0, perWallet: stage.perWallet || 1, mintEnd: stage.end || null, closedAt: l.closedAt || null, revealedAt: l.revealedAt || null,
      mintRevenueUsd: r2(mints.reduce((a, s) => a + (s.usd || 0), 0)), tradeCount: trades.length, tradeVolumeUsd: r2(trades.reduce((a, s) => a + (s.usd || 0), 0)), holders: new Set(items.filter((i) => i.launchId === l.id && i.owner).map((i) => i.owner)).size, createdAt: l.createdAt };
  });
}
export async function restoreLaunch({ id, by }) {
  const l = await getDoc('launches', id); if (!l) throw notFound('Collection not found');
  if (l.status !== 'rejected') throw bad('not_taken_down', `This collection is ${l.status}`);
  await col('launches').doc(id).update({ status: l.minted ? 'live' : 'approved', reason: null, restoredBy: by, restoredAt: now() });
  await setLaunchItemsHidden(id, false);
  return { id, status: l.minted ? 'live' : 'approved' };
}
export async function searchUsers(q) {
  const us = await queryDocs(col('users')), n = (q || '').toLowerCase().trim();
  const rows = us.filter((u) => !n || [u.id, u.name, u.username].some((x) => x && String(x).toLowerCase().includes(n)));
  return rows.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0)).slice(0, 40).map((u) => ({ wallet: u.id, name: u.name || null, username: u.username || null, avatar: u.avatar || null, blocked: !!u.blocked, lastSeen: u.updatedAt || u.createdAt || null }));
}
export async function userDetail(wallet) {
  const [u, nfts, made, recv, sales, mine] = await Promise.all([getDoc('users', wallet), itemsOwnedBy(wallet).catch(() => []), offersMadeBy(wallet).catch(() => []), offersReceivedBy(wallet).catch(() => []), salesForWallet(wallet).catch(() => []), queryDocs(col('launches').where('wallet', '==', wallet))]);
  return { wallet, name: u?.name || null, username: u?.username || null, avatar: u?.avatar || null, bio: u?.bio || null, blocked: !!u?.blocked, blockedReason: u?.blockedReason || null,
    holdings: nfts.length, offersMade: made.length, offersActive: made.filter((o) => o.status === 'active').length, offersReceived: recv.length,
    bought: sales.filter((s) => s.role === 'buyer').length, sold: sales.filter((s) => s.role === 'seller').length, volumeUsd: r2(sales.reduce((a, s) => a + (s.usd || 0), 0)),
    collections: mine.filter((l) => l.status !== 'draft').map((l) => ({ id: l.id, name: l.name, status: l.status, minted: l.minted || 0, supply: l.supply || 0 })), recent: sales.slice(0, 8).map((s) => ({ type: s.type, role: s.role, usd: s.usd || 0, itemId: s.itemId, at: s.createdAt })) };
}
export async function setBlocked({ wallet, blocked, reason, by }) {
  await col('users').doc(wallet).set({ blocked: !!blocked, blockedReason: blocked ? reason || null : null, blockedBy: blocked ? by : null, blockedAt: blocked ? now() : null }, { merge: true });
  return { wallet, blocked: !!blocked };
}
