// The single platform wallet: bookkeeping that separates USER FUNDS IN ESCROW from PLATFORM REVENUE.
// On-chain the vault is one address; in the database we always know how much of its balance belongs to bidders.
import { col, inc, now, runTx, getDoc } from '../lib/db.js';
import { chain } from './chain/index.js';
import { getSettings } from './settings.service.js';
import { bad, conflict } from '../lib/errors.js';

const statsRef = () => col('vault').doc('stats');

/** Use inside a transaction. Adds ledger rows + counter deltas. deltas: {escrow, revenue, devFees} (lamports, signed) */
// currency 'gtamarket': amounts are token base units and are tracked in their own counters (tokenEscrow / tokenRevenue / tokenPool),
// so SOL and token bookkeeping can never be mixed up. deltas.pool = the fee pool (held for the holders, not platform revenue).
export function ledgerInTx(tx, { type, lamports, ref = {}, wallet = null, deltas = {}, currency = 'sol' }) {
  const tok = currency === 'gtamarket';
  tx.set(col('ledger').doc(), { type, lamports, wallet, ref, ...(tok ? { currency } : {}), createdAt: now() });
  const patch = {};
  if (deltas.escrow) patch[tok ? 'tokenEscrow' : 'escrowLamports'] = inc(deltas.escrow);
  if (deltas.revenue) patch[tok ? 'tokenRevenue' : 'revenueLamports'] = inc(deltas.revenue);
  if (deltas.pool) patch[tok ? 'tokenPool' : 'poolLamports'] = inc(deltas.pool);
  if (deltas.devFees) patch[tok ? 'tokenDevFees' : 'devFeeLamports'] = inc(deltas.devFees);
  if (Object.keys(patch).length) tx.set(statsRef(), patch, { merge: true });
}

export async function getVaultReport() {
  const s = (await getDoc('vault', 'stats')) || {};
  const settings = await getSettings();
  const escrow = s.escrowLamports || 0, revenue = s.revenueLamports || 0, pool = s.poolLamports || 0;
  const onchain = await chain.getBalance(chain.vaultAddress);
  const reserve = settings.vaultReserveLamports;
  return {
    address: chain.vaultAddress,
    onchainLamports: onchain,
    escrowLamports: escrow, // belongs to bidders (active offers)
    revenueLamports: revenue, // belongs to the platform
    poolLamports: pool, // belongs to the holders (fee pool), paid out when the round ends
    token: { escrow: s.tokenEscrow || 0, revenue: s.tokenRevenue || 0, pool: s.tokenPool || 0 }, // $GTAMARKET base units
    devFeeLamports: s.devFeeLamports || 0,
    reserveLamports: reserve,
    solvent: onchain >= escrow + pool + reserve,
    withdrawableLamports: Math.max(0, Math.min(revenue, onchain - escrow - pool - reserve)),
    unexplainedLamports: onchain - escrow - revenue - pool // should hover near 0 (+ rent/fees). Large positive = deposits we never saw.
  };
}

/** Queue a revenue withdrawal (never touches escrowed bidder funds). */
export async function withdrawRevenue({ to, lamports, by }) {
  const report = await getVaultReport();
  if (lamports > report.withdrawableLamports) throw bad('exceeds_withdrawable', `Max withdrawable right now is ${report.withdrawableLamports} lamports`);
  const ref = col('payouts').doc();
  await runTx(async (tx) => {
    const s = await tx.get(statsRef());
    const revenue = s.exists ? s.data().revenueLamports || 0 : 0;
    if (lamports > revenue) throw conflict('exceeds_revenue', 'Not enough revenue recorded');
    tx.set(ref, { type: 'revenue_withdraw', to, lamports, status: 'queued', attempts: 0, ref: { by }, createdAt: now(), updatedAt: now() });
    ledgerInTx(tx, { type: 'revenue_withdraw', lamports: -lamports, wallet: to, ref: { payoutId: ref.id, by }, deltas: { revenue: -lamports } });
  });
  return { payoutId: ref.id };
}

/** Sales split: half of the platform's sale fee goes to the collection's creator (paid out by the payouts job).
 * Use inside a transaction AFTER all reads. creator = the launch wallet, or null for platform pieces. */
export const CREATOR_FEE_SHARE_BPS = 5000;
/** The platform's half goes to the holder fee pool (when enabled) instead of platform revenue. currency: 'sol' (lamports) | 'gtamarket' (token units). */
export function saleFeeSplitInTx(tx, { saleFee, seller, creator, platformWallet, ref, payoutId, currency = 'sol', toPool = false }) {
  const share = creator && creator !== platformWallet ? Math.floor((saleFee * CREATOR_FEE_SHARE_BPS) / 10000) : 0;
  const rest = saleFee - share, tok = currency === 'gtamarket';
  if (toPool && rest > 0) {
    ledgerInTx(tx, { type: 'sale_fee_pool', lamports: rest, wallet: seller, ref, currency, deltas: { pool: rest } });
    tx.set(col('feepool').doc('current'), { [tok ? 'tokenUnits' : 'lamports']: inc(rest), sales: inc(1) }, { merge: true });
  } else {
    ledgerInTx(tx, { type: 'sale_fee', lamports: rest, wallet: seller, ref, currency, deltas: { revenue: rest } });
  }
  if (share > 0) {
    ledgerInTx(tx, { type: 'creator_owed', lamports: share, wallet: creator, ref: { ...ref, kind: 'sale_fee_share' }, currency, deltas: { escrow: share } });
    tx.set(col('payouts').doc(payoutId), { type: 'creator_payout', to: creator, lamports: share, ...(tok ? { currency } : {}), status: 'queued', attempts: 0, ref: { ...ref, kind: 'sale_fee_share' }, createdAt: now(), updatedAt: now() });
  }
  return share;
}
