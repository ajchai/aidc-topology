/**
 * config.js - 全局配置管理层
 * 所有硬编码参数集中于此，便于维护与扩展
 */

/** @typedef {{ downlinksPerServer: number, leafDownlinkPorts: number, serversPerLeaf: number, railCount: number, nicSpeed: string }} GpuSpec */
/** @typedef {{ downlinkPorts: number, uplinkPorts: number, portSpeed: string, desc: string }} SwitchSpec */

/** GPU 规格配置表 */
export const GPU_SPECS = Object.freeze({
    A800_4: { downlinksPerServer: 8,  leafDownlinkPorts: 64, serversPerLeaf: 8,  railCount: 4, nicSpeed: '400G', label: 'NVIDIA A800 (4-Rail)' },
    H800_8: { downlinksPerServer: 16, leafDownlinkPorts: 64, serversPerLeaf: 4,  railCount: 8, nicSpeed: '800G', label: 'NVIDIA H800 (8-Rail)' },
    B300_8: { downlinksPerServer: 16, leafDownlinkPorts: 64, serversPerLeaf: 4,  railCount: 8, nicSpeed: '800G', label: 'NVIDIA B300 (8-Rail, 8x 800G)' }
});

/** 交换机规格配置表 */
export const SWITCH_SPECS = Object.freeze({
    'RG-S6990-128QC2XS': {
        downlinkPorts: 64,
        uplinkPorts: 64,
        portSpeed: '400G',
        desc: '64下行+64上行 400G'
    }
});

/** 存储网配比 GPU:Storage */
export const STORAGE_RATIO = Object.freeze({
    nodes: 96,
    base: 1024,
    serverPorts: 1,   // 每台B300 1个400G存储端口
    storageNodePorts: 2 // 每台存储节点 2个400G存储端口
});

/** 光模块与线缆型号对照表 */
export const MODULES_TABLE = Object.freeze({
    compute: {
        spineLeaf: { model: '400G-Q112-DR4-L',    desc: '双端, 单模' },
        serverLeafSw: { model: '400G-Q112-VR4-MM850', desc: '交换机侧, 多模' },
        serverLeafSrv: { model: '800G-OSFP-RHS-2VR4-MM850', desc: '服务器侧, 多模分支' }
    },
    storage: {
        spineLeaf: { model: '400G-Q112-DR4-L',    desc: '双端, 单模' },
        serverLeaf: { model: '400G-Q112-VR4-MM850', desc: '交换机侧, 多模' }
    },
    cables: {
        spineLeafCompute:  { model: 'MPO16-MPO16-SM-50M',  desc: '单模, 50m' },
        serverLeafCompute: { model: 'MPO-MPO-OM4-30M',     desc: '多模OM4, 30m' },
        spineLeafStorage:  { model: 'MPO-MPO-OM4-50M',     desc: '多模OM4, 50m' },
        serverLeafStorage: { model: 'MPO-MPO-OM4-30M',     desc: '多模OM4, 30m' }
    }
});

/** 布局常量 */
export const LAYOUT = Object.freeze({
    spineY: 150,
    leafY: 480,
    serverY: 880,
    baseCanvasWidth: 2800,
    podWidthFactor: 1400,
    spineBoxPadding: 400,   // 左右留白
    podPadding: 100,        // POD 内左右留白
    spineW: 200,
    spineH: 85,
    leafW: 70,
    leafH: 50,
    serverW: 280,
    serverH: 80,
    leafPairsPerPod: 8,       // 已被 layout-engine.js 动态计算覆盖，保留仅作向后兼容参考
    visualServers: 3,       // 每个POD展示的服务器数量（含省略）
    portCount: 8,           // 交换机端口装饰数量
    viewBoxDefault: { x: 0, y: 0, w: 2800, h: 1600 }
});

/** 存储网卡规格配置表 */
export const STORAGE_NIC_SPECS = Object.freeze({
    BF3_2x200G: { label: 'BF3 2 * 200G', speed: '200G', portCount: 2, totalBandwidth: '400G' },
    CX7_2x200G: { label: 'CX7 2 * 200G', speed: '200G', portCount: 2, totalBandwidth: '400G' },
    CX7_400G:   { label: 'CX7 400G',     speed: '400G', portCount: 1, totalBandwidth: '400G' }
});

/** 组网架构选项 */
export const ARCHITECTURE_TYPES = Object.freeze({
    'single-plane':         { label: '单平面组网',       planes: 1, mode: 'single' },
    'physical-dual-plane':  { label: '物理双平面组网',   planes: 2, mode: 'physical' },
    'virtual-dual-plane':   { label: '虚拟双平面组网',   planes: 2, mode: 'virtual' }
});

/** 架构常量 */
export const ARCHITECTURE = Object.freeze({
    TWO_TIER_MAX: 512,
    serversPerPod: 64
});

/** 颜色体系 */
export const COLORS = Object.freeze({
    blue: '#3b82f6',
    orange: '#f97316',
    amber: '#fbbf24',
    cyan: '#06b6d4',
    slate: {
        50: '#f8fafc', 100: '#f1f5f9', 200: '#e2e8f0', 300: '#cbd5e1',
        400: '#94a3b8', 500: '#64748b', 600: '#475569', 700: '#334155',
        800: '#1e293b', 900: '#0f172a', 950: '#020617'
    }
});
