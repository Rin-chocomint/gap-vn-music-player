// ====================================================================
// hub.js — Halaman Detail. Dibawa dari hub bawaan rilis 0.0.0.8
// (`hub_template.html`), ditulis ulang di atas VNHub API.
// Di-link otomatis oleh engine di akhir hub.html; berjalan setelah runtime
// bawaan (vn-hub-runtime.js) & semua scene siap.
// ====================================================================
//
// Sudah ditangani RUNTIME bawaan (tak perlu ditulis ulang di sini):
//   - data-action: start | chapter-select | exit | continue | back | goto | link
//   - data-bind / data-bind-asset: teks metadata & cover dari Profil Novel
//   - perpindahan scene (Halaman Detail ↔ Muat Permainan ↔ Credits)
//
// hub.js DI BAWAH mengisi yang tidak otomatis, semuanya bertanda
// `data-hub-slot` di markup: daftar chapter berprogres, ringkasan progres,
// waktu terakhir main, tombol Lanjutkan, dan kartu save slot.
//
// TIGA hal yang dulu ditulis tangan di 0.0.0.8 dan sekarang TIDAK lagi:
//   1. `require('electron')` + ipcRenderer mentah → VNHub.
//   2. Menebak judul novel dari `location.pathname` → VNHub.getStoryTitle().
//   3. `pageshow` + `visibilitychange` untuk menyegarkan setelah main
//      → VNHub.onChapterReturn() / VNHub.onResume(), yang memang untuk itu.
// ====================================================================
(function () {
  'use strict';

  var SLOT_COUNT = 6;

  function ready(cb) {
    if (window.VNHub && VNHub.isReady && VNHub.isReady()) { cb(); return; }
    if (window.VNHub) { VNHub.onReady(cb); return; }
    window.addEventListener('vnhub:api-ready', function () { VNHub.onReady(cb); }, { once: true });
  }

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var slot = function (name) { return $('[data-hub-slot="' + name + '"]'); };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Urutan chapter TANPA `chapters.json`. Heuristiknya sengaja disamakan
  // dengan `getNextChapterSync()` di vn-engine/core.js — kalau daftar ini
  // mengurut dengan cara lain, tombol "chapter berikutnya" akan melompat ke
  // tempat yang tidak pemain duga. Dengan `chapters.json`, engine sudah
  // mengurutkannya lebih dulu dan fungsi ini tidak dipakai.
  function urutkanBawaan(names) {
    return names.slice().sort(function (a, b) {
      var angka = function (name) {
        if (String(name).toLowerCase().indexOf('prolog') >= 0) return 0;
        var m = String(name).match(/\d+/);
        return m ? parseInt(m[0], 10) : Infinity;
      };
      return angka(a) - angka(b);
    });
  }

  // Persen baca satu chapter dari data progress lokal (0..100).
  function persenChapter(progress, chapter) {
    var c = progress && progress.chapters && progress.chapters[chapter];
    if (!c || !c.totalDialogues) return 0;
    return Math.max(0, Math.min(100, (c.progress / c.totalDialogues) * 100));
  }

  ready(function () {

    // ================= DAFTAR CHAPTER =================
    function baris(nama, label, persen, terkunci, onPick) {
      var el = document.createElement('button');
      el.type = 'button';
      el.className = 'dp-item' + (terkunci ? ' dp-item-locked' : '');
      el.innerHTML =
        '<span class="dp-item-row">' +
          '<span>' + esc(label) + (terkunci ? ' 🔒' : '') + '</span>' +
          '<span class="dp-item-pct">' + Math.floor(persen) + '%</span>' +
        '</span>' +
        '<span class="dp-bar"><span style="width:' + persen + '%"></span></span>';
      if (terkunci) {
        el.disabled = true;
      } else {
        el.addEventListener('click', function () { onPick(nama); });
      }
      return el;
    }

    // Klik chapter: catat waktu main TERAKHIR dulu, baru berpindah — sama
    // seperti 0.0.0.8, tapi lewat VNHub.saveProgress() yang memakai kunci
    // localStorage yang sama persis (`progress_<judul>`).
    function mainkan(fn, nama) {
      var p = VNHub.getProgress() || { chapters: {} };
      p.lastPlayed = new Date().toISOString();
      VNHub.saveProgress(p);
      fn.call(VNHub, nama);
    }

    function renderChapters() {
      var box = slot('chapter-list');
      if (!box) return;
      VNHub.getChapterList().then(function (data) {
        var progress = VNHub.getProgress() || { chapters: {} };
        var meta = (data && data.chapterMeta) || null;
        var utama = (data && data.mainChapters) || [];
        // Dengan manifest, urutan sudah final dari engine; tanpa manifest, pakai heuristik.
        if (!meta) utama = urutkanBawaan(utama);

        box.innerHTML = '';

        if (!utama.length) {
          box.innerHTML = '<p class="dp-empty">Belum ada chapter. Tambahkan lewat editor.</p>';
        }

        utama.forEach(function (nama) {
          var m = meta && meta[nama];
          box.appendChild(baris(
            nama,
            (m && m.title) || nama,
            persenChapter(progress, nama),
            !!(m && m.locked),
            function (n) { mainkan(VNHub.playChapter, n); }
          ));
        });

        var sisi = (data && data.sideStories) || [];
        if (sisi.length) {
          var h = document.createElement('h3');
          h.className = 'dp-subhead';
          h.textContent = 'Side Story / Teaser';
          box.appendChild(h);
          sisi.forEach(function (nama) {
            box.appendChild(baris(nama, nama, 0, false, function (n) {
              mainkan(VNHub.playSideStory, n);
            }));
          });
        }
      }).catch(function () {
        box.innerHTML = '<p class="dp-empty">Gagal memuat daftar chapter.</p>';
      });
    }

    // ================= RINGKASAN PROGRES =================
    function renderProgress() {
      var progress = VNHub.getProgress() || { chapters: {} };
      var dibaca = 0, total = 0;
      Object.keys(progress.chapters || {}).forEach(function (k) {
        dibaca += progress.chapters[k].progress || 0;
        total += progress.chapters[k].totalDialogues || 0;
      });
      var persen = total > 0 ? (dibaca / total) * 100 : 0;

      var teks = slot('overall');
      if (teks) {
        teks.textContent = total > 0
          ? 'Progres keseluruhan cerita: ' + Math.floor(persen) + '%'
          : 'Belum ada progres.';
      }
      var bar = slot('overall-bar');
      if (bar) bar.style.width = persen + '%';

      var last = slot('last-played');
      if (last) {
        last.textContent = progress.lastPlayed
          ? 'Terakhir dimainkan: ' + new Date(progress.lastPlayed).toLocaleString('id-ID')
          : '';
      }
    }

    // ================= TOMBOL LANJUTKAN =================
    // Muncul HANYA kalau benar-benar ada save. Tombol yang selalu tampil lalu
    // membuka layar kosong adalah janji yang tidak ditepati.
    function refreshContinue() {
      var btn = slot('continue');
      if (!btn) return;
      VNHub.getSaveSlots().then(function (slots) {
        btn.hidden = !(slots && slots.length);
      }).catch(function () { btn.hidden = true; });
    }

    // ================= MUAT PERMAINAN =================
    function populateSlots() {
      var box = slot('save-slots');
      if (!box) return;
      box.innerHTML = '<p class="dp-empty">Memuat slot&hellip;</p>';
      VNHub.getSaveSlots().then(function (slots) {
        box.innerHTML = '';
        for (var i = 1; i <= SLOT_COUNT; i++) {
          (function (nomor) {
            var data = (slots || []).filter(function (s) { return s.slotId === nomor; })[0];
            var card = document.createElement('div');
            card.className = 'dp-slot' + (data ? '' : ' empty');

            if (data) {
              var shot = '';
              if (data.previewImage) {
                var url = VNHub.resolveAsset(data.chapter + '/' + data.previewImage);
                shot = data.previewType === 'video'
                  ? '<video src="' + esc(url) + '" autoplay muted loop></video>'
                  : '';
                if (data.previewType !== 'video') {
                  // background-image dirakit lewat setAttribute di bawah supaya
                  // apostrof di nama berkas tidak meruntuhkan deklarasinya.
                  card.dataset.shotUrl = url;
                }
              }
              var tanggal = data.timestamp ? new Date(data.timestamp).toLocaleString('id-ID') : '';
              card.innerHTML =
                '<div class="dp-slot-shot">' + shot +
                  '<div class="dp-slot-cap">' +
                    '<div class="dp-slot-chapter">' + esc(data.chapter || 'Tersimpan') + '</div>' +
                    '<div class="dp-slot-date">' + esc(tanggal) + '</div>' +
                  '</div>' +
                '</div>' +
                '<div class="dp-slot-foot">Slot ' + nomor + '</div>';

              if (card.dataset.shotUrl) {
                var shotEl = card.querySelector('.dp-slot-shot');
                // JSON.stringify memberi tanda kutip + escape yang benar; merakit
                // url('…') dengan tangan runtuh diam-diam pada apostrof.
                if (shotEl) shotEl.style.backgroundImage = 'url(' + JSON.stringify(card.dataset.shotUrl) + ')';
              }

              card.addEventListener('click', function () { VNHub.loadGame(nomor); });
            } else {
              card.innerHTML =
                '<div class="dp-slot-shot">Kosong</div>' +
                '<div class="dp-slot-foot">Slot ' + nomor + '</div>';
            }

            box.appendChild(card);
          })(i);
        }
      }).catch(function () {
        box.innerHTML = '<p class="dp-empty">Gagal memuat slot.</p>';
      });
    }

    // Isi slot saat layar Muat Permainan benar-benar tampil — bukan saat hub
    // dibuka. Membaca disk untuk layar yang mungkin tak pernah dibuka itu
    // ongkos yang tak dibayar siapa pun.
    var layarLoad = $('.hub-scene.dp-load');
    if (layarLoad) {
      new MutationObserver(function () {
        if (layarLoad.classList.contains('active')) populateSlots();
      }).observe(layarLoad, { attributes: true, attributeFilter: ['class'] });
    }

    function refreshSemua() {
      renderChapters();
      renderProgress();
      refreshContinue();
    }

    refreshSemua();

    // Pemain kembali dari chapter → progres & tombol Lanjutkan berubah.
    VNHub.onChapterReturn(refreshSemua);
    // Kembali dari alt-tab/minimize: murah, dan menutup kasus save dari tempat lain.
    VNHub.onResume(refreshSemua);
  });
})();
