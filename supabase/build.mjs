// Bundles the API into ONE file for a Supabase Edge Function: node supabase/build.mjs  ->  supabase/dist/index.ts
// App code is bundled + minified; npm packages stay external and are pinned as npm:<name>@<version> imports.
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { builtinModules } from 'node:module';

const root = path.resolve(import.meta.dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const stub = (name, body) => { const f = path.join(root, 'supabase', '.stubs', name); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, body); return f; };
const empty = stub('empty.js', 'export default {};');
const irys = stub('irys.js', "export const irysUploader = () => { throw new Error('Arweave/Irys uploads are disabled on the Edge build (PERMASTORE=none)'); };");
const alias = {
  'dotenv/config': empty, 'firebase-admin/app': empty, 'firebase-admin/auth': empty, 'firebase-admin/firestore': empty, 'firebase-admin/storage': empty,
  '@electric-sql/pglite': empty, '@metaplex-foundation/umi-uploader-irys': irys
};
const version = (name) => {
  try { return JSON.parse(fs.readFileSync(path.join(root, 'node_modules', name, 'package.json'), 'utf8')).version; }
  catch { return (pkg.dependencies[name] || '').replace(/^[\^~]/, ''); }
};
const aliasPlugin = { name: 'alias', setup(b) { b.onResolve({ filter: /.*/ }, (a) => (alias[a.path] ? { path: alias[a.path] } : undefined)); } };

const out = path.join(root, 'supabase', 'dist', 'index.js');
await build({
  entryPoints: [path.join(root, 'supabase', 'edge.js')], outfile: out, bundle: true, format: 'esm', platform: 'node', target: 'es2022',
  minify: true, legalComments: 'none', packages: 'external', plugins: [aliasPlugin], logLevel: 'warning'
});
let code = fs.readFileSync(out, 'utf8');
const builtins = new Set([...builtinModules, ...builtinModules.map((m) => 'node:' + m)]);
code = code.replace(/(?<![\w$.])(from|import)\s*\(?\s*(["'])((?:@[\w.-]+\/)?[\w.-]+(?:\/[\w./-]+)?)\2/g, (m, kw, q, spec) => {
  if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('npm:') || spec.startsWith('node:')) return m;
  if (builtins.has(spec)) return m.replace(spec, 'node:' + spec.replace(/^node:/, ''));
  const name = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
  const v = version(name);
  return m.replace(spec, `npm:${name}${v ? '@' + v : ''}${spec.slice(name.length)}`);
});
if (process.env.EDGE_CRON_SECRET) code = code.replaceAll('__CRON__', process.env.EDGE_CRON_SECRET);
else console.warn('! EDGE_CRON_SECRET not set: /jobs/run cron endpoint will have a placeholder secret');
fs.writeFileSync(path.join(root, 'supabase', 'dist', 'index.ts'), code);
fs.rmSync(out);
console.log('supabase/dist/index.ts', (code.length / 1024).toFixed(0) + ' KB');
