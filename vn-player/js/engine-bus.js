/**
 * VN Player — Engine Bus
 * Event Bus pusat untuk komunikasi antar modul tanpa tight coupling.
 * Semua modul emit dan listen event melalui bus ini.
 * 
 * Contoh penggunaan:
 *   VNBus.on('display:update', (data) => { ... });
 *   VNBus.emit('display:update', payload);
 *   VNBus.once('engine:ready', () => { ... });
 *   VNBus.off('display:update', handler);
 */

const VNBus = (() => {
    const listeners = {};

    return {
        /**
         * Daftarkan listener untuk event tertentu
         * @param {string} event - Nama event (contoh: 'display:update')
         * @param {Function} callback - Fungsi yang dipanggil saat event terjadi
         */
        on(event, callback) {
            if (!listeners[event]) listeners[event] = [];
            listeners[event].push(callback);
        },

        /**
         * Daftarkan listener yang hanya dipanggil sekali
         */
        once(event, callback) {
            const wrapper = (...args) => {
                callback(...args);
                this.off(event, wrapper);
            };
            this.on(event, wrapper);
        },

        /**
         * Hapus listener spesifik dari event
         */
        off(event, callback) {
            if (!listeners[event]) return;
            listeners[event] = listeners[event].filter(cb => cb !== callback);
        },

        /**
         * Emit event dengan data payload
         * @param {string} event - Nama event
         * @param {...*} args - Argumen yang diteruskan ke listeners
         */
        emit(event, ...args) {
            if (!listeners[event]) return;
            // Copy array agar aman kalau listener memodifikasi list saat iterasi
            const cbs = [...listeners[event]];
            cbs.forEach(cb => {
                try {
                    cb(...args);
                } catch (err) {
                    console.error(`[VNBus] Error di listener '${event}':`, err);
                }
            });
        },

        /**
         * Hapus semua listener (untuk cleanup/reset)
         */
        clear() {
            Object.keys(listeners).forEach(key => delete listeners[key]);
        },

        /**
         * Debug: tampilkan semua event yang terdaftar
         */
        debug() {
            const summary = {};
            Object.keys(listeners).forEach(key => {
                summary[key] = listeners[key].length;
            });
            console.log('[VNBus] Registered events:', summary);
            return summary;
        }
    };
})();
