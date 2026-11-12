// Register a collection you deployed yourself. The address is verified on-chain (must be a Metaplex Core collection
// whose update authority is the platform authority = the vault address unless COLLECTION_AUTHORITY_SECRET_KEY is set).
//   npm run collection:add -- --id vice --address <CollectionAddress> [--name "Vice City Classics"]
//   npm run collection:add -- --list
import { boot, arg, flag } from './_env.js';
import { listCollections, registerCollection } from '../src/services/collections.service.js';

const { config, chain } = await boot();
if (flag('list')) {
  const rows = await listCollections();
  console.log(`network ${config.network}\nplatform authority (must be the collection's update authority): ${chain.authorityAddress}\n`);
  for (const c of rows.sort((a, b) => a.id.localeCompare(b.id))) console.log(`${c.status === 'live' ? '✅' : '⏳'} ${c.id.padEnd(8)} ${c.status.padEnd(8)} ${c.address || '(no address yet)'}  ${c.name}`);
  process.exit(0);
}
const id = arg('id'), address = arg('address');
if (!id || !address) { console.error('Usage: npm run collection:add -- --id <era e.g. vice> --address <collection address> [--name "..."]\n       npm run collection:add -- --list'); process.exit(1); }
try {
  const c = await registerCollection({ id, address, name: arg('name'), by: 'cli' });
  console.log(`✅ ${c.id} is live on ${config.network}: ${c.address}\n   ${chain.explorerAddress(c.address)}`);
} catch (e) { console.error('❌ ' + e.message); process.exit(1); }
process.exit(0);
