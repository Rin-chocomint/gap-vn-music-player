// =============================================
// updater.js — Sistem update Tier-1 (per-file dari GitHub)
// ---------------------------------------------
// Strategi: repo GitHub = source of truth. Aplikasi TIDAK di-ASAR, jadi file
// di resources/app/ memetakan 1:1 ke path di repo. Updater menarik file yang
// berubah/ditambah dari raw.githubusercontent pada tag rilis terbaru, verifikasi
// SHA-256 dari manifest (versions.json -> "files"), lalu menimpa secara atomik.
//
// Yang TIDAK ditangani di sini (butuh Tier-2 / download ZIP rilis penuh):
//   - node_modules / dependency / versi Electron / file .exe
//   - aset biner besar (font/gambar) — sengaja di-exclude dari manifest "files"
// Jika rilis menandai app.requiresFullUpdate = true, window hanya menyarankan
// user mengunduh versi penuh, bukan patch per-file.
// =============================================

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const os = require('os');

// ---- State modul ----
let deps = null;            // { app, ipcMain, BrowserWindow, dialog, shell, appDir, getMainWindow, localManifest }
let updaterWindow = null;   // window penawaran update (single instance)
let pendingUpdateInfo = null; // hasil check terakhir, dipakai saat user klik "Update"
let shownThisSession = false; // cegah auto-popup berulang dalam 1 sesi

// =============================================
// Util jaringan: GET dengan User-Agent + follow redirect
// =============================================
function httpsGet(url, { json = false, maxRedirects = 5 } = {}) {
    return new Promise((resolve, reject) => {
        const doRequest = (currentUrl, redirectsLeft) => {
            const req = https.get(currentUrl, {
                headers: {
                    'User-Agent': 'gap-vn-music-player-updater',
                    'Accept': json ? 'application/vnd.github+json' : '*/*'
                },
                timeout: 15000
            }, (res) => {
                // Redirect
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    res.resume();
                    if (redirectsLeft <= 0) return reject(new Error('Terlalu banyak redirect'));
                    const next = new URL(res.headers.location, currentUrl).toString();
                    return doRequest(next, redirectsLeft - 1);
                }
                if (res.statusCode !== 200) {
                    res.resume();
                    return reject(new Error(`HTTP ${res.statusCode} untuk ${currentUrl}`));
                }
                const chunks = [];
                res.on('data', (c) => chunks.push(c));
                res.on('end', () => {
                    const buf = Buffer.concat(chunks);
                    if (json) {
                        try { resolve(JSON.parse(buf.toString('utf-8'))); }
                        catch (e) { reject(new Error('JSON tidak valid: ' + e.message)); }
                    } else {
                        resolve(buf);
                    }
                });
            });
            req.on('timeout', () => { req.destroy(new Error('Request timeout')); });
            req.on('error', reject);
        };
        doRequest(url, maxRedirects);
    });
}

// =============================================
// Pecah "0.0.0.9-alpha.2" jadi inti angka + penanda pra-rilis.
// Versi lama cuma memanggil parseInt per segmen, jadi "9-alpha2" terbaca 9 dan
// sufiksnya hilang tanpa bekas — dua pra-rilis berbeda tampak SAMA, dan tidak
// pernah ada update yang ditawarkan.
// =============================================
function splitVersion(v) {
    const s = String(v == null ? '0' : v).trim();
    const dash = s.indexOf('-');
    const core = dash === -1 ? s : s.slice(0, dash);
    const pre = dash === -1 ? '' : s.slice(dash + 1);
    return {
        core: core.split('.').map(n => parseInt(n, 10) || 0),
        pre: pre ? pre.split('.') : []
    };
}

// Bandingkan penanda pra-rilis dengan aturan semver: yang TIDAK punya penanda
// adalah rilis final dan selalu menang. Tanpa ini 0.0.0.9 kalah dari
// 0.0.0.9-alpha.1 — stabil dianggap lebih tua dari alpha-nya sendiri.
function comparePre(a, b) {
    if (!a.length && !b.length) return 0;
    if (!a.length) return 1;
    if (!b.length) return -1;

    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i++) {
        const ra = a[i];
        const rb = b[i];
        if (ra === undefined) return -1;   // "alpha" lebih tua dari "alpha.1"
        if (rb === undefined) return 1;
        if (ra === rb) continue;

        // Segmen angka dibandingkan sebagai angka, supaya alpha.10 > alpha.2.
        const na = /^\d+$/.test(ra);
        const nb = /^\d+$/.test(rb);
        if (na && nb) return parseInt(ra, 10) - parseInt(rb, 10);
        if (na) return -1;                 // angka selalu di bawah teks
        if (nb) return 1;
        return ra < rb ? -1 : 1;
    }
    return 0;
}

// =============================================
// Bandingkan versi "0.0.0.8" atau "0.0.0.9-alpha.2".
// Inti angka dulu; kalau sama, penanda pra-rilis yang menentukan.
// return >0 jika a lebih baru, <0 jika a lebih lama, 0 jika sama.
// =============================================
function compareVersion(a, b) {
    const va = splitVersion(a);
    const vb = splitVersion(b);
    const len = Math.max(va.core.length, vb.core.length);
    for (let i = 0; i < len; i++) {
        const da = va.core[i] || 0;
        const db = vb.core[i] || 0;
        if (da !== db) return da - db;
    }
    return comparePre(va.pre, vb.pre);
}

// Nomor build: bilangan bulat yang HANYA NAIK, diambil dari `git rev-list --count HEAD`
// saat rilis. Nilai tak masuk akal (kosong, negatif, bukan angka) dianggap 0 supaya
// manifest lama yang belum punya field ini tetap terbaca.
function normalisasiBuild(v) {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

// =============================================
// Bandingkan satu RILIS = versi + nomor build.
// Versi menentukan lebih dulu; kalau versinya sama, nomor build yang memutuskan.
// Inilah yang membuat versi boleh DIAM sementara perbaikan tetap mengalir:
// nomor versinya tetap, nomor build-nya yang naik (0.0.42-19843 lalu
// 0.0.42-19873), jadi perbaikan kecil bisa dirilis tanpa menaikkan versi.
//
// Nomor build TIDAK boleh mengukur apa pun tentang isi rilis (mis. berapa berkas
// berubah): rilis yang lebih baru tapi menyentuh lebih sedikit berkas akan terbaca
// mundur dan tak pernah ditawarkan. Ia wajib penghitung berjalan.
//
// return >0 jika a lebih baru, <0 jika a lebih lama, 0 jika sama.
// =============================================
function compareRelease(a, b) {
    const cmp = compareVersion(a && a.version, b && b.version);
    if (cmp !== 0) return cmp;
    const ba = normalisasiBuild(a && a.build);
    const bb = normalisasiBuild(b && b.build);
    return ba === bb ? 0 : (ba < bb ? -1 : 1);
}

// =============================================
// Diff manifest file lokal vs remote
// =============================================
function diffFiles(localFiles = {}, remoteFiles = {}) {
    const added = [];
    const modified = [];
    const removed = [];

    for (const [p, hash] of Object.entries(remoteFiles)) {
        if (!(p in localFiles)) added.push(p);
        else if (localFiles[p] !== hash) modified.push(p);
    }
    for (const p of Object.keys(localFiles)) {
        if (!(p in remoteFiles)) removed.push(p);
    }
    return { added, modified, removed };
}

// Tag rilis boleh ditulis "v0.0.0.10" atau "0.0.0.10"; keduanya versi yang sama.
function tagToVersion(tag) {
    return String(tag || '').replace(/^v/i, '');
}

// =============================================
// Pilih rilis yang relevan untuk channel ini.
//   channel "release"    -> hanya rilis stabil
//   channel selain itu   -> stabil DAN pra-rilis, ambil yang paling baru
//
// Ini alasan endpoint-nya bukan /releases/latest: GitHub sengaja MELEWATKAN
// draft dan pre-release di sana. Repo yang cuma berisi pra-rilis membuat
// endpoint itu menjawab 404, sementara repo yang punya rilis stabil lama
// menjawab dengan rilis LAMA itu — pemakai alpha lalu tak pernah ditawari apa
// pun, tanpa satu pun pesan error. Daftar /releases + saring sendiri.
// =============================================
function pickRelease(list, channel) {
    if (!Array.isArray(list)) return null;
    const terimaPra = String(channel || 'release').toLowerCase() !== 'release';
    const kandidat = list.filter(r =>
        r && !r.draft && r.tag_name && (terimaPra || !r.prerelease));
    if (!kandidat.length) return null;

    // GitHub mengurutkan daftar menurut waktu pembuatan, bukan versi. Rilis
    // perbaikan untuk versi lama yang ditandai belakangan akan menyalip kalau
    // kita percaya urutan itu, jadi urutkan ulang menurut versi di tag.
    kandidat.sort((x, y) => compareVersion(tagToVersion(y.tag_name), tagToVersion(x.tag_name)));
    return kandidat[0];
}

// =============================================
// Ambil manifest remote + metadata rilis (changelog)
// Coba daftar Releases dulu (dapat tag + body changelog); kalau gagal,
// fallback ke branch default (fallbackRef).
// =============================================
async function fetchRemoteManifestAndMeta(cfg) {
    let ref = cfg.fallbackRef || 'main';
    let changelog = '';
    let releaseUrl = '';
    let releaseName = '';
    let usedRelease = false;
    let prerelease = false;
    let daftarRilis = [];

    try {
        const list = await httpsGet(
            `${cfg.apiBase}/repos/${cfg.owner}/${cfg.repo}/releases?per_page=30`,
            { json: true }
        );
        if (Array.isArray(list)) daftarRilis = list;
        const rel = pickRelease(list, cfg.channel);
        if (rel) {
            ref = rel.tag_name;
            changelog = rel.body || '';
            releaseUrl = rel.html_url || '';
            releaseName = rel.name || rel.tag_name;
            prerelease = !!rel.prerelease;
            usedRelease = true;
        } else {
            console.warn(`[Updater] Tak ada rilis yang cocok untuk channel '${cfg.channel || 'release'}', fallback ke branch:`, ref);
        }
    } catch (e) {
        console.warn('[Updater] Daftar rilis gagal diambil, fallback ke branch:', ref, '-', e.message);
    }

    const manifestUrl = `${cfg.rawBase}/${cfg.owner}/${cfg.repo}/${ref}/${cfg.manifestPath || 'versions.json'}`;
    const manifest = await httpsGet(manifestUrl, { json: true });

    return { manifest, ref, changelog, releaseUrl, releaseName, usedRelease, prerelease, daftarRilis };
}

// =============================================
// RINGKASAN PERUBAHAN LINTAS RILIS
//
// Body sebuah GitHub Release hanya menceritakan rilis ITU. Pemasang yang
// tertinggal beberapa versi tidak pernah melihat apa saja yang sudah lewat.
// Mengumpulkan body rilis-rilis di antaranya juga tidak menutup lubangnya:
// sebagian tag di repo ini tidak punya Release sama sekali, jadi potongan
// riwayatnya hilang begitu saja.
//
// Yang selalu lengkap adalah daftar commit. Endpoint compare GitHub memberi
// seluruh commit antara dua tag dalam satu permintaan, tanpa autentikasi.
// Dikelompokkan per scope (bagian sebelum ':' pada pesan commit), hasilnya
// terbaca seperti catatan rilis yang ditulis tangan.
// =============================================

// Batas commit yang dirender. Endpoint compare sendiri berhenti di 250.
const MAKS_COMMIT_DITAMPILKAN = 120;

// Cari tag yang mewakili versi yang SEDANG TERPASANG, sebagai titik awal
// perbandingan. Tag di repo ini berbentuk "v<versi>", tapi tidak semua versi
// punya Release. Karena itu ada jalur cadangan yang menyisir daftar rilis untuk
// rilis terbaru yang versinya masih di bawah versi terpasang.
function cariTagAwal(daftarRilis, currentVersion) {
    if (!currentVersion || !Array.isArray(daftarRilis)) return null;

    const langsung = 'v' + currentVersion;
    for (const r of daftarRilis) {
        if (r && !r.draft && r.tag_name === langsung) return r.tag_name;
    }

    let terbaik = null;
    for (const r of daftarRilis) {
        if (!r || r.draft || !r.tag_name) continue;
        const v = tagToVersion(r.tag_name);
        if (compareVersion(v, currentVersion) > 0) continue;   // lebih baru, bukan titik awal
        if (!terbaik || compareVersion(v, tagToVersion(terbaik)) > 0) terbaik = r.tag_name;
    }
    return terbaik;
}

async function fetchPerubahanAntarTag(cfg, tagAwal, tagAkhir) {
    const url = `${cfg.apiBase}/repos/${cfg.owner}/${cfg.repo}/compare/` +
        `${encodeURIComponent(tagAwal)}...${encodeURIComponent(tagAkhir)}`;
    const data = await httpsGet(url, { json: true });
    if (!data || !Array.isArray(data.commits)) return null;
    return {
        pesan: data.commits
            .map((c) => String((c.commit && c.commit.message) || '').split('\n')[0].trim())
            .filter(Boolean),
        total: Number(data.total_commits) || data.commits.length,
        url: data.html_url || ''
    };
}

// Susun jadi markdown dengan subset yang bisa dirender jendela pembaruan:
// heading '###', butir '-', '**tebal**', dan tautan.
function bangunRingkasanCommit(hasil, tagAwal) {
    if (!hasil || !hasil.pesan.length) return '';

    // Commit rilis cuma penanda versi, bukan perubahan yang dirasakan pengguna.
    const dipakai = hasil.pesan.filter((p) => !/^Rilis\s/i.test(p));
    if (!dipakai.length) return '';

    const dipotong = dipakai.slice(0, MAKS_COMMIT_DITAMPILKAN);

    // Yang benar-benar disembunyikan ada dua sumber: dipotong oleh batas kita
    // sendiri, dan tidak dikembalikan endpoint compare (berhenti di 250).
    // Commit rilis yang disaring di atas TIDAK dihitung, karena memang bukan
    // perubahan yang disembunyikan dari pengguna.
    const sisa = (dipakai.length - dipotong.length) +
        Math.max(0, hasil.total - hasil.pesan.length);

    // Scope = bagian sebelum ':' pertama, mengikuti format pesan commit repo ini.
    const grup = new Map();
    const UMUM = 'Lainnya';
    for (const p of dipotong) {
        const m = p.match(/^([A-Za-z0-9][A-Za-z0-9._/-]*)\s*:\s*(.+)$/);
        const kunci = m ? m[1] : UMUM;
        const isi = m ? m[2] : p;
        if (!grup.has(kunci)) grup.set(kunci, []);
        grup.get(kunci).push(isi);
    }

    // 'Lainnya' selalu di bawah; sisanya urut abjad supaya susunannya stabil.
    const kunci = Array.from(grup.keys()).sort((a, b) => {
        if (a === UMUM) return 1;
        if (b === UMUM) return -1;
        return a.localeCompare(b);
    });

    const baris = ['', '### Semua perubahan sejak ' + tagAwal];
    for (const k of kunci) {
        baris.push('');
        baris.push('**' + k + '**');
        for (const isi of grup.get(k)) baris.push('- ' + isi);
    }
    if (sisa > 0) {
        baris.push('');
        baris.push('- dan ' + sisa + ' perubahan lain');
    }
    if (hasil.url) {
        baris.push('');
        baris.push('[Lihat perbandingan lengkap di GitHub](' + hasil.url + ')');
    }
    return baris.join('\n');
}

// =============================================
// Pengecekan update (aman / tidak melempar error)
// Offline atau repo tak terjangkau => { ok:false, ... } tanpa mengganggu app.
// =============================================
async function checkForUpdates() {
    const local = deps.localManifest;
    const cfg = local && local.updater;
    if (!cfg || !cfg.owner || !cfg.repo) {
        return { ok: false, reason: 'Konfigurasi updater tidak ada di versions.json' };
    }

    try {
        const { manifest: remote, ref, changelog, releaseUrl, releaseName, usedRelease, prerelease, daftarRilis } =
            await fetchRemoteManifestAndMeta(cfg);

        const currentVersion = (local.app && local.app.version) || '0';
        const latestVersion = (remote.app && remote.app.version) || '0';
        const currentBuild = normalisasiBuild(local.app && local.app.build);
        const latestBuild = normalisasiBuild(remote.app && remote.app.build);
        const updateAvailable = compareRelease(
            { version: latestVersion, build: latestBuild },
            { version: currentVersion, build: currentBuild }
        ) > 0;

        const diff = diffFiles(local.files || {}, remote.files || {});

        // ---- Gate Tier-2 (butuh download ZIP penuh, bukan patch per-file) ----
        // Dipicu oleh: (a) flag eksplisit app.requiresFullUpdate di rilis, ATAU
        // (b) versi lokal di bawah app.minCompatibleVersion remote — artinya
        // refaktor terlalu dalam untuk di-patch dari versi selama ini.
        let requiresFullUpdate = !!(remote.app && remote.app.requiresFullUpdate);
        const minCompat = remote.app && remote.app.minCompatibleVersion;
        if (minCompat && compareVersion(currentVersion, minCompat) < 0) {
            requiresFullUpdate = true;
        }

        // URL halaman rilis: pakai dari API kalau ada, kalau tidak fallback ke
        // halaman releases/latest repo (dipakai tombol "Buka Halaman Rilis").
        const effectiveReleaseUrl = releaseUrl ||
            `https://github.com/${cfg.owner}/${cfg.repo}/releases/latest`;

        // Daftar perubahan lintas rilis. Kegagalan di sini TIDAK boleh
        // menggagalkan pengecekan pembaruan: paling buruk changelog-nya cuma
        // berisi catatan rilis terbaru, persis seperti perilaku sebelumnya.
        let changelogPenuh = changelog;
        if (updateAvailable && usedRelease) {
            try {
                const tagAwal = cariTagAwal(daftarRilis, currentVersion);
                if (tagAwal && tagAwal !== ref) {
                    const hasil = await fetchPerubahanAntarTag(cfg, tagAwal, ref);
                    const tambahan = bangunRingkasanCommit(hasil, tagAwal);
                    if (tambahan) changelogPenuh = (changelog || '').trim() + '\n' + tambahan;
                }
            } catch (e) {
                console.warn('[Updater] Ringkasan perubahan lintas rilis dilewati:', e.message);
            }
        }

        const info = {
            ok: true,
            updateAvailable,
            currentBuild,
            latestBuild,
            currentVersion,
            latestVersion,
            ref,
            usedRelease,
            prerelease,
            channel: cfg.channel || 'release',
            changelog: changelogPenuh,
            releaseUrl: effectiveReleaseUrl,
            releaseName,
            requiresFullUpdate,
            added: diff.added,
            modified: diff.modified,
            removed: diff.removed,
            // disimpan untuk fase apply; tidak dikirim apa adanya ke window
            _remoteFiles: remote.files || {},
            _remoteManifest: remote
        };

        pendingUpdateInfo = info;
        return info;
    } catch (e) {
        console.error('[Updater] checkForUpdates error:', e.message);
        return { ok: false, reason: e.message };
    }
}

// Versi "ringan" info untuk dikirim ke renderer (tanpa field internal besar).
function toRendererInfo(info) {
    if (!info) return null;
    const { _remoteFiles, _remoteManifest, ...rest } = info;
    return rest;
}

// =============================================
// Pastikan folder aplikasi benar-benar bisa ditulis.
// accessSync(W_OK) tidak bisa dipercaya untuk folder di Windows (ACL + TOCTOU),
// jadi tulis berkas percobaan sungguhan. Dipanggil SEBELUM fase 1 supaya
// instalasi di Program Files ditolak dengan pesan jelas, bukan berhenti di
// tengah fase 2 dengan separuh berkas sudah tertimpa.
// return null kalau aman, atau string pesan kalau tidak.
// =============================================
function cekFolderBisaDitulis(appDir) {
    const probe = path.join(appDir, `.update-write-test-${process.pid}-${Date.now()}`);
    try {
        fs.writeFileSync(probe, 'ok');
        fs.unlinkSync(probe);
        return null;
    } catch (e) {
        return `Folder aplikasi tidak bisa ditulis (${e.code || e.message}). `
            + `Pindahkan aplikasi ke folder milikmu sendiri — misalnya Documents atau Desktop — lalu coba lagi. `
            + `Folder sekarang: ${appDir}`;
    }
}

// =============================================
// Terapkan update (TWO-PHASE, aman)
//   Fase 0: pastikan folder aplikasi bisa ditulis.
//   Fase 1: download SEMUA file (added+modified) ke memori + verifikasi SHA-256.
//           Jika ada satu saja gagal/mismatch -> batal total, tidak ada yang ditulis.
//   Fase 2: backup file lama -> tulis file baru secara atomik (.new -> rename).
//           File "removed" di-backup lalu dihapus.
//   Terakhir: timpa versions.json lokal dengan manifest remote.
// =============================================
async function applyUpdate(progressCb = () => {}) {
    const info = pendingUpdateInfo;
    if (!info || !info.ok || !info.updateAvailable) {
        return { success: false, error: 'Tidak ada update yang siap diterapkan.' };
    }
    if (info.requiresFullUpdate) {
        return { success: false, error: 'Update ini butuh instalasi penuh (download ZIP rilis).' };
    }

    const cfg = deps.localManifest.updater;
    const appDir = deps.appDir;

    // ---- Fase 0: izin tulis ----
    const tidakBisaDitulis = cekFolderBisaDitulis(appDir);
    if (tidakBisaDitulis) return { success: false, error: tidakBisaDitulis };

    const toDownload = [...info.added, ...info.modified];
    const backupDir = path.join(appDir, '.update-backup', String(Date.now()));

    // ---- Fase 1: staging + verifikasi ----
    const staged = new Map(); // relPath -> Buffer
    let done = 0;
    for (const rel of toDownload) {
        progressCb({ phase: 'download', file: rel, done, total: toDownload.length });
        const url = `${cfg.rawBase}/${cfg.owner}/${cfg.repo}/${info.ref}/${rel}`;
        let buf;
        try {
            buf = await httpsGet(url, { json: false });
        } catch (e) {
            return { success: false, error: `Gagal download ${rel}: ${e.message}` };
        }
        const expected = info._remoteFiles[rel];
        const actual = crypto.createHash('sha256').update(buf).digest('hex');
        if (expected && actual !== expected) {
            return { success: false, error: `Hash tidak cocok untuk ${rel} (file rusak/diubah di server).` };
        }
        staged.set(rel, buf);
        done++;
    }

    // ---- Fase 2: backup + tulis ----
    try {
        fs.mkdirSync(backupDir, { recursive: true });

        // Tulis / perbarui file
        let applied = 0;
        for (const [rel, buf] of staged.entries()) {
            const target = path.join(appDir, rel);
            const targetDir = path.dirname(target);
            fs.mkdirSync(targetDir, { recursive: true });

            // Backup file lama bila ada
            if (fs.existsSync(target)) {
                const bak = path.join(backupDir, rel);
                fs.mkdirSync(path.dirname(bak), { recursive: true });
                fs.copyFileSync(target, bak);
            }

            // Tulis atomik: .new lalu rename menimpa
            const tmp = target + '.new';
            fs.writeFileSync(tmp, buf);
            fs.renameSync(tmp, target);
            applied++;
            progressCb({ phase: 'apply', file: rel, done: applied, total: staged.size });
        }

        // File yang dihapus di rilis baru: backup lalu hapus (refaktor struktur)
        for (const rel of info.removed) {
            const target = path.join(appDir, rel);
            if (fs.existsSync(target)) {
                const bak = path.join(backupDir, rel);
                fs.mkdirSync(path.dirname(bak), { recursive: true });
                fs.copyFileSync(target, bak);
                fs.unlinkSync(target);
            }
        }

        // Sinkronkan manifest lokal dengan remote (agar cek berikutnya akurat)
        const versionsPath = path.join(appDir, cfg.manifestPath || 'versions.json');
        fs.writeFileSync(versionsPath, JSON.stringify(info._remoteManifest, null, 4), 'utf-8');

        return {
            success: true,
            applied,
            removed: info.removed.length,
            backupDir,
            newVersion: info.latestVersion
        };
    } catch (e) {
        console.error('[Updater] applyUpdate fase tulis error:', e);
        return { success: false, error: e.message, backupDir };
    }
}

// =============================================
// Window penawaran update
// =============================================
function createUpdaterWindow() {
    if (updaterWindow && !updaterWindow.isDestroyed()) {
        updaterWindow.focus();
        return updaterWindow;
    }
    const { BrowserWindow, app } = deps;
    updaterWindow = new BrowserWindow({
        width: 580,
        height: 640,
        resizable: false,
        minimizable: true,
        maximizable: false,
        frame: false,
        icon: path.join(deps.appDir, 'aset', 'ikon.jpg'),
        title: 'Pembaruan Tersedia',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });
    updaterWindow.setMenu(null);
    updaterWindow.loadFile(path.join(deps.appDir, 'updater-window.html'));

    updaterWindow.webContents.once('did-finish-load', () => {
        if (updaterWindow && !updaterWindow.isDestroyed()) {
            updaterWindow.webContents.send('updater:info', toRendererInfo(pendingUpdateInfo));
        }
    });
    updaterWindow.on('closed', () => { updaterWindow = null; });
    return updaterWindow;
}

// =============================================
// Auto-check dipanggil saat boot ke native / gif-overlay.
// Non-blocking; hanya membuka window bila benar-benar ada update.
// =============================================
async function autoCheckAndPrompt(modeLabel) {
    if (shownThisSession) return;
    const info = await checkForUpdates();
    if (info && info.ok && info.updateAvailable) {
        shownThisSession = true;
        console.log(`[Updater] Update tersedia (${info.currentVersion} -> ${info.latestVersion}) saat boot '${modeLabel}'.`);
        createUpdaterWindow();
    } else if (info && !info.ok) {
        console.log(`[Updater] Lewati auto-check (${modeLabel}): ${info.reason}`);
    }
}

// =============================================
// Inisialisasi: daftar IPC handler. Dipanggil sekali dari main.js.
// =============================================
function initUpdater(d) {
    deps = d;
    const { ipcMain, app, shell } = deps;

    // Versi lokal saat ini (untuk panel About / Settings)
    ipcMain.handle('updater:get-current', () => ({
        version: (deps.localManifest.app && deps.localManifest.app.version) || '0',
        build: normalisasiBuild(deps.localManifest.app && deps.localManifest.app.build),
        stage: (deps.localManifest.app && deps.localManifest.app.stage) || ''
    }));

    // Pengecekan manual (dipanggil dari Settings game mode). Mengembalikan info.
    ipcMain.handle('updater:check', async () => toRendererInfo(await checkForUpdates()));

    // Buka window penawaran update memakai hasil check terakhir.
    ipcMain.handle('updater:open-window', async () => {
        if (!pendingUpdateInfo) await checkForUpdates();
        createUpdaterWindow();
        return { opened: true };
    });

    // Terapkan update; kirim progress ke window pemanggil.
    ipcMain.handle('updater:apply', async (event) => {
        const sender = event.sender;
        return await applyUpdate((p) => {
            if (sender && !sender.isDestroyed()) sender.send('updater:progress', p);
        });
    });

    // Restart aplikasi setelah update.
    ipcMain.on('updater:relaunch', () => {
        app.relaunch();
        app.exit(0);
    });

    // Buka link rilis di browser eksternal (untuk Tier-2 / lihat changelog penuh).
    ipcMain.on('updater:open-external', (event, url) => {
        if (url && /^https:\/\//.test(url)) shell.openExternal(url);
    });

    ipcMain.on('updater:close-window', () => {
        if (updaterWindow && !updaterWindow.isDestroyed()) updaterWindow.close();
    });

    console.log('[Updater] Modul updater terinisialisasi.');
}

module.exports = {
    initUpdater,
    checkForUpdates,
    autoCheckAndPrompt,
    createUpdaterWindow,
    compareVersion,
    compareRelease,
    // Diekspor untuk pengujian — tidak dipakai main.js.
    pickRelease,
    tagToVersion,
    cekFolderBisaDitulis,
    normalisasiBuild
};
