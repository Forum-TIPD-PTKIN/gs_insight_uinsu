/**
 * UINSU Google Scholar Insight — halaman hasil pencarian Google Scholar (/scholar?q=…).
 */
(function () {
  'use strict';
  if (window.__difaSearch) return;
  window.__difaSearch = true;

  const { h } = GsiUI;
  const C = GsiC, S = GsiStats;
  const st = C.state;
  st.kind = 'search';
  let bar = null, statusEl = null, chipsEl = null, busy = false;

  /** ".gs_a": "A Fadlil, I Riadi… - Jurnal Teknologi …, 2019 - ejournal.undip.ac.id" */
  function parseMeta(text) {
    const parts = text.replace(/ /g, ' ').split(/\s+[-–]\s+/).map((s) => s.trim()).filter(Boolean);
    const isHost = (s) => /^[\w-]+(\.[\w-]+)+$/.test(s);
    const out = { authors: parts[0] || '', venue: '', host: '' };
    if (parts.length >= 3) { out.venue = parts.slice(1, -1).join(' - '); out.host = isHost(parts[parts.length - 1]) ? parts[parts.length - 1] : ''; if (!out.host) out.venue = parts.slice(1).join(' - '); }
    else if (parts.length === 2) { if (isHost(parts[1])) out.host = parts[1]; else out.venue = parts[1]; }
    if (/^\d{4}$/.test(out.venue)) out.venue = ', ' + out.venue;  // hanya tahun, tanpa nama terbitan
    return out;
  }

  function scrape(el, i) {
    const a = el.querySelector('.gs_rt a');
    const metaEl = el.querySelector('.gs_a');
    if (!metaEl) return null;
    const titleEl = el.querySelector('.gs_rt');
    const meta = parseMeta(metaEl.textContent);
    const cite = [...el.querySelectorAll('.gs_fl a')].find((x) => /[?&]cites=/.test(x.getAttribute('href') || ''));
    return {
      id: el.dataset.cid || 'r' + i,
      title: (a ? a.textContent : titleEl ? titleEl.textContent.replace(/^\[[^\]]+\]\s*/g, '') : '').trim(),
      authors: meta.authors, venue: meta.venue, host: meta.host,
      year: parseInt((meta.venue.match(/((?:19|20)\d{2})\s*$/) || [])[1], 10) || null,
      cites: cite ? parseInt((cite.textContent.match(/\d[\d.,]*/) || ['0'])[0].replace(/[.,]/g, ''), 10) || 0 : 0,
      link: a ? a.href : '', pos: 'unknown', _row: el, _meta: metaEl,
    };
  }

  async function process() {
    if (busy) return;
    busy = true;
    try {
      const fresh = [];
      document.querySelectorAll('#gs_res_ccl_mid .gs_r.gs_or').forEach((el, i) => {
        if (el.dataset.difa) return;
        const p = scrape(el, st.papers.length + i);
        if (!p) return;
        el.dataset.difa = '1';
        fresh.push(p);
      });
      if (fresh.length && await C.matchPapers(fresh)) {
        for (const p of fresh) {
          p._meta.after(h('div', { class: 'gsi-line' }, C.renderBadges(p)));
          delete p._meta;
          st.papers.push(p);
        }
      }
      refresh();
    } finally { busy = false; }
  }

  function refresh() {
    if (!bar) return;
    const { chips, sm } = C.summaryChips((f) => { st.filter = f; refresh(); });
    chipsEl.replaceChildren(...chips);
    statusEl.textContent = sm.total + ' hasil di halaman ini · ' + sm.indexed + ' terindeks SINTA/Scopus';
    for (const p of st.papers) p._row.classList.toggle('gsi-hide', !C.passes(p, st.filter));
    C.send({ type: 'PUSH', data: {
      kind: 'search', ts: Date.now(), url: location.href, name: new URLSearchParams(location.search).get('q') || '',
      indexed: sm.indexed, verifying: C.verifyStatus(), allLoaded: true, papers: C.serialize(),
    } });
  }

  chrome.runtime.onMessage.addListener((msg, _s, reply) => {
    if (msg.type === 'CMD_VERIFY') C.verifyMany(C.pickForVerify(msg.mode), refresh);
    else if (msg.type === 'CMD_REPUSH') refresh();
    else if (msg.type === 'CMD_SHOW') { const p = st.papers.find((x) => x.id === msg.id); if (p) p._row.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    else if (msg.type === 'CMD_SETTINGS') { Object.assign(st.settings, msg.settings); st.papers.forEach(C.renderBadges); }
    reply({ ok: true });
  });

  (async function init() {
    const mid = document.getElementById('gs_res_ccl_mid');
    if (!mid) return;
    await C.loadSettings();
    st.onChange = refresh;
    statusEl = h('span', { class: 'gsi-status', text: 'Menyiapkan basis data…' });
    chipsEl = h('div', { class: 'gsi-fchips' });
    bar = h('section', { class: 'gsi-bar gsi-bar-search', 'aria-label': 'UINSU Google Scholar Insight' },
      h('div', { class: 'gsi-bar-top' }, C.brand(), statusEl, h('span', { class: 'gsi-spacer' }),
        h('button', { class: 'gsi-btn', text: 'Buka dasbor', onclick: () => C.send({ type: 'OPEN_PANEL' }) })), chipsEl);
    mid.parentElement.insertBefore(bar, mid);
    await process();
    let t = null;
    new MutationObserver(() => { clearTimeout(t); t = setTimeout(process, 250); }).observe(mid, { childList: true });
  })();
})();
