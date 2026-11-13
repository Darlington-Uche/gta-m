// In-memory chain simulator (CHAIN_DRIVER=mock). Same interface as solana.js, used for tests / offline demos.
// "Transactions" are JSON blobs with the same security properties as real ones: a fixed message, a list of
// required signers, and atomic execution (all instructions apply or none do).
import crypto from 'node:crypto';
import { TxRejected } from './errors.js';

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64');
const unb64 = (s) => JSON.parse(Buffer.from(s, 'base64').toString('utf8'));
const FEE = 5000;

export class MockChain {
  constructor({ vault = 'VaultMock11111111111111111111111111111111111' } = {}) {
    this.name = 'mock';
    this.vaultAddress = vault;
    this.authorityAddress = vault;
    this.devAddress = vault; // platform fees land in the vault too
    this.balances = new Map();
    this.assets = new Map(); // asset -> {owner, delegate, name, uri}
    this.executed = new Map(); // signature -> tx
    this.height = 1000;
    this.failBroadcast = 0; // test hook: throw before executing N broadcasts
    this.dropBroadcast = 0; // test hook: pretend success but never execute (tx "lost")
    this.counter = 0;
  }
  async init() {}
  fund(wallet, lamports) { this.balances.set(wallet, (this.balances.get(wallet) || 0) + lamports); }
  advance(n = 200) { this.height += n; }
  async getBlockHeight() { return this.height; }
  async getBalance(a) { return this.balances.get(a) || 0; }
  async getAssetOwner(asset) { return this.assets.get(asset)?.owner ?? null; }
  async getAssetOwners(list) { return new Map(list.map((a) => [a, this.assets.get(a)?.owner ?? null])); }
  async assetExists(asset) { return this.assets.has(asset); }
  async hasDelegate(asset, who) { return this.assets.get(asset)?.delegate === who; }
  async listCollectionAssets(collection) { return [...this.assets].filter(([, a]) => !collection || a.collection === collection).map(([asset, a]) => ({ asset, owner: a.owner })); }
  async verifyCollection(address) { return address && address !== 'bad' && address.length >= 8 ? { ok: true } : { ok: false, reason: 'mock: not a collection' }; }
  explorerTx(sig) { return `mock://tx/${sig}`; }
  explorerAddress(a) { return `mock://address/${a}`; }

  _tx({ ixs, signers, feePayer, autoSigned = [] }) {
    const id = `${Date.now()}_${++this.counter}_${Math.random().toString(36).slice(2, 8)}`;
    const core = { id, ixs, signers: [...new Set(signers)], feePayer };
    const messageHash = sha(JSON.stringify(core));
    const lastValidBlockHeight = this.height + 150;
    const tx = { ...core, sigs: [...autoSigned], lastValidBlockHeight };
    return { txB64: b64(tx), messageHash, lastValidBlockHeight };
  }
  // test helper: what a wallet does when the user signs
  signMock(txB64, wallet) {
    const tx = unb64(txB64);
    if (!tx.signers.includes(wallet)) throw new Error(`${wallet} is not a required signer`);
    if (!tx.sigs.includes(wallet)) tx.sigs.push(wallet);
    return b64(tx);
  }

  /** Simulated permanent storage: deterministic fake URIs, fixed cost (override with MOCK_UPLOAD_LAMPORTS). */
  async uploadNft({ imageUrl, buildMetadata }) {
    if (/fail/.test(imageUrl)) throw new Error('mock upload failed');
    const h = sha(imageUrl).slice(0, 16);
    const imageUri = `https://arweave.mock/img_${h}`;
    const meta = buildMetadata(imageUri, 'image/png');
    this.uploads = this.uploads || new Map();
    this.uploads.set(`https://arweave.mock/meta_${h}`, meta);
    return { imageUri, metadataUri: `https://arweave.mock/meta_${h}`, costLamports: Number(process.env.MOCK_UPLOAD_LAMPORTS || 5000) };
  }

  async buildMintTx({ buyer, lamports, name, uri, collection }) {
    if (!collection) throw new Error('collection address required');
    const asset = 'ASSET' + sha(String(Math.random()) + this.counter).slice(0, 36);
    const ixs = [];
    if (lamports > 0) ixs.push({ t: 'transfer', from: buyer, to: this.vaultAddress, lamports });
    ixs.push({ t: 'mint', asset, owner: buyer, name, uri, collection });
    const built = this._tx({ ixs, signers: [buyer, this.authorityAddress, asset], feePayer: buyer, autoSigned: [this.authorityAddress, asset] });
    return { ...built, asset };
  }
  async buildPaymentTx({ payer, lamports }) {
    return this._tx({ ixs: [{ t: 'transfer', from: payer, to: this.vaultAddress, lamports }], signers: [payer], feePayer: payer });
  }
  async buildAcceptOfferTx({ seller, buyer, asset, sellerPayout, devFee, collection }) {
    const ixs = [
      { t: 'transfer', from: this.vaultAddress, to: seller, lamports: sellerPayout },
      { t: 'transfer', from: seller, to: this.devAddress, lamports: devFee },
      { t: 'assetTransfer', asset, newOwner: buyer, authority: seller, collection }
    ];
    return this._tx({ ixs, signers: [this.vaultAddress, seller], feePayer: this.vaultAddress, autoSigned: [this.vaultAddress] });
  }
  async buildListTx({ owner, asset, collection }) {
    return this._tx({ ixs: [{ t: 'addDelegate', asset, delegate: this.authorityAddress, authority: owner, collection }], signers: [owner], feePayer: owner });
  }
  async buildBuyListingTx({ buyer, seller, asset, price, sellerPayout, devFee, collection }) {
    const ixs = [
      { t: 'transfer', from: buyer, to: this.vaultAddress, lamports: price },
      { t: 'transfer', from: this.vaultAddress, to: seller, lamports: sellerPayout },
      ...(devFee > 0 && this.devAddress !== this.vaultAddress ? [{ t: 'transfer', from: this.vaultAddress, to: this.devAddress, lamports: devFee }] : []), // fee stays in the vault
      { t: 'assetTransfer', asset, newOwner: buyer, authority: this.authorityAddress, collection }
    ];
    return this._tx({ ixs, signers: [buyer, this.vaultAddress], feePayer: buyer, autoSigned: [this.vaultAddress] });
  }
  async buildCollectFromPlatformTx({ buyer, asset, lamports, collection }) {
    const ixs = [...(lamports > 0 ? [{ t: 'transfer', from: buyer, to: this.vaultAddress, lamports }] : []), { t: 'assetTransfer', asset, newOwner: buyer, authority: this.vaultAddress, collection }];
    return this._tx({ ixs, signers: [buyer, this.vaultAddress], feePayer: buyer, autoSigned: [this.vaultAddress] });
  }
  async prepareVaultTransfer({ to, lamports }) {
    const b = this._tx({ ixs: [{ t: 'transfer', from: this.vaultAddress, to, lamports }], signers: [this.vaultAddress], feePayer: this.vaultAddress, autoSigned: [this.vaultAddress] });
    return { ...b, signature: this.inspectSigned(b.txB64).signature };
  }

  inspectSigned(txB64) {
    const tx = unb64(txB64);
    const { sigs, lastValidBlockHeight, ...core } = tx;
    const messageHash = sha(JSON.stringify(core));
    return {
      messageHash,
      signature: `mocksig_${messageHash.slice(0, 40)}`,
      fullySigned: tx.signers.every((s) => sigs.includes(s)),
      lastValidBlockHeight
    };
  }

  async verifySigned(txB64, exp = {}) {
    const info = this.inspectSigned(txB64);
    return { ok: info.messageHash === exp.messageHash, reason: 'message_changed', ...info, txB64 };
  }
  async broadcast(txB64) {
    if (this.failBroadcast > 0) { this.failBroadcast--; throw new Error('mock: RPC unavailable'); }
    const info = this.inspectSigned(txB64);
    if (!info.fullySigned) throw new TxRejected('mock: missing required signature');
    if (this.executed.has(info.signature)) return info.signature;
    if (this.dropBroadcast > 0) { this.dropBroadcast--; return info.signature; }
    const tx = unb64(txB64);
    if (this.height > tx.lastValidBlockHeight) throw new TxRejected('mock: blockhash expired');
    const bal = new Map(this.balances);
    const assets = new Map([...this.assets].map(([k, v]) => [k, { ...v }]));
    const take = (w, n) => { const v = (bal.get(w) || 0) - n; if (v < 0) throw new TxRejected(`mock: insufficient funds in ${w}`); bal.set(w, v); };
    take(tx.feePayer, FEE);
    for (const ix of tx.ixs) {
      if (ix.t === 'transfer') { take(ix.from, ix.lamports); bal.set(ix.to, (bal.get(ix.to) || 0) + ix.lamports); }
      else if (ix.t === 'mint') {
        if (assets.has(ix.asset)) throw new TxRejected('mock: asset exists');
        assets.set(ix.asset, { owner: ix.owner, delegate: null, name: ix.name, uri: ix.uri, collection: ix.collection });
      } else if (ix.t === 'assetTransfer') {
        const a = assets.get(ix.asset);
        if (!a) throw new TxRejected('mock: no such asset');
        if (a.collection !== ix.collection) throw new TxRejected('mock: wrong collection account for this asset');
        if (ix.authority !== a.owner && ix.authority !== a.delegate) throw new TxRejected('mock: authority is not owner/delegate');
        a.owner = ix.newOwner; a.delegate = null;
      } else if (ix.t === 'addDelegate') {
        const a = assets.get(ix.asset);
        if (!a || a.owner !== ix.authority) throw new TxRejected('mock: only owner can add delegate');
        if (a.collection !== ix.collection) throw new TxRejected('mock: wrong collection account for this asset');
        a.delegate = ix.delegate;
      }
    }
    this.balances = bal; this.assets = assets; this.executed.set(info.signature, tx);
    return info.signature;
  }
  async getTransactionMessageHash(sig) {
    const tx = this.executed.get(sig);
    if (!tx) return null;
    const { sigs, lastValidBlockHeight, ...core } = tx;
    return sha(JSON.stringify(core));
  }
  async signatureStatus(sig, lastValid) {
    if (this.executed.has(sig)) return 'confirmed';
    return this.height > lastValid ? 'expired' : 'pending';
  }
  async airdrop(address, sol) { this.fund(address, Math.round(sol * 1e9)); return { sol }; }
  async createCollection({ name }) { return { address: 'MockCollection_' + name.replace(/\W/g, '').slice(0, 20) + '_' + (++this.counter), signature: 'mock' }; }
}
