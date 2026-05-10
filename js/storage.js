/**
 * storage.js - 配置持久化
 * 使用 localStorage 保存/恢复用户配置
 */

import { appState, updateState, resetViewBox } from './state.js';
import { LAYOUT } from './config.js';

const STORAGE_KEY = 'aidc-topology-settings';

/**
 * 获取默认配置
 * @returns {Object}
 */
function getDefaults() {
    return {
        serverCount: 128,
        gpuType: 'B300_8',
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
        const currentStatsTab = ['compute', 'storage'].includes(parsed.currentStatsTab)
            ? parsed.currentStatsTab
            : defaults.currentStatsTab;

        updateState({
            serverCount,
            gpuType,
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
        currentStatsTab: defaults.currentStatsTab,
        viewBox: { ...defaults.viewBox },
        cachedHardwareData: null,
        cachedServerCount: null,
        settings: { ...defaults.settings }
    });

    // 同步 UI
    const serverInput = document.getElementById('serverCount');
    const gpuSelect = document.getElementById('gpuType');
    if (serverInput) serverInput.value = String(defaults.serverCount);
    if (gpuSelect) gpuSelect.value = defaults.gpuType;

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
