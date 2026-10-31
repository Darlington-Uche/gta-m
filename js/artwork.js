/* Artwork detail: mint, make an offer, buy at sale price, and (for the owner) accept offers + set a sale price */
(function () {
  const G = window.GTA, { $, $$, esc, fmtUsd, fmtSol, short, sol, I, card, API, S, toast, needWallet, runTx, call } = G;
  const id = new URLSearchParams(location.search).get('id');
  const root = $('#detailRoot');
  let a = null, offers = [];

  const solUsd = () => (S.meta && S.meta.solUsd) || null;
  const usdToSol = (usd) => (solUsd() ? fmtSol(usd / solUsd()) : null);
  const minOffer = () => (S.meta && S.meta.settings && S.meta.settings.minOfferUsd) || 1;
  const explorer = (addr) => `https://explorer.solana.com/address/${addr}${S.meta && S.meta.network === 'devnet' ? '?cluster=devnet' : ''}`;
  const isOwner = () => !!(S.wallet && a.owner === S.wallet);
  const myOffers = () => offers.filter((o) => o.bidder === S.wallet);
  const solLine = (usd) => { const s = usdToSol(usd); return s ? `≈ ${sol}${s} SOL` : ''; };

  /* ---------- the action box (depends on state + who is looking) ---------- */
  function boxMint() {
    const free = a.free, price = a.priceUsd;
    const can = a.mintable && !API.isDemo;
    const why = API.isDemo ? 'Demo mode — connect the backend to mint.' : !a.collection.live ? `The ${esc(a.collection.name || a.eraShort)} collection is not live yet. Check back soon.` : !a.mintable ? 'Not available right now.' : '';
    return `<div class="bid-top"><div><small>${free ? 'Mint' : 'Mint price'}</small><div class="big-price">${free ? 'Free' : fmtUsd(price)}</div>${free ? '' : `<small class="usd-sub" style="text-transform:none;letter-spacing:0">${solLine(price)}</small>`}</div>
      <div><small>Owner</small><div class="big-price" style="font-size:18px">None yet</div><small style="text-transform:none;letter-spacing:0">Mint it and it's yours</small></div></div>
      <div class="bid-form"><button class="btn btn-primary btn-lg btn-block" id="mintBtn" ${can ? '' : 'disabled'}>${free ? 'Mint for free' : 'Mint now'}</button></div>
      <p class="hint">${why || 'This artwork only exists on-chain once someone mints it. You pay the price shown plus the tiny Solana network fee, and you become the owner the moment the transaction confirms.' + (free ? ' Free mints are limited per wallet.' : '')}</p>`;
  }
  function boxOwner() {
    const l = a.listing, top = offers[0];
    const incoming = offers.length ? `<div class="own-offers"><h4>Offers on your NFT</h4>${offers.map((o) => `<div class="own-offer"><div><b>${fmtUsd(o.usd)}</b> <small class="muted">${sol}${fmtSol(o.sol)} SOL · ${short(o.bidder)} · ${G.ago(o.createdAt)}</small></div><div class="row-btns"><button class="btn btn-primary btn-sm" data-accept="${o.id}">Accept</button><button class="btn btn-glass btn-sm" data-reject="${o.id}">Decline</button></div></div>`).join('')}<p class="hint">Accepting sends the NFT to the bidder and pays you from escrow, minus ${(S.meta.settings.saleFeeBps / 100).toFixed(1)}% platform fee and a ~$${S.meta.settings.acceptFeeUsd} network fee. Every other offer is refunded automatically.</p></div>` : '<p class="hint">No offers yet. Collectors can make an offer any time — you don\'t need to list it.</p>';
    return `<div class="bid-top"><div><small>You own this</small><div class="big-price" style="font-size:22px">${top ? 'Top offer ' + fmtUsd(top.usd) : 'No offers yet'}</div></div>
      <div><small>Sale price</small><div class="big-price" style="font-size:22px">${l ? fmtUsd(l.priceUsd) : 'Not set'}</div>${l ? `<small class="usd-sub" style="text-transform:none;letter-spacing:0">${solLine(l.priceUsd)}</small>` : ''}</div></div>
      <div class="bid-form"><div class="field" style="margin:0"><input id="saleAmt" type="number" min="${minOffer()}" step="1" value="${l ? l.priceUsd : ''}" placeholder="Sale price" inputmode="decimal" aria-label="Sale price in USD"><span class="unit">USD</span></div><button class="btn btn-primary btn-lg" id="saleBtn">${l ? 'Update' : 'Set price'}</button></div>
      ${l ? '<button class="btn btn-glass btn-block" id="unlistBtn" style="margin-top:10px">Remove sale price</button>' : ''}
      <p class="hint">${l ? 'Anyone can buy instantly at this price. You can still accept offers.' : 'Optional. Setting a price asks you to approve once in your wallet so the buyer\'s payment and the NFT transfer happen together.'}</p>
      ${incoming}`;
  }
  function boxBuyer() {
    const l = a.listing, w = G.offerWindow(), mine = myOffers();
    const top = offers[0];
    const sug = Math.max(minOffer(), top ? Math.ceil(top.usd * 1.05) : minOffer());
    const buy = l ? `<div class="bid-top"><div><small>Sale price</small><div class="big-price">${fmtUsd(l.priceUsd)}</div><small class="usd-sub" style="text-transform:none;letter-spacing:0">${solLine(l.priceUsd)}</small></div>
      <div><small>Owner</small><div class="big-price" style="font-size:18px">${short(a.owner)}</div></div></div>
      <div class="bid-form"><button class="btn btn-primary btn-lg btn-block" id="buyBtn" ${API.isDemo ? 'disabled' : ''}>Buy now</button></div>` : `<div class="bid-top"><div><small>Owner</small><div class="big-price" style="font-size:20px">${short(a.owner)}</div></div>
      <div><small>Top offer</small><div class="big-price" style="font-size:20px">${top ? fmtUsd(top.usd) : 'None yet'}</div></div></div>`;
    const myBlock = mine.length ? `<div class="own-offers"><h4>Your offers</h4>${mine.map((o) => `<div class="own-offer"><div><b>${fmtUsd(o.usd)}</b> <small class="muted">${sol}${fmtSol(o.sol)} SOL in escrow · ${G.ago(o.createdAt)}</small></div><button class="btn btn-glass btn-sm" data-cancel="${o.id}">Cancel &amp; refund</button></div>`).join('')}</div>` : '';
    return `${buy}
      <div class="offer-box"><label for="offerAmt">${l ? 'Or make an offer' : 'Make an offer'}</label>
        <div class="bid-form"><div class="field" style="margin:0"><input id="offerAmt" type="number" min="${minOffer()}" step="1" value="${sug}" inputmode="decimal" aria-label="Offer in USD"><span class="unit">USD</span></div><button class="btn ${l ? 'btn-glass' : 'btn-primary'} btn-lg" id="offerBtn" ${API.isDemo || !w.open ? 'disabled' : ''}>Make offer</button></div>
        <div class="quick-bids"><button data-add="1">+$1</button><button data-add="5">+$5</button><button data-add="25">+$25</button></div>
        <p class="hint" id="offerHint"></p>
        ${w.enabled ? `<p class="win-note ${w.open ? 'open' : 'closed'}" data-win>${esc(w.text)}</p>` : ''}</div>
      ${myBlock}`;
  }

  function renderOffersTab() {
    return offers.length ? `<ul class="bid-list">${offers.map((o) => `<li><span class="av">${esc(o.bidder.slice(0, 2).toUpperCase())}</span><span class="who"><b style="font-weight:600">${short(o.bidder)}${o.bidder === S.wallet ? ' (you)' : ''}</b><small>${G.ago(o.createdAt)}</small></span><b>${fmtUsd(o.usd)} <small class="muted">${sol}${fmtSol(o.sol)}</small></b></li>`).join('')}</ul>` : '<p class="muted">No offers yet.</p>';
  }

  function render() {
    document.title = a.title + ' — GTA Marketplace';
    const box = a.state === 'mint' ? boxMint() : isOwner() ? boxOwner() : boxBuyer();
    const tags = a.tags.filter((t) => t !== 'placeholder').map((t) => `<span class="pill">#${esc(t.replace(/\s/g, ''))}</span>`).join('');
    root.innerHTML = `
    <div class="detail">
      <div class="gallery"><div class="main"><img id="mainImg" src="${esc(a.img)}" alt="${esc(a.title)}"></div></div>
      <div class="info">
        <div class="crumbs"><a href="index.html">Home</a> / <a href="explore.html?era=${esc(a.era)}">${esc(a.eraShort)}</a> / ${esc(a.title)}</div>
        <h1>${esc(a.title)}</h1>
        <div class="by">By <b>${esc(a.artist)}</b>${I.check}<span style="margin-left:10px;display:inline-flex;gap:5px;align-items:center;cursor:pointer" id="likeBtn" data-like="${esc(a.id)}" class="like-inline">${I.heart.replace('<svg', '<svg width="15" height="15"')} <span>${a.likes}</span></span></div>
        <div class="meta-chips"><span class="pill">${esc(a.eraLabel)}</span><span class="pill">${esc(a.category)}</span><span class="pill">${a.rarity}</span><span class="pill st-${a.state}">${a.state === 'mint' ? 'Not minted yet' : a.state === 'listed' ? 'For sale' : 'Minted'}</span>${tags}</div>
        <div class="bid-box" id="actionBox">${box}</div>
        <div class="token-note">${I.info}<span>Platform fees from every mint and sale feed the team's treasury, which backs the platform token — more activity, a stronger ecosystem.</span></div>
        <div class="tabs"><button class="on" data-t="desc">Description</button><button data-t="offers">Offers (${offers.length})</button><button data-t="details">Details</button></div>
        <div class="tab-pane on" id="p-desc"><p class="muted">${esc(a.description)}</p></div>
        <div class="tab-pane" id="p-offers">${renderOffersTab()}</div>
        <div class="tab-pane" id="p-details"><div class="props"><div><small>Era</small><b>${esc(a.eraShort)}</b></div><div><small>Category</small><b>${esc(a.category)}</b></div><div><small>Rarity</small><b>${a.rarity}</b></div><div><small>Collection</small><b>${esc((a.collection && a.collection.name) || a.eraShort)}</b></div><div><small>Chain</small><b>Solana${S.meta && !S.meta.isMainnet ? ' (' + esc(S.meta.network) + ')' : ''}</b></div><div><small>Owner</small><b>${a.owner ? `<a href="${explorer(a.owner)}" target="_blank" rel="noopener">${short(a.owner)}</a>` : 'Nobody yet'}</b></div>${a.asset ? `<div><small>On-chain asset</small><b><a href="${explorer(a.asset)}" target="_blank" rel="noopener">${short(a.asset)}</a></b></div>` : ''}</div></div>
      </div>
    </div>`;
    updateOfferHint();
  }
  function updateOfferHint() {
    const h = $('#offerHint'), inp = $('#offerAmt'); if (!h || !inp) return;
    const v = +inp.value; const s = v > 0 ? usdToSol(v) : null;
    h.innerHTML = (s ? `You'll pay ≈ ${sol}${s} SOL now into escrow. ` : '') + `Cancel any time for a full refund; if another offer is accepted you're refunded automatically. Minimum $${minOffer()}.`;
  }

  async function renderMore() {
    const r = await API.items({ era: a.era, limit: 5 }).catch(() => ({ items: [] }));
    const more = r.items.filter((x) => String(x.id) !== String(a.id)).slice(0, 4);
    $('#moreRoot').innerHTML = more.length ? `<section class="section"><div class="section-head"><h2>More like this</h2><a class="more" href="explore.html?era=${esc(a.era)}">View all →</a></div><div class="grid">${more.map(card).join('')}</div></section>` : '';
  }

  async function load() {
    try {
      a = await API.item(id);
      offers = a.minted && !API.isDemo ? await API.offersFor(id).catch(() => []) : [];
    } catch (e) { root.innerHTML = `<div class="empty" style="margin-top:40px"><b>Artwork not found</b><a class="btn btn-primary" href="explore.html">Back to Explore</a></div>`; return false; }
    render(); renderMore(); return true;
  }
  const reload = async () => { const tab = ($('.tabs .on') || {}).dataset; await load(); if (tab && tab.t) { const b = $(`.tabs [data-t="${tab.t}"]`); if (b) b.click(); } };

  /* ---------- actions ---------- */
  root.addEventListener('click', async (e) => {
    const tab = e.target.closest('.tabs [data-t]');
    if (tab) { $$('.tabs button').forEach((b) => b.classList.toggle('on', b === tab)); ['desc', 'offers', 'details'].forEach((k) => $('#p-' + k).classList.toggle('on', tab.dataset.t === k)); return; }
    const add = e.target.closest('[data-add]'); if (add) { const i = $('#offerAmt'); i.value = Math.round((+i.value + +add.dataset.add) * 100) / 100; updateOfferHint(); return; }

    if (e.target.closest('#mintBtn')) {
      if (needWallet()) return;
      const r = await runTx({ title: 'Mint ' + a.title, path: `/items/${encodeURIComponent(a.id)}/mint`, success: 'Minted! This NFT is now in your wallet.' });
      if (r) await reload(); else await reload();
      return;
    }
    if (e.target.closest('#buyBtn')) {
      if (needWallet()) return;
      const r = await runTx({ title: 'Buy ' + a.title, path: `/items/${encodeURIComponent(a.id)}/buy`, success: 'Purchased! This NFT is now yours.' });
      await reload(); return;
    }
    if (e.target.closest('#offerBtn')) {
      if (needWallet()) return;
      const usd = +$('#offerAmt').value;
      if (!(usd >= minOffer())) { toast('Minimum offer is $' + minOffer(), 'bad'); return; }
      await runTx({ title: 'Offer $' + usd + ' on ' + a.title, path: `/items/${encodeURIComponent(a.id)}/offers`, body: { usd }, success: 'Offer placed. The owner has been notified.' });
      await reload(); return;
    }
    const cancel = e.target.closest('[data-cancel]');
    if (cancel) { if (await call('DELETE', '/offers/' + cancel.dataset.cancel, null, 'Offer cancelled — your SOL is on its way back.')) await reload(); return; }

    if (e.target.closest('#saleBtn')) {
      const usd = +$('#saleAmt').value;
      if (!(usd >= minOffer())) { toast('Minimum price is $' + minOffer(), 'bad'); return; }
      if (a.listing) { if (await call('PATCH', `/items/${encodeURIComponent(a.id)}/listing`, { priceUsd: usd }, 'Sale price updated')) await reload(); }
      else { await runTx({ title: 'Set sale price $' + usd, path: `/items/${encodeURIComponent(a.id)}/listing`, body: { priceUsd: usd }, success: 'Your NFT is now for sale.' }); await reload(); }
      return;
    }
    if (e.target.closest('#unlistBtn')) { if (await call('DELETE', `/items/${encodeURIComponent(a.id)}/listing`, null, 'Sale price removed')) await reload(); return; }
    const acc = e.target.closest('[data-accept]');
    if (acc) {
      const o = offers.find((x) => x.id === acc.dataset.accept);
      if (!confirm(`Accept ${fmtUsd(o.usd)} (${fmtSol(o.sol)} SOL) from ${short(o.bidder)}?\n\nThe NFT will be transferred to them. A ~$${S.meta.settings.acceptFeeUsd} network fee and the platform fee are deducted, and all other offers are refunded.`)) return;
      await runTx({ title: 'Accept offer', path: `/offers/${acc.dataset.accept}/accept`, success: 'Sold! The SOL is in your wallet.' });
      await reload(); return;
    }
    const rej = e.target.closest('[data-reject]');
    if (rej) { if (await call('POST', `/offers/${rej.dataset.reject}/reject`, null, 'Offer declined — the bidder is refunded.')) await reload(); }
  });
  root.addEventListener('input', (e) => { if (e.target.id === 'offerAmt') updateOfferHint(); });
  document.addEventListener('gta:auth', () => { if (a) reload(); });
  document.addEventListener('gta:tick', () => { const w = $('[data-win]'); if (w) { const x = G.offerWindow(); w.textContent = x.text; } });

  G.ready.then(() => { if (!id) { root.innerHTML = '<div class="empty" style="margin-top:40px"><b>No artwork selected</b><a class="btn btn-primary" href="explore.html">Back to Explore</a></div>'; return; } load(); });
})();
