/**
 * Schema Validator untuk Visual Novel Engine
 * 
 * Modul ini memvalidasi dan menormalisasi data canonical:
 * - novel-meta.json
 * - hub-config.json
 * - script.json entries (set_var, condition, dll)
 * 
 * Juga menyediakan migrator untuk data legacy.
 */

// =============================================
// Schema Definitions & Defaults (dari config-defaults.js)
// =============================================

const {
    NOVEL_META_DEFAULTS,
    HUB_CONFIG_DEFAULTS,
    VALID_SET_VAR_OPS,
    VALID_CONDITION_OPS,
    VALID_ENTRY_TYPES
} = require('./config-defaults');

// =============================================
// Validation Functions
// =============================================

/**
 * Validasi dan normalisasi novel-meta.json
 * @param {object} data - Data mentah dari file
 * @returns {{ valid: boolean, data: object, warnings: string[] }}
 */
function validateNovelMeta(data) {
    const warnings = [];
    const result = JSON.parse(JSON.stringify(NOVEL_META_DEFAULTS));

    if (!data || typeof data !== 'object') {
        return { valid: false, data: result, warnings: ['Data novel-meta.json bukan objek valid'] };
    }

    // Title (wajib)
    if (typeof data.title === 'string' && data.title.trim()) {
        result.title = data.title.trim();
    } else {
        warnings.push('title kosong atau tidak valid');
    }

    // storyDesc (tagline kartu, maks 80 karakter)
    if (data.storyDesc !== undefined) {
        result.storyDesc = String(data.storyDesc).substring(0, 80);
    } else if (data.description) {
        // Fallback: buat storyDesc dari 80 karakter pertama description
        result.storyDesc = String(data.description).substring(0, 80).trim();
    }

    // String fields
    ['description', 'genre', 'author', 'illustrator', 'vnMapper', 'cover', 'promotionalVideo'].forEach(key => {
        if (data[key] !== undefined) {
            result[key] = String(data[key]);
        }
    });

    // `images` (Media Showcase) dihapus 2026-07-21: tidak ada satu pun jalur
    // runtime yang membacanya, dan penulisan otomatis dari upload aset justru
    // mencemari daftar. Galeri/slideshow kini sepenuhnya urusan hub kustom.
    // Field lama sengaja TIDAK disalin ke result → hilang saat meta ditulis ulang.

    // Timestamps
    result.createdAt = data.createdAt || new Date().toISOString();
    if (data.updatedAt) result.updatedAt = data.updatedAt;
    if (data.migratedFromLegacy) result.migratedFromLegacy = true;

    // Editor-only state. This is intentionally persisted with the novel so
    // copied/deleted/recreated novels do not depend on browser localStorage.
    if (data.editorState && typeof data.editorState === 'object') {
        result.editorState = {
            ...result.editorState,
            ...data.editorState
        };

        if (data.editorState.newNovelOnboarding && typeof data.editorState.newNovelOnboarding === 'object') {
            result.editorState.newNovelOnboarding = {
                ...result.editorState.newNovelOnboarding,
                ...data.editorState.newNovelOnboarding
            };
        }
    }

    return { valid: warnings.length === 0, data: result, warnings };
}

/**
 * Validasi dan normalisasi hub-config.json
 * @param {object} data - Data mentah dari file
 * @returns {{ valid: boolean, data: object, warnings: string[] }}
 */
function validateHubConfig(data) {
    const warnings = [];
    const result = JSON.parse(JSON.stringify(HUB_CONFIG_DEFAULTS));

    if (!data || typeof data !== 'object') {
        return { valid: false, data: result, warnings: ['Data hub-config.json bukan objek valid'] };
    }

    // hubType
    if (data.hubType && ['default', 'custom'].includes(data.hubType)) {
        result.hubType = data.hubType;
    }
    result.hubModeConfirmed = data.hubModeConfirmed === true;

    // bootSequence
    if (Array.isArray(data.bootSequence)) {
        result.bootSequence = data.bootSequence;
    }

    // warningScreen
    if (data.warningScreen && typeof data.warningScreen === 'object') {
        result.warningScreen = {
            enabled: !!data.warningScreen.enabled,
            text: String(data.warningScreen.text || ''),
            style: String(data.warningScreen.style || 'default')
        };
    }

    // menu
    if (data.menu && typeof data.menu === 'object') {
        result.menu = {
            bgm: String(data.menu.bgm || ''),
            layout: String(data.menu.layout || ''),
            items: Array.isArray(data.menu.items) ? data.menu.items : [],
            background: data.menu.background && typeof data.menu.background === 'object'
                ? data.menu.background : { type: '', src: '' }
        };
    }

    // chapterConfig
    if (data.chapterConfig && typeof data.chapterConfig === 'object') {
        result.chapterConfig = data.chapterConfig;
    }

    // credits
    if (data.credits && typeof data.credits === 'object') {
        result.credits = {
            lines: Array.isArray(data.credits.lines) ? data.credits.lines.map(line => ({
                type: ['heading', 'text', 'separator'].includes(line.type) ? line.type : 'text',
                text: String(line.text || '')
            })) : []
        };
    }

    // playerProfile (pass-through)
    if (data.playerProfile && typeof data.playerProfile === 'object') {
        result.playerProfile = data.playerProfile;
    }

    return { valid: warnings.length === 0, data: result, warnings };
}

/**
 * Normalisasi satu entry script.json
 * Perbaiki legacy field names dan operator values
 * @param {object} entry - Satu baris entry dari script.json
 * @returns {object} Entry yang sudah dinormalisasi
 */
function normalizeScriptEntry(entry) {
    if (!entry || typeof entry !== 'object') return entry;

    const result = { ...entry };

    // Normalisasi set_var: legacy varName/varOp/varValue → name/op/value
    if (result.type === 'set_var') {
        if (result.varName !== undefined && result.name === undefined) {
            result.name = result.varName;
            delete result.varName;
        }
        if (result.varOp !== undefined && result.op === undefined) {
            result.op = normalizeSetVarOp(result.varOp);
            delete result.varOp;
        }
        if (result.varValue !== undefined && result.value === undefined) {
            result.value = autoDetectType(result.varValue);
            delete result.varValue;
        }
        // Normalisasi op yang sudah di field benar tapi nilainya legacy
        if (result.op) {
            result.op = normalizeSetVarOp(result.op);
        }
        // Auto-detect tipe value
        if (typeof result.value === 'string') {
            result.value = autoDetectType(result.value);
        }
    }

    // Normalisasi condition: string → object
    if (result.condition !== undefined) {
        result.condition = normalizeCondition(result.condition);
    }

    // Normalisasi condition di dalam choices
    if (result.type === 'choice' && Array.isArray(result.choices)) {
        result.choices = result.choices.map(choice => {
            if (choice.condition) {
                choice.condition = normalizeCondition(choice.condition);
            }
            // Normalisasi setVariable di choice
            if (choice.setVariable) {
                if (choice.setVariable.varName && !choice.setVariable.name) {
                    choice.setVariable.name = choice.setVariable.varName;
                    delete choice.setVariable.varName;
                }
                if (choice.setVariable.varOp && !choice.setVariable.op) {
                    choice.setVariable.op = normalizeSetVarOp(choice.setVariable.varOp);
                    delete choice.setVariable.varOp;
                }
                if (choice.setVariable.varValue !== undefined && choice.setVariable.value === undefined) {
                    choice.setVariable.value = autoDetectType(choice.setVariable.varValue);
                    delete choice.setVariable.varValue;
                }
            }
            return choice;
        });
    }

    return result;
}

/**
 * Normalisasi seluruh script.json
 * @param {Array} scriptArray - Array dari entries
 * @returns {Array} Array yang sudah dinormalisasi
 */
function normalizeScript(scriptArray) {
    if (!Array.isArray(scriptArray)) return [];
    return scriptArray.map(normalizeScriptEntry);
}

// =============================================
// Internal Helpers
// =============================================

function normalizeSetVarOp(op) {
    const opMap = {
        '+': '+=', 'add': '+=',
        '-': '-=', 'sub': '-=',
        '*': '*=', 'mul': '*=',
        '/': '/=', 'div': '/=',
        '%': '%=', 'mod': '%=',
        '=': '=', 'set': '='
    };
    return opMap[op] || op;
}

function normalizeCondition(condition) {
    if (!condition) return undefined;

    // Sudah object — validasi
    if (typeof condition === 'object' && !Array.isArray(condition)) {
        // Kombinator logika: {all:[...]}, {any:[...]}, {not: cond} — normalisasi isi,
        // JANGAN dibuang (dulu bentuk ini tersapu karena tak punya var+op).
        if (Array.isArray(condition.all)) {
            const all = condition.all.map(c => normalizeCondition(c)).filter(c => c !== undefined);
            return all.length ? { all } : undefined;
        }
        if (Array.isArray(condition.any)) {
            const any = condition.any.map(c => normalizeCondition(c)).filter(c => c !== undefined);
            return any.length ? { any } : undefined;
        }
        if (condition.not !== undefined) {
            const not = normalizeCondition(condition.not);
            return not !== undefined ? { not } : undefined;
        }
        if (condition.var && condition.op) return condition;
        return undefined;
    }

    // Array of conditions — normalisasi masing-masing
    if (Array.isArray(condition)) {
        const normalized = condition
            .map(c => normalizeCondition(c))
            .filter(c => c !== undefined);
        return normalized.length === 0 ? undefined
             : normalized.length === 1 ? normalized[0]
             : normalized;
    }
    
    // Legacy string: "varName op value" atau "var1 > 50 AND var2 == true"
    if (typeof condition === 'string') {
        const trimmed = condition.trim();
        if (!trimmed) return undefined;
        
        // Split AND
        const parts = trimmed.split(/\s+AND\s+/i);
        const parsed = parts
            .map(part => parseSingleConditionString(part.trim()))
            .filter(c => c !== null);
        
        if (parsed.length === 0) return undefined;
        return parsed.length === 1 ? parsed[0] : parsed;
    }
    
    return undefined;
}

function parseSingleConditionString(str) {
    const match = str.match(/^(\S+)\s*(==|!=|>=|<=|>|<|=)\s*(.+)$/);
    if (!match) return null;
    return {
        var: match[1],
        op: match[2] === '=' ? '==' : match[2],
        value: autoDetectType(match[3].trim())
    };
}

function autoDetectType(val) {
    if (typeof val !== 'string') return val;
    if (val === 'true') return true;
    if (val === 'false') return false;
    if (val !== '' && !isNaN(Number(val))) return Number(val);
    return val;
}

// =============================================
// Exports
// =============================================

module.exports = {
    validateNovelMeta,
    validateHubConfig,
    normalizeScriptEntry,
    normalizeScript,
    normalizeCondition,
    normalizeSetVarOp,
    autoDetectType,
    NOVEL_META_DEFAULTS,
    HUB_CONFIG_DEFAULTS,
    VALID_SET_VAR_OPS,
    VALID_CONDITION_OPS,
    VALID_ENTRY_TYPES
};
