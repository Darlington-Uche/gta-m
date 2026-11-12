// Sign-in with a Solana wallet: server issues a nonce message, wallet signs it, server issues a JWT.
import crypto from 'node:crypto';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { col, now } from '../lib/db.js';
import { bad, unauthorized } from '../lib/errors.js';
import { log } from '../lib/logger.js';

export const isAdminWallet = (w) => config.auth.adminWallets.includes(w);
export const ADMIN_PANEL_ID = 'admin:panel';
/** Is this verified JWT payload an admin? Either a listed admin wallet, or the password-login principal (only while ADMIN_PASSWORD is set). */
export const isAdminToken = (p) => isAdminWallet(p.sub) || (p.adm === 'pw' && p.sub === ADMIN_PANEL_ID && !!config.auth.adminPassword);

const digest = (s) => crypto.createHash('sha256').update(String(s)).digest();
/** Password login for the admin panel. Constant-time compare; a failed try is slowed down. */
export async function adminLogin(password) {
  const expected = config.auth.adminPassword;
  if (!expected) throw bad('admin_login_disabled', 'Password login is not enabled on this server');
  const ok = crypto.timingSafeEqual(digest(password), digest(expected));
  if (!ok) { await new Promise((r) => setTimeout(r, 700)); throw unauthorized('Wrong password'); }
  const token = jwt.sign({ sub: ADMIN_PANEL_ID, admin: true, adm: 'pw' }, config.auth.jwtSecret, { expiresIn: '12h' });
  log.warn('admin panel login');
  return { token, wallet: ADMIN_PANEL_ID, admin: true };
}

export async function createNonce(wallet) {
  const nonce = crypto.randomBytes(16).toString('hex');
  const issued = new Date().toISOString();
  const message = `GTA Marketplace wants you to sign in with your Solana wallet.\n\nWallet: ${wallet}\nNonce: ${nonce}\nIssued: ${issued}\nNetwork: ${config.network}\n\nThis request will not trigger a transaction or cost any fees.`;
  await col('nonces').doc(nonce).set({ wallet, message, expiresAt: now() + config.auth.nonceTtlMs });
  return { nonce, message };
}

const decodeSig = (s) => {
  // A 64-byte signature is ~88 chars in BOTH encodings, so decide by trying base58 first (base64 of 64 bytes always ends in "==", which is not valid base58).
  try { const b = bs58.decode(s); if (b.length === 64) return b; } catch { /* not base58 */ }
  const b = Uint8Array.from(Buffer.from(s, 'base64'));
  if (b.length !== 64) throw bad('bad_signature', 'Signature must be a 64-byte ed25519 signature in base58 or base64');
  return b;
};

export async function verifyLogin({ wallet, nonce, signature }) {
  const ref = col('nonces').doc(nonce);
  const s = await ref.get();
  if (!s.exists) throw unauthorized('Unknown or used nonce');
  const n = s.data();
  await ref.delete(); // single use, even on failure
  if (n.wallet !== wallet || n.expiresAt < now()) throw unauthorized('Nonce expired');
  let pub;
  try { pub = bs58.decode(wallet); } catch { throw bad('bad_wallet', 'Invalid wallet address'); }
  if (pub.length !== 32 || !nacl.sign.detached.verify(new TextEncoder().encode(n.message), decodeSig(signature), pub)) throw unauthorized('Signature check failed');

  await col('users').doc(wallet).set({ wallet, lastLoginAt: now(), createdAt: now() }, { merge: true });
  const admin = isAdminWallet(wallet);
  const token = jwt.sign({ sub: wallet, admin }, config.auth.jwtSecret, { expiresIn: config.auth.jwtTtl });
  let firebaseToken = null;
  if (config.dbDriver === 'firestore') {
    try { firebaseToken = await (await import('firebase-admin/auth')).getAuth().createCustomToken(wallet, { wallet, admin }); }
    catch (e) { log.debug('firebase custom token unavailable: ' + e.message); }
  }
  return { token, firebaseToken, wallet, admin };
}

export function verifyToken(token) {
  try { return jwt.verify(token, config.auth.jwtSecret); } catch { throw unauthorized('Session expired, sign in again'); }
}
