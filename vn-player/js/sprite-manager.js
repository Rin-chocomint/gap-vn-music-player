/**
 * VN Player — Sprite Manager
 * Pengelolaan karakter sprite: positioning, animasi, responsif scaling.
 * Mendukung mode auto (flexbox) dan custom (absolute).
 */

const VNSprites = (() => {
    const { dom, state } = VNState;

    // === FOKUS BICARA (G2 irisan b) ===
    // Nilai `spriteFocus` = nama FIELD yang memegang sprite yang bicara
    // ('sprite' | 'sprite2' | 'spriteCenter'), atau id slot custom. SENGAJA bukan
    // 'left'/'right': pemetaan slot legacy terbalik (right = `sprite`,
    // left = `sprite2`), jadi memakai nama field membuat JSON entri berbunyi sama
    // dengan apa yang ditulis kreator di slotnya.
    const FOCUS_DIM_DEFAULT = 'var(--vn-sprite-dim, .55)';

    // SATU string, dipakai di KEDUA cabang transition container di
    // updateCharacterSprite(). Kalau hanya ditulis di cabang ber-`spriteTransition`,
    // redup akan mulus di sebagian entri dan menyentak di sisanya — satu fitur, dua
    // perilaku (anatomi B1, pelajaran yang sama dengan fade audio di dua jalur).
    const FOCUS_TRANSITION = 'filter var(--vn-sprite-focus-dur, .25s) ease, ' +
        'scale var(--vn-sprite-focus-dur, .25s) ease';

    /**
     * Aturan id slot custom — SATU tempat. Editor harus menawarkan id yang PERSIS
     * sama di dropdown fokus; kalau rumusnya menyimpang, dropdown menawarkan target
     * yang tak pernah ada di DOM (kelas §A: opsi cantik yang tak dibaca siapa pun).
     * Dijaga kontrak smoke dua arah.
     *
     * `index` adalah indeks di array `charSprites` UTUH (bukan hasil filter) —
     * runtime menghitungnya begitu, jadi editor wajib ikut.
     */
    function customSlotId(spriteData, index) {
        return (spriteData && spriteData.id) || `dynamic-sprite-${index}`;
    }

    // === POSISI PANGGUNG BERNAMA (G2 irisan a) ===
    let _posTakSahDilapor = false;

    /**
     * Ubah nilai posisi X entri menjadi nilai CSS.
     *
     * ANGKA → persen, PERSIS seperti sebelumnya (nol migrasi: 42.9k entri shipped
     * memakai angka). STRING → nama posisi panggung, ditulis sebagai `var()` supaya
     * **browser** yang me-resolve — bukan tabel lookup di JS. Konsekuensinya yang
     * membuat pendekatan ini murah: `theme.css` kreator bisa menimpa `--vn-pos-right`
     * dan SEMUA entri yang memakai nama itu bergeser sekaligus, sementara editor
     * memindai nama yang sama untuk mengisi dropdown. Satu kebenaran, tiga konsumen.
     *
     * Fallback 50% dipakai bila namanya tak dideklarasikan di CSS mana pun — sprite
     * tetap tampil di tengah alih-alih kehilangan `left` sama sekali.
     *
     * @returns {string|null} nilai CSS siap pakai, atau null = "tanpa posisi custom"
     *          (pemanggil memakai jalur slot preset seperti biasa).
     */
    function resolvePositionX(posisi) {
        if (posisi === null || posisi === undefined) return null;
        if (typeof posisi === 'number') return isFinite(posisi) ? `${posisi}%` : null;

        const teks = String(posisi).trim();
        if (!teks) return null;
        // Angka dalam bentuk string (lazim di hasil sunting tangan) tetap dibaca persen —
        // bukan diperlakukan sebagai nama `--vn-pos-72`.
        if (isFinite(Number(teks))) return `${Number(teks)}%`;

        const nama = teks.toLowerCase();
        if (!/^[a-z0-9-]+$/.test(nama)) {
            // Nilai tak masuk akal jangan diteruskan ke CSSOM (declaration akan
            // dibuang senyap dan slot kehilangan posisinya). §5(c): telan efeknya,
            // jangan telan informasinya.
            if (!_posTakSahDilapor) {
                _posTakSahDilapor = true;
                console.warn(`[VN Sprite] Posisi X "${teks}" bukan angka maupun nama yang sah ` +
                    `(huruf/angka/tanda hubung) — posisi custom dilewati.`);
            }
            return null;
        }
        return `var(--vn-pos-${nama}, 50%)`;
    }

    /**
     * Membangun base slot sprite dinamis berdasarkan konfigurasi (default 5).
     * Memetakan slot klasik (Kiri, Tengah, Kanan) ke indeks tengah-tengah untuk backward compatibility.
     */
    function setupSpriteSlots(count = 5, force = false) {
        if (!dom.charSpritesLayer) return;
        count = parseInt(count, 10);
        if (!Number.isFinite(count) || count < 1) count = 5;

        // Hot config sering mengirim jumlah yang sama (termasuk setiap toggle
        // override). Mem-buang seluruh layer lalu membuat div/img identik hanya
        // menghasilkan detached DOM di Oilpan dan juga menghapus sprite yang sedang
        // tampil. Pertahankan identity node selama struktur base masih utuh.
        const baseSlots = Array.from(dom.charSpritesLayer.children).filter((el) =>
            el.classList && el.classList.contains('char-sprite-slot') &&
            el.dataset.dynamic !== 'true'
        );
        const structureMatches = baseSlots.length === count &&
            baseSlots.every((el) => !!el.querySelector('.char-sprite-img'));
        if (!force && dom.charSpritesLayer.dataset.vnSpriteSlotCount === String(count) && structureMatches) {
            return false;
        }

        dom.charSpritesLayer.innerHTML = '';
        
        for (let i = 1; i <= count; i++) {
            const slotDiv = document.createElement('div');
            slotDiv.id = `char-sprite-slot-${i}`;
            slotDiv.className = 'char-sprite-slot sprite-container';
            slotDiv.dataset.slotIndex = i;
            
            const img = document.createElement('img');
            img.id = `char-sprite-img-${i}`;
            img.className = 'char-sprite-img';
            img.alt = `Character Slot ${i}`;
            
            slotDiv.appendChild(img);
            dom.charSpritesLayer.appendChild(slotDiv);
        }

        // Backward Compatibility Mapping:
        // Jika 5 slot: Kiri=2, Tengah=3, Kanan=4
        // Jika 3 slot: Kiri=1, Tengah=2, Kanan=3
        const leftIdx = count >= 5 ? 2 : 1;
        const centerIdx = Math.ceil(count / 2);
        const rightIdx = count >= 5 ? count - 1 : count;

        const leftSlot = document.getElementById(`char-sprite-slot-${leftIdx}`);
        if(leftSlot) { leftSlot.id = 'char-sprite-slot-left'; leftSlot.dataset.slot = 'left'; }
        
        const rightSlot = document.getElementById(`char-sprite-slot-${rightIdx}`);
        if(rightSlot) { rightSlot.id = 'char-sprite-slot-right'; rightSlot.dataset.slot = 'right'; }
        
        const centerSlot = document.getElementById(`char-sprite-slot-${centerIdx}`);
        if(centerSlot) { centerSlot.id = 'char-sprite-slot-center'; centerSlot.dataset.slot = 'center'; }

        // Update DOM references di VNState agar logika lama tetap jalan
        dom.charSprite1 = document.getElementById(`char-sprite-img-${rightIdx}`); // Legacy 'right' is charSprite1
        dom.charSprite2 = document.getElementById(`char-sprite-img-${leftIdx}`); // Legacy 'left' is charSprite2
        dom.charSpriteCenter = document.getElementById(`char-sprite-img-${centerIdx}`);
        
        // Backward compatibility alias
        dom.characterSprite = dom.charSprite1;
        dom.characterSprite2 = dom.charSprite2;
        dom.characterSpriteCenter = dom.charSpriteCenter;
        dom.charSpritesLayer.dataset.vnSpriteSlotCount = String(count);
        return true;
    }

    // Hitung faktor skala responsif
    function getResponsiveScaleFactor() {
        const ratio = window.innerHeight / state.REFERENCE_HEIGHT;
        return Math.max(0.5, Math.min(1.0, ratio));
    }

    // Update CSS variable untuk responsive scale
    function updateResponsiveScaling() {
        state.currentResponsiveScale = getResponsiveScaleFactor();
        document.documentElement.style.setProperty('--responsive-scale', state.currentResponsiveScale);
    }

    // Refresh scale semua sprite slot aktif
    function refreshSpriteScales() {
        const allSlots = document.querySelectorAll('.char-sprite-slot');
        const isAuto = dom.charSpritesLayer && dom.charSpritesLayer.classList.contains('mode-auto');

        allSlots.forEach(container => {
            const img = container.querySelector('.char-sprite-img');
            if (!img || !img.classList.contains('visible')) return;

            const originalScale = parseFloat(container.dataset.originalScale || '1');
            const effectiveScale = originalScale * state.currentResponsiveScale;

            if (isAuto) {
                container.style.transform = `scale(${effectiveScale})`;
            } else {
                const isCenter = container.id === 'char-sprite-slot-center' || container.dataset.slot === 'center';
                const hasCustomPos = container.style.getPropertyValue('--sprite-x-offset');

                if (hasCustomPos) {
                    container.style.transform = `translateX(-50%) scale(${effectiveScale})`;
                } else if (isCenter) {
                    container.style.transform = `translateX(-55%) scale(${effectiveScale})`;
                } else {
                    container.style.transform = `scale(${effectiveScale})`;
                }
            }
        });
    }

    /**
     * Normalisasi metadata overlay. Array sumber layer tetap hidup di `sprite`,
     * sedangkan `spriteLayerSettings` hanya menambah waktu tampil, transform,
     * dan animasi pada overlay. Posisi panggung tetap milik slot sprite dasar.
     * Konfigurasi default menghasilkan fingerprint kosong supaya entry/script lama
     * tidak memicu render ulang maupun menambah data baru saat disimpan kembali.
     */
    function normalizeLayerSettings(settings, count) {
        const source = Array.isArray(settings) ? settings : [];
        const values = [];
        let hasCustomValue = false;
        for (let i = 0; i < count; i++) {
            const raw = (source[i] && typeof source[i] === 'object') ? source[i] : {};
            const numberInRange = (value, min, max) => {
                const parsed = Number(value);
                return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : 0;
            };
            const numberOrDefault = (value, min, max, fallback) => {
                const parsed = Number(value);
                return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
            };
            const animation = String(raw.anim || '').trim();
            const setting = {
                delay: numberInRange(raw.delay, 0, 60000),
                offsetX: numberInRange(raw.offsetX, -100, 100),
                offsetY: numberInRange(raw.offsetY, -100, 100),
                scale: numberOrDefault(raw.scale, 0, 300, 100),
                rotation: numberInRange(raw.rotation, -360, 360),
                opacity: numberOrDefault(raw.opacity, 0, 100, 100),
                flipX: raw.flipX === true,
                hideBase: raw.hideBase === true,
                anim: /^anim-[A-Za-z0-9_-]+$/.test(animation) ? animation : ''
            };
            if (setting.delay || setting.offsetX || setting.offsetY ||
                setting.scale !== 100 || setting.rotation || setting.opacity !== 100 ||
                setting.flipX || setting.hideBase || setting.anim) hasCustomValue = true;
            values.push(setting);
        }
        return {
            values,
            fingerprint: hasCustomValue ? JSON.stringify(values) : ''
        };
    }

    function cancelOverlayDelay(overlay) {
        if (overlay && overlay._vnShowTimer) {
            clearTimeout(overlay._vnShowTimer);
            overlay._vnShowTimer = null;
        }
    }

    function cancelOverlayDelays(container) {
        if (!container) return;
        container.querySelectorAll('.char-sprite-overlay').forEach(cancelOverlayDelay);
    }

    // Kelas animasi baru dipasang saat layer benar-benar terlihat. Menambahnya
    // ketika node masih `is-delayed` membuat one-shot selesai di balik opacity:0.
    // Pemisahan ini juga menjamin loop pertama selalu dimulai dari frame awal.
    function startOverlayAnimation(surface, animation) {
        if (!surface || !animation) return;
        surface.classList.remove(animation);
        void surface.offsetWidth;
        surface.classList.add(animation);
    }

    /**
     * Sinkronkan layer overlay multi-layer sprite (findings §10).
     * `layers` = array path SETELAH layer dasar (dasar dirender img utama).
     * Metadata per-index mengatur offset (% ukuran layer), transform, animasi,
     * dan delay sesudah base sprite terekspos. Tiga node dipakai agar transform
     * posisi/scale tidak pernah ditimpa keyframe animasi. Timer selalu milik node
     * overlay agar penggantian slot dapat membatalkan timer lama tanpa menimpa
     * entry berikutnya.
     */
    function _syncOverlays(spriteElement, overlayUrls, layerSettings, legacyBaseHidden = false) {
        const container = spriteElement.parentElement;
        if (!container) return;
        container.querySelectorAll('.char-sprite-overlay').forEach(el => {
            cancelOverlayDelay(el);
            el.remove();
        });
        const urls = overlayUrls || [];
        const settings = normalizeLayerSettings(layerSettings, urls.length).values;
        // Setiap sinkronisasi memulai ulang timeline komposit. Base lama harus
        // terlihat lagi sampai layer penimpa yang menandainya benar-benar tiba.
        // `legacyBaseHidden` hanya menjaga script dari versi awal fitur ini.
        spriteElement.classList.toggle('base-hidden', legacyBaseHidden === true);
        urls.forEach((url, i) => {
            const ov = document.createElement('div');
            const config = settings[i];
            ov.className = 'char-sprite-overlay';
            ov.style.setProperty('--sprite-layer-offset-x', config.offsetX + '%');
            ov.style.setProperty('--sprite-layer-offset-y', config.offsetY + '%');
            const transform = document.createElement('div');
            transform.className = 'char-sprite-overlay-transform';
            transform.style.setProperty('--sprite-layer-scale', String(config.scale / 100));
            transform.style.setProperty('--sprite-layer-rotation', config.rotation + 'deg');
            transform.style.setProperty('--sprite-layer-opacity', String(config.opacity / 100));
            transform.style.setProperty('--sprite-layer-flip-x', config.flipX ? '-1' : '1');
            const surface = document.createElement(isVideoSprite(url) ? 'video' : 'img');
            surface.className = 'char-sprite-overlay-surface';
            surface.alt = `overlay-${i + 1}`;
            if (surface.tagName === 'VIDEO') {
                surface.muted = true;
                surface.loop = true;
                surface.playsInline = true;
                surface.preload = 'metadata';
                surface.onloadeddata = () => {
                    const playback = surface.play();
                    if (playback && typeof playback.catch === 'function') playback.catch(() => {});
                };
            }
            surface.src = resolveAssetPath(url);
            transform.appendChild(surface);
            ov.appendChild(transform);
            container.appendChild(ov);

            if (config.delay > 0) {
                ov.classList.add('is-delayed');
                ov._vnShowTimer = setTimeout(() => {
                    if (!ov.isConnected) return;
                    ov.classList.remove('is-delayed');
                    startOverlayAnimation(surface, config.anim);
                    // Hide mengikuti momen layer tampak, bukan momen entri
                    // mulai. Timer ikut dibatalkan bila slot/layer diganti.
                    if (config.hideBase) spriteElement.classList.add('base-hidden');
                    ov._vnShowTimer = null;
                }, config.delay);
            } else {
                startOverlayAnimation(surface, config.anim);
                if (config.hideBase) spriteElement.classList.add('base-hidden');
            }
        });
    }

    const VIDEO_SPRITE_EXTENSIONS = /\.(mp4|webm|ogv|mov|m4v)(?:[?#].*)?$/i;

    function isVideoSprite(url) {
        return VIDEO_SPRITE_EXTENSIONS.test(String(url || ''));
    }

    function normalizeChromaKey(config) {
        if (!config || typeof config !== 'object' || config.enabled !== true) return null;
        const color = /^#[0-9a-f]{6}$/i.test(String(config.color || ''))
            ? String(config.color) : '#00ff00';
        const parsedTolerance = Number(config.tolerance);
        return {
            enabled: true,
            color,
            tolerance: Math.max(0, Math.min(255, Number.isFinite(parsedTolerance) ? parsedTolerance : 45))
        };
    }

    function cancelSpriteDelay(spriteElement) {
        if (spriteElement && spriteElement._vnShowTimer) {
            clearTimeout(spriteElement._vnShowTimer);
            spriteElement._vnShowTimer = null;
        }
    }

    function stopChromaRenderer(spriteElement) {
        if (!spriteElement) return;
        cancelSpriteDelay(spriteElement);
        if (spriteElement._vnChromaFrame) {
            cancelAnimationFrame(spriteElement._vnChromaFrame);
            spriteElement._vnChromaFrame = null;
        }
        const source = spriteElement._vnChromaSource;
        if (source && source.tagName === 'VIDEO') {
            source.pause();
            source.removeAttribute('src');
            source.load();
        }
        if (source && source.parentElement) source.remove();
        spriteElement._vnChromaSource = null;
    }

    function clearSpriteSurface(spriteElement) {
        if (!spriteElement) return;
        stopChromaRenderer(spriteElement);
        if (spriteElement.tagName === 'VIDEO') {
            spriteElement.pause();
            spriteElement.removeAttribute('src');
            spriteElement.load();
        } else if (spriteElement.tagName === 'IMG') {
            spriteElement.removeAttribute('src');
        } else if (spriteElement.tagName === 'CANVAS') {
            const ctx = spriteElement.getContext('2d');
            if (ctx) ctx.clearRect(0, 0, spriteElement.width, spriteElement.height);
        }
    }

    function replaceSpriteSurface(spriteElement, kind) {
        const wantedTag = kind === 'canvas' ? 'CANVAS' : (kind === 'video' ? 'VIDEO' : 'IMG');
        if (spriteElement.tagName === wantedTag) return spriteElement;

        // Surface lama mungkin video/canvas yang masih aktif. Bersihkan sebelum
        // node diganti agar decoder video maupun rAF chroma tidak tertinggal.
        clearSpriteSurface(spriteElement);
        const replacement = document.createElement(wantedTag.toLowerCase());
        replacement.id = spriteElement.id;
        replacement.className = 'char-sprite-img';
        replacement.alt = spriteElement.alt || 'Character Sprite';
        if (wantedTag === 'VIDEO') {
            replacement.muted = true;
            replacement.loop = true;
            replacement.autoplay = true;
            replacement.playsInline = true;
            replacement.preload = 'auto';
        }
        spriteElement.replaceWith(replacement);
        return replacement;
    }

    function _chromaColorParts(hex) {
        return {
            r: parseInt(hex.slice(1, 3), 16),
            g: parseInt(hex.slice(3, 5), 16),
            b: parseInt(hex.slice(5, 7), 16)
        };
    }

    /**
     * Gambar media ke canvas lalu hilangkan piksel yang berada dalam jarak warna
     * key. Algoritmanya sama dengan GIF/Media Overlay, tetapi dibuat lokal per
     * sprite sehingga gambar dan video dapat hidup di slot yang sama.
     */
    function loadChromaSprite(canvas, assetUrl, chromaConfig) {
        stopChromaRenderer(canvas);
        const useVideo = isVideoSprite(assetUrl);
        const source = document.createElement(useVideo ? 'video' : 'img');
        source.className = 'char-sprite-chroma-source';
        if (useVideo) {
            source.muted = true;
            source.loop = true;
            source.autoplay = true;
            source.playsInline = true;
            source.preload = 'auto';
        }
        canvas._vnChromaSource = source;
        canvas.parentElement.appendChild(source);

        const target = _chromaColorParts(chromaConfig.color);
        const toleranceSquared = chromaConfig.tolerance * chromaConfig.tolerance;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        const draw = () => {
            if (canvas._vnChromaSource !== source || !canvas.isConnected) return;
            const width = source.videoWidth || source.naturalWidth || 0;
            const height = source.videoHeight || source.naturalHeight || 0;
            if (!width || !height) {
                if (useVideo) canvas._vnChromaFrame = requestAnimationFrame(draw);
                return;
            }
            if (canvas.width !== width || canvas.height !== height) {
                canvas.width = width;
                canvas.height = height;
            }
            try {
                ctx.clearRect(0, 0, width, height);
                ctx.drawImage(source, 0, 0, width, height);
                const imageData = ctx.getImageData(0, 0, width, height);
                const pixels = imageData.data;
                for (let i = 0; i < pixels.length; i += 4) {
                    const dr = pixels[i] - target.r;
                    const dg = pixels[i + 1] - target.g;
                    const db = pixels[i + 2] - target.b;
                    if ((dr * dr) + (dg * dg) + (db * db) <= toleranceSquared) pixels[i + 3] = 0;
                }
                ctx.putImageData(imageData, 0, 0);
            } catch (error) {
                // Media lokal yang gagal didekode tidak boleh menghentikan render
                // dialogue; event error dari source tetap tersedia untuk inspeksi.
                console.warn('[VN Sprite] Chroma key tidak dapat merender media:', error);
            }
            if (useVideo) canvas._vnChromaFrame = requestAnimationFrame(draw);
        };

        if (useVideo) {
            source.addEventListener('loadeddata', () => {
                const playback = source.play();
                if (playback && typeof playback.catch === 'function') playback.catch(() => {});
                draw();
            }, { once: true });
        } else {
            source.addEventListener('load', draw, { once: true });
        }
        source.src = assetUrl;
        if (!useVideo && source.complete) draw();
    }

    function loadSpriteSurface(spriteElement, assetUrl, chromaConfig) {
        if (spriteElement.tagName === 'CANVAS') {
            loadChromaSprite(spriteElement, assetUrl, chromaConfig);
            return;
        }
        if (spriteElement.tagName === 'VIDEO') {
            spriteElement.src = assetUrl;
            const playback = spriteElement.play();
            if (playback && typeof playback.catch === 'function') playback.catch(() => {});
            return;
        }
        spriteElement.src = assetUrl;
    }

    /**
     * Update sprite karakter individual.
     * `newSpriteUrl` boleh STRING (satu gambar, perilaku lama) atau ARRAY
     * [dasar, ...overlay] — multi-layer (findings §10): layer digambar
     * bertumpuk, cocok untuk sistem pose+ekspresi tanpa ledakan file.
     */
    // Slot sprite yang BELUM dibangun dilaporkan sekali per sesi, bukan per entri —
    // satu chapter memanggil ini ratusan kali.
    let _slotHilangDilapor = false;

    function updateCharacterSprite(spriteElement, newSpriteUrl, newAnimationType, scale = 1, positionX = null, transitionConfig = null, delay = 0, chromaKey = null, layerSettings = null, baseHidden = false) {
        // GALAT PRA-ADA (diperbaiki 2026-07-30): slot sprite di-assign imperatif oleh
        // `setupSpriteSlots()`, jadi sebelum ia jalan `dom.charSprite1/2/Center` bernilai
        // null — dan `null` yang tersimpan di `_domOverride` men-short-circuit stub
        // pelapor (`state.js:188` memakai `key in`, bukan truthiness). Tanpa penjaga ini
        // baris `spriteElement.dataset` di bawah melempar TypeError yang MENG-ABORT sisa
        // `renderContent()` — termasuk kotak dialog, sehingga layar tampak kosong tanpa
        // error yang menjelaskan. Jalur paling terekspos: preview `custom` yang tak
        // mem-push config sehingga `setupSpriteSlots` tak pernah dipanggil.
        //
        // Kebijakan §5(c) tetap dihormati: efeknya ditelan, INFORMASINYA tidak.
        if (!spriteElement) {
            if (!_slotHilangDilapor) {
                _slotHilangDilapor = true;
                console.warn('[VN Sprite] Slot sprite belum dibangun (setupSpriteSlots ' +
                    'belum jalan) — sprite dilewati, sisa entri tetap dirender.');
            }
            return;
        }
        let overlayUrls = null;
        if (Array.isArray(newSpriteUrl)) {
            const layers = newSpriteUrl.filter(u => typeof u === 'string' && u);
            overlayUrls = layers.slice(1);
            newSpriteUrl = layers.length ? JSON.stringify(layers) : null; // kunci deteksi perubahan
            var baseUrl = layers.length ? layers[0] : null;
        } else {
            var baseUrl = newSpriteUrl;
        }
        const previousSpriteUrl = spriteElement.dataset.currentSrc || null;
        const previousAnimation = spriteElement.dataset.currentAnim || null;
        const previousChroma = spriteElement.dataset.currentChroma || '';
        const previousLayerSettings = spriteElement.dataset.currentLayerSettings || '';
        const previousLegacyBaseHidden = spriteElement.dataset.currentBaseHidden === '1';
        const finalAnimation = newAnimationType || 'anim-in-fade';
        const chromaConfig = normalizeChromaKey(chromaKey);
        const chromaFingerprint = chromaConfig ? JSON.stringify(chromaConfig) : '';
        const normalizedLayerSettings = normalizeLayerSettings(layerSettings, overlayUrls ? overlayUrls.length : 0);
        const layerSettingsFingerprint = normalizedLayerSettings.fingerprint;
        const legacyBaseHidden = baseHidden === true;
        const requiredSurface = chromaConfig ? 'canvas' : (isVideoSprite(baseUrl) ? 'video' : 'image');
        const surfaceChanged = !!newSpriteUrl &&
            (spriteElement.tagName !== (requiredSurface === 'canvas' ? 'CANVAS' : requiredSurface === 'video' ? 'VIDEO' : 'IMG'));
        if (surfaceChanged) spriteElement = replaceSpriteSurface(spriteElement, requiredSurface);

        const container = spriteElement.parentElement;
        if (container) {
            container.style.transformOrigin = 'bottom center';

            // Transisi CSS kalau diaktifkan
            if (transitionConfig && transitionConfig.enabled && previousSpriteUrl) {
                const duration = transitionConfig.duration || 500;
                container.style.transition = `transform ${duration}ms ease-out, left ${duration}ms ease-out, right ${duration}ms ease-out, ${FOCUS_TRANSITION}`;
            } else {
                container.style.transition = FOCUS_TRANSITION;
            }

            const isCenter = container.id === 'sprite-container-center' || container.id === 'char-sprite-slot-center' || container.dataset.slot === 'center';
            const isLeft = container.id === 'sprite-container-left' || container.id === 'char-sprite-slot-left' || container.dataset.slot === 'left';
            const isRight = container.id === 'sprite-container-right' || container.id === 'char-sprite-slot-right' || container.dataset.slot === 'right';

            container.dataset.originalScale = scale;
            const isAutoMode = dom.charSpritesLayer && dom.charSpritesLayer.classList.contains('mode-auto');

            if (isAutoMode) {
                const effectiveScale = scale * state.currentResponsiveScale;
                container.style.transform = `scale(${effectiveScale})`;
                container.style.left = '';
                container.style.right = '';
                container.style.paddingLeft = '';
                container.style.paddingRight = '';
            } else {
                const posCss = resolvePositionX(positionX);
                if (posCss !== null) {
                    container.style.setProperty('--sprite-x-offset', posCss);
                    container.style.left = posCss;
                    container.style.right = 'auto';
                    container.style.paddingLeft = '0';
                    container.style.paddingRight = '0';
                    const effectiveScale = scale * state.currentResponsiveScale;
                    container.style.transform = `translateX(-50%) scale(${effectiveScale})`;
                } else {
                    container.style.removeProperty('--sprite-x-offset');
                    const effectiveScale = scale * state.currentResponsiveScale;

                    if (isLeft) {
                        // Padding slot dulu dipakai untuk memberi jarak tepi. Itu
                        // membuat frame slot lebih lebar daripada sprite dasarnya,
                        // sehingga overlay tidak bisa mewarisi kotak dasar dengan
                        // presisi. Geser slotnya langsung agar base dan semua
                        // overlay berbagi frame yang persis sama.
                        container.style.left = '50px';
                        container.style.right = 'auto';
                        container.style.paddingLeft = '0';
                        container.style.paddingRight = '';
                        container.style.transform = `scale(${effectiveScale})`;
                    } else if (isCenter) {
                        container.style.left = '50%';
                        container.style.right = 'auto';
                        container.style.paddingLeft = '';
                        container.style.paddingRight = '';
                        container.style.transform = `translateX(-55%) scale(${effectiveScale})`;
                    } else if (isRight) {
                        container.style.left = 'auto';
                        container.style.right = '50px';
                        container.style.paddingLeft = '';
                        container.style.paddingRight = '0';
                        container.style.transform = `scale(${effectiveScale})`;
                    } else {
                        container.style.left = '50%';
                        container.style.right = 'auto';
                        container.style.paddingLeft = '';
                        container.style.paddingRight = '';
                        container.style.transform = `translateX(-50%) scale(${effectiveScale})`;
                    }
                }
            }
        }

        // Sembunyikan sprite
        if (!newSpriteUrl) {
            cancelSpriteDelay(spriteElement);
            if (previousSpriteUrl) {
                spriteElement.classList.remove('visible');
                if (previousAnimation) spriteElement.classList.remove(previousAnimation);
                spriteElement.classList.add('hide');
            }
            clearSpriteSurface(spriteElement);
            _syncOverlays(spriteElement, [], null, false);
            spriteElement.dataset.currentSrc = '';
            spriteElement.dataset.currentAnim = '';
            spriteElement.dataset.currentChroma = '';
            spriteElement.dataset.currentLayerSettings = '';
            spriteElement.dataset.currentBaseHidden = '';
            spriteElement.classList.remove('base-hidden');
            return spriteElement;
        }
        const isOneShot = finalAnimation.startsWith('anim-oneshot-');
        const sourceChanged = newSpriteUrl !== previousSpriteUrl || previousChroma !== chromaFingerprint || surfaceChanged;
        const layerSettingsChanged = previousLayerSettings !== layerSettingsFingerprint;
        const legacyBaseVisibilityChanged = previousLegacyBaseHidden !== legacyBaseHidden;
        const animationChanged = finalAnimation !== previousAnimation || isOneShot || surfaceChanged;
        // Bila animasi sprite dasar dijalankan ulang, overlay yang punya delay
        // juga harus memulai siklusnya lagi. Overlay tanpa delay tetap dibiarkan
        // utuh agar perubahan animasi loop biasa tidak menciptakan kedipan.
        const hasDelayedOverlay = normalizedLayerSettings.values.some(setting => setting.delay > 0);
        const hasOneShotOverlay = normalizedLayerSettings.values.some(setting =>
            setting.anim.startsWith('anim-oneshot-'));
        // One-shot layer adalah kejadian per-entry, tidak bergantung pada animasi
        // base. Layer delay ikut memulai ulang hanya bila animasi base juga diulang.
        const overlaysChanged = sourceChanged || layerSettingsChanged || legacyBaseVisibilityChanged || hasOneShotOverlay ||
            (animationChanged && hasDelayedOverlay);
        const delayMs = Math.max(0, Math.min(60000, Number(delay) || 0));
        const shouldDelay = delayMs > 0 && (sourceChanged || animationChanged);

        // Bila slot diganti ketika overlay lamanya masih menunggu delay, callback
        // lama tidak boleh muncul di atas sprite baru. Overlay baru dibuat di
        // `reveal`, agar delay sprite dasar tetap menjadi titik awal yang jelas.
        if (overlaysChanged) cancelOverlayDelays(spriteElement.parentElement);

        const reveal = () => {
            if (!spriteElement.isConnected) return;
            if (sourceChanged) {
                loadSpriteSurface(spriteElement, resolveAssetPath(baseUrl), chromaConfig);
            }
            if (overlaysChanged) _syncOverlays(spriteElement, overlayUrls, layerSettings, legacyBaseHidden);

            spriteElement.classList.remove('hide');
            spriteElement.classList.add('visible');
            if (animationChanged) {
                if (previousAnimation) spriteElement.classList.remove(previousAnimation);
                const isEntryAnim = finalAnimation.startsWith('anim-in-');
                const isFirstAppearance = sourceChanged;
                if (!isEntryAnim || isFirstAppearance || !previousAnimation) {
                    void spriteElement.offsetHeight;
                    spriteElement.classList.add(finalAnimation);
                }
            }
            spriteElement.dataset.currentSrc = newSpriteUrl;
            spriteElement.dataset.currentAnim = finalAnimation;
            spriteElement.dataset.currentChroma = chromaFingerprint;
            spriteElement.dataset.currentLayerSettings = layerSettingsFingerprint;
            spriteElement.dataset.currentBaseHidden = legacyBaseHidden ? '1' : '';
            spriteElement._vnShowTimer = null;
        };

        cancelSpriteDelay(spriteElement);
        if (shouldDelay) {
            // Hilangkan surface lama segera; bila timer selesai baru source, chroma,
            // dan kelas animasi baru muncul sebagai satu kejadian yang sinkron.
            spriteElement.classList.remove('visible');
            if (previousAnimation) spriteElement.classList.remove(previousAnimation);
            spriteElement.classList.add('hide');
            spriteElement._vnShowTimer = setTimeout(reveal, delayMs);
        } else {
            reveal();
        }
        return spriteElement;
    }

    /**
     * Proses multi-sprite system dari data payload
     */
    function processCharSprites(data) {
        const spriteMode = data.spriteMode || 'custom';

        if (spriteMode === 'auto') {
            dom.charSpritesLayer.classList.add('mode-auto');
            dom.charSpritesLayer.classList.remove('mode-custom');
        } else {
            dom.charSpritesLayer.classList.add('mode-custom');
            dom.charSpritesLayer.classList.remove('mode-auto');
        }

        const usePositionX = (spriteMode === 'custom');

        // Konfigurasi transisi per-slot
        const spriteTransition = data.spriteTransition ? { enabled: true, duration: data.spriteTransitionDuration || 500 } : null;
        const sprite2Transition = data.sprite2Transition ? { enabled: true, duration: data.sprite2TransitionDuration || 500 } : null;
        const spriteCenterTransition = data.spriteCenterTransition ? { enabled: true, duration: data.spriteCenterTransitionDuration || 500 } : null;

        // Preset sprites
        dom.charSprite1 = updateCharacterSprite(dom.charSprite1, data.sprite, data.spriteAnim, data.spriteScale,
            usePositionX ? data.spriteX : null, spriteTransition, data.spriteDelay, data.spriteChroma,
            data.spriteLayerSettings, data.spriteBaseHidden);
        dom.charSprite2 = updateCharacterSprite(dom.charSprite2, data.sprite2, data.sprite2Anim, data.sprite2Scale,
            usePositionX ? data.sprite2X : null, sprite2Transition, data.sprite2Delay, data.sprite2Chroma,
            data.sprite2LayerSettings, data.sprite2BaseHidden);
        dom.charSpriteCenter = updateCharacterSprite(dom.charSpriteCenter, data.spriteCenter, data.spriteCenterAnim, data.spriteCenterScale,
            usePositionX ? data.spriteCenterX : null, spriteCenterTransition, data.spriteCenterDelay, data.spriteCenterChroma,
            data.spriteCenterLayerSettings, data.spriteCenterBaseHidden);
        dom.characterSprite = dom.charSprite1;
        dom.characterSprite2 = dom.charSprite2;
        dom.characterSpriteCenter = dom.charSpriteCenter;

        // Urutan tumpuk antar-slot (findings §2): spriteZ/sprite2Z/spriteCenterZ
        // — angka lebih besar tampil di depan; kosong = urutan alami.
        const _setZ = (el, z) => {
            if (!el || !el.parentElement) return;
            el.parentElement.style.zIndex = (z !== undefined && z !== null && z !== '') ? String(z) : '';
        };
        _setZ(dom.charSprite1, data.spriteZ);
        _setZ(dom.charSprite2, data.sprite2Z);
        _setZ(dom.charSpriteCenter, data.spriteCenterZ);

        // Dynamic custom sprites
        if (data.charSprites && Array.isArray(data.charSprites) && data.charSprites.length > 0) {
            const activeSlotIds = new Set();

            data.charSprites.forEach((spriteData, index) => {
                const slot = spriteData.slot || 'custom';
                if (slot === 'left' || slot === 'right' || slot === 'center') return;

                const slotId = customSlotId(spriteData, index);
                activeSlotIds.add(slotId);

                let targetSlot = document.getElementById(slotId);
                let targetImg = null;

                if (!targetSlot) {
                    targetSlot = document.createElement('div');
                    targetSlot.id = slotId;
                    targetSlot.className = 'char-sprite-slot';
                    targetSlot.dataset.slot = 'custom';
                    targetSlot.dataset.dynamic = 'true';
                    targetSlot.style.order = 10 + index;

                    targetImg = document.createElement('img');
                    targetImg.className = 'char-sprite-img';
                    targetImg.alt = `Dynamic Sprite ${index}`;
                    targetSlot.appendChild(targetImg);
                    dom.charSpritesLayer.appendChild(targetSlot);
                } else {
                    targetImg = targetSlot.querySelector('.char-sprite-img');
                }

                if (targetImg) {
                    targetImg = updateCharacterSprite(targetImg, spriteData.src, spriteData.anim || spriteData.animation,
                        spriteData.scale || 1, usePositionX ? spriteData.x : null, null, spriteData.delay, spriteData.chromaKey);
                    if (spriteData.z !== undefined) targetSlot.style.zIndex = String(spriteData.z);
                }
            });

            // Cleanup slot yang tidak aktif
            const allDynamic = dom.charSpritesLayer.querySelectorAll('[data-dynamic="true"]');
            allDynamic.forEach(slot => {
                if (!activeSlotIds.has(slot.id)) {
                    const img = slot.querySelector('.char-sprite-img');
                    if (img) { clearSpriteSurface(img); img.classList.add('hide'); img.classList.remove('visible'); }
                }
            });
        } else {
            // Cleanup semua dynamic slots
            const allDynamic = dom.charSpritesLayer.querySelectorAll('[data-dynamic="true"]');
            allDynamic.forEach(slot => {
                const img = slot.querySelector('.char-sprite-img');
                if (img) { clearSpriteSurface(img); img.classList.add('hide'); img.classList.remove('visible'); }
            });
        }

        // EKOR, sesudah slot custom dibuat — supaya slot dinamis ikut bisa jadi fokus
        // maupun ikut diredupkan (bukan hanya 3 slot preset).
        applySpriteFocus(data);
    }

    // Nama fokus yang tak bisa dipetakan dilaporkan sekali per sesi, bukan per entri.
    let _fokusTakDikenalDilapor = false;

    /**
     * Terapkan fokus bicara: slot yang bukan fokus diredupkan (`filter: brightness`),
     * slot fokus boleh di-zoom halus (`spriteFocusScale`).
     *
     * SENGAJA PER-ENTRI — bukan lengket seperti bgm/ambient/channel. Fokus mengikuti
     * siapa yang bicara dan itu berubah tiap baris; keadaan lengket akan meninggalkan
     * karakter tetap redup setelah lawan bicaranya selesai, dan kreator tak punya
     * cara jelas untuk "membatalkan". Karena itu `spriteFocus` juga TIDAK ikut
     * `lastSpriteState` di core.js (lihat NON_SLOT di sana) walau sprite-nya lengket.
     *
     * Redup dipasang di CONTAINER, bukan di <img>, agar layer overlay multi-layer
     * sprite (findings §10) ikut meredup — kalau di <img>, overlay tetap terang dan
     * karakter tampak rusak.
     *
     * Zoom memakai properti `scale` yang berdiri sendiri, BUKAN menyisip ke string
     * `transform`: `transform` sudah ditulis imperatif di 4 cabang updateCharacterSprite
     * + refreshSpriteScales, dan kelas `.anim-*` menganimasikan transform <img>.
     * Menumpanginya berarti satu nilai dihitung di banyak tempat (anatomi B1) dan
     * berisiko menimpa animasi masuk. `scale` dikomposisikan browser dengan
     * `transform` dan memakai `transform-origin: bottom center` yang sama.
     */
    function applySpriteFocus(data) {
        if (!dom.charSpritesLayer) return;

        const nama = (typeof data.spriteFocus === 'string') ? data.spriteFocus.trim() : '';
        const aktif = !!nama && nama !== 'none';
        const target = aktif ? _focusContainer(nama) : null;

        // Nama yang tak terpetakan JANGAN meredupkan semuanya — layar akan tampak
        // rusak tanpa sebab yang terlihat. Kebijakan §5(c): efeknya boleh ditelan,
        // informasinya tidak.
        if (aktif && !target && !_fokusTakDikenalDilapor) {
            _fokusTakDikenalDilapor = true;
            console.warn(`[VN Sprite] spriteFocus "${nama}" tak cocok slot mana pun ` +
                `(pakai 'sprite' | 'sprite2' | 'spriteCenter' | id slot custom) — fokus dilewati.`);
        }

        const dim = (typeof data.spriteDim === 'number' && isFinite(data.spriteDim))
            ? String(Math.max(0, Math.min(1, data.spriteDim)))
            : FOCUS_DIM_DEFAULT;
        const zoom = (typeof data.spriteFocusScale === 'number' &&
            isFinite(data.spriteFocusScale) && data.spriteFocusScale > 0)
            ? String(data.spriteFocusScale) : '';

        dom.charSpritesLayer.querySelectorAll('.char-sprite-slot').forEach(slot => {
            // Bersihkan TANPA SYARAT lebih dulu: redup entri sebelumnya tak boleh
            // tertinggal di slot yang kini tak lagi disebut (fokus = per-entri).
            slot.style.filter = '';
            slot.style.scale = '';
            if (!target) return;
            if (slot === target) {
                if (zoom) slot.style.scale = zoom;
                return;
            }
            const img = slot.querySelector('.char-sprite-img');
            if (img && img.classList.contains('visible')) slot.style.filter = `brightness(${dim})`;
        });
    }

    function _focusContainer(nama) {
        if (nama === 'sprite') return dom.charSprite1 && dom.charSprite1.parentElement;
        if (nama === 'sprite2') return dom.charSprite2 && dom.charSprite2.parentElement;
        if (nama === 'spriteCenter') return dom.charSpriteCenter && dom.charSpriteCenter.parentElement;
        const custom = document.getElementById(nama);
        return (custom && custom.classList.contains('char-sprite-slot')) ? custom : null;
    }

    function clearDynamicCharSprites() {
        const dynamicSlots = dom.charSpritesLayer.querySelectorAll('[data-dynamic="true"]');
        dynamicSlots.forEach(slot => slot.remove());
    }

    function clearAllSprites() {
        // Clear dynamic sprites
        clearDynamicCharSprites();
        // Reset fixed slots (left, center, right)
        const fixedSlots = dom.charSpritesLayer.querySelectorAll('.char-sprite-slot:not([data-dynamic="true"])');
        fixedSlots.forEach(slot => {
            const img = slot.querySelector('.char-sprite-img');
            if (img) {
                _syncOverlays(img, []);
                clearSpriteSurface(img);
                img.className = 'char-sprite-img';
                img.style.cssText = '';
            }
            slot.dataset.currentSrc = '';
            slot.dataset.currentAnim = '';
            slot.style.zIndex = '';
            // Fokus/redup ikut dibersihkan — kalau tidak, slot yang diredupkan di
            // chapter sebelumnya tetap gelap saat dipakai ulang tanpa `spriteFocus`.
            slot.style.filter = '';
            slot.style.scale = '';
        });
    }

    return {
        setupSpriteSlots,
        updateResponsiveScaling,
        refreshSpriteScales,
        updateCharacterSprite,
        processCharSprites,
        applySpriteFocus,
        customSlotId,
        clearDynamicCharSprites,
        clearAllSprites,
    };
})();
