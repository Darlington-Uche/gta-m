// ============================================================================================
//  API ROUTE MAP — every endpoint lives in one of these files. Add a file here to add a group.
//
//   meta.routes.js         health, /meta, stats, collections, activity, NFT metadata json
//   auth.routes.js         wallet sign-in (nonce -> signature -> JWT)
//   items.routes.js        browse artworks, like, MINT (primary sale)
//   trade.routes.js        offers, accept/reject, sale price, buy, and /tx/submit (ends every flow)
//   me.routes.js           my NFTs, offers, notifications, activity, submissions
//   submissions.routes.js  upload artwork for review
//   launches.routes.js     launchpad: drops (stages), creator collection submissions
//   admin.routes.js        catalog + prices, review queue, vault, payouts, settings, jobs
//
//  Every route is a data object { method, path, auth, summary, body/query/params (zod), handler }.
//  `npm run docs` regenerates docs/API.md from these tables.
// ============================================================================================
import { Router } from 'express';
import { mount } from './define.js';
import * as meta from './meta.routes.js';
import * as auth from './auth.routes.js';
import * as items from './items.routes.js';
import * as trade from './trade.routes.js';
import * as me from './me.routes.js';
import * as submissions from './submissions.routes.js';
import * as admin from './admin.routes.js';
import * as launches from './launches.routes.js';
import * as dev from './dev.routes.js';
import { config } from '../config/index.js';

export const groups = [meta, auth, items, trade, me, submissions, launches, admin, ...(config.chainDriver === 'mock' ? [dev] : [])]; // dev helpers exist ONLY on the mock chain

export function buildRouter() {
  const router = Router();
  for (const g of groups) mount(router, g.routes);
  return router;
}
