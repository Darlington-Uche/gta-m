// $GTAMARKET — the platform's own token (pump.fun, Solana mainnet). Buyers can pay for mints and fixed-price buys in it instead of SOL.
//   * price: median of DexScreener + Jupiter (USD), cached 30s, last good value kept for a few minutes if both are down
//   * holders: top token holders read from the chain (used by the fee pool), bonding-curve / LP / program accounts excluded
import { config } from '../config/index.js';
import { getSettings } from './settings.service.js';
import { chain } from './chain/index.js';
import { conflict, unavailable } from '../lib/errors.js';
import { log } from '../lib/logger.js';

export const GTA = 'gtamarket';
export const isGta = (c) => c === GTA || c === 'gta';
export const normCurrency = (c) => (isGta(c) ? GTA : 'sol');

const TTL_MS = 30_000;
let cache = { price: null, at: 0 };
let inflight = null;

const get = async (url) => {
  const r = await fetch(url, { signal: AbortSignal.timeout(3500), headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error('http ' + r.status);
  return r.json();
};
const median = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export const gtaConfig = async () => {
  const s = await getSettings();
  const g = s.gtamarket || {};
  const live = config.isMainnet || !!config.priceOracle.fixedGtaUsd; // the real token only exists on mainnet; devnet testing needs FIXED_GTA_USD + a devnet mint in settings
  return { enabled: live && !!g.enabled && !!g.mint, mint: g.mint, decimals: g.decimals ?? 6, symbol: g.symbol || '$GTAMARKET', discountBps: g.discountBps || 0 };
};

async function fetchPrice(mint) {
  const sources = {
    dexscreener: async () => {
      const j = await get(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
      const pairs = (j.pairs || []).filter((p) => p.chainId === 'solana' && Number(p.priceUsd) > 0).sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
      if (!pairs.length) throw new Error('no pair');
      return Number(pairs[0].priceUsd);
    },
    jupiter: async () => { const j = await get(`https://lite-api.jup.ag/price/v3?ids=${mint}`); return Number(j[mint].usdPrice); }
  };
  const names = Object.keys(sources);
  const res = await Promise.allSettled(names.map((n) => sources[n]()));
  const prices = [];
  res.forEach((r, i) => { if (r.status === 'fulfilled' && r.value > 0 && Number.isFinite(r.value)) prices.push(r.value); else log.warn(`gtamarket price ${names[i]} failed: ${r.reason?.message || 'bad value'}`); });
  if (prices.length === 2 && Math.abs(prices[0] - prices[1]) / Math.min(...prices) > 0.25) return Math.min(...prices); // two sources disagree a lot: take the lower, so nobody pays less than it's worth
  return prices.length ? median(prices) : null;
}

/** USD price of ONE whole $GTAMARKET token. */
export async function getGtaUsd() {
  const cfg = await gtaConfig();
  if (!cfg.enabled) throw unavailable('$GTAMARKET payments are not enabled');
  const fixed = config.priceOracle.fixedGtaUsd;
  if (fixed) return fixed;
  const t = Date.now();
  if (cache.price && t - cache.at < TTL_MS) return cache.price;
  if (!inflight) inflight = fetchPrice(cfg.mint).finally(() => { inflight = null; });
  const p = await inflight;
  if (p) { cache = { price: p, at: Date.now() }; return p; }
  if (cache.price && t - cache.at < config.priceOracle.maxStaleMs) return cache.price;
  throw unavailable('$GTAMARKET price feed unavailable, try again shortly (or pay with SOL)');
}

/** Base units (smallest unit) of $GTAMARKET worth `usd`, rounded UP so the platform is never short. */
export async function quoteGtaUsd(usd) {
  const cfg = await gtaConfig();
  const price = await getGtaUsd();
  const disc = cfg.discountBps ? 1 - cfg.discountBps / 10_000 : 1; // optional "pay in $GTAMARKET, pay less"
  const units = usd > 0 ? Math.ceil(((usd * disc) / price) * 10 ** cfg.decimals) : 0;
  return { units, tokens: units / 10 ** cfg.decimals, gtaUsd: price, decimals: cfg.decimals, mint: cfg.mint, discountBps: cfg.discountBps };
}
export const unitsToUsd = (units, gtaUsd, decimals = 6) => Math.round((units / 10 ** decimals) * gtaUsd * 100) / 100;

/** Public info for the frontend (/meta). */
export async function gtaPublic() {
  const cfg = await gtaConfig();
  if (!cfg.enabled) return { enabled: false };
  const gtaUsd = await getGtaUsd().catch(() => null);
  return { enabled: true, mint: cfg.mint, decimals: cfg.decimals, symbol: cfg.symbol, gtaUsd, discountBps: cfg.discountBps };
}

/** Top holders of the token: [{ wallet, units }], largest first. Wallets only — pools, the bonding curve, programs and the platform's own wallets are skipped. */
export async function topTokenHolders(limit = 10) {
  const cfg = await gtaConfig();
  if (!cfg.enabled || typeof chain.getTokenHolders !== 'function') return [];
  const s = await getSettings();
  const skip = new Set([chain.vaultAddress, chain.authorityAddress, config.auth.platformWallet, ...(s.feePool?.excludeWallets || [])].filter(Boolean));
  const rows = await chain.getTokenHolders(cfg.mint, { max: Math.min(20, limit + skip.size + 8) });
  return rows.filter((r) => !skip.has(r.wallet)).slice(0, limit);
}

/** Quote + make sure the buyer actually holds enough tokens (a clear error beats a failed transaction). */
export async function requireGta(wallet, usd) {
  const q = await quoteGtaUsd(usd);
  const bal = await chain.getTokenBalance(wallet, q.mint);
  if (bal < q.units) throw conflict('not_enough_gta', `You need ${q.tokens.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${(await gtaConfig()).symbol} for this, your wallet has ${(bal / 10 ** q.decimals).toLocaleString('en-US', { maximumFractionDigits: 2 })}. Pay with SOL instead, or top up.`);
  return q;
}
