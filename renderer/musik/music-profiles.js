/*
 * Kontrol profil lagu dipakai bersama oleh mode Game dan Native. Nilai di sini
 * adalah override runtime untuk lagu aktif; pengaturan global tetap milik panel
 * pengaturan utama dan tidak diubah ketika profil diterapkan.
 */
(function initMusicProfileControls() {
    const { ipcRenderer } = require('electron');
    const container = document.getElementById('music-profile-controls');
    if (!container || !ipcRenderer) return;

    const fallbackCover = './aset/musik.png';
    const styleId = 'gap-music-profile-controls-style';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            .gap-music-profile { margin: 12px 0 8px; padding: 10px; border: 1px solid rgba(100, 200, 255, .28); border-radius: 7px; background: rgba(24, 30, 42, .45); }
            .gap-music-profile-title { display: flex; justify-content: space-between; gap: 8px; align-items: center; font-size: 12px; font-weight: 700; color: #dcecff; }
            .gap-music-profile-current { display: flex; align-items: center; gap: 9px; margin: 7px 0 9px; }
            .gap-music-profile-cover { width: 38px; height: 38px; flex: 0 0 38px; border-radius: 6px; object-fit: cover; background: rgba(255,255,255,.08); border: 1px solid rgba(160, 220, 255, .28); }
            .gap-music-profile-status { margin: 0; color: #a9b4c6; font-size: 11px; line-height: 1.35; }
            .gap-music-profile-editor { display: grid; gap: 7px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,.12); }
            .gap-music-profile-editor label { display: flex; align-items: center; gap: 7px; font-size: 11px; color: #eef4ff; }
            .gap-music-profile-editor select { min-width: 0; flex: 1; padding: 5px; color: inherit; background: rgba(0,0,0,.25); border: 1px solid rgba(255,255,255,.22); border-radius: 4px; }
            .gap-music-profile-actions { display: flex; gap: 7px; margin-top: 2px; }
            .gap-music-profile button { padding: 5px 8px; border: 1px solid rgba(126, 201, 255, .48); border-radius: 4px; color: #eaf7ff; background: rgba(57, 113, 168, .42); cursor: pointer; font-size: 11px; }
            .gap-music-profile button.danger { border-color: rgba(255, 119, 138, .55); background: rgba(136, 45, 61, .38); }
            .gap-music-profile button:disabled { cursor: not-allowed; opacity: .5; }
            .gap-music-profile .profile-note { color: #91a0b5; font-size: 10px; }
            .gap-music-profile-library { margin: 8px 0 12px; }
            .gap-music-profile-library-title { margin: 0 0 6px; color: #cfe8ff; font-size: 11px; font-weight: 700; }
            .gap-music-profile-node { margin: 5px 0; border: 1px solid rgba(160, 210, 255, .18); border-radius: 6px; background: rgba(8, 13, 21, .26); overflow: hidden; }
            .gap-music-profile-node[open] { border-color: rgba(100, 200, 255, .48); }
            .gap-music-profile-node summary { display: flex; align-items: center; gap: 8px; padding: 7px; cursor: pointer; list-style: none; color: #dcecff; }
            .gap-music-profile-node summary::-webkit-details-marker { display: none; }
            .gap-music-profile-node summary::after { content: '⌄'; margin-left: auto; color: #8cb6d7; font-size: 13px; transition: transform .15s ease; }
            .gap-music-profile-node[open] summary::after { transform: rotate(180deg); }
            .gap-music-profile-node-cover { width: 30px; height: 30px; flex: 0 0 30px; border-radius: 5px; object-fit: cover; background: rgba(255,255,255,.08); }
            .gap-music-profile-node-text { min-width: 0; display: grid; gap: 1px; }
            .gap-music-profile-node-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }
            .gap-music-profile-node-artist { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #91a0b5; font-size: 10px; }
            .gap-music-profile-node-body { padding: 0 9px 9px 45px; color: #adbdcb; font-size: 10px; line-height: 1.45; }
            .gap-music-profile-node-body p { margin: 3px 0; }
            .gap-music-profile-empty { margin: 0; color: #8998a9; font-size: 10px; }
        `;
        document.head.appendChild(style);
    }

    container.classList.add('gap-music-profile');
    container.innerHTML = `
        <div class="gap-music-profile-title"><span>Profil khusus lagu aktif</span><span data-role="badge"></span></div>
        <div class="gap-music-profile-current">
            <img class="gap-music-profile-cover" data-role="cover" alt="Cover lagu aktif">
            <p class="gap-music-profile-status" data-role="status">Putar musik untuk membuat profil khusus.</p>
        </div>
        <div class="gap-music-profile-editor" data-role="editor">
            <label><input type="checkbox" data-field="gifOverlayEnabled"> Media Overlay aktif untuk lagu ini</label>
            <label><input type="checkbox" data-field="rhythmOverlayEnabled"> Rhythm Gamification aktif untuk lagu ini</label>
            <label><input type="checkbox" data-field="rhythmHideNowPlaying"> Sembunyikan Now Playing pada Rhythm</label>
            <label><input type="checkbox" data-field="dynamicThemeEnabled"> Dynamic ytMusic Styling aktif untuk lagu ini</label>
            <label>Mode Dynamic Styling
                <select data-field="dynamicThemeMode">
                    <option value="default-optimized">Default Optimize</option>
                    <option value="seamless">Seamless (Full Transparency)</option>
                    <option value="overlay">Overlay (Seamless)</option>
                    <option value="harmony">Harmony (Cohesive)</option>
                    <option value="aurora-uimod">Aurora (ui mod)</option>
                    <option value="game-lobby-uimod">Game Lobby (ui mod)</option>
                </select>
            </label>
            <label>Playback Speed (Mod)
                <select data-field="playbackSpeed">
                    <option value="0.75">Half Time (0.75x)</option>
                    <option value="1.0">Normal Speed (1.0x)</option>
                    <option value="1.25">Double Time Light (1.25x)</option>
                    <option value="1.5">Double Time (1.5x)</option>
                    <option value="nightcore">Nightcore Pitched (1.5x + High Pitch)</option>
                </select>
            </label>
            <span class="profile-note">Hanya berlaku untuk lagu ini. Pengaturan global tidak berubah.</span>
            <div class="gap-music-profile-actions">
                <button type="button" data-role="save">Simpan profil</button>
                <button type="button" class="danger" data-role="remove">Hapus profil lagu ini</button>
            </div>
        </div>
    `;

    const library = document.createElement('section');
    library.className = 'gap-music-profile-library';
    library.setAttribute('aria-label', 'Profil lagu tersimpan');
    container.insertAdjacentElement('afterend', library);

    const elements = {
        badge: container.querySelector('[data-role="badge"]'),
        cover: container.querySelector('[data-role="cover"]'),
        status: container.querySelector('[data-role="status"]'),
        save: container.querySelector('[data-role="save"]'),
        remove: container.querySelector('[data-role="remove"]')
    };
    const fields = [...container.querySelectorAll('[data-field]')];
    let state = { track: null, profile: null, effective: null };
    let profileLibrary = [];

    const settingsTabs = [...document.querySelectorAll('[data-music-settings-tab]')];
    const settingsPanels = [...document.querySelectorAll('[data-music-settings-panel]')];

    function selectSettingsTab(tabName) {
        settingsTabs.forEach((tab) => {
            const active = tab.dataset.musicSettingsTab === tabName;
            tab.classList.toggle('is-active', active);
            tab.setAttribute('aria-selected', String(active));
        });
        settingsPanels.forEach((panel) => {
            panel.hidden = panel.dataset.musicSettingsPanel !== tabName;
        });
        if (tabName === 'profile') refreshCurrentProfile();
    }

    settingsTabs.forEach((tab) => {
        tab.addEventListener('click', () => selectSettingsTab(tab.dataset.musicSettingsTab));
    });

    const setStatus = (message, hasProfile = false) => {
        elements.status.textContent = message;
        elements.badge.textContent = hasProfile ? 'Aktif' : '';
    };

    const isTrackReady = () => Boolean(
        state.track && state.track.title && state.track.key && state.track.isPlaying === true
    );

    function setImageSource(image, source) {
        image.onerror = () => {
            image.onerror = null;
            image.src = fallbackCover;
        };
        image.src = source || fallbackCover;
    }

    function applyEffectiveSettings(effective) {
        if (!effective) return;
        window.dispatchEvent(new CustomEvent('gap-music-profile-effective-settings', { detail: effective }));
    }

    function setEditorAvailability(ready) {
        fields.forEach((field) => { field.disabled = !ready; });
        elements.save.disabled = !ready;
        elements.remove.hidden = !state.profile;
        elements.remove.disabled = !ready || !state.profile;
    }

    function updateEditor() {
        const values = state.profile?.overrides || state.effective || {};
        fields.forEach((field) => {
            if (field.type === 'checkbox') field.checked = values[field.dataset.field] === true;
            else field.value = values[field.dataset.field] || '1.0';
        });
    }

    function speedLabel(value) {
        if (!value) return 'Mengikuti pengaturan global';
        const labels = {
            '0.75': 'Half Time (0.75x)',
            '1.0': 'Normal Speed (1.0x)',
            '1.25': 'Double Time Light (1.25x)',
            '1.5': 'Double Time (1.5x)',
            nightcore: 'Nightcore Pitched (1.5x)'
        };
        return labels[value] || labels['1.0'];
    }

    function profileNode(profile) {
        const details = document.createElement('details');
        details.className = 'gap-music-profile-node';
        if (state.track?.key === profile.key) details.dataset.active = 'true';

        const summary = document.createElement('summary');
        const cover = document.createElement('img');
        cover.className = 'gap-music-profile-node-cover';
        cover.alt = '';
        setImageSource(cover, profile.coverSrc);

        const text = document.createElement('span');
        text.className = 'gap-music-profile-node-text';
        const title = document.createElement('span');
        title.className = 'gap-music-profile-node-title';
        title.textContent = profile.title || 'Tanpa judul';
        const artist = document.createElement('span');
        artist.className = 'gap-music-profile-node-artist';
        artist.textContent = profile.artist || 'Artis tidak diketahui';
        text.append(title, artist);
        summary.append(cover, text);

        const body = document.createElement('div');
        body.className = 'gap-music-profile-node-body';
        const overrides = profile.overrides || {};
        const lines = [
            `Media Overlay: ${overrides.gifOverlayEnabled ? 'aktif' : 'nonaktif'}`,
            `Rhythm: ${overrides.rhythmOverlayEnabled ? 'aktif' : 'nonaktif'}`,
            `Dynamic Styling: ${overrides.dynamicThemeEnabled ? `${overrides.dynamicThemeMode || 'Default Optimize'}` : 'nonaktif'}`,
            `Playback: ${speedLabel(overrides.playbackSpeed)}`
        ];
        lines.forEach((line) => {
            const item = document.createElement('p');
            item.textContent = line;
            body.appendChild(item);
        });
        if (profile.updatedAt) {
            const saved = document.createElement('p');
            saved.textContent = `Disimpan: ${new Date(profile.updatedAt).toLocaleString()}`;
            body.appendChild(saved);
        }
        details.append(summary, body);
        return details;
    }

    function renderProfileLibrary(profiles = profileLibrary) {
        profileLibrary = Array.isArray(profiles) ? profiles : [];
        library.replaceChildren();
        const title = document.createElement('p');
        title.className = 'gap-music-profile-library-title';
        title.textContent = `Profil tersimpan (${profileLibrary.length})`;
        library.appendChild(title);
        if (!profileLibrary.length) {
            const empty = document.createElement('p');
            empty.className = 'gap-music-profile-empty';
            empty.textContent = 'Belum ada profil lagu yang disimpan.';
            library.appendChild(empty);
            return;
        }
        profileLibrary.forEach((profile) => library.appendChild(profileNode(profile)));
    }

    function render(nextState) {
        state = { ...state, ...(nextState || {}) };
        const ready = isTrackReady();
        setImageSource(elements.cover, state.track?.coverSrc || state.profile?.coverSrc);
        setEditorAvailability(ready);
        updateEditor();

        if (!ready) {
            setStatus('Putar musik untuk membuat atau mengubah profil khusus.', false);
            return;
        }

        const artist = state.track.artist ? ` — ${state.track.artist}` : '';
        const profileText = state.profile ? 'Profil khusus sedang diterapkan.' : 'Atur lalu simpan untuk membuat profil lagu ini.';
        setStatus(`${state.track.title}${artist}. ${profileText}`, Boolean(state.profile));
    }

    function overridesFromEditor() {
        return fields.reduce((result, field) => {
            result[field.dataset.field] = field.type === 'checkbox' ? field.checked : field.value;
            return result;
        }, {});
    }

    async function refreshProfileLibrary() {
        try {
            renderProfileLibrary(await ipcRenderer.invoke('music-profile-list'));
        } catch (error) {
            console.warn('[MusicProfile] Gagal memuat daftar profil lagu:', error);
        }
    }

    async function refreshCurrentProfile() {
        try {
            const nextState = await ipcRenderer.invoke('music-profile-get-current');
            render(nextState);
            applyEffectiveSettings(nextState?.effective);
            await refreshProfileLibrary();
        } catch (error) {
            console.warn('[MusicProfile] Gagal memuat profil lagu aktif:', error);
        }
    }

    elements.save.addEventListener('click', async () => {
        if (!isTrackReady()) return;
        elements.save.disabled = true;
        try {
            const result = await ipcRenderer.invoke('music-profile-save', {
                track: state.track,
                overrides: overridesFromEditor()
            });
            if (!result?.success) throw new Error(result?.error || 'Profil tidak dapat disimpan.');
            render(result.state);
            await refreshProfileLibrary();
        } catch (error) {
            setStatus(error.message || 'Profil tidak dapat disimpan.', Boolean(state.profile));
        } finally {
            elements.save.disabled = false;
        }
    });

    elements.remove.addEventListener('click', async () => {
        if (!isTrackReady() || !state.profile) return;
        elements.remove.disabled = true;
        try {
            const result = await ipcRenderer.invoke('music-profile-delete', { track: state.track });
            if (!result?.success) throw new Error(result?.error || 'Profil tidak dapat dihapus.');
            render(result.state);
            await refreshProfileLibrary();
        } catch (error) {
            setStatus(error.message || 'Profil tidak dapat dihapus.', Boolean(state.profile));
        } finally {
            elements.remove.disabled = false;
        }
    });

    ipcRenderer.on('music-profile-state', (_event, nextState) => render(nextState));
    ipcRenderer.on('music-profile-effective-settings', (_event, effective) => applyEffectiveSettings(effective));

    refreshCurrentProfile();
})();
