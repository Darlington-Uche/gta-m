// Secondary market. Anyone can offer on any minted NFT — the owner does not have to list it.
//  * Placing an offer moves the bidder's SOL into the vault wallet (escrow). USD amount is converted to SOL at that moment.
//  * The owner can accept (one tx: NFT -> bidder, vault -> owner payout, owner -> vault ~$0.30 network fee) or reject.
//  * When one offer is accepted, every other offer on that NFT is refunded from the vault.
import { col, getDoc, now, queryDocs, runTx } from '../lib/db.js';
import { chain } from './chain/index.js';
import { bidWindowState, getSettings } from './settings.service.js';
import { getItemRaw, invalidateCatalog, quoteUsd } from './items.service.js';
import { createPtx, newPtxId, publicPtx, registerHandler } from './pendingTx.service.js';
import { ledgerInTx } from './vault.service.js';
import { queueRefundInTx } from './payouts.service.js';
import { makeNotification } from './notifications.service.js';
import { lockFor, assertUnlocked, unlockIf } from './locks.js';
import { syncItemOwner } from './ownership.service.js';
import { bad, conflict, forbidden, notFound, unavailable } from '../lib/errors.js';
import { feeOf, lamportsToSol, usdToLamportsCeil, roundUsd } from '../lib/money.js';

const ACTIVE = ['active'];
export const activeOffersFor = (itemId) => queryDocs(col('offers').where('itemId', '==', String(itemId)).where('status', '==', 'active'));
const pendingOffersFor = (itemId) => queryDocs(col('offers').where('itemId', '==', String(itemId)).where('status', '==', 'pending_payment'));

export const publicOffer = (o) => ({
  id: o.id, itemId: o.itemId, bidder: o.bidder, usd: o.usdAtPlacement, sol: lamportsToSol(o.lamports), lamports: o.lamports,
  status: o.status, createdAt: o.createdAt, expiresAt: o.expiresAt || null,
  paymentSignature: o.paymentSignature || null, refundSignature: o.refundSignature || null, refundedAt: o.refundedAt || null,
  saleSignature: o.status === 'accepted' ? o.signature || null : null
});

/* ---------- place ---------- */
export async function prepareOffer({ wallet, itemId, usd }) {
  const settings = await getSettings();
  if (!settings.tradingEnabled) throw unavailable('Trading is paused right now');
  const win = bidWindowState(settings);
  if (!win.open) throw conflict('bid_window_closed', 'Offers are only accepted during the bidding window', win);
  if (usd < settings.minOfferUsd) throw bad('offer_too_low', `Minimum offer is $${settings.minOfferUsd}`);
  const item = await getItemRaw(itemId);
  if (item.hidden) throw notFound('Artwork not found');
  if (item.status !== 'minted' || !item.owner) throw conflict('not_minted', 'This NFT has not been minted yet — mint it at the listed price instead.');
  if (item.owner === wallet) throw bad('own_item', 'You already own this NFT');

  const q = await quoteUsd(usd);
  const offerRef = col('offers').doc(), ptxId = newPtxId();
  await runTx(async (tx) => {
    const [act, pend] = await Promise.all([
      tx.get(col('offers').where('itemId', '==', item.id).where('status', '==', 'active')),
      tx.get(col('offers').where('itemId', '==', item.id).where('status', '==', 'pending_payment'))
    ]);
    const all = [...act.docs, ...pend.docs].map((d) => d.data());
    if (all.some((o) => o.bidder === wallet)) throw conflict('offer_exists', 'You already have an offer on this NFT. Cancel it first to change the amount.');
    if (act.size >= settings.maxActiveOffersPerItem) throw conflict('too_many_offers', 'This NFT has reached its maximum number of offers');
    tx.set(offerRef, { itemId: item.id, asset: item.asset, bidder: wallet, lamports: q.lamports, usdAtPlacement: usd, solUsdAtPlacement: q.solUsd, status: 'pending_payment', ptxId, createdAt: now() });
  });
  try {
    const built = await chain.buildPaymentTx({ payer: wallet, lamports: q.lamports });
    const ptx = await createPtx({ id: ptxId, kind: 'offer_payment', wallet, refId: offerRef.id, data: { offerId: offerRef.id, itemId: item.id, lamports: q.lamports }, built });
    return { ...publicPtx(ptx), txB64: built.txB64, offerId: offerRef.id, price: { usd, sol: q.sol, lamports: q.lamports, solUsd: q.solUsd } };
  } catch (e) { await offerPaymentRollback({ data: { offerId: offerRef.id } }); throw e; }
}

async function offerPaymentFinalize(ptx) {
  const { offerId, lamports } = ptx.data;
  const settings = await getSettings();
  await runTx(async (tx) => {
    const ref = col('offers').doc(offerId);
    const o = (await tx.get(ref)).data();
    if (!o || (o.status !== 'pending_payment' && o.status !== 'failed')) return; // idempotent
    const item = (await tx.get(col('items').doc(o.itemId))).data();
    const base = { id: offerId, ...o };
    if (o.status === 'failed') { // payment landed after we had given up on it: money is in the vault, send it back
      ledgerInTx(tx, { type: 'offer_escrow_in', lamports, wallet: o.bidder, ref: { offerId, ptxId: ptx.id, late: true }, deltas: { escrow: lamports } });
      queueRefundInTx(tx, base, 'cancelled');
      return;
    }
    tx.update(ref, { status: 'active', activatedAt: now(), expiresAt: now() + settings.offerTtlHours * 3_600_000, signature: ptx.signature, paymentSignature: ptx.signature });
    ledgerInTx(tx, { type: 'offer_escrow_in', lamports, wallet: o.bidder, ref: { offerId, itemId: o.itemId, ptxId: ptx.id, signature: ptx.signature }, deltas: { escrow: lamports } });
    if (item?.owner) {
      const n = makeNotification(item.owner, 'offer_received', 'New offer on your NFT', `${shortWallet(o.bidder)} offered $${o.usdAtPlacement} (${lamportsToSol(lamports).toFixed(3)} SOL) for ${item.title}.`, { offerId, itemId: o.itemId, usd: o.usdAtPlacement });
      tx.set(n.ref, n.data);
    }
  });
  invalidateCatalog();
}
async function offerPaymentRollback(ptx) {
  await runTx(async (tx) => {
    const ref = col('offers').doc(ptx.data.offerId);
    const o = (await tx.get(ref)).data();
    if (o && o.status === 'pending_payment') tx.update(ref, { status: 'failed', failedAt: now() });
  });
}
registerHandler('offer_payment', { finalize: offerPaymentFinalize, rollback: offerPaymentRollback });

const shortWallet = (w) => `${w.slice(0, 4)}…${w.slice(-4)}`;

/* ---------- cancel / reject ---------- */
export async function cancelOffer({ wallet, offerId }) {
  await runTx(async (tx) => {
    const s = await tx.get(col('offers').doc(offerId));
    if (!s.exists) throw notFound('Offer not found');
    const o = { id: s.id, ...s.data() };
    if (o.bidder !== wallet) throw forbidden('Not your offer');
    if (o.status !== 'active') throw conflict('not_cancellable', `Offer is ${o.status}`);
    queueRefundInTx(tx, o, 'cancelled');
  });
  invalidateCatalog();
  return { status: 'refund_pending' };
}
export async function rejectOffer({ wallet, offerId }) {
  await runTx(async (tx) => {
    const s = await tx.get(col('offers').doc(offerId));
    if (!s.exists) throw notFound('Offer not found');
    const o = { id: s.id, ...s.data() };
    const item = (await tx.get(col('items').doc(o.itemId))).data();
    if (!item || item.owner !== wallet) throw forbidden('Only the owner can reject offers');
    if (o.status !== 'active') throw conflict('not_rejectable', `Offer is ${o.status}`);
    queueRefundInTx(tx, o, 'rejected');
  });
  invalidateCatalog();
  return { status: 'refund_pending' };
}

/* ---------- accept (seller signs: NFT out + dev fee; vault pays them) ---------- */
export async function prepareAccept({ wallet, offerId }) {
  const settings = await getSettings();
  if (!settings.tradingEnabled) throw unavailable('Trading is paused right now');
  const offer = await getDoc('offers', offerId);
  if (!offer) throw notFound('Offer not found');
  if (offer.status !== 'active') throw conflict('offer_not_active', `This offer is ${offer.status}`);
  if (offer.expiresAt && offer.expiresAt < now()) throw conflict('offer_expired', 'This offer has expired');
  const item = await getItemRaw(offer.itemId);
  if (item.owner !== wallet) throw forbidden('You do not own this NFT');
  const onchain = await chain.getAssetOwner(item.asset);
  if (onchain !== wallet) { await syncItemOwner(item); throw conflict('not_owner_onchain', 'Your wallet does not hold this NFT on-chain. Ownership has been refreshed.'); }

  if (!item.collection) throw conflict('no_collection', 'This NFT has no collection on record');
  const dev = await quoteUsd(settings.acceptFeeUsd);
  const saleFee = feeOf(offer.lamports, settings.saleFeeBps);
  const sellerPayout = offer.lamports - saleFee;
  if (sellerPayout <= dev.lamports * 2) throw bad('offer_too_small', 'This offer is too small to cover the network fee');

  const ptxId = newPtxId();
  await runTx(async (tx) => {
    const [iS, oS] = await Promise.all([tx.get(col('items').doc(item.id)), tx.get(col('offers').doc(offerId))]);
    const it = iS.data(), o = oS.data();
    if (o.status !== 'active') throw conflict('offer_not_active', `This offer is ${o.status}`);
    if (it.owner !== wallet) throw forbidden('You do not own this NFT');
    assertUnlocked(it);
    tx.update(col('items').doc(item.id), lockFor(ptxId, 'accept'));
    tx.update(col('offers').doc(offerId), { status: 'accepting', ptxId });
  });
  try {
    const built = await chain.buildAcceptOfferTx({ seller: wallet, buyer: offer.bidder, asset: item.asset, sellerPayout, devFee: dev.lamports, collection: item.collection });
    const data = { offerId, itemId: item.id, seller: wallet, buyer: offer.bidder, asset: item.asset, lamports: offer.lamports, saleFee, sellerPayout, devFee: dev.lamports, usd: offer.usdAtPlacement };
    const ptx = await createPtx({ id: ptxId, kind: 'accept_offer', wallet, refId: offerId, data, built });
    invalidateCatalog();
    return { ...publicPtx(ptx), txB64: built.txB64, summary: { youReceiveSol: lamportsToSol(sellerPayout), platformFeeSol: lamportsToSol(saleFee), networkFeeSol: lamportsToSol(dev.lamports), networkFeeUsd: settings.acceptFeeUsd, buyer: offer.bidder } };
  } catch (e) { await acceptRollback({ id: ptxId, data: { offerId, itemId: item.id } }); throw e; }
}

async function acceptFinalize(ptx) {
  const d = ptx.data;
  await runTx(async (tx) => {
    const offerRef = col('offers').doc(d.offerId), itemRef = col('items').doc(d.itemId), listRef = col('listings').doc(d.itemId);
    const [oS, iS, lS, othersS] = await Promise.all([
      tx.get(offerRef), tx.get(itemRef), tx.get(listRef),
      tx.get(col('offers').where('itemId', '==', d.itemId).where('status', '==', 'active'))
    ]);
    const o = oS.data(), it = iS.data();
    if (!o || o.status === 'accepted') return; // idempotent
    tx.update(offerRef, { status: 'accepted', acceptedAt: now(), signature: ptx.signature });
    tx.update(itemRef, { owner: d.buyer, lock: null, lastOwnerCheck: now() });
    if (lS.exists && lS.data().status === 'active') tx.update(listRef, { status: 'cancelled', cancelledAt: now(), reason: 'sold_via_offer' });
    tx.set(col('sales').doc(`offer_${d.offerId}`), { type: 'offer', itemId: d.itemId, asset: d.asset, buyer: d.buyer, seller: d.seller, lamports: d.lamports, saleFee: d.saleFee, sellerPayout: d.sellerPayout, devFee: d.devFee, usd: d.usd, signature: ptx.signature, createdAt: now() });
    ledgerInTx(tx, { type: 'offer_sale_settled', lamports: -d.lamports, wallet: d.buyer, ref: { offerId: d.offerId, itemId: d.itemId, signature: ptx.signature }, deltas: { escrow: -d.lamports } });
    ledgerInTx(tx, { type: 'sale_fee', lamports: d.saleFee, wallet: d.seller, ref: { offerId: d.offerId, itemId: d.itemId }, deltas: { revenue: d.saleFee } });
    ledgerInTx(tx, { type: 'dev_fee', lamports: d.devFee, wallet: d.seller, ref: { offerId: d.offerId }, deltas: { revenue: d.devFee } });
    // everyone else who offered gets their SOL back
    for (const doc of othersS.docs) {
      if (doc.id === d.offerId) continue;
      const other = { id: doc.id, ...doc.data() };
      queueRefundInTx(tx, other, 'refunded');
    }
    const t = it?.title || 'NFT';
    for (const [w, type, title, body] of [
      [d.buyer, 'offer_accepted', 'Offer accepted', `${t} is now yours.`],
      [d.seller, 'sale_completed', 'Sold', `${t} sold for ${lamportsToSol(d.lamports).toFixed(3)} SOL. You received ${lamportsToSol(d.sellerPayout).toFixed(3)} SOL.`]
    ]) { const n = makeNotification(w, type, title, body, { itemId: d.itemId, offerId: d.offerId, signature: ptx.signature }); tx.set(n.ref, n.data); }
  });
  invalidateCatalog();
}
async function acceptRollback(ptx) {
  const { offerId, itemId } = ptx.data;
  await runTx(async (tx) => {
    const [oS, iS] = await Promise.all([tx.get(col('offers').doc(offerId)), tx.get(col('items').doc(itemId))]);
    if (oS.exists && oS.data().status === 'accepting') tx.update(col('offers').doc(offerId), { status: 'active' });
    if (iS.exists) { const u = unlockIf(iS.data(), ptx.id); if (u.lock === null) tx.update(col('items').doc(itemId), u); }
  });
  invalidateCatalog();
}
registerHandler('accept_offer', { finalize: acceptFinalize, rollback: acceptRollback });

/* ---------- reads ---------- */
export async function offersForItem(itemId) {
  return (await activeOffersFor(itemId)).sort((a, b) => b.lamports - a.lamports).map(publicOffer);
}
export async function offersMadeBy(wallet) {
  const rows = await queryDocs(col('offers').where('bidder', '==', wallet));
  return rows.filter((o) => o.status !== 'failed').sort((a, b) => b.createdAt - a.createdAt).map(publicOffer);
}
export async function offersReceivedBy(wallet) {
  const items = await queryDocs(col('items').where('owner', '==', wallet));
  const lists = await Promise.all(items.map(async (i) => (await activeOffersFor(i.id)).map((o) => ({ ...publicOffer(o), itemTitle: i.title, itemImage: i.image }))));
  return lists.flat().sort((a, b) => b.usd - a.usd);
}

/* ---------- worker: expire old offers ---------- */
export async function expireOffers() {
  const act = await queryDocs(col('offers').where('status', '==', 'active'));
  let n = 0;
  for (const o of act) {
    if (!o.expiresAt || o.expiresAt > now()) continue;
    try {
      await runTx(async (tx) => {
        const s = await tx.get(col('offers').doc(o.id));
        if (s.data().status === 'active') queueRefundInTx(tx, { id: o.id, ...s.data() }, 'expired');
      });
      n++;
    } catch { /* retried next pass */ }
  }
  if (n) invalidateCatalog();
  return n;
}
