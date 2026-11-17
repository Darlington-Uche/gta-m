# Frontend integration

All money actions follow **prepare → sign → submit**.

## 1. Sign in with a wallet
```js
const API = 'https://your-api.up.railway.app';
const wallet = window.solana; // Phantom
const { publicKey } = await wallet.connect();
const pk = publicKey.toString();

const { message, nonce } = await (await fetch(`${API}/auth/nonce`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ wallet: pk })
})).json();

const { signature } = await wallet.signMessage(new TextEncoder().encode(message), 'utf8');
const { token } = await (await fetch(`${API}/auth/verify`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ wallet: pk, nonce, signature: bs58.encode(signature) })
})).json();
localStorage.setItem('jwt', token);
```
(`/auth/nonce` returns the message to sign; confirm exact field names in `docs/API.md` / by logging the response.)

## 2. Prepare → sign → submit
```js
import { VersionedTransaction } from '@solana/web3.js';

const H = () => ({ 'content-type': 'application/json', authorization: 'Bearer ' + localStorage.getItem('jwt') });

async function runAction(path, body = {}) {
  // prepare
  const prep = await (await fetch(API + path, { method: 'POST', headers: H(), body: JSON.stringify(body) })).json();
  // prep contains { ptxId, txB64, ... }
  const tx = VersionedTransaction.deserialize(Uint8Array.from(atob(prep.txB64), c => c.charCodeAt(0)));
  const signed = await window.solana.signTransaction(tx);
  const signedTx = btoa(String.fromCharCode(...signed.serialize()));
  // submit
  return (await fetch(API + '/tx/submit', { method: 'POST', headers: H(), body: JSON.stringify({ ptxId: prep.ptxId, signedTx }) })).json();
}

await runAction('/items/a1/mint');            // free or paid mint
```
If `tx.status` is `"sent"`, poll `GET /tx/:ptxId` until `confirmed`.
Offers, accepting offers and listing use the same helper with their routes from `docs/API.md`.

## 3. Reads
- `GET /items` (filters: era, category, status, owner, sort...) and `GET /items/:id`
- `GET /me/nfts` owned NFTs (`POST /me/nfts/sync` re-checks on-chain), `GET /me/offers/received`, `GET /me/notifications`
- Store `API` in one config constant; the response shapes are listed in `docs/API.md`.
