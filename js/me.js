import { S, D, $, esc, usd, sol, short, ago, items, http, cClear, act, runTx, toast, walletModal, refreshMe, emit, imgTag, shrinkImage } from './core.js';
import { poster } from './views.js';

const gate = (t, d) => `<div class="gate glass"><h2 class="display">${t}</h2><p>${d}</p><button class="btn primary lg" id="gw">Connect wallet</button></div>`;
const wireGate = (root) => { const b = $('#gw', root); if (b) b.onclick = walletModal; };
const banner = (key, eyebrow, title, sub) => `<div class="ph"><span class="eyebrow">${eyebrow}</span><h1 class="display">${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div>`;

/* ================= CREATE / SUBMIT ================= */
export async function create() {
  const head = banner('create', 'Submit', 'Drop your <span class="grad">art.</span>', 'Send us your GTA-inspired artwork. Our team reviews every submission, sets a price, and publishes it to the marketplace.');
  if (!S.wallet) return { html: head + gate('Connect to submit', 'Sign in with a wallet so your artwork is credited to you.'), mount: wireGate };
  const eras = Object.entries(D.eras || {});
  const html = `${head}<div class="two"><label class="drop" id="drop"><input type="file" id="file" accept="image/png,image/jpeg,image/webp,image/gif"><div id="dropin"><b>Drop an image</b><span class="muted">PNG, JPG, WEBP or GIF</span></div></label>
  <div class="form glass"><label class="field">Title<input class="input" id="t" maxlength="60" placeholder="e.g. Neon Dusk, Ocean Drive"></label>
  <label class="field">Description<textarea class="input" id="d" maxlength="600" placeholder="Tell the story behind it"></textarea></label>
  <div class="fgrid"><label class="field">Era<select class="input" id="e">${eras.map(([k, v]) => `<option value="${esc(k)}">${esc(v)}</option>`).join('')}</select></label>
  <label class="field">Type<select class="input" id="c">${['Characters', 'Vehicles', 'Locations', 'Weapons', 'Artwork', 'Miscellaneous'].map((x) => `<option>${x}</option>`).join('')}</select></label></div>
  <div class="fgrid"><label class="field">Tags (comma separated)<input class="input" id="g" placeholder="neon, night, vice"></label><label class="field">Your price idea (USD)<input class="input" id="p" type="number" min="0" step="0.01" placeholder="optional"></label></div>
  <button class="btn primary lg" id="go">Submit for review</button><p class="fine">By submitting you confirm the artwork is yours to share.</p></div></div>`;
  const mount = (root) => {
    let file = null; const drop = $('#drop', root);
    const pick = (f) => { if (!f) return; if (!/^image\//.test(f.type)) return toast('Please choose an image', 'bad'); file = f; const r = new FileReader(); r.onload = () => { $('#dropin', root).innerHTML = ''; let im = $('.pv', drop); if (!im) { im = document.createElement('img'); im.className = 'pv'; drop.appendChild(im); } im.src = r.result; }; r.readAsDataURL(f); };
    $('#file', root).onchange = (e) => pick(e.target.files[0]);
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); if (ev === 'drop') pick(e.dataTransfer.files[0]); }));
    $('#go', root).onclick = async () => {
      if (!file) return toast('Add an image first', 'bad');
      const title = $('#t', root).value.trim(), description = $('#d', root).value.trim();
      if (title.length < 2) return toast('Add a title', 'bad'); if (description.length < 10) return toast('Description needs at least 10 characters', 'bad');
      try {
        await runTx('Submitting', async () => {
          const dataUrl = await shrinkImage(file);
          const price = $('#p', root).value;
          await http('POST', '/submissions', { title, description, era: $('#e', root).value, category: $('#c', root).value, tags: $('#g', root).value.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 8), suggestedPriceUsd: price === '' ? undefined : +price, files: [{ type: 'image', data: dataUrl.split(',')[1] }] });
        }, 'Submitted! We\'ll review it soon.');
        location.hash = '#/me/submissions';
      } catch (e) { /* shown in dialog */ }
    };
  };
  return { html, mount };
}

/* ================= PROFILE ================= */
const TABS = [['nfts', 'My NFTs'], ['received', 'Offers in'], ['made', 'Offers out'], ['notifications', 'Inbox'], ['activity', 'Activity'], ['submissions', 'Submissions']];
const stc = (s) => (s === 'accepted' || s === 'approved' ? 'ok' : s === 'rejected' || s === 'cancelled' || s === 'expired' || s === 'failed' ? 'bad' : 'warn');
const none = (t, d) => `<div class="empty"><b>${t}</b>${d || ''}</div>`;
const get = async (p, k) => { try { return (await http('GET', p))[k] || []; } catch (e) { return []; } };
export async function profile({ args: [tab] }) {
  tab = TABS.some(([k]) => k === tab) ? tab : 'nfts';
  const head = banner('', 'Profile', 'Your <span class="grad">stash.</span>');
  if (!S.wallet) return { html: head + gate('Connect your wallet', 'See what you own, your offers and notifications.'), mount: wireGate };
  const me = await refreshMe();
  const link = (id, inner) => `<a href="#/art/${encodeURIComponent(id)}">${inner}</a>`;
  const th = (src, t) => `<span class="t">${imgTag(src, t, 120)}</span>`;
  let body = '', recv = [];
  recv = tab === 'received' ? await get('/me/offers/received', 'offers') : [];
  if (tab === 'nfts') { const r = await items({ owner: S.wallet, limit: 100, sort: 'recent' }); body = r.items.length ? `<div class="grid">${r.items.map(poster).join('')}</div>` : none('Nothing here yet', 'Collect something from <a class="accent" href="#/explore?status=free">the free drops</a>.'); }
  else if (tab === 'received') body = recv.length ? recv.map((o) => `<div class="rowc"><div class="l">${th(o.itemImage, o.itemTitle)}<div>${link(o.itemId, `<b>${esc(o.itemTitle)}</b>`)}<small>${usd(o.usd)} from ${short(o.bidder)} · ${ago(o.createdAt)}</small></div></div><div class="r"><span class="st ${stc(o.status)}">${esc(o.status)}</span>${o.status === 'active' ? `<a class="btn primary sm" href="#/art/${encodeURIComponent(o.itemId)}">Review</a>` : ''}</div></div>`).join('') : none('No offers yet');
  else if (tab === 'made') { const l = await get('/me/offers/made', 'offers'); body = l.length ? l.map((o) => `<div class="rowc"><div class="l">${th(o.itemImage, o.itemTitle)}<div>${link(o.itemId, `<b>${esc(o.itemTitle || o.itemId)}</b>`)}<small>${usd(o.usd)} · ≈ ${sol(o.sol)} · ${ago(o.createdAt)}</small></div></div><div class="r"><span class="st ${stc(o.status)}">${esc(o.status)}</span>${o.status === 'active' ? `<button class="btn sm" data-can="${o.id}">Cancel</button>` : ''}</div></div>`).join('') : none('You have not made offers'); }
  else if (tab === 'notifications') { const l = await get('/me/notifications', 'notifications'); body = l.length ? l.map((n) => `<div class="rowc"><div><b>${esc(n.title)}</b>${n.read ? '' : '<span class="dotn"></span>'}<small>${esc(n.body || '')} · ${ago(n.createdAt)}</small></div>${n.data && n.data.itemId ? `<a class="btn sm" href="#/art/${encodeURIComponent(n.data.itemId)}">Open</a>` : ''}</div>`).join('') : none('Inbox zero'); }
  else if (tab === 'activity') { const l = await get('/me/activity', 'activity'); body = l.length ? l.map((a) => `<div class="rowc"><div>${a.itemId ? link(a.itemId, `<b>${esc(a.itemTitle || a.type)}</b>`) : `<b>${esc(a.type)}</b>`}<small>${esc(a.type)}${a.role ? ' · ' + esc(a.role) : ''} · ${ago(a.createdAt)}</small></div><b>${a.usd != null ? usd(a.usd) : ''}</b></div>`).join('') : none('No activity yet'); }
  else { const l = await get('/me/submissions', 'submissions'); body = l.length ? l.map((s) => `<div class="rowc"><div class="l">${th(s.media && s.media[0] && s.media[0].url, s.title)}<div><b>${esc(s.title)}</b><small>${esc(s.era || '')} · ${ago(s.createdAt)}${s.reason ? ' · ' + esc(s.reason) : ''}</small></div></div><span class="st ${stc(s.status)}">${esc(s.status)}</span></div>`).join('') : none('No submissions', '<a class="accent" href="#/create">Submit your first piece</a>'); }
  const badge = { notifications: me.unread, received: recv.filter((o) => o.status === 'active').length };
  const html = `${head}
  <div class="who glass"><div class="av">${esc(S.wallet.slice(0, 2).toUpperCase())}</div><div style="min-width:0"><div class="muted" style="font-weight:800;letter-spacing:.14em;font-size:11px;text-transform:uppercase">Wallet · ${esc(S.meta.network)}</div><div class="addr"><code>${esc(S.wallet.slice(0, 5) + '…' + S.wallet.slice(-5))}</code><button class="cp" id="cp" aria-label="Copy address" title="Copy address"><svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg></button></div></div><button class="btn sm" id="out">Disconnect</button></div>
  <div class="tabs" role="tablist">${TABS.map(([k, l]) => `<a href="#/me/${k}" role="tab" class="${k === tab ? 'on' : ''}" aria-selected="${k === tab}">${l}${badge[k] ? `<span class="n">${badge[k]}</span>` : ''}</a>`).join('')}</div><div id="pane">${body}</div>`;
  const mount = (root) => {
    $('#out', root).onclick = () => window.dispatchEvent(new Event('gta:signout'));
    $('#cp', root).onclick = (e) => { navigator.clipboard && navigator.clipboard.writeText(S.wallet); const b = e.currentTarget; b.classList.add('ok'); setTimeout(() => b.classList.remove('ok'), 1200); };
    const on = $('.tabs a.on', root), bar = $('.tabs', root); if (on && bar) bar.scrollLeft = on.offsetLeft - (bar.clientWidth - on.offsetWidth) / 2; // keep the open tab in view, without moving the page
    root.onclick = async (e) => { const b = e.target.closest('[data-can]'); if (!b) return; await runTx('Cancelling', (ui) => act('DELETE', `/offers/${b.dataset.can}`, undefined, ui), 'Offer cancelled, SOL refunded').then(() => { cClear(); window.dispatchEvent(new HashChangeEvent('hashchange')); }, () => {}); };
    if (tab === 'notifications' && me.unread) http('POST', '/me/notifications/read', {}).then(() => { S.unread = 0; emit('unread', 0); }).catch(() => {});
    return () => { root.onclick = null; };
  };
  return { html, mount };
}
