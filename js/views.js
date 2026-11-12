import { S, D, $, $$, esc, usd, money, short, ago, thumb, items, item, offersFor, salesFor, recentSales, stats, rpc, runTx, toast, modal, needWallet, refreshMe } from './core.js';

const heart = '<svg viewBox="0 0 24 24"><path d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z"/></svg>';
export const poster = (it) => {
  const price = it.state === 'mint' ? `<span class="price ${it.free ? 'free' : ''}">${usd(it.priceUsd)}</span>` : it.state === 'listed' ? `<span class="price listed">${usd(it.priceUsd)}</span>` : '<span class="price own">OWNED</span>';
  return `<a class="poster rar-${esc(it.rarity)}" href="#/art/${esc(it.id)}"><img class="art" loading="lazy" decoding="async" src="${esc(thumb(it.img, 560))}" alt="${esc(it.title)}" onerror="this.style.opacity=.2">
  <span class="tape">${esc(it.eraShort)}</span><button class="like ${S.likes.has(String(it.id)) ? 'on' : ''}" data-like="${esc(it.id)}" aria-label="Like">${heart}<span>${it.likes}</span></button>
  <div class="cap"><div><b>${esc(it.title)}</b><small>${esc(it.category || '')} · ${esc(it.rarity)}</small></div>${price}</div></a>`;
};
const skels = (n) => `<div class="grid">${'<div class="skel"></div>'.repeat(n)}</div>`;
const pad = (n) => String(n).padStart(2, '0');

/* ================= HOME ================= */
export async function home() {
  const [pop, fresh, st] = await Promise.all([items({ sort: 'liked', limit: 3 }), items({ sort: 'recent', limit: 12 }), stats()]);
  const cols = S.collections;
  const words = [...cols.map((c) => c.short), 'Free mints', 'Devnet', 'Offers open'];
  const tick = [...words, ...words].map((w) => `<span>${esc(w)}</span>`).join('');
  return `<section class="hero"><div><span class="eyebrow">Art marketplace · Devnet</span>
    <h1 class="display"><span>Own</span><span class="o">the</span><span class="l">streets.</span></h1>
    <p class="sub">Collect, trade and flex original GTA-inspired art from every era — Liberty City to Vice City to San Andreas. Connect a wallet and start with $1,000 of play money.</p>
    <div class="cta"><a class="btn primary lg" href="#/explore">Browse the drops</a><a class="btn lg" href="#/create">Submit your art</a></div></div>
    <div class="stack">${pop.items.map(poster).join('')}<div class="stamp">$1000<br>free<br>cash</div></div></section>
  <div class="ticker"><div>${tick}</div></div>
  <div class="sh"><h2 class="display">Fresh <span class="lime">drops</span></h2><a class="more" href="#/explore">See all →</a></div>
  <div class="hrail">${fresh.items.map(poster).join('')}</div>
  <div class="sh"><h2 class="display">Pick an <span class="hot">era</span></h2><a class="more" href="#/collections">All eras →</a></div>
  <div class="eras">${cols.map((c, i) => `<a class="era-row" href="#/collection/${esc(c.id)}"><span class="n">${pad(i + 1)}</span><h3 class="display">${esc(c.short)}</h3><span class="meta">${c.items} pieces · ${c.minted} collected${c.floorUsd != null ? ' · ' + (c.floorUsd ? 'from ' + usd(c.floorUsd) : 'free picks') : ''}</span><span class="pv" style="background-image:url('${esc(thumb(c.cover, 400))}')"></span></a>`).join('')}</div>
  <div class="stats">${[[st.items, 'Artworks'], [st.minted, 'Collected'], [st.sales, 'Trades'], [money(st.volume).replace('.00', ''), 'Volume']].map(([n, l]) => `<div class="stat glass"><b>${n}</b><small>${l}</small></div>`).join('')}</div>
  <div class="cta-band glass"><div><span class="eyebrow">Creators</span><h2 class="display">Got art?<br>Get it on the wall.</h2></div><a class="btn primary lg" href="#/create">Submit artwork</a></div>`;
}

/* ================= EXPLORE ================= */
const CATS = ['Characters', 'Locations', 'Vehicles', 'Weapons'], RARS = ['Common', 'Rare', 'Epic', 'Legendary'];
export async function explore({ q: init }) {
  const st = { era: '', category: '', rarity: '', status: '', sort: 'recent', q: '', page: 1, ...init };
  const sel = (k, label, opts) => `<select data-f="${k}" class="input" aria-label="${label}"><option value="">${label}</option>${opts.map(([v, t]) => `<option value="${esc(v)}" ${st[k] === v ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
  const html = `<div class="ph"><span class="eyebrow">Explore</span><h1 class="display">Every piece.</h1></div>
  <div class="bar glass"><div class="row"><label class="search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg><input class="input" id="q" type="search" placeholder="Search artworks, characters, eras…" value="${esc(st.q)}"></label>
    ${sel('category', 'All types', CATS.map((c) => [c, c]))}${sel('rarity', 'Any rarity', RARS.map((c) => [c, c]))}${sel('status', 'Any status', [['free', 'Free to collect'], ['mint', 'Available'], ['listed', 'For sale'], ['minted', 'Collected']])}
    ${sel('sort', 'Sort', [['recent', 'Newest'], ['price_low', 'Price ↑'], ['price_high', 'Price ↓'], ['liked', 'Most liked']]).replace('<option value="">Sort</option>', '')}</div>
    <div class="chips" id="eras"><button class="chip ${st.era ? '' : 'on'}" data-era="">All eras</button>${S.collections.map((c) => `<button class="chip ${st.era === c.id ? 'on' : ''}" data-era="${esc(c.id)}">${esc(c.short)}</button>`).join('')}</div></div>
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
export async function artwork({ args: [id] }) {
  id = decodeURIComponent(id);
  const [it, offers, hist] = await Promise.all([item(id), offersFor(id), salesFor(id)]);
  const mine = S.wallet && it.owner === S.wallet;
  const myOffer = S.wallet && offers.find((o) => o.bidder === S.wallet);
  const top = offers[0];
  let box;
  if (it.state === 'mint') box = `<div class="pr"><b>${usd(it.priceUsd)}</b><span>${it.free ? 'Free to collect' : 'Collect price'}</span></div><div class="acts"><button class="btn primary lg" data-a="mint">${it.free ? 'Collect for free' : 'Collect · ' + usd(it.priceUsd)}</button></div>`;
  else if (mine) box = `<div class="pr"><b>${it.listing != null ? usd(it.listing) : 'Yours'}</b><span>${it.listing != null ? 'Your asking price' : 'You own this piece'}</span></div><div class="acts">${it.listing != null ? '<button class="btn" data-a="relist">Change price</button><button class="btn" data-a="unlist">Take off sale</button>' : '<button class="btn primary lg" data-a="list">List for sale</button>'}</div>`;
  else box = `<div class="pr"><b>${it.listing != null ? usd(it.listing) : 'Not listed'}</b><span>${it.listing != null ? 'Buy it now' : 'Owned by ' + short(it.owner)}</span></div><div class="acts">${it.listing != null ? '<button class="btn primary lg" data-a="buy">Buy now</button>' : ''}${myOffer ? '' : '<button class="btn" data-a="offer">Make an offer</button>'}</div>`;
  const offerRows = offers.length ? offers.map((o) => `<div class="rowc"><div class="l"><div><b>${usd(+o.usd)}</b><small>${short(o.bidder)} · ${ago(o.created_at)}</small></div></div><div class="r">${mine ? `<button class="btn primary sm" data-acc="${o.id}">Accept</button><button class="btn sm" data-rej="${o.id}">Decline</button>` : o.bidder === S.wallet ? `<span class="st ok">Your offer</span><button class="btn sm" data-can="${o.id}">Cancel</button>` : ''}</div></div>`).join('') : '<p class="muted">No offers yet.</p>';
  const histRows = hist.length ? hist.map((s) => `<div class="rowc"><div class="l"><div><b>${s.type === 'mint' ? 'Collected' : s.type === 'offer' ? 'Offer accepted' : 'Sold'}</b><small>${short(s.buyer)}${s.seller ? ' ← ' + short(s.seller) : ''} · ${ago(s.created_at)}</small></div></div><b>${usd(+s.usd)}</b></div>`).join('') : '<p class="muted">No history yet.</p>';
  const html = `<div class="item"><div class="stage glass"><div class="amb" style="background-image:url('${esc(thumb(it.img, 200))}')"></div><img class="main" src="${esc(it.img)}" alt="${esc(it.title)}"></div>
  <div class="panel glass"><div class="crumbs"><a href="#/explore">Explore</a> / <a href="#/collection/${esc(it.era)}">${esc(it.eraShort)}</a></div>
    <h1 class="display">${esc(it.title)}</h1>
    <div class="tags"><span class="tag rar">${esc(it.rarity)}</span><span class="tag">${esc(it.category || '')}</span>${it.tags.filter((t) => ![it.category, it.rarity, it.eraShort, it.eraLabel].map((x) => String(x || '').toLowerCase()).includes(String(t).toLowerCase())).slice(0, 4).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
    <p class="muted">${esc(it.description)}</p>
    <div class="buybox">${box}${top ? `<span class="muted">Top offer <b class="lime">${usd(+top.usd)}</b> · ${offers.length} active</span>` : ''}</div>
    <div class="kv"><div><small>Era</small><b>${esc(it.eraLabel || it.era)}</b></div><div><small>Artist</small><b>${esc(it.artist)}</b></div><div><small>Owner</small><b>${it.owner ? (mine ? 'You' : short(it.owner)) : 'Nobody yet'}</b></div><div><small>Likes</small><b>${it.likes}</b></div></div>
    <div><h3 class="display" style="font-size:30px;margin-bottom:12px">Offers</h3><div class="list" id="offers">${offerRows}</div></div>
    <div><h3 class="display" style="font-size:30px;margin-bottom:12px">History</h3><div class="list">${histRows}</div></div></div></div>`;
  const reload = () => window.dispatchEvent(new HashChangeEvent('hashchange'));
  const priceModal = (title, ok, cb, val) => modal(`<button class="x" data-x>✕</button><h2 class="display">${title}</h2><label class="field">Price (USD)<input id="pv" class="input" type="number" min="0" step="0.01" value="${val ?? ''}" placeholder="0.00"></label><p class="fine">A 2.5% platform fee is taken from the seller on every sale.</p><div class="txfoot"><button class="btn primary" data-go>${ok}</button></div>`, (m, close) => {
    $('[data-x]', m).onclick = close; $('#pv', m).focus();
    $('[data-go]', m).onclick = async () => { const v = +$('#pv', m).value; close(); await cb(v).catch(() => {}); reload(); };
  });
  const mount = (root) => {
    root.onclick = async (e) => {
      const b = e.target.closest('button'); if (!b || !(b.dataset.a || b.dataset.acc || b.dataset.rej || b.dataset.can)) return;
      if (!S.wallet) return needWallet();
      const w = S.wallet;
      if (b.dataset.a === 'mint') await runTx('Collecting', () => rpc('m_mint', { p_item: it.id, p_wallet: w }), 'It\'s yours!').then(reload, () => {});
      else if (b.dataset.a === 'buy') await runTx('Buying', () => rpc('m_buy', { p_item: it.id, p_wallet: w }), 'Bought!').then(reload, () => {});
      else if (b.dataset.a === 'list' || b.dataset.a === 'relist') priceModal('Set your price', 'List it', (v) => runTx('Listing', () => rpc('m_list', { p_item: it.id, p_wallet: w, p_usd: v }), 'Listed for sale'), it.listing);
      else if (b.dataset.a === 'unlist') await runTx('Updating', () => rpc('m_unlist', { p_item: it.id, p_wallet: w }), 'Taken off sale').then(reload, () => {});
      else if (b.dataset.a === 'offer') priceModal('Make an offer', 'Send offer', (v) => runTx('Sending offer', () => rpc('m_offer', { p_item: it.id, p_wallet: w, p_usd: v }), 'Offer sent — funds held until it ends'), top ? +top.usd : '');
      else if (b.dataset.acc) await runTx('Accepting', () => rpc('m_accept', { p_offer: b.dataset.acc, p_wallet: w }), 'Sold!').then(reload, () => {});
      else if (b.dataset.rej) await runTx('Declining', () => rpc('m_reject', { p_offer: b.dataset.rej, p_wallet: w }), 'Offer declined, bidder refunded').then(reload, () => {});
      else if (b.dataset.can) await runTx('Cancelling', () => rpc('m_cancel_offer', { p_offer: b.dataset.can, p_wallet: w }), 'Offer cancelled, funds back').then(reload, () => {});
    };
    // gentle tilt on the artwork
    const st = $('.stage', root), im = $('.main', root);
    if (st && matchMedia('(hover:hover)').matches) { st.onmousemove = (e) => { const r = st.getBoundingClientRect(); im.style.transform = `scale(1.03) translate(${((e.clientX - r.left) / r.width - .5) * -14}px,${((e.clientY - r.top) / r.height - .5) * -14}px)`; }; st.onmouseleave = () => { im.style.transform = ''; }; }
    return () => { root.onclick = null; };
  };
  return { html, mount };
}

/* ================= COLLECTIONS ================= */
export async function collections() {
  const c = S.collections;
  return `<div class="ph"><span class="eyebrow">Eras</span><h1 class="display">Pick your decade.</h1><p>Every GTA era is its own collection — floor prices, owners and a full gallery.</p></div>
  <div class="ccards">${c.map((x) => `<a class="ccard" href="#/collection/${esc(x.id)}"><div class="bgi" style="background-image:url('${esc(thumb(x.cover, 700))}')"></div><div><h3 class="display">${esc(x.short)}</h3><small>${x.items} pieces · ${x.minted} collected${x.floorUsd != null ? ' · from ' + usd(x.floorUsd) : ''}</small></div></a>`).join('')}</div>`;
}
export async function collection({ args: [id], q }) {
  id = decodeURIComponent(id);
  const c = S.collections.find((x) => x.id === id); if (!c) throw new Error('Collection not found');
  const r = await items({ era: id, sort: q.sort || 'liked', limit: 60 });
  return `<div class="cbanner"><div class="bgi" style="background-image:url('${esc(thumb(c.cover, 1200))}')"></div><span class="eyebrow">Collection</span><h1 class="display">${esc(c.short)}</h1><p class="muted" style="max-width:52ch">${esc(c.blurb || c.name)}</p>
    <div class="cstats">${[[c.items, 'Pieces'], [c.minted, 'Collected'], [c.owners, 'Owners'], [c.floorUsd != null ? usd(c.floorUsd) : '—', 'Floor']].map(([n, l]) => `<div class="glass"><b>${n}</b><small>${l}</small></div>`).join('')}</div></div>
  <div class="grid">${r.items.map(poster).join('')}</div>${r.total > 60 ? `<div class="pager"><a class="btn" href="#/explore?era=${esc(id)}">See all ${r.total} →</a></div>` : ''}`;
}
