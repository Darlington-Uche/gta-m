// OPTIONAL helper: deploys a Core collection for one era (update authority = platform authority) and registers it.
// You can also deploy collections with your own code and use `npm run collection:add` instead.
//   npm run collection:create -- --id vice --name "Vice City Classics" [--image https://.../cover.png] [--description "..."]
// With PERMASTORE=irys (default on the real chain) the cover image + metadata are uploaded to Arweave first (vault pays).
import { boot, arg } from './_env.js';
import { registerCollection } from '../src/services/collections.service.js';
import { getCollection } from '../src/services/collections.service.js';

const { config, chain } = await boot();
const id = arg('id');
if (!id) { console.error('Usage: npm run collection:create -- --id <era e.g. vice> [--name "Vice City Classics"]'); process.exit(1); }
if (config.chainDriver === 'mock') { console.log('CHAIN_DRIVER=mock: nothing to deploy.'); process.exit(0); }
const existing = await getCollection(id);
if (existing?.address) { console.log(`${id} already has a collection on ${config.network}: ${existing.address}`); process.exit(0); }
const bal = await chain.getBalance(chain.vaultAddress);
console.log(`network: ${config.network}\nvault:   ${chain.vaultAddress}  (${(bal / 1e9).toFixed(4)} SOL)`);
if (bal < 20_000_000) { console.error('Vault needs at least ~0.02 SOL.' + (config.isMainnet ? '' : ' Get devnet SOL at https://faucet.solana.com')); process.exit(1); }
const name = arg('name', `${config.nftSymbolName} — ${id}`);
const description = arg('description', 'GTA-inspired art collection. Fan-made, not affiliated with Rockstar Games or Take-Two.');
const imageUrl = arg('image', `${config.assetsBaseUrl}/assets/hero/hero-home.png`);
let uri = `${config.publicBaseUrl}/metadata/collection.json`; // fallback: served by this API
if (config.permastore.driver !== 'none') {
  try {
    const up = await chain.uploadNft({ imageUrl, buildMetadata: (image, mime) => ({ name, symbol: 'GTAM', description, image, external_url: config.assetsBaseUrl || config.publicBaseUrl, properties: { files: [{ uri: image, type: mime }] } }) });
    uri = up.metadataUri;
    console.log(`uploaded collection image + metadata to Arweave (cost ${(up.costLamports / 1e9).toFixed(6)} SOL): ${uri}`);
  } catch (e) { console.warn(`⚠ permanent upload failed (${e.message}) — using the API-hosted metadata instead. Check --image (${imageUrl}) opens in a browser.`); }
}
const res = await chain.createCollection({ name, uri });
const c = await registerCollection({ id, name, address: res.address, by: 'cli' });
console.log(`\n✅ ${c.id}: ${c.address}\n   ${chain.explorerAddress(c.address)}`);
process.exit(0);
