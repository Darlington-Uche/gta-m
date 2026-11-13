// Home v2: a trading-app style front page. Recent trades, trending, featured collections, top movers.
import { S, $, $$, esc, usd, short, ago, imgTag, items, stats, recentSales, http } from './core.js';

const tick = '<svg class="vf" viewBox="0 0 24 24" aria-label="Verified"><path d="M12 2l2.4 1.9 3-.2 1.1 2.8 2.6 1.6-.6 3 1.2 2.7-2 2.3-.1 3-2.9.9L12 22l-2.7-1.9-2.9-.9-.1-3-2-2.3L5.5 11l-.6-3 2.6-1.6 1.1-2.8 3 .2z"/><path d="M8.2 12.3l2.6 2.6 5-5.2" fill="none"/></svg>';
const arrow = (v) => (v == null ? '' : v >= 0 ? '▲' : '▼');
const pct = (c) => (c.isNew24 ? '<span class="chg up">New</span>' : c.change24 == null ? '' : `<span class="chg ${c.change24 >= 0 ? 'up' : 'dn'}">${arrow(c.change24)} ${Math.abs(c.change24)}%</span>`);
const coverOf = (c) => c.cover || c.banner || '';
const floor = (c) => (c.floorUsd == null ? '—' : usd(c.floorUsd));

const sectionHead = (t, more) => `<div class="sh2"><h2>${t}</h2>${more ? `<a href="${more}">View all</a>` : ''}</div>`;

const tradeCard = (s) => `<a class="tcard glass" href="#/art/${encodeURIComponent(s.itemId)}">
  <div class="tc-top"><span class="tc-img">${imgTag(s.image, s.title || '', 120)}</span><div><b>${esc(s.title || 'Artwork')}</b><small>${s.type === 'platform_buy' ? 'Sold to the platform' : s.type === 'mint' ? 'Minted' : 'Sale'}</small></div><em>${s.usd ? usd(s.usd) : 'FREE'}</em></div>
  <div class="tc-bot"><i class="av" style="--h:${hue(s.buyer)}"></i><b>${short(s.buyer || '') || '—'}</b><small>${ago(s.at)}</small></div></a>`;
const hue = (a) => ([...String(a || 'x')].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7));

const dropCard = (it) => `<a class="tcard glass" href="#/art/${encodeURIComponent(it.id)}">
  <div class="tc-top"><span class="tc-img">${imgTag(it.img, it.title, 120)}</span><div><b>${esc(it.title)}</b><small>${esc(it.eraShort || '')}</small></div><em>${it.free ? 'FREE' : usd(it.priceUsd)}</em></div>
  <div class="tc-bot"><i class="av drop"></i><b>New drop</b><small>Mint now</small></div></a>`;

const trendRow = (c, i) => `<a class="trow glass" href="#/collection/${encodeURIComponent(c.id)}">
  <span class="rank">${i + 1}</span><span class="tr-img">${imgTag(coverOf(c), c.name, 120)}</span>
  <div class="tr-t"><b>${esc(c.name)}${tick}</b><small>${floor(c)} <span>floor</span>${pct(c)}</small></div></a>`;

const trendArt = (it, i) => `<a class="trow glass" href="#/art/${encodeURIComponent(it.id)}">
  <span class="rank">${i + 1}</span><span class="tr-img">${imgTag(it.img, it.title, 120)}</span>
  <div class="tr-t"><b>${esc(it.title)}</b><small>♥ ${it.likes} <span>${esc(it.eraShort || '')}</span></small></div></a>`;

const featCard = (c) => `<a class="fcard" href="#/collection/${encodeURIComponent(c.id)}">
  <span class="f-bg">${imgTag(c.banner || c.cover, c.name, 900)}</span><i class="f-shade"></i>
  <div class="f-in"><span class="f-logo">${imgTag(c.cover || c.banner, c.name, 120)}</span>
    <div><b>${esc(c.name)}${tick}</b><small>by GTA Marketplace${tick}</small><div class="f-stats"><span><b>${floor(c)}</b>floor</span><span><b>${c.items}</b>items</span><span><b>${c.owners}</b>holders</span></div></div></div></a>`;

const moverCard = (c) => `<a class="mcard glass" href="#/collection/${encodeURIComponent(c.id)}">
  <span class="m-img">${imgTag(coverOf(c), c.name, 500)}</span>
  <div class="m-in"><span class="m-logo">${imgTag(c.cover || c.banner, c.name, 80)}</span><div><b>${esc(c.name)}${tick}</b><small>${floor(c)} ${pct(c)}</small></div></div></a>`;

export async function homeView() {
  const [cols, sales, pop, fresh, st] = await Promise.all([
    http('GET', '/collections', null, { auth: false }).then((r) => r.collections).catch(() => S.collections || []),
    recentSales(10).catch(() => []),
    items({ sort: 'liked', limit: 8 }).then((r) => r.items).catch(() => []),
    items({ sort: 'recent', status: 'unminted', limit: 6 }).then((r) => r.items).catch(() => []),
    stats().catch(() => ({}))
  ]);
  const list = cols.map((c) => { const m = (S.collections || []).find((x) => x.id === c.id) || {}; return { ...c, cover: c.cover || m.cover || '', banner: c.banner || m.banner || '' }; }).filter((c) => c.items > 0);
  const trending = [...list].sort((a, b) => (b.vol24Usd || 0) - (a.vol24Usd || 0) || (b.sales24 || 0) - (a.sales24 || 0) || (b.volumeUsd || 0) - (a.volumeUsd || 0) || (b.likes || 0) - (a.likes || 0)).slice(0, 6);
  const featured = [...list].sort((a, b) => (b.live - a.live) || (b.minted - a.minted) || (b.items - a.items)).slice(0, 6);
  const movers = [...list].sort((a, b) => (b.isNew24 ? 1e9 : b.change24 ?? -1e9) - (a.isNew24 ? 1e9 : a.change24 ?? -1e9) || (b.vol24Usd || 0) - (a.vol24Usd || 0) || (b.likes || 0) - (a.likes || 0)).slice(0, 8);
  const site = S.site || {};
  const recent = sales.length ? sales.map(tradeCard).join('') : fresh.map(dropCard).join('');
  const html = `<section class="hh"><span class="eyebrow">Art marketplace · ${esc(S.meta.network)}</span>
      <h1 class="display">${site.heroTitle ? esc(site.heroTitle) : 'Own the <span class="grad">streets.</span>'}</h1>
      <div class="pills">${[[st.items ?? 0, 'Artworks'], [st.minted ?? 0, 'Collected'], [st.holders ?? 0, 'Holders'], ['$' + Math.round(st.volumeUsd || 0).toLocaleString(), 'Volume']].map(([n, l]) => `<span class="pill glass"><b>${n}</b>${l}</span>`).join('')}</div></section>
    <section class="hs">${sectionHead(sales.length ? 'Recent Trades' : 'Fresh Drops', '#/explore')}
      ${recent ? `<div class="hrow">${recent}</div>` : '<div class="empty"><b>Nothing here yet</b>The first drops are on their way.</div>'}</section>
    <section class="hs">${sectionHead('Trending Now', '#/collections')}
      <div class="seg" role="tablist"><button class="on" data-t="cols" role="tab">Collections</button><button data-t="arts" role="tab">Artworks</button></div>
      <div class="trend" id="trend"><div class="tcols" data-p="cols">${trending.map(trendRow).join('')}</div><div class="tcols" data-p="arts" hidden>${pop.slice(0, 6).map(trendArt).join('')}</div></div></section>
    ${featured.length ? `<section class="hs">${sectionHead('Featured Collections', '#/collections')}
      <div class="fcar" id="fcar">${featured.map(featCard).join('')}</div><div class="dots" id="fdots">${featured.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div></section>` : ''}
    ${movers.length ? `<section class="hs">${sectionHead('Top Movers Today', '#/collections')}<div class="hrow mv">${movers.map(moverCard).join('')}</div></section>` : ''}
    <div class="cta-band"><div class="bgi" style="background-image:url('img/crew.jpg')"></div><div><span class="eyebrow">Creators</span><h2 class="display" style="margin-top:10px">Got a collection? Launch it.</h2></div><a class="btn primary lg" href="#/create">Submit</a></div>`;
  return {
    html,
    mount(root) {
      const seg = $('.seg', root), trend = $('#trend', root);
      if (seg) seg.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; $$('button', seg).forEach((x) => x.classList.toggle('on', x === b)); $$('.tcols', trend).forEach((p) => { p.hidden = p.dataset.p !== b.dataset.t; }); };
      const car = $('#fcar', root), dots = $$('#fdots i', root);
      if (car && dots.length) {
        const upd = () => { const w = car.firstElementChild ? car.firstElementChild.getBoundingClientRect().width + 12 : 1; const i = Math.min(dots.length - 1, Math.round(car.scrollLeft / w)); dots.forEach((d, k) => d.classList.toggle('on', k === i)); };
        car.addEventListener('scroll', upd, { passive: true });
        let t = 0; const auto = setInterval(() => { if (!car.isConnected) return clearInterval(auto); if (matchMedia('(prefers-reduced-motion: reduce)').matches || car.matches(':hover') || document.hidden) return; const w = car.firstElementChild.getBoundingClientRect().width + 12; t = (Math.round(car.scrollLeft / w) + 1) % dots.length; car.scrollTo({ left: t * w, behavior: 'smooth' }); }, 4500);
        return () => clearInterval(auto);
      }
    }
  };
}
