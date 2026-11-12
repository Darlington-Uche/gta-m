// All money leaving the vault outside of a user-signed transaction goes through this queue:
// refunds of offers and revenue withdrawals. Idempotent: the signature is saved BEFORE broadcast, so a retry
// first asks the chain "did the previous attempt land?" and only rebuilds when it provably did not.
import { col, getDoc, now, queryDocs, runTx } from '../lib/db.js';
import { chain } from './chain/index.js';
import { ledgerInTx } from './vault.service.js';
import { makeNotification } from './notifications.service.js';
import { getSettings } from './settings.service.js';
import { lamportsToSol } from '../lib/money.js';
import { log } from '../lib/logger.js';
import { config } from '../config/index.js';

const MAX_ATTEMPTS = 8;

/** Call inside a transaction (after all reads). Marks the offer as refunding and queues the payout. */
export function queueRefundInTx(tx, offer, finalStatus) {
  tx.update(col('offers').doc(offer.id), { status: 'refund_pending', finalStatus, refundQueuedAt: now() });
  tx.set(col('payouts').doc(`refund_${offer.id}`), {
    type: 'offer_refund', to: offer.bidder, lamports: offer.lamports, status: 'queued', attempts: 0,
    ref: { offerId: offer.id, itemId: offer.itemId }, createdAt: now(), updatedAt: now()
  });
}

async function complete(payoutId) {
  await runTx(async (tx) => {
    const pRef = col('payouts').doc(payoutId);
    const p = (await tx.get(pRef)).data();
    if (!p || p.status === 'sent') return;
    let offer = null, offerRef = null;
    if (p.type === 'offer_refund') { offerRef = col('offers').doc(p.ref.offerId); offer = (await tx.get(offerRef)).data(); }
    tx.update(pRef, { status: 'sent', sentAt: now(), updatedAt: now() });
    if (p.type === 'offer_refund') {
      const finalStatus = offer?.finalStatus || 'refunded';
      tx.update(offerRef, { status: finalStatus, refundedAt: now(), refundSignature: p.signature });
      ledgerInTx(tx, { type: 'offer_refund', lamports: -p.lamports, wallet: p.to, ref: { ...p.ref, signature: p.signature }, deltas: { escrow: -p.lamports } });
      const reasons = { cancelled: 'You cancelled your offer', rejected: 'The owner declined your offer', expired: 'Your offer expired', refunded: 'The NFT was sold to another buyer' };
      const n = makeNotification(p.to, 'offer_refunded', 'Offer refunded', `${reasons[finalStatus] || 'Offer refunded'}. ${lamportsToSol(p.lamports).toFixed(4)} SOL is back in your wallet.`, { offerId: p.ref.offerId, itemId: p.ref.itemId, signature: p.signature });
      tx.set(n.ref, n.data);
    }
  });
}

export async function processPayout(id) {
  const ref = col('payouts').doc(id);
  const p = await getDoc('payouts', id);
  if (!p || p.status === 'sent' || p.status === 'needs_review' || p.status === 'cancelled') return 'skip';

  // 1) previous attempt in flight? ask the chain.
  if (p.signature) {
    const st = await chain.signatureStatus(p.signature, p.lastValidBlockHeight);
    if (st === 'confirmed') { await complete(id); return 'sent'; }
    if (st === 'pending') {
      // not landed yet and not expired: re-send the SAME signed tx (idempotent on-chain) in case the first send never reached a node
      if (p.txB64) {
        try { await chain.broadcast(p.txB64); } catch (e) { log.warn(`payout ${id} rebroadcast: ${e.message}`); }
        if ((await chain.signatureStatus(p.signature, p.lastValidBlockHeight)) === 'confirmed') { await complete(id); return 'sent'; }
      }
      return 'waiting';
    }
    // failed / expired -> safe to rebuild below
  }
  if (p.attempts >= MAX_ATTEMPTS) { await ref.update({ status: 'needs_review', updatedAt: now() }); log.error(`payout ${id} needs manual review`); return 'needs_review'; }

  // 2) enough funds? (never dip into other bidders' escrow: caller totals are tracked in vault stats)
  const settings = await getSettings();
  const bal = await chain.getBalance(chain.vaultAddress);
  if (bal < p.lamports + 5000 + Math.min(settings.vaultReserveLamports, 1_000_000)) {
    await ref.update({ error: 'vault balance too low', attempts: p.attempts + 1, updatedAt: now() });
    log.error(`payout ${id}: vault balance too low (${bal})`);
    return 'underfunded';
  }

  // 3) build, SAVE signature, then broadcast
  const built = await chain.prepareVaultTransfer({ to: p.to, lamports: p.lamports });
  await ref.update({ status: 'sending', signature: built.signature, txB64: built.txB64, lastValidBlockHeight: built.lastValidBlockHeight, attempts: p.attempts + 1, error: null, updatedAt: now() });
  try { await chain.broadcast(built.txB64); } catch (e) { await ref.update({ error: e.message, updatedAt: now() }); log.warn(`payout ${id} broadcast: ${e.message}`); }
  for (let i = 0; i < 15; i++) {
    const st = await chain.signatureStatus(built.signature, built.lastValidBlockHeight);
    if (st === 'confirmed') { await complete(id); return 'sent'; }
    if (st === 'failed' || st === 'expired') return 'retry';
    await new Promise((r) => setTimeout(r, config.txPollMs));
  }
  return 'waiting';
}

export async function processPayouts() {
  const rows = [...await queryDocs(col('payouts').where('status', '==', 'queued')), ...await queryDocs(col('payouts').where('status', '==', 'sending'))];
  const out = [];
  for (const r of rows) {
    try { out.push([r.id, await processPayout(r.id)]); } catch (e) { log.error(`payout ${r.id}`, e); }
  }
  return out;
}
