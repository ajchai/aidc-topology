/**
 * storage.js - 配置持久化
 * 使用 localStorage 保存/恢复用户配置
 */

import { appState, updateState, resetViewBox } from './state.js';
import { LAYOUT } from './config.js';

const STORAGE_KEY = 'aidc-topology-settings';

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
        gpuType: 'B300_8',
        serverStorageNic: 'CX7_400G',
        storageServerCount: 12,
        storageNic: 'CX7_400G',
        storageNicCount: 2,
        architecture: 'virtual-dual-plane',
        currentStatsTab: 'compute',
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
            serverStorageNic: appState.serverStorageNic,
            storageServerCount: appState.storageServerCount,
            storageNic: appState.storageNic,
            storageNicCount: appState.storageNicCount,
            architecture: appState.architecture,
            currentStatsTab: appState.currentStatsTab,
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
        const gpuType = ['A800_4', 'H800_8', 'B300_8'].includes(parsed.gpuType)
            ? parsed.gpuType
            : defaults.gpuType;
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

        updateState({
            serverCount,
            gpuType,
            serverStorageNic,
            storageServerCount,
            storageNic,
            storageNicCount,
            architecture,
            currentStatsTab,
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
        serverStorageNic: defaults.serverStorageNic,
        storageServerCount: defaults.storageServerCount,
        storageNic: defaults.storageNic,
        storageNicCount: defaults.storageNicCount,
        architecture: defaults.architecture,
        currentStatsTab: defaults.currentStatsTab,
        viewBox: { ...defaults.viewBox },
        cachedHardwareData: null,
        cachedServerCount: null,
        settings: { ...defaults.settings }
    });

    // 同步 UI
    const serverInput = document.getElementById('serverCount');
    const gpuSelect = document.getElementById('gpuType');
    const serverStorageNicSelect = document.getElementById('serverStorageNic');
    const storageServerCountInput = document.getElementById('storageServerCount');
    const storageNicSelect = document.getElementById('storageNic');
    const storageNicCountSelect = document.getElementById('storageNicCount');
    const architectureSelect = document.getElementById('architecture');

    if (serverInput) serverInput.value = String(defaults.serverCount);
    if (gpuSelect) gpuSelect.value = defaults.gpuType;
    if (serverStorageNicSelect) serverStorageNicSelect.value = defaults.serverStorageNic;
    if (storageServerCountInput) storageServerCountInput.value = String(defaults.storageServerCount);
    if (storageNicSelect) storageNicSelect.value = defaults.storageNic;
    if (storageNicCountSelect) storageNicCountSelect.value = String(defaults.storageNicCount);
    if (architectureSelect) architectureSelect.value = defaults.architecture;

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
