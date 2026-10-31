(function () {
  const G = window.GTA, { D, $, $$, esc, colCard, S } = G;
  const rail = $('#eraRail');
  let era = new URLSearchParams(location.search).get('era') || '';
  let sort = 'trending';

  function draw() {
    const cols = S.collections.filter((c) => D.eras[c.era]);
    const eras = [['', 'All', 'All Collections', (cols[0] || {}).cover], ...cols.map((c) => [c.era, c.short || D.eraShort[c.era], D.eras[c.era].match(/\((\d+)\)/)[1], c.cover])];
    rail.innerHTML = eras.map((e) => `<div class="era-chip ${e[0] === era ? 'active' : ''}" data-era="${e[0]}" tabindex="0">${e[3] ? `<img src="${esc(e[3])}" alt="">` : ''}<div><b>${esc(e[1])}</b><small>${e[2]}</small></div></div>`).join('');
    let list = S.collections.filter((c) => !era || c.era === era);
    if (sort === 'trending') list = [...list].sort((a, b) => (b.volumeUsd || 0) - (a.volumeUsd || 0) || (b.items || 0) - (a.items || 0));
    if (sort === 'minted') list = [...list].sort((a, b) => (b.minted || 0) - (a.minted || 0));
    if (sort === 'new') list = [...list].reverse();
    $('#colGrid').innerHTML = list.length ? list.map(colCard).join('') : '<div class="empty" style="grid-column:1/-1"><b>No collections</b>Try another era.</div>';
  }
  rail.addEventListener('click', (e) => { const c = e.target.closest('[data-era]'); if (c) { era = c.dataset.era; draw(); } });
  $('#colSort').addEventListener('click', (e) => { const b = e.target.closest('[data-s]'); if (!b) return; sort = b.dataset.s; $$('#colSort button').forEach((x) => x.classList.toggle('on', x === b)); draw(); });
  G.ready.then(draw);
})();
