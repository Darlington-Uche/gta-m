import multer from 'multer';
import { z } from 'zod';
import { createSubmission } from '../services/submissions.service.js';
import { MAX_BYTES } from '../services/storage.service.js';
import { category, era, tags, usd } from './schemas.js';
import { bad } from '../lib/errors.js';

const multipart = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 5 } }).array('files', 5);
// multipart/form-data (classic) OR application/json with files: [{ type, data: base64 }] (used by the Supabase build / new frontend)
const upload = (req, res, next) => (req.is('multipart/form-data') ? multipart(req, res, next) : next());
const fromJson = (files) => (Array.isArray(files) ? files : []).slice(0, 5).map((f) => {
  const buffer = Buffer.from(String(f.data || ''), 'base64');
  const b = buffer; // trust the bytes, not the label: JPG / PNG / GIF / WebP / MP4 signatures
  const sniff = b[0] === 0xff && b[1] === 0xd8 ? 'image/jpeg' : b[0] === 0x89 && b[1] === 0x50 ? 'image/png' : b.slice(0, 3).toString() === 'GIF' ? 'image/gif' : b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP' ? 'image/webp' : b.slice(4, 8).toString() === 'ftyp' ? 'video/mp4' : null;
  return { buffer, size: buffer.length, mimetype: sniff || (String(f.type).includes('/') ? f.type : 'image/jpeg') };
});
const fields = z.object({
  title: z.string().trim().min(2).max(60), description: z.string().trim().min(10).max(600),
  era: era.optional(), category: category.optional(), suggestedPriceUsd: usd.optional(),
  tags: z.preprocess((v) => (typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : v), tags.optional())
});

export const group = 'Create & Submit';
export const routes = [
  {
    method: 'post', path: '/submissions', auth: 'user', upload,
    summary: 'Submit artwork for review. multipart/form-data: files (1-5; JPG/PNG/GIF/MP4, 50MB), title, description, era, category, tags (comma separated)',
    handler: async (req) => {
      const parsed = fields.safeParse(req.body);
      if (!parsed.success) throw bad('validation', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
      return { submission: await createSubmission({ wallet: req.user.wallet, fields: parsed.data, files: req.files || fromJson(req.body?.files) }) };
    }
  }
];
