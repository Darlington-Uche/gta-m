/* GTA Market — core: state, API client, wallet, prepare → sign → submit flow, UI helpers. No build step. */
const CFG = window.GTA_CONFIG || {};
const API = (CFG.API_URL || '').replace(/\/$/, '');
export const D = window.GTA_DATA || { art: [], collections: [], eras: {}, eraShort: {} };

/* ---------- storage ---------- */
const mem = {};
export const ls = {
  get(k, d) { try { const v = localStorage.getItem('gta_' + k); return v == null ? (k in mem ? mem[k] : d) : JSON.parse(v); } catch (e) { return k in mem ? mem[k] : d; } },
  set(k, v) { mem[k] = v; try { localStorage.setItem('gta_' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
  del(k) { delete mem[k]; try { localStorage.removeItem('gta_' + k); } catch (e) { /* ignore */ } }
};

/* ---------- state + tiny event bus ---------- */
export const S = { online: false, meta: null, site: {}, collections: [], token: ls.get('jwt', null), wallet: ls.get('walletAddr', null), provider: ls.get('provider', null), unread: 0, likes: new Set() };
const bus = {};
export const on = (ev, fn) => { (bus[ev] = bus[ev] || []).push(fn); };
export const emit = (ev, d) => (bus[ev] || []).forEach((f) => { try { f(d); } catch (e) { console.error(e); } });
export class ApiError extends Error { constructor(message, code, status) { super(message); this.code = code; this.status = status; } }

/* ---------- formatting ---------- */
export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const usd = (n) => (n == null ? '—' : n === 0 ? 'FREE' : '$' + (n >= 100 ? Math.round(n).toLocaleString() : (Math.round(n * 100) / 100).toString()));
export const sol = (n) => (n == null ? '' : (Math.round(n * 1000) / 1000).toString() + ' SOL');
export const short = (a) => (a ? a.slice(0, 4) + '…' + a.slice(-4) : '');
export const ago = (t) => { const s = Math.max(1, (Date.now() - new Date(t).getTime()) / 1000 | 0); return s < 60 ? s + 's ago' : s < 3600 ? (s / 60 | 0) + 'm ago' : s < 86400 ? (s / 3600 | 0) + 'h ago' : (s / 86400 | 0) + 'd ago'; };
export const $ = (s, r) => (r || document).querySelector(s);
export const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
export const explorer = (sig) => `https://explorer.solana.com/tx/${sig}${S.meta && S.meta.network === 'devnet' ? '?cluster=devnet' : ''}`;
export const thumb = (u, w) => (u && /^https:\/\/raw\.githubusercontent\.com\//.test(u) ? 'https://wsrv.nl/?url=' + encodeURIComponent(u) + '&w=' + (w || 560) + '&we&output=webp&q=78' : u);

/* ---------- image placeholders: shown when an artwork has no image yet (or it fails to load) ---------- */
export function placeholder(title) {
  const t = String(title || 'GTA').toUpperCase().slice(0, 22);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff2d8a"/><stop offset=".55" stop-color="#8a2be2"/><stop offset="1" stop-color="#1b0836"/></linearGradient><radialGradient id="s" cx=".5" cy=".38" r=".5"><stop offset="0" stop-color="#ffc93c"/><stop offset=".5" stop-color="#ff7a1a" stop-opacity=".8"/><stop offset="1" stop-color="#ff2d8a" stop-opacity="0"/></radialGradient></defs><rect width="400" height="500" fill="url(#g)"/><circle cx="200" cy="190" r="150" fill="url(#s)" opacity=".7"/><text x="200" y="300" text-anchor="middle" font-family="Impact,Arial Narrow,sans-serif" font-size="64" fill="#fff" opacity=".92">GTA</text><text x="200" y="345" text-anchor="middle" font-family="Arial,sans-serif" font-size="15" font-weight="700" letter-spacing="3" fill="#fff" opacity=".7">${esc(t)}</text><text x="200" y="470" text-anchor="middle" font-family="Arial,sans-serif" font-size="11" letter-spacing="4" fill="#fff" opacity=".45">ARTWORK COMING SOON</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
window.__ph = (img) => { img.onerror = null; img.src = placeholder(img.alt); };
/** <img> that falls back to the placeholder when src is empty or broken */
export const imgTag = (src, title, w, cls) => `<img ${cls ? `class="${cls}" ` : ''}loading="lazy" decoding="async" alt="${esc(title)}" src="${esc(src ? thumb(src, w || 560) : placeholder(title))}" onerror="__ph(this)">`;

/* ---------- http ---------- */
function visitorId() {
  let v = ls.get('vid', null);
  if (!v) { const a = new Uint8Array(18); crypto.getRandomValues(a); v = Array.from(a, (b) => b.toString(16).padStart(2, '0')).join(''); ls.set('vid', v); }
  return v;
}
const CACHE_MS = 20000;
const cGet = (k) => { try { const r = JSON.parse(sessionStorage.getItem('gta_c:' + k)); return r && Date.now() - r.t < CACHE_MS ? r.j : null; } catch (e) { return null; } };
const cSet = (k, j) => { try { sessionStorage.setItem('gta_c:' + k, JSON.stringify({ t: Date.now(), j })); } catch (e) { cClear(); } };
export const cClear = () => { try { Object.keys(sessionStorage).filter((k) => k.startsWith('gta_c:')).forEach((k) => sessionStorage.removeItem(k)); } catch (e) { /* ignore */ } };
export const qs = (o) => { const p = new URLSearchParams(); Object.entries(o || {}).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') p.set(k, v); }); const s = p.toString(); return s ? '?' + s : ''; };

export async function http(method, path, body, opt = {}) {
  const headers = { 'x-visitor-id': visitorId() };
  if (S.token && opt.auth !== false) headers.authorization = 'Bearer ' + S.token;
  let payload;
  if (body !== undefined && body !== null) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const cacheable = method === 'GET' && opt.auth === false && /^\/(meta|collections|stats)(\?|$)|^\/items\?/.test(path);
  if (cacheable) { const c = cGet(path); if (c) return c; }
  let res;
  try { res = await fetch(API + path, { method, cache: 'no-store', headers, body: payload }); } catch (e) { throw new ApiError('Cannot reach the server. Check your connection.', 'network', 0); }
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) {
    const err = json.error || {};
    if (res.status === 401 && S.token && opt.auth !== false) signOut(true);
    throw new ApiError(err.message || 'Request failed (' + res.status + ')', err.code || 'http_' + res.status, res.status);
  }
  if (cacheable) cSet(path, json); else if (method !== 'GET') cClear();
  return json;
}

/* ---------- item normalisation ---------- */
export function itemOf(it) {
  const listing = it.listing || null, p = it.primary || {};
  const state = !it.minted ? 'mint' : listing ? 'listed' : 'minted';
  return { id: it.id, title: it.title, description: it.description, img: it.image, artist: it.artist || 'GTA Market', era: it.era, eraLabel: it.eraLabel, eraShort: it.eraShort || (D.eraShort || {})[it.era] || it.era,
    category: it.category, rarity: it.rarity, tags: it.tags || [], likes: it.likes || 0, minted: !!it.minted, owner: it.owner, asset: it.asset, mintedAt: it.mintedAt, collection: it.collection,
    floorUsd: it.floorUsd ?? null, state, free: state === 'mint' && !!p.free, mintable: !!p.available,
    priceUsd: state === 'mint' ? p.priceUsd : listing ? listing.priceUsd : null, priceSol: state === 'mint' ? p.priceSol : listing ? listing.priceSol : null, listing, offers: it.offers || { count: 0, topUsd: null } };
}
export async function items(q = {}) {
  const r = await http('GET', '/items' + qs(q), null, { auth: false });
  return { total: r.total, page: r.page, limit: r.limit, items: r.items.map(itemOf), facets: r.facets };
}
export async function item(id) { return itemOf((await http('GET', '/items/' + encodeURIComponent(id), null, { auth: false })).item); }
export const historyFor = async (id) => (await http('GET', '/items/' + encodeURIComponent(id) + '/history', null, { auth: false }));
export const offersFor = async (id) => (await http('GET', '/items/' + encodeURIComponent(id) + '/offers', null, { auth: false })).offers;
export async function loadCollections() {
  const r = await http('GET', '/collections', null, { auth: false });
  S.collections = r.collections.map((c) => { const m = (D.collections || []).find((x) => x.id === c.id); const fb = m && m.cover && !/^data:/.test(m.cover) ? m.cover : ''; return { ...c, cover: c.cover || fb, banner: c.banner || '' }; });
  return S.collections;
}
export async function stats() { return (await http('GET', '/stats', null, { auth: false })).stats; }
export const recentSales = async (n = 12) => (await http('GET', '/activity?limit=' + n, null, { auth: false })).activity;

/* ---------- wallets ---------- */
// Wallet Standard: modern wallets (Jupiter, and newer Phantom / Solflare / Backpack builds) register themselves here.
const stdWallets = {};
try {
  const reg = { register: (...ws) => { ws.forEach((w) => { if (w && w.name && w.features && w.features['standard:connect'] && w.features['solana:signTransaction']) stdWallets[w.name.toLowerCase()] = w; }); return () => {}; } };
  window.addEventListener('wallet-standard:register-wallet', (e) => { try { e.detail(reg); } catch (_) { /* ignore */ } });
  window.dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: reg }));
} catch (_) { /* ignore */ }
const findStd = (key) => Object.entries(stdWallets).find(([n]) => n.includes(key))?.[1] || null;
/** Wraps a Wallet Standard wallet so it looks like the classic injected provider the rest of the app uses. */
function stdProvider(w) {
  let acct = null;
  const pick = (accs) => (accs || []).find((a) => (a.chains || []).some((c) => c.startsWith('solana:'))) || (accs || [])[0] || null;
  return {
    get publicKey() { return acct ? { toString: () => acct.address } : null; },
    async connect() { const r = await w.features['standard:connect'].connect(); acct = pick(r.accounts || w.accounts); if (!acct) throw new ApiError('No Solana account in this wallet.', 'no_wallet', 0); return { publicKey: { toString: () => acct.address } }; },
    async signMessage(msg) { if (!acct) acct = pick(w.accounts); const f = w.features['solana:signMessage']; if (!f) throw new ApiError('This wallet cannot sign messages.', 'no_wallet', 0); const [r] = await f.signMessage({ account: acct, message: msg }); return { signature: r.signature }; },
    async signTransaction(tx) {
      if (!acct) acct = pick(w.accounts); if (!acct) await this.connect();
      const [r] = await w.features['solana:signTransaction'].signTransaction({ account: acct, transaction: tx.serialize(), chain: CFG.NETWORK === 'mainnet-beta' || (S.meta && S.meta.network === 'mainnet-beta') ? 'solana:mainnet' : 'solana:devnet' });
      return { serialize: () => r.signedTransaction };
    },
    disconnect() { try { w.features['standard:disconnect'] && w.features['standard:disconnect'].disconnect(); } catch (_) { /* ignore */ } }
  };
}
const stdCache = new WeakMap();
const viaStd = (key) => { const w = findStd(key); if (!w) return null; if (!stdCache.has(w)) stdCache.set(w, stdProvider(w)); return stdCache.get(w); };
const WALLETS = {
  Phantom: { site: 'phantom.com', install: 'https://phantom.com/download', get: () => (window.phantom && window.phantom.solana && window.phantom.solana.isPhantom ? window.phantom.solana : window.solana && window.solana.isPhantom ? window.solana : viaStd('phantom')), browse: (u) => `https://phantom.app/ul/browse/${encodeURIComponent(u)}?ref=${encodeURIComponent(location.origin)}` },
  Jupiter: { site: 'jup.ag', install: 'https://jup.ag/mobile', get: () => viaStd('jupiter') },
  Solflare: { site: 'solflare.com', install: 'https://solflare.com/download', get: () => (window.solflare && window.solflare.isSolflare ? window.solflare : viaStd('solflare')), browse: (u) => `https://solflare.com/ul/v1/browse/${encodeURIComponent(u)}?ref=${encodeURIComponent(location.origin)}` },
  Backpack: { site: 'backpack.app', install: 'https://backpack.app/downloads', get: () => (window.backpack && window.backpack.isBackpack ? window.backpack : viaStd('backpack')) }
};
const PROVIDERS = Object.fromEntries(Object.entries(WALLETS).map(([n, w]) => [n, w.get]));
const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
// The wallet's own icon when it is installed (it ships one through Wallet Standard), otherwise the wallet site's icon.
export const walletIcon = (n) => { const w = findStd(n.toLowerCase()); return (w && w.icon) || `https://www.google.com/s2/favicons?domain=${WALLETS[n] ? WALLETS[n].site : ''}&sz=128`; };
export const detectWallets = () => Object.keys(WALLETS).map((name) => ({ name, found: !!WALLETS[name].get(), install: WALLETS[name].install }));
const INSTALL = Object.fromEntries(Object.entries(WALLETS).map(([n, w]) => [n, w.install]));
/** No wallet in this browser: on phones open the site inside the wallet app's browser, otherwise the install page. */
function openWallet(name) {
  const w = WALLETS[name]; const url = isMobile() && w && w.browse ? w.browse(location.href) : INSTALL[name];
  if (isMobile() && w && w.browse) location.href = url; else window.open(url, '_blank', 'noopener');
}
const b64ToBytes = (b) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
const bytesToB64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
let web3p;
const loadWeb3 = () => {
  if (window.solanaWeb3) return Promise.resolve(window.solanaWeb3);
  if (!web3p) web3p = new Promise((res, rej) => { const s = document.createElement('script'); s.src = CFG.WEB3_CDN; s.onload = () => res(window.solanaWeb3); s.onerror = () => { web3p = null; rej(new ApiError('Could not load the Solana library.', 'web3', 0)); }; document.head.appendChild(s); });
  return web3p;
};
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58(bytes) { let n = 0n; for (const b of bytes) n = (n << 8n) | BigInt(b); let o = ''; while (n > 0n) { o = B58[Number(n % 58n)] + o; n /= 58n; } for (const b of bytes) { if (b === 0) o = '1' + o; else break; } return o; }
export function testWallets() {
  let w = ls.get('testWallets', null);
  if (!w) { w = ['Alice', 'Bob', 'Carol'].map((n) => ({ name: n, addr: b58(crypto.getRandomValues(new Uint8Array(32))) })); ls.set('testWallets', w); }
  return w;
}
export const isMock = () => !!(S.meta && S.meta.chain === 'mock');

let pollT = null;
async function authWith(token, wallet, provider) {
  S.token = token; S.wallet = wallet; S.provider = provider;
  ls.set('jwt', token); ls.set('walletAddr', wallet); ls.set('provider', provider);
  await refreshMe();
  if (!pollT) pollT = setInterval(() => { if (S.token) refreshMe().catch(() => {}); }, 30000);
  emit('auth', wallet);
}
export async function connect(name) {
  if (!S.online) throw new ApiError('The server is not reachable right now.', 'offline', 0);
  if (name.startsWith('test:')) {
    const w = testWallets().find((x) => x.name === name.slice(5));
    const r = await http('POST', '/dev/login', { wallet: w.addr, fundSol: 5 }, { auth: false });
    await authWith(r.token, w.addr, name); return w.addr;
  }
  const p = PROVIDERS[name] && PROVIDERS[name]();
  if (!p) { openWallet(name); throw new ApiError(isMobile() && WALLETS[name] && WALLETS[name].browse ? 'Opening ' + name + '…' : name + ' is not installed in this browser.', 'no_wallet', 0); }
  const conn = await p.connect();
  const wallet = (conn && conn.publicKey ? conn.publicKey : p.publicKey).toString();
  const { message, nonce } = await http('POST', '/auth/nonce', { wallet }, { auth: false });
  let signed; try { signed = await p.signMessage(new TextEncoder().encode(message), 'utf8'); } catch (e) { throw new ApiError('Sign-in cancelled in your wallet.', 'rejected', 0); }
  const r = await http('POST', '/auth/verify', { wallet, nonce, signature: bytesToB64(signed.signature || signed) }, { auth: false });
  await authWith(r.token, wallet, name); return wallet;
}
export function signOut(silent) {
  const p = S.provider && PROVIDERS[S.provider] && PROVIDERS[S.provider]();
  if (p && p.disconnect && !silent) { try { p.disconnect(); } catch (e) { /* ignore */ } }
  S.token = null; S.wallet = null; S.provider = null; S.unread = 0; S.likes = new Set();
  ls.del('jwt'); ls.del('walletAddr'); ls.del('provider'); emit('auth', null);
}
export async function refreshMe() {
  if (!S.token) return null;
  const me = await http('GET', '/me');
  S.unread = me.unread || 0;
  try { S.likes = new Set((await http('GET', '/likes/mine')).itemIds.map(String)); } catch (e) { /* ignore */ }
  emit('unread', S.unread);
  return me;
}
async function signTx(txB64) {
  if (S.provider && S.provider.startsWith('test:')) return (await http('POST', '/dev/sign', { txB64, wallet: S.wallet }, { auth: false })).signedTx;
  const p = PROVIDERS[S.provider] && PROVIDERS[S.provider]();
  if (!p) throw new ApiError('Reconnect your wallet to sign.', 'no_wallet', 0);
  const w3 = await loadWeb3();
  const signed = await p.signTransaction(w3.VersionedTransaction.deserialize(b64ToBytes(txB64)));
  return bytesToB64(signed.serialize());
}

/* ---------- prepare → sign → submit → confirm ---------- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isStale = (e) => e && (e.code === 'tx_expired' || /blockhash|expired/i.test(e.message || ''));
export async function act(method, path, body, ui) {
  try { return await actOnce(method, path, body, ui); } catch (e) {
    if (!isStale(e)) throw e;
    ui && ui('prepare');
    try { return await actOnce(method, path, body, ui); } catch (e2) { if (isStale(e2)) throw new ApiError('That took too long to approve and the transaction expired. Please try again and approve quickly.', 'tx_expired', 0); throw e2; }
  }
}
async function actOnce(method, path, body, ui) {
  if (!S.token) throw new ApiError('Connect your wallet first.', 'auth', 401);
  const step = (s, x) => ui && ui(s, x);
  step('prepare');
  const prep = await http(method, path, body);
  if (!prep.txB64) { step('done', prep); return { prep, tx: prep }; } // some actions (cancel offer, decline, unlist) need no signature
  step('sign', prep);
  let signedTx;
  try { signedTx = await signTx(prep.txB64); } catch (e) { if (e instanceof ApiError) throw e; throw new ApiError(/reject|denied|cancel/i.test(e.message || '') ? 'You cancelled the request in your wallet.' : (e.message || 'Wallet could not sign.'), 'rejected', 0); }
  step('submit', prep);
  let tx = (await http('POST', '/tx/submit', { ptxId: prep.ptxId, signedTx })).tx;
  for (let i = 0; i < 50 && tx.status !== 'confirmed'; i++) {
    step('confirm', tx);
    if (tx.status === 'failed' || tx.status === 'expired') break;
    await sleep(1500);
    tx = (await http('GET', '/tx/' + prep.ptxId)).tx;
  }
  if (tx.status !== 'confirmed') throw new ApiError('The transaction did not confirm (' + tx.status + '). Nothing is charged if it never landed — check your wallet and try again.', 'tx_' + tx.status, 0);
  step('done', tx);
  refreshMe().catch(() => {});
  return { prep, tx };
}

export async function init() {
  try {
    S.meta = await http('GET', '/meta', null, { auth: false });
    S.site = S.meta.site || {};
    S.online = true;
    await loadCollections();
    if (S.token) await refreshMe().catch(() => {});
    else { try { S.likes = new Set((await http('GET', '/likes/mine')).itemIds.map(String)); } catch (e) { /* ignore */ } }
    if (S.token && !pollT) pollT = setInterval(() => { if (S.token) refreshMe().catch(() => {}); }, 30000);
  } catch (e) { console.warn('[GTA] API unreachable:', e.message); S.online = false; S.initError = e.message; }
}

/* ---------- bid window ---------- */
export function bidWindow() { const w = S.meta && S.meta.bidWindow; return w && w.enabled ? w : null; }

/* ---------- UI: toast, modal, wallet picker, tx dialog, confetti ---------- */
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
export const needWallet = () => walletModal();
export function walletModal() {
  const rows = detectWallets().sort((a, b) => b.found - a.found).map((w) => `<button class="wrow" data-w="${w.name}"><img src="${esc(walletIcon(w.name))}" alt="" onerror="${w.icon ? `this.onerror=null;this.src='${esc(w.icon)}'` : `this.replaceWith(Object.assign(document.createElement('span'),{className:'wfallback',textContent:'${w.name[0]}'}))`}"><span><b>${w.name}</b><small>${w.found ? 'Detected' : isMobile() && WALLETS[w.name].browse ? 'Open in the ' + w.name + ' app' : 'Not installed — tap to get it'}</small></span><i class="arr">→</i></button>`).join('');
  const tests = isMock() ? `<div class="sep">Test wallets (demo chain)</div>` + testWallets().map((w) => `<button class="wrow" data-w="test:${w.name}"><span class="wfallback">${w.name[0]}</span><span><b>${w.name}</b><small>${short(w.addr)}</small></span><i class="arr">→</i></button>`).join('') : '';
  modal(`<button class="x" data-x aria-label="Close">✕</button><h2 class="display">Connect<br>wallet</h2><p class="muted">Sign a free message to sign in — no transaction, no cost.</p><div class="wlist">${rows}${tests}</div><p class="fine">${S.meta ? 'Network: <b>' + esc(S.meta.network) + '</b>' + (S.meta.network === 'devnet' ? ' — test SOL only, get some at faucet.solana.com' : '') : ''}</p>`, (m, close) => {
    $('[data-x]', m).onclick = close;
    m.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-w]'); if (!b) return;
      b.classList.add('busy');
      try { await connect(b.dataset.w); close(); toast('Wallet connected'); } catch (err) { toast(err.message, 'bad'); } finally { b.classList.remove('busy'); }
    });
  });
}
const STEPS = [['prepare', 'Prepare'], ['sign', 'Approve in wallet'], ['submit', 'Send'], ['confirm', 'Confirm on-chain']];
/** Runs fn(ui) inside a progress dialog. Pass ui to act(). Resolves with fn's result; shows the error if it throws. */
export async function runTx(title, fn, okText) {
  const m = modal(`<h2 class="display">${esc(title)}</h2><ol class="steps">${STEPS.map(([k, l]) => `<li data-s="${k}"><i></i>${l}</li>`).join('')}</ol><p class="txmsg muted">Starting…</p><div class="txfoot"></div>`, null, 'txd');
  const msg = $('.txmsg', m), foot = $('.txfoot', m); let idx = -1;
  const ui = (s) => {
    const i = STEPS.findIndex(([k]) => k === s);
    if (s === 'done') { $$('.steps li', m).forEach((li) => { li.className = 'done'; }); return; }
    if (i >= idx) idx = i;
    $$('.steps li', m).forEach((li, j) => { li.className = j < idx ? 'done' : j === idx ? 'now' : ''; });
    msg.textContent = s === 'sign' ? 'Check your wallet and approve the request.' : s === 'confirm' ? 'Waiting for the network…' : 'Working…';
  };
  try {
    const r = await fn(ui);
    msg.innerHTML = `<b class="ok">${esc(okText || 'Done')}</b>${r && r.tx && r.tx.signature ? ` <a class="txl" target="_blank" rel="noopener" href="${explorer(r.tx.signature)}">View transaction ↗</a>` : ''}`;
    foot.innerHTML = '<button class="btn primary" data-ok>Nice</button>'; $('[data-ok]', m).onclick = m.close; burst();
    return r;
  } catch (e) {
    msg.innerHTML = `<b class="bad">${esc(e.message)}</b>`;
    foot.innerHTML = '<button class="btn" data-ok>Close</button>'; $('[data-ok]', m).onclick = m.close; throw e;
  }
}
export function burst() {
  const c = document.createElement('div'); c.className = 'burst'; document.body.appendChild(c);
  const cols = ['#ff2d8a', '#b13dff', '#ffc93c', '#19e3d2'];
  for (let i = 0; i < 46; i++) { const p = document.createElement('i'); const a = Math.random() * Math.PI * 2, d = 120 + Math.random() * 280; p.style.cssText = `--x:${Math.cos(a) * d}px;--y:${Math.sin(a) * d - 80}px;--r:${Math.random() * 720 - 360}deg;background:${cols[i % 4]};left:50%;top:55%;animation-delay:${Math.random() * 80}ms`; c.appendChild(p); }
  setTimeout(() => c.remove(), 1400);
}
export async function toggleLike(id) {
  const r = await http('POST', '/items/' + encodeURIComponent(id) + '/like', {});
  if (r.liked) S.likes.add(String(id)); else S.likes.delete(String(id));
  return r;
}
/** Shrinks an image file to ≤ maxPx and returns { type, data (base64) } so uploads stay small. */
export function shrinkImage(file, maxPx = 1600, q = 0.86) {
  return new Promise((res, rej) => {
    if (file.type === 'image/gif' && file.size < 3.5e6) { const r = new FileReader(); r.onload = () => res({ type: 'image/gif', data: String(r.result).split(',')[1] }); r.onerror = rej; return r.readAsDataURL(file); }
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => { const k = Math.min(1, maxPx / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res({ type: 'image/jpeg', data: c.toDataURL('image/jpeg', q).split(',')[1] }); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new ApiError('Could not read that image', 'bad_image', 0)); };
    img.src = url;
  });
}
