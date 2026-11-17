// Owner-set fixed price ("sale price"). Offers still work on a listed NFT.
// Listing = the owner signs once to let the platform move the NFT (Core TransferDelegate). A buyer then pays in ONE
// atomic transaction: buyer -> vault, vault -> seller (minus fees), platform moves the NFT to the buyer.
import { col, getDoc, now, runTx } from '../lib/db.js';
import { chain } from './chain/index.js';
import { config } from '../config/index.js';
import { getSettings } from './settings.service.js';
import { getItemRaw, invalidateCatalog, quoteUsd } from './items.service.js';
import { createPtx, newPtxId, publicPtx, registerHandler } from './pendingTx.service.js';
import { ledgerInTx, saleFeeSplitInTx } from './vault.service.js';
import { queueRefundInTx } from './payouts.service.js';
import { makeNotification } from './notifications.service.js';
import { assertUnlocked, lockFor, unlockIf } from './locks.js';
import { syncItemOwner } from './ownership.service.js';
import { bad, conflict, forbidden, notFound, unavailable } from '../lib/errors.js';
import { feeOf, lamportsToSol } from '../lib/money.js';
import { isGta, quoteGtaUsd, requireGta } from './gtamarket.service.js';

async function requireOwner(wallet, itemId) {
  const item = await getItemRaw(itemId);
  if (item.status !== 'minted') throw conflict('not_minted', 'Only minted NFTs can be listed');
  if (item.owner !== wallet) throw forbidden('You do not own this NFT');
  const onchain = await chain.getAssetOwner(item.asset);
  if (onchain !== wallet) { await syncItemOwner(item); throw conflict('not_owner_onchain', 'Your wallet does not hold this NFT on-chain. Ownership has been refreshed.'); }
  return item;
}

export async function prepareList({ wallet, itemId, priceUsd }) {
  const settings = await getSettings();
  if (!settings.tradingEnabled) throw unavailable('Trading is paused right now');
  if (priceUsd < settings.minOfferUsd) throw bad('price_too_low', `Minimum price is $${settings.minOfferUsd}`);
  const item = await requireOwner(wallet, itemId);
  if (!item.collection) throw conflict('no_collection', 'This NFT has no collection on record');
  const ptxId = newPtxId();
  await runTx(async (tx) => {
    const s = await tx.get(col('items').doc(item.id));
    assertUnlocked(s.data());
    tx.update(col('items').doc(item.id), lockFor(ptxId, 'list'));
  });
  try {
    const built = await chain.buildListTx({ owner: wallet, asset: item.asset, collection: item.collection });
    const ptx = await createPtx({ id: ptxId, kind: 'list', wallet, refId: item.id, data: { itemId: item.id, asset: item.asset, priceUsd }, built });
    return { ...publicPtx(ptx), txB64: built.txB64, priceUsd };
  } catch (e) { await unlockOnly(item.id, ptxId); throw e; }
}
async function unlockOnly(itemId, ptxId) {
  await runTx(async (tx) => {
    const s = await tx.get(col('items').doc(itemId));
    if (!s.exists) return;
    const u = unlockIf(s.data(), ptxId);
    if (u.lock === null) tx.update(col('items').doc(itemId), u);
  });
  invalidateCatalog();
}
registerHandler('list', {
  async finalize(ptx) {
    const { itemId, asset, priceUsd } = ptx.data;
    await runTx(async (tx) => {
      const s = await tx.get(col('items').doc(itemId));
      const it = s.data();
      tx.set(col('listings').doc(itemId), { itemId, asset, seller: ptx.wallet, priceUsd, status: 'active', createdAt: now() });
      if (it) { const u = unlockIf(it, ptx.id); if (u.lock === null) tx.update(col('items').doc(itemId), u); }
    });
    invalidateCatalog();
  },
  rollback: (ptx) => unlockOnly(ptx.data.itemId, ptx.id)
});

export async function updateListing({ wallet, itemId, priceUsd }) {
  const settings = await getSettings();
  if (priceUsd < settings.minOfferUsd) throw bad('price_too_low', `Minimum price is $${settings.minOfferUsd}`);
  const l = await getDoc('listings', itemId);
  if (!l || l.status !== 'active') throw notFound('No active listing');
  if (l.seller !== wallet) throw forbidden();
  await col('listings').doc(itemId).update({ priceUsd, updatedAt: now() });
  invalidateCatalog();
  return { priceUsd };
}
export async function cancelListing({ wallet, itemId }) {
  const l = await getDoc('listings', itemId);
  if (!l || l.status !== 'active') throw notFound('No active listing');
  if (l.seller !== wallet) throw forbidden();
  await col('listings').doc(itemId).update({ status: 'cancelled', cancelledAt: now(), reason: 'seller_cancelled' });
  invalidateCatalog();
  return { cancelled: true };
}

export async function prepareBuy({ wallet, itemId, currency }) {
  const settings = await getSettings();
  if (!settings.tradingEnabled) throw unavailable('Trading is paused right now');
  const item = await getItemRaw(itemId);
  const listing = await getDoc('listings', item.id);
  if (!listing || listing.status !== 'active') throw conflict('not_listed', 'This NFT is not for sale at a fixed price');
  if (listing.seller !== item.owner) throw conflict('stale_listing', 'This listing is no longer valid');
  if (listing.seller === wallet) throw bad('own_item', 'You own this NFT');
  const onchain = await chain.getAssetOwner(item.asset);
  if (onchain !== listing.seller) { await syncItemOwner(item); throw conflict('not_owner_onchain', 'The seller no longer holds this NFT. Listing cancelled.'); }
  if (!(await chain.hasDelegate(item.asset, chain.authorityAddress))) throw conflict('listing_not_ready', 'The seller has not approved this listing on-chain. Try an offer instead.');

  if (!item.collection) throw conflict('no_collection', 'This NFT has no collection on record');
  const q = await quoteUsd(listing.priceUsd);
  const quotedDev = await quoteUsd(settings.acceptFeeUsd);
  const saleFee = feeOf(q.lamports, settings.saleFeeBps);
  const dev = { ...quotedDev, lamports: Math.min(quotedDev.lamports, Math.floor((q.lamports - saleFee) / 4)) }; // small sales pay a smaller flat fee
  const sellerPayout = q.lamports - saleFee - dev.lamports;
  if (sellerPayout <= 20_000) throw bad('price_too_low', 'Price is too low to cover fees');

  // $GTAMARKET: same split, in token units. The buyer pays the seller directly and the fees to the vault in the same atomic tx.
  let gta = null;
  if (isGta(currency)) {
    const gq = await requireGta(wallet, listing.priceUsd);
    const feeU = feeOf(gq.units, settings.saleFeeBps), devQ = await quoteGtaUsd(settings.acceptFeeUsd);
    const devU = Math.min(devQ.units, Math.floor((gq.units - feeU) / 4)), sellerU = gq.units - feeU - devU;
    if (sellerU <= 0) throw bad('price_too_low', 'Price is too low to cover fees');
    gta = { gq, saleFee: feeU, devFee: devU, sellerPayout: sellerU };
  }

  const ptxId = newPtxId();
  await runTx(async (tx) => {
    const s = await tx.get(col('items').doc(item.id));
    assertUnlocked(s.data());
    tx.update(col('items').doc(item.id), lockFor(ptxId, 'buy'));
  });
  try {
    const built = await chain.buildBuyListingTx({ buyer: wallet, seller: listing.seller, asset: item.asset, price: q.lamports, sellerPayout, devFee: dev.lamports, collection: item.collection,
      token: gta ? { mint: gta.gq.mint, decimals: gta.gq.decimals, sellerUnits: gta.sellerPayout, feeUnits: gta.saleFee + gta.devFee } : null });
    const data = gta
      ? { itemId: item.id, asset: item.asset, buyer: wallet, seller: listing.seller, lamports: gta.gq.units, saleFee: gta.saleFee, sellerPayout: gta.sellerPayout, devFee: gta.devFee, usd: listing.priceUsd, currency: 'gtamarket', decimals: gta.gq.decimals, gtaUsd: gta.gq.gtaUsd }
      : { itemId: item.id, asset: item.asset, buyer: wallet, seller: listing.seller, lamports: q.lamports, saleFee, sellerPayout, devFee: dev.lamports, usd: listing.priceUsd };
    const ptx = await createPtx({ id: ptxId, kind: 'buy_listing', wallet, refId: item.id, data, built });
    return { ...publicPtx(ptx), txB64: built.txB64, price: gta ? { usd: listing.priceUsd, currency: 'gtamarket', tokens: gta.gq.tokens, gtaUsd: gta.gq.gtaUsd } : { usd: listing.priceUsd, sol: q.sol, lamports: q.lamports, solUsd: q.solUsd } };
  } catch (e) { await unlockOnly(item.id, ptxId); throw e; }
}

registerHandler('buy_listing', {
  async finalize(ptx) {
    const d = ptx.data, tok = d.currency === 'gtamarket', cur = tok ? { currency: 'gtamarket' } : {}, poolOn = !!((await getSettings()).feePool || {}).enabled;
    const unit = tok ? '$GTAMARKET' : 'SOL', amt = (n) => (tok ? (n / 10 ** (d.decimals || 6)).toLocaleString('en-US', { maximumFractionDigits: 2 }) : lamportsToSol(n).toFixed(3));
    await runTx(async (tx) => {
      const itemRef = col('items').doc(d.itemId), listRef = col('listings').doc(d.itemId);
      const [iS, lS, offS] = await Promise.all([tx.get(itemRef), tx.get(listRef), tx.get(col('offers').where('itemId', '==', d.itemId).where('status', '==', 'active'))]);
      const it = iS.data();
      if (!it) return;
      if (it.owner === d.buyer && (!lS.exists || lS.data().status === 'sold')) return; // idempotent
    const launch = it && it.launchId ? (await tx.get(col('launches').doc(it.launchId))).data() : null; // its creator gets half the sale fee
      tx.update(itemRef, { owner: d.buyer, lock: null, lastOwnerCheck: now() });
      if (lS.exists) tx.update(listRef, { status: 'sold', soldAt: now(), buyer: d.buyer, signature: ptx.signature });
      tx.set(col('sales').doc(`listing_${ptx.id}`), { type: 'listing', itemId: d.itemId, asset: d.asset, buyer: d.buyer, seller: d.seller, lamports: d.lamports, saleFee: d.saleFee, sellerPayout: d.sellerPayout, devFee: d.devFee, usd: d.usd, ...cur, signature: ptx.signature, createdAt: now() });
      saleFeeSplitInTx(tx, { saleFee: d.saleFee, seller: d.seller, creator: launch ? launch.wallet : null, platformWallet: config.auth.platformWallet, ref: { itemId: d.itemId, signature: ptx.signature }, payoutId: `creatorfee_${ptx.id}`, currency: d.currency, toPool: poolOn });
      ledgerInTx(tx, { type: 'dev_fee', lamports: d.devFee, wallet: d.seller, ref: { itemId: d.itemId }, ...cur, deltas: { revenue: d.devFee } });
      for (const doc of offS.docs) queueRefundInTx(tx, { id: doc.id, ...doc.data() }, 'refunded');
      for (const [w, type, title, body] of [
        [d.buyer, 'purchase_completed', 'Purchase complete', `${it.title} is now yours.`],
        [d.seller, 'sale_completed', 'Sold', `${it.title} sold for ${amt(d.lamports)} ${unit}. You received ${amt(d.sellerPayout)} ${unit}.`]
      ]) { const n = makeNotification(w, type, title, body, { itemId: d.itemId, signature: ptx.signature }); tx.set(n.ref, n.data); }
    });
    invalidateCatalog();
  },
  rollback: (ptx) => unlockOnly(ptx.data.itemId, ptx.id)
});

/** List several NFTs at one price each: one prepared tx per NFT, returned together so the wallet signs them in one approval. */
export async function prepareBulkList({ wallet, itemIds, priceUsd }) {
  const out = [], skipped = [];
  for (const itemId of [...new Set(itemIds.map(String))].slice(0, 10)) {
    try { const p = await prepareList({ wallet, itemId, priceUsd }); out.push({ itemId, ptxId: p.ptxId, txB64: p.txB64 }); } catch (e) { skipped.push({ itemId, reason: e.message }); }
  }
  if (!out.length) throw conflict('nothing_to_list', skipped[0]?.reason || 'None of these can be listed right now');
  return { ptxs: out, skipped };
}
