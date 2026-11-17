// Home: pixel hero + HUD, live trade ticker, drops beside a leaderboard, featured collections, top movers.
import { S, $, $$, esc, usd, short, ago, imgTag, items, stats, recentSales, http, who } from './core.js';
import { card as dropCardFull, liveCountdowns } from './drops.js';
import { mountScene } from './scene.js';

const CA = (window.GTA_CONFIG && window.GTA_CONFIG.CA) || '7vsy9nxAhNJdRsnndLd5a9Jhf5uVi8BDWr4C9hmZpump'; // token contract address shown under the hero buttons

const tick = '<svg class="vf" viewBox="0 0 24 24" aria-label="Verified"><path d="M12 2l2.4 1.9 3-.2 1.1 2.8 2.6 1.6-.6 3 1.2 2.7-2 2.3-.1 3-2.9.9L12 22l-2.7-1.9-2.9-.9-.1-3-2-2.3L5.5 11l-.6-3 2.6-1.6 1.1-2.8 3 .2z"/><path d="M8.2 12.3l2.6 2.6 5-5.2" fill="none"/></svg>';
const arrow = (v) => (v == null ? '' : v >= 0 ? '▲' : '▼');
const pct = (c) => (c.isNew24 ? '<span class="chg up">New</span>' : c.change24 == null ? '' : `<span class="chg ${c.change24 >= 0 ? 'up' : 'dn'}">${arrow(c.change24)} ${Math.abs(c.change24)}%</span>`);
const coverOf = (c) => c.cover || c.banner || '';
const floor = (c) => (c.floorUsd == null ? '—' : usd(c.floorUsd));

const sectionHead = (t, more) => `<div class="sh2"><h2>${t}</h2>${more ? `<a href="${more}">View all</a>` : ''}</div>`;


/* Leaderboard rows: rank, cover, name, floor, 24h move. */
const trendRow = (c, i) => `<a class="lb-row" href="#/collection/${encodeURIComponent(c.id)}">
  <span class="lb-rank">${i + 1}</span><span class="lb-img">${imgTag(coverOf(c), c.name, 120)}</span>
  <b class="lb-name">${esc(c.name)}${tick}</b><span class="lb-num">${floor(c)}</span><span class="lb-chg">${pct(c) || '<span class="chg">—</span>'}</span></a>`;

const trendArt = (it, i) => `<a class="lb-row" href="#/art/${encodeURIComponent(it.id)}">
  <span class="lb-rank">${i + 1}</span><span class="lb-img">${imgTag(it.img, it.title, 120)}</span>
  <b class="lb-name">${esc(it.title)}</b><span class="lb-num">${it.free ? 'FREE' : usd(it.priceUsd)}</span><span class="lb-chg"><span class="chg">${esc(it.eraShort || '')}</span></span></a>`;

/* Ticker entries: one line per trade (or per fresh drop while there are no trades yet). */
const tickTrade = (s) => `<a class="tk" href="#/art/${encodeURIComponent(s.itemId)}"><span class="tk-img">${imgTag(s.image, s.title || '', 80)}</span><b>${esc(s.title || 'Artwork')}</b><em>${s.usd ? usd(s.usd) : 'FREE'}</em><span>${s.type === 'mint' ? 'minted by' : 'bought by'} ${who(s.buyer)}</span><small>${ago(s.at)}</small></a>`;
const tickDrop = (it) => `<a class="tk" href="#/art/${encodeURIComponent(it.id)}"><span class="tk-img">${imgTag(it.img, it.title, 80)}</span><b>${esc(it.title)}</b><em>${it.free ? 'FREE' : usd(it.priceUsd)}</em><span>ready to mint</span></a>`;

const featCard = (c) => `<a class="fcard" href="#/collection/${encodeURIComponent(c.id)}">
  <span class="f-bg">${imgTag(c.banner || c.cover, c.name, 900)}</span><i class="f-shade"></i>
  <div class="f-in"><span class="f-logo">${imgTag(c.cover || c.banner, c.name, 120)}</span>
    <div><b>${esc(c.name)}${tick}</b><small>by GTA Marketplace${tick}</small><div class="f-stats"><span><b>${floor(c)}</b>floor</span><span><b>${c.items}</b>items</span><span><b>${c.owners}</b>holders</span></div></div></div></a>`;

const moverCard = (c) => `<a class="mcard glass" href="#/collection/${encodeURIComponent(c.id)}">
  <span class="m-img">${imgTag(coverOf(c), c.name, 500)}</span>
  <div class="m-in"><span class="m-logo">${imgTag(c.cover || c.banner, c.name, 80)}</span><div><b>${esc(c.name)}${tick}</b><small>${floor(c)} ${pct(c)}</small></div></div></a>`;

export async function homeView() {
  const [cols, sales, pop, fresh, st, drops] = await Promise.all([
    http('GET', '/collections', null, { auth: false }).then((r) => r.collections).catch(() => S.collections || []),
    recentSales(10).catch(() => []),
    items({ sort: 'liked', limit: 8 }).then((r) => r.items).catch(() => []),
    items({ sort: 'recent', status: 'unminted', limit: 6 }).then((r) => r.items).catch(() => []),
    stats().catch(() => ({})),
    http('GET', '/drops', null, { auth: false }).then((r) => r.drops).catch(() => [])
  ]);
  const dl = drops.filter((d) => d.status !== 'ended').sort((a, b) => (a.status === 'live' ? 0 : 1) - (b.status === 'live' ? 0 : 1) || (a.startsAt || 0) - (b.startsAt || 0)).slice(0, 8);
  const list = cols.map((c) => { const m = (S.collections || []).find((x) => x.id === c.id) || {}; return { ...c, cover: c.cover || m.cover || '', banner: c.banner || m.banner || '' }; }).filter((c) => c.items > 0);
  const trending = [...list].sort((a, b) => (b.vol24Usd || 0) - (a.vol24Usd || 0) || (b.sales24 || 0) - (a.sales24 || 0) || (b.volumeUsd || 0) - (a.volumeUsd || 0) || (b.likes || 0) - (a.likes || 0)).slice(0, 6);
  const featured = [...list].sort((a, b) => (b.live - a.live) || (b.minted - a.minted) || (b.items - a.items)).slice(0, 6);
  const movers = [...list].sort((a, b) => (b.isNew24 ? 1e9 : b.change24 ?? -1e9) - (a.isNew24 ? 1e9 : a.change24 ?? -1e9) || (b.vol24Usd || 0) - (a.vol24Usd || 0) || (b.likes || 0) - (a.likes || 0)).slice(0, 8);
  const site = S.site || {};
  const tk = sales.length ? sales.map(tickTrade).join('') : fresh.map(tickDrop).join('');
  const hud = [[st.items ?? 0, 'Artworks'], [st.minted ?? 0, 'Collected'], [st.holders ?? 0, 'Holders'], ['$' + Math.round(st.volumeUsd || 0).toLocaleString(), 'Volume']];
  const html = `<section class="hero-px">
      <h1 class="display">${site.heroTitle ? esc(site.heroTitle) : 'Own the streets.'}</h1>
      <p class="lede">${site.heroSubtitle ? esc(site.heroSubtitle) : 'GTA-inspired art on Solana. Mint it, bid on it, collect it.'}</p>
      <div class="hero-cta"><a class="btn primary lg" href="#/explore">Explore the art</a><a class="btn lg" href="#/drops">See the drops</a></div>
      <button class="ca-px" id="ca-copy" data-ca="${esc(CA)}" aria-label="Copy contract address"><span class="ca-tag">CA</span><code>${esc(CA)}</code><span class="ca-cp">Copy</span></button>
      <dl class="hud">${hud.map(([n, l]) => `<div><dt>${l}</dt><dd>${n}</dd></div>`).join('')}<div class="hud-net"><dt>Network</dt><dd>${esc(S.meta.network)}</dd></div></dl></section>
    ${tk ? `<section class="ticker-px" aria-label="${sales.length ? 'Recent trades' : 'Fresh drops'}"><b class="tk-tag">${sales.length ? 'Live trades' : 'Fresh drops'}</b><div class="tk-win"><div class="tk-track">${tk}${tk}</div></div></section>` : ''}
    <div class="board">
      <section class="hs board-drops">${sectionHead(dl.length ? (dl.some((d) => d.status === 'live') ? 'Minting now' : 'Upcoming drops') : 'Drops', '#/drops')}
        ${dl.length ? `<div class="hrow drow">${dl.map(dropCardFull).join('')}</div>` : '<div class="empty"><b>No drops yet</b>The first drops are on their way. <a class="accent" href="#/create/collection">Launch yours</a></div>'}</section>
      <section class="hs lb">${sectionHead('Top of the board', '#/explore')}
        <div class="seg" role="tablist"><button class="on" data-t="cols" role="tab">Collections</button><button data-t="arts" role="tab">Artworks</button></div>
        <div class="trend" id="trend"><div class="lb-list" data-p="cols"><div class="lb-head"><span>#</span><span></span><span>Collection</span><span>Floor</span><span>24h</span></div>${trending.map(trendRow).join('') || '<div class="empty"><b>No collections yet</b></div>'}</div>
          <div class="lb-list" data-p="arts" hidden><div class="lb-head"><span>#</span><span></span><span>Artwork</span><span>Price</span><span>Era</span></div>${pop.slice(0, 6).map(trendArt).join('')}</div></div></section>
    </div>
    ${featured.length ? `<section class="hs">${sectionHead('Featured collections', '#/collections')}
      <div class="fcar" id="fcar">${featured.map(featCard).join('')}</div><div class="dots" id="fdots">${featured.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div></section>` : ''}
    ${movers.length ? `<section class="hs">${sectionHead('Top movers today', '#/explore')}<div class="hrow mv">${movers.map(moverCard).join('')}</div></section>` : ''}
    <div class="cta-band"><canvas class="bgi" data-scene="dawn" aria-hidden="true"></canvas><div><h2 class="display">Got a collection? Launch it.</h2><p class="lede">Upload your art, set a price and a mint window, and put it in front of collectors.</p></div><a class="btn primary lg" href="#/create/collection">Launch a collection</a></div>`;
  return {
    html,
    mount(root) {
      const ca = $('#ca-copy', root);
      if (ca) ca.onclick = async () => { try { await navigator.clipboard.writeText(ca.dataset.ca); } catch (_) { const t = document.createElement('textarea'); t.value = ca.dataset.ca; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); } const c = $('.ca-cp', ca); c.textContent = 'Copied!'; ca.classList.add('ok'); setTimeout(() => { c.textContent = 'Copy'; ca.classList.remove('ok'); }, 1600); };
      const stopCd0 = liveCountdowns(root), band = $('canvas[data-scene]', root), stopBand = band ? mountScene(band, band.dataset.scene, { horizon: 0.78, orbX: 0.82, noBoat: true, seed: 77 }) : () => {};
      const stopCd = () => { stopCd0(); stopBand(); };
      const seg = $('.seg', root), trend = $('#trend', root);
      if (seg) seg.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; $$('button', seg).forEach((x) => x.classList.toggle('on', x === b)); $$('.lb-list', trend).forEach((p) => { p.hidden = p.dataset.p !== b.dataset.t; }); };
      const car = $('#fcar', root), dots = $$('#fdots i', root);
      if (car && dots.length) {
        const upd = () => { const w = car.firstElementChild ? car.firstElementChild.getBoundingClientRect().width + 12 : 1; const i = Math.min(dots.length - 1, Math.round(car.scrollLeft / w)); dots.forEach((d, k) => d.classList.toggle('on', k === i)); };
        car.addEventListener('scroll', upd, { passive: true });
        let t = 0; const auto = setInterval(() => { if (!car.isConnected) return clearInterval(auto); if (matchMedia('(prefers-reduced-motion: reduce)').matches || car.matches(':hover') || document.hidden) return; const w = car.firstElementChild.getBoundingClientRect().width + 12; t = (Math.round(car.scrollLeft / w) + 1) % dots.length; car.scrollTo({ left: t * w, behavior: 'smooth' }); }, 4500);
        return () => { clearInterval(auto); stopCd(); };
      }
      return stopCd;
    }
  };
}
