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

test('launchpad flow: draft → 10+ art → publish, no review', async () => {
  const [admin, user, other] = [await login(adminKp), await login(userKp), await login(otherKp)];
  const t = Date.now();
  const c = await call('POST', '/launches', { name: 'Vice Nights', description: 'Neon pixel portraits.', logo: { data: png }, mint: { priceUsd: 2, perWallet: 2, start: t - 1000, hours: 24 } }, user);
  assert.equal(c.status, 200, JSON.stringify(c)); const id = c.launch.id; assert.equal(c.launch.status, 'draft'); assert.equal(c.launch.symbol, 'VICENIGH');
  assert.equal((await call('POST', `/launches/${id}/publish`, null, user)).status, 400, 'needs 10 pieces');
  for (let i = 0; i < 10; i++) assert.equal((await call('POST', `/launches/${id}/art`, { file: { data: png }, rarity: i ? 'Common' : 'Legendary' }, user)).count, i + 1);
  assert.equal((await call('POST', `/launches/${id}/art`, { file: { data: png } }, other)).status, 403);
  assert.equal((await call('GET', '/drops')).drops.length, 0, 'drafts are not listed');
  assert.equal((await call('POST', `/launches/${id}/publish`, null, other)).status, 403);
  assert.equal((await call('POST', `/launches/${id}/publish`, null, user)).status, 200);
  const d = (await call('GET', '/drops')).drops.find((x) => x.id === id); assert.equal(d.status, 'live'); assert.equal(d.supply, 10); assert.equal(d.stages.length, 1); assert.equal(d.revealed, false);
  assert.equal((await call('POST', `/launches/${id}/art`, { file: { data: png } }, user)).status, 409, 'art is locked once minting started');
  // our own collection: one phase
  await call('PUT', '/admin/collections/iv', { name: 'GTA IV' }, admin);
  const pd = await call('PUT', '/admin/collections/iv/drop', { published: true, supply: 50, revealMode: 'instant', stages: [{ kind: 'public', priceUsd: 0, start: t + 2 * 36e5, perWallet: 1 }] }, admin);
  assert.equal(pd.status, 200, JSON.stringify(pd));
  assert.equal((await call('GET', '/drops')).drops.find((x) => x.kind === 'platform').status, 'upcoming');
  // drafts can be deleted
  const d2 = await call('POST', '/launches', { name: 'Scrap', logo: { data: png } }, user);
  assert.equal((await call('DELETE', `/launches/${d2.launch.id}`, null, user)).ok, true);
});

test('profile + portfolio', async () => {
  const a = await login(kp()), b = await login(kp());
  const p = await call('PATCH', '/me', { name: 'Tommy V', username: 'Tommy_V', bio: 'Vice City OG', avatar: { data: png } }, a);
  assert.equal(p.status, 200, JSON.stringify(p)); assert.equal(p.profile.username, 'tommy_v'); assert.ok(p.profile.avatar);
  assert.equal((await call('PATCH', '/me', { username: 'TOMMY_V' }, b)).status, 409);
  assert.equal((await call('PATCH', '/me', { username: 'x!' }, b)).status, 400);
  const me = await call('GET', '/me', null, a); assert.equal(me.profile.name, 'Tommy V');
  const pf = await call('GET', '/me/portfolio', null, a); assert.equal(pf.status, 200, JSON.stringify(pf)); assert.equal(pf.nftCount, 0); assert.equal(typeof pf.totalUsd, 'number'); assert.equal(pf.profile.username, 'tommy_v');
  assert.equal((await call('PATCH', '/me', { removeAvatar: true }, a)).profile.avatar, null);
});

