// ============================================================
// PREVIEW FRAME — Dual-mode inline preview component
// Supports Fast Mode (iframe + srcdoc + <base href>) and
// Live Mode (webview + preload). Only 1 element active at a time.
// ============================================================
(function () {
    'use strict';

    // ------------------------------------------------------------------
    // UX-B07 — LAPORAN SESI SEBELUMNYA
    //
    // Crash & unresponsive dicatat MAIN (renderer yang mati tak bisa menulis
    // nisannya sendiri), lalu dibaca sekali di sini saat panel pertama lahir.
    // Disimpan di level modul, bukan per-instance: laporannya milik APLIKASI,
    // dan menampilkannya dua kali karena kebetulan ada dua preview terbuka
    // hanya membuat kreator mengira crash-nya dua kali.
    // ------------------------------------------------------------------
    var _laporanSesi = null;      // null = belum diambil; [] = sudah, tak ada apa-apa
    var _laporanDiambil = false;

    function _ipc() {
        try { return require('electron').ipcRenderer; } catch (e) { return null; }
    }

    function _ambilLaporanSesi(selesai) {
        if (_laporanDiambil) { selesai(); return; }
        _laporanDiambil = true;
        var ipc = _ipc();
        if (!ipc) { _laporanSesi = []; selesai(); return; }
        ipc.invoke('diagnostics:session-report').then(function (r) {
            _laporanSesi = (r && r.success && r.sesiLalu) ? r.sesiLalu : [];
            selesai();
        }).catch(function () { _laporanSesi = []; selesai(); });
    }

    /** Dipanggil sesudah kreator melihatnya — laporan lama tak perlu muncul lagi. */
    function _akuiLaporanSesi() {
        _laporanSesi = [];
        var ipc = _ipc();
        if (ipc) ipc.invoke('diagnostics:ack-previous').catch(function () {});
    }

    // Kanvas acuan preview. Dulu dipaku 1920×1080; sejak target viewport ada, ia
    // MENGIKUTI ukuran panggung yang dirancang kreator (`display.targetViewport`
    // di novel-meta.json), disiarkan `novelViewportEditor.js`. Novel yang tidak
    // menyebutnya tetap 1920×1080 — jadi nol perubahan bagi novel lama.
    //
    // Kalau ini tidak ikut, novel 4:3 akan tampil MELAR di preview padahal
    // berkasnya benar, dan kreator akan mengejar bug yang tidak ada.
    var SCALE_REF_BAWAAN_W = 1920;
    var SCALE_REF_BAWAAN_H = 1080;

    function _kanvasAcuan() {
        var tv = window.VN_TARGET_VIEWPORT;
        var w = tv && Number(tv.width);
        var h = tv && Number(tv.height);
        if (!w || !h || w <= 0 || h <= 0) return { w: SCALE_REF_BAWAAN_W, h: SCALE_REF_BAWAAN_H };
        return { w: w, h: h };
    }

    /**
     * @param {string} containerId - ID of DOM container to mount into
     * @param {Object} opts
     * @param {string} opts.title - Display title in title bar
     * @param {Array<{id,label,title,renderer}>} [opts.modes] - Daftar mode toggle (renderer: 'iframe'|'webview'). Default: Fast(iframe)+Live(webview).
     * @param {string} [opts.defaultMode] - id mode awal (fallback bila localStorage tak valid)
     * @param {string} opts.baseHref - file:// path for <base> in fast mode
     * @param {string} opts.liveURL - file:// URL for webview src in live mode
     * @param {string} opts.preloadSrc - Path to preload.js for webview
     * @param {Function} [opts.onReady] - Called when preview content is ready
     * @param {Function} [opts.onError] - Called on error
     * @param {Function} [opts.buildSrcdoc] - Function(config) => HTML string for fast mode
     * @param {string} opts.configChannel - IPC channel for webview config push (wajib bila pakai mode webview; Player: 'preview:apply-player-config', Hub: 'preview:apply-hub-config')
     * @param {Function} [opts.onWebviewReady] - Called when webview dom-ready fires (receives webview element)
     * @param {Function} [opts.onIpcMessage] - Called for every webview ipc-message (channel, args)
     * @param {Function} [opts.onModeChange] - Called after mode switch (mode)
     */
    // Default daftar mode (dipakai bila opts.modes tak diberikan — mis. Player).
    // Tiap mode: { id, label, title, renderer:'iframe'|'webview' }.
    var DEFAULT_MODES = [
        { id: 'fast', label: 'Fast', title: 'Pratinjau ringan (iframe srcdoc)', renderer: 'iframe' },
        { id: 'live', label: 'Live', title: 'Pratinjau runtime penuh (webview)', renderer: 'webview' }
    ];

    // Instance hidup, supaya kanvas acuan yang baru bisa diterapkan tanpa
    // membongkar-pasang webview. Pelajaran Freeze/OOM: tiap pembongkaran memuat
    // ulang player beserta asetnya, jadi mengubah SKALA tak boleh menyentuh DOM
    // preview sama sekali — cukup transform-nya yang dihitung ulang.
    var _instances = [];

    function PreviewFrame(containerId, opts) {
        _instances.push(this);
        this._containerId = containerId;
        this._opts = opts || {};
        this._modes = (this._opts.modes && this._opts.modes.length) ? this._opts.modes : DEFAULT_MODES;

        // Pilih mode awal: localStorage bila masih valid untuk daftar mode instance ini,
        // jika tidak → defaultMode, jika tidak → mode pertama. (Migrasi aman: nilai lama
        // 'fast' pada instance Hub yang kini [per-scene, live] otomatis jatuh ke default.)
        var validIds = this._modes.map(function (m) { return m.id; });
        var stored = localStorage.getItem('vneditor-preview-mode-' + containerId);
        this._mode = (validIds.indexOf(stored) >= 0) ? stored
            : (validIds.indexOf(this._opts.defaultMode) >= 0 ? this._opts.defaultMode : validIds[0]);
        // UX-B07: nama sumber untuk panel Masalah & Log. Diturunkan dari id
        // kontainer supaya Hub dan Player otomatis terpisah tanpa pemanggil
        // perlu menghafal konstanta baru.
        this._diagSource = this._opts.diagSource || containerId;
        this._diagDev = localStorage.getItem('vneditor-diag-dev-' + containerId) === '1';
        // Panel log MENGINGAT keadaannya, sama seperti mode Developer.
        //
        // Frame ini dibangun ulang oleh hal-hal yang sama sekali tak berhubungan
        // dengan log: menerapkan template, berpindah target, memuat ulang engine.
        // Tanpa ingatan, panel yang sedang dipakai untuk membaca error akan lenyap
        // justru saat kreator melakukan hal yang MENYEBABKAN error berikutnya.
        var diagTerbuka = null;
        try { diagTerbuka = localStorage.getItem('vneditor-diag-open-' + containerId); }
        catch (e) { /* tanpa localStorage, mulai tertutup */ }
        this._diagOpen = diagTerbuka === '1';
        this._diagUnsub = null;
        this._webviewListeners = [];
        this._config = null;
        this._iframe = null;
        this._webview = null;
        this._mounted = false;
        this._loading = false;
        this._stopped = false;

        // DOM refs (set on mount)
        this._container = null;
        this._viewportEl = null;
        this._titleEl = null;
        this._scaleLabel = null;
        this._loaderEl = null;
        this._errorEl = null;
        this._stoppedEl = null;
        this._stopBtnEl = null;
        this._resizeObserver = null;
    }

    // ==========================================
    // MOUNT / DESTROY
    // ==========================================

    PreviewFrame.prototype.mount = function () {
        var container = document.getElementById(this._containerId);
        if (!container || this._mounted) return;
        this._container = container;

        // Build skeleton
        container.innerHTML = '';
        container.className = (container.className || '').replace(/\bpf-container\b/g, '') + ' pf-container';

        // Title bar
        var titleBar = document.createElement('div');
        titleBar.className = 'pf-title-bar';

        var titleText = document.createElement('span');
        titleText.className = 'pf-title-text';
        titleText.textContent = this._opts.title || 'Preview';
        this._titleEl = titleText;

        // Mode indicator badge
        var modeBadge = document.createElement('span');
        modeBadge.className = 'pf-mode-badge';
        this._modeBadgeEl = modeBadge;
        this._updateModeBadge();

        // Mode toggle — dibangun dari this._modes (tanpa emoji).
        // Disembunyikan bila hanya 1 mode (mis. Player kini Live-only) — tombol
        // toggle tunggal tak bermakna.
        var modeToggle = document.createElement('div');
        modeToggle.className = 'pf-mode-toggle';
        if (this._modes.length <= 1) modeToggle.style.display = 'none';
        var activeMode = this._mode;
        this._modes.forEach(function (m) {
            var btn = document.createElement('button');
            btn.className = 'pf-mode-btn' + (activeMode === m.id ? ' active' : '');
            btn.dataset.mode = m.id;
            btn.textContent = m.label;
            if (m.title) btn.title = m.title;
            modeToggle.appendChild(btn);
        });

        // Controls
        var controls = document.createElement('div');
        controls.className = 'pf-controls';

        var reloadBtn = document.createElement('button');
        reloadBtn.className = 'pf-ctrl-btn';
        reloadBtn.textContent = '\u21BB';
        reloadBtn.title = 'Muat ulang preview';

        // Stop \u2014 hentikan preview (buang iframe/webview) tanpa membongkar frame,
        // agar pengguna bisa memastikan runtime benar-benar berhenti (mis. webview
        // hub/player) tanpa harus pindah tab. Klik lagi untuk melanjutkan.
        var stopBtn = document.createElement('button');
        stopBtn.className = 'pf-ctrl-btn';
        this._stopBtnEl = stopBtn;

        var scaleLabel = document.createElement('span');
        scaleLabel.className = 'pf-scale-label';
        scaleLabel.textContent = '100%';
        this._scaleLabel = scaleLabel;

        controls.appendChild(scaleLabel);
        controls.appendChild(stopBtn);
        controls.appendChild(reloadBtn);

        titleBar.appendChild(titleText);
        titleBar.appendChild(modeBadge);
        titleBar.appendChild(modeToggle);
        titleBar.appendChild(controls);

        // Viewport (where iframe/webview lives)
        var viewport = document.createElement('div');
        viewport.className = 'pf-viewport';
        this._viewportEl = viewport;

        // Loading overlay
        var loader = document.createElement('div');
        loader.className = 'pf-loader hidden';
        loader.innerHTML = '<div class="pf-spinner"></div><span>Memuat preview...</span>';
        this._loaderEl = loader;

        // Error overlay
        var errorEl = document.createElement('div');
        errorEl.className = 'pf-error hidden';
        errorEl.innerHTML = '<span class="pf-error-icon">\u26A0</span><span class="pf-error-text">Gagal memuat preview</span>';
        this._errorEl = errorEl;

        // Stopped overlay \u2014 tampil saat pengguna menekan tombol Stop
        var stoppedEl = document.createElement('div');
        stoppedEl.className = 'pf-stopped hidden';
        stoppedEl.innerHTML = '<span class="pf-stopped-icon">\u25A0</span><span class="pf-stopped-text">Preview dihentikan</span>';
        this._stoppedEl = stoppedEl;

        viewport.appendChild(loader);
        viewport.appendChild(errorEl);
        viewport.appendChild(stoppedEl);

        container.appendChild(titleBar);
        container.appendChild(viewport);

        // GAGANG TINGGI — elemen tersendiri, BUKAN `resize: vertical` bawaan
        // browser. Alasannya geometris, bukan selera: viewport preview memakai
        // aspect-ratio 16/9 dan _rescale() memakai min(w/1920, h/1080), jadi
        // kedua rasio itu selalu sama besar dan elemen webview MENUTUPI viewport
        // tepat 100% — termasuk pojok kanan-bawah tempat grabber bawaan digambar.
        // Pointer di atas <webview> pergi ke guest, bukan ke host, sehingga
        // grabber itu tak akan pernah bisa ditarik siapa pun.
        var gagang = document.createElement('div');
        gagang.className = 'pf-resize-handle';
        gagang.title = 'Tarik untuk mengubah tinggi preview · klik ganda untuk kembali ke tinggi bawaan';
        gagang.setAttribute('role', 'separator');
        gagang.setAttribute('aria-orientation', 'horizontal');
        gagang.setAttribute('aria-label', 'Ubah tinggi preview');
        gagang.tabIndex = 0;
        this._gagangEl = gagang;
        container.appendChild(gagang);

        // Status bar
        var statusBar = document.createElement('div');
        statusBar.className = 'pf-status-bar';
        statusBar.innerHTML = '<span class="pf-status-text">Menunggu data\u2026</span>';
        this._statusEl = statusBar;
        this._statusTextEl = statusBar.querySelector('.pf-status-text');

        // UX-B07 — lencana Masalah. Sengaja hidup di status bar preview, bukan
        // panel terpisah: masalah preview HANYA bermakna di sebelah preview yang
        // melahirkannya, dan kreator tak perlu mencarinya di tempat lain.
        var diagBadge = document.createElement('button');
        diagBadge.type = 'button';
        diagBadge.className = 'pf-diag-badge';
        diagBadge.title = 'Masalah & Log Preview';
        this._diagBadgeEl = diagBadge;
        statusBar.appendChild(diagBadge);
        container.appendChild(statusBar);

        var diagPanel = document.createElement('div');
        diagPanel.className = 'pf-diag-panel';
        diagPanel.style.display = 'none';
        this._diagPanelEl = diagPanel;
        container.appendChild(diagPanel);

        // Events
        var self = this;
        modeToggle.addEventListener('click', function (e) {
            var btn = e.target.closest('.pf-mode-btn');
            if (!btn || btn.dataset.mode === self._mode) return;
            self.setMode(btn.dataset.mode);
        });

        reloadBtn.addEventListener('click', function () {
            // Preview yang dihentikan tak punya elemen untuk di-reload — reload
            // di sini berarti "nyalakan lagi".
            if (self._stopped) { self.resume(); return; }
            self.reload();
        });

        stopBtn.addEventListener('click', function () {
            if (self._stopped) self.resume(); else self.stop();
        });
        this._updateStopBtn();

        // ResizeObserver for scaling
        this._resizeObserver = new ResizeObserver(function () {
            self._rescale();
        });
        this._resizeObserver.observe(viewport);
        // Tinggi tarikan dari sesi sebelumnya — dipulihkan SESUDAH observer
        // terpasang supaya penskalaannya ikut menyesuaikan sendiri.
        this._terapkanTinggiTersimpan();
        this._pasangGagangTinggi();


        diagBadge.addEventListener('click', function () {
            self._diagOpen = !self._diagOpen;
            try {
                localStorage.setItem('vneditor-diag-open-' + self._containerId, self._diagOpen ? '1' : '0');
            } catch (e) { /* preferensi gagal disimpan tak membatalkan aksinya */ }
            if (self._diagOpen) _ambilLaporanSesi(function () { self._renderDiag(); });
            else self._renderDiag();
        });

        diagPanel.addEventListener('click', function (e) {
            var btn = e.target.closest('[data-diag-act]');
            if (btn) { self._diagAksi(btn.dataset.diagAct); return; }
            var baris = e.target.closest('.pf-diag-row[data-diag-jump]');
            if (baris && self._opts.onDiagJump) {
                try { self._opts.onDiagJump(JSON.parse(baris.dataset.diagJump)); }
                catch (err) { /* konteks rusak = tak melompat, bukan crash */ }
            }
        });

        // Langganan DILEPAS di destroy(). Buffer-nya global & hidup lebih lama
        // daripada frame ini; pendengar yang tertinggal akan menggambar ke DOM
        // yang sudah dibuang setiap kali ada log baru.
        if (window.VN && VN.Diagnostics) {
            this._diagUnsub = VN.Diagnostics.berlangganan(function () { self._renderDiag(); });
        }
        if (this._diagOpen) _ambilLaporanSesi(function () { self._renderDiag(); });
        else this._renderDiag();

        this._mounted = true;

        // Create initial preview element
        this._createPreviewElement();
    };

    PreviewFrame.prototype.destroy = function () {
        if (!this._mounted) return;
        this._destroyPreviewElement();
        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
            this._resizeObserver = null;
        }
        if (this._container) {
            this._container.innerHTML = '';
            this._container.classList.remove('pf-container');
        }
        if (this._diagUnsub) { this._diagUnsub(); this._diagUnsub = null; }
        if (this._lepasGagang) { this._lepasGagang(); this._lepasGagang = null; }
        this._gagangEl = null;
        this._diagBadgeEl = null;
        this._diagPanelEl = null;
        this._mounted = false;
        this._config = null;
        this._stopped = false;
    };

    // ==========================================
    // MODE SWITCHING
    // ==========================================

    PreviewFrame.prototype.getMode = function () {
        return this._mode;
    };

    PreviewFrame.prototype.getWebview = function () {
        return this._webview;
    };

    // Cari entri mode (default ke mode pertama bila id tak dikenal).
    PreviewFrame.prototype._modeEntry = function (id) {
        id = id || this._mode;
        for (var i = 0; i < this._modes.length; i++) {
            if (this._modes[i].id === id) return this._modes[i];
        }
        return this._modes[0];
    };

    // Renderer yang dipakai mode tertentu: 'iframe' atau 'webview'.
    PreviewFrame.prototype._rendererFor = function (id) {
        var e = this._modeEntry(id);
        return (e && e.renderer) || 'iframe';
    };

    PreviewFrame.prototype.setMode = function (mode) {
        var valid = this._modes.some(function (m) { return m.id === mode; });
        if (!valid) return;
        if (mode === this._mode && (this._iframe || this._webview)) return;

        // Bila renderer sama (mis. Hub: per-scene ↔ live keduanya webview), cukup
        // ganti perilaku via onModeChange tanpa membongkar elemen (hindari reload).
        var sameRenderer = this._rendererFor(mode) === this._rendererFor(this._mode)
            && (this._iframe || this._webview);

        this._mode = mode;
        localStorage.setItem('vneditor-preview-mode-' + this._containerId, mode);

        // Update toggle UI
        if (this._container) {
            this._container.querySelectorAll('.pf-mode-btn').forEach(function (btn) {
                btn.classList.toggle('active', btn.dataset.mode === mode);
            });
        }

        // Update mode badge (unless externally overridden)
        if (!this._badgeOverride) {
            this._updateModeBadge();
        }

        // Bongkar & buat ulang elemen hanya bila renderer berubah.
        if (!sameRenderer) {
            this._destroyPreviewElement();
            this._createPreviewElement();
            if (this._config) this.sendConfig(this._config);
        }

        // Notify consumer of mode change (mis. Hub: per-scene/live driving, bersihkan highlight)
        if (this._opts.onModeChange) {
            try { this._opts.onModeChange(mode); } catch (e) { /* ignore */ }
        }
    };

    // ==========================================
    // PREVIEW ELEMENT CREATION
    // ==========================================

    PreviewFrame.prototype._createPreviewElement = function () {
        if (!this._viewportEl) return;
        this._hideError();
        // Elemen baru dibuat → preview otomatis dianggap berjalan lagi (mis. dipanggil
        // dari resume(), reload penuh, atau ganti mode saat sedang stopped).
        this._stopped = false;
        this._hideStopped();
        this._updateStopBtn();

        if (this._rendererFor(this._mode) === 'iframe') {
            this._createIframe();
        } else {
            this._createWebview();
        }
    };

    PreviewFrame.prototype._destroyPreviewElement = function () {
        // Destroy iframe
        if (this._iframe) {
            this._iframe.remove();
            this._iframe = null;
        }
        // Destroy webview (important for memory)
        if (this._webview) {
            try {
                // UX-B07: listener dilepas EKSPLISIT sebelum elemennya dibuang.
                // Menghapus elemen memang cukup untuk GC biasa, tetapi `console-message`
                // menyalakan jalur yang paling mahal di panel ini — dan jalur itu
                // pantas dimatikan pada titik yang bisa ditunjuk, bukan diserahkan
                // ke asumsi tentang kapan GC bekerja.
                for (var i = 0; i < this._webviewListeners.length; i++) {
                    var L = this._webviewListeners[i];
                    this._webview.removeEventListener(L[0], L[1]);
                }
                this._webviewListeners = [];
                // Force close webview process
                this._webview.remove();
            } catch (e) { /* ignore */ }
            this._webview = null;
        }
    };

    PreviewFrame.prototype._createIframe = function () {
        var iframe = document.createElement('iframe');
        iframe.className = 'pf-preview-element pf-iframe';
        iframe.sandbox = 'allow-same-origin allow-scripts';
        var acuanIframe = _kanvasAcuan();
        iframe.style.width = acuanIframe.w + 'px';
        iframe.style.height = acuanIframe.h + 'px';
        iframe.setAttribute('frameborder', '0');

        this._viewportEl.appendChild(iframe);
        this._iframe = iframe;

        // Set up message listener for fast mode communication
        var self = this;
        this._iframeMessageHandler = function (e) {
            if (e.source !== iframe.contentWindow) return;
            if (e.data && e.data.type === 'preview:ready') {
                self._hideLoader();
                if (self._opts.onReady) self._opts.onReady();
            }
            if (e.data && e.data.type === 'preview:error') {
                self._showError(e.data.message || 'Preview error');
                if (self._opts.onError) self._opts.onError(e.data.message);
            }
        };
        window.addEventListener('message', this._iframeMessageHandler);

        this._rescale();
    };

    PreviewFrame.prototype._createWebview = function () {
        if (!this._opts.liveURL) {
            this._showError('Live URL belum dikonfigurasi');
            return;
        }

        var self = this;
        this._showLoader();

        var webview = document.createElement('webview');
        webview.className = 'pf-preview-element pf-webview';
        var acuanWebview = _kanvasAcuan();
        webview.style.width = acuanWebview.w + 'px';
        webview.style.height = acuanWebview.h + 'px';

        if (this._opts.preloadSrc) {
            // Electron <webview> mengharuskan atribut preload berupa URL file://.
            // Path absolut mentah (mis. "P:\\...\\preload.js") tidak akan dimuat.
            var preloadVal = this._opts.preloadSrc;
            if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(preloadVal)) {
                preloadVal = 'file:///' + String(preloadVal).replace(/\\/g, '/').replace(/^\/+/, '');
            }
            webview.setAttribute('preload', preloadVal);
        }
        webview.setAttribute('nodeintegration', '');
        webview.setAttribute('webpreferences', 'contextIsolation=no');
        webview.src = this._opts.liveURL;

        // Webview lifecycle
        webview.addEventListener('dom-ready', function () {
            self._hideLoader();
            if (self._opts.onWebviewReady) self._opts.onWebviewReady(webview);
            if (self._opts.onReady) self._opts.onReady();
            // Re-apply config after dom-ready
            if (self._config) {
                self._sendToWebview(self._config);
            }
        });

        webview.addEventListener('did-fail-load', function (e) {
            if (e.errorCode !== -3) { // -3 = aborted (expected on rapid switch)
                self._hideLoader();
                self._showError('Load gagal: ' + (e.errorDescription || 'Unknown error'));
                if (self._opts.onError) self._opts.onError(e.errorDescription);
            }
        });

        // UX-B07 — konsol preview jadi diagnosa, bukan sekadar hilang ke DevTools.
        // Level & sumbernya datang dari Chromium apa adanya; penyaringan (info
        // hanya di Mode Developer) urusan panel, bukan urusan penangkapnya.
        var onKonsol = function (e) {
            self._diagCatat(self._diagLevelKonsol(e.level), e.message,
                { file: e.sourceId || '', baris: e.line });
        };
        webview.addEventListener('console-message', onKonsol);
        this._webviewListeners.push(['console-message', onKonsol]);

        // IPC from webview via sendToHost
        webview.addEventListener('ipc-message', function (e) {
            if (e.channel === 'preview:ready') {
                self._hideLoader();
                if (self._opts.onReady) self._opts.onReady();
            }
            if (e.channel === 'preview:error') {
                self._showError(e.args[0] || 'Preview error');
            }
            // Forward semua channel ke consumer (mis. Hub: 'hub:scene-shown')
            if (self._opts.onIpcMessage) {
                try { self._opts.onIpcMessage(e.channel, e.args); } catch (err) { /* ignore */ }
            }
        });

        this._viewportEl.appendChild(webview);
        this._webview = webview;
        this._rescale();
    };

    // ==========================================
    // COMMUNICATION
    // ==========================================

    /**
     * Send config data to the preview. Routes to appropriate channel.
     * @param {Object} data - Config object to send
     */
    PreviewFrame.prototype.sendConfig = function (data) {
        this._config = data;

        if (this._rendererFor(this._mode) === 'iframe') {
            this._sendToIframe(data);
        } else {
            this._sendToWebview(data);
        }

        // Update status bar timestamp
        this._updateStatus();
    };

    /**
     * Baris status preview.
     *
     * Dulu ia HANYA disegarkan oleh `sendConfig()`. Untuk preview Player itu
     * kebetulan cukup — config memang dikirim tiap kali. Preview Hub mendorong
     * confignya lewat jalur lain, jadi barisnya berhenti di "Menunggu data…"
     * selama-lamanya: baris status yang tak pernah berubah = kontrol mati.
     *
     * Sekarang ia melaporkan tiga keadaan yang benar-benar berbeda, dan setiap
     * keadaan punya pemicunya sendiri.
     *
     * @param {"muat"|"perbarui"} [sebab] default: "perbarui".
     */
    PreviewFrame.prototype._updateStatus = function (sebab) {
        if (!this._statusTextEl) return;
        if (this._stopped) {
            this._statusTextEl.textContent = 'Preview dihentikan \u2014 perubahan menunggu, klik \u25b6 untuk lanjut';
            return;
        }
        var now = new Date();
        var hh = String(now.getHours()).padStart(2, '0');
        var mm = String(now.getMinutes()).padStart(2, '0');
        var ss = String(now.getSeconds()).padStart(2, '0');
        var kata = sebab === 'muat' ? 'dimuat' : 'diperbarui';
        this._statusTextEl.textContent = 'Preview aktif \u2014 ' + kata + ' ' + hh + ':' + mm + ':' + ss;
    };

    // ==========================================
    // UX-B06 — SEMAT PREVIEW: TAK ADA KODENYA DI SINI
    // ==========================================
    //
    // Preview Player tetap terlihat saat form digulung, dan itu diurus CSS
    // SEPENUHNYA (`position: sticky` pada `.player-preview-split > .pf-container`).
    //
    // Sempat ada tombol "Semat" beserta preferensi localStorage-nya. Dicabut atas
    // keputusan user: perilaku ini tak punya sisi lain yang masuk akal dipilih —
    // preview yang menghilang saat digulung bukan fitur yang akan dirindukan —
    // jadi tombolnya cuma menambah kontrol yang harus dipahami dulu.
    //
    // Bonusnya nyata: nol JavaScript berarti mustahil ada elemen yang berpindah
    // induk atau webview yang dibangun ulang. Tinggi yang berubah tetap diurus
    // ResizeObserver yang sudah ada di viewport.

    // ==========================================
    // UX-B07 — MASALAH & LOG PREVIEW
    // ==========================================

    /** Catat kejadian atas nama sumber frame ini. Aman bila modulnya belum dimuat. */
    PreviewFrame.prototype._diagCatat = function (level, pesan, konteks, stack) {
        if (!window.VN || !VN.Diagnostics) return;
        VN.Diagnostics.catat({
            sumber: this._diagSource, level: level, pesan: pesan,
            konteks: konteks || null, stack: stack || ''
        });
    };

    /**
     * Terjemahkan level `console-message` webview.
     * Chromium memakai 0=verbose, 1=info, 2=warning, 3=error. Verbose & info
     * digabung: keduanya sama-sama isi mode Developer, dan membedakannya di UI
     * cuma menambah kategori tanpa menambah jawaban.
     */
    PreviewFrame.prototype._diagLevelKonsol = function (n) {
        if (n >= 3) return 'error';
        if (n === 2) return 'warning';
        return 'info';
    };

    PreviewFrame.prototype._diagAksi = function (act) {
        var D = (window.VN && VN.Diagnostics) || null;
        if (!D) return;
        if (act === 'bersih') { D.bersihkan(this._diagSource); return; }
        if (act === 'akui-sesi') { _akuiLaporanSesi(); this._renderDiag(); return; }
        if (act === 'dev') {
            this._diagDev = !this._diagDev;
            try {
                localStorage.setItem('vneditor-diag-dev-' + this._containerId, this._diagDev ? '1' : '0');
            } catch (e) { /* preferensi gagal disimpan tak boleh membatalkan mode */ }
            this._renderDiag();
            return;
        }
        if (act === 'salin') {
            var teks = D.teksSalin({ sumber: this._diagSource, semuaLevel: this._diagDev });
            var lapor = function (ok) {
                if (!window.VN || !VN.Toast) return;
                if (ok) VN.Toast.info('Log preview disalin.');
                else VN.Toast.error('Gagal menyalin log.');
            };
            try {
                navigator.clipboard.writeText(teks)
                    .then(function () { lapor(true); })
                    .catch(function () { lapor(false); });
            } catch (e) { lapor(false); }
        }
    };

    PreviewFrame.prototype._diagTombol = function (act, label, aktif) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'pf-diag-btn' + (aktif ? ' is-active' : '');
        b.dataset.diagAct = act;
        b.textContent = label;
        return b;
    };

    PreviewFrame.prototype._diagBaris = function (it) {
        var row = document.createElement('div');
        row.className = 'pf-diag-row pf-diag-' + it.level;

        // Baris hanya bisa diklik bila BENAR-BENAR ada tujuannya. Tanpa syarat ini
        // ia jadi affordance palsu — kelas yang sudah dua kali dibersihkan di sini.
        if (it.konteks && (it.konteks.file || it.konteks.scene) && this._opts.onDiagJump) {
            row.dataset.diagJump = JSON.stringify(it.konteks);
            row.classList.add('is-jumpable');
        }

        var jam = document.createElement('span');
        jam.className = 'pf-diag-time';
        jam.textContent = VN.Diagnostics.jam(it.waktuAkhir);
        row.appendChild(jam);

        var lvl = document.createElement('span');
        lvl.className = 'pf-diag-level';
        lvl.textContent = it.level === 'error' ? 'Error' : (it.level === 'warning' ? 'Warning' : 'Info');
        row.appendChild(lvl);

        var isi = document.createElement('div');
        isi.className = 'pf-diag-isi';

        var pesan = document.createElement('div');
        pesan.className = 'pf-diag-msg';
        // textContent: isinya pesan dari kode kreator maupun dari berkas mereka.
        pesan.textContent = it.pesan + (it.jumlah > 1 ? '  (\u00D7' + it.jumlah + ')' : '');
        isi.appendChild(pesan);

        if (it.konteks && (it.konteks.file || it.konteks.scene)) {
            var k = [];
            if (it.konteks.file) k.push(String(it.konteks.file).split(/[\\/]/).pop());
            if (it.konteks.scene) k.push('scene: ' + it.konteks.scene);
            if (it.konteks.baris != null) k.push('baris ' + it.konteks.baris);
            var ctx = document.createElement('div');
            ctx.className = 'pf-diag-ctx';
            ctx.textContent = k.join(' \u00B7 ');
            isi.appendChild(ctx);
        }

        if (this._diagDev && it.stack) {
            var det = document.createElement('details');
            det.className = 'pf-diag-stack';
            var sum = document.createElement('summary');
            sum.textContent = 'Stack';
            det.appendChild(sum);
            var pre = document.createElement('pre');
            pre.textContent = it.stack;
            det.appendChild(pre);
            isi.appendChild(det);
        }

        row.appendChild(isi);
        return row;
    };

    /**
     * Gambar lencana + panel.
     *
     * Saat panel TERTUTUP isinya benar-benar dikosongkan, bukan disembunyikan
     * dengan CSS: 200 baris log yang menganggur di DOM adalah persis jenis
     * penumpukan yang menyeret renderer editor ke OOM tempo hari.
     */
    PreviewFrame.prototype._renderDiag = function () {
        if (!this._diagBadgeEl || !this._diagPanelEl) return;
        var D = (window.VN && VN.Diagnostics) || null;
        if (!D) { this._diagBadgeEl.style.display = 'none'; return; }

        var r = D.ringkasan(this._diagSource);
        var masalah = r.error + r.warning;

        // Lencana muncul hanya bila ada yang perlu dilihat — atau saat panelnya
        // sedang dibuka, supaya menutup panel tidak ikut melenyapkan tombolnya.
        this._diagBadgeEl.style.display = (masalah > 0 || this._diagOpen) ? '' : 'none';
        this._diagBadgeEl.classList.toggle('is-error', r.error > 0);
        this._diagBadgeEl.classList.toggle('is-open', this._diagOpen);
        this._diagBadgeEl.textContent = masalah > 0
            ? ('\u26A0 ' + masalah + ' masalah')
            : 'Log preview';

        var panel = this._diagPanelEl;
        panel.innerHTML = '';
        if (!this._diagOpen) { panel.style.display = 'none'; return; }
        panel.style.display = '';

        var head = document.createElement('div');
        head.className = 'pf-diag-head';
        var judul = document.createElement('span');
        judul.className = 'pf-diag-title';
        judul.textContent = 'Masalah & Log Preview';
        head.appendChild(judul);
        head.appendChild(this._diagTombol('dev', 'Mode Developer', this._diagDev));
        head.appendChild(this._diagTombol('salin', 'Salin'));
        head.appendChild(this._diagTombol('bersih', 'Bersihkan'));
        panel.appendChild(head);

        // Laporan sesi sebelumnya berdiri TERPISAH dari daftar: ia bukan kejadian
        // pada preview ini, melainkan pada aplikasi — dan mencampurnya ke daftar
        // yang sama akan membuatnya tampak seperti masalah preview yang sekarang.
        if (_laporanSesi && _laporanSesi.length) {
            var strip = document.createElement('div');
            strip.className = 'pf-diag-sesi';
            var jd = document.createElement('div');
            jd.className = 'pf-diag-sesi-judul';
            jd.textContent = 'Sesi sebelumnya berakhir tidak normal (' + _laporanSesi.length + ')';
            strip.appendChild(jd);
            for (var j = 0; j < _laporanSesi.length && j < 5; j++) {
                var it = _laporanSesi[j];
                var b = document.createElement('div');
                b.className = 'pf-diag-sesi-baris';
                b.textContent = VN.Diagnostics.jam(it.waktu) + '  ' + it.jenis + ' \u2014 ' + it.pesan;
                strip.appendChild(b);
            }
            strip.appendChild(this._diagTombol('akui-sesi', 'Mengerti'));
            panel.appendChild(strip);
        }

        var list = D.daftar({ sumber: this._diagSource, semuaLevel: this._diagDev });
        if (!list.length) {
            var kosong = document.createElement('p');
            kosong.className = 'pf-diag-kosong';
            kosong.textContent = this._diagDev
                ? 'Belum ada catatan untuk preview ini.'
                : 'Tidak ada masalah. Pesan info & konsol mentah ada di Mode Developer.';
            panel.appendChild(kosong);
            return;
        }


        var body = document.createElement('div');
        body.className = 'pf-diag-list';
        for (var i = 0; i < list.length; i++) body.appendChild(this._diagBaris(list[i]));
        panel.appendChild(body);
    };

    PreviewFrame.prototype._sendToIframe = function (data) {
        if (!this._iframe) return;

        // If we have a buildSrcdoc function, rebuild the entire srcdoc
        if (this._opts.buildSrcdoc) {
            var baseHref = this._opts.baseHref || '';
            var bodyHTML = this._opts.buildSrcdoc(data);
            var srcdoc = '<!DOCTYPE html><html><head><meta charset="utf-8">';
            if (baseHref) {
                srcdoc += '<base href="' + this._escapeAttr(baseHref) + '">';
            }
            srcdoc += '</head><body style="margin:0;overflow:hidden;">' + bodyHTML + '</body></html>';
            this._iframe.srcdoc = srcdoc;
        }
        // (Fallback postMessage 'preview:apply-config' dihapus — tak ada satu pun
        // listener di seluruh codebase; tanpa buildSrcdoc kiriman itu no-op. Audit C4.)
    };

    PreviewFrame.prototype._sendToWebview = function (data) {
        if (!this._webview) return;
        // Tanpa default tersembunyi (audit C4): kedua konsumen (Player/Hub) wajib
        // memberi configChannel eksplisit; tanpa itu, tidak ada yang dikirim.
        var channel = this._opts.configChannel;
        if (!channel) return;
        try {
            this._webview.send(channel, data);
        } catch (e) {
            // Webview might not be ready yet — will re-send on dom-ready
        }
    };

    // ==========================================
    // RELOAD
    // ==========================================

    PreviewFrame.prototype.reload = function () {
        if (this._rendererFor(this._mode) === 'iframe') {
            if (this._config && this._opts.buildSrcdoc) {
                this._sendToIframe(this._config);
            } else if (this._iframe) {
                // Force iframe refresh
                var src = this._iframe.srcdoc;
                this._iframe.srcdoc = '';
                requestAnimationFrame(function () { this._iframe.srcdoc = src; }.bind(this));
            }
        } else {
            if (this._webview) {
                this._showLoader();
                this._webview.reload();
            }
        }
    };

    // ==========================================
    // STOP / RESUME — hentikan runtime (iframe/webview) secara eksplisit tanpa
    // membongkar seluruh frame, supaya pengguna bisa memastikan preview (mis.
    // webview hub/player dengan nodeintegration) benar-benar tidak berjalan.
    // ==========================================

    PreviewFrame.prototype.isStopped = function () {
        return this._stopped;
    };

    PreviewFrame.prototype.stop = function () {
        if (!this._mounted || this._stopped) return;
        this._destroyPreviewElement();
        this._hideLoader();
        this._hideError();
        this._stopped = true;
        this._showStopped();
        this._updateStopBtn();
        // SESUDAH _stopped diset. _hideLoader() di atas kini ikut menulis status,
        // jadi tanpa baris ini pesan "Preview dihentikan" langsung tertimpa
        // "dimuat" — dan pesan itu memang nyaris tak pernah terlihat sebelumnya,
        // karena satu-satunya penulis status dulu hanyalah sendConfig().
        this._updateStatus();
    };

    PreviewFrame.prototype.resume = function () {
        if (!this._mounted || !this._stopped) return;
        // _createPreviewElement() mengatur ulang _stopped/overlay/tombol sendiri.
        this._createPreviewElement();
        if (this._config) this.sendConfig(this._config);
    };

    PreviewFrame.prototype._showStopped = function () {
        if (this._stoppedEl) this._stoppedEl.classList.remove('hidden');
    };

    PreviewFrame.prototype._hideStopped = function () {
        if (this._stoppedEl) this._stoppedEl.classList.add('hidden');
    };

    PreviewFrame.prototype._updateStopBtn = function () {
        if (!this._stopBtnEl) return;
        this._stopBtnEl.textContent = this._stopped ? '▶' : '■';
        this._stopBtnEl.title = this._stopped ? 'Lanjutkan preview' : 'Hentikan preview (buang iframe/webview)';
        this._stopBtnEl.classList.toggle('pf-ctrl-btn-active', this._stopped);
    };

    // ==========================================
    // SCALING
    // ==========================================

    // Batas tinggi viewport. Bawah menjaga preview tetap berguna; atas menjaga
    // form/daftar scene di bawahnya tak habis tergencet.
    var TINGGI_MIN = 160;
    function _tinggiMaks() { return Math.max(TINGGI_MIN + 80, window.innerHeight - 180); }

    /**
     * Pasang gagang tarik tinggi preview.
     *
     * Dua hal yang WAJIB ada di sini, dan keduanya karena elemen yang ditumpangi
     * adalah <webview> (proses terpisah), bukan div biasa:
     *
     *   1. `setPointerCapture` — tanpa ini, begitu kursor bergerak masuk ke area
     *      webview, pointer event berpindah ke guest dan tarikan mati di tengah.
     *   2. `pointer-events: none` pada elemen preview selama tarikan — jaring
     *      pengaman kedua untuk hal yang sama, sekaligus mencegah guest ikut
     *      bereaksi (mis. dialog maju) hanya karena kursor melintas di atasnya.
     *
     * Klik ganda mengembalikan tinggi bawaan. Itu bukan hiasan: tarikan tersimpan
     * lintas sesi, jadi harus ada jalan pulang yang tak menuntut ketelitian tangan.
     */
    PreviewFrame.prototype._pasangGagangTinggi = function () {
        var gagang = this._gagangEl;
        var viewport = this._viewportEl;
        if (!gagang || !viewport) return;

        var self = this;
        var mulaiY = 0;
        var mulaiTinggi = 0;
        var menarik = false;

        function elemenPreview() { return self._iframe || self._webview; }

        function setTinggi(px) {
            var maks = _tinggiMaks();
            var akhir = Math.max(TINGGI_MIN, Math.min(maks, px));
            viewport.style.height = Math.round(akhir) + 'px';
        }

        function onDown(e) {
            if (e.button !== undefined && e.button !== 0) return;
            menarik = true;
            mulaiY = e.clientY;
            mulaiTinggi = viewport.getBoundingClientRect().height;
            gagang.classList.add('pf-resize-handle-aktif');
            document.body.classList.add('pf-resizing');
            var el = elemenPreview();
            if (el) el.style.pointerEvents = 'none';
            try { gagang.setPointerCapture(e.pointerId); } catch (err) { /* UA lama */ }
            e.preventDefault();
        }

        function onMove(e) {
            if (!menarik) return;
            setTinggi(mulaiTinggi + (e.clientY - mulaiY));
            e.preventDefault();
        }

        function onUp(e) {
            if (!menarik) return;
            menarik = false;
            gagang.classList.remove('pf-resize-handle-aktif');
            document.body.classList.remove('pf-resizing');
            var el = elemenPreview();
            if (el) el.style.pointerEvents = '';
            try { gagang.releasePointerCapture(e.pointerId); } catch (err) { /* sudah lepas */ }
            self._simpanTinggiTarikan();
        }

        function onReset() {
            viewport.style.height = '';
            try { localStorage.removeItem('vneditor-preview-h-' + self._containerId); }
            catch (err) { /* preferensi gagal dihapus bukan alasan menggagalkan reset */ }
            self._rescale();
        }

        // Keyboard: gagang ini fokusable, jadi ia harus bisa dipakai tanpa tetikus.
        function onKey(e) {
            var langkah = e.shiftKey ? 40 : 12;
            if (e.key === 'ArrowUp') { setTinggi(viewport.getBoundingClientRect().height - langkah); }
            else if (e.key === 'ArrowDown') { setTinggi(viewport.getBoundingClientRect().height + langkah); }
            else if (e.key === 'Home') { onReset(); return; }
            else return;
            e.preventDefault();
            self._simpanTinggiTarikan();
        }

        gagang.addEventListener('pointerdown', onDown);
        gagang.addEventListener('pointermove', onMove);
        gagang.addEventListener('pointerup', onUp);
        gagang.addEventListener('pointercancel', onUp);
        gagang.addEventListener('dblclick', onReset);
        gagang.addEventListener('keydown', onKey);

        this._lepasGagang = function () {
            // Bongkar di tengah tarikan tak boleh meninggalkan kursor ns-resize
            // terkunci untuk SELURUH aplikasi.
            document.body.classList.remove('pf-resizing');
            gagang.removeEventListener('pointerdown', onDown);
            gagang.removeEventListener('pointermove', onMove);
            gagang.removeEventListener('pointerup', onUp);
            gagang.removeEventListener('pointercancel', onUp);
            gagang.removeEventListener('dblclick', onReset);
            gagang.removeEventListener('keydown', onKey);
        };
    };

    /**
     * Simpan tinggi viewport yang DITARIK kreator (lewat gagang di atas).
     *
     * Ditunda 400 ms karena menarik memicu puluhan kali per detik — pola yang
     * sama dengan penulis theme.css. Hanya tinggi hasil TARIKAN yang disimpan:
     * `style.height` inline cuma terisi kalau gagang menuliskannya, jadi tinggi
     * bawaan dari CSS tak pernah ikut terkunci — dan klik ganda pada gagang
     * mengosongkannya lagi, mengembalikan preview ke bawaan.
     */
    PreviewFrame.prototype._simpanTinggiTarikan = function () {
        var el = this._viewportEl;
        if (!el || !el.style.height) return;
        var self = this;
        clearTimeout(this._tinggiTimer);
        this._tinggiTimer = setTimeout(function () {
            try {
                localStorage.setItem('vneditor-preview-h-' + self._containerId, el.style.height);
            } catch (e) { /* preferensi gagal disimpan bukan alasan menggagalkan tarikan */ }
        }, 400);
    };

    PreviewFrame.prototype._terapkanTinggiTersimpan = function () {
        if (!this._viewportEl) return;
        var h = null;
        try { h = localStorage.getItem('vneditor-preview-h-' + this._containerId); }
        catch (e) { return; }
        // Nilai aneh dari sesi lama tak boleh mengunci preview jadi tak terpakai.
        if (h && /^\d+(\.\d+)?px$/.test(h) && parseFloat(h) >= 160) {
            this._viewportEl.style.height = h;
        }
    };

    PreviewFrame.prototype._rescale = function () {
        if (!this._viewportEl) return;
        this._simpanTinggiTarikan();

        var el = this._iframe || this._webview;
        if (!el) return;

        var w = this._viewportEl.clientWidth;
        var h = this._viewportEl.clientHeight;
        if (w <= 0 || h <= 0) return;

        var acuan = _kanvasAcuan();
        // Ukuran elemen ikut disegarkan di sini, bukan hanya saat dibuat. Kreator
        // yang mengubah target viewport di Profil harus melihat bentuk barunya
        // TANPA preview dibongkar-pasang — pelajaran Freeze/OOM: tiap pembongkaran
        // memuat ulang player beserta asetnya.
        if (el.style.width !== acuan.w + 'px') el.style.width = acuan.w + 'px';
        if (el.style.height !== acuan.h + 'px') el.style.height = acuan.h + 'px';

        var scale = Math.min(w / acuan.w, h / acuan.h);
        var scaledW = acuan.w * scale;
        var offsetX = Math.max(0, (w - scaledW) / 2);
        el.style.transformOrigin = 'top left';
        el.style.transform = 'translate(' + offsetX + 'px, 0) scale(' + scale + ')';

        if (this._scaleLabel) {
            this._scaleLabel.textContent = Math.round(scale * 100) + '%';
        }
    };

    // ==========================================
    // UI HELPERS
    // ==========================================

    PreviewFrame.prototype._showLoader = function () {
        if (this._loaderEl) this._loaderEl.classList.remove('hidden');
        this._loading = true;
    };

    PreviewFrame.prototype._hideLoader = function () {
        // Corong "preview kini menampilkan sesuatu" — dipakai webview (dom-ready),
        // iframe (load), maupun jalur ready lewat ipc-message.
        this._updateStatus('muat');
        if (this._loaderEl) this._loaderEl.classList.add('hidden');
        this._loading = false;
    };

    // Satu CORONG. `did-fail-load` dan `preview:error` sama-sama bermuara ke sini,
    // jadi mencatat di sini berarti tepat satu entri per kegagalan — bukan dua
    // dengan kata-kata yang sedikit berbeda.
    PreviewFrame.prototype._showError = function (msg) {
        this._diagCatat('error', String(msg || 'Preview gagal'));
        this._hideLoader();
        if (this._errorEl) {
            var textEl = this._errorEl.querySelector('.pf-error-text');
            if (textEl) textEl.textContent = msg;
            this._errorEl.classList.remove('hidden');
        }
    };

    PreviewFrame.prototype._hideError = function () {
        if (this._errorEl) this._errorEl.classList.add('hidden');
    };

    PreviewFrame.prototype._escapeAttr = function (str) {
        return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    };

    // ==========================================
    // MODE BADGE — Indicator label
    // ==========================================

    // Label badge tambahan untuk mode non-toggle (mis. static dari hub code editor).
    var _extraBadgeLabels = {
        'static': { label: 'Statis', tip: 'Pratinjau visual saja, tidak interaktif' }
    };

    PreviewFrame.prototype._badgeInfoFor = function (id) {
        for (var i = 0; i < this._modes.length; i++) {
            if (this._modes[i].id === id) {
                return { label: this._modes[i].label, tip: this._modes[i].title || '', cls: 'pf-badge-' + id };
            }
        }
        if (_extraBadgeLabels[id]) return { label: _extraBadgeLabels[id].label, tip: _extraBadgeLabels[id].tip, cls: 'pf-badge-' + id };
        return { label: id, tip: '', cls: 'pf-badge-' + id };
    };

    PreviewFrame.prototype._updateModeBadge = function () {
        if (!this._modeBadgeEl) return;
        var info = this._badgeInfoFor(this._mode);
        this._modeBadgeEl.className = 'pf-mode-badge ' + info.cls;
        this._modeBadgeEl.textContent = info.label;
        this._modeBadgeEl.title = info.tip;
    };

    // Set badge mode eksternal (mis. static untuk hub code editor).
    PreviewFrame.prototype.setBadgeMode = function (mode) {
        this._badgeOverride = mode;
        if (this._modeBadgeEl) {
            var info = this._badgeInfoFor(mode);
            this._modeBadgeEl.className = 'pf-mode-badge ' + info.cls;
            this._modeBadgeEl.textContent = info.label;
            this._modeBadgeEl.title = info.tip;
        }
    };

    // ==========================================
    // EXPORT
    // ==========================================

    window.VN = window.VN || {};
    window.VN.PreviewFrame = PreviewFrame;

    // Dipanggil `novelViewportEditor.js` ketika kreator mengubah target viewport.
    // Nol pembongkaran DOM — hanya transform yang dihitung ulang.
    window._vnPreviewRescaleAll = function () {
        _instances.forEach(function (pf) {
            try { pf._rescale(); } catch (e) { /* instance sudah dibuang */ }
        });
    };

})();
