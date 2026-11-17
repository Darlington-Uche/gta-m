// The "Create & Submit" page: users upload artwork, admins review. Approving creates a catalog item (unminted) with an admin-set price.
import { col, getDoc, newId, now, queryDocs } from '../lib/db.js';
import { createItem } from './items.service.js';
import { saveUpload } from './storage.service.js';
import { notify } from './notifications.service.js';
import { ERAS, CATEGORIES } from '../lib/constants.js';
import { bad, conflict, notFound } from '../lib/errors.js';

export async function createSubmission({ wallet, fields, files }) {
  if (!files?.length) throw bad('no_file', 'Upload at least one file');
  if (fields.era && !ERAS[fields.era]) throw bad('bad_era', 'Unknown era');
  if (fields.category && !CATEGORIES.includes(fields.category)) throw bad('bad_category', 'Unknown category');
  const pendingMine = (await queryDocs(col('submissions').where('wallet', '==', wallet).where('status', '==', 'pending'))).length;
  if (pendingMine >= 10) throw conflict('too_many_pending', 'You have too many submissions waiting for review');
  const media = [];
  for (const f of files.slice(0, 5)) media.push(await saveUpload(f, 'submissions'));
  const id = newId('submissions');
  const doc = {
    wallet, title: fields.title, description: fields.description || '', era: fields.era || 'vice', category: fields.category || 'Artwork',
    tags: fields.tags || [], suggestedPriceUsd: fields.suggestedPriceUsd ?? null, media, status: 'pending', createdAt: now()
  };
  await col('submissions').doc(id).set(doc);
  return { id, ...doc };
}
export const listSubmissions = ({ status, wallet } = {}) => {
  let q = col('submissions');
  if (status) q = q.where('status', '==', status);
  if (wallet) q = q.where('wallet', '==', wallet);
  return queryDocs(q).then((r) => r.sort((a, b) => b.createdAt - a.createdAt));
};
export async function approveSubmission({ id, by, priceUsd, rarity, itemId }) {
  const s = await getDoc('submissions', id);
  if (!s) throw notFound('Submission not found');
  if (s.status !== 'pending') throw conflict('already_reviewed', `Submission is ${s.status}`);
  const item = await createItem({ id: itemId, title: s.title, description: s.description, image: s.media[0].url, era: s.era, category: s.category, rarity: rarity || 'Common', tags: s.tags, priceUsd, hidden: false, submissionId: id, submittedBy: s.wallet }, by);
  await col('submissions').doc(id).update({ status: 'approved', reviewedBy: by, reviewedAt: now(), itemId: item.id });
  await notify(s.wallet, 'submission_approved', 'Artwork approved', `${s.title} was approved and is now in the collection.`, { itemId: item.id, submissionId: id });
  return item;
}
export async function rejectSubmission({ id, by, reason }) {
  const s = await getDoc('submissions', id);
  if (!s) throw notFound('Submission not found');
  if (s.status !== 'pending') throw conflict('already_reviewed', `Submission is ${s.status}`);
  await col('submissions').doc(id).update({ status: 'rejected', reviewedBy: by, reviewedAt: now(), reason });
  await notify(s.wallet, 'submission_rejected', 'Artwork not approved', reason ? `${s.title}: ${reason}` : `${s.title} did not pass review.`, { submissionId: id });
  return { rejected: true };
}
