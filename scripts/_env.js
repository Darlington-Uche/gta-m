// Shared bootstrap for scripts: loads config, db and the chain driver.
import { config } from '../src/config/index.js';
import { chain } from '../src/services/chain/index.js';
export async function boot() {
  await chain.init();
  return { config, chain };
}
export const flag = (name) => process.argv.includes(`--${name}`);
export const arg = (name, d) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] : d; };
