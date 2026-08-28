/**
 * VN Player — Audio Manager
 * Pengelolaan BGM, SFX, dan Voice dengan Web Audio API (pan support).
 * Semua fungsi audio diekspos melalui VNAudio global.
 */

const VNAudio = (() => {
    const { dom, state } = VNState;

    // Enable fallback mode
    function enableFallbackMode() {
        state.audioFallbackMode = true;
        console.warn("[Audio] Beralih ke HTML5 Audio fallback mode");
        VNState.showToast('Audio menggunakan mode kompatibilitas', 'warn', 3000);
    }

    // Inisialisasi AudioContext
    function ensureAudioContext() {
        // Jika sudah fallback, skip Web Audio API
        if (state.audioFallbackMode) return false;
        
        if (state.audioContext && state.audioContext.state !== 'closed') {
            if (state.audioContext.state === 'suspended') {
                state.audioContext.resume().catch(e => {
                    console.error("Gagal resume AudioContext:", e);
                    enableFallbackMode();
                });
            }
            return true;
        }
        try {
            console.log("[WebAudio] Membuat AudioContext baru...");
            // Jika context lama ditutup, invalidasi semua source yang sudah ada
            state.bgmSource = null;
            state.bgmPanner = null;
            state.sfxSource = null;
            state.sfxPanner = null;
            state.voiceSource = null;
            state.voicePanner = null;
            state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            console.log("[WebAudio] AudioContext berhasil dibuat");
            return true;
        } catch (e) {
            console.error("[WebAudio] Gagal membuat AudioContext:", e);
            enableFallbackMode();
            return false;
        }
    }

    // Normalisasi src BGM → href absolut PERSIS seperti yang disimpan browser
    // di audio.src (parser URL menghapus segmen '../', meng-encode spasi, dll).
    // Dedupe lama pakai endsWith(src) — selalu gagal untuk path relatif
    // antar-folder seperti '../shared/bgm/x.mp3' sehingga BGM yang sama
    // dianggap baru dan di-restart dari 0 di setiap entri.
    function resolveBgmHref(src) {
        const resolved = resolveAssetPath(src);
        try { return new URL(resolved, document.baseURI).href; } catch (e) { return resolved; }
    }

    // === BGM FALLBACK ===
    // `opts` (fade/loop) ikut dihormati DI SINI JUGA — kalau hanya jalur Web Audio yang
    // mendapatnya, satu fitur akan berperilaku beda di dua jalur: itu anatomi B1 yang
    // sudah pernah mahal di proyek ini (dua cascade dengan urutan berlawanan).
    function playBGMFallback(src, volume, delay, opts) {
        const fadeMs = _fadeMs(opts && opts.fade);
        const playAudio = () => {
            if (opts && opts.loop !== undefined) dom.bgmAudio.loop = opts.loop !== false;
            else dom.bgmAudio.loop = true;

            if (!src) {
                // Stop BGM (paritas dengan jalur Web Audio)
                const hentikan = () => {
                    if (!dom.bgmAudio.paused) { dom.bgmAudio.pause(); }
                    if (dom.bgmAudio.src) {
                        dom.bgmAudio.currentTime = 0;
                        dom.bgmAudio.removeAttribute('src');
                    }
                    state.originalPhaseBgmVolume = 0.5;
                };
                if (fadeMs > 0 && !dom.bgmAudio.paused && dom.bgmAudio.volume > 0) {
                    _fadeTo(dom.bgmAudio, 0, fadeMs, hentikan);
                } else { _cancelFade(dom.bgmAudio); hentikan(); }
                return;
            }

            const targetHref = resolveBgmHref(src);
            const baseVolume = (volume !== undefined) ? volume : 0.5;
            const finalVolume = baseVolume * state.bgmVolumeMultiplier * state.globalVolume;
            dom.bgmAudio.dataset.baseVolume = baseVolume;
            state.originalPhaseBgmVolume = baseVolume;

            // BGM sama — jangan restart; cukup samakan volume (resume bila pause).
            if (dom.bgmAudio.src === targetHref) {
                _cancelFade(dom.bgmAudio);
                dom.bgmAudio.volume = finalVolume;
                if (dom.bgmAudio.paused && dom.bgmAudio.duration > 0) {
                    dom.bgmAudio.play().catch(e => console.error("Gagal resume BGM (fallback):", e));
                }
                return;
            }

            const mulai = () => {
                dom.bgmAudio.src = targetHref;
                if (fadeMs > 0) {
                    dom.bgmAudio.volume = 0;
                    _fadeTo(dom.bgmAudio, finalVolume, fadeMs);
                } else {
                    dom.bgmAudio.volume = finalVolume;
                }
                dom.bgmAudio.play().catch(e => {
                    console.error("Gagal play BGM (fallback):", e);
                });
            };
            if (fadeMs > 0 && !dom.bgmAudio.paused && dom.bgmAudio.volume > 0) {
                _fadeTo(dom.bgmAudio, 0, fadeMs, mulai);
            } else { _cancelFade(dom.bgmAudio); mulai(); }
        };

        const finalDelay = delay || 0;
        if (finalDelay > 0) {
            setTimeout(playAudio, finalDelay);
        } else {
            playAudio();
        }
    }

    // === BGM LOOP-POINT (2026-07-10, findings §4) ===
    // `bgmLoopStart`/`bgmLoopEnd` (detik) pada entri: setelah putaran pertama, musik
    // mengulang dari `loopStart` (intro tidak diulang) dan/atau memotong di `loopEnd`.
    // Dicek via interval 40ms (bukan 'timeupdate' yang hanya ~4x/detik — terlalu
    // kasar; loop native <audio loop> bisa keburu wrap ke 0 dan mengulang intro).
    let _bgmLoop = { start: 0, end: null };
    let _bgmLoopTimer = null;

    function _applyBgmLoopPoints(loopStart, loopEnd) {
        _bgmLoop.start = Number(loopStart) > 0 ? Number(loopStart) : 0;
        _bgmLoop.end = Number(loopEnd) > 0 ? Number(loopEnd) : null;
        const active = _bgmLoop.start > 0 || _bgmLoop.end !== null;
        if (_bgmLoopTimer) { clearInterval(_bgmLoopTimer); _bgmLoopTimer = null; }
        if (!active) return;
        _bgmLoopTimer = setInterval(() => {
            const a = dom.bgmAudio;
            if (!a || a.paused || !a.duration) return;
            const end = _bgmLoop.end !== null ? _bgmLoop.end : (a.duration - 0.06);
            if (a.currentTime >= end) {
                a.currentTime = _bgmLoop.start;
            } else if (_bgmLoop.start > 0 && a.currentTime < _bgmLoop.start && a.dataset.vnPassedLoopStart === '1') {
                // loop native keburu wrap ke 0 — koreksi kembali ke titik loop
                a.currentTime = _bgmLoop.start;
            }
            if (a.currentTime >= _bgmLoop.start) a.dataset.vnPassedLoopStart = '1';
        }, 40);
    }

    // === FADE (primitif volume — G1) ===
    //
    // `bgmFade` sudah lama ditulis editor dan dibawa `core.js` di `lastBgmState`, tapi
    // renderer TIDAK PERNAH membacanya: 48 entri di novel shipped menyetel fade yang
    // dibuang senyap. Ini §A pada sumbu audio.
    //
    // Diimplementasi lewat interval, bukan gain node Web Audio: (a) jalur fallback
    // (tanpa AudioContext) harus ikut mendapat fade — kalau tidak, fitur ini hidup di
    // satu jalur dan mati di jalur lain, anatomi B1; (b) satu primitif dipakai BGM
    // maupun channel bernama, jadi crossfade nanti tak butuh mekanisme kedua.
    const _FADE_TICK = 40;                 // sama dengan interval loop-point
    const _fadeTimers = new WeakMap();     // el → timer, supaya fade beruntun tak bertumpuk

    function _cancelFade(el) {
        const t = _fadeTimers.get(el);
        if (t) { clearInterval(t); _fadeTimers.delete(el); }
    }

    /**
     * Geser volume `el` ke `target` selama `ms`, lalu jalankan `onDone`.
     * ms <= 0 → langsung (tanpa timer), sehingga pemanggil tak perlu bercabang.
     */
    function _fadeTo(el, target, ms, onDone) {
        if (!el) { if (onDone) onDone(); return; }
        _cancelFade(el);
        const tujuan = Math.max(0, Math.min(1, target));
        if (!(ms > 0)) { el.volume = tujuan; if (onDone) onDone(); return; }
        const awal = el.volume;
        const langkah = (tujuan - awal) / Math.max(1, Math.round(ms / _FADE_TICK));
        const timer = setInterval(() => {
            const berikut = el.volume + langkah;
            const selesai = (langkah >= 0) ? (berikut >= tujuan) : (berikut <= tujuan);
            el.volume = selesai ? tujuan : Math.max(0, Math.min(1, berikut));
            if (selesai) { _cancelFade(el); if (onDone) onDone(); }
        }, _FADE_TICK);
        _fadeTimers.set(el, timer);
    }

    // `fade` dari entri dinyatakan dalam DETIK (satuan yang dipakai editor & script.json).
    function _fadeMs(fade) {
        const n = Number(fade);
        return (isFinite(n) && n > 0) ? n * 1000 : 0;
    }

    // === AMBIENT (channel kedua ber-loop — findings §4) ===
    // Suasana latar (hujan, keramaian) yang hidup BERDAMPINGAN dengan BGM.
    // Elemen dibuat lazy agar tidak menuntut perubahan player.html.
    let _ambientEl = null;
    function _ensureAmbientEl() {
        if (_ambientEl && _ambientEl.isConnected) return _ambientEl;
        _ambientEl = document.createElement('audio');
        _ambientEl.id = 'ambient-audio';
        _ambientEl.loop = true;
        document.body.appendChild(_ambientEl);
        return _ambientEl;
    }

    function playAmbient(src, volume) {
        const el = _ensureAmbientEl();
        if (!src) {
            if (!el.paused) el.pause();
            if (el.src) { el.currentTime = 0; el.removeAttribute('src'); }
            return;
        }
        const targetHref = resolveBgmHref(src);
        const baseVolume = (volume !== undefined) ? volume : 0.5;
        el.dataset.baseVolume = baseVolume;
        el.volume = Math.min(1, baseVolume * state.bgmVolumeMultiplier * state.globalVolume);
        if (el.src === targetHref) {
            if (el.paused && el.duration > 0) el.play().catch(() => {});
            return;
        }
        el.src = targetHref;
        el.play().catch(e => console.error('Gagal play ambient:', e));
    }

    // === CHANNEL AUDIO BERNAMA (G1 bagian 2) ===
    //
    // `ambient` sudah membuktikan modelnya: channel loop kedua yang hidup berdampingan
    // dengan BGM. Yang kurang cuma NAMANYA — ia hardcoded satu. Bagian ini
    // menggeneralisasinya jadi registry ber-nama, sehingga mis. `musicpoem` bisa hidup
    // bersamaan dengan BGM tanpa custom runtime (kasus DDLC yang memicu G1).
    //
    // `bgm` & `ambient` SENGAJA ditolak sebagai nama channel: keduanya sudah punya
    // field sendiri dan elemennya sendiri. Mengizinkannya berarti dua penulis untuk satu
    // elemen — anatomi B1 yang berulang kali mahal di proyek ini.
    const _CH_RESERVED = ['bgm', 'ambient'];
    const _channels = new Map();   // nama → { el, queue, qIndex, baseVolume }
    let _chReservedWarned = false;

    function _chValidName(nama) {
        if (!nama || typeof nama !== 'string') return false;
        if (_CH_RESERVED.indexOf(nama) >= 0) {
            if (!_chReservedWarned) {
                _chReservedWarned = true;
                console.warn('[VN Audio] Nama channel "' + nama + '" dipakai engine (punya field sendiri) — entri diabaikan.');
            }
            return false;
        }
        return /^[\w-]+$/.test(nama);
    }

    function _chGet(nama) {
        let c = _channels.get(nama);
        if (c && c.el && c.el.isConnected) return c;
        const el = document.createElement('audio');
        el.id = 'vn-channel-' + nama;
        el.dataset.vnChannel = nama;
        document.body.appendChild(el);
        c = { el: el, queue: null, qIndex: 0, baseVolume: 0.5 };
        _channels.set(nama, c);
        return c;
    }

    function _chFinalVolume(base) {
        const b = (base !== undefined && base !== null) ? Number(base) : 0.5;
        return Math.max(0, Math.min(1, b * state.bgmVolumeMultiplier * state.globalVolume));
    }

    /**
     * Mainkan/ubah satu channel bernama.
     * @param {string} nama
     * @param {{src?:string, volume?:number, loop?:boolean, fade?:number, queue?:string[]}} opts
     *
     * `queue` = playlist: track berpindah saat 'ended'. Karena itu channel ber-queue
     * TIDAK memakai atribut `loop` native (loop native berarti 'ended' tak pernah
     * terpicu — pelajaran yang sama dengan BGM one-shot di findings §6); pengulangan
     * daftar diatur di sini lewat `loop`.
     */
    function playChannel(nama, opts) {
        if (!_chValidName(nama)) return;
        const o = opts || {};
        const c = _chGet(nama);
        const fadeMs = _fadeMs(o.fade);
        const daftar = Array.isArray(o.queue) ? o.queue.filter(Boolean) : null;

        if (!o.src && !(daftar && daftar.length)) { stopChannel(nama, o.fade); return; }

        c.baseVolume = (o.volume !== undefined) ? o.volume : c.baseVolume;
        const target = _chFinalVolume(c.baseVolume);

        if (daftar && daftar.length) {
            c.queue = daftar;
            c.qIndex = 0;
            c.loopQueue = o.loop !== false;
            c.el.loop = false;                      // 'ended' wajib terpicu utk maju
            c.el.onended = () => {
                if (!c.queue) return;
                c.qIndex += 1;
                if (c.qIndex >= c.queue.length) {
                    if (!c.loopQueue) { c.el.onended = null; return; }
                    c.qIndex = 0;
                }
                _chPlaySrc(c, c.queue[c.qIndex], target, 0);
            };
            _chPlaySrc(c, c.queue[0], target, fadeMs);
            return;
        }

        // Track tunggal — queue sebelumnya (bila ada) dibatalkan.
        c.queue = null; c.el.onended = null;
        c.el.loop = o.loop !== false;
        _chPlaySrc(c, o.src, target, fadeMs);
    }

    function _chPlaySrc(c, src, target, fadeMs) {
        const href = resolveBgmHref(src);
        const sama = c.el.src === href;
        const mulai = () => {
            if (!sama) c.el.src = href;
            if (fadeMs > 0) { c.el.volume = 0; _fadeTo(c.el, target, fadeMs); }
            else { _cancelFade(c.el); c.el.volume = target; }
            c.el.play().catch(e => console.error('Gagal play channel ' + c.el.dataset.vnChannel + ':', e));
        };
        if (sama && !c.el.paused) {         // track sama & masih berbunyi → jangan restart
            _cancelFade(c.el);
            c.el.volume = target;
            return;
        }
        if (fadeMs > 0 && !c.el.paused && c.el.volume > 0) _fadeTo(c.el, 0, fadeMs, mulai);
        else mulai();
    }

    function stopChannel(nama, fade) {
        const c = _channels.get(nama);
        if (!c || !c.el) return;
        const fadeMs = _fadeMs(fade);
        const hentikan = () => {
            c.queue = null; c.el.onended = null;
            if (!c.el.paused) c.el.pause();
            c.el.currentTime = 0;
            c.el.removeAttribute('src');
        };
        if (fadeMs > 0 && !c.el.paused && c.el.volume > 0) _fadeTo(c.el, 0, fadeMs, hentikan);
        else { _cancelFade(c.el); hentikan(); }
    }

    /**
     * Terapkan SELURUH daftar channel satu entri.
     *
     * Payload bersifat otoritatif (pola yang sama dengan bgm/ambient: absen = berhenti),
     * dan `core.js` yang merawat persistensinya lewat `lastChannelState`. Itu yang
     * membuat save/load & rollback ikut benar tanpa mekanisme tambahan.
     */
    function applyAudioChannels(daftar) {
        const diminta = new Map();
        (Array.isArray(daftar) ? daftar : []).forEach((it) => {
            if (it && _chValidName(it.channel)) diminta.set(it.channel, it);
        });
        // Channel aktif yang tak diminta lagi → dihentikan (dengan fade-nya sendiri).
        _channels.forEach((c, nama) => {
            if (!diminta.has(nama) && c.el && c.el.src) stopChannel(nama, c.lastFade);
        });
        diminta.forEach((it, nama) => {
            const c = _chGet(nama);
            c.lastFade = it.fade;
            if (it.stop === true || it.src === 'none') { stopChannel(nama, it.fade); return; }
            playChannel(nama, it);
        });
    }

    function applyChannelVolumes() {
        _channels.forEach((c) => {
            if (c.el && c.el.src) c.el.volume = _chFinalVolume(c.baseVolume);
        });
    }

    // === BGM ===
    // oneShot (opsional): { src, volume, pan, duration } — untuk BGM stinger yang
    // otomatis kembali ke BGM sebelumnya setelah `duration` ms (default 4000ms bila
    // tak diisi). `<audio id="bgm-audio" loop>` di player.html berarti event 'ended'
    // TIDAK PERNAH terpicu untuk BGM (selalu loop) — makanya resume dijadwalkan via
    // setTimeout, bukan menunggu 'ended'. Lihat docs/elaina-vn-build-findings.md §6.
    let _bgmOneShotTimer = null;

    function playBGM(src, volume, delay, pan, oneShot, loopOpts) {
        // Loop-point mengikuti entri BGM aktif; reset flag intro saat src berganti.
        if (loopOpts && (loopOpts.loopStart || loopOpts.loopEnd)) {
            _applyBgmLoopPoints(loopOpts.loopStart, loopOpts.loopEnd);
        } else {
            _applyBgmLoopPoints(0, null);
        }
        if (dom.bgmAudio && src && dom.bgmAudio.src !== (src ? resolveBgmHref(src) : '')) {
            dom.bgmAudio.dataset.vnPassedLoopStart = '';
        }
        // BGM apa pun yang baru (termasuk one-shot lain / stop eksplisit) membatalkan
        // rencana resume yang mungkin masih tertunda dari sting sebelumnya.
        if (_bgmOneShotTimer) { clearTimeout(_bgmOneShotTimer); _bgmOneShotTimer = null; }

        if (oneShot) {
            const durationMs = (typeof oneShot.duration === 'number' && oneShot.duration > 0) ? oneShot.duration : 4000;
            _bgmOneShotTimer = setTimeout(() => {
                _bgmOneShotTimer = null;
                playBGM(oneShot.src || null, oneShot.volume, 0, oneShot.pan);
            }, durationMs);
        }

        if (state.audioFallbackMode) {
            // Fallback: gunakan HTML5 Audio tanpa Web Audio API
            playBGMFallback(src, volume, delay, loopOpts);
            return;
        }

        if (!ensureAudioContext()) {
            playBGMFallback(src, volume, delay, loopOpts);
            return;
        }

        const playAudio = () => {
            if (!state.bgmSource) {
                try {
                    state.bgmSource = state.audioContext.createMediaElementSource(dom.bgmAudio);
                    state.bgmPanner = state.audioContext.createStereoPanner();
                    state.bgmSource.connect(state.bgmPanner).connect(state.audioContext.destination);
                    console.log("[WebAudio] Node BGM terhubung.");
                } catch (e) {
                    console.error("[WebAudio] Gagal membuat node BGM:", e);
                    state.bgmSource = null;
                    state.bgmPanner = null;
                    return;
                }
            }

            // Bandingkan URL ternormalisasi, bukan endsWith string mentah —
            // audio.src yang dibaca balik sudah dinormalkan browser ('../' hilang).
            const targetHref = src ? resolveBgmHref(src) : null;
            const isSameBgm = !!(targetHref && dom.bgmAudio.src === targetHref);
            const baseVolume = (volume !== undefined) ? volume : 0.5;
            const finalVolume = baseVolume * state.bgmVolumeMultiplier * state.globalVolume;
            dom.bgmAudio.dataset.baseVolume = baseVolume;

            // Pan
            if (state.bgmPanner && pan !== undefined) {
                state.bgmPanner.pan.value = pan;
            } else if (state.bgmPanner) {
                state.bgmPanner.pan.value = 0;
            }

            // `bgmLoop: false` dulu juga diabaikan — `<audio id="bgm-audio" loop>` di
            // markup hardcoded dan renderer tak pernah menyentuh `.loop`, jadi 6 entri
            // shipped yang minta "putar sekali lalu berhenti" tetap mengulang selamanya.
            // Diset per-entri di sini, bukan di markup, supaya keputusannya milik skrip.
            if (loopOpts && loopOpts.loop !== undefined) {
                dom.bgmAudio.loop = loopOpts.loop !== false;
            } else {
                dom.bgmAudio.loop = true;   // default lama dipertahankan
            }
            const fadeMs = _fadeMs(loopOpts && loopOpts.fade);

            // BGM baru
            if (src && !isSameBgm) {
                state.originalPhaseBgmVolume = (volume !== undefined) ? volume : 0.5;
                const mulaiTrackBaru = () => {
                    dom.bgmAudio.src = targetHref;
                    if (state.isPhaseBgmCurrentlyMuted) {
                        dom.bgmAudio.volume = 0;
                    } else if (fadeMs > 0) {
                        // Mulai dari senyap lalu naik — tanpa ini "fade" hanya terasa
                        // pada track lama dan track baru masuk mendadak.
                        dom.bgmAudio.volume = 0;
                        _fadeTo(dom.bgmAudio, finalVolume, fadeMs);
                    } else {
                        dom.bgmAudio.volume = finalVolume;
                    }
                    console.log(`%c[AUDIO] BGM BARU: '${src}'. Vol: ${finalVolume.toFixed(2)}${fadeMs ? ` (fade ${fadeMs}ms)` : ''}`, 'color: #90EE90; font-weight:bold;');
                    dom.bgmAudio.play().catch(e => console.error("Gagal play BGM:", e));
                };
                // Track lama diredam dulu bila ada yang sedang berbunyi → itulah
                // crossfade sederhana antar-BGM (fade-out lalu fade-in).
                if (fadeMs > 0 && !dom.bgmAudio.paused && dom.bgmAudio.volume > 0) {
                    _fadeTo(dom.bgmAudio, 0, fadeMs, mulaiTrackBaru);
                } else {
                    _cancelFade(dom.bgmAudio);
                    mulaiTrackBaru();
                }

            } else if (src && isSameBgm) {
                // BGM sama — update volume saja (jangan reset posisi putar).
                // bgmVolumeMultiplier ikut dihitung (dulu terlewat → volume
                // melompat naik bagi pemain yang set volume musik < 100%).
                state.originalPhaseBgmVolume = (volume !== undefined) ? volume : state.originalPhaseBgmVolume;
                const newFinalVolume = state.originalPhaseBgmVolume * state.bgmVolumeMultiplier * state.globalVolume;

                if (!state.isPhaseBgmCurrentlyMuted) {
                    if (dom.bgmAudio.volume !== newFinalVolume) {
                        dom.bgmAudio.volume = newFinalVolume;
                    }
                } else {
                    dom.bgmAudio.volume = 0;
                }
                if (dom.bgmAudio.paused && dom.bgmAudio.duration > 0) {
                    dom.bgmAudio.play().catch(e => console.error("Gagal resume BGM:", e));
                }

            } else if (!src) {
                // Stop BGM — dengan fade bila entri memintanya (dulu selalu mendadak).
                if (state.isPhaseBgmCurrentlyMuted) {
                    dom.bgmAudio.volume = 0;
                } else {
                    const hentikan = () => {
                        if (!dom.bgmAudio.paused) { dom.bgmAudio.pause(); }
                        dom.bgmAudio.currentTime = 0;
                        dom.bgmAudio.removeAttribute('src');
                        state.originalPhaseBgmVolume = 0.5;
                    };
                    if (fadeMs > 0 && !dom.bgmAudio.paused && dom.bgmAudio.volume > 0) {
                        _fadeTo(dom.bgmAudio, 0, fadeMs, hentikan);
                    } else {
                        _cancelFade(dom.bgmAudio);
                        hentikan();
                    }
                }
            }
        };

        const finalDelay = delay || 0;
        if (finalDelay > 0) {
            setTimeout(playAudio, finalDelay);
        } else {
            playAudio();
        }
    }

    // === SFX FALLBACK ===
    function playSFXFallback(src, volume, delay) {
        const playAudio = () => {
            dom.sfxAudio.src = resolveAssetPath(src);
            const baseVolume = (volume !== undefined) ? volume : 0.8;
            dom.sfxAudio.volume = baseVolume * state.sfxVolumeMultiplier * state.globalVolume;
            dom.sfxAudio.play().catch(e => {
                console.error("Gagal play SFX (fallback):", e);
            });
        };
        
        const finalDelay = delay || 0;
        if (finalDelay > 0) {
            setTimeout(playAudio, finalDelay);
        } else {
            playAudio();
        }
    }

    // === SFX ===
    function playSFX(src, volume, delay, pan) {
        if (!src) return;
        
        if (state.audioFallbackMode) {
            playSFXFallback(src, volume, delay);
            return;
        }
        
        if (!ensureAudioContext()) {
            playSFXFallback(src, volume, delay);
            return;
        }

        const playAudio = () => {
            if (!state.sfxSource) {
                try {
                    state.sfxSource = state.audioContext.createMediaElementSource(dom.sfxAudio);
                    state.sfxPanner = state.audioContext.createStereoPanner();
                    state.sfxSource.connect(state.sfxPanner).connect(state.audioContext.destination);
                } catch (e) {
                    console.error("[WebAudio] Gagal membuat node SFX:", e);
                    state.sfxSource = null;
                    state.sfxPanner = null;
                    return;
                }
            }

            dom.sfxAudio.src = resolveAssetPath(src);
            const baseVolume = (volume !== undefined) ? volume : 0.8;
            dom.sfxAudio.volume = baseVolume * state.sfxVolumeMultiplier * state.globalVolume;

            if (state.sfxPanner && pan !== undefined) {
                state.sfxPanner.pan.value = pan;
            } else if (state.sfxPanner) {
                state.sfxPanner.pan.value = 0;
            }

            dom.sfxAudio.play();
        };

        const finalDelay = delay || 0;
        if (finalDelay > 0) {
            setTimeout(playAudio, finalDelay);
        } else {
            playAudio();
        }
    }

    // === VOICE FALLBACK ===
    function playVoiceFallback(src, volume, delay) {
        const playAudio = () => {
            dom.voiceAudio.src = resolveAssetPath(src);
            const baseVolume = (volume !== undefined) ? volume : 1.0;
            dom.voiceAudio.volume = baseVolume * state.voiceVolumeMultiplier * state.globalVolume;
            dom.voiceAudio.dataset.baseVolume = baseVolume;
            dom.voiceAudio.play().catch(e => {
                console.error("Gagal play Voice (fallback):", e);
            });
        };
        
        const finalDelay = delay || 0;
        if (finalDelay > 0) {
            setTimeout(playAudio, finalDelay);
        } else {
            playAudio();
        }
    }

    // === VOICE ===
    function playVoice(src, volume, delay, pan) {
        if (!src) return;
        
        if (state.audioFallbackMode) {
            playVoiceFallback(src, volume, delay);
            return;
        }
        
        if (!ensureAudioContext()) {
            playVoiceFallback(src, volume, delay);
            return;
        }

        const playAudio = () => {
            if (!state.voiceSource) {
                try {
                    state.voiceSource = state.audioContext.createMediaElementSource(dom.voiceAudio);
                    state.voicePanner = state.audioContext.createStereoPanner();
                    state.voiceSource.connect(state.voicePanner).connect(state.audioContext.destination);
                } catch (e) {
                    console.error("[WebAudio] Gagal membuat node Voice:", e);
                    state.voiceSource = null;
                    state.voicePanner = null;
                    return;
                }
            }

            dom.voiceAudio.src = resolveAssetPath(src);
            const baseVolume = (volume !== undefined) ? volume : 1.0;
            dom.voiceAudio.volume = baseVolume * state.voiceVolumeMultiplier * state.globalVolume;
            dom.voiceAudio.dataset.baseVolume = baseVolume;

            if (state.voicePanner && pan !== undefined) {
                state.voicePanner.pan.value = pan;
            } else if (state.voicePanner) {
                state.voicePanner.pan.value = 0;
            }

            dom.voiceAudio.play();
        };

        const finalDelay = delay || 0;
        if (finalDelay > 0) {
            setTimeout(playAudio, finalDelay);
        } else {
            playAudio();
        }
    }

    // === Volume Settings ===
    function applyVolumeSettings() {
        // Channel bernama ikut slider Musik — kalau tidak, pemain menurunkan volume
        // musik tapi channel kedua tetap keras (kelas keluhan yang sama dgn bgmVolumeMultiplier
        // yang dulu terlewat di cabang BGM-sama).
        applyChannelVolumes();
        if (dom.bgmAudio && !dom.bgmAudio.paused) {
            const baseVolume = dom.bgmAudio.dataset.baseVolume || 1;
            dom.bgmAudio.volume = Math.min(1, parseFloat(baseVolume) * state.bgmVolumeMultiplier * state.globalVolume);
        }
        if (dom.voiceAudio && !dom.voiceAudio.paused) {
            const baseVolume = dom.voiceAudio.dataset.baseVolume || 1;
            dom.voiceAudio.volume = Math.min(1, parseFloat(baseVolume) * state.voiceVolumeMultiplier * state.globalVolume);
        }
    }

    function loadVolumeSettings() {
        try {
            const saved = localStorage.getItem('vn-player-volume-settings');
            if (saved) {
                const settings = JSON.parse(saved);
                state.bgmVolumeMultiplier = settings.bgm ?? 0.8;
                state.voiceVolumeMultiplier = settings.voice ?? 0.8;
                state.sfxVolumeMultiplier = settings.sfx ?? 0.8;
                if (settings.textSpeed != null) state.TYPE_SPEED = Math.max(10, settings.textSpeed);
                if (settings.autoDelay != null) state.AUTO_MODE_DELAY = Math.max(100, settings.autoDelay);
                console.log('[Settings] Volume dimuat:', settings);
            }
        } catch (e) {
            console.error('[Settings] Gagal memuat settings, menggunakan default:', e);
            state.bgmVolumeMultiplier = 0.8;
            state.voiceVolumeMultiplier = 0.8;
            state.sfxVolumeMultiplier = 0.8;
        }
    }

    function saveVolumeSettings() {
        const settings = {
            bgm: state.bgmVolumeMultiplier,
            voice: state.voiceVolumeMultiplier,
            sfx: state.sfxVolumeMultiplier,
            textSpeed: state.TYPE_SPEED,
            autoDelay: state.AUTO_MODE_DELAY
        };
        localStorage.setItem('vn-player-volume-settings', JSON.stringify(settings));
        console.log('[Settings] Volume disimpan:', settings);
    }

    return {
        ensureAudioContext,
        playBGM,
        playSFX,
        playVoice,
        playAmbient,
        playChannel,
        stopChannel,
        applyAudioChannels,
        applyVolumeSettings,
        loadVolumeSettings,
        saveVolumeSettings,
    };
})();
