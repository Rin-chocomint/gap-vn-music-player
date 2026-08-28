const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, 'aset/game/vnModules/editor/scriptEditor.js.bak');
const code = fs.readFileSync(srcPath, 'utf8');

// The output directories
const outDir = path.join(__dirname, 'aset/game/vnModules/editor');

const files = {
    'editorState.js': [],
    'editorPanelNav.js': [],
    'editorCanvas.js': [],
    'editorInspector.js': [],
    'editorToolbar.js': [],
    'scriptEditor.js': []
};

// Bracket balancer
let blocks = [];
let currentBlock = "";
let braceCount = 0;
let parenCount = 0;
let inString = false;
let stringChar = '';
let inSingleComment = false;
let inMultiComment = false;
let blockStartLine = 1;
let currentLine = 1;

for (let i = 0; i < code.length; i++) {
    const char = code[i];
    const nextChar = code[i+1];
    const prevChar = code[i-1];
    
    currentBlock += char;
    
    if (char === '\n') currentLine++;
    
    // State machine for strings and comments
    if (inSingleComment) {
        if (char === '\n') inSingleComment = false;
        continue;
    }
    if (inMultiComment) {
        if (char === '*' && nextChar === '/') {
            inMultiComment = false;
            currentBlock += '/';
            i++;
        }
        continue;
    }
    if (inString) {
        if (char === stringChar && prevChar !== '\\') inString = false;
        continue;
    }
    
    // Check starts
    if (char === '/' && nextChar === '/') { inSingleComment = true; currentBlock += '/'; i++; continue; }
    if (char === '/' && nextChar === '*') { inMultiComment = true; currentBlock += '*'; i++; continue; }
    if (char === '"' || char === "'" || char === "`") { inString = true; stringChar = char; continue; }
    
    if (char === '{') braceCount++;
    if (char === '}') braceCount--;
    if (char === '(') parenCount++;
    if (char === ')') parenCount--;
    
    // If we are at root level and we hit a newline, and braces are balanced, it's a block!
    // But we should also make sure parenthesis are balanced (for multiline function calls).
    if (braceCount === 0 && parenCount === 0 && char === '\n') {
        const trimmed = currentBlock.trim();
        if (trimmed) {
            blocks.push({ text: currentBlock, startLine: blockStartLine, endLine: currentLine });
        }
        currentBlock = "";
        blockStartLine = currentLine + 1;
    }
}
if (currentBlock.trim()) {
    blocks.push({ text: currentBlock, startLine: blockStartLine, endLine: currentLine });
}

console.log("Total top-level blocks found:", blocks.length);

// Now categorize blocks
blocks.forEach(block => {
    const txt = block.text;
    
    if (txt.includes('let currentNovelChapters')) {
        files['editorState.js'].push(txt);
    } 
    else if (txt.includes('createChapterItemElement') || txt.includes('loadNovelForEditing') || txt.includes('editorChapterListEditable') || txt.includes('show-add-chapter-input-btn') || txt.match(/function\s+(enterEditMode|exitEditMode)/)) {
        files['editorPanelNav.js'].push(txt);
    }
    else if (txt.includes('saveScriptChanges') || txt.includes('save-script-btn') || txt.includes('btn-visualize-flow')) {
        files['editorToolbar.js'].push(txt);
    }
    else if (txt.includes('createSubLabelElement') || txt.includes('createPhaseEditorCard') || txt.includes('createEntryCard') || txt.includes('createLabelGroupElement') || txt.includes('addNewDialogueEntry') || txt.includes('getDragContext')) {
        files['editorCanvas.js'].push(txt);
    }
    else if (txt.includes('createAudioControls') || txt.includes('showAssetPreview') || txt.includes('hideAssetPreview') || txt.includes('replaceAssetInEntry') || txt.includes('toggleTransitionOutControls')) {
        files['editorInspector.js'].push(txt);
    }
    // Anything else goes back to scriptEditor.js
    else {
        files['scriptEditor.js'].push(txt);
    }
});

// Write files
for (const [filename, contentArray] of Object.entries(files)) {
    let finalContent = contentArray.join('\n');
    if (filename === 'scriptEditor.js') {
       finalContent = "// --- scriptEditor.js (Orchestrator) ---\n" + finalContent;
    }
    fs.writeFileSync(path.join(outDir, filename), finalContent, 'utf8');
    console.log(`Wrote ${filename} (${contentArray.length} blocks)`);
}

console.log("Splitting finished successfully.");
