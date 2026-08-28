# Gap VN & Music Player

Pemutar musik sekaligus engine visual novel dalam satu aplikasi desktop.
Codename: **VN 0**.

> **Status: alpha (v0.0.0.9).** Jalur rilisnya pra-rilis, jadi perbaikan datang
> bertahap lewat pembaruan otomatis. Masih mungkin ada bug, dan bentuk sebagian
> fitur bisa berubah di versi berikutnya.

---

## Apa ini

Dua hal yang tinggal serumah:

**Pemutar musik.** Playlist dari berkas lokal, webview YouTube Music, mini
player, overlay yang bisa ditumpuk di atas aplikasi lain, visualizer WebGPU,
wallpaper video di latar, dan kehadiran Discord Rich Presence.

**Engine visual novel.** Bukan cuma pemutar — ada editornya. Novel disusun dari
JSON deklaratif lewat editor visual, bukan dengan menulis kode: dialog, pilihan
bercabang, sprite berlapis, transisi, variabel cerita, achievement, galeri, dan
hub menu utama yang bisa dipilih dari pustaka template. Yang mau turun lebih
dalam bisa menulis `player.html` sendiri atau menambah extension JavaScript,
tanpa kehilangan fitur bawaan engine.

Tiga bahasa antarmuka tersedia untuk runtime novel: Indonesia, Inggris, Jepang.

## Unduh dan jalankan

Ambil arsip rilis terbaru dari halaman **[Releases](../../releases)**, ekstrak
ke folder kosong, lalu jalankan `Gap.exe`. Tidak ada pemasang — aplikasinya
berjalan langsung dari folder itu.

Petunjuk pemakaian sehari-hari (menambah musik, wallpaper, tips) ada di berkas
`Petunjuk cara pakai aplikasi (Baca Akuu).txt` di dalam arsip.

## Menjalankan dari sumber

```bash
npm install
npm start
```

Membangun aplikasi terpaket (Windows x64):

```bash
npm run build     # keluarannya di dist/Gap-win32-x64/
```

## Cara pembaruan bekerja

Repo ini adalah sumber kebenaran updater. Aplikasi tidak dibungkus ASAR, jadi
berkas di `resources/app/` memetakan satu-satu ke path di repo.

- **Tier-1 — tambalan per berkas.** Updater membaca `versions.json` pada tag
  rilis terbaru, membandingkan hash SHA-256 tiap berkas terkelola, lalu hanya
  mengunduh yang berubah. Semua berkas diunduh dan diverifikasi lebih dulu;
  kalau satu saja gagal, seluruh pembaruan dibatalkan tanpa menulis apa pun.
- **Tier-2 — arsip penuh.** Untuk perubahan yang tak bisa ditambal per berkas
  (versi Electron, dependensi, aset biner besar), aplikasi mengarahkan pengguna
  ke halaman rilis.

`updater.excludePaths` di `versions.json` menentukan apa yang **tidak** dikelola
updater. Di dalamnya termasuk seluruh karya pengguna — novel, musik, wallpaper,
karakter, dan save game — sehingga pembaruan tidak pernah menimpa atau menghapus
buatan mereka.

## Struktur singkat

| Folder | Isi |
|---|---|
| `vn-engine/` | proses utama untuk sisi visual novel |
| `vn-player/` | runtime novel: engine, tema, palet, template, extension |
| `aset/game/` | editor novel (`vnManager`), modulnya, template hub |
| `renderer/` | antarmuka aplikasi utama |
| `aset/game/visual_novels/` | novel — bawaan maupun buatanmu |

## Lisensi

ISC License (Modified) — lihat [LICENSE](LICENSE) untuk detail penggunaan kode.

---

(c) 2026 Rd Chocomint / Rin Chocomint
