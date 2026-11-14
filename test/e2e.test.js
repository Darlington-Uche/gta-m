// End-to-end flow over real HTTP, with the in-memory Firestore + simulated chain.
// Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

const kp = () => nacl.sign.keyPair();
const adminKp = kp();
const pub = (k) => bs58.encode(k.publicKey);
Object.assign(process.env, {
  DB_DRIVER: 'memory', CHAIN_DRIVER: 'mock', NETWORK: 'devnet', FIXED_SOL_USD: '100', JWT_SECRET: 'test-secret',
  ADMIN_WALLETS: pub(adminKp), ADMIN_PASSWORD: 'test-admin-pw', RUN_JOBS: 'false', TX_POLL_MS: '15', RATE_LIMIT_PER_MIN: '100000', AUTH_RATE_LIMIT_PER_MIN: '100000', PUBLIC_BASE_URL: 'http://api.test', ASSETS_BASE_URL: 'http://front.test'
});

const { buildApp } = await import('../src/app.js');
const { chain } = await import('../src/services/chain/index.js');
const { col, getDoc, queryDocs } = await import('../src/lib/db.js');
const { runJobsOnce } = await import('../src/jobs/worker.js');
const { bidWindowState } = await import('../src/services/settings.service.js');
const { invalidateCatalog } = await import('../src/services/items.service.js');

const SOL = 1e9;
const server = buildApp().listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

async function call(method, path, body, token) {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  return { ...json, status: res.status };
}
async function login(k) {
  const wallet = pub(k);
  const { message, nonce } = await call('POST', '/auth/nonce', { wallet });
  const signature = bs58.encode(nacl.sign.detached(new TextEncoder().encode(message), k.secretKey));
  const r = await call('POST', '/auth/verify', { wallet, nonce, signature });
  assert.equal(r.status, 200, JSON.stringify(r));
  return r.token;
}
// prepare -> user signs -> submit
async function run(prep, wallet, token) {
  assert.equal(prep.status, 200, JSON.stringify(prep));
  const signedTx = chain.signMock(prep.txB64, wallet);
  const r = await call('POST', '/tx/submit', { ptxId: prep.ptxId, signedTx }, token);
  assert.equal(r.status, 200, JSON.stringify(r));
  return r.tx;
}
const bal = (w) => chain.getBalance(w);
const near = (a, b, tol = 20_000) => assert.ok(Math.abs(a - b) <= tol, `expected ~${b} got ${a}`);

const users = Object.fromEntries(['A', 'B', 'C', 'D', 'E', 'F'].map((n) => [n, kp()]));
const W = Object.fromEntries(Object.entries(users).map(([n, k]) => [n, pub(k)]));
let T = {}; // tokens
let adminT;

test('setup: fund wallets, sign in, create catalog', async () => {
  chain.fund(chain.vaultAddress, 10 * SOL);
  for (const w of Object.values(W)) chain.fund(w, 5 * SOL);
  adminT = await login(adminKp);
  for (const n of Object.keys(users)) T[n] = await login(users[n]);

  const h = await call('GET', '/health');
  assert.equal(h.status, 200); assert.equal(h.network, 'devnet');
  const meta = await call('GET', '/meta');
  assert.equal(meta.solUsd, 100); assert.equal(meta.vault, chain.vaultAddress);

  // collections: nothing is mintable until its collection is registered (and verified) by the admin
  assert.equal((await call('GET', '/admin/collections', null, T.A)).status, 403);
  assert.equal((await call('PUT', '/admin/collections/vice', { address: 'bad' }, adminT)).status, 400); // fails shape check
  assert.equal((await call('PUT', '/admin/collections/vice', { address: pub(kp()) }, adminT)).status, 200);
  for (const e of ['g1', 'g2', 'g3', 'sa', 'iv', 'v', 'vi']) assert.equal((await call('PUT', `/admin/collections/${e}`, { address: pub(kp()), name: e }, adminT)).status, 200, e);
  assert.equal((await call('GET', '/meta')).liveCollections.length, 8);

  // non-admin is blocked, admin can create
  const body = { title: 'Free One', image: 'http://front.test/assets/art/a1.png', era: 'vice', category: 'Artwork', rarity: 'Common', priceUsd: 0 };
  assert.equal((await call('POST', '/admin/items', { ...body, id: '1' }, T.A)).status, 403);
  assert.equal((await call('POST', '/admin/items', { ...body, id: '1' })).status, 401);
  assert.equal((await call('POST', '/admin/items', { ...body, id: '1' }, adminT)).status, 200);
  assert.equal((await call('POST', '/admin/items', { ...body, id: '2', title: 'Paid Five', priceUsd: 5, rarity: 'Rare' }, adminT)).status, 200);
  assert.equal((await call('POST', '/admin/items', { ...body, id: '3', title: 'Free Two', priceUsd: 0 }, adminT)).status, 200);
  assert.equal((await call('POST', '/admin/items', { ...body, id: '1' }, adminT)).status, 409);

  const list = await call('GET', '/items?sort=price_high');
  assert.equal(list.total, 3);
  assert.equal(list.items[0].primary.priceUsd, 5);
  assert.equal(list.items[0].primary.priceSol, 0.05);
});

test('lazy mint: free + paid, owner is the minter, revenue goes to vault', async () => {
  const vaultBefore = await bal(chain.vaultAddress);
  const t1 = await run(await call('POST', '/items/1/mint', null, T.A), W.A, T.A);
  assert.equal(t1.status, 'confirmed');
  let it = (await call('GET', '/items/1')).item;
  assert.equal(it.status, 'minted'); assert.equal(it.owner, W.A); assert.ok(it.asset);
  assert.equal(await chain.getAssetOwner(it.asset), W.A);

  const t2 = await run(await call('POST', '/items/2/mint', null, T.B), W.B, T.B);
  assert.equal(t2.status, 'confirmed');
  near(await bal(chain.vaultAddress), vaultBefore + 0.05 * SOL, 1);
  const vault = (await call('GET', '/admin/vault', null, adminT)).vault;
  assert.equal(vault.revenueLamports, 0.05 * SOL); assert.equal(vault.escrowLamports, 0);

  // can't mint twice / mint something already minted
  assert.equal((await call('POST', '/items/1/mint', null, T.C)).status, 409);
  // can't make an offer on an unminted item
  assert.equal((await call('POST', '/items/3/offers', { usd: 5 }, T.C)).status, 409);
  // my NFTs
  assert.deepEqual((await call('GET', '/me/nfts', null, T.A)).items.map((i) => i.id), ['1']);
  assert.deepEqual((await call('GET', '/me/nfts', null, T.B)).items.map((i) => i.id), ['2']);
});

test('free mint limit per wallet is enforced', async () => {
  await call('PUT', '/admin/settings', { maxFreeMintsPerWallet: 1 }, adminT);
  const { resetSettingsCache } = await import('../src/services/settings.service.js');
  resetSettingsCache();
  const r = await call('POST', '/items/3/mint', null, T.A); // A already used their 1 free mint
  assert.equal(r.status, 409); assert.equal(r.error.code, 'free_mint_limit');
  await call('PUT', '/admin/settings', { maxFreeMintsPerWallet: 3 }, adminT);
  resetSettingsCache();
});

let offerB, offerC, offerD;
test('offers: B $4, C $6, D $10 — no listing needed; funds go into escrow; owner is notified', async () => {
  const before = { B: await bal(W.B), C: await bal(W.C) };
  offerB = (await run(await call('POST', '/items/1/offers', { usd: 4 }, T.B), W.B, T.B)) && null;
  const pB = await call('POST', '/items/1/offers', { usd: 4 }, T.B).catch(() => null);
  assert.equal(pB.status, 409); // B already has a pending/active offer -> duplicate blocked (first one confirmed above)
  // find offer ids
  const offers = (await call('GET', '/items/1/offers')).offers;
  offerB = offers.find((o) => o.bidder === W.B).id;

  const pC = await call('POST', '/items/1/offers', { usd: 6 }, T.C); await run(pC, W.C, T.C); offerC = pC.offerId;
  const pD = await call('POST', '/items/1/offers', { usd: 10 }, T.D); await run(pD, W.D, T.D); offerD = pD.offerId;

  const list = (await call('GET', '/items/1/offers')).offers;
  assert.deepEqual(list.map((o) => o.usd), [10, 6, 4]);
  near(before.B - (await bal(W.B)), 0.04 * SOL, 10_000); near(before.C - (await bal(W.C)), 0.06 * SOL, 10_000);

  const vault = (await call('GET', '/admin/vault', null, adminT)).vault;
  assert.equal(vault.escrowLamports, 0.2 * SOL);

  // owner got 3 notifications, owner can't offer on own NFT, tiny offers blocked
  const n = await call('GET', '/me/notifications?unread=true', null, T.A);
  assert.equal(n.notifications.filter((x) => x.type === 'offer_received').length, 3);
  assert.equal((await call('POST', '/items/1/offers', { usd: 50 }, T.A)).status, 400);
  assert.equal((await call('POST', '/items/1/offers', { usd: 0.5 }, T.E)).status, 400);
  assert.equal((await call('GET', '/me/offers/received', null, T.A)).offers.length, 3);
  assert.equal((await call('GET', '/me/offers/made', null, T.C)).offers.length, 1);
});

test('accept: owner signs NFT + $0.30 fee to the vault; bidder D gets NFT; B and C are refunded', async () => {
  // someone else can't accept; wrong state can't be accepted
  assert.equal((await call('POST', `/offers/${offerD}/accept`, null, T.B)).status, 403);

  const a0 = await bal(W.A), b0 = await bal(W.B), c0 = await bal(W.C);
  const prep = await call('POST', `/offers/${offerD}/accept`, null, T.A);
  assert.equal(prep.status, 200);
  assert.equal(prep.summary.networkFeeUsd, 0.3);
  // item is locked while the tx is in flight
  assert.equal((await call('POST', `/offers/${offerC}/accept`, null, T.A)).status, 409);
  const tx = await run(prep, W.A, T.A);
  assert.equal(tx.status, 'confirmed');

  const item = (await call('GET', '/items/1')).item;
  assert.equal(item.owner, W.D);
  assert.equal(await chain.getAssetOwner(item.asset), W.D);
  // seller: +0.1 SOL - 2.5% platform fee - $0.30 (0.003 SOL) dev fee
  near(await bal(W.A), a0 + 0.1 * SOL - 0.0025 * SOL - 0.003 * SOL, 1);

  // other offers were queued for refund and get paid by the worker
  const mid = (await queryDocs(col('offers'))).filter((o) => o.itemId === '1');
  assert.equal(mid.filter((o) => o.status === 'refund_pending').length, 2);
  await runJobsOnce({ force: true });
  near(await bal(W.B), b0 + 0.04 * SOL, 1);
  near(await bal(W.C), c0 + 0.06 * SOL, 1);
  const final = (await queryDocs(col('offers'))).filter((o) => o.itemId === '1').map((o) => o.status).sort();
  assert.deepEqual(final, ['accepted', 'refunded', 'refunded']);

  const vault = (await call('GET', '/admin/vault', null, adminT)).vault;
  assert.equal(vault.escrowLamports, 0, 'no bidder money left in escrow');
  assert.equal(vault.revenueLamports, 0.05 * SOL + 0.0025 * SOL + 0.003 * SOL, 'mint revenue + 2.5% + the $0.30 fee all stay in the vault');
  assert.equal(vault.solvent, true);

  // notifications + ownership views
  const nb = await call('GET', '/me/notifications', null, T.B);
  assert.ok(nb.notifications.some((x) => x.type === 'offer_refunded'));
  const nd = await call('GET', '/me/notifications', null, T.D);
  assert.ok(nd.notifications.some((x) => x.type === 'offer_accepted'));
  assert.deepEqual((await call('GET', '/me/nfts', null, T.D)).items.map((i) => i.id), ['1']);
  assert.deepEqual((await call('GET', '/me/nfts', null, T.A)).items, []);
  assert.equal((await call('GET', '/me/activity', null, T.A)).activity.length, 2); // minted it + sold it
});

test('running the refund job twice never pays twice', async () => {
  const b = await bal(W.B);
  await runJobsOnce({ force: true }); await runJobsOnce({ force: true });
  assert.equal(await bal(W.B), b);
});

test('ownership sync finds NFTs moved outside the site (e.g. Phantom transfer)', async () => {
  const asset = (await call('GET', '/items/1')).item.asset;
  chain.assets.get(asset).owner = W.E; // D sends it to E directly on-chain
  assert.deepEqual((await call('GET', '/me/nfts', null, T.E)).items, []); // DB hasn't noticed yet
  const synced = await call('POST', '/me/nfts/sync', null, T.E);
  // E has no DB items, so use the full reconcile (what the worker does) then re-read
  await call('POST', '/admin/ownership/reconcile', null, adminT);
  invalidateCatalog();
  assert.deepEqual((await call('GET', '/me/nfts', null, T.E)).items.map((i) => i.id), ['1']);
  assert.deepEqual((await call('GET', '/me/nfts', null, T.D)).items, []);
  assert.equal(synced.status, 200);
});

test('sale price: owner lists once, buyer pays in one atomic tx, outstanding offers are refunded', async () => {
  // B places an offer first (will be refunded when the NFT is bought at the sale price)
  const pB = await call('POST', '/items/1/offers', { usd: 3 }, T.B); await run(pB, W.B, T.B);
  const b0 = await bal(W.B);

  // owners set their own price (standard marketplace): list, change the price, the floor follows the cheapest listing
  assert.equal((await call('POST', '/items/1/listing', { priceUsd: 20 }, T.B)).status, 403); // not the owner
  const lp = await call('POST', '/items/1/listing', { priceUsd: 30 }, T.E); assert.equal(lp.status, 200, JSON.stringify(lp));
  const listed = await run(lp, W.E, T.E);
  assert.equal(listed.status, 'confirmed');
  assert.equal((await call('PATCH', '/items/1/listing', { priceUsd: 20 }, T.E)).status, 200);
  const it = (await call('GET', '/items/1')).item;
  assert.equal(it.listing.priceUsd, 20); assert.equal(it.listing.priceSol, 0.2);

  const e0 = await bal(W.E), f0 = await bal(W.F), rev0 = (await call('GET', '/admin/vault', null, adminT)).vault.revenueLamports;
  assert.equal((await call('POST', '/items/1/buy', null, T.E)).status, 400); // can't buy your own
  const bought = await run(await call('POST', '/items/1/buy', null, T.F), W.F, T.F);
  assert.equal(bought.status, 'confirmed');
  assert.equal((await call('GET', '/items/1')).item.owner, W.F);
  near(f0 - (await bal(W.F)), 0.2 * SOL, 10_000);
  near(await bal(W.E), e0 + 0.2 * SOL - 0.005 * SOL - 0.003 * SOL, 1); // 2.5% fee + $0.30
  assert.equal((await call('GET', '/admin/vault', null, adminT)).vault.revenueLamports, rev0 + 0.005 * SOL + 0.003 * SOL);
  assert.equal((await call('GET', '/items/1')).item.listing, null);
  await runJobsOnce({ force: true });
  near(await bal(W.B), b0 + 0.03 * SOL, 1);
});

test('cancel + reject + expiry all refund the bidder exactly once', async () => {
  // F owns item 1 now. B: cancel, C: rejected, D: expires
  const mk = async (k, n, usd) => { const p = await call('POST', '/items/1/offers', { usd }, T[n]); await run(p, W[n], T[n]); return p.offerId; };
  const oB = await mk(users.B, 'B', 2), oC = await mk(users.C, 'C', 2), oD = await mk(users.D, 'D', 2);
  const before = { B: await bal(W.B), C: await bal(W.C), D: await bal(W.D) };
  assert.equal((await call('DELETE', `/offers/${oC}`, null, T.B)).status, 403); // not your offer
  assert.equal((await call('DELETE', `/offers/${oB}`, null, T.B)).status, 200);
  assert.equal((await call('POST', `/offers/${oC}/reject`, null, T.B)).status, 403); // only owner
  assert.equal((await call('POST', `/offers/${oC}/reject`, null, T.F)).status, 200);
  await col('offers').doc(oD).update({ expiresAt: Date.now() - 1000 }); // time passes
  await runJobsOnce({ force: true }); await runJobsOnce({ force: true });
  near(await bal(W.B), before.B + 0.02 * SOL, 1); near(await bal(W.C), before.C + 0.02 * SOL, 1); near(await bal(W.D), before.D + 0.02 * SOL, 1);
  const st = Object.fromEntries((await queryDocs(col('offers'))).filter((o) => [oB, oC, oD].includes(o.id)).map((o) => [o.id, o.status]));
  assert.deepEqual([st[oB], st[oC], st[oD]], ['cancelled', 'rejected', 'expired']);
  assert.equal((await call('GET', '/admin/vault', null, adminT)).vault.escrowLamports, 0);
});

test('payout resilience: RPC outage and "lost" transactions never double-pay or lose money', async () => {
  const cancelled = async (usd) => { const p = await call('POST', '/items/1/offers', { usd }, T.C); await run(p, W.C, T.C); await call('DELETE', `/offers/${p.offerId}`, null, T.C); return p.offerId; };

  // 1) RPC is down when the refund is first sent -> same signed tx is re-sent on the next pass, paid exactly once
  let id = await cancelled(5);
  let c0 = await bal(W.C);
  chain.failBroadcast = 1;
  await runJobsOnce({ force: true });
  assert.equal(await bal(W.C), c0, 'nothing paid while RPC is down');
  await runJobsOnce({ force: true }); await runJobsOnce({ force: true });
  assert.equal(await bal(W.C), c0 + 0.05 * SOL);
  assert.equal((await queryDocs(col('payouts'))).find((x) => x.ref?.offerId === id).status, 'sent');

  // 2) the tx is "accepted" by the RPC but silently dropped (both sends) -> we wait for the blockhash to expire, then rebuild; still once
  id = await cancelled(6);
  c0 = await bal(W.C);
  chain.dropBroadcast = 2;
  await runJobsOnce({ force: true }); await runJobsOnce({ force: true });
  assert.equal(await bal(W.C), c0, 'not paid yet; must not rebuild while the old tx could still land');
  chain.advance(300);
  await runJobsOnce({ force: true }); await runJobsOnce({ force: true });
  assert.equal(await bal(W.C), c0 + 0.06 * SOL);
  const payout = (await queryDocs(col('payouts'))).find((x) => x.ref?.offerId === id);
  assert.equal(payout.status, 'sent'); assert.equal(payout.attempts, 2);
  assert.equal((await call('GET', '/admin/vault', null, adminT)).vault.escrowLamports, 0);
});

test('a prepared tx that is never signed/landed rolls back and unlocks the item', async () => {
  const prep = await call('POST', '/items/3/mint', null, T.D);
  assert.equal(prep.status, 200);
  assert.equal((await call('POST', '/items/3/mint', null, T.E)).status, 409); // reserved
  assert.equal((await call('GET', '/items/3')).item.status, 'reserved');
  // user submits but the network drops it
  chain.dropBroadcast = 1;
  const signedTx = chain.signMock(prep.txB64, W.D);
  // submit blocks ~25s polling; use a short path: advance chain so the poll sees "expired" quickly
  const sub = call('POST', '/tx/submit', { ptxId: prep.ptxId, signedTx }, T.D);
  setTimeout(() => chain.advance(400), 100);
  const r = await sub;
  assert.equal(r.status, 409);
  assert.equal((await call('GET', '/items/3')).item.status, 'unminted');
  // and someone else can now mint it
  assert.equal((await run(await call('POST', '/items/3/mint', null, T.E), W.E, T.E)).status, 'confirmed');
});

test('security: wrong/missing signatures, tampering and other people\'s txs are refused', async () => {
  await call('POST', '/admin/items', { id: '9', title: 'Sec', image: 'http://x/y.png', era: 'v', category: 'Artwork', priceUsd: 5 }, adminT);
  const prep = await call('POST', '/items/9/mint', null, T.B);
  // unsigned by user
  let r = await call('POST', '/tx/submit', { ptxId: prep.ptxId, signedTx: prep.txB64 }, T.B);
  assert.equal(r.status, 400); assert.equal(r.error.code, 'missing_signature');
  // someone else tries to submit it
  r = await call('POST', '/tx/submit', { ptxId: prep.ptxId, signedTx: chain.signMock(prep.txB64, W.B) }, T.C);
  assert.equal(r.status, 403);
  // tampered tx (different message) is rejected
  const tampered = JSON.parse(Buffer.from(prep.txB64, 'base64').toString()); tampered.ixs[0].lamports = 1;
  r = await call('POST', '/tx/submit', { ptxId: prep.ptxId, signedTx: chain.signMock(Buffer.from(JSON.stringify(tampered)).toString('base64'), W.B) }, T.B);
  assert.equal(r.status, 400); assert.equal(r.error.code, 'tx_mismatch');
  // insufficient funds -> definitive rejection, item released
  chain.balances.set(W.B, 1000);
  r = await call('POST', '/tx/submit', { ptxId: prep.ptxId, signedTx: chain.signMock(prep.txB64, W.B) }, T.B);
  assert.equal(r.status, 400); assert.equal(r.error.code, 'tx_rejected');
  assert.equal((await call('GET', '/items/9')).item.status, 'unminted');
  chain.fund(W.B, 5 * SOL);
  // bad JWT / signature on login
  assert.equal((await call('GET', '/me', null, 'garbage')).status, 401);
  const { message, nonce } = await call('POST', '/auth/nonce', { wallet: W.A });
  const wrong = bs58.encode(nacl.sign.detached(new TextEncoder().encode(message), users.B.secretKey));
  assert.equal((await call('POST', '/auth/verify', { wallet: W.A, nonce, signature: wrong })).status, 401);
});

test('kill switches + bid window', async () => {
  const { resetSettingsCache } = await import('../src/services/settings.service.js');
  await call('PUT', '/admin/settings', { tradingEnabled: false }, adminT); resetSettingsCache();
  assert.equal((await call('POST', '/items/1/offers', { usd: 5 }, T.C)).status, 503);
  await call('PUT', '/admin/settings', { tradingEnabled: true, mintingEnabled: false }, adminT); resetSettingsCache();
  assert.equal((await call('POST', '/items/9/mint', null, T.C)).status, 503);
  await call('PUT', '/admin/settings', { mintingEnabled: true }, adminT); resetSettingsCache();

  // "2 hours open out of every 6 hours"
  const s = { bidWindow: { enabled: true, openMinutes: 120, cycleMinutes: 360 } };
  const at = (h, m = 0) => new Date(Date.UTC(2026, 9, 31, h, m));
  assert.equal(bidWindowState(s, at(1)).open, true);
  assert.equal(bidWindowState(s, at(3)).open, false);
  assert.equal(bidWindowState(s, at(3)).opensAt, Date.UTC(2026, 9, 31, 6));
  assert.equal(bidWindowState(s, at(6, 30)).open, true);
  assert.equal(bidWindowState(s, at(8, 30)).open, false);
  assert.equal(bidWindowState({ bidWindow: { enabled: false } }, at(3)).open, true);
});

test('admin: bulk price, vault withdrawal can never touch escrow, ledger + docs', async () => {
  // raise every paid unminted item by 10%
  const r = await call('POST', '/admin/items/bulk-price', { filter: { onlyPaid: true }, mode: 'percent', value: 10 }, adminT);
  assert.equal(r.status, 200);
  assert.equal((await getDoc('items', '9')).priceUsd, 5.5);

  // put 0.1 SOL in escrow, then try to withdraw more than revenue
  const p = await call('POST', '/items/1/offers', { usd: 10 }, T.C); await run(p, W.C, T.C);
  const v = (await call('GET', '/admin/vault', null, adminT)).vault;
  assert.equal(v.escrowLamports, 0.1 * SOL);
  assert.ok(v.withdrawableLamports <= v.revenueLamports);
  assert.equal((await call('POST', '/admin/vault/withdraw', { to: W.A, lamports: v.revenueLamports + 1 }, adminT)).status, 400);
  const a0 = await bal(W.A);
  assert.equal((await call('POST', '/admin/vault/withdraw', { to: W.A, lamports: 0.05 * SOL }, adminT)).status, 200);
  await runJobsOnce({ force: true });
  near(await bal(W.A), a0 + 0.05 * SOL, 1);
  const v2 = (await call('GET', '/admin/vault', null, adminT)).vault;
  assert.equal(v2.escrowLamports, 0.1 * SOL); assert.equal(v2.solvent, true);
  assert.ok((await call('GET', '/admin/ledger', null, adminT)).ledger.length > 5);

  // public read endpoints used by the frontend
  assert.ok((await call('GET', '/collections')).collections.length >= 1);
  assert.ok((await call('GET', '/activity')).activity.length >= 1);
  assert.equal((await call('GET', '/stats')).stats.items, 4);
  const meta = await fetch(`${base}/metadata/1.json`).then((x) => x.json());
  assert.equal(meta.name, 'Free One'); assert.ok(meta.attributes.length >= 3);
  assert.equal((await call('POST', '/items/1/like', null, T.A)).liked, true);
  assert.equal((await call('POST', '/items/1/like', null, T.A)).liked, false);
});

test('collections: an era whose collection is not registered cannot be minted; wrong-collection transfers are rejected by the chain', async () => {
  const adminT = await login(adminKp), u = kp(), uT = await login(u);
  chain.fund(pub(u), 5 * SOL);
  await call('POST', '/admin/items', { id: 'zz1', title: 'Future', image: 'http://front.test/x.png', era: 'vice', collectionId: 'future', category: 'Artwork', priceUsd: 0 }, adminT);
  const item = (await call('GET', '/items/zz1')).item;
  assert.equal(item.collection.live, false); assert.equal(item.primary.available, false);
  const r = await call('POST', '/items/zz1/mint', null, uT);
  assert.equal(r.status, 503); assert.match(r.error.message, /not live yet/);
  // register it, mint works, and the asset is recorded with that collection
  const addr = pub(kp());
  assert.equal((await call('PUT', '/admin/collections/future', { address: addr, name: 'Future' }, adminT)).status, 200);
  invalidateCatalog();
  const tx = await run(await call('POST', '/items/zz1/mint', null, uT), pub(u), uT);
  assert.equal(tx.status, 'confirmed');
  const minted = await getDoc('items', 'zz1');
  assert.equal(minted.collection, addr);
  assert.equal(chain.assets.get(minted.asset).collection, addr);
  // a tx that names another collection for this asset is refused by the chain (simulates Core's collection check)
  const prep = await chain.buildListTx({ owner: pub(u), asset: minted.asset, collection: pub(kp()) });
  await assert.rejects(chain.broadcast(chain.signMock(prep.txB64, pub(u))), /wrong collection/);
  // admin listing
  const reg = (await call('GET', '/admin/collections', null, adminT)).collections;
  assert.ok(reg.find((c) => c.id === 'future' && c.status === 'live' && c.address === addr));
});

test('sign-in accepts the wallet signature as base58 OR base64 (browser wallets give raw bytes)', async () => {
  for (const enc of ['b58', 'b64']) {
    const k = kp(), wallet = pub(k);
    const { message, nonce } = await call('POST', '/auth/nonce', { wallet });
    const raw = nacl.sign.detached(new TextEncoder().encode(message), k.secretKey);
    const signature = enc === 'b58' ? bs58.encode(raw) : Buffer.from(raw).toString('base64');
    const r = await call('POST', '/auth/verify', { wallet, nonce, signature });
    assert.equal(r.status, 200, enc + ' ' + JSON.stringify(r));
  }
});

test('permanent storage: minter pays the upload fee, vault revenue excludes it, upload is reused after an abandoned mint', async () => {
  const { config } = await import('../src/config/index.js');
  config.permastore.driver = 'mock';
  const item = { title: 'Perm', image: 'http://front.test/assets/art/p.png', era: 'vice', category: 'Artwork', rarity: 'Rare', priceUsd: 5 };
  try {
    assert.equal((await call('POST', '/admin/items', { ...item, id: 'p1' }, adminT)).status, 200);
    const before = (await call('GET', '/admin/vault', null, adminT)).vault;
    const p1 = await call('POST', '/items/p1/mint', null, T.F);
    assert.equal(p1.status, 200, JSON.stringify(p1));
    assert.equal(p1.price.storageLamports, 5000);
    assert.equal(p1.price.lamports, p1.price.priceLamports + 5000);
    assert.equal(p1.price.permanent, true);
    const uri = (await getDoc('items', 'p1')).perm.metadataUri;
    assert.match(uri, /^https:\/\/arweave\.mock\/meta_/);
    // F walks away: the reservation is released (as the expiry job would). The upload stays cached on the item.
    await col('items').doc('p1').update({ status: 'unminted', reservedBy: null, lock: null });
    const p2 = await call('POST', '/items/p1/mint', null, T.E);
    assert.equal(p2.status, 200, JSON.stringify(p2));
    assert.equal(p2.price.storageLamports, 5000, 'second minter pays the same cached upload');
    assert.equal((await getDoc('items', 'p1')).perm.metadataUri, uri);
    assert.equal((await run(p2, W.E, T.E)).status, 'confirmed');
    const v = (await call('GET', '/admin/vault', null, adminT)).vault;
    assert.equal(v.revenueLamports - before.revenueLamports, p2.price.priceLamports, 'storage fee is not booked as revenue');
    assert.equal(chain.assets.get((await getDoc('items', 'p1')).asset).uri, uri, 'the on-chain uri is the permanent one');
  } finally { config.permastore.driver = 'none'; }
});

test('permanent storage falls back to hosted metadata if the upload fails', async () => {
  const { config } = await import('../src/config/index.js');
  config.permastore.driver = 'mock';
  try {
    assert.equal((await call('POST', '/admin/items', { id: 'p2', title: 'Fail Item', image: 'http://front.test/fail.png', era: 'vice', category: 'Artwork', rarity: 'Common', priceUsd: 0 }, adminT)).status, 200);
    const prep = await call('POST', '/items/p2/mint', null, T.D);
    assert.equal(prep.status, 200, JSON.stringify(prep));
    assert.equal(prep.price.permanent, false); assert.equal(prep.price.storageLamports, 0);
    assert.equal(prep.price.lamports, prep.price.priceLamports);
    await col('items').doc('p2').update({ status: 'unminted', reservedBy: null, lock: null });
  } finally { config.permastore.driver = 'none'; }
});

test('offers made: payment and refund transaction hashes are exposed so the bidder can verify them on the explorer', async () => {
  const mine = (await call('GET', '/me/offers/made', null, T.B)).offers;
  const refunded = mine.filter((o) => ['cancelled', 'rejected', 'expired', 'refunded'].includes(o.status));
  assert.ok(refunded.length > 0, 'expected at least one refunded offer');
  for (const o of refunded) { assert.ok(o.refundSignature, `offer ${o.id} (${o.status}) has no refundSignature`); assert.ok(o.paymentSignature, `offer ${o.id} has no paymentSignature`); }
});

test('likes work without a wallet (anonymous visitor id) and count towards the artwork', async () => {
  const vid = 'visitor_abcdefghijklmnop1234';
  const likeAs = (id, item = '2') => fetch(`${base}/items/${item}/like`, { method: 'POST', headers: { 'x-visitor-id': id } }).then((r) => r.json());
  const before = (await call('GET', '/items/2')).item.likes;
  assert.equal((await likeAs(vid)).liked, true);
  invalidateCatalog();
  assert.equal((await call('GET', '/items/2')).item.likes, before + 1);
  const mine = await fetch(`${base}/likes/mine`, { headers: { 'x-visitor-id': vid } }).then((r) => r.json());
  assert.ok(mine.itemIds.includes('2'));
  assert.equal((await likeAs(vid)).liked, false); // toggles back
  assert.equal((await fetch(`${base}/items/2/like`, { method: 'POST' })).status, 400); // no id at all
  assert.equal((await fetch(`${base}/items/2/like`, { method: 'POST', headers: { 'x-visitor-id': 'short' } })).status, 400); // junk id
});

test('admin panel password login: right password -> admin token; wrong password / no token -> refused', async () => {
  const bad1 = await call('POST', '/auth/admin-login', { password: 'nope' });
  assert.equal(bad1.status, 401);
  const ok = await call('POST', '/auth/admin-login', { password: 'test-admin-pw' });
  assert.equal(ok.status, 200); assert.equal(ok.admin, true);
  assert.equal((await call('GET', '/admin/stats', null, ok.token)).status, 200);
  assert.equal((await call('GET', '/admin/stats')).status, 401);
  assert.equal((await call('GET', '/admin/stats', null, T.B)).status, 403); // a normal wallet is still not admin
});
