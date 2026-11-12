import { z } from 'zod';
import { col, getDoc, now, queryDocs } from '../lib/db.js';
import { chain } from '../services/chain/index.js';
import { config } from '../config/index.js';
import { bulkPrice, createItem, deleteItem, invalidateCatalog, updateItem } from '../services/items.service.js';
import { saveUpload } from '../services/storage.service.js';
import { approveSubmission, listSubmissions, rejectSubmission } from '../services/submissions.service.js';
import { getVaultReport, withdrawRevenue } from '../services/vault.service.js';
import { getSettings, updateSettings } from '../services/settings.service.js';
import { platformStats } from '../services/stats.service.js';
import { runJobsOnce } from '../jobs/worker.js';
import { reconcileOwners } from '../services/ownership.service.js';
import { category, era, idParam, rarity, tags, usd, wallet } from './schemas.js';
import { notFound, conflict, bad } from '../lib/errors.js';
import { ERAS } from '../lib/constants.js';
import { seedFromText } from '../services/seed.service.js';
import { getCollection, listCollections, registerCollection, removeAddress } from '../services/collections.service.js';

const priceUsd = z.coerce.number().min(0).max(1_000_000); // 0 = free mint

export const group = 'Admin (ADMIN_WALLETS only)';
export const routes = [
  { method: 'get', path: '/admin/stats', auth: 'admin', summary: 'Dashboard numbers', handler: async () => ({ stats: await platformStats(), network: config.network }) },
  { method: 'get', path: '/admin/wallets', auth: 'admin', summary: 'Network + the platform wallets (vault = collection authority unless COLLECTION_AUTHORITY_SECRET_KEY is set)', handler: async () => ({ network: config.network, chain: chain.name, vault: chain.vaultAddress, authority: chain.authorityAddress, explorer: chain.explorerAddress(chain.vaultAddress) }) },
  { method: 'get', path: '/admin/collections', auth: 'admin', summary: 'Collection registry: id, name, on-chain address, status (pending | live | paused)', handler: async () => ({ network: config.network, authority: chain.authorityAddress, collections: await listCollections() }) },
  {
    method: 'put', path: '/admin/collections/:id', auth: 'admin', params: idParam,
    summary: 'Register / update a collection. With address: it is verified on-chain (must be a Core collection whose update authority is the platform authority) and set live. status pending|live|paused can be set alone.',
    body: z.object({ name: z.string().trim().min(1).max(80).optional(), blurb: z.string().max(200).optional(), cover: z.string().max(500).optional(), banner: z.string().max(500).optional(), address: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, 'invalid address').optional(), status: z.enum(['pending', 'live', 'paused']).optional() }),
    handler: async (req) => ({ collection: await registerCollection({ id: req.valid.params.id, ...req.valid.body, by: req.user.wallet }) })
  },
  { method: 'delete', path: '/admin/collections/:id/address', auth: 'admin', params: idParam, summary: 'Detach a collection address (sets it back to pending; minted NFTs keep their own recorded collection)', handler: async (req) => { await removeAddress(req.valid.params.id); return { ok: true }; } },

  // ---- catalog & prices ----
  {
    method: 'get', path: '/admin/items', auth: 'admin', summary: 'All items including hidden', query: z.object({ status: z.enum(['unminted', 'reserved', 'minted']).optional() }),
    handler: async (req) => { let rows = await queryDocs(col('items')); if (req.valid.query.status) rows = rows.filter((i) => i.status === req.valid.query.status); return { total: rows.length, items: rows }; }
  },
  {
    method: 'post', path: '/admin/items', auth: 'admin', summary: 'Create an artwork in the collection (unminted). priceUsd 0 = free mint.',
    body: z.object({ id: z.string().min(1).max(64).optional(), collectionId: z.string().regex(/^[a-z0-9_-]{1,32}$/).optional(), artist: z.string().max(40).optional(), title: z.string().min(1).max(60), description: z.string().max(600).optional(), image: z.string().url().or(z.literal('')).optional(), era, category, rarity: rarity.default('Common'), tags: tags.optional(), priceUsd, hidden: z.boolean().optional() }),
    handler: async (req) => ({ item: await createItem(req.valid.body, req.user.wallet) })
  },
  {
    method: 'patch', path: '/admin/items/:id', auth: 'admin', summary: 'Edit an artwork / change its mint price (price only applies while unminted)', params: idParam,
    body: z.object({ title: z.string().min(1).max(60), description: z.string().max(600), image: z.string().url().or(z.literal('')), era, category, rarity, tags, priceUsd, hidden: z.boolean() }).partial(),
    handler: async (req) => ({ item: await updateItem(req.valid.params.id, req.valid.body) })
  },
  {
    method: 'post', path: '/admin/items/bulk-price', auth: 'admin',
    summary: 'Change many mint prices at once. mode: set | percent | add. Example: raise all Epic items 10% -> {filter:{rarity:"Epic"},mode:"percent",value:10}',
    body: z.object({ ids: z.array(z.string()).max(1000).optional(), filter: z.object({ era: era.optional(), category: category.optional(), rarity: rarity.optional(), onlyPaid: z.boolean().optional() }).optional(), mode: z.enum(['set', 'percent', 'add']), value: z.number().min(-100000).max(100000) }),
    handler: async (req) => bulkPrice(req.valid.body)
  },


  { method: 'delete', path: '/admin/items/:id', auth: 'admin', params: idParam, summary: 'Delete an artwork nobody has collected yet', handler: async (req) => ({ deleted: await deleteItem(req.valid.params.id) }) },

  // ---- images (uploaded as base64 data URLs; the admin site shrinks them first so requests stay under the host\'s body limit) ----
  {
    method: 'post', path: '/admin/upload', auth: 'admin', summary: 'Upload an image to storage and get its public URL. Body: { folder: items|banners|collections, dataUrl: "data:image/jpeg;base64,..." }',
    body: z.object({ folder: z.enum(['items', 'banners', 'collections']).default('items'), dataUrl: z.string().min(40) }),
    handler: async (req) => {
      const m = /^data:(image\/(?:jpeg|png|gif|webp));base64,([A-Za-z0-9+/=]+)$/.exec(req.valid.body.dataUrl);
      if (!m) throw bad('bad_image', 'Send a JPG, PNG, GIF or WEBP image as a data URL');
      const buffer = Buffer.from(m[2], 'base64');
      const up = await saveUpload({ mimetype: m[1], size: buffer.length, buffer }, req.valid.body.folder);
      return { url: up.url };
    }
  },

  // ---- deploy helpers (so nothing needs a terminal) ----
  {
    method: 'post', path: '/admin/collections/:id/create', auth: 'admin', params: idParam,
    summary: 'Create the on-chain Metaplex Core collection for this era (update authority = platform authority) and register it as live. The vault pays the small rent.',
    handler: async (req) => {
      const id = req.valid.params.id;
      const existing = await getCollection(id);
      if (existing?.address) throw conflict('already_live', `${id} already has a collection on ${config.network}: ${existing.address}`);
      if (config.chainDriver !== 'mock') {
        const bal = await chain.getBalance(chain.vaultAddress);
        if (bal < 20_000_000) throw bad('vault_low', `The vault needs at least ~0.02 SOL (has ${(bal / 1e9).toFixed(4)}).` + (config.isMainnet ? '' : ' Use "Airdrop devnet SOL" first.'));
      }
      const name = existing?.name && existing.name !== id ? existing.name : `GTA Market · ${ERAS[id]?.short || id}`;
      const res = await chain.createCollection({ name, uri: `${config.publicBaseUrl}/metadata/collection.json` });
      return { collection: await registerCollection({ id, name, address: res.address, by: req.user.wallet }), signature: res.signature };
    }
  },
  {
    method: 'post', path: '/admin/vault/airdrop', auth: 'admin', summary: 'DEVNET ONLY: request free test SOL for the vault from the Solana faucet (rate limited by the faucet).',
    body: z.object({ sol: z.number().min(0.1).max(2).default(1) }).partial(),
    handler: async (req) => {
      if (config.isMainnet) throw bad('mainnet', 'Airdrops only exist on devnet');
      return { ...(await chain.airdrop(chain.vaultAddress, req.valid.body.sol || 1)), balanceLamports: await chain.getBalance(chain.vaultAddress) };
    }
  },

  // ---- submissions ----
  { method: 'get', path: '/admin/submissions', auth: 'admin', summary: 'Review queue', query: z.object({ status: z.enum(['pending', 'approved', 'rejected']).default('pending') }), handler: async (req) => ({ submissions: await listSubmissions({ status: req.valid.query.status }) }) },
  {
    method: 'post', path: '/admin/submissions/:id/approve', auth: 'admin', params: idParam, summary: 'Approve -> creates an unminted artwork at the price you set',
    body: z.object({ priceUsd, rarity: rarity.optional(), itemId: z.string().min(1).max(64).optional() }),
    handler: async (req) => ({ item: await approveSubmission({ id: req.valid.params.id, by: req.user.wallet, ...req.valid.body }) })
  },
  { method: 'post', path: '/admin/submissions/:id/reject', auth: 'admin', params: idParam, summary: 'Reject with a reason', body: z.object({ reason: z.string().max(300).optional() }), handler: async (req) => rejectSubmission({ id: req.valid.params.id, by: req.user.wallet, reason: req.valid.body.reason }) },

  // ---- the vault wallet ----
  { method: 'get', path: '/admin/vault', auth: 'admin', summary: 'Vault balance vs. what belongs to bidders (escrow) vs. platform revenue. Check `solvent` and `unexplainedLamports`.', handler: async () => ({ vault: await getVaultReport() }) },
  {
    method: 'post', path: '/admin/vault/withdraw', auth: 'admin', summary: 'Queue a revenue withdrawal (can never touch bidders\' escrow). Use this wallet to buy/sell the project token.',
    body: z.object({ to: wallet, lamports: z.number().int().positive() }), handler: async (req) => withdrawRevenue({ ...req.valid.body, by: req.user.wallet })
  },
  { method: 'get', path: '/admin/ledger', auth: 'admin', summary: 'Latest money movements', query: z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) }), handler: async (req) => ({ ledger: (await queryDocs(col('ledger').orderBy('createdAt', 'desc').limit(req.valid.query.limit))) }) },
  { method: 'get', path: '/admin/payouts', auth: 'admin', summary: 'Refund / withdrawal queue', query: z.object({ status: z.enum(['queued', 'sending', 'sent', 'needs_review']).optional() }), handler: async (req) => { let q = col('payouts'); if (req.valid.query.status) q = q.where('status', '==', req.valid.query.status); return { payouts: (await queryDocs(q)).sort((a, b) => b.createdAt - a.createdAt).slice(0, 200) }; } },
  {
    method: 'post', path: '/admin/payouts/:id/retry', auth: 'admin', params: idParam, summary: 'Re-queue a payout stuck in needs_review (only after checking the explorer that it really did not land)',
    handler: async (req) => { const p = await getDoc('payouts', req.valid.params.id); if (!p) throw notFound(); if (p.status === 'sent') throw conflict('already_sent', 'Payout already sent'); await col('payouts').doc(p.id).update({ status: 'queued', attempts: 0, signature: null, updatedAt: now() }); return { requeued: true }; }
  },
  { method: 'get', path: '/admin/sales', auth: 'admin', summary: 'All sales', handler: async () => ({ sales: (await queryDocs(col('sales'))).sort((a, b) => b.createdAt - a.createdAt).slice(0, 300) }) },

  // ---- switches & jobs ----
  { method: 'get', path: '/admin/settings', auth: 'admin', summary: 'Runtime settings (fees, kill switches, bid window...)', handler: async () => ({ settings: await getSettings() }) },
  {
    method: 'put', path: '/admin/settings', auth: 'admin', summary: 'Change settings live. Send only the fields to change.',
    body: z.object({
      mintingEnabled: z.boolean(), tradingEnabled: z.boolean(), saleFeeBps: z.number().int().min(0).max(2000), acceptFeeUsd: z.number().min(0).max(50), minOfferUsd: z.number().min(0.01).max(1000),
      maxActiveOffersPerItem: z.number().int().min(1).max(200), offerTtlHours: z.number().min(1).max(24 * 60), maxFreeMintsPerWallet: z.number().int().min(0).max(1000),
      bidWindow: z.object({ enabled: z.boolean(), openMinutes: z.number().int().min(1).max(1440), cycleMinutes: z.number().int().min(1).max(10080) }).partial(),
      vaultReserveLamports: z.number().int().min(0),
      site: z.object({ heroImage: z.string().max(500), heroTitle: z.string().max(80), heroSubtitle: z.string().max(240), announcement: z.string().max(160), banners: z.object({ explore: z.string().max(500), eras: z.string().max(500), create: z.string().max(500) }).partial() }).partial()
    }).partial(),
    handler: async (req) => ({ settings: await updateSettings(req.valid.body) })
  },
  { method: 'post', path: '/admin/jobs/run', auth: 'admin', summary: 'Run background jobs now (payouts, tx reconcile, offer expiry, ownership sync)', handler: async () => ({ report: await runJobsOnce({ force: true }) }) },
  { method: 'post', path: '/admin/ownership/reconcile', auth: 'admin', summary: 'Re-check on-chain owners for the whole collection', handler: async () => ({ changed: await reconcileOwners({ batch: 1000 }) }) },
  {
    method: 'post', path: '/admin/seed', auth: 'admin', summary: 'Load/refresh the catalog from the frontend data file. Body: { url } (public URL of js/data.js; defaults to ASSETS_BASE_URL/js/data.js)',
    handler: async (req) => {
      const url = req.body?.url || `${config.assetsBaseUrl}/js/data.js`;
      const r = await fetch(url);
      if (!r.ok) throw bad('seed_fetch', `Could not download ${url} (${r.status})`);
      return { result: await seedFromText(await r.text(), url) };
    }
  },
  { method: 'post', path: '/jobs/run', auth: 'cron', summary: 'Same as /admin/jobs/run but for an external scheduler. Header: x-cron-secret', handler: async () => ({ report: await runJobsOnce() }) }
];
