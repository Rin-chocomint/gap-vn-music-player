/**
 * VN Player — Display Controller
 * Handler utama untuk rendering konten VN.
 * Menangani: background, video, dialogue, choices, scene types, transitions.
 */

const VNDisplay = (() => {
    const { ipcRenderer } = require('electron');
    const { dom, state } = VNState;

    /**
     * Bungkus path aset jadi nilai CSS `url(...)` yang tahan nama berkas apa pun.
     *
     * Dulu di sini kutipnya dirakit tangan: `url('${resolvedBg}')`. Satu apostrof
     * di nama folder sudah cukup meruntuhkannya — chapter "End - Mina's vengeful
     * sorrow" menutup string CSS tepat di `Mina'`, sisa path jadi sampah, dan
     * Chromium MEMBUANG seluruh deklarasi. Tak ada error di konsol, tak ada
     * gambar rusak: layar cuma hitam padahal script.json-nya benar.
     *
     * `JSON.stringify` memberi string berkutip ganda dengan escape yang persis
     * sama dengan aturan string CSS, jadi apostrof, kutip ganda, maupun backslash
     * ikut selamat. Panel save/load sudah memakai cara ini sejak lama
     * (ui-panels.js) — jalur background-lah yang tertinggal.
     */
    function cssUrl(resolvedPath) {
        return 'url(' + JSON.stringify(resolvedPath) + ')';
    }

    /** Ganti background image dengan fade opsional */
    function changeBackground(newBackground, withFade = true, mode = 'cover') {
        const resolvedBg = resolveAssetPath(newBackground);
        if (!resolvedBg) return;

        // Dibandingkan PERSIS, bukan lewat `includes`: Chromium menormalkan nilai
        // backgroundImage ke bentuk berkutip ganda yang sama dengan keluaran
        // cssUrl(), jadi kesamaan string sudah cukup dan tak bisa cocok separuh.
        const nilaiCss = cssUrl(resolvedBg);
        if (dom.background.style.backgroundImage === nilaiCss) return;

        const bgSize = (mode === 'contain') ? 'contain' : 'cover';

        // Nama aset MENTAH dicatat di dataset supaya pembaca lain (thumbnail slot
        // save) tak perlu membongkar string CSS untuk mendapatkannya kembali.
        dom.background.dataset.src = newBackground;

        if (withFade) {
            dom.backgroundNext.style.backgroundSize = bgSize;
            dom.backgroundNext.style.backgroundImage = nilaiCss;
            dom.backgroundNext.classList.add('visible');
            setTimeout(() => {
                dom.background.style.backgroundSize = bgSize;
                // Dibaca dari backgroundNext, bukan dari nilaiCss yang tertangkap
                // closure: kalau latar berganti lagi sebelum 500 ms habis, yang
                // mendarat harus yang TERBARU, bukan yang menjadwalkan timer ini.
                dom.background.style.backgroundImage = dom.backgroundNext.style.backgroundImage;
                dom.backgroundNext.classList.remove('visible');
            }, 500);
        } else {
            dom.background.style.backgroundSize = bgSize;
            dom.background.style.backgroundImage = nilaiCss;
        }
    }

    /** Tampilkan background gambar (sembunyikan video) */
    function playBackgroundImage(imageSrc, withFade = true, mode = 'cover') {
        if (!imageSrc) return;

        if (dom.backgroundVideo.style.opacity !== '0' || !dom.backgroundVideo.paused) {
            dom.backgroundVideo.style.opacity = 0;
            if (!dom.backgroundVideo.paused) dom.backgroundVideo.pause();
        }
        if (dom.background.style.opacity !== '1') {
            dom.background.style.opacity = 1;
        }
        changeBackground(imageSrc, withFade, mode);
    }

    /** Putar background video (sembunyikan gambar) */
    function playBackgroundVideo(videoSrc, shouldMute = true) {
        if (!videoSrc) return;
        dom.background.style.opacity = 0;
        dom.backgroundNext.classList.remove('visible');
        dom.backgroundVideo.src = resolveAssetPath(videoSrc);
        dom.backgroundVideo.muted = shouldMute;
        dom.backgroundVideo.style.opacity = 1;
        dom.backgroundVideo.play().catch(e => {
            console.error("Gagal memutar video:", e);
            VNState.showToast('Gagal memutar video: ' + (videoSrc.split('/').pop() || videoSrc), 'error');
        });
    }

    // Video load error fallback
    dom.backgroundVideo.addEventListener('error', function () {
        VNState.showToast('Video tidak dapat dimuat.', 'error');
        dom.backgroundVideo.style.opacity = 0;
        dom.background.style.opacity = 1;
    });

    /** Tampilkan text screen overlay */
    function showTextScreen(text, duration) {
        dom.textScreenOverlay.querySelector('p').textContent = text || '';
        dom.textScreenOverlay.style.display = 'flex';

        if (state.isAutoMode) {
            state.autoModeTimeout = setTimeout(() => {
                // JANGAN sembunyikan overlay di sini — itu membuka celah (durasi
                // satu round-trip IPC + separuh transisi masuk entri berikutnya)
                // di mana layar di baliknya (background/sprite) sempat terlihat
                // polos tanpa penutup apa pun sebelum transisi baru menutupinya
                // lagi. renderContent() sudah menyembunyikan overlay ini sendiri
                // (baris atas fungsi), TEPAT saat digerbang oleh transisi entri
                // berikutnya — biarkan itu satu-satunya yang menyembunyikan.
                ipcRenderer.send('vn-engine:request-next-line');
            }, parseInt(duration) || 3000);
        }
    }

    // ---- Timed choice (QTE) — timer aktif saat ini ----
    // Hanya satu choice bertimer boleh aktif pada satu waktu. Disimpan di scope
    // modul agar bisa dibatalkan dari mana pun (pilih manual, render entri baru,
    // keluar dari player). Lihat startChoiceTimer/cancelChoiceTimer.
    let _choiceTimer = null;

    /** Batalkan timer QTE yang sedang berjalan (jika ada) + bersihkan listener. */
    function cancelChoiceTimer() {
        if (!_choiceTimer) return;
        if (_choiceTimer.rafId) cancelAnimationFrame(_choiceTimer.rafId);
        document.removeEventListener('visibilitychange', _choiceTimer.onVisibility);
        _choiceTimer = null;
    }

    /**
     * Jalankan hitung mundur untuk sebuah choice bertimer.
     * @param {HTMLElement} bar   elemen bar yang menyusut (width 100%→0)
     * @param {number} limitMs    durasi total (ms)
     * @param {Function} onExpire dipanggil sekali saat waktu habis
     *
     * Memakai performance.now() + rAF (bukan CSS transition + setTimeout) supaya
     * bisa DIJEDA saat window disembunyikan/kehilangan fokus — membuka menu
     * Settings/Backlog di tengah QTE tidak lagi "membakar" waktu pemain secara
     * tidak adil. Saat document.hidden, startTime digeser maju sebesar durasi
     * jeda sehingga sisa waktu tidak berubah.
     */
    function startChoiceTimer(bar, limitMs, onExpire) {
        cancelChoiceTimer();
        const timer = { rafId: null, expired: false, onVisibility: null };
        _choiceTimer = timer;

        let startTime = performance.now();
        let hiddenAt = 0;

        timer.onVisibility = function () {
            if (document.hidden) {
                hiddenAt = performance.now();
            } else if (hiddenAt) {
                startTime += (performance.now() - hiddenAt); // geser maju = jeda
                hiddenAt = 0;
            }
        };
        document.addEventListener('visibilitychange', timer.onVisibility);

        const tick = function (now) {
            if (timer !== _choiceTimer || timer.expired) return;
            if (document.hidden) { timer.rafId = requestAnimationFrame(tick); return; }
            const elapsed = now - startTime;
            const remaining = Math.max(0, limitMs - elapsed);
            const frac = remaining / limitMs;
            if (bar) {
                bar.style.width = (frac * 100) + '%';
                bar.classList.toggle('urgent', remaining <= 1500);
            }
            if (remaining <= 0) {
                timer.expired = true;
                cancelChoiceTimer();
                onExpire();
                return;
            }
            timer.rafId = requestAnimationFrame(tick);
        };
        timer.rafId = requestAnimationFrame(tick);
    }

    /** Tampilkan pilihan (choice buttons). Mendukung QTE bila data.timeLimit diisi. */
    function displayChoices(choices, entry) {
        cancelChoiceTimer();
        dom.gameContainer.removeEventListener('click', VNInput.handleGameContainerClick);
        dom.makeChoiceContainer.innerHTML = "";
        dom.makeChoiceContainer.classList.remove('timed');

        const timeLimit = entry && typeof entry.timeLimit === 'number' && entry.timeLimit > 0
            ? entry.timeLimit : 0;

        // Kirim pilihan (manual maupun timeout) lewat satu jalur — pastikan timer
        // dibatalkan lebih dulu supaya expiry tidak ikut memicu setelah pemain pilih.
        const commitChoice = (optionIndex) => {
            cancelChoiceTimer();
            // Renderer hanya mengirim intent minimal. `text`, `setVariable`,
            // `condition`, dan `jump` selalu di-resolve ulang dari script canonical
            // oleh main process; choiceToken juga membuat commit one-shot.
            const intent = {
                choiceToken: entry && entry.choiceToken,
                optionIndex
            };
            if (state.isLabelPreviewMode) {
                ipcRenderer.send('vn-engine:preview-label-choice-made', intent);
            } else {
                ipcRenderer.send('vn-engine:choice-made', intent);
            }
            dom.makeChoiceContainer.classList.remove('visible', 'timed');
            dom.gameContainer.addEventListener('click', VNInput.handleGameContainerClick);
        };

        const buttons = [];
        choices.forEach((choice, optionIndex) => {
            const button = document.createElement("button");
            button.className = "choice";
            button.textContent = choice.text;
            button.onclick = (event) => {
                event.stopPropagation();
                commitChoice(optionIndex);
            };
            dom.makeChoiceContainer.appendChild(button);
            buttons.push({ button, choice, optionIndex });
        });

        // QTE: bar hitung mundur + auto-pilih opsi timeout saat waktu habis.
        if (timeLimit) {
            dom.makeChoiceContainer.classList.add('timed');
            const track = document.createElement('div');
            track.className = 'choice-timer-track';
            if (entry.timeLimitLabel) {
                const cap = document.createElement('div');
                cap.className = 'choice-timer-label';
                cap.textContent = entry.timeLimitLabel;
                track.appendChild(cap);
            }
            const bar = document.createElement('div');
            bar.className = 'choice-timer-bar';
            bar.style.width = '100%';
            track.appendChild(bar);
            dom.makeChoiceContainer.appendChild(track);

            // Opsi timeout = yang ber-flag timeout:true (di antara opsi yang LOLOS
            // filter kondisi, jadi selalu valid untuk dipilih). Fallback: opsi
            // terakhir yang tampil — konvensi "ragu = pilihan pasif/terakhir".
            let timeoutEntry = buttons.find(b => b.choice && b.choice.timeout);
            if (!timeoutEntry && buttons.length) timeoutEntry = buttons[buttons.length - 1];

            startChoiceTimer(bar, timeLimit, () => {
                if (!timeoutEntry) return;
                // Kunci input manual selama jendela "reveal" agar klik nyasar tidak
                // memicu choice-made kedua sebelum commit timeout berjalan.
                buttons.forEach(b => { b.button.onclick = null; });
                timeoutEntry.button.classList.add('timed-out');
                buttons.forEach(b => { if (b !== timeoutEntry) b.button.classList.add('dimmed'); });
                // Jeda kecil agar pemain melihat opsi mana yang terpilih otomatis.
                setTimeout(() => commitChoice(timeoutEntry.optionIndex), 420);
            });
        }

        dom.makeChoiceContainer.classList.add('visible');
    }

    /** Tampilkan input teks bebas (choice.inputType === 'text') — mis. nama pemain. */
    function displayTextInput(data) {
        dom.gameContainer.removeEventListener('click', VNInput.handleGameContainerClick);
        dom.makeChoiceContainer.innerHTML = "";
        dom.makeChoiceContainer.classList.add('text-input-mode');

        const form = document.createElement('form');
        form.className = 'choice-text-input-form';

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'choice-text-input';
        input.placeholder = data.placeholder || '';
        input.maxLength = (typeof data.maxLength === 'number' && data.maxLength > 0) ? data.maxLength : 30;
        input.value = data.defaultValue || '';

        const submitBtn = document.createElement('button');
        submitBtn.type = 'submit';
        submitBtn.className = 'choice-text-input-submit';
        submitBtn.textContent = data.submitLabel || 'OK';

        form.appendChild(input);
        form.appendChild(submitBtn);

        const finish = () => {
            dom.makeChoiceContainer.classList.remove('visible', 'text-input-mode');
            dom.gameContainer.addEventListener('click', VNInput.handleGameContainerClick);
        };
        form.addEventListener('submit', (event) => {
            event.preventDefault();
            event.stopPropagation();
            const value = input.value.trim() || (data.defaultValue || '');
            const channel = state.isLabelPreviewMode
                ? 'vn-engine:preview-label-text-input-submitted'
                : 'vn-engine:text-input-submitted';
            ipcRenderer.send(channel, { value });
            finish();
        });

        dom.makeChoiceContainer.appendChild(form);
        dom.makeChoiceContainer.classList.add('visible');
        setTimeout(() => input.focus(), 50);
    }

    /** Handler efek visual sederhana (shake legacy) */
    function handleEffect(effectData) {
        if (!effectData) return;
        if (effectData.name === 'shake') {
            dom.gameContainer.style.animation = `shake ${effectData.duration || 500}ms`;
            setTimeout(() => { dom.gameContainer.style.animation = ''; }, effectData.duration || 500);
        }
    }

    /**
     * Render konten halaman VN — dipanggil oleh transition handler
     */
    function renderContent(data, isHardTransition = false) {
        cancelChoiceTimer(); // amankan: jangan pernah biarkan timer QTE lama nyangkut ke entri baru
        dom.textScreenOverlay.style.display = 'none';

        // Background
        if (isHardTransition && data.background) {
            playBackgroundImage(data.background, false, data.backgroundMode);
        } else if (!isHardTransition && data.background) {
            playBackgroundImage(data.background, true, data.backgroundMode);
        } else if (data.video && data.type !== 'scene') {
            playBackgroundVideo(data.video, true);
        }

        // Sprites
        VNSprites.processCharSprites(data);

        // SFX umum (bukan sfx transisi)
        if (data.type !== 'scene') {
            VNAudio.playSFX(data.sfx, data.sfxVolume, data.sfxDelay, data.sfxPan);
        }

        // BGM Mute Logic
        if (data.mutePhaseBgm === true && dom.bgmAudio.volume > 0 && !dom.bgmAudio.paused) {
            if (!state.isPhaseBgmCurrentlyMuted) {
                state.originalPhaseBgmVolume = dom.bgmAudio.volume;
                dom.bgmAudio.volume = 0;
                state.isPhaseBgmCurrentlyMuted = true;
            }
        }

        // Audio
        // bgmOneShot: sting yang otomatis kembali ke BGM sebelumnya (bgmResumeSrc/
        // bgmResumeVolume/bgmResumePan, dihitung core.js dari lastBgmState SEBELUM
        // entri ini) setelah bgmOneShotDuration ms. Lihat vn-engine/core.js.
        // bgmLoopStart/bgmLoopEnd (detik): loop-point — intro dimainkan sekali,
        // pengulangan mulai dari loopStart (findings §4).
        // bgmFade (detik) & bgmLoop: keduanya sudah lama ditulis editor + dibawa core,
        // tapi renderer tak pernah membacanya (G1). Kini diteruskan ke playBGM.
        VNAudio.playBGM(data.bgm, data.bgmVolume, data.bgmDelay, data.bgmPan, data.bgmOneShot ? {
            src: data.bgmResumeSrc, volume: data.bgmResumeVolume, pan: data.bgmResumePan, duration: data.bgmOneShotDuration
        } : null, {
            loopStart: data.bgmLoopStart, loopEnd: data.bgmLoopEnd,
            fade: data.bgmFade, loop: data.bgmLoop
        });
        // ambient: channel loop kedua (suasana: hujan, keramaian) — hidup berdampingan
        // dengan BGM; "none"/ambientStop dihentikan core sebelum payload sampai sini.
        VNAudio.playAmbient(data.ambient, data.ambientVolume);
        // Channel bernama (G1): daftar otoritatif per entri — channel yang tak lagi
        // disebut dihentikan. Persistensinya dirawat core.js lewat `lastChannelState`,
        // pola yang SAMA dengan bgm/ambient, sehingga save/load & rollback ikut benar.
        VNAudio.applyAudioChannels(data.audioChannels);
        VNAudio.playVoice(data.voice, data.voiceVolume, data.voiceDelay, data.voicePan);
        handleEffect(data.effect);

        // Special Event
        if (data.specialEvent) {
            VNEffects.executeSpecialEvent(data.specialEvent);
        }

        // Custom Command Execution (Fase 4C → Fase 6: VNAPI)
        if (data.type === 'custom' && data.command) {
            const handler = VNRegistry.get('command', data.command);
            if (handler) {
                console.log(`[VNDisplay] Mengeksekusi custom command: ${data.command}`);

                // Watchdog: kontrak command custom mewajibkan handler memanggil
                // 'vn-engine:request-next-line' SENDIRI (termasuk di semua jalur error).
                // Kalau lupa, cerita macet permanen tanpa pesan/timeout/recovery apa pun.
                // Proxy tipis di sini HANYA mengobservasi channel ini — semua channel lain
                // diteruskan apa adanya, bukan monkey-patch global ipcRenderer.
                let _nextLineRequested = false;
                const ipcProxy = new Proxy(ipcRenderer, {
                    get(target, prop) {
                        if (prop === 'send') {
                            return function(channel, ...args) {
                                if (channel === 'vn-engine:request-next-line') _nextLineRequested = true;
                                return target.send(channel, ...args);
                            };
                        }
                        const val = target[prop];
                        return (typeof val === 'function') ? val.bind(target) : val;
                    }
                });

                // Command INTERAKTIF (minigame, teka-teki) sah menunggu input pemain
                // jauh lebih lama dari 8 dtk — watchdog di bawah akan salah-alarm.
                // Handler memanggil `vnapi.markInteractive()` untuk menyatakan "aku
                // yang mengurus lanjutnya; jangan awasi durasi". Kontrak tetap: ia
                // WAJIB memanggil request-next-line saat pemain menuntaskan interaksi.
                let _interactive = false;
                const vnapi = {
                    dom,
                    state,
                    audio: (typeof VNAudio !== 'undefined' ? VNAudio : null),
                    bus: (typeof VNBus !== 'undefined' ? VNBus : null),
                    registry: VNRegistry,
                    ipc: ipcProxy,
                    // Backward compat
                    ipcRenderer: ipcProxy,
                    vnhub: (typeof VNHub !== 'undefined' ? VNHub : null),
                    markInteractive: () => { _interactive = true; }
                };

                handler(data, vnapi);

                const WATCHDOG_MS = 8000;
                setTimeout(() => {
                    if (_nextLineRequested || _interactive) return;
                    console.error(
                        `[VNDisplay] ⚠️ WATCHDOG: Custom command '${data.command}' belum memanggil ` +
                        `'vn-engine:request-next-line' setelah ${WATCHDOG_MS}ms — cerita kemungkinan MACET ` +
                        `PERMANEN. Command ini kemungkinan lupa memenuhi kontrak (wajib request-next-line ` +
                        `di semua jalur, termasuk error). Jalankan window.__vnForceNextLine() di console ini ` +
                        `untuk memaksa lanjut, atau perbaiki command '${data.command}'.`
                    );
                    window.__vnForceNextLine = () => ipcRenderer.send('vn-engine:request-next-line');
                    VNState.showToast(`⚠️ Command '${data.command}' tampak macet (tak lanjut ${WATCHDOG_MS / 1000}s). Lihat console.`, 'error', 6000);
                }, WATCHDOG_MS);

                // Jika command tidak punya teks dialog, dan bukan tipe yang nunggu interaksi lama,
                // engine biasanya butuh dipancing lanjut kecuali di-handle di dalam command.
                // Tapi kita serahkan ke kreator plugin untuk memanggil nextLine jika butuh.
            } else {
                console.warn(`[VNDisplay] Custom command '${data.command}' tidak terdaftar di VNRegistry! skip...`);
                ipcRenderer.send('vn-engine:request-next-line');
            }
        }

        // Dialogue
        if (data.type === 'dialogue' || data.type === 'choice') {
            // Hook: player:before-dialogue — extensions bisa modify speaker/text atau cancel
            const hookResult = VNRegistry.runHooks('player:before-dialogue', {
                speaker: data.speaker, text: data.text, type: data.type, data
            });
            if (hookResult === false) {
                // Hook cancelled dialogue rendering
            } else {
                const speaker = hookResult?.speaker ?? data.speaker;
                const text = hookResult?.text ?? data.text;
                dom.dialogueBox.classList.add('visible');
                dom.characterName.textContent = speaker || "";
                VNTypewriter.typeWriter(text, dom.dialogueText);
                // Hook: player:after-dialogue — notifikasi setelah dialogue dimulai
                VNRegistry.runHooks('player:after-dialogue', { speaker, text, type: data.type });
            }
        } else {
            dom.dialogueBox.classList.remove('visible');
        }

        // Choices — inputType 'text' (mis. isi nama pemain) vs pilihan-ganda biasa
        if (data.type === 'choice' && data.inputType === 'text') {
            displayTextInput(data);
        } else if (data.type === 'choice' && data.choices) {
            displayChoices(data.choices, data);
        }

        // Scene handling
        if (data.type === 'scene') {
            switch (data.sceneType) {
                case 'video':
                    playBackgroundVideo(data.video, data.videoMuted ?? true);
                    break;
                case 'text_screen':
                    showTextScreen(data.text, data.duration);
                    break;
            }

            // Setup transisi keluar
            if (data.transitionOut && data.persistBackground !== true) {
                state.pendingExitTransition = {
                    effect: data.transitionOut,
                    sfx: data.sfxOut,
                    volume: data.sfxOutVolume,
                    delay: data.sfxOutDelay,
                    pan: data.sfxOutPan,
                    nextEffect: data.nextTransition || null
                };
            }
        }

        // Auto mode scheduling
        if (state.isAutoMode && data.duration && data.sceneType !== 'text_screen' && !dom.makeChoiceContainer.classList.contains('visible')) {
            const autoDuration = parseInt(data.duration, 10);
            clearTimeout(state.autoModeTimeout);
            state.autoModeTimeout = setTimeout(() => {
                if (state.isAutoMode) {
                    ipcRenderer.send('vn-engine:request-next-line');
                }
            }, autoDuration);
        }
    }

    return {
        changeBackground,
        playBackgroundImage,
        playBackgroundVideo,
        showTextScreen,
        displayChoices,
        handleEffect,
        renderContent,
    };
})();
