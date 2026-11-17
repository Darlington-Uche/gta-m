// node scripts/generate-wallets.js        -> prints a fresh vault keypair. Nothing is saved to disk.
import nacl from 'tweetnacl';
import bs58 from 'bs58';
const make = () => { const k = nacl.sign.keyPair(); return { pub: bs58.encode(k.publicKey), secret: bs58.encode(k.secretKey) }; };
const v = make();
console.log(`
Paste into your .env (use DIFFERENT keys for devnet and mainnet — never reuse a devnet key on mainnet).
Run this twice: once for the _DEVNET values, once for the _MAINNET values.

VAULT_SECRET_KEY_DEVNET=${v.secret}

vault public address - fund it with devnet SOL (https://faucet.solana.com) AND use it as the updateAuthority when you create your collections:
${v.pub}


⚠  The vault secret controls ALL bidder escrow + revenue. Keep it only in Railway/host env vars. Never commit it.
`);
