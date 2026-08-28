/**
 * mediaPreview.js — SATU updater pratinjau media untuk kartu naskah Story.
 *
 * Kenapa berkas sendiri (UX-A05): fungsi ini dulu menumpang di `hubEditor.js`
 * padahal pemakainya cuma `scriptEditor.js`. Selain menyesatkan, ia jadi mudah
 * "drift": markup sprite pindah ke `.sprite-anim-wrapper > img.sprite-anim-img`,
 * sementara updater-nya masih mencari `.image-preview` — pencarian gagal, fungsi
 * keluar diam-diam, dan Browse/ketik/clear tak pernah memperbarui thumbnail
 * maupun blok "Konfigurasi Animasi". Tampilan awal tetap benar karena markup
 * pertama sudah dirender dari data di disk, jadi bug ini hanya kelihatan saat
 * kartu disentuh — dua jalur yang wajib diuji terpisah.
 *
 * Aturan yang dipegang di sini:
 *   - target dicari lewat `data-preview-for`, BUKAN kelas visual yang gampang
 *     berubah saat markup dirapikan;
 *   - pencarian dikurung ke `.sprite-config-container` asal, karena key sprite
 *     yang sama (`sprite`, `spriteCenter`, …) muncul di banyak kartu sekaligus;
 *   - satu tempat yang mengatur `src`, status error, kelas `visible`, dan
 *     visibilitas `.animation-controls`.
 */
(function () {
    'use strict';

    // Basis path aset chapter yang sedang dibuka. Cache-buster dipakai supaya
    // mengganti file dengan NAMA SAMA tetap kelihatan (browser caching agresif).
    function assetSrc(filename, bustCache) {
        var novel = (window.currentlyEditing && currentlyEditing.novel) || '';
        var chapter = (window.currentlyEditing && currentlyEditing.chapter) || '';
        var base = './visual_novels/' + novel + '/' + chapter + '/' + filename;
        return bustCache ? (base + '?v=' + Date.now()) : base;
    }

    function isVideoSprite(filename) {
        return /\.(mp4|webm|ogv|mov|m4v)(?:[?#].*)?$/i.test(String(filename || ''));
    }

    // Pertahankan satu kelas preview untuk <img> dan <video>, tetapi ganti tag
    // saat jenis file berubah. Dengan begitu event input yang sama bisa langsung
    // menampilkan video, tanpa menjadikan editor harus memilih "mode sprite" dulu.
    function ensurePreviewSurface(wrapper, filename) {
        var current = wrapper.querySelector('.sprite-anim-img');
        if (!current) return null;
        var wantedTag = isVideoSprite(filename) ? 'VIDEO' : 'IMG';
        if (current.tagName === wantedTag) return current;

        var replacement = document.createElement(wantedTag.toLowerCase());
        replacement.className = current.className;
        if (wantedTag === 'VIDEO') {
            replacement.muted = true;
            replacement.loop = true;
            replacement.playsInline = true;
            replacement.preload = 'metadata';
        }
        current.replaceWith(replacement);
        return replacement;
    }

    // Baris keterangan selebar container, DITARUH PALING BAWAH. Sengaja di bawah
    // `.animation-controls` supaya susunan dua-kolom (thumbnail | konfigurasi)
    // tidak ikut bergeser begitu ada badge atau pesan error.
    function noteRow(spriteContainer, create) {
        var row = spriteContainer.querySelector('.sprite-preview-note');
        if (!row && create) {
            row = document.createElement('div');
            row.className = 'sprite-preview-note';
            spriteContainer.appendChild(row);
        }
        return row || null;
    }

    function dropNoteIfEmpty(row) {
        if (row && !row.childElementCount) row.remove();
    }

    // Pesan error thumbnail — muncul saat nama file diisi tapi gambarnya tak bisa dimuat.
    function setSpriteError(spriteContainer, message) {
        var row = noteRow(spriteContainer, !!message);
        if (!row) return;
        var el = row.querySelector('.sprite-preview-error');
        if (!message) {
            if (el) el.remove();
            dropNoteIfEmpty(row);
            return;
        }
        if (!el) {
            el = document.createElement('span');
            el.className = 'sprite-preview-error';
            row.appendChild(el);
        }
        el.textContent = message;
    }

    // Badge jumlah layer tambahan pada slot sprite berlapis. Thumbnail tetap
    // menampilkan layer DASAR — komposit semua layer adalah pekerjaan terpisah,
    // jadi badge ini yang mencegah "sprite berlapis" tampak seperti satu gambar.
    /**
     * Gambar layer tambahan BERTUMPUK di atas thumbnail dasar.
     *
     * Sebelumnya thumbnail hanya memperlihatkan layer dasar dan badge-nya berkata
     * "N layer digambar di atasnya saat runtime" — jadi kreator yang memisahkan
     * pose dan ekspresi tak pernah melihat hasil gabungannya sampai novelnya
     * dijalankan. Menumpuknya di sini murah: ukuran kanvas tiap layer memang sama,
     * jadi menimpanya di kotak yang sama sudah setara dengan yang dilakukan runtime.
     *
     * Layer yang gagal dimuat DISEMBUNYIKAN, bukan dibiarkan jadi ikon rusak: ikon
     * rusak yang menumpuk di atas wajah karakter membuat thumbnail tak terbaca sama
     * sekali, padahal yang salah cuma satu nama berkas.
     */
    function ensureLayerPreview(item, filename) {
        var preview = item.querySelector('.sprite-layer-preview');
        if (!preview) {
            preview = document.createElement('div');
            preview.className = 'sprite-layer-preview';
            preview.title = 'Preview aset layer tambahan ini.';
            item.insertBefore(preview, item.firstChild);
        }
        var surface = preview.querySelector('.sprite-layer-preview-surface');
        var wantedTag = isVideoSprite(filename) ? 'VIDEO' : 'IMG';
        if (!surface || surface.tagName !== wantedTag) {
            var replacement = document.createElement(wantedTag.toLowerCase());
            replacement.className = 'sprite-layer-preview-surface';
            replacement.alt = 'Preview layer tambahan';
            if (wantedTag === 'VIDEO') {
                replacement.muted = true;
                replacement.loop = true;
                replacement.playsInline = true;
                replacement.preload = 'metadata';
            }
            if (surface) surface.replaceWith(replacement);
            else preview.insertBefore(replacement, preview.firstChild);
            surface = replacement;
        }
        var placeholder = preview.querySelector('.sprite-layer-preview-placeholder');
        if (!placeholder) {
            placeholder = document.createElement('span');
            placeholder.className = 'sprite-layer-preview-placeholder';
            placeholder.textContent = 'Preview layer';
            preview.appendChild(placeholder);
        }
        return { preview: preview, surface: surface };
    }

    function syncLayerPreview(input) {
        var item = input.closest('.sprite-layer-item');
        if (!item) return;
        var filename = input.value.trim();
        var result = ensureLayerPreview(item, filename);
        var preview = result.preview;
        var surface = result.surface;

        if (!filename) {
            surface.removeAttribute('src');
            if (surface.tagName === 'VIDEO' && typeof surface.load === 'function') surface.load();
            surface.classList.remove('gagal');
            if (surface.dataset.layerAnim) surface.classList.remove(surface.dataset.layerAnim);
            delete surface.dataset.layerAnim;
            preview.classList.remove('visible');
            return;
        }

        surface.classList.remove('gagal');
        surface.onload = function () { preview.classList.add('visible'); };
        surface.onloadeddata = function () {
            preview.classList.add('visible');
            var playback = surface.play();
            if (playback && typeof playback.catch === 'function') playback.catch(function () {});
        };
        surface.onerror = function () {
            surface.classList.add('gagal');
            preview.classList.remove('visible');
        };
        surface.src = assetSrc(filename, true);

        // Thumbnail mandiri tidak memakai transform runtime, tetapi tetap memutar
        // preset agar pilihan animasi layer punya umpan balik langsung di editor.
        var selected = item.querySelector('.sprite-layer-anim');
        var anim = String(selected ? selected.value : '').trim();
        var nextClass = /^anim-[A-Za-z0-9_-]+$/.test(anim) ? 'editor-' + anim : '';
        var previousClass = surface.dataset.layerAnim || '';
        if (previousClass && previousClass !== nextClass) surface.classList.remove(previousClass);
        if (nextClass && previousClass !== nextClass) {
            void surface.offsetWidth;
            surface.classList.add(nextClass);
        }
        if (nextClass) surface.dataset.layerAnim = nextClass;
        else delete surface.dataset.layerAnim;
    }

    function syncLayerPreviews(spriteContainer) {
        spriteContainer.querySelectorAll('.sprite-layers-container .sprite-layer-src')
            .forEach(syncLayerPreview);
    }

    function clearLegacyLayerOverlays(spriteContainer) {
        // Preview editor sekarang dipisahkan per kartu layer; hapus sisa overlay
        // dari markup lama bila editor dibuka ulang tanpa reload penuh.
        var wrapper = spriteContainer.querySelector('.sprite-anim-wrapper');
        if (wrapper) wrapper.querySelectorAll('.sprite-layer-overlay').forEach(function (el) { el.remove(); });
    }

    function syncBaseVisibility(spriteContainer) {
        var wrapper = spriteContainer.querySelector('.sprite-anim-wrapper');
        var surface = wrapper && wrapper.querySelector('.sprite-anim-img');
        if (!surface) return;
        // Preview dasar sengaja selalu mandiri. `hideBase` adalah perilaku timeline
        // runtime dan tidak boleh mengosongkan thumbnail yang dipakai memilih pose.
        surface.classList.remove('sprite-base-hidden');
    }

    function syncLayerBadge(spriteContainer) {
        clearLegacyLayerOverlays(spriteContainer);
        syncLayerPreviews(spriteContainer);
        syncBaseVisibility(spriteContainer);
        var jumlah = 0;
        spriteContainer.querySelectorAll('.sprite-layers-container .sprite-layer-src')
            .forEach(function (input) { if (input.value.trim()) jumlah++; });

        var row = noteRow(spriteContainer, jumlah > 0);
        if (!row) return;
        var badge = row.querySelector('.sprite-layer-badge');
        if (!jumlah) {
            if (badge) badge.remove();
            dropNoteIfEmpty(row);
            return;
        }
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'sprite-layer-badge';
            row.insertBefore(badge, row.firstChild);
        }
        badge.textContent = '🧅 +' + jumlah + ' layer';
        badge.title = jumlah + ' layer tambahan memiliki preview aset masing-masing di kartu konfigurasi.';
    }

    /**
     * Perbarui thumbnail sprite satu slot beserta blok konfigurasinya.
     * @param {HTMLInputElement} inputElement input teks nama file (base layer)
     * @param {HTMLElement} spriteContainer `.sprite-config-container` milik slot itu
     */
    function updateSpritePreview(inputElement, spriteContainer) {
        // Kurung pencarian ke container asal: dua kartu bisa punya key sprite sama,
        // dan `document.querySelector` akan memperbarui kartu yang salah.
        var wrapper = spriteContainer.querySelector('.sprite-anim-wrapper');
        var previewImage = wrapper ? wrapper.querySelector('.sprite-anim-img') : null;
        var animationControls = spriteContainer.querySelector('.animation-controls');
        if (!wrapper || !previewImage) return;

        var filename = inputElement.value.trim();
        previewImage = ensurePreviewSurface(wrapper, filename);
        if (!previewImage) return;
        // `ensurePreviewSurface` dapat mengganti IMG ↔ VIDEO. Visibility base
        // harus dipasang SESUDAH penggantian agar toggle langsung terlihat saat
        // input pertama kali diisi atau media berganti jenis.
        syncBaseVisibility(spriteContainer);

        if (!filename) {
            previewImage.removeAttribute('src');
            if (previewImage.tagName === 'VIDEO') previewImage.load();
            wrapper.classList.remove('visible');
            setSpriteError(spriteContainer, '');
            if (animationControls) animationControls.style.display = 'none';
            syncLayerBadge(spriteContainer);
            return;
        }

        var onLoaded = function () {
            wrapper.classList.add('visible');
            setSpriteError(spriteContainer, '');
            if (previewImage.tagName === 'VIDEO') {
                var playback = previewImage.play();
                if (playback && typeof playback.catch === 'function') playback.catch(function () {});
            }
        };
        previewImage.onerror = function () {
            wrapper.classList.remove('visible');
            setSpriteError(spriteContainer, 'File "' + filename + '" tidak ditemukan atau tidak dapat diputar.');
        };
        if (previewImage.tagName === 'VIDEO') previewImage.onloadeddata = onLoaded;
        else previewImage.onload = onLoaded;
        previewImage.src = assetSrc(filename, true);

        // Kontrol animasi mengikuti ADA/TIDAKNYA nilai, bukan berhasil/gagalnya
        // gambar dimuat — kreator boleh mengisi nama file yang belum disalin.
        if (animationControls) animationControls.style.display = 'flex';
        syncLayerBadge(spriteContainer);
    }

    /** Background chapter (Fase / Label / Scene bertipe gambar). */
    function updateBackgroundPreview(inputElement, backgroundEditorContainer) {
        var previewContainer = backgroundEditorContainer.querySelector('.image-preview-container-16-9');
        var modeOptions = backgroundEditorContainer.querySelector('.background-mode-options');
        var previewImage = backgroundEditorContainer.querySelector('.image-preview');
        var placeholder = backgroundEditorContainer.querySelector('.preview-placeholder');

        if (!previewContainer || !previewImage || !placeholder) return;

        var filename = inputElement.value.trim();
        if (filename) {
            previewImage.src = assetSrc(filename, true);
            previewImage.style.display = 'block';
            placeholder.style.display = 'none';
            previewContainer.style.display = 'flex';
            if (modeOptions) modeOptions.style.display = 'flex';
            previewImage.onerror = function () {
                previewImage.style.display = 'none';
                placeholder.style.display = 'flex';
                placeholder.textContent = 'Error: File "' + filename + '" tidak ditemukan.';
            };
        } else {
            previewImage.src = '';
            previewImage.style.display = 'none';
            placeholder.style.display = 'flex';
            placeholder.textContent = 'Pilih gambar...';
            previewContainer.style.display = 'none';
            if (modeOptions) modeOptions.style.display = 'none';
        }
    }

    /**
     * Titik masuk tunggal: dipanggil scriptEditor saat input `.image-input`
     * berubah (Browse, ketik manual, tombol clear) dan sekali saat naskah dimuat.
     */
    function updateImagePreviewUI(inputElement) {
        if (!inputElement) return;

        var backgroundEditorContainer = inputElement.closest(
            '.phase-assets > div, .scene-input-group[data-scene-type="image"], .label-group-header'
        );
        if (backgroundEditorContainer) {
            updateBackgroundPreview(inputElement, backgroundEditorContainer);
            return;
        }

        // Sprite: blok konfigurasinya adalah sibling tepat setelah grup input file.
        // Berlaku untuk slot kiri/tengah/kanan MAUPUN sprite custom, karena keduanya
        // memakai susunan markup yang sama.
        var spriteGroup = inputElement.closest('.file-input-group');
        var spriteContainer = spriteGroup && spriteGroup.nextElementSibling &&
            spriteGroup.nextElementSibling.classList.contains('sprite-config-container')
            ? spriteGroup.nextElementSibling
            : null;
        if (spriteContainer) {
            updateSpritePreview(inputElement, spriteContainer);
            return;
        }

        // Input layer tambahan punya thumbnail mandiri di kartu layernya; badge
        // slot induk tetap disegarkan agar jumlahnya segera akurat.
        var layerHost = inputElement.closest('.sprite-config-container');
        if (layerHost && inputElement.classList.contains('sprite-layer-src')) {
            syncLayerBadge(layerHost);
        }
    }

    window.updateImagePreviewUI = updateImagePreviewUI;

    /**
     * Segarkan badge layer sebuah slot tanpa menyentuh thumbnail-nya. Dipakai
     * assetManager saat baris layer DIHAPUS — penghapusan tak memicu event `input`,
     * jadi tanpa ini badge akan menyisakan hitungan yang sudah tidak benar.
     */
    window.refreshSpriteLayerBadge = function (host) {
        var spriteContainer = host && host.closest ? host.closest('.sprite-config-container') : null;
        if (spriteContainer) syncLayerBadge(spriteContainer);
    };
})();
