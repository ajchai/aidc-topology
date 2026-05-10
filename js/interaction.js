/**
 * interaction.js - 交互管理
 * 缩放、拖拽、高亮、Tooltip、事件委托
 */

import { appState, updateState, resetViewBox } from './state.js';
import { LAYOUT } from './config.js';
import { highlightDevice, resetHighlights } from './svg-renderer.js';

const svgElement = () => document.getElementById('topologySvg');
const svgContainer = () => document.getElementById('svgContainer');
const tooltipEl = () => document.getElementById('tooltip');
const nodeLayer = () => document.getElementById('nodeLayer');

/** @type {number|null} */
let wheelRafId = null;

/**
 * 更新 viewBox
 */
export function updateViewBox() {
    const vb = appState.viewBox;
    const svg = svgElement();
    if (svg) {
        svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    }
}

/**
 * 适应屏幕
 */
export function resetZoom() {
    const group = nodeLayer();
    if (!group) return;

    // 等待 DOM 渲染完成后获取 bbox
    requestAnimationFrame(() => {
        try {
            const bbox = group.getBBox();
            if (bbox.width === 0) return;
            const padding = 120;
            updateState({
                viewBox: {
                    x: bbox.x - padding,
                    y: bbox.y - padding,
                    w: bbox.width + padding * 2,
                    h: bbox.height + padding * 2
                }
            });
            updateViewBox();
        } catch (e) {
            console.warn('resetZoom getBBox failed:', e);
            updateState({ viewBox: { ...LAYOUT.viewBoxDefault } });
            updateViewBox();
        }
    });
}

/**
 * 缩放
 * @param {number} factor
 */
function scaleView(factor) {
    const vb = appState.viewBox;
    const centerX = vb.x + vb.w / 2;
    const centerY = vb.y + vb.h / 2;
    const newW = vb.w * factor;
    const newH = vb.h * factor;
    updateState({
        viewBox: {
            x: centerX - newW / 2,
            y: centerY - newH / 2,
            w: newW,
            h: newH
        }
    });
    updateViewBox();
}

export function zoomIn() {
    scaleView(1 / appState.zoomFactor);
}

export function zoomOut() {
    scaleView(appState.zoomFactor);
}

/**
 * 显示 Tooltip
 * @param {MouseEvent} evt
 * @param {string} html
 */
function showTooltip(evt, html) {
    const tt = tooltipEl();
    if (!tt) return;
    tt.innerHTML = html;
    tt.style.display = 'block';
    tt.style.left = (evt.pageX + 15) + 'px';
    tt.style.top = (evt.pageY + 15) + 'px';
    tt.style.opacity = '1';
}

/**
 * 隐藏 Tooltip
 */
function hideTooltip() {
    const tt = tooltipEl();
    if (!tt) return;
    tt.style.opacity = '0';
    setTimeout(() => {
        if (tt.style.opacity === '0') tt.style.display = 'none';
    }, 200);
}

/**
 * 滚轮缩放（带 requestAnimationFrame 节流）
 * @param {WheelEvent} e
 */
function onWheel(e) {
    e.preventDefault();
    if (wheelRafId !== null) return;

    wheelRafId = requestAnimationFrame(() => {
        wheelRafId = null;
        const container = svgContainer();
        if (!container) return;

        const mouseX = e.offsetX;
        const mouseY = e.offsetY;
        const rect = container.getBoundingClientRect();
        const vb = appState.viewBox;
        const viewX = vb.x + (mouseX / rect.width) * vb.w;
        const viewY = vb.y + (mouseY / rect.height) * vb.h;
        const factor = e.deltaY < 0 ? (1 / appState.zoomFactor) : appState.zoomFactor;
        const newW = vb.w * factor;
        const newH = vb.h * factor;

        updateState({
            viewBox: {
                x: viewX - (mouseX / rect.width) * newW,
                y: viewY - (mouseY / rect.height) * newH,
                w: newW,
                h: newH
            }
        });
        updateViewBox();
    });
}

/**
 * 鼠标按下
 * @param {MouseEvent} e
 */
function onMouseDown(e) {
    updateState({ isDragging: true, dragStart: { x: e.clientX, y: e.clientY } });
    const container = svgContainer();
    if (container) container.style.cursor = 'grabbing';
}

/**
 * 鼠标移动（全局）
 * @param {MouseEvent} e
 */
function onMouseMove(e) {
    if (!appState.isDragging) return;
    const dx = e.clientX - appState.dragStart.x;
    const dy = e.clientY - appState.dragStart.y;
    const container = svgContainer();
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const vb = appState.viewBox;

    updateState({
        viewBox: {
            x: vb.x - dx * (vb.w / rect.width),
            y: vb.y - dy * (vb.h / rect.height),
            w: vb.w,
            h: vb.h
        },
        dragStart: { x: e.clientX, y: e.clientY }
    });
    updateViewBox();
}

/**
 * 鼠标松开
 */
function onMouseUp() {
    updateState({ isDragging: false });
    const container = svgContainer();
    if (container) container.style.cursor = 'grab';
}

/**
 * 事件委托：mouseover
 * @param {MouseEvent} e
 */
function onSvgMouseOver(e) {
    const devGroup = e.target.closest('.device-group');
    if (!devGroup) return;
    const text = devGroup.getAttribute('data-tooltip');
    const id = devGroup.getAttribute('data-id');
    if (text) showTooltip(e, text);
    if (id) highlightDevice(id);
}

/**
 * 事件委托：mouseout
 * @param {MouseEvent} e
 */
function onSvgMouseOut(e) {
    const devGroup = e.target.closest('.device-group');
    if (!devGroup) return;
    hideTooltip();
    resetHighlights();
}

/**
 * 事件委托：mousemove（Tooltip 跟随）
 * @param {MouseEvent} e
 */
function onSvgMouseMove(e) {
    const tt = tooltipEl();
    if (tt && tt.style.opacity === '1') {
        tt.style.left = (e.pageX + 15) + 'px';
        tt.style.top = (e.pageY + 15) + 'px';
    }
}

/**
 * 绑定所有交互事件
 */
export function bindInteractions() {
    const container = svgContainer();
    const layer = nodeLayer();

    if (container) {
        container.addEventListener('wheel', onWheel, { passive: false });
        container.addEventListener('mousedown', onMouseDown);
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    if (layer) {
        layer.addEventListener('mouseover', onSvgMouseOver);
        layer.addEventListener('mouseout', onSvgMouseOut);
        layer.addEventListener('mousemove', onSvgMouseMove);
    }
}

/**
 * 解绑交互事件（清理用）
 */
export function unbindInteractions() {
    const container = svgContainer();
    const layer = nodeLayer();

    if (container) {
        container.removeEventListener('wheel', onWheel);
        container.removeEventListener('mousedown', onMouseDown);
    }
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);

    if (layer) {
        layer.removeEventListener('mouseover', onSvgMouseOver);
        layer.removeEventListener('mouseout', onSvgMouseOut);
        layer.removeEventListener('mousemove', onSvgMouseMove);
    }
}
