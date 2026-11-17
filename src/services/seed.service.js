// Loads artworks (+ collection registry entries) from the FRONTEND's js/data.js. Used by `npm run seed` and `npm run demo`.
import fs from 'node:fs';
import { config } from '../config/index.js';
import { createItem, invalidateCatalog } from './items.service.js';
import { col, queryDocs } from '../lib/db.js';
import { getCollection, registerCollection } from './collections.service.js';

// Image URL for a path from data.js: decode first so '%20' is never double-encoded, then encode spaces etc.
const imgUrl = (img) => `${config.assetsBaseUrl}/${encodeURI((() => { try { return decodeURIComponent(img); } catch { return img; } })().replace(/^\//, ''))}`;
const PRICE = { Common: 0, Rare: 5, Epic: 15, Legendary: 40 }; // default mint price (USD) by rarity; change later from the admin API

export const seedFromSource = (source) => seedFromText(fs.readFileSync(source, 'utf8'), source);

/** text = contents of the frontend's js/data.js (trusted: only an admin can trigger this) */
export async function seedFromText(text, label = 'data.js') {
  const sandbox = { window: {} };
  new Function('window', text)(sandbox.window);
  const D = sandbox.window.GTA_DATA;
  if (!D?.art) throw new Error('Could not read GTA_DATA.art from ' + label);
  for (const c of D.collections || []) {
    if (!(await getCollection(c.id))) await registerCollection({ id: c.id, name: c.name, blurb: c.blurb, by: 'seed' });
  }
  let made = 0, skipped = 0, placeholders = 0;
  for (const a of D.art) {
    if (a.placeholder || /^data:/.test(a.img)) { placeholders++; continue; }
    try {
      await createItem({
        id: String(a.id), title: a.title, description: a.description, artist: a.artist, image: imgUrl(a.img),
        era: a.era, collectionId: a.era, category: a.category, rarity: a.rarity, tags: a.tags, priceUsd: PRICE[a.rarity] ?? 0
      }, 'seed');
      made++;
    } catch (e) { if (e.code === 'exists') skipped++; else console.error(a.id, e.message); }
  }
  // Keep the database in step with data.js: hide seeded, never-minted items that were removed from it, and refresh fixed image paths.
  const inSource = new Map(D.art.filter((a) => !(a.placeholder || /^data:/.test(a.img))).map((a) => [String(a.id), imgUrl(a.img)]));
  let hidden = 0, fixed = 0;
  for (const it of await queryDocs(col('items').where('status', '==', 'unminted'))) {
    if (it.createdBy !== 'seed') continue;
    if (!inSource.has(it.id)) { if (!it.hidden) { await col('items').doc(it.id).update({ hidden: true }); hidden++; } }
    else {
      const patch = {};
      if (it.hidden) patch.hidden = false;
      if (it.image !== inSource.get(it.id)) patch.image = inSource.get(it.id);
      if (Object.keys(patch).length) { await col('items').doc(it.id).update(patch); fixed++; }
    }
  }
  if (hidden || fixed) invalidateCatalog();
  return { made, skipped, placeholders, hidden, fixed };
}
