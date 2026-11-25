# UINSU Google Scholar Insight

Ekstensi browser Chrome (Manifest V3) untuk menampilkan pemeringkatan akreditasi dan indeksasi jurnal (SINTA, Scopus, DOAJ), metrik sitasi, serta analitik komprehensif profil publikasi dosen dan peneliti di Google Scholar.

Dikembangkan oleh **Muhammad Ikhsan**, Universitas Islam Negeri Sumatera Utara (UINSU) Medan.

---

## 🌟 Fitur Utama

- **Peringkat Akreditasi & Indeksasi Otomatis**: Menampilkan badge peringkat jurnal seperti SINTA (S1–S6), Scopus (Q1–Q4), dan DOAJ langsung di halaman profil publikasi Google Scholar.
- **Analitik & Metrik Sitasi**: Perhitungan metrik dan visualisasi publikasi secara otomatis dan interaktif.
- **Side Panel Dasbor**: Dasbor bawaan yang terintegrasi di sisi browser Chrome untuk eksplorasi data profil lebih mudah.
- **Integrasi API Metadata**: Terhubung dengan sumber metadata Crossref dan OpenAlex untuk verifikasi metadata karya ilmiah.
- **Ekspor Laporan**: Fitur ekspor laporan publikasi dan sitasi ke format Excel (XLSX) dan tampilan cetak/HTML.

---

## 📂 Struktur Direktori

```text
├── CARA-PASANG.html   # Panduan instalasi ekstensi format HTML
├── LICENSE.txt        # Lisensi penggunaan
├── manifest.json      # Konfigurasi ekstensi Chrome Manifest V3
├── sw.js              # Service Worker background extension
├── content/           # Content script injeksi ke halaman Google Scholar
├── data/              # Database lokal, daftar jurnal dan pemetaan akreditasi
├── docs/              # Dokumentasi & panduan teknis
├── icons/             # Icon ekstensi & aset logo
├── lib/               # Modul pustaka (analytics, engine, ui, cite, xlsx, dll.)
├── panel/             # Tampilan & logika Chrome Side Panel
├── report/            # Antarmuka dan engine laporan publikasi
└── welcome/           # Halaman pengantar & instruksi pasca-instalasi
```

---

## 🚀 Panduan Pemasangan (Developer Mode)

1. **Clone atau Unduh Repositori**:
   ```bash
   git clone https://github.com/Forum-TIPD-PTKIN/gs_insight_uinsu.git
   ```
2. Buka peramban **Google Chrome** (minimal versi 116 ke atas).
3. Masuk ke halaman pengelolaan ekstensi:
   - Ketik `chrome://extensions` di address bar, lalu tekan **Enter**.
4. Aktifkan **Developer mode** (Mode Pengembang) di pojok kanan atas.
5. Klik tombol **Load unpacked** (Muat yang belum dibongkar).
6. Arahkan dan pilih direktori root proyek ini (`app-gsinsight`).
7. Ekstensi siap digunakan! Buka profil di [Google Scholar](https://scholar.google.com) untuk melihat fiturnya.

> Untuk instruksi lebih detail dan visual, buka file [CARA-PASANG.html](CARA-PASANG.html) langsung di browser Anda.

---

## 📄 Lisensi

Proyek ini didistribusikan di bawah ketentuan lisensi yang tertera di [LICENSE.txt](LICENSE.txt).
