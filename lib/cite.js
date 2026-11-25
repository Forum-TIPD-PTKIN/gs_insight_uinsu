/**
 * UINSU Google Scholar Insight — penyusun sitasi (APA 7, IEEE, BibTeX).
 * Sumber data: metadata Crossref bila DOI diketahui, selain itu data yang tampil di Scholar.
 */
(function (root) {
  'use strict';
  const clean = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  const initials = (given) => clean(given).split(/[\s.-]+/).filter(Boolean).map((w) => w[0].toUpperCase() + '.').join(' ');

  /** "MI Hasibuan" → { given: "M. I.", family: "Hasibuan" } */
  function parseScholarAuthor(a) {
    const t = clean(a).split(' ').filter(Boolean);
    if (t.length < 2) return { given: '', family: t[0] || '' };
    if (/^[A-Z]{1,4}$/.test(t[0])) return { given: t[0].split('').map((c) => c + '.').join(' '), family: t.slice(1).join(' ') };
    return { given: initials(t.slice(0, -1).join(' ')), family: t[t.length - 1] };
  }

  /** Metadata dari data Scholar (tanpa volume dan halaman). */
  function fromScholar(p) {
    const r = p.m && p.m.status === 'match' ? p.m.rec : null;
    const truncated = /…|\.\.\./.test(p.authors || '');
    return {
      source: 'scholar', truncated, type: p.type || 'journal',
      authors: String(p.authors || '').replace(/…|\.\.\./g, '').split(',').map((x) => x.trim()).filter(Boolean).map(parseScholarAuthor),
      title: clean(p.title), container: r ? r.n : clean(p.m && p.m.name) || '', year: p.year || '', volume: '', issue: '', pages: '', doi: p.doi || '',
    };
  }

  /** Metadata dari jawaban Crossref (/works/{doi}). */
  function fromCrossref(w) {
    const dp = (w.issued && w.issued['date-parts'] && w.issued['date-parts'][0]) || [];
    return {
      source: 'crossref', truncated: false, type: w.type === 'proceedings-article' ? 'proceeding' : /book/.test(w.type || '') ? 'book' : 'journal',
      authors: (w.author || []).map((a) => ({ given: initials(a.given || ''), family: clean(a.family || a.name || '') })).filter((a) => a.family),
      title: clean((w.title || [])[0]), container: clean((w['container-title'] || [])[0]), year: dp[0] || '',
      volume: clean(w.volume), issue: clean(w.issue), pages: clean(w.page).replace(/-+/g, '–'), doi: w.DOI || '',
    };
  }

  const etal = (m) => (m.truncated ? ', dkk.' : '');

  function apa(m) {
    const names = m.authors.map((a) => a.family + (a.given ? ', ' + a.given : ''));
    const who = names.length > 1 && !m.truncated ? names.slice(0, -1).join(', ') + ', & ' + names[names.length - 1] : names.join(', ') + etal(m);
    let s = (who ? who + ' ' : '') + '(' + (m.year || 't.t.') + '). ' + m.title + '.';
    if (m.container) s += ' ' + m.container + (m.volume ? ', ' + m.volume + (m.issue ? '(' + m.issue + ')' : '') : '') + (m.pages ? ', ' + m.pages : '') + '.';
    if (m.doi) s += ' https://doi.org/' + m.doi;
    return s;
  }

  function ieee(m) {
    const names = m.authors.map((a) => (a.given ? a.given + ' ' : '') + a.family);
    const who = m.truncated ? names.join(', ') + ', dkk.' : names.length > 2 ? names.slice(0, -1).join(', ') + ', and ' + names[names.length - 1] : names.join(' and ');
    const parts = [(who ? who + ', ' : '') + '“' + m.title + ',”'];
    if (m.container) parts.push(' ' + m.container + ',');
    if (m.volume) parts.push(' vol. ' + m.volume + ',');
    if (m.issue) parts.push(' no. ' + m.issue + ',');
    if (m.pages) parts.push(' ' + (/[–-]/.test(m.pages) ? 'pp. ' : 'p. ') + m.pages + ',');
    parts.push(' ' + (m.year || 't.t.') + (m.doi ? ', doi: ' + m.doi : '') + '.');
    return parts.join('');
  }

  function bibtex(m) {
    const ascii = (s) => String(s).normalize('NFKD').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const first = m.authors[0] ? ascii(m.authors[0].family) : 'anonim';
    const word = ascii((m.title.split(/\s+/).find((w) => w.length > 3) || m.title.split(/\s+/)[0] || ''));
    const kind = m.type === 'proceeding' ? 'inproceedings' : m.type === 'book' ? 'book' : 'article';
    const field = (k, v) => (v ? '  ' + k + ' = {' + v + '},\n' : '');
    return '@' + kind + '{' + first + (m.year || '') + word + ',\n'
      + field('author', m.authors.map((a) => a.family + (a.given ? ', ' + a.given : '')).join(' and ') + (m.truncated ? ' and others' : ''))
      + field('title', m.title) + field(kind === 'inproceedings' ? 'booktitle' : kind === 'book' ? 'publisher' : 'journal', m.container)
      + field('year', m.year) + field('volume', m.volume) + field('number', m.issue) + field('pages', m.pages.replace('–', '--')) + field('doi', m.doi) + '}';
  }

  root.GsiCite = { fromScholar, fromCrossref, apa, ieee, bibtex };
})(typeof self !== 'undefined' ? self : this);
