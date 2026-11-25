/**
 * UINSU Google Scholar Insight — dasbor panel samping.
 * Sumber kebenaran data ada di content script; panel membaca salinannya dari storage.session.
 */
(function () {
  'use strict';
  const { h, fmt, chip, recChips, link, issnFmt, apcText, download, slug } = GsiUI;
  const S = GsiStats, W = GsiW;
  const $view = document.getElementById('view');

  let tabId = null, data = null, view = 'ringkasan';
  let settings = { autoLoad: true, badges: true, theme: 'auto', targets: null, autoUpdate: true };
  let updMsg = '';
  const ui = { q: '', filter: '', sort: 'cites', finder: { q: '', sinta: [], scopus: [], doaj: false, noApc: false, activeOnly: true }, finderRes: null, cohortSort: ['h', -1], cite: null, citeData: {}, check: { q: '', res: null }, group: '', tickMsg: {} };

  const bg = (msg) => chrome.runtime.sendMessage(msg).catch((e) => ({ error: String(e) }));
  const toTab = (msg) => (tabId == null ? Promise.resolve(null) : chrome.tabs.sendMessage(tabId, msg).catch(() => null));
  const papers = () => (data && data.papers) || [];
  const isProfile = () => data && data.kind === 'profile';
  const targets = () => settings.targets || S.DEFAULT_TARGETS;

  async function saveSettings(patch) {
    Object.assign(settings, patch);
    await chrome.storage.local.set({ settings });
    applyTheme();
    toTab({ type: 'CMD_SETTINGS', settings });
  }
  function applyTheme() {
    if (settings.theme === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = settings.theme;
  }

  // ── Sinkronisasi dengan tab aktif ─────────────────────────────────────────
  async function sync() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    tabId = tab ? tab.id : null;
    const key = 'tab' + tabId;
    data = tabId == null ? null : (await chrome.storage.session.get(key))[key] || null;
    render();
    if (!data) toTab({ type: 'CMD_REPUSH' });
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && changes.pendingCheck && changes.pendingCheck.newValue) takePending();
    if (area !== 'session' || !changes['tab' + tabId]) return;
    data = changes['tab' + tabId].newValue || null;
    if (['ringkasan', 'publikasi', 'kualitas', 'target'].includes(view)) render(true);
  });
  chrome.tabs.onActivated.addListener(sync);
  chrome.tabs.onUpdated.addListener((id, info) => { if (id === tabId && info.status === 'complete') sync(); });

  // ── Kerangka ──────────────────────────────────────────────────────────────
  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
    view = b.dataset.view;
    document.querySelectorAll('.tabs button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    render();
  }));

  function setView(v) {
    view = v;
    document.querySelectorAll('.tabs button').forEach((x) => x.setAttribute('aria-selected', String(x.dataset.view === v)));
    render();
  }

  // ── Petunjuk gulir pada deretan tab: panah di tepi muncul bila masih ada tab yang tersembunyi ──
  (function tabHints() {
    const nav = document.querySelector('.tabs');
    if (!nav) return;
    const arrow = (dir) => h('button', { class: 'tab-arrow ' + (dir < 0 ? 'left' : 'right'), tabindex: '-1', 'aria-label': dir < 0 ? 'Geser ke tab sebelumnya' : 'Geser ke tab berikutnya',
      onclick: () => nav.scrollBy({ left: dir * Math.max(140, nav.clientWidth * 0.6), behavior: 'smooth' }) }, h('span', { text: dir < 0 ? '‹' : '›' }));
    const wrap = h('div', { class: 'tabs-wrap' });
    nav.before(wrap);
    wrap.append(arrow(-1), nav, arrow(1));
    const update = () => {
      wrap.classList.toggle('more-left', nav.scrollLeft > 4);
      wrap.classList.toggle('more-right', nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 4);
    };
    nav.addEventListener('scroll', update, { passive: true });
    nav.addEventListener('wheel', (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && nav.scrollWidth > nav.clientWidth) { nav.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
    nav.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) b.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); });
    new ResizeObserver(update).observe(nav);
    update();
  })();

  const card = (title, ...kids) => h('section', { class: 'card' }, title ? h('h2', { text: title }) : null, kids);
  const empty = (title, text, extra) => h('div', { class: 'card empty' }, h('b', { text: title }), text, extra || null);

  function needData() {
    return empty('Belum ada data', 'Buka profil atau hasil pencarian Google Scholar di tab ini, lalu dasbor terisi otomatis.',
      h('p', { style: 'margin-top:12px' }, link('https://scholar.google.com/', 'Buka Google Scholar', 'btn')));
  }

  function render(keepScroll) {
    const y = window.scrollY;
    const fn = { ringkasan: vRingkasan, publikasi: vPublikasi, kualitas: vKualitas, target: vTarget, finder: vFinder, banding: vBanding, pengaturan: vPengaturan }[view];
    const active = document.activeElement && document.activeElement.id;
    const out = fn();
    Promise.resolve(out).then((nodes) => {
      $view.replaceChildren(...[].concat(nodes).filter(Boolean));
      if (keepScroll) window.scrollTo(0, y);
      if (active) { const el = document.getElementById(active); if (el) { el.focus(); if (el.setSelectionRange && el.type !== 'number') el.setSelectionRange(el.value.length, el.value.length); } }
    });
  }

  // ── Ringkasan ─────────────────────────────────────────────────────────────
  async function vRingkasan() {
    if (!data) return needData();
    const ps = papers();
    const sm = S.summary(ps);
    const out = [];

    const who = card(null,
      h('div', { class: 'small muted', text: isProfile() ? 'Profil Google Scholar' : 'Hasil pencarian' }),
      h('div', { class: 'who-name', text: data.name || '—' }),
      data.affil ? h('div', { class: 'muted', text: data.affil }) : null,
      h('div', { class: 'small muted', style: 'margin-top:6px', text: sm.total + ' publikasi dianalisis · ' + sm.indexed + ' terindeks SINTA/Scopus (' + (sm.total ? Math.round((sm.indexed / sm.total) * 100) : 0) + '%)' }));
    if (isProfile() && !data.allLoaded) {
      who.append(h('div', { class: 'banner', style: 'margin-top:10px' }, 'Belum semua publikasi dimuat, sehingga angka di bawah belum lengkap.',
        h('button', { class: 'btn', text: 'Muat semua', onclick: () => toTab({ type: 'CMD_LOAD_ALL' }) })));
    }
    if (data.verifying) who.append(h('div', { class: 'banner', style: 'margin-top:10px', text: 'Verifikasi online berjalan: ' + data.verifying.done + '/' + data.verifying.total }));
    out.push(who);

    if (isProfile()) out.push(card('Metrik', W.kpis(S.metrics(ps), data.scholar),
      h('p', { class: 'fine', style: 'margin-top:8px', text: 'Dihitung dari publikasi yang dimuat di halaman. Selisih kecil dengan angka Scholar wajar bila ada entri yang digabung.' })));

    if (isProfile()) {
      const nh = S.nextH(ps);
      out.push(card('Menuju h-index ' + nh.target, !nh.possible
        ? h('p', { class: 'muted', text: 'h-index saat ini ' + nh.h + '. Untuk naik ke ' + nh.target + ' dibutuhkan ' + nh.target + ' publikasi; profil ini masih kurang ' + nh.short + ' publikasi.' })
        : [h('p', {}, 'h-index saat ini ', h('b', { text: nh.h }), '. Untuk naik ke ', h('b', { text: nh.target }), ' dibutuhkan ' + nh.target + ' publikasi dengan minimal ' + nh.target + ' sitasi. Kekurangannya ',
            h('b', { text: nh.lack + ' sitasi' }), ' pada ' + nh.items.length + ' publikasi berikut:'),
          h('div', { class: 'list' }, nh.items.map((x) => h('div', { class: 'item' },
            h('button', { class: 'item-t', text: x.title, title: 'Tampilkan di halaman Scholar', onclick: () => toTab({ type: 'CMD_SHOW', id: x.id }) }),
            h('div', { class: 'item-m', text: fmt(x.cites) + ' sitasi · kurang ' + x.lack }))))]));
      const hist = ((await chrome.storage.local.get('history')).history || {})[data.user] || [];
      out.push(card('Riwayat profil', W.history(hist)));
    }

    out.push(card('Sebaran peringkat',
      h('div', { class: 'split' },
        h('div', {}, h('div', { class: 'small muted', style: 'margin-bottom:6px', text: 'SINTA · ' + sm.sintaTotal + ' publikasi' }), W.tierBars('s', sm.sinta, 1, 6, sm.total)),
        h('div', {}, h('div', { class: 'small muted', style: 'margin-bottom:6px', text: 'Scopus · ' + sm.scopusTotal + ' publikasi' }), W.tierBars('q', sm.scopus, 1, 4, sm.total))),
      h('div', { class: 'item-f', style: 'margin-top:12px' },
        chip('doaj', 'DOAJ', { count: sm.doaj }), chip('diamond', 'Tanpa APC', { count: sm.diamond }),
        sm.ambiguous + sm.check ? chip('amb', 'Perlu dicek', { count: sm.ambiguous + sm.check }) : null,
        sm.predatory ? chip('warn', 'Terindikasi predator', { count: sm.predatory }) : null)));

    out.push(card('Publikasi per tahun', W.yearChart(S.byYear(ps))));
    out.push(card('Jenis terbitan', W.typeSeg(sm.types)));
    out.push(card('Rekap kategori publikasi', W.catTable(S.categoryCount(ps), S.CATEGORIES),
      h('p', { class: 'fine', style: 'margin-top:8px', text: 'Pengelompokan indikatif menurut peringkat jurnal saat ini. Jurnal yang terindeks Scopus dan SINTA sekaligus dihitung di kategori Scopus. Bukan penilaian resmi BKD atau angka kredit.' })));

    if (isProfile()) {
      out.push(card('Peran kepenulisan', W.authorshipSeg(S.authorship(ps)),
        h('p', { class: 'fine', style: 'margin-top:8px', text: 'Dibaca dari urutan nama di Scholar; daftar penulis yang terpotong masuk “tidak terbaca”.' })));
      const co = S.collaborators(ps, data.name, 10, data.aliases);
      if (co.length) out.push(card('Kolaborator tersering', h('div', { class: 'bars' }, co.map((c) => h('div', { class: 'bar-row', style: 'grid-template-columns:1fr 90px 34px' },
        h('span', { text: c.name }), h('div', { class: 'bar-track' }, h('div', { class: 'bar-fill', style: 'background:var(--accent);width:' + (c.papers / co[0].papers) * 100 + '%' })), h('div', { class: 'bar-n', text: c.papers }))))));
    }

    out.push(card('Tindakan', h('div', { class: 'tools' },
      h('button', { class: 'btn', text: 'Verifikasi yang belum pasti', title: 'Kirim judul paper yang belum cocok/perlu dicek ke Crossref', onclick: () => toTab({ type: 'CMD_VERIFY', mode: 'pending' }) }),
      h('button', { class: 'btn ghost', text: 'Verifikasi semua', onclick: () => toTab({ type: 'CMD_VERIFY', mode: 'all' }) }),
      h('button', { class: 'btn ghost', text: 'Ekspor Excel (.xlsx)', onclick: () => {
        const t = S.toRows(ps), m = S.metrics(ps), cat = S.categoryCount(ps);
        const info = [['Butir', 'Nilai'], ['Nama', data.name || ''], ['Afiliasi', data.affil || ''], ['Profil', data.url || ''], ['Tanggal ekspor', new Date().toLocaleDateString('id-ID')],
          ['Publikasi', m.papers], ['Sitasi', m.cites], ['h-index', m.h], ['g-index', m.g], ['i10-index', m.i10], ['h5-index', m.h5], ['m-quotient', m.m]]
          .concat(S.CATEGORIES.map(([k, l]) => [l, cat[k]]), [['Dibuat dengan', GsiBrand.line()]]);
        download('uinsu-' + slug(data.name) + '.xlsx', GsiXlsx.build([{ name: 'Publikasi', rows: [t.head].concat(t.rows) }, { name: 'Ringkasan', rows: info }]), GsiXlsx.MIME);
      } }),
      h('button', { class: 'btn ghost', text: 'Ekspor CSV', onclick: () => download('uinsu-' + slug(data.name) + '.csv', S.toCsv(ps)) }),
      h('button', { class: 'btn ghost', text: 'Laporan PDF', onclick: () => chrome.tabs.create({ url: chrome.runtime.getURL('report/report.html?tab=' + tabId) }) }),
      isProfile() ? h('button', { class: 'btn ghost', text: 'Simpan untuk dibandingkan', onclick: saveProfile }) : null),
      h('p', { class: 'fine', style: 'margin-top:8px', text: 'Verifikasi online mengirim judul paper ke api.crossref.org dan DOI ke api.openalex.org. Tombol Sitasi mengambil metadata DOI dari Crossref. Tidak ada data lain yang keluar dari browser Anda.' })));
    return out;
  }

  // ── Publikasi ─────────────────────────────────────────────────────────────
  function passes(p, f) {
    if (!f) return true;
    const t = S.tier(p);
    if (/^s\d$/.test(f)) return t.s === +f[1];
    if (/^q\d$/.test(f)) return t.q === +f[1];
    if (f === 'idx') return !!(t.s || t.q);
    if (f === 'doaj') return t.doaj;
    if (f === 'cek') return p.m.status === 'ambiguous' || (p.m.status === 'match' && p.m.conf === 'cek');
    if (f === 'warn') return !!p.m.pred || t.discontinued || !!(p.ver && p.ver.retracted);
    if (f === 'none') return p.m.status === 'none' && p.type === 'journal';
    if (f === 'mine') return p.mine === 'no';
    if (f === 'retracted') return !!(p.ver && p.ver.retracted);
    if (f.startsWith('t:')) return p.type === f.slice(2);
    if (f.startsWith('a:')) return f === 'a:lead' ? ['first', 'sole'].includes(p.pos) : p.pos === f.slice(2);
    return true;
  }
  const tierRank = (p) => { const t = S.tier(p); return (t.q || 9) * 10 + (t.s || 9); };

  async function toggleCite(p) {
    ui.cite = ui.cite === p.id ? null : p.id;
    render(true);
    if (ui.cite !== p.id || !p.doi || ui.citeData[p.id]) return;
    const r = await bg({ type: 'CITE', doi: p.doi });
    if (r && r.work) { ui.citeData[p.id] = GsiCite.fromCrossref(r.work); if (ui.cite === p.id) render(true); }
  }

  function citeBox(p) {
    const meta = ui.citeData[p.id] || GsiCite.fromScholar(p);
    const row = (label, text) => {
      const btn = h('button', { class: 'btn ghost mini', text: 'Salin', onclick: () => navigator.clipboard.writeText(text).then(() => { btn.textContent = 'Tersalin'; setTimeout(() => { btn.textContent = 'Salin'; }, 1500); }, () => { btn.textContent = 'Gagal menyalin'; }) });
      return h('div', { class: 'cite-row' }, h('div', { class: 'cite-h' }, h('b', { text: label }), btn), h('pre', { text }));
    };
    return h('div', { class: 'cite' }, row('APA', GsiCite.apa(meta)), row('IEEE', GsiCite.ieee(meta)), row('BibTeX', GsiCite.bibtex(meta)),
      h('div', { class: 'fine', text: meta.source === 'crossref' ? 'Disusun dari metadata Crossref untuk DOI artikel ini.'
        : p.doi ? 'Mengambil metadata lengkap dari Crossref…' : 'Disusun dari data yang tampil di Scholar, tanpa volume dan halaman. Jalankan verifikasi online agar sitasi dilengkapi dari DOI.' }));
  }

  function paperItem(p) {
    const m = p.m;
    const r = m.status === 'match' ? m.rec : null;
    const chips = r ? recChips(r, { cek: m.conf === 'cek' }) : [];
    if (m.status === 'ambiguous') chips.push(chip('amb', 'Ambigu · ' + m.cands.length));
    if (p.type !== 'journal' && p.type !== 'other') chips.push(chip('type', S.TYPE_LABEL[p.type]));
    if (m.pred) chips.push(chip('warn', 'Terindikasi predator'));
    if (p.ver && p.ver.retracted) chips.push(chip('warn', 'Artikel ditarik'));
    if (p.ver && p.ver.found) chips.push(chip('ver', 'DOI ✓'));
    return h('div', { class: 'item' },
      h('button', { class: 'item-t', text: p.title, title: 'Tampilkan di halaman Scholar', onclick: () => toTab({ type: 'CMD_SHOW', id: p.id }) }),
      h('div', { class: 'item-m', text: [r ? r.n : m.name || p.venue, p.year].filter(Boolean).join(' · ') }),
      h('div', { class: 'item-f' }, chips,
        h('span', { class: 'n', text: (isProfile() && p.pos !== 'unknown' ? S.POS_LABEL[p.pos] + ' · ' : '') + fmt(p.cites) + ' sitasi' })),
      h('div', { class: 'item-a' },
        h('button', { class: 'linkbtn', text: ui.cite === p.id ? 'Tutup sitasi' : 'Sitasi', 'aria-expanded': String(ui.cite === p.id), onclick: () => toggleCite(p) }),
        p.doi ? link('https://doi.org/' + p.doi, p.doi) : null,
        p.ver && p.ver.oaUrl ? link(p.ver.oaUrl, 'PDF akses terbuka') : null),
      ui.cite === p.id ? citeBox(p) : null);
  }

  function vPublikasi() {
    if (!data) return needData();
    const opt = (v, t) => h('option', { value: v, text: t, selected: ui.filter === v });
    const filter = h('select', { 'aria-label': 'Saring', onchange: (e) => { ui.filter = e.target.value; render(); } },
      opt('', 'Semua publikasi'), opt('idx', 'Terindeks SINTA/Scopus'),
      h('optgroup', { label: 'SINTA' }, [1, 2, 3, 4, 5, 6].map((l) => opt('s' + l, 'SINTA ' + l))),
      h('optgroup', { label: 'Scopus' }, [1, 2, 3, 4].map((q) => opt('q' + q, 'Scopus Q' + q))),
      h('optgroup', { label: 'Status' }, opt('doaj', 'DOAJ'), opt('cek', 'Perlu dicek'), opt('warn', 'Peringatan'), opt('none', 'Jurnal tidak terindeks'), opt('retracted', 'Artikel ditarik'), isProfile() ? opt('mine', 'Mungkin bukan milik pemilik profil') : null),
      h('optgroup', { label: 'Jenis' }, Object.entries(S.TYPE_LABEL).map(([k, v]) => opt('t:' + k, v))),
      isProfile() ? h('optgroup', { label: 'Kepenulisan' }, opt('a:lead', 'Penulis pertama/tunggal'), opt('a:middle', 'Penulis tengah'), opt('a:last', 'Penulis terakhir')) : null);
    const sopt = (v, t) => h('option', { value: v, text: t, selected: ui.sort === v });
    const sort = h('select', { 'aria-label': 'Urutkan', onchange: (e) => { ui.sort = e.target.value; render(); } },
      sopt('cites', 'Sitasi terbanyak'), sopt('year', 'Terbaru'), sopt('tier', 'Peringkat terbaik'));
    const search = h('input', { type: 'search', id: 'pub-q', placeholder: 'Cari judul atau jurnal…', value: ui.q, 'aria-label': 'Cari publikasi', oninput: (e) => { ui.q = e.target.value; render(true); } });

    const q = S.norm(ui.q);
    let list = papers().filter((p) => passes(p, ui.filter) && (!q || S.norm(p.title + ' ' + p.venue + ' ' + (p.m.rec ? p.m.rec.n : '')).includes(q)));
    list = list.slice().sort(ui.sort === 'year' ? (a, b) => (b.year || 0) - (a.year || 0) : ui.sort === 'tier' ? (a, b) => tierRank(a) - tierRank(b) || b.cites - a.cites : (a, b) => b.cites - a.cites);
    const shown = list.slice(0, 300);
    return [card(null, h('div', { class: 'tools' }, search, filter, sort)),
      card(list.length + ' publikasi', list.length ? h('div', { class: 'list' }, shown.map(paperItem)) : h('p', { class: 'muted', text: 'Tidak ada publikasi yang cocok dengan saringan.' }),
        list.length > shown.length ? h('p', { class: 'fine', text: 'Menampilkan 300 pertama. Persempit dengan saringan atau ekspor CSV untuk daftar lengkap.' }) : null)];
  }

  // ── Kualitas ──────────────────────────────────────────────────────────────
  function tickButton(key, ids, label, action) {
    return h('button', { class: 'btn ghost', text: label, onclick: async () => {
      const r = await toTab({ type: 'CMD_TICK', ids });
      ui.tickMsg[key] = !r || r.total == null ? 'Tab profil tidak merespons. Muat ulang halaman Scholar lalu coba lagi.'
        : r.editable ? r.ticked + ' artikel dicentang di halaman Scholar. Periksa lagi di sana, lalu tekan tombol ' + action + ' milik Google Scholar.'
          : 'Artikel sudah ditandai di halaman Scholar, tetapi kotak centangnya tidak tersedia. Masuk ke akun pemilik profil untuk bisa memakai tombol ' + action + '.';
      render(true);
    } });
  }
  /** Variasi penulisan nama pemilik profil; disimpan per profil dan dipakai untuk mengenali artikel miliknya. */
  function aliasBox() {
    const cur = (data.aliases || []).join(', ');
    let val = cur;
    const input = h('input', { type: 'text', id: 'alias-in', value: cur, placeholder: 'mis. M Ikhsan, Ikhsan Hasibuan', 'aria-label': 'Variasi nama pemilik profil', oninput: (e) => { val = e.target.value; } });
    const save = async () => {
      const list = [...new Set(val.split(/[,;\n]+/).map((x) => x.trim().replace(/\s+/g, ' ')).filter((x) => x.length >= 3 && x.length <= 60))].slice(0, 12);
      const all = (await chrome.storage.local.get('aliases')).aliases || {};
      if (list.length) all[data.user] = list; else delete all[data.user];
      await chrome.storage.local.set({ aliases: all });
      ui.tickMsg.alias = list.length ? list.length + ' variasi nama disimpan. Daftar di bawah dihitung ulang.' : 'Variasi nama dikosongkan.';
      data.aliases = list;
      const r = await toTab({ type: 'CMD_ALIASES', aliases: list });
      if (!r) render(true);
    };
    return h('div', { class: 'alias' },
      h('label', { class: 'field', for: 'alias-in' }, 'Nama pemilik profil ditulis berbeda di sebagian artikel? Tambahkan variasinya, pisahkan dengan koma.'),
      h('div', { class: 'tools', style: 'margin-top:6px' }, input, h('button', { class: 'btn ghost', text: 'Simpan variasi nama', onclick: save })),
      tickNote('alias'));
  }

  const tickNote = (key) => (ui.tickMsg[key] ? h('div', { class: 'banner', style: 'margin:8px 0', text: ui.tickMsg[key] }) : null);

  function vKualitas() {
    if (!data) return needData();
    const hy = S.hygiene(papers());
    const block = (title, list, explain, render1, extra, keep) => card(title + ' · ' + list.length,
      h('p', { class: 'small muted', text: explain }), list.length || keep ? extra || null : null,
      list.length ? h('div', { class: 'list' }, list.slice(0, 60).map(render1 || paperItem)) : h('span', { class: 'status ok', text: 'Bersih' }));
    const total = hy.notMine.length + hy.retracted.length + hy.duplicates.length + hy.noYear.length + hy.noVenue.length + hy.predatory.length + hy.discontinued.length;
    const out = [card('Kebersihan profil', h('p', {}, total ? 'Ada ' + total + ' hal yang layak dirapikan. Profil yang bersih membuat h-index dan skor SINTA lebih akurat.' : 'Tidak ditemukan masalah pada publikasi yang dimuat.'))];
    if (isProfile()) {
      out.push(block('Kemungkinan bukan milik pemilik profil', hy.notMine,
        'Nama pemilik profil tidak ditemukan di daftar penulis. Google Scholar kadang memasukkan artikel orang lain yang namanya mirip. Periksa satu per satu, karena variasi penulisan nama bisa membuat artikel sendiri ikut terdaftar di sini.',
        null, h('div', {}, aliasBox(), h('div', { class: 'tools', style: 'margin-top:10px' }, tickButton('mine', hy.notMine.map((p) => p.id), 'Centang semuanya di Scholar', 'Hapus')), tickNote('mine'),
          h('p', { class: 'fine', text: 'Ekstensi hanya mencentang. Penghapusan tetap Anda lakukan sendiri lewat tombol Hapus di halaman Scholar, dan artikel yang terhapus masih bisa dipulihkan dari menu Sampah di sana.' })), (data.aliases || []).length > 0));
    }
    out.push(
      block('Artikel ditarik (retracted)', hy.retracted, 'Tercatat ditarik menurut OpenAlex. Hanya terdeteksi pada artikel yang sudah diverifikasi online.'),
      block('Terindikasi predator', hy.predatory, 'Nama jurnal, penerbit, atau domainnya ada di daftar stop-predatory-journals. Daftar ini indikatif; periksa manual sebelum menyimpulkan.'),
      block('Scopus discontinued', hy.discontinued, 'Jurnal sudah dihentikan pengindeksannya oleh Scopus. Artikel lama tetap terindeks, tetapi hindari untuk naskah baru.'),
      block('Kemungkinan duplikat', hy.duplicates, 'Judul yang sama muncul lebih dari sekali. Gabungkan di Scholar agar sitasi tidak terpecah.',
        (g) => h('div', { class: 'item' }, h('button', { class: 'item-t', text: g[0].title, title: 'Tampilkan di halaman Scholar', onclick: () => toTab({ type: 'CMD_SHOW', id: g[0].id }) }),
          h('div', { class: 'item-m', text: g.length + ' entri · sitasi ' + g.map((p) => p.cites).join(' + ') }),
          isProfile() ? h('div', { class: 'item-a' }, tickButton('dup', g.map((p) => p.id), 'Centang untuk digabung', 'Gabungkan')) : null),
        tickNote('dup')),
      block('Nama jurnal ambigu', hy.ambiguous, 'Beberapa jurnal memakai nama yang sama dengan peringkat berbeda. Klik badge di halaman Scholar untuk memilih, atau jalankan verifikasi online.'),
      block('Kecocokan perlu dicek', hy.check, 'Jurnal dicocokkan lewat kemiripan nama, singkatan, atau nama terpotong. Verifikasi online memastikannya lewat ISSN.'),
      block('Tanpa tahun', hy.noYear, 'Entri tanpa tahun terbit tidak ikut dihitung dalam tren tahunan.'),
      block('Tanpa nama terbitan', hy.noVenue, 'Scholar tidak mencatat tempat terbit, sehingga peringkat tidak bisa ditentukan.'));
    return out;
  }

  // ── Target publikasi ──────────────────────────────────────────────────────
  function describe(r) {
    const parts = [];
    if (r.scopusMaxQ) parts.push(r.scopusMaxQ === 4 ? 'Scopus (Q1–Q4)' : 'Scopus Q1' + (r.scopusMaxQ > 1 ? '–Q' + r.scopusMaxQ : ''));
    if (r.sintaMaxLevel) parts.push('SINTA 1' + (r.sintaMaxLevel > 1 ? '–' + r.sintaMaxLevel : ''));
    return 'Minimal ' + r.min + ' artikel jurnal di ' + parts.join(' atau ') + (r.sinceYear ? ', terbit sejak ' + r.sinceYear : '') + (r.firstAuthor ? ', sebagai penulis pertama' : '');
  }

  function vTarget() {
    const out = [];
    if (!isProfile()) out.push(empty('Buka sebuah profil', 'Target dinilai terhadap profil Google Scholar yang sedang dibuka.'));
    for (const rule of targets()) {
      const ev = isProfile() ? S.evalTarget(rule, papers()) : null;
      const status = !ev ? null : ev.met ? h('span', { class: 'status ok', text: '✓ Terpenuhi' }) : ev.metIfPending ? h('span', { class: 'status maybe', text: 'Terpenuhi bila terverifikasi' }) : h('span', { class: 'status no', text: 'Belum terpenuhi' });
      out.push(card(rule.label, h('p', { class: 'small muted', text: describe(rule) }),
        ev ? h('div', { class: 'item-f', style: 'margin-bottom:6px' }, status, h('span', { class: 'n', text: ev.count + ' dari ' + rule.min + (ev.pending ? ' · ' + ev.pending + ' perlu dicek' : '') })) : null,
        ev && ev.papers.length ? h('div', { class: 'list' }, ev.papers.slice(0, 15).map(paperItem)) : null,
        h('div', { class: 'tools', style: 'margin-top:8px' }, h('button', { class: 'btn danger', text: 'Hapus target', onclick: async () => { await saveSettings({ targets: targets().filter((x) => x.id !== rule.id) }); render(); } }))));
    }
    const f = { label: '', min: 1, scopusMaxQ: 4, sintaMaxLevel: 2, sinceYear: '', firstAuthor: false };
    const num = (key, label, min, max, ph) => h('label', { class: 'field' }, label, h('input', { type: 'number', min, max, value: f[key], placeholder: ph || null, oninput: (e) => { f[key] = e.target.value; } }));
    const sel = (key, label, opts) => h('label', { class: 'field' }, label, h('select', { onchange: (e) => { f[key] = +e.target.value; } }, opts.map(([v, t]) => h('option', { value: v, text: t, selected: f[key] === v }))));
    out.push(card('Tambah target',
      h('label', { class: 'field', style: 'margin-bottom:8px' }, 'Nama target', h('input', { type: 'text', placeholder: 'mis. Syarat ujian tertutup', oninput: (e) => { f.label = e.target.value; } })),
      h('div', { class: 'grid2' },
        num('min', 'Jumlah minimal', 1, 99),
        sel('scopusMaxQ', 'Scopus', [[0, 'Tidak dihitung'], [1, 'Q1 saja'], [2, 'Q1–Q2'], [3, 'Q1–Q3'], [4, 'Q1–Q4']]),
        sel('sintaMaxLevel', 'SINTA', [[0, 'Tidak dihitung'], [1, 'SINTA 1'], [2, 'SINTA 1–2'], [3, 'SINTA 1–3'], [4, 'SINTA 1–4'], [5, 'SINTA 1–5'], [6, 'SINTA 1–6']]),
        num('sinceYear', 'Terbit sejak tahun', 1990, 2100, 'bebas')),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', onchange: (e) => { f.firstAuthor = e.target.checked; } }), 'Hanya sebagai penulis pertama atau tunggal'),
      h('button', { class: 'btn', text: 'Simpan target', onclick: async () => {
        if (!f.scopusMaxQ && !f.sintaMaxLevel) return;
        const rule = { id: 't' + Date.now(), label: f.label.trim() || 'Target publikasi', min: Math.max(1, +f.min || 1), scopusMaxQ: f.scopusMaxQ, sintaMaxLevel: f.sintaMaxLevel, sinceYear: +f.sinceYear || 0, firstAuthor: f.firstAuthor };
        await saveSettings({ targets: targets().concat(rule) });
        render();
      } }),
      h('p', { class: 'fine', style: 'margin-top:8px', text: 'Hanya artikel jurnal yang dihitung. Sesuaikan dengan pedoman resmi program studi; alat ini membantu memantau, bukan menetapkan kelulusan.' })));
    return out;
  }

  // ── Journal Finder ────────────────────────────────────────────────────────
  function journalCard(r) {
    const rows = [];
    const add = (k, v) => { if (v) rows.push(h('dt', { text: k }), h('dd', {}, v)); };
    if (r.sinta && r.sinta.inst && r.sinta.inst !== '-') add('Pengelola', r.sinta.inst);
    if (r.scopus) add('Scopus', ['SJR ' + (r.scopus.sjr || '—'), r.scopus.h ? 'H-index ' + r.scopus.h : null, r.scopus.rank ? '#' + fmt(r.scopus.rank) : null, r.scopus.st !== 'active' ? r.scopus.st : null].filter(Boolean).join(' · '));
    if (r.doaj) { add('Biaya (APC)', apcText(r.doaj)); add('Lisensi', r.doaj.lic); if (r.doaj.weeks) add('Lama review', '± ' + r.doaj.weeks + ' minggu'); add('Negara', r.doaj.country); }
    add('ISSN', r.issn.map(issnFmt).join(' · '));
    const links = [r.doaj && r.doaj.url ? link(r.doaj.url, 'Situs jurnal') : null, r.sinta ? link(r.sinta.url, 'SINTA') : null, r.doaj ? link(r.doaj.doaj, 'DOAJ') : null,
      link('https://www.scimagojr.com/journalsearch.php?q=' + encodeURIComponent(r.issn[0] || r.n), 'SciMago')].filter(Boolean);
    return h('div', { class: 'item' }, h('div', { class: 'item-t', style: 'cursor:default', text: r.n }),
      h('div', { class: 'item-f', style: 'margin:5px 0' }, recChips(r)), h('dl', { class: 'kv' }, rows),
      h('div', { class: 'small', style: 'margin-top:6px;display:flex;gap:12px;flex-wrap:wrap' }, links));
  }

  /** Penilaian singkat sebuah jurnal: ok | maybe | no. */
  function verdict(m) {
    const r = m.status === 'match' ? m.rec : null, why = [];
    let lvl = 'ok';
    const worse = (l) => { if (l === 'no' || (l === 'maybe' && lvl === 'ok')) lvl = l; };
    if (m.pred) { worse('no'); why.push('Terindikasi predator: “' + m.pred.name + '” ada di daftar stop-predatory-journals.'); }
    if (m.status === 'none') { worse('maybe'); why.push(m.byIssn ? 'ISSN ini tidak terdaftar di SINTA, Scopus, maupun DOAJ pada basis data ekstensi.' : 'Tidak ditemukan di SINTA, Scopus, maupun DOAJ pada basis data ekstensi. Coba ulangi dengan ISSN.'); }
    if (m.status === 'ambiguous') { worse('maybe'); why.push('Ada ' + m.cands.length + ' jurnal dengan nama ini. Bandingkan pilihan di bawah, atau ulangi dengan ISSN.'); }
    if (r) {
      if (r.scopus) {
        if (r.scopus.dc || r.scopus.st === 'discontinued') { worse('no'); why.push('Sudah dihentikan pengindeksannya oleh Scopus (discontinued).'); }
        else if (r.scopus.st === 'inactive') { worse('maybe'); why.push('Tercatat tidak aktif di daftar sumber Scopus.'); }
        else why.push(r.scopus.q ? 'Terindeks Scopus kuartil Q' + r.scopus.q + (r.scopus.sjr ? ', SJR ' + r.scopus.sjr : '') + '.' : 'Terindeks Scopus, belum punya kuartil.');
      }
      if (r.sinta) why.push('Terakreditasi SINTA ' + r.sinta.l + '.');
      if (!r.scopus && !r.sinta) { worse('maybe'); why.push('Terdaftar di DOAJ, tetapi tidak terindeks SINTA maupun Scopus.'); }
      if (r.doaj) why.push('Akses terbuka (DOAJ). Biaya publikasi: ' + apcText(r.doaj) + (r.doaj.weeks ? ', lama review sekitar ' + r.doaj.weeks + ' minggu' : '') + '.');
      if (m.conf === 'cek') { worse('maybe'); why.push('Kecocokan nama belum pasti. Ulangi dengan ISSN agar hasilnya pasti.'); }
    }
    return { lvl, why, title: lvl === 'ok' ? 'Layak dipertimbangkan' : lvl === 'maybe' ? 'Perlu diperiksa lebih lanjut' : 'Sebaiknya dihindari' };
  }

  async function runCheck() {
    const q = ui.check.q.trim();
    if (!q) return;
    ui.check.res = 'loading';
    render();
    const r = await bg({ type: 'CHECK', q });
    ui.check.res = r && r.m ? r.m : { error: true };
    render();
  }

  function checkCard() {
    const input = h('input', { type: 'search', id: 'check-q', placeholder: 'Nama jurnal atau ISSN…', value: ui.check.q, 'aria-label': 'Nama jurnal atau ISSN', oninput: (e) => { ui.check.q = e.target.value; }, onkeydown: (e) => { if (e.key === 'Enter') runCheck(); } });
    const res = ui.check.res;
    let body = null;
    if (res === 'loading') body = h('p', { class: 'muted', text: 'Memeriksa…' });
    else if (res && res.error) body = h('p', { class: 'muted', text: 'Pemeriksaan gagal. Muat ulang ekstensi lalu coba lagi.' });
    else if (res) {
      const v = verdict(res);
      body = h('div', { style: 'margin-top:10px' },
        h('span', { class: 'status ' + v.lvl, text: v.title }),
        h('ul', { class: 'why' }, v.why.map((t) => h('li', { text: t }))),
        res.status === 'match' ? h('div', { class: 'list' }, journalCard(res.rec)) : null,
        res.status === 'ambiguous' ? h('div', { class: 'list' }, res.cands.map(journalCard)) : null,
        h('p', { class: 'fine', style: 'margin-top:8px', text: 'Penilaian memakai basis data lokal ekstensi dan bersifat bantuan awal. Baca juga ruang lingkup dan pedoman penulis di situs jurnal sebelum mengirim naskah.' }));
    }
    return card('Cek sebelum submit',
      h('p', { class: 'small muted', text: 'Tulis nama jurnal atau ISSN untuk melihat peringkat, status di Scopus, dan tanda bahaya sebelum mengirim naskah. Bisa juga lewat klik kanan pada teks yang diblok di halaman mana pun.' }),
      h('div', { class: 'tools' }, input, h('button', { class: 'btn', text: 'Cek', onclick: runCheck })), body);
  }

  async function takePending() {
    const r = await chrome.storage.session.get('pendingCheck');
    const pc = r.pendingCheck;
    if (!pc || Date.now() - pc.ts > 60000) return;
    await chrome.storage.session.remove('pendingCheck');
    ui.check.q = pc.q;
    setView('finder');
    runCheck();
  }

  async function runFinder() {
    ui.finderRes = 'loading';
    render();
    const res = await bg({ type: 'FIND', filter: Object.assign({ limit: 60 }, ui.finder) });
    ui.finderRes = res && res.items ? res : { error: true };
    render();
  }

  function vFinder() {
    const f = ui.finder;
    const tg = (list, v, kind, label) => h('button', { class: 'tg', 'aria-pressed': String(list.includes(v)), onclick: (e) => {
      const i = list.indexOf(v); if (i >= 0) list.splice(i, 1); else list.push(v);
      e.currentTarget.setAttribute('aria-pressed', String(i < 0));
    } }, chip(kind, label));
    const ck = (key, label) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: f[key], onchange: (e) => { f[key] = e.target.checked; } }), label);
    const input = h('input', { type: 'search', id: 'finder-q', placeholder: 'Kata kunci nama jurnal atau ISSN…', value: f.q, 'aria-label': 'Kata kunci', oninput: (e) => { f.q = e.target.value; }, onkeydown: (e) => { if (e.key === 'Enter') runFinder(); } });
    const out = [checkCard(), card('Cari tempat publikasi',
      h('div', { class: 'tools' }, input, h('button', { class: 'btn', text: 'Cari', onclick: runFinder })),
      h('div', { class: 'small muted', style: 'margin:10px 0 6px', text: 'Peringkat (kosongkan untuk semua)' }),
      h('div', { class: 'toggles' }, [1, 2, 3, 4, 5, 6].map((l) => tg(f.sinta, l, 's' + l, 'SINTA ' + l))),
      h('div', { class: 'toggles', style: 'margin-top:8px' }, [1, 2, 3, 4].map((q) => tg(f.scopus, q, 'q' + q, 'Scopus Q' + q))),
      h('div', { style: 'margin-top:8px' }, ck('noApc', 'Tanpa biaya publikasi (Diamond OA)'), ck('doaj', 'Terdaftar di DOAJ'), ck('activeOnly', 'Sembunyikan jurnal Scopus yang tidak aktif')))];
    const res = ui.finderRes;
    if (res === 'loading') out.push(card(null, h('p', { class: 'muted', text: 'Mencari…' })));
    else if (res && res.error) out.push(card(null, h('p', { class: 'muted', text: 'Pencarian gagal. Muat ulang ekstensi lalu coba lagi.' })));
    else if (res) out.push(card(fmt(res.total) + ' jurnal ditemukan', res.items.length ? h('div', { class: 'list' }, res.items.map(journalCard)) : h('p', { class: 'muted', text: 'Tidak ada jurnal yang cocok. Longgarkan saringan atau ganti kata kunci.' }),
      res.total > res.items.length ? h('p', { class: 'fine', text: 'Menampilkan ' + res.items.length + ' teratas (urut kuartil dan peringkat SJR). Tambah kata kunci untuk mempersempit.' }) : null));
    else out.push(card(null, h('p', { class: 'muted', text: 'Gabungkan kata kunci bidang (mis. “informatika”, “security”, “pendidikan”) dengan peringkat yang dituju. Semua pencarian berjalan di basis data lokal.' })));
    return out;
  }

  // ── Bandingkan profil ─────────────────────────────────────────────────────
  const getSaved = async () => (await chrome.storage.local.get('profiles')).profiles || {};

  const getWatch = async () => (await chrome.storage.local.get('watch')).watch || {};

  async function saveProfile() {
    if (!isProfile() || !data.user) return;
    const [saved, watch] = await Promise.all([getSaved(), getWatch()]);
    saved[data.user] = Object.assign(S.profileRow(data, papers()), { group: (watch[data.user] && watch[data.user].group) || (saved[data.user] && saved[data.user].group) || '' });
    await chrome.storage.local.set({ profiles: saved });
    setView('banding');
  }

  const COLS = [['papers', 'Publ.'], ['cites', 'Sitasi'], ['h', 'h'], ['g', 'g'], ['h5', 'h5'], ['scopus', 'Scopus'], ['q12', 'Q1–2'], ['sinta', 'SINTA'], ['s12', 'S1–2']];
  const profileUrl = (u) => 'https://scholar.google.com/citations?user=' + encodeURIComponent(u) + '&hl=id';

  async function vBanding() {
    const [saved, watch] = await Promise.all([getSaved(), getWatch()]);
    const [key, dir] = ui.cohortSort;
    const all = Object.values(saved);
    const groups = [...new Set(all.map((r) => r.group).concat(Object.values(watch).map((w) => w.group)).filter(Boolean))].sort();
    if (ui.group && !groups.includes(ui.group)) ui.group = '';
    const rows = all.filter((r) => !ui.group || r.group === ui.group).sort((a, b) => (key === 'name' ? a.name.localeCompare(b.name) * -dir : (a[key] - b[key]) * dir));
    const pending = Object.entries(watch).filter(([u, w]) => !saved[u] && (!ui.group || w.group === ui.group));

    const out = [card('Bandingkan profil',
      h('p', { class: 'small muted', text: 'Simpan profil dosen atau peneliti, lalu bandingkan dalam satu tabel. Data hanya tersimpan di browser ini, dan angka diperbarui saat profil dibuka lagi.' }),
      h('div', { class: 'tools' },
        h('button', { class: 'btn', text: isProfile() ? 'Simpan profil ini' : 'Buka profil untuk menyimpan', disabled: !isProfile(), onclick: saveProfile }),
        rows.length ? h('button', { class: 'btn ghost', text: 'Ekspor Excel (.xlsx)', onclick: () => {
          const head = ['Nama', 'Kelompok', 'Afiliasi', 'Publikasi', 'Sitasi', 'h-index', 'g-index', 'i10', 'h5', 'Scopus', 'Scopus Q1-Q2', 'SINTA', 'SINTA 1-2', 'Profil', 'Disimpan'];
          const body = rows.map((r) => [r.name, r.group || '', r.affil, r.papers, r.cites, r.h, r.g, r.i10, r.h5, r.scopus, r.q12, r.sinta, r.s12, r.url, new Date(r.savedAt).toLocaleDateString('id-ID')]);
          download('perbandingan-profil.xlsx', GsiXlsx.build([{ name: 'Perbandingan', rows: [head].concat(body) }]), GsiXlsx.MIME);
        } }) : null,
        groups.length ? h('select', { 'aria-label': 'Kelompok', onchange: (e) => { ui.group = e.target.value; render(); } },
          h('option', { value: '', text: 'Semua kelompok', selected: !ui.group }), groups.map((g) => h('option', { value: g, text: g, selected: ui.group === g }))) : null))];

    // Daftar pantau: profil di daftar ini tersimpan otomatis saat dibuka.
    const wf = { text: '', group: ui.group };
    out.push(card('Daftar pantau',
      h('p', { class: 'small muted', text: 'Tempel alamat atau ID profil Google Scholar, satu per baris, misalnya seluruh dosen satu program studi. Setiap profil di daftar ini tersimpan otomatis begitu dibuka dan selesai dimuat.' }),
      h('textarea', { rows: 3, placeholder: 'https://scholar.google.com/citations?user=…', 'aria-label': 'Alamat atau ID profil', oninput: (e) => { wf.text = e.target.value; } }),
      h('div', { class: 'tools', style: 'margin-top:8px' },
        h('input', { type: 'text', placeholder: 'Nama kelompok (opsional)', value: wf.group, 'aria-label': 'Nama kelompok', oninput: (e) => { wf.group = e.target.value; } }),
        h('button', { class: 'btn', text: 'Tambahkan', onclick: async () => {
          const ids = new Set();
          for (const line of wf.text.split(/[\s,;]+/)) {
            const m = line.match(/[?&]user=([\w-]{8,20})/) || line.match(/^([\w-]{10,14})$/);
            if (m) ids.add(m[1]);
          }
          if (!ids.size) return;
          const w = await getWatch(), sv = await getSaved(), g = wf.group.trim();
          for (const u of ids) { w[u] = { group: g, addedAt: Date.now() }; if (sv[u] && g) sv[u].group = g; }
          await chrome.storage.local.set({ watch: w, profiles: sv });
          if (g) ui.group = g;
          render();
        } })),
      pending.length ? h('div', { style: 'margin-top:10px' },
        h('div', { class: 'small muted', text: pending.length + ' profil belum dibuka:' }),
        h('div', { class: 'list' }, pending.slice(0, 80).map(([u, w]) => h('div', { class: 'item item-row' },
          link(profileUrl(u), 'Buka profil ' + u), h('span', { class: 'fine', text: w.group || '' }),
          h('button', { class: 'btn danger', 'aria-label': 'Hapus ' + u + ' dari daftar pantau', text: '×', onclick: async () => { const x = await getWatch(); delete x[u]; await chrome.storage.local.set({ watch: x }); render(); } })))),
        h('p', { class: 'fine', text: 'Buka satu per satu dengan jeda. Membuka banyak profil sekaligus bisa memicu captcha Google Scholar.' })) : null));

    if (!rows.length) { out.push(empty('Belum ada profil tersimpan', 'Buka profil Google Scholar seseorang, lalu tekan “Simpan profil ini”.')); return out; }
    const sum = (k) => rows.reduce((n, r) => n + (r[k] || 0), 0);
    out.push(card('Rekap' + (ui.group ? ' · ' + ui.group : ''), h('dl', { class: 'kv' },
      h('dt', { text: 'Profil' }), h('dd', { text: rows.length + (pending.length ? ' tersimpan, ' + pending.length + ' belum dibuka' : '') }),
      h('dt', { text: 'Publikasi' }), h('dd', { text: fmt(sum('papers')) }),
      h('dt', { text: 'Sitasi' }), h('dd', { text: fmt(sum('cites')) }),
      h('dt', { text: 'Rata-rata h-index' }), h('dd', { text: (sum('h') / rows.length).toFixed(1).replace('.', ',') }),
      h('dt', { text: 'Publikasi Scopus' }), h('dd', { text: fmt(sum('scopus')) + ' (Q1–Q2: ' + fmt(sum('q12')) + ')' }),
      h('dt', { text: 'Publikasi SINTA' }), h('dd', { text: fmt(sum('sinta')) + ' (S1–S2: ' + fmt(sum('s12')) + ')' })),
      h('p', { class: 'fine', style: 'margin-top:8px', text: 'Penjumlahan per profil. Artikel yang ditulis bersama oleh beberapa orang di daftar ini terhitung lebih dari sekali.' })));
    const th = (k, label) => h('th', { 'aria-sort': key === k ? (dir < 0 ? 'descending' : 'ascending') : null },
      h('button', { text: label + (key === k ? (dir < 0 ? ' ▾' : ' ▴') : ''), onclick: () => { ui.cohortSort = [k, key === k ? -dir : -1]; render(); } }));
    out.push(card(rows.length + ' profil', h('div', { class: 'tbl-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, th('name', 'Nama'), COLS.map(([k, l]) => th(k, l)), h('th', {}))),
      h('tbody', {}, rows.map((r) => h('tr', {},
        h('td', {}, link(r.url, r.name), h('div', { class: 'fine', text: (r.group ? r.group + ' · ' : '') + new Date(r.savedAt).toLocaleDateString('id-ID') + (r.complete ? '' : ' · belum lengkap') })),
        COLS.map(([k]) => h('td', { text: fmt(r[k]) })),
        h('td', {}, h('button', { class: 'btn danger', 'aria-label': 'Hapus ' + r.name, text: '×', onclick: async () => { const c = await getSaved(); delete c[r.user]; const x = await getWatch(); delete x[r.user]; await chrome.storage.local.set({ profiles: c, watch: x }); render(); } })))))))));
    return out;
  }

  // ── Pengaturan ────────────────────────────────────────────────────────────
  async function vPengaturan() {
    const st = await chrome.storage.local.get(['overrides', 'verifyCache']);
    const nOv = Object.keys(st.overrides || {}).length, nVc = Object.keys(st.verifyCache || {}).length;
    const meta = await bg({ type: 'META' });
    const ck = (key, label, hint) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: settings[key] !== false, onchange: (e) => saveSettings({ [key]: e.target.checked }) }), h('span', {}, label, hint ? h('div', { class: 'fine', text: hint }) : null));
    const src = meta && meta.meta ? meta.meta.sources : null;
    return [
      card('Tampilan',
        ck('badges', 'Tampilkan badge di halaman Scholar'),
        ck('autoLoad', 'Muat semua publikasi otomatis', 'Menekan “Tampilkan lainnya” sampai habis. Profil dengan ratusan paper butuh beberapa detik; berlaku pada pemuatan halaman berikutnya.'),
        h('label', { class: 'field', style: 'margin-top:6px' }, 'Tema dasbor', h('select', { onchange: (e) => saveSettings({ theme: e.target.value }) },
          [['auto', 'Ikuti sistem'], ['light', 'Terang'], ['dark', 'Gelap']].map(([v, t]) => h('option', { value: v, text: t, selected: settings.theme === v }))))),
      card('Data tersimpan',
        h('p', { class: 'small muted', text: nOv + ' pilihan jurnal manual · ' + nVc + ' hasil verifikasi tersimpan' }),
        h('div', { class: 'tools' },
          h('button', { class: 'btn ghost', text: 'Hapus pilihan manual', disabled: !nOv, onclick: async () => { await chrome.storage.local.remove('overrides'); render(); } }),
          h('button', { class: 'btn ghost', text: 'Hapus cache verifikasi', disabled: !nVc, onclick: async () => { await chrome.storage.local.remove('verifyCache'); render(); } }))),
      card('Basis data', src ? h('dl', { class: 'kv' },
        h('dt', { text: 'Jurnal' }), h('dd', { text: fmt(meta.meta.records) + ' rekaman (dibangun ' + meta.meta.built + ')' }),
        h('dt', { text: 'Asal' }), h('dd', { text: meta.db && meta.db.source === 'online' ? 'Pembaruan online, versi ' + meta.db.version : 'Bawaan ekstensi' }),
        h('dt', { text: 'SINTA' }), h('dd', { text: fmt(meta.meta.sinta) + ' jurnal · ' + src.sinta }),
        h('dt', { text: 'Scopus' }), h('dd', { text: fmt(meta.meta.scopus) + ' jurnal · ' + src.scopus + ' (' + src.scopus_updated + ')' }),
        h('dt', { text: 'DOAJ' }), h('dd', { text: fmt(meta.meta.doaj) + ' jurnal · ' + src.doaj_updated }),
        h('dt', { text: 'Predator' }), h('dd', { text: src.predatory + ' (' + src.predatory_updated + ')' })) : h('p', { class: 'muted', text: 'Basis data belum termuat.' }),
        h('p', { class: 'fine', style: 'margin-top:8px', text: 'Peringkat mengikuti tanggal data di atas dan bisa berbeda dari kondisi terbaru. Untuk keperluan resmi, konfirmasi ke portal SINTA dan Scopus.' })),
      card('Pembaruan online', meta && meta.updOn ? [
        ck('autoUpdate', 'Perbarui basis data otomatis', 'Sepekan sekali ekstensi memeriksa server kampus. Basis data baru hanya dipakai bila tanda tangannya sah. Pemeriksaan ini sekaligus menjadi hitungan anonim jumlah pemasangan aktif: yang terkirim hanya nomor versi ekstensi, tanpa identitas apa pun.'),
        h('p', { class: 'small muted', style: 'margin-top:6px', text: updText(meta.upd) }),
        updMsg ? h('div', { class: 'banner', style: 'margin:8px 0', text: updMsg }) : null,
        h('div', { class: 'tools' }, h('button', { class: 'btn ghost', text: 'Periksa sekarang', onclick: async (e) => {
          e.currentTarget.disabled = true; e.currentTarget.textContent = 'Memeriksa…';
          const r = await bg({ type: 'UPDATE_CHECK' });
          updMsg = !r || r.error ? 'Pemeriksaan gagal: ' + ((r && r.error) || 'tidak ada jawaban') + '.' : r.updated ? 'Basis data diperbarui ke versi ' + r.updated + '. Muat ulang tab Google Scholar agar badge memakai data baru.' : 'Basis data sudah yang terbaru.';
          await showAppUpdate();
          render();
        } })),
      ] : h('p', { class: 'muted', text: 'Pembaruan online belum diatur pada paket ini. Basis data mengikuti versi ekstensi yang terpasang.' })),
      card('Tentang',
        h('p', {}, h('b', { text: 'UINSU Google Scholar Insight' }), ' v' + chrome.runtime.getManifest().version),
        h('p', {}, h('b', { 'data-credit': 'text', text: GsiBrand.text() })),
        h('p', { class: 'small muted', text: 'Tanpa pelacakan dan tanpa analytics: seluruh pencocokan berjalan di browser Anda.' }),
        h('p', { class: 'small' }, link(chrome.runtime.getURL('welcome/welcome.html'), 'Laman awal'), ' · ', link(chrome.runtime.getURL('docs/panduan.html'), 'Panduan penggunaan')),
        h('p', { class: 'fine', text: 'Sumber data: SINTA Kemdiktisaintek, SciMago dan daftar sumber Scopus, DOAJ, stop-predatory-journals.' })),
    ];
  }

  const tglJam = (t) => new Date(t).toLocaleString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  function updText(u) {
    if (!u || !u.lastTry) return 'Belum pernah diperiksa.';
    if (u.error) return 'Pemeriksaan terakhir ' + tglJam(u.lastTry) + ' gagal: ' + u.error + '.' + (u.lastOk ? ' Terakhir berhasil ' + tglJam(u.lastOk) + '.' : '');
    return 'Terakhir diperiksa ' + tglJam(u.lastOk || u.lastTry) + (u.remoteDb ? '. Versi di server: ' + u.remoteDb : '') + '.';
  }

  /** Pemberitahuan bila server mengumumkan versi ekstensi yang lebih baru. */
  async function showAppUpdate() {
    const m = await bg({ type: 'META' });
    const app = m && m.upd && m.upd.app, cur = chrome.runtime.getManifest().version;
    const num = (v) => String(v || '').split('.').map(Number);
    const newer = app && (() => { const x = num(app.version), y = num(cur); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; })();
    let el = document.getElementById('app-update');
    if (!newer) { if (el) el.remove(); return; }
    if (!el) { el = h('div', { id: 'app-update', class: 'banner app-update', role: 'status' }); $view.before(el); }
    el.replaceChildren(h('span', {}, h('b', { text: 'Versi ' + app.version + ' tersedia. ' }), app.notes ? String(app.notes).slice(0, 160) : 'Anda memakai versi ' + cur + '.'),
      /^https:\/\//.test(app.url || '') ? link(app.url, 'Unduh', 'btn') : null);
  }

  // ── Mulai ─────────────────────────────────────────────────────────────────
  (async function init() {
    GsiBrand.mount();
    GsiBrand.guard(() => GsiBrand.notice());
    const seal = await bg({ type: 'META' });
    if (seal && seal.error === 'integrity') { GsiBrand.notice(); return; }
    takePending();
    showAppUpdate();
    const r = await chrome.storage.local.get('settings');
    Object.assign(settings, r.settings || {});
    applyTheme();
    bg({ type: 'META' }).then((m) => {
      if (m && m.meta) document.getElementById('db-meta').append(fmt(m.meta.records) + ' jurnal', h('br'), 'data ' + m.meta.sources.scopus_updated);
    });
    sync();
  })();
})();
