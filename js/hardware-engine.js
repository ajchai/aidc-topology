/**
 * hardware-engine.js - B300 网络设备硬件计算引擎
 * 纯函数设计，输入确定则输出确定，支持 Memoization 缓存
 */

import {
    GPU_SPECS,
    SWITCH_SPECS,
    STORAGE_NIC_SPECS,
    STORAGE_RATIO,
    MODULES_TABLE,
    ARCHITECTURE
} from './config.js';

/** @typedef {{ role: string, model: string, count: number, desc: string }} SwitchItem */
/** @typedef {{ conn: string, model: string, count: number, desc: string }} ModuleItem */
/** @typedef {{ conn: string, model: string, count: number, desc: string }} CableItem */
/** @typedef {{ networkType: string, podCount: number, serversPerPod: number, leafSwitches: number, spineSwitches: number, coreSwitches: number, [key:string]: any }} ComputeMeta */
/** @typedef {{ storageNodes: number, totalStorageDownlink: number, storageLeaf: number, storageSpine: number, serverStoragePorts: number, storagePorts: number }} StorageMeta */
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
 * @param {Object} options
 * @returns {string}
 */
function _cacheKey(serverCount, gpuType, options = {}) {
    return `${gpuType}::${serverCount}::${options.serverStorageNic || ''}::${options.storageServerCount || 0}::${options.storageNic || ''}::${options.storageNicCount || 0}::${options.architecture || ''}`;
}

/**
 * 获取算力服务器存储网端口数
 * @param {string} serverStorageNic
 * @returns {number}
 */
function getServerStoragePorts(serverStorageNic) {
    const spec = STORAGE_NIC_SPECS[serverStorageNic];
    return spec ? spec.portCount : 1;
}

/**
 * 获取存储服务器端口数（单网卡端口数 * 网卡数量）
 * @param {string} storageNic
 * @param {number} storageNicCount
 * @returns {number}
 */
function getStoragePorts(storageNic, storageNicCount) {
    const spec = STORAGE_NIC_SPECS[storageNic];
    const portPerNic = spec ? spec.portCount : 1;
    return portPerNic * storageNicCount;
}

/**
 * 计算 B300 网络设备硬件清单
 * @param {number} serverCount
 * @param {string} gpuType - GPU 规格键，如 'B300_SXM6'
 * @param {Object} options - 可选参数
 * @param {string} [options.serverStorageNic='CX7_400G'] - 算力服务器存储网卡配置
 * @param {number} [options.storageServerCount=12] - 存储服务器数量
 * @param {string} [options.storageNic='CX7_400G'] - 存储网卡配置
 * @param {number} [options.storageNicCount=2] - 存储网卡数量
 * @param {string} [options.architecture='virtual-dual-plane'] - 组网架构
 * @returns {HardwareResult}
 */
export function calcHardware(serverCount, gpuType = 'B300_SXM6', options = {}) {
    const {
        serverStorageNic = 'CX7_400G',
        storageServerCount = 12,
        storageNic = 'CX7_400G',
        storageNicCount = 2,
        architecture = 'virtual-dual-plane'
    } = options;

    const key = _cacheKey(serverCount, gpuType, options);
    if (_cache.has(key)) {
        return _cache.get(key);
    }

    const gpuSpec = GPU_SPECS[gpuType] || GPU_SPECS.B300_SXM6;
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
    if (serverCount <= 64) { podCount = 1; serversPerPod = serverCount; }
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

    // ===== 存储网 =====
    // 使用菜单配置的存储服务器数量，不再硬编码配比
    const actualStorageNodes = storageServerCount;
    if (actualStorageNodes > 0 && serverCount >= 32) {
        // 算力服务器存储网端口总数
        const serverStoragePorts = getServerStoragePorts(serverStorageNic);
        const totalServerStorageDownlink = serverCount * serverStoragePorts;

        // 存储服务器存储网端口总数
        const storagePorts = getStoragePorts(storageNic, storageNicCount);
        const totalStorageNodeDownlink = actualStorageNodes * storagePorts;

        const totalStorageDownlink = totalServerStorageDownlink + totalStorageNodeDownlink;

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
                storageNodes: actualStorageNodes,
                totalStorageDownlink,
                storageLeaf,
                storageSpine,
                serverStoragePorts,
                storagePorts
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
