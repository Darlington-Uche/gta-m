/* Site-wide motion & interaction layer. Everything here is decoration: it only reads the DOM the views render,
   and it stands down when the user asks for reduced motion. */
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

/* ---- scroll reveal: sections and cards rise in as they enter the screen, staggered per row ---- */
const io = reduce ? null : new IntersectionObserver((ents) => ents.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
const REVEAL = '.stat, .sh, .card, .tile, .rowc, .cta-band, .who, .tabs, .empty, .ticker, .kv > *, .panel, .bar';
function reveal(root) {
  if (reduce) return;
  const groups = new Map();
  $$(REVEAL, root).forEach((el) => { if (el.closest('.deck') || el.classList.contains('rv')) return; const p = el.parentElement; const i = groups.get(p) || 0; groups.set(p, i + 1); el.style.setProperty('--rv', Math.min(i, 8)); el.classList.add('rv'); io.observe(el); });
}

/* ---- count-up: stat numbers roll up from zero the first time they're seen ---- */
function countUp(root) {
  $$('.stat b', root).forEach((b) => {
    const raw = b.textContent.trim(), m = raw.match(/^(\D*)([\d,.]+)(\D*)$/); if (!m) return;
    const to = parseFloat(m[2].replace(/,/g, '')); if (!isFinite(to) || to === 0 || reduce) return;
    b.textContent = m[1] + '0' + m[3];
    const ob = new IntersectionObserver(([e]) => { if (!e.isIntersecting) return; ob.disconnect(); const t0 = performance.now(), d = 1100;
      const step = (t) => { const k = Math.min(1, (t - t0) / d), v = to * (1 - Math.pow(1 - k, 4)); b.textContent = m[1] + Math.round(v).toLocaleString() + m[3]; if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step); });
    ob.observe(b);
  });
}

/* ---- hero headline: words slam in one after another ---- */
function headline(root) {
  const h = root.querySelector('.hero h1'); if (!h || reduce) return;
  let i = 0;
  const wrap = (node) => { [...node.childNodes].forEach((c) => { if (c.nodeType === 3) { const f = document.createDocumentFragment(); c.textContent.split(/(\s+)/).forEach((w) => { if (!w) return; if (/^\s+$/.test(w)) f.append(w); else { const s = document.createElement('span'); s.className = 'w'; s.style.setProperty('--wi', i++); s.textContent = w; f.append(s); } }); c.replaceWith(f); } else if (c.nodeType === 1 && c.tagName !== 'BR') wrap(c); }); };
  wrap(h); h.classList.add('split');
}

/* ---- dock: the active pill slides between tabs instead of jumping ---- */
let pillX = null, pillW = null;
export function dockPill() {
  const d = document.getElementById('dock'); if (!d) return;
  const on = d.querySelector('a.on');
  let ind = d.querySelector('.dk-ind'); const fresh = !ind;
  if (fresh) { ind = document.createElement('i'); ind.className = 'dk-ind'; d.prepend(ind); }
  if (!on || !on.offsetWidth) { ind.style.opacity = 0; return; }
  const x = on.offsetLeft - 6, w = on.offsetWidth;
  // the dock is re-rendered on every route, so start the new pill where the old one was and let it slide over
  if (fresh && pillX != null) { ind.style.transition = 'none'; ind.style.width = pillW + 'px'; ind.style.transform = `translateX(${pillX}px)`; void ind.offsetWidth; ind.style.transition = ''; }
  ind.style.opacity = 1; ind.style.width = w + 'px'; ind.style.transform = `translateX(${x}px)`; pillX = x; pillW = w;
  d.classList.add('pill');
}

/* ---- tap ripple on buttons, chips and dock items ---- */
document.addEventListener('pointerdown', (e) => {
  const t = e.target.closest('.btn, .chip, .dock a, .dk-b, .like, .tabs a'); if (!t || reduce) return;
  const r = t.getBoundingClientRect(), s = document.createElement('i'), size = Math.max(r.width, r.height) * 2.2;
  s.className = 'ripple'; s.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
  if (getComputedStyle(t).position === 'static') t.style.position = 'relative';
  t.classList.add('has-ripple'); t.append(s); setTimeout(() => s.remove(), 650);
}, { passive: true });

/* ---- like: a little burst of hearts ---- */
export function burst(el) {
  if (reduce || !el) return;
  const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  for (let i = 0; i < 10; i++) {
    const h = document.createElement('i'); h.className = 'heart-p'; h.textContent = '♥';
    const a = (Math.PI * 2 * i) / 10 + Math.random() * 0.5, d = 28 + Math.random() * 30;
    h.style.cssText = `left:${cx}px;top:${cy}px;--x:${Math.cos(a) * d}px;--y:${Math.sin(a) * d - 14}px;--s:${0.6 + Math.random() * 0.7};--c:${['#ff3d9a', '#d63dff', '#ffd23d', '#3dffd8'][i % 4]}`;
    document.body.append(h); setTimeout(() => h.remove(), 800);
  }
}

/* ---- desktop: neon cursor glow + magnetic primary buttons ---- */
if (fine && !reduce) {
  const glow = document.createElement('div'); glow.id = 'glow'; document.body.append(glow);
  let x = innerWidth / 2, y = innerHeight / 3, gx = x, gy = y, raf = 0;
  const tick = () => { gx += (x - gx) * 0.12; gy += (y - gy) * 0.12; glow.style.transform = `translate(${gx}px, ${gy}px)`; raf = Math.abs(x - gx) + Math.abs(y - gy) > 0.5 ? requestAnimationFrame(tick) : 0; };
  addEventListener('pointermove', (e) => { x = e.clientX; y = e.clientY; glow.classList.toggle('hot', !!e.target.closest('a, button, .card, .tile, .hcard')); if (!raf) raf = requestAnimationFrame(tick); }, { passive: true });
  document.addEventListener('pointermove', (e) => {
    const b = e.target.closest('.btn.primary, .btn.lg'); document.querySelectorAll('.btn.mag').forEach((m) => { if (m !== b) { m.classList.remove('mag'); m.style.transform = ''; } });
    if (!b) return; const r = b.getBoundingClientRect(); b.classList.add('mag');
    b.style.transform = `translate(${((e.clientX - r.left) / r.width - 0.5) * 10}px, ${((e.clientY - r.top) / r.height - 0.5) * 8}px)`;
  }, { passive: true });
}

/* ---- backdrop parallax: the page photo drifts slower than the content ---- */
if (!reduce) {
  let ticking = false;
  addEventListener('scroll', () => { if (ticking) return; ticking = true; requestAnimationFrame(() => { const b = document.getElementById('backdrop'); if (b) b.style.setProperty('--py', Math.min(scrollY, 900) * 0.25 + 'px'); ticking = false; }); }, { passive: true });
}

// Content that views add later (filters, paging, tab swaps) gets the same entrance.
let mo = null, moT = 0;
function watch(root) { if (mo || reduce) return; mo = new MutationObserver(() => { clearTimeout(moT); moT = setTimeout(() => { easeImgs(root); reveal(root); }, 30); }); mo.observe(root, { childList: true, subtree: true }); }
/** Run after every page render. */
function easeImgs(root) { root.querySelectorAll('img').forEach((im) => { if (im.complete || im.dataset.ez) return; im.dataset.ez = '1'; im.classList.add('ld'); const done = () => im.classList.remove('ld'); im.addEventListener('load', done, { once: true }); im.addEventListener('error', done, { once: true }); setTimeout(done, 4000); }); }
addEventListener('scroll', () => document.body.classList.toggle('scrolled', scrollY > 24), { passive: true });
export function enhance(root) { easeImgs(root); headline(root); reveal(root); countUp(root); dockPill(); watch(root); }
addEventListener('resize', () => dockPill());
