/**
 * update-hashes.js
 * Script untuk memperbarui hash di versions.json setelah pengembangan
 * 
 * Jalankan dengan: node update-hashes.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const VERSIONS_FILE = path.join(__dirname, 'versions.json');

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
