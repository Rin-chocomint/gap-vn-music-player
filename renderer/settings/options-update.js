// =============================================
// options-update.js — Cek update manual (Game mode / index.html)
// Berbeda dengan native & gif-overlay yang otomatis cek saat boot, di game mode
// pengecekan dipicu manual lewat tombol di tab "Update" pada Settings.
// =============================================
(function () {
    const { ipcRenderer } = require('electron');

    const btn = document.getElementById('check-update-btn');
    const statusBox = document.getElementById('update-status-box');
    const curVerEl = document.getElementById('update-current-version');

    if (!btn || !statusBox) return;

    // Tampilkan versi terpasang saat panel siap.
    ipcRenderer.invoke('updater:get-current').then((cur) => {
        if (cur && curVerEl) {
            curVerEl.textContent = 'v' + cur.version + (cur.stage ? ' (' + cur.stage + ')' : '');
        }
    }).catch(() => { });

    function setStatus(text, color) {
        statusBox.textContent = text;
        statusBox.style.color = color || '#a4abb6';
    }

    btn.addEventListener('click', async () => {
        btn.disabled = true;
        const oldLabel = btn.textContent;
        btn.textContent = 'Mengecek…';
        setStatus('Menghubungi GitHub…');

        try {
            const info = await ipcRenderer.invoke('updater:check');

            if (!info || !info.ok) {
                setStatus('Gagal mengecek: ' + ((info && info.reason) || 'tidak diketahui') +
                    '. Pastikan terhubung internet.', '#ffb74d');
            } else if (info.updateAvailable) {
                const total = (info.modified || []).length + (info.added || []).length + (info.removed || []).length;
                setStatus(`Update tersedia: v${info.currentVersion} → v${info.latestVersion} (${total} file). Membuka penawaran…`, '#4caf50');
                // Buka window penawaran update yang sama dengan mode native/gif.
                ipcRenderer.invoke('updater:open-window');
            } else {
                setStatus(`Sudah versi terbaru (v${info.currentVersion}). Tidak ada update.`, '#4caf50');
            }
        } catch (e) {
            setStatus('Error: ' + e.message, '#ffb74d');
        } finally {
            btn.disabled = false;
            btn.textContent = oldLabel;
        }
    });
})();
