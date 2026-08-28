/**
 * VN Hub API — Bridge untuk Hub Kustom Kreator
 * 
 * File ini otomatis ter-inject ke setiap hub.html kustom milik kreator.
 * Menyediakan objek global `VNHub` yang jadi jembatan antara
 * HTML/JS kustom kreator dengan engine internal (IPC ke Main Process).
 * 
 * Cara pakai di hub.html kustom:
 *   VNHub.playChapter('Prolog');
 *   const chapters = await VNHub.getChapterList();
 *   const meta = VNHub.getNovelMeta();
 */

const VNHub = (() => {
    const { ipcRenderer } = require('electron');

    // State internal — diisi saat engine mengirim hub context
    let _storyTitle = '';
    let _novelPath = '';
    let _metaData = {};
    let _hubConfig = null;
    let _contextReady = false;
    let _returnedFromChapter = null;

    // Queue untuk callback yang menunggu context siap
    const _readyCallbacks = [];

    // ---- Event bus terstruktur ----
    // VNHub.on('ready'|'chapter-return'|'meta-changed'|'navigate'|'resume'|'pause', cb)
    // Tiap emit juga dipancarkan sebagai window CustomEvent('vnhub:<event>') untuk
    // kompatibilitas dengan kode lama yang memakai addEventListener.
    const _listeners = Object.create(null);
    function _emit(eventName, detail) {
        const set = _listeners[eventName];
        if (set) {
            Array.from(set).forEach(cb => {
                try { cb(detail); } catch (e) { console.error('[VNHub API] listener error (' + eventName + '):', e); }
            });
        }
        try { window.dispatchEvent(new CustomEvent('vnhub:' + eventName, { detail })); } catch (e) { /* ignore */ }
    }

    // Terima context dari main process (dikirim setelah hub.html selesai load)
    ipcRenderer.on('vn-engine:set-hub-context', (event, data) => {
        console.log('[VNHub API] Context diterima:', data.storyTitle);
        _storyTitle = data.storyTitle || '';
        _novelPath = data.novelPath || '';
        _metaData = data.metaData || {};
        _hubConfig = data.hubConfig || null;
        _returnedFromChapter = data.returnedFromChapter || null;
        _contextReady = true;

        // Jalankan semua callback yang menunggu (onReady)
        _readyCallbacks.forEach(cb => {
            try { cb(); } catch (e) { console.error('[VNHub API] Error di onReady callback:', e); }
        });
        _readyCallbacks.length = 0;

        // Bus + window event 'vnhub:ready'
        _emit('ready', { storyTitle: _storyTitle, metaData: _metaData, returnedFromChapter: _returnedFromChapter });

        // Bila pemain BARU kembali dari sebuah chapter, beri tahu hub.
        if (_returnedFromChapter) {
            _emit('chapter-return', { chapter: _returnedFromChapter, storyTitle: _storyTitle });
        }
    });

    // Draft metadata dari editor dipisahkan dari konfigurasi Hub.
    ipcRenderer.on('preview:apply-hub-meta', (event, metaData) => {
        if (!metaData) return;
        _metaData = { ..._metaData, ...metaData };
        _emit('meta-changed', { metaData: { ..._metaData } });
    });

    // ---- Lifecycle resume/pause (visibilitas window) ----
    // Dipancarkan saat window hub disembunyikan/ditampilkan (minimize, alt-tab, dll.).
    if (typeof document !== 'undefined' && document.addEventListener) {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') _emit('resume', {});
            else _emit('pause', {});
        });
    }

    // ---- Overlay error in-app (bantuan debug untuk kreator) ----
    // Menangkap error tak tertangani & promise rejection di hub, lalu menampilkannya
    // sebagai panel ringkas (bukan cuma di console). Dismissible & bisa dimatikan via
    // VNHub.setErrorOverlay(false).
    let _errorOverlayEnabled = true;
    let _errorOverlayEl = null;
    let _errorCount = 0;

    function _ensureErrorOverlay() {
        if (_errorOverlayEl && _errorOverlayEl.isConnected) return _errorOverlayEl;
        const wrap = document.createElement('div');
        wrap.id = 'vnhub-error-overlay';
        wrap.style.cssText = 'position:fixed;left:0;right:0;bottom:0;max-height:45vh;z-index:2147483647;background:#1b0f12;border-top:3px solid #ff4136;color:#ffd7d7;font:12px/1.5 Consolas,Menlo,monospace;box-shadow:0 -6px 24px rgba(0,0,0,.5);display:flex;flex-direction:column;';
        const bar = document.createElement('div');
        bar.style.cssText = 'display:flex;align-items:center;gap:10px;padding:6px 12px;background:#2a0e12;border-bottom:1px solid #4a1f24;flex-shrink:0;';
        const title = document.createElement('span');
        title.id = 'vnhub-error-title';
        title.style.cssText = 'font-weight:bold;color:#ff6b6b;';
        const spacer = document.createElement('span');
        spacer.style.flex = '1';
        const copyBtn = document.createElement('button');
        copyBtn.textContent = '📋 Salin';
        copyBtn.style.cssText = 'background:#3a1418;border:1px solid #5a2a2f;color:#ffd7d7;border-radius:4px;padding:2px 8px;cursor:pointer;font:inherit;';
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        closeBtn.title = 'Tutup (sembunyikan)';
        closeBtn.style.cssText = 'background:none;border:none;color:#ffb3b3;font-size:16px;cursor:pointer;line-height:1;';
        closeBtn.onclick = () => { wrap.style.display = 'none'; };
        const body = document.createElement('div');
        body.id = 'vnhub-error-body';
        body.style.cssText = 'overflow:auto;padding:10px 12px;white-space:pre-wrap;';
        copyBtn.onclick = () => { try { navigator.clipboard.writeText(body.textContent || ''); } catch (e) { /* ignore */ } };
        bar.appendChild(title); bar.appendChild(spacer); bar.appendChild(copyBtn); bar.appendChild(closeBtn);
        wrap.appendChild(bar); wrap.appendChild(body);
        (document.body || document.documentElement).appendChild(wrap);
        _errorOverlayEl = wrap;
        return wrap;
    }

    function _showError(label, detail) {
        // Selalu log ke console juga.
        console.error('[Hub ' + label + ']', detail);
        if (!_errorOverlayEnabled || typeof document === 'undefined') return;
        try {
            const wrap = _ensureErrorOverlay();
            wrap.style.display = 'flex';
            _errorCount++;
            const t = wrap.querySelector('#vnhub-error-title');
            if (t) t.textContent = '⚠ Hub Error' + (_errorCount > 1 ? ' (' + _errorCount + ')' : '');
            const body = wrap.querySelector('#vnhub-error-body');
            if (body) {
                const entry = document.createElement('div');
                entry.style.cssText = 'border-bottom:1px dashed #4a1f24;padding-bottom:6px;margin-bottom:6px;';
                entry.textContent = '[' + label + '] ' + detail;
                body.appendChild(entry);
                body.scrollTop = body.scrollHeight;
            }
        } catch (e) { /* overlay tak boleh pernah melempar */ }
    }

    if (typeof window !== 'undefined' && window.addEventListener) {
        window.addEventListener('error', (e) => {
            const err = e && e.error;
            const msg = err ? (err.stack || err.message || String(err)) : ((e && e.message) || 'Unknown error');
            const loc = (e && e.filename) ? ('\n  at ' + e.filename + ':' + e.lineno + ':' + e.colno) : '';
            _showError('error', msg + loc);
        });
        window.addEventListener('unhandledrejection', (e) => {
            const r = e && e.reason;
            const msg = r ? (r.stack || r.message || String(r)) : 'Unhandled promise rejection';
            _showError('promise', msg);
        });
    }

    return {
        /**
         * Daftarkan callback yang dipanggil saat context hub sudah siap.
         * Kalau context sudah siap saat dipanggil, callback langsung dieksekusi.
         */
        onReady(callback) {
            if (_contextReady) {
                try { callback(); } catch (e) { console.error('[VNHub API] Error di onReady callback:', e); }
            } else {
                _readyCallbacks.push(callback);
            }
        },

        /**
         * Cek apakah context sudah siap
         */
        isReady() {
            return _contextReady;
        },

        // =====================================
        // EVENT BUS — langganan event hub terstruktur
        // =====================================
        /**
         * Langganan event hub.
         * Event: 'ready' | 'chapter-return' | 'meta-changed' | 'navigate' | 'resume' | 'pause'.
         * @param {string} eventName
         * @param {(detail:any)=>void} callback
         * @returns {Function} callback (untuk dipakai saat off()).
         */
        on(eventName, callback) {
            if (typeof callback !== 'function') return callback;
            (_listeners[eventName] || (_listeners[eventName] = new Set())).add(callback);
            return callback;
        },
        /** Berhenti berlangganan event. */
        off(eventName, callback) {
            if (_listeners[eventName]) _listeners[eventName].delete(callback);
        },
        /** Langganan sekali pakai (auto-lepas setelah terpanggil). */
        once(eventName, callback) {
            if (typeof callback !== 'function') return callback;
            const set = _listeners[eventName] || (_listeners[eventName] = new Set());
            const wrapper = (detail) => { set.delete(wrapper); callback(detail); };
            set.add(wrapper);
            return wrapper;
        },
        /**
         * Pancarkan event ke bus (dipakai runtime scene manager & bebas dipakai
         * kreator untuk event kustom antar-modul hub, mis. VNHub.emit('gallery-open')).
         * Juga dipancarkan sebagai window CustomEvent('vnhub:<event>').
         */
        emit(eventName, detail) {
            _emit(eventName, detail);
        },

        // =====================================
        // LIFECYCLE HOOKS
        // =====================================
        /**
         * Dipanggil saat pemain BARU kembali ke hub dari sebuah chapter.
         * Berguna untuk menyegarkan tombol "Lanjutkan", status unlock, progress, dll.
         * Bila context sudah siap & memang baru kembali, callback langsung dipanggil.
         * @param {(info:{chapter:string, storyTitle:string})=>void} callback
         */
        onChapterReturn(callback) {
            if (typeof callback !== 'function') return;
            this.on('chapter-return', callback);
            if (_contextReady && _returnedFromChapter) {
                try { callback({ chapter: _returnedFromChapter, storyTitle: _storyTitle }); }
                catch (e) { console.error('[VNHub API] Error di onChapterReturn callback:', e); }
            }
        },
        /** Dipanggil saat window hub kembali terlihat (mis. setelah minimize/alt-tab). */
        onResume(callback) { this.on('resume', callback); },
        /** Dipanggil saat window hub disembunyikan. */
        onPause(callback) { this.on('pause', callback); },

        /**
         * Nama chapter yang baru saja ditinggalkan pemain (atau null bila hub baru
         * dibuka segar dari pemilihan novel). Versi sinkron dari event 'chapter-return'.
         * @returns {string|null}
         */
        getReturnedFromChapter() {
            return _returnedFromChapter;
        },

        // =====================================
        // ERROR REPORTING
        // =====================================
        /**
         * Laporkan error secara manual ke overlay (mis. dari dalam try/catch).
         * @param {Error|string} err
         */
        reportError(err) {
            _showError('manual', err ? (err.stack || err.message || String(err)) : 'Unknown error');
        },
        /**
         * Aktif/nonaktifkan overlay error in-app (default aktif). Matikan untuk rilis.
         * @param {boolean} enabled
         */
        setErrorOverlay(enabled) {
            _errorOverlayEnabled = !!enabled;
            if (!enabled && _errorOverlayEl) _errorOverlayEl.style.display = 'none';
        },

        /**
         * Mulai memainkan chapter tertentu.
         * @param {string} chapterName - Nama folder chapter (contoh: 'Prolog', 'Chapter 1')
         */
        playChapter(chapterName) {
            if (!_storyTitle) {
                console.error('[VNHub API] Tidak bisa play chapter — storyTitle belum diset.');
                return;
            }
            console.log(`[VNHub API] Memulai chapter: ${chapterName}`);
            ipcRenderer.send('play-chapter', {
                storyTitle: _storyTitle,
                chapter: chapterName
            });
        },

        /**
         * Ambil daftar chapter dari novel ini.
         * `chapterMeta` (opsional, hanya ada bila novel punya `chapters.json` di root)
         * berisi metadata per-folder: `{ title, desc, cover, order, unlockFlag, locked }`.
         * Tanpa `chapters.json`, urutan/nama tetap folder mentah seperti sebelumnya.
         * @returns {Promise<{mainChapters: string[], sideStories: string[], chapterMeta?: Object}>}
         */
        async getChapterList() {
            if (!_storyTitle) return { mainChapters: [], sideStories: [] };
            return await ipcRenderer.invoke('get-chapter-list', _storyTitle);
        },

        /**
         * Mainkan side story secara first-class (setara `playChapter('sidestories/<nama>')`,
         * tapi dengan nama folder dinormalisasi lebih dulu agar konsisten dipakai di mana pun).
         * @param {string} name - Nama folder side story (relatif folder `sidestories/`).
         */
        playSideStory(name) {
            const clean = String(name || '').replace(/^sidestories[\/\\]/i, '');
            this.playChapter('sidestories/' + clean);
        },

        /**
         * Ambil metadata Profil Novel.
         * Termasuk cover, promotionalVideo, genre, author, illustrator,
         * vnMapper, dan deskripsi. (Field `images`/Media Showcase dihapus
         * 2026-07-21 — galeri/slideshow dibuat sendiri di kode hub, mis. lewat
         * `getGalleryImages()` atau markup hub.html milikmu.)
         * Data ini berasal dari novel-meta.json yang sudah di-parse engine.
         * @returns {Object}
         */
        getNovelMeta() {
            return { ..._metaData };
        },

        /**
         * @returns {string} Judul novel yang sedang aktif
         */
        getStoryTitle() {
            return _storyTitle;
        },

        /**
         * @returns {string} Path absolut ke folder novel
         */
        getNovelPath() {
            return _novelPath;
        },

        /**
         * Ambil data progress dari localStorage.
         * @returns {Object} Data progress, termasuk chapters dan lastPlayed
         */
        getProgress() {
            const key = `progress_${_storyTitle.replace(/ /g, '_')}`;
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : { chapters: {} };
        },

        /**
         * Simpan data progress ke localStorage (misalnya update lastPlayed).
         * @param {Object} progressData
         */
        saveProgress(progressData) {
            const key = `progress_${_storyTitle.replace(/ /g, '_')}`;
            localStorage.setItem(key, JSON.stringify(progressData));
        },

        /**
         * Ambil daftar save slots untuk novel ini.
         * @returns {Promise<Array>} Array of save slot data
         */
        async getSaveSlots() {
            if (!_storyTitle) return [];
            return await ipcRenderer.invoke('vn-engine:get-save-slots', _storyTitle);
        },

        /**
         * Load game dari slot tertentu.
         * @param {number} slotId - ID slot (1-6)
         */
        loadGame(slotId) {
            if (!_storyTitle) {
                console.error('[VNHub API] Tidak bisa load game — storyTitle belum diset.');
                return;
            }
            ipcRenderer.send('vn-engine:load-game-from-hub', {
                storyTitle: _storyTitle,
                slotId: slotId
            });
        },

        /**
         * Kembali ke VN Manager (daftar semua novel).
         */
        exitToManager() {
            ipcRenderer.send('vn-engine:exit-to-manager');
        },

        /**
         * Update Discord RPC activity dari hub kustom.
         * @param {Object} activity - { details, state, largeImageKey, smallImageKey, smallImageText }
         */
        updateRPC(activity) {
            ipcRenderer.send('update-rpc-activity', activity);
        },

        /**
         * Resolve path aset relatif ke path absolut file:// URL.
         * Berguna untuk memuat gambar/audio/video dari folder novel.
         * @param {string} relativePath - Path relatif dari folder novel (contoh: 'cover.png')
         * @returns {string} URL file:// absolut
         */
        resolveAsset(relativePath) {
            if (!relativePath) return '';
            if (relativePath.startsWith('file://') || relativePath.startsWith('http')) return relativePath;
            // Rakit path absolut lalu encode AMAN: spasi & karakter khusus di-escape
            // (encodeURI), tetapi drive-letter "C:" dan pemisah "/" dipertahankan.
            const base = String(_novelPath).replace(/\\/g, '/').replace(/\/+$/, '');
            const rel = String(relativePath).replace(/\\/g, '/').replace(/^\/+/, '');
            return encodeURI('file:///' + base + '/' + rel);
        },

        // =====================================
        // FASE 2C: VN Hub API Extension
        // =====================================

        /**
         * Putar video overlay fullscreen di atas hub.
         * Auto-remove setelah selesai putar (atau di-skip).
         * @param {string} src - Path video (relatif ke folder novel)
         * @param {Object} options - { loop: boolean, autoSkip: boolean, onEnd: function }
         */
        playVideo(src, options = {}) {
            const videoUrl = this.resolveAsset(src);
            const videoEl = document.createElement('video');
            videoEl.src = videoUrl;
            videoEl.style.cssText = 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; object-fit: cover; z-index: 9999; background: black; cursor: pointer;';
            videoEl.autoplay = true;
            videoEl.loop = !!options.loop;
            
            const cleanup = () => {
                if (videoEl.parentNode) videoEl.parentNode.removeChild(videoEl);
                if (typeof options.onEnd === 'function') options.onEnd();
            };

            videoEl.onended = cleanup;
            
            if (options.autoSkip !== false) {
                videoEl.onclick = cleanup;
            }

            document.body.appendChild(videoEl);
        },

        // =====================================
        // AUDIO — BGM (1 channel) + SFX (berlapis), dengan fade/crossfade
        // =====================================
        /** Instance BGM aktif (1 channel). */
        _audioInstance: null,
        /** Kumpulan SFX one-shot yang sedang berbunyi. */
        _sfxInstances: null,

        /** Ramp volume sebuah <audio> dari `from` ke `to` selama `ms`. */
        _fadeVolume(audio, from, to, ms, onDone) {
            const clamp = v => Math.min(1, Math.max(0, v));
            if (!audio) { if (onDone) onDone(); return null; }
            if (!ms || ms <= 0) { audio.volume = clamp(to); if (onDone) onDone(); return null; }
            const steps = Math.max(1, Math.round(ms / 40));
            const stepV = (to - from) / steps;
            let i = 0;
            audio.volume = clamp(from);
            const timer = setInterval(() => {
                i++;
                audio.volume = clamp(from + stepV * i);
                if (i >= steps) {
                    clearInterval(timer);
                    audio.volume = clamp(to);
                    if (onDone) onDone();
                }
            }, 40);
            return timer;
        },

        /**
         * Putar BGM hub (1 channel — memanggil ulang akan mengganti BGM sebelumnya).
         * @param {string} src - Path audio (relatif ke folder novel)
         * @param {Object} options - { loop?: boolean=true, volume?: number=1.0, fade?: number=0 (ms) }
         */
        playAudio(src, options = {}) {
            const vol = options.volume !== undefined ? options.volume : 1.0;
            const fade = options.fade || 0;

            // Crossfade: redam & hentikan BGM lama tanpa memotong tiba-tiba.
            const prev = this._audioInstance;
            if (prev) {
                if (fade > 0) this._fadeVolume(prev, prev.volume, 0, fade, () => { try { prev.pause(); } catch (e) {} });
                else { try { prev.pause(); prev.currentTime = 0; } catch (e) {} }
            }

            const audio = new Audio(this.resolveAsset(src));
            audio.loop = options.loop !== false; // Default loop true
            this._audioInstance = audio;
            if (fade > 0) {
                audio.volume = 0;
                audio.play().catch(e => console.error('[VNHub API] Gagal putar audio:', e));
                this._fadeVolume(audio, 0, vol, fade);
            } else {
                audio.volume = vol;
                audio.play().catch(e => console.error('[VNHub API] Gagal putar audio:', e));
            }
            return audio;
        },

        /**
         * Hentikan BGM hub.
         * @param {Object} [options] - { fade?: number=0 (ms) }
         */
        stopAudio(options = {}) {
            const audio = this._audioInstance;
            if (!audio) return;
            this._audioInstance = null;
            const fade = options.fade || 0;
            if (fade > 0) this._fadeVolume(audio, audio.volume, 0, fade, () => { try { audio.pause(); audio.currentTime = 0; } catch (e) {} });
            else { try { audio.pause(); audio.currentTime = 0; } catch (e) {} }
        },

        /**
         * Atur volume BGM yang sedang berbunyi (opsional dengan fade).
         * @param {number} volume - 0..1
         * @param {Object} [options] - { fade?: number=0 (ms) }
         */
        setBGMVolume(volume, options = {}) {
            const audio = this._audioInstance;
            if (!audio) return;
            const v = Math.min(1, Math.max(0, volume));
            if (options.fade > 0) this._fadeVolume(audio, audio.volume, v, options.fade);
            else audio.volume = v;
        },

        /**
         * Putar efek suara (SFX) SEKALI, BERLAPIS di atas BGM tanpa menghentikannya.
         * @param {string} src - Path audio (relatif ke folder novel)
         * @param {Object} [options] - { volume?: number=1.0, loop?: boolean=false }
         * @returns {HTMLAudioElement} elemen audio (untuk kontrol manual bila perlu)
         */
        playSFX(src, options = {}) {
            if (!this._sfxInstances) this._sfxInstances = [];
            const audio = new Audio(this.resolveAsset(src));
            audio.volume = options.volume !== undefined ? options.volume : 1.0;
            audio.loop = !!options.loop;
            const cleanup = () => {
                const idx = this._sfxInstances.indexOf(audio);
                if (idx >= 0) this._sfxInstances.splice(idx, 1);
            };
            audio.addEventListener('ended', cleanup);
            this._sfxInstances.push(audio);
            audio.play().catch(e => { console.error('[VNHub API] Gagal putar SFX:', e); cleanup(); });
            return audio;
        },

        /**
         * Hentikan SEMUA audio hub (BGM + semua SFX).
         * @param {Object} [options] - { fade?: number=0 (ms) — hanya untuk BGM }
         */
        stopAllAudio(options = {}) {
            this.stopAudio(options);
            if (this._sfxInstances) {
                this._sfxInstances.forEach(a => { try { a.pause(); } catch (e) {} });
                this._sfxInstances = [];
            }
        },

        /**
         * Dispatch event navigasi kustom agar hub bisa ganti "screen" (misal: menu -> gallery)
         * Kreator mendengarkannya dengan: window.addEventListener('vnhub:navigate', e => console.log(e.detail.screen))
         * @param {string} screenId 
         */
        navigateTo(screenId) {
            _emit('navigate', { screen: screenId });
        },

        /**
         * Tampilkan modal bawaan untuk memilih chapter. Pilihan langsung memutar chapter via playChapter().
         */
        async showChapterSelect() {
            if (!_storyTitle) return;

            const existingModal = document.getElementById('vnhub-chapter-modal');
            if (existingModal) existingModal.remove();

            const chapters = await this.getChapterList();
            
            const overlay = document.createElement('div');
            overlay.id = 'vnhub-chapter-modal';
            overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.85); z-index: 10000; display: flex; justify-content: center; align-items: center; font-family: sans-serif; backdrop-filter: blur(5px);';

            const modal = document.createElement('div');
            modal.style.cssText = 'background: #1e1e1e; border: 1px solid #333; border-radius: 12px; padding: 30px; width: 90%; max-width: 500px; max-height: 80vh; overflow-y: auto; color: white; box-shadow: 0 10px 30px rgba(0,0,0,0.5); position: relative;';

            const closeBtn = document.createElement('button');
            closeBtn.innerHTML = '&times;';
            closeBtn.style.cssText = 'position: absolute; top: 15px; right: 20px; background: none; border: none; color: #aaa; font-size: 24px; cursor: pointer;';
            closeBtn.onclick = () => overlay.remove();
            modal.appendChild(closeBtn);

            const title = document.createElement('h2');
            title.textContent = 'Pilih Chapter';
            title.style.cssText = 'margin: 0 0 20px 0; color: #1cccae; text-align: center; border-bottom: 1px solid #333; padding-bottom: 15px;';
            modal.appendChild(title);

            // chapterMeta (dari chapters.json opsional, lihat vn-engine/core.js) memberi
            // judul tampil, deskripsi, dan status locked per chapter — tanpa itu, fallback
            // ke nama folder mentah seperti sebelumnya.
            const meta = chapters.chapterMeta || {};

            const createBtn = (label, onPick, opts) => {
                opts = opts || {};
                const btn = document.createElement('button');
                if (opts.desc) {
                    btn.innerHTML = `<div>${label}</div><div style="font-size: 12px; opacity: 0.6; margin-top: 3px;">${opts.desc}</div>`;
                } else {
                    btn.textContent = label;
                }
                const locked = !!opts.locked;
                btn.disabled = locked;
                btn.style.cssText = 'display: block; width: 100%; padding: 12px 15px; margin-bottom: 10px; background: #2a2a2a; color: white; border: 1px solid #444; border-radius: 6px; text-align: left; cursor: pointer; transition: 0.2s; font-size: 16px;';
                if (locked) {
                    btn.style.opacity = '0.45';
                    btn.style.cursor = 'not-allowed';
                } else {
                    btn.onmouseover = () => { btn.style.background = '#3a3a3a'; btn.style.borderColor = '#1cccae'; };
                    btn.onmouseout = () => { btn.style.background = '#2a2a2a'; btn.style.borderColor = '#444'; };
                    btn.onclick = () => { overlay.remove(); onPick(); };
                }
                return btn;
            };

            if (chapters.mainChapters && chapters.mainChapters.length > 0) {
                chapters.mainChapters.forEach(ch => {
                    const m = meta[ch];
                    const label = (m && m.locked) ? `🔒 ${m.title}` : (m ? m.title : ch);
                    modal.appendChild(createBtn(label, () => this.playChapter(ch), { desc: m && m.desc, locked: m && m.locked }));
                });
            } else {
                const empty = document.createElement('p');
                empty.textContent = 'Belum ada chapter cerita utama.';
                empty.style.cssText = 'text-align: center; opacity: 0.5; margin-bottom: 20px;';
                modal.appendChild(empty);
            }

            if (chapters.sideStories && chapters.sideStories.length > 0) {
                const sideTitle = document.createElement('h3');
                sideTitle.textContent = 'Side Stories';
                sideTitle.style.cssText = 'margin: 25px 0 15px 0; color: #ff9d00; font-size: 16px; padding-top: 15px; border-top: 1px solid #333;';
                modal.appendChild(sideTitle);
                // playSideStory() menormalisasi & menambahkan prefix 'sidestories/' —
                // dulu tombol ini memanggil playChapter(ch) dengan nama folder BARE,
                // yang salah resolve (dicari langsung di root novel, bukan di sidestories/).
                chapters.sideStories.forEach(ch => modal.appendChild(createBtn(`⭐ ${ch}`, () => this.playSideStory(ch))));
            }

            overlay.appendChild(modal);
            document.body.appendChild(overlay);
        },

        /**
         * Minta main process untuk membuka modal/window Pengaturan (Settings).
         */
        showSettings() {
            ipcRenderer.send('vn-engine:show-settings');
        },

        /**
         * Ambil total waktu bermain dari localStorage.
         * @returns {number} Waktu dalam detik.
         */
        getPlayTime() {
            const key = `playtime_${_storyTitle.replace(/ /g, '_')}`;
            const raw = localStorage.getItem(key);
            return raw ? parseInt(raw, 10) : 0;
        },

        /**
         * Ambil daftar file gambar dari folder `gallery/` novel.
         * @returns {Promise<string[]>} Array path relatif gambar galeri
         */
        async getGalleryImages() {
            if (!_storyTitle) return [];
            return await ipcRenderer.invoke('vn-hub:get-gallery-images', _storyTitle);
        },

        /**
         * Ambil konfigurasi meta Hub (isi file hub-config.json)
         * Sync jika sudah ada dari context, async fallback via IPC.
         * @returns {Promise<Object>} Data konfigurasi hub
         */
        async getHubConfig() {
            if (_hubConfig) return _hubConfig;
            if (!_storyTitle) return null;
            const res = await ipcRenderer.invoke('get-hub-config', _storyTitle);
            if (res.success) { _hubConfig = res.config; return _hubConfig; }
            return null;
        },

        // =====================================
        // STORY → HUB BRIDGE — baca flag yang ditulis cerita
        // =====================================
        /**
         * Ambil semua flag persisten yang ditulis dari script (custom command
         * `set_hub_flag`). Memungkinkan hub bereaksi pada hasil cerita (jalur yang
         * dipilih, babak selesai, dst.).
         * @returns {Promise<Object>}
         */
        async getStoryFlags() {
            if (!_storyTitle) return {};
            try {
                const res = await ipcRenderer.invoke('vn-hub:get-story-flags', _storyTitle);
                return (res && res.success && res.flags) || {};
            } catch (e) { return {}; }
        },
        /**
         * Ambil satu flag cerita.
         * @param {string} key
         * @param {*} [fallback=null]
         * @returns {Promise<*>}
         */
        async getStoryFlag(key, fallback) {
            const flags = await this.getStoryFlags();
            return Object.prototype.hasOwnProperty.call(flags, key)
                ? flags[key] : (fallback === undefined ? null : fallback);
        },
        /** Hapus semua flag cerita (mis. saat memulai New Game baru). */
        async clearStoryFlags() {
            if (!_storyTitle) return;
            try { await ipcRenderer.invoke('vn-hub:clear-story-flags', _storyTitle); } catch (e) { /* ignore */ }
        },
        /**
         * VFS — "folder virtual" per-novel (findings §9), berbagi penyimpanan
         * dengan VNPlayer.vfs (<novel>/vfs.json). Untuk hub yang menampilkan "isi
         * folder" meta (mis. daftar file karakter yang bisa dihapus pemain).
         */
        vfs: {
            async set(key, value) {
                if (!_storyTitle || !key) return false;
                try { const r = await ipcRenderer.invoke('vn-novel:vfs-set', { novelTitle: _storyTitle, key, value }); return !!(r && r.success); }
                catch (e) { return false; }
            },
            async remove(key) {
                if (!_storyTitle || !key) return false;
                try { const r = await ipcRenderer.invoke('vn-novel:vfs-remove', { novelTitle: _storyTitle, key }); return !!(r && r.success); }
                catch (e) { return false; }
            },
            async list() {
                if (!_storyTitle) return {};
                try { const r = await ipcRenderer.invoke('vn-novel:vfs-list', _storyTitle); return (r && r.success && r.files) || {}; }
                catch (e) { return {}; }
            },
            async get(key, fallback) {
                const files = await this.list();
                return Object.prototype.hasOwnProperty.call(files, key) ? files[key] : (fallback === undefined ? null : fallback);
            },
            async has(key) {
                const files = await this.list();
                return Object.prototype.hasOwnProperty.call(files, key);
            }
        },
        /**
         * Hapus satu save slot dari hub (findings §9/§11) — tombol hapus di
         * layar Load custom, atau meta-mechanic "save kamu lenyap".
         * @returns {Promise<boolean>}
         */
        async deleteSaveSlot(slotId) {
            if (!_storyTitle) return false;
            try {
                const r = await ipcRenderer.invoke('vn-engine:delete-save-slot', { storyTitle: _storyTitle, slotId });
                return !!(r && r.success);
            } catch (e) { return false; }
        },
        /**
         * Tulis satu flag cerita dari HUB
         * Memakai penyimpanan hub-flags.json yang SAMA dengan `set_hub_flag` (script)
         * dan VNPlayer.setStoryFlag (custom player) — sehingga chapter berikutnya bisa
         * membacanya via `load_hub_flags`. Kebutuhan nyata: tombol New Game mereset
         * state carry, menyimpan nama pemain, dsb., SEBELUM chapter dimuat — dulu
         * hanya bisa lewat workaround VNHub.storage (localStorage) yang rapuh.
         * @param {string} key
         * @param {*} value - nilai JSON-able apa pun
         */
        async setStoryFlag(key, value) {
            if (!_storyTitle || !key) return;
            try { await ipcRenderer.invoke('vn-hub:set-story-flag', { novelTitle: _storyTitle, key, value }); }
            catch (e) { console.error('[VNHub API] setStoryFlag gagal:', e); }
        },

        /**
         * Ambil SNAPSHOT SEMUA variabel cerita dari sesi bermain terakhir
         * (ditulis engine otomatis saat chapter berakhir / pemain kembali ke hub).
         * Berbeda dari getStoryFlags() (opt-in per key via set_hub_flag), ini memberi
         * hub akses penuh ke state cerita: afeksi, counter, route, dsb. — tanpa
         * perlu menulis flag satu-satu dari script.
         * @returns {Promise<{vars: Object, chapter: string|null, updatedAt: string|null}>}
         */
        async getStoryVars() {
            if (!_storyTitle) return { vars: {}, chapter: null, updatedAt: null };
            try {
                const res = await ipcRenderer.invoke('vn-hub:get-story-vars', _storyTitle);
                return (res && res.success)
                    ? { vars: res.vars || {}, chapter: res.chapter || null, updatedAt: res.updatedAt || null }
                    : { vars: {}, chapter: null, updatedAt: null };
            } catch (e) { return { vars: {}, chapter: null, updatedAt: null }; }
        },
        /**
         * Ambil satu variabel cerita dari snapshot sesi terakhir.
         * @param {string} name
         * @param {*} [fallback=null]
         * @returns {Promise<*>}
         */
        async getStoryVar(name, fallback) {
            const snap = await this.getStoryVars();
            return Object.prototype.hasOwnProperty.call(snap.vars, name)
                ? snap.vars[name] : (fallback === undefined ? null : fallback);
        },
        /** Hapus snapshot variabel cerita (mis. saat New Game). */
        async clearStoryVars() {
            if (!_storyTitle) return;
            try { await ipcRenderer.invoke('vn-hub:clear-story-vars', _storyTitle); } catch (e) { /* ignore */ }
        },

        // =====================================
        // ACHIEVEMENTS — sistem achievement first-class per-novel
        // Definisi: <novel>/achievements.json (kelola di editor: Novel → Achievements,
        // atau tulis tangan). Progres: achievements-state.json (otomatis).
        // list() SEKALIGUS men-sweep unlock otomatis (def ber-unlockFlag dicek ke
        // hub-flags.json + story-vars.json) — panggil di onReady/onChapterReturn
        // agar unlock otomatis + toast-nya hidup. Panggil selalu lewat
        // `VNHub.achievements.<method>()` (jangan di-destructure).
        // =====================================
        achievements: {
            _toastEnabled: true,
            _callbacks: [],
            /**
             * Semua definisi + status unlock: [{id,title,desc,icon,hidden,unlockFlag,unlocked,unlockedAt}].
             * Efek samping: sweep auto-unlock (memicu toast + onUnlock untuk yang baru terbuka).
             * @returns {Promise<Array>}
             */
            async list() {
                if (!_storyTitle) return [];
                try {
                    const res = await ipcRenderer.invoke('achievements:list', { novelTitle: _storyTitle });
                    if (!res || !res.success) return [];
                    (res.newlyUnlocked || []).forEach((def) => this._notify(def));
                    return res.achievements || [];
                } catch (e) { return []; }
            },
            /** Daftar id achievement yang sudah terbuka. @returns {Promise<string[]>} */
            async unlocked() {
                const all = await this.list();
                return all.filter((a) => a.unlocked).map((a) => a.id);
            },
            /**
             * Buka achievement dari hub (mis. easter egg di lobby).
             * @param {string} id
             * @returns {Promise<boolean>} true bila BARU terbuka (false bila sudah/gagal).
             */
            async unlock(id) {
                if (!_storyTitle || !id) return false;
                try {
                    const res = await ipcRenderer.invoke('achievements:unlock', { novelTitle: _storyTitle, id });
                    if (res && res.success && res.newlyUnlocked) {
                        this._notify(res.def || { id, title: id });
                        return true;
                    }
                    return false;
                } catch (e) { return false; }
            },
            /** Reset progres unlock (mis. saat New Game penuh). */
            async reset() {
                if (!_storyTitle) return;
                try { await ipcRenderer.invoke('achievements:reset', { novelTitle: _storyTitle }); } catch (e) { /* ignore */ }
            },
            /** Daftarkan callback untuk achievement yang BARU terbuka. @param {(def:Object)=>void} cb */
            onUnlock(cb) { if (typeof cb === 'function') this._callbacks.push(cb); },
            /** Matikan/nyalakan toast 🏆 bawaan (default nyala; matikan bila hub punya UI sendiri). */
            setToastEnabled(on) { this._toastEnabled = !!on; },
            _notify(def) {
                this._callbacks.forEach((cb) => {
                    try { cb(def); } catch (e) { console.error('[VNHub API] onUnlock callback error:', e); }
                });
                if (this._toastEnabled) this._showToast(def);
            },
            _showToast(def) {
                try {
                    const el = document.createElement('div');
                    el.style.cssText = 'position:fixed; right:18px; bottom:18px; z-index:99999;' +
                        ' background:rgba(20,20,25,0.92); color:#fff; border:1px solid rgba(255,209,102,0.6);' +
                        ' border-left:4px solid #ffd166; border-radius:8px; padding:10px 16px;' +
                        ' font-family:sans-serif; font-size:14px; box-shadow:0 4px 18px rgba(0,0,0,0.4);' +
                        ' opacity:0; transform:translateY(8px); transition:opacity .3s ease, transform .3s ease;' +
                        ' pointer-events:none; max-width:60vw;';
                    const icon = (def && def.icon) || '🏆';
                    const title = (def && def.title) || (def && def.id) || 'Achievement';
                    el.textContent = icon + ' Achievement: ' + title;
                    document.body.appendChild(el);
                    requestAnimationFrame(() => { el.style.opacity = '1'; el.style.transform = 'translateY(0)'; });
                    setTimeout(() => {
                        el.style.opacity = '0'; el.style.transform = 'translateY(8px)';
                        setTimeout(() => el.remove(), 400);
                    }, 3800);
                } catch (e) { /* DOM belum siap — abaikan */ }
            },
        },

        // =====================================
        // SETTINGS — baca/ubah pengaturan inti player dari Hub
        // =====================================
        /**
         * Pengaturan player yang dibagi lewat localStorage (key 'vn-player-volume-settings').
         * Player membacanya saat memuat chapter — jadi perubahan dari Hub berlaku pada
         * sesi play BERIKUTNYA (bukan live ke player yang sedang berjalan, karena saat di
         * Hub tidak ada player aktif). Memungkinkan UI Settings kustom Hub yang BENAR-BENAR
         * berfungsi, bukan kosmetik.
         *
         * Field: bgm | voice | sfx (0..1), textSpeed (ms/karakter, makin kecil makin cepat),
         * autoDelay (ms jeda auto-advance).
         */
        settings: {
            _KEY: 'vn-player-volume-settings',
            DEFAULTS: { bgm: 0.8, voice: 0.8, sfx: 0.8, textSpeed: 45, autoDelay: 2000 },
            _read: function () {
                try { return Object.assign({}, this.DEFAULTS, JSON.parse(localStorage.getItem(this._KEY) || '{}')); }
                catch (e) { return Object.assign({}, this.DEFAULTS); }
            },
            _write: function (obj) {
                try { localStorage.setItem(this._KEY, JSON.stringify(obj)); return true; }
                catch (e) { console.error('[VNHub API] settings gagal menyimpan:', e); return false; }
            },
            /** @returns {Object} semua setting (default + tersimpan). */
            getAll: function () { return this._read(); },
            /** @param {string} key @param {*} [fallback] */
            get: function (key, fallback) {
                var all = this._read();
                if (all[key] !== undefined) return all[key];
                return fallback === undefined ? (this.DEFAULTS[key] !== undefined ? this.DEFAULTS[key] : null) : fallback;
            },
            /** Ubah satu setting. @returns {*} value */
            set: function (key, value) { var a = this._read(); a[key] = value; this._write(a); return value; },
            /** Merge beberapa setting sekaligus. */
            update: function (partial) { var a = this._read(); Object.assign(a, partial || {}); this._write(a); return a; },
            /** Layar penuh on/off (window-level, lewat main process). */
            setFullscreen: function (on) { try { ipcRenderer.send('vn-engine:set-fullscreen', !!on); } catch (e) { /* ignore */ } },
            /** Toggle layar penuh. */
            toggleFullscreen: function () { try { ipcRenderer.send('toggle-fullscreen'); } catch (e) { /* ignore */ } },
            /** Ubah ukuran window (resolusi windowed). Diabaikan saat fullscreen. */
            setResolution: function (width, height) {
                try { ipcRenderer.send('vn-engine:set-window-size', { width: width, height: height }); } catch (e) { /* ignore */ }
            },
            /**
             * Set bahasa aktif (kode, mis. 'en'/'id'/'ja'). Engine memuat
             * `script.<code>.json` per chapter bila ada; jika tidak, fallback ke
             * script.json. Berlaku pada chapter yang dimainkan setelah ini.
             */
            setLanguage: function (code) {
                try { ipcRenderer.send('vn-engine:set-language', code); } catch (e) { /* ignore */ }
            },
            /** @returns {Promise<string>} kode bahasa aktif ('default' bila belum diset). */
            getLanguage: function () {
                try { return ipcRenderer.invoke('vn-engine:get-language'); } catch (e) { return Promise.resolve('default'); }
            }
        },

        // =====================================
        // PERSISTENT STORAGE — key-value ber-scope per-novel
        // =====================================
        /**
         * Penyimpanan persisten kustom untuk hub, OTOMATIS ber-scope per novel
         * (tidak bentrok antar novel). Cocok untuk flag cerita, status unlock CG,
         * achievement, preferensi hub, dsb. Nilai boleh berupa apa pun yang bisa
         * di-JSON (string/number/boolean/array/object).
         *
         * Contoh:
         *   VNHub.storage.set('cgUnlocked', ['cg01', 'cg02']);
         *   if (VNHub.storage.get('ending_true_seen', false)) { ... }
         *   VNHub.storage.merge('flags', { metBestFriend: true });
         */
        storage: {
            _key() {
                return 'hubstore_' + String(_storyTitle || '_').replace(/\s+/g, '_');
            },
            _all() {
                try { return JSON.parse(localStorage.getItem(this._key()) || '{}') || {}; }
                catch (e) { return {}; }
            },
            _persist(obj) {
                try { localStorage.setItem(this._key(), JSON.stringify(obj)); return true; }
                catch (e) { console.error('[VNHub API] storage gagal menyimpan:', e); return false; }
            },
            /**
             * @param {string} key
             * @param {*} [fallback=null] Nilai bila key belum ada.
             * @returns {*}
             */
            get(key, fallback) {
                const all = this._all();
                return Object.prototype.hasOwnProperty.call(all, key)
                    ? all[key] : (fallback === undefined ? null : fallback);
            },
            /** Simpan satu nilai. @returns {*} value */
            set(key, value) {
                const all = this._all();
                all[key] = value;
                this._persist(all);
                return value;
            },
            /** Gabungkan object ke nilai object yang ada (shallow merge). */
            merge(key, partial) {
                const all = this._all();
                const cur = (all[key] && typeof all[key] === 'object') ? all[key] : {};
                all[key] = Object.assign({}, cur, partial || {});
                this._persist(all);
                return all[key];
            },
            /** @returns {boolean} */
            has(key) { return Object.prototype.hasOwnProperty.call(this._all(), key); },
            /** Hapus satu key. */
            remove(key) {
                const all = this._all();
                if (Object.prototype.hasOwnProperty.call(all, key)) {
                    delete all[key];
                    this._persist(all);
                }
            },
            /** @returns {string[]} Semua key tersimpan. */
            keys() { return Object.keys(this._all()); },
            /** @returns {Object} Salinan seluruh data store novel ini. */
            all() { return this._all(); },
            /** Kosongkan seluruh store novel ini. */
            clear() {
                try { localStorage.removeItem(this._key()); } catch (e) { /* ignore */ }
            }
        }
    };
})();

window.VNHub = VNHub;
window.dispatchEvent(new CustomEvent('vnhub:api-ready'));
