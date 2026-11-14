// Launchpad pages. Drops hub (Minting now / Upcoming / Past) and a drop page with its mint stages, mint panel and reveal.
import { S, $, $$, esc, usd, short, imgTag, http, toast, walletModal } from './core.js';

const tick = '<svg class="vf" viewBox="0 0 24 24" aria-label="Verified"><path d="M12 2l2.4 1.9 3-.2 1.1 2.8 2.6 1.6-.6 3 1.2 2.7-2 2.3-.1 3-2.9.9L12 22l-2.7-1.9-2.9-.9-.1-3-2-2.3L5.5 11l-.6-3 2.6-1.6 1.1-2.8 3 .2z"/><path d="M8.2 12.3l2.6 2.6 5-5.2" fill="none"/></svg>';
const solOf = (u) => { const r = S.meta && S.meta.solUsd; return r && u != null ? u / r : null; };
export const solTxt = (n) => (n == null ? '' : n === 0 ? '0 SOL' : (n >= 10 ? n.toFixed(2) : n >= 0.1 ? n.toFixed(3) : n.toFixed(4)).replace(/\.?0+$/, '') + ' SOL');
export const priceTxt = (u) => (u ? usd(u) : 'Free');
const pad = (n) => String(n).padStart(2, '0');
export function cd(ms) {
  if (ms <= 0) return 'now';
  const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return d ? `${d}d ${pad(h)}h ${pad(m)}m` : `${pad(h)}:${pad(m)}:${pad(x)}`;
}
const when = (t) => new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
/** Every [data-cd="<ms timestamp>"] on the page counts down live; when one hits zero the page reloads its data once. */
export function liveCountdowns(root, onZero) {
  let fired = false;
  const run = () => { const t = Date.now(); $$('[data-cd]', root).forEach((el) => { const left = +el.dataset.cd - t; el.textContent = cd(left); if (left <= 0 && !fired && onZero) { fired = true; setTimeout(onZero, 800); } }); };
  run(); const iv = setInterval(() => { if (!root.isConnected) return clearInterval(iv); run(); }, 1000);
  return () => clearInterval(iv);
}
const stageOf = (d, id) => d.stages.find((s) => s.id === id);
const lead = (d) => stageOf(d, d.currentStage) || stageOf(d, d.nextStage) || d.stages[d.stages.length - 1];
const pct = (d) => (d.supply ? Math.min(100, Math.round((d.minted / d.supply) * 1000) / 10) : 0);
const STATE = { live: 'Minting now', upcoming: 'Upcoming', ended: 'Ended' };
function chip(d) {
  if (d.soldOut) return '<span class="dchip end">Sold out</span>';
  if (d.status === 'live') return `<span class="dchip live"><i></i>${esc(stageOf(d, d.currentStage).name)} live</span>`;
  if (d.status === 'upcoming') return '<span class="dchip soon">Upcoming</span>';
  return '<span class="dchip end">Ended</span>';
}
function timer(d) {
  const s = lead(d); if (!s) return '';
  if (d.status === 'live' && s.end) return `<span class="dtm">Ends in <b data-cd="${s.end}">${cd(s.end - Date.now())}</b></span>`;
  if (d.status === 'upcoming' && s.start) return `<span class="dtm">Starts in <b data-cd="${s.start}">${cd(s.start - Date.now())}</b></span>`;
  if (d.status === 'live') return '<span class="dtm">Open now</span>';
  return '<span class="dtm">Mint closed</span>';
}
const bar = (d) => `<div class="dprog"><div class="dpb"><i style="width:${pct(d)}%"></i></div><span><b>${d.minted.toLocaleString()}</b> / ${d.supply ? d.supply.toLocaleString() : '∞'} minted</span><span>${pct(d)}%</span></div>`;
const by = (d) => (d.kind === 'platform' ? 'GTA Marketplace' : short(d.creator));

export function card(d, i) {
  const s = lead(d);
  return `<a class="dcard" style="--i:${i}" href="#/drop/${encodeURIComponent(d.id)}">
    <span class="dc-ban">${imgTag(d.banner || d.logo, d.name, 700)}${chip(d)}</span>
    <div class="dc-in"><span class="dc-logo">${imgTag(d.logo, d.name, 140)}</span>
      <b class="dc-nm">${esc(d.name)}${d.verified ? tick : ''}</b><small class="dc-by">by ${esc(by(d))}</small>
      <div class="dc-row"><span><small>Price</small><b>${s ? priceTxt(s.priceUsd) : '—'}</b></span><span><small>Max supply</small><b>${d.supply ? d.supply.toLocaleString() : '—'}</b></span>${timer(d)}</div>
      ${bar(d)}</div></a>`;
}
function hero(d) {
  const s = lead(d);
  return `<a class="dhero" href="#/drop/${encodeURIComponent(d.id)}"><span class="dh-bg">${imgTag(d.banner || d.logo, d.name, 1400)}</span><i class="dh-shade"></i>
    <div class="dh-in">${chip(d)}<div class="dh-id"><span class="dc-logo lg">${imgTag(d.logo, d.name, 160)}</span><div><h2>${esc(d.name)}${d.verified ? tick : ''}</h2><small>by ${esc(by(d))}</small></div></div>
      <div class="dh-row"><span><small>${s ? esc(s.name) : 'Price'}</small><b>${s ? priceTxt(s.priceUsd) : '—'}</b>${s && s.priceUsd ? `<em>≈ ${solTxt(solOf(s.priceUsd))}</em>` : ''}</span>${timer(d)}</div>${bar(d)}
      <span class="btn primary lg dh-cta">${d.status === 'live' ? 'Mint now' : 'View drop'}</span></div></a>`;
}

/* ================= HUB ================= */
const TABS = [['live', 'Live'], ['upcoming', 'Upcoming'], ['ended', 'Past']];
export async function dropsHub({ q }) {
  const drops = (await http('GET', '/drops', null, { auth: false })).drops;
  const has = (k) => drops.some((d) => d.status === k);
  let tab = TABS.some(([k]) => k === q.tab) ? q.tab : has('live') ? 'live' : has('upcoming') ? 'upcoming' : 'live';
  const list = (k) => drops.filter((d) => d.status === k).sort((a, b) => (k === 'upcoming' ? (a.startsAt || 0) - (b.startsAt || 0) : k === 'live' ? pct(b) - pct(a) : (b.startsAt || 0) - (a.startsAt || 0)));
  const empty = { live: ['Nothing minting right now', 'Check the upcoming drops, or launch your own collection.'], upcoming: ['No upcoming drops yet', 'New collections show up here once they are verified.'], ended: ['No past drops yet', 'Finished mints will live here.'] };
  const body = () => { const l = list(tab); if (!l.length) return `<div class="empty"><b>${empty[tab][0]}</b>${empty[tab][1]}<br><a class="btn primary" style="margin-top:16px" href="#/create/collection">Launch a collection</a></div>`;
    return `${hero(l[0])}${l.length > 1 ? `<div class="dgrid">${l.slice(1).map(card).join('')}</div>` : ''}`; };
  const count = (k) => { const n = drops.filter((d) => d.status === k).length; return n ? `<em>${n}</em>` : ''; };
  const html = `<div class="ph2"><div><span class="eyebrow">Launchpad</span><h1 class="display">Drops</h1></div><a class="btn" href="#/create/collection">+ Launch yours</a></div>
    <div class="xbar" id="dbar"><div class="xseg x3" role="tablist"><i class="xth" aria-hidden="true"></i>${TABS.map(([k, l]) => `<button role="tab" data-tab="${k}" class="${k === tab ? 'on' : ''}">${l}${count(k)}</button>`).join('')}</div></div>
    <div id="dpane" class="xpane">${body()}</div>`;
  return {
    html,
    mount(root) {
      const seg = $('.xseg', root), th = $('.xth', root), pane = $('#dpane', root);
      const thumb = () => { const b = $('button.on', seg); if (b) { th.style.width = b.offsetWidth + 'px'; th.style.transform = `translateX(${b.offsetLeft}px)`; } };
      let stop = liveCountdowns(pane, () => { location.reload(); });
      seg.addEventListener('click', (e) => {
        const b = e.target.closest('[data-tab]'); if (!b) return;
        if (b.dataset.tab === tab) return scrollTo({ top: 0, behavior: 'smooth' });
        const dir = TABS.findIndex(([k]) => k === b.dataset.tab) - TABS.findIndex(([k]) => k === tab); tab = b.dataset.tab;
        $$('button', seg).forEach((x) => x.classList.toggle('on', x === b)); thumb(); history.replaceState(null, '', '#/drops?tab=' + tab);
        pane.style.setProperty('--dx', dir > 0 ? '34px' : '-34px'); pane.classList.remove('in'); pane.classList.add('out');
        setTimeout(() => { stop(); pane.innerHTML = body(); stop = liveCountdowns(pane); pane.classList.remove('out'); void pane.offsetWidth; pane.classList.add('in'); }, 150);
      });
      requestAnimationFrame(() => { thumb(); seg.classList.add('ready'); pane.classList.add('in'); });
      addEventListener('resize', thumb);
      return () => { stop(); removeEventListener('resize', thumb); };
    }
  };
}

/* ================= DROP PAGE ================= */
export async function dropPage({ args: [id] }) {
  id = decodeURIComponent(id);
  const d = (await http('GET', '/drops/' + encodeURIComponent(id))).drop;
  dispatchEvent(new CustomEvent('gta:dropbd', { detail: { id, url: d.banner || d.logo } }));
  const s = lead(d), live = d.status === 'live' ? s : null;
  const reveal = d.revealed ? 'Revealed' : d.revealMode === 'date' && d.revealAt ? 'Reveal ' + when(d.revealAt) : 'Reveal after mint';
  const stRow = (x, i) => {
    const t = x.state === 'live' ? (x.end ? `Ends in <b data-cd="${x.end}">${cd(x.end - Date.now())}</b>` : 'Live now') : x.state === 'upcoming' ? `Starts ${when(x.start)}` : 'Ended';
    const el = x.eligible === undefined ? (x.kind === 'allowlist' ? `<span class="elg">${x.allowlistSize} wallets</span>` : '<span class="elg ok">Everyone</span>') : x.eligible ? '<span class="elg ok">✓ You are eligible</span>' : '<span class="elg no">Not on this list</span>';
    return `<div class="stg st-${x.state}"><span class="stg-dot"><i></i></span><div class="stg-b"><div class="stg-h"><b>${esc(x.name)}</b><span class="stg-k">${x.kind === 'allowlist' ? 'Allowlist' : 'Public'}</span>${x.state === 'live' ? '<span class="dchip live sm"><i></i>Live</span>' : ''}</div>
      <small>${t}</small><div class="stg-m"><span>${priceTxt(x.priceUsd)}${x.priceUsd ? ` <em>≈ ${solTxt(solOf(x.priceUsd))}</em>` : ''}</span><span>${x.perWallet} per wallet</span>${el}</div></div></div>`;
  };
  const why = () => {
    if (d.soldOut) return ['Sold out', true];
    if (!live) return [d.status === 'upcoming' ? 'Not started yet' : 'Mint has ended', true];
    if (!S.wallet) return ['Connect wallet to mint', false];
    if (live.eligible === false) return ['You are not on the allowlist', true];
    return [null, false];
  };
  const [block, dis] = why();
  const html = `<div class="dp">
    <div class="cx-top"><button class="rbtn" id="dp-back" aria-label="Back"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button><button class="rbtn" id="dp-share" aria-label="Share"><svg viewBox="0 0 24 24"><path d="M12 3v12M7 8l5-5 5 5M5 14v6h14v-6"/></svg></button></div>
    <div class="dp-grid"><div class="dp-main">
      <div class="cx-id"><span class="cx-logo">${imgTag(d.logo, d.name, 200)}</span>${chip(d)}<h1>${esc(d.name)}${d.verified ? tick : ''}</h1><p>by ${esc(by(d))}${d.kind === 'platform' ? tick : ''}</p></div>
      <div class="chips2"><span>${d.supply ? 'Max supply ' + d.supply.toLocaleString() : 'Open edition'}</span>${d.artCount != null && d.supply && d.artCount < d.supply ? `<span>${d.artCount.toLocaleString()} ready to mint</span>` : ''}<span>${esc(reveal)}</span><span>${d.royaltyPct ?? 5}% royalty</span><span>Solana · ${esc(S.meta.network === 'devnet' ? 'Devnet' : 'Mainnet')}</span></div>
      <section class="dp-sec"><h3>Mint schedule</h3><div class="stgs">${d.stages.map(stRow).join('')}</div></section>
      <section class="dp-sec"><h3>${d.revealed ? 'The art' : 'Before the reveal'}</h3><div class="rvl glass"><span class="rvl-im ${d.revealed ? '' : 'hid'}">${imgTag(d.revealed ? d.banner || d.logo : d.preReveal || d.logo, d.name, 500)}${d.revealed ? '' : '<b>?</b>'}</span>
        <p>${d.revealed ? 'This collection is revealed. Every mint shows its real artwork straight away.' : d.revealMode === 'date' && d.revealAt ? `Mints show this cover until the reveal. Your real piece appears in <b data-cd="${d.revealAt}">${cd(d.revealAt - Date.now())}</b>.` : 'Mints show this cover until the creator reveals the collection. Then your real piece appears in your wallet and profile.'}</p></div></section>
      <section class="dp-sec"><h3>About</h3><p class="dp-about">${esc(d.description || '')}</p>${d.links && (d.links.x || d.links.site) ? `<div class="dp-links">${d.links.x ? `<a href="${esc(/^https?:/.test(d.links.x) ? d.links.x : 'https://x.com/' + d.links.x.replace(/^@/, ''))}" target="_blank" rel="noopener">X ↗</a>` : ''}${d.links.site ? `<a href="${esc(d.links.site)}" target="_blank" rel="noopener">Website ↗</a>` : ''}</div>` : ''}</section>
    </div>
    <aside class="dp-side"><div class="mintp glass" id="mintp">
      <div class="mp-h"><small>${live ? esc(live.name) + ' · live' : s ? esc(s.name) : 'Mint'}</small>${timer(d)}</div>
      <div class="mp-p"><b>${s ? priceTxt(s.priceUsd) : '—'}</b>${s && s.priceUsd ? `<em>≈ ${solTxt(solOf(s.priceUsd))}</em>` : ''}</div>
      ${bar(d)}
      <div class="mp-q"><span>Quantity <small>max ${s ? s.perWallet : 1} per wallet</small></span><div class="qty"><button data-q="-1" aria-label="Less">−</button><b id="qn">1</b><button data-q="1" aria-label="More">+</button></div></div>
      <div class="mp-t"><span>Total</span><b id="qt">${s ? priceTxt(s.priceUsd) : '—'}</b></div>
      <button class="btn primary lg mp-go" id="mint" ${dis ? 'disabled' : ''}>${block || 'Mint'}</button>
      <p class="fine">${d.revealed ? 'Your NFT lands in your wallet as soon as the mint confirms.' : 'You get an unrevealed NFT now; it turns into your real piece at the reveal.'}</p></div></aside></div>
    <div class="mbar" id="mbar"><div><small>${live ? esc(live.name) : 'Mint'}</small><b>${s ? priceTxt(s.priceUsd) : '—'}</b></div><button class="btn primary" id="mint2" ${dis ? 'disabled' : ''}>${block && block.length < 18 ? block : block ? 'Unavailable' : 'Mint'}</button></div></div>`;
  return {
    html,
    mount(root) {
      let q = 1; const max = s ? s.perWallet : 1, price = s ? s.priceUsd : 0;
      const upd = () => { $('#qn', root).textContent = q; $('#qt', root).textContent = price ? usd(price * q) + ' · ≈ ' + solTxt(solOf(price * q)) : 'Free'; };
      root.addEventListener('click', (e) => { const b = e.target.closest('[data-q]'); if (!b) return; q = Math.max(1, Math.min(max, q + +b.dataset.q)); upd(); });
      const go = () => {
        if (!S.wallet) return walletModal();
        toast(`Minting opens when the ${d.name} contract goes live. You are set for ${q} in ${live ? live.name : "the next stage"}.`);
      };
      $('#mint', root).onclick = go; $('#mint2', root).onclick = () => (S.wallet ? go() : walletModal());
      $('#dp-back', root).onclick = () => (history.length > 1 ? history.back() : (location.hash = '#/drops'));
      $('#dp-share', root).onclick = async () => { const url = location.href; try { if (navigator.share) await navigator.share({ title: d.name, url }); else { await navigator.clipboard.writeText(url); toast('Link copied'); } } catch (_) { /* cancelled */ } };
      // the mobile mint bar shows while the mint panel is off screen
      const mb = $('#mbar', root), io = new IntersectionObserver(([en]) => mb.classList.toggle('on', !en.isIntersecting), { threshold: 0.15 }); io.observe($('#mintp', root));
      const stop = liveCountdowns(root, () => location.reload());
      return () => { io.disconnect(); stop(); };
    }
  };
}
