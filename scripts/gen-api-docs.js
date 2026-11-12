// Generates docs/API.md from the route tables in src/routes/*.routes.js
import fs from 'node:fs';
process.env.DB_DRIVER = 'memory'; process.env.CHAIN_DRIVER = 'mock';
const { groups } = await import('../src/routes/index.js');
const authLabel = { public: 'public', user: '🔑 user', admin: '🛡 admin', cron: '⏱ cron' };
const shape = (z) => {
  if (!z?.shape) return '';
  return Object.entries(z.shape).map(([k, v]) => `${k}${v.isOptional?.() ? '?' : ''}`).join(', ');
};
let md = `# GTA Marketplace API\n\n> Generated from \`src/routes/*.routes.js\` — run \`npm run docs\` to refresh.\n\nBase URL: \`/\` · JSON in/out · Auth: \`Authorization: Bearer <jwt>\` (from \`/auth/verify\`)\nEvery success response is \`{ ok: true, ... }\`; errors are \`{ ok: false, error: { code, message } }\`.\n\n`;
md += `## The transaction pattern (mint, offers, accept, list, buy)\n\n1. **Prepare** — call the action route (e.g. \`POST /items/:id/mint\`). You get \`{ ptxId, txB64, expiresAt, ... }\`.\n2. **Sign** — the wallet signs \`txB64\` (it is already partially signed by the platform).\n3. **Submit** — \`POST /tx/submit { ptxId, signedTx }\`. Returns \`tx.status: "confirmed"\` (or \`"sent"\` if the network is slow — poll \`GET /tx/:ptxId\`).\n\n`;
for (const g of groups) {
  md += `## ${g.group}\n\n| Method | Path | Auth | What it does |\n|---|---|---|---|\n`;
  for (const r of g.routes) md += `| \`${r.method.toUpperCase()}\` | \`${r.path}\` | ${authLabel[r.auth || 'public']} | ${r.summary}${r.body ? `<br>**body:** ${shape(r.body)}` : ''}${r.query ? `<br>**query:** ${shape(r.query)}` : ''} |\n`;
  md += '\n';
}
fs.mkdirSync('docs', { recursive: true });
fs.writeFileSync('docs/API.md', md);
console.log(`docs/API.md written (${groups.reduce((n, g) => n + g.routes.length, 0)} routes)`);
