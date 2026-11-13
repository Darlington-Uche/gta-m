// Explore hub: Categories (browse artworks) · Collections (market list) · Feed (live buys and sells).
import { S, $, $$, esc, usd, short, ago, imgTag, http, recentSales } from './core.js';
import { explore as browse } from './views.js';

const tick = '<svg class="vf" viewBox="0 0 24 24" aria-label="Verified"><path d="M12 2l2.4 1.9 3-.2 1.1 2.8 2.6 1.6-.6 3 1.2 2.7-2 2.3-.1 3-2.9.9L12 22l-2.7-1.9-2.9-.9-.1-3-2-2.3L5.5 11l-.6-3 2.6-1.6 1.1-2.8 3 .2z"/><path d="M8.2 12.3l2.6 2.6 5-5.2" fill="none"/></svg>';
const hue = (a) => ([...String(a || 'x')].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7));
const TABS = [['categories', 'Categories'], ['collections', 'Collections'], ['feed', 'Feed']];
const solOf = (u) => { const r = S.meta && S.meta.solUsd; return r && u != null ? u / r : null; };
const solTxt = (n) => (n == null ? '—' : n === 0 ? '0 SOL' : (n >= 10 ? n.toFixed(2) : n >= 0.1 ? n.toFixed(3) : n.toFixed(4)).replace(/\.?0+$/, '') + ' SOL');
const tabs = (cur) => `<div class="xtabs" role="tablist">${TABS.map(([k, l]) => `<a href="#/explore?tab=${k}" role="tab" class="${k === cur ? 'on' : ''}" aria-selected="${k === cur}">${l}</a>`).join('')}</div>`;
const chg = (c) => (c.isNew24 ? '<span class="chg up">▲ New</span>' : c.change24 == null || c.change24 === 0 ? '<span class="chg flat">0%</span>' : `<span class="chg ${c.change24 >= 0 ? 'up' : 'dn'}">${c.change24 >= 0 ? '▲' : '▼'} ${Math.abs(c.change24).toLocaleString()}%</span>`);

/* ---------- collections ---------- */
async function collectionsTab(sortKey) {
  const cols = (await http('GET', '/collections', null, { auth: false })).collections.filter((c) => c.items > 0);
  const by = { trending: (a, b) => (b.vol24Usd || 0) - (a.vol24Usd || 0) || (b.volumeUsd || 0) - (a.volumeUsd || 0) || b.minted - a.minted, top: (a, b) => (b.volumeUsd || 0) - (a.volumeUsd || 0) || b.items - a.items, floor: (a, b) => (b.floorUsd ?? -1) - (a.floorUsd ?? -1) };
  const list = [...cols].sort(by[sortKey] || by.trending);
  const base = S.collections || [];
  const row = (c) => { const m = base.find((x) => x.id === c.id) || {}, cover = c.cover || m.cover || c.banner || m.banner || '', s = solOf(c.floorUsd);
    return `<a class="crow" href="#/collection/${encodeURIComponent(c.id)}"><span class="clg">${imgTag(cover, c.name, 160)}</span>
      <div class="cnm"><b>${esc(c.name)}${tick}</b><small>${c.floorUsd == null ? 'No floor yet' : solTxt(s)}<span>floor</span></small></div>
      <div class="cpr"><b>${c.floorUsd == null ? '—' : c.floorUsd === 0 ? 'FREE' : '$' + (c.floorUsd >= 100 ? Math.round(c.floorUsd).toLocaleString() : c.floorUsd.toFixed(2).replace(/\.00$/, ''))}</b>${chg(c)}</div></a>`; };
  return `<div class="chips2 sorts" data-sorts>${[['trending', 'Trending'], ['top', 'Top volume'], ['floor', 'Floor']].map(([k, l]) => `<button class="chip ${k === sortKey ? 'on' : ''}" data-s="${k}">${l}</button>`).join('')}<span class="rng">1d</span></div>
    ${list.length ? `<div class="clist">${list.map(row).join('')}</div>` : '<div class="empty"><b>No collections yet</b>They will appear here as soon as they go live.</div>'}`;
}

/* ---------- feed ---------- */
const VERB = { mint: 'minted', listing: 'bought', offer: 'bought', platform_sale: 'bought from the platform', platform_buy: 'sold to the platform' };
const side = (a) => (a.type === 'platform_buy' ? 'sold' : a.type === 'mint' ? 'minted' : 'bought');
function feedCard(a) {
  const who = a.type === 'platform_buy' ? a.seller : a.buyer, s = solOf(a.usd);
  const line = a.type === 'listing' || a.type === 'offer' ? `<b>${short(a.buyer)}</b> bought from <b>${short(a.seller)}</b>` : `<b>${short(who)}</b> ${VERB[a.type] || 'traded'}`;
  return `<article class="fcd ${side(a)}"><div class="fc-h"><span class="av" style="--h:${hue(who)}"></span><div><p>${line}<span class="tm">· ${ago(a.at)}</span></p><a class="fti" href="#/art/${encodeURIComponent(a.itemId)}">${esc(a.title || 'Artwork')}${tick}</a></div><span class="sd ${side(a)}">${side(a)}</span></div>
    <a class="fc-img" href="#/art/${encodeURIComponent(a.itemId)}">${imgTag(a.image, a.title || '', 700)}</a>
    <div class="fc-f"><b>${a.usd ? usd(a.usd) : 'FREE'}</b><small>${a.usd ? solTxt(s) : 'free mint'}</small>${a.signature ? `<a class="txl" href="https://explorer.solana.com/tx/${esc(a.signature)}${S.meta && S.meta.network === 'devnet' ? '?cluster=devnet' : ''}" target="_blank" rel="noopener">tx ↗</a>` : ''}</div></article>`;
}
async function feedTab(filter) {
  const all = await recentSales(60).catch(() => []);
  const ok = (a) => filter === 'all' || (filter === 'bought' && ['mint', 'listing', 'offer', 'platform_sale'].includes(a.type) && a.type !== 'mint') || (filter === 'sold' && ['listing', 'offer', 'platform_buy'].includes(a.type)) || (filter === 'minted' && a.type === 'mint');
  const list = all.filter(ok);
  return `<div class="chips2 sorts" data-feedf>${[['all', 'All'], ['bought', 'Bought'], ['sold', 'Sold'], ['minted', 'Minted']].map(([k, l]) => `<button class="chip ${k === filter ? 'on' : ''}" data-f="${k}">${l}</button>`).join('')}</div>
    ${list.length ? `<div class="feed">${list.map(feedCard).join('')}</div>` : '<div class="empty"><b>No trades yet</b>Every mint, buy and sell shows up here as it happens.</div>'}`;
}

export async function exploreHub(ctx) {
  const q = { ...(ctx.q || {}) }, tab = TABS.some(([k]) => k === q.tab) ? q.tab : 'categories'; delete q.tab;
  if (tab === 'categories') { const r = await browse({ ...ctx, q }); const html = tabs(tab) + (r.html || r); return typeof r === 'string' ? html : { ...r, html }; }
  let sortKey = q.sort || 'trending', feedF = q.f || 'all';
  const render = async () => (tab === 'collections' ? collectionsTab(sortKey) : feedTab(feedF));
  const body = await render();
  return {
    html: `${tabs(tab)}<div id="xpane">${body}</div>`,
    mount(root) {
      const pane = $('#xpane', root);
      pane.addEventListener('click', async (e) => {
        const s = e.target.closest('[data-s]'), f = e.target.closest('[data-f]'); if (!s && !f) return;
        if (s) sortKey = s.dataset.s; if (f) feedF = f.dataset.f;
        pane.innerHTML = await render(); pane.classList.remove('swap'); void pane.offsetWidth; pane.classList.add('swap');
      });
    }
  };
}
