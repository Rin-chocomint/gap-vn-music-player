'use strict';

const DEFAULT_MIN_SIZE = 80;

function finiteInteger(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(number) : Math.round(fallback);
}

function createGeometry(bounds = {}, fallback = {}, minSize = DEFAULT_MIN_SIZE) {
    const safeMin = Math.max(1, finiteInteger(minSize, DEFAULT_MIN_SIZE));
    return {
        x: finiteInteger(bounds.x, fallback.x || 0),
        y: finiteInteger(bounds.y, fallback.y || 0),
        width: Math.max(safeMin, finiteInteger(bounds.width, fallback.width || safeMin)),
        height: Math.max(safeMin, finiteInteger(bounds.height, fallback.height || safeMin))
    };
}

function moveGeometry(geometry, x, y) {
    const current = createGeometry(geometry);
    return {
        ...current,
        x: finiteInteger(x, current.x),
        y: finiteInteger(y, current.y)
    };
}

function resizeGeometry(geometry, bounds = {}, minSize = DEFAULT_MIN_SIZE) {
    const current = createGeometry(geometry, {}, minSize);
    return createGeometry({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height
    }, current, minSize);
}

function hasSizeDrift(nativeBounds, geometry) {
    if (!nativeBounds || !geometry) return false;
    return finiteInteger(nativeBounds.width) !== geometry.width
        || finiteInteger(nativeBounds.height) !== geometry.height;
}

function geometryCenter(geometry) {
    const current = createGeometry(geometry);
    return {
        x: Math.round(current.x + current.width / 2),
        y: Math.round(current.y + current.height / 2)
    };
}

module.exports = {
    DEFAULT_MIN_SIZE,
    createGeometry,
    moveGeometry,
    resizeGeometry,
    hasSizeDrift,
    geometryCenter
};
