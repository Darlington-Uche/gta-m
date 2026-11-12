import { z } from 'zod';
import { forbidden } from '../lib/errors.js';
import { cancelOffer, prepareAccept, prepareOffer, rejectOffer } from '../services/offers.service.js';
import { cancelListing, prepareBuy } from '../services/listings.service.js';
import { getPtxFor, submitPtx } from '../services/pendingTx.service.js';
import { idParam, usd } from './schemas.js';

export const group = 'Trading (offers, sale prices, transaction submit)';
export const routes = [
  // ---- offers ----
  {
    method: 'post', path: '/items/:id/offers', auth: 'user', params: idParam, body: z.object({ usd }),
    summary: 'PREPARE an offer on any minted NFT (no listing needed). Amount in USD, charged in SOL at the current price into escrow. Returns unsigned payment tx.',
    handler: async (req) => prepareOffer({ wallet: req.user.wallet, itemId: req.valid.params.id, usd: req.valid.body.usd })
  },
  { method: 'delete', path: '/offers/:id', auth: 'user', params: idParam, summary: 'Cancel my active offer (SOL is refunded from the vault)', handler: async (req) => cancelOffer({ wallet: req.user.wallet, offerId: req.valid.params.id }) },
  { method: 'post', path: '/offers/:id/reject', auth: 'user', params: idParam, summary: 'Owner declines an offer (bidder is refunded)', handler: async (req) => rejectOffer({ wallet: req.user.wallet, offerId: req.valid.params.id }) },
  {
    method: 'post', path: '/offers/:id/accept', auth: 'user', params: idParam,
    summary: 'PREPARE accepting an offer (owner only). One tx: NFT -> bidder, vault pays owner, owner pays the ~$0.30 fee to the dev wallet. Other offers are refunded after it confirms.',
    handler: async (req) => prepareAccept({ wallet: req.user.wallet, offerId: req.valid.params.id })
  },
  // ---- sale prices are NOT user-set: owners sell by accepting offers; mint prices are set by admins ----
  {
    method: 'post', path: '/items/:id/listing', auth: 'user', params: idParam, body: z.object({ priceUsd: usd }),
    summary: 'Disabled: owners cannot set their own sale price. Collectors make offers; the owner accepts one.',
    handler: async () => { throw forbidden('Sale prices are set by the platform. Collectors make offers and you choose which one to accept.'); }
  },
  { method: 'patch', path: '/items/:id/listing', auth: 'user', params: idParam, body: z.object({ priceUsd: usd }), summary: 'Disabled', handler: async () => { throw forbidden('Sale prices are set by the platform.'); } },
  { method: 'delete', path: '/items/:id/listing', auth: 'user', params: idParam, summary: 'Remove an old sale price', handler: async (req) => cancelListing({ wallet: req.user.wallet, itemId: req.valid.params.id }) },
  { method: 'post', path: '/items/:id/buy', auth: 'user', params: idParam, summary: 'PREPARE buying a NFT at its owner-set sale price (atomic tx)', handler: async (req) => prepareBuy({ wallet: req.user.wallet, itemId: req.valid.params.id }) },
  // ---- every prepared tx ends here ----
  {
    method: 'post', path: '/tx/submit', auth: 'user',
    summary: 'FINISH any prepared action. Send { ptxId, signedTx } (server broadcasts) or { ptxId, signature } (you broadcast it yourself). Returns status: confirmed | sent.',
    body: z.object({ ptxId: z.string().min(4).max(64), signedTx: z.string().min(100).max(4000).optional(), signature: z.string().min(40).max(120).optional() }),
    handler: async (req) => ({ tx: await submitPtx({ ...req.valid.body, wallet: req.user.wallet }) })
  },
  { method: 'get', path: '/tx/:id', auth: 'user', params: idParam, summary: 'Poll a transaction request (status: prepared | sent | confirmed | expired | failed)', handler: async (req) => ({ tx: await getPtxFor(req.valid.params.id, req.user.wallet) }) }
];
