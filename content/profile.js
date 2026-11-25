/**
 * UINSU Google Scholar Insight — halaman profil Google Scholar (/citations?user=…).
 */
(function () {
  'use strict';
  if (!/[?&]user=/.test(location.search) || window.__difaProfile) return;
  window.__difaProfile = true;

  const { h } = GsiUI;
  const C = GsiC, S = GsiStats;
  const st = C.state;
  st.kind = 'profile';

  const ownerName = () => (document.getElementById('gsc_prf_in') || {}).textContent || '';
  const moreBtn = () => document.getElementById('gsc_bpf_more');
  const allLoaded = () => { const b = moreBtn(); return !b || b.disabled; };
  let bar = null, statusEl = null, chipsEl = null, tickBtn = null, busy = false;

  // ── Ambil data baris ──────────────────────────────────────────────────────
  function scrape(tr) {
    const a = tr.querySelector('.gsc_a_at');
    if (!a) return null;
    const gray = tr.querySelectorAll('.gs_gray');
    const href = a.getAttribute('href') || '';
    const id = (href.match(/citation_for_view=([^&]+)/) || [])[1] || 'p' + st.papers.length;
    const authors = gray[0] ? gray[0].textContent.trim() : '';
    return {
      id, title: a.textContent.trim(), authors,
      venue: gray[1] ? gray[1].textContent.replace(/\s+/g, ' ').trim() : '',
      year: parseInt((tr.querySelector('.gsc_a_y') || {}).textContent, 10) || null,
      cites: parseInt((tr.querySelector('.gsc_a_ac') || {}).textContent, 10) || 0,
      link: href ? new URL(href, location.origin).href : '',
      pos: S.authorPosition(authors, ownerName(), st.aliases),
      mine: S.ownership(authors, ownerName(), st.aliases),
      _row: tr,
    };
  }

  async function processRows() {
    if (busy) return;
    busy = true;
    try {
      // Scholar membangun ulang tabel saat diurutkan: pakai kembali hasil lama berdasarkan id.
      const gone = new Map(st.papers.filter((p) => !p._row.isConnected).map((p) => [p.id, p]));
      st.papers = st.papers.filter((p) => p._row.isConnected);
      const fresh = [];
      for (const tr of document.querySelectorAll('#gsc_a_b .gsc_a_tr')) {
        if (tr.dataset.difa) continue;
        const p = scrape(tr);
        if (!p) continue;
        tr.dataset.difa = '1';
        const prev = gone.get(p.id);
        if (prev) {
          prev._row = tr; prev._el = null;
          const cell = tr.querySelector('.gsc_a_t');
          if (cell) cell.append(h('div', { class: 'gsi-line' }, C.renderBadges(prev)));
          st.papers.push(prev);
        } else fresh.push(p);
      }
      if (fresh.length) {
        const ok = await C.matchPapers(fresh);
        if (!ok) { fresh.forEach((p) => delete p._row.dataset.difa); setStatus('Basis data belum siap. Segarkan halaman.'); return; }
        for (const p of fresh) {
          const cell = p._row.querySelector('.gsc_a_t');
          if (cell) cell.append(h('div', { class: 'gsi-line' }, C.renderBadges(p)));
          st.papers.push(p);
        }
      }
      refresh();
    } finally { busy = false; }
  }

  // ── Muat semua paper ──────────────────────────────────────────────────────
  const rowCount = () => document.querySelectorAll('#gsc_a_b .gsc_a_tr').length;
  async function loadAll() {
    for (let i = 0; i < 40 && !allLoaded(); i++) {
      const before = rowCount();
      setStatus('Memuat seluruh publikasi… ' + before + ' dimuat');
      moreBtn().click();
      const t0 = Date.now();
      while (rowCount() === before && !allLoaded() && Date.now() - t0 < 8000) await new Promise((r) => setTimeout(r, 150));
      if (rowCount() === before) break;
      await new Promise((r) => setTimeout(r, 350));
    }
  }

  // ── Bilah ringkasan ───────────────────────────────────────────────────────
  function setStatus(text) { if (statusEl) statusEl.textContent = text; }

  function buildBar() {
    statusEl = h('span', { class: 'gsi-status', text: 'Menyiapkan basis data…' });
    chipsEl = h('div', { class: 'gsi-fchips' });
    const vbtn = h('button', { class: 'gsi-btn gsi-ghost', text: 'Verifikasi online', title: 'Cocokkan paper yang belum pasti lewat DOI/ISSN (Crossref)' });
    vbtn.addEventListener('click', () => startVerify('pending'));
    const open = h('button', { class: 'gsi-btn', text: 'Buka dasbor', onclick: () => C.send({ type: 'OPEN_PANEL' }) });
    tickBtn = h('button', { class: 'gsi-btn gsi-ghost', hidden: true, text: 'Centang yang tampil', title: 'Mencentang artikel yang tampil agar bisa dihapus lewat tombol Hapus milik Google Scholar',
      onclick: () => setStatus(tickMessage(tick(st.papers.filter((p) => C.passes(p, 'mine')).map((p) => p.id), true), 'Hapus')) });
    bar = h('section', { class: 'gsi-bar', 'aria-label': 'UINSU Google Scholar Insight' },
      h('div', { class: 'gsi-bar-top' }, C.brand(), statusEl, h('span', { class: 'gsi-spacer' }), tickBtn, vbtn, open), chipsEl);
    const table = document.getElementById('gsc_a_t');
    const host = table ? table.parentElement : document.getElementById('gsc_bdy');
    if (table) host.insertBefore(bar, table); else if (host) host.prepend(bar);
  }

  function applyFilter() {
    for (const p of st.papers) p._row.classList.toggle('gsi-hide', !C.passes(p, st.filter));
  }

  function refresh() {
    if (!bar) return;
    const { chips, sm } = C.summaryChips((f) => { st.filter = f; applyFilter(); refresh(); });
    chipsEl.replaceChildren(...chips);
    const v = C.verifyStatus();
    setStatus(v ? 'Verifikasi online ' + v.done + '/' + v.total + '…'
      : sm.total + ' publikasi · ' + sm.indexed + ' terindeks SINTA/Scopus' + (allLoaded() ? '' : ' · belum semua dimuat'));
    applyFilter();
    if (tickBtn) tickBtn.hidden = st.filter !== 'mine';
    push();
  }

  // ── Kirim ke panel ────────────────────────────────────────────────────────
  let pushTimer = null;
  function push() {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      const cell = (i) => { const td = document.querySelectorAll('#gsc_rsb_st tbody tr')[i]; return td ? parseInt((td.querySelector('.gsc_rsb_std') || {}).textContent, 10) || 0 : null; };
      const sm = S.summary(st.papers);
      const info = { url: location.href, user: new URLSearchParams(location.search).get('user'),
        name: ownerName().trim(), affil: ((document.querySelector('.gsc_prf_il') || {}).textContent || '').trim(), allLoaded: allLoaded() };
      const scholar = { cites: cell(0), h: cell(1), i10: cell(2) };
      C.send({ type: 'PUSH', data: Object.assign({ kind: 'profile', ts: Date.now(), scholar, editable: !!document.querySelector('#gsc_a_b .gsc_a_tr input[type="checkbox"], #gsc_a_b .gsc_a_tr [role="checkbox"]'),
        indexed: sm.indexed, verifying: C.verifyStatus(), aliases: st.aliases || [], papers: C.serialize() }, info) });
      if (info.allLoaded && !C.verifyStatus()) persist(info, scholar);
    }, 250);
  }

  // ── Bantuan merapikan profil: mencentang artikel di tabel Scholar ─────────
  // Ekstensi hanya mencentang. Menghapus atau menggabungkan tetap dilakukan pengguna lewat tombol Scholar sendiri.
  const rowBox = (tr) => tr.querySelector('input[type="checkbox"], [role="checkbox"]');
  const boxOn = (b) => (b.matches('input') ? b.checked : b.getAttribute('aria-checked') === 'true');

  function tick(ids, keepFilter) {
    const rows = st.papers.filter((p) => ids.includes(p.id) && p._row.isConnected);
    if (!keepFilter && st.filter) { st.filter = null; refresh(); }
    let ticked = 0, editable = false;
    for (const p of rows) {
      p._row.classList.add('gsi-mark');
      const b = rowBox(p._row);
      if (!b) continue;
      editable = true;
      if (!boxOn(b)) b.click();
      if (boxOn(b)) ticked++;
    }
    if (rows[0]) rows[0]._row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return { editable, ticked, total: rows.length };
  }

  function tickMessage(r, action) {
    if (!r.total) return 'Tidak ada artikel yang perlu dicentang.';
    return r.editable
      ? r.ticked + ' artikel dicentang. Periksa lagi, lalu tekan tombol ' + action + ' milik Google Scholar di atas tabel.'
      : 'Artikel sudah ditandai, tetapi kotak centangnya tidak tersedia. Masuk ke akun pemilik profil ini untuk bisa menghapus.';
  }

  // ── Riwayat metrik dan simpan otomatis profil yang ada di daftar pantau ──
  let lastSaved = '';
  async function persist(info, scholar) {
    const ps = st.papers, m = S.metrics(ps), sm = S.summary(ps);
    const sig = [ps.length, m.cites, sm.scopusTotal, sm.sintaTotal].join('|');
    if (!info.user || !ps.length || sig === lastSaved) return;
    lastSaved = sig;
    try {
      const r = await chrome.storage.local.get(['history', 'watch', 'profiles']);
      const history = r.history || {}, day = new Date().toISOString().slice(0, 10);
      const list = (history[info.user] || []).filter((x) => x.d !== day);
      list.push({ d: day, c: scholar.cites != null ? scholar.cites : m.cites, h: scholar.h != null ? scholar.h : m.h, n: ps.length, sc: sm.scopusTotal, si: sm.sintaTotal });
      history[info.user] = list.slice(-90);
      const users = Object.keys(history);
      if (users.length > 300) users.sort((a, b) => (history[a][history[a].length - 1].d < history[b][history[b].length - 1].d ? -1 : 1)).slice(0, 50).forEach((u) => delete history[u]);
      const out = { history };
      const watch = r.watch || {};
      if (watch[info.user]) {
        out.profiles = r.profiles || {};
        out.profiles[info.user] = Object.assign(S.profileRow(info, ps), { group: watch[info.user].group || '' });
      }
      await chrome.storage.local.set(out);
    } catch (_) { /* penyimpanan penuh atau ekstensi dimuat ulang: lewati */ }
  }

  function startVerify(mode) {
    const list = C.pickForVerify(mode);
    if (!list.length) { setStatus('Tidak ada paper yang perlu diverifikasi.'); return; }
    C.verifyMany(list, (v) => {
      if (v.finished) setStatus(v.aborted ? 'Verifikasi dihentikan: Crossref tidak merespons.' : 'Verifikasi selesai (' + v.done + ' paper).');
      refresh();
      if (v.finished && v.aborted) setStatus('Verifikasi dihentikan: Crossref tidak merespons.');
    });
    refresh();
  }

  chrome.runtime.onMessage.addListener((msg, _s, reply) => {
    if (msg.type === 'CMD_TICK') { reply(tick(msg.ids || [], false)); return; }
    if (msg.type === 'CMD_ALIASES') {  // variasi nama pemilik berubah: hitung ulang posisi dan kepemilikan
      st.aliases = (msg.aliases || []).slice(0, 12);
      for (const p of st.papers) { p.pos = S.authorPosition(p.authors, ownerName(), st.aliases); p.mine = S.ownership(p.authors, ownerName(), st.aliases); }
      if (st.filter === 'mine') st.filter = null;
      refresh();
    }
    if (msg.type === 'CMD_VERIFY') startVerify(msg.mode);
    else if (msg.type === 'CMD_REPUSH') push();
    else if (msg.type === 'CMD_LOAD_ALL') loadAll().then(processRows);
    else if (msg.type === 'CMD_SHOW') {
      const p = st.papers.find((x) => x.id === msg.id);
      if (p) { st.filter = null; refresh(); p._row.scrollIntoView({ block: 'center', behavior: 'smooth' }); p._row.classList.add('gsi-flash'); setTimeout(() => p._row.classList.remove('gsi-flash'), 1800); }
    } else if (msg.type === 'CMD_SETTINGS') {
      Object.assign(st.settings, msg.settings); st.papers.forEach(C.renderBadges);
    }
    reply({ ok: true });
  });

  // ── Mulai ─────────────────────────────────────────────────────────────────
  (async function init() {
    await C.loadSettings();
    try { st.aliases = (((await chrome.storage.local.get('aliases')).aliases || {})[new URLSearchParams(location.search).get('user')] || []).slice(0, 12); } catch (_) { st.aliases = []; }
    st.onChange = refresh;
    buildBar();
    if (st.settings.autoLoad !== false) await loadAll();
    await processRows();
    const body = document.getElementById('gsc_a_b');
    if (body) {
      let t = null;
      new MutationObserver(() => { clearTimeout(t); t = setTimeout(processRows, 200); }).observe(body, { childList: true });
    }
  })();
})();
