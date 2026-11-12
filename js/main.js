import { S, on, $, $$, esc, init, short, money, toast, walletModal, toggleLike, ls, signOut } from './core.js';
import { home, explore, artwork, collections, collection } from './views.js';
import { create, profile } from './me.js';
import { admin } from './admin.js';

const ic = {
  home: '<svg viewBox="0 0 24 24"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>',
  explore: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/></svg>',
  cols: '<svg viewBox="0 0 24 24"><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/></svg>',
  create: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="5"/><path d="M12 8v8M8 12h8"/></svg>',
  me: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/></svg>',
  admin: '<svg viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/></svg>'
};
const NAV = [['/', 'Home', ic.home], ['/explore', 'Explore', ic.explore], ['/collections', 'Eras', ic.cols], ['/create', 'Submit', ic.create], ['/me', 'Profile', ic.me]];
const routes = [
  [/^\/?$/, home], [/^\/explore$/, explore], [/^\/art\/(.+)$/, artwork], [/^\/collections$/, collections], [/^\/collection\/(.+)$/, collection],
  [/^\/create$/, create], [/^\/me(?:\/(\w+))?$/, profile], [/^\/admin(?:\/(\w+))?$/, admin]
];

function chrome() {
  const here = (location.hash.slice(1) || '/').split('?')[0];
  $('#rail').innerHTML = `<a class="logo" href="#/"><b>GTA</b><small>MARKET</small></a><div class="nav">${NAV.map(([h, l, i]) => {
    const on_ = h === '/' ? here === '/' : here.startsWith(h) || (h === '/collections' && here.startsWith('/collection'));
    return `<a href="#${h}" class="${on_ ? 'on' : ''}">${i}${l}${h === '/me' && S.unread ? `<span class="badge">${S.unread}</span>` : ''}</a>`;
  }).join('')}</div><div class="sp"></div><div class="nav"><a href="#/admin" class="${here.startsWith('/admin') ? 'on' : ''}" title="Admin">${ic.admin}Admin</a></div>`;
  $('#top').innerHTML = S.wallet
    ? `<span class="pill net">Devnet</span><a class="pill" href="#/me" title="Your balance">${money(S.balance)}</a><a class="pill" href="#/me"><i class="dot"></i>${short(S.wallet)}</a>`
    : `<span class="pill net">Devnet</span><button class="btn primary sm" id="cw">Connect wallet</button>`;
  const cw = $('#cw'); if (cw) cw.onclick = walletModal;
}

let tok = 0, cleanup = null;
async function render() {
  const my = ++tok; const hash = location.hash.slice(1) || '/'; const [path, query] = hash.split('?'); const q = Object.fromEntries(new URLSearchParams(query || ''));
  chrome();
  const main = $('#main');
  const hit = routes.map(([re, fn]) => [re.exec(path), fn]).find(([m]) => m);
  if (cleanup) { try { cleanup(); } catch (e) { /* ignore */ } cleanup = null; }
  const fill = (html, mount) => { if (my !== tok) return; main.innerHTML = `<div class="view">${html}</div>`; window.scrollTo(0, 0); document.title = (document.querySelector('.view h1') ? document.querySelector('.view h1').textContent.trim() + ' — ' : '') + 'GTA Market'; if (mount) cleanup = mount(main) || null; };
  if (!hit) return fill(`<div class="empty"><b>Wrong turn</b>That page doesn't exist. <a class="lime" href="#/">Back to start</a></div>`);
  if (!S.online && !path.startsWith('/admin')) return fill(`<div class="empty"><b>Offline</b>The database is not reachable${S.initError ? ': ' + esc(S.initError) : ''}. <a class="lime" href="">Try again</a></div>`);
  try { const r = await hit[1]({ args: hit[0].slice(1), q }); if (typeof r === 'string') fill(r); else fill(r.html, r.mount); }
  catch (e) { console.error(e); fill(`<div class="empty"><b>Could not load</b>${esc(e.message)}</div>`); }
}
const go = () => { if (document.startViewTransition) document.startViewTransition(render); else render(); };
window.addEventListener('hashchange', go);

document.addEventListener('click', async (e) => {
  const like = e.target.closest('[data-like]');
  if (like) {
    e.preventDefault(); e.stopPropagation(); if (like.dataset.busy) return; like.dataset.busy = '1';
    try { const r = await toggleLike(like.dataset.like); $$(`[data-like="${CSS.escape(like.dataset.like)}"]`).forEach((b) => { b.classList.toggle('on', r.liked); const s = $('span', b); if (s) s.textContent = r.likes; }); }
    catch (err) { toast(err.message, 'bad'); } finally { delete like.dataset.busy; }
  }
}, true);
on('auth', () => { chrome(); go(); }); on('unread', chrome); on('balance', chrome);
window.addEventListener('gta:signout', () => signOut());

(async () => {
  await init();
  if (!location.hash) history.replaceState(null, '', '#/');
  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.update().catch(() => {}))).catch(() => {});
})();
