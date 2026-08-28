// ====================================================================
// hub.js — Showcase Hub. Contoh LENGKAP memakai VNHub API.
// Di-link otomatis oleh engine di akhir hub.html; berjalan setelah runtime
// bawaan (vn-hub-runtime.js) & semua scene siap.
// ====================================================================
//
// Sudah ditangani RUNTIME bawaan (tak perlu ditulis ulang):
//   - Alur boot: splash/warning tampil dulu → scene terminal (main_menu).
//   - data-action: start | chapter-select | exit | continue | back | goto | link.
//   - data-bind / data-bind-asset: isi teks & cover dari metadata novel.
//
// hub.js DI BAWAH menangani yang TIDAK otomatis: Galeri, Muat Permainan,
// Pengaturan, tombol "Lanjutkan", dan BGM menu — semuanya lewat objek VNHub.
//
// Autocomplete VNHub di VS Code: salin vnhub.d.ts ke folder novel lalu tambah
//   /// <reference path="vnhub.d.ts" />
// di baris paling atas file ini.
// ====================================================================
(function () {
  'use strict';

  function ready(cb) {
    if (window.VNHub && VNHub.isReady && VNHub.isReady()) { cb(); return; }
    if (window.VNHub) { VNHub.onReady(cb); return; }
    window.addEventListener('vnhub:api-ready', function () { VNHub.onReady(cb); }, { once: true });
  }

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  // Tampilkan satu scene berdasarkan penanda data-hub-screen (mirror runtime showOnly).
  function showScreen(role) {
    var target = $('.hub-scene[data-hub-screen="' + role + '"]');
    if (!target) return;
    $$('.hub-scene').forEach(function (s) { s.classList.toggle('active', s === target); });
  }

  ready(function () {
    var meta = VNHub.getNovelMeta() || {};
    var galleryLoaded = false;

    // --- Background menu dari cover novel (opsional, demonstrasi resolveAsset) ---
    var menuEl = $('.hub-scene[data-hub-screen="menu"]');
    if (menuEl && meta.cover) {
      menuEl.style.setProperty('--menu-bg', "url('" + VNHub.resolveAsset(meta.cover) + "')");
      menuEl.classList.add('has-bg');
    }

    // --- BGM menu: mulai saat menu pertama kali aktif (sumber: hub-config.menu.bgm) ---
    var bgmStarted = false;
    function maybeStartBgm() {
      if (bgmStarted || !menuEl || !menuEl.classList.contains('active')) return;
      bgmStarted = true;
      VNHub.getHubConfig().then(function (cfg) {
        var bgm = cfg && cfg.menu && cfg.menu.bgm;
        if (bgm) VNHub.playAudio(bgm, { volume: 0.5, loop: true, fade: 800 });
      }).catch(function () {});
    }
    if (menuEl) {
      new MutationObserver(maybeStartBgm).observe(menuEl, { attributes: true, attributeFilter: ['class'] });
      maybeStartBgm();
    }

    // --- Navigasi layar custom + aksi yang tidak ditangani runtime ---
    document.body.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-hub-nav]');
      if (!btn) return;
      var nav = btn.getAttribute('data-hub-nav');
      switch (nav) {
        case 'gallery':  if (!galleryLoaded) { galleryLoaded = true; loadGallery(); } showScreen('gallery'); break;
        case 'achievements': loadAchievements(); showScreen('achievements'); break;
        case 'load':     populateSlots(); showScreen('load'); break;
        case 'settings': renderSettings(); showScreen('settings'); break;
        case 'resume':   resumeLatest(); break;
        case 'advanced-settings': VNHub.showSettings(); break;
      }
    });

    // ================= GALERI (VNHub.getGalleryImages) =================
    function loadGallery() {
      var grid = $('[data-hub-slot="gallery-grid"]');
      if (!grid) return;
      VNHub.getGalleryImages().then(function (images) {
        grid.innerHTML = '';
        if (!images || !images.length) { grid.innerHTML = '<p class="sc-empty">Belum ada gambar di galeri.</p>'; return; }
        images.forEach(function (rel) {
          var url = VNHub.resolveAsset(rel);
          var item = document.createElement('div');
          item.className = 'sc-gallery-item';
          var img = document.createElement('img');
          img.src = url; img.loading = 'lazy';
          item.appendChild(img);
          item.addEventListener('click', function () { openLightbox(url); });
          grid.appendChild(item);
        });
      }).catch(function () { grid.innerHTML = '<p class="sc-empty">Gagal memuat galeri.</p>'; });
    }
    function openLightbox(url) {
      var lb = document.createElement('div');
      lb.className = 'sc-lightbox';
      var img = document.createElement('img'); img.src = url;
      lb.appendChild(img);
      lb.addEventListener('click', function () { lb.remove(); });
      document.body.appendChild(lb);
    }

    // ================= ACHIEVEMENTS (VNHub.achievements.list) =================
    // Sengaja dimuat ulang TIAP layar dibuka (bukan sekali seperti galeri):
    // list() men-sweep unlock otomatis def ber-unlockFlag + memicu toast bila ada
    // yang baru terbuka. Jadi membuka layar ini juga MENGHIDUPKAN jalur unlockFlag.
    function loadAchievements() {
      var list = $('[data-hub-slot="achievement-list"]');
      var countEl = $('[data-hub-slot="achievement-count"]');
      if (!list) return;
      VNHub.achievements.list().then(function (all) {
        if (countEl) {
          var done = all.filter(function (a) { return a.unlocked; }).length;
          countEl.textContent = all.length ? (done + ' / ' + all.length) : '';
        }
        if (!all.length) {
          list.innerHTML = '<p class="sc-empty">Novel ini belum punya achievement.</p>';
          return;
        }
        list.innerHTML = '';
        all.forEach(function (a) {
          var locked = !a.unlocked;
          var secret = locked && a.hidden;                 // hidden + terkunci = anti-spoiler
          var row = document.createElement('div');
          row.className = 'sc-ach-row' + (locked ? ' locked' : ' unlocked');

          var icon = document.createElement('div');
          icon.className = 'sc-ach-icon';
          icon.textContent = secret ? '?' : (a.icon || (locked ? '🔒' : '🏆'));

          var body = document.createElement('div');
          body.className = 'sc-ach-body';
          var title = document.createElement('div');
          title.className = 'sc-ach-title';
          title.textContent = secret ? '???' : (a.title || a.id);
          var desc = document.createElement('div');
          desc.className = 'sc-ach-desc';
          desc.textContent = secret ? 'Masih tersembunyi — mainkan untuk membukanya.' : (a.desc || '');
          body.appendChild(title);
          if (desc.textContent) body.appendChild(desc);

          var status = document.createElement('div');
          status.className = 'sc-ach-status';
          status.textContent = locked ? 'Terkunci' : 'Terbuka';

          row.appendChild(icon);
          row.appendChild(body);
          row.appendChild(status);
          list.appendChild(row);
        });
      }).catch(function () {
        list.innerHTML = '<p class="sc-empty">Gagal memuat achievements.</p>';
      });
    }

    // ================= MUAT PERMAINAN (VNHub.getSaveSlots / loadGame) =================
    var SLOT_COUNT = 6;
    function populateSlots() {
      var box = $('[data-hub-slot="save-slots"]');
      if (!box) return;
      box.innerHTML = '<p class="sc-empty">Memuat slot…</p>';
      VNHub.getSaveSlots().then(function (slots) {
        box.innerHTML = '';
        for (var i = 1; i <= SLOT_COUNT; i++) {
          var info = (slots || []).filter(function (s) { return s.slotId === i; })[0];
          var empty = !info || info.isEmpty;
          var card = document.createElement('div');
          card.className = 'sc-slot' + (empty ? ' empty' : '');
          card.innerHTML = '<div class="sc-slot-title">Slot ' + i + '</div>' +
            '<div class="sc-slot-info">' + (empty ? 'Kosong' : (esc(info.chapter || 'Tersimpan') + ' — ' + esc(info.date || '')) ) + '</div>';
          if (!empty) {
            (function (slotId) { card.addEventListener('click', function () { VNHub.loadGame(slotId); }); })(info.slotId);
          }
          box.appendChild(card);
        }
      }).catch(function () { box.innerHTML = '<p class="sc-empty">Gagal memuat slot.</p>'; });
    }

    // Tombol "Lanjutkan": muncul bila ada save; memuat yang terbaru.
    var latestSlotId = null;
    function refreshResume() {
      var resumeBtn = $('[data-hub-nav="resume"]');
      if (!resumeBtn) return;
      VNHub.getSaveSlots().then(function (slots) {
        var filled = (slots || []).filter(function (s) { return !s.isEmpty; });
        filled.sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });
        if (filled.length) { latestSlotId = filled[0].slotId; resumeBtn.hidden = false; }
        else { latestSlotId = null; resumeBtn.hidden = true; }
      }).catch(function () {});
    }
    function resumeLatest() { if (latestSlotId != null) VNHub.loadGame(latestSlotId); }

    // ================= PENGATURAN (VNHub.settings) =================
    function fmt(key, val) {
      if (key === 'bgm' || key === 'voice' || key === 'sfx') return Math.round(val * 100) + '%';
      if (key === 'textSpeed') return val + 'ms';
      if (key === 'autoDelay') return (val / 1000).toFixed(1) + 's';
      return String(val);
    }
    function renderSettings() {
      var s = VNHub.settings.getAll() || {};
      $$('[data-hub-set]').forEach(function (input) {
        var key = input.getAttribute('data-hub-set');
        if (key === 'fullscreen') return;
        var raw = s[key];
        var sliderVal = (key === 'bgm' || key === 'voice' || key === 'sfx') ? Math.round((raw || 0) * 100) : raw;
        if (sliderVal != null) input.value = sliderVal;
        var label = $('[data-hub-val="' + key + '"]');
        if (label && raw != null) label.textContent = fmt(key, raw);
      });
    }
    $$('[data-hub-set]').forEach(function (input) {
      var key = input.getAttribute('data-hub-set');
      if (key === 'fullscreen') {
        input.addEventListener('change', function () { VNHub.settings.setFullscreen(input.checked); });
        return;
      }
      input.addEventListener('input', function () {
        var num = Number(input.value);
        var value = (key === 'bgm' || key === 'voice' || key === 'sfx') ? num / 100 : num;
        VNHub.settings.set(key, value);
        var label = $('[data-hub-val="' + key + '"]');
        if (label) label.textContent = fmt(key, value);
        if (key === 'bgm') VNHub.setBGMVolume(value); // pratinjau langsung BGM menu
      });
    });

    // ================= Lifecycle & storage (demonstrasi) =================
    // Hitung berapa kali hub ini dibuka (penyimpanan persisten per-novel).
    try {
      var visits = (VNHub.storage.get('hubVisits', 0) || 0) + 1;
      VNHub.storage.set('hubVisits', visits);
      console.log('[Showcase Hub] Kunjungan ke-' + visits);
    } catch (e) { /* storage opsional */ }

    // Saat pemain kembali dari chapter: segarkan slot & tombol Lanjutkan.
    VNHub.onChapterReturn(function () { refreshResume(); });

    // Init awal.
    refreshResume();
  });

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
})();
