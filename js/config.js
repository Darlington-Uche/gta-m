/* GTA Market — frontend config.
   API_URL: the backend (Vercel project "gta-api"). The network (devnet/mainnet) is decided by the backend's NETWORK env var; the site reads it from /meta. */
window.GTA_CONFIG = {
  API_URL: 'https://hxepgyobwvjzfuappzhf.supabase.co/functions/v1/gta-api',
  WEB3_CDN: 'https://unpkg.com/@solana/web3.js@1.98.0/lib/index.iife.min.js'
};
