/**
 * UINSU Google Scholar Insight — identitas aplikasi dan kredit pembuat.
 * Modul ini dimuat oleh service worker, panel, laporan, laman awal, panduan,
 * dan skrip halaman Scholar. Ekstensi berhenti bekerja bila identitas diubah.
 */
(function (root) {
  'use strict';
  const K = [77, 117, 104, 97, 109, 109, 97, 100, 32, 73, 107, 104, 115, 97, 110];
  const A = String.fromCharCode.apply(null, K);
  const U = [85, 73, 78, 32, 83, 117, 109, 97, 116, 101, 114, 97, 32, 85, 116, 97, 114, 97, 32, 77, 101, 100, 97, 110];
  const B = String.fromCharCode.apply(null, U);
  const APP = ['UINSU', 'Google', 'Scholar', 'Insight'].join(' ');
  const SEAL = 2816205038;
  const fnv = (s) => { let x = 0x811c9dc5; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 0x01000193) >>> 0; } return x; };

  /** Berkas yang wajib tercantum di data/seal.json. */
  const sealed = ['manifest.json', 'sw.js', 'lib/brand.js', 'lib/update.js', 'data/update.json', 'lib/ui.js', 'content/common.js', 'content/profile.js', 'content/search.js',
    'panel/panel.html', 'panel/panel.js', 'report/report.html', 'report/report.js', 'welcome/welcome.html', 'welcome/site.js', 'docs/panduan.html'];

  function ok() {
    try {
      const m = chrome.runtime.getManifest();
      return fnv(A + '|' + B + '|' + APP) === SEAL && m.name === APP && String(m.description).indexOf(A + ', ' + B) >= 0;
    } catch (e) { return false; }
  }

  const text = () => 'Dibuat oleh ' + A + ', ' + B;
  const line = () => APP + ' · ' + text();
  const salt = () => A.split('').reverse().join('') + '|' + SEAL.toString(36);

  /** Mengisi semua elemen [data-credit] pada dokumen. */
  function mount(doc) {
    const els = (doc || document).querySelectorAll('[data-credit]');
    els.forEach((el) => { el.textContent = el.dataset.credit === 'line' ? line() : el.dataset.credit === 'name' ? A : text(); });
    return els.length;
  }

  function shown(el) {
    if (!el || !el.isConnected || el.textContent.indexOf(A) < 0 || (el.dataset.credit !== 'name' && el.textContent.indexOf(B) < 0)) return false;
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0.5 && parseFloat(cs.fontSize) >= 9 && r.width > 20 && r.height > 6;
  }

  /** Memastikan kredit tetap tampil; memanggil onFail bila hilang atau disembunyikan. */
  function guard(onFail, doc) {
    doc = doc || document;
    const check = () => {
      const els = [...doc.querySelectorAll('[data-credit]')];
      if (ok() && els.length && els.every(shown)) return true;
      onFail();
      return false;
    };
    if (check()) setInterval(check, 5000);
  }

  function notice(doc) {
    doc = doc || document;
    doc.body.textContent = '';
    const box = doc.createElement('div');
    box.style.cssText = 'font:14px/1.6 system-ui,sans-serif;max-width:460px;margin:48px auto;padding:20px;color:#7a1f1f';
    box.textContent = 'Berkas ekstensi ini telah diubah sehingga tidak dapat dijalankan. Pasang ulang ' + APP + ' dari sumber resminya.';
    doc.body.append(box);
  }

  root.GsiBrand = { author: A, affil: B, app: APP, ok, text, line, salt, sealed, mount, guard, notice };
})(typeof self !== 'undefined' ? self : this);
