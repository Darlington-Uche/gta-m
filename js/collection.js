// Collection page v2: header + stats like a trading app, tabs swap in place (About · Items · Owned · Holders · Activity · Analytics).
import { S, $, $$, esc, usd, sol, short, ago, imgTag, items, http, explorer, toast, walletModal, who, modal, act, actMany, runTx, offersFor, isPlatform } from './core.js';
import { poster } from './views.js';

const ERA_IDS = ['vi', 'v', 'iv', 'sa', 'vice'];
const makerOf = (c) => c.creator || (S.meta && S.meta.platformWallet);
const tick = '<svg class="vf" viewBox="0 0 24 24" aria-label="Verified"><path d="M12 2l2.4 1.9 3-.2 1.1 2.8 2.6 1.6-.6 3 1.2 2.7-2 2.3-.1 3-2.9.9L12 22l-2.7-1.9-2.9-.9-.1-3-2-2.3L5.5 11l-.6-3 2.6-1.6 1.1-2.8 3 .2z"/><path d="M8.2 12.3l2.6 2.6 5-5.2" fill="none"/></svg>';
const hue = (a) => ([...String(a || 'x')].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7));
const money = (n) => (n == null ? '—' : n >= 1e6 ? '$' + (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? '$' + (n / 1e3).toFixed(1) + 'K' : '$' + (Math.round(n * 100) / 100).toLocaleString());
const TABS = [['about', 'About'], ['items', 'Items'], ['owned', 'Owned'], ['holders', 'Holders'], ['activity', 'Activity'], ['analytics', 'Analytics']];
const KIND = { mint: ['Mint', 'mint'], listing: ['Sale', 'sale'], offer: ['Offer sale', 'sale'], platform_buy: ['Sold to platform', 'sell'], platform_sale: ['Platform sale', 'buy'] };
const stat = (l, v, cls = '') => `<div><small>${l}</small><b class="${cls}">${v}</b></div>`;

/* ---------- analytics: buys vs sells ---------- */
function analytics(c, range, metric) {
  const ser = c.series.slice(-range), vol = metric === 'usd';
  const bv = (d) => (vol ? d.buyUsd : d.buys), sv = (d) => (vol ? d.sellUsd : d.sells);
  const B = ser.reduce((a, d) => a + d.buys, 0), Sl = ser.reduce((a, d) => a + d.sells, 0), BU = ser.reduce((a, d) => a + d.buyUsd, 0), SU = ser.reduce((a, d) => a + d.sellUsd, 0);
  const net = BU - SU;
  const W = 340, H = 200, L = 38, R = 8, T = 14, Bm = 24, n = ser.length;
  let hi = Math.max(1, ...ser.map((d) => Math.max(bv(d), sv(d)))) * 1.15; { const m = 10 ** Math.floor(Math.log10(hi)), f = hi / m; hi = (f <= 1.5 ? 1.5 : f <= 2 ? 2 : f <= 3 ? 3 : f <= 5 ? 5 : f <= 6 ? 6 : 10) * m; }
  const gw = (W - L - R) / n, bw = Math.max(2, Math.min(12, gw * 0.36)), y = (v) => T + (1 - v / hi) * (H - T - Bm), base = y(0);
  const fmt = (v) => (vol ? '$' + (v >= 100 ? Math.round(v) : +v.toFixed(2)) : Math.round(v));
  const label = (t) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const bars = ser.map((d, i) => { const x0 = L + i * gw + gw / 2; return `<g class="bg" data-t="${esc(label(d.t))} · Buys ${d.buys} (${money(d.buyUsd)}) · Sells ${d.sells} (${money(d.sellUsd)})">
      <rect class="hit" x="${(L + i * gw).toFixed(1)}" y="${T}" width="${gw.toFixed(1)}" height="${(H - T - Bm).toFixed(1)}"/>
      <rect class="bb" x="${(x0 - bw - 1).toFixed(1)}" y="${y(bv(d)).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, base - y(bv(d))).toFixed(1)}" rx="2"/>
      <rect class="sb" x="${(x0 + 1).toFixed(1)}" y="${y(sv(d)).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, base - y(sv(d))).toFixed(1)}" rx="2"/></g>`; }).join('');
  // cumulative net-flow line (buys minus sells in USD)
  let run = 0; const cum = ser.map((d) => (run += d.buyUsd - d.sellUsd)); const lo = Math.min(0, ...cum), hc = Math.max(1, ...cum), ny = (v) => T + (1 - (v - lo) / (hc - lo || 1)) * (H - T - Bm) * 0.9 + 6;
  const line = cum.map((v, i) => (i ? 'L' : 'M') + (L + i * gw + gw / 2).toFixed(1) + ',' + ny(v).toFixed(1)).join(' ');
  const ticks = [0, 0.5, 1].map((k) => hi * k);
  const xl = [0, Math.floor(n / 2), n - 1].map((i) => `<text x="${(L + i * gw + gw / 2).toFixed(1)}" y="${H - 6}" class="yl" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}">${label(ser[i].t)}</text>`).join('');
  const empty = B + Sl === 0;
  return `<div class="an">
    <div class="an-tiles"><div class="glass"><small>Buys</small><b class="up">${B}</b><em>${money(BU)}</em></div><div class="glass"><small>Sells</small><b class="dn">${Sl}</b><em>${money(SU)}</em></div><div class="glass"><small>Net flow</small><b class="${net >= 0 ? 'up' : 'dn'}">${net >= 0 ? '+' : '−'}${money(Math.abs(net))}</b><em>buys − sells</em></div></div>
    <div class="chart an-c"><div class="ch-h"><h3 class="h3">Buys vs sells</h3><div class="mini"><span data-r><button data-v="7" class="${range === 7 ? 'on' : ''}">7D</button><button data-v="30" class="${range === 30 ? 'on' : ''}">30D</button></span><span data-m><button data-v="n" class="${!vol ? 'on' : ''}">Count</button><button data-v="usd" class="${vol ? 'on' : ''}">Volume</button></span></div></div>
      <div class="chv" id="anv">${empty ? 'No trades in this period yet' : 'Tap a day to read it'}</div>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Daily buys and sells">
        ${ticks.map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="gl"/><text x="${L - 6}" y="${(y(v) + 4).toFixed(1)}" class="yl" text-anchor="end">${fmt(v)}</text>`).join('')}
        ${bars}${empty ? '' : `<path d="${line}" class="nf" fill="none"/>`}${xl}
      </svg>
      <div class="lg"><span><i class="b"></i>Buys</span><span><i class="s"></i>Sells</span>${empty ? '' : '<span><i class="n"></i>Net flow</span>'}</div></div>
    <p class="note">A sale between two collectors counts as a buy for one and a sell for the other. Selling to the platform at the floor counts as a sell.</p></div>`;
}

export async function collection({ args: [id], q }) {
  id = decodeURIComponent(id);
  const c = (await http('GET', '/collections/' + encodeURIComponent(id) + '/detail', null, { auth: false })).collection;
  const base = (S.collections || []).find((x) => x.id === id) || {};
  c.cover = c.cover || base.cover || ''; c.banner = c.banner || base.banner || '';
  const first = c.holders[0], two = c.holders.slice(0, 2).map((h) => who(h.wallet));
  const date = c.createdAt ? new Date(c.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : null;
  const chg = c.isNew24 ? '<b class="up">New</b>' : c.change24 == null ? '<b>—</b>' : `<b class="${c.change24 >= 0 ? 'up' : 'dn'}">${c.change24 >= 0 ? '▲' : '▼'} ${Math.abs(c.change24)}%</b>`;
  const html = `<div class="cx">
    <div class="cx-top"><button class="rbtn" id="cx-back" aria-label="Back"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button><button class="rbtn" id="cx-share" aria-label="Copy link"><svg viewBox="0 0 24 24"><path d="M12 3v12M7 8l5-5 5 5M5 14v6h14v-6"/></svg></button></div>
    <div class="cx-id"><span class="cx-logo">${imgTag(c.cover || c.banner, c.name, 200)}</span><h1>${esc(c.name)}${isPlatform(makerOf(c)) ? tick : ''}</h1><p>by ${who(makerOf(c))}${isPlatform(makerOf(c)) ? tick : ''}</p></div>
    <div class="chips2"><span>Solana · ${esc(S.meta.network === 'devnet' ? 'Devnet' : 'Mainnet')}</span><span>${c.items} items</span>${date ? `<span>${esc(date)}</span>` : ''}${c.symbol ? `<span>$${esc(c.symbol)}</span>` : ERA_IDS.includes(c.id) ? `<span>${esc(c.short || c.era)}</span>` : ''}${c.live ? '<span class="ok">On-chain</span>' : '<span>Off-chain</span>'}</div>
    <div class="cx-stats">${stat('Floor price', c.floorUsd == null ? '—' : usd(c.floorUsd))}${stat('1D volume', chg)}${stat('Top offer', c.topOfferUsd ? usd(c.topOfferUsd) : '—')}
      ${stat('24H volume', money(c.vol24Usd))}${stat('Total volume', money(c.volumeUsd))}${stat('Listed', `${c.listed} (${c.listedPct}%)`)}</div>
    ${c.holderCount ? `<div class="cx-h"><span class="avs">${c.holders.slice(0, 3).map((h) => `<i class="av" style="--h:${hue(h.wallet)}"></i>`).join('')}</span><span>${c.holderCount} holder${c.holderCount > 1 ? 's' : ''}${two.length ? ` including ${two.join(' and ')}` : ''}</span></div>` : '<div class="cx-h"><span>No holders yet. Be the first.</span></div>'}
    <div class="tabs cx-tabs" role="tablist"><i class="ind" aria-hidden="true"></i>${TABS.map(([k, l]) => `<a href="#/collection/${encodeURIComponent(id)}?tab=${k}" data-k="${k}" role="tab" class="${k === (q.tab || 'items') ? 'on' : ''}">${l}</a>`).join('')}</div>
    <div id="cx-pane"></div></div>`;
  return { html, mount: (root) => mountCollection(root, c, id, q.tab || 'items') };
}

function mountCollection(root, c, id, start) {
  const pane = $('#cx-pane', root), bar = $('.cx-tabs', root), ind = $('.ind', bar);
  const picked = new Set(); let tab = start, range = 30, metric = 'n', sort = 'recent', term = '', list = [], total = 0;
  const moveInd = () => { const a = $('a.on', bar); if (a && (a.offsetLeft < bar.scrollLeft + 8 || a.offsetLeft + a.offsetWidth > bar.scrollLeft + bar.clientWidth - 8)) bar.scrollTo({ left: Math.max(0, a.offsetLeft - (bar.clientWidth - a.offsetWidth) / 2), behavior: 'smooth' }); if (a && ind) { ind.style.width = a.offsetWidth + 'px'; ind.style.transform = `translateX(${a.offsetLeft}px)`; requestAnimationFrame(() => bar.classList.add('ready')); } };
  const holderRow = (h, i) => `<div class="hrow2"><span class="rank">${i + 1}</span><i class="av" style="--h:${hue(h.wallet)}"></i><b>${who(h.wallet)}</b><span class="n">${h.n} item${h.n > 1 ? 's' : ''}</span><em>${c.items ? Math.round((h.n / c.items) * 1000) / 10 : 0}%</em></div>`;
  const actRow = (a) => { const [l, k] = KIND[a.type] || ['Trade', 'sale']; return `<a class="arow" href="#/art/${encodeURIComponent(a.itemId)}"><span class="ai">${imgTag(a.image, a.title || '', 100)}</span><div><b>${esc(a.title || 'Artwork')}</b><small><span class="tag ${k}">${l}</span>${a.type === 'platform_buy' ? who(a.seller) : who(a.buyer)}</small></div><div class="r"><b>${a.usd ? usd(a.usd) : 'FREE'}</b><small>${ago(a.at)}</small></div></a>`; };
  const canPick = (it) => tab === 'owned' ? it.owner === S.wallet : tab === 'items' && it.minted && it.owner && it.owner !== S.wallet && !it.platformOwned;
  const cache = new Map(); const remember = (arr) => arr.forEach((i) => cache.set(String(i.id), i));
  const selBar = () => {
    let b = $('#selbar'); const n = picked.size;
    if (!n) { b && b.remove(); return; }
    if (!b) { b = document.createElement('div'); b.id = 'selbar'; b.className = 'selbar glass'; document.body.appendChild(b); }
    const mineTab = tab === 'owned', total = mineTab ? [...picked].reduce((a, k) => a + ((cache.get(k) || {}).offers?.topUsd || 0), 0) : 0;
    b.innerHTML = `<button class="rbtn" data-clr aria-label="Clear">✕</button><b>${n}</b><span>selected</span><button class="btn" data-all>All</button>${mineTab ? `<button class="btn" data-list>List</button>${total ? `<button class="btn primary" data-go>Sell · ${usd(total)}</button>` : ''}` : '<button class="btn primary" data-go>Make offer</button>'}`;
    b.onclick = (e) => { const t = e.target.closest('button'); if (!t) return;
      if (t.hasAttribute('data-clr')) { picked.clear(); sync(); }
      else if (t.hasAttribute('data-all')) { $$('.sel', pane).forEach((x) => picked.add(x.dataset.sel)); sync(); }
      else if (t.hasAttribute('data-list')) listPicked([...picked].map((k) => cache.get(k)).filter(Boolean), () => { picked.clear(); sync(); render(); });
      else if (mineTab) sellPicked([...picked].map((k) => cache.get(k)).filter((x) => x && x.offers && x.offers.count > 0), () => { picked.clear(); sync(); render(); });
      else bulkOffer([...picked], () => { picked.clear(); sync(); }); };
  };
  const sync = () => { $$('.sel', pane).forEach((x) => x.classList.toggle('on', picked.has(x.dataset.sel))); selBar(); };
  pane.addEventListener('click', (e) => { const t = e.target.closest('.sel'); if (!t) return; e.preventDefault(); e.stopPropagation(); const k = t.dataset.sel; if (picked.has(k)) picked.delete(k); else picked.add(k); sync(); });
  const gridHtml = () => { const f = term ? list.filter((it) => (it.title + ' ' + (it.category || '') + ' ' + (it.rarity || '')).toLowerCase().includes(term)) : list; return f.length ? `<div class="grid">${f.map((it) => poster(it, canPick(it) ? { on: picked.has(String(it.id)) } : undefined)).join('')}</div>` : '<div class="empty"><b>Nothing found</b>Try a different search.</div>'; };
  async function load(more) {
    const r = await items({ era: id, sort, limit: 60, page: more ? Math.floor(list.length / 60) + 1 : 1 }); list = more ? list.concat(r.items) : r.items; total = r.total; remember(r.items);
  }
  async function render() {
    if (pane.dataset.t !== tab) { picked.clear(); pane.dataset.t = tab; selBar(); }
    $$('a', bar).forEach((a) => a.classList.toggle('on', a.dataset.k === tab)); moveInd();
    if (tab === 'about') pane.innerHTML = `<div class="about glass"><p>${esc(c.blurb || c.name + ' — original GTA-inspired art on Solana.')}</p><dl>
      <dt>Supply</dt><dd>${c.items}</dd><dt>Collected</dt><dd>${c.minted}</dd><dt>Network</dt><dd>Solana ${esc(S.meta.network)}</dd><dt>Creator</dt><dd>${who(makerOf(c))}${isPlatform(makerOf(c)) ? ' ' + tick : ''}</dd>
      ${c.address ? `<dt>Address</dt><dd><a href="https://explorer.solana.com/address/${esc(c.address)}${S.meta.network === 'devnet' ? '?cluster=devnet' : ''}" target="_blank" rel="noopener">${short(c.address)} ↗</a></dd>` : ''}</dl></div>`;
    else if (tab === 'items') {
      pane.innerHTML = `<div class="ibar"><label class="isearch"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/></svg><input id="cx-s" placeholder="Search items…" value="${esc(term)}" autocomplete="off"></label><select id="cx-sort" aria-label="Sort"><option value="recent">Newest</option><option value="price_low">Price ↑</option><option value="price_high">Price ↓</option></select></div><div id="cx-grid"><div class="grid"><div class="skel"></div><div class="skel"></div></div></div>`;
      $('#cx-sort', root).value = sort;
      if (!list.length) await load(); if (tab !== 'items') return;
      $('#cx-grid', root).innerHTML = gridHtml() + (list.length < total ? '<div class="pager"><button class="btn" id="cx-more">Load more</button></div>' : '');
    } else if (tab === 'owned') {
      if (!S.wallet) { pane.innerHTML = '<div class="empty"><b>Connect your wallet</b>See which pieces of this collection you own.<br><button class="btn primary" id="cx-cw" style="margin-top:14px">Connect wallet</button></div>'; $('#cx-cw', root).onclick = walletModal; return; }
      pane.innerHTML = '<div class="grid"><div class="skel"></div><div class="skel"></div></div>';
      const r = await items({ era: id, owner: S.wallet, limit: 60 }); if (tab !== 'owned') return;
      remember(r.items); pane.innerHTML = r.items.length ? `<div class="grid">${r.items.map((it) => poster(it, canPick(it) ? { on: picked.has(String(it.id)) } : undefined)).join('')}</div>` : '<div class="empty"><b>You own nothing here yet</b>Collect a piece and it shows up here.</div>';
    } else if (tab === 'holders') pane.innerHTML = c.holders.length ? `<div class="hl glass">${c.holders.map(holderRow).join('')}</div>` : '<div class="empty"><b>No holders yet</b>Collected pieces appear here.</div>';
    else if (tab === 'activity') pane.innerHTML = c.activity.length ? `<div class="al glass">${c.activity.map(actRow).join('')}</div>` : '<div class="empty"><b>No activity yet</b>Mints, sales and offers will show up here.</div>';
    else pane.innerHTML = analytics(c, range, metric);
    pane.classList.remove('swap'); void pane.offsetWidth; pane.classList.add('swap');
  }
  bar.addEventListener('click', (e) => { const a = e.target.closest('a[data-k]'); if (!a) return; e.preventDefault(); tab = a.dataset.k; history.replaceState(null, '', `#/collection/${encodeURIComponent(id)}?tab=${tab}`); render(); });
  pane.addEventListener('input', (e) => { if (e.target.id === 'cx-s') { term = e.target.value.trim().toLowerCase(); const g = $('#cx-grid', root); if (g) g.innerHTML = gridHtml() + (!term && list.length < total ? '<div class="pager"><button class="btn" id="cx-more">Load more</button></div>' : ''); } });
  pane.addEventListener('change', async (e) => { if (e.target.id === 'cx-sort') { sort = e.target.value; list = []; await render(); } });
  pane.addEventListener('click', async (e) => {
    if (e.target.id === 'cx-more') { e.target.disabled = true; await load(true); $('#cx-grid', root).innerHTML = gridHtml() + (list.length < total ? '<div class="pager"><button class="btn" id="cx-more">Load more</button></div>' : ''); return; }
    const rb = e.target.closest('[data-r] button'), mb = e.target.closest('[data-m] button');
    if (rb) { range = +rb.dataset.v; render(); } else if (mb) { metric = mb.dataset.v; render(); }
    const g = e.target.closest('.bg'); if (g) { const v = $('#anv', root); if (v) v.textContent = g.dataset.t; $$('.bg', root).forEach((x) => x.classList.toggle('on', x === g)); }
  });
  $('#cx-back', root).onclick = () => (history.length > 1 ? history.back() : (location.hash = '#/collections'));
  $('#cx-share', root).onclick = async () => { const url = location.origin + location.pathname + `#/collection/${encodeURIComponent(id)}`; try { if (navigator.share) await navigator.share({ title: c.name, url }); else { await navigator.clipboard.writeText(url); toast('Link copied'); } } catch (_) { /* cancelled */ } };
  render(); addEventListener('resize', moveInd);
  return () => removeEventListener('resize', moveInd);
}

/** Offers on the selected pieces: one price for each, ONE payment and one signature for all of them. */
function bulkOffer(ids, done) {
  if (!S.wallet) return walletModal();
  const solUsd = (S.meta && S.meta.solUsd) || 0, min = ((S.meta && S.meta.settings) || {}).minOfferUsd || 1, n = ids.length;
  modal(`<button class="x" data-x>✕</button><h2 class="display">Offer on ${n} NFT${n > 1 ? 's' : ''}</h2><div class="bulk-f">
    <label class="field">Price for each (USD)<input id="bp" class="input big" type="number" min="${min}" step="0.01" placeholder="0.00"></label>
    <div class="tot"><span>Total</span><b id="bt">$0</b></div><p class="fine" id="bs"></p>
    <div class="txfoot"><button class="btn primary" data-go>Send ${n > 1 ? 'offers' : 'offer'}</button></div></div>`, (m, close) => {
    const inp = $('#bp', m), upd = () => { const v = +inp.value || 0; $('#bt', m).textContent = usd(v * n); $('#bs', m).textContent = solUsd && v ? `≈ ${sol((v * n) / solUsd)} held safely until the offers end. One approval for all.` : 'One approval for all.'; };
    $('[data-x]', m).onclick = close; inp.oninput = upd; upd(); inp.focus();
    $('[data-go]', m).onclick = async () => {
      const v = +inp.value; if (!(v >= min)) return toast(`Minimum offer is $${min}`, 'bad'); close();
      try { const r = await runTx('Sending offers', (ui) => act('POST', '/offers/bulk', { itemIds: ids, usd: v }, ui), `${n} offer${n > 1 ? 's' : ''} sent`); done && done(); if (r && r.prep && r.prep.skipped && r.prep.skipped.length) toast(`${r.prep.skipped.length} skipped (already offered or not available)`); } catch (_) { /* shown in the dialog */ }
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    };
  });
}
/** Sell the selected pieces to their top offers: one wallet approval per 10 pieces. */
async function sellPicked(its, done) {
  if (!S.wallet) return walletModal();
  let ids = [], sum = 0;
  try { for (const it of its) { const o = (await offersFor(it.id))[0]; if (o) { ids.push(o.id); sum += o.usd; } } } catch (_) { return toast('Could not load offers', 'bad'); }
  if (!ids.length) return toast('No offers to accept', 'bad');
  modal(`<button class="x" data-x>✕</button><h2 class="display">Sell ${ids.length} NFT${ids.length > 1 ? 's' : ''}</h2><div class="bulk-f"><div class="tot"><span>Top offers total</span><b>${usd(sum)}</b></div><p class="fine">Platform fee and network fee are taken from each sale. One approval for up to 10 NFTs.</p><div class="txfoot"><button class="btn primary" data-go>Sell now</button></div></div>`, (m, close) => {
    $('[data-x]', m).onclick = close;
    $('[data-go]', m).onclick = async () => {
      close();
      for (let i = 0; i < ids.length; i += 10) { try { await runTx('Selling', (ui) => actMany('POST', '/offers/accept-bulk', { offerIds: ids.slice(i, i + 10) }, ui), 'Sold!'); } catch (_) { break; } }
      done && done(); window.dispatchEvent(new HashChangeEvent('hashchange'));
    };
  });
}
window.addEventListener('hashchange', () => { if (!/^#\/collection\//.test(location.hash)) { const b = document.getElementById('selbar'); if (b) b.remove(); } });

/** List the selected pieces for sale at one price each; the wallet approves up to 10 at once. */
function listPicked(its, done) {
  if (!S.wallet) return walletModal();
  const ids = its.filter((i) => !i.listing).map((i) => i.id), n = ids.length, solUsd = (S.meta && S.meta.solUsd) || 0, cfg = (S.meta && S.meta.settings) || {}, min = cfg.minOfferUsd || 1;
  if (!n) return toast('These are already listed', 'bad');
  modal(`<button class="x" data-x>✕</button><h2 class="display">List ${n} NFT${n > 1 ? 's' : ''}</h2><div class="bulk-f">
    <label class="field">Price for each (USD)<input id="lp" class="input big" type="number" min="${min}" step="0.01" placeholder="0.00"></label>
    <div class="tot"><span>If all sell</span><b id="lt">$0</b></div><p class="fine" id="ls"></p>
    <div class="txfoot"><button class="btn primary" data-go>List ${n > 1 ? 'them' : 'it'}</button></div></div>`, (m, close) => {
    const inp = $('#lp', m), upd = () => { const v = +inp.value || 0; $('#lt', m).textContent = usd(v * n); $('#ls', m).textContent = (solUsd && v ? `≈ ${sol(v / solUsd)} each. ` : '') + 'Your NFTs stay in your wallet until sold. One approval for up to 10.'; };
    $('[data-x]', m).onclick = close; inp.oninput = upd; upd(); inp.focus();
    $('[data-go]', m).onclick = async () => {
      const v = +inp.value; if (!(v >= min)) return toast(`Minimum price is $${min}`, 'bad'); close();
      for (let i = 0; i < ids.length; i += 10) { try { await runTx('Listing', (ui) => actMany('POST', '/listings/bulk', { itemIds: ids.slice(i, i + 10), priceUsd: v }, ui), 'Listed!'); } catch (_) { break; } }
      done && done(); window.dispatchEvent(new HashChangeEvent('hashchange'));
    };
  });
}
