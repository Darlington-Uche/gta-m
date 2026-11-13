import { S, on, $, $$, esc, init, short, toast, walletModal, toggleLike, ls, signOut } from './core.js';
import { enhance, burst } from './fx.js';
import { homeView as home, explore, artwork, collections, collection } from './views.js';
import { create, profile } from './me.js';

const ic = {
  home: '<svg viewBox="0 0 24 24"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>',
  explore: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/></svg>',
  cols: '<svg viewBox="0 0 24 24"><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/></svg>',
  create: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="5"/><path d="M12 8v8M8 12h8"/></svg>',
  me: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/></svg>',
};
const NAV = [['/', 'Home', ic.home], ['/explore', 'Explore', ic.explore], ['/collections', 'Eras', ic.cols], ['/create', 'Submit', ic.create], ['/me', 'Profile', ic.me]];
const routes = [
  [/^\/?$/, home], [/^\/explore$/, explore], [/^\/art\/(.+)$/, artwork], [/^\/collections$/, collections], [/^\/collection\/(.+)$/, collection],
  [/^\/create$/, create], [/^\/me(?:\/(\w+))?$/, profile]
];

function chrome() {
  const here = (location.hash.slice(1) || '/').split('?')[0];
  const active = (h) => (h === '/' ? here === '/' : here.startsWith(h) || (h === '/collections' && here.startsWith('/collection')));
  const badge = S.unread ? `<span class="badge">${S.unread}</span>` : '';
  $('#hd').innerHTML = `<a class="brand" href="#/" aria-label="GTA Marketplace"><b>GTA</b><i>Marketplace</i></a>
    <nav class="links">${NAV.filter(([h]) => h !== '/' && h !== '/me').map(([h, l]) => `<a href="#${h}" class="${active(h) ? 'on' : ''}">${l}</a>`).join('')}</nav>
    <div class="acct"><span class="net ${S.meta && S.meta.isMainnet ? 'main' : ''}">${S.meta ? S.meta.network === 'devnet' ? 'Devnet' : 'Mainnet' : ''}</span>${S.wallet ? `<a class="chipb" href="#/me"><i class="dot"></i>${short(S.wallet)}${badge}</a>` : '<button class="btn primary sm" id="cw">Connect wallet</button>'}</div>`;
  const an = S.site && S.site.announcement; let bar = $('#ann'); if (an) { if (!bar) { bar = document.createElement('div'); bar.id = 'ann'; document.body.prepend(bar); } bar.textContent = an; } else if (bar) bar.remove();
  $('#dock').innerHTML = NAV.map(([h, l, i]) => `<a href="#${h}" class="${active(h) ? 'on' : ''}">${i}${l}${h === '/me' ? badge : ''}</a>`).join('');
  const cw = $('#cw'); if (cw) cw.onclick = walletModal;
}

/* Full-bleed backdrop per page. Images uploaded in the admin (Site & banners / collection banner) replace the built-in ones. */
let bdCur = '', bdFlip = 0;
const BD = { // built-in backdrops: [image, desktop focus, mobile focus]
  home: ['img/hero.jpg', '60% 35%', '70% 20%'], explore: ['img/explore.jpg', '50% 22%', '72% 20%'], eras: ['img/eras.jpg', '50% 18%', '58% 15%'],
  create: ['img/submit.jpg', '100% 12%', '88% 10%'], me: ['img/crew.jpg', '50% 16%', '50% 12%']
};
function backdrop(path) {
  const site = S.site || {}, b = site.banners || {}; let key = '', custom = '';
  if (path === '/' || path === '') { key = 'home'; custom = site.heroImage; }
  else if (path === '/explore') { key = 'explore'; custom = b.explore; }
  else if (path === '/collections') { key = 'eras'; custom = b.eras; }
  else if (path.startsWith('/collection/')) { const c = S.collections.find((x) => x.id === decodeURIComponent(path.split('/')[2])); key = 'eras'; custom = (c && (c.banner || c.cover)) || b.eras; }
  else if (path === '/create') { key = 'create'; custom = b.create; }
  else if (path.startsWith('/me')) key = 'me';
  const el = $('#backdrop'); if (!el) return;
  const d = BD[key], url = custom || (d ? d[0] : '');
  el.className = url ? 'on' + (key === 'home' ? ' tall' : '') : '';
  if (url === bdCur) return; bdCur = url;
  const layers = $$('i', el); bdFlip ^= 1; const next = layers[bdFlip], prev = layers[bdFlip ^ 1];
  next.classList.remove('fit'); next.dataset.ar = '';
  if (url) {
    const u = `url('${url.replace(/'/g, '%27')}')`;
    next.style.backgroundImage = u; next.style.setProperty('--bi', u);
    next.style.setProperty('--pos', custom || !d ? 'center 25%' : d[1]); next.style.setProperty('--mpos', custom || !d ? 'center 20%' : d[2]);
    if (custom) { const im = new Image(); im.onload = () => { if (bdCur !== url) return; next.dataset.ar = im.naturalWidth / im.naturalHeight; fitBackdrop(); }; im.src = url; }
  }
  next.classList.toggle('on', !!url); prev.classList.remove('on');
}
/* Uploaded images can have any shape. When "cover" would cut away a big part of one on this screen, show it whole
   (contained) over a blurred copy of itself instead. Re-checked on resize / rotation. */
function fitBackdrop() {
  const el = $('#backdrop'); if (!el) return;
  $$('i', el).forEach((i) => {
    const ar = +i.dataset.ar; if (!ar) { i.classList.remove('fit'); return; }
    const box = el.clientWidth / Math.max(1, el.clientHeight), keep = Math.min(ar, box) / Math.max(ar, box); // share of the image left visible with cover
    i.classList.toggle('fit', keep < 0.7);
  });
}
addEventListener('resize', () => { clearTimeout(fitBackdrop.t); fitBackdrop.t = setTimeout(fitBackdrop, 150); });

let tok = 0, cleanup = null, lastPath = '';
async function render() {
  const my = ++tok; const hash = location.hash.slice(1) || '/'; const [path, query] = hash.split('?'); const q = Object.fromEntries(new URLSearchParams(query || ''));
  chrome(); backdrop(path);
  const main = $('#main');
  const hit = routes.map(([re, fn]) => [re.exec(path), fn]).find(([m]) => m);
  if (cleanup) { try { cleanup(); } catch (e) { /* ignore */ } cleanup = null; }
  const fill = (html, mount) => { if (my !== tok) return; const keep = path.startsWith('/me') && lastPath.startsWith('/me'); const y = scrollY; main.innerHTML = `<div class="view">${html}</div>`; window.scrollTo(0, keep ? y : 0); lastPath = path; document.title = (document.querySelector('.view h1') ? document.querySelector('.view h1').textContent.trim() + ' — ' : '') + 'GTA Market'; if (mount) cleanup = mount(main) || null; enhance(main); };
  if (!hit) return fill(`<div class="empty"><b>Wrong turn</b>That page doesn't exist. <a class="accent" href="#/">Back to start</a></div>`);
  if (!S.online) return fill(`<div class="empty"><b>Offline</b>The server is not reachable${S.initError ? ': ' + esc(S.initError) : ''}. <a class="accent" href="">Try again</a></div>`);
  try { const r = await hit[1]({ args: hit[0].slice(1), q }); if (typeof r === 'string') fill(r); else fill(r.html, r.mount); }
  catch (e) { console.error(e); fill(`<div class="empty"><b>Could not load</b>${esc(e.message)}</div>`); }
}
const go = () => { if (document.startViewTransition) document.startViewTransition(render); else render(); };
window.addEventListener('hashchange', go);

document.addEventListener('click', async (e) => {
  const like = e.target.closest('[data-like]');
  if (like) {
    e.preventDefault(); e.stopPropagation(); if (like.dataset.busy) return; like.dataset.busy = '1';
    if (!like.classList.contains('on')) burst(like);
    try { const r = await toggleLike(like.dataset.like); $$(`[data-like="${CSS.escape(like.dataset.like)}"]`).forEach((b) => { b.classList.toggle('on', r.liked); const s = $('span', b); if (s) s.textContent = r.likes; }); }
    catch (err) { toast(err.message, 'bad'); } finally { delete like.dataset.busy; }
  }
}, true);
on('auth', () => { chrome(); go(); }); on('unread', chrome);
window.addEventListener('gta:signout', () => signOut());

(async () => {
  await init();
  if (!location.hash) history.replaceState(null, '', '#/');
  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.update().catch(() => {}))).catch(() => {});
})();
