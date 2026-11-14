import { S, on, $, $$, esc, init, short, toast, walletModal, toggleLike, ls, signOut, hydrateNames } from './core.js';
import { enhance, burst } from './fx.js';
import { explore as browse, artwork, collections } from './views.js';
import { exploreHub as explore } from './explore.js';
import { collection } from './collection.js';
import { homeView as home } from './home.js';
import { create as createArt, profile } from './me.js';
import { dropsHub, dropPage } from './drops.js';
import { createHub, launchWizard } from './launch.js';

const ic = {
  home: '<svg viewBox="0 0 24 24"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>',
  explore: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/></svg>',
  cols: '<svg viewBox="0 0 24 24"><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/></svg>',
  create: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="5"/><path d="M12 8v8M8 12h8"/></svg>',
  drops: '<svg viewBox="0 0 24 24"><path d="M12 3c3 2 5 5.5 5 9.5L15 16H9l-2-3.5C7 8.5 9 5 12 3z"/><circle cx="12" cy="10" r="1.6"/><path d="M9 16l-2 4 3-1.5M15 16l2 4-3-1.5"/></svg>',
  wallet: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 10h18"/><path d="M7 6l9-3 1 3"/><circle cx="16.5" cy="14.5" r="1.2"/></svg>',
  me: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/></svg>',
};
const NAV = [['/', 'Home', ic.home], ['/explore', 'Explore', ic.explore], ['/drops', 'Drops', ic.drops], ['/create', 'Create', ic.create], ['/me', 'Portfolio', ic.wallet]];
const routes = [
  [/^\/?$/, home], [/^\/explore$/, explore], [/^\/browse$/, browse], [/^\/art\/(.+)$/, artwork], [/^\/collections$/, collections], [/^\/collection\/(.+)$/, collection],
  [/^\/drops$/, dropsHub], [/^\/drop\/(.+)$/, dropPage], [/^\/create$/, createHub], [/^\/create\/art$/, createArt], [/^\/create\/collection$/, launchWizard], [/^\/me(?:\/(\w+))?$/, profile]
];

function chrome() {
  const here = (location.hash.slice(1) || '/').split('?')[0];
  const active = (h) => (h === '/' ? here === '/' : here.startsWith(h) || ((h === '/explore' && (here === '/browse' || here.startsWith('/collection'))) || (h === '/drops' && here.startsWith('/drop'))));
  const badge = S.unread ? `<span class="badge">${S.unread}</span>` : '';
  $('#hd').innerHTML = `<a class="brand" href="#/" aria-label="GTA Marketplace"><b>GTA</b><i>Marketplace</i></a>
    <nav class="links">${NAV.filter(([h]) => h !== '/' && h !== '/me').map(([h, l]) => `<a href="#${h}" class="${active(h) ? 'on' : ''}">${l}</a>`).join('')}</nav>
    <div class="acct"><span class="net ${S.meta && S.meta.isMainnet ? 'main' : ''}">${S.meta ? S.meta.network === 'devnet' ? 'Devnet' : 'Mainnet' : ''}</span>${S.wallet
      ? `<a class="me-chip" href="#/me">${S.avatar ? `<i class="avt"><img src="${esc(S.avatar)}" alt=""></i>` : `<i class="avt" style="--h:${[...String(S.wallet||'x')].reduce((h,c)=>(h*31+c.charCodeAt(0))%360,7)}">${esc(((S.profile && S.profile.name) || S.username || S.wallet)[0].toUpperCase())}</i>`}<span><b>${esc((S.profile && S.profile.name) || (S.username ? '@' + S.username : short(S.wallet)))}</b><small>Portfolio</small></span></a>`
      : '<button class="me-chip" id="cw"><i class="avt ghost"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/></svg></i><span><b>Connect</b><small>wallet</small></span></button>'}<a class="bell" href="#/me/notifications" aria-label="Notifications"><svg viewBox="0 0 24 24"><path d="M6 9a6 6 0 0112 0c0 6 2 7 2 7H4s2-1 2-7"/><path d="M10 20a2 2 0 004 0"/></svg>${S.unread ? '<i class="bdot"></i>' : ''}</a></div>`;
  const an = S.site && S.site.announcement; let bar = $('#ann'); if (an) { if (!bar) { bar = document.createElement('div'); bar.id = 'ann'; document.body.prepend(bar); } bar.textContent = an; } else if (bar) bar.remove();
  $('#dock').innerHTML = NAV.map(([h, l, i]) => `<a href="#${h}" class="${active(h) ? 'on' : ''}">${i}${l}${h === '/me' ? badge : ''}</a>`).join('');
  const cw = $('#cw'); if (cw) cw.onclick = walletModal;
  $$('#dock a, #hd .links a').forEach((a) => { a.onclick = (e) => { if (a.classList.contains('on') && a.getAttribute('href') === '#' + here) { e.preventDefault(); scrollTo({ top: 0, behavior: 'smooth' }); } }; });
}

/* Full-bleed backdrop per page. Images uploaded in the admin (Site & banners / collection banner) replace the built-in ones. */
const dropBd = {}; // drop id -> banner, filled by the drop page so its backdrop is its own art
addEventListener('gta:dropbd', (e) => { dropBd[e.detail.id] = e.detail.url; backdrop(lastBdPath); });
let bdCur = '', bdFlip = 0, lastBdPath = '', wasSmall = null;
const BD = { // built-in backdrops: [image, desktop focus, mobile focus]
  home: ['img/hero.jpg', '60% 35%', '70% 20%'], explore: ['img/explore.jpg', '50% 22%', '72% 20%'], eras: ['img/eras.jpg', '50% 18%', '58% 15%'],
  create: ['img/submit.jpg', '100% 12%', '88% 10%'], me: ['img/crew.jpg', '50% 16%', '50% 12%']
};
const BD_SMALL = { me: ['img/me-mobile.jpg', '50% 30%', '50% 26%'], create: ['img/submit-mobile.jpg', '50% 40%', '50% 38%'] }; // portrait art for phones; the wide one stays for bigger screens
const small = () => matchMedia('(max-width: 760px)').matches;
function backdrop(path) {
  if (wasSmall === null) wasSmall = small();
  const site = S.site || {}, b = site.banners || {}; let key = '', custom = '';
  if (path === '/' || path === '') { key = 'home'; custom = site.heroImage; }
  else if (path === '/explore' || path === '/browse') { key = 'explore'; custom = b.explore; }
  else if (path === '/collections') { key = 'eras'; custom = b.eras; }
  else if (path.startsWith('/collection/')) { const c = S.collections.find((x) => x.id === decodeURIComponent(path.split('/')[2])); key = 'eras'; custom = (c && (c.banner || c.cover)) || b.eras; }
  else if (path.startsWith('/create')) { key = 'create'; custom = b.create; }
  else if (path === '/drops') { key = 'home'; custom = b.drops; }
  else if (path.startsWith('/drop/')) { key = 'eras'; custom = dropBd[decodeURIComponent(path.slice(6))] || ''; }
  else if (path.startsWith('/me')) key = 'me';
  const el = $('#backdrop'); if (!el) return;
  lastBdPath = path;
  const d = (small() && BD_SMALL[key]) || BD[key], url = custom || (d ? d[0] : '');
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
addEventListener('resize', () => { if (wasSmall !== null && wasSmall !== small() && lastBdPath) backdrop(lastBdPath); wasSmall = small(); clearTimeout(fitBackdrop.t); fitBackdrop.t = setTimeout(fitBackdrop, 150); });

let tok = 0, cleanup = null, lastPath = '';
async function render() {
  const my = ++tok; const hash = location.hash.slice(1) || '/'; const [path, query] = hash.split('?'); const q = Object.fromEntries(new URLSearchParams(query || ''));
  chrome(); backdrop(path);
  const main = $('#main');
  const hit = routes.map(([re, fn]) => [re.exec(path), fn]).find(([m]) => m);
  if (cleanup) { try { cleanup(); } catch (e) { /* ignore */ } cleanup = null; }
  const fill = (html, mount) => { if (my !== tok) return; const keep = path.startsWith('/me') && lastPath.startsWith('/me'); const y = scrollY; main.innerHTML = `<div class="view">${html}</div>`; window.scrollTo(0, keep ? y : 0); lastPath = path; document.title = (document.querySelector('.view h1') ? document.querySelector('.view h1').textContent.trim() + ' — ' : '') + 'GTA Market'; if (mount) cleanup = mount(main) || null; enhance(main); hydrateNames(main); };
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
on('auth', () => { chrome(); go(); }); on('unread', chrome); on('profile', chrome);
window.addEventListener('gta:signout', () => signOut());

/* Names for wallet tags that appear later (tabs, live feeds, modals). */
let nmT = 0; new MutationObserver(() => { clearTimeout(nmT); nmT = setTimeout(() => hydrateNames(document), 80); }).observe(document.body, { childList: true, subtree: true });

/* Back-to-top: appears once you are a screen down, on every page. */
const topBtn = document.createElement('button'); topBtn.id = 'totop'; topBtn.setAttribute('aria-label', 'Back to top');
topBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"/></svg>'; document.body.appendChild(topBtn);
topBtn.onclick = () => scrollTo({ top: 0, behavior: 'smooth' });
addEventListener('scroll', () => topBtn.classList.toggle('on', scrollY > innerHeight * 0.9), { passive: true });

/* A tab left open keeps running old code. Check the deployed version now and then; reload on the next page change when it moved. */
let ver = null, stale = false;
const checkVer = async () => { try { const v = (await (await fetch('version.txt?t=' + Date.now(), { cache: 'no-store' })).text()).trim(); if (!v) return; if (ver && v !== ver) stale = true; ver = ver || v; } catch (_) { /* offline */ } };
checkVer(); setInterval(() => { if (!document.hidden) checkVer(); }, 90000); document.addEventListener('visibilitychange', () => { if (!document.hidden) checkVer(); });
addEventListener('hashchange', () => { if (stale) location.reload(); }, true);

(async () => {
  await init();
  if (!location.hash) history.replaceState(null, '', '#/');
  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.update().catch(() => {}))).catch(() => {});
})();
