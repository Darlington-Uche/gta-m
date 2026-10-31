// Generates 40 original artworks + 5 hero banners as SVG into assets/art and assets/hero.
// Run: node tools/gen-art.js
const fs = require('fs');
const path = require('path');
const out = path.join(__dirname, '..', 'assets');
fs.mkdirSync(path.join(out, 'art'), { recursive: true });
fs.mkdirSync(path.join(out, 'hero'), { recursive: true });

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const W = 960, H = 720;

const PALETTES = {
  vice:   { sky: ['#1a0b3a', '#7a1fa2', '#ff4f9a', '#ffb36b'], sun: ['#ffe27a', '#ff4f9a'], far: '#2a1252', near: '#120a2b', accent: '#00e5ff', neon: '#ff3d8b', ground: '#0d0720' },
  sunset: { sky: ['#2b0f4a', '#c2318a', '#ff7a59', '#ffd27a'], sun: ['#fff0a8', '#ff7a59'], far: '#3a1458', near: '#190b32', accent: '#ffd166', neon: '#ff5fa2', ground: '#120824' },
  night:  { sky: ['#050816', '#14125a', '#4b1fa8', '#b13bd6'], sun: ['#e7e9ff', '#8f8cff'], far: '#171a52', near: '#0a0b26', accent: '#33f5ff', neon: '#ff2fa0', ground: '#06061a' },
  dawn:   { sky: ['#1b2a6b', '#7b4fd1', '#ff8fb3', '#ffe0a3'], sun: ['#fff6c9', '#ffb36b'], far: '#33307a', near: '#1a1745', accent: '#7cf7ff', neon: '#ff6fb5', ground: '#0e0c2e' },
  gold:   { sky: ['#2a0f1f', '#a3322b', '#ff8a3d', '#ffd36b'], sun: ['#fff3b0', '#ff8a3d'], far: '#4a1a2a', near: '#1e0b17', accent: '#ffd166', neon: '#ff5c5c', ground: '#150810' },
  teal:   { sky: ['#06222f', '#0b5d7a', '#2bb3b1', '#ffb86b'], sun: ['#fff1b8', '#ffb86b'], far: '#0c3d52', near: '#06202c', accent: '#ff6fb5', neon: '#3dffd6', ground: '#041820' },
  smog:   { sky: ['#1a1a24', '#4a3f55', '#a0627a', '#e6a77a'], sun: ['#ffe0b0', '#e6a77a'], far: '#2c2a38', near: '#14131c', accent: '#ffb86b', neon: '#ff7a59', ground: '#0c0b12' },
  grid:   { sky: ['#0a0220', '#2b0a5c', '#8a1fa8', '#ff4f9a'], sun: ['#fff27a', '#ff3d8b'], far: '#220a46', near: '#0f0522', accent: '#00f0ff', neon: '#ff3d8b', ground: '#0a0220' },
};

function skyDefs(id, p) {
  return `<linearGradient id="sky${id}" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${p.sky[0]}"/><stop offset=".4" stop-color="${p.sky[1]}"/>
    <stop offset=".72" stop-color="${p.sky[2]}"/><stop offset="1" stop-color="${p.sky[3]}"/></linearGradient>
  <radialGradient id="sun${id}" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="${p.sun[0]}"/><stop offset="1" stop-color="${p.sun[1]}"/></radialGradient>
  <radialGradient id="glow${id}" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="${p.sun[1]}" stop-opacity=".55"/><stop offset="1" stop-color="${p.sun[1]}" stop-opacity="0"/></radialGradient>
  <linearGradient id="gr${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.near}"/><stop offset="1" stop-color="${p.ground}"/></linearGradient>
  <filter id="bl${id}"><feGaussianBlur stdDeviation="6"/></filter>
  <filter id="gl${id}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
}

function stars(r, n, yMax) {
  let s = '';
  for (let i = 0; i < n; i++) {
    s += `<circle cx="${(r() * W).toFixed(0)}" cy="${(r() * yMax).toFixed(0)}" r="${(r() * 1.6 + 0.4).toFixed(1)}" fill="#fff" opacity="${(r() * 0.7 + 0.2).toFixed(2)}"/>`;
  }
  return s;
}

function sun(id, cx, cy, rad, stripes) {
  let s = `<circle cx="${cx}" cy="${cy}" r="${rad * 2.2}" fill="url(#glow${id})"/><circle cx="${cx}" cy="${cy}" r="${rad}" fill="url(#sun${id})"/>`;
  if (stripes) {
    for (let i = 0; i < 6; i++) {
      const y = cy + rad * 0.1 + i * rad * 0.18;
      s += `<rect x="${cx - rad}" y="${y}" width="${rad * 2}" height="${2 + i * 1.6}" fill="${'var(--bgc)'}"/>`;
    }
  }
  return s;
}

function skyline(r, baseY, color, minH, maxH, litColor, lit) {
  let s = '', x = -10;
  while (x < W + 10) {
    const w = 26 + r() * 56, h = minH + r() * (maxH - minH);
    s += `<rect x="${x.toFixed(0)}" y="${(baseY - h).toFixed(0)}" width="${w.toFixed(0)}" height="${h.toFixed(0)}" fill="${color}"/>`;
    if (r() > 0.7) s += `<rect x="${(x + w / 2 - 1).toFixed(0)}" y="${(baseY - h - 16).toFixed(0)}" width="2" height="16" fill="${color}"/>`;
    if (lit) {
      const cols = Math.floor(w / 9), rows = Math.floor(h / 13);
      for (let cx = 0; cx < cols; cx++) for (let cy = 0; cy < rows; cy++) {
        if (r() > 0.78) s += `<rect x="${(x + 4 + cx * 9).toFixed(0)}" y="${(baseY - h + 6 + cy * 13).toFixed(0)}" width="4" height="6" fill="${litColor}" opacity="${(0.4 + r() * 0.6).toFixed(2)}"/>`;
      }
    }
    x += w + 2 + r() * 4;
  }
  return s;
}

function palm(x, y, h, lean, color) {
  const tx = x + lean, ty = y - h;
  let s = `<path d="M${x} ${y} Q${x + lean * 0.2} ${y - h * 0.6} ${tx} ${ty}" stroke="${color}" stroke-width="${Math.max(5, h / 28)}" fill="none" stroke-linecap="round"/>`;
  const fr = h * 0.5;
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI + (i / 6) * Math.PI;
    const ex = tx + Math.cos(a) * fr, ey = ty + Math.sin(a) * fr * 0.55 + fr * 0.35;
    s += `<path d="M${tx} ${ty} Q${tx + Math.cos(a) * fr * 0.6} ${ty - fr * 0.45} ${ex} ${ey}" stroke="${color}" stroke-width="${Math.max(3, h / 45)}" fill="none" stroke-linecap="round"/>`;
  }
  return s;
}

function car(x, y, scale, body, accent, flip) {
  const t = `translate(${x} ${y}) scale(${flip ? -scale : scale} ${scale})`;
  return `<g transform="${t}">
    <ellipse cx="0" cy="34" rx="150" ry="9" fill="#000" opacity=".45"/>
    <path d="M-145 18 L-130 -4 Q-110 -8 -80 -10 L-52 -34 Q-40 -42 -10 -42 L40 -42 Q62 -40 78 -22 L96 -8 Q132 -6 146 6 L150 24 Q150 32 140 32 L-135 32 Q-145 32 -145 18Z" fill="${body}"/>
    <path d="M-48 -30 L-36 -36 L-6 -36 L-6 -12 L-70 -12Z" fill="#0a0a1a" opacity=".85"/>
    <path d="M2 -36 L38 -36 Q54 -34 64 -18 L70 -12 L2 -12Z" fill="#0a0a1a" opacity=".85"/>
    <rect x="-140" y="8" width="284" height="4" fill="${accent}" opacity=".9"/>
    <circle cx="-88" cy="32" r="22" fill="#05050c"/><circle cx="-88" cy="32" r="10" fill="#2a2a44"/>
    <circle cx="88" cy="32" r="22" fill="#05050c"/><circle cx="88" cy="32" r="10" fill="#2a2a44"/>
    <path d="M142 4 L156 8 L156 16 L142 14Z" fill="#fff6c8"/>
    <path d="M156 10 L260 -6 L260 40Z" fill="#fff6c8" opacity=".12"/>
    <rect x="-146" y="6" width="8" height="10" fill="#ff2f4f"/>
  </g>`;
}

function heli(x, y, s, color, accent) {
  return `<g transform="translate(${x} ${y}) scale(${s})">
    <ellipse cx="0" cy="0" rx="34" ry="16" fill="${color}"/>
    <path d="M28 -4 L86 -8 L86 2 L28 6Z" fill="${color}"/>
    <path d="M84 -18 L92 -18 L90 4 L84 4Z" fill="${color}"/>
    <path d="M-20 -8 Q-4 -18 10 -8 L10 4 L-20 4Z" fill="${accent}" opacity=".75"/>
    <rect x="-3" y="-24" width="6" height="8" fill="${color}"/>
    <rect x="-70" y="-26" width="140" height="3" rx="1.5" fill="${color}"/>
    <path d="M-30 20 L30 20" stroke="${color}" stroke-width="3"/>
    <path d="M-12 14 L-14 20 M12 14 L14 20" stroke="${color}" stroke-width="3"/>
    <circle cx="-34" cy="2" r="3" fill="#ff2f4f"/>
  </g>`;
}

function plane(x, y, s, color) {
  return `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-60 0 L40 -6 L70 -2 L40 4Z" fill="${color}"/><path d="M-10 -2 L-30 -34 L-18 -34 L18 -3Z" fill="${color}"/><path d="M-10 2 L-28 30 L-16 30 L18 4Z" fill="${color}"/><path d="M-60 0 L-72 -14 L-62 -14 L-46 -1Z" fill="${color}"/></g>`;
}

function person(x, y, s, body, accent, kind) {
  // generic stylised silhouette figures, no real characters
  const hair = kind === 'afro' ? `<circle cx="0" cy="-118" r="34" fill="#0c0820"/>`
    : kind === 'pony' ? `<path d="M-24 -118 Q-26 -150 0 -150 Q26 -150 24 -118 L40 -92 L26 -100Z" fill="#0c0820"/>`
    : kind === 'cap' ? `<path d="M-26 -122 Q-26 -150 0 -150 Q26 -150 26 -122Z" fill="${accent}"/><rect x="-26" y="-124" width="50" height="7" rx="3" fill="${accent}"/><rect x="8" y="-122" width="30" height="5" rx="2" fill="${accent}"/>`
    : `<path d="M-24 -126 Q-24 -152 0 -152 Q24 -152 24 -126 L22 -134 Q0 -142 -22 -134Z" fill="#0c0820"/>`;
  return `<g transform="translate(${x} ${y}) scale(${s})">
    <ellipse cx="0" cy="4" rx="70" ry="9" fill="#000" opacity=".4"/>
    <path d="M-34 0 L-30 -80 L30 -80 L34 0Z" fill="#161236"/>
    <path d="M-52 -84 Q-52 -134 0 -134 Q52 -134 52 -84 L46 -22 L-46 -22Z" fill="${body}"/>
    <path d="M-52 -84 L-70 -26 L-58 -22 L-40 -70Z" fill="${body}"/><path d="M52 -84 L70 -26 L58 -22 L40 -70Z" fill="${body}"/>
    <path d="M-14 -134 L0 -100 L14 -134Z" fill="${accent}" opacity=".9"/>
    <rect x="-9" y="-146" width="18" height="16" fill="#c98a62"/>
    <ellipse cx="0" cy="-122" rx="22" ry="26" fill="#d19468"/>
    <rect x="-20" y="-126" width="16" height="6" rx="3" fill="#0a0a18"/><rect x="4" y="-126" width="16" height="6" rx="3" fill="#0a0a18"/>
    <rect x="-4" y="-124" width="8" height="2" fill="#0a0a18"/>
    ${hair}
  </g>`;
}

function neon(x, y, text, color, rot) {
  return `<g transform="translate(${x} ${y}) rotate(${rot || 0})" filter="url(#glNEON)">
    <rect x="-8" y="-34" width="${text.length * 26 + 16}" height="48" rx="6" fill="none" stroke="${color}" stroke-width="4"/>
    <text x="4" y="0" font-family="Impact, 'Arial Black', sans-serif" font-size="38" fill="${color}" letter-spacing="2">${text}</text></g>`;
}

function roadScene(id, p, r, horizonY) {
  let s = `<rect y="${horizonY}" width="${W}" height="${H - horizonY}" fill="url(#gr${id})"/>`;
  // perspective lines
  for (let i = -8; i <= 8; i++) s += `<line x1="${W / 2 + i * 22}" y1="${horizonY}" x2="${W / 2 + i * 190}" y2="${H}" stroke="${p.neon}" stroke-width="1.4" opacity=".28"/>`;
  for (let i = 1; i < 9; i++) { const y = horizonY + Math.pow(i / 9, 2.1) * (H - horizonY); s += `<line x1="0" y1="${y.toFixed(0)}" x2="${W}" y2="${y.toFixed(0)}" stroke="${p.accent}" stroke-width="1.2" opacity=".25"/>`; }
  return s;
}

function build(i, spec) {
  const id = 'a' + i;
  const r = rng(spec.seed);
  const p = PALETTES[spec.pal];
  let body = '';
  const hz = spec.horizon || 430;
  body += `<rect width="${W}" height="${H}" fill="url(#sky${id})"/>`;
  if (spec.stars) body += stars(r, 90, hz - 80);
  const sunX = spec.sunX ?? (W * (0.3 + r() * 0.4));
  body += sun(id, sunX, hz - 70 - r() * 60, 90 + r() * 40, spec.stripes).replace(/var\(--bgc\)/g, p.sky[2]);
  // clouds
  for (let c = 0; c < 4; c++) body += `<ellipse cx="${(r() * W).toFixed(0)}" cy="${(60 + r() * 200).toFixed(0)}" rx="${(90 + r() * 160).toFixed(0)}" ry="${(8 + r() * 12).toFixed(0)}" fill="#fff" opacity="${(0.05 + r() * 0.09).toFixed(2)}" filter="url(#bl${id})"/>`;

  const kind = spec.kind;
  if (kind === 'skyline' || kind === 'vehicle' || kind === 'character' || kind === 'heli' || kind === 'neon') {
    body += skyline(r, hz, p.far, 80, 250, p.accent, false);
    body += skyline(r, hz + 20, p.near, 60, 190, p.accent, true);
    body += roadScene(id, p, r, hz + 20);
  }
  if (kind === 'beach') {
    body += `<path d="M0 ${hz - 20} Q240 ${hz - 70} 480 ${hz - 25} T960 ${hz - 40} L960 ${hz + 20} L0 ${hz + 20}Z" fill="${p.far}"/>`;
    body += `<rect y="${hz}" width="${W}" height="${H - hz}" fill="${p.sky[3]}" opacity=".22"/>`;
    for (let i2 = 0; i2 < 9; i2++) body += `<rect x="${(sunX - 120 + i2 * 4).toFixed(0)}" y="${hz + 12 + i2 * 18}" width="${(240 - i2 * 20).toFixed(0)}" height="4" rx="2" fill="${p.sun[0]}" opacity="${(0.7 - i2 * 0.06).toFixed(2)}"/>`;
    body += `<path d="M0 ${hz + 140} Q300 ${hz + 100} 620 ${hz + 150} T960 ${hz + 120} L960 ${H} L0 ${H}Z" fill="${p.near}"/>`;
    body += `<path d="M0 ${hz + 200} Q320 ${hz + 170} 700 ${hz + 215} T960 ${hz + 190} L960 ${H} L0 ${H}Z" fill="${p.ground}"/>`;
  }
  if (kind === 'bridge') {
    body += skyline(r, hz + 10, p.far, 70, 180, p.accent, false);
    body += `<rect y="${hz + 10}" width="${W}" height="${H - hz}" fill="${p.ground}"/>`;
    body += `<rect y="${hz + 10}" width="${W}" height="${H - hz}" fill="${p.sky[2]}" opacity=".12"/>`;
    for (let k = 0; k < 2; k++) {
      const tx = 240 + k * 480;
      body += `<rect x="${tx}" y="${hz - 230}" width="26" height="${260}" fill="${p.near}"/><rect x="${tx + 64}" y="${hz - 230}" width="26" height="260" fill="${p.near}"/>`;
      for (let b = 0; b < 4; b++) body += `<rect x="${tx}" y="${hz - 200 + b * 56}" width="90" height="10" fill="${p.near}"/>`;
    }
    body += `<path d="M-20 ${hz + 20} Q250 ${hz - 170} 330 ${hz - 220} Q480 ${hz - 40} 700 ${hz - 220} Q780 ${hz - 170} 980 ${hz + 20}" stroke="${p.near}" stroke-width="6" fill="none"/>`;
    for (let c = 0; c < 28; c++) { const cx = 20 + c * 34; body += `<line x1="${cx}" y1="${hz + 20}" x2="${cx}" y2="${hz + 5 - Math.abs(Math.sin(c / 4.4)) * 120}" stroke="${p.near}" stroke-width="1.5" opacity=".7"/>`; }
    body += `<rect x="-10" y="${hz + 20}" width="${W + 20}" height="16" fill="${p.near}"/>`;
    for (let c = 0; c < 18; c++) body += `<rect x="${c * 55 + 10}" y="${hz + 26}" width="14" height="3" fill="${p.neon}" opacity=".9"/>`;
    for (let c = 0; c < 14; c++) body += `<rect x="${(r() * W).toFixed(0)}" y="${(hz + 60 + r() * 200).toFixed(0)}" width="${(30 + r() * 70).toFixed(0)}" height="3" rx="1.5" fill="${p.sun[1]}" opacity="${(0.15 + r() * 0.25).toFixed(2)}"/>`;
  }
  if (kind === 'topdown') {
    body = `<rect width="${W}" height="${H}" fill="${p.ground}"/>`;
    const sets = { night:['#1f3a6b','#2b4c8f','#5b2a86','#8a2f6a','#14506b','#3a2f7a'], smog:['#5a4b63','#7a5a6a','#8a6a4a','#4a4a5a','#9a5a5a','#6a5a7a'], dawn:['#c76a9a','#7a5ad1','#e0a36a','#5a8ad1','#d1557a','#9a7ae0'], teal:['#2e6f40','#3c8d52','#1f6a7a','#2a8a8a','#c9a227','#8a2f45'], gold:['#a3322b','#c9731f','#c9a227','#6b4a1f','#2e6f40','#8a2f45'] };
    const cols = sets[spec.pal] || sets.teal;
    const bs = 120;
    for (let gx = 0; gx < W / bs + 1; gx++) for (let gy = 0; gy < H / bs + 1; gy++) {
      const x = gx * bs, y = gy * bs;
      body += `<rect x="${x + 14}" y="${y + 14}" width="${bs - 28}" height="${bs - 28}" fill="${cols[Math.floor(r() * cols.length)]}" opacity=".82"/>`;
      if (r() > 0.55) body += `<rect x="${x + 26}" y="${y + 26}" width="${bs - 52}" height="${bs - 52}" fill="#0b0b1a" opacity=".45"/>`;
    }
    body += `<rect x="0" y="${bs * 2 - 14}" width="${W}" height="28" fill="#1a1a2a"/><rect x="${bs * 3 - 14}" y="0" width="28" height="${H}" fill="#1a1a2a"/>`;
    for (let d = 0; d < W; d += 40) body += `<rect x="${d}" y="${bs * 2 - 2}" width="20" height="4" fill="#ffd166"/>`;
    for (let d = 0; d < H; d += 40) body += `<rect x="${bs * 3 - 2}" y="${d}" width="4" height="20" fill="#ffd166"/>`;
    const cc = ['#ffd166', '#ff3d8b', '#33f5ff', '#ffffff', '#ff7a59'];
    for (let c = 0; c < 9; c++) {
      const horiz = r() > 0.5; const cx = horiz ? r() * W : bs * 3 + (r() > 0.5 ? 6 : -6); const cy = horiz ? bs * 2 + (r() > 0.5 ? 6 : -6) : r() * H;
      const col = cc[Math.floor(r() * cc.length)];
      body += horiz ? `<rect x="${cx.toFixed(0)}" y="${(cy - 8).toFixed(0)}" width="44" height="18" rx="4" fill="${col}"/><rect x="${(cx + 12).toFixed(0)}" y="${(cy - 6).toFixed(0)}" width="18" height="14" fill="#0b0b1a" opacity=".6"/>`
        : `<rect x="${(cx - 8).toFixed(0)}" y="${cy.toFixed(0)}" width="18" height="44" rx="4" fill="${col}"/><rect x="${(cx - 6).toFixed(0)}" y="${(cy + 12).toFixed(0)}" width="14" height="18" fill="#0b0b1a" opacity=".6"/>`;
    }
    body += `<rect width="${W}" height="${H}" fill="url(#vig${id})"/>`;
  }
  if (kind === 'grid') {
    body += `<rect y="${hz}" width="${W}" height="${H - hz}" fill="${p.ground}"/>`;
    for (let i2 = -14; i2 <= 14; i2++) body += `<line x1="${W / 2 + i2 * 18}" y1="${hz}" x2="${W / 2 + i2 * 150}" y2="${H}" stroke="${p.neon}" stroke-width="2" opacity=".6"/>`;
    for (let i2 = 0; i2 < 12; i2++) { const y = hz + Math.pow(i2 / 12, 2) * (H - hz); body += `<line x1="0" y1="${y.toFixed(0)}" x2="${W}" y2="${y.toFixed(0)}" stroke="${p.accent}" stroke-width="2" opacity=".5"/>`; }
    body += `<path d="M0 ${hz} L120 ${hz - 120} L210 ${hz - 40} L330 ${hz - 160} L430 ${hz} Z" fill="${p.far}"/><path d="M560 ${hz} L690 ${hz - 150} L780 ${hz - 70} L880 ${hz - 130} L960 ${hz}Z" fill="${p.far}"/>`;
  }
  if (kind === 'hills') {
    body += `<path d="M0 ${hz + 40} L120 ${hz - 60} L260 ${hz - 10} L420 ${hz - 120} L560 ${hz - 30} L720 ${hz - 100} L960 ${hz + 20} L960 ${H} L0 ${H}Z" fill="${p.far}"/>`;
    body += `<path d="M0 ${hz + 120} Q200 ${hz + 20} 420 ${hz + 90} T960 ${hz + 60} L960 ${H} L0 ${H}Z" fill="${p.near}"/>`;
    body += skyline(r, hz + 160, p.ground, 30, 90, p.accent, true);
    body += `<rect y="${hz + 160}" width="${W}" height="${H - hz - 160}" fill="${p.ground}"/>`;
    for (let k = 0; k < 7; k++) body += `<circle cx="${(60 + k * 140)}" cy="${hz + 205 + (k % 2) * 10}" r="4" fill="${p.accent}" opacity=".9" filter="url(#gl${id})"/>`;
  }

  // foreground subjects
  if (kind === 'vehicle') body += car(W * 0.5 + (r() - 0.5) * 80, 560 + r() * 30, 1.5, spec.body || p.neon, p.accent, spec.flip) + `<rect x="0" y="${600}" width="${W}" height="120" fill="${p.neon}" opacity=".05"/>`;
  if (kind === 'heli') { body += heli(W * 0.58, 250, 2.4, '#0b0820', p.accent); body += car(300, 600, 1.05, p.neon, p.accent, false); }
  if (kind === 'character') {
    body += person(W * 0.5 + (r() - 0.5) * 120, 640, 2.6, spec.body || p.neon, p.accent, spec.hair);
    if (spec.second) body += person(W * 0.2, 650, 1.9, p.accent, p.neon, 'cap') + person(W * 0.8, 650, 1.9, p.neon, p.accent, 'pony');
  }
  if (kind === 'neon') {
    body += `<defs><filter id="glNEON" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;
    body += neon(W * 0.5 - (spec.neonText.length * 26) / 2, 250, spec.neonText, p.neon, -4);
    body += car(W * 0.5, 600, 1.4, p.accent, p.neon, true);
  }
  if (kind === 'beach' || kind === 'hills' || kind === 'vehicle' || kind === 'character') {
    const n = spec.palms ?? 4;
    for (let k = 0; k < n; k++) body += palm(40 + r() * (W - 80), hz + 190 + r() * 120, 240 + r() * 190, (r() - 0.5) * 80, p.ground);
  }
  if (spec.heliSky) body += heli(180 + r() * 600, 120 + r() * 90, 0.9, '#0b0820', p.accent);
  if (spec.plane) body += plane(120 + r() * 700, 100 + r() * 100, 0.8, '#0b0820');
  if (kind === 'beach' && spec.person) body += person(W * 0.5, 650, 2.2, p.neon, p.accent, spec.hair);

  // grain / vignette
  body += `<rect width="${W}" height="${H}" fill="url(#vig${id})"/>`;

  const defs = skyDefs(id, p) + `<radialGradient id="vig${id}" cx=".5" cy=".5" r=".75"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></radialGradient>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"><defs>${defs}</defs>${body}</svg>`;
}

// 40 artwork specs. era: gta1..gta6 etc.
const specs = [
  { t: 'Vice City Sunset', era: 'vice', cat: 'Locations', kind: 'hills', pal: 'vice', seed: 11, stripes: true, palms: 5 },
  { t: 'Neon Boulevard', era: 'vice', cat: 'Locations', kind: 'neon', pal: 'vice', seed: 12, neonText: 'MIAMI', stars: true },
  { t: 'Ocean Drive Cruiser', era: 'vice', cat: 'Vehicles', kind: 'vehicle', pal: 'sunset', seed: 13, body: '#ff3d8b', stripes: true, palms: 3 },
  { t: 'Pastel Strip Nights', era: 'vice', cat: 'Locations', kind: 'beach', pal: 'vice', seed: 14, stripes: true, palms: 5 },
  { t: 'Shirt & Shades', era: 'vice', cat: 'Characters', kind: 'character', pal: 'vice', seed: 15, body: '#14b8a6', hair: 'cap', stripes: true },
  { t: 'Skyline Patrol', era: 'vice', cat: 'Artwork', kind: 'heli', pal: 'night', seed: 16, stars: true },
  { t: 'Coral Pier', era: 'vice', cat: 'Locations', kind: 'beach', pal: 'dawn', seed: 17, palms: 3 },
  { t: 'Hotel Neon Rooftop', era: 'vice', cat: 'Locations', kind: 'neon', pal: 'night', seed: 18, neonText: 'HOTEL', stars: true },

  { t: 'Hoodside Heights', era: 'sa', cat: 'Locations', kind: 'hills', pal: 'gold', seed: 21, palms: 4 },
  { t: 'Low & Slow', era: 'sa', cat: 'Vehicles', kind: 'vehicle', pal: 'gold', seed: 22, body: '#7c3aed', palms: 4 },
  { t: 'Block Legend', era: 'sa', cat: 'Characters', kind: 'character', pal: 'sunset', seed: 23, body: '#e8e8f4', hair: 'cap', palms: 3 },
  { t: 'Desert Highway Run', era: 'sa', cat: 'Artwork', kind: 'grid', pal: 'gold', seed: 24, stripes: true },
  { t: 'Gold Hour Crew', era: 'sa', cat: 'Characters', kind: 'character', pal: 'gold', seed: 25, body: '#f97316', hair: 'afro', second: true },
  { t: 'Lowrider Dusk', era: 'sa', cat: 'Vehicles', kind: 'vehicle', pal: 'smog', seed: 26, body: '#22d3ee', flip: true },
  { t: 'Overpass Echo', era: 'sa', cat: 'Locations', kind: 'bridge', pal: 'smog', seed: 27 },

  { t: 'Liberty Fog', era: 'iv', cat: 'Locations', kind: 'bridge', pal: 'smog', seed: 31 },
  { t: 'Rain on the Bridge', era: 'iv', cat: 'Locations', kind: 'bridge', pal: 'night', seed: 32, stars: true },
  { t: 'Trench Coat Stranger', era: 'iv', cat: 'Characters', kind: 'character', pal: 'smog', seed: 33, body: '#3b3a4f', hair: 'short' },
  { t: 'Harbor Lights', era: 'iv', cat: 'Locations', kind: 'bridge', pal: 'teal', seed: 34 },
  { t: 'Night Shift Taxi', era: 'iv', cat: 'Vehicles', kind: 'vehicle', pal: 'night', seed: 35, body: '#fbbf24', stars: true, palms: 0 },
  { t: 'Concrete Dawn', era: 'iv', cat: 'Artwork', kind: 'skyline', pal: 'dawn', seed: 36, heliSky: true },

  { t: 'Los Santos Skyline', era: 'v', cat: 'Locations', kind: 'hills', pal: 'sunset', seed: 41, palms: 4 },
  { t: 'Three Of A Kind', era: 'v', cat: 'Characters', kind: 'character', pal: 'sunset', seed: 42, body: '#2563eb', hair: 'short', second: true },
  { t: 'Canyon Chase', era: 'v', cat: 'Vehicles', kind: 'vehicle', pal: 'gold', seed: 43, body: '#ef4444', plane: true },
  { t: 'Sandy Shores Dusk', era: 'v', cat: 'Locations', kind: 'beach', pal: 'gold', seed: 44, palms: 2 },
  { t: 'Heist Night', era: 'v', cat: 'Artwork', kind: 'heli', pal: 'night', seed: 45, stars: true },
  { t: 'Boulevard Noon', era: 'v', cat: 'Locations', kind: 'skyline', pal: 'teal', seed: 46, heliSky: true },

  { t: 'Vice City Beach', era: 'vi', cat: 'Locations', kind: 'beach', pal: 'vice', seed: 51, stripes: true, person: true, hair: 'pony', palms: 4 },
  { t: 'Neon Rider', era: 'vi', cat: 'Vehicles', kind: 'vehicle', pal: 'grid', seed: 52, body: '#d946ef', stripes: true, palms: 3 },
  { t: 'Sun-Drenched Duo', era: 'vi', cat: 'Characters', kind: 'character', pal: 'vice', seed: 53, body: '#ec4899', hair: 'pony', second: true, stripes: true },
  { t: 'Midnight Marina', era: 'vi', cat: 'Locations', kind: 'beach', pal: 'night', seed: 54, stars: true, palms: 3 },
  { t: 'Chrome Horizon', era: 'vi', cat: 'Artwork', kind: 'grid', pal: 'grid', seed: 55, stripes: true, stars: true },
  { t: 'Glow Strip', era: 'vi', cat: 'Locations', kind: 'neon', pal: 'grid', seed: 56, neonText: 'VICE', stars: true },

  { t: 'Retro Block Party', era: 'g2', cat: 'Artwork', kind: 'topdown', pal: 'night', seed: 61 },
  { t: 'Rooftop Run', era: 'g2', cat: 'Artwork', kind: 'topdown', pal: 'smog', seed: 62 },
  { t: 'Classic Loop', era: 'g2', cat: 'Vehicles', kind: 'topdown', pal: 'dawn', seed: 63 },

  { t: 'Original Streets', era: 'g1', cat: 'Artwork', kind: 'topdown', pal: 'teal', seed: 71 },
  { t: 'Pixel Intersection', era: 'g1', cat: 'Locations', kind: 'topdown', pal: 'gold', seed: 72 },

  { t: 'Port Authority', era: 'g3', cat: 'Locations', kind: 'bridge', pal: 'night', seed: 81, stars: true },
  { t: 'Chinatown Alley', era: 'g3', cat: 'Locations', kind: 'neon', pal: 'smog', seed: 82, neonText: 'OPEN' },
];

if (specs.length !== 40) throw new Error('Expected 40 specs, got ' + specs.length);

specs.forEach((sp, i) => {
  const file = path.join(out, 'art', `art-${String(i + 1).padStart(2, '0')}.svg`);
  fs.writeFileSync(file, build(i + 1, sp));
});

// hero banners: wide format
const heroSpecs = [
  { name: 'hero-home', kind: 'skyline', pal: 'vice', seed: 901, stripes: true, palms: 4 },
  { name: 'hero-explore', kind: 'hills', pal: 'sunset', seed: 902, heliSky: true, palms: 4 },
  { name: 'hero-collections', kind: 'beach', pal: 'vice', seed: 903, stripes: true, palms: 5 },
  { name: 'hero-auctions', kind: 'neon', pal: 'grid', seed: 904, neonText: 'LIVE', stars: true },
  { name: 'hero-create', kind: 'skyline', pal: 'dawn', seed: 905, heliSky: true, plane: true },
];
heroSpecs.forEach((h, i) => {
  fs.writeFileSync(path.join(out, 'hero', h.name + '.svg'), build(100 + i, h));
});

// catalog metadata consumed by js/data.js
fs.writeFileSync(path.join(__dirname, 'specs.json'), JSON.stringify(specs.map((s, i) => ({ n: i + 1, t: s.t, era: s.era, cat: s.cat })), null, 2));
console.log('Generated', specs.length, 'artworks and', heroSpecs.length, 'hero banners');
