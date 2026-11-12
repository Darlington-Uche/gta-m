// Entry point when the API runs as a Supabase Edge Function named "gta-api".
// The function URL is https://<ref>.supabase.co/functions/v1/gta-api/<route>; we strip the function name prefix.
import './env.js';
import express from 'express';
import { buildApp } from '../src/app.js';
import { chain } from '../src/services/chain/index.js';
import { log } from '../src/lib/logger.js';

await chain.init();
const outer = express();
outer.set('trust proxy', true);
outer.use((req, _res, next) => { req.url = req.url.replace(/^\/(functions\/v1\/)?gta-api/, '') || '/'; next(); });
outer.use(buildApp());
outer.listen(8000, () => log.info(`gta-api ready network=${chain.name} vault=${chain.vaultAddress}`));
