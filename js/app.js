/* GTA Marketplace — shared UI: layout, wallet, cards, tx flow */
(function () {
  'use strict';
  const D = window.GTA_DATA;
  const API = window.GTA_API;
  const S = API.S;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  /* ---------- helpers ---------- */
  const { fmtUsd, fmtSol, short } = API;
  const T = (u, w) => API.thumb(u, w);
  const imgTag = (u, alt, w, extra) => `<img src="${esc(T(u, w))}" data-o="${esc(u)}" onerror="if(this.dataset.o&&this.src!==this.dataset.o){this.src=this.dataset.o}" alt="${esc(alt)}" loading="lazy" decoding="async"${extra || ''}>`;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function timeStr(ms) {
    if (ms <= 0) return 'now';
    const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    if (d > 0) return d + 'd ' + h + 'h';
    if (h > 0) return h + 'h ' + String(m).padStart(2, '0') + 'm';
    return m + 'm ' + String(x).padStart(2, '0') + 's';
  }
  const ago = (t) => { const s = Math.max(1, Math.floor((Date.now() - t) / 1000)); if (s < 60) return s + 's ago'; if (s < 3600) return Math.floor(s / 60) + 'm ago'; if (s < 86400) return Math.floor(s / 3600) + 'h ago'; return Math.floor(s / 86400) + 'd ago'; };

  /* ---------- icons ---------- */
  const I = {
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    cart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.7 12.4a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 7H6"/></svg>',
    heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 5.6a5.4 5.4 0 0 0-7.6 0L12 6.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 22l8.8-8.8a5.4 5.4 0 0 0 0-7.6z"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 11 9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/></svg>',
    explore: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/></svg>',
    gavel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m14 13-8.4 8.4a1.8 1.8 0 0 1-2.5-2.5L11.5 10.5"/><path d="m16 16 6-6"/><path d="m8 8 6-6"/><path d="m9 7 8 8"/><path d="m21 11-8-8"/></svg>',
    layers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 2 10 5-10 5L2 7z"/><path d="m2 12 10 5 10-5"/><path d="m2 17 10 5 10-5"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
    check: '<svg class="verified" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1.5l2.6 1.9 3.2-.1 1 3 2.6 1.9-1 3.1 1 3.1-2.6 1.8-1 3-3.2-.1L12 22.5l-2.6-1.9-3.2.1-1-3-2.6-1.8 1-3.1-1-3.1 2.6-1.9 1-3 3.2.1z"/><path d="m8.2 12.2 2.6 2.6 5-5.2" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
    upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg>',
    grid: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/></svg>',
    list: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
    filter: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 5h18l-7 8v6l-4-2v-4z"/></svg>',
    review: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 4 6v6c0 5 3.4 8 8 9 4.6-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/></svg>',
    trend: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>',
    submit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="m8 15 3-3 2 2 3-4"/></svg>'
  };
  const sol = '<span class="sol" role="img" aria-label="SOL"></span>';

  /* ---------- layout ---------- */
  const PAGES = [
    ['index', 'Home', 'index.html', I.home],
    ['explore', 'Explore', 'explore.html', I.explore],
    ['auctions', 'Offers', 'auctions.html', I.gavel],
    ['collections', 'Collections', 'collections.html', I.layers],
    ['create', 'Create', 'create.html', I.plus]
  ];
  const page = document.body.dataset.page || 'index';

  function renderLayout() {
    const links = PAGES.map((p) => `<a href="${p[2]}" class="${p[0] === page ? 'active' : ''}">${p[1]}</a>`).join('');
    const header = `
    <header class="topbar"><div class="wrap inner">
      <a class="logo" href="index.html" aria-label="GTA Marketplace home"><b>GTA</b><i>Marketplace</i></a>
      <nav class="nav-links" aria-label="Main">${links}</nav>
      <div class="search">${I.search}<input id="gSearch" type="search" placeholder="Search" autocomplete="off" aria-label="Search"><div class="search-results" id="gResults"></div></div>
      <div class="top-actions">
        <a class="icon-btn cart-btn" id="bellBtn" href="profile.html#notifications" aria-label="Notifications" hidden>${I.bell}<span class="badge" id="bellBadge" hidden>0</span></a>
        <button class="btn btn-primary" id="walletBtn">Connect<span class="long">&nbsp;Wallet</span></button>
        <a class="avatar" id="avatar" href="profile.html" title="Profile" hidden>?</a>
      </div>
    </div></header>
    <div class="net-banner" id="netBanner" hidden></div>`;

    const dockLinks = PAGES.map((p) => {
      if (p[0] === 'create') return `<a href="${p[2]}" class="create-fab ${p[0] === page ? 'active' : ''}" aria-label="Create">${p[3]}<span>${p[1]}</span></a>`;
      return `<a href="${p[2]}" class="${p[0] === page ? 'active' : ''}">${p[3]}<span>${p[1]}</span></a>`;
    });
    const dock = `<nav class="dock" aria-label="Mobile navigation">${dockLinks.slice(0, 2).join('')}${dockLinks[4]}${dockLinks.slice(2, 4).join('')}</nav>`;

    const footer = `
    <footer class="footer"><div class="wrap inner">
      <div><b style="color:#fff">GTA Marketplace</b><br>Fan-made art marketplace. Not affiliated with Rockstar Games or Take-Two Interactive.</div>
      <nav>${PAGES.map((p) => `<a href="${p[2]}">${p[1]}</a>`).join('')}<a href="profile.html">Profile</a></nav>
    </div></footer>`;

    const extras = `
    <div class="overlay" id="overlay"></div>
    <div class="modal" id="walletModal" role="dialog" aria-modal="true" aria-label="Connect wallet"><h3>Connect wallet</h3><p class="sub" id="walletSub">Choose a Solana wallet. You'll be asked to sign a message to log in — it costs nothing.</p>
      <div id="walletList"></div>
      <button class="btn btn-glass btn-block" id="walletCancel" style="margin-top:6px">Cancel</button></div>
    <div class="modal" id="txModal" role="dialog" aria-modal="true" aria-label="Transaction"><h3 id="txTitle">Transaction</h3>
      <ol class="tx-steps" id="txSteps"><li data-s="prepare">Preparing</li><li data-s="sign">Approve in your wallet</li><li data-s="confirm">Confirming on Solana</li></ol>
      <p class="sub" id="txMsg"></p><a class="btn btn-glass btn-block" id="txLink" target="_blank" rel="noopener" hidden style="margin-bottom:10px">View on explorer</a>
      <button class="btn btn-primary btn-block" id="txClose" hidden>Done</button></div>
    <div class="toasts" id="toasts" aria-live="polite"></div>`;

    document.body.insertAdjacentHTML('afterbegin', header);
    document.body.insertAdjacentHTML('beforeend', footer + dock + extras);
  }

  /* ---------- toast ---------- */
  function toast(msg, type) {
    const t = document.createElement('div');
    t.className = 'toast ' + (type || '');
    t.textContent = msg;
    $('#toasts').appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, type === 'bad' ? 4200 : 2800);
  }

  /* ---------- cards ---------- */
  function priceBlock(a) {
    const solTxt = (v) => (v != null ? `${sol}${fmtSol(v)} SOL` : '');
    if (a.state === 'mint') {
      if (a.free) return ['Mint', 'Free', ''];
      return ['Mint price', solTxt(a.priceSol) || fmtUsd(a.priceUsd), a.priceSol != null ? fmtUsd(a.priceUsd) : ''];
    }
    if (a.state === 'listed') return ['Sale price', solTxt(a.priceSol) || fmtUsd(a.priceUsd), a.priceSol != null ? fmtUsd(a.priceUsd) : ''];
    if (a.offers.count) return ['Top offer', solTxt(a.offers.topSol) || fmtUsd(a.offers.topUsd), a.offers.topSol != null ? fmtUsd(a.offers.topUsd) : ''];
    return ['Owner ' + short(a.owner), '—', 'Not for sale'];
  }
  const stateChip = (a) => (a.state === 'mint' ? (a.free ? 'Free mint' : 'Mintable') : a.state === 'listed' ? 'For sale' : a.offers.count ? a.offers.count + (a.offers.count > 1 ? ' offers' : ' offer') : 'Minted');
  function card(a) {
    const liked = S.likes.has(String(a.id));
    const [label, main, sub] = priceBlock(a);
    const btn = a.state === 'mint' ? `<a class="btn btn-primary" href="artwork.html?id=${encodeURIComponent(a.id)}">${a.free ? 'Mint free' : 'Mint'}</a>`
      : a.state === 'listed' ? `<a class="btn btn-outline" href="artwork.html?id=${encodeURIComponent(a.id)}">Buy now</a>`
        : `<a class="btn btn-glass" href="artwork.html?id=${encodeURIComponent(a.id)}">Make offer</a>`;
    return `<article class="card" data-id="${esc(a.id)}">
      <a class="thumb" href="artwork.html?id=${encodeURIComponent(a.id)}">${imgTag(a.img, a.title, 480)}
        <span class="tag-era">${esc(a.eraShort)}</span><span class="timer st-${a.state}">${esc(stateChip(a))}</span><span class="rarity ${a.rarity}">${a.rarity}</span></a>
      <button class="like ${liked ? 'on' : ''}" data-like="${esc(a.id)}" aria-label="Like">${I.heart}<span>${a.likes}</span></button>
      <div class="card-body">
        <div><h3>${esc(a.title)}</h3><div class="by">By <b>${esc(a.artist)}</b>${I.check}</div></div>
        <div><div class="price-row">${label}</div><div class="price">${main}${sub ? ` <small class="usd-sub">${sub}</small>` : ''}</div></div>
        ${btn}
      </div></article>`;
  }
  function colCard(c) {
    const meta = D.collections.find((x) => x.id === c.id) || {};
    const name = (c.name && c.name !== c.short ? c.name : meta.name) || c.name;
    const covers = (c.covers && c.covers.length ? c.covers : meta.covers || [c.cover]).filter(Boolean).slice(0, 4);
    const cover = c.cover || covers[0];
    const floor = c.floorUsd != null ? fmtUsd(c.floorUsd) : '—';
    return `<article class="col-card"><a class="col-cover" href="explore.html?era=${esc(c.era)}">${imgTag(cover, name, 640)}<span class="col-mark">${esc(c.short || D.eraShort[c.era])}</span><span class="timer st-${c.live ? 'minted' : 'mint'}">${c.live ? 'Live' : 'Coming soon'}</span></a>
      <div class="col-body"><h3>${esc(name)}</h3><p>${esc(c.blurb || meta.blurb || '')}</p>
      <div class="minis">${covers.map((s) => `${imgTag(s, "", 160)}`).join('')}</div>
      <div class="col-meta"><span>${(c.items || 0).toLocaleString()} Artworks<br>${c.minted || 0} minted · ${c.owners || 0} owners</span><span style="text-align:right">Floor<b>${floor}</b></span></div>
      <a class="btn btn-primary btn-block" href="explore.html?era=${esc(c.era)}">View Collection</a></div></article>`;
  }
  const cardsInto = (el, list) => { el.innerHTML = list.map(card).join(''); };

  /* ---------- offers window banner ---------- */
  function offerWindow() {
    const w = S.meta && S.meta.bidWindow;
    if (!w || !w.enabled) return { enabled: false, open: true, text: '' };
    const now = Date.now();
    if (w.open && w.closesAt > now) return { enabled: true, open: true, text: 'Offers are open — closes in ' + timeStr(w.closesAt - now) };
    return { enabled: true, open: false, text: 'Offers are closed — next window opens in ' + timeStr(w.opensAt - now) };
  }
  function renderBanner() {
    const el = $('#netBanner'); if (!el) return;
    const msgs = [];
    if (API.isDemo) msgs.push('Demo mode — showing sample data. Set <code>API_URL</code> in <code>js/config.js</code> to go live.');
    else if (S.meta && !S.meta.isMainnet) msgs.push('You are on <b>' + esc(S.meta.network) + '</b> — test network, no real money.' + (S.meta.chain === 'mock' ? ' (offline test chain)' : ''));
    el.innerHTML = msgs.join(' · '); el.hidden = !msgs.length;
  }

  /* ---------- wallet ---------- */
  function renderWallet() {
    const b = $('#walletBtn'), av = $('#avatar'), bell = $('#bellBtn');
    if (S.wallet) {
      b.textContent = short(S.wallet); b.className = 'btn connected';
      av.hidden = false; av.textContent = S.wallet[0].toUpperCase(); bell.hidden = false;
    } else {
      b.innerHTML = 'Connect<span class="long">&nbsp;Wallet</span>'; b.className = 'btn btn-primary'; av.hidden = true; bell.hidden = true;
    }
    renderUnread();
  }
  function renderUnread() {
    const av = $('#avatar'); if (av) av.classList.toggle('has-unread', !!(S.unread && S.wallet));
    [$('#bellBadge'), $('#dockBadge')].forEach((b) => { if (!b) return; b.textContent = S.unread > 9 ? '9+' : S.unread; b.hidden = !S.unread || !S.wallet; });
  }
  function walletModal(open) {
    if (open) {
      const list = $('#walletList');
      const colors = { Phantom: ['#ab9ff2', '#1c1530'], Solflare: ['#fc9b1f', '#2a1700'], Backpack: ['#e33e3f', '#fff'] };
      if (API.isDemo) { list.innerHTML = '<p class="muted" style="margin:6px 0 14px">The backend is not connected, so wallets are disabled. Set <code>API_URL</code> in <code>js/config.js</code>.</p>'; }
      else {
        list.innerHTML = API.detect().map((p) => `<button class="wallet-opt" data-w="${p.name}"><span class="wi" style="background:${colors[p.name][0]};color:${colors[p.name][1]}">${p.name[0]}</span><span><b>${p.name}</b><small>${p.found ? 'Detected' : 'Not installed — tap to get it'}</small></span></button>`).join('')
          + (S.meta && S.meta.chain === 'mock' ? '<p class="muted" style="margin:14px 0 8px;font-size:12px">Offline test chain — fake wallets with free test SOL:</p>' + API.testWallets().map((w) => `<button class="wallet-opt" data-w="test:${w.name}"><span class="wi" style="background:#2de2e6;color:#03181a">${w.name[0]}</span><span><b>${w.name}</b><small>${short(w.addr)}</small></span></button>`).join('') : '');
      }
    }
    $('#walletModal').classList.toggle('open', open);
    $('#overlay').classList.toggle('open', open);
  }
  function needWallet() {
    if (S.token) return false;
    toast('Connect your wallet first', 'bad'); walletModal(true); return true;
  }

  /* ---------- transaction dialog ---------- */
  let txResolve = null;
  function txUI(open) { $('#txModal').classList.toggle('open', open); $('#overlay').classList.toggle('open', open); }
  /** runTx({ title, method, path, body, success }) -> { prep, tx } | null (null = failed/cancelled, user was told why) */
  async function runTx({ title, method = 'POST', path, body, success }) {
    $('#txTitle').textContent = title;
    $('#txMsg').textContent = 'Keep this window open.'; $('#txMsg').className = 'sub';
    $('#txLink').hidden = true; $('#txClose').hidden = true;
    const order = ['prepare', 'sign', 'confirm'], lis = $$('#txSteps li');
    const mark = (cur, done) => lis.forEach((li, i) => { const idx = order.indexOf(cur); li.className = i < idx || done ? 'done' : i === idx ? 'on' : ''; });
    mark('prepare'); txUI(true);
    try {
      const r = await API.act(method, path, body, (s, x) => {
        if (s === 'prepare') mark('prepare');
        else if (s === 'sign') mark('sign');
        else if (s === 'submit' || s === 'confirm') mark('confirm');
        else if (s === 'done') mark('confirm', true);
      });
      $('#txMsg').textContent = success || 'Done!'; $('#txMsg').className = 'sub ok';
      if (r.tx.explorer) { $('#txLink').href = r.tx.explorer; $('#txLink').hidden = false; }
      $('#txClose').hidden = false;
      return r;
    } catch (e) {
      lis.forEach((li) => { if (li.className === 'on') li.className = 'bad'; });
      $('#txLink').hidden = true;
      $('#txMsg').textContent = e.message || 'Something went wrong.'; $('#txMsg').className = 'sub bad';
      $('#txClose').hidden = false; $('#txClose').textContent = 'Close';
      return null;
    }
  }
  /** Plain API call with a toast on failure (offers cancel, reject, price changes, ...). */
  async function call(method, path, body, okMsg) {
    try { const r = await API.http(method, path, body); if (okMsg) toast(okMsg, 'ok'); return r; }
    catch (e) { toast(e.message, 'bad'); return null; }
  }

  /* ---------- search ---------- */
  function initSearch() {
    const inp = $('#gSearch'), box = $('#gResults'); let t;
    inp.addEventListener('input', () => {
      clearTimeout(t);
      const q = inp.value.trim();
      if (!q) { box.classList.remove('open'); return; }
      t = setTimeout(async () => {
        const r = await API.items({ q, limit: 7 }).catch(() => ({ items: [] }));
        box.innerHTML = r.items.length ? r.items.map((a) => { const [, main] = priceBlock(a); return `<a href="artwork.html?id=${encodeURIComponent(a.id)}">${imgTag(a.img, "", 120)}<span><b>${esc(a.title)}</b><small>${esc(a.eraShort)} · ${esc(a.category)} · ${stateChip(a)}</small></span></a>`; }).join('') : '<div class="none">No matches</div>';
        box.classList.add('open');
      }, 220);
    });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && inp.value.trim()) location.href = 'explore.html?q=' + encodeURIComponent(inp.value.trim()); });
    document.addEventListener('click', (e) => { if (!e.target.closest('.search')) box.classList.remove('open'); });
  }

  /* ---------- global events ---------- */
  function bind() {
    document.addEventListener('click', async (e) => {
      const like = e.target.closest('[data-like]');
      if (like) {
        e.preventDefault();
        if (API.isDemo) { toast('Likes need the backend (demo mode)', 'bad'); return; }
        if (needWallet()) return;
        const id = String(like.dataset.like);
        const r = await call('POST', '/items/' + encodeURIComponent(id) + '/like');
        if (!r) return;
        if (r.liked) S.likes.add(id); else S.likes.delete(id);
        $$(`[data-like="${CSS.escape(id)}"]`).forEach((b) => { b.classList.toggle('on', r.liked); const s = $('span', b); if (s) s.textContent = Math.max(0, +s.textContent + (r.liked ? 1 : -1)); });
        return;
      }
      if (e.target.closest('#overlay')) { if (!$('#txModal.open')) { walletModal(false); const f = $('.filters.open'); if (f) f.classList.remove('open'); $('#overlay').classList.remove('open'); } return; }
      if (e.target.closest('#walletBtn')) { if (S.wallet) location.href = 'profile.html'; else walletModal(true); return; }
      if (e.target.closest('#walletCancel')) { walletModal(false); return; }
      if (e.target.closest('#txClose')) { txUI(false); $('#txClose').textContent = 'Done'; document.dispatchEvent(new CustomEvent('gta:txclosed')); return; }
      const w = e.target.closest('[data-w]');
      if (w) {
        w.disabled = true;
        try { const addr = await API.connect(w.dataset.w); walletModal(false); toast('Connected ' + short(addr), 'ok'); }
        catch (err) { toast(err.message, 'bad'); }
        w.disabled = false; return;
      }
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { walletModal(false); if (!$('#txModal.open')) $('#overlay').classList.remove('open'); } });
    API.on('auth', () => { renderWallet(); document.dispatchEvent(new CustomEvent('gta:auth')); });
    API.on('unread', renderUnread);
  }

  /* ---------- expose + boot ---------- */
  const ready = API.init().then(() => { renderBanner(); renderWallet(); });
  window.GTA = { imgTag, API, D, S, $, $$, I, sol, esc, fmtUsd, fmtSol, short, ago, timeStr, card, colCard, cardsInto, priceBlock, stateChip, toast, needWallet, walletModal, runTx, call, offerWindow, ready };

  if ('serviceWorker' in navigator && /^https:|^http:\/\/localhost/.test(location.origin)) navigator.serviceWorker.register('sw.js').catch(() => {});
  renderLayout();
  renderWallet(); initSearch(); bind();
  setInterval(() => document.dispatchEvent(new CustomEvent('gta:tick')), 1000);
})();
