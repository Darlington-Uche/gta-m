import { S, D, $, $$, esc, usd, sol, short, ago, items, item, offersFor, stats, recentSales, act, runTx, toast, modal, needWallet, imgTag, bidWindow } from './core.js';

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
  const [pop, fresh, st] = await Promise.all([items({ sort: 'liked', limit: 1 }), items({ sort: 'recent', limit: 8 }), stats().catch(() => ({}))]);
  const f = pop.items[0], site = S.site || {};
  const title = site.heroTitle ? esc(site.heroTitle) : 'Own the<br><span class="grad">streets.</span>';
  return `<section class="hero"><div class="hero-in"><span class="eyebrow">Art marketplace · ${esc(S.meta.network)}</span>
    <h1 class="display">${title}</h1>
    <p class="sub">${esc(site.heroSubtitle || 'Collect, trade and flex original GTA-inspired art from every era. Real NFTs on Solana — connect a wallet and start with the free drops.')}</p>
    <div class="cta"><a class="btn primary lg" href="#/explore">Browse the drops</a><a class="btn lg" href="#/create">Submit your art</a></div></div>
    ${f ? `<a class="spot glass" href="#/art/${esc(f.id)}"><span class="t">${imgTag(f.img, f.title, 160)}</span><div><small>Most liked</small><b>${esc(f.title)}</b></div><span class="price ${f.state === 'listed' ? 'listed' : f.free ? 'free' : ''}">${f.state === 'minted' ? 'Owned' : usd(f.priceUsd)}</span></a>` : ''}</section>
  <div class="stats">${[[st.items ?? 0, 'Artworks'], [st.minted ?? 0, 'Collected'], [st.holders ?? 0, 'Holders'], ['$' + Math.round(st.volumeUsd || 0).toLocaleString(), 'Volume']].map(([n, l]) => `<div class="stat glass"><b class="grad">${n}</b><small>${l}</small></div>`).join('')}</div>
  <div class="sh"><h2 class="display">Fresh <span class="grad">drops</span></h2><a class="more" href="#/explore">See all →</a></div>
  ${fresh.items.length ? `<div class="grid">${fresh.items.map(poster).join('')}</div>` : '<div class="empty"><b>Drops coming soon</b>The first artworks are being uploaded.</div>'}
  <div class="sh"><h2 class="display">Pick an <span class="grad">era</span></h2><a class="more" href="#/collections">All eras →</a></div>
  <div class="tiles">${S.collections.map((c, i) => tile(c, i)).join('')}</div>
  <div class="cta-band"><div class="bgi" style="background-image:url('img/crew.jpg')"></div><div><span class="eyebrow">Creators</span><h2 class="display" style="margin-top:10px">Got art? Get it on the wall.</h2></div><a class="btn primary lg" href="#/create">Submit artwork</a></div>`;
}

/* ================= EXPLORE ================= */
const CATS = ['Characters', 'Vehicles', 'Locations', 'Weapons', 'Artwork', 'Miscellaneous'], RARS = ['Common', 'Rare', 'Epic', 'Legendary'];
export async function explore({ q: init }) {
  const st = { era: '', category: '', rarity: '', status: '', sort: 'recent', q: '', page: 1, ...init };
  const sel = (k, label, opts) => `<select data-f="${k}" class="input" aria-label="${label}"><option value="">${label}</option>${opts.map(([v, t]) => `<option value="${esc(v)}" ${st[k] === v ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
  const html = `${pageHead('explore', 'Explore', 'Every <span class="grad">piece.</span>')}
  <div class="bar glass"><div class="row"><label class="search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg><input class="input" id="q" type="search" placeholder="Search artworks, characters, eras…" value="${esc(st.q)}"></label>
    ${sel('category', 'All types', CATS.map((c) => [c, c]))}${sel('rarity', 'Any rarity', RARS.map((c) => [c, c]))}${sel('status', 'Any status', [['free', 'Free to collect'], ['unminted', 'Available'], ['listed', 'For sale'], ['minted', 'Collected']])}
    ${sel('sort', 'Sort', [['recent', 'Newest'], ['price_low', 'Price ↑'], ['price_high', 'Price ↓'], ['liked', 'Most liked']]).replace('<option value="">Sort</option>', '')}</div>
    <div class="chips"><button class="chip ${st.era ? '' : 'on'}" data-era="">All eras</button>${S.collections.map((c) => `<button class="chip ${st.era === c.id ? 'on' : ''}" data-era="${esc(c.id)}">${esc(c.short)}</button>`).join('')}</div></div>
  <p class="count" id="count">&nbsp;</p><div id="out">${skels(8)}</div><div class="pager" id="pager"></div>`;
  const mount = (root) => {
    let seq = 0, t;
    const load = async () => {
      const my = ++seq; history.replaceState(null, '', '#/explore?' + new URLSearchParams(Object.entries(st).filter(([k, v]) => v && !(k === 'sort' && v === 'recent') && !(k === 'page' && v === 1))).toString());
      try {
        const r = await items({ ...st, limit: 24 }); if (my !== seq) return;
        $('#count', root).textContent = r.total + (r.total === 1 ? ' artwork' : ' artworks');
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
    root.oninput = (e) => { if (e.target.id === 'q') { clearTimeout(t); t = setTimeout(() => { st.q = e.target.value.trim(); st.page = 1; load(); }, 280); } };
    load();
    return () => { root.onclick = root.onchange = root.oninput = null; };
  };
  return { html, mount };
}

/* ================= ARTWORK ================= */
const stCls = (s) => (s === 'accepted' ? 'ok' : s === 'cancelled' || s === 'rejected' || s === 'expired' || s === 'failed' ? 'bad' : 'warn');
const solLine = (n) => (n ? `<span>≈ ${sol(n)}</span>` : '');
export async function artwork({ args: [id] }) {
  id = decodeURIComponent(id);
  const [it, offers] = await Promise.all([item(id), offersFor(id).catch(() => [])]);
  const cfg = (S.meta && S.meta.settings) || {};
  const mine = S.wallet && it.owner === S.wallet;
  const myOffer = S.wallet && offers.find((o) => o.bidder === S.wallet);
  const top = offers[0], bw = bidWindow();
  const canOffer = it.minted && !mine && !myOffer;
  let box;
  if (it.state === 'mint') box = `<div class="pr"><b>${usd(it.priceUsd)}</b><span>${it.free ? 'Free to collect' : 'Collect price'}</span>${solLine(it.priceSol)}</div><div class="acts"><button class="btn primary lg" data-a="mint" ${it.mintable && cfg.mintingEnabled !== false ? '' : 'disabled'}>${it.free ? 'Collect for free' : 'Collect · ' + usd(it.priceUsd)}</button></div>${it.mintable ? '' : '<p class="note">This era is not open for minting yet.</p>'}`;
  else if (mine) box = `<div class="pr"><b>${it.listing ? usd(it.listing.priceUsd) : 'Yours'}</b><span>${it.listing ? 'Your asking price' : 'You own this piece'}</span>${it.listing ? solLine(it.listing.priceSol) : ''}</div><div class="acts">${it.listing ? '<button class="btn" data-a="relist">Change price</button><button class="btn" data-a="unlist">Take off sale</button>' : '<button class="btn primary lg" data-a="list">List for sale</button>'}</div>`;
  else box = `<div class="pr"><b>${it.listing ? usd(it.listing.priceUsd) : 'Not listed'}</b><span>${it.listing ? 'Buy it now' : 'Owned by ' + short(it.owner)}</span>${it.listing ? solLine(it.listing.priceSol) : ''}</div><div class="acts">${it.listing ? '<button class="btn primary lg" data-a="buy">Buy now</button>' : ''}${canOffer ? '<button class="btn" data-a="offer">Make an offer</button>' : ''}</div>${bw && !bw.open ? '<p class="note">Offers are paused right now. They open again soon.</p>' : ''}`;
  const offerRows = offers.length ? offers.map((o) => `<div class="rowc"><div><b>${usd(o.usd)}</b> <small style="display:inline">≈ ${sol(o.sol)}</small><small>${short(o.bidder)} · ${ago(o.createdAt)}</small></div><div class="r">${mine ? `<button class="btn primary sm" data-acc="${o.id}">Accept</button><button class="btn sm" data-rej="${o.id}">Decline</button>` : o.bidder === S.wallet ? `<span class="st ok">Your offer</span><button class="btn sm" data-can="${o.id}">Cancel</button>` : ''}</div></div>`).join('') : '<p class="muted">No offers yet.</p>';
  const html = `<div class="item"><div class="stage glass"><div class="amb" style="background-image:url('${esc(it.img || '')}')"></div>${imgTag(it.img, it.title, 1000, 'main')}</div>
  <div class="panel glass"><div class="crumbs"><a href="#/explore">Explore</a> / <a href="#/collection/${esc(it.era)}">${esc(it.eraShort)}</a></div>
    <h1 class="display">${esc(it.title)}</h1>
    <div class="tags"><span class="tag rar">${esc(it.rarity)}</span><span class="tag">${esc(it.category || '')}</span>${it.tags.filter((t) => ![it.category, it.rarity, it.eraShort, it.eraLabel].map((x) => String(x || '').toLowerCase()).includes(String(t).toLowerCase())).slice(0, 4).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
    <p class="muted">${esc(it.description)}</p>
    <div class="buybox">${box}${top ? `<span class="muted">Top offer <b class="accent">${usd(top.usd)}</b> · ${offers.length} active</span>` : ''}</div>
    <div class="kv"><div><small>Era</small><b>${esc(it.eraLabel || it.era)}</b></div><div><small>Artist</small><b>${esc(it.artist)}</b></div><div><small>Owner</small><b>${it.owner ? (mine ? 'You' : short(it.owner)) : 'Nobody yet'}</b></div><div><small>Likes</small><b>${it.likes}</b></div>${it.asset ? `<div style="grid-column:1/-1"><small>On-chain asset</small><b><a class="txl" target="_blank" rel="noopener" href="https://explorer.solana.com/address/${esc(it.asset)}${S.meta.network === 'devnet' ? '?cluster=devnet' : ''}">${short(it.asset)} ↗</a></b></div>` : ''}</div>
    <div><h3 class="h3">Offers</h3><div class="list">${offerRows}</div></div></div></div>`;
  const reload = () => window.dispatchEvent(new HashChangeEvent('hashchange'));
  const solUsd = (S.meta && S.meta.solUsd) || 0;
  const priceModal = (title, ok, cb, val, hint) => modal(`<button class="x" data-x>✕</button><h2 class="display">${title}</h2><label class="field">Price (USD)<input id="pv" class="input" type="number" min="0" step="0.01" value="${val ?? ''}" placeholder="0.00"></label><p class="fine" id="ph">${hint || ''}</p><div class="txfoot"><button class="btn primary" data-go>${ok}</button></div>`, (m, close) => {
    $('[data-x]', m).onclick = close; const inp = $('#pv', m); inp.focus();
    const upd = () => { $('#ph', m).textContent = (solUsd && +inp.value ? `≈ ${sol(+inp.value / solUsd)} at the current price. ` : '') + (hint || ''); }; inp.oninput = upd; upd();
    $('[data-go]', m).onclick = async () => { const v = +inp.value; close(); await cb(v).then(reload, () => {}); };
  });
  const mount = (root) => {
    root.onclick = async (e) => {
      const b = e.target.closest('button'); if (!b || !(b.dataset.a || b.dataset.acc || b.dataset.rej || b.dataset.can)) return;
      if (!S.wallet) return needWallet();
      const A = b.dataset.a, P = encodeURIComponent(it.id);
      if (A === 'mint') await runTx('Collecting', (ui) => act('POST', `/items/${P}/mint`, {}, ui), 'It\'s yours!').then(reload, () => {});
      else if (A === 'buy') await runTx('Buying', (ui) => act('POST', `/items/${P}/buy`, {}, ui), 'Bought!').then(reload, () => {});
      else if (A === 'list' || A === 'relist') priceModal('Set your price', 'Continue', (v) => runTx(A === 'list' ? 'Listing' : 'Updating price', (ui) => act(A === 'list' ? 'POST' : 'PATCH', `/items/${P}/listing`, { priceUsd: v }, ui), 'Listed for sale'), it.listing && it.listing.priceUsd, `Platform fee ${(cfg.saleFeeBps || 250) / 100}% + about $${cfg.acceptFeeUsd ?? 0.3} network fee are taken when it sells.`);
      else if (A === 'unlist') await runTx('Updating', (ui) => act('DELETE', `/items/${P}/listing`, undefined, ui), 'Taken off sale').then(reload, () => {});
      else if (A === 'offer') priceModal('Make an offer', 'Send offer', (v) => runTx('Sending offer', (ui) => act('POST', `/items/${P}/offers`, { usd: v }, ui), 'Offer sent — your SOL is held safely until it ends'), top ? top.usd : '', `Minimum $${cfg.minOfferUsd ?? 1}. Charged in SOL; refunded if declined, cancelled or expired.`);
      else if (b.dataset.acc) await runTx('Accepting offer', (ui) => act('POST', `/offers/${b.dataset.acc}/accept`, {}, ui), 'Sold!').then(reload, () => {});
      else if (b.dataset.rej) await runTx('Declining', (ui) => act('POST', `/offers/${b.dataset.rej}/reject`, {}, ui), 'Offer declined, bidder refunded').then(reload, () => {});
      else if (b.dataset.can) await runTx('Cancelling', (ui) => act('DELETE', `/offers/${b.dataset.can}`, undefined, ui), 'Offer cancelled, SOL refunded').then(reload, () => {});
    };
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
  ${r.items.length ? `<div class="grid">${r.items.map(poster).join('')}</div>` : '<div class="empty"><b>Nothing here yet</b>Artworks for this era are coming soon.</div>'}${r.total > 60 ? `<div class="pager"><a class="btn" href="#/explore?era=${esc(id)}">See all ${r.total} →</a></div>` : ''}`;
}
