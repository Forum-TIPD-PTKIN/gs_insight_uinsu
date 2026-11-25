/**
 * UINSU Google Scholar Insight — pembantu antarmuka bersama (halaman Scholar, panel, laporan).
 * Semua teks dari luar dimasukkan lewat textContent, tidak pernah innerHTML.
 */
(function (root) {
  'use strict';

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  const SVG = 'http://www.w3.org/2000/svg';
  function s(tag, attrs, ...kids) {
    const el = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs || {})) if (v != null) el.setAttribute(k, v);
    for (const kid of kids.flat()) if (kid != null) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  }

  const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('id-ID'));
  const issnFmt = (x) => (x && x.length === 8 ? x.slice(0, 4) + '-' + x.slice(4) : x);
  const link = (href, text, cls) => h('a', { href, target: '_blank', rel: 'noopener noreferrer', class: cls, text });

  /** Chip tier: S1–S6, Q1–Q4, DOAJ, dst. */
  function chip(kind, label, opts) {
    opts = opts || {};
    return h('span', { class: 'gsi-chip gsi-' + kind + (opts.cek ? ' gsi-cek' : '') + (opts.cls ? ' ' + opts.cls : ''), title: opts.title || null },
      label, opts.count != null ? h('b', { text: String(opts.count) }) : null);
  }

  /** Deretan chip untuk satu rekaman jurnal. */
  function recChips(rec, opts) {
    const out = [];
    if (!rec) return out;
    if (rec.sinta) out.push(chip('s' + rec.sinta.l, 'SINTA ' + rec.sinta.l, opts));
    if (rec.scopus) {
      const st = rec.scopus.dc || rec.scopus.st === 'discontinued' ? ' · discontinued' : rec.scopus.st === 'inactive' ? ' · inactive' : '';
      out.push(rec.scopus.q ? chip('q' + rec.scopus.q, 'Scopus Q' + rec.scopus.q + st, opts) : chip('none', 'Scopus' + (st || ' · tanpa kuartil'), opts));
    }
    if (rec.doaj) out.push(chip(rec.doaj.apc === 0 ? 'diamond' : 'doaj', rec.doaj.apc === 0 ? 'DOAJ · tanpa APC' : 'DOAJ', opts));
    return out;
  }

  function apcText(d) {
    if (!d) return '—';
    if (d.apc === 0) return 'Tanpa biaya (Diamond OA)';
    return d.amt ? fmt(d.amt) + ' ' + d.cur : 'Berbayar';
  }

  function download(name, text, mime) {
    const url = URL.createObjectURL(new Blob([text], { type: mime || 'text/csv;charset=utf-8' }));
    const a = h('a', { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  const slug = (s2) => (s2 || 'scholar').normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').slice(0, 40).toLowerCase();

  root.GsiUI = { h, s, fmt, issnFmt, link, chip, recChips, apcText, download, slug };
})(typeof self !== 'undefined' ? self : this);
