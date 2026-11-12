import { S, D, $, $$, esc, usd, money, short, ago, thumb, items, rpc, upload, runTx, toast, walletModal, refreshMe, emit } from './core.js';
import { poster } from './views.js';

const gate = (t, d) => `<div class="gate glass"><h2 class="display">${t}</h2><p>${d}</p><button class="btn primary lg" id="gw">Connect wallet</button></div>`;
const wireGate = (root) => { const b = $('#gw', root); if (b) b.onclick = walletModal; };

/* ================= CREATE / SUBMIT ================= */
export async function create() {
  if (!S.wallet) return { html: `<div class="ph"><span class="eyebrow">Submit</span><h1 class="display">Drop your <span class="grad">art.</span></h1></div>${gate('Connect to submit', 'Sign in with a wallet so your artwork is credited to you.')}`, mount: wireGate };
  const eras = Object.entries(D.eras || {});
  const html = `<div class="ph"><span class="eyebrow">Submit</span><h1 class="display">Drop your <span class="grad">art.</span></h1><p>Send us your GTA-inspired artwork. Our team reviews every submission, sets a price, and publishes it to the marketplace.</p></div>
  <div class="two"><label class="drop" id="drop"><input type="file" id="file" accept="image/png,image/jpeg,image/webp,image/gif"><div id="dropin"><b>Drop an image</b><span class="muted">PNG, JPG, WEBP or GIF · up to 5 MB</span></div></label>
  <div class="form glass"><label class="field">Title<input id="t" maxlength="60" placeholder="e.g. Neon Dusk, Ocean Drive"></label>
  <label class="field">Description<textarea id="d" maxlength="600" placeholder="Tell the story behind it (at least 10 characters)"></textarea></label>
  <div class="fgrid"><label class="field">Era<select id="e">${eras.map(([k, v]) => `<option value="${esc(k)}">${esc(v)}</option>`).join('')}</select></label>
  <label class="field">Type<select id="c">${['Characters', 'Locations', 'Vehicles', 'Weapons'].map((x) => `<option>${x}</option>`).join('')}</select></label></div>
  <div class="fgrid"><label class="field">Tags (comma separated)<input id="g" placeholder="neon, night, vice"></label><label class="field">Your price idea (USD)<input id="p" type="number" min="0" step="0.01" placeholder="optional"></label></div>
  <button class="btn primary lg" id="go">Submit for review</button><p class="fine">By submitting you confirm the artwork is yours to share.</p></div></div>`;
  const mount = (root) => {
    let file = null; const drop = $('#drop', root);
    const pick = (f) => { if (!f) return; if (!/^image\//.test(f.type)) return toast('Please choose an image', 'bad'); if (f.size > 5 * 1024 * 1024) return toast('That image is over 5 MB', 'bad'); file = f; const r = new FileReader(); r.onload = () => { $('#dropin', root).innerHTML = ''; let im = $('.pv', drop); if (!im) { im = document.createElement('img'); im.className = 'pv'; drop.appendChild(im); } im.src = r.result; }; r.readAsDataURL(f); };
    $('#file', root).onchange = (e) => pick(e.target.files[0]);
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); if (ev === 'drop') pick(e.dataTransfer.files[0]); }));
    $('#go', root).onclick = async () => {
      if (!file) return toast('Add an image first', 'bad');
      const title = $('#t', root).value.trim(), desc = $('#d', root).value.trim();
      if (title.length < 2) return toast('Add a title', 'bad'); if (desc.length < 10) return toast('Description needs at least 10 characters', 'bad');
      try {
        await runTx('Submitting', async () => {
          const url = await upload(file);
          await rpc('m_submit', { p_wallet: S.wallet, p_title: title, p_desc: desc, p_era: $('#e', root).value, p_cat: $('#c', root).value, p_tags: $('#g', root).value.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 8), p_image: url, p_price: $('#p', root).value === '' ? null : +$('#p', root).value });
        }, 'Submitted! We\'ll review it soon.');
        location.hash = '#/me/submissions';
      } catch (e) { /* shown in dialog */ }
    };
  };
  return { html, mount };
}

/* ================= PROFILE ================= */
const TABS = [['nfts', 'My NFTs'], ['received', 'Offers in'], ['made', 'Offers out'], ['notifications', 'Inbox'], ['activity', 'Activity'], ['submissions', 'Submissions']];
const stc = (s) => (s === 'accepted' || s === 'approved' ? 'ok' : s === 'rejected' || s === 'cancelled' ? 'bad' : 'warn');
const none = (t, d) => `<div class="empty"><b>${t}</b>${d || ''}</div>`;
export async function profile({ args: [tab] }) {
  tab = TABS.some(([k]) => k === tab) ? tab : 'nfts';
  if (!S.wallet) return { html: `<div class="ph"><span class="eyebrow">Profile</span><h1 class="display">Your <span class="grad">stash.</span></h1></div>${gate('Connect your wallet', 'See what you own, your offers and notifications.')}`, mount: wireGate };
  const me = await refreshMe();
  const link = (it, inner) => `<a href="#/art/${esc(it)}">${inner}</a>`;
  let body = '';
  if (tab === 'nfts') { const r = await items({ owner: S.wallet, limit: 100, sort: 'recent' }); body = r.items.length ? `<div class="grid">${r.items.map(poster).join('')}</div>` : none('Nothing here yet', 'Collect something from <a class="lime" href="#/explore?status=free">the free drops</a>.'); }
  else if (tab === 'received') body = me.received.length ? me.received.map((o) => `<div class="rowc"><div class="l"><img class="t" src="${esc(thumb(o.image, 120))}" alt=""><div>${link(o.itemId, `<b>${esc(o.title)}</b>`)}<small>${usd(+o.usd)} from ${short(o.bidder)} · ${ago(o.at)}</small></div></div><div class="r"><span class="st ${stc(o.status)}">${esc(o.status)}</span>${o.status === 'active' ? `<a class="btn primary sm" href="#/art/${esc(o.itemId)}">Review</a>` : ''}</div></div>`).join('') : none('No offers yet');
  else if (tab === 'made') body = me.made.length ? me.made.map((o) => `<div class="rowc"><div class="l"><img class="t" src="${esc(thumb(o.image, 120))}" alt=""><div>${link(o.itemId, `<b>${esc(o.title)}</b>`)}<small>${usd(+o.usd)} · ${ago(o.at)}</small></div></div><div class="r"><span class="st ${stc(o.status)}">${esc(o.status)}</span>${o.status === 'active' ? `<button class="btn sm" data-can="${o.id}">Cancel</button>` : ''}</div></div>`).join('') : none('You have not made offers');
  else if (tab === 'notifications') body = me.notifs.length ? me.notifs.map((n) => `<div class="rowc"><div><b>${esc(n.title)}</b>${n.read ? '' : '<span class="dotn"></span>'}<small>${esc(n.body || '')} · ${ago(n.created_at)}</small></div>${n.item_id ? `<a class="btn sm" href="#/art/${esc(n.item_id)}">Open</a>` : ''}</div>`).join('') : none('Inbox zero');
  else if (tab === 'activity') body = me.activity.length ? me.activity.map((a) => `<div class="rowc"><div>${link(a.itemId, `<b>${a.type === 'mint' ? 'Collected' : a.role === 'buyer' ? 'Bought' : 'Sold'} ${esc(a.title)}</b>`)}<small>${ago(a.at)}</small></div><b>${usd(+a.usd)}</b></div>`).join('') : none('No activity yet');
  else body = me.submissions.length ? me.submissions.map((s) => `<div class="rowc"><div class="l"><img class="t" src="${esc(thumb(s.image, 120))}" alt=""><div><b>${esc(s.title)}</b><small>${esc(s.era || '')} · ${ago(s.created_at)}${s.reason ? ' · ' + esc(s.reason) : ''}</small></div></div><span class="st ${stc(s.status)}">${esc(s.status)}</span></div>`).join('') : none('No submissions', '<a class="lime" href="#/create">Submit your first piece</a>');
  const badge = { notifications: me.unread, received: me.received.filter((o) => o.status === 'active').length };
  const html = `<div class="ph"><span class="eyebrow">Profile</span><h1 class="display">Your <span class="grad">stash.</span></h1></div>
  <div class="who"><div class="av">${esc(S.wallet.slice(0, 2).toUpperCase())}</div><div><div class="muted" style="font-weight:800;letter-spacing:.14em;font-size:11px;text-transform:uppercase">Wallet</div><code>${esc(S.wallet)}</code></div>
    <div class="glass" style="padding:12px 20px"><div class="muted" style="font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase">Play money</div><b class="display lime" style="font-size:34px">${money(me.balance)}</b></div><button class="btn sm" id="out">Disconnect</button></div>
  <div class="tabs">${TABS.map(([k, l]) => `<a href="#/me/${k}"><button class="${k === tab ? 'on' : ''}" tabindex="-1">${l}${badge[k] ? `<span class="n">${badge[k]}</span>` : ''}</button></a>`).join('')}</div><div id="pane">${body}</div>`;
  const mount = (root) => {
    $('#out', root).onclick = () => window.dispatchEvent(new Event('gta:signout'));
    root.onclick = async (e) => { const b = e.target.closest('[data-can]'); if (!b) return; await runTx('Cancelling', () => rpc('m_cancel_offer', { p_offer: b.dataset.can, p_wallet: S.wallet }), 'Offer cancelled, funds back').then(() => window.dispatchEvent(new HashChangeEvent('hashchange')), () => {}); };
    if (tab === 'notifications' && me.unread) rpc('m_notifs_read', { p_wallet: S.wallet }).then(() => { S.unread = 0; emit('unread', 0); }).catch(() => {});
    return () => { root.onclick = null; };
  };
  return { html, mount };
}
