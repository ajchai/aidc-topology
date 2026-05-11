/**
 * state.js - 全局状态管理
 * 集中管理应用状态，替代原散落的全局变量
 */

import { LAYOUT } from './config.js';

/**
 * @typedef {Object} ViewBox
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 */

/**
 * @typedef {Object} AppState
 * @property {number} serverCount
 * @property {string} gpuType
 * @property {number} railCount
 * @property {ViewBox} viewBox
 * @property {Object|null} cachedHardwareData
 * @property {string} currentStatsTab
 * @property {boolean} isDragging
 * @property {{x:number,y:number}} dragStart
 * @property {number} zoomFactor
 * @property {Object} settings
 */

/** @type {AppState} */
export const appState = {
    serverCount: 128,
    gpuType: 'B300_8',
    railCount: 8,
    serverStorageNic: 'CX7_400G',      // 算力服务器存储网卡配置
    storageServerCount: 12,              // 存储服务器数量
    storageNic: 'CX7_400G',             // 存储网卡配置
    storageNicCount: 2,                  // 存储网卡数量
    architecture: 'virtual-dual-plane',  // 组网架构
    viewBox: { ...LAYOUT.viewBoxDefault },
    cachedHardwareData: null,
    cachedServerCount: null,  // 用于判断缓存是否命中
    currentStatsTab: 'compute',
    isDragging: false,
    dragStart: { x: 0, y: 0 },
    zoomFactor: 1.15,
    settings: {
        sidebarCollapsed: false,
        statsPanelCollapsed: false
    }
};

/**
 * 更新状态（浅合并）
 * @param {Partial<AppState>} patch
 */
export function updateState(patch) {
    Object.assign(appState, patch);
}

/**
 * 重置 viewBox 到默认值
 */
export function resetViewBox() {
    appState.viewBox = { ...LAYOUT.viewBoxDefault };
}

/**
 * 获取当前 GPU 规格前缀（如 'B300'）
 * @returns {string}
 */
export function getGpuPrefix() {
    return appState.gpuType.split('_')[0];
}
