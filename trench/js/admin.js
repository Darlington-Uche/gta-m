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
const NAVS = [['dash', 'Overview', '<path d="M3 12l9-9 9 9"/><path d="M5 10v10h14V10"/>'], ['collections', 'Collections', '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'], ['money', 'Money', '<rect x="3" y="6" width="18" height="12" rx="3"/><circle cx="12" cy="12" r="2.5"/>'], ['users', 'Users', '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M16 5a3.5 3.5 0 0 1 0 7M18 14.8c2 .6 3.2 2.3 3.5 5.2"/>'], ['settings', 'Settings', '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>']];
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
    ${(vault.onchainLamports || 0) < 0.05e9 ? '<p class="warn" style="margin-top:14px">The vault is low. Minting needs a little SOL for fees — fund it' + (isDev ? ' with the airdrop button.' : '.') + '</p>' : ''}</div>`;
  $('#jobs').onclick = (e) => busy(e.target, async () => { const r = await api('POST', '/admin/jobs/run'); toast('Jobs done'); console.log(r); });
  const a = $('#air'); if (a) a.onclick = (e) => busy(e.target, async () => { await api('POST', '/admin/vault/airdrop', { sol: 1 }); toast('Airdrop requested'); render(); });
};

const siteInto = async (el) => {
  const s = (await api('GET', '/admin/settings')).settings.site || {}, b = s.banners || {};
  const dz = (k, label, url, ratio) => `<div><div class="fine" style="margin-bottom:6px">${label}</div><div class="dz" data-dz="${k}" style="aspect-ratio:${ratio};${url ? `background-image:url('${esc(url)}')` : ''}"><span style="position:static;background:rgba(15,4,32,.7);padding:6px 12px;border-radius:9px">${url ? 'Change' : 'Upload'}</span></div>${url ? `<button class="btn sm" style="margin-top:6px" data-clr="${k}">Remove</button>` : ''}</div>`;
  el.innerHTML = head('Site', 'Home text, banners and the announcement bar.') +
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
  const siteEl = document.createElement('div');
  const s = (await api('GET', '/admin/settings')).settings, bw = s.bidWindow || {};
  const n = (k, l, v, step = 1) => `<label class="field">${l}<input data-k="${k}" type="number" step="${step}" value="${v}"></label>`;
  el.innerHTML = head('Settings', 'Live rules for the marketplace. Changes apply immediately.') +
    `<div class="panel glass"><h2>Kill switches</h2><div class="row" style="gap:30px"><label class="switch"><input type="checkbox" data-k="mintingEnabled" ${s.mintingEnabled ? 'checked' : ''}>Minting open</label><label class="switch"><input type="checkbox" data-k="tradingEnabled" ${s.tradingEnabled ? 'checked' : ''}>Trading open (buy / list / offers)</label></div></div>
    <div class="panel glass"><h2>Fees &amp; limits</h2><div class="fgrid">${n('saleFeeBps', 'Sale fee (basis points, 250 = 2.5%)', s.saleFeeBps)}${n('acceptFeeUsd', 'Network fee on sales (USD)', s.acceptFeeUsd, 0.01)}${n('minOfferUsd', 'Minimum offer (USD)', s.minOfferUsd, 0.01)}${n('maxActiveOffersPerItem', 'Max offers per item', s.maxActiveOffersPerItem)}${n('offerTtlHours', 'Offer lifetime (hours)', s.offerTtlHours)}${n('maxFreeMintsPerWallet', 'Free mints per wallet', s.maxFreeMintsPerWallet)}</div></div>
    <div class="panel glass"><h2>Offer window</h2><p class="sub">When on, offers can only be placed during a window each cycle.</p><div class="row" style="gap:30px;margin-bottom:12px"><label class="switch"><input type="checkbox" data-bw="enabled" ${bw.enabled ? 'checked' : ''}>Enable window</label></div><div class="fgrid"><label class="field">Open for (minutes)<input data-bw="openMinutes" type="number" value="${bw.openMinutes ?? 120}"></label><label class="field">Cycle length (minutes)<input data-bw="cycleMinutes" type="number" value="${bw.cycleMinutes ?? 360}"></label></div></div>
    <div class="panel glass"><h2>News accounts</h2><p class="sub">X accounts shown in Explore → News, comma separated. Checked about every 5 minutes.</p><input class="input" id="nacc" style="width:100%" value="${esc((s.newsAccounts || []).map((h) => '@' + h).join(', '))}"></div>
    <button class="btn primary" id="svs">Save settings</button>`;
  $('#svs').onclick = (e) => busy(e.target, async () => { const b = { bidWindow: {} }; $$('[data-k]', el).forEach((i) => { b[i.dataset.k] = i.type === 'checkbox' ? i.checked : +i.value; }); b.newsAccounts = $('#nacc').value.split(/[\s,]+/).map((x) => x.replace(/^@/, '')).filter(Boolean); $$('[data-bw]', el).forEach((i) => { b.bidWindow[i.dataset.bw] = i.type === 'checkbox' ? i.checked : +i.value; }); await api('PUT', '/admin/settings', b); toast('Settings saved'); });
  el.appendChild(siteEl); await siteInto(siteEl);
};

/* ---------- collections: every creator collection, with take-down / restore ---------- */
let CTAB = 'live';
VIEWS.collections = async (el) => {
  const all = (await api('GET', '/admin/creator-collections')).collections, down = all.filter((c) => c.status === 'rejected'), drafts = all.filter((c) => c.status === 'draft'), live = all.filter((c) => c.status !== 'rejected' && c.status !== 'draft');
  const list = CTAB === 'live' ? live : CTAB === 'drafts' ? drafts : down;
  const tabs = `<div class="row" style="margin-bottom:16px"><button class="btn ${CTAB === 'live' ? 'primary' : ''}" data-ct="live">Live · ${live.length}</button><button class="btn ${CTAB === 'drafts' ? 'primary' : ''}" data-ct="drafts">Drafts · ${drafts.length}</button><button class="btn ${CTAB === 'down' ? 'primary' : ''}" data-ct="down">Taken down · ${down.length}</button></div>`;
  const card = (c) => { const pct = c.supply ? Math.round((c.minted / c.supply) * 100) : 0, ended = c.mintEnd && Date.now() > c.mintEnd;
    return `<div class="sub-card glass" data-id="${esc(c.id)}"><img src="${esc(c.logo || '')}" alt=""><div style="display:grid;gap:10px;min-width:0">
      <div class="row" style="justify-content:space-between"><h3 class="display" style="font-size:22px">${esc(c.name)} <span class="muted" style="font-size:13px">${esc(c.symbol || '')}</span></h3><span class="tag ${c.status === 'rejected' ? 'bad' : c.status === 'draft' || ended ? 'warn' : 'ok'}">${c.status === 'rejected' ? 'Taken down' : c.status === 'draft' ? 'Draft' : ended ? 'Mint ended' : 'Minting'}</span></div>
      <div class="bar"><i style="width:${pct}%"></i></div><div class="fine">${c.minted} of ${c.supply || '—'} minted · ${usd(c.mintPriceUsd)} each · ${c.perWallet}/wallet</div>
      <div class="cards2"><div><b>$${c.mintRevenueUsd}</b><small>Mint sales</small></div><div><b>${c.tradeCount}</b><small>Trades</small></div><div><b>${usd(c.tradeVolumeUsd)}</b><small>Volume</small></div><div><b>${c.holders}</b><small>Holders</small></div></div>
      <div class="fine">By <code>${esc(short(c.creator))}</code> · ${ago(c.createdAt)}${c.reason ? ' · ' + esc(c.reason) : ''}</div>
      <div class="row">${c.status === 'draft' ? '' : c.status === 'rejected' ? '<button class="btn primary sm" data-restore>Put back</button>' : '<button class="btn sm danger" data-down>Take down</button>'}${c.minted ? '' : '<button class="btn sm danger" data-del>Delete</button>'}<button class="btn sm" data-user="${esc(c.creator)}">Creator</button></div></div></div>`; };
  el.innerHTML = head('Collections', 'Every collection creators launched. Take one down if it breaks the rules.') + tabs + (list.length ? list.map(card).join('') : '<div class="empty"><b>Nothing here</b>Collections show up as soon as creators launch them.</div>');
  el.onclick = (e) => {
    const t = e.target.closest('[data-ct]'); if (t) { CTAB = t.dataset.ct; return render(); }
    const u = e.target.closest('[data-user]'); if (u) { USEL = u.dataset.user; location.hash = '#/users'; return; }
    const card = e.target.closest('[data-id]'); if (!card) return; const id = card.dataset.id;
    if (e.target.closest('[data-down]')) modal(`<h2 class="display" style="font-size:26px">Take down?</h2><p class="muted">It disappears from Drops and Explore. Holders keep what they minted.</p><label class="field">Reason (shown to the creator)<input id="rs" maxlength="200" placeholder="e.g. copied artwork"></label><div class="row" style="margin-top:16px"><button class="btn danger" id="ok">Take down</button><button class="btn" id="no">Cancel</button></div>`, (m, close) => { $('#no', m).onclick = close; $('#ok', m).onclick = (ev) => busy(ev.target, async () => { await api('POST', `/admin/launches/${id}/review`, { approve: false, reason: $('#rs', m).value || 'Removed by admin' }); close(); toast('Taken down'); render(); }); });
    if (e.target.closest('[data-del]')) modal(`<h2 class="display" style="font-size:26px">Delete for good?</h2><p class="muted">Its art and page are removed. Nobody minted from it, so no one loses anything.</p><div class="row" style="margin-top:16px"><button class="btn danger" id="ok">Delete</button><button class="btn" id="no">Cancel</button></div>`, (m, close) => { $('#no', m).onclick = close; $('#ok', m).onclick = (ev) => busy(ev.target, async () => { await api('DELETE', `/admin/launches/${id}`); close(); toast('Deleted'); render(); }); });
    if (e.target.closest('[data-restore]')) busy(e.target, async () => { await api('POST', `/admin/launches/${id}/restore`); toast('Back on the launchpad'); render(); });
  };
};

/* ---------- users: look up a wallet, block / unblock ---------- */
let USEL = null;
VIEWS.users = async (el) => {
  const sel = USEL; USEL = null;
  el.innerHTML = head('Users', 'Find a wallet by address, name or @username.') + `<div class="panel glass"><div class="row"><input class="input" id="uq" placeholder="Search…" style="flex:1 1 260px"><button class="btn primary" id="ug">Search</button></div></div><div id="ures"></div><div id="udet"></div>`;
  const row = (u) => `<button class="urow glass" data-w="${esc(u.wallet)}"><span class="av">${u.avatar ? `<img src="${esc(u.avatar)}" alt="">` : esc((u.name || u.username || u.wallet)[0].toUpperCase())}</span><span><b>${esc(u.name || (u.username ? '@' + u.username : short(u.wallet)))}</b><small>${u.username ? '@' + esc(u.username) + ' · ' : ''}${esc(short(u.wallet))}</small></span>${u.blocked ? '<span class="tag bad">Blocked</span>' : ''}</button>`;
  const find = async () => { const q = $('#uq').value.trim(); const r = (await api('GET', '/admin/users?q=' + encodeURIComponent(q))).users; $('#ures').innerHTML = r.length ? r.map(row).join('') : '<div class="empty"><b>No one found</b>Try the full wallet address.</div>'; };
  const open = async (w) => {
    const u = (await api('GET', '/admin/users/' + encodeURIComponent(w))).user;
    $('#udet').innerHTML = `<div class="panel glass"><div class="row" style="justify-content:space-between"><h2>${esc(u.name || (u.username ? '@' + u.username : short(u.wallet)))}</h2>${u.blocked ? '<span class="tag bad">Blocked</span>' : '<span class="tag ok">Active</span>'}</div><code style="word-break:break-all">${esc(u.wallet)}</code>
      <div class="cards2" style="margin-top:14px"><div><b>${u.holdings}</b><small>NFTs held</small></div><div><b>${u.offersActive}</b><small>Offers out</small></div><div><b>${u.offersReceived}</b><small>Offers in</small></div><div><b>${u.bought}/${u.sold}</b><small>Bought / sold</small></div><div><b>${usd(u.volumeUsd)}</b><small>Volume</small></div></div>
      ${u.collections.length ? `<h3 style="margin:16px 0 8px">Collections</h3>${u.collections.map((c) => `<div class="fine">${esc(c.name)} · ${esc(c.status)} · ${c.minted}/${c.supply}</div>`).join('')}` : ''}
      ${u.blockedReason ? `<p class="warn" style="margin-top:12px">Blocked: ${esc(u.blockedReason)}</p>` : ''}
      <div class="row" style="margin-top:16px">${u.blocked ? '<button class="btn primary" id="ub">Unblock</button>' : '<button class="btn danger" id="ub">Block wallet</button>'}</div><p class="fine">Blocked wallets can browse but cannot mint, trade, offer or create.</p></div>`;
    $('#ub').onclick = (e) => busy(e.target, async () => { const reason = u.blocked ? '' : prompt('Reason (optional)') || ''; await api('POST', `/admin/users/${encodeURIComponent(w)}/block`, { blocked: !u.blocked, reason }); toast(u.blocked ? 'Unblocked' : 'Blocked'); open(w); find(); });
    $('#udet').scrollIntoView({ behavior: 'smooth' });
  };
  $('#ug').onclick = find; $('#uq').onkeydown = (e) => { if (e.key === 'Enter') find(); };
  $('#ures').onclick = (e) => { const b = e.target.closest('[data-w]'); if (b) open(b.dataset.w); };
  await find(); if (sel) open(sel);
};

render();
