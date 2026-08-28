/**
 * inspectorPanel.js — Schema-Driven Contextual Inspector
 *
 * Panel properti di sisi kanan workspace yang menampilkan/mengedit
 * field entry berdasarkan schema dari NodeRegistry.
 *
 * Fitur:
 *   - Klik entry card → inspector menampilkan properti-nya (grouped)
 *   - Edit di inspector ↔ sync ke card input (dua arah)
 *   - Field dirender otomatis dari NodeRegistry type definition + FIELD_UI
 *   - Context switching: script entry / hub config / player config
 *   - Collapsible groups
 */
(function () {
    'use strict';

    var _C = VN.NodeRegistry.C;
    var FIELD_UI = _C.FIELD_UI;
    var FIELD_GROUPS = _C.FIELD_GROUPS;

    // DOM refs
    var panel = document.getElementById('inspector-panel');
    var contextLabel = document.getElementById('inspector-context-label');
    var inspectorBody = document.getElementById('inspector-body');
    var inspectorFields = document.getElementById('inspector-fields');
    var inspectorEmpty = document.getElementById('inspector-empty');
    var closeBtn = document.getElementById('inspector-close-btn');

    // State
    var _currentCard = null;       // Reference ke .dialogue-entry-card yang sedang di-inspect
    var _currentContext = null;     // 'entry' | 'hub' | 'player'
    var _collapsedGroups = (function () {
        try { return JSON.parse(localStorage.getItem('vn_inspector_collapsed') || '{}'); } catch (e) { return {}; }
    })();
    var _inspectorVisible = false;
    var toggleBtn = null;
    var _emptyDefaultText = inspectorEmpty ? inspectorEmpty.textContent : '';

    // ==========================================
    // BUKA OTOMATIS DI WORKSPACE HUB
    //
    // Properti Hub Scene TIDAK punya rumah lain: satu-satunya tempat mengubah
    // nama, background, dan status aktif sebuah scene adalah panel ini. Selama ia
    // tertutup secara bawaan, seluruh permukaan itu tak terlihat — tester melapor
    // panel ini seolah tak ada.
    //
    // Tetap sebuah PREFERENSI, bukan paksaan: menutup panel akan diingat, jadi
    // yang tak menginginkannya cukup menutupnya sekali. Itu bedanya dengan panel
    // yang selalu muncul dan merampas ruang tanpa bisa ditolak.
    // ==========================================
    var _KUNCI_AUTO_BUKA = 'vn_inspector_auto_open';

    function bukaOtomatisDiizinkan() {
        try { return localStorage.getItem(_KUNCI_AUTO_BUKA) !== '0'; }
        catch (e) { return true; }   // preferensi tak terbaca = pakai bawaan
    }

    function catatPreferensiBuka(boleh) {
        try { localStorage.setItem(_KUNCI_AUTO_BUKA, boleh ? '1' : '0'); }
        catch (e) { /* gagal menyimpan preferensi bukan alasan membatalkan aksinya */ }
    }

    // ==========================================
    // PUBLIC API
    // ==========================================

    window.VNInspector = {
        /** Inspect sebuah entry card */
        inspectCard: function (card) {
            if (!card || !card.isConnected) return;
            var type = card.dataset.type;
            var typeDef = VN.NodeRegistry.get(type);
            if (!typeDef) return;

            _currentCard = card;
            _currentContext = 'entry';
            showPanel();
            contextLabel.textContent = typeDef.label + ' — Properties';
            renderFieldsForEntry(card, type, typeDef);
        },

        /** Clear inspector */
        clear: function () {
            _currentCard = null;
            _currentContext = null;
            inspectorFields.innerHTML = '';
            inspectorFields.style.display = 'none';
            inspectorEmpty.style.display = 'block';
            inspectorEmpty.textContent = _emptyDefaultText;
            contextLabel.textContent = 'Tidak ada yang dipilih';
        },

        /** Render properti Hub Scene yang sedang aktif (dipanggil dari hubEditor). */
        showHubScene: function (sceneId) { _renderHubScene(sceneId); },

        /** Show/hide panel */
        show: function () { showPanel(); },
        hide: function () { hidePanel(); },
        toggle: function () {
            if (!isInspectorAvailable()) {
                hidePanel();
                refreshInspectorToggle();
                return;
            }
            // Membukanya lewat tombol/pintasan berarti pengguna memang
            // menginginkannya — preferensi buka-otomatis dinyalakan lagi.
            if (_inspectorVisible) { hidePanel(); catatPreferensiBuka(false); }
            else { showPanel(); catatPreferensiBuka(true); }
        },

        /** Re-evaluasi visibility tombol inspector (mis. saat Hub Scene dipilih). */
        refreshAvailability: function () { refreshInspectorToggle(); },

        /** Check if currently inspecting a card */
        get currentCard() { return _currentCard; },
        get isVisible() { return _inspectorVisible; },

        /** Jika card yang sedang di-inspect dihapus, bersihkan inspector */
        deselectIfCard: function (card) {
            if (_currentCard === card) {
                deselectAllCards();
                VNInspector.clear();
            }
        },
    };

    // ==========================================
    // PANEL VISIBILITY
    // ==========================================

    function showPanel() {
        if (!isInspectorAvailable()) {
            refreshInspectorToggle();
            return;
        }
        panel.style.display = 'flex';
        _inspectorVisible = true;
        // Di Hub view, render scene aktif bila ada; bila belum ada, _renderHubScene(null)
        // menampilkan prompt "Pilih Hub Scene di sidebar".
        if (isHubView()) {
            _renderHubScene(window.activeHubSceneId);
        }
    }

    // ==========================================
    // HUB SCENE INSPECTOR (Fase 7)
    // Render properti scene; field detail dibangun oleh hubEditor.renderHubSceneInspector.
    // ==========================================
    function _renderHubScene(sceneId) {
        _currentCard = null;
        _currentContext = 'hub';
        contextLabel.textContent = 'Hub Scene Inspector';

        if (!sceneId || typeof window.renderHubSceneInspector !== 'function') {
            inspectorFields.innerHTML = '';
            inspectorFields.style.display = 'none';
            inspectorEmpty.style.display = 'block';
            inspectorEmpty.textContent = 'Pilih Hub Scene di sidebar untuk mengubah propertinya.';
            return;
        }

        inspectorEmpty.style.display = 'none';
        inspectorFields.style.display = 'block';
        inspectorFields.innerHTML = '';
        window.renderHubSceneInspector(sceneId, inspectorFields);
    }

    function hidePanel() {
        panel.style.display = 'none';
        _inspectorVisible = false;
    }

    function isScriptInspectorContext() {
        var overlay = document.getElementById('script-editor-overlay');
        if (!overlay || overlay.style.display === 'none') return false;
        if (!window.currentlyEditing || !currentlyEditing.chapter) return false;

        var activeTab = document.querySelector('.sidebar-tab.active');
        if (!activeTab || activeTab.dataset.tab !== 'story') return false;

        return !window.VN || !VN.Workspace || VN.Workspace.current === 'script';
    }

    // Sedang berada di workspace Hub (tab Novel > Hub) — terlepas dari apakah ada
    // scene yang dipilih. Dipakai untuk KETERSEDIAAN tombol Inspector agar pengguna
    // selalu bisa membuka panel lalu memilih scene.
    function isHubView() {
        var overlay = document.getElementById('script-editor-overlay');
        if (!overlay || overlay.style.display === 'none') return false;
        return !!(window.VN && VN.Workspace && VN.Workspace.current === 'hub');
    }

    // Konteks Hub dengan scene aktif — dipakai untuk memutuskan apakah ada properti
    // scene yang bisa dirender (vs. menampilkan prompt "pilih scene").
    function isHubInspectorContext() {
        return isHubView() && !!window.activeHubSceneId;
    }

    function isInspectorAvailable() {
        // Di Hub, tombol selalu tersedia agar inspect scene konsisten bisa dibuka;
        // panel akan menuntun memilih scene bila belum ada yang dipilih.
        return isScriptInspectorContext() || isHubView();
    }

    function refreshInspectorToggle() {
        if (!toggleBtn) return;
        var available = isInspectorAvailable();
        toggleBtn.style.display = available ? 'inline-flex' : 'none';
        toggleBtn.disabled = !available;
        toggleBtn.setAttribute('aria-hidden', available ? 'false' : 'true');

        if (!available) {
            hidePanel();
        }
    }

    closeBtn.addEventListener('click', function () {
        hidePanel();
        deselectAllCards();
        // Menutup = "jangan buka sendiri lagi". Panel yang muncul kembali tiap
        // kali orang masuk Hub, padahal barusan ditutup, adalah panel yang tidak
        // mendengarkan.
        catatPreferensiBuka(false);
    });

    // ==========================================
    // ENTRY CARD SELECTION
    // ==========================================

    // Event delegation: klik pada .dialogue-entry-card → select & inspect
    document.getElementById('script-editor-area').addEventListener('click', function (e) {
        // Jangan intercept klik pada input, button, select, textarea, label
        var tag = e.target.tagName;
        if (tag === 'INPUT' || tag === 'BUTTON' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'LABEL' || tag === 'OPTION') return;
        // Jangan intercept klik pada drag handle, audio controls, tombol aksi
        if (e.target.closest('.drag-handle, .audio-preview-container, .chapter-edit-actions, .delete-dialogue-btn, .clone-dialogue-btn, .preview-entry-btn, .choice-option-editor, .add-choice-option-btn, .entry-condition-container, .condition-builder, .special-event-form, .toggle-special-event-btn')) return;

        var card = e.target.closest('.dialogue-entry-card');
        if (!card) return;

        // Toggle selection
        if (_currentCard === card) return; // Sudah selected

        deselectAllCards();
        card.classList.add('inspector-selected');
        VNInspector.inspectCard(card);
    });

    function deselectAllCards() {
        document.querySelectorAll('.dialogue-entry-card.inspector-selected').forEach(function (c) {
            c.classList.remove('inspector-selected');
        });
    }

    // ==========================================
    // FIELD RENDERING — Schema-Driven
    // ==========================================

    function renderFieldsForEntry(card, type, typeDef) {
        inspectorFields.innerHTML = '';
        inspectorEmpty.style.display = 'none';
        inspectorFields.style.display = 'block';

        // Collect semua field yang berlaku (termasuk inherited)
        var fields = typeDef.fields || [];

        // Group fields
        var grouped = {};
        FIELD_GROUPS.forEach(function (g) { grouped[g] = []; });
        grouped['Lainnya'] = [];

        fields.forEach(function (field) {
            var ui = FIELD_UI[field.key];
            var groupName = (ui && ui.group) ? ui.group : 'Lainnya';
            if (!grouped[groupName]) grouped[groupName] = [];
            grouped[groupName].push(field);
        });

        // Render groups with collapsible headers
        var groupNames = FIELD_GROUPS.concat(['Lainnya']);
        groupNames.forEach(function (groupName) {
            var groupFields = grouped[groupName];
            if (!groupFields || groupFields.length === 0) return;

            // Filter fields: check if relevant (dependency, sceneType)
            var relevantFields = groupFields.filter(function (field) {
                return isFieldRelevant(field, card);
            });
            if (relevantFields.length === 0) return;

            var section = document.createElement('div');
            section.className = 'inspector-group';

            var header = document.createElement('div');
            header.className = 'inspector-group-header';
            header.dataset.group = groupName;
            var collapsed = _collapsedGroups[groupName] || false;
            header.innerHTML = '<span class="inspector-group-arrow">' + (collapsed ? '▶' : '▼') + '</span> ' + groupName;
            header.addEventListener('click', function () {
                var isCollapsed = !_collapsedGroups[groupName];
                _collapsedGroups[groupName] = isCollapsed;
                content.style.display = isCollapsed ? 'none' : 'block';
                header.querySelector('.inspector-group-arrow').textContent = isCollapsed ? '▶' : '▼';
                try { localStorage.setItem('vn_inspector_collapsed', JSON.stringify(_collapsedGroups)); } catch (e) {}
            });

            var content = document.createElement('div');
            content.className = 'inspector-group-content';
            content.style.display = collapsed ? 'none' : 'block';

            relevantFields.forEach(function (field) {
                var fieldEl = renderField(field, card);
                if (fieldEl) content.appendChild(fieldEl);
            });

            section.appendChild(header);
            section.appendChild(content);
            inspectorFields.appendChild(section);
        });

        // Condition indicator
        if (typeDef.canHaveCondition) {
            var condSection = renderConditionSummary(card);
            if (condSection) inspectorFields.appendChild(condSection);
        }

        // Special event indicator
        if (typeDef.canHaveSpecialEvent) {
            var evtSection = renderSpecialEventSummary(card);
            if (evtSection) inspectorFields.appendChild(evtSection);
        }
    }

    // ==========================================
    // SINGLE FIELD RENDERER
    // ==========================================

    function renderField(field, card) {
        var ui = FIELD_UI[field.key] || { label: field.key, inputType: 'text', group: 'Lainnya' };
        var cardInput = card.querySelector('[data-key="' + field.key + '"]');
        var currentVal = cardInput ? (cardInput.type === 'checkbox' ? cardInput.checked : cardInput.value) : '';

        var row = document.createElement('div');
        row.className = 'inspector-field';

        var label = document.createElement('label');
        label.className = 'inspector-field-label';
        label.textContent = ui.label;
        row.appendChild(label);

        var input;

        switch (ui.inputType) {
            case 'text':
                input = document.createElement('input');
                input.type = 'text';
                input.className = 'inspector-input';
                input.dataset.inspectorKey = field.key;
                input.value = currentVal || '';
                if (ui.placeholder) input.placeholder = ui.placeholder;
                input.addEventListener('input', syncToCard(card, field.key));
                break;

            case 'textarea':
                input = document.createElement('textarea');
                input.className = 'inspector-input inspector-textarea';
                input.dataset.inspectorKey = field.key;
                input.value = currentVal || '';
                input.rows = 3;
                if (ui.placeholder) input.placeholder = ui.placeholder;
                input.addEventListener('input', syncToCard(card, field.key));
                break;

            case 'number':
                input = document.createElement('input');
                input.type = 'number';
                input.className = 'inspector-input';
                input.dataset.inspectorKey = field.key;
                input.value = currentVal || '';
                if (ui.step) input.step = ui.step;
                input.addEventListener('input', syncToCard(card, field.key));
                if (ui.unit) {
                    var wrap = document.createElement('div');
                    wrap.className = 'inspector-input-unit-wrap';
                    wrap.appendChild(input);
                    var unitSpan = document.createElement('span');
                    unitSpan.className = 'inspector-unit';
                    unitSpan.textContent = ui.unit;
                    wrap.appendChild(unitSpan);
                    row.appendChild(label);
                    row.appendChild(wrap);
                    return row;
                }
                break;

            case 'slider':
                var sliderWrap = document.createElement('div');
                sliderWrap.className = 'inspector-slider-wrap';
                input = document.createElement('input');
                input.type = 'range';
                input.className = 'inspector-slider';
                input.dataset.inspectorKey = field.key;
                input.min = ui.min !== undefined ? ui.min : 0;
                input.max = ui.max !== undefined ? ui.max : 100;
                input.step = ui.step !== undefined ? ui.step : 1;
                input.value = (currentVal !== undefined && currentVal !== '' && currentVal !== null) ? currentVal : input.min;
                var valDisplay = document.createElement('span');
                valDisplay.className = 'inspector-slider-val';
                valDisplay.textContent = input.value + (ui.unit || '');
                input.addEventListener('input', function () {
                    valDisplay.textContent = input.value + (ui.unit || '');
                    syncToCard(card, field.key)(null, input.value);
                });
                sliderWrap.appendChild(input);
                sliderWrap.appendChild(valDisplay);
                row.appendChild(label);
                row.appendChild(sliderWrap);
                return row;

            // Posisi X (G2 irisan a): DUA kontrol untuk satu kunci JSON — dropdown nama
            // panggung + slider persen. Dirender bersama supaya Inspector tak kehilangan
            // slider yang sudah ada, DAN tak menampilkan slider yang diabaikan kolektor
            // saat sebuah nama aktif (kelas §A). Kunci angka di kartu = `<key>-num`.
            case 'position':
                var posWrap = document.createElement('div');
                posWrap.className = 'inspector-slider-wrap';

                var posSel = document.createElement('select');
                posSel.className = 'inspector-input inspector-select';
                posSel.dataset.inspectorKey = field.key;
                populateSelect(posSel, resolveOptions(ui.options), currentVal);

                var posNumInput = card.querySelector('[data-key="' + field.key + '-num"]');
                var posSlider = document.createElement('input');
                posSlider.type = 'range';
                posSlider.className = 'inspector-slider';
                posSlider.dataset.inspectorKey = field.key + '-num';
                posSlider.min = ui.min !== undefined ? ui.min : 0;
                posSlider.max = ui.max !== undefined ? ui.max : 100;
                posSlider.step = ui.step !== undefined ? ui.step : 1;
                posSlider.value = posNumInput ? posNumInput.value : posSlider.min;

                var posVal = document.createElement('span');
                posVal.className = 'inspector-slider-val';
                posVal.textContent = posSlider.value + (ui.unit || '');

                var posSinkron = function () {
                    var pakaiNama = !!String(posSel.value || '').trim();
                    posSlider.disabled = pakaiNama;
                    posVal.style.opacity = pakaiNama ? '0.4' : '';
                };
                posSel.addEventListener('change', function () {
                    syncToCard(card, field.key)(null, posSel.value);
                    posSinkron();
                });
                posSlider.addEventListener('input', function () {
                    posVal.textContent = posSlider.value + (ui.unit || '');
                    syncToCard(card, field.key + '-num')(null, posSlider.value);
                });
                posSinkron();

                posWrap.appendChild(posSlider);
                posWrap.appendChild(posVal);
                row.appendChild(label);
                row.appendChild(posSel);
                row.appendChild(posWrap);
                return row;

            case 'checkbox':
                input = document.createElement('input');
                input.type = 'checkbox';
                input.className = 'inspector-checkbox';
                input.dataset.inspectorKey = field.key;
                input.checked = !!currentVal;
                input.addEventListener('change', function () {
                    if (cardInput) {
                        cardInput.checked = input.checked;
                        cardInput.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                });
                // Checkbox layout: label di samping
                var checkRow = document.createElement('div');
                checkRow.className = 'inspector-field inspector-check-row';
                checkRow.appendChild(input);
                checkRow.appendChild(label);
                return checkRow;

            case 'select':
                input = document.createElement('select');
                input.className = 'inspector-input inspector-select';
                input.dataset.inspectorKey = field.key;
                var opts = resolveOptions(ui.options);
                populateSelect(input, opts, currentVal);
                input.addEventListener('change', syncToCard(card, field.key));
                break;

            case 'file':
                input = document.createElement('input');
                input.type = 'text';
                input.className = 'inspector-input inspector-file-input';
                input.dataset.inspectorKey = field.key;
                input.value = currentVal || '';
                input.placeholder = 'nama-file.ext';
                input.readOnly = true;
                // Show current filename
                if (currentVal) {
                    input.title = currentVal;
                }
                break;

            // Chroma key tersimpan sebagai satu objek JSON, tetapi editor kartu
            // sengaja memecahnya menjadi tiga input kecil agar nyaman dipakai.
            // Inspector harus memakai input yang sama, bukan sebuah field teks
            // semu yang tak pernah dibaca extractor.
            case 'chroma-key':
                var chromaEnabledKey = field.key + 'Enabled';
                var chromaColorKey = field.key + 'Color';
                var chromaToleranceKey = field.key + 'Tolerance';
                var chromaEnabled = card.querySelector('[data-key="' + chromaEnabledKey + '"]');
                var chromaColor = card.querySelector('[data-key="' + chromaColorKey + '"]');
                var chromaTolerance = card.querySelector('[data-key="' + chromaToleranceKey + '"]');
                var chromaWrap = document.createElement('div');
                chromaWrap.className = 'inspector-chroma-wrap';

                var chromaToggleLabel = document.createElement('label');
                chromaToggleLabel.className = 'inspector-check-row';
                var chromaToggle = document.createElement('input');
                chromaToggle.type = 'checkbox';
                chromaToggle.className = 'inspector-checkbox';
                chromaToggle.dataset.inspectorKey = chromaEnabledKey;
                chromaToggle.checked = !!(chromaEnabled && chromaEnabled.checked);
                chromaToggleLabel.appendChild(chromaToggle);
                chromaToggleLabel.appendChild(document.createTextNode(' Aktif'));

                var chromaOptions = document.createElement('div');
                chromaOptions.className = 'inspector-chroma-options';
                var chromaColorInput = document.createElement('input');
                chromaColorInput.type = 'color';
                chromaColorInput.dataset.inspectorKey = chromaColorKey;
                chromaColorInput.value = (chromaColor && chromaColor.value) || '#00ff00';
                var chromaToleranceInput = document.createElement('input');
                chromaToleranceInput.type = 'number';
                chromaToleranceInput.className = 'inspector-input';
                chromaToleranceInput.min = 0;
                chromaToleranceInput.max = 255;
                chromaToleranceInput.step = 1;
                chromaToleranceInput.dataset.inspectorKey = chromaToleranceKey;
                chromaToleranceInput.value = (chromaTolerance && chromaTolerance.value) || '45';
                chromaOptions.appendChild(chromaColorInput);
                chromaOptions.appendChild(chromaToleranceInput);

                var setCardChroma = function (cardControl, value, eventName) {
                    if (!cardControl) return;
                    if (cardControl.type === 'checkbox') cardControl.checked = !!value;
                    else cardControl.value = value;
                    cardControl.dispatchEvent(new Event(eventName || 'input', { bubbles: true }));
                };
                var refreshChromaOptions = function () {
                    chromaOptions.style.display = chromaToggle.checked ? 'grid' : 'none';
                };
                chromaToggle.addEventListener('change', function () {
                    setCardChroma(chromaEnabled, chromaToggle.checked, 'change');
                    refreshChromaOptions();
                });
                chromaColorInput.addEventListener('input', function () {
                    setCardChroma(chromaColor, chromaColorInput.value);
                });
                chromaToleranceInput.addEventListener('input', function () {
                    setCardChroma(chromaTolerance, chromaToleranceInput.value);
                });
                refreshChromaOptions();
                chromaWrap.appendChild(chromaToggleLabel);
                chromaWrap.appendChild(chromaOptions);
                row.appendChild(chromaWrap);
                return row;

            default:
                input = document.createElement('input');
                input.type = 'text';
                input.className = 'inspector-input';
                input.value = currentVal || '';
                input.addEventListener('input', syncToCard(card, field.key));
        }

        if (input) row.appendChild(input);
        return row;
    }

    // ==========================================
    // SYNC: Inspector → Card
    // ==========================================

    function syncToCard(card, key) {
        return function (e, forcedValue) {
            if (!card.isConnected) return;
            var cardInput = card.querySelector('[data-key="' + key + '"]');
            if (!cardInput) return;
            var val = forcedValue !== undefined ? forcedValue : (e && e.target ? e.target.value : '');
            cardInput.value = val;
            cardInput.dispatchEvent(new Event('input', { bubbles: true }));

            // Re-render inspector if this field is a dependency for other fields
            if (key === 'sceneType' || _isDependencyKey(key)) {
                VNInspector.inspectCard(card);
            }
        };
    }

    /** Check if any field depends on this key */
    function _isDependencyKey(key) {
        if (!_currentCard) return false;
        var type = _currentCard.dataset.type;
        var typeDef = VN.NodeRegistry.get(type);
        if (!typeDef || !typeDef.fields) return false;
        return typeDef.fields.some(function (f) {
            return f.dependsOn === key || f.dependsOnChecked === key;
        });
    }

    // ==========================================
    // FIELD RELEVANCE CHECK
    // ==========================================

    function isFieldRelevant(field, card) {
        // sceneType filter
        if (field.sceneType) {
            var sceneTypeInput = card.querySelector('[data-key="sceneType"]');
            if (sceneTypeInput && sceneTypeInput.value !== field.sceneType) return false;
        }

        // dependsOn: field hanya relevan jika parent field punya value
        if (field.dependsOn) {
            var depInput = card.querySelector('[data-key="' + field.dependsOn + '"]');
            if (!depInput) return false;
            if (depInput.type === 'checkbox') {
                if (!depInput.checked) return false;
            } else {
                if (depInput.value === '' || depInput.value == null) return false;
            }
        }

        // dependsOnChecked: field hanya relevan jika checkbox parent terceklis
        if (field.dependsOnChecked) {
            var checkInput = card.querySelector('[data-key="' + field.dependsOnChecked + '"]');
            if (!checkInput || !checkInput.checked) return false;
        }

        return true;
    }

    // ==========================================
    // OPTION RESOLVERS
    // ==========================================

    function resolveOptions(optRef) {
        if (!optRef) return [];
        if (Array.isArray(optRef)) return optRef; // Already array of {value, label}
        if (typeof optRef === 'string' && _C[optRef]) return _C[optRef];
        return [];
    }

    function populateSelect(selectEl, options, selectedVal) {
        selectEl.innerHTML = '';
        // Inspektur adalah penulis KEDUA untuk dropdown yang sama (kartu entri
        // memakai optionsToHTML). Aturan "pertahankan + tandai" karena itu diambil
        // dari rumah bersama, bukan disalin — kalau tidak, inspektur akan tetap
        // menimpa nilai kreator yang baru saja diselamatkan di kartu.
        _C.withUnknownOption(options, selectedVal).forEach(function (opt) {
            function _mk(o) {
                var el = document.createElement('option');
                el.value = o.value;
                el.textContent = o.label;
                if (o.title) el.title = o.title;
                if (o.value === selectedVal) el.selected = true;
                return el;
            }
            if (opt.group && opt.items) {
                var optgroup = document.createElement('optgroup');
                optgroup.label = opt.group;
                opt.items.forEach(function (item) { optgroup.appendChild(_mk(item)); });
                selectEl.appendChild(optgroup);
            } else {
                selectEl.appendChild(_mk(opt));
            }
        });
    }

    // ==========================================
    // CONDITION & SPECIAL EVENT SUMMARIES
    // ==========================================

    function renderConditionSummary(card) {
        var toggle = card.querySelector('.toggle-condition');
        if (!toggle || !toggle.checked) return null;

        var section = document.createElement('div');
        section.className = 'inspector-group inspector-summary-group';

        var header = document.createElement('div');
        header.className = 'inspector-group-header inspector-info-header';
        header.innerHTML = '<span class="inspector-group-arrow">ℹ</span> Kondisi Aktif';

        var content = document.createElement('div');
        content.className = 'inspector-group-content';

        // Condition Builder v2: serialize builder entry-level → teks ringkas yang
        // akurat termasuk kombinator AND/OR/NOT bertingkat (ConditionUI.describe).
        var condContainer = card.querySelector('.entry-condition-container');
        var CondUI = VN.NodeRegistry.ConditionUI;
        if (condContainer && CondUI) {
            var p = document.createElement('div');
            p.className = 'inspector-condition-row';
            if (condContainer.dataset.condMode === 'raw') {
                p.textContent = 'Kondisi kompleks — dipertahankan apa adanya (edit via script.json).';
            } else {
                var cond = CondUI.serialize(condContainer.querySelector('.condition-builder'));
                p.textContent = cond ? CondUI.describe(cond) : 'Kondisi aktif tapi kosong';
            }
            content.appendChild(p);
        } else {
            // Fallback DOM lama: baris flat langsung di card (di luar opsi choice).
            var rows = card.querySelectorAll('.condition-row');
            if (rows.length === 0) {
                content.innerHTML = '<p class="inspector-hint">Kondisi aktif tapi kosong</p>';
            } else {
                rows.forEach(function (row) {
                    if (row.closest('.choice-option-editor')) return;
                    var varName = row.querySelector('.condition-var');
                    var op = row.querySelector('.condition-op');
                    var val = row.querySelector('.condition-value');
                    if (varName && op && val) {
                        var valStr = val.value || '?';
                        var typeHint = isNaN(valStr) ? ' (string)' : ' (number)';
                        var rowP = document.createElement('div');
                        rowP.className = 'inspector-condition-row';
                        rowP.textContent = (varName.value || '?') + ' ' + (op.value || '==') + ' ' + valStr + typeHint;
                        content.appendChild(rowP);
                    }
                });
            }
        }

        section.appendChild(header);
        section.appendChild(content);
        return section;
    }

    function renderSpecialEventSummary(card) {
        var form = card.querySelector('.special-event-form');
        if (!form || form.style.display === 'none') return null;

        var typeSelect = form.querySelector('.special-event-type');
        if (!typeSelect || !typeSelect.value) return null;

        var section = document.createElement('div');
        section.className = 'inspector-group inspector-summary-group';

        var header = document.createElement('div');
        header.className = 'inspector-group-header inspector-info-header';
        header.innerHTML = '<span class="inspector-group-arrow">⚡</span> Special Event';

        var content = document.createElement('div');
        content.className = 'inspector-group-content';

        var info = document.createElement('div');
        info.className = 'inspector-event-info';
        info.innerHTML = '<strong>' + typeSelect.value + '</strong>';

        var dur = form.querySelector('.special-event-duration');
        if (dur && dur.value) info.innerHTML += '<br>Durasi: ' + dur.value + 'ms';

        var intensity = form.querySelector('.special-event-intensity');
        if (intensity && intensity.value) info.innerHTML += '<br>Intensitas: ' + intensity.value;

        content.appendChild(info);
        section.appendChild(header);
        section.appendChild(content);
        return section;
    }

    // ==========================================
    // CONTEXT SWITCHING — View change listener
    // ==========================================

    VN.Events.on('workspace:viewChanged', function (data) {
        if (data.to === 'script') {
            // Tetap tampilkan inspector jika ada card terpilih
            if (!_currentCard) {
                VNInspector.clear();
            }
        } else if (data.to === 'hub') {
            if (_inspectorVisible && isHubView()) {
                _renderHubScene(window.activeHubSceneId);
            } else {
                VNInspector.clear();
                contextLabel.textContent = 'Hub Scene Inspector';
            }
        } else if (data.to === 'player') {
            VNInspector.clear();
            contextLabel.textContent = '🎮 Player — Edit profil di panel utama';
        } else {
            VNInspector.clear();
        }
        refreshInspectorToggle();
    });

    // Hub Scene dipilih/diganti → render di inspector jika sedang tampil.
    VN.Events.on('hub:activeSceneChanged', function (data) {
        refreshInspectorToggle();
        if (_inspectorVisible && isHubInspectorContext()) {
            _renderHubScene(data && data.sceneId);
        }
    });

    VN.Events.on('editing:changed', function (data) {
        if (!data || data.property !== 'chapter') return;
        if (!data.newValue || !_currentCard || !_currentCard.isConnected) {
            deselectAllCards();
            VNInspector.clear();
        }
        refreshInspectorToggle();
    });

    // ==========================================
    // KEYBOARD: Escape to deselect
    // ==========================================

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && _currentCard) {
            deselectAllCards();
            VNInspector.clear();
        }
    });

    // ==========================================
    // TOOLBAR TOGGLE BUTTON
    // ==========================================

    // Cari atau buat tombol toggle inspector di toolbar
    var toolbar = document.getElementById('workspace-toolbar');
    if (toolbar) {
        var toolbarRight = toolbar.querySelector('.toolbar-right');
        if (toolbarRight) {
            toggleBtn = document.createElement('button');
            toggleBtn.id = 'toggle-inspector-btn';
            toggleBtn.className = 'toolbar-btn';
            toggleBtn.title = 'Toggle Inspector Panel (I)';
            toggleBtn.textContent = '🔍 Inspector';
            toggleBtn.addEventListener('click', function () {
                VNInspector.toggle();
            });
            toolbarRight.appendChild(toggleBtn);
            refreshInspectorToggle();
        }
    }

    // Pindah view: segarkan ketersediaan tombol, lalu buka sendiri di Hub.
    //
    // VN Player sengaja TIDAK ikut. Inspector tak punya konteks player sama
    // sekali (isInspectorAvailable hanya mengenal script & hub), jadi membukanya
    // di sana cuma memunculkan kotak kosong yang memakan lebar kanvas — dan
    // seluruh properti VN Player memang sudah punya rumah di kanvasnya sendiri.
    if (window.VN && VN.Events && typeof VN.Events.on === 'function') {
        VN.Events.on('workspace:viewChanged', function (data) {
            refreshInspectorToggle();
            if (!data || data.to !== 'hub') return;
            if (!bukaOtomatisDiizinkan()) return;
            showPanel();
        });
    }

    // Keyboard shortcut: I to toggle inspector (saat tidak focus pada input)
    document.addEventListener('keydown', function (e) {
        if (e.key === 'i' && !e.ctrlKey && !e.altKey && !e.metaKey) {
            var active = document.activeElement;
            if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) return;
            if (!isInspectorAvailable()) return;
            VNInspector.toggle();
        }
    });

    // ==========================================
    // REVERSE SYNC: Card → Inspector
    // Saat user edit langsung di card, update inspector fields
    // ==========================================
    document.getElementById('script-editor-area').addEventListener('input', function (e) {
        if (!_currentCard) return;
        if (!_currentCard.contains(e.target)) return;
        var key = e.target.dataset && e.target.dataset.key;
        if (!key) return;
        // Cari inspector input yg sesuai lalu update nilainya
        var inspField = inspectorFields.querySelector('[data-inspector-key="' + key + '"]');
        if (inspField) {
            if (inspField.type === 'checkbox') {
                inspField.checked = e.target.checked;
            } else {
                inspField.value = e.target.value;
            }
        }
        // Re-evaluate dependsOn: jika field ini menjadi dependsOn field lain, re-render
        var type = _currentCard.dataset.type;
        var typeDef = VN.NodeRegistry.get(type);
        if (typeDef) {
            var hasDep = (typeDef.fields || []).some(function (f) {
                return f.dependsOn === key || f.dependsOnChecked === key || f.sceneType;
            });
            if (hasDep) {
                renderFieldsForEntry(_currentCard, type, typeDef);
            }
        }
    });

    console.log('[VN Inspector] Module dimuat.');
})();
