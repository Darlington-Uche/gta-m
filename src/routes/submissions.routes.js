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
  return { buffer, size: buffer.length, mimetype: f.type };
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
