// =============================================
// Rin.js — Pembangun payload PREVIEW (murni, tanpa Electron)
// =============================================
// Logika di file ini SEBELUMNYA tertanam di dalam `processPreviewLabelUpdate`
// (preview-manager.js) — satu-satunya pemakainya jendela popup "Preview Label".
// Diekstrak karena preview player TERSEMAT di editor kini juga perlu merender
// entri script NYATA (§9.2). Menyalin logikanya ke editor akan melahirkan
// implementasi KETIGA dari aturan main yang sama (engine asli, popup preview,
// lalu editor) — spesies yang sama dengan mode "Mockup" yang sudah dibuang
// karena menduplikasi runtime dengan tangan lalu menyimpang diam-diam.
//
// Fungsi ini MURNI: tak menyentuh state engine, tak mengirim IPC. Pemanggilnya
// yang memutuskan mau diapakan hasilnya. Itu pula yang membuatnya bisa diuji.
//
// CATATAN LINGKUP: ini bukan engine cerita. Ia tidak mengevaluasi kondisi, tidak
// menjalankan setVar, tidak menangani call/return. Preview memang hanya
// memutar entri secara lurus — sama seperti perilaku popup sebelum ekstraksi.

'use strict';

// Aturan "apa yang diwarisi sebuah entri" TIDAK lagi ditulis ulang di sini.
// Dulu file ini memelihara salinannya sendiri, dan salinan itu MEMBEKU: hanya
// mengenal background/bgm/speaker, sementara engine terus tumbuh (ambient,
// sticky sprite, audioChannels). Entri `phase` bahkan tak diserap sama sekali.
// Akibatnya preview menampilkan dunia yang beda dari yang dilihat pemain.
// Lihat header story-carry.js.
const storyCarry = require('./story-carry');

// Target jump yang artinya "keluar dari potongan yang sedang dipreview".
const TARGET_KELUAR = ['##FINISH_PARENT##', '##SKIP_ALL_LABEL##'];

/**
 * Cari entri yang BISA DIRENDER mulai dari `startIndex`, sambil memproses entri
 * struktural (label/jump/phase) yang hanya mengubah keadaan.
 *
 * @param {Array}  script      isi script.json (sudah array)
 * @param {number} startIndex  indeks mulai
 * @param {object} carryIn     keadaan bawaan (lihat carryAwal)
 * @param {object} [opts]
 *   opts.berhentiDiPhase (default TRUE) — arti `phase` berbeda per pemakai:
 *     • popup "Preview Label" memutar SATU POTONGAN, jadi phase = batas akhir.
 *     • preview chapter tersemat memutar SELURUH chapter, dan phase di sana cuma
 *       penanda bagian. Script starter bawaan bahkan DIMULAI dengan phase —
 *       kalau ia dianggap batas, preview tersemat selalu tampak kosong.
 *   Dibuat eksplisit, bukan ditebak dari isi script, supaya kedua pemakai
 *   menyatakan maksudnya sendiri.
 * @returns {object}
 *   selesai → { done:true, reason:'habis'|'phase'|'jump'|'jump-external'|'loop-guard',
 *               index, carry, detail }
 *   ada     → { done:false, index, payload, carry, historyEntry }
 */
function buildPreviewPayload(script, startIndex, carryIn, opts) {
    const daftar = Array.isArray(script) ? script : [];
    const carry = storyCarry.stateAwal(carryIn);
    const berhentiDiPhase = !(opts && opts.berhentiDiPhase === false);
    let index = Math.max(0, startIndex | 0);

    // Penjaga putaran: `jump` bisa menunjuk label sebelumnya dan membuat siklus.
    // Engine asli punya batas langkahnya sendiri; preview cukup berhenti dengan
    // sopan daripada menggantung proses main.
    let langkah = 0;
    const batas = daftar.length * 2 + 50;

    while (index < daftar.length) {
        if (++langkah > batas) {
            return { done: true, reason: 'loop-guard', index, carry };
        }
        const line = daftar[index] || {};

        // --- Label: header yang bisa membawa background, bgm, ambient, channel,
        //     dan kontrol sprite lengket — persis seperti di runtime. ---
        if (line.type === 'label') {
            storyCarry.serapStruktural(carry, line);
            index++;
            continue;
        }

        // --- Jump: pindah dalam potongan, atau berarti potongan ini selesai ---
        if (line.type === 'jump') {
            const target = String(line.target || '');
            if (TARGET_KELUAR.indexOf(target) >= 0 || /^(fase|phase):/.test(target)) {
                return { done: true, reason: 'jump', index, carry, detail: { jumpTarget: target } };
            }
            const tujuan = daftar.findIndex((d) => d && d.type === 'label' && d.name === target);
            if (tujuan !== -1) { index = tujuan; continue; }
            return { done: true, reason: 'jump-external', index, carry, detail: { jumpTarget: target } };
        }

        // --- Phase: batas akhir potongan, ATAU sekadar penanda bagian ---
        if (line.type === 'phase') {
            if (berhentiDiPhase) {
                return { done: true, reason: 'phase', index, carry, detail: { phaseName: line.name } };
            }
            // Saat phase BUKAN batas, ia tetap mengubah keadaan — background, bgm,
            // ambient, channel, `spriteSticky`. Dulu baris ini cuma `index++`, jadi
            // preview chapter kehilangan semuanya; script bawaan yang DIMULAI dengan
            // `phase` ber-background bahkan tampil tanpa latar sama sekali.
            storyCarry.serapStruktural(carry, line);
            index++;
            continue;
        }

        // --- Entri yang benar-benar digambar ---
        // Urutan ini SAMA dengan runtime (core.js), memakai fungsi yang sama:
        // serap → injeksi → sprite lengket → simpan latar untuk entri berikutnya.
        const payload = Object.assign({}, line);
        storyCarry.serapEntri(carry, line, payload);
        storyCarry.injeksiEntri(payload, carry);
        storyCarry.serapSpriteLengket(carry, line, payload);
        storyCarry.persistLatar(carry, line);

        const historyEntry = ((line.type === 'dialogue' || line.type === 'choice') && payload.text)
            ? { speaker: payload.speaker || 'Narasi', text: payload.text }
            : null;

        return { done: false, index, payload, carry, historyEntry };
    }

    return { done: true, reason: 'habis', index, carry };
}

/**
 * Indeks entri PERTAMA yang bisa dirender — dipakai preview tersemat untuk
 * menentukan "tampilkan apa" tanpa memaksa pemakainya menebak-nebak.
 * @returns {number} -1 bila script tak punya entri yang bisa digambar.
 */
function indeksRenderPertama(script, opts) {
    const r = buildPreviewPayload(script, 0, null, opts);
    return r.done ? -1 : r.index;
}

/**
 * Kumpulkan langkah preview SEBERURUTAN dari awal chapter, membawa keadaan
 * (background/bgm/speaker) di antaranya. Dipakai preview tersemat: pemakainya
 * cukup minta "langkah ke-n", dan pewarisan tetap benar karena diputar dari awal
 * — script sepanjang preview tidak mahal untuk diputar ulang.
 * @returns {Array<{index:number, payload:object}>}
 */
function kumpulkanLangkah(script, maks, opts) {
    const daftar = Array.isArray(script) ? script : [];
    const batasLangkah = Math.max(0, maks | 0) || 500;
    const langkah = [];
    let carry = null;
    let idx = 0;
    let aman = 0;
    while (idx < daftar.length && langkah.length < batasLangkah) {
        if (++aman > daftar.length * 2 + 50) break;
        const r = buildPreviewPayload(daftar, idx, carry, opts);
        if (r.done) break;
        langkah.push({ index: r.index, payload: r.payload });
        carry = r.carry;
        idx = r.index + 1;
    }
    return langkah;
}

/** Jumlah entri yang bisa dirender (untuk penunjuk "n dari total"). */
function hitungEntriRender(script) {
    const daftar = Array.isArray(script) ? script : [];
    let n = 0;
    for (let i = 0; i < daftar.length; i++) {
        const t = daftar[i] && daftar[i].type;
        if (t && t !== 'label' && t !== 'jump' && t !== 'phase') n++;
    }
    return n;
}

module.exports = { buildPreviewPayload, indeksRenderPertama, hitungEntriRender, kumpulkanLangkah };
