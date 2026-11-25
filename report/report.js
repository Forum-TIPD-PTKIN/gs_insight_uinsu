/** UINSU Google Scholar Insight — laporan siap cetak untuk satu profil. */
(async function () {
  'use strict';
  const { h, fmt, chip, recChips } = GsiUI;
  GsiBrand.mount();
  GsiBrand.guard(() => GsiBrand.notice());
  const S = GsiStats, W = GsiW;
  const $view = document.getElementById('view');
  document.getElementById('print').addEventListener('click', () => window.print());

  const key = 'tab' + new URLSearchParams(location.search).get('tab');
  const data = (await chrome.storage.session.get(key))[key];
  if (!data) {
    $view.append(h('div', { class: 'card empty' }, h('b', { text: 'Data tidak ditemukan' }), 'Buka kembali profil Google Scholar, lalu buat laporan dari dasbor.'));
    return;
  }
  const ps = data.papers || [];
  const sm = S.summary(ps), m = S.metrics(ps), hy = S.hygiene(ps);
  const card = (title, ...kids) => h('section', { class: 'card' }, h('h2', { text: title }), kids);
  const stored = (await chrome.storage.local.get('settings')).settings || {};
  const targets = stored.targets || S.DEFAULT_TARGETS;

  document.title = 'Laporan Publikasi — ' + (data.name || 'Google Scholar');
  document.getElementById('stamp').append('Dibuat ' + new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }), h('br'), 'Sumber: Google Scholar');

  $view.append(
    h('section', { class: 'card' },
      h('div', { class: 'who-name', text: data.name || '—' }),
      data.affil ? h('div', { class: 'muted', text: data.affil }) : null,
      h('div', { class: 'small muted', text: sm.total + ' publikasi dianalisis · ' + sm.indexed + ' terindeks SINTA/Scopus' + (data.allLoaded ? '' : ' · CATATAN: belum semua publikasi dimuat') })),
    data.kind === 'profile' ? card('Metrik', W.kpis(m, data.scholar)) : null,
    card('Sebaran peringkat', h('div', { class: 'split' },
      h('div', {}, h('div', { class: 'small muted', text: 'SINTA · ' + sm.sintaTotal }), W.tierBars('s', sm.sinta, 1, 6, sm.total)),
      h('div', {}, h('div', { class: 'small muted', text: 'Scopus · ' + sm.scopusTotal }), W.tierBars('q', sm.scopus, 1, 4, sm.total)))),
    h('div', { class: 'split' }, card('Publikasi per tahun', W.yearChart(S.byYear(ps))),
      h('div', { style: 'display:grid;gap:12px;align-content:start' }, card('Jenis terbitan', W.typeSeg(sm.types)), data.kind === 'profile' ? card('Peran kepenulisan', W.authorshipSeg(S.authorship(ps))) : null)));

  $view.append(card('Rekap kategori publikasi', W.catTable(S.categoryCount(ps), S.CATEGORIES),
    h('p', { class: 'fine', text: 'Pengelompokan indikatif menurut peringkat jurnal saat ini, bukan penilaian resmi BKD atau angka kredit.' })));

  if (data.kind === 'profile') {
    $view.append(card('Target publikasi', h('div', { class: 'list' }, targets.map((rule) => {
      const ev = S.evalTarget(rule, ps);
      return h('div', { class: 'item' }, h('b', { text: rule.label }), ' ',
        h('span', { class: 'status ' + (ev.met ? 'ok' : ev.metIfPending ? 'maybe' : 'no'), text: ev.met ? 'Terpenuhi' : ev.metIfPending ? 'Terpenuhi bila terverifikasi' : 'Belum terpenuhi' }),
        h('span', { class: 'muted', text: '  ' + ev.count + ' dari ' + rule.min }));
    }))));
    $view.append(card('Catatan kualitas', h('dl', { class: 'kv' },
      h('dt', { text: 'Terindikasi predator' }), h('dd', { text: hy.predatory.length }),
      h('dt', { text: 'Scopus discontinued' }), h('dd', { text: hy.discontinued.length }),
      h('dt', { text: 'Kemungkinan duplikat' }), h('dd', { text: hy.duplicates.length }),
      h('dt', { text: 'Kecocokan perlu dicek' }), h('dd', { text: hy.check.length + hy.ambiguous.length }))));
  }

  const indexed = ps.filter((p) => { const t = S.tier(p); return t.s || t.q; }).sort((a, b) => (b.year || 0) - (a.year || 0) || b.cites - a.cites);
  $view.append(card('Publikasi terindeks SINTA/Scopus (' + indexed.length + ')', h('table', {},
    h('thead', {}, h('tr', {}, ['No', 'Judul dan jurnal', 'Tahun', 'Peringkat', 'Sitasi'].map((t) => h('th', { text: t })))),
    h('tbody', {}, indexed.map((p, i) => h('tr', {},
      h('td', { text: i + 1, style: 'min-width:0' }),
      h('td', {}, h('b', { text: p.title }), h('div', { class: 'muted small', text: p.m.rec.n + (p.m.conf === 'cek' ? ' (kecocokan perlu dicek)' : '') })),
      h('td', { text: p.year || '—' }),
      h('td', {}, h('div', { class: 'item-f' }, recChips(p.m.rec, { cek: p.m.conf === 'cek' }))),
      h('td', { text: fmt(p.cites) })))))));

  $view.append(h('p', { class: 'fine', text: 'Peringkat berdasarkan basis data lokal UINSU Google Scholar Insight (SINTA, SciMago/Scopus, DOAJ) dan dapat berbeda dari kondisi terbaru. Tanda “?” berarti kecocokan nama jurnal belum dipastikan lewat ISSN.' }));
})();
