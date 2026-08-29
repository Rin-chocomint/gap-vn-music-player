// ================================ ( Game Editor Store ) ================================ //
// Satu sumber state untuk Game Editor. localStorage di bawah hanya dipakai sekali
// untuk memigrasikan data dari versi lama; sesudahnya state disimpan atomik oleh
// main process di app.getPath('userData').
(function initGameEditorStore() {
    'use strict';

    const SCHEMA_VERSION = 1;
    const LEGACY_CONTENT_KEY = 'gameEditableContent';
    const LEGACY_CHARACTERS_KEY = 'gameCharacterEditorData';
    const LEGACY_ROTATING_TEXTS_KEY = 'gameRotatingTexts';
    const LEGACY_PROFILE_CSS_KEY = 'profile-section-custom-css';

    const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
    const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

    // Nilai objek/array SELALU disalin. Kalau referensinya dipakai apa adanya,
    // array `gameCharacters` milik editor jadi satu objek dengan isi store, jadi
    // `gameCharacters.push()` diam-diam mengubah state yang belum disimpan dan
    // "buang perubahan" tidak lagi bisa membuang apa pun.
    function normalizeState(rawState) {
        const state = { schemaVersion: SCHEMA_VERSION };
        if (!isPlainObject(rawState)) return state;

        if (hasOwn(rawState, 'content') && isPlainObject(rawState.content)) {
            state.content = cloneState(rawState.content);
        }
        if (hasOwn(rawState, 'characters') && Array.isArray(rawState.characters)) {
            state.characters = cloneState(rawState.characters);
        }
        if (hasOwn(rawState, 'rotatingTexts') && Array.isArray(rawState.rotatingTexts)) {
            state.rotatingTexts = rawState.rotatingTexts.map(text => String(text));
        }
        if (hasOwn(rawState, 'profileCustomCss') && typeof rawState.profileCustomCss === 'string') {
            state.profileCustomCss = rawState.profileCustomCss;
        }
        return state;
    }

    function cloneState(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function readLegacyJson(key, expected) {
        try {
            const raw = localStorage.getItem(key);
            if (raw === null) return { present: false, value: undefined };
            const parsed = JSON.parse(raw);
            if (expected(parsed)) return { present: true, value: parsed };
            console.warn(`[GameEditorStore] Mengabaikan data lama ${key} yang formatnya tidak valid.`);
        } catch (error) {
            console.warn(`[GameEditorStore] Gagal membaca data lama ${key}:`, error);
        }
        return { present: false, value: undefined };
    }

    // Mengembalikan { state, shouldPersist } atau null.
    //
    // `shouldPersist` hanya true kalau ada data localStorage milik PENGGUNA.
    // `legacyCharacters` datang dari aset/character/custom_character_data.json di
    // folder instalasi, dan berkas itu tidak boleh memicu penulisan state.json:
    // sekali state.json ada, sumber lama tidak pernah dilirik lagi, sehingga
    // localStorage yang baru muncul kemudian (mis. karena build lama masih dipakai
    // dan berbagi userData yang sama) akan diabaikan selamanya.
    function readLegacyState(legacyCharacters) {
        const migrated = { schemaVersion: SCHEMA_VERSION };
        let hasLocalStorageState = false;
        let hasInstallationState = false;

        const content = readLegacyJson(LEGACY_CONTENT_KEY, isPlainObject);
        if (content.present) {
            migrated.content = content.value;
            hasLocalStorageState = true;
        }

        const characters = readLegacyJson(LEGACY_CHARACTERS_KEY, Array.isArray);
        if (characters.present) {
            migrated.characters = characters.value;
            hasLocalStorageState = true;
        } else if (Array.isArray(legacyCharacters)) {
            migrated.characters = legacyCharacters;
            hasInstallationState = true;
        }

        const rotatingTexts = readLegacyJson(LEGACY_ROTATING_TEXTS_KEY, Array.isArray);
        if (rotatingTexts.present) {
            migrated.rotatingTexts = rotatingTexts.value.map(text => String(text));
            hasLocalStorageState = true;
        }

        try {
            const profileCss = localStorage.getItem(LEGACY_PROFILE_CSS_KEY);
            if (profileCss !== null) {
                migrated.profileCustomCss = profileCss;
                hasLocalStorageState = true;
            }
        } catch (error) {
            console.warn('[GameEditorStore] Gagal membaca CSS profil lama:', error);
        }

        if (!hasLocalStorageState && !hasInstallationState) return null;
        return { state: migrated, shouldPersist: hasLocalStorageState };
    }

    let state = { schemaVersion: SCHEMA_VERSION };
    let loaded = false;
    let loadingPromise = null;
    let saveQueue = Promise.resolve();

    async function writeState(snapshot) {
        const result = await ipcRenderer.invoke('game-editor:save-state', snapshot);
        if (!result || result.success !== true) {
            throw new Error(result?.error || 'Main process menolak penyimpanan Game Editor.');
        }
    }

    async function load() {
        if (loadingPromise) return loadingPromise;

        loadingPromise = (async () => {
            let remoteResult = null;
            try {
                remoteResult = await ipcRenderer.invoke('game-editor:load-state');
            } catch (error) {
                console.error('[GameEditorStore] Tidak dapat menghubungi penyimpanan aplikasi:', error);
            }

            if (remoteResult?.success === true && remoteResult.exists === true) {
                state = normalizeState(remoteResult.state);
            } else {
                const migrated = readLegacyState(remoteResult?.legacyCharacters);
                if (migrated) {
                    state = normalizeState(migrated.state);
                    if (migrated.shouldPersist) {
                        try {
                            await writeState(cloneState(state));
                            console.log('[GameEditorStore] Data Game Editor lama berhasil dimigrasikan ke userData.');
                        } catch (error) {
                            // Data localStorage lama tidak dihapus, jadi pengguna masih punya cadangan.
                            console.error('[GameEditorStore] Migrasi belum dapat ditulis ke userData:', error);
                        }
                    }
                } else {
                    state = { schemaVersion: SCHEMA_VERSION };
                }

                if (remoteResult?.success === false) {
                    console.error('[GameEditorStore] State userData tidak dapat dibaca:', remoteResult.error);
                }
            }

            loaded = true;
            window.dispatchEvent(new CustomEvent('game-editor-state-ready', { detail: cloneState(state) }));
            return cloneState(state);
        })();

        return loadingPromise;
    }

    function getState() {
        return cloneState(state);
    }

    function has(key) {
        return hasOwn(state, key);
    }

    function update(patch) {
        state = normalizeState({ ...state, ...(patch || {}) });
        return getState();
    }

    async function persist() {
        await load();
        const snapshot = cloneState(state);
        const task = saveQueue.catch(() => undefined).then(() => writeState(snapshot));
        saveQueue = task;
        await task;
        return snapshot;
    }

    async function updateAndPersist(patch) {
        update(patch);
        return persist();
    }

    window.gameEditorStore = {
        ready: load(),
        load,
        getState,
        has,
        update,
        persist,
        updateAndPersist
    };
})();
// ================================ ( End Game Editor Store ) ================================ //
