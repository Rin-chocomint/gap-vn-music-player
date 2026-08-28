/**
 * VN Player — UI Panels
 * Logika untuk: backlog, save/load modal, settings modal, chapter end screen.
 */

const VNPanels = (() => {
    const { ipcRenderer } = require('electron');
    const { dom, state } = VNState;

    function createPanelElement(tagName, cssText, text) {
        const element = document.createElement(tagName);
        if (cssText) element.style.cssText = cssText;
        if (text !== undefined) element.textContent = String(text);
        return element;
    }

    // === BACKLOG ===
    function openBacklog() {
        return ipcRenderer.invoke('vn-engine:get-history').then(history => {
            dom.backlogContent.textContent = '';
            for (const entry of history) {
                const paragraph = document.createElement('p');
                const speaker = document.createElement('strong');
                speaker.textContent = `${entry.speaker}:`;
                paragraph.appendChild(speaker);
                paragraph.appendChild(document.createTextNode(` ${entry.text}`));
                dom.backlogContent.appendChild(paragraph);
            }
            dom.backlogOverlay.style.display = 'flex';
            dom.backlogContent.scrollTop = dom.backlogContent.scrollHeight;
        });
    }

    function closeBacklog() {
        dom.backlogOverlay.style.display = 'none';
    }

    // === SAVE/LOAD ===
    async function openSaveLoadModal(mode) {
        state.currentModalMode = mode;
        var _t = (typeof VNI18n !== 'undefined') ? VNI18n.t.bind(VNI18n) : (k => k);
        dom.saveLoadTitle.textContent = mode === 'save' ? _t('saveGame') : _t('loadGame');
        dom.saveLoadModal.style.display = 'flex';
        dom.slotsContainer.textContent = 'Loading slots...';

        const slots = await ipcRenderer.invoke('vn-engine:get-save-slots');
        renderSlots(slots);
    }

    function renderSlots(slots) {
        dom.slotsContainer.textContent = '';
        for (let i = 1; i <= 6; i++) {
            const slotData = slots.find(s => s.slotId === i);
            const slotEl = document.createElement('div');
            slotEl.className = 'save-slot';
            slotEl.style.cssText = `
                background: #333; border: 2px solid #555; border-radius: 8px;
                overflow: hidden; cursor: pointer; position: relative;
                height: 200px; display: flex; flex-direction: column; transition: transform 0.2s;
            `;

            if (slotData) {
                const bgPath = slotData.previewImage ? `../${slotData.chapter}/${slotData.previewImage}` : '';
                const date = new Date(slotData.timestamp).toLocaleString();

                const mediaArea = createPanelElement('div', 'flex:1;position:relative;background:#000;');
                if (slotData.previewType === 'video' && bgPath) {
                    const video = createPanelElement('video', 'width:100%;height:100%;object-fit:cover;position:absolute;top:0;left:0;');
                    video.src = bgPath;
                    video.autoplay = true;
                    video.muted = true;
                    video.loop = true;
                    mediaArea.appendChild(video);
                } else {
                    const image = createPanelElement('div', 'width:100%;height:100%;background-size:cover;background-position:center;position:absolute;top:0;left:0;');
                    image.style.backgroundImage = `url(${JSON.stringify(bgPath)})`;
                    mediaArea.appendChild(image);
                }

                const metadata = createPanelElement('div', 'position:absolute;bottom:0;left:0;width:100%;background:rgba(0,0,0,0.7);padding:5px;');
                metadata.appendChild(createPanelElement('div', 'font-weight:bold;font-size:1.1em;', slotData.chapter));
                metadata.appendChild(createPanelElement('div', 'font-size:0.8em;color:#aaa;', date));
                mediaArea.appendChild(metadata);
                slotEl.appendChild(mediaArea);
                slotEl.appendChild(createPanelElement('div', 'padding:10px;text-align:center;background:#222;', `Slot ${i}`));
            } else {
                slotEl.appendChild(createPanelElement('div', 'flex:1;display:flex;align-items:center;justify-content:center;background:#222;color:#555;', 'Empty'));
                slotEl.appendChild(createPanelElement('div', 'padding:10px;text-align:center;background:#1a1a1a;', `Slot ${i}`));
            }

            slotEl.onmouseenter = () => slotEl.style.transform = 'scale(1.05)';
            slotEl.onmouseleave = () => slotEl.style.transform = 'scale(1)';

            slotEl.onclick = () => {
                if (state.currentModalMode === 'save') {
                    if (slotData && !confirm(`Overwrite Slot ${i}?`)) return;

                    let previewType = 'image';
                    let previewImage = '';
                    if (dom.backgroundVideo && dom.backgroundVideo.style.opacity === '1') {
                        previewType = 'video';
                        const src = dom.backgroundVideo.getAttribute('src');
                        if (src) previewImage = src.split('/').pop();
                    } else {
                        // Nama aset diambil dari dataset yang ditulis changeBackground,
                        // bukan dibongkar ulang dari string CSS. Regex lamanya berhenti
                        // di kurung tutup PERTAMA, jadi nama seperti "latar (1).jpg"
                        // terpotong jadi "latar (1" dan thumbnail slot lahir kosong.
                        const namaAset = dom.background.dataset.src;
                        if (namaAset) previewImage = namaAset.split('/').pop();
                    }
                    ipcRenderer.send('vn-engine:save-game', {
                        slotId: i,
                        previewType,
                        previewImage,
                        playerPreferences: {
                            bgm: state.bgmVolumeMultiplier,
                            voice: state.voiceVolumeMultiplier,
                            sfx: state.sfxVolumeMultiplier,
                            textSpeed: state.TYPE_SPEED,
                            autoDelay: state.AUTO_MODE_DELAY
                        }
                    });
                    dom.saveLoadModal.style.display = 'none';
                    dom.backlogOverlay.style.display = 'none';
                } else {
                    if (!slotData) return;
                    if (confirm(`Load Slot ${i}? Unsaved progress will be lost.`)) {
                        ipcRenderer.send('vn-engine:load-game', { slotId: i });
                        dom.saveLoadModal.style.display = 'none';
                        dom.backlogOverlay.style.display = 'none';
                    }
                }
            };

            dom.slotsContainer.appendChild(slotEl);
        }
    }

    function closeSaveLoadModal() {
        dom.saveLoadModal.style.display = 'none';
    }

    // === SETTINGS MODAL ===
    async function openSettingsModal() {
        dom.settingBgmVolume.value = Math.round(state.bgmVolumeMultiplier * 100);
        dom.settingVoiceVolume.value = Math.round(state.voiceVolumeMultiplier * 100);
        dom.settingSfxVolume.value = Math.round(state.sfxVolumeMultiplier * 100);
        dom.bgmVolumeDisplay.textContent = `${Math.round(state.bgmVolumeMultiplier * 100)}%`;
        dom.voiceVolumeDisplay.textContent = `${Math.round(state.voiceVolumeMultiplier * 100)}%`;
        dom.sfxVolumeDisplay.textContent = `${Math.round(state.sfxVolumeMultiplier * 100)}%`;

        if (dom.settingTextSpeed) {
            dom.settingTextSpeed.value = state.TYPE_SPEED;
            dom.textSpeedDisplay.textContent = `${state.TYPE_SPEED}ms`;
        }
        if (dom.settingAutoDelay) {
            dom.settingAutoDelay.value = state.AUTO_MODE_DELAY;
            dom.autoDelayDisplay.textContent = `${(state.AUTO_MODE_DELAY / 1000).toFixed(1)}s`;
        }

        try {
            const isFullscreen = await ipcRenderer.invoke('window:is-fullscreen');
            dom.fullscreenToggle.checked = isFullscreen;
        } catch (e) { /* skip */ }

        dom.settingsModal.style.display = 'flex';

        // Hook: player:settings-render — extensions bisa inject custom UI ke settings modal
        VNRegistry.runHooks('player:settings-render', { modal: dom.settingsModal });
    }

    function closeSettingsModal() {
        dom.settingsModal.style.display = 'none';
    }

    // === SETUP SEMUA EVENT LISTENERS UI ===
    function setupUIListeners() {
        // Rollback (mundur satu baris) — tombol ◀ + scroll-wheel ke atas
        // (konvensi Ren'Py). Engine mengabaikan diam-diam bila riwayat kosong;
        // tombol di-disable via payload.canRollback (lihat init.js).
        let _lastRollbackAt = 0;
        function requestRollback() {
            if (state.isLabelPreviewMode) return;
            if (state.isEventBlocking) return;
            if (dom.backlogOverlay.style.display === 'flex') return;
            if (dom.saveLoadModal.style.display === 'flex') return;
            if (dom.settingsModal.style.display === 'flex') return;
            // Scene apa pun yang sedang menyala memblokir rollback — bukan cuma layar
            // akhir. Dulu pengecekan ini menunjuk `#chapter-end-screen`, jadi ending
            // buatan kreator tidak ikut memblokir. `data-vn-scene` di <body> dipasang
            // VNPlayer.scene, sehingga berlaku untuk semua scene tanpa kecuali.
            if (document.body && document.body.hasAttribute('data-vn-scene')) return;
            const now = Date.now();
            if (now - _lastRollbackAt < 180) return; // redam spam scroll
            _lastRollbackAt = now;
            ipcRenderer.send('vn-engine:request-prev-line');
        }
        if (dom.rollbackButton) {
            dom.rollbackButton.addEventListener('click', (e) => { e.stopPropagation(); requestRollback(); });
        }
        window.addEventListener('wheel', (e) => {
            if (e.deltaY >= 0) return;
            if (e.target && e.target.closest && e.target.closest('#backlog-overlay, #save-load-modal, #settings-modal')) return;
            requestRollback();
        }, { passive: true });

        // Backlog
        dom.historyButton.addEventListener('click', (e) => { e.stopPropagation(); openBacklog(); });
        dom.closeBacklogButton.addEventListener('click', (e) => { e.stopPropagation(); closeBacklog(); });
        dom.backlogOverlay.addEventListener('click', (e) => e.stopPropagation());

        // Save/Load
        dom.saveButton.addEventListener('click', () => openSaveLoadModal('save'));
        dom.loadButton.addEventListener('click', () => openSaveLoadModal('load'));
        dom.closeSaveLoadModal.onclick = closeSaveLoadModal;
        dom.saveLoadModal.addEventListener('click', (e) => e.stopPropagation());

        // Settings
        dom.settingButton.addEventListener('click', () => openSettingsModal());
        dom.closeSettingsBtn.addEventListener('click', closeSettingsModal);
        dom.saveSettingsBtn.addEventListener('click', () => {
            VNAudio.saveVolumeSettings();
            closeSettingsModal();
        });

        dom.settingsModal.addEventListener('click', (e) => {
            if (e.target === dom.settingsModal) closeSettingsModal();
            e.stopPropagation();
        });

        // Volume sliders
        dom.settingBgmVolume.addEventListener('input', () => {
            const val = parseInt(dom.settingBgmVolume.value);
            dom.bgmVolumeDisplay.textContent = `${val}%`;
            state.bgmVolumeMultiplier = val / 100;
            VNAudio.applyVolumeSettings();
        });

        dom.settingVoiceVolume.addEventListener('input', () => {
            const val = parseInt(dom.settingVoiceVolume.value);
            dom.voiceVolumeDisplay.textContent = `${val}%`;
            state.voiceVolumeMultiplier = val / 100;
            VNAudio.applyVolumeSettings();
        });

        dom.settingSfxVolume.addEventListener('input', () => {
            const val = parseInt(dom.settingSfxVolume.value);
            dom.sfxVolumeDisplay.textContent = `${val}%`;
            state.sfxVolumeMultiplier = val / 100;
        });

        // Fullscreen toggle
        dom.fullscreenToggle.addEventListener('change', () => {
            ipcRenderer.send('window:toggle-fullscreen', dom.fullscreenToggle.checked);
        });

        // Text speed slider
        if (dom.settingTextSpeed) {
            dom.settingTextSpeed.addEventListener('input', () => {
                const val = parseInt(dom.settingTextSpeed.value);
                dom.textSpeedDisplay.textContent = `${val}ms`;
                state.TYPE_SPEED = val;
            });
        }

        // Auto mode delay slider
        if (dom.settingAutoDelay) {
            dom.settingAutoDelay.addEventListener('input', () => {
                const val = parseInt(dom.settingAutoDelay.value);
                dom.autoDelayDisplay.textContent = `${(val / 1000).toFixed(1)}s`;
                state.AUTO_MODE_DELAY = val;
            });
        }

        // Auto mode
        dom.autoModeButton.addEventListener('click', (e) => {
            e.stopPropagation();
            state.isAutoMode = !state.isAutoMode;
            dom.autoModeButton.classList.toggle('active', state.isAutoMode);
            if (state.isAutoMode) {
                if (!state.isTyping && !dom.makeChoiceContainer.classList.contains('visible')) {
                    VNTypewriter.finishTyping();
                }
            } else {
                clearTimeout(state.autoModeTimeout);
            }
        });

        // Back to hub — selalu lewat IPC routing (vn-engine:return-to-hub)
        dom.backToHubButton.addEventListener('click', (e) => {
            e.stopPropagation();
            if (state.isPreviewMode) {
                ipcRenderer.send('vn-engine:close-preview-window');
            } else if (state.storyTitle) {
                ipcRenderer.send('vn-engine:return-to-hub', { storyTitle: state.storyTitle });
            } else {
                ipcRenderer.send('vn-engine:exit-to-manager');
            }
        });
    }

    return {
        openBacklog,
        closeBacklog,
        openSaveLoadModal,
        closeSaveLoadModal,
        openSettingsModal,
        closeSettingsModal,
        setupUIListeners,
    };
})();
