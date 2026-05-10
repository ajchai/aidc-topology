/**
 * app.js - 主入口
 * 整合所有模块，完成初始化与事件绑定
 */

import { GPU_SPECS, LAYOUT } from './config.js';
import { appState, updateState, getGpuPrefix } from './state.js';
import { loadSettings, debouncedSave, bindResetButton } from './storage.js';
import { calcHardware, clearHardwareCache } from './hardware-engine.js';
import { calcLayout } from './layout-engine.js';
import { renderTopology, resetHighlights } from './svg-renderer.js';
import { updateViewBox, resetZoom, zoomIn, zoomOut, bindInteractions, unbindInteractions } from './interaction.js';
import { renderSummary, bindStatsPanelEvents, switchStatsTab } from './stats-panel.js';
import { bindExportEvents } from './export.js';

/** 是否正在生成中 */
let isGenerating = false;

/**
 * 校验并规范化 serverCount
 * @param {string|number} value
 * @returns {number}
 */
const VALID_SERVER_COUNTS = [64, 128, 256, 512, 1024];

function normalizeServerCount(value) {
    const num = parseInt(String(value), 10);
    if (VALID_SERVER_COUNTS.includes(num)) return num;
    return 128; // 默认值
}

/**
 * 主生成函数
 */
export async function generateTopology() {
    if (isGenerating) return;
    isGenerating = true;

    try {
        const serverCountInput = document.getElementById('serverCount');
        const gpuSelect = document.getElementById('gpuType');

        if (!serverCountInput || !gpuSelect) {
            console.error('Required DOM elements not found');
            return;
        }

        const rawCount = serverCountInput.value;
        const serverCount = normalizeServerCount(rawCount);
        const gpuType = gpuSelect.value;
        const gpuSpec = GPU_SPECS[gpuType] || GPU_SPECS.B300_8;
        const railCount = gpuSpec.railCount;

        // 同步输入框（如果输入了非法值）
        if (String(serverCount) !== String(rawCount)) {
            serverCountInput.value = String(serverCount);
        }

        // 更新状态
        updateState({
            serverCount,
            gpuType,
            railCount,
            cachedHardwareData: null
        });

        // 计算硬件
        const hwData = calcHardware(serverCount, gpuType);
        updateState({ cachedHardwareData: hwData, cachedServerCount: serverCount });

        // 计算布局
        const layout = calcLayout(serverCount, gpuType);

        // 渲染
        renderTopology(layout, serverCount, railCount);

        // 更新统计面板
        renderSummary(serverCount, gpuType, railCount, hwData);

        // 重置高亮
        resetHighlights();

        // 适应屏幕
        requestAnimationFrame(() => {
            resetZoom();
        });

        // 保存配置
        debouncedSave();

    } catch (err) {
        console.error('generateTopology failed:', err);
        const summaryPanel = document.getElementById('summaryPanel');
        if (summaryPanel) {
            summaryPanel.innerHTML = `<div class="p-2 text-red-400">生成失败: ${err.message}</div>`;
        }
    } finally {
        isGenerating = false;
    }
}

/**
 * 绑定工具栏事件
 */
function bindToolbarEvents() {
    const btnGenerate = document.getElementById('btnGenerate');
    const btnResetZoom = document.getElementById('btnResetZoom');
    const btnZoomIn = document.getElementById('btnZoomIn');
    const btnZoomOut = document.getElementById('btnZoomOut');

    if (btnGenerate) btnGenerate.addEventListener('click', generateTopology);
    if (btnResetZoom) btnResetZoom.addEventListener('click', resetZoom);
    if (btnZoomIn) btnZoomIn.addEventListener('click', zoomIn);
    if (btnZoomOut) btnZoomOut.addEventListener('click', zoomOut);
}

/**
 * 绑定输入框事件（回车触发生成）
 */
function bindInputEvents() {
    const serverCountSelect = document.getElementById('serverCount');
    const gpuSelect = document.getElementById('gpuType');

    if (serverCountSelect) {
        serverCountSelect.addEventListener('change', generateTopology);
    }

    if (gpuSelect) {
        gpuSelect.addEventListener('change', generateTopology);
    }
}

/**
 * 同步 UI 到状态（加载配置后）
 */
function syncUIFromState() {
    const serverCountInput = document.getElementById('serverCount');
    const gpuSelect = document.getElementById('gpuType');
    const sidebar = document.getElementById('sidebar');
    const hwPanel = document.getElementById('hwFloatPanel');

    if (serverCountInput) serverCountInput.value = String(appState.serverCount);
    if (gpuSelect) gpuSelect.value = appState.gpuType;

    // 恢复面板折叠状态
    const icon = document.getElementById('toggleIcon');
    if (sidebar) {
        sidebar.classList.toggle('collapsed', appState.settings.sidebarCollapsed);
    }
    if (icon) {
        if (appState.settings.sidebarCollapsed) {
            icon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/>';
        } else {
            icon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"/>';
        }
    }
    if (hwPanel) {
        hwPanel.classList.toggle('collapsed', appState.settings.statsPanelCollapsed);
    }

    // 恢复标签状态
    const tab = appState.currentStatsTab;
    document.querySelectorAll('.stat-tab').forEach(el => {
        el.classList.toggle('active', el.dataset.tab === tab);
    });
}

/**
 * 初始化
 */
function init() {
    // 1. 加载持久化配置
    const loaded = loadSettings();

    // 2. 同步 UI
    syncUIFromState();

    // 3. 绑定事件
    bindToolbarEvents();
    bindInputEvents();
    bindInteractions();
    bindStatsPanelEvents();
    bindExportEvents();
    bindResetButton(() => {
        clearHardwareCache();
        generateTopology();
    });

    // 4. 初始生成
    generateTopology();

    // 5. 窗口 resize 处理（简单防抖）
    let resizeTimer = null;
    window.addEventListener('resize', () => {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            // 可选：resize 时重置 zoom
            // resetZoom();
        }, 300);
    });

    // 6. 页面卸载前保存
    window.addEventListener('beforeunload', () => {
        debouncedSave();
    });

    console.log('[AIDCTopology] Initialized', loaded ? '(settings loaded)' : '(defaults)');
}

// DOMReady 后启动
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
