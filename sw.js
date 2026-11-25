/**
 * UINSU Google Scholar Insight — service worker.
 * Memegang basis data dan mesin pencocokan (satu salinan untuk semua tab),
 * menyimpan hasil analisis per tab, dan menjalankan verifikasi online.
 */
importScripts('lib/brand.js', 'lib/engine.js', 'lib/update.js');

const local = {
  get: (k) => chrome.storage.local.get(k).then((r) => r[k]),
  set: (k, v) => chrome.storage.local.set({ [k]: v }),
};

// ── Basis data: bawaan ekstensi atau hasil pembaruan online ─────────────────
const DB_CACHE = 'gsi-db', DB_KEY = 'https://db.invalid/db.json';
let enginePromise = null, dbInfo = { source: 'bundled', version: '' }, cfgPromise = null;

function updCfg() {
  if (!cfgPromise) cfgPromise = fetch(chrome.runtime.getURL('data/update.json')).then((r) => r.json()).catch(() => ({}));
  return cfgPromise;
}
const dotted = (built) => String(built || '').replace(/-/g, '.');
const dbShape = (db) => !!(db && Array.isArray(db.recs) && db.recs.length > 1000 && db.meta && db.meta.sources && db.pred);

async function loadDb() {
  const bundled = () => fetch(chrome.runtime.getURL('data/db.json')).then((r) => r.json());
  try {
    const st = await local.get('dbRemote');  // { data, sig }: muatan bertanda tangan milik salinan yang tersimpan
    const cfg = await updCfg();
    const p = st && cfg.pub ? await GsiUpdate.parse(st.data, st.sig, cfg.pub) : null;
    if (p) {
      // Bila ekstensi dipasang ulang dengan basis data bawaan yang lebih baru, bawaan yang dipakai.
      const app = chrome.runtime.getManifest().version;
      let bv = await local.get('bundledVer');
      if (!bv || bv.app !== app) { bv = { app, built: dotted((await bundled()).meta.built) }; await local.set('bundledVer', bv); }
      if (GsiUpdate.cmp(p.db.version, bv.built) > 0) {
        const res = await (await caches.open(DB_CACHE)).match(DB_KEY);
        const buf = res ? await res.arrayBuffer() : null;
        if (buf && (await GsiUpdate.sha256Hex(buf)) === p.db.sha256) {
          const db = JSON.parse(new TextDecoder().decode(buf));
          if (dbShape(db)) { dbInfo = { source: 'online', version: p.db.version }; return db; }
        }
      }
    }
  } catch (_) { /* salinan online rusak atau tidak sah: pakai bawaan */ }
  const db = await bundled();
  dbInfo = { source: 'bundled', version: dotted(db.meta.built) };
  return db;
}

function engine() {
  if (!enginePromise) {
    enginePromise = loadDb().then((db) => GsiEngine.create(db)).catch((e) => { enginePromise = null; throw e; });
  }
  return enginePromise;
}

/** Periksa version.json di server; unduh basis data bila ada yang lebih baru dan tanda tangannya sah. */
let checking = null;
function checkUpdate(force) {
  if (checking) return checking;
  checking = (async () => {
    const cfg = await updCfg();
    if (!cfg.base || !cfg.pub) return { state: 'off' };
    const prev = (await local.get('updState')) || {};
    if (!force) {
      const settings = (await local.get('settings')) || {};
      if (settings.autoUpdate === false) return Object.assign({ state: 'manual' }, prev);
      const every = (cfg.everyDays || 7) * 864e5;
      if ((prev.lastOk && Date.now() - prev.lastOk < every) || (prev.lastTry && Date.now() - prev.lastTry < 864e5)) return Object.assign({ state: 'idle' }, prev);
    }
    const out = { lastTry: Date.now(), lastOk: prev.lastOk || 0, app: prev.app || null, remoteDb: prev.remoteDb || '', error: '' };
    try {
      // Kueri hanya memuat versi ekstensi dan jenis pemeriksaan (a=1 otomatis mingguan, a=0 manual). Tidak ada pengenal pemasangan.
      const res = await fetch(cfg.base + 'version.json?v=' + encodeURIComponent(chrome.runtime.getManifest().version) + '&a=' + (force ? 0 : 1) + '&t=' + Date.now(), { cache: 'no-store', signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error('Server menjawab ' + res.status);
      const v = await res.json();
      const p = await GsiUpdate.parse(v.data, v.sig, cfg.pub);
      if (!p) throw new Error('Tanda tangan berkas pembaruan tidak sah');
      await engine();
      out.app = p.app || null; out.remoteDb = p.db.version;
      if (GsiUpdate.cmp(p.db.version, dbInfo.version) > 0) {
        const r = await fetch(new URL(p.db.file, cfg.base).href + '?v=' + encodeURIComponent(p.db.version), { cache: 'no-store', signal: AbortSignal.timeout(180000) });
        if (!r.ok) throw new Error('Unduhan basis data gagal (' + r.status + ')');
        const buf = await r.arrayBuffer();
        if (buf.byteLength !== p.db.size || (await GsiUpdate.sha256Hex(buf)) !== p.db.sha256) throw new Error('Basis data yang diunduh tidak cocok dengan tanda tangan');
        if (!dbShape(JSON.parse(new TextDecoder().decode(buf)))) throw new Error('Isi basis data tidak dikenali');
        await (await caches.open(DB_CACHE)).put(DB_KEY, new Response(buf, { headers: { 'Content-Type': 'application/json' } }));
        await local.set('dbRemote', { data: v.data, sig: v.sig });
        enginePromise = null;  // dimuat ulang pada pemakaian berikutnya
        out.updated = p.db.version;
      }
      out.lastOk = Date.now();
    } catch (e) { out.error = String((e && e.message) || e); }
    await local.set('updState', out);
    return Object.assign({ state: out.error ? 'error' : 'ok' }, out);
  })().finally(() => { checking = null; });
  return checking;
}
// ── akhir blok basis data ──

chrome.runtime.onInstalled.addListener((info) => {
  if (info.reason === 'install') chrome.tabs.create({ url: chrome.runtime.getURL('welcome/welcome.html') });
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

// Menu klik kanan: cek nama jurnal atau ISSN yang sedang diblok di halaman mana pun.
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'gsi-check', title: 'Cek jurnal “%s” di Scholar Insight', contexts: ['selection'] }, () => void chrome.runtime.lastError);
});
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'gsi-check') return;
  if (tab && tab.id != null) chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});  // harus langsung di dalam gestur pengguna
  chrome.storage.session.set({ pendingCheck: { q: String(info.selectionText || '').replace(/\s+/g, ' ').trim().slice(0, 200), ts: Date.now() } });
});

chrome.tabs.onRemoved.addListener((tabId) => chrome.storage.session.remove('tab' + tabId));

// ── Segel berkas: ekstensi berhenti bekerja bila kode atau kredit pembuat diubah ──
let sealPromise = null;
function sealOk() {
  if (!sealPromise) {
    sealPromise = (async () => {
      if (!GsiBrand.ok()) return false;
      const raw = (p) => fetch(chrome.runtime.getURL(p)).then((r) => { if (!r.ok) throw new Error(p); return r.arrayBuffer(); });
      const hex = async (buf) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map((b) => b.toString(16).padStart(2, '0')).join('');
      const seal = JSON.parse(new TextDecoder().decode(await raw('data/seal.json')));
      const files = seal.files || {}, names = Object.keys(files).sort();
      if (!GsiBrand.sealed.every((n) => files[n])) return false;
      const sums = await Promise.all(names.map((n) => raw(n).then(hex)));
      if (!sums.every((x, i) => x === files[names[i]])) return false;
      const sig = await hex(new TextEncoder().encode(GsiBrand.salt() + names.map((n) => n + ':' + files[n]).join('\n')));
      return sig === seal.sig;
    })().catch(() => false);
  }
  return sealPromise;
}

// ── Verifikasi online (Crossref, lalu OpenAlex bila tersedia) ───────────────
const norm = GsiEngine.norm;

function titleSim(a, b) {
  const ta = new Set(norm(a).split(' ').filter((t) => t.length > 2));
  const tb = new Set(norm(b).split(' ').filter((t) => t.length > 2));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return (2 * inter) / (ta.size + tb.size);
}

async function getJson(url, ms) {
  const res = await fetch(url, { signal: AbortSignal.timeout(ms), headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

const CR_TYPE = { 'journal-article': 'journal', 'proceedings-article': 'proceeding', 'book-chapter': 'book', book: 'book',
  monograph: 'book', 'posted-content': 'preprint', dissertation: 'thesis' };

async function verify(title, year) {
  const key = 'v:' + norm(title).slice(0, 120);
  const cache = (await local.get('verifyCache')) || {};
  if (cache[key] && Date.now() - cache[key].ts < 30 * 864e5) return cache[key].v;

  const url = 'https://api.crossref.org/works?rows=5&select=DOI,title,ISSN,container-title,type,issued,is-referenced-by-count,publisher'
    + '&query.bibliographic=' + encodeURIComponent(title + (year ? ' ' + year : ''));
  const data = await getJson(url, 15000);
  let best = null, bestSim = 0;
  for (const it of (data.message && data.message.items) || []) {
    const s = titleSim(title, (it.title || [])[0] || '');
    const y = it.issued && it.issued['date-parts'] && it.issued['date-parts'][0] && it.issued['date-parts'][0][0];
    const adj = s - (year && y && Math.abs(y - year) > 1 ? 0.05 : 0);
    if (adj > bestSim) { bestSim = adj; best = it; }
  }
  let v;
  if (!best || bestSim < 0.85) {
    v = { found: false };
  } else {
    v = { found: true, sim: +bestSim.toFixed(2), doi: best.DOI, issn: best.ISSN || [], container: (best['container-title'] || [])[0] || '',
      publisher: best.publisher || '', type: CR_TYPE[best.type] || null, cited: best['is-referenced-by-count'] || 0, oa: null };
    const hit = (await engine()).lookupIssn(v.issn);
    v.rec = hit && hit.rec ? hit.rec : null;
    v.scopusOnly = hit && hit.scopusOnly ? hit.scopusOnly : null;
    try {  // pelengkap; kegagalan di sini tidak membatalkan hasil Crossref
      const oa = await getJson('https://api.openalex.org/works/https://doi.org/' + encodeURIComponent(best.DOI) + '?select=open_access,cited_by_count,is_retracted,best_oa_location', 8000);
      v.oa = (oa.open_access && oa.open_access.oa_status) || null;
      if (oa.cited_by_count != null) v.citedOpenAlex = oa.cited_by_count;
      v.retracted = !!oa.is_retracted;
      const loc = oa.best_oa_location || {};
      v.oaUrl = loc.pdf_url || loc.landing_page_url || (oa.open_access && oa.open_access.oa_url) || null;
    } catch (_) { /* dibiarkan kosong */ }
  }
  const keys = Object.keys(cache);
  if (keys.length > 4000) keys.sort((a, b) => cache[a].ts - cache[b].ts).slice(0, 1000).forEach((k) => delete cache[k]);
  cache[key] = { v, ts: Date.now() };
  await local.set('verifyCache', cache);
  return v;
}

// ── Pesan ───────────────────────────────────────────────────────────────────
const handlers = {
  async MATCH(msg) {
    const [eng, overrides] = await Promise.all([engine(), local.get('overrides')]);
    return { results: msg.items.map((it) => eng.match(it.venue, { host: it.host, overrides: overrides || {} })) };
  },
  async SET_OVERRIDE(msg) {
    const ov = (await local.get('overrides')) || {};
    if (msg.k === undefined) delete ov[msg.q]; else ov[msg.q] = msg.k;
    await local.set('overrides', ov);
    return { result: (await engine()).match(msg.venue, { host: msg.host, overrides: ov }) };
  },
  async PUSH(msg, sender) {
    const tabId = sender.tab && sender.tab.id;
    if (tabId == null) return {};
    await chrome.storage.session.set({ ['tab' + tabId]: msg.data });
    const n = msg.data.indexed || 0;
    chrome.action.setBadgeText({ tabId, text: n ? String(n) : '' });
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#0F3B2C' });
    return {};
  },
  async VERIFY(msg) {
    try { return { v: await verify(msg.title, msg.year) }; } catch (e) { return { error: String(e.message || e) }; }
  },
  async FIND(msg) { return (await engine()).find(msg.filter); },
  /** Metadata lengkap sebuah DOI untuk menyusun sitasi. */
  async CITE(msg) {
    try { return { work: (await getJson('https://api.crossref.org/works/' + encodeURIComponent(msg.doi), 12000)).message }; }
    catch (e) { return { error: String(e.message || e) }; }
  },
  /** Cek satu jurnal lewat nama atau ISSN. */
  async CHECK(msg) {
    const eng = await engine();
    const q = String(msg.q || '').trim().slice(0, 200);
    const bare = q.replace(/[^0-9a-zA-Z]/g, '');
    if (/^\d{7}[\dxX]$/.test(bare)) {
      const x = bare.toUpperCase(), hit = eng.lookupIssn([x]);
      const base = { q, name: q, type: 'journal', conf: 'pasti', method: 'ISSN', score: 1, cands: null, pred: null };
      if (hit && hit.rec) return { m: Object.assign(base, { status: 'match', rec: hit.rec }) };
      if (hit && hit.scopusOnly) return { m: Object.assign(base, { status: 'match', rec: { k: 'i' + x, n: 'Jurnal ber-ISSN ' + x.slice(0, 4) + '-' + x.slice(4), alt: [], issn: [x], sinta: null, scopus: hit.scopusOnly, doaj: null } }) };
      return { m: Object.assign(base, { status: 'none', conf: null, byIssn: true }) };
    }
    return { m: eng.match(q, { overrides: {} }) };
  },
  async META() {
    const e = await engine(), cfg = await updCfg();
    return { meta: e.meta, size: e.size, db: dbInfo, updOn: !!(cfg.base && cfg.pub), upd: (await local.get('updState')) || null };
  },
  async UPDATE_CHECK() { const r = await checkUpdate(true); if (r.updated) await engine(); return r; },
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'OPEN_PANEL') {
    // Harus dipanggil langsung di dalam gestur pengguna, tanpa await sebelumnya.
    if (sender.tab) chrome.sidePanel.open({ tabId: sender.tab.id }).catch(() => {});
    return false;
  }
  const fn = msg && handlers[msg.type];
  if (!fn) return false;
  sealOk().then((good) => { if (good) checkUpdate(false).catch(() => {}); return good ? fn(msg, sender) : { error: 'integrity' }; }).then(sendResponse, (e) => sendResponse({ error: String(e && e.message || e) }));
  return true;
});
