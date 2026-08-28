# Pustaka Template Player

Setiap subfolder = satu template yang bisa diterapkan ke **level novel** atau
**level chapter** lewat editor: *VN Player → Template Player*.

Menerapkan template menulis berkas **milik kreator** lalu menyingkir — tak ada
lapisan tersembunyi yang terus berlaku diam-diam:

| Berkas yang ditulis | Isi |
|---|---|
| `player.html` | shim engine (markup tetap milik engine, jadi novel ikut update) |
| `theme.css` | seluruh kosmetik & susunan template ini |
| `vocab-ui.json` | opsional — label manusiawi untuk kosakata yang dibawa template |
| `extensions/*.js` | opsional — transisi/efek/command yang dibawa template |

## Dua kategori (UX-C03)

Picker mengelompokkan kartu per **`category`**, bukan per gaya:

| `category` | Anggota | Artinya |
|---|---|---|
| `layout` | `default`, `klasik-adv`, `menu-kiri`, `kaca-biru`, `retro-sekolah`, `dok-perintah`, `subtitle` | Pilihan **susunan** layar cerita. Fotonya memperlihatkan bedanya |
| `starter-kit` | `lengkap`, `custom-layer` | **Bukan** pilihan tampilan: paket kemampuan / kepemilikan kode. Fotonya memang mirip Polos |

Tiap template `layout` wajib punya `layoutFamily` yang **unik** — dua kartu
berkeluarga sama berarti dua pilihan yang mengaku beda padahal tidak.

`category` **menggantikan** field lama `bentuk`. Jangan hidupkan keduanya
sekaligus: itu dua sumber kebenaran untuk satu pengelompokan.

## Aturan yang mengikat template `layout`

1. **Peran, bukan id.** Semua selektor memakai `data-player-role="…"`. Itu
   kontraknya sejak Tahap 4 — kotak dialog buatan kreator tetap kena aturan
   template asal ia membawa perannya. Menyebut `#dialogue-box` dst. ditolak test.
2. **`box-sizing: border-box` untuk apa pun yang diberi lebar + padding.** Engine
   tidak menyetelnya di mana pun, jadi lebar dan padding dijumlahkan KE LUAR:
   kotak selebar layar jadi lebih lebar dari layar, tergeser oleh
   `align-items: center` milik panggung, dan sisi kanannya terpotong. Tak ada
   galat apa pun — hanya salah gambar. Bug ini sempat terkirim di `klasik-adv`.
3. **`::after` kotak dialog SUDAH DIPAKAI engine** untuk tanda lanjut. Tekstur/
   lapisan tambahan taruh di `::before`; memakai `::after` menghapus tanda lanjut
   tanpa pesan apa pun.
4. **Tanda lanjut digeser lewat variabel, bukan selektor.** Rantai `:has()/:not()`
   milik engine berbobot 0-7-0 — aturan biasa di `theme.css` tak akan menang.
   Pakai `--vn-continue-right/-bottom` (isi `auto` untuk mematikan salah satunya),
   lalu tulis properti yang memang tak pernah disentuh engine (mis. `top`).
5. **Nama pembicara kosong wajib disembunyikan** (`[data-player-role="speaker"]:empty
   { display: none; }`) — baris narasi tak boleh menyisakan plakat/tab menggantung.

### Batas yang diakui semua template layout

Tombol **Simpan / Muat / Pengaturan** tidak bisa dipindahkan ke baris perintah,
kolom, rel, maupun dok mana pun. Di markup engine ketiganya tinggal **di dalam**
overlay riwayat yang `display: none`, dan anak dari elemen yang disembunyikan tak
bisa ditampilkan lewat CSS apa pun. Jalurnya tetap: **Riwayat → Save/Load/Setting**.
Menaikkan ketiganya menuntut kepemilikan markup — itu paket `lengkap`, bukan
template susunan.

Yang memang bisa dipindahkan: `btn-hub`, `btn-rollback`, `btn-auto`, `btn-history`.

## Foto kartu (`preview.png`)

```bash
npm run thumbnails                          # semua (Hub + Player)
npm run thumbnails -- --only=player --id=subtitle
npm run thumbnails -- --only=player --id=subtitle --full   # ukuran penuh, untuk memeriksa detail
```

`tools/render-thumbnails.js` memuat `vn-player/player.html` **asli** beserta
seluruh CSS engine, lalu menempelkan `theme.css` template di ujung cascade —
persis posisinya saat dipakai novel. Jadi foto tak bisa menyimpang dari hasil
sebenarnya. **Ubah template → potret ulang**; test taksonomi menolak template yang
menyebut thumbnail tanpa berkasnya.

> Catatan updater: `preview.png` adalah aset biner, jadi ia tidak ikut manifest
> Tier-1. Instalasi yang baru menerima update per-file menampilkan kartu bertanda
> "tanpa foto" sampai menerima rilis penuh (Tier-2).

## Menambah template layout baru

1. Salin folder yang paling dekat (mis. `menu-kiri/`), ganti `id` & `label`.
2. Isi `category: "layout"` + `layoutFamily` yang belum dipakai + `thumbnail`.
3. Tulis `theme.css` mengikuti lima aturan di atas.
4. `npm run thumbnails -- --only=player --id=<id>`.
5. `npx jest tests/unit/template-catalog-taxonomy.test.js` — di situlah kelima
   aturan itu benar-benar dijaga.
