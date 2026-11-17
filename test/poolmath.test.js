// Fee-pool payout maths. Pure, no dependencies:  node --test test/poolmath.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { planDistribution } from '../src/lib/poolmath.js';

const fp = { tokenShareBps: 7000, nftShareBps: 3000, minPayoutLamports: 1_000_000, minPayoutUsd: 0.05 };
const tok = [{ wallet: 'A', units: 600 }, { wallet: 'B', units: 300 }, { wallet: 'C', units: 100 }];
const nft = [{ wallet: 'B', count: 3 }, { wallet: 'D', count: 1 }];
const sum = (p) => p.payouts.reduce((a, x) => a + x.lamports, 0);

test('70/30 split, pro-rata, wallets in both groups get one combined payout', () => {
  const p = planDistribution({ lamports: 100_000_000, tokenHolders: tok, nftHolders: nft, fp });
  const by = Object.fromEntries(p.payouts.map((x) => [x.wallet, x.lamports]));
  assert.equal(by.A, 42_000_000);                       // 70M * 600/1000
  assert.equal(by.C, 7_000_000);                        // 70M * 100/1000
  assert.equal(by.B, 21_000_000 + 22_500_000);          // token 70M*300/1000 + nft 30M*3/4
  assert.equal(by.D, 7_500_000);                        // nft 30M*1/4
  assert.deepEqual(p.payouts.find((x) => x.wallet === 'B').kinds.sort(), ['nft', 'token']);
  assert.equal(p.paidLamports + p.carryLamports, 100_000_000);   // nothing is created or lost
  assert.ok(p.carryLamports >= 0 && p.carryLamports < 10);        // only rounding dust rolls over
});

test('no token holders -> the token share goes to NFT holders (and the other way round)', () => {
  const a = planDistribution({ lamports: 10_000_000, tokenHolders: [], nftHolders: nft, fp });
  assert.equal(sum(a), 10_000_000);
  const b = planDistribution({ lamports: 10_000_000, tokenHolders: tok, nftHolders: [], fp });
  assert.equal(sum(b) + b.carryLamports, 10_000_000);
});

test('nobody to pay -> everything rolls into the next round', () => {
  const p = planDistribution({ lamports: 5_000_000, tokenUnits: 777, tokenHolders: [], nftHolders: [], fp, gtaUsd: 0.001 });
  assert.equal(p.payouts.length, 0); assert.equal(p.carryLamports, 5_000_000); assert.equal(p.carryUnits, 777);
});

test('shares below the minimum are not sent, they roll over', () => {
  const p = planDistribution({ lamports: 2_000_000, tokenHolders: [{ wallet: 'A', units: 99 }, { wallet: 'Z', units: 1 }], nftHolders: [], fp });
  assert.deepEqual(p.payouts.map((x) => x.wallet), ['A']);       // Z's 20k lamports is dust
  assert.equal(p.paidLamports + p.carryLamports, 2_000_000);
});

test('token pool pays in token units and needs a price to size the minimum', () => {
  const ok = planDistribution({ tokenUnits: 1_000_000_000, tokenHolders: tok, nftHolders: nft, fp, gtaUsd: 0.00001, decimals: 6 });
  assert.equal(ok.paidUnits + ok.carryUnits, 1_000_000_000);
  assert.ok(ok.payouts.every((x) => x.lamports === 0));
  const noPrice = planDistribution({ tokenUnits: 1_000_000_000, tokenHolders: tok, nftHolders: nft, fp, gtaUsd: null });
  assert.equal(noPrice.payouts.length, 0); assert.equal(noPrice.carryUnits, 1_000_000_000);
});

test('never pays out more than the pool', () => {
  for (let n = 1; n < 300; n += 7) {
    const pool = n * 1_234_567;
    const p = planDistribution({ lamports: pool, tokenHolders: tok, nftHolders: nft, fp });
    assert.ok(p.paidLamports <= pool && p.carryLamports >= 0);
    assert.equal(p.paidLamports + p.carryLamports, pool);
  }
});
