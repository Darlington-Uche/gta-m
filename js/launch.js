// Create: pick "Launch a collection" or "Submit a single artwork". The collection wizard walks through
// details → art & reveal → supply → mint stages → review, keeps a draft on this device, and submits for verification.
import { S, $, $$, esc, usd, short, http, toast, walletModal, shrinkImage } from './core.js';
import { cd, priceTxt, solTxt } from './drops.js';

const tick = '<svg class="vf" viewBox="0 0 24 24" aria-label="Verified"><path d="M12 2l2.4 1.9 3-.2 1.1 2.8 2.6 1.6-.6 3 1.2 2.7-2 2.3-.1 3-2.9.9L12 22l-2.7-1.9-2.9-.9-.1-3-2-2.3L5.5 11l-.6-3 2.6-1.6 1.1-2.8 3 .2z"/><path d="M8.2 12.3l2.6 2.6 5-5.2" fill="none"/></svg>';
const solOf = (u) => { const r = S.meta && S.meta.solUsd; return r && u != null ? u / r : null; };

/* ================= CHOOSER ================= */
export async function createHub() {
  const html = `<div class="ph2"><div><span class="eyebrow">Create</span><h1 class="display">What are you <span class="grad">making?</span></h1></div></div>
  <div class="choose">
    <a class="chc main" href="#/create/collection"><span class="chc-bg" style="background-image:url('img/hero.jpg')"></span><i class="chc-sh"></i>
      <div class="chc-in"><span class="chc-ic"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/></svg></span>
        <h2>Launch a collection</h2><p>Your own drop on the launchpad: cover art, supply, mint stages (allowlist, public), free or paid, reveal on your schedule.</p>
        <ul><li>Allowlist + public stages</li><li>Pre-reveal cover, reveal later</li><li>Verified by our team</li></ul><span class="btn primary">Start a collection</span></div></a>
    <a class="chc" href="#/create/art"><span class="chc-bg" style="background-image:url('img/submit.jpg')"></span><i class="chc-sh"></i>
      <div class="chc-in"><span class="chc-ic"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/></svg></span>
        <h2>Submit one artwork</h2><p>Send a single GTA-inspired piece. We review it, price it and add it to one of our era collections.</p><span class="btn">Submit artwork</span></div></a>
  </div>
  <div class="how glass"><h3>How launching works</h3><ol><li><b>Build it</b><span>Details, art, supply and mint stages. Saved on this device as you go.</span></li><li><b>We verify</b><span>Our team checks it is original GTA-inspired work. Usually within a day.</span></li><li><b>It goes live</b><span>Your drop appears under Drops with countdowns, then mints on your schedule.</span></li></ol></div>`;
  return { html };
}

/* ================= WIZARD ================= */
const KEY = 'gta:launch-draft';
const STEPS = [['details', 'Details'], ['art', 'Art & reveal'], ['supply', 'Supply'], ['stages', 'Mint stages'], ['review', 'Review']];
const THEMES = [['vi', 'GTA VI'], ['v', 'GTA V'], ['iv', 'GTA IV'], ['sa', 'San Andreas'], ['vice', 'Vice City'], ['other', 'Other GTA']];
const dayAt = (days, h) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(h, 0, 0, 0); return d.getTime(); };
const fresh = () => ({ step: 0, name: '', symbol: '', description: '', theme: 'vi', x: '', site: '', logo: null, banner: null, preReveal: null, revealMode: 'date', revealAt: dayAt(3, 18), supply: 500, royaltyPct: 5,
  stages: [{ id: 'st1', name: 'Allowlist', kind: 'allowlist', priceUsd: 0, start: dayAt(1, 18), end: dayAt(2, 18), perWallet: 2, allowlist: [] }, { id: 'st2', name: 'Public', kind: 'public', priceUsd: 5, start: dayAt(2, 18), end: null, perWallet: 5, allowlist: [] }], agree: false });
const load = () => { try { const d = JSON.parse(localStorage.getItem(KEY)); return d && d.stages ? { ...fresh(), ...d } : fresh(); } catch (_) { return fresh(); } };
const save = (st) => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (_) { try { localStorage.setItem(KEY, JSON.stringify({ ...st, banner: null, preReveal: null })); } catch (__) { /* storage full */ } } };
const toLocal = (t) => { if (!t) return ''; const d = new Date(t); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16); };
const fromLocal = (v) => (v ? new Date(v).getTime() : null);
const isWallet = (w) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(w);
const parseList = (txt) => [...new Set(String(txt).split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean))];
const dataUrl = (img) => (img ? `data:${img.type};base64,${img.data}` : '');

function problems(st, step) {
  const p = {};
  if (step === 0) { if (st.name.trim().length < 2) p.name = 'Give your collection a name'; if (!/^[A-Za-z0-9]{2,10}$/.test(st.symbol)) p.symbol = '2–10 letters or numbers'; if (st.description.trim().length < 20) p.description = 'Tell people about it (at least 20 characters)'; if (!st.logo) p.logo = 'Add a logo'; }
  if (step === 1) { if (st.revealMode === 'date' && (!st.revealAt || st.revealAt < Date.now())) p.revealAt = 'Pick a reveal time in the future'; }
  if (step === 2) { if (!(st.supply >= 1 && st.supply <= 10000)) p.supply = 'Between 1 and 10,000'; }
  if (step === 3) {
    if (!st.stages.length) p.stages = 'Add at least one stage';
    st.stages.forEach((s, i) => { if (!s.start) p['s' + i] = 'Set a start time'; else if (s.end && s.end <= s.start) p['s' + i] = 'The end must be after the start'; else if (s.kind === 'allowlist' && !s.allowlist.filter(isWallet).length) p['s' + i] = 'Add at least one wallet address to the allowlist'; });
  }
  if (step === 4 && !st.agree) p.agree = 'Please confirm';
  return p;
}
const err = (p, k) => (p[k] ? `<small class="ferr">${esc(p[k])}</small>` : '');
const up = (k, label, hint, img, cls = '') => `<label class="upl ${cls} ${img ? 'has' : ''}" data-up="${k}"><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden>${img ? `<img src="${dataUrl(img)}" alt="">` : ''}<span class="upl-in"><svg viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5M4 16v4h16v-4"/></svg><b>${label}</b><small>${hint}</small></span>${img ? '<span class="upl-ch">Change</span>' : ''}</label>`;

function stepHtml(st, p) {
  const s = STEPS[st.step][0];
  if (s === 'details') return `<div class="wz-ups">${up('logo', 'Logo', 'Square · 500px+', st.logo, 'sq')}${up('banner', 'Banner', 'Wide · 1400 × 500 works best', st.banner, 'wide')}</div>${err(p, 'logo')}
    <div class="fgrid"><label class="field">Name<input class="input" data-k="name" maxlength="50" value="${esc(st.name)}" placeholder="e.g. Vice Nights">${err(p, 'name')}</label>
    <label class="field">Symbol<input class="input" data-k="symbol" maxlength="10" value="${esc(st.symbol)}" placeholder="VNIGHT" style="text-transform:uppercase">${err(p, 'symbol')}</label></div>
    <label class="field">Description<textarea class="input" data-k="description" maxlength="1200" rows="4" placeholder="What is it, who made it, why collect it">${esc(st.description)}</textarea>${err(p, 'description')}</label>
    <div class="field">Theme<div class="pickrow">${THEMES.map(([k, l]) => `<button type="button" class="chip ${st.theme === k ? 'on' : ''}" data-theme="${k}">${l}</button>`).join('')}</div></div>
    <div class="fgrid"><label class="field">X / Twitter <span class="opt">optional</span><input class="input" data-k="x" value="${esc(st.x)}" placeholder="@yourhandle"></label><label class="field">Website <span class="opt">optional</span><input class="input" data-k="site" value="${esc(st.site)}" placeholder="https://"></label></div>`;
  if (s === 'art') return `<div class="wz-two"><div>${up('preReveal', 'Pre-reveal cover', 'What every mint shows before the reveal', st.preReveal, 'sq')}<p class="fine">No cover? We use your logo.</p></div>
    <div><div class="field">When do people see their real piece?</div><div class="radios">${[['instant', 'Straight away', 'Every mint is revealed as soon as it lands.'], ['date', 'On a date', 'Everyone sees the cover until the reveal time.'], ['manual', 'When I say', 'You reveal from your dashboard when the mint is done.']].map(([k, t, d]) => `<button type="button" class="rcard ${st.revealMode === k ? 'on' : ''}" data-reveal="${k}"><i></i><b>${t}</b><small>${d}</small></button>`).join('')}</div>
    ${st.revealMode === 'date' ? `<label class="field">Reveal time<input class="input" type="datetime-local" data-k="revealAt" value="${toLocal(st.revealAt)}">${err(p, 'revealAt')}</label>` : ''}</div></div>
    <div class="note2"><b>Your artwork files</b><span>Supply is the maximum your collection can ever have. You don't need every piece now: after submitting, add art from Portfolio → Launches, 10 today and more later if you like. Only you can add art, and only uploaded pieces can be minted.</span></div>`;
  if (s === 'supply') return `<div class="fgrid"><label class="field">Max supply<input class="input" type="number" min="1" max="10000" data-k="supply" value="${st.supply}">${err(p, 'supply')}<small class="fine">The most NFTs this collection can ever have. You upload the art over time.</small></label>
    <div class="field">Creator royalty · <b id="royv">${st.royaltyPct}%</b><input type="range" min="0" max="10" step="0.5" data-k="royaltyPct" value="${st.royaltyPct}" class="range"><small class="fine">You earn this on every resale.</small></div></div>`;
  if (s === 'stages') return `<p class="lede2">Stages run in order. An allowlist stage lets listed wallets mint early; the public stage opens to everyone.</p>${err(p, 'stages')}
    <div class="stl">${st.stages.map((x, i) => `<div class="sted glass" data-i="${i}"><div class="sted-h"><span class="sted-n">${i + 1}</span><input class="input bare" data-s="name" value="${esc(x.name)}" maxlength="40"><div class="seg2">${['allowlist', 'public'].map((k) => `<button type="button" data-kind="${k}" class="${x.kind === k ? 'on' : ''}">${k === 'allowlist' ? 'Allowlist' : 'Public'}</button>`).join('')}</div><button type="button" class="xbtn" data-del="${i}" aria-label="Remove stage">✕</button></div>
      <div class="fgrid3"><label class="field">Price (USD)<div class="pfx"><input class="input" type="number" min="0" step="0.01" data-s="priceUsd" value="${x.priceUsd}"><span>${x.priceUsd ? '≈ ' + solTxt(solOf(x.priceUsd)) : 'Free'}</span></div></label>
      <label class="field">Starts<input class="input" type="datetime-local" data-s="start" value="${toLocal(x.start)}"></label><label class="field">Ends <span class="opt">${x.kind === 'public' ? 'optional' : ''}</span><input class="input" type="datetime-local" data-s="end" value="${toLocal(x.end)}"></label></div>
      <div class="fgrid"><div class="field">Max per wallet<div class="qty"><button type="button" data-pw="-1">−</button><b>${x.perWallet}</b><button type="button" data-pw="1">+</button></div></div>
      ${x.kind === 'allowlist' ? `<label class="field">Allowlist wallets · <b>${x.allowlist.filter(isWallet).length}</b> valid<textarea class="input mono" data-s="allowlist" rows="3" placeholder="Paste wallet addresses, one per line or comma separated">${esc(x.allowlist.join('\n'))}</textarea></label>` : '<div class="field">Who can mint<div class="pill2">Everyone</div></div>'}</div>${err(p, 's' + i)}</div>`).join('')}</div>
    ${st.stages.length < 6 ? '<div class="addst"><button type="button" class="btn" data-add="allowlist">+ Allowlist stage</button><button type="button" class="btn" data-add="public">+ Public stage</button></div>' : ''}`;
  const t = THEMES.find(([k]) => k === st.theme);
  return `<div class="rvw"><dl><dt>Name</dt><dd>${esc(st.name)} <span class="muted">${esc(st.symbol.toUpperCase())}</span></dd><dt>Theme</dt><dd>${t ? t[1] : ''}</dd><dt>Max supply</dt><dd>${(+st.supply).toLocaleString()}</dd><dt>Royalty</dt><dd>${st.royaltyPct}%</dd>
    <dt>Reveal</dt><dd>${st.revealMode === 'instant' ? 'Straight away' : st.revealMode === 'manual' ? 'When you say' : new Date(st.revealAt).toLocaleString()}</dd></dl>
    <div class="rvw-st">${st.stages.map((x) => `<div><b>${esc(x.name)}</b><span>${x.kind === 'allowlist' ? x.allowlist.filter(isWallet).length + ' wallets' : 'Everyone'} · ${priceTxt(x.priceUsd)} · ${x.perWallet}/wallet</span><small>${new Date(x.start).toLocaleString()}${x.end ? ' → ' + new Date(x.end).toLocaleString() : ''}</small></div>`).join('')}</div>
    <label class="agree"><input type="checkbox" data-k="agree" ${st.agree ? 'checked' : ''}><span>This is original GTA-inspired fan art I have the right to publish. I understand GTA Marketplace verifies every collection before it goes live.</span></label>${err(p, 'agree')}</div>`;
}
function preview(st) {
  const s = st.stages[0], t = s && s.start ? s.start - Date.now() : 0;
  return `<div class="dcard pv"><span class="dc-ban">${st.banner || st.logo ? `<img src="${dataUrl(st.banner || st.logo)}" alt="">` : '<i class="ph-ban"></i>'}<span class="dchip soon">Upcoming</span></span>
    <div class="dc-in"><span class="dc-logo">${st.logo ? `<img src="${dataUrl(st.logo)}" alt="">` : ''}</span><b class="dc-nm">${esc(st.name || 'Your collection')}${tick}</b><small class="dc-by">by ${S.wallet ? short(S.wallet) : 'you'}</small>
    <div class="dc-row"><span><small>Price</small><b>${s ? priceTxt(s.priceUsd) : '—'}</b></span><span><small>Items</small><b>${(+st.supply || 0).toLocaleString()}</b></span><span class="dtm">Starts in <b>${cd(t)}</b></span></div>
    <div class="dprog"><div class="dpb"><i style="width:0"></i></div><span><b>0</b> / ${(+st.supply || 0).toLocaleString()} minted</span><span>0%</span></div></div></div>`;
}

export async function launchWizard() {
  if (!S.wallet) return { html: `<div class="ph2"><div><span class="eyebrow">Launch a collection</span><h1 class="display">Connect to <span class="grad">start.</span></h1></div></div><div class="empty"><b>Sign in with your wallet</b>Your collection and its earnings are tied to it.<br><button class="btn primary" id="gw" style="margin-top:16px">Connect wallet</button></div>`, mount: (root) => { $('#gw', root).onclick = walletModal; } };
  const st = load(); let shown = {};
  const html = `<div class="wz"><div class="wz-top"><a class="rbtn" href="#/create" aria-label="Back"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></a><div><span class="eyebrow">Launch a collection</span><h1 id="wz-t"></h1></div><button class="btn sm ghost" id="wz-reset">Start over</button></div>
    <ol class="wz-steps" id="wz-steps"></ol>
    <div class="wz-grid"><div class="wz-body glass" id="wz-body"></div><aside class="wz-pv"><small class="eyebrow">Live preview</small><div id="wz-pv"></div></aside></div>
    <div class="wz-foot"><button class="btn" id="wz-back">Back</button><span id="wz-saved" class="muted">Draft saved</span><button class="btn primary" id="wz-next">Next</button></div></div>`;
  return {
    html,
    mount(root) {
      const body = $('#wz-body', root), pv = $('#wz-pv', root);
      const paint = (dir) => {
        $('#wz-t', root).textContent = STEPS[st.step][1];
        $('#wz-steps', root).innerHTML = STEPS.map(([k, l], i) => `<li class="${i < st.step ? 'done' : i === st.step ? 'on' : ''}" data-go="${i}"><i>${i < st.step ? '✓' : i + 1}</i><span>${l}</span></li>`).join('');
        body.innerHTML = stepHtml(st, shown);
        if (dir) { body.style.setProperty('--dx', dir > 0 ? '28px' : '-28px'); body.classList.remove('wz-in'); void body.offsetWidth; body.classList.add('wz-in'); }
        pv.innerHTML = preview(st);
        $('#wz-back', root).style.visibility = st.step ? 'visible' : 'hidden';
        $('#wz-next', root).textContent = st.step === STEPS.length - 1 ? 'Submit for verification' : 'Next';
      };
      const persist = () => { save(st); const sv = $('#wz-saved', root); sv.textContent = 'Draft saved'; sv.classList.remove('blink'); void sv.offsetWidth; sv.classList.add('blink'); pv.innerHTML = preview(st); };
      const go = (to) => { if (to > st.step) { for (let i = st.step; i < to; i++) { const p = problems(st, i); if (Object.keys(p).length) { st.step = i; shown = p; paint(); toast(Object.values(p)[0], 'bad'); return; } } } const dir = to - st.step; st.step = to; shown = {}; save(st); paint(dir); scrollTo({ top: 0, behavior: 'smooth' }); };
      body.addEventListener('input', (e) => {
        const el = e.target, k = el.dataset.k, sk = el.dataset.s;
        if (k) {
          if (k === 'agree') st.agree = el.checked;
          else if (k === 'revealAt') st.revealAt = fromLocal(el.value);
          else if (k === 'supply' || k === 'royaltyPct') { st[k] = +el.value; if (k === 'royaltyPct') $('#royv', root).textContent = el.value + '%'; }
          else st[k] = el.value;
          if (k === 'name' && !st.symbolTouched) { st.symbol = el.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase(); const sy = $('[data-k="symbol"]', body); if (sy) sy.value = st.symbol; }
          if (k === 'symbol') { st.symbolTouched = true; st.symbol = el.value.toUpperCase(); }
          persist(); return;
        }
        if (sk) {
          const i = +el.closest('[data-i]').dataset.i, x = st.stages[i];
          if (sk === 'priceUsd') { x.priceUsd = Math.max(0, +el.value || 0); const span = el.parentElement.querySelector('span'); if (span) span.textContent = x.priceUsd ? '≈ ' + solTxt(solOf(x.priceUsd)) : 'Free'; }
          else if (sk === 'start' || sk === 'end') x[sk] = fromLocal(el.value);
          else if (sk === 'allowlist') { x.allowlist = parseList(el.value); const lab = el.closest('label').querySelector('b'); if (lab) lab.textContent = x.allowlist.filter(isWallet).length; }
          else x[sk] = el.value;
          persist();
        }
      });
      body.addEventListener('click', (e) => {
        const th = e.target.closest('[data-theme]'), rv = e.target.closest('[data-reveal]'), kd = e.target.closest('[data-kind]'), del = e.target.closest('[data-del]'), add = e.target.closest('[data-add]'), pw = e.target.closest('[data-pw]');
        if (th) { st.theme = th.dataset.theme; $$('[data-theme]', body).forEach((b) => b.classList.toggle('on', b === th)); persist(); }
        else if (rv) { st.revealMode = rv.dataset.reveal; persist(); paint(); }
        else if (kd) { const x = st.stages[+kd.closest('[data-i]').dataset.i]; x.kind = kd.dataset.kind; if (x.name === 'Allowlist' || x.name === 'Public') x.name = x.kind === 'allowlist' ? 'Allowlist' : 'Public'; persist(); paint(); }
        else if (del) { st.stages.splice(+del.dataset.del, 1); persist(); paint(); }
        else if (add) { const last = st.stages[st.stages.length - 1], start = last ? (last.end || last.start + 864e5) : dayAt(1, 18); st.stages.push({ id: 'st' + Date.now().toString(36), name: add.dataset.add === 'allowlist' ? 'Allowlist' : 'Public', kind: add.dataset.add, priceUsd: 0, start, end: add.dataset.add === 'allowlist' ? start + 864e5 : null, perWallet: 2, allowlist: [] }); persist(); paint(); }
        else if (pw) { const x = st.stages[+pw.closest('[data-i]').dataset.i]; x.perWallet = Math.max(1, Math.min(100, x.perWallet + +pw.dataset.pw)); pw.parentElement.querySelector('b').textContent = x.perWallet; persist(); }
      });
      body.addEventListener('change', async (e) => {
        const box = e.target.closest('[data-up]'); if (!box || !e.target.files || !e.target.files[0]) return;
        const k = box.dataset.up, f = e.target.files[0];
        if (!/^image\//.test(f.type)) return toast('Please choose an image', 'bad');
        try { st[k] = await shrinkImage(f, k === 'banner' ? 1600 : k === 'logo' ? 600 : 1200, 0.85); persist(); paint(); } catch (x) { toast(x.message, 'bad'); }
      });
      $('#wz-steps', root).addEventListener('click', (e) => { const li = e.target.closest('[data-go]'); if (li && +li.dataset.go < st.step) go(+li.dataset.go); });
      $('#wz-back', root).onclick = () => st.step && go(st.step - 1);
      $('#wz-reset', root).onclick = () => { if (!confirm('Clear this draft and start over?')) return; Object.assign(st, fresh()); save(st); shown = {}; paint(); };
      $('#wz-next', root).onclick = async () => {
        if (st.step < STEPS.length - 1) return go(st.step + 1);
        for (let i = 0; i < STEPS.length; i++) { const p = problems(st, i); if (Object.keys(p).length) { st.step = i; shown = p; paint(); return toast(Object.values(p)[0], 'bad'); } }
        const btn = $('#wz-next', root); btn.disabled = true; btn.textContent = 'Submitting…';
        try {
          const payload = { name: st.name.trim(), symbol: st.symbol.toUpperCase(), description: st.description.trim(), theme: st.theme, links: { x: st.x.trim() || undefined, site: st.site.trim() || undefined }, logo: st.logo, banner: st.banner, preReveal: st.preReveal,
            revealMode: st.revealMode, revealAt: st.revealMode === 'date' ? st.revealAt : null, supply: +st.supply, royaltyPct: +st.royaltyPct,
            stages: st.stages.map((x) => ({ id: x.id, name: x.name, kind: x.kind, priceUsd: +x.priceUsd || 0, start: x.start, end: x.end || null, perWallet: x.perWallet, allowlist: x.kind === 'allowlist' ? x.allowlist.filter(isWallet) : [] })) };
          const r = await http('POST', '/launches', payload);
          localStorage.removeItem(KEY);
          root.innerHTML = `<div class="ldone glass"><span class="ldone-ic">✓</span><h1 class="display">Sent for <span class="grad">verification.</span></h1><p><b>${esc(r.launch.name)}</b> is in review. We check it is original GTA-inspired art, then it goes live under Drops on your schedule. You'll get a notification either way.</p>
            <ol class="ldone-steps"><li class="ok">Submitted</li><li class="on">In review</li><li>Live on Drops</li></ol><div class="cta"><a class="btn primary" href="#/me/launches">See my launches</a><a class="btn" href="#/drops">Browse drops</a></div></div>`;
        } catch (x) { toast(x.message, 'bad'); btn.disabled = false; btn.textContent = 'Submit for verification'; }
      };
      paint();
    }
  };
}
