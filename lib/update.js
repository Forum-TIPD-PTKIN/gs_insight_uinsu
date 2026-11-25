/**
 * UINSU Google Scholar Insight — pemeriksaan berkas pembaruan.
 * Berkas version.json di server berbentuk { data: "<JSON muatan>", sig: "<tanda tangan base64>" }.
 * Tanda tangan ECDSA P-256 (SHA-256) dibuat dengan kunci privat pengelola; kunci publiknya
 * ada di data/update.json. Muatan yang tanda tangannya tidak sah selalu ditolak.
 */
(function (root) {
  'use strict';

  /** Bandingkan versi bertitik ("2026.11.24", "3.2.0"): negatif, nol, atau positif. */
  function cmp(a, b) {
    const x = String(a || '').split(/[^0-9]+/).filter(Boolean).map(Number), y = String(b || '').split(/[^0-9]+/).filter(Boolean).map(Number);
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      const d = (x[i] || 0) - (y[i] || 0);
      if (d) return d;
    }
    return 0;
  }

  function b64ToBytes(s) {
    const bin = atob(String(s || '').replace(/-/g, '+').replace(/_/g, '/'));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  async function sha256Hex(buf) {
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function verify(dataStr, sigB64, jwk) {
    try {
      const key = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
      return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, b64ToBytes(sigB64), new TextEncoder().encode(dataStr));
    } catch (e) { return false; }
  }

  /** Periksa tanda tangan lalu kembalikan muatan; null bila tidak sah atau bentuknya salah. */
  async function parse(dataStr, sigB64, jwk) {
    if (typeof dataStr !== 'string' || !jwk || !(await verify(dataStr, sigB64, jwk))) return null;
    let p;
    try { p = JSON.parse(dataStr); } catch (e) { return null; }
    const d = p && p.db;
    if (!p || p.format !== 1 || !d || !/^[0-9.]+$/.test(d.version || '') || !/^[0-9a-f]{64}$/.test(d.sha256 || '') || !/^[\w.-]+\.json$/.test(d.file || '') || !(d.size > 0)) return null;
    if (p.app && !(/^[0-9.]+$/.test(p.app.version || '') && (!p.app.url || /^https:\/\//.test(p.app.url)))) p.app = null;
    return p;
  }

  root.GsiUpdate = { cmp, b64ToBytes, sha256Hex, verify, parse };
})(typeof self !== 'undefined' ? self : this);
