// =============================================
// Rin.js — ATURAN KEADAAN-DIBAWA (carry) cerita — MURNI, tanpa Electron
// =============================================
// Satu pertanyaan, satu jawaban: **apa yang diwarisi sebuah entri dari
// entri-entri sebelumnya?** (bgm, ambient, channel bernama, background,
// pembicara, sprite lengket.)
//
// KENAPA FILE INI ADA. Jawaban itu dulu hidup di DUA tempat dengan isi berbeda:
//   • `core.js`            — runtime sungguhan, otoritatif;
//   • `preview-payload.js` — preview editor, salinan yang MEMBEKU saat ditulis.
// Salinan kedua hanya mengenal background/bgm/speaker, dan tak pernah menyusul
// saat engine tumbuh: `ambient` (2026-07-10), sticky sprite (2026-07-10), dan
// `audioChannels` (G1, 2026-07-30) tak pernah sampai ke preview. Entri `phase`
// bahkan tak diserap sama sekali di preview chapter — padahal script bawaan
// DIMULAI dengan `phase` yang membawa background & bgm. Akibatnya preview
// menampilkan dunia yang berbeda dari yang akan dilihat pemain — tepat kebalikan
// dari satu-satunya gunanya.
//
// Anatominya sama dengan yang berulang di proyek ini: SATU aturan, DUA penulis,
// yang kedua membeku (bandingkan "menebak nama berkas" 4 salinan → 1, dan kontrol
// `phase`/`label` yang dibuang senyap). Karena itu ia diangkat ke sini, bukan
// ditambal per-field: menambal berarti menunggu kejadian keempat.
//
// KONTRAK: fungsi di sini MURNI terhadap modul (tak menyentuh state global, tak
// mengirim IPC) dan menerima `state` sebagai parameter. `core.js` memanggilnya
// dengan `currentVNState`; `preview-payload.js` dengan `carry` miliknya. Keduanya
// karena itu tak bisa lagi menyimpang.

'use strict';

/** Slot sprite, TERPANJANG DULU — lihat alasan di serapSpriteLengket. */
const SLOT_PREFIX = ['spriteCenter', 'sprite2', 'sprite'];

/** Kunci ber-awalan "sprite" yang BUKAN slot: kontrol mode/lengket + fokus bicara. */
const NON_SLOT = new Set(['spriteMode', 'spriteSticky', 'spriteClear',
    'spriteFocus', 'spriteDim', 'spriteFocusScale']);

function spriteKeyOf(k) {
    if (NON_SLOT.has(k)) return undefined;
    return SLOT_PREFIX.find((p) => k === p || (k.startsWith(p) && /^[A-Z]/.test(k.slice(p.length))));
}

/** Normalkan objek keadaan supaya pemanggil tak perlu menyiapkan tiap field. */
function stateAwal(seed) {
    const s = seed || {};
    return {
        backgroundStack: Array.isArray(s.backgroundStack) && s.backgroundStack.length
            ? s.backgroundStack.map((o) => Object.assign({}, o))
            : [{}],
        lastBgmState: s.lastBgmState ? Object.assign({}, s.lastBgmState) : null,
        lastAmbientState: s.lastAmbientState ? Object.assign({}, s.lastAmbientState) : null,
        lastChannelState: s.lastChannelState ? Object.assign({}, s.lastChannelState) : {},
        lastSpeaker: s.lastSpeaker || '',
        spriteSticky: !!s.spriteSticky,
        lastSpriteState: s.lastSpriteState ? Object.assign({}, s.lastSpriteState) : null,
        isInEndingPhase: !!s.isInEndingPhase,
    };
}

// =============================================
// PENYERAPAN — entri MENGUBAH keadaan
// =============================================

/**
 * Channel bernama (G1). `stop: true` / `src: 'none'` menghapus; sisanya menimpa.
 */
function serapChannel(state, line) {
    if (!state.lastChannelState) state.lastChannelState = {};
    const daftar = Array.isArray(line && line.audioChannels) ? line.audioChannels : [];
    daftar.forEach((it) => {
        if (!it || !it.channel) return;
        if (it.stop === true || it.src === 'none') delete state.lastChannelState[it.channel];
        else state.lastChannelState[it.channel] = Object.assign({}, it);
    });
}

/**
 * Kontrol sprite lengket (`spriteSticky` / `spriteClear`).
 * Panduan kreator memakai `phase` sebagai contoh utamanya, jadi ini WAJIB ikut
 * terserap di jalur struktural — bukan hanya di entri visual.
 */
function serapKontrolSprite(state, line) {
    if (!line) return;
    if (line.spriteSticky !== undefined) state.spriteSticky = !!line.spriteSticky;
    if (line.spriteClear === true) state.lastSpriteState = null;
}

/**
 * Entri STRUKTURAL (`phase` / `label`) — mengubah keadaan tanpa digambar sendiri.
 * `phase` MENGGANTI tumpukan background; `label` MENUMPUK di atasnya.
 */
function serapStruktural(state, line) {
    if (!line) return;
    const isPhase = line.type === 'phase';
    if (isPhase) state.isInEndingPhase = !!line.isEnding;

    if (line.background || line.video) {
        let baru = {};
        if (line.background) baru = { type: 'image', src: line.background, mode: line.backgroundMode || 'cover' };
        else if (line.video) baru = { type: 'video', src: line.video };

        if (isPhase) {
            state.backgroundStack = [baru];
        } else {
            const puncak = state.backgroundStack[state.backgroundStack.length - 1];
            state.backgroundStack.push(Object.assign({}, puncak, baru));
            // Cap agar tak tumbuh tanpa batas.
            if (state.backgroundStack.length > 50) state.backgroundStack = state.backgroundStack.slice(-50);
        }
    }

    if (line.bgmStop === true || line.bgm === 'none') {
        state.lastBgmState = null;
    } else if (line.bgm) {
        state.lastBgmState = {
            src: line.bgm, volume: line.bgmVolume, pan: line.bgmPan,
            delay: line.bgmDelay, loop: line.bgmLoop, fade: line.bgmFade,
            loopStart: line.bgmLoopStart, loopEnd: line.bgmLoopEnd
        };
    }
    if (line.ambientStop === true || line.ambient === 'none') {
        state.lastAmbientState = null;
    } else if (line.ambient) {
        state.lastAmbientState = { src: line.ambient, volume: line.ambientVolume };
    }
    serapChannel(state, line);
    serapKontrolSprite(state, line);
}

/**
 * Entri VISUAL — bagian yang mengubah keadaan audio & pembicara.
 * Digabung dalam SATU fungsi dengan sengaja: pemanggil tak bisa lagi ingat bgm
 * tapi lupa ambient — persis cara preview tertinggal selama ini.
 */
function serapEntri(state, line, payload) {
    if (!line) return;

    // --- BGM ---
    // Disimpan SEBELUM entri ini menimpanya: `bgmOneShot` perlu tahu BGM apa yang
    // harus di-resume setelah sting selesai.
    const bgmSebelum = state.lastBgmState;
    if (line.bgmStop === true || line.bgm === 'none') {
        state.lastBgmState = null;
        if (payload) { delete payload.bgm; delete payload.bgmStop; }
    } else if (line.bgm && line.bgmOneShot) {
        // Sting SENGAJA tak mengubah lastBgmState "permanen".
        if (payload) {
            payload.bgmOneShot = true;
            if (bgmSebelum) {
                payload.bgmResumeSrc = bgmSebelum.src;
                payload.bgmResumeVolume = bgmSebelum.volume;
                payload.bgmResumePan = bgmSebelum.pan;
            } else {
                payload.bgmResumeSrc = null;
            }
        }
    } else if (line.bgm) {
        state.lastBgmState = {
            src: line.bgm, volume: line.bgmVolume, pan: line.bgmPan,
            delay: line.bgmDelay, loop: line.bgmLoop, fade: line.bgmFade,
            loopStart: line.bgmLoopStart, loopEnd: line.bgmLoopEnd
        };
    }

    // --- Ambient ---
    if (line.ambientStop === true || line.ambient === 'none') {
        state.lastAmbientState = null;
        if (payload) { delete payload.ambient; delete payload.ambientStop; }
    } else if (line.ambient) {
        state.lastAmbientState = { src: line.ambient, volume: line.ambientVolume };
    }

    // --- Channel bernama ---
    serapChannel(state, line);

    // --- Pembicara: entri tanpa speaker MELANJUTKAN yang sebelumnya ---
    if (line.speaker) state.lastSpeaker = line.speaker;
    else if (payload) payload.speaker = state.lastSpeaker;
}

/** Simpan background entri ini untuk entri berikutnya. */
function persistLatar(state, line) {
    if (!line) return;
    const boleh = line.type === 'dialogue' || (line.type === 'scene' && line.persistBackground !== false);
    if (!boleh) return;
    let baru = null;
    if (line.background) baru = { type: 'image', src: line.background, mode: line.backgroundMode || 'cover' };
    else if (line.video) baru = { type: 'video', src: line.video };
    if (baru) state.backgroundStack[state.backgroundStack.length - 1] = baru;
}

/**
 * Sprite LENGKET (opsional). Model per-entri tetap default; `spriteSticky: true`
 * membuat entri dialogue/choice TANPA field sprite mewarisi deklarasi terakhir.
 *
 * URUTAN `SLOT_PREFIX` PENTING: `find` mengembalikan kecocokan pertama dan
 * 'sprite' juga cocok dengan 'spriteCenterAnim' — dengan urutan terpendek-dulu,
 * entri yang menyebut sprite TENGAH dianggap mendeklarasi ulang slot KANAN lalu
 * membuang warisannya (galat pra-ada, diperbaiki 2026-07-30).
 */
function serapSpriteLengket(state, line, payload) {
    serapKontrolSprite(state, line);
    if (!state.spriteSticky) return;
    if (!(line.type === 'dialogue' || line.type === 'choice')) return;

    const declaresSprite = Object.keys(line).some(
        (k) => spriteKeyOf(k) || k === 'charSprites' || k === 'spriteMode');

    if (line.spriteClear === true) {
        // Sudah dibersihkan serapKontrolSprite. Cabang ini menjaga deklarasi di
        // entri yang SAMA tidak langsung mengisi ulang warisan yang baru dibuang.
        return;
    }

    if (declaresSprite) {
        const prev = state.lastSpriteState || {};
        const next = {};
        for (const k of Object.keys(prev)) next[k] = prev[k];

        const declaredSlots = new Set();
        for (const k of Object.keys(line)) {
            const slot = spriteKeyOf(k);
            if (slot) declaredSlots.add(slot);
        }
        for (const slot of declaredSlots) {
            for (const k of Object.keys(next)) { if (spriteKeyOf(k) === slot) delete next[k]; }
            if (line[slot] === 'none') continue;          // hapus slot dari warisan
            for (const k of Object.keys(line)) {
                if (spriteKeyOf(k) === slot && line[k] !== undefined) next[k] = line[k];
            }
        }
        if (line.charSprites !== undefined) next.charSprites = line.charSprites;
        if (line.spriteMode !== undefined) next.spriteMode = line.spriteMode;
        state.lastSpriteState = Object.keys(next).length ? next : null;

        if (payload) {
            for (const slot of SLOT_PREFIX) { if (payload[slot] === 'none') delete payload[slot]; }
            if (state.lastSpriteState) {
                for (const k of Object.keys(state.lastSpriteState)) {
                    if (payload[k] === undefined) payload[k] = state.lastSpriteState[k];
                }
            }
        }
    } else if (state.lastSpriteState && payload) {
        for (const k of Object.keys(state.lastSpriteState)) {
            if (payload[k] === undefined) payload[k] = state.lastSpriteState[k];
        }
    }
}

// =============================================
// INJEKSI — keadaan MENGISI payload
// =============================================

/**
 * Isi payload dengan warisan bgm/ambient/channel/background.
 * Satu fungsi, empat sumbu — supaya pemanggil tak bisa mengambil sebagian.
 */
function injeksiEntri(payload, state) {
    if (!payload) return payload;

    if (!payload.bgm && state.lastBgmState) {
        payload.bgm = state.lastBgmState.src;
        if (payload.bgmVolume === undefined) payload.bgmVolume = state.lastBgmState.volume;
        if (payload.bgmPan === undefined) payload.bgmPan = state.lastBgmState.pan;
        if (payload.bgmDelay === undefined) payload.bgmDelay = state.lastBgmState.delay;
        if (payload.bgmLoop === undefined) payload.bgmLoop = state.lastBgmState.loop;
        if (payload.bgmFade === undefined) payload.bgmFade = state.lastBgmState.fade;
        if (payload.bgmLoopStart === undefined) payload.bgmLoopStart = state.lastBgmState.loopStart;
        if (payload.bgmLoopEnd === undefined) payload.bgmLoopEnd = state.lastBgmState.loopEnd;
    }

    if (!payload.ambient && state.lastAmbientState) {
        payload.ambient = state.lastAmbientState.src;
        if (payload.ambientVolume === undefined) payload.ambientVolume = state.lastAmbientState.volume;
    }

    const aktif = Object.keys(state.lastChannelState || {}).map((k) => state.lastChannelState[k]);
    if (aktif.length) payload.audioChannels = aktif;
    else delete payload.audioChannels;

    const latar = state.backgroundStack[state.backgroundStack.length - 1];
    if (latar) {
        if (latar.type === 'image' && !payload.background) {
            payload.background = latar.src;
            payload.backgroundMode = latar.mode;
        } else if (latar.type === 'video' && !payload.video) {
            payload.video = latar.src;
        }
    }
    return payload;
}

module.exports = {
    stateAwal,
    serapStruktural,
    serapEntri,
    serapChannel,
    serapKontrolSprite,
    serapSpriteLengket,
    persistLatar,
    injeksiEntri,
    SLOT_PREFIX,
    NON_SLOT,
    spriteKeyOf,
};
