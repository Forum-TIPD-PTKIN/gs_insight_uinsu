/** UINSU Google Scholar Insight — laman awal dan panduan: kredit, versi, dan pengaman. */
(function () {
  'use strict';
  if (!GsiBrand.mount()) { GsiBrand.notice(); return; }
  GsiBrand.guard(() => GsiBrand.notice());
  const v = chrome.runtime.getManifest().version;
  document.querySelectorAll('[data-version]').forEach((el) => { el.textContent = 'Versi ' + v; });
  chrome.runtime.sendMessage({ type: 'META' }).then((r) => {
    if (r && r.error === 'integrity') { GsiBrand.notice(); return; }
    if (!r || !r.meta) return;
    const f = (n) => Number(n).toLocaleString('id-ID');
    const set = (k, val) => document.querySelectorAll('[data-stat="' + k + '"]').forEach((el) => { el.textContent = val; });
    set('records', f(r.meta.records)); set('sinta', f(r.meta.sinta)); set('scopus', f(r.meta.scopus)); set('doaj', f(r.meta.doaj));
  }).catch(() => {});
})();
