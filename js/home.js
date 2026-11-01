(function () {
  const G = window.GTA, { D, $, esc, card, colCard, API, S, fmtUsd } = G;

  G.ready.then(async () => {
    // stats
    const st = await API.stats().catch(() => null);
    $('#stArt').textContent = st ? st.items : D.art.filter((a) => !a.placeholder).length;
    $('#stCol').textContent = S.collections.length;
    $('#stVol').textContent = st ? '$' + Math.round(st.volumeUsd).toLocaleString() : '—';

    // era rail -> links to explore
    const cols = S.collections.filter((c) => D.eras[c.era]);
    $('#eraRail').innerHTML = [['', 'All', 'Every era', D.allCover || (cols[0] || {}).cover, (cols[0] || {}).cover], ...cols.map((c) => [c.era, c.short || D.eraShort[c.era], D.eras[c.era].match(/\((\d+)\)/)[1], c.cover])]
      .map((e) => `<a class="era-chip" href="explore.html${e[0] ? '?era=' + e[0] : ''}">${e[3] ? `${window.GTA.imgTag(e[3], "", 160, "", e[4])}` : ''}<div><b>${esc(e[1])}</b><small>${e[2]}</small></div></a>`).join('');

    // featured: NFTs with the most offers, topped up with the most liked
    const hot = await API.items({ sort: 'offers', status: 'minted', hasOffers: 'true', limit: 5 }).catch(() => ({ items: [] }));
    let feat = hot.items;
    if (feat.length < 5) {
      const more = await API.items({ sort: 'liked', limit: 8 }).catch(() => ({ items: [] }));
      feat = feat.concat(more.items.filter((x) => !feat.some((f) => f.id === x.id))).slice(0, 5);
    }
    if (feat.length) {
      const f = feat[0], [label, main, sub] = G.priceBlock(f);
      $('#featured').innerHTML = `
      <a class="feat-main" href="artwork.html?id=${encodeURIComponent(f.id)}">${window.GTA.imgTag(f.img, f.title, 900, ' fetchpriority="high"')}
        <div class="feat-info"><div><span class="pill">${esc(f.eraLabel)}</span><h3 style="margin-top:8px">${esc(f.title)}</h3><div class="by" style="color:#d6d1ec">By <b>${esc(f.artist)}</b></div></div>
        <div><div class="price-row" style="text-align:right">${label}</div><div class="price" style="font-size:26px">${main}</div>${sub ? `<div class="usd-sub" style="text-align:right">${sub}</div>` : ''}</div></div></a>
      <div class="feat-side">${feat.slice(1, 5).map((a) => { const [l2, m2] = G.priceBlock(a); return `<a class="mini-row" href="artwork.html?id=${encodeURIComponent(a.id)}">${window.GTA.imgTag(a.img, "", 160)}<div style="flex:1;min-width:0"><h4>${esc(a.title)}</h4><small>${esc(a.eraShort)} · ${esc(a.category)}</small><div class="price">${m2}</div></div><span class="timer st-${a.state}" style="position:static;transform:none;font-size:11px">${esc(G.stateChip(a))}</span></a>`; }).join('')}</div>`;
    }

    // trending = most liked
    const tr = await API.items({ sort: 'liked', limit: 8 }).catch(() => ({ items: [] }));
    $('#trending').innerHTML = tr.items.map(card).join('');

    // hot collections
    $('#hotCols').innerHTML = [...S.collections].sort((a, b) => (b.volumeUsd || 0) - (a.volumeUsd || 0) || (b.items || 0) - (a.items || 0)).slice(0, 3).map(colCard).join('');
  });
})();
