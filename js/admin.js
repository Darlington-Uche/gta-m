import { S, D, $, $$, esc, usd, money, short, ago, thumb, rpc, toast, modal, runTx } from './core.js';

const TABS = [['dash', 'Dashboard'], ['items', 'Catalog'], ['subs', 'Submissions'], ['sales', 'Sales'], ['cash', 'Play money']];
const setPw = (v) => { S.adminPw = v; try { v ? sessionStorage.setItem('gta_adm', v) : sessionStorage.removeItem('gta_adm'); } catch (e) { /* ignore */ } };
const pw = () => S.adminPw;
const reload = () => window.dispatchEvent(new HashChangeEvent('hashchange'));

export async function admin({ args: [tab] }) {
  tab = TABS.some(([k]) => k === tab) ? tab : 'dash';
  if (pw()) { try { await rpc('m_admin_login', { pw: pw() }); } catch (e) { setPw(null); } }
  if (!pw()) {
    return { html: `<div class="ph"><span class="eyebrow">Restricted</span><h1 class="display">Admin.</h1></div><form class="form glass" id="lf" style="max-width:420px"><label class="field">Password<input id="pw" type="password" autocomplete="current-password" class="input"></label><button class="btn primary lg" id="lb">Enter</button><p class="fine" id="le"></p></form>`,
      mount: (root) => { $('#lf', root).onsubmit = async (e) => { e.preventDefault(); const v = $('#pw', root).value; try { await rpc('m_admin_login', { pw: v }); setPw(v); reload(); } catch (err) { $('#le', root).textContent = /Wrong/.test(err.message) ? 'Wrong password' : err.message; } }; } };
  }
  const head = `<div class="ph"><span class="eyebrow">Admin</span><h1 class="display">Control room.</h1></div><div class="tabs">${TABS.map(([k, l]) => `<a href="#/admin/${k}"><button class="${k === tab ? 'on' : ''}" tabindex="-1">${l}</button></a>`).join('')}<button class="btn sm" id="lo" style="margin-left:auto">Lock</button></div>`;
  const wrap = async () => {
    if (tab === 'dash') {
      const s = await rpc('m_admin_stats', { pw: pw() });
      return { html: `<div class="adm-grid">${[[s.items, 'Artworks'], [s.minted, 'Collected'], [s.listed, 'Listed'], [s.holders, 'Holders'], [s.wallets, 'Wallets'], [s.offers, 'Active offers'], [s.sales, 'Trades'], [money(s.volume), 'Volume'], [s.pending, 'Pending submissions']].map(([n, l]) => `<div class="stat glass"><b>${n}</b><small>${l}</small></div>`).join('')}</div>
        <div class="form glass"><h3 class="display" style="font-size:28px">Catalog sync</h3><p class="muted">Add or refresh every artwork from <code>js/data.js</code>. Existing ownership and prices are kept.</p><div><button class="btn primary" id="sync">Sync catalog from data.js</button></div></div>`,
        mount: (root) => { $('#sync', root).onclick = async () => { const R = { Common: 0, Rare: 5, Epic: 15, Legendary: 40 }; const seed = D.art.map((a) => ({ id: String(a.id), title: a.title, description: a.description, image: a.img, era: a.era, era_label: a.eraLabel, category: a.category, rarity: a.rarity, tags: a.tags || [], artist: a.artist, price_usd: R[a.rarity] ?? 0 })); await runTx('Syncing', () => rpc('m_admin_seed', { pw: pw(), p: seed }), 'Catalog synced').catch(() => {}); }; } };
    }
    if (tab === 'items') {
      const rows = await rpc('m_admin_items', { pw: pw() });
      return { html: `<div class="bar glass"><div class="row"><input class="input" id="q" placeholder="Search title or id…" style="flex:1"><button class="btn primary" id="new">+ New artwork</button></div></div><p class="count" id="cnt"></p><div class="list" id="list"></div>`,
        mount: (root) => {
          const draw = () => { const q = $('#q', root).value.toLowerCase(); const r = rows.filter((x) => !q || (x.title + ' ' + x.id).toLowerCase().includes(q)); $('#cnt', root).textContent = r.length + ' of ' + rows.length; $('#list', root).innerHTML = r.slice(0, 120).map((x) => `<div class="rowc"><div class="l"><img class="t" loading="lazy" src="${esc(thumb(x.image, 120))}" alt=""><div><b>${esc(x.title)}</b><small>${esc(x.id)} · ${esc(x.era)} · ${esc(x.rarity)} · ${usd(+x.price_usd)}${x.owner ? ' · owned ' + short(x.owner) : ''}${x.hidden ? ' · hidden' : ''}</small></div></div><button class="btn sm" data-e="${esc(x.id)}">Edit</button></div>`).join(''); };
          draw(); $('#q', root).oninput = draw;
          const edit = (x) => { const n = !x; x = x || { rarity: 'Common', price_usd: 0, era: Object.keys(D.eras)[0], category: 'Characters' };
            modal(`<button class="x" data-x>✕</button><h2 class="display">${n ? 'New' : 'Edit'}</h2><div class="form" style="padding:0"><label class="field">Title<input id="f_t" class="input" value="${esc(x.title || '')}" maxlength="60"></label>
              <div class="fgrid"><label class="field">Price USD<input id="f_p" class="input" type="number" min="0" step="0.01" value="${+x.price_usd}"></label><label class="field">Rarity<select id="f_r">${['Common', 'Rare', 'Epic', 'Legendary'].map((r) => `<option ${r === x.rarity ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
              <label class="field">Era<select id="f_e">${Object.entries(D.eras).map(([k, v]) => `<option value="${k}" ${k === x.era ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label><label class="field">Type<select id="f_c">${['Characters', 'Locations', 'Vehicles', 'Weapons'].map((r) => `<option ${r === x.category ? 'selected' : ''}>${r}</option>`).join('')}</select></label></div>
              <label class="field">Image URL<input id="f_i" class="input" value="${esc(x.image || '')}"></label><label class="field">Description<textarea id="f_d">${esc(x.description || '')}</textarea></label>
              <label class="field">Hidden<select id="f_h"><option value="false">No</option><option value="true" ${x.hidden ? 'selected' : ''}>Yes</option></select></label><button class="btn primary" id="f_s">Save</button></div>`, (m, close) => {
              $('[data-x]', m).onclick = close;
              $('#f_s', m).onclick = async () => { try { const e = $('#f_e', m).value; await rpc('m_admin_save', { pw: pw(), p: { id: x.id, title: $('#f_t', m).value, description: $('#f_d', m).value, image: $('#f_i', m).value, era: e, era_label: D.eras[e], category: $('#f_c', m).value, rarity: $('#f_r', m).value, price_usd: +$('#f_p', m).value, hidden: $('#f_h', m).value === 'true', artist: x.artist } }); close(); toast('Saved'); reload(); } catch (err) { toast(err.message, 'bad'); } };
            }, 'wide'); };
          root.onclick = (e) => { const b = e.target.closest('[data-e]'); if (b) edit(rows.find((r) => r.id === b.dataset.e)); if (e.target.id === 'new') edit(null); };
        } };
    }
    if (tab === 'subs') {
      const rows = await rpc('m_admin_submissions', { pw: pw() });
      return { html: rows.length ? `<div class="list">${rows.map((s) => `<div class="rowc" data-id="${s.id}"><div class="l"><img class="t" style="width:84px;height:84px" src="${esc(s.image)}" alt=""><div><b>${esc(s.title)}</b><small>${esc(s.description || '')}</small><small>${esc(s.era || '')} · ${esc(s.category || '')} · ${short(s.wallet)} · ${ago(s.created_at)}${s.suggested_usd != null ? ' · suggests ' + usd(+s.suggested_usd) : ''}</small></div></div>
        <div class="r">${s.status === 'pending' ? `<input class="input" style="width:110px" type="number" min="0" step="0.01" placeholder="Price $" data-p value="${s.suggested_usd ?? ''}"><button class="btn primary sm" data-ok>Approve</button><button class="btn sm" data-no>Reject</button>` : `<span class="st ${s.status === 'approved' ? 'ok' : 'bad'}">${esc(s.status)}</span>`}</div></div>`).join('')}</div>` : '<div class="empty"><b>No submissions</b></div>',
        mount: (root) => { root.onclick = async (e) => { const c = e.target.closest('[data-id]'); if (!c) return; const ok = e.target.hasAttribute('data-ok'), no = e.target.hasAttribute('data-no'); if (!ok && !no) return;
          let reason = ''; if (no) { reason = prompt('Reason (optional)'); if (reason === null) return; }
          await runTx(ok ? 'Approving' : 'Rejecting', () => rpc('m_admin_review', { pw: pw(), p_id: c.dataset.id, p_ok: ok, p_price: ok ? +($('[data-p]', c).value || 0) : null, p_reason: reason }), ok ? 'Live on the marketplace' : 'Rejected').then(reload, () => {}); }; } };
    }
    if (tab === 'sales') {
      const rows = await rpc('m_admin_sales', { pw: pw() });
      return `<div class="tbl-w glass"><table class="tbl"><tr><th>When</th><th>Type</th><th>Artwork</th><th>Buyer</th><th>Seller</th><th>USD</th></tr>${rows.map((r) => `<tr><td>${ago(r.at)}</td><td>${esc(r.type)}</td><td>${esc(r.title)}</td><td>${short(r.buyer)}</td><td>${short(r.seller)}</td><td>${usd(+r.usd)}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">No sales yet</td></tr>'}</table></div>`;
    }
    return { html: `<div class="form glass" style="max-width:520px"><h3 class="display" style="font-size:28px">Give play money</h3><label class="field">Wallet address<input id="gw" class="input"></label><label class="field">Amount (USD)<input id="ga" type="number" step="0.01" class="input" value="1000"></label><button class="btn primary" id="gg">Send</button></div>`,
      mount: (root) => { $('#gg', root).onclick = async () => { await runTx('Sending', () => rpc('m_admin_grant', { pw: pw(), p_wallet: $('#gw', root).value.trim(), p_usd: +$('#ga', root).value }), 'Balance updated').catch(() => {}); }; } };
  };
  let r; try { r = await wrap(); } catch (e) { if (/Wrong password/.test(e.message)) { setPw(null); return admin({ args: [tab] }); } throw e; }
  const o = typeof r === 'string' ? { html: r } : r;
  return { html: head + o.html, mount: (root) => { $('#lo', root).onclick = () => { setPw(null); reload(); }; const c = o.mount && o.mount(root); return c; } };
}
