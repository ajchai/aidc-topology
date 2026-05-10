/**
 * hardware-engine.js - B300 网络设备硬件计算引擎
 * 纯函数设计，输入确定则输出确定，支持 Memoization 缓存
 */

import {
    GPU_SPECS,
    SWITCH_SPECS,
    STORAGE_RATIO,
    MODULES_TABLE,
    ARCHITECTURE
} from './config.js';

/** @typedef {{ role: string, model: string, count: number, desc: string }} SwitchItem */
/** @typedef {{ conn: string, model: string, count: number, desc: string }} ModuleItem */
/** @typedef {{ conn: string, model: string, count: number, desc: string }} CableItem */
/** @typedef {{ networkType: string, podCount: number, serversPerPod: number, leafSwitches: number, spineSwitches: number, coreSwitches: number, [key:string]: any }} ComputeMeta */
/** @typedef {{ storageNodes: number, totalStorageDownlink: number, storageLeaf: number, storageSpine: number }} StorageMeta */
/** @typedef {{ switches: SwitchItem[], modules: ModuleItem[], cables: CableItem[], meta: ComputeMeta }} ComputeSection */
/** @typedef {{ switches: SwitchItem[], modules: ModuleItem[], cables: CableItem[], meta: StorageMeta }} StorageSection */
/** @typedef {{ compute: ComputeSection, storage: StorageSection|null }} HardwareResult */

// Memoization 缓存 Map
const _cache = new Map();

/**
 * 计算下一个 2 的幂
 * @param {number} n
 * @returns {number}
 */
function nextPowerOf2(n) {
    if (n <= 0) return 1;
    return Math.pow(2, Math.ceil(Math.log2(n)));
}

/**
 * 生成缓存键
 * @param {number} serverCount
 * @param {string} gpuType
 * @returns {string}
 */
function _cacheKey(serverCount, gpuType) {
    return `${gpuType}::${serverCount}`;
}

/**
 * 计算 B300 网络设备硬件清单
 * @param {number} serverCount
 * @param {string} gpuType - GPU 规格键，如 'B300_8'
 * @returns {HardwareResult}
 */
export function calcHardware(serverCount, gpuType = 'B300_8') {
    const key = _cacheKey(serverCount, gpuType);
    if (_cache.has(key)) {
        return _cache.get(key);
    }

    const gpuSpec = GPU_SPECS[gpuType] || GPU_SPECS.B300_8;
    const swSpec = SWITCH_SPECS['RG-S6990-128QC2XS'];
    const result = { compute: /** @type {ComputeSection} */(null), storage: /** @type {StorageSection|null} */(null) };

    // ===== 计算网 =====
    const downlinksPerServer = gpuSpec.downlinksPerServer;
    const leafDownlinkPorts = gpuSpec.leafDownlinkPorts;
    const serversPerLeaf = leafDownlinkPorts / downlinksPerServer;

    // Leaf 数量
    let leafSwitches = Math.ceil(serverCount / serversPerLeaf);
    if (leafSwitches % 2 !== 0) leafSwitches += 1;

    // Spine / Core 数量
    let spineSwitches = 0;
    let coreSwitches = 0;
    let networkType = '';

    if (serverCount <= ARCHITECTURE.TWO_TIER_MAX) {
        spineSwitches = nextPowerOf2(Math.ceil(leafSwitches / 2));
        networkType = 'Two-Tier (Leaf-Spine)';
    } else {
        spineSwitches = leafSwitches;
        coreSwitches = nextPowerOf2(Math.ceil(spineSwitches / 2));
        networkType = 'Three-Tier (Leaf-Spine-Core)';
    }

    // 计算网交换机列表
    const computeSwitches = /** @type {SwitchItem[]} */([]);
    computeSwitches.push({
        role: 'Leaf',
        model: 'RG-S6990-128QC2XS',
        count: leafSwitches,
        desc: `${leafDownlinkPorts}下行+${leafDownlinkPorts}上行 400G`
    });
    computeSwitches.push({
        role: 'Spine',
        model: 'RG-S6990-128QC2XS',
        count: spineSwitches,
        desc: `${leafDownlinkPorts * 2} 400G全互联`
    });
    if (coreSwitches > 0) {
        computeSwitches.push({
            role: 'Core',
            model: 'RG-S6990-128QC2XS',
            count: coreSwitches,
            desc: '核心层汇聚'
        });
    }

    // 计算网光模块
    const computeModules = /** @type {ModuleItem[]} */([]);
    const ct = MODULES_TABLE.compute;
    // Spine↔Leaf: 双端计算
    const spineLeafModuleCount = leafSwitches * leafDownlinkPorts * 2;
    computeModules.push({ conn: 'Spine↔Leaf', model: ct.spineLeaf.model, count: spineLeafModuleCount, desc: ct.spineLeaf.desc });
    // Server↔Leaf: 交换机侧
    const serverLeafModuleCount = serverCount * downlinksPerServer;
    computeModules.push({ conn: 'Server↔Leaf', model: ct.serverLeafSw.model, count: serverLeafModuleCount, desc: ct.serverLeafSw.desc });
    // Server↔Leaf: 服务器侧 (800G分支模块, 每台配8个)
    const serverSideModuleCount = serverCount * 8;
    computeModules.push({ conn: 'Server↔Leaf', model: ct.serverLeafSrv.model, count: serverSideModuleCount, desc: ct.serverLeafSrv.desc });

    // 计算网线缆
    const computeCables = /** @type {CableItem[]} */([]);
    const cab = MODULES_TABLE.cables;
    computeCables.push({ conn: 'Spine↔Leaf', model: cab.spineLeafCompute.model, count: leafSwitches * leafDownlinkPorts, desc: cab.spineLeafCompute.desc });
    computeCables.push({ conn: 'Server↔Leaf', model: cab.serverLeafCompute.model, count: serverCount * downlinksPerServer, desc: cab.serverLeafCompute.desc });

    // POD 划分
    let podCount = 1;
    let serversPerPod = serverCount;
    if (serverCount <= 32) { podCount = 1; serversPerPod = serverCount; }
    else if (serverCount <= 64) { podCount = 2; serversPerPod = 32; }
    else if (serverCount <= 128) { podCount = 2; serversPerPod = 64; }
    else if (serverCount <= 256) { podCount = Math.ceil(serverCount / 32); serversPerPod = 32; }
    else { podCount = Math.ceil(serverCount / 64); serversPerPod = 64; }

    result.compute = {
        switches: computeSwitches,
        modules: computeModules,
        cables: computeCables,
        meta: {
            networkType,
            podCount,
            serversPerPod,
            leafSwitches,
            spineSwitches,
            coreSwitches
        }
    };

    // ===== 存储网 (serverCount >= 32) =====
    if (serverCount >= 32) {
        const storageNodes = Math.ceil(serverCount * STORAGE_RATIO.nodes / STORAGE_RATIO.base);
        const totalStorageDownlink = serverCount * STORAGE_RATIO.serverPorts + storageNodes * STORAGE_RATIO.storageNodePorts;

        let storageLeaf = Math.ceil(totalStorageDownlink / leafDownlinkPorts);
        if (storageLeaf % 2 !== 0) storageLeaf += 1;

        let storageSpine = Math.max(2, nextPowerOf2(Math.ceil(storageLeaf / 2)));

        const storageSwitches = /** @type {SwitchItem[]} */([]);
        storageSwitches.push({
            role: 'Leaf',
            model: 'RG-S6990-128QC2XS',
            count: storageLeaf,
            desc: `${leafDownlinkPorts}下行+${leafDownlinkPorts}上行 400G`
        });
        storageSwitches.push({
            role: 'Spine',
            model: 'RG-S6990-128QC2XS',
            count: storageSpine,
            desc: `${leafDownlinkPorts * 2} 400G全互联`
        });

        const storageModules = /** @type {ModuleItem[]} */([]);
        const st = MODULES_TABLE.storage;
        const storageLeafSpineModuleCount = storageLeaf * leafDownlinkPorts * 2;
        storageModules.push({ conn: 'Spine↔Leaf', model: st.spineLeaf.model, count: storageLeafSpineModuleCount, desc: st.spineLeaf.desc });
        storageModules.push({ conn: 'Server↔Leaf', model: st.serverLeaf.model, count: totalStorageDownlink, desc: st.serverLeaf.desc });

        const storageCables = /** @type {CableItem[]} */([]);
        storageCables.push({ conn: 'Spine↔Leaf', model: cab.spineLeafStorage.model, count: storageLeaf * leafDownlinkPorts, desc: cab.spineLeafStorage.desc });
        storageCables.push({ conn: 'Server↔Leaf', model: cab.serverLeafStorage.model, count: totalStorageDownlink, desc: cab.serverLeafStorage.desc });

        result.storage = {
            switches: storageSwitches,
            modules: storageModules,
            cables: storageCables,
            meta: {
                storageNodes,
                totalStorageDownlink,
                storageLeaf,
                storageSpine
            }
        };
    }

    _cache.set(key, result);
    return result;
}

/**
 * 清除硬件计算缓存
 */
export function clearHardwareCache() {
    _cache.clear();
}

/**
 * 获取缓存统计（调试用）
 * @returns {{ size: number, keys: string[] }}
 */
export function getCacheStats() {
    return { size: _cache.size, keys: Array.from(_cache.keys()) };
}
