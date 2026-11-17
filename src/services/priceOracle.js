// SOL/USD price. Several independent sources are asked in parallel; the MEDIAN of the ones that answer is used
// (a single bad/stale/rate-limited feed can't move the price). Cached 30s, shared between concurrent callers,
// and the last good value is served for up to priceOracle.maxStaleMs if every source is down.
import { config } from '../config/index.js';
import { unavailable } from '../lib/errors.js';
import { log } from '../lib/logger.js';

const PYTH_SOL_USD = '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d';
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const TTL_MS = 30_000;
let cache = { price: null, at: 0 };
let inflight = null;

const get = async (url) => {
  const r = await fetch(url, { signal: AbortSignal.timeout(3500), headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error('http ' + r.status);
  return r.json();
};

export const SOURCES = {
  pyth: async () => { const p = (await get(`https://hermes.pyth.network/v2/updates/price/latest?ids%5B%5D=${PYTH_SOL_USD}&parsed=true`)).parsed?.[0]?.price; return Number(p.price) * 10 ** Number(p.expo); },
  coinbase: async () => Number((await get('https://api.coinbase.com/v2/prices/SOL-USD/spot')).data.amount),
  kraken: async () => { const j = await get('https://api.kraken.com/0/public/Ticker?pair=SOLUSD'); return Number(Object.values(j.result)[0].c[0]); },
  jupiter: async () => Number((await get(`https://lite-api.jup.ag/price/v3?ids=${SOL_MINT}`))[SOL_MINT].usdPrice),
  coingecko: async () => Number((await get('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd')).solana.usd)
};

const median = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

async function fetchPrice() {
  const names = Object.keys(SOURCES);
  const res = await Promise.allSettled(names.map((n) => SOURCES[n]()));
  let prices = [];
  res.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value > 1 && r.value < 10_000) prices.push(r.value);
    else log.warn(`price source ${names[i]} failed: ${r.reason?.message || 'bad value'}`);
  });
  if (prices.length >= 3) { const m = median(prices); prices = prices.filter((p) => Math.abs(p - m) / m < 0.05); } // drop outliers
  return prices.length ? median(prices) : null;
}

export async function getSolUsd() {
  const fixed = config.priceOracle.fixedSolUsd;
  if (fixed) return fixed;
  const t = Date.now();
  if (cache.price && t - cache.at < TTL_MS) return cache.price;
  if (!inflight) inflight = fetchPrice().finally(() => { inflight = null; });
  const p = await inflight;
  if (p) { cache = { price: p, at: Date.now() }; return p; }
  if (cache.price && t - cache.at < config.priceOracle.maxStaleMs) return cache.price;
  throw unavailable('SOL price feed unavailable, try again shortly');
}
