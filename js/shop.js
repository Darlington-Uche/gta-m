/* Explore + Offers: server-side filtering, sorting and "load more" */
(function () {
  const G = window.GTA, { D, $, $$, esc, card, API, S } = G;
  const mode = $('.shop').dataset.mode; // 'all' (Explore) | 'auctions' (the Offers page: NFTs that have offers)
  const params = new URLSearchParams(location.search);
  const PAGE = 12;
  const f = { eras: params.get('era') ? params.get('era').split(',') : [], cats: [], rar: [], status: params.get('status') || '', min: '', max: '', q: params.get('q') || '' };
  let sort = mode === 'auctions' ? 'offers' : 'recent', view = 'grid', page = 1, rows = [], total = 0, loading = false, seq = 0;

  const cats = ['Characters', 'Vehicles', 'Locations', 'Weapons', 'Artwork'];
  const rars = ['Common', 'Rare', 'Epic', 'Legendary'];
  const statuses = [['', 'All'], ['unminted', 'Available to mint'], ['free', 'Free mint'], ['listed', 'For sale'], ['minted', 'Already minted']];
  const eraKeys = () => Object.keys(D.eras);

  function chk(group, val, label, checked) { return `<label class="chk"><input type="checkbox" data-g="${group}" value="${val}" ${checked ? 'checked' : ''}>${label}</label>`; }
  function drawFilters() {
    $('#fEra').innerHTML = chk('eras', '', 'All Eras', !f.eras.length) + eraKeys().map((k) => chk('eras', k, esc(D.eras[k]), f.eras.includes(k))).join('');
    $('#fCat').innerHTML = chk('cats', '', 'All', !f.cats.length) + cats.map((c) => chk('cats', c, c, f.cats.includes(c))).join('');
    $('#fRar').innerHTML = chk('rar', '', 'All', !f.rar.length) + rars.map((c) => chk('rar', c, c, f.rar.includes(c))).join('');
    if (mode === 'auctions') $('#fTypeG').style.display = 'none';
    else $('#fType').innerHTML = statuses.map((t) => `<label class="chk"><input type="radio" name="type" style="border-radius:50%" data-t value="${t[0]}" ${f.status === t[0] ? 'checked' : ''}>${t[1]}</label>`).join('');
    $('#pMin').value = f.min; $('#pMax').value = f.max;
  }
  function drawRail() {
    const cols = S.collections.length ? S.collections : eraKeys().map((k) => ({ era: k, short: D.eraShort[k], cover: null }));
    const items = [['', 'All', 'Every era', D.allCover || (cols[0] && cols[0].cover) || '', (cols[0] && cols[0].cover) || ''], ...cols.filter((c) => D.eras[c.era]).map((c) => [c.era, c.short || D.eraShort[c.era], D.eras[c.era].match(/\((\d+)\)/)[1], c.cover || ''])];
    $('#eraRail').innerHTML = items.map((e) => `<div class="era-chip ${(!f.eras.length && !e[0]) || (f.eras.length === 1 && f.eras[0] === e[0]) ? 'active' : ''}" data-era="${e[0]}" tabindex="0">${e[3] ? `${window.GTA.imgTag(e[3], "", 160, "", e[4])}` : ''}<div><b>${esc(e[1])}</b><small>${e[2]}</small></div></div>`).join('');
  }
  function query() {
    const q = { sort, page, limit: PAGE };
    if (f.eras.length) q.era = f.eras.join(',');
    if (f.cats.length) q.category = f.cats.join(',');
    if (f.rar.length) q.rarity = f.rar.join(',');
    if (f.q) q.q = f.q;
    if (f.min !== '') q.minUsd = f.min;
    if (f.max !== '') q.maxUsd = f.max;
    if (mode === 'auctions') { q.status = 'minted'; q.hasOffers = 'true'; } else if (f.status) q.status = f.status;
    return q;
  }
  function drawChips() {
    const chips = [];
    f.eras.forEach((k) => chips.push(['eras', k, D.eras[k] || k]));
    f.cats.forEach((k) => chips.push(['cats', k, k]));
    f.rar.forEach((k) => chips.push(['rar', k, k]));
    if (f.status && mode !== 'auctions') chips.push(['status', '', (statuses.find((s) => s[0] === f.status) || [])[1]]);
    if (f.q) chips.push(['q', '', '“' + f.q + '”']);
    if (f.min !== '' || f.max !== '') chips.push(['price', '', '$' + (f.min || 0) + '–' + (f.max ? '$' + f.max : '∞')]);
    $('#chips').innerHTML = chips.map((c) => `<span class="chip" data-g="${c[0]}" data-v="${esc(c[1])}">${esc(c[2])} ✕</span>`).join('');
  }
  function paint() {
    const el = $('#results');
    el.className = 'grid' + (view === 'list' ? ' cols-list' : '');
    $('#count').textContent = total.toLocaleString();
    if (loading && !rows.length) el.innerHTML = Array.from({ length: 6 }, () => '<div class="card skeleton" style="min-height:300px"></div>').join('');
    else el.innerHTML = rows.length ? rows.map(card).join('') : `<div class="empty" style="grid-column:1/-1"><b>${mode === 'auctions' ? 'No offers on the table yet' : 'Nothing found'}</b>${mode === 'auctions' ? 'When collectors make offers on minted NFTs they show up here.' : 'Try loosening your filters.'}</div>`;
    $('#more').parentElement.style.display = rows.length < total ? '' : 'none';
    $('#more').disabled = loading;
    drawChips(); drawRail();
  }
  async function load(reset) {
    if (reset) { page = 1; rows = []; total = 0; }
    const my = ++seq; loading = true; paint();
    try {
      const r = await API.items(query());
      if (my !== seq) return;
      rows = reset ? r.items : rows.concat(r.items); total = r.total;
    } catch (e) { if (my === seq) { G.toast(e.message, 'bad'); } }
    loading = false; paint();
  }

  // events
  $('#filters').addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.t !== undefined) { f.status = t.value; load(true); return; }
    const g = t.dataset.g; if (!g) return;
    if (t.value === '') f[g] = [];
    else { const i = f[g].indexOf(t.value); if (t.checked && i < 0) f[g].push(t.value); if (!t.checked && i > -1) f[g].splice(i, 1); }
    drawFilters(); load(true);
  });
  let pt;
  ['#pMin', '#pMax'].forEach((s) => $(s).addEventListener('input', (e) => { f[s === '#pMin' ? 'min' : 'max'] = e.target.value; clearTimeout(pt); pt = setTimeout(() => load(true), 350); }));
  $('#resetF').addEventListener('click', () => { Object.assign(f, { eras: [], cats: [], rar: [], status: '', min: '', max: '', q: '' }); drawFilters(); load(true); });
  $('#eraRail').addEventListener('click', (e) => { const c = e.target.closest('[data-era]'); if (!c) return; f.eras = c.dataset.era ? [c.dataset.era] : []; drawFilters(); load(true); });
  $('#chips').addEventListener('click', (e) => {
    const c = e.target.closest('.chip'); if (!c) return;
    const g = c.dataset.g, v = c.dataset.v;
    if (g === 'q') f.q = ''; else if (g === 'status') f.status = ''; else if (g === 'price') { f.min = ''; f.max = ''; } else f[g] = f[g].filter((x) => x !== v);
    drawFilters(); load(true);
  });
  $('#sort').value = sort;
  $('#sort').addEventListener('change', (e) => { sort = e.target.value; load(true); });
  $$('.seg [data-view]').forEach((b) => b.addEventListener('click', () => { view = b.dataset.view; $$('.seg [data-view]').forEach((x) => x.classList.toggle('on', x === b)); paint(); }));
  $('#more').addEventListener('click', () => { page++; load(false); });
  $('#openF').addEventListener('click', () => { $('#filters').classList.add('open'); $('#overlay').classList.add('open'); });
  $('#closeF').addEventListener('click', () => { $('#filters').classList.remove('open'); $('#overlay').classList.remove('open'); });
  document.addEventListener('gta:auth', () => paint());

  // Offers page: show whether the bidding window is open
  function windowNote() {
    if (mode !== 'auctions') return;
    const w = G.offerWindow(), el = $('#winNote');
    if (el) { el.hidden = !w.enabled; el.textContent = w.text; el.className = 'win-note ' + (w.open ? 'open' : 'closed'); }
  }
  document.addEventListener('gta:tick', windowNote);

  G.ready.then(() => { drawFilters(); drawRail(); windowNote(); load(true); });
})();
