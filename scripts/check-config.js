import { boot } from './_env.js';
import { col, now } from '../src/lib/db.js';
const { config, chain } = await boot();
const ok = (b) => (b ? '✅' : '❌');
console.log(`network        ${config.network}${config.isMainnet ? '  (REAL FUNDS)' : ''}\nchain driver   ${config.chainDriver}\ndb driver      ${config.dbDriver}  (collections prefixed "${config.dbPrefix}")\nrpc            ${config.rpcUrl}`);
try { await col('config').doc('_ping').set({ at: now() }); console.log(`${ok(true)} Firestore read/write`); } catch (e) { console.log(`${ok(false)} Firestore: ${e.message}`); }
console.log(`${ok(!!chain.vaultAddress)} vault        ${chain.vaultAddress}`);
console.log('   platform authority (collections must use this as updateAuthority): ' + chain.authorityAddress);
try { const { listCollections } = await import('../src/services/collections.service.js'); const rows = await listCollections(); const live = rows.filter((c) => c.status === 'live'); console.log(`${ok(live.length > 0)} collections   ${live.length} live / ${rows.length} registered  (${live.map((c) => c.id).join(', ') || 'none live'})`); } catch (e) { console.log(`${ok(false)} collections: ${e.message}`); }
try { const b = await chain.getBalance(chain.vaultAddress); console.log(`${ok(b > 20_000_000)} vault balance ${(b / 1e9).toFixed(4)} SOL`); } catch (e) { console.log(`${ok(false)} RPC: ${e.message}`); }
console.log(`${ok(config.auth.adminWallets.length > 0)} ADMIN_WALLETS ${config.auth.adminWallets.length} set`);
console.log(`${ok(!!config.assetsBaseUrl)} ASSETS_BASE_URL ${config.assetsBaseUrl || '(empty)'}`);
process.exit(0);
