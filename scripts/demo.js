// One-command offline demo: mock chain + in-memory database, seeded from the frontend, every collection live,
// fake test wallets with free SOL. Nothing touches a real network. Data resets when you stop it.
//   npm run demo -- --source ../gta-marketplace/js/data.js --frontend http://localhost:5500
//   then set API_URL to http://localhost:8080 in the frontend's js/config.js
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : d; }; // no _env.js import: config must load AFTER the env below
Object.assign(process.env, { CHAIN_DRIVER: 'mock', DB_DRIVER: 'memory', NETWORK: 'devnet', RUN_JOBS: 'true', PERMASTORE: 'mock', JOBS_INTERVAL_MS: '3000', TX_POLL_MS: '300' });
process.env.FIXED_SOL_USD ||= '150';
process.env.JWT_SECRET ||= 'demo-secret';
process.env.ASSETS_BASE_URL = arg('frontend', process.env.ASSETS_BASE_URL || 'http://localhost:5500');
const { chain } = await import('../src/services/chain/index.js');
const { registerCollection, listCollections } = await import('../src/services/collections.service.js');
const { seedFromSource } = await import('../src/services/seed.service.js');
await chain.init();
const r = await seedFromSource(arg('source', '../gta-marketplace/js/data.js'));
for (const c of await listCollections()) await registerCollection({ id: c.id, address: (await chain.createCollection({ name: c.name || c.id })).address, by: 'demo' });
console.log(`Demo ready: ${r.made} artworks, ${(await listCollections()).length} live collections. Images load from ${process.env.ASSETS_BASE_URL}`);
await import('../src/server.js');
