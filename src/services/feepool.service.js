// Fee pool. The platform's half of every secondary-sale fee (SOL, and $GTAMARKET for sales paid in the token) is collected in the
// "current round" (feepool/current). When the round's timer ends, the pool is shared by
//   * the top $GTAMARKET holders (default 70%, split by how many tokens each holds), and
//   * the top NFT holders (default 30%, split by how many GTA Market NFTs each holds).
// Shares come out of the vault through the normal payout queue (idempotent, signature saved before broadcast).
// Anything too small to send (dust) or with nobody to receive it rolls into the next round.
import { col, now, queryDocs, runTx } from '../lib/db.js';
import { config } from '../config/index.js';
import { getSettings } from './settings.service.js';
import { chain } from './chain/index.js';
import { ledgerInTx } from './vault.service.js';
import { getGtaUsd, gtaConfig, topTokenHolders } from './gtamarket.service.js';
import { getSolUsd } from './priceOracle.js';
import { LAMPORTS_PER_SOL } from '../lib/money.js';
import { log } from '../lib/logger.js';
import { planDistribution } from '../lib/poolmath.js';
export { planDistribution };

const HOUR = 3_600_000;
const roundMs = (fp) => Math.max(1, Number(fp.roundHours) || 24) * HOUR;
const idOf = (startsAt, ms) => `r${Math.floor(startsAt / ms)}`;

/** The open round; created on first use (aligned to the round length so the timer is the same for everyone). */
export async function ensureRound(fp) {
  const ms = roundMs(fp), ref = col('feepool').doc('current');
  return runTx(async (tx) => {
    const s = await tx.get(ref);
    const cur = s.exists ? s.data() : {};
    if (cur.roundId && cur.endsAt) return cur;
    const startsAt = Math.floor(now() / ms) * ms;
    const next = { ...cur, roundId: idOf(startsAt, ms), startsAt, endsAt: startsAt + ms, lamports: cur.lamports || 0, tokenUnits: cur.tokenUnits || 0, sales: cur.sales || 0 };
    tx.set(ref, next);
    return next;
  });
}

/** Top NFT holders: wallets holding the most minted GTA Market NFTs (platform / vault / excluded wallets skipped). */
export async function topNftHolders(limit = 10) {
  const s = await getSettings();
  const skip = new Set([chain.vaultAddress, chain.authorityAddress, config.auth.platformWallet, ...(s.feePool?.excludeWallets || [])].filter(Boolean));
  const items = await queryDocs(col('items'));
  const n = new Map();
  for (const i of items) if (i.status === 'minted' && i.owner && !i.platformOwned && !skip.has(i.owner)) n.set(i.owner, (n.get(i.owner) || 0) + 1);
  return [...n.entries()].map(([wallet, count]) => ({ wallet, count })).sort((a, b) => b.count - a.count || (a.wallet < b.wallet ? -1 : 1)).slice(0, limit);
}

/** Worker job: when the timer has run out, snapshot the holders, queue the payouts and open the next round. */
export async function closeRoundIfDue() {
  const settings = await getSettings(), fp = settings.feePool;
  if (!fp || !fp.enabled) return 'disabled';
  const cur = await ensureRound(fp);
  if (now() < cur.endsAt) return 'open';

  const gta = await gtaConfig();
  let tokenHolders = [], nftHolders;
  try {
    [tokenHolders, nftHolders] = await Promise.all([gta.enabled ? topTokenHolders(fp.topTokenHolders || 10) : [], topNftHolders(fp.topNftHolders || 10)]);
  } catch (e) { log.warn('fee pool: could not read holders, will retry: ' + e.message); return 'holders_unavailable'; }
  const [solUsd, gtaUsd] = await Promise.all([getSolUsd().catch(() => null), gta.enabled ? getGtaUsd().catch(() => null) : null]);
  const plan = planDistribution({ lamports: cur.lamports || 0, tokenUnits: cur.tokenUnits || 0, tokenHolders, nftHolders, fp, gtaUsd, decimals: gta.decimals });
  const ms = roundMs(fp);

  return runTx(async (tx) => {
    const ref = col('feepool').doc('current');
    const s = await tx.get(ref), live = s.data();
    if (!live || live.roundId !== cur.roundId) return 'already_closed'; // another worker got there first
    // sales that landed while we were reading (live.* may be bigger than cur.*): they are not in the plan, so they roll over
    const extraL = (live.lamports || 0) - (cur.lamports || 0), extraU = (live.tokenUnits || 0) - (cur.tokenUnits || 0);
    const startsAt = Math.floor(now() / ms) * ms;
    plan.payouts.forEach((p, i) => {
      if (p.lamports > 0) {
        tx.set(col('payouts').doc(`pool_${cur.roundId}_sol_${i}`), { type: 'pool_payout', to: p.wallet, lamports: p.lamports, status: 'queued', attempts: 0, ref: { roundId: cur.roundId, kinds: p.kinds }, createdAt: now(), updatedAt: now() });
        ledgerInTx(tx, { type: 'pool_owed', lamports: p.lamports, wallet: p.wallet, ref: { roundId: cur.roundId }, deltas: { pool: -p.lamports, escrow: p.lamports } });
      }
      if (p.units > 0) {
        tx.set(col('payouts').doc(`pool_${cur.roundId}_gta_${i}`), { type: 'pool_payout', currency: 'gtamarket', decimals: gta.decimals, to: p.wallet, lamports: p.units, status: 'queued', attempts: 0, ref: { roundId: cur.roundId, kinds: p.kinds }, createdAt: now(), updatedAt: now() });
        ledgerInTx(tx, { type: 'pool_owed', lamports: p.units, wallet: p.wallet, ref: { roundId: cur.roundId }, currency: 'gtamarket', deltas: { pool: -p.units, escrow: p.units } });
      }
    });
    tx.set(col('feerounds').doc(cur.roundId), {
      roundId: cur.roundId, startsAt: cur.startsAt, endsAt: cur.endsAt, closedAt: now(), sales: cur.sales || 0,
      lamports: cur.lamports || 0, tokenUnits: cur.tokenUnits || 0, paidLamports: plan.paidLamports, paidUnits: plan.paidUnits,
      carryLamports: plan.carryLamports, carryUnits: plan.carryUnits, solUsd, gtaUsd, decimals: gta.decimals,
      recipients: plan.payouts.map((p) => ({ wallet: p.wallet, lamports: p.lamports, units: p.units, kinds: p.kinds }))
    });
    tx.set(ref, { roundId: idOf(startsAt, ms), startsAt, endsAt: startsAt + ms, lamports: plan.carryLamports + extraL, tokenUnits: plan.carryUnits + extraU, sales: 0 });
    return { closed: cur.roundId, paid: plan.payouts.length, lamports: plan.paidLamports, units: plan.paidUnits };
  });
}

/** What the home page shows: the pool so far, the timer, the split, and the last payout. */
export async function publicPool() {
  const settings = await getSettings(), fp = settings.feePool || {};
  if (!fp.enabled) return { enabled: false };
  const cur = await ensureRound(fp);
  const gta = await gtaConfig();
  const [solUsd, gtaUsd, last] = await Promise.all([
    getSolUsd().catch(() => null), gta.enabled ? getGtaUsd().catch(() => null) : null,
    queryDocs(col('feerounds')).then((r) => r.sort((a, b) => b.closedAt - a.closedAt)[0] || null)
  ]);
  const sol = (cur.lamports || 0) / LAMPORTS_PER_SOL, tokens = (cur.tokenUnits || 0) / 10 ** gta.decimals;
  const usd = (solUsd ? sol * solUsd : 0) + (gtaUsd ? tokens * gtaUsd : 0);
  return {
    enabled: true, roundId: cur.roundId, startsAt: cur.startsAt, endsAt: cur.endsAt, sales: cur.sales || 0,
    sol, lamports: cur.lamports || 0, tokens, tokenUnits: cur.tokenUnits || 0, usd: Math.round(usd * 100) / 100, symbol: gta.symbol,
    split: { tokenBps: fp.tokenShareBps ?? 7000, nftBps: fp.nftShareBps ?? 3000, topTokenHolders: fp.topTokenHolders || 10, topNftHolders: fp.topNftHolders || 10 },
    last: last ? { roundId: last.roundId, at: last.closedAt, sol: last.paidLamports / LAMPORTS_PER_SOL, tokens: last.paidUnits / 10 ** (last.decimals || 6), recipients: (last.recipients || []).length } : null
  };
}

/** Recent payouts for the "Live trades" ticker. */
export async function recentDistributions(limit = 5) {
  const rows = (await queryDocs(col('feerounds'))).filter((r) => (r.recipients || []).length).sort((a, b) => b.closedAt - a.closedAt).slice(0, limit);
  return rows.map((r) => ({
    type: 'distribution', roundId: r.roundId, at: r.closedAt, recipients: r.recipients.length,
    sol: r.paidLamports / LAMPORTS_PER_SOL, tokens: r.paidUnits / 10 ** (r.decimals || 6), top: r.recipients[0]?.wallet || null,
    usd: Math.round(((r.solUsd ? (r.paidLamports / LAMPORTS_PER_SOL) * r.solUsd : 0) + (r.gtaUsd ? (r.paidUnits / 10 ** (r.decimals || 6)) * r.gtaUsd : 0)) * 100) / 100
  }));
}
