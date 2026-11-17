import { config } from './config/index.js';
import { buildApp } from './app.js';
import { chain } from './services/chain/index.js';
import { liveCollections } from './services/collections.service.js';
import { startWorker } from './jobs/worker.js';
import { log } from './lib/logger.js';

await chain.init();
const live = await liveCollections().catch(() => []);
if (!live.length) log.warn('No live collections yet. Register one with `npm run collection:add -- --id vice --address <addr>` (minting stays disabled for that era until then).');

buildApp().listen(config.port, () => {
  log.info(`GTA Marketplace API on :${config.port}  network=${config.network}  chain=${chain.name}  db=${config.dbDriver}`);
  log.info(`vault=${chain.vaultAddress}  live collections: ${live.map((c) => c.id).join(', ') || '(none)'}`);
  if (config.isMainnet) log.warn('*** MAINNET: real funds ***');
  startWorker();
});
