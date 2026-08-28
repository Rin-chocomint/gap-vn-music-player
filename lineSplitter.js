const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, 'aset/game/vnModules/editor/scriptEditor.js.bak');
const lines = fs.readFileSync(srcPath, 'utf8').split('\n');

function getLines(start, end) {
    if (end === -1) end = lines.length;
    return lines.slice(start - 1, end).join('\n');
}

// Map files to chunks of lines
const mapping = {
    'editorState.js': [
        [1, 3] // Header + currentNovelChapters
    ],
    'editorPanelNav.js': [
        [210, 339], // Chapter list listeners, edit mode
        [382, 397], // createChapterItemElement
        [651, 702]  // loadNovelForEditing
    ],
    'editorInspector.js': [
        [131, 165], // Asset preview
        [398, 650], // Audio tools
        [1704, 1742] // toggleTransitionOutControls
    ],
    'editorToolbar.js': [
        [2397, 2568] // saveScriptChanges
    ],
    'editorCanvas.js': [
        [4, 130], // createSubLabelElement
        [1210, 1703], // Phase card, add phase, update states
        [1743, 1993], // renderScriptEditor, dropdown targets
        [2569, 2905] // createEntryCard, createLabelGroupElement, addNewDialogueEntry
    ],
    'scriptEditor.js': [
        [166, 209], // save-story-desc
        [340, 381], // showScriptEditor, hide, ipc
        [703, 1209], // showHubPreview, groupScript, loadChapterScript
        [1994, 2396], // extractLabelPreviewData
        [2906, -1] // Global button listeners + DOMContentLoaded
    ]
};

const outDir = path.join(__dirname, 'aset/game/vnModules/editor');

for (const [filename, ranges] of Object.entries(mapping)) {
    let content = `// === ${filename} ===\n\n`;
    for (const range of ranges) {
        content += getLines(range[0], range[1]) + '\n\n';
    }
    fs.writeFileSync(path.join(outDir, filename), content, 'utf8');
    console.log(`Wrote ${filename} with ${ranges.length} ranges.`);
}
console.log("Refactoring complete.");
