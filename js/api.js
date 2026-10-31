/* GTA Marketplace — API client, wallet, sign-in and the prepare → sign → submit flow.
   Exposes window.GTA_API. Loaded before app.js. No build step, no dependencies (web3.js is loaded lazily from a CDN). */
(function () {
  'use strict';
  const CFG = window.GTA_CONFIG || {};
  const API = (CFG.API_URL || '').replace(/\/$/, '');
  const D = window.GTA_DATA;

  /* ---------- storage (never throws) ---------- */
  const mem = {};
  const ls = {
    get(k, d) { try { const v = localStorage.getItem('gta_' + k); return v == null ? (k in mem ? mem[k] : d) : JSON.parse(v); } catch (e) { return k in mem ? mem[k] : d; } },
    set(k, v) { mem[k] = v; try { localStorage.setItem('gta_' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
    del(k) { delete mem[k]; try { localStorage.removeItem('gta_' + k); } catch (e) { /* ignore */ } }
  };

  /* ---------- state ---------- */
  const S = {
    demo: !API, online: false, meta: null, collections: [],
    token: ls.get('jwt', null), wallet: ls.get('walletAddr', null), provider: ls.get('provider', null), admin: false,
    unread: 0, likes: new Set(), listeners: {}
  };
  const on = (ev, fn) => { (S.listeners[ev] = S.listeners[ev] || []).push(fn); };
  const emit = (ev, data) => (S.listeners[ev] || []).forEach((f) => { try { f(data); } catch (e) { console.error(e); } });

  class ApiError extends Error { constructor(message, code, status) { super(message); this.code = code; this.status = status; } }

  /* ---------- http ---------- */
  async function http(method, path, body, opt = {}) {
    if (S.demo) throw new ApiError('Demo mode: set API_URL in js/config.js to connect the backend.', 'demo', 0);
    const headers = {};
    if (S.token && opt.auth !== false) headers.authorization = 'Bearer ' + S.token;
    let payload;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined && body !== null) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
    // Public GETs are cached for a short while in this tab so moving between pages is instant. Any write clears it.
    const cacheable = method === 'GET' && opt.auth === false;
    if (cacheable) { const c = cacheGet(path); if (c) return c; }
    let res;
    try { res = await fetch(API + path, { method, headers, body: payload }); }
    catch (e) { throw new ApiError('Cannot reach the server. Check your connection.', 'network', 0); }
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.ok === false) {
      const err = json.error || {};
      if (res.status === 401 && S.token && opt.auth !== false) signOut(true);
      throw new ApiError(err.message || 'Request failed (' + res.status + ')', err.code || 'http_' + res.status, res.status);
    }
    if (cacheable) cacheSet(path, json); else if (method !== 'GET') cacheClear();
    return json;
  }
  const CACHE_MS = 45000;
  function cacheGet(k) { try { const r = JSON.parse(sessionStorage.getItem('gta_c:' + k)); return r && Date.now() - r.t < CACHE_MS ? r.j : null; } catch (e) { return null; } }
  function cacheSet(k, j) { try { sessionStorage.setItem('gta_c:' + k, JSON.stringify({ t: Date.now(), j })); } catch (e) { cacheClear(); } }
  function cacheClear() { try { Object.keys(sessionStorage).filter((k) => k.startsWith('gta_c:')).forEach((k) => sessionStorage.removeItem(k)); } catch (e) { /* ignore */ } }
  /** Small, cached WebP copy of a GitHub-hosted image for cards and lists (falls back to the original if the resizer fails). */
  const thumb = (u, w) => (u && /^https:\/\/raw\.githubusercontent\.com\//.test(u) ? 'https://wsrv.nl/?url=' + encodeURIComponent(u) + '&w=' + (w || 480) + '&we&output=webp&q=78' : u);
  const qs = (o) => { const p = new URLSearchParams(); Object.entries(o || {}).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') p.set(k, v); }); const s = p.toString(); return s ? '?' + s : ''; };

  /* ---------- formatting ---------- */
  const fmtUsd = (n) => (n == null ? '—' : n === 0 ? 'Free' : '$' + (n >= 100 ? Math.round(n).toLocaleString() : (Math.round(n * 100) / 100).toString()));
  const fmtSol = (n) => (n == null ? '—' : (Math.round(n * 1000) / 1000).toString());
  const short = (a) => (a ? a.slice(0, 4) + '…' + a.slice(-4) : '');
  const initials = (s) => String(s || '?').replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || '?';

  /* ---------- normalising items: the UI works with one shape, API or demo ---------- */
  const DEMO_PRICE = { Common: 0, Rare: 5, Epic: 15, Legendary: 40 };
  function normApi(it) {
    const listing = it.listing || null;
    const state = !it.minted ? 'mint' : listing ? 'listed' : 'minted';
    const p = it.primary || {};
    return {
      id: it.id, title: it.title, description: it.description, img: it.image, artist: it.artist || 'GTA Marketplace', artistInit: initials(it.artist || 'GTA'),
      era: it.era, eraLabel: it.eraLabel, eraShort: it.eraShort, category: it.category, rarity: it.rarity, tags: it.tags || [], likes: it.likes || 0,
      status: it.status, minted: !!it.minted, owner: it.owner, asset: it.asset, mintedAt: it.mintedAt, collection: it.collection, collectionId: it.collectionId,
      state, free: !it.minted && p.free, mintable: !!(p.available),
      priceUsd: state === 'mint' ? p.priceUsd : listing ? listing.priceUsd : null,
      priceSol: state === 'mint' ? p.priceSol : listing ? listing.priceSol : null,
      listing, offers: it.offers || { count: 0, topUsd: null, topSol: null }
    };
  }
  function normDemo(a) {
    const usd = DEMO_PRICE[a.rarity] ?? 0;
    return {
      id: String(a.id), title: a.title, description: a.description, img: a.img, artist: a.artist, artistInit: a.artistInit,
      era: a.era, eraLabel: a.eraLabel, eraShort: a.eraShort, category: a.category, rarity: a.rarity, tags: a.tags || [], likes: a.likes || 0,
      status: 'unminted', minted: false, owner: null, asset: null, collection: { id: a.era, name: D.eras[a.era], live: false }, collectionId: a.era,
      state: 'mint', free: usd === 0, mintable: false, priceUsd: usd, priceSol: null, listing: null, offers: { count: 0, topUsd: null, topSol: null }, placeholder: !!a.placeholder
    };
  }

  /* ---------- catalog reads ---------- */
  function demoList(q) {
    let rows = D.art.filter((a) => !a.placeholder || true).map(normDemo);
    if (q.era) rows = rows.filter((a) => a.era === q.era);
    if (q.category) rows = rows.filter((a) => a.category === q.category);
    if (q.rarity) rows = rows.filter((a) => a.rarity === q.rarity);
    if (q.q) { const n = q.q.toLowerCase(); rows = rows.filter((a) => (a.title + ' ' + a.category + ' ' + a.eraLabel + ' ' + a.tags.join(' ')).toLowerCase().includes(n)); }
    if (q.status === 'free') rows = rows.filter((a) => a.free);
    if (q.status === 'minted' || q.status === 'listed') rows = [];
    if (q.minUsd != null && q.minUsd !== '') rows = rows.filter((a) => a.priceUsd >= +q.minUsd);
    if (q.maxUsd != null && q.maxUsd !== '') rows = rows.filter((a) => a.priceUsd <= +q.maxUsd);
    const s = q.sort || 'recent';
    if (s === 'price_low') rows.sort((a, b) => a.priceUsd - b.priceUsd);
    else if (s === 'price_high') rows.sort((a, b) => b.priceUsd - a.priceUsd);
    else if (s === 'liked') rows.sort((a, b) => b.likes - a.likes);
    const limit = +q.limit || 24, page = +q.page || 1;
    return { total: rows.length, page, limit, items: rows.slice((page - 1) * limit, page * limit), solUsd: null };
  }
  async function items(q) {
    if (S.demo || !S.online) return demoList(q || {});
    const r = await http('GET', '/items' + qs(q), null, { auth: false });
    return { total: r.total, page: r.page, limit: r.limit, items: r.items.map(normApi), solUsd: r.solUsd };
  }
  async function item(id) {
    if (S.demo || !S.online) { const a = D.art.find((x) => String(x.id) === String(id)); if (!a) throw new ApiError('Artwork not found', 'not_found', 404); return normDemo(a); }
    return normApi((await http('GET', '/items/' + encodeURIComponent(id), null, { auth: false })).item);
  }
  async function offersFor(id) { return S.online ? (await http('GET', '/items/' + encodeURIComponent(id) + '/offers', null, { auth: false })).offers : []; }

  function demoCollections() {
    return D.collections.map((c) => ({
      id: c.id, era: c.era, name: c.name, blurb: c.blurb, short: D.eraShort[c.era], cover: c.cover, covers: c.covers, items: c.count, minted: 0, owners: 0,
      floorUsd: Math.min(...D.art.filter((a) => a.era === c.era).map((a) => DEMO_PRICE[a.rarity] ?? 0)), volumeUsd: 0, live: false, address: null
    }));
  }
  async function loadCollections() {
    if (S.demo || !S.online) { S.collections = demoCollections(); return S.collections; }
    const r = await http('GET', '/collections', null, { auth: false });
    const covers = {};
    S.collections = r.collections.map((c) => ({ ...c, covers: c.covers || [c.cover].filter(Boolean) }));
    return S.collections;
  }
  async function stats() { return S.online ? (await http('GET', '/stats', null, { auth: false })).stats : null; }

  /* ---------- web3.js (lazy) + base64 helpers ---------- */
  const b64ToBytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const bytesToB64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  let web3p;
  function loadWeb3() {
    if (window.solanaWeb3) return Promise.resolve(window.solanaWeb3);
    if (!web3p) web3p = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = CFG.WEB3_CDN; s.onload = () => res(window.solanaWeb3);
      s.onerror = () => { web3p = null; rej(new ApiError('Could not load the Solana library. Check your connection.', 'web3', 0)); };
      document.head.appendChild(s);
    });
    return web3p;
  }

  /* ---------- wallets ---------- */
  const PROVIDERS = {
    Phantom: () => (window.phantom && window.phantom.solana && window.phantom.solana.isPhantom ? window.phantom.solana : window.solana && window.solana.isPhantom ? window.solana : null),
    Solflare: () => (window.solflare && window.solflare.isSolflare ? window.solflare : null),
    Backpack: () => (window.backpack && window.backpack.isBackpack ? window.backpack : null)
  };
  const INSTALL = { Phantom: 'https://phantom.app/download', Solflare: 'https://solflare.com/download', Backpack: 'https://backpack.app/downloads' };
  const detect = () => Object.keys(PROVIDERS).map((name) => ({ name, found: !!PROVIDERS[name](), install: INSTALL[name] }));

  // Test wallets exist only when the server runs the MOCK chain (offline demo). They are random keys kept in this browser.
  const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  function b58encode(bytes) {
    let n = 0n; for (const b of bytes) n = (n << 8n) | BigInt(b);
    let out = ''; while (n > 0n) { out = B58[Number(n % 58n)] + out; n /= 58n; }
    for (const b of bytes) { if (b === 0) out = '1' + out; else break; }
    return out;
  }
  function testWallets() {
    let w = ls.get('testWallets', null);
    if (!w) { w = ['Alice', 'Bob', 'Carol'].map((n) => ({ name: n, addr: b58encode(crypto.getRandomValues(new Uint8Array(32))) })); ls.set('testWallets', w); }
    return w;
  }

  async function authWith(token, wallet, provider) {
    S.token = token; S.wallet = wallet; S.provider = provider;
    ls.set('jwt', token); ls.set('walletAddr', wallet); ls.set('provider', provider);
    await refreshMe();
    startPoll();
    emit('auth', { wallet });
  }
  let pollTimer = null;
  function startPoll() { if (!pollTimer && !S.demo) pollTimer = setInterval(() => { if (S.token) refreshMe().catch(() => {}); }, 30000); }
  async function connect(name) {
    if (S.demo || !S.online) throw new ApiError('The server is not connected yet (demo mode).', 'demo', 0);
    if (name.startsWith('test:')) {
      const w = testWallets().find((x) => x.name === name.slice(5));
      const r = await http('POST', '/dev/login', { wallet: w.addr }, { auth: false });
      await authWith(r.token, w.addr, name);
      return w.addr;
    }
    const p = PROVIDERS[name] && PROVIDERS[name]();
    if (!p) { window.open(INSTALL[name], '_blank', 'noopener'); throw new ApiError(name + ' is not installed in this browser.', 'no_wallet', 0); }
    const conn = await p.connect();
    const wallet = (conn && conn.publicKey ? conn.publicKey : p.publicKey).toString();
    const { message, nonce } = await http('POST', '/auth/nonce', { wallet }, { auth: false });
    const signed = await p.signMessage(new TextEncoder().encode(message), 'utf8');
    const sig = signed.signature || signed;
    const r = await http('POST', '/auth/verify', { wallet, nonce, signature: bytesToB64(sig) }, { auth: false });
    await authWith(r.token, wallet, name);
    return wallet;
  }
  function signOut(silent) {
    const p = S.provider && PROVIDERS[S.provider] && PROVIDERS[S.provider]();
    if (p && p.disconnect && !silent) { try { p.disconnect(); } catch (e) { /* ignore */ } }
    S.token = null; S.wallet = null; S.provider = null; S.admin = false; S.unread = 0; S.likes = new Set();
    ls.del('jwt'); ls.del('walletAddr'); ls.del('provider');
    emit('auth', { wallet: null });
  }
  async function refreshMe() {
    if (!S.token) return null;
    const me = await http('GET', '/me');
    S.admin = !!me.admin; S.unread = me.unread || 0;
    try { S.likes = new Set((await http('GET', '/me/likes')).itemIds); } catch (e) { /* ignore */ }
    emit('unread', S.unread);
    return me;
  }

  async function signTx(txB64) {
    if (S.provider && S.provider.startsWith('test:')) {
      return (await http('POST', '/dev/sign', { txB64, wallet: S.wallet }, { auth: false })).signedTx;
    }
    const p = PROVIDERS[S.provider] && PROVIDERS[S.provider]();
    if (!p) throw new ApiError('Reconnect your wallet to sign.', 'no_wallet', 0);
    const w3 = await loadWeb3();
    const tx = w3.VersionedTransaction.deserialize(b64ToBytes(txB64));
    const signed = await p.signTransaction(tx);
    return bytesToB64(signed.serialize());
  }

  /* ---------- prepare → sign → submit → wait for confirmation ---------- */
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const isStale = (e) => e && (e.code === 'tx_expired' || /blockhash|expired/i.test(e.message || ''));
  /** Prepare → sign → submit. If the approval was too slow and the tx went stale, quietly prepare a fresh one once. */
  async function act(method, path, body, ui) {
    try { return await actOnce(method, path, body, ui); }
    catch (e) {
      if (!isStale(e)) throw e;
      if (ui) ui('prepare');
      try { return await actOnce(method, path, body, ui); }
      catch (e2) { if (isStale(e2)) throw new ApiError('That took too long to approve and the transaction expired. Please try again and approve quickly.', 'tx_expired', 0); throw e2; }
    }
  }
  async function actOnce(method, path, body, ui) {
    if (!S.token) throw new ApiError('Connect your wallet first.', 'auth', 401);
    const step = (s, extra) => ui && ui(s, extra);
    step('prepare');
    const prep = await http(method, path, body);
    step('sign', prep);
    let signedTx;
    try { signedTx = await signTx(prep.txB64); }
    catch (e) { if (e instanceof ApiError) throw e; throw new ApiError(/reject|denied|cancel/i.test(e.message || '') ? 'You cancelled the request in your wallet.' : (e.message || 'Wallet could not sign.'), 'rejected', 0); }
    step('submit', prep);
    let tx = (await http('POST', '/tx/submit', { ptxId: prep.ptxId, signedTx })).tx;
    for (let i = 0; i < 50 && tx.status !== 'confirmed'; i++) {
      step('confirm', tx);
      if (tx.status === 'failed' || tx.status === 'expired') break;
      await sleep(1500);
      tx = (await http('GET', '/tx/' + prep.ptxId)).tx;
    }
    if (tx.status !== 'confirmed') throw new ApiError('The transaction did not confirm (' + tx.status + '). Nothing was charged if it never landed — check your wallet and try again.', 'tx_' + tx.status, 0);;
    step('done', tx);
    refreshMe().catch(() => {});
    return { prep, tx };
  }

  /* ---------- init ---------- */
  async function init() {
    if (S.demo) { S.meta = null; await loadCollections(); return; }
    try {
      S.meta = await http('GET', '/meta', null, { auth: false });
      S.online = true;
      await loadCollections();
      if (S.token) await refreshMe().catch(() => { /* signOut already ran on 401 */ });
    } catch (e) {
      console.warn('[GTA] API unreachable, falling back to demo data:', e.message);
      S.online = false; S.meta = null; await loadCollections();
    }
    if (S.token && S.online) startPoll();
  }

  window.GTA_API = {
    S, ApiError, http, qs, thumb, cacheClear, on, emit, ls, init, items, item, offersFor, loadCollections, stats, normApi,
    connect, signOut, detect, testWallets, refreshMe, act, signTx,
    fmtUsd, fmtSol, short, initials,
    get isDemo() { return S.demo || !S.online; },
    get wallet() { return S.wallet; }, get authed() { return !!S.token; }
  };
})();
