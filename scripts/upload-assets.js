// Uploads a whole image folder to Firebase Storage (public, long-cached) and rewrites the image paths in your data.js to the new URLs.
//   npm run assets:upload -- --dir ../gta-marketplace/assets --data ../gta-marketplace/js/data.js
//   options: --prefix assets   (folder name used in the bucket AND in data.js paths, default "assets")
//            --all             (upload every image in the folder; by default only images that data.js actually uses are uploaded)
//            --dry             (no upload: shows what would happen and writes data.js.preview instead)
// A backup of your data.js is saved as data.js.bak. Safe to run again: unchanged files are skipped and data.js keeps working.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { flag, arg } from './_env.js';
import { config } from '../src/config/index.js';

const dir = arg('dir'), dataFile = arg('data'), prefix = arg('prefix', 'assets').replace(/^\/|\/$/g, ''), dry = flag('dry');
if (!dir || !dataFile) { console.error('Usage: npm run assets:upload -- --dir <images folder> --data <path to data.js> [--prefix assets] [--dry]'); process.exit(1); }
if (!dry && !config.firebase.storageBucket) { console.error('Set FIREBASE_STORAGE_BUCKET in .env first (and create Storage in the Firebase console).'); process.exit(1); }

const TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp4': 'video/mp4' };
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
let files = walk(dir).filter((f) => TYPES[path.extname(f).toLowerCase()]);
if (!flag('all')) { // only the images data.js references (decoded, case-insensitive)
  const dec = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
  const used = new Set([...fs.readFileSync(dataFile, 'utf8').matchAll(new RegExp(`["'](?:\\./|/)?(${prefix}/[^"']+)["']`, 'g'))].map((m) => dec(m[1]).trim().toLowerCase()));
  const before = files.length;
  files = files.filter((f) => used.has(`${prefix}/${path.relative(dir, f).split(path.sep).join('/')}`.toLowerCase()));
  console.log(`${files.length} of ${before} images in the folder are used by data.js (use --all to upload everything).`);
}
if (!files.length) { console.error('No images found in ' + dir); process.exit(1); }

let bucket = null;
if (!dry) {
  const { initializeApp, getApps, cert, applicationDefault } = await import('firebase-admin/app');
  const { getStorage } = await import('firebase-admin/storage');
  const { serviceAccountBase64, serviceAccountJson, storageBucket } = config.firebase;
  if (!getApps().length) initializeApp({ storageBucket, credential: serviceAccountBase64 ? cert(JSON.parse(Buffer.from(serviceAccountBase64, 'base64').toString('utf8'))) : serviceAccountJson ? cert(JSON.parse(serviceAccountJson)) : applicationDefault() });
  bucket = getStorage().bucket();
}

// Download-token URLs work whether or not the bucket uses uniform access (no ACL calls needed) and never expire.
const urlFor = (remote, token) => `https://firebasestorage.googleapis.com/v0/b/${bucket?.name || config.firebase.storageBucket || 'BUCKET'}/o/${encodeURIComponent(remote)}?alt=media&token=${token}`;
const map = new Map(); // decoded remote path ("assets/art/Liberty city street.jpg") -> url
const lower = new Map(); // lower-case decoded path -> same url (fallback when only the letter case differs)
let up = 0, skipped = 0, failed = 0;
for (const f of files) {
  const rel = path.relative(dir, f).split(path.sep).join('/');
  const remote = `${prefix}/${rel}`;
  const buf = fs.readFileSync(f);
  const hash = crypto.createHash('md5').update(buf).digest('base64');
  const put = (u) => { map.set(remote, u); lower.set(remote.toLowerCase(), u); };
  if (dry) { put(urlFor(remote, 'DRYRUN')); up++; continue; }
  try {
    const file = bucket.file(remote);
    const [exists] = await file.exists();
    let token;
    if (exists) {
      const [meta] = await file.getMetadata();
      token = (meta.metadata?.firebaseStorageDownloadTokens || '').split(',')[0];
      if (meta.md5Hash === hash && token) { put(urlFor(remote, token)); skipped++; continue; }
    }
    token = token || crypto.randomUUID();
    await file.save(buf, { resumable: false, contentType: TYPES[path.extname(f).toLowerCase()], metadata: { cacheControl: 'public, max-age=31536000, immutable', metadata: { firebaseStorageDownloadTokens: token } } });
    put(urlFor(remote, token)); up++;
    if (up % 10 === 0) console.log(`  uploaded ${up}…`);
  } catch (e) { failed++; console.error(`✗ ${remote}: ${e.message}`); }
}

// Rewrite every quoted "assets/..." path that we uploaded
const src = fs.readFileSync(dataFile, 'utf8');
let changed = 0, unmatched = new Set();
// data.js paths may be URL-encoded ("Liberty%20city%20street.jpg") while the real file is "Liberty city street.jpg"
const decode = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
let caseFixed = 0;
const out = src.replace(new RegExp(`(["'])((?:\\./|/)?${prefix}/[^"']+)\\1`, 'g'), (m, q, p) => {
  const key = decode(p.replace(/^\.?\//, '')).trim();
  if (map.has(key)) { changed++; return `${q}${map.get(key)}${q}`; }
  if (lower.has(key.toLowerCase())) { changed++; caseFixed++; return `${q}${lower.get(key.toLowerCase())}${q}`; }
  unmatched.add(key); return m;
});
const target = dry ? dataFile + '.preview' : dataFile;
if (!dry) fs.writeFileSync(dataFile + '.bak', src);
fs.writeFileSync(target, out);
console.log(`\n${dry ? '[dry run] ' : ''}${up} uploaded, ${skipped} unchanged, ${failed} failed. Rewrote ${changed} image paths in ${target}${dry ? '' : ' (backup: data.js.bak)'}.`);
if (caseFixed) console.log(`ℹ ${caseFixed} paths matched a file whose letter case differs (e.g. .PNG vs .png); the real file name was used.`);
if (unmatched.size) console.log(`⚠ ${unmatched.size} paths in data.js have no matching file in ${dir} (left as they were):\n  ` + [...unmatched].slice(0, 15).join('\n  '));
process.exit(failed ? 1 : 0);
