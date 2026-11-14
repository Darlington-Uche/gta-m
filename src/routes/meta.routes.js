import { getCollection } from '../services/collections.service.js';
import { chain } from '../services/chain/index.js';
import { config } from '../config/index.js';
import { getDoc } from '../lib/db.js';
import { getSettings, bidWindowState } from '../services/settings.service.js';
import { getSolUsd } from '../services/priceOracle.js';
import { getItemRaw, metadataFor } from '../services/items.service.js';
import { liveCollections } from '../services/collections.service.js';
import { collectionsSummary, collectionDetail, platformStats, recentActivity } from '../services/stats.service.js';
import { z } from 'zod';
import { notFound } from '../lib/errors.js';
import { page } from './schemas.js';

export const group = 'Meta & public stats';
export const routes = [
  { method: 'get', path: '/health', auth: 'public', summary: 'Liveness check', handler: async () => ({ status: 'up', network: config.network, chain: chain.name, time: Date.now() }) },
  {
    method: 'get', path: '/meta', auth: 'public', summary: 'Network, wallets, public settings, SOL price and bid window — call once on app load',
    handler: async () => {
      const s = await getSettings();
      return {
        network: config.network, isMainnet: config.isMainnet, chain: chain.name,
        build: 'market-v3', vault: chain.vaultAddress, platformWallet: config.auth.platformWallet, liveCollections: (await liveCollections()).map((c) => c.id),
        solUsd: await getSolUsd().catch(() => null),
        settings: { mintingEnabled: s.mintingEnabled, tradingEnabled: s.tradingEnabled, saleFeeBps: s.saleFeeBps, acceptFeeUsd: s.acceptFeeUsd, minOfferUsd: s.minOfferUsd, offerTtlHours: s.offerTtlHours, maxFreeMintsPerWallet: s.maxFreeMintsPerWallet },
        bidWindow: bidWindowState(s),
        site: s.site || {}
      };
    }
  },
  { method: 'get', path: '/stats', auth: 'public', summary: 'Platform-wide numbers for the home page', handler: async () => ({ stats: await platformStats() }) },
  { method: 'get', path: '/collections', auth: 'public', summary: 'One collection per game era with floor price, volume, owners', handler: async () => ({ collections: await collectionsSummary() }) },
  { method: 'get', path: '/collections/:id/detail', auth: 'public', params: z.object({ id: z.string().min(1).max(60) }), summary: 'Collection page data: headline stats, top offer, holders, activity and a daily buys-vs-sells series',
    handler: async (req) => { const d = await collectionDetail(req.valid.params.id, 30); if (!d) throw notFound('Collection not found'); return { collection: d }; } },
  { method: 'get', path: '/profiles', auth: 'public', query: z.object({ w: z.string().max(4500) }), summary: 'Display names for wallets (comma separated, up to 100): name, @username, avatar. The platform wallet is "GTA Marketplace".',
    handler: async (req) => { const ws = [...new Set(req.valid.query.w.split(',').map((x) => x.trim()).filter((x) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(x)))].slice(0, 100);
      const docs = await Promise.all(ws.map((w) => getDoc('users', w).catch(() => null)));
      return { profiles: Object.fromEntries(ws.map((w, i) => [w, w === config.auth.platformWallet ? { name: 'GTA Marketplace', username: 'gtamarketplace', avatar: docs[i]?.avatar || null, verified: true } : { name: docs[i]?.name || null, username: docs[i]?.username || null, avatar: docs[i]?.avatar || null }])) }; } },
  { method: 'get', path: '/activity', auth: 'public', summary: 'Recent sales feed', query: z.object({ limit: page.limit.default(30) }), handler: async (req) => ({ activity: await recentActivity(req.valid.query.limit) }) },
  {
    method: 'get', path: '/metadata/:id.json', auth: 'public', summary: 'Metaplex-standard NFT metadata JSON (this URL is stored on-chain as the NFT uri)',
    handler: async (req, res) => {
      res.set('Cache-Control', 'public, max-age=300');
      if (req.params.id.startsWith('collection-')) {
        const c = await getCollection(req.params.id.slice(11));
        if (!c) return res.status(404).json({ ok: false, error: { code: 'not_found', message: 'No such collection' } });
        const base = config.nftSymbolName;
        return res.json({ name: c.name || base, symbol: 'GTAM', description: c.blurb || 'GTA-inspired art collection. Fan-made, not affiliated with Rockstar Games or Take-Two.', image: c.cover || c.banner || '', external_url: config.assetsBaseUrl, properties: { category: 'image', files: c.cover ? [{ uri: c.cover, type: 'image/jpeg' }] : [] } });
      }
      if (req.params.id === 'collection') return res.json({ name: config.nftSymbolName, symbol: 'GTAM', description: 'GTA-inspired art collection. Fan-made, not affiliated with Rockstar Games or Take-Two.', image: `${config.assetsBaseUrl}/assets/hero/hero-home.png`, external_url: config.assetsBaseUrl || config.publicBaseUrl });
      return res.json(metadataFor(await getItemRaw(req.params.id)));
    }
  }
];
