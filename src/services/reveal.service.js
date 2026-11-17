// After a drop reveals, fix each NFT on-chain too: the asset was minted as "<Drop> #?" pointing at our metadata URL.
// The URL already serves the real art once revealed; this renames the asset on-chain to its real title (and keeps the URL).
// Runs in the background job a few at a time; the platform pays the tiny fee.
import { col, now, queryDocs } from '../lib/db.js';
import { chain } from './chain/index.js';
import { metadataUri, revealedNow } from './items.service.js';
import { log } from '../lib/logger.js';

export async function syncReveals(limit = 8) {
  const rows = (await queryDocs(col('items').where('status', '==', 'minted'))).filter((i) => i.preReveal && i.asset && !i.chainRevealedAt && revealedNow(i)).slice(0, limit);
  let done = 0;
  for (const it of rows) {
    try {
      const r = await chain.updateAssetMeta({ asset: it.asset, owner: it.owner, collection: it.collection, name: String(it.title).slice(0, 32), uri: metadataUri(it) });
      await col('items').doc(it.id).update({ chainRevealedAt: now(), chainRevealSig: r.signature });
      done++;
    } catch (e) { log.warn(`reveal ${it.id}: ${e.message}`); await col('items').doc(it.id).update({ chainRevealTries: (it.chainRevealTries || 0) + 1 }).catch(() => {}); }
  }
  return done;
}
