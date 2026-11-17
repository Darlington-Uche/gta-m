import { col, now, queryDocs } from '../lib/db.js';

/** Build a notification doc ref+data. Use inside a transaction: tx.set(ref, data) */
export function makeNotification(wallet, type, title, body, data = {}) {
  const ref = col('notifications').doc();
  return { ref, data: { wallet, type, title, body, data, read: false, createdAt: now() } };
}
export async function notify(wallet, type, title, body, data) {
  const { ref, data: d } = makeNotification(wallet, type, title, body, data);
  await ref.set(d);
}
export const listNotifications = async (wallet, { limit = 50, unreadOnly = false } = {}) => {
  let q = col('notifications').where('wallet', '==', wallet);
  if (unreadOnly) q = q.where('read', '==', false);
  // Equality-only query + in-memory sort: no composite Firestore index required.
  const rows = await queryDocs(q);
  return rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, limit);
};
export const unreadCount = async (wallet) => (await col('notifications').where('wallet', '==', wallet).where('read', '==', false).get()).size;
export async function markRead(wallet, ids) {
  const q = await col('notifications').where('wallet', '==', wallet).where('read', '==', false).get();
  const targets = q.docs.filter((d) => !ids || ids.includes(d.id));
  await Promise.all(targets.map((d) => d.ref.update({ read: true })));
  return targets.length;
}
