/**
 * layout-engine.js - 布局计算引擎
 * 负责坐标计算、POD 划分、压缩显示策略
 * 输出纯数据结构，供 svg-renderer.js 消费
 */

import { LAYOUT, ARCHITECTURE, ARCHITECTURE_TYPES, GPU_SPECS, COMPUTE_NIC_SPECS } from './config.js';
import { calcHardware } from './hardware-engine.js';

/** @typedef {{ type: 'rect'|'text'|'line', [key:string]: any }} BgElement */
/** @typedef {{ type: 'virtualSpine'|'physicalSpine'|'physicalSpineP1'|'physicalSpineP2'|'singleSpine'|'gap', idx?: number, count?: number, x: number, y: number, width: number, height: number, id?: string, label?: string, tooltip?: string, p1x?: number, p2x?: number, bottomY?: number }} SpineNode */
/** @typedef {{ type: 'leafPair'|'gap', groupIdx?: number, count?: number, x: number, y: number, l1Id: string, l2Id: string, l1Label: string, l2Label: string, p1x: number, p2x: number, bottomY: number, podIndex: number, tooltipL1: string, tooltipL2: string }} LeafNode */
/** @typedef {{ type: 'server'|'gap'|'ellipsis', idx?: string, x: number, y: number, width: number, height: number, id: string, label: string, tooltip: string, railCount: number }} ServerNode */
/** @typedef {{ x1: number, y1: number, x2: number, y2: number, color: string, classes: string }} LinkSegment */
/** @typedef {{ podIndex: number, bgRect: Object, podLabel: Object, podSubLabel: Object, leafNodes: LeafNode[], serverNodes: ServerNode[] }} PodLayout */
/** @typedef {{ dimensions: {width:number,height:number}, bgElements: BgElement[], spineNodes: SpineNode[], pods: PodLayout[], links: LinkSegment[], visibleLeafGroupIds: Set<number>, architecture: string }} TopologyLayout */

/**
 * 构建压缩显示位置数组
 * @param {number} totalCount
 * @returns {Array<{type:'item'|'gap', idx?:number, count?:number}>}
 */
function buildCompressedPositions(totalCount) {
    if (totalCount <= 3) {
        return Array.from({ length: totalCount }, (_, i) => ({ type: 'item', idx: i + 1 }));
    }
    return [
        { type: 'item', idx: 1 },
        { type: 'item', idx: 2 },
        { type: 'gap', count: totalCount - 3 },
        { type: 'item', idx: totalCount }
    ];
}

/**
 * 构建 POD 压缩显示位置数组
 * @param {number} podCount
 * @returns {Array<{type:'pod'|'gap', actualIndex?:number, count?:number}>}
 */
function buildPodPositions(podCount) {
    if (podCount <= 2) {
        return Array.from({ length: podCount }, (_, i) => ({ type: 'pod', actualIndex: i }));
    }
    const omitted = podCount - 3;
    const positions = [
        { type: 'pod', actualIndex: 0 },           // POD 1
        { type: 'pod', actualIndex: 1 }            // POD 2
    ];
    if (omitted > 0) {
        positions.push({ type: 'gap', count: omitted }); // 省略标记
    }
    positions.push({ type: 'pod', actualIndex: podCount - 1 }); // 最后一个 POD
    return positions;
}

/**
 * 获取架构显示信息
 * @param {string} architecture
 * @returns {{ label: string, desc: string, planes: number, mode: string }}
 */
function getArchDisplayInfo(architecture) {
    const archType = ARCHITECTURE_TYPES[architecture] || ARCHITECTURE_TYPES['virtual-dual-plane'];
    switch (architecture) {
        case 'single-plane':
            return { ...archType, label: '单平面组网', desc: '单平面 [全蓝]' };
        case 'physical-dual-plane':
            return { ...archType, label: '物理双平面组网', desc: '物理双平面 [蓝/橙分离]' };
        case 'virtual-dual-plane':
        default:
            return { ...archType, label: '虚拟双平面组网', desc: '物理单机·虚拟双平面 [VRF逃生]' };
    }
}

/**
 * 计算拓扑布局
 * @param {number} serverCount
 * @param {string} gpuType
 * @param {Object} options
 * @param {string} [options.architecture='virtual-dual-plane']
 * @returns {TopologyLayout}
 */
export function calcLayout(serverCount, gpuType, options = {}) {
    const { architecture = 'virtual-dual-plane', computeNic = 'CX8_800G' } = options;
    const archInfo = getArchDisplayInfo(architecture);
    const computeNicSpec = COMPUTE_NIC_SPECS[computeNic];
    const computeNicLabel = computeNicSpec ? computeNicSpec.label : computeNic;
    const isSinglePlane = archInfo.mode === 'single';
    const isVirtualDual = archInfo.mode === 'virtual';
    const isPhysicalDual = archInfo.mode === 'physical';

    const gpuSpec = GPU_SPECS[gpuType];
    const parts = gpuType.split('_');
    const railCount = gpuSpec?.railCount || 8;

    const hwData = calcHardware(serverCount, gpuType, options);
    const cm = hwData.compute.meta;
    const actualSpineCount = cm.spineSwitches;
    const podCount = cm.podCount;
    const leafGroupsPerPod = isSinglePlane ? Math.ceil(cm.leafSwitches / podCount) : Math.ceil(cm.leafSwitches / podCount / 2);

    const spineY = LAYOUT.spineY;
    const leafY = LAYOUT.leafY;
    const serverY = LAYOUT.serverY;

    // POD 压缩位置计算
    const podPositions = buildPodPositions(podCount);
    const normalPodCount = podPositions.filter(p => p.type === 'pod').length;
    const podGapCount = podPositions.filter(p => p.type === 'gap').length;

    // 画布宽度 = 正常POD标准宽度总和 + gap窄宽度总和
    const canvasWidth = Math.max(
        LAYOUT.baseCanvasWidth,
        normalPodCount * LAYOUT.podWidthFactor + podGapCount * LAYOUT.podGapWidth
    );
    const spineBoxWidth = canvasWidth - LAYOUT.spineBoxPadding;

    // 正常POD均分剩余空间（扣除gap固定宽度后）
    const normalPodWidth = podGapCount > 0 && normalPodCount > 0
        ? (spineBoxWidth - podGapCount * LAYOUT.podGapWidth) / normalPodCount
        : spineBoxWidth / podPositions.length;

    // 累加计算每个 POD 位置的起始 x 和宽度
    const podLayoutInfos = [];
    let currentPodX = 200;
    for (const pos of podPositions) {
        const width = pos.type === 'gap' ? LAYOUT.podGapWidth : normalPodWidth;
        podLayoutInfos.push({ ...pos, x: currentPodX, width });
        currentPodX += width;
    }

    /** @type {BgElement[]} */
    const bgElements = [];
    /** @type {SpineNode[]} */
    const spineNodes = [];
    /** @type {LinkSegment[]} */
    const links = [];
    /** @type {PodLayout[]} */
    const pods = [];

    // ===== 1. Spine 层背景 =====
    bgElements.push({
        type: 'rect',
        x: 200, y: spineY - 80,
        width: spineBoxWidth, height: 180,
        fill: 'rgba(15, 23, 42, 0.5)',
        stroke: '#475569', strokeWidth: 2, strokeDasharray: '6,4', rx: 12
    });
    bgElements.push({
        type: 'text',
        x: 230, y: spineY - 52,
        text: `核心层 (Spine) — ${archInfo.desc} [${actualSpineCount}台]`,
        fontSize: 16, fill: '#94a3b8', fontWeight: 'bold',
        fontFamily: "'Inter','Microsoft YaHei',sans-serif"
    });

    // VRF逃生图例（仅虚拟双平面显示）
    if (isVirtualDual) {
        bgElements.push({
            type: 'line',
            x1: spineBoxWidth - 40, y1: spineY - 68,
            x2: spineBoxWidth - 20, y2: spineY - 68,
            stroke: '#fbbf24', strokeWidth: 1, strokeDasharray: '3,3'
        });
        bgElements.push({
            type: 'text',
            x: spineBoxWidth - 15, y: spineY - 64,
            text: '= VRF虚拟逃生',
            fontSize: 9, fill: '#fbbf24', fontWeight: 600
        });
    }

    // ===== 2. Spine 节点位置计算 =====
    if (isPhysicalDual) {
        const spinesPerPlane = actualSpineCount / 2;
        const halfBoxWidth = spineBoxWidth / 2;
        const planeGap = 100; // P1/P2 两组之间的间隙

        // --- P1 布局（左半区，蓝色） ---
        const p1Positions = buildCompressedPositions(spinesPerPlane);
        const p1GapCount = p1Positions.filter(p => p.type === 'gap').length;
        const p1NormalCount = p1Positions.filter(p => p.type === 'item').length;
        const p1AvailableWidth = halfBoxWidth - planeGap / 2;
        const p1NormalWidth = p1GapCount > 0 && p1NormalCount > 0
            ? (p1AvailableWidth - p1GapCount * LAYOUT.spineGapWidth) / p1NormalCount
            : p1AvailableWidth / p1Positions.length;

        const p1LayoutInfos = [];
        let currentP1X = 200;
        for (const pos of p1Positions) {
            const width = pos.type === 'gap' ? LAYOUT.spineGapWidth : p1NormalWidth;
            const cx = currentP1X + width / 2;
            p1LayoutInfos.push({ ...pos, cx, width });
            currentP1X += width;
        }

        // --- P2 布局（右半区，黄色/橙色） ---
        const p2Positions = buildCompressedPositions(spinesPerPlane);
        const p2GapCount = p2Positions.filter(p => p.type === 'gap').length;
        const p2NormalCount = p2Positions.filter(p => p.type === 'item').length;
        const p2AvailableWidth = halfBoxWidth - planeGap / 2;
        const p2NormalWidth = p2GapCount > 0 && p2NormalCount > 0
            ? (p2AvailableWidth - p2GapCount * LAYOUT.spineGapWidth) / p2NormalCount
            : p2AvailableWidth / p2Positions.length;

        const p2LayoutInfos = [];
        let currentP2X = 200 + halfBoxWidth + planeGap / 2;
        for (const pos of p2Positions) {
            const width = pos.type === 'gap' ? LAYOUT.spineGapWidth : p2NormalWidth;
            const cx = currentP2X + width / 2;
            p2LayoutInfos.push({ ...pos, cx, width });
            currentP2X += width;
        }

        const spineW = LAYOUT.spineW;
        const spineH = LAYOUT.spineH;
        const escapeLinks = [];

        // 生成 P1 节点
        for (let vi = 0; vi < p1Positions.length; vi++) {
            const pos = p1Positions[vi];
            const info = p1LayoutInfos[vi];
            const cx = info.cx;

            if (pos.type === 'gap') {
                spineNodes.push({
                    type: 'gap',
                    count: pos.count,
                    totalCount: spinesPerPlane,
                    x: cx - 60, y: spineY - 5,
                    width: 120, height: 40
                });
                continue;
            }

            const idx = pos.idx;
            spineNodes.push({
                type: 'physicalSpineP1',
                idx,
                id: `spine1_${idx}`,
                x: cx - spineW / 2,
                y: spineY - 25,
                width: spineW,
                height: spineH,
                p1x: cx,
                bottomY: spineY - 25 + spineH,
                label: `Spine1-${idx}`,
                tooltip: `<div class="mb-1 font-semibold">Spine1-${idx}</div>物理双平面交换机<br>平面1 (蓝色)<br>独立物理设备<br>800G 端口`
            });
        }

        // 生成 P2 节点
        for (let vi = 0; vi < p2Positions.length; vi++) {
            const pos = p2Positions[vi];
            const info = p2LayoutInfos[vi];
            const cx = info.cx;

            if (pos.type === 'gap') {
                spineNodes.push({
                    type: 'gap',
                    count: pos.count,
                    totalCount: spinesPerPlane,
                    x: cx - 60, y: spineY - 5,
                    width: 120, height: 40
                });
                continue;
            }

            const idx = pos.idx;
            spineNodes.push({
                type: 'physicalSpineP2',
                idx,
                id: `spine2_${idx}`,
                x: cx - spineW / 2,
                y: spineY - 25,
                width: spineW,
                height: spineH,
                p2x: cx,
                bottomY: spineY - 25 + spineH,
                label: `Spine2-${idx}`,
                tooltip: `<div class="mb-1 font-semibold">Spine2-${idx}</div>物理双平面交换机<br>平面2 (黄色)<br>独立物理设备<br>800G 端口`
            });
        }

        // 逃生链路：连接对应 idx 的可见 P1/P2 节点（从 Spine 顶部弧线连接）
        const p1Visible = spineNodes.filter(s => s.type === 'physicalSpineP1');
        const p2Visible = spineNodes.filter(s => s.type === 'physicalSpineP2');

        for (let i = 0; i < p1Visible.length; i++) {
            const p1 = p1Visible[i];
            const p2 = p2Visible.find(s => s.idx === p1.idx);
            if (p2) {
                const visibleCount = Math.max(p1Visible.length, 1);
                const arcOffset = 30 + (visibleCount > 1 ? (i * 70 / (visibleCount - 1)) : 0);
                escapeLinks.push({
                    x1: p1.x + p1.width / 2,
                    y1: p1.y,
                    x2: p2.x + p2.width / 2,
                    y2: p2.y,
                    color: '#ef4444',
                    classes: 'escape-link',
                    arcOffset
                });
            }
        }

        // 将逃生链路加入总链路集合
        links.push(...escapeLinks);

        // 在最高逃生链路弧线中间添加文字标注
        if (escapeLinks.length > 0) {
            const first = escapeLinks[0];
            const midX = (first.x1 + first.x2) / 2;
            const maxArcOffset = Math.max(...escapeLinks.map(l => l.arcOffset));
            const labelY = first.y1 - maxArcOffset - 15;
            bgElements.push({
                type: 'text',
                x: midX,
                y: labelY,
                text: '逃生链路',
                fontSize: 10,
                fill: '#ef4444',
                fontWeight: 'bold',
                textAnchor: 'middle'
            });
        }
    } else {
        // 原有逻辑：单平面 + 虚拟双平面
        const spinePositions = buildCompressedPositions(actualSpineCount);
        const spineGapCount = spinePositions.filter(p => p.type === 'gap').length;
        const normalSpineCount = spinePositions.filter(p => p.type === 'item').length;
        const availableSpineWidth = spineBoxWidth;
        const normalSpineWidth = spineGapCount > 0 && normalSpineCount > 0
            ? (availableSpineWidth - spineGapCount * LAYOUT.spineGapWidth) / normalSpineCount
            : availableSpineWidth / spinePositions.length;

        const spineLayoutInfos = [];
        let currentSpineX = 200;
        for (const pos of spinePositions) {
            const width = pos.type === 'gap' ? LAYOUT.spineGapWidth : normalSpineWidth;
            const cx = currentSpineX + width / 2;
            spineLayoutInfos.push({ ...pos, cx, width });
            currentSpineX += width;
        }

        for (let vi = 0; vi < spinePositions.length; vi++) {
            const pos = spinePositions[vi];
            const info = spineLayoutInfos[vi];
            const cx = info.cx;

            if (pos.type === 'gap') {
                spineNodes.push({
                    type: 'gap',
                    count: pos.count,
                    totalCount: actualSpineCount,
                    x: cx - 60, y: spineY - 5,
                    width: 120, height: 40
                });
                continue;
            }

            const idx = pos.idx;
            const spineW = LAYOUT.spineW;
            const spineH = LAYOUT.spineH;

            if (isVirtualDual) {
                spineNodes.push({
                    type: 'virtualSpine',
                    idx,
                    id: `spine_${idx}`,
                    x: cx - spineW / 2,
                    y: spineY - 25,
                    width: spineW,
                    height: spineH,
                    p1x: cx - 50,
                    p2x: cx + 50,
                    bottomY: spineY - 25 + spineH,
                    label: `Spine-${idx}`,
                    tooltip: `<div class="mb-1 font-semibold">Spine-${idx}</div>物理交换机 (虚拟双平面)<br>平面1: VRF1 (蓝色)<br>平面2: VRF2 (橙色)<br>VRF逃生: 虚拟路径 (不占物理端口)<br>800G 端口`
                });
            } else {
                // 单平面：仅蓝色
                spineNodes.push({
                    type: 'singleSpine',
                    idx,
                    id: `spine_${idx}`,
                    x: cx - spineW / 2,
                    y: spineY - 25,
                    width: spineW,
                    height: spineH,
                    p1x: cx,
                    p2x: cx,
                    bottomY: spineY - 25 + spineH,
                    label: `Spine-${idx}`,
                    tooltip: `<div class="mb-1 font-semibold">Spine-${idx}</div>单平面交换机<br>800G 端口`
                });
            }
        }
    }

    // 物理双平面超过512台时的提示标注
    if (isPhysicalDual && serverCount > 512) {
        bgElements.push({
            type: 'text',
            x: 200 + spineBoxWidth / 2,
            y: spineY - 95,
            text: '物理双平面组网最多支持960台算力服务器集群组网',
            fontSize: 14,
            fill: '#fbbf24',
            fontWeight: 'bold',
            textAnchor: 'middle'
        });
    }

    // ===== 3. POD 层 =====
    const visibleLeafGroupIds = new Set();

    for (let vi = 0; vi < podPositions.length; vi++) {
        const pos = podPositions[vi];
        const podInfo = podLayoutInfos[vi];
        const podX = podInfo.x;
        const podWidth = podInfo.width;

        // gap POD：省略占位符
        if (pos.type === 'gap') {
            const podBoxTop = leafY - 110;
            const podBoxHeight = serverY - leafY + 250;
            const podBoxCenterY = podBoxTop + podBoxHeight / 2;
            pods.push({
                podIndex: -1,
                leafNodes: [],
                serverNodes: [],
                bgRect: {
                    x: podX + 20, y: podBoxTop,
                    width: podWidth - 40,
                    height: podBoxHeight,
                    fill: 'rgba(30, 41, 59, 0.1)',
                    stroke: '#334155', strokeWidth: 1, rx: 16, strokeDasharray: '6,4'
                },
                podLabel: {
                    x: podX + podWidth / 2, y: podBoxCenterY - 11,
                    text: `\u2190 ${podCount} \u2192`,
                    fontSize: 18, fill: '#fbbf24', fontWeight: 'bold',
                    fontFamily: "'Inter','Microsoft YaHei',sans-serif",
                    textAnchor: 'middle'
                },
                podSubLabel: {
                    x: podX + podWidth / 2, y: podBoxCenterY + 11,
                    text: `共 ${podCount} 个POD`,
                    fontSize: 13, fill: '#94a3b8',
                    fontFamily: "'Inter','Microsoft YaHei',sans-serif",
                    textAnchor: 'middle'
                }
            });
            continue;
        }

        const p = pos.actualIndex;
        const podLayout = /** @type {PodLayout} */({
            podIndex: p,
            leafNodes: [],
            serverNodes: []
        });

        // POD 背景
        podLayout.bgRect = {
            x: podX + 20, y: leafY - 110,
            width: podWidth - 40,
            height: serverY - leafY + 250,
            fill: 'rgba(30, 41, 59, 0.2)',
            stroke: '#334155', strokeWidth: 1, rx: 16
        };
        podLayout.podLabel = {
            x: podX + 50, y: leafY - 70,
            text: `POD ${p + 1}`,
            fontSize: 16, fill: '#cbd5e1', fontWeight: 'bold',
            fontFamily: "'Inter','Microsoft YaHei',sans-serif"
        };
        const leafCountDisplay = isSinglePlane ? leafGroupsPerPod : leafGroupsPerPod * 2;
        podLayout.podSubLabel = {
            x: podX + 50, y: leafY - 48,
            text: `包含 ${leafCountDisplay}台 Leaf, 下联 ${Math.min(cm.serversPerPod, serverCount - p * cm.serversPerPod)}台 算力节点`,
            fontSize: 11, fill: '#64748b',
            fontFamily: "'Inter','Microsoft YaHei',sans-serif"
        };

        // Leaf 层
        const leafPositions = buildCompressedPositions(leafGroupsPerPod);
        const leafGapCount = leafPositions.filter(p => p.type === 'gap').length;
        const normalLeafCount = leafPositions.filter(p => p.type === 'item').length;
        const availableLeafWidth = podWidth - LAYOUT.podPadding * 2;
        const normalLeafWidth = leafGapCount > 0 && normalLeafCount > 0
            ? (availableLeafWidth - leafGapCount * LAYOUT.leafGapWidth) / normalLeafCount
            : availableLeafWidth / leafPositions.length;

        // 累加计算每个 leaf 位置的中心 x（相对于 POD 起点）
        const leafLayoutInfos = [];
        let currentLeafX = LAYOUT.podPadding / 2;
        for (const pos of leafPositions) {
            const width = pos.type === 'gap' ? LAYOUT.leafGapWidth : normalLeafWidth;
            const cx = currentLeafX + width / 2;
            leafLayoutInfos.push({ ...pos, cx, width });
            currentLeafX += width;
        }

        const leafNodes = [];

        for (let vi = 0; vi < leafPositions.length; vi++) {
            const pos = leafPositions[vi];
            const info = leafLayoutInfos[vi];
            const cx = podX + info.cx;

            if (pos.type === 'gap') {
                podLayout.leafNodes.push({
                    type: 'gap',
                    count: pos.count,
                    totalCount: leafGroupsPerPod,
                    x: cx - 55, y: leafY + 5,
                    width: 110, height: 40,
                    podIndex: p
                });
                continue;
            }

            const idx = pos.idx;
            const l1Id = `l1_${p}_${idx}`;
            const l2Id = `l2_${p}_${idx}`;

            visibleLeafGroupIds.add(idx);

            const node = {
                type: 'leafPair',
                groupIdx: idx,
                x: cx,
                y: leafY,
                l1Id,
                l2Id,
                l1Label: isSinglePlane ? `Leaf-${idx}` : `L1-${idx}`,
                l2Label: `L2-${idx}`,
                p1x: isSinglePlane ? cx : cx - 45,
                p2x: isSinglePlane ? cx : cx + 45,
                bottomY: leafY + 50,
                podIndex: p,
                tooltipL1: isSinglePlane
                    ? `<b>Leaf-${idx}</b><br>所在 POD: ${p + 1}<br>角色: Leaf (单平面)<br>上行: 32<br>下行: 32`
                    : `<b>L1-${idx}</b><br>所在 POD: ${p + 1}<br>角色: Leaf (平面1)<br>上行: 64<br>下行: 64`,
                tooltipL2: `<b>L2-${idx}</b><br>所在 POD: ${p + 1}<br>角色: Leaf (平面2)<br>上行: 64<br>下行: 64`
            };
            podLayout.leafNodes.push(node);
            leafNodes.push({ id: idx, p1x: isSinglePlane ? cx : cx - 45, p2x: isSinglePlane ? cx : cx + 45, y: leafY + 50, l1Id, l2Id });

            // 到 Spine 的连线
            spineNodes.forEach(sp => {
                if (sp.type === 'gap') return;

                if (isSinglePlane) {
                    // 单平面：仅蓝色连线，从Leaf中心到Spine中心
                    links.push({
                        x1: cx, y1: leafY,
                        x2: sp.p1x, y2: sp.bottomY,
                        color: '#3b82f6',
                        classes: `${l1Id} dev-${sp.id} ${sp.id}`
                    });
                } else if (isPhysicalDual) {
                    // 物理双平面：P1 Spine 接蓝色，P2 Spine 接橙色
                    if (sp.type === 'physicalSpineP1') {
                        links.push({
                            x1: cx - 45, y1: leafY,
                            x2: sp.p1x, y2: sp.bottomY,
                            color: '#3b82f6',
                            classes: `${l1Id} dev-${sp.id} ${sp.id}`
                        });
                    } else if (sp.type === 'physicalSpineP2') {
                        links.push({
                            x1: cx + 45, y1: leafY,
                            x2: sp.p2x, y2: sp.bottomY,
                            color: '#f97316',
                            classes: `${l2Id} dev-${sp.id} ${sp.id}`
                        });
                    }
                } else {
                    // 虚拟双平面：蓝色+橙色连线
                    links.push({
                        x1: cx - 45, y1: leafY,
                        x2: sp.p1x, y2: sp.bottomY,
                        color: '#3b82f6',
                        classes: `${l1Id} dev-${sp.id} ${sp.id}`
                    });
                    links.push({
                        x1: cx + 45, y1: leafY,
                        x2: sp.p2x, y2: sp.bottomY,
                        color: '#f97316',
                        classes: `${l2Id} dev-${sp.id} ${sp.id}`
                    });
                }
            });
        }

        // Server 层
        const serverSpacing = (podWidth - LAYOUT.podPadding * 2) / LAYOUT.visualServers;
        const actualServersInPod = Math.min(cm.serversPerPod, serverCount - p * cm.serversPerPod);
        for (let s = 0; s < LAYOUT.visualServers; s++) {
            const cx = podX + LAYOUT.podPadding / 2 + serverSpacing * (s + 0.5);
            const isLast = (s === LAYOUT.visualServers - 1);
            const idx = isLast ? String(actualServersInPod) : String(s + 1);

            if (s === LAYOUT.visualServers - 2) {
                podLayout.serverNodes.push({
                    type: 'ellipsis',
                    x: cx, y: serverY + 40,
                    count: actualServersInPod
                });
                continue;
            }

            const srvId = `srv_${p}_${idx}`;
            const gpuPrefix = parts[0];

            podLayout.serverNodes.push({
                type: 'server',
                idx,
                x: cx - LAYOUT.serverW / 2,
                y: serverY,
                width: LAYOUT.serverW,
                height: LAYOUT.serverH,
                id: srvId,
                label: `算力节点 ${idx} (${gpuPrefix})`,
                tooltip: `<div class="mb-1 font-semibold">Server ${idx}</div>配置: ${gpuPrefix}<br>网卡: ${computeNicLabel}`,
                railCount
            });

            // Server 到 Leaf 的连线
            const portGroupSpacing = LAYOUT.serverW / (railCount + 1);
            for (let rail = 0; rail < railCount; rail++) {
                const portX = cx - LAYOUT.serverW / 2 + portGroupSpacing * (rail + 1);
                const portY = serverY;
                const targetLeafGroupIdx = Math.min(Math.floor(rail * leafGroupsPerPod / railCount) + 1, leafGroupsPerPod);
                const isTargetVisible = visibleLeafGroupIds.has(targetLeafGroupIdx);
                const targetLeaf = leafNodes.find(ln => ln.id === targetLeafGroupIdx);

                if (isTargetVisible && targetLeaf) {
                    const linkClasses = `${srvId} dev-${targetLeaf.l1Id} dev-${targetLeaf.l2Id}`;

                    if (isSinglePlane) {
                        // 单平面：仅蓝色连线，从Server端口到Leaf中心
                        links.push({
                            x1: portX, y1: portY - 14,
                            x2: targetLeaf.p1x, y2: targetLeaf.y,
                            color: '#3b82f6',
                            classes: linkClasses
                        });
                    } else {
                        // 双平面：蓝色+橙色连线
                        links.push({
                            x1: portX - 7, y1: portY - 14,
                            x2: targetLeaf.p1x, y2: targetLeaf.y,
                            color: '#3b82f6',
                            classes: linkClasses
                        });
                        links.push({
                            x1: portX + 7, y1: portY - 14,
                            x2: targetLeaf.p2x, y2: targetLeaf.y,
                            color: '#f97316',
                            classes: linkClasses
                        });
                    }
                }
            }
        }

        pods.push(podLayout);
    }

    return {
        dimensions: { width: canvasWidth, height: 1200 },
        bgElements,
        spineNodes,
        pods,
        links,
        visibleLeafGroupIds,
        architecture,
        leafGroupsPerPod
    };
}
