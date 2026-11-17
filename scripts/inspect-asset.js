// Reads a Metaplex Core NFT straight from the chain and checks that its metadata link actually opens.
//   node scripts/inspect-asset.js <assetAddress>
// Shows: the REAL owner wallet, the collection, the name and the metadata URI (and whether that URI loads).
import bs58 from 'bs58';
import { pathToFileURL } from 'node:url';

// Core AssetV1 layout: key u8 | owner 32 | updateAuthority (u8 tag, +32 bytes unless tag 0) | name (u32 len + utf8) | uri (u32 len + utf8)
export function decodeCore(b) {
  let o = 0; const key = b[o++]; const owner = bs58.encode(b.subarray(o, o + 32)); o += 32;
  const tag = b[o++]; let updateAuthority = null; if (tag !== 0) { updateAuthority = bs58.encode(b.subarray(o, o + 32)); o += 32; }
  const str = () => { const n = b.readUInt32LE(o); o += 4; const s = b.subarray(o, o + n).toString('utf8'); o += n; return s; };
  return { key, owner, updateAuthorityType: ['none', 'address', 'collection'][tag], updateAuthority, name: str(), uri: str() };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const asset = process.argv[2];
  if (!asset) { console.error('Usage: node scripts/inspect-asset.js <assetAddress>'); process.exit(1); }
  const { config } = await import('../src/config/index.js');
  const res = await fetch(config.rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getAccountInfo', params: [asset, { encoding: 'base64' }] }) }).then((r) => r.json());
  const v = res.result?.value;
  if (!v) { console.error(`✗ No account at ${asset} on ${config.network}. (${res.error?.message || 'not found'}) Wrong address or wrong NETWORK.`); process.exit(1); }
  const d = decodeCore(Buffer.from(v.data[0], 'base64'));
  console.log(`network:          ${config.network}`);
  console.log(`program owner:    ${v.owner}  ${v.owner === 'CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d' ? '(Metaplex Core ✓)' : '(NOT Metaplex Core!)'}`);
  console.log(`NFT OWNER WALLET: ${d.owner}`);
  console.log(`collection:       ${d.updateAuthorityType === 'collection' ? d.updateAuthority : '(' + d.updateAuthorityType + ')'}`);
  console.log(`name:             ${d.name}`);
  console.log(`metadata uri:     ${d.uri}`);
  try {
    const r = await fetch(d.uri, { signal: AbortSignal.timeout(15000) });
    const j = await r.json();
    console.log(`uri loads:        ✓ (HTTP ${r.status}) name="${j.name}" image=${j.image}`);
    const im = await fetch(j.image, { method: 'HEAD', signal: AbortSignal.timeout(15000) }).catch(() => null);
    console.log(`image loads:      ${im && im.ok ? '✓' : '✗ ' + (im ? 'HTTP ' + im.status : 'unreachable')}`);
  } catch (e) { console.log(`uri loads:        ✗ ${e.message}  <-- wallets cannot show name/image if this fails`); }
}
