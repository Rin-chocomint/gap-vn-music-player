/**
 * VN Player — Registry
 * Registry pattern untuk registrasi handler yang bisa di-extend.
 * Dipakai untuk: transitions, effects, dan nanti extensions.
 *
 * Contoh:
 *   VNRegistry.register('transition', 'fade_black', handlerFn);
 *   const handler = VNRegistry.get('transition', 'fade_black');
 *   VNRegistry.list('transition'); // ['cut', 'fade_black', ...]
 */

const VNRegistry = (() => {
    // Namespace → Map<name, {handler, meta}>
    const registries = {};
    // Hook point → [{handler, priority}] sorted by priority
    const hooks = {};

    return {
        /**
         * Daftarkan handler di namespace tertentu
         * @param {string} namespace - Kategori (contoh: 'transition', 'effect')
         * @param {string} name - Nama handler (contoh: 'fade_black')
         * @param {Function} handler - Fungsi handler
         * @param {Object} [meta] - Metadata opsional (deskripsi, author, dll)
         */
        register(namespace, name, handler, meta = {}) {
            if (!registries[namespace]) registries[namespace] = {};

            if (registries[namespace][name]) {
                console.warn(`[VNRegistry] Override handler '${namespace}:${name}'`);
            }

            registries[namespace][name] = { handler, meta };
            console.log(`[VNRegistry] Terdaftar: ${namespace}:${name}`);
        },

        /**
         * Ambil handler function dari registry
         * @returns {Function|null} Handler function, atau null kalau gak ketemu
         */
        get(namespace, name) {
            const entry = registries[namespace]?.[name];
            return entry ? entry.handler : null;
        },

        /**
         * Ambil handler beserta metadata
         */
        getEntry(namespace, name) {
            return registries[namespace]?.[name] || null;
        },

        /**
         * Cek apakah handler terdaftar
         */
        has(namespace, name) {
            return !!(registries[namespace]?.[name]);
        },

        /**
         * List semua nama handler dalam namespace
         * @returns {string[]}
         */
        list(namespace) {
            return Object.keys(registries[namespace] || {});
        },

        /**
         * List semua namespace yang terdaftar
         */
        listNamespaces() {
            return Object.keys(registries);
        },

        /**
         * Hapus handler spesifik
         */
        unregister(namespace, name) {
            if (registries[namespace]) {
                delete registries[namespace][name];
            }
        },

        /**
         * Hapus semua handler dalam namespace
         */
        clearNamespace(namespace) {
            delete registries[namespace];
        },

        /**
         * Debug: tampilkan semua registry
         */
        debug() {
            const summary = {};
            Object.keys(registries).forEach(ns => {
                summary[ns] = Object.keys(registries[ns]);
            });
            console.log('[VNRegistry] Registered:', summary);
            return summary;
        },

        // ================================================================
        // HOOK SYSTEM — Interceptor pattern
        // registerHook(point, handler, priority?) — handler(context) → context | false
        // runHooks(point, context) — sequential by priority, returns final context or false
        // ================================================================

        /**
         * Daftarkan hook pada hook point tertentu.
         * @param {string} point - Nama hook point (contoh: 'player:before-dialogue')
         * @param {Function} handler - Hook handler: fn(context) → modified context | false (cancel)
         * @param {number} [priority=100] - Prioritas eksekusi (rendah=duluan). 0-99=before built-in, 100=default, 101+=after.
         */
        registerHook(point, handler, priority = 100) {
            if (!hooks[point]) hooks[point] = [];
            hooks[point].push({ handler, priority });
            hooks[point].sort((a, b) => a.priority - b.priority);
            console.log(`[VNRegistry] Hook terdaftar: ${point} (priority: ${priority})`);
        },

        /**
         * Jalankan semua hooks pada hook point secara sequential.
         * Setiap handler menerima context dan bisa:
         * - Return object → replace context untuk handler berikutnya
         * - Return false → cancel chain (stop semua hooks berikutnya)
         * - Return undefined/null → context tidak berubah, lanjut ke handler berikutnya
         *
         * @param {string} point - Nama hook point
         * @param {*} context - Data context yang akan di-pass ke setiap handler
         * @returns {*} Final context setelah semua hooks, atau false jika cancelled
         */
        runHooks(point, context) {
            const chain = hooks[point];
            if (!chain || chain.length === 0) return context;

            let current = context;
            for (const entry of chain) {
                const result = entry.handler(current);
                if (result === false) {
                    console.log(`[VNRegistry] Hook chain '${point}' cancelled oleh handler (priority: ${entry.priority})`);
                    return false;
                }
                if (result !== undefined && result !== null) {
                    current = result;
                }
            }
            return current;
        },

        /**
         * Hapus semua hooks pada hook point tertentu
         */
        clearHooks(point) {
            delete hooks[point];
        },

        /**
         * List semua hook points yang terdaftar
         */
        listHooks() {
            const summary = {};
            Object.keys(hooks).forEach(point => {
                summary[point] = hooks[point].length;
            });
            return summary;
        }
    };
})();
