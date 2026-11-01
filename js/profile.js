/* Profile: owned NFTs (with sale price), offers received/made, notifications, activity, submissions */
(function () {
  const G = window.GTA, { $, $$, esc, fmtUsd, fmtSol, short, sol, API, S, card, toast, runTx, call } = G;
  let tab = (location.hash || '#nfts').slice(1);
  if (!['nfts', 'received', 'made', 'notifications', 'activity', 'submissions'].includes(tab)) tab = 'nfts';
  const pane = $('#pane');
  const explorer = (sig) => `https://explorer.solana.com/tx/${sig}${S.meta && S.meta.network === 'devnet' ? '?cluster=devnet' : ''}`;
  const empty = (t, d) => `<div class="empty"><b>${t}</b>${d || ''}</div>`;
  const row = (inner) => `<div class="own-offer prof-row">${inner}</div>`;

  /** Links to the on-chain transactions of an offer: payment in, refund out, or the sale. */
  const txLinks = (o) => {
    const l = (sig, label) => (sig ? `<a class="txl" href="${explorer(sig)}" target="_blank" rel="noopener">${label} ↗</a>` : '');
    const parts = [l(o.paymentSignature, 'Payment tx'), l(o.refundSignature, 'Refund tx'), l(o.saleSignature, 'Sale tx')].filter(Boolean);
    const wait = o.status === 'refund_pending' ? '<span class="muted">Refund on its way…</span>' : '';
    return parts.length || wait ? `<div class="txls">${parts.join(' · ')}${wait}</div>` : '';
  };
  const views = {
    async nfts() {
      const r = await API.http('GET', '/me/nfts');
      const items = r.items.map(API.normApi);
      return items.length ? `<div class="grid">${items.map(card).join('')}</div><p class="hint" style="margin-top:14px">Open an NFT to set a sale price or accept offers.</p>` : empty('No NFTs yet', 'Mint one from <a href="explore.html">Explore</a> — free ones are limited per wallet.');
    },
    async received() {
      const r = await API.http('GET', '/me/offers/received');
      return r.offers.length ? r.offers.map((o) => row(`<div style="display:flex;gap:12px;align-items:center;min-width:0">${G.imgTag(o.itemImage, "", 120, ' class="thumb-s"')}<div style="min-width:0"><b>${esc(o.itemTitle)}</b><div class="muted" style="font-size:13px"><b style="color:#fff">${fmtUsd(o.usd)}</b> · ${sol}${fmtSol(o.sol)} SOL · from ${short(o.bidder)}</div></div></div><div class="row-btns"><a class="btn btn-primary btn-sm" href="artwork.html?id=${encodeURIComponent(o.itemId)}">Review</a></div>`)).join('') : empty('No offers on your NFTs yet', 'You\'ll get a notification the moment someone makes one.');
    },
    async made() {
      const r = await API.http('GET', '/me/offers/made');
      return r.offers.length ? r.offers.map((o) => row(`<div><a href="artwork.html?id=${encodeURIComponent(o.itemId)}"><b>${fmtUsd(o.usd)}</b></a> <span class="muted">· ${sol}${fmtSol(o.sol)} SOL · ${esc(o.status.replace('_', ' '))} · ${G.ago(o.createdAt)}</span>${txLinks(o)}</div>${o.status === 'active' ? `<button class="btn btn-glass btn-sm" data-cancel="${o.id}">Cancel &amp; refund</button>` : ''}`)).join('') : empty('You haven\'t made any offers', 'Find something you like on <a href="explore.html">Explore</a>.');
    },
    async notifications() {
      const r = await API.http('GET', '/me/notifications?limit=50');
      if (r.unread) { API.http('POST', '/me/notifications/read', {}).then(() => { S.unread = 0; API.emit('unread', 0); setCounts(0); }).catch(() => {}); }
      return r.notifications.length ? r.notifications.map((n) => row(`<div><b>${esc(n.title)}</b>${n.read ? '' : ' <span class="dot-new"></span>'}<div class="muted" style="font-size:13px">${esc(n.body)} · ${G.ago(n.createdAt)}</div></div>${n.data && n.data.itemId ? `<a class="btn btn-glass btn-sm" href="artwork.html?id=${encodeURIComponent(n.data.itemId)}">View</a>` : ''}`)).join('') : empty('Nothing here yet', 'Offers, sales and refunds will show up here.');
    },
    async activity() {
      const r = await API.http('GET', '/me/activity');
      return r.activity.length ? r.activity.map((s) => row(`<div><b>${s.role === 'buyer' ? 'Bought' : 'Sold'}</b> · ${esc(s.type === 'mint' ? 'mint' : s.type)} · ${s.usd != null ? fmtUsd(s.usd) : ''} <span class="muted">· ${sol}${fmtSol(s.lamports / 1e9)} SOL · ${G.ago(s.createdAt)}</span></div>${s.signature ? `<a class="btn btn-glass btn-sm" target="_blank" rel="noopener" href="${explorer(s.signature)}">Explorer</a>` : ''}`)).join('') : empty('No activity yet');
    },
    async submissions() {
      const r = await API.http('GET', '/me/submissions');
      return r.submissions.length ? r.submissions.map((s) => row(`<div><b>${esc(s.title)}</b> <span class="pill st-${s.status === 'approved' ? 'minted' : 'mint'}">${esc(s.status)}</span><div class="muted" style="font-size:13px">${esc(s.era || '')} · ${G.ago(s.createdAt)}${s.reason ? ' · ' + esc(s.reason) : ''}</div></div>`)).join('') : empty('No submissions yet', '<a href="create.html">Submit your first artwork</a>.');
    }
  };

  function setCounts(n) { const el = $('#cNotif'); if (el) { el.textContent = n || ''; el.hidden = !n; } }
  async function show() {
    $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
    pane.innerHTML = '<div class="empty"><b>Loading…</b></div>';
    try { pane.innerHTML = await views[tab](); } catch (e) { pane.innerHTML = empty('Could not load', esc(e.message)); }
  }
  function gate() {
    const on = !!S.token;
    $('#gate').hidden = on; $('#app').hidden = !on;
    $('#who').textContent = on ? 'Everything you own, every offer, and your notifications.' : 'Connect your wallet to see your NFTs, offers and notifications.';
    if (on) { $('#pAddr').textContent = S.wallet; setCounts(S.unread); show(); }
  }

  $('#tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (!b) return; tab = b.dataset.t; history.replaceState(null, '', '#' + tab); show(); });
  $('#gateBtn').addEventListener('click', () => G.walletModal(true));
  $('#outBtn').addEventListener('click', () => { API.signOut(); toast('Disconnected'); });
  $('#syncBtn').addEventListener('click', async () => {
    const b = $('#syncBtn'); b.disabled = true; b.textContent = 'Checking chain…';
    await call('POST', '/me/nfts/sync', null, 'Ownership refreshed from the chain');
    b.disabled = false; b.textContent = 'Refresh from chain'; show();
  });
  pane.addEventListener('click', async (e) => {
    const c = e.target.closest('[data-cancel]');
    if (c && await call('DELETE', '/offers/' + c.dataset.cancel, null, 'Offer cancelled — your SOL is on its way back.')) show();
  });
  document.addEventListener('gta:auth', gate);
  API.on('unread', setCounts);
  G.ready.then(gate);
})();
