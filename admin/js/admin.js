/* GTA Market admin — one small SPA (hash routes, no build). Talks to the backend /admin/* routes with a password-login token. */
const CFG = window.GTA_CONFIG || {}, API = (CFG.API_URL || '').replace(/\/$/, ''), D = window.GTA_DATA || { eras: {}, eraShort: {} };
const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => [...(r || document).querySelectorAll(s)];
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const usd = (n) => (n == null ? '—' : n === 0 ? 'FREE' : '$' + (+n).toLocaleString(undefined, { maximumFractionDigits: 2 }));
const sol = (l) => (l == null ? '—' : (l / 1e9).toLocaleString(undefined, { maximumFractionDigits: 4 }) + ' SOL');
const ago = (t) => { if (!t) return ''; const s = Math.max(1, (Date.now() - new Date(t).getTime()) / 1000 | 0); return s < 60 ? s + 's ago' : s < 3600 ? (s / 60 | 0) + 'm ago' : s < 86400 ? (s / 3600 | 0) + 'h ago' : (s / 86400 | 0) + 'd ago'; };
const short = (a) => (a ? a.slice(0, 4) + '…' + a.slice(-4) : '');
const ERAS = Object.entries(D.eras || {}), CATS = ['Characters', 'Vehicles', 'Locations', 'Weapons', 'Artwork', 'Miscellaneous'], RARS = ['Common', 'Rare', 'Epic', 'Legendary'];
const eraName = (id) => (D.eraShort || {})[id] || id;
const opts = (list, cur) => list.map((x) => { const [v, t] = Array.isArray(x) ? x : [x, x]; return `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(t)}</option>`; }).join('');
const ls = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { /* ignore */ } } };
let TOKEN = ls.get('gta_admin'), META = null;

function toast(m, bad) { const t = document.createElement('div'); t.className = 'toast' + (bad ? ' bad' : ''); t.textContent = m; $('#toasts').appendChild(t); setTimeout(() => t.remove(), 3800); }
async function api(method, path, body) {
  let r; try { r = await fetch(API + path, { method, cache: 'no-store', headers: { 'content-type': 'application/json', ...(TOKEN ? { authorization: 'Bearer ' + TOKEN } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }); } catch (e) { throw new Error('Cannot reach the backend (' + (API || 'API_URL not set') + ')'); }
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && TOKEN) { logout(); throw new Error('Session expired'); }
  if (!r.ok || j.ok === false) throw new Error((j.error && j.error.message) || 'Request failed (' + r.status + ')');
  return j;
}
function logout() { TOKEN = null; ls.set('gta_admin', null); render(); }
function shrink(file, max = 1600, q = 0.86) {
  return new Promise((res, rej) => { if (file.type === 'image/gif' && file.size < 3.5e6) { const f = new FileReader(); f.onload = () => res(f.result); f.onerror = rej; f.readAsDataURL(file); return; }
    const img = new Image(), u = URL.createObjectURL(file); img.onload = () => { const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); const x = c.getContext('2d'); x.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u); res(c.toDataURL('image/jpeg', q)); }; img.onerror = () => rej(new Error('Not an image')); img.src = u; });
}
const upload = async (file, folder) => { const dataUrl = await shrink(file, folder === 'banners' ? 2200 : 1600); return (await api('POST', '/admin/upload', { folder, dataUrl })).url; };
const pickFiles = (multiple) => new Promise((res) => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/png,image/jpeg,image/webp,image/gif'; i.multiple = !!multiple; i.onchange = () => res([...i.files]); i.click(); });
function modal(html, setup) { const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = `<div class="sheet glass">${html}</div>`; document.body.appendChild(m); const close = () => m.remove(); m.addEventListener('mousedown', (e) => { if (e.target === m) close(); }); if (setup) setup(m, close); return close; }
const busy = async (btn, fn) => { if (btn) btn.disabled = true; try { return await fn(); } catch (e) { toast(e.message, true); } finally { if (btn) btn.disabled = false; } };

/* ---------- shell ---------- */
const NAVS = [['dash', 'Dashboard', '<path d="M3 12l9-9 9 9"/><path d="M5 10v10h14V10"/>'], ['catalog', 'Catalog', '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'], ['collections', 'Collections', '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>'], ['site', 'Site & banners', '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M3 15l5-4 4 3 3-2 6 4"/>'], ['subs', 'Submissions', '<path d="M4 4h16v12H8l-4 4z"/>'], ['launchpad', 'Launchpad', '<path d="M12 3c3 2 5 5.5 5 9.5L15 16H9l-2-3.5C7 8.5 9 5 12 3z"/><circle cx="12" cy="10" r="1.6"/><path d="M9 16l-2 4 3-1.5M15 16l2 4-3-1.5"/>'], ['money', 'Vault & sales', '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9 10c0-1.5 6-1.5 6 0s-6 2-6 4 6 1.5 6 0"/>'], ['settings', 'Settings', '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14.2 3h-4l-.4 2.7a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2l.4 2.7h4l.4-2.7a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z"/>']];
const VIEWS = {};
let pending = 0;
async function render() {
  const app = $('#app');
  if (!TOKEN) {
    app.innerHTML = `<div class="login"><form class="box glass" id="lf"><div class="logo"><b>GTA</b><i>Marketplace</i><small>ADMIN</small></div><h1 class="display">Sign <span class="grad">in</span></h1><label class="field">Admin password<input type="password" id="pw" autocomplete="current-password" autofocus></label><button class="btn primary" style="padding:13px">Enter</button><p class="fine">Backend: ${esc(API || 'not configured')}</p></form></div>`;
    $('#lf').onsubmit = async (e) => { e.preventDefault(); await busy($('#lf button'), async () => { const r = await api('POST', '/auth/admin-login', { password: $('#pw').value }); TOKEN = r.token; ls.set('gta_admin', TOKEN); render(); }); };
    return;
  }
  const route = (location.hash.slice(2) || 'dash').split('?')[0], view = VIEWS[route] ? route : 'dash';
  try { const [m, p] = await Promise.all([api('GET', '/admin/wallets'), api('GET', '/admin/submissions?status=pending').catch(() => ({ submissions: [] }))]); META = m; pending = p.submissions.length; } catch (e) { if (!TOKEN) return; toast(e.message, true); }
  app.innerHTML = `<div class="shell"><aside class="side"><div class="logo"><b>GTA</b><i>Marketplace</i><small>ADMIN</small></div>${NAVS.map(([k, l, ic]) => `<a class="nav ${k === view ? 'on' : ''}" href="#/${k}"><svg viewBox="0 0 24 24">${ic}</svg>${l}${k === 'subs' && pending ? `<span class="n">${pending}</span>` : ''}</a>`).join('')}
    <div class="foot"><span class="net ${META && META.network !== 'devnet' ? 'main' : ''}">${META ? (META.network === 'devnet' ? 'Devnet' : 'Mainnet') + ' · ' + esc(META.chain) : '…'}</span>${CFG.SITE_URL ? `<a class="btn sm" href="${esc(CFG.SITE_URL)}" target="_blank" rel="noopener">View site ↗</a>` : ''}<button class="btn sm" id="lo">Sign out</button></div></aside><main class="main" id="view"><div class="empty">Loading…</div></main></div>`;
  $('#lo').onclick = logout;
  try { await VIEWS[view]($('#view')); } catch (e) { $('#view').innerHTML = `<div class="empty"><b>Could not load</b>${esc(e.message)}</div>`; }
}
window.addEventListener('hashchange', render);
const head = (t, sub, right) => `<div class="top"><div><h1 class="display">${t}</h1>${sub ? `<p>${sub}</p>` : ''}</div><div class="row">${right || ''}</div></div>`;

/* ---------- dashboard ---------- */
VIEWS.dash = async (el) => {
  const [s, v] = await Promise.all([api('GET', '/admin/stats'), api('GET', '/admin/vault').catch(() => ({}))]); const st = s.stats, vault = v.vault || {};
  const isDev = META.network === 'devnet';
  el.innerHTML = head('Dashboard', 'Everything about the marketplace at a glance.', `<button class="btn" id="jobs">Run background jobs</button>${isDev ? '<button class="btn primary" id="air">Airdrop 1 devnet SOL</button>' : ''}`) +
    `<div class="cards">${[['Artworks', st.items], ['Collected', st.minted], ['Available', st.unminted], ['Holders', st.holders], ['Active offers', st.activeOffers], ['Listings', st.activeListings], ['Sales', st.sales], ['Volume', usd(st.volumeUsd)]].map(([l, n]) => `<div class="stat glass"><b class="grad">${n ?? 0}</b><small>${l}</small></div>`).join('')}</div>
    <div class="panel glass"><h2>Network &amp; vault</h2><div class="fgrid"><div><div class="fine">Network</div><b>${esc(META.network)}</b> <span class="muted">(${esc(META.chain)})</span></div><div><div class="fine">Vault wallet</div><code>${esc(META.vault || '—')}</code></div><div><div class="fine">On-chain balance</div><b>${sol(vault.onchainLamports)}</b></div><div><div class="fine">Held for bidders</div><b>${sol(vault.escrowLamports)}</b></div><div><div class="fine">Platform revenue</div><b>${sol(vault.revenueLamports)}</b></div><div><div class="fine">Solvency</div><b class="${vault.solvent ? 'ok' : 'bad'}">${vault.solvent ? 'Healthy' : 'Check vault'}</b></div></div>
    ${(vault.onchainLamports || 0) < 0.05e9 ? '<p class="warn" style="margin-top:14px">The vault is low. Minting needs a little SOL for fees — fund it' + (isDev ? ' with the airdrop button.' : '.') + '</p>' : ''}</div>
    <div class="panel glass"><h2>Switching devnet ⇄ mainnet</h2><p class="muted">The network is set on the backend only. In the Vercel project <b>gta-api</b> set <code>NETWORK=mainnet-beta</code>, <code>MAINNET_CONFIRM=I_UNDERSTAND</code>, a mainnet <code>VAULT_SECRET_KEY</code> and a mainnet <code>RPC_URL</code>, then redeploy. Create each era's collection again from <a href="#/collections" class="grad"><b>Collections</b></a> (collections are per network). Nothing on the site changes.</p></div>`;
  $('#jobs').onclick = (e) => busy(e.target, async () => { const r = await api('POST', '/admin/jobs/run'); toast('Jobs done'); console.log(r); });
  const a = $('#air'); if (a) a.onclick = (e) => busy(e.target, async () => { await api('POST', '/admin/vault/airdrop', { sol: 1 }); toast('Airdrop requested'); render(); });
};

/* ---------- catalog ---------- */
const CF = { era: '', status: '', q: '', rarity: '' };
VIEWS.catalog = async (el) => {
  const r = await api('GET', '/admin/items'); let list = r.items; const colls = (await api('GET', '/admin/collections')).collections;
  const draw = () => {
    const f = list.filter((i) => (!CF.era || i.era === CF.era) && (!CF.rarity || i.rarity === CF.rarity) && (!CF.status || (CF.status === 'hidden' ? i.hidden : i.status === CF.status)) && (!CF.q || (i.title + ' ' + i.id).toLowerCase().includes(CF.q.toLowerCase())));
    $('#cnt').textContent = f.length + ' of ' + list.length + ' artworks · ' + list.filter((i) => !i.image).length + ' without image';
    $('#ig').innerHTML = f.length ? f.slice(0, 120).map(card).join('') + (f.length > 120 ? `<div class="empty" style="grid-column:1/-1">Showing 120 — narrow the filters to see more.</div>` : '') : '<div class="empty" style="grid-column:1/-1"><b>No artworks</b>Use “Add artworks” or “Sync catalog”.</div>';
  };
  const card = (i) => { const locked = i.status !== 'unminted'; return `<div class="icard glass ${i.hidden ? 'hid' : ''}" data-id="${esc(i.id)}"><div class="im" data-up>${i.image ? `<img loading="lazy" src="${esc(i.image)}" alt="" onerror="this.style.visibility='hidden'">` : '<div class="empty" style="padding:70px 8px"><b style="font-size:18px">No image</b>placeholder shown</div>'}<span class="tag ${i.status === 'minted' ? 'ok' : i.status === 'reserved' ? 'warn' : ''} st">${esc(i.status)}</span><div class="up">${i.image ? 'Replace image' : 'Upload image'}</div></div>
    <div class="bd"><h3 title="${esc(i.title)}">${esc(i.title)}</h3><div class="fine">${esc(eraName(i.era))} · ${esc(i.category)}</div>
    ${i.platformOwned ? `<div class="pr"><input class="input" data-resale type="number" min="0" step="0.01" placeholder="Not for sale" value="${i.resaleUsd ?? ''}" title="Price collectors pay the platform for this piece. 0 = free. Blank = not for sale."><span class="fine">Platform-owned · resale USD (0 = free)</span></div>` : i.status === 'minted' ? `<div class="pr"><span class="fine">Owned · ${i.owner ? esc(i.owner.slice(0, 4) + '…' + i.owner.slice(-4)) : ''}</span></div>` : `<div class="pr"><input class="input" data-price type="number" min="0" step="0.01" value="${i.priceUsd ?? 0}" ${locked ? 'disabled' : ''}><span class="fine">USD${i.priceUsd === 0 ? ' · free' : ' mint'}</span></div>`}
    <select class="input" data-rar ${locked ? '' : ''}>${opts(RARS, i.rarity)}</select>
    <div class="acts"><button class="btn sm" data-edit>Edit</button><button class="btn sm" data-hide>${i.hidden ? 'Show' : 'Hide'}</button>${locked ? '' : '<button class="btn sm danger" data-del>Delete</button>'}</div></div></div>`; };
  el.innerHTML = head('Catalog', 'Upload artwork, set prices, organise by collection. Items without an image show a “coming soon” placeholder on the site.', '<button class="btn" id="sync">Sync from data.js</button><button class="btn" id="bulkp">Bulk price</button><button class="btn" id="bulk">Upload many</button><button class="btn primary" id="add">+ Add artwork</button>') +
    `<div class="toolbar glass"><select class="input" id="fe"><option value="">All collections</option>${opts(colls.map((c) => [c.id, c.short || c.name || c.id]), CF.era)}</select><select class="input" id="fs"><option value="">Any status</option>${opts([['unminted', 'Available'], ['reserved', 'Reserved'], ['minted', 'Collected'], ['hidden', 'Hidden']], CF.status)}</select><select class="input" id="fr"><option value="">Any rarity</option>${opts(RARS, CF.rarity)}</select><input class="input" id="fq" placeholder="Search…" value="${esc(CF.q)}"><span class="fine" id="cnt"></span></div><div class="igrid" id="ig"></div>`;
  $('#fe').onchange = (e) => { CF.era = e.target.value; draw(); }; $('#fs').onchange = (e) => { CF.status = e.target.value; draw(); }; $('#fr').onchange = (e) => { CF.rarity = e.target.value; draw(); }; $('#fq').oninput = (e) => { CF.q = e.target.value; draw(); };
  const byId = (id) => list.find((x) => x.id === id), patch = async (id, body) => { const { item } = await api('PATCH', '/admin/items/' + encodeURIComponent(id), body); const k = list.findIndex((x) => x.id === id); list[k] = { ...list[k], ...item }; return list[k]; };
  const refreshCard = (id) => { const n = $(`.icard[data-id="${CSS.escape(id)}"]`); if (n) { const t = document.createElement('div'); t.innerHTML = card(byId(id)); n.replaceWith(t.firstElementChild); } };
  const ig = $('#ig');
  ig.onclick = async (e) => {
    const c = e.target.closest('.icard'); if (!c) return; const id = c.dataset.id;
    if (e.target.closest('[data-up]')) { const [f] = await pickFiles(false); if (!f) return; await busy(null, async () => { toast('Uploading…'); await patch(id, { image: await upload(f, 'items') }); refreshCard(id); toast('Image saved'); }); }
    else if (e.target.closest('[data-hide]')) busy(null, async () => { await patch(id, { hidden: !byId(id).hidden }); refreshCard(id); });
    else if (e.target.closest('[data-del]')) { if (!confirm('Delete “' + byId(id).title + '”?')) return; busy(null, async () => { await api('DELETE', '/admin/items/' + encodeURIComponent(id)); list = list.filter((x) => x.id !== id); draw(); toast('Deleted'); }); }
    else if (e.target.closest('[data-edit]')) { const it = byId(id); itemForm(it, async (b) => { await patch(id, b); refreshCard(id); toast('Saved'); }); }
  };
  ig.onchange = (e) => { const c = e.target.closest('.icard'); if (!c) return; const id = c.dataset.id; if (e.target.matches('[data-price]')) busy(null, async () => { await patch(id, { priceUsd: +e.target.value }); refreshCard(id); toast('Price saved'); }); if (e.target.matches('[data-resale]')) busy(null, async () => { const v = e.target.value.trim(); await patch(id, { resaleUsd: v === '' ? null : +v }); refreshCard(id); toast(v === '' ? 'Not for sale' : +v === 0 ? 'Listed for free' : 'Resale price saved'); }); if (e.target.matches('[data-floor]')) busy(null, async () => { const v = e.target.value.trim(); await patch(id, { floorUsd: v === '' ? null : +v }); refreshCard(id); toast(v === '' ? 'Floor removed' : 'Floor saved'); }); if (e.target.matches('[data-rar]')) busy(null, async () => { await patch(id, { rarity: e.target.value }); toast('Rarity saved'); }); };
  function itemForm(it, save) {
    modal(`<h2>${it ? 'Edit artwork' : 'Add artwork'}</h2><label class="field">Title<input id="a" maxlength="60" value="${esc(it ? it.title : '')}"></label><label class="field">Description<textarea id="b" maxlength="600">${esc(it ? it.description : '')}</textarea></label>
    <div class="fgrid"><label class="field">Collection<select id="c">${opts(ERAS, it ? it.era : CF.era || (ERAS[0] || [])[0])}</select></label><label class="field">Type<select id="d">${opts(CATS, it ? it.category : 'Characters')}</select></label><label class="field">Rarity<select id="e">${opts(RARS, it ? it.rarity : 'Common')}</select></label>${it && it.status === 'minted' ? `<label class="field">Price<input id="f" disabled value="Set by the owner when they list it"></label>` : `<label class="field">Price (USD, 0 = free)<input id="f" type="number" min="0" step="0.01" value="${it ? it.priceUsd ?? 0 : 0}" ${it && it.status !== 'unminted' ? 'disabled' : ''}></label>`}</div>
    <label class="field">Tags (comma separated)<input id="g" value="${esc(((it && it.tags) || []).join(', '))}"></label><div class="row" style="justify-content:flex-end"><button class="btn" data-x>Cancel</button><button class="btn primary" data-s>Save</button></div>`, (m, close) => {
      $('[data-x]', m).onclick = close; $('[data-s]', m).onclick = (e) => busy(e.target, async () => { const b = { title: $('#a', m).value.trim(), description: $('#b', m).value.trim(), era: $('#c', m).value, category: $('#d', m).value, rarity: $('#e', m).value, tags: $('#g', m).value.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 8) }; if ($('#f', m).dataset.floor !== undefined) { const v = $('#f', m).value.trim(); b.floorUsd = v === '' ? null : +v; } else if (!$('#f', m).disabled) b.priceUsd = +$('#f', m).value; if (!b.title) throw new Error('Title is required'); await save(b); close(); });
    });
  }
  $('#add').onclick = () => itemForm(null, async (b) => { const { item } = await api('POST', '/admin/items', b); list.unshift(item); draw(); toast('Created — now upload its image'); });
  $('#bulk').onclick = async () => {
    const files = await pickFiles(true); if (!files.length) return;
    modal(`<h2>Upload ${files.length} artworks</h2><p class="muted">Each image becomes a new artwork named after its file. You can rename and price them afterwards.</p><div class="fgrid"><label class="field">Collection<select id="c">${opts(ERAS, CF.era || (ERAS[0] || [])[0])}</select></label><label class="field">Type<select id="d">${opts(CATS, 'Characters')}</select></label><label class="field">Price (USD)<input id="f" type="number" min="0" step="0.01" value="0"></label></div><div class="prog"><i id="pg" style="width:0"></i></div><p class="fine" id="pt"></p><div class="row" style="justify-content:flex-end"><button class="btn" data-x>Close</button><button class="btn primary" data-s>Start</button></div>`, (m, close) => {
      $('[data-x]', m).onclick = close;
      $('[data-s]', m).onclick = (e) => busy(e.target, async () => { let n = 0, fail = 0; for (const f of files) { try { const url = await upload(f, 'items'); const title = f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 60) || 'Untitled'; const { item } = await api('POST', '/admin/items', { title, image: url, era: $('#c', m).value, category: $('#d', m).value, priceUsd: +$('#f', m).value }); list.unshift(item); } catch (err) { fail++; $('#pt', m).textContent = err.message; } n++; $('#pg', m).style.width = (n / files.length * 100) + '%'; } draw(); toast(`Done: ${n - fail} added${fail ? ', ' + fail + ' failed' : ''}`); if (!fail) close(); });
    });
  };
  $('#bulkp').onclick = () => modal(`<h2>Bulk price</h2><p class="muted">Changes the mint price of every <b>available</b> artwork that matches.</p><div class="fgrid"><label class="field">Collection<select id="c"><option value="">All</option>${opts(ERAS, CF.era)}</select></label><label class="field">Rarity<select id="r"><option value="">All</option>${opts(RARS, '')}</select></label><label class="field">Mode<select id="m"><option value="set">Set to $</option><option value="percent">Change by %</option><option value="add">Add $</option></select></label><label class="field">Value<input id="v" type="number" step="0.01" value="1"></label></div><div class="row" style="justify-content:flex-end"><button class="btn" data-x>Cancel</button><button class="btn primary" data-s>Apply</button></div>`, (m, close) => {
    $('[data-x]', m).onclick = close; $('[data-s]', m).onclick = (e) => busy(e.target, async () => { const filter = {}; if ($('#c', m).value) filter.era = $('#c', m).value; if ($('#r', m).value) filter.rarity = $('#r', m).value; const res = await api('POST', '/admin/items/bulk-price', { filter, mode: $('#m', m).value, value: +$('#v', m).value }); toast('Updated ' + (res.updated ?? res.changed ?? '') + ' items'); close(); render(); });
  });
  $('#sync').onclick = () => modal(`<h2>Sync catalog</h2><p class="muted">Adds any artworks from the public site's <code>js/data.js</code> that are missing here. Existing items (and their images/prices) are kept.</p><label class="field">URL of data.js<input id="u" value="${esc(ls.get('gta_seed_url') || location.origin + '/js/data.js')}" placeholder="https://your-site.vercel.app/js/data.js"></label><div class="row" style="justify-content:flex-end"><button class="btn" data-x>Cancel</button><button class="btn primary" data-s>Sync</button></div>`, (m, close) => {
    $('[data-x]', m).onclick = close; $('[data-s]', m).onclick = (e) => busy(e.target, async () => { const url = $('#u', m).value.trim(); ls.set('gta_seed_url', url); const r = await api('POST', '/admin/seed', url ? { url } : {}); toast('Synced: ' + r.result.made + ' new'); close(); render(); });
  });
  draw();
};

/* ---------- collections ---------- */
VIEWS.collections = async (el) => {
  const raw = await api('GET', '/admin/collections'); const isDev = META.network === 'devnet';
  const have = new Map(raw.collections.map((c) => [c.id, c])); // show every era, even ones not registered yet
  const r = { collections: ERAS.map(([id, label]) => have.get(id) || { id, name: label, short: eraName(id), blurb: '', status: 'pending', address: '' }).concat(raw.collections.filter((c) => !ERAS.some(([id]) => id === c.id))) };
  el.innerHTML = head('Collections', 'One collection per era. Each needs an on-chain Metaplex collection on the current network before people can collect from it.', '<button class="btn primary" id="all">Create all missing on-chain</button>') +
    r.collections.map((c) => `<div class="coll glass" data-id="${esc(c.id)}"><div class="cv" data-cv style="${c.cover ? `background-image:url('${esc(c.cover)}')` : ''}"><span>${c.cover ? 'Change cover' : 'Upload cover'}</span></div><div style="display:grid;gap:10px;min-width:0">
      <div class="row" style="justify-content:space-between"><h3 class="display" style="font-size:26px">${esc(c.short || c.name)}</h3><span class="tag ${c.status === 'live' ? 'ok' : c.status === 'paused' ? 'bad' : 'warn'}">${esc(c.status || 'pending')}</span></div>
      <div class="fgrid"><label class="field">Name<input data-f="name" value="${esc(c.name || '')}"></label><label class="field">Status<select data-f="status">${opts(['pending', 'live', 'paused'], c.status || 'pending')}</select></label></div>
      <label class="field">Blurb<textarea data-f="blurb" style="min-height:60px">${esc(c.blurb || '')}</textarea></label>
      <div class="row"><div class="dz" data-bn style="flex:1 1 220px;aspect-ratio:16/4;${c.banner ? `background-image:url('${esc(c.banner)}')` : ''}"><span>${c.banner ? 'Change banner' : 'Upload banner'}</span></div></div>
      <div><div class="fine">On-chain address</div>${c.address ? `<code>${esc(c.address)}</code>` : '<span class="warn">None on ' + esc(META.network) + ' yet</span>'}</div>
      <div class="row"><button class="btn primary sm" data-save>Save</button>${c.address ? '<button class="btn sm" data-recreate>New on-chain address</button>' : '<button class="btn sm" data-create>Create on-chain</button><button class="btn sm" data-attach>Use existing address</button>'}</div></div></div>`).join('');
  const put = (id, b) => api('PUT', '/admin/collections/' + id, b);
  el.onclick = async (e) => {
    const box = e.target.closest('.coll'); if (!box) return; const id = box.dataset.id, val = (k) => $(`[data-f="${k}"]`, box).value;
    if (e.target.closest('[data-cv],[data-bn]')) { const isB = !!e.target.closest('[data-bn]'); const [f] = await pickFiles(false); if (!f) return; await busy(null, async () => { toast('Uploading…'); const url = await upload(f, isB ? 'banners' : 'collections'); await put(id, { [isB ? 'banner' : 'cover']: url }); toast('Saved'); render(); }); }
    else if (e.target.closest('[data-save]')) busy(e.target, async () => { await put(id, { name: val('name'), blurb: val('blurb'), status: val('status') }); toast('Saved'); });
    else if (e.target.closest('[data-create]')) busy(e.target, async () => { await api('POST', `/admin/collections/${id}/create`); toast('Collection created on-chain'); render(); });
    else if (e.target.closest('[data-recreate]')) { if (confirm('Create a brand new on-chain collection for this era? The current address is replaced; NFTs already minted keep the old one.')) busy(e.target, async () => { await api('POST', `/admin/collections/${id}/create`, { force: true }); toast('New collection created on-chain'); render(); }); }
    else if (e.target.closest('[data-attach]')) { const a = prompt('Paste the existing Metaplex Core collection address'); if (a) busy(e.target, async () => { await put(id, { address: a.trim() }); toast('Attached'); render(); }); }
  };
  $('#all').onclick = (e) => busy(e.target, async () => { let n = 0; for (const c of r.collections.filter((x) => !x.address)) { try { await api('POST', `/admin/collections/${c.id}/create`); n++; } catch (err) { toast(c.id + ': ' + err.message, true); } } toast(n + ' created'); render(); });
};

/* ---------- site & banners ---------- */
VIEWS.site = async (el) => {
  const s = (await api('GET', '/admin/settings')).settings.site || {}, b = s.banners || {};
  const dz = (k, label, url, ratio) => `<div><div class="fine" style="margin-bottom:6px">${label}</div><div class="dz" data-dz="${k}" style="aspect-ratio:${ratio};${url ? `background-image:url('${esc(url)}')` : ''}"><span style="position:static;background:rgba(15,4,32,.7);padding:6px 12px;border-radius:9px">${url ? 'Change' : 'Upload'}</span></div>${url ? `<button class="btn sm" style="margin-top:6px" data-clr="${k}">Remove</button>` : ''}</div>`;
  el.innerHTML = head('Site & banners', 'What visitors see on the public website. Anything left empty shows the built-in placeholder.') +
    `<div class="panel glass"><h2>Home page</h2><div class="fgrid" style="margin-bottom:14px"><label class="field">Headline (empty = default)<input id="ht" maxlength="80" value="${esc(s.heroTitle || '')}"></label><label class="field">Sub-headline<input id="hs" maxlength="240" value="${esc(s.heroSubtitle || '')}"></label></div>${dz('heroImage', 'Hero featured image', s.heroImage, '16/8')}</div>
    <div class="panel glass"><h2>Page banners</h2><div class="fgrid">${dz('explore', 'Explore page', b.explore, '16/5')}${dz('eras', 'Eras page', b.eras, '16/5')}${dz('create', 'Submit page', b.create, '16/5')}</div></div>
    <div class="panel glass"><h2>Announcement</h2><label class="field">Short text shown in a bar at the top of the site (empty = hidden)<input id="an" maxlength="160" value="${esc(s.announcement || '')}"></label></div><button class="btn primary" id="sv">Save text</button>`;
  const save = (site) => api('PUT', '/admin/settings', { site });
  el.onclick = async (e) => {
    const d = e.target.closest('[data-dz]'), c = e.target.closest('[data-clr]');
    if (d) { const k = d.dataset.dz, [f] = await pickFiles(false); if (!f) return; await busy(null, async () => { toast('Uploading…'); const url = await upload(f, 'banners'); await save(k === 'heroImage' ? { heroImage: url } : { banners: { [k]: url } }); toast('Saved'); render(); }); }
    if (c) busy(null, async () => { const k = c.dataset.clr; await save(k === 'heroImage' ? { heroImage: '' } : { banners: { [k]: '' } }); render(); });
  };
  $('#sv').onclick = (e) => busy(e.target, async () => { await save({ heroTitle: $('#ht').value, heroSubtitle: $('#hs').value, announcement: $('#an').value }); toast('Saved'); });
};

/* ---------- submissions ---------- */
let SUBTAB = 'pending';
VIEWS.subs = async (el) => {
  const r = (await api('GET', '/admin/submissions?status=' + SUBTAB)).submissions;
  el.innerHTML = head('Submissions', 'Artwork sent in by users.') + `<div class="row" style="margin-bottom:16px">${['pending', 'approved', 'rejected'].map((t) => `<button class="btn ${t === SUBTAB ? 'primary' : ''}" data-t="${t}">${t}</button>`).join('')}</div>` +
    (r.length ? r.map((s) => `<div class="sub-card glass" data-id="${esc(s.id)}"><img src="${esc((s.media && s.media[0] && s.media[0].url) || '')}" alt=""><div style="display:grid;gap:8px;align-content:start;min-width:0"><div class="row" style="justify-content:space-between"><h3 class="display" style="font-size:24px">${esc(s.title)}</h3><span class="fine">${ago(s.createdAt)}</span></div><div class="fine">${esc(eraName(s.era))} · ${esc(s.category || '')} · from <code>${esc(short(s.wallet || s.owner || s.userWallet))}</code>${s.suggestedPriceUsd != null ? ' · suggests ' + usd(s.suggestedPriceUsd) : ''}</div><p class="muted">${esc(s.description)}</p>${s.reason ? `<p class="bad">Rejected: ${esc(s.reason)}</p>` : ''}
      ${SUBTAB === 'pending' ? `<div class="row"><label class="field" style="width:120px">Price USD<input data-p type="number" min="0" step="0.01" value="${s.suggestedPriceUsd ?? 5}"></label><label class="field" style="width:140px">Rarity<select data-r>${opts(RARS, 'Common')}</select></label><button class="btn primary" data-ok style="align-self:end">Approve</button><button class="btn danger" data-no style="align-self:end">Reject</button></div>` : ''}</div></div>`).join('') : `<div class="empty"><b>Nothing ${SUBTAB}</b></div>`);
  el.onclick = (e) => {
    const t = e.target.closest('[data-t]'); if (t) { SUBTAB = t.dataset.t; return render(); }
    const c = e.target.closest('.sub-card'); if (!c) return; const id = c.dataset.id;
    if (e.target.closest('[data-ok]')) busy(e.target, async () => { await api('POST', `/admin/submissions/${id}/approve`, { priceUsd: +$('[data-p]', c).value, rarity: $('[data-r]', c).value }); toast('Approved — it is now in the catalog'); render(); });
    if (e.target.closest('[data-no]')) { const reason = prompt('Reason (shown to the creator, optional)') ; if (reason === null) return; busy(e.target, async () => { await api('POST', `/admin/submissions/${id}/reject`, { reason }); toast('Rejected'); render(); }); }
  };
};

/* ---------- vault & sales ---------- */
VIEWS.money = async (el) => {
  const [v, p, s, l] = await Promise.all([api('GET', '/admin/vault'), api('GET', '/admin/payouts').catch(() => ({ payouts: [] })), api('GET', '/admin/sales').catch(() => ({ sales: [] })), api('GET', '/admin/ledger?limit=40').catch(() => ({ ledger: [] }))]); const vault = v.vault;
  const rows = (arr, cols) => arr.length ? `<div class="scroll"><table class="tbl"><tr>${cols.map((c) => `<th>${c[0]}</th>`).join('')}</tr>${arr.map((x) => `<tr>${cols.map((c) => `<td>${c[1](x)}</td>`).join('')}</tr>`).join('')}</table></div>` : '<p class="muted">Nothing yet.</p>';
  el.innerHTML = head('Vault & sales', 'The platform wallet, refunds, revenue and every sale.') +
    `<div class="cards"><div class="stat glass"><b>${sol(vault.onchainLamports)}</b><small>On-chain</small></div><div class="stat glass"><b>${sol(vault.escrowLamports)}</b><small>Bidders' escrow</small></div><div class="stat glass"><b class="grad">${sol(vault.revenueLamports)}</b><small>Revenue</small></div><div class="stat glass"><b>${sol(vault.withdrawableLamports)}</b><small>Withdrawable</small></div></div>
    <div class="panel glass"><h2>Withdraw revenue</h2><p class="sub">Only platform revenue can leave — bidders' escrow is never touched.</p><div class="row"><input class="input" id="wt" placeholder="Destination wallet address" style="flex:1 1 280px"><input class="input" id="wa" type="number" step="0.001" min="0" placeholder="SOL" style="width:120px"><button class="btn primary" id="wd">Withdraw</button></div></div>
    <div class="panel glass"><h2>Payout queue</h2>${rows(p.payouts || [], [['To', (x) => `<code>${esc(short(x.to || x.wallet))}</code>`], ['Amount', (x) => sol(x.lamports)], ['Reason', (x) => esc(x.reason || x.kind || '')], ['Status', (x) => `<span class="tag ${x.status === 'sent' ? 'ok' : x.status === 'needs_review' ? 'bad' : 'warn'}">${esc(x.status)}</span>`], ['', (x) => x.status === 'needs_review' ? `<button class="btn sm" data-retry="${esc(x.id)}">Retry</button>` : '']])}</div>
    <div class="panel glass"><h2>Sales</h2>${rows(s.sales, [['When', (x) => ago(x.createdAt)], ['Item', (x) => esc(x.itemTitle || x.itemId)], ['Type', (x) => esc(x.type || (x.secondary ? 'secondary' : 'primary'))], ['USD', (x) => usd(x.usd ?? x.priceUsd)], ['Buyer', (x) => `<code>${esc(short(x.buyer))}</code>`]])}</div>
    <div class="panel glass"><h2>Latest ledger</h2>${rows(l.ledger, [['When', (x) => ago(x.createdAt)], ['Type', (x) => esc(x.type || x.kind || '')], ['SOL', (x) => sol(x.lamports)], ['Note', (x) => esc(x.note || x.itemId || '')]])}</div>`;
  $('#wd').onclick = (e) => busy(e.target, async () => { const lam = Math.round(+$('#wa').value * 1e9); if (!$('#wt').value.trim() || !lam) throw new Error('Enter an address and an amount'); await api('POST', '/admin/vault/withdraw', { to: $('#wt').value.trim(), lamports: lam }); toast('Withdrawal queued — run jobs from the dashboard to send it'); render(); });
  el.onclick = (e) => { const b = e.target.closest('[data-retry]'); if (b) busy(b, async () => { await api('POST', `/admin/payouts/${b.dataset.retry}/retry`); toast('Re-queued'); render(); }); };
};

/* ---------- settings ---------- */
VIEWS.settings = async (el) => {
  const s = (await api('GET', '/admin/settings')).settings, bw = s.bidWindow || {};
  const n = (k, l, v, step = 1) => `<label class="field">${l}<input data-k="${k}" type="number" step="${step}" value="${v}"></label>`;
  el.innerHTML = head('Settings', 'Live rules for the marketplace. Changes apply immediately.') +
    `<div class="panel glass"><h2>Kill switches</h2><div class="row" style="gap:30px"><label class="switch"><input type="checkbox" data-k="mintingEnabled" ${s.mintingEnabled ? 'checked' : ''}>Minting open</label><label class="switch"><input type="checkbox" data-k="tradingEnabled" ${s.tradingEnabled ? 'checked' : ''}>Trading open (buy / list / offers)</label></div></div>
    <div class="panel glass"><h2>Fees &amp; limits</h2><div class="fgrid">${n('saleFeeBps', 'Sale fee (basis points, 250 = 2.5%)', s.saleFeeBps)}${n('acceptFeeUsd', 'Network fee on sales (USD)', s.acceptFeeUsd, 0.01)}${n('minOfferUsd', 'Minimum offer (USD)', s.minOfferUsd, 0.01)}${n('maxActiveOffersPerItem', 'Max offers per item', s.maxActiveOffersPerItem)}${n('offerTtlHours', 'Offer lifetime (hours)', s.offerTtlHours)}${n('maxFreeMintsPerWallet', 'Free mints per wallet', s.maxFreeMintsPerWallet)}</div></div>
    <div class="panel glass"><h2>Offer window</h2><p class="sub">When on, offers can only be placed during a window each cycle.</p><div class="row" style="gap:30px;margin-bottom:12px"><label class="switch"><input type="checkbox" data-bw="enabled" ${bw.enabled ? 'checked' : ''}>Enable window</label></div><div class="fgrid"><label class="field">Open for (minutes)<input data-bw="openMinutes" type="number" value="${bw.openMinutes ?? 120}"></label><label class="field">Cycle length (minutes)<input data-bw="cycleMinutes" type="number" value="${bw.cycleMinutes ?? 360}"></label></div></div>
    <button class="btn primary" id="sv">Save settings</button>`;
  $('#sv').onclick = (e) => busy(e.target, async () => { const b = { bidWindow: {} }; $$('[data-k]', el).forEach((i) => { b[i.dataset.k] = i.type === 'checkbox' ? i.checked : +i.value; }); $$('[data-bw]', el).forEach((i) => { b.bidWindow[i.dataset.bw] = i.type === 'checkbox' ? i.checked : +i.value; }); await api('PUT', '/admin/settings', b); toast('Settings saved'); });
};

render();

/* ---------- launchpad: our drops (mint stages) + creator collections to verify ---------- */
let LPTAB = 'ours';
const toLocal = (t) => { if (!t) return ''; const d = new Date(t); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16); };
const fromLocal = (v) => (v ? new Date(v).getTime() : null);
const stLine = (x) => `${esc(x.name)} · ${x.kind} · ${usd(x.priceUsd)} · ${x.perWallet}/wallet · ${new Date(x.start).toLocaleString()}${x.end ? ' → ' + new Date(x.end).toLocaleString() : ''}${x.kind === 'allowlist' ? ' · ' + (x.allowlist || []).length + ' wallets' : ''}`;
function dropEditor(c) {
  const d = c.drop || { stages: [], published: false, revealMode: 'instant' };
  const stages = (d.stages || []).map((x) => ({ ...x, allowlist: x.allowlist || [] }));
  const row = (x, i) => `<div class="panel glass" data-i="${i}" style="padding:14px;margin:0 0 10px"><div class="fgrid"><label class="field">Name<input data-s="name" value="${esc(x.name)}"></label><label class="field">Type<select data-s="kind">${opts(['allowlist', 'public'], x.kind)}</select></label></div>
    <div class="fgrid"><label class="field">Price USD (0 = free)<input data-s="priceUsd" type="number" min="0" step="0.01" value="${x.priceUsd}"></label><label class="field">Per wallet<input data-s="perWallet" type="number" min="1" max="100" value="${x.perWallet}"></label></div>
    <div class="fgrid"><label class="field">Starts<input data-s="start" type="datetime-local" value="${toLocal(x.start)}"></label><label class="field">Ends (optional)<input data-s="end" type="datetime-local" value="${toLocal(x.end)}"></label></div>
    <label class="field">Allowlist wallets (allowlist stages)<textarea data-s="allowlist" style="min-height:60px;font-family:monospace">${esc((x.allowlist || []).join('\n'))}</textarea></label><button class="btn sm danger" data-rm="${i}">Remove stage</button></div>`;
  modal(`<h2 class="display" style="font-size:30px">${esc(c.name || c.id)} drop</h2><p class="muted" style="margin-bottom:14px">Mint stages for our own collection. Turn on "Listed on Drops" to show it on the launchpad.</p>
    <div class="fgrid"><label class="field">Listed on Drops<select id="pub">${opts(['no', 'yes'], d.published ? 'yes' : 'no')}</select></label><label class="field">Supply (empty = every artwork in the collection)<input id="sup" type="number" min="1" value="${d.supply || ''}"></label></div>
    <div class="fgrid"><label class="field">Reveal<select id="rm">${opts(['instant', 'date', 'manual'], d.revealMode || 'instant')}</select></label><label class="field">Reveal time (for "date")<input id="ra" type="datetime-local" value="${toLocal(d.revealAt)}"></label></div>
    <h3 style="margin:16px 0 10px">Stages</h3><div id="sts">${stages.map(row).join('')}</div><div class="row"><button class="btn sm" data-add="allowlist">+ Allowlist stage</button><button class="btn sm" data-add="public">+ Public stage</button></div>
    <div class="row" style="margin-top:18px"><button class="btn primary" id="sv">Save drop</button><button class="btn" id="cx">Cancel</button></div>`, (m, close) => {
    const read = () => $$('[data-i]', m).forEach((box) => { const x = stages[+box.dataset.i]; $$('[data-s]', box).forEach((f) => { const k = f.dataset.s; x[k] = k === 'start' || k === 'end' ? fromLocal(f.value) : k === 'priceUsd' || k === 'perWallet' ? +f.value : k === 'allowlist' ? f.value.split(/[\s,;]+/).map((w) => w.trim()).filter(Boolean) : f.value; }); });
    const redraw = () => { $('#sts', m).innerHTML = stages.map(row).join(''); };
    m.addEventListener('click', (e) => {
      const a = e.target.closest('[data-add]'), r = e.target.closest('[data-rm]');
      if (a) { read(); const last = stages[stages.length - 1], start = last ? last.end || last.start + 864e5 : Date.now() + 864e5; stages.push({ name: a.dataset.add === 'allowlist' ? 'Allowlist' : 'Public', kind: a.dataset.add, priceUsd: 0, perWallet: 1, start, end: a.dataset.add === 'allowlist' ? start + 864e5 : null, allowlist: [] }); redraw(); }
      if (r) { read(); stages.splice(+r.dataset.rm, 1); redraw(); }
    });
    $('#cx', m).onclick = close;
    $('#sv', m).onclick = (e) => busy(e.target, async () => { read(); await api('PUT', `/admin/collections/${c.id}/drop`, { published: $('#pub', m).value === 'yes', supply: $('#sup', m).value ? +$('#sup', m).value : null, revealMode: $('#rm', m).value, revealAt: fromLocal($('#ra', m).value), preReveal: c.drop && c.drop.preReveal || null, stages: stages.map((x) => ({ id: x.id, name: x.name, kind: x.kind, priceUsd: x.priceUsd || 0, perWallet: x.perWallet || 1, start: x.start, end: x.end || null, allowlist: x.allowlist })) }); toast('Drop saved'); close(); render(); });
  });
}
VIEWS.launchpad = async (el) => {
  const tabs = `<div class="row" style="margin-bottom:16px">${[['ours', 'Our drops'], ['review', 'To verify'], ['approved', 'Verified'], ['rejected', 'Rejected']].map(([k, l]) => `<button class="btn ${k === LPTAB ? 'primary' : ''}" data-lt="${k}">${l}</button>`).join('')}</div>`;
  if (LPTAB === 'ours') {
    const cols = (await api('GET', '/admin/collections')).collections;
    el.innerHTML = head('Launchpad', 'Mint stages for our collections, and creator collections waiting for verification.') + tabs +
      (cols.length ? cols.map((c) => `<div class="coll glass" data-id="${esc(c.id)}"><div class="cv" style="${c.cover ? `background-image:url('${esc(c.cover)}')` : ''}"></div><div style="display:grid;gap:8px;min-width:0"><div class="row" style="justify-content:space-between"><h3 class="display" style="font-size:24px">${esc(c.name || c.id)}</h3><span class="tag ${c.drop && c.drop.published ? 'ok' : 'warn'}">${c.drop && c.drop.published ? 'On Drops' : 'Not listed'}</span></div>
        <div class="fine">${c.drop && c.drop.stages && c.drop.stages.length ? c.drop.stages.map(stLine).join('<br>') : 'No mint stages yet'}</div><div class="row"><button class="btn primary sm" data-edit>Edit mint stages</button>${c.drop && c.drop.published && c.drop.revealMode !== 'instant' && !c.drop.revealedAt ? '<button class="btn sm" data-reveal>Reveal now</button>' : ''}</div></div></div>`).join('') : '<div class="empty"><b>No collections yet</b>Add them under Collections first.</div>');
    el.onclick = (e) => { const t = e.target.closest('[data-lt]'); if (t) { LPTAB = t.dataset.lt; return render(); } const b = e.target.closest('[data-edit]'); if (b) dropEditor(cols.find((c) => c.id === b.closest('.coll').dataset.id)); const r = e.target.closest('[data-reveal]'); if (r && confirm('Reveal this drop now?')) busy(r, async () => { const x = await api('POST', `/admin/collections/${r.closest('.coll').dataset.id}/drop/reveal`, {}); toast(`Revealed ${x.revealed} pieces`); render(); }); };
    return;
  }
  const list = (await api('GET', '/admin/launches?status=' + LPTAB)).launches;
  el.innerHTML = head('Launchpad', 'Creator collections. Check it is original GTA-inspired work before you verify it.') + tabs +
    (list.length ? list.map((l) => `<div class="sub-card glass" data-id="${esc(l.id)}"><img src="${esc(l.preReveal || l.logo)}" alt=""><div style="display:grid;gap:8px;align-content:start;min-width:0">
      <div class="row" style="justify-content:space-between"><h3 class="display" style="font-size:24px">${esc(l.name)} <span class="muted" style="font-size:14px">${esc(l.symbol)}</span></h3><span class="fine">${ago(l.createdAt)}</span></div>
      ${l.banner && l.banner !== l.logo ? `<div style="aspect-ratio:16/5;border-radius:12px;background:center/cover url('${esc(l.banner)}')"></div>` : ''}
      <p class="muted">${esc(l.description)}</p><div class="fine">Creator <code>${esc(l.wallet)}</code> · ${l.supply} items · ${l.royaltyPct}% royalty · theme ${esc(l.theme)} · reveal ${esc(l.revealMode)}${l.revealAt ? ' ' + new Date(l.revealAt).toLocaleString() : ''} · ${(l.art || []).length} art files${l.links && (l.links.x || l.links.site) ? ' · ' + esc([l.links.x, l.links.site].filter(Boolean).join(' · ')) : ''}</div>
      <div class="fine">${l.stages.map(stLine).join('<br>')}</div>${l.reason ? `<div class="warn">${esc(l.reason)}</div>` : ''}
      ${LPTAB === 'review' ? '<div class="row"><button class="btn primary" data-ok>Verify &amp; list</button><button class="btn danger" data-no>Reject</button></div>' : ''}</div></div>`).join('') : `<div class="empty"><b>Nothing ${LPTAB === 'review' ? 'to verify' : 'here'}</b></div>`);
  el.onclick = (e) => {
    const t = e.target.closest('[data-lt]'); if (t) { LPTAB = t.dataset.lt; return render(); }
    const c = e.target.closest('.sub-card'); if (!c) return; const id = c.dataset.id;
    if (e.target.closest('[data-ok]')) busy(e.target, async () => { await api('POST', `/admin/launches/${id}/review`, { approve: true }); toast('Verified — it is on Drops now'); render(); });
    if (e.target.closest('[data-no]')) { const reason = prompt('Reason (shown to the creator)'); if (reason === null) return; busy(e.target, async () => { await api('POST', `/admin/launches/${id}/review`, { approve: false, reason }); toast('Rejected'); render(); }); }
  };
};
