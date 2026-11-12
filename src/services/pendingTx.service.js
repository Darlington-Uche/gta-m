// Every user-signed transaction (mint, offer payment, accept, list, buy) goes through here:
//   prepare (flow-specific)  ->  createPtx  ->  user signs  ->  POST /tx/submit  ->  submitPtx  ->  finalize handler
// Handlers are idempotent, and reconcile() finishes/rolls back anything left half-way (crash, slow RPC, user vanished).
import { col, getDoc, now, queryDocs, runTx } from '../lib/db.js';
import { chain } from './chain/index.js';
import { TxRejected } from './chain/errors.js';
import { bad, conflict, forbidden, notFound } from '../lib/errors.js';
import { TX_TTL_MS } from '../lib/constants.js';
import { log } from '../lib/logger.js';
import { config } from '../config/index.js';

const handlers = new Map();
/** kind -> { finalize(ptx), rollback(ptx) } — both must be safe to call more than once. */
export const registerHandler = (kind, h) => handlers.set(kind, h);

export const newPtxId = () => col('pendingTxs').doc().id;

export async function createPtx({ id, kind, wallet, refId, data = {}, built }) {
  const doc = {
    kind, wallet, refId, data,
    messageHash: built.messageHash, lastValidBlockHeight: built.lastValidBlockHeight,
    ixHashes: built.ixHashes || null, feePayer: built.feePayer || null, blockhash: built.blockhash || null, extraKeys: built.extraKeys || null,
    status: 'prepared', signature: null, createdAt: now(), expiresAt: now() + TX_TTL_MS, updatedAt: now()
  };
  await col('pendingTxs').doc(id).set(doc);
  return { id, ...doc };
}
export const publicPtx = (p) => ({ ptxId: p.id, kind: p.kind, status: p.status, signature: p.signature, explorer: p.signature ? chain.explorerTx(p.signature) : null, expiresAt: p.expiresAt });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function finalize(ptx) {
  const h = handlers.get(ptx.kind);
  if (!h) throw new Error('no handler for ' + ptx.kind);
  await h.finalize(ptx); // idempotent
  await col('pendingTxs').doc(ptx.id).update({ status: 'confirmed', updatedAt: now() });
  log.info(`ptx ${ptx.id} (${ptx.kind}) confirmed ${ptx.signature}`);
}
async function rollback(ptx, status) {
  const h = handlers.get(ptx.kind);
  if (h) await h.rollback(ptx);
  await col('pendingTxs').doc(ptx.id).update({ status, updatedAt: now() });
  log.info(`ptx ${ptx.id} (${ptx.kind}) ${status}`);
}

/** The user sends either the signed tx (we broadcast it) or the signature of a tx they broadcast themselves. */
export async function submitPtx({ ptxId, wallet, signedTx, signature }) {
  let ptx = await getDoc('pendingTxs', ptxId);
  if (!ptx) throw notFound('Unknown transaction');
  if (ptx.wallet !== wallet) throw forbidden('This transaction belongs to another wallet');
  if (ptx.status === 'confirmed') return publicPtx(ptx);
  if (ptx.status === 'expired' || ptx.status === 'failed') throw conflict('tx_expired', 'This transaction expired or failed. Prepare it again.');

  let sig = ptx.signature;
  if (signedTx) {
    if (ptx.status === 'prepared' && now() > ptx.expiresAt) throw conflict('tx_expired', 'This transaction expired. Prepare it again.');
    const info = await chain.verifySigned(signedTx, ptx);
    if (!info.ok) { log.warn(`ptx ${ptx.id} (${ptx.kind}) rejected: wallet changed the transaction (${info.reason})`); throw bad('tx_mismatch', 'Your wallet changed the transaction in a way we cannot accept. Please try again, or turn off transaction "guard"/simulation add-ons in your wallet.'); }
    if (!info.fullySigned) throw bad('missing_signature', 'Transaction is missing a required signature');
    sig = info.signature;
    await claim(ptx, sig, info.messageHash);
    try {
      await chain.broadcast(info.txB64);
    } catch (e) {
      if (e instanceof TxRejected) {
        ptx = await getDoc('pendingTxs', ptxId);
        await rollback(ptx, 'failed');
        throw bad('tx_rejected', e.message);
      }
      log.warn(`broadcast uncertain for ${ptxId}: ${e.message}`); // network hiccup: it may still land; the poll below / worker decides
    }
  } else if (signature) {
    const h = await chain.getTransactionMessageHash(signature);
    if (h !== ptx.messageHash) throw bad('tx_mismatch', 'That signature is not (yet) a confirmed transaction matching this request');
    sig = signature;
    await claim(ptx, sig);
  } else throw bad('missing_tx', 'Send signedTx or signature');

  // wait briefly for confirmation so the UI can move on immediately
  for (let i = 0; i < 25; i++) {
    const st = await chain.signatureStatus(sig, ptx.lastValidBlockHeight);
    if (st === 'confirmed') { ptx = await getDoc('pendingTxs', ptxId); await finalize(ptx); return publicPtx(await getDoc('pendingTxs', ptxId)); }
    if (st === 'failed' || st === 'expired') { ptx = await getDoc('pendingTxs', ptxId); await rollback(ptx, st === 'failed' ? 'failed' : 'expired'); throw conflict('tx_failed', `Transaction ${st}`); }
    await sleep(config.txPollMs);
  }
  return publicPtx(await getDoc('pendingTxs', ptxId)); // still pending; the worker finishes it
}

async function claim(ptx, sig, messageHash) {
  await runTx(async (tx) => {
    const ref = col('pendingTxs').doc(ptx.id);
    const s = await tx.get(ref);
    const cur = s.data();
    if (cur.status === 'prepared') tx.update(ref, { status: 'sent', signature: sig, ...(messageHash ? { messageHash } : {}), sentAt: now(), updatedAt: now() });
    else if (cur.signature && cur.signature !== sig) throw conflict('tx_already_sent', 'A different transaction was already submitted for this request');
  });
}

export async function getPtxFor(ptxId, wallet) {
  const p = await getDoc('pendingTxs', ptxId);
  if (!p) throw notFound('Unknown transaction');
  if (p.wallet !== wallet) throw forbidden();
  return publicPtx(p);
}

/** Worker: settle anything that is mid-flight. */
export async function reconcilePtx() {
  let done = 0;
  for (const ptx of await queryDocs(col('pendingTxs').where('status', '==', 'sent'))) {
    try {
      const st = await chain.signatureStatus(ptx.signature, ptx.lastValidBlockHeight);
      if (st === 'confirmed') { await finalize(ptx); done++; }
      else if (st === 'failed' || st === 'expired') { await rollback(ptx, st === 'failed' ? 'failed' : 'expired'); done++; }
    } catch (e) { log.error(`reconcile ptx ${ptx.id}`, e); }
  }
  for (const ptx of await queryDocs(col('pendingTxs').where('status', '==', 'prepared'))) {
    if (now() < ptx.expiresAt + 30_000) continue;
    try {
      // a mint whose asset exists on-chain was broadcast by the user directly: finish it instead of rolling back
      if (ptx.kind === 'mint' && ptx.data?.asset && (await chain.assetExists(ptx.data.asset))) await finalize(ptx);
      else await rollback(ptx, 'expired');
      done++;
    } catch (e) { log.error(`reconcile ptx ${ptx.id}`, e); }
  }
  return done;
}
