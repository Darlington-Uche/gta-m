import { z } from 'zod';
import { col, getDoc } from '../lib/db.js';
import { itemsOwnedBy, likedBy } from '../services/items.service.js';
import { syncWallet } from '../services/ownership.service.js';
import { offersMadeBy, offersReceivedBy } from '../services/offers.service.js';
import { listNotifications, markRead, unreadCount } from '../services/notifications.service.js';
import { listSubmissions } from '../services/submissions.service.js';
import { salesForWallet } from '../services/stats.service.js';

export const group = 'My account';
export const routes = [
  {
    method: 'get', path: '/me', auth: 'user', summary: 'Who am I (+ unread notification count)',
    handler: async (req) => ({ wallet: req.user.wallet, admin: req.user.admin, profile: await getDoc('users', req.user.wallet), unread: await unreadCount(req.user.wallet) })
  },
  {
    method: 'patch', path: '/me', auth: 'user', summary: 'Update display name / avatar', body: z.object({ username: z.string().trim().min(2).max(24).optional(), avatar: z.string().url().max(500).optional() }),
    handler: async (req) => { await col('users').doc(req.user.wallet).set(req.valid.body, { merge: true }); return { profile: await getDoc('users', req.user.wallet) }; }
  },
  { method: 'get', path: '/me/nfts', auth: 'user', summary: 'NFTs I own (from the database; fast)', handler: async (req) => ({ items: await itemsOwnedBy(req.user.wallet) }) },
  { method: 'post', path: '/me/nfts/sync', auth: 'user', summary: 'Re-check ownership on-chain (finds NFTs moved/received outside the site) and return what I own', handler: async (req) => ({ items: await syncWallet(req.user.wallet) }) },
  { method: 'get', path: '/me/likes', auth: 'user', summary: 'IDs of artworks I liked', handler: async (req) => ({ itemIds: await likedBy(req.user.wallet) }) },
  { method: 'get', path: '/me/offers/made', auth: 'user', summary: 'Offers I placed', handler: async (req) => ({ offers: await offersMadeBy(req.user.wallet) }) },
  { method: 'get', path: '/me/offers/received', auth: 'user', summary: 'Active offers on NFTs I own', handler: async (req) => ({ offers: await offersReceivedBy(req.user.wallet) }) },
  { method: 'get', path: '/me/activity', auth: 'user', summary: 'My purchases and sales', handler: async (req) => ({ activity: await salesForWallet(req.user.wallet) }) },
  {
    method: 'get', path: '/me/notifications', auth: 'user', summary: 'My notifications (offer received, accepted, refunded, sold, ...)',
    query: z.object({ unread: z.enum(['true', 'false']).default('false'), limit: z.coerce.number().int().min(1).max(100).default(50) }),
    handler: async (req) => ({ notifications: await listNotifications(req.user.wallet, { limit: req.valid.query.limit, unreadOnly: req.valid.query.unread === 'true' }), unread: await unreadCount(req.user.wallet) })
  },
  { method: 'post', path: '/me/notifications/read', auth: 'user', summary: 'Mark notifications read (omit ids = all)', body: z.object({ ids: z.array(z.string()).max(200).optional() }), handler: async (req) => ({ marked: await markRead(req.user.wallet, req.valid.body.ids) }) },
  { method: 'get', path: '/me/submissions', auth: 'user', summary: 'My artwork submissions and their review status', handler: async (req) => ({ submissions: await listSubmissions({ wallet: req.user.wallet }) }) }
];
