import { z } from 'zod';
import { adminLogin, createNonce, verifyLogin } from '../services/auth.service.js';
import { wallet } from './schemas.js';

export const group = 'Auth (wallet sign-in)';
export const routes = [
  { method: 'post', path: '/auth/nonce', auth: 'public', summary: 'Step 1: get a message to sign', body: z.object({ wallet }), handler: async (req) => createNonce(req.valid.body.wallet) },
  {
    method: 'post', path: '/auth/verify', auth: 'public', summary: 'Step 2: send the wallet signature (base58 or base64) -> JWT. Send as "Authorization: Bearer <token>" afterwards.',
    body: z.object({ wallet, nonce: z.string().min(8).max(128), signature: z.string().min(40).max(200) }),
    handler: async (req) => verifyLogin(req.valid.body)
  },
  {
    method: 'post', path: '/auth/admin-login', auth: 'public', summary: 'Admin panel login with the ADMIN_PASSWORD from the server environment -> 12h admin JWT. Rate limited.',
    body: z.object({ password: z.string().min(1).max(200) }),
    handler: async (req) => adminLogin(req.valid.body.password)
  }
];
