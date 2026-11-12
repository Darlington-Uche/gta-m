export const LAMPORTS_PER_SOL = 1_000_000_000;
export const usdToLamportsCeil = (usd, solUsd) => Math.ceil((usd / solUsd) * LAMPORTS_PER_SOL);
export const usdToLamportsFloor = (usd, solUsd) => Math.floor((usd / solUsd) * LAMPORTS_PER_SOL);
export const lamportsToUsd = (l, solUsd) => Math.round((l / LAMPORTS_PER_SOL) * solUsd * 100) / 100;
export const lamportsToSol = (l) => l / LAMPORTS_PER_SOL;
export const feeOf = (lamports, bps) => Math.floor((lamports * bps) / 10_000);
export const roundUsd = (n) => Math.round(n * 100) / 100;
