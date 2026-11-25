/**
 * UINSU Google Scholar Insight — komponen visual bersama untuk panel dan laporan.
 */
(function (root) {
  'use strict';
  const { h, s, fmt, chip } = GsiUI;
  const S = GsiStats;

  const BUCKET_VAR = { q12: 'var(--b-q12)', q34: 'var(--b-q34)', s12: 'var(--b-s12)', s36: 'var(--b-s36)', other: 'var(--b-other)' };
  const TIER_COLOR = { s1: '#172b6b', s2: '#1d4ed8', s3: '#3b82f6', s4: '#93c5fd', s5: '#cfe1fb', s6: '#d5dbe7', q1: '#8a2c0d', q2: '#c2410c', q3: '#f08a3c', q4: '#fcd9b4' };

  const kpi = (value, label, note) => h('div', { class: 'kpi' }, h('div', { class: 'kpi-v', text: value }), h('div', { class: 'kpi-l', text: label }), note ? h('div', { class: 'kpi-n', text: note }) : null);

  function kpis(m, scholar) {
    const diff = (mine, theirs) => (theirs != null && theirs !== mine ? 'Scholar: ' + fmt(theirs) : null);
    return h('div', { class: 'kpis' },
      kpi(fmt(m.papers), 'Publikasi', m.firstYear ? 'sejak ' + m.firstYear : null),
      kpi(fmt(m.cites), 'Sitasi', scholar ? diff(m.cites, scholar.cites) : null),
      kpi(m.h, 'h-index', scholar ? diff(m.h, scholar.h) : null),
      kpi(m.g, 'g-index', 'menghargai paper sangat tersitasi'),
      kpi(m.i10, 'i10-index', scholar ? diff(m.i10, scholar.i10) : null),
      kpi(m.h5, 'h5-index', m.recentPapers + ' paper 5 tahun terakhir'),
      kpi(m.m, 'm-quotient', 'h-index per tahun karier'),
      kpi(String(m.mean).replace('.', ','), 'Sitasi per paper', 'median ' + String(m.median).replace('.', ',')));
  }

  function tierBars(kind, counts, from, to, total) {
    const max = Math.max(1, ...counts.slice(from, to + 1));
    const rows = [];
    for (let i = from; i <= to; i++) {
      const key = kind + i;
      rows.push(h('div', { class: 'bar-row' },
        chip(key, (kind === 's' ? 'SINTA ' : 'Scopus Q') + i),
        h('div', { class: 'bar-track' }, counts[i] ? h('div', { class: 'bar-fill', style: 'width:' + (counts[i] / max) * 100 + '%;background:' + TIER_COLOR[key] }) : null),
        h('div', { class: 'bar-n', text: counts[i], title: total ? Math.round((counts[i] / total) * 100) + '% dari seluruh publikasi' : null })));
    }
    return h('div', { class: 'bars' }, rows);
  }

  /** Grafik batang bertumpuk: publikasi per tahun menurut tier. */
  function yearChart(rows) {
    if (!rows.length) return h('p', { class: 'muted', text: 'Belum ada publikasi bertahun.' });
    const W = 340, H = 150, L = 22, B = 16, T = 6;
    const max = Math.max(1, ...rows.map((r) => r.total));
    const step = max <= 4 ? 1 : Math.ceil(max / 4);
    const top = Math.ceil(max / step) * step;
    const bw = (W - L - 4) / rows.length;
    const y = (v) => T + (H - T - B) * (1 - v / top);
    const svg = s('svg', { class: 'chart', viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Publikasi per tahun menurut tier' });
    for (let v = 0; v <= top; v += step) {
      svg.append(s('line', { class: 'grid', x1: L, x2: W, y1: y(v), y2: y(v) }), s('text', { x: L - 4, y: y(v) + 3, 'text-anchor': 'end' }, v));
    }
    const every = Math.ceil(rows.length / 9);
    rows.forEach((r, i) => {
      let acc = 0;
      const x = L + 2 + i * bw;
      const g = s('g', {}, s('title', {}, r.year + ': ' + r.total + ' publikasi, ' + r.cites + ' sitasi'));
      for (const [k] of S.BUCKETS) {
        if (!r[k]) continue;
        const y1 = y(acc + r[k]);
        g.append(s('rect', { x: x + bw * 0.12, y: y1, width: Math.max(1, bw * 0.76), height: Math.max(0, y(acc) - y1 - 0.6), rx: 1.5, fill: BUCKET_VAR[k] }));
        acc += r[k];
      }
      svg.append(g);
      if (i % every === 0 || i === rows.length - 1) svg.append(s('text', { x: x + bw / 2, y: H - 4, 'text-anchor': 'middle' }, String(r.year).slice(rows.length > 9 ? 2 : 0).replace(/^(\d\d)$/, "'$1")));
    });
    const legend = h('div', { class: 'legend' }, S.BUCKETS.map(([k, label]) => h('span', {}, h('i', { style: 'background:' + BUCKET_VAR[k] }), label)));
    return h('div', {}, svg, legend);
  }

  function segments(parts) {  // [{label, n, color}]
    const total = parts.reduce((a, p) => a + p.n, 0) || 1;
    return h('div', {},
      h('div', { class: 'seg', role: 'img', 'aria-label': parts.map((p) => p.label + ' ' + p.n).join(', ') },
        parts.filter((p) => p.n).map((p) => h('span', { style: 'width:' + (p.n / total) * 100 + '%;background:' + p.color, title: p.label + ': ' + p.n }))),
      h('div', { class: 'legend' }, parts.filter((p) => p.n).map((p) => h('span', {}, h('i', { style: 'background:' + p.color }), p.label + ' ' + p.n + ' (' + Math.round((p.n / total) * 100) + '%)'))));
  }

  function authorshipSeg(a) {
    return segments([
      { label: 'Penulis tunggal', n: a.sole, color: '#172b6b' }, { label: 'Penulis pertama', n: a.first, color: '#1d4ed8' },
      { label: 'Penulis tengah', n: a.middle, color: '#93c5fd' }, { label: 'Penulis terakhir', n: a.last, color: '#0f7a52' },
      { label: 'Tidak terbaca', n: a.unknown, color: 'var(--b-other)' },
    ]);
  }

  function typeSeg(types) {
    const colors = { journal: '#1d4ed8', proceeding: '#0f7a52', book: '#f2b63d', preprint: '#a78bfa', thesis: '#f08a3c', patent: '#b91c1c', other: 'var(--b-other)' };
    return segments(Object.keys(S.TYPE_LABEL).map((k) => ({ label: S.TYPE_LABEL[k], n: types[k] || 0, color: colors[k] })));
  }

  /** Tabel batang kategori publikasi. */
  function catTable(counts, labels) {
    const max = Math.max(1, ...labels.map(([k]) => counts[k] || 0));
    return h('div', { class: 'bars' }, labels.map(([k, label]) => h('div', { class: 'bar-row', style: 'grid-template-columns:minmax(0,1.5fr) minmax(40px,1fr) 30px' },
      h('span', { class: 'small', text: label }),
      h('div', { class: 'bar-track' }, h('div', { class: 'bar-fill', style: 'background:var(--accent);width:' + ((counts[k] || 0) / max) * 100 + '%' })),
      h('div', { class: 'bar-n', text: counts[k] || 0 }))));
  }

  /** Riwayat sitasi dan h-index dari potret yang tersimpan: [{ d, c, h, n }]. */
  function history(hist) {
    const tgl = (d) => new Date(d + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    if (!hist.length) return h('p', { class: 'muted', text: 'Riwayat mulai dicatat setelah seluruh publikasi profil ini selesai dimuat.' });
    if (hist.length < 2) return h('p', { class: 'muted', text: 'Potret pertama dicatat pada ' + tgl(hist[0].d) + ' (' + hist[0].c.toLocaleString('id-ID') + ' sitasi, h-index ' + hist[0].h + '). Buka profil ini lagi di hari lain untuk melihat perkembangannya.' });
    const a = hist[0], z = hist[hist.length - 1];
    const sign = (n) => (n > 0 ? '+' : '') + n.toLocaleString('id-ID');
    const W = 300, H = 70, P = 6;
    const lo = Math.min(...hist.map((x) => x.c)), hi = Math.max(...hist.map((x) => x.c));
    const t0 = Date.parse(a.d), t1 = Date.parse(z.d);
    const px = (x) => P + ((Date.parse(x.d) - t0) / Math.max(1, t1 - t0)) * (W - 2 * P);
    const py = (x) => H - P - ((x.c - lo) / Math.max(1, hi - lo)) * (H - 2 * P);
    const pts = hist.map((x) => px(x).toFixed(1) + ',' + py(x).toFixed(1)).join(' ');
    return h('div', {},
      h('p', {}, 'Sejak ' + tgl(a.d) + ': sitasi ', h('b', { text: sign(z.c - a.c) }), ', h-index ', h('b', { text: sign(z.h - a.h) }), ', publikasi ', h('b', { text: sign(z.n - a.n) }), '.'),
      s('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'spark', role: 'img', 'aria-label': 'Grafik jumlah sitasi dari ' + a.c + ' menjadi ' + z.c },
        s('polyline', { points: pts, fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }),
        hist.map((x) => s('circle', { cx: px(x).toFixed(1), cy: py(x).toFixed(1), r: 2.6, fill: 'var(--accent)' }))),
      h('div', { class: 'fine', text: tgl(a.d) + ' · ' + a.c.toLocaleString('id-ID') + ' sitasi  →  ' + tgl(z.d) + ' · ' + z.c.toLocaleString('id-ID') + ' sitasi (' + hist.length + ' potret)' }));
  }

  root.GsiW = { kpi, kpis, tierBars, yearChart, segments, authorshipSeg, typeSeg, catTable, history };
})(self);
