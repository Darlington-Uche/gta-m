// Fee-pool payout maths: pure functions, no I/O (unit-tested in test/poolmath.test.js).
/** Pure maths of a payout (no I/O, unit-testable). Returns who gets what and what rolls over. */
export function planDistribution({ lamports = 0, tokenUnits = 0, tokenHolders = [], nftHolders = [], fp, gtaUsd = null, decimals = 6 }) {
  const tokenBps = Math.max(0, Math.min(10_000, fp.tokenShareBps ?? 7000));
  const minSol = fp.minPayoutLamports ?? 1_000_000;
  const minTok = gtaUsd ? Math.ceil(((fp.minPayoutUsd ?? 0.05) / gtaUsd) * 10 ** decimals) : Infinity; // no token price -> nothing is sent, it all rolls over
  const out = new Map(); // wallet -> { lamports, units, kinds:Set }
  const give = (wallet, key, amt, kind) => { const o = out.get(wallet) || { lamports: 0, units: 0, kinds: new Set() }; o[key] += amt; o.kinds.add(kind); out.set(wallet, o); };

  const run = (pool, key, min) => {
    if (!(pool > 0)) return;
    let tPart = Math.floor((pool * tokenBps) / 10_000), nPart = pool - tPart;
    if (!tokenHolders.length) { nPart += tPart; tPart = 0; }
    if (!nftHolders.length) { tPart += nPart; nPart = 0; }
    const split = (part, rows, w, kind) => {
      const sum = rows.reduce((a, r) => a + w(r), 0);
      if (!(part > 0) || !(sum > 0)) return;
      for (const r of rows) { const amt = Math.floor((part * w(r)) / sum); if (amt >= min) give(r.wallet, key, amt, kind); }
    };
    split(tPart, tokenHolders, (r) => r.units, 'token');
    split(nPart, nftHolders, (r) => r.count, 'nft');
  };
  run(lamports, 'lamports', minSol);
  run(tokenUnits, 'units', minTok);

  const payouts = [...out.entries()].map(([wallet, o]) => ({ wallet, lamports: o.lamports, units: o.units, kinds: [...o.kinds] }))
    .sort((a, b) => (b.lamports - a.lamports) || (b.units - a.units) || (a.wallet < b.wallet ? -1 : 1));
  const paidLamports = payouts.reduce((a, p) => a + p.lamports, 0), paidUnits = payouts.reduce((a, p) => a + p.units, 0);
  return { payouts, paidLamports, paidUnits, carryLamports: lamports - paidLamports, carryUnits: tokenUnits - paidUnits };
}

