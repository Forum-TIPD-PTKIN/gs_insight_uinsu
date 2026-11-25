/**
 * UINSU Google Scholar Insight — bagian bersama untuk halaman Google Scholar:
 * pengiriman pesan, badge per paper, popover detail, verifikasi online, dan bilah ringkasan.
 */
(function () {
  'use strict';
  const { h, chip, recChips, link, issnFmt, fmt, apcText } = GsiUI;
  const S = GsiStats;

  const state = { kind: 'profile', papers: [], settings: { autoLoad: true, badges: true }, onChange: () => {}, filter: null, aliases: [] };

  function send(msg) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (r) => resolve(chrome.runtime.lastError ? { error: chrome.runtime.lastError.message } : r || {}));
      } catch (e) {
        resolve({ error: 'Ekstensi dimuat ulang. Segarkan halaman ini.' });
      }
    });
  }

  async function loadSettings() {
    try {
      const r = await chrome.storage.local.get('settings');
      Object.assign(state.settings, r.settings || {});
    } catch (_) { /* pakai bawaan */ }
    return state.settings;
  }

  /** Cocokkan sekumpulan paper baru lewat service worker. */
  async function matchPapers(papers) {
    if (!papers.length) return true;
    const r = await send({ type: 'MATCH', items: papers.map((p) => ({ venue: p.venue, host: p.host })) });
    if (!r.results) return false;
    papers.forEach((p, i) => { p.m = r.results[i]; p.type = r.results[i].type; if (!p.year && p.m.year) p.year = p.m.year; });
    return true;
  }

  // ── Badge per paper ───────────────────────────────────────────────────────
  function renderBadges(p) {
    const box = p._el || (p._el = h('span', { class: 'gsi-badges', role: 'button', tabindex: '0', title: 'Klik untuk detail jurnal' }));
    const m = p.m || { status: 'none' };
    const kids = [];
    if (m.status === 'match') {
      const cek = m.conf === 'cek';
      const r = m.rec;
      if (r.sinta) kids.push(chip('s' + r.sinta.l, 'S' + r.sinta.l, { cek }));
      if (r.scopus) kids.push(chip(r.scopus.q ? 'q' + r.scopus.q : 'none', r.scopus.q ? 'Q' + r.scopus.q : 'Scopus', { cek, cls: r.scopus.dc || r.scopus.st === 'discontinued' ? 'gsi-struck' : '' }));
      if (r.doaj) kids.push(chip(r.doaj.apc === 0 ? 'diamond' : 'doaj', r.doaj.apc === 0 ? 'DOAJ · gratis' : 'DOAJ', { cek }));
      if (!kids.length) kids.push(chip('none', 'Tanpa peringkat'));
    } else if (m.status === 'ambiguous') {
      kids.push(chip('amb', 'Ambigu · ' + m.cands.length + ' jurnal'));
    }
    if (p.type && !['journal', 'other'].includes(p.type)) kids.push(chip('type', S.TYPE_LABEL[p.type]));
    if (m.pred) kids.push(chip('warn', 'Terindikasi predator'));
    if (p.ver && p.ver.retracted) kids.push(chip('warn', 'Artikel ditarik'));
    if (!kids.length && (p.venue || '').trim()) kids.push(chip('none', 'Tidak terindeks'));
    if (p.ver && p.ver.found) kids.push(chip('ver', 'DOI ✓'));
    box.replaceChildren(...kids);
    box.hidden = state.settings.badges === false || !kids.length;
    if (!box._wired) {
      box._wired = true;
      const open = (e) => { e.preventDefault(); e.stopPropagation(); openPopover(p, box); };
      box.addEventListener('click', open);
      box.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') open(e); });
    }
    return box;
  }

  // ── Popover detail ────────────────────────────────────────────────────────
  let pop = null;
  function closePopover() { if (pop) { pop.remove(); pop = null; } }
  document.addEventListener('click', (e) => { if (pop && !pop.contains(e.target)) closePopover(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePopover(); });

  const row = (k, v) => (v == null || v === '' ? null : h('div', { class: 'gsi-row' }, h('span', { class: 'gsi-k', text: k }), h('span', { class: 'gsi-v' }, v)));

  function recFacts(r) {
    const out = [];
    if (r.sinta) out.push(row('SINTA', h('span', {}, 'Peringkat ' + r.sinta.l + ' · ', link(r.sinta.url, 'profil SINTA'))));
    if (r.sinta && r.sinta.inst && r.sinta.inst !== '-') out.push(row('Pengelola', r.sinta.inst));
    if (r.scopus) {
      const sc = r.scopus;
      const bits = [sc.q ? 'Q' + sc.q : 'Tanpa kuartil', sc.sjr ? 'SJR ' + sc.sjr : null, sc.h ? 'H-index ' + sc.h : null, sc.rank ? 'peringkat #' + fmt(sc.rank) : null].filter(Boolean).join(' · ');
      out.push(row('Scopus', bits));
      const st = sc.dc || sc.st === 'discontinued' ? 'Discontinued — tidak lagi diindeks Scopus' : sc.st === 'inactive' ? 'Inactive di Scopus Source List' : 'Active';
      out.push(row('Status', h('span', { class: sc.dc || sc.st !== 'active' ? 'gsi-bad' : 'gsi-good', text: st })));
    }
    if (r.doaj) {
      out.push(row('DOAJ', h('span', {}, (r.doaj.lic || 'lisensi tidak tercatat') + ' · ', link(r.doaj.doaj, 'entri DOAJ'))));
      out.push(row('Biaya (APC)', apcText(r.doaj)));
      if (r.doaj.weeks) out.push(row('Lama review', '± ' + r.doaj.weeks + ' minggu (klaim jurnal)'));
      if (r.doaj.country) out.push(row('Negara', r.doaj.country));
    }
    if (r.issn && r.issn.length) out.push(row('ISSN', r.issn.map(issnFmt).join(' · ')));
    if (r.joinedByName) out.push(h('div', { class: 'gsi-note', text: 'Sebagian data digabung berdasarkan kesamaan nama, bukan ISSN.' }));
    return out;
  }

  function openPopover(p, anchor) {
    closePopover();
    const m = p.m || { status: 'none' };
    const r = m.status === 'match' ? m.rec : null;
    const body = [];

    body.push(h('div', { class: 'gsi-pop-head' },
      h('div', { class: 'gsi-brand-mini', text: 'UINSU · Google Scholar Insight' }),
      h('button', { class: 'gsi-x', 'aria-label': 'Tutup', onclick: closePopover, text: '×' })));
    body.push(h('div', { class: 'gsi-pop-title', text: r ? r.n : m.name || '(tanpa nama terbitan)' }));
    if (r) body.push(h('div', { class: 'gsi-chips' }, recChips(r, { cek: m.conf === 'cek' })));
    if (r) body.push(h('div', { class: 'gsi-facts' }, recFacts(r)));

    if (m.status === 'match') {
      body.push(h('div', { class: 'gsi-conf gsi-conf-' + m.conf },
        h('b', { text: 'Keyakinan: ' + S.CONF_LABEL[m.conf] }), ' · ' + m.method + (m.score && m.score < 1 ? ' (skor ' + m.score + ')' : '')));
    }
    if (m.note) body.push(h('div', { class: 'gsi-note', text: m.note }));
    if (m.status === 'none' && !m.pred) {
      body.push(h('div', { class: 'gsi-note', text: p.type === 'journal' || p.type === 'other'
        ? 'Tidak ditemukan di basis data SINTA, Scopus, maupun DOAJ. Coba verifikasi online untuk mencocokkan lewat ISSN.'
        : 'Terbitan ini dikenali sebagai ' + S.TYPE_LABEL[p.type].toLowerCase() + ', bukan artikel jurnal.' }));
    }
    if (m.pred) {
      body.push(h('div', { class: 'gsi-alert' }, h('b', { text: 'Terindikasi predator. ' }),
        (m.pred.kind === 'journal' ? 'Jurnal' : m.pred.kind === 'publisher' ? 'Penerbit' : 'Domain') + ' “' + m.pred.name + '” ada di daftar stop-predatory-journals. Periksa ulang sebelum mengutip atau mengirim naskah.'));
    }

    const cands = m.cands && m.cands.length > 1 ? m.cands : null;
    if (cands) {
      body.push(h('div', { class: 'gsi-sub', text: m.status === 'ambiguous' ? 'Ada ' + cands.length + ' jurnal bernama sama. Pilih yang benar:' : 'Jurnal lain bernama sama:' }));
      body.push(h('div', { class: 'gsi-cands' }, cands.map((c) => h('button', { class: 'gsi-cand', onclick: () => choose(p, c.k) },
        h('span', { class: 'gsi-chips' }, recChips(c)),
        h('span', { class: 'gsi-cand-n', text: c.sinta && c.sinta.inst && c.sinta.inst !== '-' ? c.sinta.inst : (c.doaj && c.doaj.country) || c.n }),
        h('span', { class: 'gsi-cand-i', text: c.issn.map(issnFmt).join(' · ') })))));
      body.push(h('button', { class: 'gsi-linkbtn', onclick: () => choose(p, null), text: 'Bukan salah satunya' }));
    }

    if (p.ver) {
      body.push(p.ver.found
        ? h('div', { class: 'gsi-ver' }, h('b', { text: 'Terverifikasi Crossref. ' }), link('https://doi.org/' + p.ver.doi, p.ver.doi),
          p.ver.container ? h('div', { text: 'Terbit di: ' + p.ver.container }) : null,
          p.ver.oa ? h('div', { text: 'Akses terbuka: ' + p.ver.oa }) : null,
          p.ver.oaUrl ? h('div', {}, link(p.ver.oaUrl, 'Buka versi akses terbuka')) : null,
          p.ver.retracted ? h('div', { class: 'gsi-alert' }, h('b', { text: 'Artikel ini tercatat ditarik (retracted). ' }), 'Periksa halaman penerbit sebelum mengutipnya.') : null)
        : h('div', { class: 'gsi-note', text: 'Crossref tidak menemukan DOI yang judulnya cocok.' }));
    }

    const actions = h('div', { class: 'gsi-actions' });
    const vbtn = h('button', { class: 'gsi-btn', text: p.ver ? 'Verifikasi ulang' : 'Verifikasi online' });
    vbtn.addEventListener('click', async () => {
      vbtn.disabled = true; vbtn.textContent = 'Memeriksa…';
      const err = await verifyPaper(p, true);
      state.onChange();
      if (err) { vbtn.disabled = false; vbtn.textContent = 'Gagal — coba lagi'; vbtn.title = err; } else if (p._el) openPopover(p, p._el);
    });
    actions.append(vbtn);
    if (m.method === 'pilihan Anda') actions.append(h('button', { class: 'gsi-btn gsi-ghost', onclick: () => choose(p, undefined), text: 'Batalkan pilihan' }));
    body.push(actions);
    body.push(h('div', { class: 'gsi-fine', text: 'Verifikasi online mengirim judul paper ini ke api.crossref.org.' }));

    pop = h('div', { class: 'gsi-pop', role: 'dialog', 'aria-label': 'Detail jurnal' }, body);
    pop.addEventListener('click', (e) => e.stopPropagation());
    document.body.append(pop);
    const a = anchor.getBoundingClientRect();
    const w = pop.offsetWidth, ht = pop.offsetHeight;
    let left = a.left + window.scrollX;
    left = Math.max(8 + window.scrollX, Math.min(left, window.scrollX + document.documentElement.clientWidth - w - 8));
    let top = a.bottom + window.scrollY + 6;
    if (a.bottom + ht + 12 > window.innerHeight && a.top - ht - 6 > 0) top = a.top + window.scrollY - ht - 6;
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
  }

  /** Simpan pilihan pengguna untuk nama terbitan ini dan terapkan ke semua paper senama. */
  async function choose(p, k) {
    const q = p.m.q;
    const r = await send({ type: 'SET_OVERRIDE', q, k, venue: p.venue, host: p.host });
    if (!r.result) return;
    for (const o of state.papers) {
      if (o.m && o.m.q === q && !(o.ver && o.ver.found && (o.m.method || '').startsWith('ISSN'))) {
        o.m = Object.assign({}, r.result, { name: o.m.name, year: o.m.year });
        o.type = r.result.type;
        renderBadges(o);
      }
    }
    closePopover();
    state.onChange();
  }

  // ── Verifikasi online ─────────────────────────────────────────────────────
  function applyVerify(p, v) {
    p.ver = { found: !!v.found, doi: v.doi || null, container: v.container || '', oa: v.oa || null, cited: v.cited || 0, oaUrl: v.oaUrl || null, retracted: !!v.retracted };
    if (!v.found) return;
    p.doi = v.doi;
    if (v.type) p.type = v.type;
    const base = { q: p.m.q, name: p.m.name, year: p.m.year, type: p.type, cands: null, pred: null, score: 1, conf: 'pasti', status: 'match', method: 'ISSN dari DOI (Crossref)' };
    if (v.rec) {
      p.m = Object.assign(base, { rec: v.rec });
    } else if (v.scopusOnly) {
      p.m = Object.assign(base, { rec: { k: 'i' + v.issn[0], n: v.container || p.m.name, alt: [], issn: v.issn.map((x) => x.replace(/[^0-9Xx]/g, '').toUpperCase()), sinta: null, scopus: v.scopusOnly, doaj: null } });
    } else if (p.m.status === 'match' && v.issn.length && p.m.method !== 'pilihan Anda') {
      p.m.conf = 'cek';
      p.m.note = 'ISSN dari Crossref (' + v.issn.join(', ') + ') tidak ada pada rekaman jurnal ini. Periksa kembali kecocokannya.';
    } else if (p.m.status !== 'match' && v.issn.length) {
      p.m.note = 'ISSN ' + v.issn.join(', ') + ' (Crossref) tidak terdaftar di SINTA, Scopus, maupun DOAJ pada basis data ini.';
    }
  }

  async function verifyPaper(p, force) {
    if (p.ver && !force) return null;
    const r = await send({ type: 'VERIFY', title: p.title, year: p.year });
    if (r.error || !r.v) return r.error || 'Tidak ada jawaban';
    applyVerify(p, r.v);
    renderBadges(p);
    return null;
  }

  let verifying = null;
  /** Verifikasi massal berurutan (ramah terhadap Crossref). */
  async function verifyMany(list, onProgress) {
    if (verifying) return;
    verifying = { done: 0, total: list.length, errors: 0 };
    for (const p of list) {
      const err = await verifyPaper(p, false);
      verifying.done++;
      if (err) verifying.errors++; else verifying.errors = 0;
      if (verifying.done % 4 === 0) onProgress(verifying);
      if (verifying.errors >= 4) { verifying.aborted = true; break; }
      await new Promise((r) => setTimeout(r, 220));
    }
    const final = Object.assign({}, verifying, { finished: true });
    verifying = null;
    onProgress(final);
  }
  const verifyStatus = () => verifying;

  function pickForVerify(mode) {
    const papers = state.papers.filter((p) => !p.ver && p.title && !['patent', 'thesis'].includes(p.type));
    if (mode === 'all') return papers;
    return papers.filter((p) => p.m && (p.m.status !== 'match' || p.m.conf === 'cek') && ['journal', 'other'].includes(p.type));
  }

  // ── Filter & bilah ringkasan ──────────────────────────────────────────────
  function passes(p, f) {
    if (!f) return true;
    const t = S.tier(p);
    if (f[0] === 's' && f.length === 2) return t.s === +f[1];
    if (f[0] === 'q' && f.length === 2) return t.q === +f[1];
    if (f === 'doaj') return t.doaj;
    if (f === 'cek') return p.m && (p.m.status === 'ambiguous' || (p.m.status === 'match' && p.m.conf === 'cek'));
    if (f === 'warn') return !!(p.m && p.m.pred) || t.discontinued || !!(p.ver && p.ver.retracted);
    if (f === 'mine') return p.mine === 'no';
    return true;
  }

  function summaryChips(onPick) {
    const sm = S.summary(state.papers);
    const mk = (key, kind, label, count) => (count ? h('button', { class: 'gsi-fchip' + (state.filter === key ? ' is-on' : ''), onclick: () => onPick(state.filter === key ? null : key) }, chip(kind, label, { count })) : null);
    const out = [];
    for (let l = 1; l <= 6; l++) out.push(mk('s' + l, 's' + l, 'S' + l, sm.sinta[l]));
    for (let q = 1; q <= 4; q++) out.push(mk('q' + q, 'q' + q, 'Q' + q, sm.scopus[q]));
    out.push(mk('doaj', 'doaj', 'DOAJ', sm.doaj));
    out.push(mk('cek', 'amb', 'Perlu dicek', sm.ambiguous + sm.check));
    const warn = state.papers.filter((p) => passes(p, 'warn')).length;
    out.push(mk('warn', 'warn', 'Peringatan', warn));
    if (state.kind === 'profile') out.push(mk('mine', 'amb', 'Mungkin bukan milik pemilik profil', state.papers.filter((p) => p.mine === 'no').length));
    return { chips: out.filter(Boolean), sm };
  }

  /** Salinan paper yang aman dikirim (tanpa referensi DOM). */
  function serialize() {
    return state.papers.map((p) => { const { _el, _row, ...rest } = p; return rest; });
  }

  function brand() {
    return h('div', { class: 'gsi-brand', title: GsiBrand.line() },
      h('img', { class: 'gsi-logo', src: chrome.runtime.getURL('icons/logo-uinsu.png'), alt: 'UINSU' }),
      h('span', {}, h('b', { text: 'Google Scholar Insight' }), h('i', { 'data-credit': 'text', text: GsiBrand.text() })));
  }

  self.GsiC = { state, send, loadSettings, matchPapers, renderBadges, closePopover, verifyPaper, verifyMany, verifyStatus,
    pickForVerify, passes, summaryChips, serialize, brand };
})();
