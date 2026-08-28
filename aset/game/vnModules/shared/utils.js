/**
 * utils.js
 * Modul utilitas yang berisi fungsi-fungsi shared seperti notifikasi dan konfirmasi.
 */
window.VN = window.VN || {};

VN.Utils = {
    notificationTimeout: null,
    _dirtyDecisionPending: null,

    /**
     * Memanggil IPC command yang memakai response envelope `{ success, message }`.
     *
     * `ipcRenderer.invoke()` hanya me-reject saat handler MELEMPAR. Banyak handler
     * editor sengaja menangkap error filesystem lalu mengembalikan
     * `{ success:false }`; tanpa pemeriksaan ini jalur `try` renderer tetap berjalan
     * dan dapat menandai draft sebagai tersimpan padahal disk tidak berubah.
     *
     * Helper hanya menganggap `success === false` sebagai kegagalan agar aman dipakai
     * bertahap: handler query lama yang mengembalikan array/data mentah tidak berubah
     * semantiknya. Response asli ditempel pada error untuk kebutuhan diagnostik/UI.
     *
     * @param {{invoke: Function}} ipc - Biasanya `ipcRenderer`.
     * @param {string} channel - Nama channel IPC.
     * @param {...any} args - Argumen yang diteruskan ke `invoke`.
     * @returns {Promise<any>} response handler bila tidak menyatakan gagal.
     * @throws {Error} bila IPC invalid atau response menyatakan `success:false`.
     */
    invokeChecked: async function(ipc, channel, ...args) {
        if (!ipc || typeof ipc.invoke !== 'function') {
            throw new TypeError('IPC client tidak menyediakan invoke().');
        }

        const response = await ipc.invoke(channel, ...args);
        if (response && response.success === false) {
            const error = new Error(response.message || `Operasi IPC "${channel}" gagal.`);
            error.name = 'IPCOperationError';
            error.channel = channel;
            error.response = response;
            throw error;
        }
        return response;
    },

    /**
     * Menjalankan aksi lanjutan (keluar, reload, launch) hanya bila save action
     * secara eksplisit mengembalikan `true`. Resolve dengan `false`/`undefined`
     * bukan keberhasilan; exception diteruskan tanpa menjalankan continuation.
     */
    continueAfterCheckedSave: async function(saveAction, continuation) {
        if (typeof saveAction !== 'function' || typeof continuation !== 'function') {
            throw new TypeError('Save action dan continuation wajib berupa fungsi.');
        }
        const saved = await saveAction();
        if (saved !== true) return false;
        await continuation();
        return true;
    },

    /**
     * Dialog tiga arah untuk navigasi yang akan mengganti draft:
     * simpan, buang, atau batal. Menggunakan modal yang sama dengan konfirmasi
     * biasa agar keputusan tidak hilang karena timeout toast.
     *
     * @returns {Promise<'save'|'discard'|'cancel'>}
     */
    showDirtyDecision: function(message) {
        return new Promise(resolve => {
            const overlay = document.getElementById('confirmation-modal-overlay');
            const textElement = document.getElementById('confirmation-modal-text');
            const yesBtn = document.getElementById('confirm-yes-btn');
            const noBtn = document.getElementById('confirm-no-btn');
            const buttons = yesBtn && yesBtn.parentElement;
            if (!overlay || !textElement || !yesBtn || !noBtn || !buttons) {
                resolve('cancel');
                return;
            }

            const staleDiscard = document.getElementById('confirm-discard-btn');
            if (staleDiscard) staleDiscard.remove();

            const discardBtn = document.createElement('button');
            discardBtn.id = 'confirm-discard-btn';
            discardBtn.textContent = 'Buang & Lanjut';
            buttons.insertBefore(discardBtn, yesBtn);

            textElement.textContent = message;
            yesBtn.textContent = 'Simpan';
            noBtn.textContent = 'Batal';
            noBtn.style.display = 'inline-block';
            overlay.classList.add('visible');

            let settled = false;
            const close = decision => {
                if (settled) return;
                settled = true;
                overlay.classList.remove('visible');
                yesBtn.onclick = null;
                noBtn.onclick = null;
                discardBtn.onclick = null;
                discardBtn.remove();
                yesBtn.textContent = 'Yakin';
                noBtn.textContent = 'Batal';
                resolve(decision);
            };

            yesBtn.onclick = () => close('save');
            discardBtn.onclick = () => close('discard');
            noBtn.onclick = () => close('cancel');
        });
    },

    /**
     * Satu gerbang reusable sebelum aksi yang mengganti dokumen. Hanya satu dialog
     * boleh aktif; klik navigasi lain ketika keputusan masih menunggu ditolak.
     */
    resolveDirtyDecision: async function(options) {
        options = options || {};
        const dirty = typeof options.isDirty === 'function'
            ? !!options.isDirty()
            : !!options.dirty;
        if (!dirty) return true;
        if (VN.Utils._dirtyDecisionPending) return false;

        const operation = (async () => {
            const decision = await VN.Utils.showDirtyDecision(
                options.message || 'Ada perubahan yang belum disimpan.'
            );
            if (decision === 'discard') return true;
            if (decision !== 'save') return false;
            if (typeof options.saveAction !== 'function') return false;
            return (await options.saveAction()) === true;
        })();

        VN.Utils._dirtyDecisionPending = operation;
        try {
            return await operation;
        } finally {
            if (VN.Utils._dirtyDecisionPending === operation) {
                VN.Utils._dirtyDecisionPending = null;
            }
        }
    },

    /** Jalankan continuation hanya setelah keputusan draft mengizinkannya. */
    continueAfterDirtyDecision: async function(options, continuation) {
        if (typeof continuation !== 'function') {
            throw new TypeError('Continuation wajib berupa fungsi.');
        }
        const allowed = await VN.Utils.resolveDirtyDecision(options);
        if (!allowed) return false;
        await continuation();
        return true;
    },
    
    /**
     * Menampilkan notifikasi toast
     */
    showNotification: function(message, type = 'success') {
        const toast = document.getElementById('notification-toast');
        clearTimeout(VN.Utils.notificationTimeout);
        
        toast.textContent = message;
        toast.className = 'notification-toast';
        toast.classList.add(type);
        toast.classList.add('show');
        
        // menyembunyikan notifikasi setelah 3 detik
        VN.Utils.notificationTimeout = setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    },

    /**
     * Menampilkan modal konfirmasi kustom.
     * @param {string} message - Pesan yang ditampilkan di modal.
     * @param {boolean} alertOnly - Jika true, hanya menampilkan tombol OK (mode alert). Default: false.
     * @returns {Promise<boolean>} - Resolve true jika user klik Ya/OK, false jika klik Batal.
     */
    showConfirmation: function(message, alertOnly = false) {
        return new Promise(resolve => {
            const overlay = document.getElementById('confirmation-modal-overlay');
            const textElement = document.getElementById('confirmation-modal-text');
            const yesBtn = document.getElementById('confirm-yes-btn');
            const noBtn = document.getElementById('confirm-no-btn');

            textElement.textContent = message;
            overlay.classList.add('visible');

            // Atur visibilitas tombol berdasarkan mode
            if (alertOnly) {
                noBtn.style.display = 'none';
                yesBtn.textContent = 'OK';
            } else {
                noBtn.style.display = 'inline-block';
                yesBtn.textContent = 'Yakin';
            }

            const close = (result) => {
                overlay.classList.remove('visible');
                // Hapus listener agar tidak menumpuk
                yesBtn.onclick = null;
                noBtn.onclick = null;
                // Reset tampilan tombol ke default
                noBtn.style.display = 'inline-block';
                yesBtn.textContent = 'Yakin';
                resolve(result);
            };

            // Pasang listener untuk tombol
            yesBtn.onclick = () => close(true);
            noBtn.onclick = () => close(false);
        });
    },

    /**
     * Modal input teks (pengganti window.prompt — tidak didukung Electron).
     * Memakai modal konfirmasi yang sama, dengan <input> disisipkan sementara.
     * @param {string} message - Label/pertanyaan.
     * @param {string} [defaultValue=''] - Nilai awal input.
     * @returns {Promise<string|null>} - Nilai input, atau null bila dibatalkan.
     */
    showPrompt: function(message, defaultValue = '') {
        return new Promise(resolve => {
            const overlay = document.getElementById('confirmation-modal-overlay');
            const box = document.getElementById('confirmation-modal-box');
            const textElement = document.getElementById('confirmation-modal-text');
            const yesBtn = document.getElementById('confirm-yes-btn');
            const noBtn = document.getElementById('confirm-no-btn');

            textElement.textContent = message;

            const input = document.createElement('input');
            input.type = 'text';
            input.value = defaultValue;
            input.style.cssText = 'width:100%; margin:12px 0; padding:10px; background:#222; color:#eee; border:1px solid #555; border-radius:6px; box-sizing:border-box; font-size:1em;';
            box.insertBefore(input, textElement.nextSibling);

            yesBtn.textContent = 'OK';
            noBtn.style.display = 'inline-block';
            overlay.classList.add('visible');
            setTimeout(() => { input.focus(); input.select(); }, 50);

            const close = (result) => {
                overlay.classList.remove('visible');
                input.remove();
                yesBtn.onclick = null;
                noBtn.onclick = null;
                input.onkeydown = null;
                yesBtn.textContent = 'Yakin';
                resolve(result);
            };

            yesBtn.onclick = () => close(input.value);
            noBtn.onclick = () => close(null);
            input.onkeydown = (e) => {
                if (e.key === 'Enter') close(input.value);
                if (e.key === 'Escape') close(null);
            };
        });
    },

    /**
     * Helper function untuk escape HTML
     */
    escapeHtml: function(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

// Backward compatibility bridge (untuk kode lama di vnManager.html)
window.showNotification = VN.Utils.showNotification;
window.showConfirmation = VN.Utils.showConfirmation;
window.showPrompt = VN.Utils.showPrompt;
window.escapeHtml = VN.Utils.escapeHtml;
