/**
 * UINSU Google Scholar Insight — analitik bibliometrik (fungsi murni, tanpa DOM).
 * Dipakai oleh content script, panel samping, dan laporan cetak.
 */
(function (root) {
  'use strict';

  const YEAR = new Date().getFullYear();
  const norm = (s) => (s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const TITLES = /^(dr|prof|ir|drs|dra|h|hj|st|mt|mkom|skom|msc|phd|med|mpd|spd|msi|ssi|mm|se|sh|mh|meng|ipm|ipu|asean|eng)$/;

  /** Tier terbitan sebuah paper (hanya bila cocok). */
  function tier(p) {
    const r = p.m && p.m.status === 'match' ? p.m.rec : null;
    return {
      s: r && r.sinta ? r.sinta.l : 0,
      q: r && r.scopus ? r.scopus.q : 0,
      doaj: !!(r && r.doaj),
      diamond: !!(r && r.doaj && r.doaj.apc === 0),
      discontinued: !!(r && r.scopus && (r.scopus.dc || r.scopus.st === 'discontinued')),
      inactive: !!(r && r.scopus && r.scopus.st === 'inactive'),
    };
  }

  /** Kelompok tunggal untuk grafik bertumpuk. */
  function bucket(p) {
    const t = tier(p);
    if (t.q === 1 || t.q === 2) return 'q12';
    if (t.q === 3 || t.q === 4) return 'q34';
    if (t.s === 1 || t.s === 2) return 's12';
    if (t.s >= 3) return 's36';
    return 'other';
  }
  const BUCKETS = [
    ['q12', 'Scopus Q1–Q2'], ['q34', 'Scopus Q3–Q4'], ['s12', 'SINTA 1–2'], ['s36', 'SINTA 3–6'], ['other', 'Lainnya'],
  ];

  function summary(papers) {
    const o = { total: papers.length, sinta: [0, 0, 0, 0, 0, 0, 0], scopus: [0, 0, 0, 0, 0], sintaTotal: 0, scopusTotal: 0,
      doaj: 0, diamond: 0, predatory: 0, ambiguous: 0, check: 0, indexed: 0, types: {} };
    for (const p of papers) {
      const t = tier(p);
      if (t.s) { o.sinta[t.s]++; o.sintaTotal++; }
      if (t.q) { o.scopus[t.q]++; o.scopusTotal++; }
      if (t.s || t.q) o.indexed++;
      if (t.doaj) o.doaj++;
      if (t.diamond) o.diamond++;
      if (p.m && p.m.pred) o.predatory++;
      if (p.m && p.m.status === 'ambiguous') o.ambiguous++;
      if (p.m && p.m.status === 'match' && p.m.conf === 'cek') o.check++;
      o.types[p.type] = (o.types[p.type] || 0) + 1;
    }
    return o;
  }

  function hIndex(cites) {
    const c = cites.slice().sort((a, b) => b - a);
    let h = 0;
    while (h < c.length && c[h] >= h + 1) h++;
    return h;
  }

  function metrics(papers) {
    const cites = papers.map((p) => p.cites || 0);
    const sorted = cites.slice().sort((a, b) => b - a);
    const total = cites.reduce((a, b) => a + b, 0);
    let g = 0, acc = 0;
    for (let i = 0; i < sorted.length; i++) { acc += sorted[i]; if (acc >= (i + 1) * (i + 1)) g = i + 1; }
    const years = papers.map((p) => p.year).filter(Boolean);
    const first = years.length ? Math.min(...years) : null;
    const span = first ? YEAR - first + 1 : 0;
    const h = hIndex(cites);
    const asc = sorted.slice().reverse();
    const median = asc.length ? (asc.length % 2 ? asc[(asc.length - 1) / 2] : (asc[asc.length / 2 - 1] + asc[asc.length / 2]) / 2) : 0;
    const recent = papers.filter((p) => p.year && p.year >= YEAR - 4);
    const top = papers.slice().sort((a, b) => (b.cites || 0) - (a.cites || 0))[0] || null;
    return {
      papers: papers.length, cites: total, h, g, i10: cites.filter((c) => c >= 10).length,
      h5: hIndex(recent.map((p) => p.cites || 0)), recentPapers: recent.length,
      m: span ? +(h / span).toFixed(2) : 0,
      mean: papers.length ? +(total / papers.length).toFixed(1) : 0, median,
      uncited: cites.filter((c) => c === 0).length,
      firstYear: first, span, perYear: span ? +(papers.length / span).toFixed(1) : 0,
      top, topShare: total && top ? Math.round(((top.cites || 0) / total) * 100) : 0,
    };
  }

  function byYear(papers) {
    const map = new Map();
    for (const p of papers) {
      if (!p.year) continue;
      const row = map.get(p.year) || { year: p.year, total: 0, cites: 0, q12: 0, q34: 0, s12: 0, s36: 0, other: 0 };
      row.total++; row.cites += p.cites || 0; row[bucket(p)]++;
      map.set(p.year, row);
    }
    const rows = [...map.values()].sort((a, b) => a.year - b.year);
    if (rows.length > 1) {  // isi tahun kosong agar sumbu waktu jujur
      const filled = [];
      for (let y = rows[0].year; y <= rows[rows.length - 1].year; y++) {
        filled.push(map.get(y) || { year: y, total: 0, cites: 0, q12: 0, q34: 0, s12: 0, s36: 0, other: 0 });
      }
      return filled;
    }
    return rows;
  }

  // ── Penulis ───────────────────────────────────────────────────────────────
  function nameParts(full) {
    const toks = norm((full || '').split(',')[0]).split(' ').filter((t) => t && !TITLES.test(t));
    return { toks, last: toks[toks.length - 1] || '', first: toks[0] || '' };
  }
  const splitAuthors = (s) => (s || '').replace(/…|\.\.\./g, '').split(',').map((a) => a.trim()).filter(Boolean);

  function isOwner(author, owner) {
    const a = norm(author).split(' ').filter(Boolean);
    if (!a.length || !owner.toks.length) return false;
    const aLast = a[a.length - 1];
    if (aLast === owner.last && (a.length === 1 || owner.toks.length === 1 || a[0][0] === owner.first[0])) return true;
    // Urutan nama terbalik / nama tunggal: cocokkan kata utuh mana pun yang panjang.
    return a.some((t) => t.length >= 4 && owner.toks.includes(t)) && a.every((t) => t.length <= 2 || owner.toks.includes(t));
  }

  /** Pencocok pemilik profil: nama di Scholar ditambah variasi nama yang diisi pengguna. */
  function ownerTest(ownerName, aliases) {
    const who = [ownerName].concat(aliases || []).map(nameParts).filter((o) => o.toks.length);
    const fn = (author) => who.some((o) => isOwner(author, o));
    fn.known = who.length > 0;
    return fn;
  }

  /** Posisi pemilik profil dalam daftar penulis. */
  function authorPosition(authors, ownerName, aliases) {
    const list = splitAuthors(authors);
    const truncated = /…|\.\.\./.test(authors || '');
    if (!list.length) return 'unknown';
    const mine = ownerTest(ownerName, aliases);
    const idx = list.findIndex(mine);
    if (idx < 0) return 'unknown';
    if (list.length === 1 && !truncated) return 'sole';
    if (idx === 0) return 'first';
    if (idx === list.length - 1 && !truncated) return 'last';
    return 'middle';
  }

  function authorship(papers) {
    const o = { sole: 0, first: 0, middle: 0, last: 0, unknown: 0 };
    for (const p of papers) o[p.pos || 'unknown']++;
    return o;
  }

  function collaborators(papers, ownerName, limit, aliases) {
    const mine = ownerTest(ownerName, aliases);
    const map = new Map();
    for (const p of papers) {
      for (const a of splitAuthors(p.authors)) {
        if (mine(a)) continue;
        const k = norm(a);
        if (k.length < 3) continue;
        const e = map.get(k) || { name: a, papers: 0, cites: 0 };
        e.papers++; e.cites += p.cites || 0;
        map.set(k, e);
      }
    }
    return [...map.values()].sort((a, b) => b.papers - a.papers || b.cites - a.cites).slice(0, limit || 10);
  }

  // ── Kebersihan profil ─────────────────────────────────────────────────────
  function hygiene(papers) {
    const groups = new Map();
    for (const p of papers) {
      const k = norm(p.title).split(' ').filter((t) => t.length > 2).sort().join(' ');
      if (k.length < 12) continue;
      (groups.get(k) || groups.set(k, []).get(k)).push(p);
    }
    return {
      duplicates: [...groups.values()].filter((g) => g.length > 1),
      noYear: papers.filter((p) => !p.year),
      noVenue: papers.filter((p) => !(p.venue || '').trim()),
      predatory: papers.filter((p) => p.m && p.m.pred),
      discontinued: papers.filter((p) => tier(p).discontinued),
      ambiguous: papers.filter((p) => p.m && p.m.status === 'ambiguous'),
      check: papers.filter((p) => p.m && p.m.status === 'match' && p.m.conf === 'cek'),
      notMine: papers.filter((p) => p.mine === 'no'),
      retracted: papers.filter((p) => p.ver && p.ver.retracted),
    };
  }

  // ── Target publikasi ──────────────────────────────────────────────────────
  const DEFAULT_TARGETS = [
    { id: 't1', label: 'Syarat publikasi S3: 1 artikel jurnal Scopus atau SINTA 2 ke atas', min: 1, scopusMaxQ: 4, sintaMaxLevel: 2, sinceYear: 0, firstAuthor: false },
  ];

  function evalTarget(rule, papers) {
    const hit = [], pending = [];
    for (const p of papers) {
      if (p.type !== 'journal') continue;
      if (rule.sinceYear && !(p.year >= rule.sinceYear)) continue;
      if (rule.firstAuthor && !['first', 'sole'].includes(p.pos)) continue;
      const t = tier(p);
      const ok = (rule.scopusMaxQ && t.q && t.q <= rule.scopusMaxQ) || (rule.sintaMaxLevel && t.s && t.s <= rule.sintaMaxLevel);
      if (ok) (p.m.conf === 'cek' ? pending : hit).push(p);
    }
    return { rule, count: hit.length, pending: pending.length, met: hit.length >= rule.min, metIfPending: hit.length + pending.length >= rule.min, papers: hit.concat(pending) };
  }

  /** Apakah nama pemilik profil ada di daftar penulis: 'yes' | 'no' | 'unknown' (daftar terpotong). */
  function ownership(authors, ownerName, aliases) {
    const list = splitAuthors(authors);
    const mine = ownerTest(ownerName, aliases);
    if (!list.length || !mine.known) return 'unknown';
    if (list.some(mine)) return 'yes';
    return /…|\.\.\./.test(authors || '') ? 'unknown' : 'no';
  }

  /** Jalan terdekat menuju h-index berikutnya. */
  function nextH(papers) {
    const c = papers.map((p) => ({ id: p.id, title: p.title, cites: p.cites || 0 })).sort((x, y) => y.cites - x.cites);
    const h = hIndex(c.map((x) => x.cites)), target = h + 1;
    if (c.length < target) return { h, target, possible: false, short: target - c.length, lack: 0, items: [] };
    const items = c.slice(0, target).filter((x) => x.cites < target).map((x) => Object.assign({ lack: target - x.cites }, x));
    return { h, target, possible: true, short: 0, lack: items.reduce((n, x) => n + x.lack, 0), items };
  }

  // ── Kategori publikasi (indikatif, bukan penilaian resmi) ─────────────────
  const CATEGORIES = [
    ['int', 'Jurnal internasional bereputasi (terindeks Scopus)'], ['s12', 'Jurnal nasional terakreditasi SINTA 1–2'],
    ['s34', 'Jurnal nasional terakreditasi SINTA 3–4'], ['s56', 'Jurnal nasional terakreditasi SINTA 5–6'],
    ['jurnal', 'Jurnal lain'], ['prosiding', 'Prosiding'], ['buku', 'Buku'], ['lain', 'Lainnya'],
  ];
  const CAT_LABEL = Object.fromEntries(CATEGORIES);
  function category(p) {
    if (p.type === 'proceeding') return 'prosiding';
    if (p.type === 'book') return 'buku';
    if (['preprint', 'thesis', 'patent'].includes(p.type)) return 'lain';
    const t = tier(p);
    if (t.q && !t.discontinued) return 'int';
    if (t.s) return t.s <= 2 ? 's12' : t.s <= 4 ? 's34' : 's56';
    return p.type === 'journal' ? 'jurnal' : 'lain';
  }
  function categoryCount(papers) {
    const o = Object.fromEntries(CATEGORIES.map(([k]) => [k, 0]));
    for (const p of papers) o[category(p)]++;
    return o;
  }

  /** Baris ringkas sebuah profil untuk tabel perbandingan. */
  function profileRow(info, papers) {
    const m = metrics(papers), sm = summary(papers);
    return { user: info.user, name: info.name, affil: info.affil, url: String(info.url || '').split('&')[0], savedAt: Date.now(), complete: !!info.allLoaded,
      papers: m.papers, cites: m.cites, h: m.h, g: m.g, i10: m.i10, h5: m.h5, scopus: sm.scopusTotal, q12: sm.scopus[1] + sm.scopus[2],
      sinta: sm.sintaTotal, s12: sm.sinta[1] + sm.sinta[2], indexed: sm.indexed };
  }

  // ── Ekspor ────────────────────────────────────────────────────────────────
  const TYPE_LABEL = { journal: 'Jurnal', proceeding: 'Prosiding', book: 'Buku', preprint: 'Preprint', thesis: 'Tesis/Repositori', patent: 'Paten', other: 'Lainnya' };
  const POS_LABEL = { sole: 'Tunggal', first: 'Pertama', middle: 'Tengah', last: 'Terakhir', unknown: '—' };
  const CONF_LABEL = { pasti: 'Pasti', kuat: 'Kuat', cek: 'Perlu dicek' };
  const MINE_LABEL = { yes: 'Ya', no: 'Tidak', unknown: 'Tidak terbaca' };

  /** Tabel publikasi sebagai larik (dipakai ekspor CSV dan Excel). */
  function toRows(papers) {
    const head = ['No', 'Judul', 'Penulis', 'Posisi penulis', 'Tahun', 'Sitasi', 'Jenis', 'Kategori', 'Terbitan (Scholar)', 'Jurnal tercocok',
      'ISSN', 'SINTA', 'Scopus', 'SJR', 'Status Scopus', 'DOAJ', 'APC', 'Keyakinan', 'Metode', 'Peringatan', 'Nama pemilik di daftar penulis', 'DOI', 'Tautan akses terbuka'];
    const rows = papers.map((p, i) => {
      const r = p.m && p.m.status === 'match' ? p.m.rec : null;
      const warn = [p.ver && p.ver.retracted ? 'Artikel ditarik (retracted)' : '', p.m && p.m.pred ? 'Terindikasi predator (' + p.m.pred.name + ')' : '',
        p.m && p.m.status === 'ambiguous' ? 'Nama jurnal ambigu' : '', tier(p).discontinued ? 'Scopus discontinued' : ''].filter(Boolean).join('; ');
      return [i + 1, p.title, p.authors, POS_LABEL[p.pos] || '', p.year || '', p.cites || 0, TYPE_LABEL[p.type] || '', CAT_LABEL[category(p)], p.venue,
        r ? r.n : '', r ? r.issn.join(' / ') : '', r && r.sinta ? 'S' + r.sinta.l : '', r && r.scopus ? (r.scopus.q ? 'Q' + r.scopus.q : 'Tanpa kuartil') : '',
        r && r.scopus && r.scopus.sjr ? r.scopus.sjr : '', r && r.scopus ? r.scopus.st : '', r && r.doaj ? 'Ya' : '',
        r && r.doaj ? (r.doaj.apc ? (r.doaj.amt ? r.doaj.amt + ' ' + r.doaj.cur : 'Berbayar') : 'Gratis') : '',
        p.m && p.m.conf ? CONF_LABEL[p.m.conf] : '', p.m && p.m.method ? p.m.method : '', warn, p.mine ? MINE_LABEL[p.mine] : '', p.doi || '', (p.ver && p.ver.oaUrl) || ''];
    });
    return { head, rows };
  }

  function toCsv(papers) {
    const esc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const t = toRows(papers);
    return '﻿' + [t.head].concat(t.rows).map((row) => row.map(esc).join(',')).join('\r\n');
  }

  root.GsiStats = { YEAR, tier, bucket, BUCKETS, summary, metrics, byYear, authorPosition, authorship, collaborators,
    hygiene, DEFAULT_TARGETS, evalTarget, toCsv, toRows, TYPE_LABEL, POS_LABEL, CONF_LABEL, norm,
    ownership, nextH, CATEGORIES, CAT_LABEL, category, categoryCount, profileRow };
})(typeof self !== 'undefined' ? self : this);
