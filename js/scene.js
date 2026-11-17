/* Pixel backdrops. Each page gets a low-resolution city scene drawn on a canvas and scaled up with hard pixels:
   banded sky, sun or moon, two skylines, palms, water. Windows twinkle, the water shimmers and a boat crosses.
   Everything is drawn from a seed, so a scene looks the same on every visit and after every resize. */
const NIGHT = '#12052b'; // page background: the bottom of every scene dissolves into it
export const SCENES = {
  sunset: { sky: ['#1d0b3f', '#3a1466', '#7a1d84', '#c4257f', '#ff2d8a', '#ff7a1a', '#ffc93c'], orb: '#ffe27a', orb2: '#ff7a1a', far: '#4a1873', near: '#12052b', lit: '#ffc93c', lit2: '#19e3d2', water: '#2a0f52', glint: '#ff2d8a', stars: 0 },
  night: { sky: ['#07021a', '#0b0530', '#120a48', '#1a1263', '#241c80', '#31299c', '#4038b5'], orb: '#f4f1ff', orb2: '#b9b6ff', far: '#1a1263', near: '#0a0420', lit: '#19e3d2', lit2: '#ff2d8a', water: '#150a40', glint: '#19e3d2', stars: 70 },
  dusk: { sky: ['#12052b', '#2a0f52', '#531a7c', '#8a2390', '#c8328f', '#ff5aa8', '#ffa3c4'], orb: '#fff3e8', orb2: '#ff7fb8', far: '#531a7c', near: '#12052b', lit: '#ffe27a', lit2: '#19e3d2', water: '#2a0f52', glint: '#ff5aa8', stars: 24 },
  dawn: { sky: ['#12203f', '#16365c', '#1e5c7c', '#2f8f95', '#6cc5a4', '#ffd9a0', '#ffb26b'], orb: '#fff3c8', orb2: '#ff8f5a', far: '#1e4a6c', near: '#0d1630', lit: '#ffe27a', lit2: '#ff5aa8', water: '#16305a', glint: '#ffd9a0', stars: 0 },
  vault: { sky: ['#06121f', '#082033', '#0b3348', '#0f4c5e', '#157073', '#1b9a8c', '#3ccfb0'], orb: '#eafff6', orb2: '#7dffd8', far: '#0f3d55', near: '#07101e', lit: '#ffc93c', lit2: '#ff2d8a', water: '#0a2a44', glint: '#3ccfb0', stars: 40 }
};
const rng = (s) => () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function palm(c, x, y, h, col, lean = 1) {
  c.fillStyle = col;
  for (let i = 0; i < h; i++) c.fillRect(x + Math.round(Math.sin(i / h * 1.3) * lean * h * 0.12), y - i, i < h * 0.25 ? 3 : 2, 1);
  const tx = x + Math.round(Math.sin(1.3) * lean * h * 0.12) + 1, ty = y - h, L = Math.max(7, Math.round(h * 0.42));
  for (const [dx, dy, droop] of [[-1, -0.25, 0.9], [-0.85, -0.7, 0.5], [-0.3, -1, 0.25], [0.3, -1, 0.25], [0.85, -0.7, 0.5], [1, -0.25, 0.9], [-0.95, 0.1, 1.1], [0.95, 0.1, 1.1]]) {
    for (let s = 0; s <= L; s++) { const k = s / L; c.fillRect(tx + Math.round(dx * s), ty + Math.round(dy * s + droop * k * k * L * 0.55), 2, k < 0.75 ? 2 : 1); }
  }
  c.fillRect(tx - 1, ty - 1, 4, 3);
}

function skyline(c, r, W, base, minH, maxH, col, wins, p) {
  let x = -2;
  while (x < W) {
    const w = 5 + Math.floor(r() * 12), h = minH + Math.floor(r() * (maxH - minH)), top = base - h;
    c.fillStyle = col; c.fillRect(x, top, w, h);
    const kind = r();
    if (kind < 0.18 && w > 6) { c.fillRect(x + 2, top - 3, w - 4, 3); c.fillRect(x + (w >> 1), top - 8, 1, 5); } // stepped roof + antenna
    else if (kind < 0.3) c.fillRect(x + (w >> 1) - 1, top - 2, 3, 2); // water tank
    if (wins) for (let yy = top + 2; yy < base - 1; yy += 3) for (let xx = x + 1; xx < x + w - 1; xx += 2) if (r() < 0.34) wins.push([xx, yy, r() < 0.82 ? p.lit : p.lit2, r()]);
    x += w + (r() < 0.25 ? 1 : 0);
  }
}

function paint(cv, p, seed, opt) {
  const W = cv.width, H = cv.height, c = cv.getContext('2d'), r = rng(seed);
  const hz = Math.round(H * (opt.horizon || 0.62)); // horizon line
  // sky: hard bands, two dithered rows where one band meets the next
  const n = p.sky.length, bh = hz / n;
  for (let i = 0; i < n; i++) { c.fillStyle = p.sky[i]; c.fillRect(0, Math.round(i * bh), W, Math.ceil(bh) + 1); }
  for (let i = 1; i < n; i++) { const y = Math.round(i * bh); c.fillStyle = p.sky[i]; for (let x = 0; x < W; x += 2) { c.fillRect(x, y - 2, 1, 1); c.fillRect(x + 1, y - 1, 1, 1); c.fillRect(x + (i % 2), y - 4, 1, 1); } }
  for (let i = 0; i < p.stars * (W / 320); i++) { c.fillStyle = r() < 0.2 ? p.lit : '#fff3e8'; c.fillRect(Math.floor(r() * W), Math.floor(r() * hz * 0.6), 1, 1); }
  // sun / moon with slits that widen toward the horizon
  const sr = Math.round(Math.min(W * 0.1, hz * 0.42)), sx = Math.round(W * (opt.orbX || 0.68)), sy = hz - Math.round(sr * 0.45);
  for (let y = -sr; y <= sr; y++) {
    if (sy + y >= hz) break;
    const half = Math.round(Math.sqrt(sr * sr - y * y)), t = (y + sr) / (2 * sr);
    if (t > 0.5 && (y % 5 === 0 || (t > 0.72 && y % 5 === 1) || (t > 0.88 && y % 5 === 2))) continue;
    c.fillStyle = t < 0.55 ? p.orb : p.orb2; c.fillRect(sx - half, sy + y, half * 2, 1);
  }
  // skylines
  const wins = [];
  skyline(c, r, W, hz, Math.round(hz * 0.1), Math.round(hz * 0.42), p.far, null, p);
  skyline(c, r, W, hz, Math.round(hz * 0.06), Math.round(hz * 0.3), p.near, wins, p);
  // water, then a dithered fade into the page colour
  c.fillStyle = p.water; c.fillRect(0, hz, W, H - hz);
  const fade = Math.round((H - hz) * 0.42), f0 = H - fade; c.fillStyle = NIGHT;
  for (let y = f0; y < H; y++) { const k = (y - f0) / fade; for (let x = 0; x < W; x++) { const b = ((x + y) & 1) ? 0.5 : ((x & 1) ? 0.25 : ((y & 1) ? 0.75 : 0)); if (k > b + 0.12) c.fillRect(x, y, 1, 1); } }
  c.fillRect(0, H - Math.max(2, Math.round(fade * 0.15)), W, H);
  c.fillStyle = p.near; c.fillRect(0, hz, W, 1);
  // palms frame the scene
  const ph = Math.round(H * 0.5);
  if (!opt.noPalms) { palm(c, Math.round(W * 0.045), hz + 4, ph, p.near, 1); palm(c, Math.round(W * 0.11), hz + 2, Math.round(ph * 0.62), p.near, -0.6); palm(c, Math.round(W * 0.955), hz + 4, Math.round(ph * 0.86), p.near, -1); if (W > 240) palm(c, Math.round(W * 0.9), hz + 2, Math.round(ph * 0.5), p.near, 0.7); }
  return { hz, sx, sr, wins, f0 };
}

/** Draw `kind` into the canvas and keep it alive. Returns a stop function. */
export function mountScene(cv, kind = 'sunset', opt = {}) {
  const p = SCENES[kind] || SCENES.sunset, seed = opt.seed || kind.length * 977 + kind.charCodeAt(0) * 13;
  const base = document.createElement('canvas'); let info = null, timer = 0, tick = 0, live = true;
  const c = cv.getContext('2d');
  const frame = () => {
    if (!info) return; const W = cv.width, H = cv.height, r = rng(seed * 31 + tick);
    c.drawImage(base, 0, 0);
    // windows: most stay lit, a few blink
    for (const [x, y, col, ph] of info.wins) { if (ph < 0.14 && ((tick + Math.floor(ph * 100)) % 9) < 3) continue; c.fillStyle = col; c.fillRect(x, y, 1, 1); }
    // reflection of the sun and loose glints on the water
    const rows = Math.max(0, info.f0 - info.hz + 6);
    for (let i = 2; i < rows; i += 2) { const w = Math.max(2, Math.round(info.sr * (1 - i / (rows + 4)) * (0.7 + r() * 0.6))); c.fillStyle = i % 4 ? p.orb2 : p.glint; c.fillRect(info.sx - w + Math.round((r() - 0.5) * 4), info.hz + i, w * 2, 1); }
    c.fillStyle = p.glint; for (let i = 0; i < W / 9; i++) { const y = info.hz + 2 + Math.floor(r() * rows); c.fillRect(Math.floor(r() * W), y, 2 + Math.floor(r() * 4), 1); }
    // a speedboat with a wake crosses now and then
    if (!opt.noBoat) { const span = W + 60, bx = ((tick * 1.2) % (span * 2.2)) - 30, by = info.hz + Math.max(4, Math.round(rows * 0.4)); if (bx < W + 20) { c.fillStyle = '#fff3e8'; c.fillRect(bx, by, 12, 2); c.fillRect(bx + 2, by + 2, 9, 1); c.fillStyle = p.near; c.fillRect(bx + 4, by - 2, 5, 2); c.fillStyle = p.lit2; c.fillRect(bx, by + 1, 12, 1); c.fillStyle = '#fff3e8'; for (let i = 1; i < 7; i++) if ((i + tick) % 2) c.fillRect(bx - i * 3, by + 2 + (i % 2), 2, 1); } }
    tick++;
  };
  const build = () => {
    const cw = cv.clientWidth, ch = cv.clientHeight; if (!cw || !ch) return;
    const px = opt.px || (cw > 1500 ? 5 : cw > 760 ? 4 : 3), W = Math.ceil(cw / px), H = Math.ceil(ch / px);
    if (W === cv.width && H === cv.height && info) return;
    cv.width = base.width = W; cv.height = base.height = H;
    info = paint(base, p, seed, opt); frame();
  };
  const ro = new ResizeObserver(build); ro.observe(cv); build();
  const run = () => { clearInterval(timer); if (live && !reduce() && !document.hidden) timer = setInterval(frame, 140); };
  const vis = () => run(); document.addEventListener('visibilitychange', vis); run();
  return () => { live = false; clearInterval(timer); ro.disconnect(); document.removeEventListener('visibilitychange', vis); };
}
