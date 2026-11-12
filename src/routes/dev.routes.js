// Only mounted when CHAIN_DRIVER=mock (offline demos / frontend testing). Never exists on devnet/mainnet.
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { chain } from '../services/chain/index.js';
import { config } from '../config/index.js';
import { col, now } from '../lib/db.js';
import { isAdminWallet } from '../services/auth.service.js';
import { wallet } from './schemas.js';

export const group = 'Dev helpers (mock chain only)';
export const routes = [
  {
    method: 'post', path: '/dev/login', auth: 'public', summary: 'Mock chain only: get a JWT for any wallet address without signing, and fund it with test SOL',
    body: z.object({ wallet, fundSol: z.number().min(0).max(100).default(10) }),
    handler: async (req) => {
      const { wallet: w, fundSol } = req.valid.body;
      if (fundSol && (await chain.getBalance(w)) < fundSol * 1e9) chain.fund(w, fundSol * 1e9);
      await col('users').doc(w).set({ wallet: w, lastLoginAt: now(), createdAt: now() }, { merge: true });
      const admin = isAdminWallet(w);
      return { token: jwt.sign({ sub: w, admin }, config.auth.jwtSecret, { expiresIn: config.auth.jwtTtl }), wallet: w, admin };
    }
  },
  {
    method: 'post', path: '/dev/sign', auth: 'public', summary: 'Mock chain only: sign a prepared mock transaction as this wallet (stands in for Phantom)',
    body: z.object({ txB64: z.string().min(10), wallet }),
    handler: async (req) => ({ signedTx: chain.signMock(req.valid.body.txB64, req.valid.body.wallet) })
  }
];
