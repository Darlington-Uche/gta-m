// Portfolio: what a wallet is worth here. SOL in the wallet (live from chain) + NFTs valued at their collection floor.
import { col, getDoc, now, queryDocs } from '../lib/db.js';
import { chain } from './chain/index.js';
import { getSolUsd } from './priceOracle.js';
import { itemsOwnedBy } from './items.service.js';
import { collectionsSummary, salesForWallet } from './stats.service.js';
import { saveUpload } from './storage.service.js';
import { bad, conflict } from '../lib/errors.js';

const r2 = (n) => Math.round(n * 100) / 100;
export async function portfolio(wallet) {
  const [lamports, solUsd, nfts, cols, profile, mySales] = await Promise.all([chain.getBalance(wallet).catch(() => null), getSolUsd().catch(() => null), itemsOwnedBy(wallet), collectionsSummary(), getDoc('users', wallet), salesForWallet(wallet).catch(() => [])]);
  const paid = new Map(); for (const x of mySales) if (x.role === 'buyer' && !paid.has(x.itemId)) paid.set(x.itemId, x.usd || 0); // newest purchase first = what I paid for the copy I hold
  const sol = lamports == null ? null : lamports / 1e9, walletUsd = sol != null && solUsd ? r2(sol * solUsd) : null;
  const byCol = new Map();
  for (const it of nfts) {
    const id = it.collectionId || it.era, c = cols.find((x) => x.id === id) || {};
    const value = it.floorUsd ?? c.floorUsd ?? it.lastSaleUsd ?? 0;
    const g = byCol.get(id) || { id, name: c.name || it.eraLabel || id, cover: c.cover || c.banner || '', floorUsd: c.floorUsd ?? null, count: 0, valueUsd: 0, costUsd: 0, items: [] };
    g.count++; g.valueUsd = r2(g.valueUsd + (value || 0)); g.costUsd = r2(g.costUsd + (paid.get(String(it.id)) ?? paid.get(it.id) ?? 0)); g.items.push(it.id); byCol.set(id, g);
  }
  for (const g of byCol.values()) { g.pnlUsd = r2(g.valueUsd - g.costUsd); g.pnlPct = g.costUsd > 0 ? Math.round((g.pnlUsd / g.costUsd) * 1000) / 10 : null; }
  const groups = [...byCol.values()].sort((a, b) => b.valueUsd - a.valueUsd || b.count - a.count);
  const nftUsd = r2(groups.reduce((a, g) => a + g.valueUsd, 0));
  const costUsd = r2(groups.reduce((a, g) => a + g.costUsd, 0));
  return { wallet, sol, solUsd, walletUsd, nftUsd, nftCostUsd: costUsd, nftPnlUsd: r2(nftUsd - costUsd), nftPnlPct: costUsd > 0 ? Math.round(((nftUsd - costUsd) / costUsd) * 1000) / 10 : null, totalUsd: r2((walletUsd || 0) + nftUsd), nftCount: nfts.length, groups, profile: publicProfile(wallet, profile) };
}
export const publicProfile = (wallet, p) => ({ wallet, name: p?.name || null, username: p?.username || null, avatar: p?.avatar || null, bio: p?.bio || null });

export async function updateProfile(wallet, body) {
  const patch = { updatedAt: now() };
  if (body.name !== undefined) patch.name = body.name || null;
  if (body.bio !== undefined) patch.bio = body.bio || null;
  if (body.username !== undefined) {
    const u = (body.username || '').toLowerCase();
    if (u) {
      if (!/^[a-z0-9_]{3,20}$/.test(u)) throw bad('bad_username', 'Usernames are 3–20 letters, numbers or _');
      const taken = (await queryDocs(col('users').where('username', '==', u))).some((x) => x.id !== wallet);
      if (taken) throw conflict('username_taken', `@${u} is taken`);
    }
    patch.username = u || null;
  }
  if (body.avatar) {
    const b = Buffer.from(String(body.avatar.data || ''), 'base64');
    const mimetype = b[0] === 0xff && b[1] === 0xd8 ? 'image/jpeg' : b[0] === 0x89 && b[1] === 0x50 ? 'image/png' : b.slice(0, 3).toString() === 'GIF' ? 'image/gif' : b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP' ? 'image/webp' : null;
    if (!mimetype) throw bad('bad_file_type', 'Profile pictures must be JPG, PNG, GIF or WebP');
    if (b.length > 2e6) throw bad('file_too_large', 'Profile picture must be under 2MB');
    patch.avatar = (await saveUpload({ buffer: b, size: b.length, mimetype }, 'avatars')).url;
  }
  if (body.removeAvatar) patch.avatar = null;
  await col('users').doc(wallet).set(patch, { merge: true });
  return publicProfile(wallet, await getDoc('users', wallet));
}
