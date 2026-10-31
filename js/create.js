/* Create & Submit — live preview + real upload to the review queue (POST /submissions) */
(function () {
  const { D, $, $$, esc, fmtUsd, API, toast, needWallet } = window.GTA;
  const MAX = 50 * 1024 * 1024, OK = ['image/jpeg', 'image/png', 'image/gif', 'video/mp4'];
  const model = { title: '', desc: '', era: 'vice', cat: 'Locations', tags: ['vice city', 'sunset', 'miami'], price: '', views: [], active: 0 };
  // starter previews so the page looks alive before upload
  const demo = D.art.find((a) => a.era === 'vice').img;
  const demos = D.art.filter((a) => a.era === 'vice').slice(0, 5).map((a) => a.img);

  const eraOpts = Object.keys(D.eras).map((k) => `<option value="${k}" ${k === model.era ? 'selected' : ''}>${D.eras[k]}</option>`).join('');
  const cats = ['Characters', 'Vehicles', 'Locations', 'Weapons', 'Artwork', 'Miscellaneous'];
  $('#eraSel').innerHTML = eraOpts;
  $('#catSel').innerHTML = cats.map((c) => `<option ${c === model.cat ? 'selected' : ''}>${c}</option>`).join('');

  function setStep() {
    const done = [!!model.views.length, !!(model.title && model.desc), !!(model.price !== '' && +model.price > 0), false];
    let cur = done.findIndex((d) => !d); if (cur < 0) cur = 3;
    $$('.step').forEach((s, i) => { s.classList.toggle('on', i === cur); s.classList.toggle('done', done[i] && i !== cur); });
  }
  function drawTags() {
    $('#tagList').innerHTML = model.tags.map((t, i) => `<span class="tag">${esc(t)}<button type="button" data-rt="${i}" aria-label="Remove">✕</button></span>`).join('');
  }
  function drawViews() {
    const v = model.views;
    $('#views').innerHTML = v.map((x, i) => `<div class="v ${i === model.active ? 'on' : ''}" data-i="${i}"><img src="${x.url}" alt=""><button type="button" class="x" data-x="${i}" aria-label="Remove">✕</button></div>`).join('') + (v.length < 5 ? '<button type="button" class="add" id="addMore"><span>＋<br>Add More</span></button>' : '');
  }
  function drawPreview() {
    const v = model.views, main = v[model.active];
    $('#pImg').innerHTML = main ? (main.video ? `<video src="${main.url}" muted loop autoplay playsinline style="width:100%;height:100%;object-fit:cover"></video>` : `<img src="${main.url}" alt="">`) : `<img src="${demo}" alt="" style="opacity:.55"><div class="ph">Your upload will appear here</div>`;
    $('#pTitle').textContent = model.title || 'Untitled artwork';
    $('#pEra').textContent = D.eras[model.era];
    $('#pCat').textContent = model.cat;
    $('#pThumbs').innerHTML = (v.length ? v.map((x) => x.url) : demos).map((u) => `<img src="${u}" alt="" style="${v.length ? '' : 'opacity:.5'}">`).join('');
    $('#pTags').innerHTML = model.tags.map((t) => `<span class="pill">${esc(t)}</span>`).join(' ');
    $('#pPrice').innerHTML = +model.price > 0 ? `${fmtUsd(+model.price)} <small class="muted" style="font-weight:500">· suggested mint price</small>` : '<span class="muted" style="font-weight:500;font-size:14px">Suggest a price to preview</span>';
    setStep();
  }

  function addFiles(files) {
    for (const f of files) {
      if (model.views.length >= 5) { toast('Max 5 views', 'bad'); break; }
      if (!OK.includes(f.type)) { toast(f.name + ': unsupported format', 'bad'); continue; }
      if (f.size > MAX) { toast(f.name + ' is over 50MB', 'bad'); continue; }
      model.views.push({ url: URL.createObjectURL(f), video: f.type === 'video/mp4', name: f.name, file: f });
    }
    $('#upErr').closest('.field').classList.remove('bad');
    drawViews(); drawPreview();
  }

  const fileIn = $('#fileIn'), drop = $('#drop');
  $('#chooseBtn').addEventListener('click', (e) => { e.stopPropagation(); fileIn.click(); });
  drop.addEventListener('click', () => fileIn.click());
  fileIn.addEventListener('change', () => { addFiles(fileIn.files); fileIn.value = ''; });
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => addFiles(e.dataTransfer.files));
  $('#views').addEventListener('click', (e) => {
    if (e.target.closest('#addMore')) { fileIn.click(); return; }
    const x = e.target.closest('[data-x]'); if (x) { model.views.splice(+x.dataset.x, 1); model.active = 0; drawViews(); drawPreview(); return; }
    const v = e.target.closest('[data-i]'); if (v) { model.active = +v.dataset.i; drawViews(); drawPreview(); }
  });

  $('#title').addEventListener('input', (e) => { model.title = e.target.value; e.target.closest('.field').classList.remove('bad'); drawPreview(); });
  $('#desc').addEventListener('input', (e) => { model.desc = e.target.value; e.target.closest('.field').classList.remove('bad'); drawPreview(); });
  $('#eraSel').addEventListener('change', (e) => { model.era = e.target.value; drawPreview(); });
  $('#catSel').addEventListener('change', (e) => { model.cat = e.target.value; drawPreview(); });
  $('#price').addEventListener('input', (e) => { model.price = e.target.value; e.target.closest('.field').classList.remove('bad'); drawPreview(); });
  const tagIn = $('#tagIn');
  tagIn.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ',') && tagIn.value.trim()) {
      e.preventDefault(); const t = tagIn.value.trim().toLowerCase().replace(/,/g, '');
      if (model.tags.length >= 8) toast('Up to 8 tags', 'bad'); else if (!model.tags.includes(t)) model.tags.push(t);
      tagIn.value = ''; drawTags(); drawPreview();
    } else if (e.key === 'Backspace' && !tagIn.value && model.tags.length) { model.tags.pop(); drawTags(); drawPreview(); }
  });
  $('#tagList').addEventListener('click', (e) => { const r = e.target.closest('[data-rt]'); if (r) { model.tags.splice(+r.dataset.rt, 1); drawTags(); drawPreview(); } });
  $('#editBtn').addEventListener('click', () => { $('#title').focus(); $('#title').scrollIntoView({ behavior: 'smooth', block: 'center' }); });

  $('#submitBtn').addEventListener('click', async () => {
    let bad = false;
    const flag = (sel) => { $(sel).closest('.field').classList.add('bad'); bad = true; };
    if (!model.views.length) flag('#upErr');
    if (!model.title.trim()) flag('#title');
    if (model.desc.trim().length < 10) flag('#desc');
    if (!(+model.price > 0)) flag('#price');
    if (bad) { toast('Please fix the highlighted fields', 'bad'); const f = $('.field.bad'); if (f) f.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    if (API.isDemo) { toast('Demo mode — connect the backend (API_URL) to submit.', 'bad'); return; }
    if (needWallet()) return;
    const btn = $('#submitBtn'); btn.disabled = true; btn.textContent = 'Uploading…';
    try {
      const fd = new FormData();
      model.views.forEach((v) => fd.append('files', v.file));
      fd.append('title', model.title.trim()); fd.append('description', model.desc.trim());
      fd.append('era', model.era); fd.append('category', model.cat); fd.append('tags', model.tags.join(','));
      if (+model.price > 0) fd.append('suggestedPriceUsd', String(+model.price));
      await API.http('POST', '/submissions', fd);
      $('#okModal').classList.add('open'); $('#overlay').classList.add('open');
      $$('.step').forEach((s) => { s.classList.remove('on'); s.classList.add('done'); });
    } catch (e) { toast(e.message, 'bad'); }
    btn.disabled = false; btn.textContent = 'Submit for Review';
  });
  $('#okClose').addEventListener('click', () => { $('#okModal').classList.remove('open'); $('#overlay').classList.remove('open'); });
  $('#okHome').addEventListener('click', () => { location.href = 'explore.html'; });

  window.GTA.ready.then(() => { drawTags(); drawViews(); drawPreview(); });
})();
