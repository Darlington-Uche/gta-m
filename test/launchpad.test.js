// Launchpad: creator submits a collection, admin verifies it, our own collection gets mint stages, /drops shows both.
import test from 'node:test';
import assert from 'node:assert/strict';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

const kp = () => nacl.sign.keyPair(), adminKp = kp(), userKp = kp(), otherKp = kp();
const pub = (k) => bs58.encode(k.publicKey);
Object.assign(process.env, { DB_DRIVER: 'memory', CHAIN_DRIVER: 'mock', NETWORK: 'devnet', FIXED_SOL_USD: '100', JWT_SECRET: 'test-secret', ADMIN_WALLETS: pub(adminKp), ADMIN_PASSWORD: 'pw', RUN_JOBS: 'false', RATE_LIMIT_PER_MIN: '100000', AUTH_RATE_LIMIT_PER_MIN: '100000', PUBLIC_BASE_URL: 'http://api.test', STORAGE_DRIVER: 'local' });
const { buildApp } = await import('../src/app.js');
const server = buildApp().listen(0), base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());
const call = async (method, path, body, token) => { const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { ...(await r.json().catch(() => ({}))), status: r.status }; };
const login = async (k) => { const wallet = pub(k); const { message, nonce } = await call('POST', '/auth/nonce', { wallet }); const signature = bs58.encode(nacl.sign.detached(new TextEncoder().encode(message), k.secretKey)); return (await call('POST', '/auth/verify', { wallet, nonce, signature })).token; };
const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex').toString('base64');

test('launchpad flow', async () => {
  const [admin, user, other] = [await login(adminKp), await login(userKp), await login(otherKp)];
  const t = Date.now();
  const body = { name: 'Vice Nights', symbol: 'VNIGHT', description: 'Neon pixel portraits from a city that never sleeps.', theme: 'vice', revealMode: 'date', revealAt: t + 864e5, supply: 100, royaltyPct: 5, logo: { data: png }, preReveal: { data: png },
    stages: [{ kind: 'allowlist', name: 'Early', priceUsd: 0, start: t - 1000, end: t + 36e5, perWallet: 2, allowlist: [pub(otherKp), 'nope'] }, { kind: 'public', priceUsd: 5, start: t + 36e5, perWallet: 3 }] };
  const bad = await call('POST', '/launches', { ...body, stages: [{ kind: 'allowlist', priceUsd: 0, start: t, perWallet: 1, allowlist: [] }] }, user);
  assert.equal(bad.status, 400, JSON.stringify(bad));
  const c = await call('POST', '/launches', body, user); assert.equal(c.status, 200, JSON.stringify(c));
  const id = c.launch.id; assert.equal(c.launch.status, 'review'); assert.equal(c.launch.stages[0].allowlist.length, 1);
  assert.equal((await call('POST', `/launches/${id}/art`, { file: { data: png } }, user)).count, 1);
  assert.equal((await call('POST', `/launches/${id}/art`, { file: { data: png } }, other)).status, 403);
  assert.equal((await call('GET', '/drops')).drops.length, 0, 'not listed before review');
  assert.equal((await call('GET', '/me/launches', null, user)).launches.length, 1);
  assert.equal((await call('POST', `/admin/launches/${id}/review`, { approve: true }, admin)).ok, true);
  // our own collection with stages
  await call('PUT', '/admin/collections/iv', { name: 'GTA IV' }, admin);
  const pd = await call('PUT', '/admin/collections/iv/drop', { published: true, supply: 50, revealMode: 'instant', stages: [{ kind: 'public', priceUsd: 0, start: t + 2 * 36e5, perWallet: 1 }] }, admin);
  assert.equal(pd.status, 200, JSON.stringify(pd));
  const drops = (await call('GET', '/drops')).drops; assert.equal(drops.length, 2);
  const mine = drops.find((d) => d.id === id); assert.equal(mine.status, 'live'); assert.equal(mine.currentStage, 'st1'); assert.equal(mine.revealed, false); assert.equal(mine.stages[0].allowlist, undefined);
  assert.equal(drops.find((d) => d.kind === 'platform').status, 'upcoming');
  const asOther = (await call('GET', `/drops/${id}`, null, other)).drop; assert.equal(asOther.stages[0].eligible, true); assert.equal(asOther.stages[1].eligible, true);
  const asUser = (await call('GET', `/drops/${id}`, null, user)).drop; assert.equal(asUser.stages[0].eligible, false);
});
