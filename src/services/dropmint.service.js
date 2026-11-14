// Minting from a drop (launchpad). The minter never picks the piece: a random unminted artwork of the drop is reserved,
// paid for at the live stage's price and minted straight into their wallet in one transaction.
// Rules: a stage must be live, allowlist stages need the wallet on the list, each wallet has a per-stage limit,
// only uploaded art can be minted and never more than the max supply.
// Before the reveal the NFT's metadata (served by us) shows the drop's cover; after it, the real art. No re-mint needed.
// Money: the minter pays the vault. Platform drops: all revenue. Creator drops: platform keeps its cut, the rest is paid
// out to the creator automatically (payout queue).
import { col, getDoc, inc, now, queryDocs, runTx } from '../lib/db.js';
import { chain } from './chain/index.js';
import { config } from '../config/index.js';
import { getSettings } from './settings.service.js';
import { invalidateCatalog, metadataUri, quoteUsd } from './items.service.js';
import { createPtx, newPtxId, publicPtx, registerHandler } from './pendingTx.service.js';
import { ledgerInTx } from './vault.service.js';
import { makeNotification } from './notifications.service.js';
import { lockFor, isLocked } from './locks.js';
import { collectionFor } from './collections.service.js';
import { ensurePermanent } from './permastore.service.js';
import { getDrop } from './launches.service.js';
import { conflict, forbidden, notFound, unavailable } from '../lib/errors.js';

export const LAUNCHPAD_FEE_BPS = 500; // platform keeps 5% of creator mint revenue

async function launchCollection(l) {
  if (l.address) return l.address;
  const res = await chain.createCollection({ name: l.name.slice(0, 32), uri: `${config.publicBaseUrl}/metadata/launch-${l.id}.json` });
  await col('launches').doc(l.id).update({ address: res.address, collectionSig: res.signature || null });
  return res.address;
}

export async function prepareDropMint({ wallet, dropId }) {
  const settings = await getSettings();
  if (!settings.mintingEnabled) throw unavailable('Minting is paused right now');
  const d = await getDrop(dropId, wallet);
  const stage = d.stages.find((s) => s.state === 'live');
  if (!stage) throw conflict('not_live', d.status === 'upcoming' ? 'This drop has not started yet' : 'This drop has ended');
  if (stage.eligible === false) throw forbidden(`Your wallet is not on the ${stage.name} list`);
  if (d.supply && d.minted >= d.supply) throw conflict('sold_out', 'Sold out');
  const mine = await queryDocs(col('dropmints').where('dropId', '==', dropId).where('wallet', '==', wallet));
  const used = mine.filter((m) => m.stageId === stage.id && m.status !== 'failed').length;
  if (used >= stage.perWallet) throw conflict('wallet_limit', `You have minted the max (${stage.perWallet}) for ${stage.name}`);

  const pool = d.kind === 'platform'
    ? (await queryDocs(col('items').where('era', '==', d.collectionId))).filter((i) => !i.hidden && !i.dropOnly && i.status === 'unminted' && !isLocked(i) && (i.collectionId || i.era) === d.collectionId)
    : (await queryDocs(col('items').where('launchId', '==', dropId))).filter((i) => i.status === 'unminted' && !isLocked(i));
  if (!pool.length) throw conflict('none_left', d.artCount && d.artCount < (d.supply || Infinity) ? 'Every uploaded piece is minted. More art is coming soon.' : 'Sold out');

  const ptxId = newPtxId(), pick = pool[Math.floor(Math.random() * pool.length)];
  const itemRef = col('items').doc(String(pick.id)), mintRef = col('dropmints').doc(ptxId);
  const reveal = { preReveal: d.revealed ? null : d.preReveal || d.logo, revealMode: d.revealMode || 'instant', revealAt: d.revealAt || null, dropId };
  await runTx(async (tx) => {
    const it = (await tx.get(itemRef)).data();
    if (!it || it.status !== 'unminted' || isLocked(it)) throw conflict('item_busy', 'Busy minting, try again in a moment');
    tx.update(itemRef, { status: 'reserved', reservedBy: wallet, ...reveal, ...lockFor(ptxId, 'dropmint') });
    tx.set(mintRef, { dropId, stageId: stage.id, wallet, itemId: String(pick.id), status: 'pending', createdAt: now() });
  });
  try {
    const collection = d.kind === 'platform' ? (await collectionFor(pick)).address : await launchCollection(await getDoc('launches', dropId).then((l) => ({ id: dropId, ...l })));
    const q = stage.priceUsd > 0 ? await quoteUsd(stage.priceUsd) : { lamports: 0, sol: 0, solUsd: null };
    const item = { ...pick, ...reveal, id: String(pick.id) };
    const perm = d.revealed ? await ensurePermanent(item) : { uri: metadataUri(item), storageLamports: 0, permanent: false }; // unrevealed: our URL, so the reveal can switch the art
    const total = q.lamports + perm.storageLamports;
    const built = await chain.buildMintTx({ buyer: wallet, lamports: total, name: (d.revealed ? item.title : `${d.name} #?`).slice(0, 32), uri: perm.uri, collection });
    const ptx = await createPtx({ id: ptxId, kind: 'dropmint', wallet, refId: item.id, built,
      data: { itemId: item.id, dropId, kind: d.kind, stageId: stage.id, stageName: stage.name, asset: built.asset, collection, lamports: total, priceLamports: q.lamports, storageLamports: perm.storageLamports, usd: stage.priceUsd, creator: d.kind === 'creator' ? d.creator : null, dropName: d.name } });
    invalidateCatalog();
    return { ...publicPtx(ptx), txB64: built.txB64, asset: built.asset, price: { usd: stage.priceUsd, sol: total / 1e9, lamports: total }, stage: stage.name };
  } catch (e) { await rollback({ id: ptxId, data: { itemId: String(pick.id) } }); throw e; }
}

async function finalize(ptx) {
  const d = ptx.data, fee = d.kind === 'creator' ? Math.floor((d.priceLamports * LAUNCHPAD_FEE_BPS) / 10000) : d.priceLamports, toCreator = d.priceLamports - fee;
  await runTx(async (tx) => {
    const ref = col('items').doc(String(d.itemId)), it = (await tx.get(ref)).data();
    if (!it || it.status === 'minted') return; // idempotent
    tx.update(ref, { status: 'minted', owner: ptx.wallet, asset: d.asset, collection: d.collection, mintedAt: now(), mintedBy: ptx.wallet, reservedBy: null, lock: null, lastOwnerCheck: now() });
    tx.update(col('dropmints').doc(ptx.id), { status: 'done', asset: d.asset, signature: ptx.signature, doneAt: now() });
    if (d.kind === 'creator') tx.update(col('launches').doc(d.dropId), { minted: inc(1), status: 'live' });
    tx.set(col('sales').doc(`mint_${ptx.id}`), { type: 'mint', itemId: String(d.itemId), asset: d.asset, buyer: ptx.wallet, seller: d.creator, lamports: d.priceLamports, usd: d.usd, dropId: d.dropId, stage: d.stageName, signature: ptx.signature, createdAt: now() });
    if (fee > 0) ledgerInTx(tx, { type: 'mint_revenue', lamports: fee, wallet: ptx.wallet, ref: { itemId: String(d.itemId), ptxId: ptx.id, signature: ptx.signature }, deltas: { revenue: fee } });
    if (toCreator > 0) {
      ledgerInTx(tx, { type: 'creator_owed', lamports: toCreator, wallet: d.creator, ref: { dropId: d.dropId, ptxId: ptx.id }, deltas: { escrow: toCreator } });
      tx.set(col('payouts').doc(`creator_${ptx.id}`), { type: 'creator_payout', to: d.creator, lamports: toCreator, status: 'queued', attempts: 0, ref: { dropId: d.dropId, itemId: String(d.itemId) }, createdAt: now(), updatedAt: now() });
    }
    const n = makeNotification(ptx.wallet, 'mint_success', 'Minted!', `You minted from ${d.dropName}. It is in your wallet${it.preReveal ? ' and reveals soon' : ''}.`, { itemId: String(d.itemId), asset: d.asset, signature: ptx.signature }); tx.set(n.ref, n.data);
  });
  invalidateCatalog();
}
async function rollback(ptx) {
  const { itemId } = ptx.data;
  await runTx(async (tx) => {
    const ref = col('items').doc(String(itemId)), it = (await tx.get(ref)).data();
    if (it && it.status === 'reserved' && it.lock?.ptxId === ptx.id) tx.update(ref, { status: 'unminted', reservedBy: null, lock: null, preReveal: it.launchId ? it.preReveal : null, dropId: it.launchId ? it.dropId : null });
    const m = (await tx.get(col('dropmints').doc(ptx.id))).data(); if (m && m.status === 'pending') tx.update(col('dropmints').doc(ptx.id), { status: 'failed' });
  });
  invalidateCatalog();
}
registerHandler('dropmint', { finalize, rollback });

/** How many you minted per stage, so the page can show "1 of 2 used". */
export async function myDropMints(wallet, dropId) {
  const rows = (await queryDocs(col('dropmints').where('dropId', '==', dropId).where('wallet', '==', wallet))).filter((m) => m.status !== 'failed');
  return rows.reduce((m, r) => ((m[r.stageId] = (m[r.stageId] || 0) + 1), m), {});
}
export const launchCollectionMeta = async (id) => { const l = await getDoc('launches', id); if (!l) throw notFound('Collection not found'); return { name: l.name, symbol: (l.symbol || 'GTAM').slice(0, 10), description: l.description, image: l.logo, external_url: `${config.publicBaseUrl}` }; };
