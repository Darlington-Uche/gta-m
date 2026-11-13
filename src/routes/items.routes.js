import { z } from 'zod';
import { bad } from '../lib/errors.js';
import { getItemRaw, getPublicItem, likedBy, likerOf, listItems, toggleLike } from '../services/items.service.js';
import { offerHistory, offersForItem } from '../services/offers.service.js';
import { prepareMint } from '../services/mint.service.js';
import { categoryCsv, eraCsv, idParam, page, rarityCsv } from './schemas.js';

export const group = 'Artworks (browse + mint)';
export const routes = [
  {
    method: 'get', path: '/items', auth: 'public', summary: 'Browse/filter/sort artworks. era/category/rarity accept comma-separated lists (era=vice,sa). status: unminted | minted | listed | free. hasOffers=true -> only NFTs with active offers.',
    query: z.object({
      era: eraCsv.optional(), category: categoryCsv.optional(), rarity: rarityCsv.optional(), hasOffers: z.enum(['true', 'false']).optional(), owner: z.string().max(60).optional(), q: z.string().max(60).optional(),
      status: z.enum(['unminted', 'minted', 'listed', 'free']).optional(), minUsd: z.coerce.number().min(0).optional(), maxUsd: z.coerce.number().min(0).optional(),
      sort: z.enum(['recent', 'price_low', 'price_high', 'liked', 'offers']).default('recent'), ...page
    }),
    handler: async (req) => listItems(req.valid.query)
  },
  { method: 'get', path: '/items/:id', auth: 'public', summary: 'One artwork: price, owner, listing, top offer', params: idParam, handler: async (req) => ({ item: await getPublicItem(req.valid.params.id) }) },
  { method: 'get', path: '/items/:id/history', auth: 'public', summary: 'Offer history for the price chart (usd, time, status) plus the platform floor', params: idParam,
    handler: async (req) => { const it = await getItemRaw(req.valid.params.id); return { floorUsd: it.floorUsd ?? null, points: await offerHistory(req.valid.params.id) }; } },
  { method: 'get', path: '/items/:id/offers', auth: 'public', summary: 'Active offers on an artwork, highest first', params: idParam, handler: async (req) => ({ offers: await offersForItem(req.valid.params.id) }) },
  {
    method: 'post', path: '/items/:id/like', auth: 'public', params: idParam,
    summary: 'Toggle like. No wallet needed: send the header x-visitor-id (random 16-64 chars) or a login token.',
    handler: async (req) => { const who = likerOf(req); if (!who) throw bad('no_visitor', 'Missing visitor id'); return toggleLike(who, req.valid.params.id); }
  },
  {
    method: 'get', path: '/likes/mine', auth: 'public', summary: 'IDs of artworks I liked (wallet if logged in, else the anonymous x-visitor-id)',
    handler: async (req) => { const who = likerOf(req); return { itemIds: who ? await likedBy(who) : [] }; }
  },
  {
    method: 'post', path: '/items/:id/mint', auth: 'user', params: idParam,
    summary: 'PREPARE a mint (free or paid, price set by admin). Returns an unsigned tx -> user signs -> POST /tx/submit. The NFT is created on-chain when it confirms.',
    handler: async (req) => prepareMint({ wallet: req.user.wallet, itemId: req.valid.params.id })
  }
];
