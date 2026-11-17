// Picks the chain driver. Everything else in the app talks to `chain` only.
//
// Driver interface (both mock.js and solana.js implement it):
//   init(), vaultAddress, devAddress, authorityAddress, collectionAddress
//   getBalance(addr)  getBlockHeight()  getAssetOwner(asset)  getAssetOwners(list)  assetExists(asset)  hasDelegate(asset, who)
//   listCollectionAssets() -> [{asset, owner}] | null
//   buildMintTx / buildPaymentTx / buildAcceptOfferTx / buildListTx / buildBuyListingTx / prepareVaultTransfer
//        -> { txB64, messageHash, lastValidBlockHeight, ... }
//   inspectSigned(txB64) -> { messageHash, signature, fullySigned }
//   broadcast(txB64) -> signature      signatureStatus(sig, lastValid) -> confirmed|pending|expired|failed
import { config } from '../../config/index.js';
import { MockChain } from './mock.js';

let chain;
if (config.chainDriver === 'mock') {
  chain = new MockChain();
} else {
  const { SolanaChain } = await import('./solana.js');
  chain = new SolanaChain();
}
export { chain };
