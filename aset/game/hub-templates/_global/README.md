# `_global/` — Renderer Hub Fallback

Folder ini **bukan** template picker. Isinya `novel-hub.html`: renderer Hub
**global** lama yang kini hanya jadi *fallback defensif* dan sumber **preview editor**.

Sejak konsolidasi boot, tiap novel SELALU mem-boot file hub-nya sendiri
(`hub.html` code-first → `index.html` legacy). `novel-hub.html` global tidak lagi
di-boot langsung; ia dipakai bila novel belum punya file lokal (idealnya tak terjadi
karena `hubScaffolder.ensureLocalHub()` memmaterialisasi `hub.html` lebih dulu).

Pemindai pustaka template (`vn-engine/hub-templates.js → list()`) **melewati** folder
tanpa `template.json`, jadi `_global/` aman di sini tanpa muncul di picker.

Referensi path ke berkas ini ada di:
`vn-engine/preview-manager.js`, `vn-engine/hub-config-manager.js`,
`vn-engine/ipc-handlers.js`, `aset/game/vnModules/editor/scriptEditor.js`,
`aset/game/vnModules/editor/hubEditor.js`.
