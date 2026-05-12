/**
 * app.js - 主入口
 * 整合所有模块，完成初始化与事件绑定
 */

import { GPU_SPECS, STORAGE_RATIO, LAYOUT, ARCHITECTURE_TYPES, LINK_STYLE } from './config.js';
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
 * 实时应用连线样式（无需重新生成拓扑）
 */
function applyLinkStyle() {
    const linkLayer = document.getElementById('linkLayer');
    if (!linkLayer) return;
    const { opacity, strokeWidth } = appState.linkStyle;
    const links = linkLayer.querySelectorAll('.link-line');
    links.forEach(link => {
        link.style.opacity = String(opacity);
        link.setAttribute('stroke-width', String(strokeWidth));
    });
}

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
 * 根据算力服务器数量推荐存储服务器数量
 * @param {number} serverCount
 * @returns {number}
 */
function recommendStorageCount(serverCount) {
    return Math.max(1, Math.ceil(serverCount * STORAGE_RATIO.nodes / STORAGE_RATIO.base));
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
        const computeNicSelect = document.getElementById('computeNic');
        const serverStorageNicSelect = document.getElementById('serverStorageNic');
        const storageServerCountInput = document.getElementById('storageServerCount');
        const storageNicSelect = document.getElementById('storageNic');
        const storageNicCountSelect = document.getElementById('storageNicCount');
        const architectureSelect = document.getElementById('architecture');

        if (!serverCountInput || !gpuSelect) {
            console.error('Required DOM elements not found');
            return;
        }

        const rawCount = serverCountInput.value;
        const serverCount = normalizeServerCount(rawCount);
        const gpuType = gpuSelect.value;
        const gpuSpec = GPU_SPECS[gpuType] || GPU_SPECS.B300_SXM6;
        const railCount = gpuSpec.railCount;

        // 读取新增菜单项
        const computeNic = computeNicSelect?.value || 'CX8_800G';
        const serverStorageNic = serverStorageNicSelect?.value || 'CX7_400G';
        const storageServerCount = Math.max(0, parseInt(storageServerCountInput?.value) || 0);
        const storageNic = storageNicSelect?.value || 'CX7_400G';
        const storageNicCount = parseInt(storageNicCountSelect?.value) || 2;
        const architecture = architectureSelect?.value || 'virtual-dual-plane';

        // 同步输入框（如果输入了非法值）
        if (String(serverCount) !== String(rawCount)) {
            serverCountInput.value = String(serverCount);
        }

        // 构建选项对象
        const options = {
            computeNic,
            serverStorageNic,
            storageServerCount,
            storageNic,
            storageNicCount,
            architecture,
            linkStyle: { ...appState.linkStyle }
        };

        // 更新状态
        updateState({
            serverCount,
            gpuType,
            railCount,
            computeNic,
            serverStorageNic,
            storageServerCount,
            storageNic,
            storageNicCount,
            architecture,
            cachedHardwareData: null
        });

        // 计算硬件
        const hwData = calcHardware(serverCount, gpuType, options);
        updateState({ cachedHardwareData: hwData, cachedServerCount: serverCount });

        // 计算布局
        const layout = calcLayout(serverCount, gpuType, options);

        // 渲染
        renderTopology(layout, serverCount, railCount, options);

        // 更新统计面板
        renderSummary(serverCount, gpuType, railCount, hwData, options);

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
 * 算力服务器数量变化时，联动推荐存储服务器数量
 */
function onServerCountChange() {
    const serverCountInput = document.getElementById('serverCount');
    const storageServerCountInput = document.getElementById('storageServerCount');
    if (serverCountInput && storageServerCountInput) {
        const serverCount = parseInt(serverCountInput.value) || 128;
        const recommended = recommendStorageCount(serverCount);
        storageServerCountInput.value = String(recommended);
    }
    generateTopology();
}

/**
 * 绑定输入框事件
 */
function bindInputEvents() {
    const serverCountSelect = document.getElementById('serverCount');
    const gpuSelect = document.getElementById('gpuType');
    const computeNicSelect = document.getElementById('computeNic');
    const serverStorageNicSelect = document.getElementById('serverStorageNic');
    const storageServerCountInput = document.getElementById('storageServerCount');
    const storageNicSelect = document.getElementById('storageNic');
    const storageNicCountSelect = document.getElementById('storageNicCount');
    const architectureSelect = document.getElementById('architecture');

    if (serverCountSelect) {
        serverCountSelect.addEventListener('change', onServerCountChange);
    }

    if (gpuSelect) {
        gpuSelect.addEventListener('change', generateTopology);
    }

    if (computeNicSelect) {
        computeNicSelect.addEventListener('change', generateTopology);
    }

    if (serverStorageNicSelect) {
        serverStorageNicSelect.addEventListener('change', generateTopology);
    }

    if (storageServerCountInput) {
        storageServerCountInput.addEventListener('change', generateTopology);
        storageServerCountInput.addEventListener('input', generateTopology);
    }

    if (storageNicSelect) {
        storageNicSelect.addEventListener('change', generateTopology);
    }

    if (storageNicCountSelect) {
        storageNicCountSelect.addEventListener('change', generateTopology);
    }

    if (architectureSelect) {
        architectureSelect.addEventListener('change', () => {
            clearHardwareCache();
            generateTopology();
        });
    }

    // 连线样式滑块
    const linkOpacityRange = document.getElementById('linkOpacity');
    const linkOpacityVal = document.getElementById('linkOpacityVal');
    const linkStrokeWidthRange = document.getElementById('linkStrokeWidth');
    const linkStrokeWidthVal = document.getElementById('linkStrokeWidthVal');

    if (linkOpacityRange) {
        linkOpacityRange.addEventListener('input', () => {
            const val = parseFloat(linkOpacityRange.value);
            appState.linkStyle.opacity = val;
            if (linkOpacityVal) linkOpacityVal.textContent = Math.round(val * 100) + '%';
            applyLinkStyle();
            debouncedSave();
        });
    }

    if (linkStrokeWidthRange) {
        linkStrokeWidthRange.addEventListener('input', () => {
            const val = parseFloat(linkStrokeWidthRange.value);
            appState.linkStyle.strokeWidth = val;
            if (linkStrokeWidthVal) linkStrokeWidthVal.textContent = val.toFixed(1);
            applyLinkStyle();
            debouncedSave();
        });
    }
}

/**
 * 同步 UI 到状态（加载配置后）
 */
function syncUIFromState() {
    const serverCountInput = document.getElementById('serverCount');
    const gpuSelect = document.getElementById('gpuType');
    const computeNicSelect = document.getElementById('computeNic');
    const serverStorageNicSelect = document.getElementById('serverStorageNic');
    const storageServerCountInput = document.getElementById('storageServerCount');
    const storageNicSelect = document.getElementById('storageNic');
    const storageNicCountSelect = document.getElementById('storageNicCount');
    const architectureSelect = document.getElementById('architecture');
    const sidebar = document.getElementById('sidebar');
    const hwPanel = document.getElementById('hwFloatPanel');

    if (serverCountInput) serverCountInput.value = String(appState.serverCount);
    if (gpuSelect) gpuSelect.value = appState.gpuType;
    if (computeNicSelect) computeNicSelect.value = appState.computeNic;
    if (serverStorageNicSelect) serverStorageNicSelect.value = appState.serverStorageNic;
    if (storageServerCountInput) storageServerCountInput.value = String(appState.storageServerCount);
    if (storageNicSelect) storageNicSelect.value = appState.storageNic;
    if (storageNicCountSelect) storageNicCountSelect.value = String(appState.storageNicCount);
    if (architectureSelect) architectureSelect.value = appState.architecture;

    // 恢复连线样式控件
    const linkOpacityRange = document.getElementById('linkOpacity');
    const linkOpacityVal = document.getElementById('linkOpacityVal');
    const linkStrokeWidthRange = document.getElementById('linkStrokeWidth');
    const linkStrokeWidthVal = document.getElementById('linkStrokeWidthVal');

    if (linkOpacityRange) linkOpacityRange.value = String(appState.linkStyle.opacity);
    if (linkOpacityVal) linkOpacityVal.textContent = Math.round(appState.linkStyle.opacity * 100) + '%';
    if (linkStrokeWidthRange) linkStrokeWidthRange.value = String(appState.linkStyle.strokeWidth);
    if (linkStrokeWidthVal) linkStrokeWidthVal.textContent = appState.linkStyle.strokeWidth.toFixed(1);

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
