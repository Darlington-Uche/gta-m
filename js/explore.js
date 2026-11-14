// Explore: two fixed tabs. Collections (market list: SOL + USD floor, 24h change) and Feed (live buys and sells).
// The tab bar stays pinned under the header; panes swap in place with a directional slide, and you can swipe between them.
import { S, $, $$, esc, usd, short, ago, imgTag, http, recentSales, who as whoTag } from './core.js';

const tick = '<svg class="vf" viewBox="0 0 24 24" aria-label="Verified"><path d="M12 2l2.4 1.9 3-.2 1.1 2.8 2.6 1.6-.6 3 1.2 2.7-2 2.3-.1 3-2.9.9L12 22l-2.7-1.9-2.9-.9-.1-3-2-2.3L5.5 11l-.6-3 2.6-1.6 1.1-2.8 3 .2z"/><path d="M8.2 12.3l2.6 2.6 5-5.2" fill="none"/></svg>';
const hue = (a) => ([...String(a || 'x')].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7));
const TABS = ['collections', 'feed'];
const solOf = (u) => { const r = S.meta && S.meta.solUsd; return r && u != null ? u / r : null; };
const solTxt = (n) => (n == null ? '—' : n === 0 ? '0 SOL' : (n >= 10 ? n.toFixed(2) : n >= 0.1 ? n.toFixed(3) : n.toFixed(4)).replace(/\.?0+$/, '') + ' SOL');
const usdTxt = (v) => (v == null ? '—' : v === 0 ? 'FREE' : '$' + (v >= 100 ? Math.round(v).toLocaleString() : v.toFixed(2).replace(/\.00$/, '')));
const chg = (c) => (c.isNew24 ? '<span class="chg up">▲ New</span>' : c.change24 == null || c.change24 === 0 ? '<span class="chg flat">0%</span>' : `<span class="chg ${c.change24 >= 0 ? 'up' : 'dn'}">${c.change24 >= 0 ? '▲' : '▼'} ${Math.abs(c.change24).toLocaleString()}%</span>`);
const SORTS = { collections: [['trending', 'Trending'], ['top', 'Top volume'], ['floor', 'Highest floor'], ['new', 'Newest']], feed: [['all', 'Everything'], ['bought', 'Bought'], ['sold', 'Sold'], ['minted', 'Minted']] };
const BY = {
  trending: (a, b) => (b.vol24Usd || 0) - (a.vol24Usd || 0) || (b.volumeUsd || 0) - (a.volumeUsd || 0) || b.minted - a.minted,
  top: (a, b) => (b.volumeUsd || 0) - (a.volumeUsd || 0) || b.items - a.items,
  floor: (a, b) => (b.floorUsd ?? -1) - (a.floorUsd ?? -1),
  new: (a, b) => (b.createdAt || 0) - (a.createdAt || 0) || b.items - a.items
};

function collectionsHtml(cols, sortKey) {
  const list = [...cols].sort(BY[sortKey] || BY.trending), base = S.collections || [];
  const row = (c, i) => { const m = base.find((x) => x.id === c.id) || {}, cover = c.cover || m.cover || c.banner || m.banner || '';
    return `<a class="crow" style="--i:${i}" href="#/collection/${encodeURIComponent(c.id)}"><span class="crk">${i + 1}</span><span class="clg">${imgTag(cover, c.name, 160)}</span>
      <div class="cnm"><b>${esc(c.name)}${tick}</b><small>${c.floorUsd == null ? 'No floor yet' : solTxt(solOf(c.floorUsd))}</small></div>
      <div class="cpr"><b>${usdTxt(c.floorUsd)}</b>${chg(c)}</div></a>`; };
  return list.length ? `<div class="clist">${list.map(row).join('')}</div>` : '<div class="empty"><b>No collections yet</b>They will appear here as soon as they go live.</div>';
}

const VERB = { mint: 'minted', platform_sale: 'bought from the platform', platform_buy: 'sold to the platform' };
const side = (a) => (a.type === 'platform_buy' ? 'sold' : a.type === 'mint' ? 'minted' : 'bought');
const inFeed = (a, f) => f === 'all' || f === side(a) || (f === 'sold' && (a.type === 'listing' || a.type === 'offer'));
const keyOf = (a) => a.signature || a.itemId + ':' + a.at;
function feedCard(a, i, fresh) {
  const who = a.type === 'platform_buy' ? a.seller : a.buyer;
  const line = a.type === 'listing' || a.type === 'offer' ? `<b>${whoTag(a.buyer)}</b> bought from <b>${whoTag(a.seller)}</b>` : `<b>${whoTag(who)}</b> ${VERB[a.type] || 'traded'}`;
  return `<article class="fcd ${side(a)}${fresh ? ' fresh' : ''}" style="--i:${Math.min(i, 6)}"><div class="fc-h"><span class="av" style="--h:${hue(who)}"></span><div><p>${line}<span class="tm">· ${ago(a.at)}</span></p><a class="fti" href="#/art/${encodeURIComponent(a.itemId)}">${esc(a.title || 'Artwork')}</a></div><span class="sd ${side(a)}">${side(a)}</span></div>
    <a class="fc-img" href="#/art/${encodeURIComponent(a.itemId)}">${imgTag(a.image, a.title || '', 700)}</a>
    <div class="fc-f"><b>${a.usd ? usd(a.usd) : 'FREE'}</b><small>${a.usd ? solTxt(solOf(a.usd)) : 'free mint'}</small>${a.signature ? `<a class="txl" href="https://explorer.solana.com/tx/${esc(a.signature)}${S.meta && S.meta.network === 'devnet' ? '?cluster=devnet' : ''}" target="_blank" rel="noopener">View tx ↗</a>` : ''}</div></article>`;
}
function feedHtml(all, f, freshKeys) {
  const list = all.filter((a) => inFeed(a, f));
  return list.length ? `<div class="feed">${list.map((a, i) => feedCard(a, i, freshKeys && freshKeys.has(keyOf(a)))).join('')}</div>` : `<div class="empty"><b>${f === 'all' ? 'No trades yet' : 'Nothing ' + f + ' yet'}</b>Every mint, buy and sell shows up here as it happens.</div>`;
}

export async function exploreHub(ctx) {
  const q = ctx.q || {};
  let tab = TABS.includes(q.tab) ? q.tab : 'collections';
  const st = { collections: SORTS.collections.some(([k]) => k === q.sort) ? q.sort : 'trending', feed: SORTS.feed.some(([k]) => k === q.f) ? q.f : 'all' };
  const [cols, feed] = await Promise.all([
    http('GET', '/collections', null, { auth: false }).then((r) => r.collections.filter((c) => c.items > 0)).catch(() => []),
    recentSales(60).catch(() => [])
  ]);
  let trades = feed;
  const body = () => (tab === 'collections' ? collectionsHtml(cols, st.collections) : feedHtml(trades, st.feed));
  const label = () => SORTS[tab].find(([k]) => k === st[tab])[1];
  const html = `<div class="xbar" id="xbar"><div class="xseg" role="tablist"><i class="xth" aria-hidden="true"></i>
      <button role="tab" data-tab="collections" class="${tab === 'collections' ? 'on' : ''}">Collections</button>
      <button role="tab" data-tab="feed" class="${tab === 'feed' ? 'on' : ''}">Feed<i class="ldot" aria-hidden="true"></i></button></div>
    <button class="xfil" id="xfil" aria-haspopup="true" aria-expanded="false"><span id="xlab">${esc(label())}</span><svg viewBox="0 0 24 24"><path d="M4 7h16M7 12h10M10 17h4"/></svg></button>
    <div class="xpop" id="xpop" hidden></div></div>
  <div id="xpane" class="xpane">${body()}</div>`;
  return {
    html,
    mount(root) {
      const bar = $('#xbar', root), seg = $('.xseg', root), th = $('.xth', root), pane = $('#xpane', root), pop = $('#xpop', root), fil = $('#xfil', root);
      const thumb = () => { const b = $('button.on', seg); if (b) { th.style.width = b.offsetWidth + 'px'; th.style.transform = `translateX(${b.offsetLeft}px)`; } };
      const url = () => history.replaceState(null, '', '#/explore' + (tab === 'feed' ? '?tab=feed' : ''));
      const paint = (dir, freshKeys) => {
        const draw = () => { pane.innerHTML = tab === 'feed' && freshKeys ? feedHtml(trades, st.feed, freshKeys) : body(); $('#xlab', root).textContent = label(); };
        if (!dir) return draw();
        pane.style.setProperty('--dx', dir > 0 ? '34px' : '-34px'); pane.classList.remove('in'); pane.classList.add('out');
        setTimeout(() => { draw(); pane.classList.remove('out'); void pane.offsetWidth; pane.classList.add('in'); }, 150);
      };
      const setTab = (t) => { if (t === tab) return scrollTo({ top: 0, behavior: 'smooth' }); const dir = TABS.indexOf(t) - TABS.indexOf(tab); tab = t; $$('button', seg).forEach((b) => b.classList.toggle('on', b.dataset.tab === t)); thumb(); closePop(); url(); paint(dir);
        const top = bar.getBoundingClientRect().top + scrollY - (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 64) - 10; if (scrollY > top) scrollTo({ top, behavior: 'smooth' }); };
      const closePop = () => { if (pop.hidden) return; pop.classList.remove('open'); fil.setAttribute('aria-expanded', 'false'); setTimeout(() => { pop.hidden = true; }, 180); };
      const openPop = () => {
        pop.innerHTML = `<small>${tab === 'collections' ? 'Sort collections' : 'Show trades'}</small>${SORTS[tab].map(([k, l]) => `<button data-k="${k}" class="${k === st[tab] ? 'on' : ''}">${l}<i></i></button>`).join('')}<a href="#/browse">Browse all artworks →</a>`;
        pop.hidden = false; void pop.offsetWidth; pop.classList.add('open'); fil.setAttribute('aria-expanded', 'true');
      };
      seg.addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) setTab(b.dataset.tab); });
      fil.addEventListener('click', (e) => { e.stopPropagation(); pop.hidden ? openPop() : closePop(); });
      pop.addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (!b) return; st[tab] = b.dataset.k; closePop(); paint(1); });
      const away = (e) => { if (!pop.hidden && !pop.contains(e.target) && e.target !== fil) closePop(); };
      document.addEventListener('click', away);
      // swipe left / right on the content to change tab
      let sx = 0, sy = 0, tracking = false;
      pane.addEventListener('touchstart', (e) => { const t = e.touches[0]; sx = t.clientX; sy = t.clientY; tracking = true; }, { passive: true });
      pane.addEventListener('touchend', (e) => { if (!tracking) return; tracking = false; const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy; if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.8) setTab(dx < 0 ? 'feed' : 'collections'); }, { passive: true });
      // the bar gets a stronger glass once it is pinned
      const sentinel = document.createElement('i'); sentinel.className = 'xsent'; bar.before(sentinel);
      const io = new IntersectionObserver(([en]) => bar.classList.toggle('stuck', !en.isIntersecting), { rootMargin: `-${(parseInt(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 64) + 12}px 0px 0px 0px` });
      io.observe(sentinel);
      // live feed: new trades slide in at the top
      const poll = setInterval(async () => {
        if (document.hidden || !pane.isConnected) return;
        try { const next = await recentSales(60); const have = new Set(trades.map(keyOf)), fresh = new Set(next.map(keyOf).filter((k) => !have.has(k))); trades = next; if (fresh.size && tab === 'feed') paint(0, fresh); } catch (_) { /* keep what we have */ }
      }, 20000);
      requestAnimationFrame(() => { thumb(); seg.classList.add('ready'); pane.classList.add('in'); });
      addEventListener('resize', thumb);
      return () => { removeEventListener('resize', thumb); document.removeEventListener('click', away); io.disconnect(); clearInterval(poll); };
    }
  };
}
