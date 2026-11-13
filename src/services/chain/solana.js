// Real Solana driver (CHAIN_DRIVER=solana). Metaplex Core NFTs, one platform "vault" wallet.
// Transactions are built server-side, partially signed by the platform, then signed by the user's wallet.
import crypto from 'node:crypto';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import {
  createNoopSigner, createSignerFromKeypair, generateSigner, lamports as umiLamports,
  publicKey, publicKeyBytes, signerIdentity, transactionBuilder
} from '@metaplex-foundation/umi';
import { transferSol } from '@metaplex-foundation/mpl-toolbox';
import { addPlugin, create, createCollection, fetchAsset, fetchCollection, mplCore, transfer } from '@metaplex-foundation/mpl-core';
import { irysUploader } from '@metaplex-foundation/umi-uploader-irys';
import { createGenericFile, sol as solAmount } from '@metaplex-foundation/umi';
import { config } from '../../config/index.js';
import { TxRejected } from './errors.js';

const sha256hex = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const ZERO_SIG = (s) => s.every((b) => b === 0);
// Wallets (Phantom, Backpack...) may add harmless instructions before signing (priority fee, Lighthouse guard). Nothing else is allowed.
const ALLOWED_EXTRA_PROGRAMS = new Set(['ComputeBudget111111111111111111111111111111', 'L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95']);
const fingerprints = (tx) => {
  const acc = tx.message.accounts.map((a) => a.toString());
  return tx.message.instructions.map((ix) => ({
    program: acc[ix.programIndex],
    hash: sha256hex(Buffer.from(JSON.stringify([acc[ix.programIndex], [...ix.accountIndexes].map((i) => acc[i]), Buffer.from(ix.data).toString('base64')])))
  }));
};

function parseSecret(raw, label) {
  if (!raw) throw new Error(`${label} is not set`);
  const t = raw.trim();
  try {
    if (t.startsWith('[')) return Uint8Array.from(JSON.parse(t));
    return bs58.decode(t);
  } catch (e) {
    throw new Error(`${label} is not valid (use base58 or a JSON byte array)`);
  }
}

export class SolanaChain {
  constructor() { this.name = 'solana'; }

  async init() {
    const umi = createUmi(config.rpcUrl, { commitment: 'confirmed' }).use(mplCore());
    this.umi = umi;
    const vaultKp = umi.eddsa.createKeypairFromSecretKey(parseSecret(config.wallets.vaultSecret, `VAULT_SECRET_KEY_${config.network === 'devnet' ? 'DEVNET' : 'MAINNET'}`));
    this.vaultSigner = createSignerFromKeypair(umi, vaultKp);
    umi.use(signerIdentity(this.vaultSigner));
    this.authoritySigner = config.wallets.authoritySecret
      ? createSignerFromKeypair(umi, umi.eddsa.createKeypairFromSecretKey(parseSecret(config.wallets.authoritySecret, 'COLLECTION_AUTHORITY_SECRET_KEY')))
      : this.vaultSigner;
    this.vaultAddress = this.vaultSigner.publicKey.toString();
    this.authorityAddress = this.authoritySigner.publicKey.toString();
    this.devAddress = this.vaultAddress; // platform fees land in the vault too
    return this;
  }
  _collection(address) {
    if (!address) throw new Error('collection address required');
    return { publicKey: publicKey(address), oracles: [], lifecycleHooks: [] };
  }
  /** Used when the admin registers a collection: it must exist and the platform authority must be able to mint into it. */
  async verifyCollection(address) {
    try {
      const c = await fetchCollection(this.umi, publicKey(address));
      const ua = c.updateAuthority.toString();
      if (ua !== this.authorityAddress) return { ok: false, reason: `Update authority of this collection is ${ua}, but the platform signs with ${this.authorityAddress}. Create the collection with that address as updateAuthority.` };
      return { ok: true, name: c.name };
    } catch (e) { return { ok: false, reason: 'Could not read that Core collection on ' + config.network + ': ' + e.message }; }
  }

  // ---- raw JSON-RPC helpers (version-proof) ----
  async rpc(method, params = []) {
    const res = await fetch(config.rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    const j = await res.json();
    if (j.error) throw new (method === 'sendTransaction' ? TxRejected : Error)(`RPC ${method}: ${j.error.message}${j.error.data?.logs ? ' | ' + j.error.data.logs.slice(-3).join(' / ') : ''}`);
    return j.result;
  }
  async getBlockHeight() { return this.rpc('getBlockHeight', [{ commitment: 'confirmed' }]); }
  async getBalance(addr) { return (await this.rpc('getBalance', [addr, { commitment: 'confirmed' }])).value; }
  async latestBlockhash() {
    const { value } = await this.rpc('getLatestBlockhash', [{ commitment: 'confirmed' }]);
    return { blockhash: value.blockhash, lastValidBlockHeight: value.lastValidBlockHeight };
  }

  // ---- reads ----
  async getAssetOwner(asset) {
    try { return (await fetchAsset(this.umi, publicKey(asset))).owner.toString(); } catch { return null; }
  }
  async getAssetOwners(list) {
    const out = new Map();
    for (let i = 0; i < list.length; i += 8) {
      await Promise.all(list.slice(i, i + 8).map(async (a) => out.set(a, await this.getAssetOwner(a))));
    }
    return out;
  }
  async assetExists(asset) { return (await this.getAssetOwner(asset)) != null; }
  async hasDelegate(asset, who) {
    try {
      const a = await fetchAsset(this.umi, publicKey(asset));
      const td = a.transferDelegate;
      return !!td && td.authority.type === 'Address' && td.authority.address?.toString() === who;
    } catch { return false; }
  }
  /** Needs a DAS-capable RPC (Helius etc). Returns null when unavailable so callers fall back to per-asset checks. */
  async listCollectionAssets(collection) {
    if (!config.dasEnabled || !collection) return null;
    const out = [];
    for (let page = 1; page < 200; page++) {
      const r = await this.rpc('getAssetsByGroup', { groupKey: 'collection', groupValue: collection, page, limit: 1000 });
      for (const it of r.items || []) out.push({ asset: it.id, owner: it.ownership?.owner });
      if (!r.items || r.items.length < 1000) break;
    }
    return out;
  }
  explorerTx(sig) { return `https://explorer.solana.com/tx/${sig}${config.explorerSuffix}`; }
  explorerAddress(a) { return `https://explorer.solana.com/address/${a}${config.explorerSuffix}`; }

  // ---- tx building ----
  async _finish(builder, feePayerSigner, extra = {}) {
    const bh = await this.latestBlockhash();
    const tx = await builder.setFeePayer(feePayerSigner).setBlockhash(bh).buildAndSign(this.umi);
    const txB64 = Buffer.from(this.umi.transactions.serialize(tx)).toString('base64');
    return {
      txB64, messageHash: sha256hex(tx.serializedMessage), lastValidBlockHeight: bh.lastValidBlockHeight,
      ixHashes: fingerprints(tx).map((f) => f.hash), feePayer: tx.message.accounts[0].toString(), blockhash: tx.message.blockhash, ...extra
    };
  }
  _assetRef(asset, owner) { return { publicKey: publicKey(asset), owner: publicKey(owner), oracles: [], lifecycleHooks: [] }; }

  async buildMintTx({ buyer, lamports, name, uri, collection }) {
    const u = this.umi;
    const buyerSigner = createNoopSigner(publicKey(buyer));
    const assetSigner = generateSigner(u);
    let b = transactionBuilder();
    if (lamports > 0) b = b.add(transferSol(u, { source: buyerSigner, destination: publicKey(this.vaultAddress), amount: umiLamports(lamports) }));
    b = b.add(create(u, { asset: assetSigner, collection: this._collection(collection), name, uri, owner: publicKey(buyer), payer: buyerSigner, authority: this.authoritySigner }));
    return this._finish(b, buyerSigner, { asset: assetSigner.publicKey.toString(), extraKeys: { [assetSigner.publicKey.toString()]: Buffer.from(assetSigner.secretKey).toString('base64') } });
  }
  async buildPaymentTx({ payer, lamports }) {
    const s = createNoopSigner(publicKey(payer));
    const b = transferSol(this.umi, { source: s, destination: publicKey(this.vaultAddress), amount: umiLamports(lamports) });
    return this._finish(b, s);
  }
  /** Seller accepts an offer: vault pays seller, seller pays the dev "gas" fee, NFT goes to the bidder. Vault is fee payer. */
  async buildAcceptOfferTx({ seller, buyer, asset, sellerPayout, devFee, collection }) {
    const u = this.umi;
    const sellerSigner = createNoopSigner(publicKey(seller));
    let b = transactionBuilder()
      .add(transferSol(u, { source: this.vaultSigner, destination: publicKey(seller), amount: umiLamports(sellerPayout) }))
      .add(transferSol(u, { source: sellerSigner, destination: publicKey(this.devAddress), amount: umiLamports(devFee) }))
      .add(transfer(u, { asset: this._assetRef(asset, seller), collection: this._collection(collection), newOwner: publicKey(buyer), authority: sellerSigner, payer: this.vaultSigner }));
    return this._finish(b, this.vaultSigner);
  }
  /** Owner lets the platform move the NFT when someone pays the listing price (Core TransferDelegate plugin). */
  async buildListTx({ owner, asset, collection }) {
    const s = createNoopSigner(publicKey(owner));
    const b = addPlugin(this.umi, {
      asset: publicKey(asset), collection: publicKey(collection),
      plugin: { type: 'TransferDelegate', authority: { type: 'Address', address: publicKey(this.authorityAddress) } },
      authority: s, payer: s
    });
    return this._finish(b, s);
  }
  /** Buyer pays the vault; vault pays seller + dev; platform (delegate) moves the NFT. All atomic. */
  async buildBuyListingTx({ buyer, seller, asset, price, sellerPayout, devFee, collection }) {
    const u = this.umi;
    const buyerSigner = createNoopSigner(publicKey(buyer));
    let b = transactionBuilder()
      .add(transferSol(u, { source: buyerSigner, destination: publicKey(this.vaultAddress), amount: umiLamports(price) }))
      .add(transferSol(u, { source: this.vaultSigner, destination: publicKey(seller), amount: umiLamports(sellerPayout) }))
      .add(transfer(u, { asset: this._assetRef(asset, seller), collection: this._collection(collection), newOwner: publicKey(buyer), authority: this.authoritySigner, payer: buyerSigner }));
    return this._finish(b, buyerSigner);
  }
  /** Collector takes a platform-owned NFT: pays the vault the resale price (if any), the vault (current owner) moves the NFT. */
  async buildCollectFromPlatformTx({ buyer, asset, lamports, collection }) {
    const u = this.umi;
    const buyerSigner = createNoopSigner(publicKey(buyer));
    let b = transactionBuilder();
    if (lamports > 0) b = b.add(transferSol(u, { source: buyerSigner, destination: publicKey(this.vaultAddress), amount: umiLamports(lamports) }));
    b = b.add(transfer(u, { asset: this._assetRef(asset, this.vaultAddress), collection: this._collection(collection), newOwner: publicKey(buyer), authority: this.vaultSigner, payer: buyerSigner }));
    return this._finish(b, buyerSigner);
  }
  /** Fully-signed vault -> wallet transfer (refunds, revenue withdrawals). Signature is known BEFORE broadcast. */
  async prepareVaultTransfer({ to, lamports }) {
    const b = transferSol(this.umi, { source: this.vaultSigner, destination: publicKey(to), amount: umiLamports(lamports) });
    const built = await this._finish(b, this.vaultSigner);
    return { ...built, signature: this.inspectSigned(built.txB64).signature };
  }

  // ---- verifying what the user sent back ----
  inspectSigned(txB64) {
    const tx = this.umi.transactions.deserialize(Buffer.from(txB64, 'base64'));
    const msg = tx.serializedMessage;
    const n = tx.message.header.numRequiredSignatures;
    let ok = true;
    for (let i = 0; i < n; i++) {
      const sig = tx.signatures[i];
      if (!sig || ZERO_SIG(sig) || !nacl.sign.detached.verify(msg, sig, publicKeyBytes(tx.message.accounts[i]))) { ok = false; break; }
    }
    return {
      messageHash: sha256hex(msg),
      signature: bs58.encode(tx.signatures[0]),
      fullySigned: ok,
      lastValidBlockHeight: null
    };
  }
  /**
   * Check what the wallet sent back against what we prepared. An identical message is always fine. If the wallet added
   * priority-fee / guard instructions the message differs: accept it only when every original instruction is still there,
   * the fee payer and blockhash are unchanged and the extras are on the allow-list — then re-add OUR signatures
   * (vault / authority / throwaway asset key), which the wallet's change invalidated. The user's signature must be valid.
   */
  async verifySigned(txB64, exp = {}) {
    const tx = this.umi.transactions.deserialize(Buffer.from(txB64, 'base64'));
    const exact = sha256hex(tx.serializedMessage) === exp.messageHash;
    if (!exact) {
      if (!exp.ixHashes) return { ok: false, reason: 'message_changed' };
      if (tx.message.accounts[0].toString() !== exp.feePayer) return { ok: false, reason: 'fee_payer_changed' };
      if (exp.blockhash && tx.message.blockhash !== exp.blockhash) return { ok: false, reason: 'blockhash_changed' };
      const have = fingerprints(tx);
      const left = [...exp.ixHashes];
      const extras = [];
      for (const f of have) { const i = left.indexOf(f.hash); if (i > -1) left.splice(i, 1); else extras.push(f); }
      if (left.length) return { ok: false, reason: 'instruction_missing' };
      if (extras.some((f) => !ALLOWED_EXTRA_PROGRAMS.has(f.program))) return { ok: false, reason: 'unexpected_instruction' };
      const msg = tx.serializedMessage;
      const n = tx.message.header.numRequiredSignatures;
      for (let i = 0; i < n; i++) {
        const key = tx.message.accounts[i].toString();
        const sig = tx.signatures[i];
        if (sig && !ZERO_SIG(sig) && nacl.sign.detached.verify(msg, sig, publicKeyBytes(tx.message.accounts[i]))) continue;
        if (key === this.vaultAddress) tx.signatures[i] = await this.vaultSigner.signMessage(msg);
        else if (key === this.authorityAddress) tx.signatures[i] = await this.authoritySigner.signMessage(msg);
        else if (exp.extraKeys?.[key]) tx.signatures[i] = nacl.sign.detached(msg, Buffer.from(exp.extraKeys[key], 'base64'));
      }
      txB64 = Buffer.from(this.umi.transactions.serialize(tx)).toString('base64');
    }
    return { ok: true, ...this.inspectSigned(txB64), txB64 };
  }
  async broadcast(txB64) {
    return this.rpc('sendTransaction', [txB64, { encoding: 'base64', skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 5 }]);
  }
  async getTransactionMessageHash(sig) {
    const r = await this.rpc('getTransaction', [sig, { encoding: 'base64', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }]);
    if (!r || r.meta?.err) return null;
    const tx = this.umi.transactions.deserialize(Buffer.from(r.transaction[0], 'base64'));
    return sha256hex(tx.serializedMessage);
  }
  async signatureStatus(sig, lastValid) {
    const { value } = await this.rpc('getSignatureStatuses', [[sig], { searchTransactionHistory: true }]);
    const s = value?.[0];
    if (s) {
      if (s.err) return 'failed';
      if (s.confirmationStatus === 'confirmed' || s.confirmationStatus === 'finalized') return 'confirmed';
      return 'pending';
    }
    if (lastValid && (await this.getBlockHeight()) > lastValid) return 'expired';
    return 'pending';
  }

  /** devnet faucet */
  async airdrop(address, sol) {
    await this.umi.rpc.airdrop(publicKey(address), solAmount(sol));
    return { sol };
  }

  // ---- deployment helper (used by scripts/create-collection.js) ----
  async createCollection({ name, uri }) {
    const collection = generateSigner(this.umi);
    const res = await createCollection(this.umi, { collection, name, uri, updateAuthority: this.authoritySigner.publicKey }).sendAndConfirm(this.umi);
    return { address: collection.publicKey.toString(), signature: bs58.encode(res.signature) };
  }

  // ---- permanent storage (Arweave via Irys). The vault fronts the upload; the minter reimburses it inside the mint tx. ----
  _irys() {
    if (!this._irysUmi) {
      const u = createUmi(config.rpcUrl, { commitment: 'confirmed' }).use(mplCore()).use(irysUploader());
      u.use(signerIdentity(this.vaultSigner));
      this._irysUmi = u;
    }
    return this._irysUmi;
  }
  async _fetchImage(url) {
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`image fetch failed (${r.status}) for ${url}`);
    const mime = (r.headers.get('content-type') || 'image/png').split(';')[0].trim();
    if (!/^image\//.test(mime)) throw new Error(`not an image (${mime}) at ${url}`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > config.permastore.maxImageBytes) throw new Error('image too large for permanent upload');
    const ext = mime.split('/')[1].replace('jpeg', 'jpg');
    return { mime, file: createGenericFile(buf, `art.${ext}`, { contentType: mime }) };
  }
  /** Uploads the image (taken from its public URL) and then the metadata JSON. buildMetadata(imageUri, mime) -> object. */
  async uploadNft({ imageUrl, buildMetadata }) {
    const u = this._irys();
    const { mime, file } = await this._fetchImage(imageUrl);
    const placeholder = createGenericFile(Buffer.from(JSON.stringify(buildMetadata('https://gateway.irys.xyz/' + 'x'.repeat(43), mime))), 'metadata.json', { contentType: 'application/json' });
    const price = await u.uploader.getUploadPrice([file, placeholder]);
    const costLamports = Number(price.basisPoints);
    if (costLamports > config.permastore.maxLamports) throw new Error(`upload would cost ${costLamports} lamports (limit ${config.permastore.maxLamports})`);
    const [imageUri] = await u.uploader.upload([file]);
    const metadataUri = await u.uploader.uploadJson(buildMetadata(imageUri, mime));
    return { imageUri, metadataUri, costLamports };
  }
}
