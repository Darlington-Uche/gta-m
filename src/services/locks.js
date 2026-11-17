// An item can only be part of ONE in-flight transaction (mint / accept / list / buy) at a time.
import { now } from '../lib/db.js';
import { conflict } from '../lib/errors.js';
import { TX_TTL_MS } from '../lib/constants.js';

export const LOCK_MS = TX_TTL_MS + 60_000; // outlives the signable window of the transaction
export const isLocked = (item) => !!(item.lock && item.lock.until > now());
export function assertUnlocked(item) {
  if (isLocked(item)) throw conflict('item_busy', 'Another transaction is in progress for this artwork. Try again in a couple of minutes.');
}
export const lockFor = (ptxId, kind) => ({ lock: { ptxId, kind, until: now() + LOCK_MS } });
export const unlockIf = (item, ptxId) => (item.lock?.ptxId === ptxId ? { lock: null } : {});
