// Telegram: posts the live feed (mints, buys, sells) and every new drop to the team group.
// New drops come with ✅ (keep) and "Remove from marketplace" buttons; only admins of the group can press them.
// The bot token lives in the private database (meta/telegram), never in the public code bundle.
import { col, getDoc, now, queryDocs } from '../lib/db.js';
import { config } from '../config/index.js';
import { log } from '../lib/logger.js';
import { masked } from './items.service.js';
import { restoreLaunch } from './adminviews.service.js';
import { reviewLaunch } from './launches.service.js';
import { getSolUsd } from './priceOracle.js';

const SITE = (process.env.SITE_URL || 'https://www.gta-marketplace.xyz').replace(/\/$/, '');
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const short = (w) => (w ? `${w.slice(0, 4)}…${w.slice(-4)}` : '?');
const money = (u) => (u ? `$${u >= 100 ? Math.round(u).toLocaleString('en-US') : (+u).toFixed(2).replace(/\.00$/, '')}` : 'FREE');

const settings = async () => (await getDoc('meta', 'telegram')) || {};
async function tg(st, method, body) {
  const r = await fetch(`https://api.telegram.org/bot${st.token}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(`telegram ${method}: ${j.description || r.status}`);
  return j.result;
}
async function name(w) {
  if (!w) return '?';
  if (w === config.auth.platformWallet) return 'GTA Marketplace';
  const u = await getDoc('users', w).catch(() => null);
  return u && u.username ? '@' + u.username : u && u.name ? u.name : short(w);
}
async function post(st, { photo, text, buttons }) {
  const reply_markup = buttons ? { inline_keyboard: buttons } : undefined;
  if (photo && /^https:/.test(photo)) {
    try { return await tg(st, 'sendPhoto', { chat_id: st.chatId, photo, caption: text, parse_mode: 'HTML', reply_markup }); } catch (e) { log.warn('tg photo', e.message); }
  }
  return tg(st, 'sendMessage', { chat_id: st.chatId, text, parse_mode: 'HTML', reply_markup, link_preview_options: { is_disabled: true } });
}

const dropButtons = (id, state, by) => [
  state === 'ok' ? [{ text: `✅ Approved${by ? ' by ' + by : ''}`, callback_data: 'noop' }, { text: 'Remove from marketplace', callback_data: 'rm:' + id }]
    : state === 'rm' ? [{ text: `🚫 Removed${by ? ' by ' + by : ''}`, callback_data: 'noop' }, { text: '↩︎ Put back', callback_data: 'rs:' + id }]
      : [{ text: '✅', callback_data: 'ok:' + id }, { text: 'Remove from marketplace', callback_data: 'rm:' + id }],
  [{ text: 'Open drop', url: `${SITE}/#/drop/${encodeURIComponent(id)}` }]
];

/** Job step: make sure the webhook points at us, then post anything new (at most a few messages per run). */
export async function pushTelegram() {
  const st = await settings();
  if (!st.token || !st.chatId || process.env.CHAIN_DRIVER === 'mock') return { skipped: true };
  const hook = `${config.publicBaseUrl}/telegram/webhook`;
  if (st.webhookUrl !== hook && st.webhookSecret) {
    await tg(st, 'setWebhook', { url: hook, secret_token: st.webhookSecret, allowed_updates: ['callback_query'] });
    await col('meta').doc('telegram').set({ webhookUrl: hook }, { merge: true });
  }
  const t = now();
  if (!st.saleCursor || !st.launchCursor) { await col('meta').doc('telegram').set({ saleCursor: st.saleCursor || t, launchCursor: st.launchCursor || t }, { merge: true }); await post(st, { text: '🟢 <b>GTA Marketplace is connected.</b>\nNew drops, mints and sales will show up here.' }); return { started: true }; } // don't replay history
  let sent = 0, saleCursor = st.saleCursor, launchCursor = st.launchCursor;
  const solUsd = await getSolUsd().catch(() => null), solTxt = (u) => (solUsd && u ? ` (≈ ${(u / solUsd).toFixed(3)} SOL)` : '');

  // new drops first — they need a decision
  const drops = (await queryDocs(col('launches'))).filter((l) => (l.status === 'approved' || l.status === 'live') && (l.publishedAt || 0) > launchCursor).sort((a, b) => a.publishedAt - b.publishedAt).slice(0, 3);
  for (const l of drops) {
    const s = (l.stages || [])[0] || {};
    const text = `🚀 <b>New drop: ${esc(l.name)}</b>\nby ${esc(await name(l.wallet))}\n\n💰 ${money(s.priceUsd)}${solTxt(s.priceUsd)} · ${l.supply || (l.art || []).length} pieces · ${s.perWallet || 1} per wallet\n⏱ ${s.start > t ? 'Starts ' + new Date(s.start).toUTCString().slice(5, 22) + ' UTC' : 'Minting now'}`;
    await post(st, { photo: l.banner || l.logo, text, buttons: dropButtons(l.id) }); sent++; launchCursor = Math.max(launchCursor, l.publishedAt);
  }
  // the feed: mints, buys, sells
  const sales = (await queryDocs(col('sales'))).filter((x) => (x.createdAt || 0) > saleCursor).sort((a, b) => a.createdAt - b.createdAt).slice(0, 8 - sent);
  for (const x of sales) {
    const raw = await getDoc('items', String(x.itemId)).catch(() => null), it = raw ? masked({ id: String(x.itemId), ...raw }) : { title: 'NFT' };
    const head = x.type === 'mint' ? `✨ <b>Minted</b> · ${esc(it.title)}` : `🟢 <b>Sold</b> · ${esc(it.title)}`;
    const who = x.type === 'mint' ? `by ${esc(await name(x.buyer))}` : `${esc(await name(x.seller))} → ${esc(await name(x.buyer))}${x.type === 'offer' ? ' (offer)' : ''}`;
    const text = `${head}\n${money(x.usd)}${solTxt(x.usd)}\n${who}${x.signature ? `\n<a href="https://solscan.io/tx/${esc(x.signature)}${config.isMainnet ? '' : '?cluster=devnet'}">View tx</a>` : ''}`;
    await post(st, { photo: it.image, text, buttons: [[{ text: 'Open', url: `${SITE}/#/art/${encodeURIComponent(x.itemId)}` }]] }); sent++; saleCursor = Math.max(saleCursor, x.createdAt);
  }
  if (sent) await col('meta').doc('telegram').set({ saleCursor, launchCursor, lastSentAt: t }, { merge: true });
  return { sent };
}

/** Button presses from the group. Only the group's admins can approve or remove. */
export async function telegramWebhook(headers, update) {
  const st = await settings();
  if (!st.webhookSecret || headers['x-telegram-bot-api-secret-token'] !== st.webhookSecret) return { ignored: true };
  const q = update && update.callback_query; if (!q || !q.data) return { ok: true };
  const answer = (text) => tg(st, 'answerCallbackQuery', { callback_query_id: q.id, text, show_alert: false }).catch(() => {});
  const [act, id] = q.data.split(':');
  if (act === 'noop' || !id) return answer('');
  const m = await tg(st, 'getChatMember', { chat_id: st.chatId, user_id: q.from.id }).catch(() => null);
  if (!m || !['creator', 'administrator'].includes(m.status)) return answer('Only group admins can do that');
  const by = q.from.username ? '@' + q.from.username : q.from.first_name || 'admin';
  try {
    if (act === 'rm') { await reviewLaunch({ id, by: 'telegram:' + by, approve: false, reason: 'Removed from the marketplace' }).catch((e) => { if (e.code !== 'already_reviewed') throw e; }); }
    if (act === 'rs') await restoreLaunch({ id, by: 'telegram:' + by });
    await tg(st, 'editMessageReplyMarkup', { chat_id: q.message.chat.id, message_id: q.message.message_id, reply_markup: { inline_keyboard: dropButtons(id, act === 'rm' ? 'rm' : 'ok', by) } }).catch(() => {});
    await answer(act === 'rm' ? 'Removed from the marketplace' : act === 'rs' ? 'Back on the marketplace' : 'Approved');
  } catch (e) { await answer(e.message.slice(0, 180)); }
  return { ok: true };
}
