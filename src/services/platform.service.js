// The platform as a market maker for minted NFTs.
//  - SELL TO PLATFORM: when the admin sets a floor price on a minted NFT, its owner can sell it to the platform for that
//    floor, paid in SOL. One transaction: NFT -> vault wallet, vault -> owner (the floor, in SOL at today's rate).
//  - COLLECT: the platform then owns it. The admin sets a resale price (0 = free) and any collector can take it:
//    collector -> vault (resale price), vault -> collector (the NFT), atomically.
import { col, now, runTx } from '../lib/db.js';
import { chain } from './chain/index.js';
import { getSettings } from './settings.service.js';
import { getItemRaw, invalidateCatalog, quoteUsd } from './items.service.js';
import { createPtx, newPtxId, publicPtx, registerHandler } from './pendingTx.service.js';
import { ledgerInTx } from './vault.service.js';
import { queueRefundInTx } from './payouts.service.js';
import { makeNotification } from './notifications.service.js';
import { assertUnlocked, lockFor, unlockIf } from './locks.js';
import { syncItemOwner } from './ownership.service.js';
import { bad, conflict, forbidden, unavailable } from '../lib/errors.js';
import { lamportsToSol } from '../lib/money.js';

const unlockOnly = async (itemId, ptxId) => {
  await runTx(async (tx) => {
    const s = await tx.get(col('items').doc(itemId));
    if (!s.exists) return;
    const u = unlockIf(s.data(), ptxId);
    if (u.lock === null) tx.update(col('items').doc(itemId), u);
  });
  invalidateCatalog();
};

/* ---------- owner sells to the platform at the floor ---------- */
export async function prepareSellToPlatform({ wallet, itemId }) {
  const settings = await getSettings();
  if (!settings.tradingEnabled) throw unavailable('Trading is paused right now');
  const item = await getItemRaw(itemId);
  if (item.status !== 'minted' || !item.owner) throw conflict('not_minted', 'Only minted NFTs can be sold');
  if (item.platformOwned) throw conflict('platform_owned', 'The platform already owns this NFT');
  if (item.owner !== wallet) throw forbidden('You do not own this NFT');
  if (!item.floorUsd) throw conflict('no_floor', 'The platform has not set a floor price for this piece yet.');
  const onchain = await chain.getAssetOwner(item.asset);
  if (onchain !== wallet) { await syncItemOwner(item); throw conflict('not_owner_onchain', 'Your wallet does not hold this NFT on-chain. Ownership has been refreshed.'); }
  if (!item.collection) throw conflict('no_collection', 'This NFT has no collection on record');

  const q = await quoteUsd(item.floorUsd);
  const vaultBal = await chain.getBalance(chain.vaultAddress).catch(() => null);
  if (vaultBal != null && vaultBal < q.lamports + 5_000_000) throw unavailable('The platform wallet is low on SOL right now, so it cannot buy this piece. Try again later.');

  const ptxId = newPtxId();
  await runTx(async (tx) => {
    const s = await tx.get(col('items').doc(item.id));
    assertUnlocked(s.data());
    if (s.data().owner !== wallet) throw forbidden('You do not own this NFT');
    tx.update(col('items').doc(item.id), lockFor(ptxId, 'sell_platform'));
  });
  try {
    const built = await chain.buildAcceptOfferTx({ seller: wallet, buyer: chain.vaultAddress, asset: item.asset, sellerPayout: q.lamports, devFee: 0, collection: item.collection });
    const data = { itemId: item.id, asset: item.asset, seller: wallet, lamports: q.lamports, usd: item.floorUsd };
    const ptx = await createPtx({ id: ptxId, kind: 'sell_platform', wallet, refId: item.id, data, built });
    return { ...publicPtx(ptx), txB64: built.txB64, summary: { youReceiveSol: lamportsToSol(q.lamports), usd: item.floorUsd } };
  } catch (e) { await unlockOnly(item.id, ptxId); throw e; }
}
registerHandler('sell_platform', {
  async finalize(ptx) {
    const d = ptx.data;
    await runTx(async (tx) => {
      const itemRef = col('items').doc(d.itemId);
      const [iS, offS, lS] = await Promise.all([tx.get(itemRef), tx.get(col('offers').where('itemId', '==', d.itemId).where('status', '==', 'active')), tx.get(col('listings').doc(d.itemId))]);
      const it = iS.data(); if (!it || it.platformOwned) return; // idempotent
      tx.update(itemRef, { owner: chain.vaultAddress, platformOwned: true, resaleUsd: null, floorUsd: null, lock: null, lastOwnerCheck: now(), boughtByPlatformAt: now(), updatedAt: now() });
      if (lS.exists && lS.data().status === 'active') tx.update(col('listings').doc(d.itemId), { status: 'cancelled', cancelledAt: now(), reason: 'sold_to_platform' });
      tx.set(col('sales').doc(`platform_${ptx.id}`), { type: 'platform_buy', itemId: d.itemId, asset: d.asset, buyer: chain.vaultAddress, seller: d.seller, lamports: d.lamports, saleFee: 0, sellerPayout: d.lamports, devFee: 0, usd: d.usd, signature: ptx.signature, createdAt: now() });
      ledgerInTx(tx, { type: 'platform_buy', lamports: -d.lamports, wallet: d.seller, ref: { itemId: d.itemId, signature: ptx.signature }, deltas: { revenue: -d.lamports } });
      for (const doc of offS.docs) queueRefundInTx(tx, { id: doc.id, ...doc.data() }, 'refunded'); // nobody can accept offers on a platform-owned piece
      const n = makeNotification(d.seller, 'sale_completed', 'Sold to the platform', `${it.title} sold for ${lamportsToSol(d.lamports).toFixed(3)} SOL. It is in your wallet now.`, { itemId: d.itemId, signature: ptx.signature }); tx.set(n.ref, n.data);
    });
    invalidateCatalog();
  },
  rollback: (ptx) => unlockOnly(ptx.data.itemId, ptx.id)
});

/* ---------- collector takes a platform-owned piece at the resale price (0 = free) ---------- */
export async function prepareCollect({ wallet, itemId }) {
  const settings = await getSettings();
  if (!settings.tradingEnabled) throw unavailable('Trading is paused right now');
  const item = await getItemRaw(itemId);
  if (!item.platformOwned || item.resaleUsd == null) throw conflict('not_for_sale', 'This piece is not available right now.');
  if (item.hidden) throw conflict('not_for_sale', 'This piece is not available right now.');
  const onchain = await chain.getAssetOwner(item.asset);
  if (onchain !== chain.vaultAddress) { await syncItemOwner(item); throw conflict('not_available', 'This piece is no longer with the platform.'); }
  if (!item.collection) throw conflict('no_collection', 'This NFT has no collection on record');
  const q = item.resaleUsd > 0 ? await quoteUsd(item.resaleUsd) : { lamports: 0, sol: 0, solUsd: null };
  const ptxId = newPtxId();
  await runTx(async (tx) => {
    const s = await tx.get(col('items').doc(item.id));
    assertUnlocked(s.data());
    if (!s.data().platformOwned) throw conflict('not_available', 'This piece is no longer with the platform.');
    tx.update(col('items').doc(item.id), lockFor(ptxId, 'collect_platform'));
  });
  try {
    const built = await chain.buildCollectFromPlatformTx({ buyer: wallet, asset: item.asset, lamports: q.lamports, collection: item.collection });
    const data = { itemId: item.id, asset: item.asset, buyer: wallet, lamports: q.lamports, usd: item.resaleUsd };
    const ptx = await createPtx({ id: ptxId, kind: 'collect_platform', wallet, refId: item.id, data, built });
    return { ...publicPtx(ptx), txB64: built.txB64, price: { usd: item.resaleUsd, sol: q.sol, lamports: q.lamports, solUsd: q.solUsd } };
  } catch (e) { await unlockOnly(item.id, ptxId); throw e; }
}
registerHandler('collect_platform', {
  async finalize(ptx) {
    const d = ptx.data;
    await runTx(async (tx) => {
      const itemRef = col('items').doc(d.itemId);
      const it = (await tx.get(itemRef)).data(); if (!it || !it.platformOwned) return; // idempotent
      tx.update(itemRef, { owner: d.buyer, platformOwned: false, resaleUsd: null, floorUsd: null, lock: null, lastOwnerCheck: now(), updatedAt: now() });
      tx.set(col('sales').doc(`collect_${ptx.id}`), { type: 'platform_sale', itemId: d.itemId, asset: d.asset, buyer: d.buyer, seller: chain.vaultAddress, lamports: d.lamports, saleFee: d.lamports, sellerPayout: 0, devFee: 0, usd: d.usd, signature: ptx.signature, createdAt: now() });
      if (d.lamports > 0) ledgerInTx(tx, { type: 'platform_sale', lamports: d.lamports, wallet: d.buyer, ref: { itemId: d.itemId, signature: ptx.signature }, deltas: { revenue: d.lamports } });
      const n = makeNotification(d.buyer, 'purchase_completed', 'It\'s yours', `${it.title} is now in your wallet.`, { itemId: d.itemId, signature: ptx.signature }); tx.set(n.ref, n.data);
    });
    invalidateCatalog();
  },
  rollback: (ptx) => unlockOnly(ptx.data.itemId, ptx.id)
});
