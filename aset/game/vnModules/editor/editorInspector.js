// === editorInspector.js ===
        document.addEventListener('click', (event) => {
            const assetItem = event.target.closest('.asset-item:not(.ganti-btn)');
            const gantiBtn = event.target.closest('.ganti-btn');

            // Klik pada item aset -> buka pratinjau
            if (assetItem && !gantiBtn) {
                const fullPath = assetItem.dataset.fullPath;
                const type = assetItem.dataset.type;
                const relativePath = assetItem.dataset.path;

                // Aset yang diklik DARI DALAM drawer dipratinjau di dalam drawer juga.
                // `showAssetPreview` mengambil alih kanvas dengan menyembunyikan
                // #script-editor-area — perilaku yang benar untuk view Aset Global,
                // tetapi di drawer ia membuat naskah lenyap padahal kreator cuma
                // ingin mengintip satu gambar.
                if (assetItem.closest('#chapter-asset-content') &&
                    typeof window._showChapterAssetPreview === 'function' &&
                    window._showChapterAssetPreview(fullPath, type, relativePath)) {
                    return;
                }

                showAssetPreview(fullPath, type, relativePath);
                return;
            }

            // Klik pada tombol Ganti/Edit
            if (gantiBtn) {
                console.log('[DEBUG] Tombol .ganti-btn DITEMUKAN. Memproses...');
                const assetInfo = {
                    path: gantiBtn.dataset.path,
                    fullPath: gantiBtn.dataset.fullPath,
                    type: gantiBtn.dataset.type
                };
                console.log('[DEBUG] Info aset dari tombol:', assetInfo);

                // Langsung panggil handleReplaceFile, tanpa membuka editor
                console.log('[DEBUG] Memanggil handleReplaceFile secara langsung...');
                handleReplaceFile(assetInfo);

                return; // Hentikan proses setelah ini
            }
        });

        // Listener untuk menutup pratinjau
        closePreviewBtn.addEventListener('click', hideAssetPreview);

        // Listener untuk tombol simpan storyDesc (event delegation karena tombol dibuat dinamis)

        function createAudioControls(keyPrefix, initialData = {}) {
            const initialVolume = initialData[`${keyPrefix}Volume`] ?? 1.0;
            const initialDelay = initialData[`${keyPrefix}Delay`] ?? 0;
            const initialPan = initialData[`${keyPrefix}Pan`] ?? 0;
            const value100 = Math.round(initialVolume * 100);

            const wrapper = document.createElement('div');
            wrapper.className = 'audio-controls-wrapper';
            wrapper.style.cssText = `
        display: flex; flex-direction: column; gap: 8px; margin-top: 5px;
        margin-bottom: 10px; background-color: #222; padding: 10px; border-radius: 5px;
    `;

            // Tata letak baru yang sepenuhnya responsif
            wrapper.innerHTML = `
        <div style="display: flex; align-items: center; gap: 15px; flex-wrap: wrap; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 10px; flex: 1 1 auto; min-width: 150px;">
                <label>Volume:</label>
                <input type="range" class="script-input" data-key="${keyPrefix}Volume" min="0" max="1" step="0.01" value="${initialVolume}" style="width: 100%; min-width: 80px;">
                <span class="volume-percentage">${value100}%</span>
            </div>
            <div style="display: flex; align-items: center; gap: 5px; flex-shrink: 0;">
                <label>Delay (ms):</label>
                <input type="number" class="script-input" data-key="${keyPrefix}Delay" value="${initialDelay}" min="0" step="50" style="width: 70px;">
            </div>
        </div>
        <div style="display: flex; align-items: center; gap: 10px;">
            <label>Pan:</label>
            <span style="font-size: 0.8em;">Kiri</span>
            <input type="range" class="script-input" data-key="${keyPrefix}Pan" min="-1" max="1" step="0.1" value="${initialPan}" style="flex-grow: 1;">
            <span style="font-size: 0.8em;">Kanan</span>
        </div>
    `;

            const slider = wrapper.querySelector(`input[data-key="${keyPrefix}Volume"]`);
            const display = wrapper.querySelector('.volume-percentage');
            slider.addEventListener('input', () => {
                display.textContent = `${Math.round(slider.value * 100)}%`;
            });

            return wrapper;
        }

        function linkAudioInputToVolumeControl(audioInput, volumeWrapper) {
            if (!audioInput || !volumeWrapper) return;

            const toggleVisibility = () => {
                // Cek apakah input memiliki teks (setelah membuang spasi kosong)
                const hasValue = audioInput.value.trim() !== '';
                // Tampilkan slider jika ada teks, sembunyikan jika kosong
                volumeWrapper.style.display = hasValue ? 'flex' : 'none';
            };

            // Panggil sekali untuk mengatur state awal saat kartu dibuat
            toggleVisibility();

            // akan memanggil fungsi di atas setiap kali input berubah
            audioInput.addEventListener('input', toggleVisibility);

            // Kita juga perlu memicu event 'input' saat tombol 'x' diklik
            const clearButton = audioInput.closest('.input-with-clear-wrapper')?.querySelector('.clear-input-btn-inside');
            if (clearButton) {
                clearButton.addEventListener('click', () => {
                    // Beri sedikit jeda agar value input sempat kosong sebelum kita cek
                    setTimeout(toggleVisibility, 0);
                });
            }
        }

        function connectAudioToLiveGraph(audioElement) {
            if (!liveAudioContext) {
                try {
                    liveAudioContext = new (window.AudioContext || window.webkitAudioContext)();
                } catch (e) {
                    console.error("Web Audio API tidak didukung.", e);
                    return;
                }
            }

            if (liveSourceNodes.has(audioElement)) return; // Sudah terhubung, jangan buat ulang

            const source = liveAudioContext.createMediaElementSource(audioElement);
            const panner = liveAudioContext.createStereoPanner();

            source.connect(panner).connect(liveAudioContext.destination);

            liveSourceNodes.set(audioElement, source);
            livePannerNodes.set(audioElement, panner);
        }

        function createAudioPreview(src, previewKey) {
            const container = document.createElement('div');
            container.className = 'audio-preview-container';
            if (previewKey) {
                container.dataset.previewFor = previewKey;
            }

            const audio = document.createElement('audio');
            if (src) {
                const fullSrc = `./visual_novels/${currentlyEditing.novel}/${currentlyEditing.chapter}/${src}?v=${Date.now()}`;
                audio.src = fullSrc;
            }

            const button = document.createElement('button');
            button.className = 'play-pause-btn';
            button.title = 'Pratinjau Audio';
            button.disabled = !src;

            const progressWrapper = document.createElement('div');
            progressWrapper.className = 'progress-wrapper';

            const timeDisplay = document.createElement('span');
            timeDisplay.className = 'time-display';
            timeDisplay.textContent = '0:00 / 0:00';

            const progressBar = document.createElement('div');
            progressBar.className = 'progress-bar';

            const progressDelayFill = document.createElement('div');
            progressDelayFill.className = 'progress-delay-fill';
            const progressFill = document.createElement('div');
            progressFill.className = 'progress-fill';

            progressBar.appendChild(progressDelayFill);
            progressBar.appendChild(progressFill);

            progressWrapper.appendChild(progressBar);
            progressWrapper.appendChild(timeDisplay);

            container.appendChild(button);
            container.appendChild(progressWrapper);
            container.appendChild(audio);

            const formatTime = (seconds) => {
                if (isNaN(seconds)) return '0:00';
                const minutes = Math.floor(seconds / 60);
                const secs = Math.floor(seconds % 60);
                return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
            };

            let delayCountdownInterval = null;
            let delayedPlaybackTimeout = null;
            audio.__vnDisposePreview = function () {
                clearInterval(delayCountdownInterval);
                clearTimeout(delayedPlaybackTimeout);
                delayCountdownInterval = null;
                delayedPlaybackTimeout = null;
            };

            audio.addEventListener('loadedmetadata', () => {
                timeDisplay.textContent = `0:00 / ${formatTime(audio.duration)}`;
            });

            audio.addEventListener('timeupdate', () => {
                const progress = (audio.currentTime / audio.duration) * 100;
                progressFill.style.width = `${progress}%`;
                timeDisplay.textContent = `${formatTime(audio.currentTime)} / ${formatTime(audio.duration)}`;
            });

            progressBar.addEventListener('click', (e) => {
                if (!audio.duration || button.disabled) return;
                const barWidth = progressBar.clientWidth;
                const clickPosition = e.offsetX;
                const seekTime = (clickPosition / barWidth) * audio.duration;
                audio.currentTime = seekTime;
            });

            button.addEventListener('click', () => {
                clearInterval(delayCountdownInterval);

                if (currentPreviewAudio && currentPreviewAudio !== audio) {
                    currentPreviewAudio.pause();
                }

                if (audio.paused) {
                    if (audio.currentTime === audio.duration) {
                        audio.currentTime = 0;
                    }

                    const card = container.closest('.dialogue-entry-card, .phase-header, .label-group-header');
                    if (card && previewKey) {
                        const volumeSliderKey = `${previewKey}Volume`;
                        const volumeSlider = card.querySelector(`input[data-key="${volumeSliderKey}"]`);
                        if (volumeSlider) {
                            const entryVolume = parseFloat(volumeSlider.value);
                            // Gunakan globalVolume (default 1 di editor) untuk konsistensi
                            audio.volume = globalVolume * entryVolume;
                            console.log(`[Pratinjau] Volume diatur ke ${audio.volume.toFixed(2)} sebelum diputar.`);
                        }
                    }

                    // --- LOGIKA PENCARIAN YANG FLEKSIBEL ---
                    const selector = `input[data-key*="${previewKey}"][data-key*="Delay"]`;
                    console.log(`[PlayClick] Mencari input delay dengan selector: "${selector}"`);
                    const delayInput = card ? card.querySelector(selector) : null;
                    console.log('[PlayClick] Elemen input delay yang ditemukan:', delayInput);

                    const delay = delayInput ? parseInt(delayInput.value, 10) || 0 : 0;
                    console.log(`[PlayClick] Nilai delay yang akan digunakan: ${delay}ms`);

                    if (delay > 0) {
                        button.disabled = true;
                        progressDelayFill.style.transition = `width ${delay}ms linear`;
                        progressDelayFill.style.width = '100%';

                        let timeLeft = delay / 1000;
                        timeDisplay.textContent = `Delay: ${timeLeft.toFixed(1)}s`;
                        delayCountdownInterval = setInterval(() => {
                            timeLeft -= 0.1;
                            if (timeLeft > 0) {
                                timeDisplay.textContent = `Delay: ${timeLeft.toFixed(1)}s`;
                            } else {
                                clearInterval(delayCountdownInterval);
                            }
                        }, 100);

                        clearTimeout(delayedPlaybackTimeout);
                        delayedPlaybackTimeout = setTimeout(() => {
                            delayedPlaybackTimeout = null;
                            if (!audio.isConnected) return;
                            button.disabled = false;
                            connectAudioToLiveGraph(audio);
                            audio.play();
                            currentPreviewAudio = audio;
                        }, delay);

                    } else {
                        connectAudioToLiveGraph(audio);
                        audio.play();
                        currentPreviewAudio = audio;
                    }
                } else {
                    audio.pause();
                }
            });

            audio.addEventListener('play', () => {
                button.classList.add('playing');
                progressDelayFill.style.transition = 'none';
                progressDelayFill.style.width = '0%';
                clearInterval(delayCountdownInterval);
            });

            audio.addEventListener('pause', () => {
                button.classList.remove('playing');
                progressDelayFill.style.transition = 'none';
                progressDelayFill.style.width = '0%';
                clearInterval(delayCountdownInterval);
                if (audio.duration) {
                    timeDisplay.textContent = `${formatTime(audio.currentTime)} / ${formatTime(audio.duration)}`;
                }
            });

            audio.addEventListener('ended', () => {
                button.classList.remove('playing');
                progressFill.style.width = '100%';
                timeDisplay.textContent = `${formatTime(audio.duration)} / ${formatTime(audio.duration)}`;
            });

            return container;
        }

        // Muat chapter dari novel yang dipilih untuk diedit

        function toggleTransitionOutControls(checkboxElement) {
            // Cari kartu entri scene terdekat
            const card = checkboxElement.closest('.dialogue-entry-card');
            if (!card) return;

            // Cek tipe scene saat ini
            const sceneTypeSelector = card.querySelector('.scene-type-selector');
            const currentSceneType = sceneTypeSelector ? sceneTypeSelector.value : 'image';

            // Jika tipe scene adalah 'text_screen', JANGAN nonaktifkan kontrol keluar
            if (currentSceneType === 'text_screen') {
                const container = card.querySelector('.transition-out-container');
                if (container) {
                    container.style.opacity = '1';
                    container.style.pointerEvents = 'auto';
                    container.querySelectorAll('select, input, button').forEach(input => input.disabled = false);
                }
                return;
            }

            // Cari kontainer untuk kontrol 'keluar'
            const container = card.querySelector('.transition-out-container');
            if (!container) return;

            // Ambil semua input di dalamnya
            const inputs = container.querySelectorAll('select, input, button');

            // Tentukan apakah harus dinonaktifkan
            const isDisabled = checkboxElement.checked;

            // Atur properti disabled dan gaya visual
            container.style.opacity = isDisabled ? '0.5' : '1';
            container.style.pointerEvents = isDisabled ? 'none' : 'auto';
            inputs.forEach(input => {
                input.disabled = isDisabled;
            });
        }

        // Render data skrip menjadi form input

