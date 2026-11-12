// Permanent NFT storage. When someone mints, the item's image (fetched from its public URL) and metadata are uploaded
// to Arweave via Irys, ONCE. The vault fronts the upload cost and the minter reimburses it inside the mint transaction
// (price + storage fee, one wallet approval). The result is cached on the item, so a cancelled/failed mint never pays twice.
// If storage is off or the upload fails, minting falls back to the API-hosted metadata (never blocks the user).
import { col } from '../lib/db.js';
import { config } from '../config/index.js';
import { chain } from './chain/index.js';
import { metadataFor, metadataUri } from './items.service.js';
import { log } from '../lib/logger.js';

export const permanentEnabled = () => config.permastore.driver !== 'none';

/** -> { uri, storageLamports, permanent } for this item; uploads it if needed. */
export async function ensurePermanent(item) {
  if (item.perm?.metadataUri) return { uri: item.perm.metadataUri, storageLamports: item.perm.costLamports || 0, permanent: true };
  const hosted = { uri: metadataUri(item), storageLamports: 0, permanent: false };
  if (!permanentEnabled() || !item.image) return hosted;
  try {
    const up = await chain.uploadNft({ imageUrl: item.image, buildMetadata: (image, mime) => metadataFor(item, { image, mime }) });
    const perm = { metadataUri: up.metadataUri, imageUri: up.imageUri, costLamports: up.costLamports, at: Date.now() };
    await col('items').doc(String(item.id)).set({ perm }, { merge: true });
    return { uri: up.metadataUri, storageLamports: up.costLamports, permanent: true };
  } catch (e) {
    log.warn(`permanent upload failed for item ${item.id}, using hosted metadata: ${e.message}`);
    return hosted;
  }
}
