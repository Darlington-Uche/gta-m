import { S, D, $, $$, esc, usd, sol, short, ago, items, item, offersFor, historyFor, stats, recentSales, act, runTx, toast, modal, needWallet, imgTag, bidWindow, who, http } from './core.js';

const heart = '<svg viewBox="0 0 24 24"><path d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z"/></svg>';
export const poster = (it) => {
  const price = it.state === 'mint' ? `<span class="price ${it.free ? 'free' : ''}">${usd(it.priceUsd)}</span>` : it.state === 'listed' ? `<span class="price listed">${usd(it.priceUsd)}</span>` : '<span class="price own">Owned</span>';
  return `<a class="card" href="#/art/${esc(it.id)}"><div class="thumb">${it.img ? imgTag(it.img, it.title, 560, 'fill') : ''}${imgTag(it.img, it.title, 560)}
  <button class="like ${S.likes.has(String(it.id)) ? 'on' : ''}" data-like="${esc(it.id)}" aria-label="Like">${heart}<span>${it.likes}</span></button></div>
  <div class="meta"><div><h3>${esc(it.title)}</h3><p><i class="rb ${esc(it.rarity)}"></i>${esc(it.eraShort)} · ${esc(it.category || '')}</p></div>${price}</div></a>`;
};
const skels = (n) => `<div class="grid">${'<div class="skel"></div>'.repeat(n)}</div>`;
const bg = (u) => (u ? `style="--bi:url('${esc(u)}')"` : '');
/** Page header: uses the banner uploaded in the admin site when there is one, otherwise a clean gradient header */
const pageHead = (key, eyebrow, title, sub) => `<div class="ph"><span class="eyebrow">${eyebrow}</span><h1 class="display">${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div>`;
const HUES = [330, 285, 255, 315, 22, 200, 168, 345];
const tile = (c, i = 0) => `<a class="tile ${c.cover ? '' : 'nocover'}" style="--h:${HUES[i % HUES.length]}" href="#/collection/${esc(c.id)}">${c.cover ? `<div class="bgf" style="background-image:url('${esc(c.cover)}')"></div>` : ''}<div class="bgi" ${c.cover ? `style="background-image:url('${esc(c.cover)}')"` : ''}></div>${c.cover ? '' : `<span class="ghost display" aria-hidden="true">${esc(c.short)}</span>`}<div><h3 class="display">${esc(c.short)}</h3><small>${c.items} pieces · ${c.minted} collected${c.floorUsd != null ? ' · ' + (c.floorUsd ? 'from ' + usd(c.floorUsd) : 'free picks') : ''}</small></div><span class="go" aria-hidden="true">→</span></a>`;

/* ================= HOME ================= */
export async function home() {
  const [pop, fresh, trading, st] = await Promise.all([items({ sort: 'liked', limit: 5 }), items({ sort: 'recent', status: 'unminted', limit: 8 }), items({ sort: 'offers', status: 'minted', limit: 8 }), stats().catch(() => ({}))]);
  const f = pop.items[0], site = S.site || {};
  const title = site.heroTitle ? esc(site.heroTitle) : 'Own the<br><span class="grad">streets.</span>';
  return `<section class="hero"><div class="hero-in"><span class="eyebrow">Art marketplace · ${esc(S.meta.network)}</span>
    <h1 class="display">${title}</h1>
    <p class="sub">${esc(site.heroSubtitle || 'Collect, trade and flex original GTA-inspired art from every era. Real NFTs on Solana — connect a wallet and start with the free drops.')}</p>
    <div class="cta"><a class="btn primary lg" href="#/explore">Browse the drops</a><a class="btn lg" href="#/create">Submit your art</a></div></div>
    ${pop.items.length ? deck(pop.items) : ''}</section>
  ${fresh.items.length ? `<div class="ticker" aria-hidden="true"><div class="tk-in">${[0, 1].map(() => fresh.items.map((it) => `<a href="#/art/${encodeURIComponent(it.id)}" tabindex="-1"><span class="t">${imgTag(it.img, '', 80)}</span><b>${esc(it.title)}</b><small>${it.state === 'mint' ? (it.free ? 'Free drop' : usd(it.priceUsd)) : 'Collected'}</small></a><i class="dot">✦</i>`).join('')).join('')}</div></div>` : ''}
  <div class="stats">${[[st.items ?? 0, 'Artworks'], [st.minted ?? 0, 'Collected'], [st.holders ?? 0, 'Holders'], ['$' + Math.round(st.volumeUsd || 0).toLocaleString(), 'Volume']].map(([n, l]) => `<div class="stat glass"><b class="grad">${n}</b><small>${l}</small></div>`).join('')}</div>
  <div class="sh"><h2 class="display">Fresh <span class="grad">drops</span></h2><a class="more" href="#/browse?status=unminted">See all →</a></div>
  ${fresh.items.length ? `<div class="grid">${fresh.items.map(poster).join('')}</div>` : '<div class="empty"><b>Drops coming soon</b>The first artworks are being uploaded.</div>'}
  <div class="sh"><h2 class="display">Now <span class="grad">trading</span></h2><a class="more" href="#/browse?status=minted">See all →</a></div>
  ${trading.items.length ? `<div class="grid">${trading.items.map(poster).join('')}</div>` : '<div class="empty"><b>No trades yet</b>Collected pieces with offers show up here.</div>'}
  <div class="sh"><h2 class="display">Pick an <span class="grad">era</span></h2><a class="more" href="#/collections">All eras →</a></div>
  <div class="tiles">${S.collections.map((c, i) => tile(c, i)).join('')}</div>
  <div class="cta-band"><div class="bgi" style="background-image:url('img/crew.jpg')"></div><div><span class="eyebrow">Creators</span><h2 class="display" style="margin-top:10px">Got art? Get it on the wall.</h2></div><a class="btn primary lg" href="#/create">Submit artwork</a></div>`;
}
export async function homeView(ctx) { const html = await home(ctx); return { html, mount: (root) => { const d = $('.deck', root); const off = d ? mountDeck(d) : null; const t = tiltCards(root); return () => { off && off(); t(); }; } }; }

/* ================= HALL OF FAME DECK =================
   The most-liked artworks as a stack of holographic collector cards: they tilt toward your finger / mouse (and with the
   phone's gyroscope), the foil shifts with the light, tap flips a card to its stats, swipe sends it to the back. */
const RANK = ['#1 Most liked', '#2', '#3', '#4', '#5'];
function deck(list) {
  return `<div class="deck" aria-roledescription="carousel" aria-label="Most liked artworks">
    ${list.map((it, i) => `<article class="hcard r-${esc((it.rarity || 'common').toLowerCase())}" data-i="${i}" data-id="${esc(it.id)}" tabindex="0" aria-label="${esc(it.title)}">
      <div class="hc-in">
        <div class="face front">
          <div class="art">${imgTag(it.img, it.title, 600)}</div>
          <i class="glare"></i>
          <span class="rk">${RANK[i] || '#' + (i + 1)}</span><span class="lk">♥ ${it.likes}</span>
          <div class="cap"><b class="display">${esc(it.title)}</b><small>${esc(it.eraShort || '')}${it.rarity ? ' · ' + esc(it.rarity) : ''}</small></div>
        </div>
        <div class="face back">
          <span class="rk">${RANK[i] || '#' + (i + 1)}</span>
          <b class="display">${esc(it.title)}</b>
          <dl><dt>Era</dt><dd>${esc(it.eraShort || '—')}</dd><dt>Type</dt><dd>${esc(it.category || '—')}</dd><dt>Rarity</dt><dd>${esc(it.rarity || '—')}</dd><dt>Likes</dt><dd>${it.likes}</dd>
          <dt>Price</dt><dd>${it.state === 'minted' ? 'Owned' : it.free ? 'Free' : usd(it.priceUsd)}</dd></dl>
          <a class="btn primary" href="#/art/${encodeURIComponent(it.id)}">${it.state === 'mint' ? (it.free ? 'Claim free' : 'Mint · ' + usd(it.priceUsd)) : it.state === 'listed' ? 'Buy · ' + usd(it.priceUsd) : 'View'}</a>
        </div>
      </div>
    </article>`).join('')}
  </div>`;
}
function mountDeck(el) {
  const cards = $$('.hcard', el), n = cards.length, dots = [];
  let top = 0, timer = 0, drag = null, gyro = false;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const layout = () => cards.forEach((c, i) => { const k = (i - top + n) % n; c.style.setProperty('--k', k); c.classList.toggle('top', k === 0); c.setAttribute('aria-hidden', k !== 0); if (k !== 0) c.classList.remove('flip'); dots[i] && dots[i].classList.toggle('on', k === 0); });
  const go = (dir) => { const c = cards[top]; c.classList.remove('flip'); c.classList.add(dir > 0 ? 'fly' : 'flyr'); setTimeout(() => c.classList.remove('fly', 'flyr'), 520); top = (top + dir + n) % n; layout(); arm(); };
  const arm = () => { clearTimeout(timer); if (!reduce && n > 1) timer = setTimeout(() => { if (!el.matches(':hover') && !cards[top].classList.contains('flip')) go(1); else arm(); }, 6500); };
  const tilt = (c, x, y) => { c.style.setProperty('--rx', ((0.5 - y) * 22).toFixed(2) + 'deg'); c.style.setProperty('--ry', ((x - 0.5) * 26).toFixed(2) + 'deg'); c.style.setProperty('--mx', (x * 100).toFixed(1) + '%'); c.style.setProperty('--my', (y * 100).toFixed(1) + '%'); c.style.setProperty('--o', 1); };
  const rest = (c) => { ['--rx', '--ry'].forEach((k) => c.style.setProperty(k, '0deg')); c.style.setProperty('--o', 0); };
  el.addEventListener('pointermove', (e) => { const c = cards[top], r = c.getBoundingClientRect(); if (drag) { const dx = e.clientX - drag.x; drag.dx = dx; c.style.setProperty('--dx', dx + 'px'); return; } if (e.pointerType === 'mouse') tilt(c, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height); });
  el.addEventListener('pointerleave', () => { if (!gyro) rest(cards[top]); });
  el.addEventListener('pointerdown', (e) => { if (e.target.closest('a,button')) return; if (!e.target.closest('.hcard.top')) return; drag = { x: e.clientX, dx: 0 }; cards[top].classList.add('drag'); askGyro(); });
  const end = () => { if (!drag) return; const c = cards[top], dx = drag.dx; drag = null; c.classList.remove('drag'); c.style.setProperty('--dx', '0px'); if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1); else if (Math.abs(dx) < 6) { c.classList.toggle('flip'); arm(); } };
  addEventListener('pointerup', end); addEventListener('pointercancel', end);
  el.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') go(1); else if (e.key === 'ArrowLeft') go(-1); else if (e.key === 'Enter' || e.key === ' ') { if (e.target.closest('a')) return; e.preventDefault(); cards[top].classList.toggle('flip'); } });
  el.addEventListener('click', (e) => { const l = e.target.closest('.back a[href]'); if (l) { e.preventDefault(); location.hash = l.getAttribute('href'); return; } const b = e.target.closest('[data-dk]'); if (b) go(+b.dataset.dk); const d = e.target.closest('[data-d]'); if (d) { const want = +d.dataset.d; if (want !== top) { top = want; layout(); arm(); } } });
  // Phone gyroscope: the top card leans with the device. iOS asks permission on the first touch.
  const onTilt = (e) => { if (e.beta == null || drag) return; gyro = true; const x = Math.max(0, Math.min(1, 0.5 + (e.gamma || 0) / 50)), y = Math.max(0, Math.min(1, 0.5 + ((e.beta || 0) - 40) / 60)); tilt(cards[top], x, y); };
  function askGyro() { if (askGyro.done || reduce) return; askGyro.done = true; const D = window.DeviceOrientationEvent; if (D && typeof D.requestPermission === 'function') D.requestPermission().then((s) => s === 'granted' && addEventListener('deviceorientation', onTilt)).catch(() => {}); }
  if (!reduce && window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission !== 'function') addEventListener('deviceorientation', onTilt);
  layout(); arm(); requestAnimationFrame(() => el.classList.add('ready'));
  return () => { clearTimeout(timer); removeEventListener('pointerup', end); removeEventListener('pointercancel', end); removeEventListener('deviceorientation', onTilt); };
}
/** Light 3-D lean on artwork cards under the mouse (desktop only). */
function tiltCards(root) {
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches || matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {};
  const mv = (e) => { const c = e.target.closest('.card'); if (!c) return; const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height; c.style.setProperty('--tx', ((x - 0.5) * 8).toFixed(2) + 'deg'); c.style.setProperty('--ty', ((0.5 - y) * 8).toFixed(2) + 'deg'); c.style.setProperty('--gx', x * 100 + '%'); c.style.setProperty('--gy', y * 100 + '%'); c.classList.add('tilting'); };
  const out = (e) => { const c = e.target.closest('.card'); if (c && !c.contains(e.relatedTarget)) { c.classList.remove('tilting'); c.style.removeProperty('--tx'); c.style.removeProperty('--ty'); } };
  root.addEventListener('pointermove', mv); root.addEventListener('pointerout', out);
  return () => { root.removeEventListener('pointermove', mv); root.removeEventListener('pointerout', out); };
}

/* ================= EXPLORE ================= */
const CATS = ['Characters', 'Vehicles', 'Locations', 'Weapons', 'Artwork', 'Miscellaneous'], RARS = ['Common', 'Rare', 'Epic', 'Legendary'];
export async function explore({ q: init }) {
  const st = { era: '', category: '', rarity: '', status: '', sort: 'recent', q: '', page: 1, ...init };
  const sel = (k, label, opts) => `<select data-f="${k}" class="input" aria-label="${label}"><option value="">${label}</option>${opts.map(([v, t]) => `<option value="${esc(v)}" ${st[k] === v ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
  const html = `${pageHead('explore', 'Browse', 'Every <span class="grad">piece.</span>')}
  <div class="bar glass"><div class="row"><label class="search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg><input class="input" id="q" type="search" placeholder="Search artworks, characters, eras…" value="${esc(st.q)}"></label>
    <span data-fc="category">${sel('category', 'All types', CATS.map((c) => [c, c]))}</span><span data-fc="rarity">${sel('rarity', 'Any rarity', RARS.map((c) => [c, c]))}</span>${sel('status', 'Any status', [['free', 'Free to collect'], ['unminted', 'Available'], ['listed', 'For sale'], ['minted', 'Collected']])}
    ${sel('sort', 'Sort', [['recent', 'Newest'], ['price_low', 'Price ↑'], ['price_high', 'Price ↓'], ['liked', 'Most liked']]).replace('<option value="">Sort</option>', '')}</div>
    <div class="chips"><button class="chip ${st.era ? '' : 'on'}" data-era="">All eras</button>${S.collections.map((c) => `<button class="chip ${st.era === c.id ? 'on' : ''}" data-era="${esc(c.id)}">${esc(c.short)}</button>`).join('')}</div></div>
  <p class="count" id="count">&nbsp;</p><div id="out">${skels(8)}</div><div class="pager" id="pager"></div>`;
  const mount = (root) => {
    let seq = 0, t, facetsDone = false;
    const load = async () => {
      const my = ++seq; history.replaceState(null, '', '#/browse?' + new URLSearchParams(Object.entries(st).filter(([k, v]) => v && !(k === 'sort' && v === 'recent') && !(k === 'page' && v === 1))).toString());
      try {
        const r = await items({ ...st, limit: 24 }); if (my !== seq) return;
        $('#count', root).textContent = r.total + (r.total === 1 ? ' artwork' : ' artworks');
        if (r.facets && !facetsDone) { facetsDone = true; // only offer the types / rarities that exist; hide a filter with a single option
          [['category', 'All types', CATS], ['rarity', 'Any rarity', RARS]].forEach(([k, label, order]) => {
            const have = new Set((r.facets[k] || []).map((f) => f.value)), list = order.filter((v) => have.has(v)).concat([...have].filter((v) => !order.includes(v)));
            const box = $(`[data-fc="${k}"]`, root); if (!box) return;
            if (list.length <= 1 && !st[k]) { box.hidden = true; return; }
            box.innerHTML = sel(k, label, list.map((v) => [v, v]));
          });
        }
        $('#out', root).innerHTML = r.items.length ? `<div class="grid">${r.items.map(poster).join('')}</div>` : '<div class="empty"><b>Nothing here</b>Try different filters.</div>';
        const pages = Math.ceil(r.total / 24);
        $('#pager', root).innerHTML = pages > 1 ? `<button class="btn sm" data-p="${st.page - 1}" ${st.page <= 1 ? 'disabled' : ''}>← Prev</button><span class="muted">Page ${st.page} / ${pages}</span><button class="btn sm" data-p="${+st.page + 1}" ${st.page >= pages ? 'disabled' : ''}>Next →</button>` : '';
      } catch (e) { $('#out', root).innerHTML = `<div class="empty"><b>Could not load</b>${esc(e.message)}</div>`; }
    };
    root.onclick = (e) => {
      const c = e.target.closest('[data-era]'); if (c) { st.era = c.dataset.era; st.page = 1; $$('[data-era]', root).forEach((b) => b.classList.toggle('on', b === c)); load(); }
      const p = e.target.closest('[data-p]'); if (p) { st.page = +p.dataset.p; load(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    };
    root.onchange = (e) => { const f = e.target.dataset && e.target.dataset.f; if (f) { st[f] = e.target.value; st.page = 1; load(); } };
    const search = (v) => { clearTimeout(t); t = setTimeout(() => { st.q = v.trim(); st.page = 1; load(); }, 280); };
    root.oninput = (e) => { if (e.target.id === 'q') { const h = $('#hsq'); if (h) h.value = e.target.value; search(e.target.value); } };
    // Once the filter bar scrolls away, the search morphs into the header (and back when the bar returns).
    const hd = $('#hd'), bar = $('.bar', root);
    const hs = document.createElement('label'); hs.className = 'hsearch'; hs.id = 'hs';
    hs.innerHTML = `<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg><input id="hsq" type="search" placeholder="Search…" aria-label="Search artworks" value="${esc(st.q)}"><button type="button" class="hsf" aria-label="Filters" title="Filters"><svg viewBox="0 0 24 24"><path d="M4 6h16M7 12h10M10 18h4"/></svg></button>`;
    hd.insertBefore(hs, $('.acct', hd));
    hs.addEventListener('input', (e) => { if (e.target.id === 'hsq') { $('#q', root).value = e.target.value; search(e.target.value); } });
    $('.hsf', hs).onclick = () => { const y = bar.getBoundingClientRect().top + scrollY - (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 64) - 12; scrollTo({ top: Math.max(0, y), behavior: 'smooth' }); };
    const io = new IntersectionObserver(([en]) => { const away = !en.isIntersecting && en.boundingClientRect.top < 0; document.body.classList.toggle('hs-on', away); if (!away && document.activeElement && document.activeElement.id === 'hsq') $('#q', root).focus({ preventScroll: true }); }, { rootMargin: `-${(parseInt(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 64)}px 0px 0px 0px` });
    io.observe(bar);
    load();
    return () => { root.onclick = root.onchange = root.oninput = null; io.disconnect(); hs.remove(); document.body.classList.remove('hs-on'); };
  };
  return { html, mount };
}

/* ================= ARTWORK ================= */
const stCls = (s) => (s === 'accepted' ? 'ok' : s === 'cancelled' || s === 'rejected' || s === 'expired' || s === 'failed' ? 'bad' : 'warn');
const solLine = (n) => (n ? `<span>≈ ${sol(n)}</span>` : '');
export async function artwork({ args: [id] }) {
  id = decodeURIComponent(id);
  const [it, offers] = await Promise.all([item(id), offersFor(id).catch(() => [])]);
  const hist = it.minted ? await historyFor(id).catch(() => ({ points: [], floorUsd: it.floorUsd })) : null;
  const cfg = (S.meta && S.meta.settings) || {};
  const mine = S.wallet && it.owner === S.wallet;
  const myOffer = S.wallet && offers.find((o) => o.bidder === S.wallet);
  const top = offers[0], bw = bidWindow();
  const solOfUsd = (u) => { const r = S.meta && S.meta.solUsd; return r ? u / r : null; };
  const canOffer = it.minted && !mine && !myOffer && !it.platformOwned;
  const cols = await http('GET', '/collections', null, { auth: false }).then((r) => r.collections).catch(() => []);
  const cstat = cols.find((c) => c.id === (it.collectionId || it.era)) || {}, floor = cstat.floorUsd ?? null;
  const fee = (cfg.saleFeeBps || 250) / 10000, netFee = cfg.acceptFeeUsd ?? 0.3;
  const youGet = (p) => Math.max(0, p - p * fee - netFee);
  const fl = floor != null ? `<span>Collection floor <b>${usd(floor)}</b></span>` : '<span>No listings yet in this collection</span>';
  let box;
  if (it.state === 'mint') box = `<div class="pr"><b>${usd(it.priceUsd)}</b><span>${it.free ? 'Free to collect' : (it.platform ? 'Price' : 'Mint price')}</span>${solLine(it.priceSol)}</div><div class="acts"><button class="btn primary lg" data-a="mint" ${it.mintable && cfg.mintingEnabled !== false ? '' : 'disabled'}>${it.free ? 'Collect for free' : 'Collect · ' + usd(it.priceUsd)}</button></div>${it.mintable ? '' : '<p class="note">This collection is not open for minting yet.</p>'}`;
  else if (mine && it.listing) box = `<div class="pr"><b>${usd(it.listing.priceUsd)}</b><span>Listed for sale</span>${solLine(it.listing.priceSol)}</div>
      <div class="bx-meta">${fl}<span>You receive about <b>${usd(youGet(it.listing.priceUsd))}</b></span></div>
      <div class="acts"><button class="btn primary lg" data-a="relist">Edit price</button><button class="btn" data-a="unlist">Cancel listing</button></div>${top ? `<button class="btn ok-t" data-acc="${top.id}">Accept top offer · ${usd(top.usd)}</button>` : ''}`;
  else if (mine) box = `<div class="pr"><b>Not listed</b><span>You own this piece</span></div><div class="bx-meta">${fl}${top ? `<span>Top offer <b>${usd(top.usd)}</b></span>` : ''}</div>
      <div class="acts"><button class="btn primary lg" data-a="list">List for sale</button>${top ? `<button class="btn" data-acc="${top.id}">Accept ${usd(top.usd)}</button>` : ''}</div>`;
  else box = `<div class="pr"><b>${it.listing ? usd(it.listing.priceUsd) : 'Not listed'}</b><span>${it.listing ? 'Buy now · sold by ' + who(it.listing.seller || it.owner) : 'Owned by ' + who(it.owner)}</span>${it.listing ? solLine(it.listing.priceSol) : ''}</div><div class="bx-meta">${fl}${top ? `<span>Top offer <b>${usd(top.usd)}</b></span>` : ''}</div>
      <div class="acts">${it.listing ? '<button class="btn primary lg" data-a="buy">Buy now</button>' : ''}${canOffer ? `<button class="btn ${it.listing ? '' : 'primary lg'}" data-a="offer">Make an offer</button>` : ''}${myOffer ? '<span class="st ok">Your offer is in</span>' : ''}</div>${bw && !bw.open ? '<p class="note">Offers are paused right now.</p>' : ''}`;
  const offerRows = offers.length ? offers.map((o) => `<div class="rowc"><div><b>${usd(o.usd)}</b> <small style="display:inline">≈ ${sol(o.sol)}</small><small>${who(o.bidder)} · ${ago(o.createdAt)}</small></div><div class="r">${mine ? `<button class="btn primary sm" data-acc="${o.id}">Accept</button><button class="btn sm" data-rej="${o.id}">Decline</button>` : o.bidder === S.wallet ? `<span class="st ok">Your offer</span><button class="btn sm" data-can="${o.id}">Cancel</button>` : ''}</div></div>`).join('') : '<p class="muted">No offers yet.</p>';
  const html = `<div class="item"><div class="stage glass"><div class="amb" style="background-image:url('${esc(it.img || '')}')"></div>${imgTag(it.img, it.title, 1000, 'main')}</div>
  <div class="panel glass"><div class="crumbs"><a href="#/explore">Explore</a> / <a href="#/collection/${esc(it.era)}">${esc(it.eraShort)}</a></div>
    <h1 class="display">${esc(it.title)}</h1>
    <div class="tags"><span class="tag rar">${esc(it.rarity)}</span><span class="tag">${esc(it.category || '')}</span>${it.tags.filter((t) => ![it.category, it.rarity, it.eraShort, it.eraLabel].map((x) => String(x || '').toLowerCase()).includes(String(t).toLowerCase())).slice(0, 4).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
    <p class="muted">${esc(it.description)}</p>
    <div class="buybox">${box}</div>
    ${hist ? offerChart(hist, offers) : ''}
    <div class="kv"><div><small>Era</small><b>${esc(it.eraLabel || it.era)}</b></div><div><small>Artist</small><b>${esc(it.artist)}</b></div><div><small>Owner</small><b>${it.owner ? who(it.owner) : 'Nobody yet'}</b></div><div><small>Likes</small><b>${it.likes}</b></div>${it.asset ? `<div style="grid-column:1/-1"><small>On-chain asset</small><b><a class="txl" target="_blank" rel="noopener" href="https://explorer.solana.com/address/${esc(it.asset)}${S.meta.network === 'devnet' ? '?cluster=devnet' : ''}">${short(it.asset)} ↗</a></b></div>` : ''}</div>
    <div><h3 class="h3">Offers</h3><div class="list">${offerRows}</div></div></div></div>`;
  const reload = () => window.dispatchEvent(new HashChangeEvent('hashchange'));
  const solUsd = (S.meta && S.meta.solUsd) || 0;
  const priceModal = (title, ok, cb, val, hint) => modal(`<button class="x" data-x>✕</button><h2 class="display">${title}</h2><label class="field">Price (USD)<input id="pv" class="input" type="number" min="0" step="0.01" value="${val ?? ''}" placeholder="0.00"></label><p class="fine" id="ph">${hint || ''}</p><div class="txfoot"><button class="btn primary" data-go>${ok}</button></div>`, (m, close) => {
    $('[data-x]', m).onclick = close; const inp = $('#pv', m); inp.focus();
    const upd = () => { $('#ph', m).textContent = (solUsd && +inp.value ? `≈ ${sol(+inp.value / solUsd)} at the current price. ` : '') + (hint || ''); }; inp.oninput = upd; upd();
    $('[data-go]', m).onclick = async () => { const v = +inp.value; close(); await cb(v).then(reload, () => {}); };
  });
  const listModal = (A, P) => modal(`<button class="x" data-x>✕</button><h2 class="display">${A === 'list' ? 'List for sale' : 'Edit price'}</h2>
      <label class="field">Price (USD)<input id="pv" class="input big" type="number" min="${cfg.minOfferUsd ?? 1}" step="0.01" value="${it.listing ? it.listing.priceUsd : floor ?? ''}" placeholder="0.00"></label>
      <div class="sug">${floor != null ? `<button type="button" data-v="${floor}">Floor ${usd(floor)}</button>` : ''}${top ? `<button type="button" data-v="${top.usd}">Top offer ${usd(top.usd)}</button>` : ''}${floor != null ? `<button type="button" data-v="${Math.round(floor * 110) / 100}">Floor +10%</button>` : ''}</div>
      <div class="brk" id="brk"></div><p class="fine">${A === 'list' ? 'You sign once. The NFT stays in your wallet until someone buys it; cancel any time.' : 'Price changes are instant, no signature needed.'}</p><div class="txfoot"><button class="btn primary" data-go>${A === 'list' ? 'List it' : 'Save price'}</button></div>`, (m, close) => {
    $('[data-x]', m).onclick = close; const inp = $('#pv', m); inp.focus(); inp.select && inp.select();
    const upd = () => { const v = +inp.value || 0; $('#brk', m).innerHTML = `<div><span>Price</span><b>${usd(v)}${solUsd && v ? ` <em>≈ ${sol(v / solUsd)}</em>` : ''}</b></div><div><span>Platform fee ${(fee * 100).toFixed(1).replace(/\.0$/, '')}%</span><b>−${usd(v * fee)}</b></div><div><span>Network fee</span><b>−$${(+netFee).toFixed(2)}</b></div><div class="tot"><span>You receive</span><b>${usd(youGet(v))}</b></div>${floor != null && v && v < floor ? `<p class="warn-t">That's below the floor (${usd(floor)}). It will likely sell fast.</p>` : ''}`; };
    inp.oninput = upd; upd(); m.addEventListener('click', (e) => { const g = e.target.closest('[data-v]'); if (g) { inp.value = g.dataset.v; upd(); } });
    $('[data-go]', m).onclick = async () => { const v = +inp.value; if (!(v >= (cfg.minOfferUsd ?? 1))) return toast(`Minimum price is $${cfg.minOfferUsd ?? 1}`, 'bad'); close();
      await runTx(A === 'list' ? 'Listing' : 'Updating price', (ui) => act(A === 'list' ? 'POST' : 'PATCH', `/items/${P}/listing`, { priceUsd: v }, ui), A === 'list' ? 'Listed for sale' : 'Price updated').then(reload, () => {}); };
  });
  const mount = (root) => {
    root.onclick = async (e) => {
      const b = e.target.closest('button'); if (!b || !(b.dataset.a || b.dataset.acc || b.dataset.rej || b.dataset.can)) return;
      if (!S.wallet) return needWallet();
      const A = b.dataset.a, P = encodeURIComponent(it.id);
      if (A === 'mint') await runTx('Collecting', (ui) => act('POST', `/items/${P}/${it.platform ? 'collect' : 'mint'}`, {}, ui), 'It\'s yours!').then(reload, () => {});
      else if (A === 'buy') await runTx('Buying', (ui) => act('POST', `/items/${P}/buy`, {}, ui), 'Bought!').then(reload, () => {});
      else if (A === 'list' || A === 'relist') listModal(A, P);
      else if (A === 'unlist') await runTx('Updating', (ui) => act('DELETE', `/items/${P}/listing`, undefined, ui), 'Taken off sale').then(reload, () => {});
      else if (A === 'offer') priceModal('Make an offer', 'Send offer', (v) => runTx('Sending offer', (ui) => act('POST', `/items/${P}/offers`, { usd: v }, ui), 'Offer sent — your SOL is held safely until it ends'), top ? top.usd : '', `Minimum $${cfg.minOfferUsd ?? 1}. Charged in SOL; refunded if declined, cancelled or expired.`);
      else if (b.dataset.acc) await runTx('Accepting offer', (ui) => act('POST', `/offers/${b.dataset.acc}/accept`, {}, ui), 'Sold!').then(reload, () => {});
      else if (b.dataset.rej) await runTx('Declining', (ui) => act('POST', `/offers/${b.dataset.rej}/reject`, {}, ui), 'Offer declined, bidder refunded').then(reload, () => {});
      else if (b.dataset.can) await runTx('Cancelling', (ui) => act('DELETE', `/offers/${b.dataset.can}`, undefined, ui), 'Offer cancelled, SOL refunded').then(reload, () => {});
    };
    root.addEventListener('click', (e) => { const g = e.target.closest && e.target.closest('.chart .dt'); if (!g) return; const r = $('#chv', root); if (r) r.textContent = g.dataset.t; root.querySelectorAll('.chart .dt').forEach((n) => n.classList.toggle('on', n === g)); });
    const stg = $('.stage', root), im = $('.main', root);
    if (stg && im && matchMedia('(hover:hover)').matches) { stg.onmousemove = (e) => { const r = stg.getBoundingClientRect(); im.style.transform = `scale(1.03) translate(${((e.clientX - r.left) / r.width - .5) * -14}px,${((e.clientY - r.top) / r.height - .5) * -14}px)`; }; stg.onmouseleave = () => { im.style.transform = ''; }; }
    return () => { root.onclick = null; };
  };
  return { html, mount };
}

/* ================= COLLECTIONS ================= */
export async function collections() {
  return `${pageHead('eras', 'Eras', 'Pick your <span class="grad">decade.</span>', 'Every GTA era is its own collection — floor prices, owners and a full gallery.')}<div class="tiles">${S.collections.map((c, i) => tile(c, i)).join('')}</div>`;
}
export async function collection({ args: [id], q }) {
  id = decodeURIComponent(id);
  const c = S.collections.find((x) => x.id === id); if (!c) throw new Error('Collection not found');
  const r = await items({ era: id, sort: q.sort || 'liked', limit: 60 });
  return `<div class="cbanner"><span class="eyebrow">Collection</span><h1 class="display">${esc(c.short)}</h1><p class="muted" style="max-width:52ch">${esc(c.blurb || c.name)}</p>
    <div class="cstats">${[[c.items, 'Pieces'], [c.minted, 'Collected'], [c.owners, 'Owners'], [c.floorUsd != null ? usd(c.floorUsd) : '—', 'Floor']].map(([n, l]) => `<div class="glass"><b>${n}</b><small>${l}</small></div>`).join('')}</div></div>
  ${r.items.length ? `<div class="grid">${r.items.map(poster).join('')}</div>` : '<div class="empty"><b>Nothing here yet</b>Artworks for this era are coming soon.</div>'}${r.total > 60 ? `<div class="pager"><a class="btn" href="#/browse?era=${esc(id)}">See all ${r.total} →</a></div>` : ''}`;
}

/* ================= PRICE CHART =================
   Trade-by-trade line chart of this NFT: every mint, sale, platform buy and resale gets an evenly spaced point (so quick
   back-to-back trades never pile up), the smooth line starts at $0, tap a point to read it. Teal = bought, pink = sold to
   the platform, dashed = platform floor. */
function offerChart(h) {
  const tr = (h.points || []).filter((p) => p.at), floor = h.floorUsd || 0;
  const head = (right) => `<div class="ch-h"><h3 class="h3">Price history</h3>${right}</div>`;
  if (!tr.length) return `<div class="chart empty-c">${head(floor ? `<span class="muted">Floor <b class="accent">${usd(floor)}</b></span>` : '')}<p class="muted">No trades yet. The line moves each time this piece is bought or sold.</p></div>`;
  const kind = (p) => (p.sell ? 'Sold to platform' : p.type === 'mint' ? 'Minted' : 'Bought');
  const W = 340, H = 190, L = 40, R = 16, T = 18, B = 22, n = tr.length;
  let hi = Math.max(...tr.map((p) => p.usd), floor || 0, 1) * 1.15; { const m = 10 ** Math.floor(Math.log10(hi)), f = hi / m; hi = (f <= 1.5 ? 1.5 : f <= 2 ? 2 : f <= 3 ? 3 : f <= 5 ? 5 : f <= 6 ? 6 : 10) * m; }
  const x = (i) => L + (n === 0 ? 0 : (i / n)) * (W - L - R), y = (v) => T + (1 - v / hi) * (H - T - B);
  const pts = [[x(0), y(0)], ...tr.map((p, i) => [x(i + 1), y(p.usd)])];
  // smooth monotone curve (never overshoots, so it can't dip below $0)
  const dx = [], sl = [], tg = [];
  for (let i = 0; i < pts.length - 1; i++) { dx[i] = pts[i + 1][0] - pts[i][0]; sl[i] = (pts[i + 1][1] - pts[i][1]) / dx[i]; }
  tg[0] = sl[0]; tg[pts.length - 1] = sl[sl.length - 1];
  for (let i = 1; i < pts.length - 1; i++) tg[i] = sl[i - 1] * sl[i] <= 0 ? 0 : (sl[i - 1] + sl[i]) / 2;
  for (let i = 0; i < sl.length; i++) { if (sl[i] === 0) { tg[i] = tg[i + 1] = 0; continue; } const a = tg[i] / sl[i], b = tg[i + 1] / sl[i], q = a * a + b * b; if (q > 9) { const k = 3 / Math.sqrt(q); tg[i] = k * a * sl[i]; tg[i + 1] = k * b * sl[i]; } }
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) { const w = dx[i] / 3; d += ` C${(pts[i][0] + w).toFixed(1)},${(pts[i][1] + tg[i] * w).toFixed(1)} ${(pts[i + 1][0] - w).toFixed(1)},${(pts[i + 1][1] - tg[i + 1] * w).toFixed(1)} ${pts[i + 1][0].toFixed(1)},${pts[i + 1][1].toFixed(1)}`; }
  const base = y(0).toFixed(1), last = pts[pts.length - 1], lt = tr[n - 1];
  const area = `${d} L${last[0].toFixed(1)},${base} L${pts[0][0].toFixed(1)},${base} Z`;
  const nice = (v) => '$' + (v >= 100 ? Math.round(v) : v >= 10 ? v.toFixed(0) : v.toFixed(2).replace(/\.?0+$/, ''));
  const ticks = [0, 0.5, 1].map((k) => hi * k);
  const dots = tr.map((p, i) => `<g class="dt ${p.sell ? 'sold' : 'bought'}${i === n - 1 ? ' on' : ''}" data-t="${esc(kind(p))} · ${esc(usd(p.usd))} · ${esc(ago(p.at))}"><circle cx="${pts[i + 1][0].toFixed(1)}" cy="${pts[i + 1][1].toFixed(1)}" r="14" class="hit"/><circle cx="${pts[i + 1][0].toFixed(1)}" cy="${pts[i + 1][1].toFixed(1)}" r="${i === n - 1 ? 5.5 : 4}" class="pt ${p.sell ? 'sold' : 'bought'}"/></g>`).join('');
  const readout = `${kind(lt)} · ${usd(lt.usd)} · ${ago(lt.at)}`;
  return `<div class="chart">${head(`<span class="muted">${n} trade${n > 1 ? 's' : ''}</span>`)}
    <div class="chv" id="chv">${esc(readout)}</div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Price history">
      <defs><linearGradient id="chl" gradientUnits="userSpaceOnUse" x1="${L}" x2="${W - R}" y1="0" y2="0"><stop offset="0" stop-color="#ff3d9a"/><stop offset=".55" stop-color="#d63dff"/><stop offset="1" stop-color="#8a4dff"/></linearGradient><linearGradient id="cha" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d63dff" stop-opacity=".30"/><stop offset="1" stop-color="#d63dff" stop-opacity="0"/></linearGradient></defs>
      ${ticks.map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="gl"/><text x="${L - 7}" y="${(y(v) + 4).toFixed(1)}" class="yl" text-anchor="end">${nice(v)}</text>`).join('')}
      ${floor ? `<line x1="${L}" x2="${W - R}" y1="${y(floor).toFixed(1)}" y2="${y(floor).toFixed(1)}" class="fl"/><text x="${L + 4}" y="${(y(floor) - 5).toFixed(1)}" class="fll">Floor ${nice(floor)}</text>` : ''}
      <path d="${area}" fill="url(#cha)" class="ar"/><path d="${d}" fill="none" stroke="url(#chl)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" class="ln" pathLength="1"/>${dots}
    </svg>
    <div class="ch-f"><span>${esc(ago(tr[0].at))}</span><span>now</span></div></div>`;
}
