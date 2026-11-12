// Who owns what. The chain is the source of truth; the database mirrors it so lists/filters are fast.
import { col, now, queryDocs, runTx } from '../lib/db.js';
import { chain } from './chain/index.js';
import { invalidateCatalog, itemsOwnedBy } from './items.service.js';
import { makeNotification } from './notifications.service.js';
import { liveCollections } from './collections.service.js';
import { log } from '../lib/logger.js';

/** Set the DB owner of an item to what the chain says. Cancels a listing whose seller no longer owns the NFT. */
export async function applyOwner(itemId, owner) {
  const changed = await runTx(async (tx) => {
    const itemRef = col('items').doc(String(itemId)), listRef = col('listings').doc(String(itemId));
    const [iS, lS] = await Promise.all([tx.get(itemRef), tx.get(listRef)]);
    const it = iS.data();
    if (!it) return false;
    if ((it.owner || null) === (owner || null)) { tx.update(itemRef, { lastOwnerCheck: now() }); return false; }
    tx.update(itemRef, { owner: owner || null, lastOwnerCheck: now(), ...(owner ? {} : { burned: true }) });
    if (lS.exists && lS.data().status === 'active' && lS.data().seller !== owner) tx.update(listRef, { status: 'cancelled', cancelledAt: now(), reason: 'owner_changed' });
    if (owner) {
      const n = makeNotification(owner, 'nft_received', 'NFT in your wallet', `${it.title} is now in your wallet.`, { itemId: String(itemId) });
      tx.set(n.ref, n.data);
    }
    return true;
  });
  if (changed) { invalidateCatalog(); log.info(`ownership: item ${itemId} -> ${owner}`); }
  return changed;
}

export async function syncItemOwner(item) {
  if (!item.asset) return false;
  return applyOwner(item.id, await chain.getAssetOwner(item.asset));
}

/** All assets of every live collection from the RPC's DAS index, or null when the RPC has no DAS support. */
async function dasAll() {
  const out = [];
  for (const c of await liveCollections()) {
    const r = await chain.listCollectionAssets(c.address);
    if (!r) return null;
    out.push(...r);
  }
  return out;
}

/** "Which NFTs does this wallet own?" — verified against the chain, including ones bought/transferred outside the site. */
export async function syncWallet(wallet) {
  const mine = await queryDocs(col('items').where('owner', '==', wallet));
  const owners = await chain.getAssetOwners(mine.map((i) => i.asset).filter(Boolean));
  for (const i of mine) if (i.asset && owners.get(i.asset) !== wallet) await applyOwner(i.id, owners.get(i.asset));
  const das = await dasAll(); // null when the RPC has no DAS support
  if (das) {
    const minted = await queryDocs(col('items').where('status', '==', 'minted'));
    const byAsset = new Map(minted.map((i) => [i.asset, i]));
    for (const a of das) if (a.owner === wallet && byAsset.get(a.asset) && byAsset.get(a.asset).owner !== wallet) await applyOwner(byAsset.get(a.asset).id, wallet);
  }
  return itemsOwnedBy(wallet);
}

/** Worker: keep the whole collection in sync (transfers made in Phantom, other marketplaces, etc). */
export async function reconcileOwners({ batch = 100 } = {}) {
  const minted = (await queryDocs(col('items').where('status', '==', 'minted'))).filter((i) => i.asset);
  if (!minted.length) return 0;
  const das = await dasAll();
  let n = 0;
  if (das) {
    const ownerOf = new Map(das.map((a) => [a.asset, a.owner]));
    for (const i of minted) if (ownerOf.has(i.asset) && (await applyOwner(i.id, ownerOf.get(i.asset)))) n++;
  } else {
    const oldest = minted.sort((a, b) => (a.lastOwnerCheck || 0) - (b.lastOwnerCheck || 0)).slice(0, batch);
    const owners = await chain.getAssetOwners(oldest.map((i) => i.asset));
    for (const i of oldest) if (await applyOwner(i.id, owners.get(i.asset))) n++;
  }
  return n;
}
