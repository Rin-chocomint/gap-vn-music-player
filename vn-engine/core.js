// =============================================
// Rin.js — VN Engine Core
// State machine, game loop, jump handler
// =============================================

const path = require('path');
const fs = require('fs');
const { normalizeScript } = require('./schema-validator');
const { resolvePlayerSource } = require('./player-source-resolver');
// Aturan "apa yang diwarisi sebuah entri" — SATU rumah, dipakai bersama preview
// editor (`preview-payload.js`). Lihat header story-carry.js untuk sebabnya.
const storyCarry = require('./story-carry');

// ---------- State Engine ----------
let currentVNScript = [];
let currentVNIndex = 0;
let currentVNState = {
    backgroundStack: [{ type: null, src: null }],
    bgmState: { src: null, volume: undefined, pan: undefined, delay: undefined },
    lastSpeaker: null,
    variables: {}
};
let vnDialogueHistory = [];
let currentStoryTitle = '';
let currentChapter = '';

// ---------- Authority boundary choice (R-02) ----------
// Renderer hanya mengetahui urutan opsi yang sedang DITAMPILKAN. Seluruh data
// berotoritas (condition, setVariable, jump, dan text mentah) tetap di main
// process. Token ini bersifat ephemeral per-render, bukan stable AST ID: cukup
// untuk menolak event basi/dobel tanpa mengunci format script sebelum C-01.
let _choiceIntentSequence = 0;
let _activeChoiceIntent = null;

// Custom Player lama menjalankan interpreter miliknya sendiri dan dahulu
// mengirim object choice penuh. Mode eksplisit ini memungkinkan compatibility
// branch terbatas di ipc-handlers tanpa membuka jalur tersebut untuk player
// global/engine-shim.
let _currentPlayerAuthorityMode = 'engine';

// ---------- Rollback — mundur satu baris (player global) ----------
// Snapshot per baris TAMPIL (dialogue/choice/scene) dipush di titik kirim
// processAndSendVNUpdate: { index, payload, state } — `state` = deep-copy
// currentVNState SETELAH baris itu diproses, sehingga maju lagi dari titik
// rollback menghasilkan alur yang identik (state machine deterministik;
// set_var/load_hub_flags di antara dua baris tampil aman dieksekusi ulang
// karena variabel sudah dipulihkan ke snapshot).
//
// Batas sadar (v1): riwayat DIBERSIHKAN saat (a) entry `custom` diproses —
// efek samping eksternal command tidak bisa di-undo/dieksekusi ulang dengan
// aman, (b) choice dijawab / input teks disubmit — tidak mundur menembus
// keputusan, (c) script dimuat/di-set dari luar (play/replay/load save).
let vnRollbackHistory = [];
const MAX_ROLLBACK_HISTORY = 100;

function clearRollbackHistory(reason) {
    if (vnRollbackHistory.length > 0 && reason) {
        console.log(`[VN Engine] Riwayat rollback dibersihkan (${reason}).`);
    }
    vnRollbackHistory = [];
}

function _deepCopy(obj) {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * Mundur satu baris tampil. Return false bila tidak ada riwayat (baris pertama,
 * atau riwayat terpotong batas choice/custom) — pemanggil boleh mengabaikan.
 */
function requestPrevLine() {
    const _mainWindow = _targetWindowOverride || _getMainWindow();
    if (!_mainWindow || _mainWindow.isDestroyed()) return false;
    if (vnRollbackHistory.length < 2) return false;

    invalidateChoiceIntent();

    const popped = vnRollbackHistory.pop();
    // Cabut baris yang di-pop dari backlog supaya tidak dobel saat maju lagi.
    // (backlog menyimpan teks polos → bandingkan versi polos payload)
    if (popped.payload && (popped.payload.type === 'dialogue' || popped.payload.type === 'choice') && popped.payload.text) {
        const last = vnDialogueHistory[vnDialogueHistory.length - 1];
        if (last && last.text === stripTextTags(popped.payload.text)) vnDialogueHistory.pop();
    }

    const prev = vnRollbackHistory[vnRollbackHistory.length - 1];
    currentVNIndex = prev.index;
    currentVNState = _deepCopy(prev.state);

    // Replay payload lama, disanitasi: transisi instan, tanpa mengulang efek
    // satu-kali (specialEvent/sfxIn/voice) yang sudah dialami pemain.
    const replay = _deepCopy(prev.payload);
    replay.isRollback = true;
    replay.transition = 'cut';
    delete replay.isChainedTransition;
    delete replay.specialEvent;
    delete replay.voice; delete replay.voiceVolume;
    delete replay.sfxIn; delete replay.sfxInVolume; delete replay.sfxInDelay; delete replay.sfxInPan;
    delete replay.sfx; delete replay.sfxVolume; delete replay.sfxDelay; delete replay.sfxPan;
    if (replay.bgmOneShot) {
        // Jangan mengulang sting — putar BGM dasar yang seharusnya sedang berjalan.
        if (replay.bgmResumeSrc) {
            replay.bgm = replay.bgmResumeSrc;
            replay.bgmVolume = replay.bgmResumeVolume;
            replay.bgmPan = replay.bgmResumePan;
        } else {
            delete replay.bgm; delete replay.bgmVolume; delete replay.bgmPan;
        }
        delete replay.bgmOneShot; delete replay.bgmOneShotDuration;
        delete replay.bgmResumeSrc; delete replay.bgmResumeVolume; delete replay.bgmResumePan;
    }
    replay.canRollback = vnRollbackHistory.length >= 2;
    if (replay.type === 'choice') prepareChoiceIntentPayload(replay);

    console.log(`[VN Engine] Rollback ke index ${prev.index} (sisa riwayat: ${vnRollbackHistory.length}).`);
    _mainWindow.webContents.send('vn-engine:update-display', replay);
    return true;
}

// Getter function ke mainWindow, diinject saat init
let _getMainWindow = () => null;
let _visualNovelsDirectory = '';

// Override target window — digunakan untuk chapter preview
// Jika di-set, processAndSendVNUpdate() akan mengirim ke window ini
let _targetWindowOverride = null;

function init(getMainWindow, visualNovelsDirectory) {
    _getMainWindow = getMainWindow;
    _visualNovelsDirectory = visualNovelsDirectory;
}

// ---------- Chapter Manifest opsional (chapters.json di root novel) ----------
// Format: [{ folder, title?, desc?, cover?, order?, unlockFlag? }, ...]
// Opsional & backward-compatible: tanpa file ini, urutan/nama tetap dari
// fs.readdirSync + heuristik lama (lihat getNextChapterSync).
function _readChapterManifest(storyPath) {
    try {
        const p = path.join(storyPath, 'chapters.json');
        if (!fs.existsSync(p)) return null;
        const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
        return Array.isArray(data) ? data : null;
    } catch (e) {
        console.error('[VN Engine] chapters.json tidak valid, diabaikan:', e.message);
        return null;
    }
}

// ---------- Helper: Daftar Chapter ----------
// Pelapor progres untuk status Discord. Disuntik dari luar (bukan di-require)
// supaya core tetap bisa dimuat unit test tanpa membawa serta seluruh rantai
// kehadiran — dan supaya core tidak perlu tahu apa pun soal Discord.
let _pelaporProgres = null;

/** @param {null|function({index: number, total: number}): void} fn */
function setProgressReporter(fn) {
    _pelaporProgres = typeof fn === 'function' ? fn : null;
}

function _laporProgres() {
    if (!_pelaporProgres) return;
    try {
        _pelaporProgres({ index: currentVNIndex, total: currentVNScript.length });
    } catch (e) {
        // Status Discord tidak boleh jadi alasan satu baris cerita gagal tampil.
        console.error('[VN Engine] Pelapor progres melempar (diabaikan):', e.message);
    }
}

function getChapterListData(storyTitle) {
    const decodedTitle = decodeURIComponent(storyTitle);
    const storyPath = path.join(_visualNovelsDirectory, decodedTitle);
    const mainChapters = [];
    const sideStories = [];
    try {
        const folders = fs.readdirSync(storyPath);
        folders.forEach((folder) => {
            const folderPath = path.join(storyPath, folder);
            if (fs.statSync(folderPath).isDirectory()) {
                if (folder.toLowerCase() === 'sidestories') {
                    const subfolders = fs.readdirSync(folderPath);
                    subfolders.forEach((subfolder) => {
                        const subfolderPath = path.join(folderPath, subfolder);
                        if (fs.statSync(subfolderPath).isDirectory()) {
                            const indexPath = path.join(subfolderPath, 'script.json');
                            if (fs.existsSync(indexPath)) {
                                sideStories.push(subfolder);
                            }
                        }
                    });
                } else {
                    const indexPath = path.join(folderPath, 'script.json');
                    if (fs.existsSync(indexPath)) {
                        mainChapters.push(folder);
                    }
                }
            }
        });
    } catch (err) {
        console.error('Error membaca chapter:', err);
    }

    // Manifest opsional: urutan eksplisit + metadata (judul tampil, deskripsi, cover, unlock).
    const manifest = _readChapterManifest(storyPath);
    let chapterMeta = null;
    if (manifest) {
        const orderOf = {};
        manifest.forEach((entry, idx) => {
            if (entry && entry.folder) orderOf[entry.folder] = (entry.order !== undefined ? entry.order : idx);
        });
        mainChapters.sort((a, b) => {
            const oa = orderOf.hasOwnProperty(a) ? orderOf[a] : Infinity;
            const ob = orderOf.hasOwnProperty(b) ? orderOf[b] : Infinity;
            return oa - ob; // stable untuk nilai sama (Node/V8 sort stabil)
        });
        const hubFlags = _readHubFlagsSync(decodedTitle);
        chapterMeta = {};
        manifest.forEach((entry) => {
            if (!entry || !entry.folder) return;
            chapterMeta[entry.folder] = {
                title: entry.title || entry.folder,
                desc: entry.desc || '',
                cover: entry.cover || '',
                order: entry.order !== undefined ? entry.order : null,
                unlockFlag: entry.unlockFlag || null,
                locked: !!(entry.unlockFlag && !hubFlags[entry.unlockFlag])
            };
        });
    }

    return { mainChapters, sideStories, chapterMeta };
}

/**
 * Urutan chapter utama sebagaimana pemain melihatnya.
 *
 * Dipisah jadi fungsi sendiri karena sekarang punya DUA pembaca: progression
 * otomatis di akhir chapter, dan penunjuk posisi bab di status Discord
 * ("Bab 3 dari 12"). Kalau keduanya mengurutkan sendiri-sendiri, cepat atau
 * lambat salah satunya akan menyebut nomor yang tidak cocok dengan urutan yang
 * benar-benar dimainkan.
 *
 * Jika ada chapters.json, `mainChapters` SUDAH terurut sesuai manifest (order
 * eksplisit). Tanpa manifest dipakai heuristik lama: "prolog" duluan, lalu angka
 * pertama yang muncul di nama folder.
 */
function urutanChapterUtama(chaptersResponse) {
    if (!chaptersResponse || !Array.isArray(chaptersResponse.mainChapters)) return [];
    if (chaptersResponse.chapterMeta) return chaptersResponse.mainChapters;
    return chaptersResponse.mainChapters.slice().sort((a, b) => {
        const getNumber = (name) => {
            if (name.toLowerCase().includes('prolog')) return 0;
            const match = name.match(/\d+/);
            return match ? parseInt(match[0], 10) : Infinity;
        };
        return getNumber(a) - getNumber(b);
    });
}

// Helper sinkron — cek chapter selanjutnya (dipanggil di akhir chapter)
function getNextChapterSync() {
    if (!currentStoryTitle || !currentChapter) return null;
    const chaptersResponse = getChapterListData(currentStoryTitle);
    const mainChapters = urutanChapterUtama(chaptersResponse);
    const currentIndex = mainChapters.indexOf(currentChapter);
    if (currentIndex > -1 && currentIndex < mainChapters.length - 1) {
        const nextChapter = mainChapters[currentIndex + 1];
        // Chapter Select tidak mengizinkan chapter ber-unlockFlag yang flag-nya
        // belum aktif. Progression otomatis wajib mematuhi boundary yang sama;
        // jika tidak, tombol "Chapter Selanjutnya" menjadi jalan pintas untuk
        // melewati chapter terkunci. Jangan melompati chapter terkunci ke chapter
        // setelahnya karena itu akan merusak urutan progression yang ditulis author.
        const nextMeta = chaptersResponse.chapterMeta && chaptersResponse.chapterMeta[nextChapter];
        if (nextMeta && nextMeta.locked) return null;
        return nextChapter;
    }
    return null;
}

// =============================================
// handleJump — Navigasi antar label/fase/perintah spesial
// Logika ini cukup kompleks karena mendukung nested label, sub-label,
// dan berbagai perintah spesial (##FINISH_PARENT##, ##SKIP_ALL_LABEL##, dll).
// Hati-hati kalau mau modifikasi, pastikan testing branching novelnya menyeluruh!
// =============================================
/**
 * Resolve target simbol ke indeks script dengan satu aturan canonical.
 *
 * Kontrak kompatibilitas:
 *   - `fase:Nama` / `phase:Nama` selalu menunjuk phase.
 *   - Target tanpa prefix mencari label terlebih dahulu.
 *   - Bila label tidak ada, target tanpa prefix boleh menemukan phase. Fallback
 *     ini mempertahankan script lama yang choice-nya menyimpan nama phase mentah.
 *   - Perintah `##...##` tetap ditangani oleh handleJump karena maknanya
 *     bergantung pada posisi saat ini, bukan sekadar symbol lookup.
 *
 * Fungsi ini murni agar compiler/linter dan regression test dapat memakai aturan
 * yang sama tanpa memutasi singleton state engine.
 */
function resolveNavigationTarget(target, script = currentVNScript) {
    if (typeof target !== 'string' || !target || !Array.isArray(script)) {
        return { index: -1, kind: null, name: null };
    }

    let phaseName = null;
    if (target.startsWith('fase:')) phaseName = target.slice('fase:'.length);
    else if (target.startsWith('phase:')) phaseName = target.slice('phase:'.length);

    if (phaseName !== null) {
        return {
            index: script.findIndex(line => line && line.type === 'phase' && line.name === phaseName),
            kind: 'phase',
            name: phaseName
        };
    }

    const labelIndex = script.findIndex(line => line && line.type === 'label' && line.name === target);
    if (labelIndex !== -1) return { index: labelIndex, kind: 'label', name: target };

    const legacyPhaseIndex = script.findIndex(line => line && line.type === 'phase' && line.name === target);
    if (legacyPhaseIndex !== -1) return { index: legacyPhaseIndex, kind: 'phase', name: target };

    return { index: -1, kind: 'label', name: target };
}

function handleJump(target) {
    console.log(`[VN Engine] JUMP diproses. Target: '${target}'`);
    let newIndex = -1;

    // Helper — cari akhir blok label INDUK
    const findEndOfParentBlock = (startIndex) => {
        let parentName = null;
        for (let i = startIndex; i >= 0; i--) {
            if (currentVNScript[i].type === 'label' && !currentVNScript[i].name.includes('.')) {
                parentName = currentVNScript[i].name;
                break;
            }
        }
        if (!parentName) return startIndex;

        const endOfBlockIndex = currentVNScript.findIndex((line, index) => {
            if (index <= startIndex) return false;
            switch (line.type) {
                case 'dialogue':
                case 'choice':
                case 'scene':
                case 'jump':
                    return false;
                case 'label':
                    return !line.name.startsWith(parentName + '.');
                case 'phase':
                    return true;
                default:
                    return true;
            }
        });
        return endOfBlockIndex !== -1 ? endOfBlockIndex : currentVNScript.length;
    };

    // Helper — cari akhir blok SUB-LABEL
    const findEndOfSubLabelBlock = (startIndex) => {
        for (let i = startIndex + 1; i < currentVNScript.length; i++) {
            const line = currentVNScript[i];
            if (line.type === 'jump' || (line.type === 'label' && !line.name.includes('.'))) {
                return i;
            }
        }
        return currentVNScript.length;
    };

    // ================== PENANGANAN PERINTAH SPESIAL ==================
    if (target === '##CONTINUE_PARENT##' || target === '##EXIT_SUB_LABEL##') {
        console.log(`[VN Engine] ${target}: Keluar dari blok sub-label.`);
        let endOfSubBlock = findEndOfSubLabelBlock(currentVNIndex);
        newIndex = currentVNScript[endOfSubBlock]?.type === 'jump' ? endOfSubBlock + 1 : endOfSubBlock;

    } else if (target === '##CONTINUE_PARENT_FLOW##') {
        console.log(`[VN Engine] ##CONTINUE_PARENT_FLOW##: Mencari entri selanjutnya di label induk.`);
        let endOfCurrentSubBlock = findEndOfSubLabelBlock(currentVNIndex);
        let searchStartIndex = currentVNScript[endOfCurrentSubBlock]?.type === 'jump' ? endOfCurrentSubBlock + 1 : endOfCurrentSubBlock;
        let parentBlockEnd = findEndOfParentBlock(currentVNIndex);

        for (let i = searchStartIndex; i < parentBlockEnd; i++) {
            const line = currentVNScript[i];
            if (line.type === 'label' && line.name.includes('.')) {
                let end = findEndOfSubLabelBlock(i);
                i = currentVNScript[end]?.type === 'jump' ? end : end - 1;
                continue;
            }
            if (line.type !== 'label' && line.type !== 'jump') {
                newIndex = i;
                break;
            }
        }
        if (newIndex === -1) newIndex = parentBlockEnd;

    } else if (target === '##FINISH_PARENT##' || target === '##EXIT_LABEL##') {
        const endOfBlock = findEndOfParentBlock(currentVNIndex);

        let exitJumpIndex = -1;
        for (let i = endOfBlock - 1; i > currentVNIndex; i--) {
            const line = currentVNScript[i];
            if (line.type === 'label') break;
            if (line.type === 'jump') {
                if (line.target && (line.target.startsWith('fase:') || line.target.startsWith('##'))) {
                    exitJumpIndex = i;
                    break;
                }
            }
        }

        if (exitJumpIndex !== -1) {
            newIndex = exitJumpIndex;
            console.log(`[VN Engine] ${target}: Keluar dari blok. Ditemukan exit jump di index ${exitJumpIndex}, mengeksekusi...`);
        } else {
            newIndex = endOfBlock;
            console.log(`[VN Engine] ${target}: Keluar dari blok. Melanjutkan dari index ${newIndex}`);
        }

    } else if (target === '##SKIP_ALL_LABEL##') {
        console.log(`[VN Engine] ##SKIP_ALL_LABEL##: Mencari alur utama setelah SEMUA blok label.`);

        const endOfPhaseIndex = currentVNScript.findIndex((line, index) => index > currentVNIndex && line.type === 'phase');
        const searchLimit = (endOfPhaseIndex !== -1) ? endOfPhaseIndex : currentVNScript.length;

        const allParentLabelIndexes = [];
        for (let i = currentVNIndex + 1; i < searchLimit; i++) {
            const line = currentVNScript[i];
            if (line.type === 'label' && !line.name.includes('.')) {
                allParentLabelIndexes.push(i);
            }
        }

        console.log(`[VN Engine] Ditemukan ${allParentLabelIndexes.length} label induk di fase ini: indexes ${allParentLabelIndexes.join(', ')}`);

        if (allParentLabelIndexes.length === 0) {
            for (let i = currentVNIndex + 1; i < searchLimit; i++) {
                const line = currentVNScript[i];
                if (line.type !== 'jump' && line.type !== 'label') {
                    newIndex = i;
                    break;
                }
            }
        } else {
            const lastLabelIndex = allParentLabelIndexes[allParentLabelIndexes.length - 1];

            let lastJumpInLabel = -1;
            for (let i = lastLabelIndex + 1; i < searchLimit; i++) {
                const line = currentVNScript[i];
                if (line.type === 'label' && !line.name.includes('.')) break;
                if (line.type === 'label' && line.name.startsWith(currentVNScript[lastLabelIndex].name + '.')) continue;
                if (line.type === 'jump') {
                    if (line.target && (line.target.startsWith('##') || line.target.startsWith('fase:'))) {
                        lastJumpInLabel = i;
                        console.log(`[VN Engine] Exit jump ditemukan di index ${i}: "${line.target}". STOP pencarian.`);
                        break;
                    }
                }
            }

            const searchStart = lastJumpInLabel !== -1 ? lastJumpInLabel + 1 : lastLabelIndex + 1;

            for (let i = searchStart; i < searchLimit; i++) {
                const line = currentVNScript[i];
                if (line.type === 'label' && !line.name.includes('.')) {
                    let labelEnd = i + 1;
                    for (let j = i + 1; j < searchLimit; j++) {
                        if (currentVNScript[j].type === 'label' && !currentVNScript[j].name.includes('.')) { labelEnd = j; break; }
                        if (currentVNScript[j].type === 'phase') { labelEnd = j; break; }
                        if (currentVNScript[j].type === 'jump' &&
                            (currentVNScript[j].target?.startsWith('##') || currentVNScript[j].target?.startsWith('fase:'))) {
                            labelEnd = j + 1;
                        }
                    }
                    i = labelEnd - 1;
                    continue;
                }
                if (line.type === 'jump') continue;
                if (line.type === 'label') continue;
                newIndex = i;
                console.log(`[VN Engine] Ditemukan entri di luar label pada index ${i}: "${line.text || line.type}"`);
                break;
            }
        }

        if (newIndex === -1) {
            console.log(`[VN Engine] Tidak ada entri di luar label. Lanjut ke fase berikutnya.`);
            newIndex = searchLimit;
        }

    } else if (target) {
        const destination = resolveNavigationTarget(target, currentVNScript);
        newIndex = destination.index;
        console.log(`[VN Engine] Mencari ${destination.kind || 'target'} '${destination.name || target}'... Ditemukan di index: ${newIndex}`);
    }

    if (newIndex !== -1) {
        currentVNIndex = newIndex;
    } else {
        console.log(`[VN Engine] Target jump '${target}' tidak ditemukan. Lanjut ke baris berikutnya.`);
        currentVNIndex++;
    }
}

// Satu mutator untuk semua hasil choice: choice normal, auto-dialogue yang
// menunda jump, chapter preview, dan popup preview label. Dengan demikian tidak
// ada lagi cabang yang mengenali label tetapi tidak mengenali `fase:Nama`.
function commitChoiceTarget(target) {
    invalidateChoiceIntent();
    if (typeof target === 'string' && target) {
        handleJump(target);
    } else {
        currentVNIndex++;
    }
}

// =============================================
// Helper: Resolusi operand — dukung referensi variabel lain (var-vs-var)
// Bentuk yang diterima sebagai referensi variabel (SEMUA JSON terstruktur,
// tervisualisasi editor, TIDAK ada string ekspresi):
//   - String berawalan '$'          : "$affRin"  → variables.affRin
//   - Object { var: 'nama' }        : { "var": "affRin" }
//   - Object { var: 'nama', index } : { "var": "rute", "index": 0 } — elemen array;
//                                     index boleh operand lagi ("$i" / {var:'i'}).
//   - Object { concat: [...] }      : { "concat": ["ch", "$bab", "_akhir"] } —
//                                     gabung string; tiap elemen di-resolve dulu.
// Selain itu nilai dipakai apa adanya (literal). Variabel tak dikenal → 0
// (konsisten dengan default evaluateCondition).
// =============================================
function resolveOperand(value, variables) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        if (Array.isArray(value.concat)) {
            return value.concat.map(part => {
                const r = resolveOperand(part, variables);
                return r === undefined || r === null ? '' : String(r);
            }).join('');
        }
        if (value.var !== undefined) {
            let v = variables[value.var];
            if (value.index !== undefined) {
                const idx = Number(resolveOperand(value.index, variables));
                v = (Array.isArray(v) || typeof v === 'string') ? v[idx] : undefined;
            }
            return v === undefined ? 0 : v;
        }
    }
    if (typeof value === 'string' && value.length > 1 && value.charAt(0) === '$') {
        const v = variables[value.slice(1)];
        return v === undefined ? 0 : v;
    }
    return value;
}

// Helper: resolusi target jump/call — statis (`target`), dari variabel (`targetVar`),
// atau gabungan terstruktur (`targetConcat`). Dipakai entry jump DAN call.
function _resolveJumpTarget(line) {
    const vars = (currentVNState && currentVNState.variables) || {};
    if (line.targetVar) {
        const v = vars[line.targetVar];
        if (v !== undefined && v !== null && String(v) !== '') {
            console.log(`[VN Engine] Target dinamis: targetVar '${line.targetVar}' → '${v}'`);
            return String(v);
        }
        console.warn(`[VN Engine] targetVar '${line.targetVar}' kosong/tak ada — fallback ke target statis '${line.target || ''}'.`);
        return line.target;
    }
    if (Array.isArray(line.targetConcat)) {
        const t = String(resolveOperand({ concat: line.targetConcat }, vars));
        console.log(`[VN Engine] Target dinamis: targetConcat → '${t}'`);
        return t;
    }
    return line.target;
}

// =============================================
// Helper: Evaluasi Kondisi (Fase 4B; diperluas: var-vs-var, any/all/not, between)
// Bentuk kondisi:
//   { var, op, value }            — value boleh literal, "$var", atau {var:'nama'}
//   [cond, cond, ...]             — AND (kompatibel lama)
//   { all: [...] }                — AND eksplisit
//   { any: [...] }                — OR
//   { not: cond }                 — negasi
// Operator: == != > >= < <= in !in between
//   'between' : value = [min, max] inklusif (elemen boleh referensi variabel).
// =============================================
function evaluateCondition(conditionObj, variables) {
    if (!conditionObj || typeof conditionObj !== 'object') return true; // Tidak ada syarat = lulus

    // Support multiple conditions (AND) array
    if (Array.isArray(conditionObj)) {
        return conditionObj.every(cond => evaluateCondition(cond, variables));
    }

    // Kombinator logika
    if (Array.isArray(conditionObj.all)) {
        return conditionObj.all.every(cond => evaluateCondition(cond, variables));
    }
    if (Array.isArray(conditionObj.any)) {
        return conditionObj.any.some(cond => evaluateCondition(cond, variables));
    }
    if (conditionObj.not !== undefined) {
        return !evaluateCondition(conditionObj.not, variables);
    }

    const { var: varName, op, value } = conditionObj;
    if (!varName || !op) return true;

    // Sisi kiri: dukung subscript terstruktur — { var:'rute', index:0, op, value }
    let varValue = variables[varName] !== undefined ? variables[varName] : 0; // Default 0 jika tak ada
    if (conditionObj.index !== undefined) {
        const idx = Number(resolveOperand(conditionObj.index, variables));
        varValue = (Array.isArray(varValue) || typeof varValue === 'string') ? varValue[idx] : undefined;
        if (varValue === undefined) varValue = 0;
    }
    const cmpValue = resolveOperand(value, variables);

    switch (op) {
        case '==':
        case '=':  return String(varValue) === String(cmpValue);
        case '!=': return String(varValue) !== String(cmpValue);
        case '>':  return Number(varValue) > Number(cmpValue);
        case '>=': return Number(varValue) >= Number(cmpValue);
        case '<':  return Number(varValue) < Number(cmpValue);
        case '<=': return Number(varValue) <= Number(cmpValue);
        case 'in': return Array.isArray(value) && value.map(v => resolveOperand(v, variables)).includes(varValue);
        case '!in': return Array.isArray(value) && !value.map(v => resolveOperand(v, variables)).includes(varValue);
        case 'between': {
            if (!Array.isArray(value) || value.length < 2) return true;
            const lo = Number(resolveOperand(value[0], variables));
            const hi = Number(resolveOperand(value[1], variables));
            const n = Number(varValue);
            return n >= Math.min(lo, hi) && n <= Math.max(lo, hi);
        }
        default: return true;
    }
}

// =============================================
// Choice authority boundary (R-02)
// =============================================
function invalidateChoiceIntent() {
    _activeChoiceIntent = null;
}

/**
 * Siapkan payload choice yang aman untuk renderer.
 *
 * Opsi difilter dari entry canonical di currentVNScript, bukan dari payload
 * buatan pemanggil. Yang disimpan di authority record adalah indeks opsi ASLI,
 * sehingga perubahan variabel setelah render tidak dapat menggeser optionIndex
 * ke opsi lain. `payload` tetap hanya mendapat salinan untuk keperluan tampilan.
 */
function prepareChoiceIntentPayload(payload) {
    invalidateChoiceIntent();

    const entry = currentVNScript[currentVNIndex];
    const variables = (currentVNState && currentVNState.variables) || {};
    if (!payload || !entry || entry.type !== 'choice' || !Array.isArray(entry.choices)) {
        return { ok: false, reason: 'not-current-choice', count: 0 };
    }

    const visible = [];
    entry.choices.forEach((choice, originalOptionIndex) => {
        if (!choice || typeof choice !== 'object' || Array.isArray(choice)) return;
        if (evaluateCondition(choice.condition, variables)) {
            visible.push({ choice, originalOptionIndex });
        }
    });

    payload.choices = visible.map(({ choice }) => ({ ...choice }));
    if (visible.length === 0) {
        return { ok: false, reason: 'no-visible-options', count: 0 };
    }

    const choiceToken = `choice-${++_choiceIntentSequence}`;
    payload.choiceToken = choiceToken;
    _activeChoiceIntent = {
        choiceToken,
        script: currentVNScript,
        entry,
        entryIndex: currentVNIndex,
        visibleOptionIndexes: visible.map(item => item.originalOptionIndex),
        committed: false
    };

    return { ok: true, choiceToken, count: visible.length };
}

/**
 * Resolve intent minimal `{ choiceToken, optionIndex }` menjadi opsi canonical.
 * Tidak satu pun field efek dari renderer dipercaya. Commit valid ditandai
 * one-shot sebelum efek diterapkan agar dua IPC beruntun tidak menggandakan
 * setVariable/jump. Intent invalid tidak mengunci choice; pemain masih dapat
 * menekan opsi valid setelah payload palsu/out-of-range ditolak.
 */
function resolveChoiceIntent(intent) {
    if (!intent || typeof intent !== 'object' || Array.isArray(intent)) {
        return { ok: false, reason: 'invalid-intent' };
    }
    if (!_activeChoiceIntent) return { ok: false, reason: 'no-active-choice' };
    if (intent.choiceToken !== _activeChoiceIntent.choiceToken) {
        return { ok: false, reason: 'stale-choice-token' };
    }
    if (_activeChoiceIntent.committed) return { ok: false, reason: 'already-committed' };
    if (!Number.isInteger(intent.optionIndex) || intent.optionIndex < 0) {
        return { ok: false, reason: 'invalid-option-index' };
    }

    const entry = currentVNScript[currentVNIndex];
    if (currentVNScript !== _activeChoiceIntent.script ||
        currentVNIndex !== _activeChoiceIntent.entryIndex ||
        entry !== _activeChoiceIntent.entry ||
        !entry || entry.type !== 'choice' || !Array.isArray(entry.choices)) {
        return { ok: false, reason: 'choice-state-changed' };
    }

    const originalOptionIndex = _activeChoiceIntent.visibleOptionIndexes[intent.optionIndex];
    if (!Number.isInteger(originalOptionIndex)) {
        return { ok: false, reason: 'option-out-of-range' };
    }

    const choice = entry.choices[originalOptionIndex];
    if (!choice || typeof choice !== 'object' || Array.isArray(choice)) {
        return { ok: false, reason: 'canonical-option-missing' };
    }

    // Bila variabel berubah lewat custom command saat panel choice masih tampil,
    // jangan memilih opsi yang kini tersembunyi dan jangan remap indeksnya.
    const variables = (currentVNState && currentVNState.variables) || {};
    if (!evaluateCondition(choice.condition, variables)) {
        return { ok: false, reason: 'option-no-longer-visible' };
    }

    _activeChoiceIntent.committed = true;
    return { ok: true, choice, entry, originalOptionIndex };
}

// =============================================
// applySetVar — Operasi set variable canonical
// Dipakai oleh set_var entry DAN choice.setVariable. `value` boleh literal,
// referensi variabel, atau concat. `index` menarget elemen array.
// =============================================
function applySetVar(variables, name, op, value, index) {
    if (!name) return;
    const effectiveOp = op || '=';

    // Mode elemen array: operasikan variables[name][idx] lalu tulis balik.
    if (index !== undefined && index !== null && index !== '') {
        const idx = Number(resolveOperand(index, variables));
        if (!Number.isNaN(idx)) {
            if (!Array.isArray(variables[name])) variables[name] = [];
            const holder = { __el: variables[name][idx] };
            applySetVar(holder, '__el', effectiveOp, value);
            variables[name][idx] = holder.__el;
            return;
        }
    }

    let currentVal = variables[name];
    if (currentVal === undefined) currentVal = 0;

    const resolved = (effectiveOp === 'random') ? value : resolveOperand(value, variables);
    let numVal = Number(currentVal);
    let numInput = Number(resolved);

    switch (effectiveOp) {
        case '=':
        case 'set': variables[name] = resolved; break;
        case 'add':
        case '+=':  variables[name] = numVal + numInput; break;
        case 'sub':
        case '-=':  variables[name] = numVal - numInput; break;
        case 'mul':
        case '*=':  variables[name] = numVal * numInput; break;
        case 'div':
        case '/=':  variables[name] = numInput !== 0 ? numVal / numInput : numVal; break;
        case 'mod':
        case '%=':  variables[name] = numInput !== 0 ? numVal % numInput : numVal; break;
        case 'min': variables[name] = Math.min(numVal, numInput); break;
        case 'max': variables[name] = Math.max(numVal, numInput); break;
        case 'random': {
            // value = [min, max] (boleh referensi variabel) → integer uniform inklusif.
            const lo = Array.isArray(value) ? Number(resolveOperand(value[0], variables)) : 0;
            const hi = Array.isArray(value) ? Number(resolveOperand(value[1], variables)) : Number(resolved) || 0;
            const a = Math.min(lo, hi), b = Math.max(lo, hi);
            variables[name] = Math.floor(Math.random() * (b - a + 1)) + a;
            break;
        }
        default: variables[name] = resolved; break;
    }
}

// =============================================
// interpolateVars — sisipkan variabel cerita ke dalam string, mis. "Halo {playerName}!"
// Dipakai untuk field text/speaker/choice.text sebelum dikirim ke renderer, supaya
// pola self-insert (nama pemain, dsb.) bisa dipanggil ulang di dialog mana pun.
// Token yang variabelnya TIDAK ADA sengaja dibiarkan apa adanya (bukan diganti string
// kosong) — supaya typo nama variabel langsung kelihatan di layar, bukan diam-diam
// menghilang. Rendering dialog memakai textContent (lihat typewriter.js), jadi nilai
// variabel apa pun (termasuk yang diketik pemain sendiri via choice.inputType 'text')
// aman ditampilkan tanpa risiko injeksi markup.
// =============================================
function interpolateVars(text, variables) {
    if (typeof text !== 'string' || text.indexOf('{') === -1) return text;
    if (!variables) return text;
    return text.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, function (match, name) {
        return Object.prototype.hasOwnProperty.call(variables, name) ? String(variables[name]) : match;
    });
}

// =============================================
// stripTextTags — buang text tag inline [w]/[cps=..]/[i]..[/i]/[color=..] dsb.
// (findings DDLC §5; grammar sinkron dengan vn-player/js/typewriter.js#tokenize)
// Dipakai untuk backlog/history — pemain melihat teks polos di panel riwayat.
// `[[` = kurung siku literal. Tag tak dikenal dibiarkan (konsisten typewriter).
// =============================================
function stripTextTags(text) {
    if (typeof text !== 'string' || text.indexOf('[') === -1) return text;
    return text.replace(/\[\[|\[(\/?)(w|nw|cps|i|b|s|u|color|size)(?:=[^\]]*)?\]/g,
        function (m) { return m === '[[' ? '[' : ''; });
}

// =============================================
// processAndSendVNUpdate — Game loop utama
// Membaca baris saat ini dari script, membangun payload visual,
// dan mengirimnya ke renderer via IPC
// =============================================
// MAX_SILENT_STEPS: Batas iterasi silent (skip condition, set_var, phase/label, jump, filtered choice)
// untuk mencegah infinite loop pada skrip yang memiliki jump cycle atau semua choice terfilter.
const MAX_SILENT_STEPS = 500;


function processAndSendVNUpdate() {
    const _mainWindow = _targetWindowOverride || _getMainWindow();
    if (!_mainWindow || _mainWindow.isDestroyed()) return;

    // Setiap tick render membuka epoch intent baru. Event choice dari payload
    // sebelumnya otomatis menjadi basi, termasuk setelah jump/transition.
    invalidateChoiceIntent();

    // Iterative loop menggantikan recursive calls untuk mencegah stack overflow
    let silentSteps = 0;

    while (true) {
        if (silentSteps++ > MAX_SILENT_STEPS) {
            console.error(`[VN Engine] ABORT: Lebih dari ${MAX_SILENT_STEPS} langkah silent berturut-turut. Kemungkinan infinite loop pada skrip.`);
            _mainWindow.webContents.send('vn-engine:end-of-chapter', { hasNextChapter: false, error: 'infinite-loop-detected' });
            return;
        }

    // Cek apakah sudah di fase ending dan baris berikutnya = phase baru / akhir file
    if (currentVNState.isInEndingPhase) {
        const nextLine = currentVNScript[currentVNIndex];
        if (!nextLine || nextLine.type === 'phase') {
            console.log(`[VN Engine] Mencapai akhir dari FASE ENDING. Mengirim sinyal end-of-chapter.`);
            persistStoryVars('ending-phase');
            _mainWindow.webContents.send('vn-engine:end-of-chapter', {
                hasNextChapter: false
            });
            return;
        }
    }

    // Bounds validation sebelum akses script array
    if (currentVNIndex < 0 || currentVNIndex >= currentVNScript.length) {
        if (currentVNIndex >= currentVNScript.length) {
            console.log(`[VN Engine] Mencapai akhir skrip. Index: ${currentVNIndex}. Mengirim sinyal end-of-chapter.`);
        } else {
            console.error(`[VN Engine] Index negatif terdeteksi: ${currentVNIndex}. Menghentikan eksekusi.`);
        }
        persistStoryVars('end-of-script');
        _mainWindow.webContents.send('vn-engine:end-of-chapter', {
            hasNextChapter: getNextChapterSync() !== null
        });
        return;
    }

    const currentLine = currentVNScript[currentVNIndex];

    // Pastikan variables sub-object selalu ada
    if (!currentVNState.variables) currentVNState.variables = {};

    // Evaluasi Kondisi Blok (Fase 4B)
    if (currentLine.condition) {
        const passed = evaluateCondition(currentLine.condition, currentVNState.variables);
        if (!passed) {
            console.log(`[VN Engine] Skip entri index ${currentVNIndex} karena kondisi variabel tidak terpenuhi.`);
            currentVNIndex++;
            continue; // Iterative — lanjut ke iterasi berikutnya
        }
    }

    // Eksekusi Operasi Variabel
    if (currentLine.type === 'set_var') {
        const { name, op, value, index } = currentLine;
        if (name && op) {
            if (!currentVNState.variables) currentVNState.variables = {};
            applySetVar(currentVNState.variables, name, op, value, index);
            const shown = index !== undefined ? `${name}[${index}]` : name;
            console.log(`[VN Engine] Set Var: '${shown}' operasi '${op}' dengan nilai '${JSON.stringify(value)}'. Hasil: ${JSON.stringify(currentVNState.variables[name])}`);
        }

        currentVNIndex++;
        continue; // Iterative
    }

    // Impor hub-flags.json / story-vars.json ke variabel cerita (jembatan hub→script).
    // { "type": "load_hub_flags", "prefix": "hf_", "source": "hub-flags"|"story-vars"|"both" }
    if (currentLine.type === 'load_hub_flags') {
        if (!currentVNState.variables) currentVNState.variables = {};
        const prefix = currentLine.prefix || '';
        const source = currentLine.source || 'hub-flags';
        const imported = {};
        if (source === 'hub-flags' || source === 'both') Object.assign(imported, _readHubFlagsSync(currentStoryTitle));
        if (source === 'story-vars' || source === 'both') Object.assign(imported, _readStoryVarsSync(currentStoryTitle));
        for (const key of Object.keys(imported)) {
            currentVNState.variables[prefix + key] = imported[key];
        }
        console.log(`[VN Engine] load_hub_flags: impor ${Object.keys(imported).length} variabel (prefix='${prefix}', source='${source}').`);

        currentVNIndex++;
        continue; // Iterative
    }

    // Proses phase dan label (metadata, bukan konten visual langsung)
    if (currentLine.type === 'phase' || currentLine.type === 'label') {

        if (currentLine.type === 'phase') {
            if (currentLine.isEnding) {
                currentVNState.isInEndingPhase = true;
                console.log(`[VN Engine] Memasuki FASE ENDING: '${currentLine.name}'`);
            } else {
                currentVNState.isInEndingPhase = false;
            }
        }

        // Seluruh penyerapan struktural (background stack, bgm, ambient, channel
        // bernama, kontrol sprite lengket) hidup di `story-carry.js` dan dipakai
        // BERSAMA dengan preview — lihat header modul itu untuk sebabnya.
        storyCarry.serapStruktural(currentVNState, currentLine);

        // Label yang mengubah aset visual → kirim transisi independen
        if (currentLine.type === 'label' && (currentLine.background || currentLine.video)) {
            const effect = currentLine.transition || 'cut';
            const payload = {
                bgm: currentVNState.lastBgmState?.src,
                background: currentVNState.backgroundStack[currentVNState.backgroundStack.length - 1]?.src,
                video: currentVNState.backgroundStack[currentVNState.backgroundStack.length - 1]?.type === 'video' ? currentVNState.backgroundStack[currentVNState.backgroundStack.length - 1].src : null,
                backgroundMode: currentVNState.backgroundStack[currentVNState.backgroundStack.length - 1]?.mode
            };

            console.log(`[VN Engine] Label dengan aset terdeteksi. Mengirim transisi '${effect}'...`);
            _mainWindow.webContents.send('vn-engine:execute-transition', {
                effect: effect,
                payload: payload
            });
            return;
        }

        currentVNIndex++;
        continue; // Iterative
    }

    // Proses jump — target statis (`target`), dinamis dari variabel (`targetVar`),
    // atau gabungan terstruktur (`targetConcat` = array elemen resolveOperand).
    // targetVar/targetConcat = bentuk JSON tervisualisasi editor (dekrit identitas §6),
    // BUKAN string ekspresi. Prioritas: targetVar > targetConcat > target.
    if (currentLine.type === 'jump') {
        handleJump(_resolveJumpTarget(currentLine));
        continue; // Iterative
    }

    // Proses call/return — gula opsional di atas label+jump (dekrit identitas §1):
    // `call` melompat ke label sambil mengingat titik kembali; `return` melanjutkan
    // dari entri setelah call terakhir. Stack hidup di currentVNState → otomatis
    // ikut rollback & save/load. Bukan pengganti jump — sekadar kenyamanan untuk
    // blok reusable yang dipanggil dari banyak titik.
    if (currentLine.type === 'call') {
        if (!Array.isArray(currentVNState.callStack)) currentVNState.callStack = [];
        const callTarget = _resolveJumpTarget(currentLine);
        if (currentVNState.callStack.length >= 64) {
            console.error(`[VN Engine] Call stack penuh (64) — 'call' ke '${callTarget}' diperlakukan sebagai jump biasa. Periksa call rekursif tanpa return.`);
        } else {
            currentVNState.callStack.push(currentVNIndex + 1);
            console.log(`[VN Engine] CALL → '${callTarget}' (return ke index ${currentVNIndex + 1}, kedalaman ${currentVNState.callStack.length}).`);
        }
        handleJump(callTarget);
        continue; // Iterative
    }

    if (currentLine.type === 'return') {
        if (Array.isArray(currentVNState.callStack) && currentVNState.callStack.length > 0) {
            currentVNIndex = currentVNState.callStack.pop();
            console.log(`[VN Engine] RETURN → index ${currentVNIndex} (sisa kedalaman ${currentVNState.callStack.length}).`);
        } else {
            console.warn(`[VN Engine] 'return' tanpa 'call' aktif di index ${currentVNIndex} — diabaikan (lanjut ke entri berikutnya).`);
            currentVNIndex++;
        }
        continue; // Iterative
    }

    // Bangun payload untuk dialogue/choice/scene
    const payload = { ...currentLine };

    // Filter + arm choice dilakukan dari entry canonical. Renderer hanya menerima
    // salinan display dan token ephemeral; optionIndex akan di-resolve lagi di main.
    if (payload.type === 'choice' && payload.inputType !== 'text') {
        const preparedChoice = prepareChoiceIntentPayload(payload);

        // Cek jika tidak ada pilihan yang valid tersisa, otomatis lompat agar tak macet
        if (!preparedChoice.ok) {
            console.warn(`[VN Engine] Semua opsi choice difilter (tidak ada yang memenuhi kondisi). Melompat...`);
            currentVNIndex++;
            continue; // Iterative
        }
    } else if (payload.type === 'choice') {
        // Text input memakai kontrak submit tersendiri dan tidak mempunyai array
        // opsi. Jangan memperlakukannya sebagai multiple-choice kosong.
        invalidateChoiceIntent();
    }

    // Cek flag transisi berantai dari baris sebelumnya
    if (currentVNState.skipNextTransitionIn) {
        console.log(`%c[VN Engine] Mendeteksi ini adalah transisi 'in' berantai. Menandai payload...`, 'color: #FFD700');
        payload.isChainedTransition = true;
        delete currentVNState.skipNextTransitionIn;
    }

    // Persist BGM level-entri (scene/dialogue/choice): prosedur authoring —
    // bgm pada entri APA PUN terus dipakai sampai bertemu judul baru.
    // (Dulu hanya phase/label yang dipersist; bgm pada scene/dialogue berhenti
    // di entri berikutnya karena payload berikut terkirim tanpa bgm → renderer
    // menghentikan musik.)
    // Stop eksplisit: "bgm": "none" atau "bgmStop": true.
    // Simpan state SEBELUM entri ini berpotensi menimpanya — dibutuhkan bgmOneShot
    // untuk tahu BGM apa yang harus di-resume setelah sting selesai (renderer
    // menjadwalkan resume via timer, lihat audio-manager.js).
    // Penyerapan + injeksi keadaan (bgm/ambient/channel/background/pembicara)
    // hidup di `story-carry.js`, dipakai BERSAMA dengan preview editor. Digabung
    // dalam dua panggilan dengan sengaja: pemanggil tak bisa lagi ingat bgm tapi
    // lupa ambient — persis cara preview tertinggal bertahun.
    if (!currentVNState.lastChannelState) currentVNState.lastChannelState = {};
    storyCarry.serapEntri(currentVNState, currentLine, payload);
    storyCarry.injeksiEntri(payload, currentVNState);

    // ===== Sprite LENGKET =====
    // Aturannya (termasuk urutan SLOT_PREFIX terpanjang-dulu & daftar NON_SLOT)
    // hidup di story-carry.js, dipakai bersama preview.
    storyCarry.serapSpriteLengket(currentVNState, currentLine, payload);

    // Persist background state untuk entri berikutnya (aturan bersama).
    storyCarry.persistLatar(currentVNState, currentLine);

    // Look-ahead: cek transisi berantai (scene → scene)
    if (currentLine.type === 'scene' && currentLine.transitionOut && currentLine.persistBackground === false) {
        const nextLine = currentVNScript[currentVNIndex + 1];
        const hasNextTransition = nextLine && nextLine.type === 'scene' &&
            nextLine.transition && nextLine.transition !== 'cut';

        if (hasNextTransition) {
            console.log(`%c[VN Engine] Look-ahead terpicu! ${currentLine.transitionOut} akan disambung ${nextLine.transition}`, 'color: #FFD700');
            currentVNState.skipNextTransitionIn = true;
            payload.nextTransition = nextLine.transition;
        }
    }

    // Interpolasi variabel ({namaVar}) di teks yang akan tampil — dilakukan di sini,
    // TERAKHIR, setelah semua injeksi/inherit state selesai (bgm/background/speaker),
    // supaya bukan bagian dari currentVNState yang tersimpan/di-cache.
    if (payload.text) payload.text = interpolateVars(payload.text, currentVNState.variables);
    if (payload.speaker) payload.speaker = interpolateVars(payload.speaker, currentVNState.variables);
    if (Array.isArray(payload.choices)) {
        payload.choices = payload.choices.map(function (c) {
            return (c && c.text) ? { ...c, text: interpolateVars(c.text, currentVNState.variables) } : c;
        });
    }

    // === Rollback bookkeeping ===
    // Entry `custom` = barrier: efek samping command tidak bisa dieksekusi ulang
    // dengan aman, jadi riwayat sebelum titik ini dibuang. Baris tampil biasa
    // (dialogue/choice/scene) di-snapshot: payload final + state SETELAH diproses.
    if (currentLine.type === 'custom') {
        clearRollbackHistory('barrier custom command');
        payload.canRollback = false;
    } else {
        vnRollbackHistory.push({
            index: currentVNIndex,
            payload: _deepCopy(payload),
            state: _deepCopy(currentVNState),
        });
        if (vnRollbackHistory.length > MAX_ROLLBACK_HISTORY) vnRollbackHistory.shift();
        payload.canRollback = vnRollbackHistory.length >= 2;
    }

    console.log(`\n--- [VN ENGINE TICK] ---`);
    console.log(`> Index Diproses: ${currentVNIndex}`);
    console.log(`> Payload Final Dikirim:`, payload);
    console.log(`------------------------\n`);

    _mainWindow.webContents.send('vn-engine:update-display', payload);

    // Dilaporkan SESUDAH baris terkirim, bukan sebelum: yang diukur adalah
    // seberapa jauh pemain sudah dibawa, bukan seberapa jauh engine sudah
    // membaca berkasnya.
    _laporProgres();

    // Simpan ke history (teks polos — tag inline [w]/[i] dsb. dibuang)
    if ((currentLine.type === 'dialogue' || currentLine.type === 'choice') && payload.text) {
        vnDialogueHistory.push({ speaker: payload.speaker || "Narasi", text: stripTextTags(payload.text) });
    }

    // Break dari while loop — payload sudah dikirim ke renderer
    break;

    } // end while(true)
}

// ---------- i18n: bahasa aktif (global app) ----------
// Konten dilokalkan per-FILE: tiap chapter punya `script.json` (bahasa dasar) +
// opsional `script.<lang>.json` (terjemahan, struktur identik). Engine memilih file
// sesuai bahasa aktif; fallback ke script.json bila terjemahan tak ada.
// Bahasa aktif persisten di userData agar dibaca engine sebelum hub/player dimuat.
let _activeLanguage = null;
function _languageStorePath() {
    try {
        const { app } = require('electron');
        return path.join(app.getPath('userData'), 'vn-active-language.json');
    } catch (e) { return null; }
}
function getLanguage() {
    if (_activeLanguage !== null) return _activeLanguage;
    _activeLanguage = 'default';
    try {
        const p = _languageStorePath();
        if (p && fs.existsSync(p)) {
            const d = JSON.parse(fs.readFileSync(p, 'utf-8'));
            if (d && d.lang) _activeLanguage = String(d.lang);
        }
    } catch (e) { /* ignore */ }
    return _activeLanguage;
}
function setLanguage(code) {
    _activeLanguage = String(code || 'default');
    try {
        const p = _languageStorePath();
        if (p) fs.writeFileSync(p, JSON.stringify({ lang: _activeLanguage }));
    } catch (e) { console.error('[VN Engine] Gagal menyimpan bahasa:', e); }
    return _activeLanguage;
}
function resolveLocalizedScriptPath(chapterPath, languageOverride) {
    const lang = languageOverride === undefined ? getLanguage() : String(languageOverride || 'default');
    if (lang && lang !== 'default') {
        const localized = path.join(chapterPath, 'script.' + lang + '.json');
        if (fs.existsSync(localized)) return localized;
    }
    return path.join(chapterPath, 'script.json');
}

// ---------- Hub → Story bridge (arah balik) ----------
// Baca hub-flags.json / story-vars.json milik novel aktif secara sinkron, untuk
// entry 'load_hub_flags'. Dulu jembatan story↔hub hanya satu arah (script→hub);
// ini melengkapi arah hub/flags→script agar chapter berikutnya bisa membaca
// keputusan/afeksi dari chapter sebelumnya (mis. branching lintas-chapter).
function _readHubFlagsSync(novelTitle) {
    try {
        if (!novelTitle || !_visualNovelsDirectory) return {};
        const novelPath = path.join(_visualNovelsDirectory, novelTitle);
        if (!path.resolve(novelPath).startsWith(path.resolve(_visualNovelsDirectory))) return {};
        const p = path.join(novelPath, 'hub-flags.json');
        if (!fs.existsSync(p)) return {};
        const d = JSON.parse(fs.readFileSync(p, 'utf-8'));
        return (d && typeof d.flags === 'object' && d.flags) || {};
    } catch (e) { console.error('[VN Engine] Gagal membaca hub-flags.json:', e); return {}; }
}

function _readStoryVarsSync(novelTitle) {
    try {
        if (!novelTitle || !_visualNovelsDirectory) return {};
        const novelPath = path.join(_visualNovelsDirectory, novelTitle);
        if (!path.resolve(novelPath).startsWith(path.resolve(_visualNovelsDirectory))) return {};
        const p = path.join(novelPath, 'story-vars.json');
        if (!fs.existsSync(p)) return {};
        const d = JSON.parse(fs.readFileSync(p, 'utf-8'));
        return (d && typeof d.vars === 'object' && d.vars) || {};
    } catch (e) { console.error('[VN Engine] Gagal membaca story-vars.json:', e); return {}; }
}

// ---------- Story Vars → Hub bridge ----------
// Simpan snapshot variabel sesi bermain terakhir ke <novel>/story-vars.json.
// Hub membacanya via VNHub.getStoryVars() — melengkapi hub-flags.json
// (set_hub_flag) yang eksplisit/opt-in: vars memberi SELURUH state variabel
// (afeksi, counter, route) tanpa perlu menulis flag satu-satu dari script.
function persistStoryVars(reason) {
    try {
        if (!currentStoryTitle || !_visualNovelsDirectory) return;
        const novelPath = path.join(_visualNovelsDirectory, currentStoryTitle);
        if (!path.resolve(novelPath).startsWith(path.resolve(_visualNovelsDirectory))) return; // anti path-traversal
        if (!fs.existsSync(novelPath)) return;
        fs.writeFileSync(path.join(novelPath, 'story-vars.json'), JSON.stringify({
            vars: (currentVNState && currentVNState.variables) || {},
            chapter: currentChapter,
            reason: reason || 'update',
            updatedAt: new Date().toISOString()
        }, null, 2));
    } catch (e) { console.error('[VN Engine] Gagal menyimpan story-vars:', e); }
}

// ---------- Proceed to Play Chapter ----------
function proceedToPlayChapter(storyTitle, chapter, allowInternet = true) {
    const _mainWindow = _getMainWindow();
    invalidateChoiceIntent();
    currentStoryTitle = storyTitle;
    currentChapter = chapter;
    console.log(`[VN Engine] Menyimpan info: Story='${storyTitle}', Chapter='${chapter}', Internet=${allowInternet}`);

    const chapterPath = path.join(path.dirname(__dirname), 'aset', 'game', 'visual_novels', storyTitle, chapter);
    const scriptPath = resolveLocalizedScriptPath(chapterPath);
    if (scriptPath.indexOf('script.json') < 0) console.log(`[VN Engine] Memuat skrip terlokalisasi: ${path.basename(scriptPath)}`);

    try {
        const scriptContent = fs.readFileSync(scriptPath, 'utf-8');
        currentVNScript = normalizeScript(JSON.parse(scriptContent));
        currentVNIndex = 0;
        currentVNState = {
            backgroundStack: [{ type: null, src: null }],
            bgmState: { src: null, volume: undefined },
            lastSpeaker: null,
            variables: {}
        };
        vnDialogueHistory = [];
        clearRollbackHistory('muat chapter baru');
        console.log(`[VN Engine] Skrip untuk ${chapter} berhasil dimuat.`);

        const novelPathNorm = path.join(path.dirname(__dirname), 'aset', 'game', 'visual_novels', storyTitle).replace(/\\/g, '/');
        const basePathNorm = chapterPath.replace(/\\/g, '/');
        const globalPlayerPath = path.join(path.dirname(__dirname), 'vn-player', 'player.html');
        // D2: level novel ikut dipertimbangkan — chapter → novel → engine global.
        const novelDirForPlayer = path.join(path.dirname(__dirname), 'aset', 'game', 'visual_novels', storyTitle);
        const playerSource = resolvePlayerSource(chapterPath, globalPlayerPath, novelDirForPlayer);
        setPlayerAuthorityMode(playerSource.useBridge ? 'legacy-custom' : 'engine');

        if (playerSource.useBridge) {
            // Custom Player per-story: engine global di-bypass; player.html milik user
            // membaca script sendiri & menjalankan mekanismenya, dibantu VNPlayer API.
            console.log(`[VN Engine] Memuat Custom Player: ${playerSource.filePath}`);
            _mainWindow.loadFile(playerSource.filePath);
            _mainWindow.webContents.once('did-finish-load', () => {
                try {
                    const bridgePath = path.join(path.dirname(__dirname), 'vn-player', 'js', 'vn-player-api.js');
                    const bridgeCode = fs.readFileSync(bridgePath, 'utf-8');
                    _mainWindow.webContents.executeJavaScript(bridgeCode).then(() => {
                        _mainWindow.webContents.send('vn-engine:set-player-context', {
                            storyTitle,
                            chapter,
                            basePath: basePathNorm,
                            novelPath: novelPathNorm,
                            script: JSON.parse(scriptContent)
                        });
                    }).catch(() => {});
                } catch (e) {
                    console.error('[VN Engine] Gagal inject VNPlayer bridge:', e);
                }
            });
            return;
        }

        // Player global (default) DAN engine-shim (audit E1) memakai jalur yang SAMA:
        // engine server-side menggerakkan tampilan lewat set-chapter-context +
        // update-display. Bedanya hanya FILE mana yang dimuat — shim adalah file
        // tipis milik chapter yang me-link engine bersama, jadi kreator bisa
        // menambahkan markup/CSS/JS sendiri tanpa memutus hubungan ke engine.
        const isShim = playerSource.kind === 'engine-shim';
        if (isShim) console.log(`[VN Engine] Memuat Engine Shim (scope: ${playerSource.scope}): ${playerSource.filePath}`);
        _mainWindow.loadFile(isShim ? playerSource.filePath : globalPlayerPath);
        _mainWindow.webContents.once('did-finish-load', () => {
            _mainWindow.webContents.send('vn-engine:set-chapter-context', {
                storyTitle,
                chapter,
                basePath: basePathNorm,
                novelPath: novelPathNorm,
                // E1/B: shim hidup di folder chapter, jadi `__dirname` di renderer
                // menunjuk folder chapter — bukan vn-player/. Path engine dikirim
                // eksplisit supaya resolusi themes/<x>/theme.css tetap benar.
                enginePath: path.join(path.dirname(__dirname), 'vn-player')
            });
        });

    } catch (error) {
        console.error(`[VN Engine] Gagal memuat skrip atau file chapter:`, error);
        const { dialog } = require('electron');
        dialog.showErrorBox('Error', `Gagal memuat chapter: ${error.message}`);
    }
}

// ---------- Reset State (untuk replay) ----------
function resetState() {
    invalidateChoiceIntent();
    currentVNIndex = 0;
    currentVNState = {
        backgroundStack: [{ type: null, src: null }],
        bgmState: { src: null, volume: undefined },
        lastSpeaker: null,
        variables: {}
    };
    vnDialogueHistory = [];
    clearRollbackHistory('reset state');
}

// ---------- Getter/Setter untuk state (dipakai modul lain) ----------
function getState() {
    return {
        currentVNScript,
        currentVNIndex,
        currentVNState,
        vnDialogueHistory,
        currentStoryTitle,
        currentChapter,
        playerAuthorityMode: _currentPlayerAuthorityMode
    };
}

function setPlayerAuthorityMode(mode) {
    _currentPlayerAuthorityMode = mode === 'legacy-custom' ? 'legacy-custom' : 'engine';
    invalidateChoiceIntent();
}

function setState(newState) {
    // Manipulasi script/index dari luar (load save, jump choice, preview
    // backup/restore) membuat snapshot rollback lama tidak valid.
    if (newState.currentVNScript !== undefined || newState.currentVNIndex !== undefined) {
        clearRollbackHistory('setState eksternal');
    }
    if (newState.currentVNScript !== undefined || newState.currentVNIndex !== undefined || newState.currentVNState !== undefined) {
        invalidateChoiceIntent();
    }
    if (newState.currentVNScript !== undefined) currentVNScript = newState.currentVNScript;
    if (newState.currentVNIndex !== undefined) currentVNIndex = newState.currentVNIndex;
    if (newState.currentVNState !== undefined) currentVNState = newState.currentVNState;
    if (newState.vnDialogueHistory !== undefined) vnDialogueHistory = newState.vnDialogueHistory;
    if (newState.currentStoryTitle !== undefined) currentStoryTitle = newState.currentStoryTitle;
    if (newState.currentChapter !== undefined) currentChapter = newState.currentChapter;
}

function incrementIndex() {
    invalidateChoiceIntent();
    currentVNIndex++;
}

function setTargetWindow(win) {
    _targetWindowOverride = win;
}

function getTargetWindow() {
    return _targetWindowOverride;
}

module.exports = {
    init,
    getChapterListData,
    getNextChapterSync,
    resolveNavigationTarget,
    handleJump,
    commitChoiceTarget,
    prepareChoiceIntentPayload,
    resolveChoiceIntent,
    invalidateChoiceIntent,
    processAndSendVNUpdate,
    proceedToPlayChapter,
    resetState,
    getState,
    setState,
    incrementIndex,
    applySetVar,
    evaluateCondition,
    interpolateVars,
    persistStoryVars,
    setTargetWindow,
    getTargetWindow,
    getLanguage,
    setLanguage,
    setPlayerAuthorityMode,
    setProgressReporter,
    urutanChapterUtama,
    resolveLocalizedScriptPath,
    requestPrevLine,
    clearRollbackHistory
};
