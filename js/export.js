/**
 * export.js - 导出功能
 * 支持 SVG 和 PNG 导出
 */

import { serializeSVG } from './svg-renderer.js';
import { appState } from './state.js';

/**
 * 动态生成导出所需的关键 CSS 规则（使用当前连线样式设置）
 */
function getExportCSS() {
    const { opacity, strokeWidth } = appState.linkStyle;
    return `
        .link-line { opacity: ${opacity}; stroke-width: ${strokeWidth}; }
        .device-group { cursor: pointer; }
        .led-blink { animation: none; opacity: 1; }
        text { font-family: 'Inter','Microsoft YaHei',sans-serif; }
    `;
}

/**
 * 触发文件下载
 * @param {string} filename
 * @param {Blob|string} content
 */
function download(filename, content) {
    const a = document.createElement('a');
    if (content instanceof Blob) {
        a.href = URL.createObjectURL(content);
    } else {
        a.href = content;
    }
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        if (content instanceof Blob) URL.revokeObjectURL(a.href);
    }, 100);
}

/**
 * 获取带内联样式的 SVG 字符串
 * @returns {string}
 */
function getStyledSVGString() {
    const svg = document.getElementById('topologySvg');
    if (!svg) return '';

    // 克隆 SVG 以便修改
    const clone = svg.cloneNode(true);

    // 嵌入导出样式
    const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    styleEl.textContent = getExportCSS();
    clone.insertBefore(styleEl, clone.firstChild);

    // 确保命名空间
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');

    // 设置背景色
    clone.style.background = '#020617';

    return new XMLSerializer().serializeToString(clone);
}

/**
 * 导出 SVG
 */
export function exportSVG() {
    const svgStr = getStyledSVGString();
    if (!svgStr) {
        alert('SVG 内容为空，无法导出');
        return;
    }
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    download(`拓扑图_${timestamp}.svg`, blob);
}

/**
 * 导出 PNG
 */
export function exportPNG() {
    const svgStr = getStyledSVGString();
    if (!svgStr) {
        alert('SVG 内容为空，无法导出');
        return;
    }

    const svg = document.getElementById('topologySvg');
    const bbox = svg.getBBox ? svg.getBBox() : { width: 2800, height: 1600 };
    const width = Math.max(bbox.width, 2800);
    const height = Math.max(bbox.height, 1600);

    // 创建 canvas
    const canvas = document.createElement('canvas');
    const scale = 2; // 2x 高清导出
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        alert('Canvas 初始化失败');
        return;
    }

    // 填充背景
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 绘制 SVG
    const img = new Image();
    const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);

        canvas.toBlob(blob => {
            if (!blob) {
                alert('PNG 生成失败');
                return;
            }
            const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
            download(`拓扑图_${timestamp}.png`, blob);
        }, 'image/png');
    };

    img.onerror = () => {
        URL.revokeObjectURL(url);
        alert('SVG 渲染失败，无法导出 PNG');
    };

    img.src = url;
}

/**
 * 绑定导出按钮事件
 */
export function bindExportEvents() {
    const btnSvg = document.getElementById('btnExportSvg');
    const btnPng = document.getElementById('btnExportPng');

    if (btnSvg) btnSvg.addEventListener('click', exportSVG);
    if (btnPng) btnPng.addEventListener('click', exportPNG);
}
