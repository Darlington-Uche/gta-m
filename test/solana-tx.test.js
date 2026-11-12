// Builds every REAL Solana transaction offline (blockhash stubbed) and checks signers, instruction counts and signatures.
// This does not hit the network; it proves the Metaplex Core / SystemProgram transactions assemble and verify correctly.
import test from 'node:test';
import assert from 'node:assert/strict';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

const kp = () => nacl.sign.keyPair();
const [vault, dev, coll, buyer, seller] = [kp(), kp(), kp(), kp(), kp()];
const addr = (k) => bs58.encode(k.publicKey);
Object.assign(process.env, { CHAIN_DRIVER: 'solana', NETWORK: 'devnet', VAULT_SECRET_KEY_DEVNET: bs58.encode(vault.secretKey) });

const { SolanaChain } = await import('../src/services/chain/solana.js');
const c = await new SolanaChain().init();
c.latestBlockhash = async () => ({ blockhash: bs58.encode(new Uint8Array(32).fill(7)), lastValidBlockHeight: 999 });
const [B, S, asset] = [addr(buyer), addr(seller), addr(kp())];

const parse = (b64) => c.umi.transactions.deserialize(Buffer.from(b64, 'base64'));
const sign = (b64, k) => {
  const tx = parse(b64);
  const i = tx.message.accounts.findIndex((a) => a.toString() === addr(k));
  assert.ok(i >= 0 && i < tx.message.header.numRequiredSignatures, 'wallet must be a required signer');
  tx.signatures[i] = nacl.sign.detached(tx.serializedMessage, k.secretKey);
  return Buffer.from(c.umi.transactions.serialize(tx)).toString('base64');
};
const info = (b) => ({ signers: parse(b.txB64).message.header.numRequiredSignatures, ixs: parse(b.txB64).message.instructions.length, ready: c.inspectSigned(b.txB64).fullySigned });

test('mint: buyer pays vault + Core asset is created in the collection (buyer, vault authority, new asset sign)', async () => {
  const b = await c.buildMintTx({ buyer: B, lamports: 50_000_000, name: 'Test #1', uri: 'http://x/1.json', collection: addr(coll) });
  assert.deepEqual(info(b), { signers: 3, ixs: 2, ready: false });
  const signed = sign(b.txB64, buyer);
  const ins = c.inspectSigned(signed);
  assert.equal(ins.fullySigned, true); assert.equal(ins.messageHash, b.messageHash);
  assert.ok(b.asset.length > 30);
  // free mint has only the create instruction
  assert.equal(info(await c.buildMintTx({ buyer: B, lamports: 0, name: 'Free', uri: 'u', collection: addr(coll) })).ixs, 1);
});
test('offer payment: buyer -> vault', async () => assert.deepEqual(info(await c.buildPaymentTx({ payer: B, lamports: 1000 })), { signers: 1, ixs: 1, ready: false }));
test('accept offer: vault pays seller, seller pays the fee to the vault, NFT moves; vault pre-signed, needs seller', async () => {
  const b = await c.buildAcceptOfferTx({ seller: S, buyer: B, asset, sellerPayout: 90_000_000, devFee: 2_000_000, collection: addr(coll) });
  assert.deepEqual(info(b), { signers: 2, ixs: 3, ready: false });
  assert.equal(c.inspectSigned(sign(b.txB64, seller)).fullySigned, true);
  assert.throws(() => sign(b.txB64, kp()), /required signer/, 'a stranger cannot sign for this tx');
});
test('list: owner adds TransferDelegate for the platform', async () => assert.deepEqual(info(await c.buildListTx({ owner: S, asset, collection: addr(coll) })), { signers: 1, ixs: 1, ready: false }));
test('buy listing: buyer pays, vault pays seller (fees stay in the vault), platform moves NFT (3 ixs, 2 signers)', async () => {
  const b = await c.buildBuyListingTx({ buyer: B, seller: S, asset, price: 100_000_000, sellerPayout: 90_000_000, devFee: 2_000_000, collection: addr(coll) });
  assert.deepEqual(info(b), { signers: 2, ixs: 3, ready: false });
  assert.equal(c.inspectSigned(sign(b.txB64, buyer)).fullySigned, true);
});
test('vault transfer is fully signed up-front and its signature is known before broadcast', async () => {
  const b = await c.prepareVaultTransfer({ to: B, lamports: 5000 });
  assert.equal(c.inspectSigned(b.txB64).fullySigned, true);
  assert.equal(b.signature, c.inspectSigned(b.txB64).signature);
});
test('tampering with a signed message invalidates the signature check', async () => {
  const b = await c.buildPaymentTx({ payer: B, lamports: 1000 });
  const tx = parse(b.txB64);
  tx.signatures[0] = nacl.sign.detached(tx.serializedMessage, buyer.secretKey);
  const good = Buffer.from(c.umi.transactions.serialize(tx)).toString('base64');
  assert.equal(c.inspectSigned(good).fullySigned, true);
  const raw = Buffer.from(good, 'base64'); raw[raw.length - 20] ^= 0xff; // flip a byte inside the message
  assert.equal(c.inspectSigned(raw.toString('base64')).fullySigned, false);
});

// ---- wallets may add priority-fee / guard instructions before signing ----
import { publicKey as pk, transactionBuilder as tb, createNoopSigner as noop } from '@metaplex-foundation/umi';
const reSerialize = (tx) => Buffer.from(c.umi.transactions.serialize(tx)).toString('base64');
import * as web3 from '@solana/web3.js';
// what a wallet does: add an instruction to the message, then sign it itself
const withExtraProgram = (b, k, programId, data = [1, 2, 3]) => {
  const tx = web3.VersionedTransaction.deserialize(Buffer.from(b.txB64, 'base64'));
  const m = tx.message;
  let idx = m.staticAccountKeys.findIndex((a) => a.toBase58() === programId);
  if (idx < 0) { m.staticAccountKeys.push(new web3.PublicKey(programId)); idx = m.staticAccountKeys.length - 1; m.header.numReadonlyUnsignedAccounts += 1; }
  m.compiledInstructions.push({ programIdIndex: idx, accountKeyIndexes: [], data: Uint8Array.from(data) });
  tx.signatures = tx.signatures.map(() => new Uint8Array(64));
  tx.sign([web3.Keypair.fromSecretKey(k.secretKey)]);
  return Buffer.from(tx.serialize()).toString('base64');
};
test('wallet adds a ComputeBudget instruction: accepted (offer payment)', async () => {
  const b = await c.buildPaymentTx({ payer: B, lamports: 1000 });
  const edited = withExtraProgram(b, buyer, 'ComputeBudget111111111111111111111111111111');
  assert.notEqual(c.inspectSigned(edited).messageHash, b.messageHash);
  const v = await c.verifySigned(edited, b);
  assert.equal(v.ok, true); assert.equal(v.fullySigned, true);
});
test('wallet adds an unknown program instruction: rejected', async () => {
  const b = await c.buildPaymentTx({ payer: B, lamports: 1000 });
  const evil = withExtraProgram(b, buyer, '11111111111111111111111111111111');
  assert.equal((await c.verifySigned(evil, b)).ok, false);
});
test('wallet drops an original instruction or changes the amount: rejected', async () => {
  const b = await c.buildPaymentTx({ payer: B, lamports: 1000 });
  const other = await c.buildPaymentTx({ payer: B, lamports: 999_999 });
  assert.equal((await c.verifySigned(sign(other.txB64, buyer), b)).ok, false);
});
test('mint with an edited message: vault, authority and the throwaway asset key are re-signed by the server', async () => {
  const b = await c.buildMintTx({ buyer: B, lamports: 50_000_000, name: 'T', uri: 'u', collection: addr(coll) });
  const edited = withExtraProgram(b, buyer, 'ComputeBudget111111111111111111111111111111');
  assert.equal(c.inspectSigned(edited).fullySigned, false); // our signatures no longer match
  const v = await c.verifySigned(edited, b);
  assert.equal(v.ok, true); assert.equal(v.fullySigned, true);
});
test('accept offer with an edited message: seller signature kept, vault fee-payer re-signs', async () => {
  const b = await c.buildAcceptOfferTx({ seller: S, buyer: B, asset, sellerPayout: 90_000_000, devFee: 2_000_000, collection: addr(coll) });
  const edited = withExtraProgram(b, seller, 'ComputeBudget111111111111111111111111111111');
  const v = await c.verifySigned(edited, b);
  assert.equal(v.ok, true); assert.equal(v.fullySigned, true);
  // with NO seller signature the tx is not fully signed (the server only re-signs for its own keys)
  const unsigned = withExtraProgram(b, vault, 'ComputeBudget111111111111111111111111111111');
  assert.equal((await c.verifySigned(unsigned, b)).fullySigned, false);
});
