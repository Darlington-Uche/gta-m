// Loads the artworks from the FRONTEND's js/data.js into Firestore as unminted items, and creates a "pending"
// registry entry for every collection (add its on-chain address later with `npm run collection:add`).
//   npm run seed -- --source ../gta-marketplace/js/data.js
// Mint prices default by rarity (Common free, Rare $5, Epic $15, Legendary $40) - change them later from the admin API.
// Placeholder items (placeholder: true) are skipped. Safe to run again: existing items are left alone.
import { boot, arg } from './_env.js';
import { seedFromSource } from '../src/services/seed.service.js';

const { config } = await boot();
if (!config.assetsBaseUrl) console.warn('⚠ ASSETS_BASE_URL is empty — NFT images need a public URL (GitHub raw / Pages / Firebase Storage).');
const r = await seedFromSource(arg('source', '../gta-marketplace/js/data.js'));
console.log(`Seeded ${r.made} items (${r.skipped} already existed, ${r.placeholders} placeholders skipped, ${r.hidden} removed from the store, ${r.fixed} updated) for ${config.network}.`);
process.exit(0);
