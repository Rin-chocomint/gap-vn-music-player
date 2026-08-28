        // ------------------- Visualization Flow Logic ------------------- //
        let cyInstance = null;
        let vizMode = 'detail'; // 'detail' atau 'summary'
        let vizInitTimer = null;
        let vizGeneration = 0;
        let vizReturnFocus = null;

        function closeFlowVisualization() {
            vizGeneration++;
            clearTimeout(vizInitTimer);
            vizInitTimer = null;
            if (typeof initCytoscape._cleanupRuntime === 'function') {
                try { initCytoscape._cleanupRuntime(); } catch (e) {
                    console.warn('[Visualisasi] Cleanup UI graf gagal:', e);
                }
                initCytoscape._cleanupRuntime = null;
            }
            if (typeof initCytoscape._cleanupDocListeners === 'function') {
                initCytoscape._cleanupDocListeners();
                initCytoscape._cleanupDocListeners = null;
            }
            if (cyInstance) {
                try { cyInstance.destroy(); } catch (e) {
                    console.warn('[Visualisasi] Gagal membongkar Cytoscape:', e);
                }
                cyInstance = null;
            }
            const container = document.getElementById('cy');
            if (container) container.replaceChildren();
            document.getElementById('flow-visualization-modal')?.classList.remove('visible');
            const returnFocus = vizReturnFocus;
            vizReturnFocus = null;
            if (returnFocus && returnFocus.isConnected && typeof returnFocus.focus === 'function') {
                setTimeout(function () { returnFocus.focus(); }, 0);
            }
        }
        window.closeFlowVisualization = closeFlowVisualization;

        window.visualisasiAlur = function (mode) {
            const largeScript = !!window._vnEditorCompactMode;
            const requestedMode = mode || (largeScript ? 'summary' : 'detail');
            // Detail membuat satu node Cytoscape untuk hampir setiap entri. Pada
            // chapter besar itu hanya memindahkan risiko OOM dari kanvas ke graf.
            mode = largeScript && requestedMode === 'detail' ? 'summary' : requestedMode;
            console.log("[Visualisasi] Fungsi dipanggil. Mode:", mode);
            vizMode = mode;

            if (!currentlyEditing.novel || !currentlyEditing.chapter) {
                console.warn("[Visualisasi] Chapter belum dipilih.");
                showNotification('Buka editor chapter terlebih dahulu.', 'error');
                return;
            }

            const flowModal = document.getElementById('flow-visualization-modal');
            if (!flowModal) {
                console.error("[Visualisasi] Modal #flow-visualization-modal tidak ditemukan.");
                return;
            }
            if (flowModal.dataset.closeBound !== 'true') {
                flowModal.dataset.closeBound = 'true';
                flowModal.addEventListener('click', function (event) {
                    if (event.target === flowModal) closeFlowVisualization();
                });
            }

            // Tampilkan modal dengan menambahkan class visible
            vizReturnFocus = document.activeElement;
            flowModal.classList.add('visible');
            const fokusModal = function () {
                if (flowModal.classList.contains('visible')) document.getElementById('close-flow-modal')?.focus();
            };
            if (typeof requestAnimationFrame === 'function') requestAnimationFrame(fokusModal);
            else setTimeout(fokusModal, 0);

            // Update info chapter di header
            const chapterInfo = document.getElementById('viz-chapter-info');
            if (chapterInfo) {
                const safeMode = largeScript
                    ? ` · Ringkasan aman (${Number(window._vnEditorLargeScriptCount || 0).toLocaleString('id-ID')} entri)`
                    : '';
                chapterInfo.textContent = `${currentlyEditing.novel} › ${currentlyEditing.chapter}${safeMode}`;
            }

            console.log("[Visualisasi] Modal ditampilkan. Mulai ekstraksi...");

            try {
                // Pastikan library ada
                if (typeof cytoscape === 'undefined') {
                    throw new Error("Library Cytoscape belum dimuat. Periksa koneksi internet atau path file lokal.");
                }

                console.log("Mengekstrak data grafik...");
                const elements = extractGraphData();
                console.log("[Visualisasi] Data grafik siap:", {
                    mode: vizMode,
                    totalElements: elements.length
                });

                // Init dengan sedikit delay agar layout container modal stabil
                const generation = ++vizGeneration;
                clearTimeout(vizInitTimer);
                vizInitTimer = setTimeout(() => {
                    vizInitTimer = null;
                    if (generation !== vizGeneration || !flowModal.classList.contains('visible')) return;
                    initCytoscape(elements);
                }, 100);

            } catch (e) {
                console.error("[Visualisasi] Error:", e);
                showNotification("Gagal memuat visualisasi: " + e.message, "error");
            }
        };

        function extractGraphData() {
            const nodes = [];
            const edges = [];
            const labelMap = new Map(); // name -> { id, element }
            const subLabelMap = new Map();
            const phaseList = []; // Untuk tracking urutan fase
            let nodeCounter = 0;

            // Mode: 'detail' = tampilkan semua entri, 'summary' = hanya elemen alur
            const isDetailMode = vizMode === 'detail';

            // Helper untuk generate ID unik
            const genId = (prefix) => `${prefix}_${nodeCounter++}`;

            // Helper untuk potong teks panjang
            const truncate = (text, max = 25) => {
                if (!text) return '';
                return text.length > max ? text.substring(0, max) + '...' : text;
            };

            // Node START
            nodes.push({
                data: {
                    id: 'START',
                    label: '▶ MULAI',
                    sublabel: 'Awal Cerita',
                    type: 'start'
                }
            });

            const phaseCards = scriptEditorArea.querySelectorAll('.phase-card');

            // === PASS 1: Collect semua Phase, Label, Sub-Label, dan Entri ===
            phaseCards.forEach((phase, pIdx) => {
                const phaseNameInput = phase.querySelector('.phase-name-input');
                const phaseName = phaseNameInput ? phaseNameInput.value.trim() : `Fase ${pIdx + 1}`;
                const phaseId = genId('phase');
                const phaseContent = phase.querySelector('.phase-content');

                // Cek apakah fase ini adalah ending
                const isEndingCheckbox = phase.querySelector('.is-ending-checkbox');
                const isEnding = isEndingCheckbox ? isEndingCheckbox.checked : false;

                // Node fase (Sebagai Parent/Container)
                nodes.push({
                    data: {
                        id: phaseId,
                        label: isEnding ? `Fase Ending : ${phaseName}` : `Fase : ${phaseName}`,
                        sublabel: isEnding ? 'ENDING' : '',
                        type: 'phase',
                        isEnding: isEnding,
                        element: phase,
                        phaseIndex: pIdx + 1
                    }
                });

                phaseList.push({ id: phaseId, name: phaseName, element: phase, isEnding: isEnding });
                let lastNodeInPhase = phaseId; // Awalnya menunjuk ke container, tapi nanti flow akan dari start ke first child

                // Inisialisasi first node tracker untuk menghubungkan fasa sebelumnya ke node pertama di fasa ini
                let firstNodeInPhase = null;

                // Fungsi helper untuk link flow
                const linkFlow = (source, target, type = 'flow') => {
                    if (source && target) {
                        // Jika source adalah phaseId (container dirinya sendiri), jangan buat edge loopback visual aneh
                        // Logikanya: Flow masuk ke Phase -> menujuk ke First Node
                        edges.push({ data: { source: source, target: target, type: type } });
                    }
                };

                // === Ambil entri langsung di fase (di luar label) ===
                const directEntries = phaseContent ? phaseContent.querySelectorAll(':scope > .dialogue-entry-card') : [];
                directEntries.forEach((entry, eIdx) => {
                    const entryType = entry.getAttribute('data-type');

                    if (!isDetailMode && entryType !== 'choice') return;

                    const entryNode = createEntryNode(entry, entryType, genId, truncate);

                    if (entryNode) {
                        entryNode.data.parent = phaseId; // Set Parent
                        nodes.push(entryNode);

                        if (!firstNodeInPhase) firstNodeInPhase = entryNode.data.id;

                        // Link dari node sebelumnya (kecuali jika node sebelumnya adalah phase itu sendiri)
                        if (lastNodeInPhase && lastNodeInPhase !== phaseId) {
                            linkFlow(lastNodeInPhase, entryNode.data.id);
                        }

                        lastNodeInPhase = entryNode.data.id;

                        if (entryType === 'choice') {
                            processChoiceOptions(entry, entryNode.data.id, phaseId, nodes, edges, genId, truncate, isDetailMode);
                        }
                    }
                });

                // === Ambil semua label dalam fase ini ===
                const labelContainers = phase.querySelectorAll(':scope > .phase-content > .label-group-container');
                let prevLabelLastNode = lastNodeInPhase;

                labelContainers.forEach((labelContainer, lIdx) => {
                    const labelNameInput = labelContainer.querySelector('.label-name-input');
                    const labelName = labelNameInput ? labelNameInput.value.trim() : '';

                    if (!labelName) return;

                    const labelId = genId('label');
                    labelMap.set(labelName, { id: labelId, element: labelContainer, phaseId: phaseId });

                    // Logikanya: Parent label selalu 'phaseId' (Label itu anaknya Phase)
                    // TAPI kalo Mode Detail, Label bakal jadi parent buat konten di dalemnya
                    nodes.push({
                        data: {
                            id: labelId,
                            label: `🏷️ Label : ${labelName}`,
                            sublabel: 'Label',
                            name: labelName,
                            type: 'label',
                            element: labelContainer,
                            parent: phaseId
                        }
                    });

                    if (!firstNodeInPhase) firstNodeInPhase = labelId;

                    if (prevLabelLastNode && prevLabelLastNode !== phaseId) {
                        linkFlow(prevLabelLastNode, labelId, 'label_flow');
                    }

                    // Di Mode Detail, node-node di dalem label ini harus jadi anak (parent-nya 'labelId').
                    // Kalo di Mode Ringkasan, biasanya nggak ditampilin, atau kalo muncul (kayak pilihan?) 
                    // mungkin mending masuk ke Phase atau Label aja.
                    // Permintaannya emang biar Mode Detail pake label sebagai parent.
                    const contentParentId = isDetailMode ? labelId : phaseId;

                    // Buat Mode Detail, alurnya *mulai* dari dalem kotak label.
                    // Mungkin nggak perlu nge-link 'labelId' -> firstContentNode kalo kotaknya udah jelas,
                    // tapi Cytoscape biasanya tetep butuh edge antar node biar alurnya nyambung.
                    // Kita asumsikan alurnya jalan terus secara linear.

                    let lastNodeInLabel = labelId; // Flow point

                    // Scan isi Label
                    const labelContent = labelContainer.querySelector('.label-group-content');
                    if (labelContent) {
                        const labelChildren = Array.from(labelContent.children);
                        labelChildren.forEach(child => {
                            // Sub-Label
                            if (child.classList.contains('sub-label-container')) {
                                const subNameInput = child.querySelector('.sub-label-name-input');
                                const subName = subNameInput ? subNameInput.value.trim() : '';

                                if (subName) {
                                    const subId = genId('sublabel');

                                    // Daftarkan dengan nama pendek
                                    subLabelMap.set(subName, { id: subId, element: child, parentLabel: labelName });

                                    // Daftarkan juga dengan nama lengkap (parentLabel.subName)
                                    // Karena jump target dari choice biasanya menggunakan format lengkap
                                    const fullSubName = `${labelName}.${subName}`;
                                    subLabelMap.set(fullSubName, { id: subId, element: child, parentLabel: labelName });

                                    nodes.push({
                                        data: {
                                            id: subId,
                                            label: `sub-label : ${subName.split('.').pop()}`,
                                            type: 'sublabel',
                                            element: child,
                                            parent: contentParentId
                                        }
                                    });

                                    linkFlow(lastNodeInLabel, subId, 'sublabel_flow');
                                    lastNodeInLabel = subId;

                                    const subContentParentId = isDetailMode ? subId : contentParentId;

                                    const subContent = child.querySelector('.sub-label-content');
                                    if (subContent) {
                                        const subEntries = Array.from(subContent.children);
                                        // Pass the correct parent ID to children
                                        const res = processEntries(subEntries, lastNodeInLabel, subContentParentId, nodes, edges, genId, truncate, isDetailMode);
                                        if (res) lastNodeInLabel = res;
                                    }
                                }
                            }
                            // Direct Dialogue Entry inside Label
                            else if (child.classList.contains('dialogue-entry-card')) {
                                const res = processSingleEntry(child, lastNodeInLabel, contentParentId, nodes, edges, genId, truncate, isDetailMode);
                                if (res) lastNodeInLabel = res;
                            }
                        });
                    }

                    // Jump/Exit logic
                    const jumpTarget = labelContainer.querySelector('.label-jump-target')?.value?.trim();
                    if (jumpTarget && !jumpTarget.startsWith('##')) {
                        edges.push({ data: { source: lastNodeInLabel, target: `pending:${jumpTarget}`, type: 'jump' } });
                    } else if (jumpTarget === '##EXIT_LABEL##') {
                        const exitId = genId('exit');
                        nodes.push({ data: { id: exitId, label: '🚪 KELUAR', type: 'exit', parent: contentParentId } });
                        linkFlow(lastNodeInLabel, exitId, 'exit_flow');
                        lastNodeInLabel = exitId;
                    } else if (jumpTarget === '##FINISH_PARENT##') {
                        // Selesaikan label induk
                        const finishId = genId('finish_parent');
                        nodes.push({ data: { id: finishId, label: '↩ SELESAI INDUK', sublabel: 'Label induk selesai', type: 'cmd_finish', parent: contentParentId } });
                        linkFlow(lastNodeInLabel, finishId, 'finish_flow');
                        lastNodeInLabel = finishId;
                    } else if (jumpTarget === '##CONTINUE_PARENT##') {
                        // Lanjut di label induk
                        const continueId = genId('continue_parent');
                        nodes.push({ data: { id: continueId, label: '⏭ LANJUT INDUK', sublabel: 'Lewati sub-label', type: 'cmd_continue', parent: contentParentId } });
                        linkFlow(lastNodeInLabel, continueId, 'continue_flow');
                        lastNodeInLabel = continueId;
                    }

                    prevLabelLastNode = lastNodeInLabel;
                });

                if (labelContainers.length > 0) {
                    lastNodeInPhase = prevLabelLastNode;
                }

                phaseList[phaseList.length - 1].firstNode = firstNodeInPhase;
                phaseList[phaseList.length - 1].lastNode = lastNodeInPhase;
            });

            // === PASS 2: Connect Phases ===
            for (let i = 0; i < phaseList.length; i++) {
                const currentPhase = phaseList[i];

                // Connect START to First Phase (visual only) or First Node of First Phase
                if (i === 0) {
                    // Prefer connecting to the first node if exists, else the phase box
                    const target = currentPhase.firstNode || currentPhase.id;
                    edges.push({ data: { source: 'START', target: target, type: 'start_flow' } });
                }

                if (i < phaseList.length - 1) {
                    const nextPhase = phaseList[i + 1];
                    const source = currentPhase.lastNode || currentPhase.id;
                    const target = nextPhase.firstNode || nextPhase.id;

                    edges.push({
                        data: { source: source, target: target, type: 'phase_flow' }
                    });
                }
            }

            // === PASS 3: Resolve Jumps ===
            const allLabels = new Map([...labelMap, ...subLabelMap]);

            // Mapping fase by name untuk resolve jump ke fase
            const phaseMap = new Map();
            phaseList.forEach(p => phaseMap.set(p.name, p));

            edges.forEach(edge => {
                if (edge.data.target && edge.data.target.startsWith('pending:')) {
                    const targetName = edge.data.target.replace('pending:', '');

                    // Cek apakah ini jump ke fase lain (pattern: "fase:NamaFase")
                    if (targetName.startsWith('fase:')) {
                        const phaseName = targetName.replace('fase:', '');
                        const targetPhase = phaseMap.get(phaseName);

                        if (targetPhase) {
                            // Fase ditemukan, arahkan ke fase tersebut atau node pertama di fase itu
                            edge.data.target = targetPhase.firstNode || targetPhase.id;
                            edge.data.type = 'phase_jump'; // Tipe khusus untuk jump antar fase
                        } else {
                            // Fase tidak ditemukan di chapter ini, buat node khusus "menuju fase"
                            const jumpToPhaseId = genId('jump_phase');
                            nodes.push({
                                data: {
                                    id: jumpToPhaseId,
                                    label: '🎯 JUMP KE FASE',
                                    sublabel: phaseName,
                                    type: 'jump_phase'
                                }
                            });
                            edge.data.target = jumpToPhaseId;
                        }
                    } else {
                        // Jump ke label/sub-label
                        const targetInfo = allLabels.get(targetName);
                        if (targetInfo) {
                            edge.data.target = targetInfo.id;
                        } else {
                            const missingId = genId('missing');
                            nodes.push({ data: { id: missingId, label: '⚠️ 404', sublabel: targetName, type: 'missing' } });
                            edge.data.target = missingId;
                        }
                    }
                }
            });

            // === PASS 4: End Nodes (Multiple Ending Support) ===
            // Cek semua fase yang merupakan ending dan buat node END untuk masing-masing
            const endingPhases = phaseList.filter(p => p.isEnding);

            if (endingPhases.length > 0) {
                // Ada fase ending, buat node END untuk setiap ending
                endingPhases.forEach((endingPhase, idx) => {
                    const endId = genId('ending');
                    const endingName = endingPhase.name || `Ending ${idx + 1}`;
                    nodes.push({
                        data: {
                            id: endId,
                            label: `ENDING ${idx + 1}`,
                            sublabel: endingName,
                            type: 'ending',
                            endingIndex: idx + 1
                        }
                    });
                    const source = endingPhase.lastNode || endingPhase.id;
                    edges.push({ data: { source: source, target: endId, type: 'ending_flow' } });
                });
            } else {
                // Tidak ada ending khusus, gunakan fase terakhir sebagai akhir
                const lastPhase = phaseList[phaseList.length - 1];
                if (lastPhase) {
                    const endId = genId('end');
                    nodes.push({ data: { id: endId, label: '⏹ SELESAI', type: 'end' } });
                    const source = lastPhase.lastNode || lastPhase.id;
                    edges.push({ data: { source: source, target: endId, type: 'end_flow' } });
                }
            }

            return [...nodes, ...edges];
        }

        // processEntries
        function processEntries(entryElements, startNodeId, phaseId, nodes, edges, genId, truncate, isDetailMode) {
            let lastId = startNodeId;
            entryElements.forEach(el => {
                if (el.classList.contains('dialogue-entry-card')) {
                    const res = processSingleEntry(el, lastId, phaseId, nodes, edges, genId, truncate, isDetailMode);
                    if (res) lastId = res;
                }
            });
            return lastId;
        }

        function readCompactEntry(entry) {
            if (!entry || !entry.dataset || !entry.dataset.rawEntry) return {};
            try {
                const parsed = JSON.parse(entry.dataset.rawEntry);
                return parsed && typeof parsed === 'object' ? parsed : {};
            } catch (e) {
                return {};
            }
        }

        // processSingleEntry
        function processSingleEntry(entry, prevNodeId, phaseId, nodes, edges, genId, truncate, isDetailMode) {
            const entryType = entry.getAttribute('data-type');
            if (!isDetailMode && entryType !== 'choice') return prevNodeId;

            const entryNode = createEntryNode(entry, entryType, genId, truncate);
            if (entryNode) {
                entryNode.data.parent = phaseId;
                nodes.push(entryNode);

                if (prevNodeId) {
                    edges.push({ data: { source: prevNodeId, target: entryNode.data.id, type: 'flow' } });
                }

                if (entryType === 'choice') {
                    processChoiceOptions(entry, entryNode.data.id, phaseId, nodes, edges, genId, truncate, isDetailMode);
                    return null; // Branching ends linear flow locally
                }
                return entryNode.data.id;
            }
            return prevNodeId;
        }

        // Helper: Buat node untuk entri (dialog, scene, choice, dll)
        function createEntryNode(entry, entryType, genId, truncate) {
            const entryId = genId(entryType);
            const rawEntry = readCompactEntry(entry);

            const getVal = (key) => {
                const el = entry.querySelector(`.script-input[data-key="${key}"]`);
                if (el) return String(el.value || '').trim();
                const rawValue = rawEntry[key];
                return rawValue === null || rawValue === undefined ? '' : String(rawValue).trim();
            };

            const specialTypeVal = entry.querySelector('.special-event-type')?.value ||
                (rawEntry.specialEvent && rawEntry.specialEvent.type) || '';
            const hasSpecialEvent = specialTypeVal && specialTypeVal !== '';
            const specialIcon = hasSpecialEvent ? '⚡' : '';

            const hasVoice = getVal('voice') !== '';
            const hasSFX = getVal('sfx') !== '' || getVal('sfxIn') !== '' || getVal('sfxOut') !== '';
            const hasBGM = getVal('bgm') !== '';

            let audioIcons = [];
            if (hasVoice) audioIcons.push('🗣️');
            if (hasSFX) audioIcons.push('🔊');
            if (hasBGM) audioIcons.push('🎵');
            const audioStr = audioIcons.join(' ');

            let label = 'ENTRI';
            let sublabel = '';

            switch (entryType) {
                case 'dialogue':
                    const speaker = getVal('speaker') || 'Narator';
                    const text = getVal('text');
                    label = `💬 ${speaker}`;
                    sublabel = `"${truncate(text, 30)}"`;
                    if (hasSpecialEvent) sublabel += `\n${specialIcon} Efek: ${specialTypeVal}`;
                    if (audioStr) sublabel += `\n${audioStr}`;
                    break;

                case 'scene':
                    const sceneTypeVal = entry.querySelector('.scene-type-selector');
                    const sceneType = sceneTypeVal ? sceneTypeVal.value : (rawEntry.sceneType || 'image');
                    let bgName = '';
                    if (sceneType === 'image') bgName = getVal('background');
                    else if (sceneType === 'video') bgName = getVal('video');
                    else if (sceneType === 'text_screen') bgName = getVal('text');

                    const transition = entry.querySelector('.scene-transition-selector')?.value || rawEntry.transition || 'cut';

                    label = sceneType === 'video' ? '🎬 VIDEO' : (sceneType === 'text_screen' ? '📝 TEKS' : '🖼️ SCENE');
                    sublabel = `File: ${truncate(bgName, 20)}\nTransisi: ${transition}`;
                    if (hasBGM) sublabel += `\n🎵 BGM Baru`;
                    break;

                case 'choice':
                    label = '❓ PILIHAN';
                    const qText = getVal('text');
                    sublabel = qText ? `"${truncate(qText, 30)}"` : 'Pilih jawaban...';
                    break;

                default:
                    label = entryType.toUpperCase();
            }

            return {
                data: {
                    id: entryId,
                    label: label,
                    sublabel: sublabel,
                    type: entryType,
                    hasSpecial: hasSpecialEvent,
                    element: entry
                }
            };
        }

        function processChoiceOptions(choiceEntry, choiceId, phaseId, nodes, edges, genId, truncate, isDetailMode) {
            // Baris opsi yang teksnya KOSONG dilewati — aturan yang sama persis
            // dengan `_extractChoices` (`if (!text) return;`), dan harus sama.
            //
            // Graf ini membaca DOM, bukan berkas, supaya suntingan yang belum
            // disimpan ikut terlihat. Tapi baris kosong bukan suntingan: sejak
            // kartu choice lahir dengan dua baris benih, membacanya apa adanya
            // akan menggambar dua cabang untuk SETIAP choice yang belum diisi —
            // cabang yang tak akan pernah ada di berkas. Graf yang tak sepakat
            // dengan berkasnya lebih buruk daripada graf yang kurang lengkap.
            const optionEditors = choiceEntry.querySelectorAll('.choice-option-editor');
            const rawChoices = readCompactEntry(choiceEntry).choices;
            const options = optionEditors.length
                ? Array.prototype.filter.call(optionEditors, (opt) => {
                    const t = opt.querySelector('.choice-option-text');
                    return !!(t && t.value.trim());
                })
                : (Array.isArray(rawChoices) ? rawChoices.filter(opt => opt && String(opt.text || '').trim()) : []);

            options.forEach((opt, oIdx) => {
                const isRaw = !opt || typeof opt.querySelector !== 'function';
                const txtInput = isRaw ? null : opt.querySelector('.choice-option-text');
                const jumpSelect = isRaw ? null : opt.querySelector('.choice-option-jump');

                const optText = txtInput ? txtInput.value.trim()
                    : (isRaw ? String(opt.text || '').trim() : `Opsi ${oIdx + 1}`);
                const jumpTarget = jumpSelect ? jumpSelect.value : (isRaw ? String(opt.jump || opt.target || '') : '');

                const optId = genId('option');

                nodes.push({
                    data: {
                        id: optId,
                        label: `▸ OPSI ${oIdx + 1}`,
                        sublabel: truncate(optText, 20),
                        type: 'option',
                        parent: phaseId // Anak dari Phase
                    }
                });

                edges.push({ data: { source: choiceId, target: optId, type: 'flow' } });

                if (jumpTarget && !jumpTarget.startsWith('##')) {
                    edges.push({ data: { source: optId, target: `pending:${jumpTarget}`, type: 'jump' } });
                } else if (jumpTarget === '##SKIP_ALL_LABEL##') {
                    const skipId = genId('skip');
                    nodes.push({ data: { id: skipId, label: '⏩ SKIP LABEL', sublabel: 'Lanjut Phase', type: 'cmd', parent: phaseId } });
                    edges.push({ data: { source: optId, target: skipId, type: 'flow' } });
                } else if (jumpTarget === '##FINISH_PARENT##') {
                    // Menandakan bahwa label induk telah selesai, alur akan lanjut setelah label induk
                    const finishId = genId('finish_parent');
                    nodes.push({ data: { id: finishId, label: '↩ SELESAI INDUK', sublabel: 'Selesaikan label induk', type: 'cmd_finish', parent: phaseId } });
                    edges.push({ data: { source: optId, target: finishId, type: 'flow' } });
                } else if (jumpTarget === '##EXIT_LABEL##') {
                    // Keluar dari label dan lanjut ke entri berikutnya setelah label
                    const exitId = genId('exit_label');
                    nodes.push({ data: { id: exitId, label: '🚪 KELUAR LABEL', sublabel: 'Lanjut setelah label', type: 'cmd_exit', parent: phaseId } });
                    edges.push({ data: { source: optId, target: exitId, type: 'flow' } });
                } else if (jumpTarget === '##CONTINUE_PARENT##') {
                    // Lanjut di label induk, melewati sub-label lainnya
                    const continueId = genId('continue_parent');
                    nodes.push({ data: { id: continueId, label: '⏭ LANJUT INDUK', sublabel: 'Lewati sub-label', type: 'cmd_continue', parent: phaseId } });
                    edges.push({ data: { source: optId, target: continueId, type: 'flow' } });
                }
            });
        }

        function initCytoscape(elements) {
            try {
                if (typeof initCytoscape._cleanupRuntime === 'function') initCytoscape._cleanupRuntime();
                if (typeof initCytoscape._cleanupDocListeners === 'function') initCytoscape._cleanupDocListeners();
                if (cyInstance) cyInstance.destroy();

                if (typeof cytoscape === 'undefined') {
                    showNotification("Library Cytoscape belum dimuat.", "error");
                    return;
                }

                const container = document.getElementById('cy');

                cyInstance = cytoscape({
                    container: container,
                    elements: elements,
                    style: [
                        {
                            selector: 'node',
                            style: {
                                'label': (ele) => ele.data('label') + (ele.data('sublabel') ? '\n' + ele.data('sublabel') : ''),
                                'color': '#ecf0f1',
                                'font-family': '"Segoe UI", Roboto, Helvetica, Arial, sans-serif',
                                'font-size': '11px',
                                'text-valign': 'center',
                                'text-halign': 'center',
                                'text-wrap': 'wrap',
                                'text-max-width': '140px',
                                'background-color': '#34495e',
                                'border-width': 1,
                                'border-color': '#7f8c8d',
                                'shape': 'round-rectangle',
                                'width': 'label',
                                'height': 'label',
                                'padding': '12px'
                            }
                        },
                        {
                            selector: 'node[type="start"]',
                            style: {
                                'background-color': '#27ae60',
                                'shape': 'ellipse',
                                'padding': '20px',
                                'font-weight': 'bold',
                                'font-size': '12px',
                                'border-width': 3,
                                'border-color': '#2ecc71'
                            }
                        },
                        {
                            selector: 'node[type="end"]',
                            style: {
                                'background-color': '#c0392b',
                                'shape': 'ellipse',
                                'padding': '20px',
                                'font-weight': 'bold',
                                'border-width': 3,
                                'border-color': '#e74c3c'
                            }
                        },
                        // Phase node (Compound Parent)
                        {
                            selector: 'node[type="phase"]',
                            style: {
                                'background-color': '#ecf0f1',
                                'background-opacity': 0.1, // Transparan
                                'border-color': '#2c3e50',
                                'border-width': 2,
                                'border-style': 'solid',
                                'shape': 'round-rectangle',
                                'text-valign': 'top',
                                'text-halign': 'center',
                                'font-size': '16px',
                                'font-weight': 'bold',
                                'color': '#ffffff',
                                'padding': '40px', // Ruang untuk anak-anak
                                'label': (ele) => ele.data('label') + (ele.data('sublabel') ? '\n' + ele.data('sublabel') : '')
                            }
                        },
                        // ENDING Phase (isEnding = true)
                        {
                            selector: 'node[type="phase"][?isEnding]',
                            style: {
                                'background-color': '#ff1493',
                                'background-opacity': 0.15,
                                'border-color': '#ff69b4',
                                'border-width': 3,
                                'border-style': 'double',
                                'color': '#ff69b4'
                            }
                        },
                        // Node Ending (trophy)
                        {
                            selector: 'node[type="ending"]',
                            style: {
                                'background-color': '#ff1493',
                                'background-opacity': 0.9,
                                'shape': 'star',
                                'padding': '25px',
                                'font-weight': 'bold',
                                'font-size': '12px',
                                'border-width': 3,
                                'border-color': '#ff69b4',
                                'color': '#fff',
                                'text-valign': 'center',
                                'text-halign': 'center'
                            }
                        },
                        {
                            selector: 'node[type="label"]',
                            style: {
                                'background-color': '#f1c40f',
                                'background-opacity': 0.1,
                                'shape': 'round-rectangle',
                                'padding': '20px',
                                'border-color': '#f1c40f',
                                'border-width': 2,
                                'border-style': 'solid',
                                'text-valign': 'top',
                                'text-halign': 'center',
                                'color': '#f1c40f',
                                'font-weight': 'bold',
                                'label': (ele) => ele.data('label')
                            }
                        },
                        {
                            selector: 'node[type="sublabel"]',
                            style: {
                                'background-color': '#3498db',
                                'background-opacity': 0.1,
                                'shape': 'round-rectangle',
                                'width': 'label',
                                'padding': '15px',
                                'border-color': '#3498db',
                                'border-width': 1,
                                'border-style': 'dashed',
                                'text-valign': 'top',
                                'color': '#3498db',
                                'font-size': '10px',
                                'label': (ele) => ele.data('label')
                            }
                        },
                        {
                            selector: 'node[type="dialogue"]',
                            style: {
                                'background-color': '#222',
                                'border-color': '#00ffff',
                                'border-width': 2,
                                'color': '#ddd',
                                'text-halign': 'center',
                                'text-valign': 'center'
                            }
                        },
                        {
                            selector: 'node[?hasSpecial]',
                            style: {
                                'border-width': 3,
                                'border-color': '#f1c40f', // Highlight kuning untuk special event
                                'border-style': 'double'
                            }
                        },
                        {
                            selector: 'node[type="scene"]',
                            style: {
                                'background-color': '#00f371',
                                'border-color': '#00d361',
                                'shape': 'hexagon',
                                'padding': '15px',
                                'color': '#000'
                            }
                        },
                        {
                            selector: 'node[type="choice"]',
                            style: {
                                'background-color': '#aa00ff',
                                'shape': 'diamond',
                                'padding': '5px',
                                'border-color': '#8800cc',
                                'border-width': 2,
                                'color': '#fff'
                            }
                        },
                        {
                            selector: 'node[type="option"]',
                            style: {
                                'background-color': '#9b59b6',
                                'shape': 'round-rectangle',
                                'font-size': '10px',
                                'width': 'label'
                            }
                        },
                        {
                            selector: 'node[type="missing"]',
                            style: {
                                'background-color': '#e74c3c',
                                'label': 'MISSING',
                                'shape': 'triangle'
                            }
                        },
                        // Node untuk special command (##FINISH_PARENT##, ##EXIT_LABEL##, ##CONTINUE_PARENT##)
                        {
                            selector: 'node[type="cmd_finish"]',
                            style: {
                                'background-color': '#16a085',
                                'shape': 'round-rectangle',
                                'border-color': '#1abc9c',
                                'border-width': 2,
                                'color': '#fff',
                                'font-size': '10px'
                            }
                        },
                        {
                            selector: 'node[type="cmd_exit"]',
                            style: {
                                'background-color': '#e67e22',
                                'shape': 'round-rectangle',
                                'border-color': '#f39c12',
                                'border-width': 2,
                                'color': '#fff',
                                'font-size': '10px'
                            }
                        },
                        {
                            selector: 'node[type="cmd_continue"]',
                            style: {
                                'background-color': '#3498db',
                                'shape': 'round-rectangle',
                                'border-color': '#2980b9',
                                'border-width': 2,
                                'color': '#fff',
                                'font-size': '10px'
                            }
                        },
                        {
                            selector: 'edge',
                            style: {
                                'width': 2,
                                'line-color': '#95a5a6',
                                'target-arrow-color': '#95a5a6',
                                'target-arrow-shape': 'triangle',
                                'curve-style': 'bezier',
                                'arrow-scale': 1.0
                            }
                        },
                        {
                            selector: 'edge[type="jump"]',
                            style: {
                                'line-style': 'dashed',
                                'line-color': '#e74c3c', // Merah putus-putus
                                'target-arrow-color': '#e74c3c',
                                'width': 2
                            }
                        },
                        {
                            selector: 'edge[type="phase_flow"]',
                            style: {
                                'width': 4,
                                'line-color': '#f39c12', // Tebal, orange untuk flow antar fase
                                'target-arrow-color': '#f39c12'
                            }
                        },
                        // Styling untuk jump ke fase lain
                        {
                            selector: 'node[type="jump_phase"]',
                            style: {
                                'background-color': '#00bcd4',
                                'shape': 'round-rectangle',
                                'border-color': '#0097a7',
                                'border-width': 2,
                                'color': '#fff',
                                'font-size': '10px',
                                'text-valign': 'center',
                                'text-halign': 'center'
                            }
                        },
                        {
                            selector: 'edge[type="phase_jump"]',
                            style: {
                                'line-style': 'dashed',
                                'line-color': '#00bcd4', // Biru cyan untuk jump ke fase
                                'target-arrow-color': '#00bcd4',
                                'width': 3
                            }
                        },
                        // Styling untuk edge menuju ending
                        {
                            selector: 'edge[type="ending_flow"]',
                            style: {
                                'width': 4,
                                'line-color': '#ff1493', // Pink/Magenta untuk flow ke ending
                                'target-arrow-color': '#ff1493',
                                'line-style': 'solid'
                            }
                        },
                        // Highlighted/selected
                        {
                            selector: 'node:selected',
                            style: {
                                'border-width': 4,
                                'border-color': '#ffdc00'
                            }
                        },
                        {
                            selector: 'edge:selected',
                            style: {
                                'line-color': '#ffdc00',
                                'target-arrow-color': '#ffdc00',
                                'width': 4
                            }
                        },
                        // Hover effect
                        {
                            selector: 'node.hover',
                            style: {
                                'border-width': 3,
                                'border-color': '#ffdc00',
                                'background-opacity': 0.9
                            }
                        },
                        // Flow selection (interactive)
                        {
                            selector: 'node.flow-selected',
                            style: {
                                'border-width': 4,
                                'border-color': '#5865f2',
                                'background-opacity': 1
                            }
                        },
                        // Dimmed (for connection highlighting)
                        {
                            selector: '.flow-dimmed',
                            style: {
                                'opacity': 0.15
                            }
                        },
                        {
                            selector: '.flow-highlighted',
                            style: {
                                'opacity': 1
                            }
                        }
                    ],
                    layout: {
                        name: 'dagre',
                        rankDir: 'TB',
                        nodeSep: 40,
                        rankSep: 60,
                        padding: 30,
                        animate: true,
                        animationDuration: 300
                    },
                    minZoom: 0.1,
                    maxZoom: 3,
                    wheelSensitivity: 0.3
                });

                // ===== INTERACTIVE FLOW EDITOR =====
                let _selectedNode = null;
                let _edgeDrawSource = null; // Untuk drag-connect

                const _borderColors = {
                    'start': '#004c8c', 'end': '#cc6a00', 'label': '#1a8c28',
                    'sublabel': '#2a6b4e', 'dialogue': '#2d3748', 'scene': '#553c9a',
                    'choice': '#7b0a8c', 'option': '#6c3483', 'exit': '#a93226',
                    'finish': '#1e8449', 'missing': '#b32d25'
                };

                function resetNodeBorder(node) {
                    const type = node.data('type');
                    if (type === 'phase') {
                        node.style('border-width', 3);
                        node.style('border-color', '#0074d9');
                    } else {
                        node.style('border-width', 2);
                        node.style('border-color', _borderColors[type] || '#555');
                    }
                }

                function selectNode(node) {
                    // Deselect sebelumnya
                    if (_selectedNode && _selectedNode !== node) {
                        resetNodeBorder(_selectedNode);
                        _selectedNode.removeClass('flow-selected');
                    }
                    _selectedNode = node;
                    node.addClass('flow-selected');
                    node.style('border-width', 4);
                    node.style('border-color', '#5865f2');
                    updateFlowInspector(node);
                }

                function deselectNode() {
                    if (_selectedNode) {
                        resetNodeBorder(_selectedNode);
                        _selectedNode.removeClass('flow-selected');
                        _selectedNode = null;
                    }
                    clearFlowInspector();
                }

                // Event: Klik node → select + inspect (atau edge-draw jika aktif)
                cyInstance.on('tap', 'node', function (evt) {
                    if (_edgeDrawSource && _edgeDrawSource !== evt.target) {
                        createJumpEdge(_edgeDrawSource, evt.target);
                        _edgeDrawSource = null;
                        container.style.cursor = 'default';
                        return;
                    }
                    selectNode(evt.target);
                });

                // Event: Klik background → deselect
                cyInstance.on('tap', function (evt) {
                    if (evt.target === cyInstance) {
                        deselectNode();
                        hideContextMenu();
                    }
                });

                // Event: Double-klik node → navigasi ke card di editor
                cyInstance.on('dbltap', 'node', function (evt) {
                    const element = evt.target.data('element');
                    if (element) {
                        closeFlowVisualization();
                        setTimeout(() => {
                            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            // Trigger inspector selection juga
                            element.classList.add('inspector-selected');
                            if (window.VNInspector) window.VNInspector.inspectCard(element);
                            element.style.outline = '3px solid #5865f2';
                            setTimeout(() => { element.style.outline = ''; }, 2500);
                        }, 300);
                    }
                });

                // Event: Hover untuk highlight
                cyInstance.on('mouseover', 'node', function (evt) {
                    const node = evt.target;
                    if (node !== _selectedNode) {
                        node.style('border-width', 3);
                        node.style('border-color', '#ffdc00');
                    }
                    container.style.cursor = 'pointer';
                });

                cyInstance.on('mouseout', 'node', function (evt) {
                    const node = evt.target;
                    if (node !== _selectedNode) {
                        resetNodeBorder(node);
                    }
                    container.style.cursor = 'default';
                });

                // Event: Right-click → context menu
                cyInstance.on('cxttap', 'node', function (evt) {
                    evt.originalEvent.preventDefault();
                    const node = evt.target;
                    selectNode(node);
                    showContextMenu(evt.originalEvent, node);
                });

                // ===== FLOW INSPECTOR SIDEBAR =====
                const flowInspector = document.getElementById('flow-inspector');
                const flowInspectorCtx = document.getElementById('flow-inspector-context');
                const flowInspectorFields = document.getElementById('flow-inspector-fields');
                const flowInspectorEmpty = document.getElementById('flow-inspector-empty');
                const flowInspectorActions = document.getElementById('flow-inspector-actions');
                const flowInspectorClose = document.getElementById('flow-inspector-close');

                if (flowInspectorClose) {
                    flowInspectorClose.onclick = () => {
                        deselectNode();
                        flowInspector.style.display = 'none';
                    };
                }

                // Go to Card button
                const gotoBtn = document.getElementById('flow-action-goto');
                if (gotoBtn) {
                    gotoBtn.onclick = () => {
                        if (_selectedNode) {
                            const el = _selectedNode.data('element');
                            if (el) {
                                closeFlowVisualization();
                                setTimeout(() => {
                                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                    el.style.outline = '3px solid #5865f2';
                                    setTimeout(() => { el.style.outline = ''; }, 2500);
                                }, 300);
                            }
                        }
                    };
                }

                // Edit in Inspector button
                const editBtn = document.getElementById('flow-action-edit');
                if (editBtn) {
                    editBtn.onclick = () => {
                        if (_selectedNode) {
                            const el = _selectedNode.data('element');
                            if (el && window.VNInspector) {
                                closeFlowVisualization();
                                setTimeout(() => {
                                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                    document.querySelectorAll('.dialogue-entry-card.inspector-selected').forEach(c => c.classList.remove('inspector-selected'));
                                    el.classList.add('inspector-selected');
                                    window.VNInspector.inspectCard(el);
                                }, 300);
                            }
                        }
                    };
                }

                function updateFlowInspector(node) {
                    flowInspector.style.display = 'flex';
                    flowInspectorEmpty.style.display = 'none';
                    flowInspectorFields.style.display = 'block';
                    flowInspectorFields.innerHTML = '';

                    const type = node.data('type');
                    const label = node.data('label') || '';
                    const sublabel = node.data('sublabel') || '';
                    const element = node.data('element');
                    const hasElement = !!element;

                    // Type icon map
                    const typeIcons = {
                        'start': '▶', 'end': '⏹', 'ending': '🏁', 'phase': '📁',
                        'label': '🏷', 'sublabel': '📌', 'dialogue': '💬',
                        'scene': '🎬', 'choice': '🔀', 'option': '↳',
                        'jump': '🔗', 'set_var': '📊', 'custom': '🔧',
                        'cmd': '⚙', 'missing': '⚠'
                    };

                    flowInspectorCtx.textContent = (typeIcons[type] || '●') + ' ' + (type || 'node').toUpperCase();

                    // Node info
                    addInfoRow('ID', node.data('id'));
                    addInfoRow('Tipe', type);
                    if (label) addInfoRow('Label', label.replace(/^[^\s]+\s/, '')); // strip emoji
                    if (sublabel) addInfoRow('Sub-label', sublabel.substring(0, 80));

                    // Edges info
                    const inEdges = node.connectedEdges().filter(e => e.data('target') === node.data('id'));
                    const outEdges = node.connectedEdges().filter(e => e.data('source') === node.data('id'));
                    if (inEdges.length > 0) addInfoRow('Masuk dari', inEdges.length + ' koneksi');
                    if (outEdges.length > 0) addInfoRow('Keluar ke', outEdges.length + ' koneksi');

                    // Entry-specific fields dari DOM card
                    if (hasElement && element.classList.contains('dialogue-entry-card')) {
                        addSeparator('Properti Entry');
                        const entryType = element.dataset.type;
                        const typeDef = VN.NodeRegistry.get(entryType);
                        if (typeDef && typeDef.fields) {
                            typeDef.fields.forEach(field => {
                                const input = element.querySelector('[data-key="' + field.key + '"]');
                                if (!input) return;
                                const val = input.type === 'checkbox' ? (input.checked ? '✅' : '❌') : input.value;
                                if (!val || (typeof val === 'string' && !val.trim())) return;
                                const ui = VN.NodeRegistry.C.FIELD_UI[field.key];
                                const displayLabel = ui ? ui.label : field.key;
                                addInfoRow(displayLabel, typeof val === 'string' ? val.substring(0, 60) : val);
                            });
                        }
                    }

                    // Phase-specific info
                    if (type === 'phase' && element) {
                        addSeparator('Info Fase');
                        const phaseHeader = element.querySelector('.phase-header-info h4, .phase-title');
                        if (phaseHeader) addInfoRow('Nama', phaseHeader.textContent.trim());
                        const isEnding = element.querySelector('.phase-is-ending');
                        if (isEnding && isEnding.checked) addInfoRow('Status', '🏁 Ending');
                    }

                    // Show/hide action buttons
                    flowInspectorActions.style.display = hasElement ? 'flex' : 'none';

                    function addInfoRow(label, value) {
                        const row = document.createElement('div');
                        row.className = 'flow-info-row';
                        row.innerHTML = '<span class="flow-info-label">' + escapeHTML(label) + '</span><span class="flow-info-value">' + escapeHTML(String(value)) + '</span>';
                        flowInspectorFields.appendChild(row);
                    }

                    function addSeparator(title) {
                        const sep = document.createElement('div');
                        sep.className = 'flow-info-separator';
                        sep.textContent = title;
                        flowInspectorFields.appendChild(sep);
                    }

                    function escapeHTML(s) {
                        const div = document.createElement('div');
                        div.textContent = s;
                        return div.innerHTML;
                    }
                }

                function clearFlowInspector() {
                    flowInspectorCtx.textContent = 'Klik node untuk melihat properti';
                    flowInspectorFields.innerHTML = '';
                    flowInspectorFields.style.display = 'none';
                    flowInspectorEmpty.style.display = 'block';
                    flowInspectorActions.style.display = 'none';
                }

                // ===== CONTEXT MENU =====
                let _ctxMenu = null;

                function showContextMenu(event, node) {
                    hideContextMenu();
                    const type = node.data('type');
                    const element = node.data('element');

                    _ctxMenu = document.createElement('div');
                    _ctxMenu.className = 'flow-context-menu';
                    _ctxMenu.style.left = event.clientX + 'px';
                    _ctxMenu.style.top = event.clientY + 'px';

                    const menuItems = [];

                    // Go to Card
                    if (element) {
                        menuItems.push({ label: '📍 Navigasi ke Card', action: () => {
                            closeFlowVisualization();
                            setTimeout(() => {
                                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                element.style.outline = '3px solid #5865f2';
                                setTimeout(() => { element.style.outline = ''; }, 2500);
                            }, 300);
                        }});
                    }

                    // Edit in Inspector
                    if (element && element.classList.contains('dialogue-entry-card')) {
                        menuItems.push({ label: '✏️ Edit di Inspector', action: () => {
                            closeFlowVisualization();
                            setTimeout(() => {
                                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                document.querySelectorAll('.dialogue-entry-card.inspector-selected').forEach(c => c.classList.remove('inspector-selected'));
                                element.classList.add('inspector-selected');
                                if (window.VNInspector) window.VNInspector.inspectCard(element);
                            }, 300);
                        }});
                    }

                    // Create jump from this node
                    if (element && ['dialogue', 'scene', 'label', 'sublabel', 'option'].includes(type)) {
                        menuItems.push({ type: 'separator' });
                        menuItems.push({ label: '🔗 Mulai Koneksi Jump dari sini', action: () => {
                            _edgeDrawSource = node;
                            container.style.cursor = 'crosshair';
                            showNotification('Klik node target untuk membuat koneksi jump.', 'info');
                        }});
                    }

                    // If in edge-draw mode, allow connecting
                    if (_edgeDrawSource && _edgeDrawSource !== node) {
                        menuItems.push({ label: '🎯 Hubungkan ke sini (Jump)', action: () => {
                            createJumpEdge(_edgeDrawSource, node);
                            _edgeDrawSource = null;
                            container.style.cursor = 'default';
                        }});
                    }

                    // Highlight connected nodes
                    menuItems.push({ type: 'separator' });
                    menuItems.push({ label: '🔍 Highlight Koneksi', action: () => {
                        highlightConnections(node);
                    }});
                    menuItems.push({ label: '↺ Reset Highlight', action: () => {
                        cyInstance.elements().removeClass('flow-dimmed flow-highlighted');
                    }});

                    menuItems.forEach(item => {
                        if (item.type === 'separator') {
                            const sep = document.createElement('div');
                            sep.className = 'flow-ctx-separator';
                            _ctxMenu.appendChild(sep);
                        } else {
                            const btn = document.createElement('button');
                            btn.className = 'flow-ctx-item';
                            btn.textContent = item.label;
                            btn.addEventListener('click', () => {
                                hideContextMenu();
                                item.action();
                            });
                            _ctxMenu.appendChild(btn);
                        }
                    });

                    document.body.appendChild(_ctxMenu);

                    // Ensure menu stays in viewport
                    requestAnimationFrame(() => {
                        const rect = _ctxMenu.getBoundingClientRect();
                        if (rect.right > window.innerWidth) _ctxMenu.style.left = (window.innerWidth - rect.width - 5) + 'px';
                        if (rect.bottom > window.innerHeight) _ctxMenu.style.top = (window.innerHeight - rect.height - 5) + 'px';
                    });
                }

                function hideContextMenu() {
                    if (_ctxMenu && _ctxMenu.parentNode) {
                        _ctxMenu.parentNode.removeChild(_ctxMenu);
                        _ctxMenu = null;
                    }
                }

                // Close context menu on any click
                // Cleanup listeners sebelumnya agar tidak menumpuk setiap panggilan initCytoscape
                if (initCytoscape._cleanupDocListeners) initCytoscape._cleanupDocListeners();

                function _onDocClick() { hideContextMenu(); }
                function _onDocCtx(e) { if (_ctxMenu) e.preventDefault(); }
                function _onDocKeydown(e) {
                    if (e.key === 'Escape') {
                        if (_edgeDrawSource) {
                            _edgeDrawSource = null;
                            container.style.cursor = 'default';
                            showNotification('Koneksi jump dibatalkan.', 'info');
                        } else {
                            closeFlowVisualization();
                            return;
                        }
                        hideContextMenu();
                    }
                }

                document.addEventListener('click', _onDocClick);
                document.addEventListener('contextmenu', _onDocCtx);
                document.addEventListener('keydown', _onDocKeydown);

                initCytoscape._cleanupDocListeners = function () {
                    document.removeEventListener('click', _onDocClick);
                    document.removeEventListener('contextmenu', _onDocCtx);
                    document.removeEventListener('keydown', _onDocKeydown);
                };
                initCytoscape._cleanupRuntime = function () {
                    hideContextMenu();
                    clearFlowInspector();
                };

                function createJumpEdge(source, target) {
                    const edgeId = 'jump_' + source.data('id') + '_' + target.data('id');
                    // Check if edge already exists
                    if (cyInstance.getElementById(edgeId).length > 0) {
                        showNotification('Koneksi jump sudah ada.', 'warning');
                        return;
                    }
                    cyInstance.add({
                        data: {
                            id: edgeId,
                            source: source.data('id'),
                            target: target.data('id'),
                            type: 'jump'
                        }
                    });
                    showNotification('Jump edge dibuat: ' + source.data('label') + ' → ' + target.data('label'), 'success');

                    // Update target field di kartu sumber (jika possible)
                    const srcElement = source.data('element');
                    const tgtNode = target;
                    if (srcElement && tgtNode.data('type') === 'label') {
                        const targetInput = srcElement.querySelector('[data-key="target"]');
                        if (targetInput) {
                            targetInput.value = tgtNode.data('name') || tgtNode.data('label');
                            targetInput.dispatchEvent(new Event('input', { bubbles: true }));
                        }
                    }
                }

                // ===== CONNECTION HIGHLIGHTING =====
                function highlightConnections(node) {
                    cyInstance.elements().addClass('flow-dimmed');
                    node.removeClass('flow-dimmed').addClass('flow-highlighted');
                    node.connectedEdges().removeClass('flow-dimmed').addClass('flow-highlighted');
                    node.connectedEdges().connectedNodes().removeClass('flow-dimmed').addClass('flow-highlighted');
                }

                // Setup toolbar
                setupVisualizationToolbar();

            } catch (e) {
                console.error("Cytoscape Error:", e);
                showNotification("Gagal memuat visualisasi: " + e.message, "error");
            }
        }

        function setupVisualizationToolbar() {
            const zoomInBtn = document.getElementById('viz-zoom-in');
            const zoomOutBtn = document.getElementById('viz-zoom-out');
            const fitBtn = document.getElementById('viz-fit');
            const layoutBtn = document.getElementById('viz-layout');

            if (zoomInBtn) {
                zoomInBtn.onclick = () => cyInstance?.zoom(cyInstance.zoom() * 1.2);
            }
            if (zoomOutBtn) {
                zoomOutBtn.onclick = () => cyInstance?.zoom(cyInstance.zoom() / 1.2);
            }
            if (fitBtn) {
                fitBtn.onclick = () => cyInstance?.fit(null, 50);
            }
            if (layoutBtn) {
                layoutBtn.onclick = () => {
                    const currentDir = cyInstance?.options()?.layout?.rankDir || 'TB';
                    const newDir = currentDir === 'TB' ? 'LR' : 'TB';
                    cyInstance?.layout({
                        name: 'dagre',
                        rankDir: newDir,
                        nodeSep: 50,
                        rankSep: 80,
                        padding: 30,
                        animate: true
                    }).run();
                };
            }

            // Mode toggle buttons
            const detailBtn = document.getElementById('viz-mode-detail');
            const summaryBtn = document.getElementById('viz-mode-summary');
            const largeScript = !!window._vnEditorCompactMode;

            if (detailBtn) {
                detailBtn.disabled = largeScript;
                detailBtn.setAttribute('aria-disabled', largeScript ? 'true' : 'false');
                detailBtn.title = largeScript
                    ? 'Mode Detail dinonaktifkan untuk chapter besar agar editor tetap stabil.'
                    : 'Tampilkan seluruh entri';
            }

            function updateModeButtons() {
                if (detailBtn && summaryBtn) {
                    if (vizMode === 'detail') {
                        detailBtn.style.background = '#0074d9';
                        detailBtn.style.borderColor = '#0074d9';
                        summaryBtn.style.background = '#333';
                        summaryBtn.style.borderColor = '#555';
                    } else {
                        detailBtn.style.background = '#333';
                        detailBtn.style.borderColor = '#555';
                        summaryBtn.style.background = '#0074d9';
                        summaryBtn.style.borderColor = '#0074d9';
                    }
                }
            }

            if (detailBtn) {
                detailBtn.onclick = () => {
                    if (largeScript) {
                        showNotification('Mode Ringkasan dipakai untuk chapter besar agar penggunaan memori tetap aman.', 'success');
                        return;
                    }
                    if (vizMode !== 'detail') {
                        vizMode = 'detail';
                        updateModeButtons();
                        const elements = extractGraphData();
                        initCytoscape(elements);
                    }
                };
            }

            if (summaryBtn) {
                summaryBtn.onclick = () => {
                    if (vizMode !== 'summary') {
                        vizMode = 'summary';
                        updateModeButtons();
                        const elements = extractGraphData();
                        initCytoscape(elements);
                    }
                };
            }

            updateModeButtons();
        }
        // ------------------- End Visualization Flow Logic ------------------- //
