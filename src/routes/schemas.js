import { z } from 'zod';
import { CATEGORIES, ERAS, RARITIES } from '../lib/constants.js';

export const wallet = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, 'invalid wallet address');
export const idParam = z.object({ id: z.string().min(1).max(128) });
export const usd = z.coerce.number().positive().max(1_000_000);
export const era = z.enum(Object.keys(ERAS));
export const category = z.enum(CATEGORIES);
export const rarity = z.enum(RARITIES);
export const page = { page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(24) };
/** comma-separated filter: ?era=vice,sa  (every value must be one of the allowed ones) */
const csv = (allowed) => z.string().max(200).transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean)).refine((a) => a.length && a.every((x) => allowed.includes(x)), { message: `must be a comma-separated list of: ${allowed.join(', ')}` });
export const eraCsv = csv(Object.keys(ERAS));
export const categoryCsv = csv(CATEGORIES);
export const rarityCsv = csv(RARITIES);
export const tags = z.array(z.string().trim().min(1).max(30)).max(8);
