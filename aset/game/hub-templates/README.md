# Pustaka Template Hub

Folder ini berisi **template Hub berbasis folder**. Setiap subfolder = satu template
lengkap yang menutupi scene dasar Hub. Sejak UX-C01/C02, pustaka ini adalah
**satu-satunya** sumber template Hub — konstanta `HUB_TEMPLATES` di
`node-registry.js` beserta IPC `hub:apply-code-template` sudah dicabut karena
keempat anggotanya menghasilkan markup generik + `hub.css` gaya dasar yang sama.

## Keluarga susunan (yang dipakai picker untuk mengelompokkan)

Keluhan tester yang melahirkan taksonomi ini: *"template Hub semua sama
susunannya."* Terkonfirmasi — `anime`, `classic`, dan `cute` dulu memakai markup
`main_menu` yang **identik baris per baris**; yang berbeda hanya `hub.css`. Karena
itu picker mengelompokkan per **`layoutFamily`**, bukan per gaya:

| `layoutFamily` | Template | Susunannya |
|---|---|---|
| `left-rail` | `minimal`, `spotlight` | Judul & menu di sisi kiri; sisa layar untuk artwork |
| `center-stack` | `anime`, `cute` | Judul di tengah, tombol bertumpuk vertikal |
| `cinematic-bottom` | `panorama` | Menu berbaris mendatar di dekat dasar layar |
| `detail-page` | `detail-page` | Bukan menu sama sekali: info, sinopsis, dan seluruh daftar chapter terlihat sekaligus dalam satu layar yang bisa digulung |

> `detail-page` dibawa dari hub bawaan rilis **0.0.0.8** (`hub_template.html`) dan ditulis
> ulang di atas konvensi sekarang (`data-bind` / `data-action` / VNHub API). Ia satu-satunya
> anggota pustaka yang scene-nya **boleh menggulung** — daftar chapternya tumbuh sepanjang
> isi novel, jadi `overflow-y: auto` di `.hub-scene` adalah bagian dari susunannya, bukan
> kelalaian.

**`showcase/`** berdiri di luar keluarga (`"kind": "advanced"`) — template kaya-fitur
yang juga menyertakan **Galeri, Achievements, Muat Permainan, dan Pengaturan**,
dengan `hub.js` yang mendemokan VNHub API secara penuh (acuan terbaik untuk
belajar/menyesuaikan).

> `classic` **dicabut** dan digantikan `minimal`: susunannya sama persis dengan
> `anime`/`cute`, jadi ia hanya menambah satu kartu yang tak terlihat bedanya.

## Foto kartu (`preview.png`)

Kartu picker menjual template lewat **foto**, dan fotonya dipotret dari hasil
penerapan yang sebenarnya:

```bash
npm run thumbnails            # semua (Hub + Player)
npm run thumbnails -- --only=hub --id=minimal
```

`tools/render-thumbnails.js` menempuh jalur `applyFolderTemplate()` yang **sama
persis** dengan tombol Apply di editor, lalu memotret scene `main_menu`-nya.
Konsekuensinya: **kalau kamu mengubah template, potret ulang thumbnailnya** —
test taksonomi menolak template yang menyebut thumbnail tanpa berkasnya.

> Catatan updater: `preview.png` adalah aset biner, jadi ia **tidak** ikut manifest
> Tier-1 (`versions.json` hanya mengelola `.html/.js/.css/.json/.md/.txt`). Instalasi
> yang baru menerima update per-file akan menampilkan kartu bertanda "tanpa foto"
> sampai menerima rilis penuh (Tier-2). Itu disengaja dan tidak merusak apa pun.

Template dipilih lewat editor: **Hub → Template Hub** (panelnya permanen, tak perlu
dibuka lewat tombol lain). Saat diterapkan, template menulis ulang `hub.html`,
`hub.css`, dan markup tiap scene novel sebagai **hub code-first** — lalu bebas
dikustomisasi per scene (Advanced / VS Code). Penerapan bisa di-**Undo** (tema lama
dipulihkan).

## Struktur satu template

```
<id>/
├─ template.json     Manifest: id, icon, label, description, daftar scene, css, js
├─ hub.css           Tema lengkap (disalin & MENIMPA hub.css novel)
├─ hub.js            (opsional) logika kustom; bila tak ada, dipakai starter engine
└─ scenes/
   ├─ splash.html
   ├─ warning.html
   ├─ main_menu.html
   ├─ info.html
   └─ credits.html
```

### `template.json`

```json
{
  "id": "minimal",
  "icon": "▤",
  "label": "Minimal — Menu di Kiri",
  "description": "Deskripsi singkat di kartu picker.",
  "order": 10,
  "kind": "layout",
  "layoutFamily": "left-rail",
  "thumbnail": "preview.png",
  "css": "hub.css",
  "js": "hub.js",
  "scenes": [
    { "type": "splash",    "name": "Splash",     "file": "scenes/splash.html",    "duration": 3000 },
    { "type": "warning",   "name": "Peringatan", "file": "scenes/warning.html" },
    { "type": "main_menu", "name": "Main Menu",  "file": "scenes/main_menu.html" },
    { "type": "info",      "name": "Info Novel", "file": "scenes/info.html" },
    { "type": "credits",   "name": "Credits",    "file": "scenes/credits.html" }
  ]
}
```

- `type` wajib salah satu: `splash | warning | main_menu | info | credits | custom_code | blank`.
- `file` opsional; bila kosong, markup scene dibuat generik oleh engine.
- `order` (opsional) mengurutkan template di picker.
- `kind` — `layout` (pilihan susunan) atau `advanced` (blueprint kaya-fitur).
- `layoutFamily` — nama keluarga susunan; inilah yang dipakai picker untuk
  MENGELOMPOKKAN. Dua template berkeluarga sama tampil berdampingan.
- `thumbnail` — nama berkas foto di dalam folder template (`npm run thumbnails`).
- `icon` — hanya dipakai sebagai PENGGANTI saat foto belum ada. Kartu yang sudah
  memperlihatkan wujud template tak menampilkan emoji lagi.

> Ketiga field taksonomi bersifat **opsional**: template buatan kreator atau paket
> lama yang tak menyebutnya tetap terdaftar dan tetap bisa dipilih — picker
> menaruhnya di grup **Belum Dikategorikan**. Editor sengaja TIDAK menebak:
> label yang salah lebih buruk daripada label kosong. Untuk template baru yang
> ikut dikirim bersama aplikasi, ketiganya wajib lengkap (dijaga test).

### Berkas scene (`scenes/*.html`)

Tiap berkas = SATU `<section>` penuh. Engine mengenali scene lewat
`data-scene-id` + `data-scene-type`. Token berikut disubstitusi saat diterapkan:

| Token | Diganti dengan |
|---|---|
| `{{SCENE_ID}}` | ID unik scene (untuk `data-scene-id`) |
| `{{SCENE_NAME}}` | Nama tampilan scene (dari manifest) |
| `{{TARGET:info}}` | ID scene pertama bertipe `info` (untuk tombol `goto`) |
| `{{TARGET:credits}}` | ID scene pertama bertipe `credits` |

### Konvensi markup yang dimengerti runtime

- `class="hub-scene"` — wajib di tiap `<section>`. Tambah `hub-scene-boot` untuk
  splash & warning (tampil berurutan di awal).
- `data-scene-type="splash"` + `data-duration="3000"` — auto-lanjut splash (ms).
- `data-action="..."` pada tombol: `start | chapter-select | exit | continue | back |
  goto | link` (`goto` butuh `data-target="<scene-id>"` → pakai token `{{TARGET:...}}`;
  `link` butuh `data-href`). Aksi di luar daftar ini **tidak** ditangani runtime
  bawaan — ia diam saja sampai kamu menanganinya sendiri lewat VNHub di `hub.js`.
- `data-bind="..."` mengisi teks dari metadata novel: `title | storyDesc | description |
  genre | author | illustrator | vnMapper | version`.
- `data-bind-asset` pada `<img>` mengisi `src` dari cover novel. Novel yang belum punya
  cover membiarkan `<img>` tanpa `src`, jadi sediakan aturan seperti
  `img:not([src]) { display: none; }` supaya tak ada ikon gambar rusak (lihat
  `spotlight/hub.css`).
- `data-node="nama"` menandai elemen agar tampil sebagai anak scene di tree editor.

> **Penting (CSS): font global novel.** Tiap deklarasi `font-family` di `hub.css`
> WAJIB dibaca lewat `var(--vn-novel-font, <bawaanmu>)`, bukan nilai telanjang:
>
> ```css
> --dp-sans: var(--vn-novel-font, 'Lexend', Arial, sans-serif);
> ```
>
> `--vn-novel-font` diisi `<novel>/novel-font.css` — berkas yang ditulis editor dari
> **Profil Novel → Tampilan**, dan yang `hub.html` tautkan **sebelum** `hub.css`.
> Novel yang belum memilih font tidak punya berkas itu, jadi `var()` jatuh ke
> bawaanmu dan tak ada yang berubah. Template yang memakai nilai telanjang akan
> mengabaikan pilihan kreator tanpa gejala apa pun — dijaga test taksonomi.
>
> Berkas itu **tidak** ikut ditimpa saat template diterapkan maupun di-undo:
> `hub.css` milik template, font milik novel.

> **Penting (CSS):** `hub.css` tema WAJIB memuat sistem visibilitas scene:
> `.hub-scene { opacity:0; visibility:hidden; }` dan
> `.hub-scene.active { opacity:1; visibility:visible; }` — tanpa itu tidak ada
> scene yang tampil. Lihat tema bawaan sebagai acuan.

## Menambah template baru

Salin salah satu folder (mis. `minimal/`), ganti `id`/`label` di `template.json`,
ubah `hub.css` sesuai gaya, sesuaikan markup bila perlu. Template langsung muncul
di picker (dipindai otomatis dari folder ini).

Kalau susunannya benar-benar baru (bukan sekadar warna), beri `layoutFamily` baru
lalu daftarkan judul & keterangannya di peta `KELUARGA` pada `hubEditor.js` — tanpa
itu grupnya tetap muncul, hanya berjudul nama mentah keluarganya.

Terakhir: `npm run thumbnails -- --only=hub --id=<id>` supaya kartunya berfoto.
