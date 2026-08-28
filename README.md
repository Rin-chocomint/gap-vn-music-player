# Gap VN & Music Player (Engine)
**Codename: VN 0**

Repositori ini berisi **Kode Sumber (Source Code)** dari mesin *Visual Novel & Music Player* yang dikembangkan oleh Rd/Rin Chocomint.

Proyek ini dirancang sebagai kerangka kerja (framework) yang ringan untuk membuat Visual Novel berbasis web/electron yang terintegrasi dengan pemutar musik lokal.

> **Status: alpha.** Jalur rilisnya pra-rilis, jadi perbaikan datang bertahap lewat pembaruan otomatis. Masih mungkin ada bug, dan bentuk sebagian fitur bisa berubah di versi berikutnya.

## License (Lisensi)
Software ini dirilis di bawah lisensi **ISC License (Modified)**.

Anda bebas menggunakan, memodifikasi, dan mendistribusikan engine ini untuk keperluan pribadi maupun komersial, **DENGAN SYARAT**:
1.  **Atribusi:** Anda wajib menyertakan kembali file `LICENSE` asli dan memberikan kredit kepada pencipta asli (**Rd Chocomint / Rin Chocomint**) pada bagian kredit aplikasi/game Anda.
2.  **Modifikasi:** Jika Anda memodifikasi engine ini, Anda didorong untuk tetap mencantumkan "Powered by Gap VN Engine".

> Lihat file [LICENSE](./LICENSE) untuk detail lengkap.

## Support kami...!!
Jika kamu menyukai semua proyek yang kami kerjakan, Kamu bisa dukung kami dengan mentraktir kami jajanan melalui trakteer atau secangkir kopi melalui Ko-fi ❤️:

<a href="https://trakteer.id/rin_chocomint">
  <img src="https://cdn.trakteer.id/images/embed/trbtn-red-1.png" width="200px">
</a>
&nbsp; <a href="https://ko-fi.com/rinchocomint">
  <img src="https://storage.ko-fi.com/cdn/kofi2.png?v=3" width="200px">
</a>

---

## Apa isinya
Dua hal yang tinggal serumah:

**Pemutar musik.** Playlist dari berkas lokal, webview YouTube Music, mini player, overlay yang bisa ditumpuk di atas aplikasi lain, visualizer WebGPU, wallpaper video di latar, dan kehadiran Discord Rich Presence.

**Engine visual novel.** Bukan cuma pemutar — ada editornya. Novel disusun dari JSON deklaratif lewat editor visual, bukan dengan menulis kode: dialog, pilihan bercabang, sprite berlapis, transisi, variabel cerita, achievement, galeri, dan hub menu utama yang bisa dipilih dari pustaka template. Yang mau turun lebih dalam bisa menulis `player.html` sendiri atau menambah extension JavaScript, tanpa kehilangan fitur bawaan engine.

Tiga bahasa antarmuka tersedia untuk runtime novel: Indonesia, Inggris, Jepang.

## Download & Release
Versi siap pakai (Binary) untuk Windows dapat diunduh di menu **[Releases](../../releases)**.

* **Versi Release:** Berisi Engine siap pakai dengan halaman "About" yang memuat sejarah pengembangan proyek ini.
* **Versi Repo:** Berisi kode sumber murni ("Clean") tanpa konten personal, siap untuk dikembangkan ulang oleh developer lain.

Ekstrak arsipnya ke folder kosong lalu jalankan `Gap.exe` — tidak ada pemasang, aplikasinya berjalan langsung dari folder itu. Petunjuk pemakaian sehari-hari (menambah musik, wallpaper, tips) ada di berkas `Petunjuk cara pakai aplikasi (Baca Akuu).txt` di dalam arsip.

> Letak tombol **Releases** ada di sebelah kanan halaman ini. Pastikan kamu tidak mengambil versi lama untuk tahu kemajuan sebenarnya aplikasi ini.

## For Developers / Untuk Pengembang
Ingin membuat Visual Novel sendiri atau memodifikasi engine ini?

1.  **Clone** repositori ini.
2.  **Setup:** Jalankan `npm install` untuk mengunduh dependensi.
3.  **Jalankan:** `npm start`.
4.  **Bangun paket** (Windows x64): `npm run build` — keluarannya di `dist/Gap-win32-x64/`.

Peta singkat kodenya:

| Folder | Isi |
|---|---|
| `vn-engine/` | proses utama untuk sisi visual novel |
| `vn-player/` | runtime novel: engine, tema, palet, template, extension |
| `aset/game/` | editor novel (`vnManager`), modulnya, template hub |
| `renderer/` | antarmuka aplikasi utama |
| `aset/game/visual_novels/` | novel — bawaan maupun buatanmu |

> **Catatan:** Folder `aset` di repositori ini hanya membawa satu novel contoh dan berkas sampel. Silakan ganti dengan aset kreatif Anda sendiri saat membuat proyek baru.

## Cara pembaruan bekerja
Repo ini adalah sumber kebenaran updater. Aplikasi tidak dibungkus ASAR, jadi berkas di `resources/app/` memetakan satu-satu ke path di repo.

- **Tier-1 — tambalan per berkas.** Updater membaca `versions.json` pada tag rilis terbaru, membandingkan hash SHA-256 tiap berkas terkelola, lalu hanya mengunduh yang berubah. Semua berkas diunduh dan diverifikasi lebih dulu; kalau satu saja gagal, seluruh pembaruan dibatalkan tanpa menulis apa pun.
- **Tier-2 — arsip penuh.** Untuk perubahan yang tak bisa ditambal per berkas (versi Electron, dependensi, aset biner besar), aplikasi mengarahkan pengguna ke halaman rilis.

`updater.excludePaths` di `versions.json` menentukan apa yang **tidak** dikelola updater. Di dalamnya termasuk seluruh karya pengguna — novel, musik, wallpaper, karakter, dan save game — sehingga pembaruan tidak pernah menimpa atau menghapus buatan mereka.

## Kontribusi
Proyek ini dikembangkan sebagai sarana belajar dan hobi. Jika Anda menemukan *bug* atau ingin menyumbangkan kode perbaikan, silakan buat *Pull Request* atau *Issue* di repositori ini.

---
**Copyright © 2026 Rd Chocomint / Rin Chocomint.**
