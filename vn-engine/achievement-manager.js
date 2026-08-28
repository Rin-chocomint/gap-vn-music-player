// =============================================
// Rin.js — Achievement Manager
//
// Achievement first-class per-novel:
//   <novel>/achievements.json        — definisi milik author (di-CRUD editor):
//       [{ id, title, desc?, icon?, hidden?, unlockFlag? }, ...]
//   <novel>/achievements-state.json  — progres pemain (otomatis, JANGAN diedit):
//       { unlocked: { <id>: "<ISO timestamp>" } }
//
// Dua jalur unlock:
//   1. Manual  — custom command bawaan `unlock_achievement` (player global,
//      hub-bridge-commands.js) atau `VNHub.achievements.unlock(id)` dari hub.
//   2. Otomatis — def ber-`unlockFlag`: saat `achievements:list` dipanggil
//      (hub ready / chapter return), flag hub-flags.json + story-vars.json
//      dicek; yang truthy di-unlock saat itu juga (lazy sweep) dan dilaporkan
//      sebagai `newlyUnlocked` supaya pemanggil bisa menampilkan toast.
//      Reuse jembatan cerita→hub yang sudah ada — tanpa mekanisme baru.
//
// State di berkas, bukan localStorage (Prinsip P3: bisa di-diff/backup,
// konsisten dengan hub-flags.json/story-vars.json).
// =============================================

const path = require('path');
const fs = require('fs');
const { validatePathComponent, resolvePathWithinRoot } = require('./path-utils');
const { atomicWriteFileSync } = require('./atomic-writer');

/**
 * Hitung pencapaian yang sudah terbuka. PEMBACAAN MURNI — tidak menyapu
 * unlockFlag dan tidak menulis apa pun, karena pemanggilnya adalah status
 * Discord: sesuatu yang ikut berjalan di latar tidak boleh mengubah progres
 * pemain sebagai efek samping.
 *
 * Novel tanpa achievements.json mengembalikan total 0 — pemanggil memakai itu
 * sebagai tanda "jangan tampilkan hitungannya sama sekali", bukan "0 dari 0".
 *
 * @returns {{terbuka: number, total: number}}
 */
function hitungPencapaian(novelPath) {
    const kosong = { terbuka: 0, total: 0 };
    if (!novelPath) return kosong;
    try {
        const defs = JSON.parse(fs.readFileSync(path.join(novelPath, 'achievements.json'), 'utf-8'));
        if (!Array.isArray(defs) || defs.length === 0) return kosong;
        const sah = defs.filter((d) => d && typeof d.id === 'string' && d.id);
        let terbuka = 0;
        try {
            const state = JSON.parse(fs.readFileSync(path.join(novelPath, 'achievements-state.json'), 'utf-8'));
            const dibuka = (state && typeof state.unlocked === 'object' && state.unlocked) || {};
            terbuka = sah.filter((d) => dibuka[d.id]).length;
        } catch (e) { /* belum ada progres = nol terbuka */ }
        return { terbuka, total: sah.length };
    } catch (e) {
        return kosong;
    }
}

function registerHandlers({ ipcMain, visualNovelsDirectory }) {

    function _novelPath(novelTitle) {
        if (!novelTitle) return null;
        const safeNovelTitle = validatePathComponent(novelTitle, 'Nama novel');
        return resolvePathWithinRoot(visualNovelsDirectory, safeNovelTitle);
    }

    function _readDefs(novelPath) {
        try {
            const p = path.join(novelPath, 'achievements.json');
            if (!fs.existsSync(p)) return [];
            const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
            if (!Array.isArray(data)) return [];
            return data.filter((d) => d && typeof d.id === 'string' && d.id);
        } catch (e) {
            console.error('[Achievements] achievements.json tidak valid, diabaikan:', e.message);
            return [];
        }
    }

    function _readState(novelPath) {
        try {
            const p = path.join(novelPath, 'achievements-state.json');
            if (!fs.existsSync(p)) return { unlocked: {} };
            const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
            if (!data || typeof data.unlocked !== 'object' || !data.unlocked) return { unlocked: {} };
            return data;
        } catch (e) {
            console.error('[Achievements] achievements-state.json korup, mulai kosong:', e.message);
            return { unlocked: {} };
        }
    }

    function _writeState(novelPath, state) {
        atomicWriteFileSync(
            resolvePathWithinRoot(novelPath, 'achievements-state.json'),
            JSON.stringify(state, null, 2),
            { encoding: 'utf8' }
        );
    }

    // Gabungan flag persisten yang bisa dijadikan syarat unlockFlag:
    // hub-flags.json (eksplisit via set_hub_flag) + story-vars.json (snapshot
    // variabel sesi terakhir; menang bila key sama — nilai paling segar).
    function _readFlagsAndVars(novelPath) {
        const out = {};
        try {
            const p = path.join(novelPath, 'hub-flags.json');
            if (fs.existsSync(p)) {
                const d = JSON.parse(fs.readFileSync(p, 'utf-8'));
                Object.assign(out, (d && typeof d.flags === 'object' && d.flags) || {});
            }
        } catch (e) { /* korup — lewati */ }
        try {
            const p = path.join(novelPath, 'story-vars.json');
            if (fs.existsSync(p)) {
                const d = JSON.parse(fs.readFileSync(p, 'utf-8'));
                Object.assign(out, (d && typeof d.vars === 'object' && d.vars) || {});
            }
        } catch (e) { /* korup — lewati */ }
        return out;
    }

    // Lazy sweep: unlock semua def ber-unlockFlag yang flag-nya truthy.
    // Return array def yang BARU ter-unlock pada panggilan ini.
    function _sweepAutoUnlocks(novelPath, defs, state) {
        const flagged = defs.filter((d) => d.unlockFlag && !state.unlocked[d.id]);
        if (flagged.length === 0) return [];
        const flags = _readFlagsAndVars(novelPath);
        const newly = [];
        flagged.forEach((d) => {
            if (flags[d.unlockFlag]) {
                state.unlocked[d.id] = new Date().toISOString();
                newly.push(d);
            }
        });
        if (newly.length > 0) {
            _writeState(novelPath, state);
            console.log(`[Achievements] Auto-unlock ${newly.length} achievement:`, newly.map((d) => d.id).join(', '));
        }
        return newly;
    }

    // `sweep: false` — pembacaan MURNI, tanpa efek samping. Dipakai editor:
    // membuka panel Extras untuk melihat definisi tidak boleh ikut meng-unlock
    // achievement ber-unlockFlag di progres pemain (melihat ≠ memainkan).
    ipcMain.handle('achievements:list', async (event, { novelTitle, sweep = true } = {}) => {
        try {
            const novelPath = _novelPath(novelTitle);
            if (!novelPath || !fs.existsSync(novelPath)) return { success: false, message: 'Novel tidak ditemukan.' };
            const defs = _readDefs(novelPath);
            const state = _readState(novelPath);
            const newlyUnlocked = sweep ? _sweepAutoUnlocks(novelPath, defs, state) : [];
            return {
                success: true,
                achievements: defs.map((d) => ({
                    ...d,
                    unlocked: !!state.unlocked[d.id],
                    unlockedAt: state.unlocked[d.id] || null,
                })),
                newlyUnlocked,
            };
        } catch (error) {
            return { success: false, message: error.message };
        }
    });

    ipcMain.handle('achievements:unlock', async (event, { novelTitle, id } = {}) => {
        try {
            const novelPath = _novelPath(novelTitle);
            if (!novelPath || !fs.existsSync(novelPath)) return { success: false, message: 'Novel tidak ditemukan.' };
            if (typeof id !== 'string' || !id) return { success: false, message: 'id achievement wajib diisi.' };
            const defs = _readDefs(novelPath);
            const def = defs.find((d) => d.id === id) || null;
            if (!def) {
                // Unlock id tak terdefinisi tetap dicatat (author mungkin menulis
                // command lebih dulu, definisinya menyusul) — tapi diberi tanda.
                console.warn(`[Achievements] unlock id '${id}' belum ada di achievements.json.`);
            }
            const state = _readState(novelPath);
            if (state.unlocked[id]) {
                return { success: true, newlyUnlocked: false, def };
            }
            state.unlocked[id] = new Date().toISOString();
            _writeState(novelPath, state);
            console.log(`[Achievements] Unlocked: '${id}' (${novelTitle}).`);
            return { success: true, newlyUnlocked: true, def };
        } catch (error) {
            return { success: false, message: error.message };
        }
    });

    ipcMain.handle('achievements:reset', async (event, { novelTitle } = {}) => {
        try {
            const novelPath = _novelPath(novelTitle);
            if (!novelPath) return { success: false, message: 'Novel tidak ditemukan.' };
            const p = path.join(novelPath, 'achievements-state.json');
            if (fs.existsSync(p)) fs.unlinkSync(p);
            return { success: true, message: 'Progres achievement direset.' };
        } catch (error) {
            return { success: false, message: error.message };
        }
    });

    // Editor CRUD: tulis achievements.json. Merge baseline per-id agar field
    // yang tak dimodel UI editor (dari versi mendatang) tidak hilang.
    ipcMain.handle('achievements:save-defs', async (event, { novelTitle, defs } = {}) => {
        try {
            const novelPath = _novelPath(novelTitle);
            if (!novelPath || !fs.existsSync(novelPath)) return { success: false, message: 'Novel tidak ditemukan.' };
            if (!Array.isArray(defs)) return { success: false, message: 'Format defs tidak valid (harus array).' };

            const oldById = {};
            _readDefs(novelPath).forEach((d) => { oldById[d.id] = d; });

            const seen = new Set();
            const finalDefs = [];
            for (const d of defs) {
                if (!d || typeof d.id !== 'string' || !d.id.trim()) continue;
                const id = d.id.trim();
                if (seen.has(id)) return { success: false, message: `id duplikat: "${id}".` };
                seen.add(id);
                const merged = Object.assign({}, oldById[id] || {});
                merged.id = id;
                ['title', 'desc', 'icon', 'unlockFlag'].forEach((k) => {
                    const v = typeof d[k] === 'string' ? d[k].trim() : '';
                    if (v) merged[k] = v; else delete merged[k];
                });
                if (d.hidden) merged.hidden = true; else delete merged.hidden;
                if (!merged.title) merged.title = id; // judul minimal = id
                finalDefs.push(merged);
            }

            const p = resolvePathWithinRoot(novelPath, 'achievements.json');
            if (finalDefs.length === 0) {
                // Daftar dikosongkan = fitur dimatikan → hapus file (back-compat NFR-1:
                // novel tanpa achievements.json tidak berubah perilaku sama sekali).
                if (fs.existsSync(p)) fs.unlinkSync(p);
                return { success: true, message: 'achievements.json dihapus (daftar kosong).', count: 0 };
            }
            atomicWriteFileSync(p, JSON.stringify(finalDefs, null, 2), { encoding: 'utf8' });
            console.log(`[Achievements] achievements.json disimpan untuk '${novelTitle}' (${finalDefs.length} definisi).`);
            return { success: true, message: `${finalDefs.length} achievement tersimpan.`, count: finalDefs.length };
        } catch (error) {
            return { success: false, message: error.message };
        }
    });
}

module.exports = { registerHandlers, hitungPencapaian };
