import { S, D, $, $$, esc, usd, sol, short, ago, items, http, cClear, act, runTx, toast, walletModal, refreshMe, emit, imgTag, shrinkImage } from './core.js';
import { poster } from './views.js';

const gate = (t, d) => `<div class="gate glass"><h2 class="display">${t}</h2><p>${d}</p><button class="btn primary lg" id="gw">Connect wallet</button></div>`;
const wireGate = (root) => { const b = $('#gw', root); if (b) b.onclick = walletModal; };
const banner = (key, eyebrow, title, sub) => `<div class="ph"><span class="eyebrow">${eyebrow}</span><h1 class="display">${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div>`;

/* ================= CREATE / SUBMIT ================= */
export async function create() {
  const head = banner('create', 'Submit one artwork', 'Drop your <span class="grad">art.</span>', 'Send us your GTA-inspired artwork. Our team reviews every submission, sets a price, and publishes it to the marketplace.');
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
          const img = await shrinkImage(file);
          const price = $('#p', root).value;
          await http('POST', '/submissions', { title, description, era: $('#e', root).value, category: $('#c', root).value, tags: $('#g', root).value.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 8), suggestedPriceUsd: price === '' ? undefined : +price, files: [{ type: img.type, data: img.data }] });
        }, 'Submitted! We\'ll review it soon.');
        location.hash = '#/me/submissions';
      } catch (e) { /* shown in dialog */ }
    };
  };
  return { html, mount };
}

/* ================= PROFILE ================= */
const TABS = [['nfts', 'Items'], ['received', 'Offers in'], ['made', 'Offers out'], ['activity', 'Activity'], ['notifications', 'Inbox'], ['launches', 'Launches'], ['submissions', 'Submissions']];
const stc = (s) => (s === 'accepted' || s === 'approved' ? 'ok' : s === 'rejected' || s === 'cancelled' || s === 'expired' || s === 'failed' ? 'bad' : 'warn');
const none = (t, d) => `<div class="empty"><b>${t}</b>${d || ''}</div>`;
const get = async (p, k) => { try { return (await http('GET', p))[k] || []; } catch (e) { return []; } };
async function tabBody(tab) {
  const link = (id, inner) => `<a href="#/art/${encodeURIComponent(id)}">${inner}</a>`;
  const th = (src, t) => `<span class="t">${imgTag(src, t, 120)}</span>`;
  let body = '', recv = [];
  recv = tab === 'received' ? await get('/me/offers/received', 'offers') : [];
  if (tab === 'nfts') {
    const [r, pf] = await Promise.all([items({ owner: S.wallet, limit: 100, sort: 'recent' }), PF]);
    const by = new Map(r.items.map((i) => [String(i.id), i]));
    body = pf.groups.length ? `<label class="isearch pf-s"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/></svg><input id="pfq" placeholder="Search your items" autocomplete="off"></label>
      <div class="pfg">${pf.groups.map((g, gi) => { const its = g.items.map((id) => by.get(String(id))).filter(Boolean);
        return `<div class="pgr${gi === 0 ? ' open' : ''}" data-g="${esc(g.id)}"><button class="pgr-h" type="button"><span class="pgr-lg">${imgTag(g.cover || (its[0] && its[0].img), g.name, 120)}</span><span class="pgr-t"><b>${esc(g.name)}</b><small>${g.count} item${g.count > 1 ? 's' : ''}${g.floorUsd != null ? ' · floor ' + usd(g.floorUsd) : ''}</small></span><span class="pgr-v"><b>${g.valueUsd ? usd(g.valueUsd) : '—'}</b><small>${g.valueUsd && pf.solUsd ? '≈ ' + tinySol(g.valueUsd / pf.solUsd) : ''}</small></span><i class="pgr-ch"></i></button>
          <div class="pgr-b"><div class="grid">${its.map(poster).join('')}</div></div></div>`; }).join('')}</div>`
      : `<div class="pf-empty glass"><b>No items yet</b><span>Start with a free drop or browse what's minting now.</span><div class="cta"><a class="btn primary" href="#/drops">See drops</a><a class="btn" href="#/browse?status=free">Free pieces</a></div></div>`;
  }
  else if (tab === 'received') body = recv.length ? recv.map((o) => `<div class="rowc"><div class="l">${th(o.itemImage, o.itemTitle)}<div>${link(o.itemId, `<b>${esc(o.itemTitle)}</b>`)}<small>${usd(o.usd)} from ${short(o.bidder)} · ${ago(o.createdAt)}</small></div></div><div class="r"><span class="st ${stc(o.status)}">${esc(o.status)}</span>${o.status === 'active' ? `<a class="btn primary sm" href="#/art/${encodeURIComponent(o.itemId)}">Review</a>` : ''}</div></div>`).join('') : none('No offers yet');
  else if (tab === 'made') { const l = await get('/me/offers/made', 'offers'); body = l.length ? l.map((o) => `<div class="rowc"><div class="l">${th(o.itemImage, o.itemTitle)}<div>${link(o.itemId, `<b>${esc(o.itemTitle || o.itemId)}</b>`)}<small>${usd(o.usd)} · ≈ ${sol(o.sol)} · ${ago(o.createdAt)}</small></div></div><div class="r"><span class="st ${stc(o.status)}">${esc(o.status)}</span>${o.status === 'active' ? `<button class="btn sm" data-can="${o.id}">Cancel</button>` : ''}</div></div>`).join('') : none('You have not made offers'); }
  else if (tab === 'notifications') { const l = await get('/me/notifications', 'notifications'); body = l.length ? l.map((n) => `<div class="rowc"><div><b>${esc(n.title)}</b>${n.read ? '' : '<span class="dotn"></span>'}<small>${esc(n.body || '')} · ${ago(n.createdAt)}</small></div>${n.data && n.data.itemId ? `<a class="btn sm" href="#/art/${encodeURIComponent(n.data.itemId)}">Open</a>` : ''}</div>`).join('') : none('Inbox zero'); }
  else if (tab === 'activity') { const l = await get('/me/activity', 'activity'); body = l.length ? l.map((a) => `<div class="rowc"><div>${a.itemId ? link(a.itemId, `<b>${esc(a.itemTitle || a.type)}</b>`) : `<b>${esc(a.type)}</b>`}<small>${esc(a.type)}${a.role ? ' · ' + esc(a.role) : ''} · ${ago(a.createdAt)}</small></div><b>${a.usd != null ? usd(a.usd) : ''}</b></div>`).join('') : none('No activity yet'); }
  else if (tab === 'launches') { const l = await get('/me/launches', 'launches'); const lab = { review: 'In review', approved: 'Verified', live: 'Live', rejected: 'Not approved' };
    body = l.length ? l.map((x) => `<div class="rowc"><div class="l">${th(x.logo, x.name)}<div>${x.status === 'approved' || x.status === 'live' ? `<a href="#/drop/${encodeURIComponent(x.id)}"><b>${esc(x.name)}</b></a>` : `<b>${esc(x.name)}</b>`}<small>${esc(x.symbol || '')} · ${(x.supply || 0).toLocaleString()} items · ${x.stages.length} stage${x.stages.length > 1 ? 's' : ''} · ${ago(x.createdAt)}${x.reason ? ' · ' + esc(x.reason) : ''}</small></div></div><span class="st ${x.status === 'rejected' ? 'bad' : x.status === 'review' ? 'warn' : 'ok'}">${lab[x.status] || esc(x.status)}</span></div>`).join('') + '<div class="cta" style="margin-top:14px"><a class="btn" href="#/create/collection">Launch another</a></div>'
      : none('No collections yet', '<a class="btn primary" style="margin-top:14px" href="#/create/collection">Launch a collection</a>'); }
  else { const l = await get('/me/submissions', 'submissions'); body = l.length ? l.map((s) => `<div class="rowc"><div class="l">${th(s.media && s.media[0] && s.media[0].url, s.title)}<div><b>${esc(s.title)}</b><small>${esc(s.era || '')} · ${ago(s.createdAt)}${s.reason ? ' · ' + esc(s.reason) : ''}</small></div></div><span class="st ${stc(s.status)}">${esc(s.status)}</span></div>`).join('') : none('No submissions', '<a class="accent" href="#/create">Submit your first piece</a>'); }
  return { body, recv };
}
let PF = null; // portfolio for this visit, shared by the header and the Items tab
const tinySol = (n) => (n == null ? '' : (n >= 10 ? n.toFixed(2) : n >= 0.1 ? n.toFixed(3) : n.toFixed(4)).replace(/\.?0+$/, '') + ' SOL');
const hueOf = (a) => [...String(a || 'x')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
export const avatarHtml = (p, size = '') => (p && p.avatar ? `<span class="pav ${size}"><img src="${esc(p.avatar)}" alt=""></span>` : `<span class="pav gen ${size}" style="--h:${hueOf(S.wallet)}">${esc(((p && (p.name || p.username)) || S.wallet || '?')[0].toUpperCase())}</span>`);
function editSheet(p, done) {
  const m = document.createElement('div'); m.className = 'sheetw'; let pic = null, remove = false;
  m.innerHTML = `<div class="sheet2 glass" role="dialog" aria-label="Edit profile"><i class="grab"></i><div class="sh-h"><h2>Edit profile</h2><button class="xbtn" data-x aria-label="Close">✕</button></div>
    <div class="ep-av"><label class="ep-pic">${avatarHtml(p, 'xl')}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden><span class="ep-cam"><svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg></span></label>
      <div><b>Profile picture</b><small>Square works best. JPG, PNG, GIF or WebP.</small>${p.avatar ? '<button class="btn sm" data-rm type="button">Remove photo</button>' : ''}</div></div>
    <label class="field">Display name<input class="input" id="ep-n" maxlength="32" value="${esc(p.name || '')}" placeholder="What people see"></label>
    <label class="field">Username<div class="atp"><span>@</span><input class="input" id="ep-u" maxlength="20" value="${esc(p.username || '')}" placeholder="yourname" autocapitalize="off" spellcheck="false"></div><small class="hint" id="ep-uh">3–20 letters, numbers or _</small></label>
    <label class="field">Bio <span class="opt">optional</span><textarea class="input" id="ep-b" maxlength="160" rows="2" placeholder="A line about you">${esc(p.bio || '')}</textarea></label>
    <button class="btn primary lg" id="ep-save">Save</button><button class="btn ghost danger-t" id="ep-out" type="button">Sign out</button></div>`;
  document.body.appendChild(m); requestAnimationFrame(() => m.classList.add('on'));
  const close = () => { m.classList.remove('on'); setTimeout(() => m.remove(), 280); };
  m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-x]')) close(); if (e.target.closest('[data-rm]')) { remove = true; pic = null; $('.ep-pic .pav', m).outerHTML = avatarHtml({ ...p, avatar: null }, 'xl'); e.target.remove(); } });
  $('.ep-pic input', m).onchange = async (e) => { const f = e.target.files[0]; if (!f) return; try { pic = await shrinkImage(f, 400, 0.88); remove = false; $('.ep-pic .pav', m).outerHTML = `<span class="pav xl"><img src="data:${pic.type};base64,${pic.data}" alt=""></span>`; } catch (x) { toast(x.message, 'bad'); } };
  const u = $('#ep-u', m), uh = $('#ep-uh', m);
  u.oninput = () => { u.value = u.value.toLowerCase().replace(/[^a-z0-9_]/g, ''); const ok = !u.value || /^[a-z0-9_]{3,20}$/.test(u.value); uh.textContent = ok ? (u.value ? 'gta-marketplace.xyz/@' + u.value : '3–20 letters, numbers or _') : 'At least 3 characters'; uh.classList.toggle('bad', !ok); };
  $('#ep-out', m).onclick = () => { close(); window.dispatchEvent(new Event('gta:signout')); };
  $('#ep-save', m).onclick = async (e) => {
    const b = e.currentTarget; b.disabled = true; b.textContent = 'Saving…';
    try { const r = await http('PATCH', '/me', { name: $('#ep-n', m).value.trim(), username: u.value.trim(), bio: $('#ep-b', m).value.trim(), ...(pic ? { avatar: pic } : {}), ...(remove ? { removeAvatar: true } : {}) });
      S.profile = r.profile; S.username = r.profile.username; S.avatar = r.profile.avatar; emit('profile', r.profile); toast('Profile saved'); close(); done(r.profile); }
    catch (x) { toast(x.message, 'bad'); b.disabled = false; b.textContent = 'Save'; }
  };
}
export async function profile({ args: [tab] }) {
  tab = TABS.some(([k]) => k === tab) ? tab : 'nfts';
  if (!S.wallet) return { html: banner('', 'Portfolio', 'Your <span class="grad">stash.</span>') + gate('Connect your wallet', 'See your balance, what you own, your offers and notifications.'), mount: wireGate };
  PF = http('GET', '/me/portfolio');
  const [me, pf] = await Promise.all([refreshMe(), PF]); const p = pf.profile || {};
  const first = await tabBody(tab), recv = first.recv, body = first.body;
  const badge = { notifications: me.unread, received: recv.filter((o) => o.status === 'active').length };
  const wPct = pf.totalUsd ? Math.round(((pf.walletUsd || 0) / pf.totalUsd) * 100) : 100;
  const totalSol = pf.solUsd ? pf.totalUsd / pf.solUsd : pf.sol;
  const html = `<div class="pf">
    <div class="pf-id"><button class="pf-avb" id="pf-edit" aria-label="Edit profile">${avatarHtml(p, 'lg')}<i class="pf-pen"><svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg></i></button>
      <div class="pf-nm"><h1>${esc(p.name || (p.username ? '@' + p.username : short(S.wallet)))}</h1><div class="pf-sub">${p.username ? `<span>@${esc(p.username)}</span>` : '<button class="lnk" id="pf-setu">Set a username</button>'}<button class="pf-addr" id="cp" title="Copy address"><code>${short(S.wallet)}</code><svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/></svg></button></div>${p.bio ? `<p class="pf-bio">${esc(p.bio)}</p>` : ''}</div>
      <button class="rbtn" id="pf-edit2" aria-label="Edit profile"><svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg></button></div>
    <div class="pf-bal glass"><small>Portfolio value · ${esc(S.meta.network === 'devnet' ? 'Devnet' : 'Mainnet')}</small>
      <div class="pf-tot"><b data-count="${pf.totalUsd}" data-prefix="$">${usd(pf.totalUsd) === 'FREE' ? '$0' : usd(pf.totalUsd)}</b><em>${totalSol != null ? '≈ ' + tinySol(totalSol) : ''}</em></div>
      <div class="pf-alloc"><i style="width:${wPct}%"></i><i style="width:${100 - wPct}%"></i></div>
      <div class="pf-leg"><span><i class="w"></i>Wallet <b>${pf.walletUsd != null ? usd(pf.walletUsd) === 'FREE' ? '$0' : usd(pf.walletUsd) : '—'}</b><em>${pf.sol != null ? tinySol(pf.sol) : 'unavailable'}</em></span><span><i class="n"></i>NFTs <b>${pf.nftUsd ? usd(pf.nftUsd) : '$0'}</b><em>${pf.nftCount} item${pf.nftCount === 1 ? '' : 's'}</em></span></div></div>
    <div class="pf-acts"><button class="pfa" id="pf-recv"><i><svg viewBox="0 0 24 24"><path d="M12 4v12M6 10l6 6 6-6M5 20h14"/></svg></i>Receive</button><a class="pfa" href="#/drops"><i><svg viewBox="0 0 24 24"><path d="M12 3c3 2 5 5.5 5 9.5L15 16H9l-2-3.5C7 8.5 9 5 12 3z"/><circle cx="12" cy="10" r="1.6"/><path d="M9 16l-2 4 3-1.5M15 16l2 4-3-1.5"/></svg></i>Mint</a><a class="pfa" href="#/explore"><i><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/></svg></i>Explore</a><a class="pfa" href="#/create"><i><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></i>Create</a></div>
    <div class="tabs pf-tabs" role="tablist"><i class="ind" aria-hidden="true"></i>${TABS.map(([k, l]) => `<a href="#/me/${k}" data-k="${k}" role="tab" class="${k === tab ? 'on' : ''}" aria-selected="${k === tab}">${l}${badge[k] ? `<span class="n">${badge[k]}</span>` : ''}</a>`).join('')}</div><div id="pane">${body}</div></div>`;
  const mount = (root) => {
    const edit = () => editSheet(p, () => window.dispatchEvent(new HashChangeEvent('hashchange')));
    ['#pf-edit', '#pf-edit2', '#pf-setu'].forEach((sel) => { const b = $(sel, root); if (b) b.onclick = edit; });
    const copy = (msg) => { try { navigator.clipboard.writeText(S.wallet); toast(msg); } catch (_) { toast(S.wallet); } };
    $('#cp', root).onclick = () => copy('Address copied');
    $('#pf-recv', root).onclick = () => copy('Address copied. Send SOL or NFTs to it on ' + (S.meta.network === 'devnet' ? 'devnet' : 'mainnet') + '.');
    const bar = $('.tabs', root), pane = $('#pane', root), cache = { [tab]: Promise.resolve(first) };
    const slide = (a, center) => { const i = $('.ind', bar); i.style.width = a.offsetWidth + 'px'; i.style.transform = `translateX(${a.offsetLeft}px)`; if (center) bar.scrollTo({ left: a.offsetLeft - (bar.clientWidth - a.offsetWidth) / 2, behavior: 'smooth' }); };
    const markRead = (k) => { if (k === 'notifications' && S.unread) http('POST', '/me/notifications/read', {}).then(() => { S.unread = 0; emit('unread', 0); const n = $('a[data-k="notifications"] .n', bar); if (n) n.remove(); const on = $('a.on', bar); if (on) slide(on); }).catch(() => {}); };
    const load = (k) => (cache[k] = cache[k] || tabBody(k).catch((e) => { delete cache[k]; return { body: none('Could not load', esc(e.message)) }; }));
    bar.addEventListener('click', async (e) => {
      const a = e.target.closest('a[data-k]'); if (!a) return; e.preventDefault();
      const k = a.dataset.k; if (a.classList.contains('on')) return scrollTo({ top: 0, behavior: 'smooth' });
      $$('a[data-k]', bar).forEach((x) => { x.classList.toggle('on', x === a); x.setAttribute('aria-selected', x === a); });
      slide(a, true); history.replaceState(null, '', '#/me/' + k);
      pane.classList.add('out'); const [r] = await Promise.all([load(k), new Promise((res) => setTimeout(res, 160))]);
      if (!a.classList.contains('on')) return; pane.innerHTML = r.body; pane.classList.remove('out'); pane.classList.add('in'); requestAnimationFrame(() => requestAnimationFrame(() => pane.classList.remove('in'))); markRead(k);
    });
    requestAnimationFrame(() => { const a = $('a.on', bar); if (a) { bar.classList.add('ready'); slide(a); bar.scrollLeft = a.offsetLeft - (bar.clientWidth - a.offsetWidth) / 2; } });
    setTimeout(() => TABS.forEach(([k]) => load(k)), 600);
    pane.addEventListener('input', (e) => { if (e.target.id !== 'pfq') return; const q = e.target.value.trim().toLowerCase();
      $$('.pgr', pane).forEach((g) => { let any = false; $$('.card', g).forEach((c) => { const hit = !q || c.textContent.toLowerCase().includes(q) || $('.pgr-t b', g).textContent.toLowerCase().includes(q); c.hidden = !hit; any = any || hit; }); g.hidden = !any; if (q && any) g.classList.add('open'); }); });
    root.onclick = async (e) => {
      const h = e.target.closest('.pgr-h'); if (h) { h.parentElement.classList.toggle('open'); return; }
      const b = e.target.closest('[data-can]'); if (!b) return; await runTx('Cancelling', (ui) => act('DELETE', `/offers/${b.dataset.can}`, undefined, ui), 'Offer cancelled, SOL refunded').then(() => { cClear(); window.dispatchEvent(new HashChangeEvent('hashchange')); }, () => {});
    };
    if (tab === 'notifications') markRead(tab);
    return () => { root.onclick = null; };
  };
  return { html, mount };
}
