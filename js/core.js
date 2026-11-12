/* GTA Market — core: state, API client, wallet, prepare → sign → submit flow, UI helpers. No build step. */
const CFG = window.GTA_CONFIG || {};
export const D = window.GTA_DATA || { art: [], collections: [], eras: {}, eraShort: {} };

/* ---------- storage ---------- */
const mem = {};
export const ls = {
  get(k, d) { try { const v = localStorage.getItem('gta_' + k); return v == null ? (k in mem ? mem[k] : d) : JSON.parse(v); } catch (e) { return k in mem ? mem[k] : d; } },
  set(k, v) { mem[k] = v; try { localStorage.setItem('gta_' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
  del(k) { delete mem[k]; try { localStorage.removeItem('gta_' + k); } catch (e) { /* ignore */ } }
};

/* ---------- state + tiny event bus ---------- */
export const S = { online: false, collections: [], wallet: ls.get('walletAddr', null), provider: ls.get('provider', null), balance: null, me: null, adminPw: (() => { try { return sessionStorage.getItem('gta_adm'); } catch (e) { return null; } })(), unread: 0, likes: new Set() };
const bus = {};
export const on = (ev, fn) => { (bus[ev] = bus[ev] || []).push(fn); };
export const emit = (ev, d) => (bus[ev] || []).forEach((f) => { try { f(d); } catch (e) { console.error(e); } });

export class ApiError extends Error { constructor(message, code, status) { super(message); this.code = code; this.status = status; } }

/* ---------- formatting ---------- */
export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const usd = (n) => (n == null ? '—' : n === 0 ? 'FREE' : '$' + (n >= 100 ? Math.round(n).toLocaleString() : (Math.round(n * 100) / 100).toString()));
export const short = (a) => (a ? a.slice(0, 4) + '…' + a.slice(-4) : '');
export const ago = (t) => { const s = Math.max(1, (Date.now() - new Date(t).getTime()) / 1000 | 0); return s < 60 ? s + 's ago' : s < 3600 ? (s / 60 | 0) + 'm ago' : s < 86400 ? (s / 3600 | 0) + 'h ago' : (s / 86400 | 0) + 'd ago'; };
export const thumb = (u, w) => (u && /^https:\/\/raw\.githubusercontent\.com\//.test(u) ? 'https://wsrv.nl/?url=' + encodeURIComponent(u) + '&w=' + (w || 560) + '&we&output=webp&q=78' : u);
export const $ = (s, r) => (r || document).querySelector(s);
export const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const initials = (s) => String(s || '?').replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || '?';

/* ---------- supabase (REST + RPC), no backend in between ---------- */
const SB = (CFG.SUPABASE_URL || '').replace(/\/$/, ''), KEY = CFG.SUPABASE_KEY || '';
async function sbFetch(path, { method = 'GET', body, headers = {}, raw } = {}) {
  let res;
  try { res = await fetch(SB + path, { method, headers: { apikey: KEY, authorization: 'Bearer ' + KEY, ...(body !== undefined && !raw ? { 'content-type': 'application/json' } : {}), ...headers }, body: raw ? body : body !== undefined ? JSON.stringify(body) : undefined }); }
  catch (e) { throw new ApiError('Cannot reach the server. Check your connection.', 'network', 0); }
  if (!res.ok) { const j = await res.json().catch(() => ({})); throw new ApiError(j.message || j.error || 'Request failed (' + res.status + ')', j.code || 'http_' + res.status, res.status); }
  return res;
}
export async function rpc(name, args) { const r = await sbFetch('/rest/v1/rpc/' + name, { method: 'POST', body: args || {} }); const t = await r.text(); return t ? JSON.parse(t) : null; }
export async function select(table, query, { count } = {}) {
  const r = await sbFetch('/rest/v1/' + table + (query ? '?' + query : ''), { headers: count ? { prefer: 'count=exact' } : {} });
  const rows = await r.json(); const cr = r.headers.get('content-range'); return { rows, total: cr && cr.includes('/') ? +cr.split('/')[1] : rows.length };
}
export async function upload(file) {
  const ext = (file.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg'); const path = Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + '.' + ext;
  await sbFetch('/storage/v1/object/m-art/' + path, { method: 'POST', body: file, raw: true, headers: { 'content-type': file.type, 'x-upsert': 'false' } });
  return SB + '/storage/v1/object/public/m-art/' + path;
}

/* ---------- item normalisation ---------- */
export function itemOf(r) {
  const state = r.owner ? (r.listing_usd != null ? 'listed' : 'minted') : 'mint';
  return { id: r.id, title: r.title, description: r.description, img: r.image, artist: r.artist, era: r.era, eraLabel: r.era_label, eraShort: (D.eraShort || {})[r.era] || r.era_label || r.era, category: r.category, rarity: r.rarity,
    tags: r.tags || [], likes: r.likes || 0, owner: r.owner, mintedAt: r.minted_at, hidden: r.hidden, state, free: state === 'mint' && +r.price_usd === 0, priceUsd: state === 'mint' ? +r.price_usd : state === 'listed' ? +r.listing_usd : null, basePrice: +r.price_usd, listing: r.listing_usd != null ? +r.listing_usd : null };
}
const RAR = { Common: 0, Rare: 5, Epic: 15, Legendary: 40 };
async function seedIfEmpty() {
  const seed = (D.art || []).map((a) => ({ id: String(a.id), title: a.title, description: a.description, image: a.img, era: a.era, era_label: a.eraLabel, category: a.category, rarity: a.rarity, tags: a.tags || [], artist: a.artist, price_usd: RAR[a.rarity] ?? 0 }));
  if (seed.length) await rpc('m_admin_seed', { pw: '', p: seed });
}
const enc = encodeURIComponent;
export async function items(q = {}) {
  const f = [];
  for (const k of ['era', 'category', 'rarity']) if (q[k]) f.push(`${k}=eq.${enc(q[k])}`);
  if (q.q) { const n = q.q.replace(/[(),*]/g, ' ').trim(); if (n) f.push(`or=(title.ilike.*${enc(n)}*,category.ilike.*${enc(n)}*,era_label.ilike.*${enc(n)}*)`); }
  if (q.status === 'free') f.push('owner=is.null', 'price_usd=eq.0'); else if (q.status === 'mint') f.push('owner=is.null'); else if (q.status === 'minted') f.push('owner=not.is.null'); else if (q.status === 'listed') f.push('listing_usd=not.is.null');
  if (q.owner) f.push('owner=eq.' + enc(q.owner));
  const order = { price_low: 'price_usd.asc', price_high: 'price_usd.desc', liked: 'likes.desc,title.asc', recent: 'created_at.desc,title.asc' }[q.sort || 'recent'];
  const limit = +q.limit || 24, page = +q.page || 1;
  const { rows, total } = await select('m_items', `select=*&${f.join('&')}&order=${order}&limit=${limit}&offset=${(page - 1) * limit}`, { count: true });
  return { total, page, limit, items: rows.map(itemOf) };
}
export async function item(id) {
  const { rows } = await select('m_items', `select=*&id=eq.${enc(id)}`);
  if (!rows[0]) throw new ApiError('Artwork not found', 'not_found', 404);
  return itemOf(rows[0]);
}
export const offersFor = async (id) => (await select('m_offers', `select=*&item_id=eq.${enc(id)}&status=eq.active&order=usd.desc`)).rows;
export const salesFor = async (id) => (await select('m_sales', `select=*&item_id=eq.${enc(id)}&order=created_at.desc&limit=20`)).rows;
export const recentSales = async (n = 20) => (await select('m_sales', `select=*,m_items(title,image)&order=created_at.desc&limit=${n}`)).rows;
export async function loadCollections() {
  const { rows } = await select('m_items', 'select=era,era_label,owner,price_usd,listing_usd,image,likes&limit=2000');
  const by = {};
  for (const r of rows) {
    const c = by[r.era] || (by[r.era] = { id: r.era, era: r.era, label: r.era_label, items: 0, minted: 0, owners: new Set(), floor: Infinity, likes: 0, cover: null });
    c.items++; c.likes += r.likes || 0; if (r.owner) { c.minted++; c.owners.add(r.owner); } const p = r.listing_usd != null ? +r.listing_usd : r.owner ? null : +r.price_usd; if (p != null && p < c.floor) c.floor = p; c.cover = c.cover || r.image;
  }
  const order = Object.keys(D.eras || {});
  S.collections = Object.values(by).map((c) => {
    const m = (D.collections || []).find((x) => x.id === c.id);
    const pick = m && m.cover && !/^data:/.test(m.cover) ? m.cover : c.cover;
    return { id: c.id, name: (m && m.name) || c.label || c.id, short: (D.eraShort || {})[c.id] || c.id, blurb: (m && m.blurb) || '', cover: pick, items: c.items, minted: c.minted, owners: c.owners.size, floorUsd: c.floor === Infinity ? null : c.floor, likes: c.likes };
  }).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  return S.collections;
}
export async function stats() {
  const c = await loadCollections();
  const { rows } = await select('m_sales', 'select=usd,type&limit=5000');
  return { items: c.reduce((s, x) => s + x.items, 0), minted: c.reduce((s, x) => s + x.minted, 0), volume: rows.reduce((s, r) => s + +r.usd, 0), sales: rows.filter((r) => r.type !== 'mint').length };
}

/* ---------- wallet ---------- */
const PROVIDERS = {
  Phantom: () => (window.phantom && window.phantom.solana && window.phantom.solana.isPhantom ? window.phantom.solana : window.solana && window.solana.isPhantom ? window.solana : null),
  Solflare: () => (window.solflare && window.solflare.isSolflare ? window.solflare : null),
  Backpack: () => (window.backpack && window.backpack.isBackpack ? window.backpack : null)
};
const INSTALL = { Phantom: 'https://phantom.app/download', Solflare: 'https://solflare.com/download', Backpack: 'https://backpack.app/downloads' };
const stdIcons = {};
try {
  const reg = { register: (...ws) => { ws.forEach((w) => { if (w && w.name && w.icon) stdIcons[w.name.toLowerCase()] = w.icon; }); return () => {}; } };
  window.addEventListener('wallet-standard:register-wallet', (e) => { try { e.detail(reg); } catch (_) { /* ignore */ } });
  window.dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: reg }));
} catch (_) { /* ignore */ }
export const walletIcon = (n) => stdIcons[n.toLowerCase()] || `assets/wallets/${n.toLowerCase()}.png`;
export const detectWallets = () => Object.keys(PROVIDERS).map((name) => ({ name, found: !!PROVIDERS[name](), install: INSTALL[name] }));
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58(bytes) { let n = 0n; for (const b of bytes) n = (n << 8n) | BigInt(b); let o = ''; while (n > 0n) { o = B58[Number(n % 58n)] + o; n /= 58n; } for (const b of bytes) { if (b === 0) o = '1' + o; else break; } return o; }
export const guestWallet = () => { let g = ls.get('guest', null); if (!g) { g = b58(crypto.getRandomValues(new Uint8Array(32))); ls.set('guest', g); } return g; };

export async function refreshMe() {
  if (!S.wallet) return null;
  const me = await rpc('m_profile', { p_wallet: S.wallet });
  S.balance = me.balance; S.unread = me.unread || 0; S.me = me;
  emit('unread', S.unread); emit('balance', S.balance);
  return me;
}
async function loadLikes() { try { S.likes = new Set((await rpc('m_my_likes', { p_voter: S.wallet || visitorId() })) || []); } catch (e) { /* ignore */ } }
export async function connect(name) {
  let wallet;
  if (name === 'guest') wallet = guestWallet();
  else {
    const p = PROVIDERS[name] && PROVIDERS[name]();
    if (!p) { window.open(INSTALL[name], '_blank', 'noopener'); throw new ApiError(name + ' is not installed in this browser.', 'no_wallet', 0); }
    const conn = await p.connect();
    wallet = (conn && conn.publicKey ? conn.publicKey : p.publicKey).toString();
    try { await p.signMessage(new TextEncoder().encode('Sign in to GTA Market\nWallet: ' + wallet + '\nThis is free and does not send a transaction.'), 'utf8'); }
    catch (e) { throw new ApiError('Sign-in cancelled in your wallet.', 'rejected', 0); }
  }
  S.wallet = wallet; S.provider = name; ls.set('walletAddr', wallet); ls.set('provider', name);
  await refreshMe(); await loadLikes(); emit('auth', wallet); return wallet;
}
export function signOut() {
  const p = S.provider && PROVIDERS[S.provider] && PROVIDERS[S.provider]();
  if (p && p.disconnect) { try { p.disconnect(); } catch (e) { /* ignore */ } }
  S.wallet = null; S.provider = null; S.unread = 0; S.balance = null; S.me = null; ls.del('walletAddr'); ls.del('provider');
  loadLikes(); emit('auth', null);
}
export function visitorId() {
  let v = ls.get('vid', null);
  if (!v) { const a = new Uint8Array(18); crypto.getRandomValues(a); v = Array.from(a, (b) => b.toString(16).padStart(2, '0')).join(''); ls.set('vid', v); }
  return v;
}
export const me = () => S.wallet;

export async function init() {
  try {
    const first = await select('m_items', 'select=id&limit=1');
    if (!first.rows.length) await seedIfEmpty();
    S.online = true;
    await loadCollections();
    if (S.wallet) await refreshMe().catch(() => { S.wallet = null; });
    await loadLikes();
  } catch (e) { console.warn('[GTA] database unreachable:', e.message); S.online = false; S.initError = e.message; }
}

/* ---------- UI: toast, modal, tx dialog, wallet picker ---------- */
export function toast(msg, kind) {
  let box = $('#toasts'); if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
  const t = document.createElement('div'); t.className = 'toast ' + (kind || ''); t.textContent = msg; box.appendChild(t);
  requestAnimationFrame(() => t.classList.add('in'));
  setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 300); }, kind === 'bad' ? 5200 : 2800);
}
export function modal(html, setup, cls) {
  const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = `<div class="sheet glass ${cls || ''}" role="dialog" aria-modal="true">${html}</div>`;
  const close = () => { m.classList.remove('in'); setTimeout(() => m.remove(), 220); document.removeEventListener('keydown', esck); };
  const esck = (e) => { if (e.key === 'Escape') close(); };
  m.addEventListener('mousedown', (e) => { if (e.target === m) close(); });
  document.addEventListener('keydown', esck);
  document.body.appendChild(m); requestAnimationFrame(() => m.classList.add('in'));
  m.close = close; if (setup) setup(m, close); return m;
}
export const needWallet = () => { walletModal(); };
export const money = (n) => (n == null ? '—' : '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
export function walletModal() {
  const list = detectWallets();
  const rows = list.map((w) => `<button class="wrow" data-w="${w.name}"><img src="${esc(walletIcon(w.name))}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'wfallback',textContent:'${w.name[0]}'}))"><span><b>${w.name}</b><small>${w.found ? 'Detected' : 'Not installed — tap to get it'}</small></span><i class="arr">→</i></button>`).join('');
  const guest = `<div class="sep">No wallet handy?</div><button class="wrow" data-w="guest"><span class="wfallback">⚡</span><span><b>Instant guest wallet</b><small>Created in this browser · starts with $1,000 play money</small></span><i class="arr">→</i></button>`;
  modal(`<button class="x" data-x aria-label="Close">✕</button><h2 class="display">CONNECT<br>WALLET</h2><p class="muted">Sign a free message to sign in. No transaction, no real money — everything here is devnet play money.</p><div class="wlist">${rows}${guest}</div>`, (m, close) => {
    $('[data-x]', m).onclick = close;
    m.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-w]'); if (!b) return;
      b.classList.add('busy');
      try { await connect(b.dataset.w); close(); toast('Wallet connected'); } catch (err) { toast(err.message, 'bad'); } finally { b.classList.remove('busy'); }
    });
  });
}
/** Runs fn() inside a small progress dialog; shows success (with confetti) or the error. */
export async function runTx(title, fn, okText) {
  const m = modal(`<h2 class="display">${esc(title)}</h2><div class="spin"><i></i><span class="txmsg muted">Working…</span></div><div class="txfoot"></div>`, null, 'txd');
  const msg = $('.txmsg', m), foot = $('.txfoot', m);
  try {
    const r = await fn();
    $('.spin i', m).className = 'okc'; msg.innerHTML = `<b class="ok">${esc(okText || 'Done')}</b>`;
    foot.innerHTML = '<button class="btn primary" data-ok>Nice</button>'; $('[data-ok]', m).onclick = m.close; burst(); refreshMe().catch(() => {});
    return r;
  } catch (e) {
    $('.spin i', m).className = 'badc'; msg.innerHTML = `<b class="bad">${esc(e.message)}</b>`;
    foot.innerHTML = '<button class="btn" data-ok>Close</button>'; $('[data-ok]', m).onclick = m.close; throw e;
  }
}
export function burst() {
  const c = document.createElement('div'); c.className = 'burst'; document.body.appendChild(c);
  const cols = ['#c8ff2e', '#ff4d1f', '#ff3d8b', '#f3ecdc'];
  for (let i = 0; i < 46; i++) { const p = document.createElement('i'); const a = Math.random() * Math.PI * 2, d = 120 + Math.random() * 280; p.style.cssText = `--x:${Math.cos(a) * d}px;--y:${Math.sin(a) * d - 80}px;--r:${Math.random() * 720 - 360}deg;background:${cols[i % 4]};left:50%;top:55%;animation-delay:${Math.random() * 80}ms`; c.appendChild(p); }
  setTimeout(() => c.remove(), 1400);
}

/* ---------- likes ---------- */
export async function toggleLike(id) {
  const r = await rpc('m_like', { p_item: String(id), p_voter: S.wallet || visitorId() });
  if (r.liked) S.likes.add(String(id)); else S.likes.delete(String(id));
  return r;
}

export const initialsOf = initials;
