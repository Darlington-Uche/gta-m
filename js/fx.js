/* GTA Marketplace — motion layer: aurora backdrop, scroll reveal, 3D tilt, ripple, count-up, dock indicator, confetti.
   Pure progressive enhancement: nothing here is needed for the app to work. */
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const raf = (f) => requestAnimationFrame(f);

  /* backdrop + progress */
  const bg = document.createElement('div'); bg.className = 'fx-aurora'; bg.innerHTML = '<i></i><i></i><i></i>';
  const grain = document.createElement('div'); grain.className = 'fx-grain';
  const bar = document.createElement('div'); bar.className = 'fx-progress';
  document.body.prepend(bar, grain, bg);
  let ticking = false;
  const onScroll = () => {
    if (ticking) return; ticking = true;
    raf(() => {
      const h = document.documentElement, max = h.scrollHeight - innerHeight;
      bar.style.transform = `scaleX(${max > 0 ? Math.min(1, scrollY / max) : 0})`;
      const tb = $('.topbar'); if (tb) tb.classList.toggle('scrolled', scrollY > 8);
      ticking = false;
    });
  };
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  /* scroll reveal (staggered per parent) */
  const SEL = '.section, .how-card, .cta-band, .card, .col-card, .era-chip, .stat, .filters, .toolbar, .box, .panel, .tl-item, .row-item';
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((ents) => {
    ents.forEach((e) => {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      e.target.classList.add('in');
      setTimeout(() => e.target.classList.remove('fx-r', 'in'), 1300 + (parseInt(e.target.style.getPropertyValue('--i')) || 0) * 55);
    });
  }, { threshold: 0.06, rootMargin: '0px 0px -4% 0px' }) : null;
  const seen = new WeakSet();
  function prep(root) {
    $$(SEL, root).forEach((el) => {
      if (seen.has(el)) return; seen.add(el);
      if ((el.matches('.card, .col-card')) && !$('.fx-glare', el)) { const g = document.createElement('i'); g.className = 'fx-glare'; el.appendChild(g); }
      if (reduce || !io) return;
      const r = el.getBoundingClientRect();
      if (r.top < innerHeight * 0.92 && r.bottom > 0 && !el.closest('.card-body')) { /* already on screen: gentle stagger entrance */ }
      const sibs = el.parentElement ? [...el.parentElement.children].filter((c) => c.matches(SEL)) : [];
      el.style.setProperty('--i', Math.min(sibs.indexOf(el), 10));
      el.classList.add('fx-r'); io.observe(el);
    });
  }
  prep(document);
  new MutationObserver((muts) => {
    let any = false;
    for (const m of muts) m.addedNodes.forEach((n) => { if (n.nodeType === 1) any = true; });
    if (any) raf(() => prep(document));
  }).observe(document.body, { childList: true, subtree: true });

  /* 3D tilt + glare */
  if (fine && !reduce) {
    let cur = null;
    const reset = (el) => { if (!el) return; el.classList.remove('tilting'); el.style.removeProperty('--rx'); el.style.removeProperty('--ry'); };
    document.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const el = e.target.closest && e.target.closest('.card, .col-card');
      if (cur && cur !== el) reset(cur);
      cur = el; if (!el) return;
      const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      el.classList.add('tilting');
      el.style.setProperty('--ry', ((x - 0.5) * 12).toFixed(2) + 'deg');
      el.style.setProperty('--rx', ((0.5 - y) * 10).toFixed(2) + 'deg');
      el.style.setProperty('--gx', (x * 100).toFixed(1) + '%'); el.style.setProperty('--gy', (y * 100).toFixed(1) + '%');
    }, { passive: true });
    document.addEventListener('pointerleave', () => reset(cur), true);
  }

  /* button ripple */
  document.addEventListener('pointerdown', (e) => {
    const b = e.target.closest && e.target.closest('.btn'); if (!b || b.disabled || reduce) return;
    const r = b.getBoundingClientRect(), d = Math.max(r.width, r.height) * 2;
    const s = document.createElement('span'); s.className = 'fx-ripple';
    s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
    b.appendChild(s); setTimeout(() => s.remove(), 700);
  }, { passive: true });

  /* count-up for numbers that change */
  const parseNum = (t) => { const m = String(t).match(/^(\D*?)([\d,]*\.?\d+)(\D*)$/); return m ? { pre: m[1], n: parseFloat(m[2].replace(/,/g, '')), dec: (m[2].split('.')[1] || '').length, suf: m[3] } : null; };
  const counting = new WeakSet();
  function countUp(el) {
    if (reduce || counting.has(el)) return;
    const to = parseNum(el.textContent); if (!to || !isFinite(to.n)) return;
    const from = parseFloat(el.dataset.fxv || '0'); if (from === to.n) return;
    el.dataset.fxv = to.n; counting.add(el);
    const t0 = performance.now(), dur = 1100;
    const fmt = (v) => to.pre + (to.dec ? v.toFixed(to.dec) : Math.round(v).toLocaleString()) + to.suf;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 4);
      el.textContent = fmt(from + (to.n - from) * e);
      if (k < 1) raf(step); else { el.textContent = fmt(to.n); counting.delete(el); }
    };
    raf(step);
  }
  const statObs = new MutationObserver((ms) => ms.forEach((m) => { const el = m.target.nodeType === 3 ? m.target.parentElement : m.target; if (el && el.matches && el.matches('.stat b') && !counting.has(el)) countUp(el); }));
  $$('.stat b').forEach((b) => statObs.observe(b, { childList: true, characterData: true, subtree: true }));

  /* dock sliding indicator */
  const dock = $('.dock');
  if (dock) {
    const ind = document.createElement('i'); ind.className = 'fx-ind'; dock.prepend(ind);
    const place = (a) => { if (!a || a.classList.contains('create-fab')) { ind.style.opacity = 0; return; } ind.style.opacity = 1; ind.style.width = a.offsetWidth + 'px'; ind.style.transform = `translateX(${a.offsetLeft}px)`; };
    const sync = () => place($('a.active', dock));
    sync(); addEventListener('resize', sync); setTimeout(sync, 400);
    dock.addEventListener('pointerdown', (e) => { const a = e.target.closest('a'); if (a) place(a); }, { passive: true });
  }

  /* navigation polish: prefetch on intent; fade out where cross-document view transitions are unavailable */
  const hasVT = 'CSSViewTransitionRule' in window;
  const pref = new Set();
  const prefetch = (a) => {
    if (!a || a.origin !== location.origin || pref.has(a.href) || !/\.html?($|[?#])|\/$/.test(a.pathname + a.search)) return;
    pref.add(a.href); const l = document.createElement('link'); l.rel = 'prefetch'; l.href = a.href; document.head.appendChild(l);
  };
  document.addEventListener('pointerover', (e) => prefetch(e.target.closest && e.target.closest('a[href]')), { passive: true });
  document.addEventListener('touchstart', (e) => prefetch(e.target.closest && e.target.closest('a[href]')), { passive: true });
  if (!hasVT && !reduce) {
    document.addEventListener('click', (e) => {
      const a = e.target.closest && e.target.closest('a[href]');
      if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || a.target === '_blank' || a.origin !== location.origin || (a.pathname === location.pathname && a.search === location.search)) return;
      e.preventDefault(); document.body.classList.add('leaving'); setTimeout(() => { location.href = a.href; }, 190);
    });
    addEventListener('pageshow', () => document.body.classList.remove('leaving'));
  }

  /* home: hero art stack + era marquee */
  const D = window.GTA_DATA;
  const heroArt = $('#heroArt');
  if (heroArt && D && D.art) {
    const pool = D.art.filter((a) => a.img && !a.placeholder && !/^data:/.test(a.img));
    const pick = [...pool.filter((a) => a.rarity === 'Legendary'), ...pool.filter((a) => a.rarity === 'Epic'), ...pool].slice(0, 3);
    heroArt.innerHTML = pick.map((a) => `<figure><img src="${encodeURI(a.img)}" alt="" loading="eager" decoding="async"></figure>`).join('');
  }
  const mq = $('#fxMarquee');
  if (mq && D && D.collections) {
    const names = D.collections.map((c) => `<span>${String(c.name || c.id).replace(/</g, '')}</span>`).join('');
    mq.innerHTML = names + names + names + names;
  }

  /* mint / purchase success: confetti */
  const msg = $('#txMsg');
  if (msg && !reduce) {
    let fired = false;
    new MutationObserver(() => { const ok = msg.classList.contains('ok'); if (ok && !fired) { fired = true; confetti(); } if (!ok) fired = false; }).observe(msg, { attributes: true, attributeFilter: ['class'] });
  }
  function confetti() {
    const c = document.createElement('canvas'); c.className = 'fx-confetti'; document.body.appendChild(c);
    const dpr = Math.min(2, devicePixelRatio || 1); c.width = innerWidth * dpr; c.height = innerHeight * dpr;
    const g = c.getContext('2d'); g.scale(dpr, dpr);
    const cols = ['#ff2f7a', '#ff5fa2', '#8b5cf6', '#2de2e6', '#ffc65c', '#35e08f', '#fff'];
    const ps = Array.from({ length: 150 }, () => { const a = Math.random() * Math.PI * 2, s = 5 + Math.random() * 11; return { x: innerWidth / 2, y: innerHeight * 0.42, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 6, w: 6 + Math.random() * 7, h: 4 + Math.random() * 5, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: cols[(Math.random() * cols.length) | 0], life: 1 }; });
    let t0 = performance.now();
    (function frame(t) {
      const dt = Math.min(2, (t - t0) / 16.7); t0 = t;
      g.clearRect(0, 0, innerWidth, innerHeight);
      let alive = 0;
      for (const p of ps) {
        p.vy += 0.32 * dt; p.vx *= 0.99; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt; p.life -= 0.0075 * dt;
        if (p.life <= 0 || p.y > innerHeight + 30) continue; alive++;
        g.save(); g.globalAlpha = Math.max(0, p.life); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); g.restore();
      }
      if (alive) raf(frame); else c.remove();
    })(t0);
  }
})();
