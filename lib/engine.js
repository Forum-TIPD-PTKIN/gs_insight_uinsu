/**
 * UINSU Google Scholar Insight — mesin pencocokan jurnal.
 *
 * Satu mesin untuk semua halaman. Prinsip:
 *  - identitas jurnal = rekaman (ISSN), bukan nama; satu nama boleh menunjuk banyak rekaman;
 *  - setiap hasil membawa metode dan tingkat keyakinan ('pasti' | 'kuat' | 'cek');
 *  - pencocokan fuzzy memilih kandidat TERBAIK dan menolak bila selisih dengan runner-up tipis;
 *  - bila ragu, kembalikan daftar kandidat alih-alih menebak.
 */
(function (root) {
  'use strict';

  const STOP = new Set(['of', 'the', 'and', 'in', 'on', 'for', 'a', 'an', 'to', 'dan', 'di', 'de',
    'la', 'le', 'et', 'des', 'del', 'y', 'e', 'untuk']);
  const ST = ['', 'active', 'inactive', 'discontinued'];

  // ── Normalisasi ───────────────────────────────────────────────────────────
  function norm(s) {
    return (s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
  }
  const sig = (n) => n.split(' ').filter((t) => t && !STOP.has(t));
  const stripParens = (s) => s.replace(/\s*[\(\[][^)\]]*[\)\]]\s*/g, ' ').replace(/\s+/g, ' ').trim();
  const initialsOf = (tokens) => tokens.map((t) => t[0]).join('');

  // ── Parser teks terbitan Google Scholar ───────────────────────────────────
  const CUT = new RegExp([
    ',?\\s+(?:vol(?:ume)?|no|nomor|issue|pp?|hal)\\.?\\s*\\d',   // "Vol. 5", "No 2", "pp. 1-9"
    '\\s+\\d{1,4}(?=\\s*(?:\\(|,|$|:\\s*\\d))',                  // " 12 (3)", " 8, 123", " 259"
    '\\s+\\d{1,6}\\s*[-\\u2013]\\s*\\d+\\s*$',                   // " 101-110"
    '\\s+\\d{5,6}\\s*$',                                          // " 12345" (nomor volume seri)
  ].join('|'), 'i');

  function parseVenue(raw) {
    let s = (raw || '').replace(/[ \s]+/g, ' ').trim();
    let year = null;
    const ym = s.match(/,?\s*\b((?:19|20)\d{2})\s*$/);
    if (ym && ym.index > 0) { year = +ym[1]; s = s.slice(0, ym.index); }
    else if (ym) { year = +ym[1]; s = ''; }
    const cut = s.search(CUT);
    let name = cut > 2 ? s.slice(0, cut) : s;
    const hasVolume = cut > 2;
    const tailTrunc = /(…|\.\.\.)\s*$/.test(name);
    name = name.replace(/\s*(…|\.\.\.)\s*$/, '');
    let head = null, tail = null;
    const gap = name.match(/^(.*?)\s*(?:…|\.\.\.)\s*(.*)$/);
    if (gap && gap[1] && gap[2]) { head = gap[1]; tail = gap[2]; }
    name = name.replace(/[\s,;:.\-]+$/, '').trim();
    return { raw: raw || '', name, year, hasVolume, truncated: tailTrunc, head, tail };
  }

  // ── Klasifikasi jenis terbitan ────────────────────────────────────────────
  const RE = {
    patent: /\b(us|ep|wo|id)?\s*patent\b|\bpaten\b/i,
    preprint: /\barxiv\b|\bbiorxiv\b|\bmedrxiv\b|\bssrn\b|\bpreprints?\b|\bresearch square\b|\btechrxiv\b|\bosf\b|\bzenodo\b|\bresearchgate\b|\bauthorea\b/i,
    thesis: /\b(thesis|dissertation|skripsi|tesis|disertasi|tugas akhir)\b|\b(repository|repositori|eprints?|digilib|etd)\b/i,
    journalNamedProc: /^(proceedings of the (ieee|national academy|royal society|london|nutrition|combustion|vldb|acm on )|mayo clinic proceedings|mathematical proceedings|annual review)/i,
    proceeding: /\bproceedings?\b|\bprosiding\b|\bproc\.|\bconf\.|\bconference\b|\bkonferensi\b|\bsymposium\b|\bsimposium\b|\bcongress\b|\bworkshop\b|\bseminar\b|\bsemnas\b|\bcolloquium\b|\bwebinar\b|\b(iop|aip|matec|e3s|shs|epj|bio) (conf|web)|\blecture notes in\b|\bprocedia\b|\badvances in intelligent systems\b|\bcommunications in computer and information science\b/i,
    book: /^(springer|elsevier|crc press|wiley|routledge|taylor (&|and) francis|sage publications?|oxford university press|cambridge university press|mcgraw.?hill|prenada|gramedia|rajawali|deepublish|penerbit|pt\.?\s|cv\.?\s|igi global|intechopen|nova science|academic press|pearson|andi\b|graha ilmu|uad press)/i,
  };

  function classifyType(raw, hasVolume) {
    const s = (raw || '').trim();
    if (!s) return 'other';
    if (RE.patent.test(s)) return 'patent';
    if (RE.preprint.test(s)) return 'preprint';
    if (RE.journalNamedProc.test(s)) return 'journal';
    if (RE.proceeding.test(s)) return 'proceeding';
    if (RE.thesis.test(s)) return 'thesis';
    if (RE.book.test(s) && !hasVolume) return 'book';
    return hasVolume ? 'journal' : 'other';
  }

  // ── Jarak edit terbatas (untuk toleransi salah ketik) ─────────────────────
  function editWithin(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return false;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      let best = i;
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (cur[j] < best) best = cur[j];
      }
      if (best > max) return false;
      prev = cur;
    }
    return prev[b.length] <= max;
  }
  const typoOk = (a, b) => (a.length >= 9 && b.length >= 9 ? editWithin(a, b, 2) : a.length >= 5 && b.length >= 5 && editWithin(a, b, 1));

  // ── Mesin ─────────────────────────────────────────────────────────────────
  function create(db) {
    const recs = db.recs;
    const N = recs.length;
    const names = [];                 // { k: nama ternormalisasi, id, w: varian lemah, t: token bermakna }
    const exact = new Map();          // nama → [indeks names]
    const postings = new Map();       // token → [indeks names]
    const byInitials = new Map();     // inisial → [indeks names]
    const byIssn = new Map();
    const byKey = new Map();
    const haystack = new Array(N);    // teks pencarian Journal Finder

    function addName(k, id, w) {
      if (!k || k.length < 2) return;
      const list = exact.get(k);
      if (list && list.some((i) => names[i].id === id)) return;
      const idx = names.length;
      names.push({ k, id, w, t: sig(k) });
      if (list) list.push(idx); else exact.set(k, [idx]);
    }

    for (let id = 0; id < N; id++) {
      const r = recs[id];
      const all = [r.n].concat(r.x || []);
      haystack[id] = ' ' + all.map(norm).join(' ') + ' ' + (r.i || []).join(' ').toLowerCase() + ' ';
      for (const nm of all) {
        const full = norm(nm);
        addName(full, id, 0);
        addName(full.replace(/^the /, ''), id, 0);
        const bare = norm(stripParens(nm));
        if (bare !== full && bare.length >= 5) addName(bare, id, 1);
        for (const m of nm.matchAll(/[\(\[]([^)\]]+)[\)\]]/g)) {
          const inner = norm(m[1]);                      // "(IJECE)" atau "(Telecommunication ... Control)"
          if (inner.length >= 3) addName(inner, id, 1);
        }
        const colon = nm.split(/\s*[:–|]\s+|\s+-\s+/);  // "JOIV : International Journal on ..."
        if (colon.length === 2) {
          const a = norm(colon[0]), b = norm(colon[1]);
          if (a && !a.includes(' ') && a.length >= 4 && b.includes(' ')) { addName(a, id, 1); addName(b, id, 1); }
        }
      }
      for (const x of r.i || []) if (!byIssn.has(x)) byIssn.set(x, id);
      byKey.set(keyOf(r), id);
    }

    for (let i = 0; i < names.length; i++) {
      const n = names[i];
      for (const t of new Set(n.t)) {
        const p = postings.get(t);
        if (p) p.push(i); else postings.set(t, [i]);
      }
      if (!n.w && n.t.length >= 3) {
        const ini = initialsOf(n.t);
        const p = byInitials.get(ini);
        if (p) p.push(i); else byInitials.set(ini, [i]);
      }
    }
    const maxIdf = Math.log(1 + names.length);
    const idf = (t) => { const p = postings.get(t); return p ? Math.log(1 + names.length / p.length) : maxIdf; };
    const sorted = names.map((_, i) => i).sort((a, b) => (names[a].k < names[b].k ? -1 : names[a].k > names[b].k ? 1 : 0));

    function keyOf(r) {
      return r.s ? 's' + r.s[2] : r.i && r.i.length ? 'i' + r.i[0] : 'n' + norm(r.n);
    }

    function scopusView(c) {
      return c ? { q: c[0], rank: c[1] || null, h: c[2] || null, sjr: c[3] || null, st: ST[c[4]] || '', dc: !!c[5], ip: !!c[6] } : null;
    }

    function view(id, extra) {
      const r = recs[id];
      const c = r.c || (extra && extra.c);
      const d = r.d || (extra && extra.d);
      return {
        k: keyOf(r), n: r.n, alt: r.x || [], issn: (r.i || []).concat((extra && extra.i) || []),
        sinta: r.s ? { l: r.s[0], inst: r.s[1], url: 'https://sinta.kemdiktisaintek.go.id/journals/profile/' + r.s[2] } : null,
        scopus: scopusView(c),
        joinedByName: !!extra,
        doaj: d ? { lic: d[0], apc: d[1], amt: d[2] || 0, cur: d[3] || '', weeks: d[4] || 0, country: d[5] || '', url: d[6] || '', doaj: 'https://doaj.org/toc/' + d[7] } : null,
      };
    }

    // Selesaikan sekumpulan rekaman bernama sama → satu jawaban atau daftar kandidat.
    function resolve(ids) {
      ids = [...new Set(ids)];
      if (ids.length === 1) return { status: 'match', rec: view(ids[0]) };
      // Kasus umum: rekaman SINTA/DOAJ + rekaman Scopus tanpa ISSN bernama sama = jurnal yang sama.
      const local = ids.filter((i) => recs[i].s || recs[i].d);
      const bare = ids.filter((i) => !recs[i].s && !recs[i].d && recs[i].c && !recs[i].i);
      if (local.length === 1 && bare.length === 1 && ids.length === 2 && !recs[local[0]].c) {
        return { status: 'match', rec: view(local[0], { c: recs[bare[0]].c }), soft: true };
      }
      // Jurnal SINTA + entri DOAJ Indonesia bernama sama (ISSN cetak vs elektronik) = jurnal yang sama.
      if (ids.length === 2) {
        const a = ids.find((i) => recs[i].s && !recs[i].d);
        const b = ids.find((i) => !recs[i].s && recs[i].d && recs[i].d[5] === 'Indonesia');
        if (a !== undefined && b !== undefined && !(recs[a].c && recs[b].c)) {
          return { status: 'match', rec: view(a, { d: recs[b].d, c: recs[b].c, i: recs[b].i }), soft: true };
        }
      }
      const badge = (i) => (recs[i].s ? recs[i].s[0] : 0) + '/' + (recs[i].c ? recs[i].c[0] : 0);
      const rank = (i) => (recs[i].s ? recs[i].s[0] : 9) * 10 + (recs[i].c ? recs[i].c[0] : 9);
      ids.sort((a, b) => rank(a) - rank(b));
      if (new Set(ids.map(badge)).size === 1) {
        const richest = ids.slice().sort((a, b) => Object.keys(recs[b]).length - Object.keys(recs[a]).length)[0];
        return { status: 'match', rec: view(richest), soft: true, cands: ids.slice(0, 8).map((i) => view(i)), sameTier: true };
      }
      return { status: 'ambiguous', cands: ids.slice(0, 8).map((i) => view(i)) };
    }

    const down = (conf) => (conf === 'pasti' ? 'kuat' : 'cek');

    function fromExact(k) {
      const list = exact.get(k);
      if (!list) return null;
      const strong = list.filter((i) => !names[i].w);
      const use = strong.length ? strong : list;
      const res = resolve(use.map((i) => names[i].id));
      let conf = strong.length ? 'pasti' : (k.includes(' ') ? 'kuat' : 'cek');
      if (res.soft) conf = down(conf);
      if (res.status === 'ambiguous') conf = 'cek';
      return Object.assign(res, { conf, method: strong.length ? 'nama persis' : 'nama alternatif', score: 1 });
    }

    function lowerBound(q) {
      let lo = 0, hi = sorted.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (names[sorted[mid]].k < q) lo = mid + 1; else hi = mid; }
      return lo;
    }

    function fromPrefix(q, tail) {
      if (q.length < 10) return null;
      const ids = [];
      for (let i = lowerBound(q); i < sorted.length && ids.length < 60; i++) {
        const n = names[sorted[i]];
        if (!n.k.startsWith(q)) break;
        if (tail && !n.k.endsWith(tail)) continue;
        ids.push(n.id);
      }
      if (!ids.length) return null;
      const res = resolve(ids);
      const conf = res.status === 'match' && !res.soft && q.length >= 16 ? 'kuat' : 'cek';
      return Object.assign(res, { conf, method: tail ? 'nama terpotong (awal+akhir)' : 'nama terpotong', score: 0.95 });
    }

    // "J. Phys. Conf. Ser." / "Int J Adv Comput Sci Appl" → tiap token awalan kata nama lengkap.
    function fromAbbrev(rawName) {
      const toks = sig(norm(rawName));
      if (toks.length < 3) return null;
      const short = toks.filter((t) => t.length <= 5).length;
      if (!/[a-z]\./i.test(rawName) && short < toks.length * 0.6) return null;
      const cand = byInitials.get(initialsOf(toks));
      if (!cand) return null;
      const ids = [];
      for (const i of cand) {
        const ct = names[i].t;
        if (ct.length === toks.length && toks.every((t, j) => ct[j].startsWith(t)) && toks.some((t, j) => t !== ct[j])) ids.push(names[i].id);
      }
      if (!ids.length) return null;
      const res = resolve(ids);
      return Object.assign(res, { conf: res.status === 'match' && !res.soft ? 'kuat' : 'cek', method: 'singkatan', score: 0.9 });
    }

    // "IJECE", "JOIV" yang tidak tercantum di nama resmi → cocokkan dengan inisial.
    function fromAcronym(rawName, q) {
      if (q.includes(' ') || q.length < 4 || q.length > 9 || rawName !== rawName.toUpperCase()) return null;
      const cand = byInitials.get(q);
      if (!cand) return null;
      const res = resolve(cand.map((i) => names[i].id));
      return Object.assign(res, { conf: 'cek', method: 'akronim', score: 0.8 });
    }

    /**
     * Dice berbobot IDF dengan tiga pengaman struktural:
     *  - nama pendek (< 4 kata bermakna) tidak boleh punya kata yang tak berpasangan;
     *  - nama panjang boleh selisih paling banyak satu kata;
     *  - urutan kata yang berpasangan harus sama (mencegah "Journal of X Research" ≈ "X Research Journal").
     */
    function tokenScore(qt, ct) {
      let common = 0, sumQ = 0, sumC = 0, missQ = 0;
      const pair = new Array(ct.length).fill(-1);
      const order = [];
      qt.forEach((t, qi) => {
        let j = ct.findIndex((c, k) => pair[k] < 0 && c === t);
        let factor = 1;
        if (j < 0) { j = ct.findIndex((c, k) => pair[k] < 0 && typoOk(t, c)); factor = 0.85; }
        if (j < 0) { sumQ += idf(t); missQ++; return; }
        const w = idf(ct[j]);
        pair[j] = qi; order.push(j);
        sumQ += w; common += factor * w;
      });
      ct.forEach((c) => { sumC += idf(c); });
      const missC = pair.filter((p) => p < 0).length;
      const allowed = Math.min(qt.length, ct.length) >= 4 ? 1 : 0;
      if (missQ + missC > allowed || sumQ + sumC === 0) return 0;
      let s = (2 * common) / (sumQ + sumC);
      if (order.some((v, i) => i && v < order[i - 1])) s *= 0.85;
      return s;
    }

    function fromFuzzy(q, cap) {
      const qt = sig(q);
      if (qt.length < 2 || q.length < 10) return null;
      const seeds = [...new Set(qt)].filter((t) => postings.has(t)).sort((a, b) => postings.get(a).length - postings.get(b).length).slice(0, 3);
      const pool = new Set();
      for (const t of seeds) {
        const p = postings.get(t);
        for (let i = 0; i < p.length && i < 4000; i++) pool.add(p[i]);
      }
      const best = new Map();  // id → skor terbaik
      for (const i of pool) {
        const n = names[i];
        if (Math.abs(n.t.length - qt.length) > 2) continue;
        let s = tokenScore(qt, n.t);
        if (n.w) s *= 0.97;
        if (s >= 0.8 && s > (best.get(n.id) || 0)) best.set(n.id, s);
      }
      if (!best.size) return null;
      const ranked = [...best.entries()].sort((a, b) => b[1] - a[1]);
      const top = ranked[0][1];
      if (top < 0.84) return null;
      const close = ranked.filter((r) => top - r[1] < 0.03).map((r) => r[0]);
      const res = resolve(close);
      let conf = top >= 0.93 && res.status === 'match' && !res.soft ? 'kuat' : 'cek';
      if (cap === 'cek') conf = 'cek';
      return Object.assign(res, { conf, method: 'kemiripan nama', score: +top.toFixed(3) });
    }

    // ── Jurnal predator ─────────────────────────────────────────────────────
    const predJ = db.pred.journals, predP = db.pred.publishers, predD = db.pred.domains;
    const predPub = Object.keys(predP).filter((k) => k.length >= 10 && k.includes(' '));
    const predDom = Object.keys(predD).filter((k) => k.length >= 6);

    function predatory(q, host) {
      if (q && q.length >= 8 && predJ[q]) return { kind: 'journal', name: predJ[q][0], url: predJ[q][1] };
      if (q && q.length >= 10) {
        const padded = ' ' + q + ' ';
        for (const k of predPub) if (padded.includes(' ' + k + ' ')) return { kind: 'publisher', name: predP[k][0], url: predP[k][1] };
      }
      if (host) {
        const h = host.toLowerCase();
        for (const k of predDom) if (h.includes(k)) return { kind: 'domain', name: predD[k], url: '' };
      }
      return null;
    }

    // ── API utama ───────────────────────────────────────────────────────────
    function match(rawVenue, opts) {
      opts = opts || {};
      const p = parseVenue(rawVenue);
      const out = { status: 'none', conf: null, method: null, score: 0, name: p.name, q: norm(p.name), year: p.year, rec: null, cands: null, pred: null };
      out.type = classifyType(p.raw, p.hasVolume);
      const q = out.q;
      if (['patent', 'thesis', 'preprint'].includes(out.type) || q.length < 3) return out;

      let res = null;
      const ov = opts.overrides && opts.overrides[q];
      if (ov !== undefined) {
        if (ov === null) res = { status: 'none', conf: 'pasti', method: 'pilihan Anda', score: 1 };
        else if (byKey.has(ov)) res = { status: 'match', rec: view(byKey.get(ov)), conf: 'pasti', method: 'pilihan Anda', score: 1 };
      }
      if (!res && p.head) res = fromPrefix(norm(p.head), norm(p.tail));
      if (!res && !p.truncated) res = fromExact(q);
      if (!res && !p.truncated) {
        const bare = norm(stripParens(p.name));
        if (bare !== q && bare.length >= 5) {
          res = fromExact(bare);
          if (res) {
            const acr = (p.name.match(/[\(\[]([A-Za-z]{3,10})[\)\]]/) || [])[1];
            const okAcr = acr && res.rec && initialsOf(sig(norm(res.rec.n))).startsWith(acr.toLowerCase().slice(0, 3));
            if (!okAcr && res.conf === 'pasti') res.conf = 'kuat';
            res.method = 'nama tanpa akronim';
          }
        }
      }
      if (!res && p.truncated) res = fromPrefix(q) || fromExact(q);
      if (!res) res = fromAbbrev(p.name);
      if (!res) res = fromAcronym(p.name.trim(), q);
      if (!res) res = fromFuzzy(p.truncated ? q.split(' ').slice(0, -1).join(' ') : q, p.truncated ? 'cek' : null);
      if (res) Object.assign(out, res);

      if (out.status === 'match' && out.type === 'other') out.type = 'journal';
      if (out.status === 'none' && out.method !== 'pilihan Anda') out.pred = predatory(q, opts.host);
      return out;
    }

    function lookupIssn(list) {
      for (const raw of list || []) {
        const x = String(raw).replace(/[^0-9Xx]/g, '').toUpperCase();
        if (byIssn.has(x)) return { rec: view(byIssn.get(x)) };
      }
      for (const raw of list || []) {
        const x = String(raw).replace(/[^0-9Xx]/g, '').toUpperCase();
        if (db.scIssn[x]) return { scopusOnly: scopusView(db.scIssn[x]), issn: x };
      }
      return null;
    }

    /** Journal Finder: saring seluruh basis data. */
    function find(f) {
      const terms = norm((f.q || '').replace(/(\d{4})\s*-\s*(\d{3}[\dxX])/g, '$1$2')).split(' ').filter(Boolean);  // ISSN boleh ditulis dengan tanda hubung
      const sl = new Set(f.sinta || []), sq = new Set(f.scopus || []);
      const hits = [];
      for (let id = 0; id < N; id++) {
        const r = recs[id];
        const okS = r.s && sl.has(r.s[0]);
        const okQ = r.c && sq.has(r.c[0]);
        if ((sl.size || sq.size) && !okS && !okQ) continue;
        if (f.doaj && !r.d) continue;
        if (f.noApc && !(r.d && r.d[1] === 0)) continue;
        if (f.activeOnly && r.c && r.c[4] !== 1) continue;
        if (f.country && !(r.d && r.d[5] === f.country)) continue;
        if (terms.length && !terms.every((t) => haystack[id].includes(' ' + t))) continue;
        hits.push(id);
      }
      const sintaFirst = sl.size && !sq.size;
      const key = (i) => {
        const r = recs[i];
        const sc = r.c ? (r.c[0] || 8) * 1e6 + (r.c[1] || 999999) : 9e6;  // tanpa kuartil di urutan belakang
        const si = r.s ? r.s[0] : 9;
        return sintaFirst ? si * 1e8 + sc : sc * 10 + si;
      };
      hits.sort((a, b) => key(a) - key(b) || (recs[a].n < recs[b].n ? -1 : 1));
      return { total: hits.length, items: hits.slice(0, f.limit || 60).map((i) => view(i)) };
    }

    return { match, lookupIssn, find, view, meta: db.meta, size: N };
  }

  root.GsiEngine = { create, norm, parseVenue, classifyType, sig };
})(typeof self !== 'undefined' ? self : this);
