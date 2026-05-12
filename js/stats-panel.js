/**
 * stats-panel.js - 统计面板管理
 * 侧边栏摘要 + 浮动硬件统计面板
 */

import { appState, updateState, getGpuPrefix } from './state.js';
import { ARCHITECTURE_TYPES, STORAGE_NIC_SPECS, COMPUTE_NIC_SPECS } from './config.js';

/**
 * 切换侧边栏
 */
export function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const icon = document.getElementById('toggleIcon');
    if (!sidebar || !icon) return;

    const collapsed = sidebar.classList.toggle('collapsed');
    updateState({ settings: { ...appState.settings, sidebarCollapsed: collapsed } });

    if (collapsed) {
        icon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/>';
    } else {
        icon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"/>';
    }
}

/**
 * 切换浮动统计面板
 */
export function toggleStatsPanel() {
    const panel = document.getElementById('hwFloatPanel');
    const btn = document.getElementById('statsToggleBtn');
    if (!panel || !btn) return;

    const collapsed = panel.classList.toggle('collapsed');
    updateState({ settings: { ...appState.settings, statsPanelCollapsed: collapsed } });

    if (collapsed) {
        btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/></svg>';
    } else {
        btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>';
    }
}

/**
 * 切换统计标签
 * @param {string} tab
 */
export function switchStatsTab(tab) {
    updateState({ currentStatsTab: tab });
    document.querySelectorAll('.stat-tab').forEach(el => {
        el.classList.toggle('active', el.dataset.tab === tab);
    });
    if (appState.cachedHardwareData) {
        renderHardwareStats(appState.cachedHardwareData);
    }
}

/**
 * 渲染统计区块
 * @param {string} title
 * @param {Object} section
 * @returns {string}
 */
function renderStatsSection(title, section) {
    let html = '';

    // 架构摘要
    if (section.meta) {
        html += `<div class="p-2 bg-slate-800/60 rounded border border-slate-700/50 font-small text-slate-400 space-y-1">`;
        if (section.meta.networkType) {
            html += `<div class="flex justify-between"><span>网络架构:</span><span class="text-emerald-400 font-semibold">${section.meta.networkType}</span></div>`;
        }
        if (section.meta.podCount) {
            html += `<div class="flex justify-between"><span>POD 数量:</span><span class="text-white">${section.meta.podCount} 个 (${section.meta.serversPerPod}台/POD)</span></div>`;
        }
        if (section.meta.storageNodes !== undefined) {
            html += `<div class="flex justify-between"><span>存储节点:</span><span class="text-white">${section.meta.storageNodes} 台</span></div>`;
            html += `<div class="flex justify-between"><span>存储下行端口:</span><span class="text-white">${section.meta.totalStorageDownlink} 个</span></div>`;
            if (section.meta.serverStoragePorts !== undefined) {
                html += `<div class="flex justify-between"><span>算力存储端口/台:</span><span class="text-white">${section.meta.serverStoragePorts} 个</span></div>`;
            }
            if (section.meta.storagePorts !== undefined) {
                html += `<div class="flex justify-between"><span>存储端口/台:</span><span class="text-white">${section.meta.storagePorts} 个</span></div>`;
            }
        }
        html += `</div>`;
    }

    // 交换机
    const totalSwitches = section.switches.reduce((s, i) => s + i.count, 0);
    html += `<div>`;
    html += `<div class="stat-category flex justify-between">交换机 <span class="stat-total">共 ${totalSwitches} 台</span></div>`;
    section.switches.forEach(sw => {
        html += `<div class="stat-row"><span><span class="text-slate-300">${sw.role}</span> <span class="stat-model">${sw.model}</span></span><span class="stat-count">${sw.count}</span></div>`;
    });
    html += `</div>`;

    // 光模块
    const totalModules = section.modules.reduce((s, i) => s + i.count, 0);
    html += `<div>`;
    html += `<div class="stat-category flex justify-between">光模块 <span class="stat-total">共 ${totalModules.toLocaleString()} 只</span></div>`;
    section.modules.forEach(mod => {
        html += `<div class="stat-row"><span><span class="text-slate-300">${mod.conn}</span> <span class="stat-model">${mod.model}</span></span><span class="stat-count">${mod.count.toLocaleString()}</span></div>`;
        html += `<div class="font-tiny text-slate-500 pl-1">${mod.desc}</div>`;
    });
    html += `</div>`;

    // 线缆
    const totalCables = section.cables.reduce((s, i) => s + i.count, 0);
    html += `<div>`;
    html += `<div class="stat-category flex justify-between">线缆 <span class="stat-total">共 ${totalCables.toLocaleString()} 根</span></div>`;
    section.cables.forEach(cab => {
        html += `<div class="stat-row"><span><span class="text-slate-300">${cab.conn}</span> <span class="stat-model">${cab.model}</span></span><span class="stat-count">${cab.count.toLocaleString()}</span></div>`;
        html += `<div class="font-tiny text-slate-500 pl-1">${cab.desc}</div>`;
    });
    html += `</div>`;

    return html;
}

/**
 * 渲染硬件统计浮动面板
 * @param {Object} data
 */
export function renderHardwareStats(data) {
    updateState({ cachedHardwareData: data });
    const container = document.getElementById('statsContent');
    if (!container) return;

    if (appState.currentStatsTab === 'storage') {
        if (!data.storage) {
            container.innerHTML = '<div class="font-small text-slate-500 p-2.5 bg-slate-800/50 rounded border border-slate-700 text-center">存储网需要 ≥32 台服务器才会启用</div>';
            return;
        }
        container.innerHTML = renderStatsSection('存储网', data.storage);
    } else {
        container.innerHTML = renderStatsSection('计算网', data.compute);
    }
}

/**
 * 渲染侧边栏摘要
 * @param {number} serverCount
 * @param {string} gpuType
 * @param {number} railCount
 * @param {Object} hwData
 * @param {Object} options
 */
export function renderSummary(serverCount, gpuType, railCount, hwData, options = {}) {
    const panel = document.getElementById('summaryPanel');
    if (!panel) return;

    const cm = hwData.compute.meta;
    const gpuPrefix = getGpuPrefix();
    const archType = ARCHITECTURE_TYPES[options.architecture] || ARCHITECTURE_TYPES['virtual-dual-plane'];
    const computeNicSpec = COMPUTE_NIC_SPECS[options.computeNic || 'CX8_800G'];
    const serverStorageNicSpec = STORAGE_NIC_SPECS[options.serverStorageNic || 'CX7_400G'];
    const storageNicSpec = STORAGE_NIC_SPECS[options.storageNic || 'CX7_400G'];

    let summaryHtml = `
        <div class="p-2.5 bg-slate-800 rounded border border-slate-700">
            <div class="flex justify-between mb-1"><span class="text-slate-400">总算力节点:</span> <span class="text-white font-semibold">${serverCount} 台</span></div>
            <div class="flex justify-between mb-1"><span class="text-slate-400">GPU 芯片:</span> <span class="text-cyan-400 font-semibold">${serverCount * 8} 颗</span></div>
            <div class="flex justify-between mb-1"><span class="text-slate-400">算力网卡:</span> <span class="text-cyan-400 font-semibold">${computeNicSpec?.label || options.computeNic}</span></div>
            <div class="flex justify-between mb-1"><span class="text-slate-400">组网架构:</span> <span class="text-emerald-400 font-semibold">${archType.label}</span></div>`;

    if (options.architecture === 'virtual-dual-plane') {
        summaryHtml += `<div class="flex justify-between"><span class="text-slate-400">网络平面:</span> <span class="text-white">2 (蓝色/橙色, VRF虚拟)</span></div>`;
    } else if (options.architecture === 'physical-dual-plane') {
        summaryHtml += `<div class="flex justify-between"><span class="text-slate-400">网络平面:</span> <span class="text-white">2 (蓝色/橙色, 物理独立)</span></div>`;
    } else {
        summaryHtml += `<div class="flex justify-between"><span class="text-slate-400">网络平面:</span> <span class="text-white">1 (蓝色, 单平面)</span></div>`;
    }
    summaryHtml += `</div>`;

    // 计算网信息
    summaryHtml += `
        <div class="p-2.5 bg-slate-800 rounded border border-slate-700 mt-1.5">
            <div class="flex justify-between mb-1"><span class="text-slate-400">网络架构:</span> <span class="text-emerald-400 font-semibold">${cm.networkType}</span></div>
            <div class="flex justify-between mb-1"><span class="text-slate-400">划分 POD 数:</span> <span class="text-white">${cm.podCount} 个 (${cm.serversPerPod}台/POD)</span></div>
            <div class="flex justify-between mb-1"><span class="text-slate-400">Leaf 交换机:</span> <span class="text-white">${cm.leafSwitches} 台</span></div>
            <div class="flex justify-between mb-1"><span class="text-slate-400">Spine 交换机:</span> <span class="text-white">${cm.spineSwitches} 台</span></div>
            ${cm.coreSwitches > 0 ? `<div class="flex justify-between mb-1"><span class="text-slate-400">Core 交换机:</span> <span class="text-white">${cm.coreSwitches} 台</span></div>` : ''}
            <div class="flex justify-between"><span class="text-slate-400">核心架构:</span> <span class="text-emerald-400">${options.architecture === 'virtual-dual-plane' ? '去堆叠 Bond' : options.architecture === 'physical-dual-plane' ? '物理双平面' : '单平面'}</span></div>
        </div>`;

    // 存储网信息
    const storageCount = options.storageServerCount || 0;
    if (storageCount > 0 && hwData.storage) {
        const sm = hwData.storage.meta;
        summaryHtml += `
        <div class="p-2.5 bg-slate-800 rounded border border-slate-700 mt-1.5">
            <div class="font-tiny text-emerald-400 font-semibold mb-1">存储网</div>
            <div class="flex justify-between mb-1"><span class="text-slate-400">存储服务器:</span> <span class="text-white">${storageCount} 台</span></div>
            <div class="flex justify-between mb-1"><span class="text-slate-400">算力存储网卡:</span> <span class="text-white">${serverStorageNicSpec?.label || 'CX7 400G'}</span></div>
            <div class="flex justify-between mb-1"><span class="text-slate-400">存储网卡:</span> <span class="text-white">${storageNicSpec?.label || 'CX7 400G'} ×${options.storageNicCount || 2}</span></div>
            <div class="flex justify-between mb-1"><span class="text-slate-400">存储Leaf:</span> <span class="text-white">${sm.storageLeaf} 台</span></div>
            <div class="flex justify-between"><span class="text-slate-400">存储Spine:</span> <span class="text-white">${sm.storageSpine} 台</span></div>
        </div>`;
    }

    panel.innerHTML = summaryHtml;

    // B300 才显示浮动统计面板
    const statsContainer = document.getElementById('hardwareStatsContainer');
    if (statsContainer) {
        if (gpuPrefix === 'B300') {
            statsContainer.classList.remove('hidden');
            renderHardwareStats(hwData);
        } else {
            statsContainer.classList.add('hidden');
        }
    }
}

/**
 * 绑定统计面板事件
 */
export function bindStatsPanelEvents() {
    const sidebarToggle = document.getElementById('sidebarToggle');
    const statsHeader = document.getElementById('statsPanelHeader');
    const tabCompute = document.getElementById('tabCompute');
    const tabStorage = document.getElementById('tabStorage');

    if (sidebarToggle) sidebarToggle.addEventListener('click', toggleSidebar);
    if (statsHeader) statsHeader.addEventListener('click', toggleStatsPanel);
    if (tabCompute) tabCompute.addEventListener('click', () => switchStatsTab('compute'));
    if (tabStorage) tabStorage.addEventListener('click', () => switchStatsTab('storage'));
}
