// Image/video uploads. STORAGE_DRIVER=local (./uploads, served at /uploads) or firebase (Firebase Storage bucket).
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config/index.js';
import { bad } from '../lib/errors.js';

export const ALLOWED = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'video/mp4': 'mp4' };
export const MAX_BYTES = 50 * 1024 * 1024;
export const UPLOAD_DIR = path.resolve('uploads');

export async function saveUpload(file, folder) {
  const ext = ALLOWED[file.mimetype];
  if (!ext) throw bad('bad_file_type', 'Only JPG, PNG, GIF or MP4 files are allowed');
  if (file.size > MAX_BYTES) throw bad('file_too_large', 'Max file size is 50MB');
  const name = `${folder}/${Date.now()}_${crypto.randomBytes(6).toString('hex')}.${ext}`;
  if (config.storageDriver === 'supabase') {
    const { url, serviceKey, bucket } = config.supabase;
    const r = await fetch(`${url}/storage/v1/object/${bucket}/${name}`, { method: 'POST', headers: { authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'content-type': file.mimetype, 'x-upsert': 'true' }, body: file.buffer });
    if (!r.ok) throw new Error('storage upload failed: ' + (await r.text()).slice(0, 200));
    return { url: `${url}/storage/v1/object/public/${bucket}/${name}`, type: file.mimetype };
  }
  if (config.storageDriver === 'firebase') {
    const bucket = (await import('firebase-admin/storage')).getStorage().bucket();
    const f = bucket.file(name);
    await f.save(file.buffer, { contentType: file.mimetype, resumable: false });
    await f.makePublic();
    return { url: `https://storage.googleapis.com/${bucket.name}/${name}`, type: file.mimetype };
  }
  const full = path.join(UPLOAD_DIR, name);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, file.buffer);
  return { url: `${config.publicBaseUrl}/uploads/${name}`, type: file.mimetype };
}
