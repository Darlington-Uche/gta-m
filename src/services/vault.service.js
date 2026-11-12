// The single platform wallet: bookkeeping that separates USER FUNDS IN ESCROW from PLATFORM REVENUE.
// On-chain the vault is one address; in the database we always know how much of its balance belongs to bidders.
import { col, inc, now, runTx, getDoc } from '../lib/db.js';
import { chain } from './chain/index.js';
import { getSettings } from './settings.service.js';
import { bad, conflict } from '../lib/errors.js';

const statsRef = () => col('vault').doc('stats');

/** Use inside a transaction. Adds ledger rows + counter deltas. deltas: {escrow, revenue, devFees} (lamports, signed) */
export function ledgerInTx(tx, { type, lamports, ref = {}, wallet = null, deltas = {} }) {
  tx.set(col('ledger').doc(), { type, lamports, wallet, ref, createdAt: now() });
  const patch = {};
  if (deltas.escrow) patch.escrowLamports = inc(deltas.escrow);
  if (deltas.revenue) patch.revenueLamports = inc(deltas.revenue);
  if (deltas.devFees) patch.devFeeLamports = inc(deltas.devFees);
  if (Object.keys(patch).length) tx.set(statsRef(), patch, { merge: true });
}

export async function getVaultReport() {
  const s = (await getDoc('vault', 'stats')) || {};
  const settings = await getSettings();
  const escrow = s.escrowLamports || 0, revenue = s.revenueLamports || 0;
  const onchain = await chain.getBalance(chain.vaultAddress);
  const reserve = settings.vaultReserveLamports;
  return {
    address: chain.vaultAddress,
    onchainLamports: onchain,
    escrowLamports: escrow, // belongs to bidders (active offers)
    revenueLamports: revenue, // belongs to the platform
    devFeeLamports: s.devFeeLamports || 0,
    reserveLamports: reserve,
    solvent: onchain >= escrow + reserve,
    withdrawableLamports: Math.max(0, Math.min(revenue, onchain - escrow - reserve)),
    unexplainedLamports: onchain - escrow - revenue // should hover near 0 (+ rent/fees). Large positive = deposits we never saw.
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
