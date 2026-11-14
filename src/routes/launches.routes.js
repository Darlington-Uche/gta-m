import { z } from 'zod';
import { addLaunchArt, createLaunch, getDrop, listDrops, myLaunches, revealLaunch } from '../services/launches.service.js';
import { myDropMints, prepareDropMint } from '../services/dropmint.service.js';
import { idParam } from './schemas.js';

const img = z.object({ type: z.string().max(40).optional(), data: z.string().max(4_500_000) }).nullable().optional();
const stage = z.object({ id: z.string().max(20).optional(), name: z.string().trim().max(40).optional(), kind: z.enum(['allowlist', 'public']), priceUsd: z.coerce.number().min(0).max(100000), start: z.coerce.number().int().positive(), end: z.coerce.number().int().positive().nullable().optional(), perWallet: z.coerce.number().int().min(1).max(100), allowlist: z.array(z.string().max(60)).max(5000).optional() });
export const launchBody = z.object({
  name: z.string().trim().min(2).max(50), symbol: z.string().trim().min(2).max(10).regex(/^[A-Za-z0-9]+$/, 'letters and numbers only'),
  description: z.string().trim().min(20).max(1200), theme: z.string().max(30).optional(), links: z.object({ x: z.string().max(120).optional(), site: z.string().max(200).optional() }).optional(),
  logo: img, banner: img, preReveal: img, revealMode: z.enum(['instant', 'date', 'manual']), revealAt: z.coerce.number().int().positive().nullable().optional(),
  supply: z.coerce.number().int().min(1).max(10000), royaltyPct: z.coerce.number().min(0).max(10), stages: z.array(stage).min(1).max(6)
});

export const group = 'Launchpad';
export const routes = [
  { method: 'get', path: '/drops', auth: 'public', summary: 'Every drop on the launchpad (our era collections with mint stages + verified creator collections) with live / upcoming / ended status', handler: async () => ({ drops: await listDrops() }) },
  { method: 'get', path: '/drops/:id', auth: 'public', params: idParam, summary: 'One drop: stages with state; when signed in each stage says if you are eligible', handler: async (req) => ({ drop: await getDrop(req.valid.params.id, req.user?.wallet) }) },
  { method: 'post', path: '/drops/:id/mint', auth: 'user', params: idParam, summary: 'PREPARE minting one random piece from a drop at the live stage price (sign + submit like any tx). Enforces allowlist, per-wallet limit and supply.', handler: async (req) => prepareDropMint({ wallet: req.user.wallet, dropId: req.valid.params.id }) },
  { method: 'get', path: '/drops/:id/mine', auth: 'user', params: idParam, summary: 'How many I minted in each stage of this drop', handler: async (req) => ({ minted: await myDropMints(req.user.wallet, req.valid.params.id) }) },
  { method: 'post', path: '/launches/:id/reveal', auth: 'user', params: idParam, summary: 'Reveal my collection now (creator only): every piece shows its real art', handler: async (req) => revealLaunch({ id: req.valid.params.id, wallet: req.user.wallet, admin: req.user.admin }) },
  { method: 'post', path: '/launches', auth: 'user', body: launchBody, summary: 'Submit a collection for verification: details, logo / banner / pre-reveal image (base64), supply, royalty, reveal and mint stages', handler: async (req) => ({ launch: await createLaunch({ wallet: req.user.wallet, body: req.valid.body }) }) },
  { method: 'post', path: '/launches/:id/art', auth: 'user', params: idParam, body: z.object({ file: img }), summary: 'Add one artwork image to your collection (call once per image)', handler: async (req) => addLaunchArt({ wallet: req.user.wallet, id: req.valid.params.id, file: req.valid.body.file }) },
  { method: 'get', path: '/me/launches', auth: 'user', summary: 'Collections I submitted and their review status', handler: async (req) => ({ launches: await myLaunches(req.user.wallet) }) }
];
