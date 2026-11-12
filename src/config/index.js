// Central configuration. ONE switch controls everything: NETWORK=devnet | mainnet-beta
// Per-network values are read as <NAME>_DEVNET / <NAME>_MAINNET first, then <NAME>.
import 'dotenv/config'; // aliased to a stub in the Edge Function build

const NETWORKS = {
  devnet: { name: 'devnet', rpc: 'https://api.devnet.solana.com', explorerSuffix: '?cluster=devnet', suffix: 'DEVNET' },
  'mainnet-beta': { name: 'mainnet-beta', rpc: 'https://api.mainnet-beta.solana.com', explorerSuffix: '', suffix: 'MAINNET' }
};

const env = globalThis.__GTA_ENV || process.env; // the Edge build supplies a merged, writable env object
const networkName = env.NETWORK || 'devnet';
const net = NETWORKS[networkName];
if (!net) throw new Error(`NETWORK must be "devnet" or "mainnet-beta" (got "${networkName}")`);

const pick = (name, fallback) => env[`${name}_${net.suffix}`] ?? env[name] ?? fallback;
const bool = (v, d = false) => (v == null || v === '' ? d : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase()));
const num = (v, d) => (v == null || v === '' ? d : Number(v));
const list = (v) => (v ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : []);

const chainDriver = env.CHAIN_DRIVER || 'solana'; // 'solana' | 'mock'
const dbDriver = env.DB_DRIVER || 'firestore'; // 'firestore' | 'supabase' | 'memory' | 'pglite' (tests)

// Safety rail: mainnet only boots when explicitly confirmed.
if (net.name === 'mainnet-beta' && chainDriver === 'solana' && env.MAINNET_CONFIRM !== 'I_UNDERSTAND') {
  throw new Error('Refusing to start on mainnet-beta. Set MAINNET_CONFIRM=I_UNDERSTAND once you have tested on devnet.');
}

export const config = {
  env: env.NODE_ENV || 'development',
  port: num(env.PORT, 8080),
  publicBaseUrl: (env.PUBLIC_BASE_URL || `http://localhost:${num(env.PORT, 8080)}`).replace(/\/$/, ''),
  corsOrigins: list(env.CORS_ORIGINS), // empty = allow all (dev)
  assetsBaseUrl: (env.ASSETS_BASE_URL || '').replace(/\/$/, ''), // where the frontend's /assets/art/aN.png live
  // Permanent NFT storage. 'irys' = upload image + metadata to Arweave (via Irys) when someone mints; the minter pays the fee.
  // 'none' = NFT metadata is served by this API (metadata/:id.json) and images stay on ASSETS_BASE_URL. 'mock' = tests/demo.
  permastore: { driver: env.PERMASTORE || (chainDriver === 'solana' ? 'irys' : 'none'), maxLamports: num(env.PERMASTORE_MAX_LAMPORTS, 20_000_000), maxImageBytes: 15 * 1024 * 1024 },

  network: net.name,
  isMainnet: net.name === 'mainnet-beta',
  explorerSuffix: net.explorerSuffix,
  rpcUrl: pick('RPC_URL', net.rpc),
  dasEnabled: bool(pick('DAS_ENABLED'), false), // true when RPC supports DAS (Helius etc.)

  chainDriver,
  dbDriver,
  // Firestore collections are prefixed per network so devnet test data never mixes with mainnet.
  dbPrefix: env.DB_PREFIX ?? (dbDriver === 'memory' || dbDriver === 'pglite' ? 'mem_' : `${net.suffix.toLowerCase()}_`),

  wallets: {
    vaultSecret: pick('VAULT_SECRET_KEY'), // the single platform wallet (escrow + revenue + payouts)
    authoritySecret: pick('COLLECTION_AUTHORITY_SECRET_KEY'), // optional, defaults to vault key
  },

  nftSymbolName: env.COLLECTION_NAME || 'GTA Marketplace',
  priceOracle: {
    fixedSolUsd: env.FIXED_SOL_USD ? Number(env.FIXED_SOL_USD) : null, // handy for devnet testing
    maxStaleMs: num(env.PRICE_MAX_STALE_MS, 10 * 60 * 1000)
  },

  auth: {
    jwtSecret: env.JWT_SECRET || (env.NODE_ENV === 'production' ? null : 'dev-secret-change-me'),
    jwtTtl: env.JWT_TTL || '7d',
    nonceTtlMs: 5 * 60 * 1000,
    adminWallets: list(env.ADMIN_WALLETS),
    adminPassword: env.ADMIN_PASSWORD || null // enables the password login used by the admin panel (POST /auth/admin-login)
  },

  firebase: {
    serviceAccountBase64: env.FIREBASE_SERVICE_ACCOUNT_BASE64, // base64 of the service-account JSON (Railway friendly)
    serviceAccountJson: env.FIREBASE_SERVICE_ACCOUNT_JSON,
    storageBucket: env.FIREBASE_STORAGE_BUCKET
  },
  supabase: { dbUrl: env.SUPABASE_DB_URL, url: (env.SUPABASE_URL || '').replace(/\/$/, ''), serviceKey: env.SUPABASE_SERVICE_ROLE_KEY, bucket: env.STORAGE_BUCKET || 'gta-art' },
  storageDriver: env.STORAGE_DRIVER || (env.FIREBASE_STORAGE_BUCKET ? 'firebase' : 'local'),

  txPollMs: num(env.TX_POLL_MS, 1000), // how often we ask the chain "did it land?" while a request waits
  jobs: { enabled: bool(env.RUN_JOBS, true), intervalMs: num(env.JOBS_INTERVAL_MS, 15000), cronSecret: env.CRON_SECRET || null },
  rateLimit: { windowMs: 60_000, max: num(env.RATE_LIMIT_PER_MIN, 240), authMax: num(env.AUTH_RATE_LIMIT_PER_MIN, 20) }
};

if (!config.auth.jwtSecret) throw new Error('JWT_SECRET is required in production');

// Defaults for runtime settings. Admin can change these live (stored in Firestore: config/settings).
export const SETTINGS_DEFAULTS = {
  mintingEnabled: true, // kill switches
  tradingEnabled: true,
  saleFeeBps: 250, // 2.5% platform fee on secondary sales (stays in the vault wallet)
  acceptFeeUsd: 0.3, // ~"gas" fee paid by the seller into the vault (platform revenue) on every secondary sale
  minOfferUsd: 1,
  maxActiveOffersPerItem: 50,
  offerTtlHours: 72,
  maxFreeMintsPerWallet: 3,
  bidWindow: { enabled: false, openMinutes: 120, cycleMinutes: 360 }, // offers only accepted 2h out of every 6h when enabled
  vaultReserveLamports: 10_000_000, // never withdraw below this (rent / fees buffer)
  // Site content managed from the admin website (banners, hero text, announcement). Empty = the frontend shows its built-in placeholders.
  site: { heroImage: '', heroTitle: '', heroSubtitle: '', announcement: '', banners: { explore: '', eras: '', create: '' } }
};

export const NETWORK_LIST = Object.keys(NETWORKS);
