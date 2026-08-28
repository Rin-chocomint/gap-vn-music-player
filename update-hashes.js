/**
 * update-hashes.js
 * Script untuk memperbarui hash di versions.json setelah pengembangan
 * 
 * Jalankan dengan: node update-hashes.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const klawSync = require('klaw-sync');

const VERSIONS_FILE = path.join(__dirname, 'versions.json');

// Ekstensi file yang dikelola updater Tier-1 (kode & konfigurasi teks).
// Aset biner (font/gambar/ico) sengaja TIDAK dikelola di sini — perubahannya
// lewat Tier-2 (download ZIP rilis penuh) supaya download per-file tetap ringan.
const MANAGED_EXTENSIONS = ['.html', '.js', '.css', '.json', '.wgsl', '.md', '.txt'];

// File yang tidak boleh ikut manifest meski ekstensinya cocok.
const ALWAYS_EXCLUDE_FILES = ['versions.json', 'package-lock.json'];

// Fungsi untuk menghitung hash SHA-256
function calculateFileHash(filePath) {
    try {
        if (!fs.existsSync(filePath)) {
            console.log(`File tidak ditemukan: ${filePath}`);
            return null;
        }
        const content = fs.readFileSync(filePath);
        return crypto.createHash('sha256').update(content).digest('hex');
    } catch (e) {
        console.error(`Error membaca file ${filePath}:`, e.message);
        return null;
    }
}

// Normalisasi path relatif ke bentuk forward-slash (POSIX) agar konsisten
// dengan path yang dipakai untuk URL raw.githubusercontent.
function toPosixRelative(absPath) {
    return path.relative(__dirname, absPath).split(path.sep).join('/');
}

// Bangun ulang manifest `files`: hash SHA-256 semua file terkelola.
// excludePaths diambil dari versions.updater.excludePaths (mis. node_modules,
// dist, aset/music, aset/wallpaper, dll) agar konten user tidak ikut.
function buildFilesManifest(versions) {
    const excludePaths = (versions.updater && Array.isArray(versions.updater.excludePaths))
        ? versions.updater.excludePaths.map(p => p.replace(/\\/g, '/'))
        : [];

    const isExcluded = (relPosix) => {
        if (ALWAYS_EXCLUDE_FILES.includes(relPosix)) return true;
        return excludePaths.some(ex => relPosix === ex || relPosix.startsWith(ex + '/'));
    };

    const entries = klawSync(__dirname, {
        nodir: true,
        // Buang seluruh isi folder yang dikecualikan sedini mungkin (lebih cepat).
        filter: (item) => {
            const relPosix = toPosixRelative(item.path);
            return !isExcluded(relPosix);
        }
    });

    const files = {};
    let count = 0;
    for (const item of entries) {
        const relPosix = toPosixRelative(item.path);
        const ext = path.extname(relPosix).toLowerCase();
        if (!MANAGED_EXTENSIONS.includes(ext)) continue;
        if (isExcluded(relPosix)) continue;

        const hash = calculateFileHash(item.path);
        if (hash) {
            files[relPosix] = hash;
            count++;
        }
    }

    // Urutkan key agar diff git pada versions.json stabil & mudah dibaca.
    const sorted = {};
    for (const key of Object.keys(files).sort()) sorted[key] = files[key];

    console.log(`\nManifest 'files': ${count} file terkelola di-hash.`);
    return sorted;
}

// Main
function main() {
    console.log('Update Hash Tool\n');
    console.log('Membaca versions.json...');

    // Baca versions.json
    let versions;
    try {
        versions = JSON.parse(fs.readFileSync(VERSIONS_FILE, 'utf-8'));
    } catch (e) {
        console.error('Gagal membaca versions.json:', e.message);
        process.exit(1);
    }

    // Update hash untuk setiap komponen
    console.log('\nMemperbarui hash komponen:\n');

    let updated = 0;
    for (const [name, info] of Object.entries(versions.components || {})) {
        const filePath = path.join(__dirname, info.file);
        const newHash = calculateFileHash(filePath);

        if (newHash) {
            const oldHash = info.hash || '(tidak ada)';
            const changed = oldHash !== newHash;

            versions.components[name].hash = newHash;

            if (changed) {
                console.log(`  ok ${name}`);
                console.log(`    File: ${info.file}`);
                console.log(`    Old:  ${oldHash.substring(0, 16)}...`);
                console.log(`    New:  ${newHash.substring(0, 16)}...`);
                console.log('');
                updated++;
            } else {
                console.log(`  ○ ${name} (tidak berubah)`);
            }
        }
    }

    // Bangun ulang manifest `files` (daftar lengkap file terkelola + hash).
    // Ini yang dipakai updater untuk mendeteksi file mana yang berubah/ditambah/dihapus.
    console.log('\nMembangun manifest files lengkap...');
    versions.files = buildFilesManifest(versions);

    // Simpan kembali
    console.log('\nMenyimpan versions.json...');
    try {
        fs.writeFileSync(VERSIONS_FILE, JSON.stringify(versions, null, 4), 'utf-8');
        console.log(`\nSelesai! ${updated} komponen diperbarui.`);
    } catch (e) {
        console.error('Gagal menyimpan versions.json:', e.message);
        process.exit(1);
    }
}

main();
