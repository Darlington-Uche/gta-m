// Drop minting end to end: stages, allowlist, per-wallet limit, random pick, pre-reveal metadata, creator payout, reveal.
import test from 'node:test';
import assert from 'node:assert/strict';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

const kp = () => nacl.sign.keyPair(), pub = (k) => bs58.encode(k.publicKey);
const adminKp = kp(), creatorKp = kp(), aKp = kp(), bKp = kp(), cKp = kp();
Object.assign(process.env, { DB_DRIVER: 'memory', CHAIN_DRIVER: 'mock', NETWORK: 'devnet', FIXED_SOL_USD: '100', JWT_SECRET: 'test-secret', ADMIN_WALLETS: pub(adminKp), ADMIN_PASSWORD: 'pw', RUN_JOBS: 'false', TX_POLL_MS: '15', RATE_LIMIT_PER_MIN: '100000', AUTH_RATE_LIMIT_PER_MIN: '100000', PUBLIC_BASE_URL: 'http://api.test', STORAGE_DRIVER: 'local', PERMASTORE_DRIVER: 'none' });
const { buildApp } = await import('../src/app.js');
const { chain } = await import('../src/services/chain/index.js');
const { runJobsOnce } = await import('../src/jobs/worker.js');
const server = buildApp().listen(0), base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());
const SOL = 1e9;
const call = async (method, path, body, token) => { const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { ...(await r.json().catch(() => ({}))), status: r.status }; };
const login = async (k) => { const wallet = pub(k); const { message, nonce } = await call('POST', '/auth/nonce', { wallet }); const signature = bs58.encode(nacl.sign.detached(new TextEncoder().encode(message), k.secretKey)); return (await call('POST', '/auth/verify', { wallet, nonce, signature })).token; };
const run = async (prep, wallet, token) => { assert.equal(prep.status, 200, JSON.stringify(prep)); const r = await call('POST', '/tx/submit', { ptxId: prep.ptxId, signedTx: chain.signMock(prep.txB64, wallet) }, token); assert.equal(r.status, 200, JSON.stringify(r)); return r.tx; };
const png = (n) => Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000' + n.toString(16).padStart(2, '0'), 'hex').toString('base64');

test('creator drop: allowlist then public, limits, random pick, pre-reveal, payout, reveal', async () => {
  chain.fund(chain.vaultAddress, 10 * SOL); for (const k of [creatorKp, aKp, bKp, cKp]) chain.fund(pub(k), 5 * SOL);
  const [admin, creator, A, B, C] = [await login(adminKp), await login(creatorKp), await login(aKp), await login(bKp), await login(cKp)];
  const t = Date.now();
  const L = await call('POST', '/launches', { name: 'Vice Nights', description: 'Neon pixel portraits.', logo: { data: png(1) }, mint: { priceUsd: 10, perWallet: 1, start: t + 36e5, hours: 24 } }, creator);
  const id = L.launch.id;
  for (let i = 0; i < 10; i++) assert.equal((await call('POST', `/launches/${id}/art`, { file: { data: png(10 + i) } }, creator)).count, i + 1);
  assert.equal((await call('GET', `/items/${id}-1`)).status, 404, 'unminted drop art stays hidden');
  assert.equal((await call('POST', `/drops/${id}/mint`, null, A)).status, 404, 'draft is not on Drops');
  assert.equal((await call('POST', `/launches/${id}/publish`, null, creator)).status, 200);
  assert.equal((await call('POST', `/drops/${id}/mint`, null, A)).status, 409, 'not started yet');
  const { col } = await import('../src/lib/db.js');
  const doc = (await col('launches').doc(id).get()).data(); doc.stages[0].start = Date.now() - 5; await col('launches').doc(id).set(doc);
  const c0 = await chain.getBalance(pub(creatorKp));
  const m1 = await run(await call('POST', `/drops/${id}/mint`, null, A), pub(aKp), A); assert.equal(m1.status, 'confirmed');
  assert.equal((await call('POST', `/drops/${id}/mint`, null, A)).status, 409, 'per-wallet limit');
  assert.deepEqual((await call('GET', `/drops/${id}/mine`, null, A)).minted, { mint: 1 });
  const mine = (await call('GET', `/items?owner=${pub(aKp)}`)).items; assert.equal(mine.length, 1); assert.equal(mine[0].unrevealed, true); assert.match(mine[0].title, /#\?/);
  const meta = await (await fetch(`${base}/metadata/${mine[0].id}.json`)).json(); assert.match(meta.name, /#\?/);
  const m2 = await run(await call('POST', `/drops/${id}/mint`, null, B), pub(bKp), B); assert.equal(m2.status, 'confirmed');
  await runJobsOnce({ force: true });
  const paid = (await chain.getBalance(pub(creatorKp))) - c0; assert.ok(Math.abs(paid - 2 * 0.1 * SOL * 0.95) < 20_000, `creator got ${paid}`);
  const drop = (await call('GET', `/drops/${id}`)).drop; assert.equal(drop.minted, 2); assert.equal(drop.revealed, false); assert.equal(drop.supply, 10);
  assert.equal((await call('POST', `/launches/${id}/reveal`, null, B)).status, 403);
  assert.equal((await call('POST', `/launches/${id}/reveal`, null, creator)).revealed, 10);
  const after = (await call('GET', `/items?owner=${pub(aKp)}`)).items[0]; assert.equal(after.unrevealed, false); assert.match(after.title, /Vice Nights #\d/);
});

test('selling out reveals the collection automatically', async () => {
  const [creator, C] = [await login(creatorKp), await login(cKp)];
  const L = await call('POST', '/launches', { name: 'Grove OGs', logo: { data: png(3) }, mint: { priceUsd: 0, perWallet: 10, start: Date.now() - 1000, hours: 24 } }, creator);
  const id = L.launch.id;
  for (let i = 0; i < 10; i++) await call('POST', `/launches/${id}/art`, { file: { data: png(40 + i) } }, creator);
  await call('POST', `/launches/${id}/publish`, null, creator);
  for (let i = 0; i < 10; i++) assert.equal((await run(await call('POST', `/drops/${id}/mint`, null, C), pub(cKp), C)).status, 'confirmed');
  assert.equal((await call('POST', `/drops/${id}/mint`, null, C)).status, 409);
  const d = (await call('GET', `/drops/${id}`)).drop; assert.equal(d.soldOut, true); assert.equal(d.revealed, true);
  assert.ok((await call('GET', `/items?owner=${pub(cKp)}&limit=50`)).items.filter((i) => i.collectionId === id).every((i) => !i.unrevealed));
});
