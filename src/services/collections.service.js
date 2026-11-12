// Collection registry. There is one on-chain Metaplex Core collection per game era (or any id you choose).
// You deploy the collections yourself, then register each address here (admin route or `npm run collection:add`).
// The address is verified on-chain: it must exist and its update authority must be the platform's signing key.
import { col, getDoc, now, queryDocs } from '../lib/db.js';
import { chain } from './chain/index.js';
import { config } from '../config/index.js';
import { bad, notFound, unavailable } from '../lib/errors.js';

let cache = { at: 0, data: null };
export const invalidateCollections = () => { cache = { at: 0, data: null }; };

export async function listCollections() {
  if (cache.data && now() - cache.at < 3000) return cache.data;
  const data = await queryDocs(col('collections'));
  cache = { at: now(), data };
  return data;
}
export const getCollection = async (id) => (await listCollections()).find((c) => c.id === id) || null;
export const liveCollections = async () => (await listCollections()).filter((c) => c.status === 'live' && c.address);

/** The on-chain address minting should use for an item, or a clear error if that collection is not deployed yet. */
export async function collectionFor(item) {
  const id = item.collectionId || item.era;
  const c = await getCollection(id);
  if (!c || !c.address || c.status !== 'live') throw unavailable(`The ${c?.name || id} collection is not live yet`);
  return c;
}

/** Create or update a registry entry. With an address it is verified on-chain and set live. */
export async function registerCollection({ id, name, blurb, cover, banner, address, status, by }) {
  if (!/^[a-z0-9_-]{1,32}$/.test(id)) throw bad('bad_collection_id', 'Collection id must be lowercase letters, numbers, - or _ (e.g. "vice")');
  const cur = await getDoc('collections', id);
  const patch = { updatedAt: now(), network: config.network, updatedBy: by || null };
  if (name !== undefined) patch.name = name;
  if (blurb !== undefined) patch.blurb = blurb;
  if (cover !== undefined) patch.cover = cover;
  if (banner !== undefined) patch.banner = banner;
  if (address) {
    const v = await chain.verifyCollection(address);
    if (!v.ok) throw bad('bad_collection', v.reason);
    patch.address = address; patch.verifiedAt = now();
    patch.status = status || 'live';
  } else if (status) {
    if (status === 'live' && !(cur?.address)) throw bad('no_address', 'Set the collection address before making it live');
    patch.status = status;
  }
  if (!cur) { patch.createdAt = now(); patch.status = patch.status || 'pending'; patch.name = patch.name || id; patch.address = patch.address || null; }
  await col('collections').doc(id).set(patch, { merge: true });
  invalidateCollections();
  return getDoc('collections', id);
}

export async function removeAddress(id) {
  const c = await getCollection(id);
  if (!c) throw notFound('Collection not found');
  await col('collections').doc(id).set({ address: null, status: 'pending', updatedAt: now() }, { merge: true });
  invalidateCollections();
}
