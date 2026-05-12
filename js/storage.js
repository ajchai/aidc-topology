/**
 * storage.js - 配置持久化
 * 使用 localStorage 保存/恢复用户配置
 */

import { appState, updateState, resetViewBox } from './state.js';
import { LAYOUT } from './config.js';

const STORAGE_KEY = 'aidc-topology-settings';

const VALID_COMPUTE_NIC_TYPES = ['CX8_800G', 'CX8_2x400G', 'CX7_400G'];
const VALID_NIC_TYPES = ['BF3_2x200G', 'CX7_2x200G', 'CX7_400G'];
const VALID_ARCHITECTURES = ['single-plane', 'physical-dual-plane', 'virtual-dual-plane'];
const VALID_NIC_COUNTS = [1, 2, 4];

/**
 * 获取默认配置
 * @returns {Object}
 */
function getDefaults() {
    return {
        serverCount: 128,
        gpuType: 'B300_SXM6',
        computeNic: 'CX8_800G',
        serverStorageNic: 'CX7_400G',
        storageServerCount: 12,
        storageNic: 'CX7_400G',
        storageNicCount: 2,
        architecture: 'virtual-dual-plane',
        currentStatsTab: 'compute',
        linkStyle: { opacity: 0.60, strokeWidth: 2.0 },
        viewBox: { ...LAYOUT.viewBoxDefault },
        settings: {
            sidebarCollapsed: false,
            statsPanelCollapsed: false
        }
    };
}

/**
 * 保存当前配置到 localStorage
 */
export function saveSettings() {
    try {
        const payload = {
            serverCount: appState.serverCount,
            gpuType: appState.gpuType,
            computeNic: appState.computeNic,
            serverStorageNic: appState.serverStorageNic,
            storageServerCount: appState.storageServerCount,
            storageNic: appState.storageNic,
            storageNicCount: appState.storageNicCount,
            architecture: appState.architecture,
            currentStatsTab: appState.currentStatsTab,
            linkStyle: { ...appState.linkStyle },
            viewBox: { ...appState.viewBox },
            settings: { ...appState.settings }
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
        console.warn('Failed to save settings:', e);
    }
}

/**
 * 从 localStorage 加载配置
 * @returns {boolean} 是否成功加载
 */
export function loadSettings() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return false;

        const parsed = JSON.parse(raw);
        const defaults = getDefaults();

        // 合并并校验
        const serverCount = Math.min(2048, Math.max(1, Number(parsed.serverCount) || defaults.serverCount));
        const gpuType = ['B300_SXM6', 'B200_SXM6', 'H200_SXM5'].includes(parsed.gpuType)
            ? parsed.gpuType
            : defaults.gpuType;
        const computeNic = VALID_COMPUTE_NIC_TYPES.includes(parsed.computeNic)
            ? parsed.computeNic
            : defaults.computeNic;
        const serverStorageNic = VALID_NIC_TYPES.includes(parsed.serverStorageNic)
            ? parsed.serverStorageNic
            : defaults.serverStorageNic;
        const storageServerCount = Math.min(1024, Math.max(0, Number(parsed.storageServerCount) ?? defaults.storageServerCount));
        const storageNic = VALID_NIC_TYPES.includes(parsed.storageNic)
            ? parsed.storageNic
            : defaults.storageNic;
        const storageNicCount = VALID_NIC_COUNTS.includes(Number(parsed.storageNicCount))
            ? Number(parsed.storageNicCount)
            : defaults.storageNicCount;
        const architecture = VALID_ARCHITECTURES.includes(parsed.architecture)
            ? parsed.architecture
            : defaults.architecture;
        const currentStatsTab = ['compute', 'storage'].includes(parsed.currentStatsTab)
            ? parsed.currentStatsTab
            : defaults.currentStatsTab;
        const linkStyle = {
            opacity: Math.min(1, Math.max(0.03, Number(parsed.linkStyle?.opacity) ?? defaults.linkStyle.opacity)),
            strokeWidth: Math.min(4, Math.max(0.5, Number(parsed.linkStyle?.strokeWidth) ?? defaults.linkStyle.strokeWidth))
        };

        updateState({
            serverCount,
            gpuType,
            computeNic,
            serverStorageNic,
            storageServerCount,
            storageNic,
            storageNicCount,
            architecture,
            currentStatsTab,
            linkStyle,
            viewBox: parsed.viewBox || { ...defaults.viewBox },
            settings: {
                sidebarCollapsed: !!parsed.settings?.sidebarCollapsed,
                statsPanelCollapsed: !!parsed.settings?.statsPanelCollapsed
            }
        });

        return true;
    } catch (e) {
        console.warn('Failed to load settings:', e);
        return false;
    }
}

/**
 * 重置为默认配置
 */
export function resetSettings() {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
        console.warn('Failed to clear settings:', e);
    }

    const defaults = getDefaults();
    updateState({
        serverCount: defaults.serverCount,
        gpuType: defaults.gpuType,
        computeNic: defaults.computeNic,
        serverStorageNic: defaults.serverStorageNic,
        storageServerCount: defaults.storageServerCount,
        storageNic: defaults.storageNic,
        storageNicCount: defaults.storageNicCount,
        architecture: defaults.architecture,
        currentStatsTab: defaults.currentStatsTab,
        linkStyle: { ...defaults.linkStyle },
        viewBox: { ...defaults.viewBox },
        cachedHardwareData: null,
        cachedServerCount: null,
        settings: { ...defaults.settings }
    });

    // 同步 UI
    const serverInput = document.getElementById('serverCount');
    const gpuSelect = document.getElementById('gpuType');
    const computeNicSelect = document.getElementById('computeNic');
    const serverStorageNicSelect = document.getElementById('serverStorageNic');
    const storageServerCountInput = document.getElementById('storageServerCount');
    const storageNicSelect = document.getElementById('storageNic');
    const storageNicCountSelect = document.getElementById('storageNicCount');
    const architectureSelect = document.getElementById('architecture');

    if (serverInput) serverInput.value = String(defaults.serverCount);
    if (gpuSelect) gpuSelect.value = defaults.gpuType;
    if (computeNicSelect) computeNicSelect.value = defaults.computeNic;
    if (serverStorageNicSelect) serverStorageNicSelect.value = defaults.serverStorageNic;
    if (storageServerCountInput) storageServerCountInput.value = String(defaults.storageServerCount);
    if (storageNicSelect) storageNicSelect.value = defaults.storageNic;
    if (storageNicCountSelect) storageNicCountSelect.value = String(defaults.storageNicCount);
    if (architectureSelect) architectureSelect.value = defaults.architecture;

    // 重置连线样式控件
    const linkOpacityRange = document.getElementById('linkOpacity');
    const linkOpacityVal = document.getElementById('linkOpacityVal');
    const linkStrokeWidthRange = document.getElementById('linkStrokeWidth');
    const linkStrokeWidthVal = document.getElementById('linkStrokeWidthVal');

    if (linkOpacityRange) linkOpacityRange.value = String(defaults.linkStyle.opacity);
    if (linkOpacityVal) linkOpacityVal.textContent = Math.round(defaults.linkStyle.opacity * 100) + '%';
    if (linkStrokeWidthRange) linkStrokeWidthRange.value = String(defaults.linkStyle.strokeWidth);
    if (linkStrokeWidthVal) linkStrokeWidthVal.textContent = defaults.linkStyle.strokeWidth.toFixed(1);

    // 重置面板状态
    const sidebar = document.getElementById('sidebar');
    const hwPanel = document.getElementById('hwFloatPanel');
    if (sidebar) sidebar.classList.remove('collapsed');
    if (hwPanel) hwPanel.classList.remove('collapsed');

    // 触发重新生成
    return defaults;
}

/**
 * 绑定重置按钮
 * @param {Function} onReset - 重置后的回调
 */
export function bindResetButton(onReset) {
    const btn = document.getElementById('btnResetSettings');
    if (!btn) return;

    btn.addEventListener('click', () => {
        if (confirm('确定要重置为默认配置吗？')) {
            resetSettings();
            if (onReset) onReset();
        }
    });
}

/**
 * 防抖保存（避免频繁写入 localStorage）
 */
let saveTimer = null;
export function debouncedSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveSettings, 500);
}
