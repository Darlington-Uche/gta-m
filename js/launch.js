// Create studio: the page looks like the finished collection. Tap a placeholder to fill it.
// Banner, logo, name, art grid (+ rarity), one mint phase. Launch = draft → upload art → publish.
import { S, $, $$, esc, usd, short, http, toast, walletModal, shrinkImage } from './core.js';

const KEY = 'gta:studio';
const MIN = 10;
const RAR = ['Common', 'Rare', 'Epic', 'Legendary'];
const START = [['now', 'Now', 0], ['1h', 'In 1h', 36e5], ['tmr', 'Tomorrow', null]];
const LAST = [1, 24, 72, 168];
const lastLbl = (h) => (h < 24 ? h + 'h' : h / 24 + 'd');
const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(18, 0, 0, 0); return d.getTime(); };
const solOf = (u) => { const r = S.meta && S.meta.solUsd; return r && u ? u / r : null; };
const ic = {
  img: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M4 4l16 16M20 4L4 20"/></svg>',
  cam: '<svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  rocket: '<svg viewBox="0 0 24 24"><path d="M12 3c3 2 5 5.5 5 9.5L15 16H9l-2-3.5C7 8.5 9 5 12 3z"/><circle cx="12" cy="10" r="1.6"/><path d="M9 16l-2 4 3-1.5M15 16l2 4-3-1.5"/></svg>',
  tag: '<svg viewBox="0 0 24 24"><path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>',
  user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  hour: '<svg viewBox="0 0 24 24"><path d="M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9"/></svg>'
};
const load = () => { try { return { name: '', desc: '', x: '', price: 0, paid: false, per: 3, start: 'now', hours: 24, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch (_) { return { name: '', desc: '', x: '', price: 0, paid: false, per: 3, start: 'now', hours: 24 }; } };
const save = (st) => { try { localStorage.setItem(KEY, JSON.stringify({ name: st.name, desc: st.desc, x: st.x, price: st.price, paid: st.paid, per: st.per, start: st.start, hours: st.hours })); } catch (_) { /* full */ } };

export async function createHub(ctx) { return launchWizard(ctx); }

export async function launchWizard({ q = {} } = {}) {
  if (!S.wallet) return { html: `<div class="studio-gate glass"><span class="sg-ic">${ic.rocket}</span><h1 class="display">Launch your <span class="grad">collection</span></h1><button class="btn primary lg" id="gw">Connect wallet</button><a class="lnk2" href="#/create/art">or send one artwork</a></div>`, mount: (root) => { $('#gw', root).onclick = walletModal; } };
  const st = load(); st.logo = null; st.banner = null; st.art = []; st.draft = null;
  if (q.draft) {
    const l = ((await http('GET', '/me/launches')).launches || []).find((x) => x.id === q.draft && x.status === 'draft');
    if (l) Object.assign(st, { draft: l.id, name: l.name, desc: l.description || '', x: (l.links && l.links.x) || '', logo: { url: l.logo, server: true }, banner: { url: l.banner, server: true }, art: (l.art || []).map((a) => ({ url: a.url, rarity: a.rarity || 'Common', server: true })) });
  }
  const me = S.profile || {};
  const html = `<div class="studio">
    <div class="sd-top"><a class="rbtn" href="#/" aria-label="Back"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></a>
      <div class="sd-seg"><a class="on" href="#/create">${ic.rocket}Collection</a><a href="#/create/art">${ic.img}One art</a></div></div>
    <label class="sd-ban" id="ban"><input type="file" accept="image/*" hidden data-up="banner"><span class="ph">${ic.img}<b>Banner</b></span></label>
    <div class="sd-id"><label class="sd-logo" id="logo"><input type="file" accept="image/*" hidden data-up="logo"><span class="ph">${ic.cam}</span></label>
      <div class="sd-nm"><input id="nm" maxlength="50" placeholder="Name it" value="${esc(st.name)}" autocomplete="off"><small>by ${esc(me.name || (me.username ? '@' + me.username : short(S.wallet)))}</small></div></div>
    <textarea id="ds" class="sd-ds" rows="1" maxlength="600" placeholder="Say something about it…">${esc(st.desc)}</textarea>
    <label class="sd-x"><svg viewBox="0 0 24 24"><path d="M4 4l16 16M20 4L4 20"/></svg><input id="xh" maxlength="60" placeholder="@handle" value="${esc(st.x)}"></label>

    <div class="sd-h"><b>Artworks</b><span class="sd-cnt" id="cnt"></span></div>
    <div class="sd-bar"><i id="artbar"></i></div>
    <div class="sd-grid" id="grid"></div>
    <div class="sd-leg">${RAR.map((r) => `<span><i class="rd ${r.toLowerCase()}"></i>${r}</span>`).join('')}<em>tap a piece to change</em></div>

    <div class="sd-h"><b>Mint</b></div>
    <div class="sd-mint glass">
      <div class="mrow"><span class="ml">${ic.tag}</span><div class="seg3" id="pm"><button data-p="0" class="${st.paid ? '' : 'on'}">Free</button><button data-p="1" class="${st.paid ? 'on' : ''}">Paid</button></div>
        <label class="usd ${st.paid ? '' : 'off'}" id="pwrap">$<input id="pr" type="number" min="0.5" step="0.5" value="${st.price || ''}" placeholder="5"><em id="prs"></em></label></div>
      <div class="mrow"><span class="ml">${ic.user}</span><span class="mt">Per wallet</span><div class="qty"><button data-per="-1">−</button><b id="per">${st.per}</b><button data-per="1">+</button></div></div>
      <div class="mrow"><span class="ml">${ic.clock}</span><div class="chips3" id="sts">${START.map(([k, l]) => `<button data-s="${k}" class="${st.start === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div class="mrow"><span class="ml">${ic.hour}</span><div class="chips3" id="hrs">${LAST.map((h) => `<button data-h="${h}" class="${st.hours === h ? 'on' : ''}">${lastLbl(h)}</button>`).join('')}</div></div>
    </div>
    <div class="sd-foot"><div class="chk" id="chk"></div><button class="btn primary lg" id="go">${ic.rocket}<span>Launch</span></button></div></div>`;
  return {
    html,
    mount(root) {
      const grid = $('#grid', root);
      const pic = (box, img) => { box.classList.toggle('has', !!img); const old = box.querySelector('img'); if (old) old.remove(); if (img) { const i = new Image(); i.src = img.url; i.alt = ''; box.prepend(i); } };
      const check = () => [['banner', !!st.banner], ['logo', !!st.logo], ['name', st.name.trim().length >= 2], ['art', st.art.length >= MIN]];
      const paintChk = () => {
        const c = check(), ok = c.every(([, v]) => v);
        $('#chk', root).innerHTML = c.map(([k, v]) => `<i class="${v ? 'ok' : ''}" title="${k}">${{ banner: ic.img, logo: ic.cam, name: '<b>Aa</b>', art: '<b>' + Math.min(st.art.length, MIN) + '</b>' }[k]}</i>`).join('');
        $('#go', root).classList.toggle('ready', ok);
        $('#cnt', root).innerHTML = st.art.length < MIN ? `<b>${st.art.length}</b>/${MIN} min` : `<b>${st.art.length}</b> pieces`;
        $('#artbar', root).style.width = Math.min(100, (st.art.length / MIN) * 100) + '%';
      };
      const paintGrid = () => {
        const tiles = st.art.map((a, i) => `<div class="sd-t" data-i="${i}"><img src="${esc(a.url)}" alt=""><i class="rd ${a.rarity.toLowerCase()}"></i>${a.server ? '' : `<button class="sd-del" data-del="${i}" aria-label="Remove">${ic.x}</button>`}</div>`).join('');
        const empties = Math.max(0, MIN - st.art.length - 1);
        grid.innerHTML = `<label class="sd-add"><input type="file" accept="image/*" multiple hidden data-up="art">${ic.plus}<span>Add</span></label>${tiles}${'<div class="sd-t ghost"></div>'.repeat(empties)}`;
        paintChk();
      };
      const priceSol = () => { const v = +$('#pr', root).value; $('#prs', root).textContent = st.paid && v && solOf(v) ? '≈ ' + solOf(v).toFixed(3) + ' SOL' : ''; };
      pic($('#ban', root), st.banner); pic($('#logo', root), st.logo); paintGrid(); priceSol();
      const persist = () => { save(st); paintChk(); };
      root.addEventListener('input', (e) => {
        const id = e.target.id;
        if (id === 'nm') st.name = e.target.value; else if (id === 'ds') { st.desc = e.target.value; e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }
        else if (id === 'xh') st.x = e.target.value; else if (id === 'pr') { st.price = +e.target.value || 0; priceSol(); }
        persist();
      });
      root.addEventListener('change', async (e) => {
        const k = e.target.dataset.up; if (!k || !e.target.files.length) return;
        if (st.draft && (k === 'logo' || k === 'banner')) return toast('Logo and banner are set for this draft');
        try {
          if (k === 'art') {
            for (const f of [...e.target.files].slice(0, 500 - st.art.length)) { if (!/^image\//.test(f.type)) continue; const img = await shrinkImage(f, 1600, 0.88); st.art.push({ url: `data:${img.type};base64,${img.data}`, img, rarity: 'Common' }); }
            paintGrid(); grid.lastElementChild && grid.querySelector('.sd-t:last-of-type')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          } else { const img = await shrinkImage(e.target.files[0], k === 'banner' ? 1800 : 600, 0.88); st[k] = { url: `data:${img.type};base64,${img.data}`, img }; pic($(k === 'banner' ? '#ban' : '#logo', root), st[k]); paintChk(); }
        } catch (x) { toast(x.message, 'bad'); }
        e.target.value = '';
      });
      root.addEventListener('click', (e) => {
        const del = e.target.closest('[data-del]'); if (del) { e.stopPropagation(); st.art.splice(+del.dataset.del, 1); return paintGrid(); }
        const t = e.target.closest('.sd-t[data-i]'); if (t) { const a = st.art[+t.dataset.i]; if (a.server) return; a.rarity = RAR[(RAR.indexOf(a.rarity) + 1) % RAR.length]; const d = t.querySelector('.rd'); d.className = 'rd ' + a.rarity.toLowerCase(); t.classList.remove('pop'); void t.offsetWidth; t.classList.add('pop'); return; }
        const pm = e.target.closest('[data-p]'); if (pm) { st.paid = pm.dataset.p === '1'; $$('#pm button', root).forEach((b) => b.classList.toggle('on', b === pm)); $('#pwrap', root).classList.toggle('off', !st.paid); if (st.paid) $('#pr', root).focus(); priceSol(); return persist(); }
        const per = e.target.closest('[data-per]'); if (per) { st.per = Math.max(1, Math.min(50, st.per + +per.dataset.per)); $('#per', root).textContent = st.per; return persist(); }
        const s = e.target.closest('[data-s]'); if (s) { st.start = s.dataset.s; $$('#sts button', root).forEach((b) => b.classList.toggle('on', b === s)); return persist(); }
        const h = e.target.closest('[data-h]'); if (h) { st.hours = +h.dataset.h; $$('#hrs button', root).forEach((b) => b.classList.toggle('on', b === h)); return persist(); }
      });
      $('#go', root).onclick = async () => {
        const miss = check().find(([, v]) => !v);
        if (miss) { const where = { banner: '#ban', logo: '#logo', name: '#nm', art: '#grid' }[miss[0]]; const el = $(where, root); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.remove('nudge'); void el.offsetWidth; el.classList.add('nudge'); if (miss[0] === 'name') el.focus(); return; }
        if (st.paid && !(st.price >= 0.5)) { $('#pr', root).focus(); return toast('Set a price', 'bad'); }
        const mint = { priceUsd: st.paid ? st.price : 0, perWallet: st.per, start: st.start === 'now' ? Date.now() : st.start === '1h' ? Date.now() + 36e5 : tomorrow(), hours: st.hours };
        const todo = st.art.filter((a) => !a.server);
        const ov = document.createElement('div'); ov.className = 'sd-up'; ov.innerHTML = `<div class="sd-up-in glass"><div class="ring"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52"/><circle class="v" cx="60" cy="60" r="52" pathLength="100"/></svg><b id="upn">0%</b></div><div class="upthumbs" id="upt"></div></div>`;
        document.body.appendChild(ov); requestAnimationFrame(() => ov.classList.add('on'));
        const set = (k, n) => { const p = Math.round((k / Math.max(1, n)) * 100); ov.querySelector('.v').style.strokeDashoffset = 100 - p; $('#upn', ov).textContent = p + '%'; };
        try {
          let id = st.draft;
          if (!id) { id = (await http('POST', '/launches', { name: st.name.trim(), description: st.desc.trim() || undefined, links: { x: st.x.trim() || undefined }, logo: st.logo.img, banner: st.banner.img, mint })).launch.id; st.draft = id; }
          for (let i = 0; i < todo.length; i++) { await http('POST', `/launches/${id}/art`, { file: todo[i].img, rarity: todo[i].rarity }); todo[i].server = true; set(i + 1, todo.length + 1); const t = new Image(); t.src = todo[i].url; $('#upt', ov).prepend(t); }
          await http('POST', `/launches/${id}/publish`, { mint }); set(1, 1);
          localStorage.removeItem(KEY);
          ov.querySelector('.sd-up-in').innerHTML = `<span class="done-ic2">${ic.rocket}</span><h2 class="display">Live!</h2><a class="btn primary lg" href="#/drop/${encodeURIComponent(id)}">See your drop</a>`;
          ov.onclick = (e) => { if (e.target.closest('a')) ov.remove(); };
        } catch (x) { ov.remove(); paintGrid(); toast(x.message + (st.draft ? ' — saved as a draft in Portfolio' : ''), 'bad'); }
      };
      const ds = $('#ds', root); ds.style.height = ds.scrollHeight + 'px';
    }
  };
}
