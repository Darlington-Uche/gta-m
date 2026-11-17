// Primary sale: the admin sets the price (USD, 0 = free). The NFT is minted on-chain at the moment the user pays.
// One transaction does it all: user -> vault payment + Core asset creation (owner = the user).
import { col, inc, now, runTx } from '../lib/db.js';
import { chain } from './chain/index.js';
import { getSettings } from './settings.service.js';
import { invalidateCatalog, quoteUsd } from './items.service.js';
import { createPtx, newPtxId, publicPtx, registerHandler } from './pendingTx.service.js';
import { ledgerInTx } from './vault.service.js';
import { makeNotification } from './notifications.service.js';
import { lockFor, isLocked } from './locks.js';
import { collectionFor } from './collections.service.js';
import { ensurePermanent } from './permastore.service.js';
import { conflict, notFound, unavailable } from '../lib/errors.js';
import { log } from '../lib/logger.js';

export async function prepareMint({ wallet, itemId }) {
  const settings = await getSettings();
  if (!settings.mintingEnabled) throw unavailable('Minting is paused right now');
  const itemRef = col('items').doc(String(itemId)), userRef = col('users').doc(wallet);
  const ptxId = newPtxId();
  const pre = (await itemRef.get()).data();
  if (!pre || pre.hidden) throw notFound('Artwork not found');
  if (pre.dropOnly) throw conflict('use_drop', 'This piece is part of a drop. Mint it from the drop page.');
  const coll = await collectionFor(pre); // throws if this era's collection is not deployed/registered yet
  if (coll.drop && coll.drop.published) throw conflict('use_drop', `${coll.name} is minting as a drop now. Mint from the drop page.`);

  const item = await runTx(async (tx) => {
    const [s, u] = await Promise.all([tx.get(itemRef), tx.get(userRef)]);
    if (!s.exists || s.data().hidden) throw notFound('Artwork not found');
    const it = s.data();
    if (it.status === 'minted') throw conflict('already_minted', 'This NFT has already been minted. You can make an offer to its owner.');
    if (isLocked(it)) throw conflict('item_busy', 'Someone else is minting this right now. Try again in a couple of minutes.');
    const free = it.priceUsd === 0;
    if (free) {
      const used = u.exists ? u.data().freeMints || 0 : 0;
      if (used >= settings.maxFreeMintsPerWallet) throw conflict('free_mint_limit', `Free mints are limited to ${settings.maxFreeMintsPerWallet} per wallet`);
      tx.set(userRef, { wallet, freeMints: inc(1) }, { merge: true });
    }
    tx.update(itemRef, { status: 'reserved', reservedBy: wallet, ...lockFor(ptxId, 'mint') });
    return { id: s.id, ...it };
  });

  try {
    const q = await quoteUsd(item.priceUsd);
    const perm = await ensurePermanent({ ...pre, ...item }); // uploads image + metadata to Arweave once; the minter reimburses the fee
    const total = q.lamports + perm.storageLamports;
    const built = await chain.buildMintTx({ buyer: wallet, lamports: total, name: item.title.slice(0, 32), uri: perm.uri, collection: coll.address });
    const ptx = await createPtx({ id: ptxId, kind: 'mint', wallet, refId: item.id, data: { itemId: item.id, asset: built.asset, collection: coll.address, lamports: total, priceLamports: q.lamports, storageLamports: perm.storageLamports, permanent: perm.permanent, usd: item.priceUsd, solUsd: q.solUsd }, built });
    invalidateCatalog();
    return { ...publicPtx(ptx), txB64: built.txB64, asset: built.asset, price: { usd: item.priceUsd, sol: total / 1e9, lamports: total, priceLamports: q.lamports, storageLamports: perm.storageLamports, storageSol: perm.storageLamports / 1e9, permanent: perm.permanent, solUsd: q.solUsd, free: item.priceUsd === 0 } };
  } catch (e) {
    await rollbackMint({ id: ptxId, wallet, data: { itemId: item.id, usd: item.priceUsd } });
    throw e;
  }
}

async function finalizeMint(ptx) {
  const { itemId, asset, lamports } = ptx.data;
  const priceLamports = ptx.data.priceLamports ?? lamports; // the storage-fee part only reimburses the vault's upload cost, it is not revenue
  await runTx(async (tx) => {
    const ref = col('items').doc(String(itemId));
    const it = (await tx.get(ref)).data();
    if (!it) return;
    if (it.status === 'minted') { if (it.asset !== asset) log.error(`mint ${ptx.id}: item ${itemId} already minted with a different asset!`); return; } // idempotent
    tx.update(ref, { status: 'minted', owner: ptx.wallet, asset, collection: ptx.data.collection || null, mintedAt: now(), mintedBy: ptx.wallet, reservedBy: null, lock: null, lastOwnerCheck: now() });
    tx.set(col('sales').doc(`mint_${ptx.id}`), { type: 'mint', itemId: String(itemId), asset, buyer: ptx.wallet, seller: null, lamports: priceLamports, storageLamports: ptx.data.storageLamports || 0, usd: ptx.data.usd, signature: ptx.signature, createdAt: now() });
    if (priceLamports > 0) ledgerInTx(tx, { type: 'mint_revenue', lamports: priceLamports, wallet: ptx.wallet, ref: { itemId: String(itemId), ptxId: ptx.id, signature: ptx.signature }, deltas: { revenue: priceLamports } });
    const n = makeNotification(ptx.wallet, 'mint_success', 'Minted!', `${it.title} is now in your wallet.`, { itemId: String(itemId), asset, signature: ptx.signature });
    tx.set(n.ref, n.data);
  });
  invalidateCatalog();
}

async function rollbackMint(ptx) {
  const { itemId, usd } = ptx.data;
  await runTx(async (tx) => {
    const ref = col('items').doc(String(itemId));
    const it = (await tx.get(ref)).data();
    if (!it || it.status !== 'reserved' || it.lock?.ptxId !== ptx.id) return; // already settled or someone else's reservation
    tx.update(ref, { status: 'unminted', reservedBy: null, lock: null });
    if (usd === 0) tx.set(col('users').doc(ptx.wallet), { freeMints: inc(-1) }, { merge: true });
  });
  invalidateCatalog();
}

registerHandler('mint', { finalize: finalizeMint, rollback: rollbackMint });
