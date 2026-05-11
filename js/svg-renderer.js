/**
 * svg-renderer.js - SVG 分层渲染引擎
 * 使用 DocumentFragment 批量插入，维护 bg/link/node 三层
 * 支持：虚拟双平面、物理双平面、单平面三种架构渲染
 */

import { LAYOUT } from './config.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * 创建 SVG 元素
 * @param {string} tag
 * @param {Object} attrs
 * @returns {SVGElement}
 */
function createSVG(tag, attrs = {}) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (v !== undefined && v !== null) {
            el.setAttribute(k, String(v));
        }
    }
    return el;
}

/**
 * 批量设置属性
 * @param {SVGElement} el
 * @param {Object} attrs
 */
function setAttrs(el, attrs) {
    for (const [k, v] of Object.entries(attrs)) {
        if (v !== undefined && v !== null) {
            el.setAttribute(k, String(v));
        }
    }
}

/**
 * 创建文本元素
 * @param {number} x
 * @param {number} y
 * @param {string} text
 * @param {Object} attrs
 * @returns {SVGTextElement}
 */
function createText(x, y, text, attrs = {}) {
    const t = createSVG('text', { x, y, ...attrs });
    t.textContent = text;
    return t;
}

/**
 * 渲染背景层
 * @param {SVGElement} layer
 * @param {import('./layout-engine.js').TopologyLayout} layout
 */
function renderBgLayer(layer, layout) {
    const frag = document.createDocumentFragment();
    for (const item of layout.bgElements) {
        if (item.type === 'rect') {
            frag.appendChild(createSVG('rect', {
                x: item.x, y: item.y,
                width: item.width, height: item.height,
                fill: item.fill, stroke: item.stroke,
                'stroke-width': item.strokeWidth,
                'stroke-dasharray': item.strokeDasharray,
                rx: item.rx
            }));
        } else if (item.type === 'text') {
            frag.appendChild(createText(item.x, item.y, item.text, {
                'font-family': item.fontFamily,
                'font-size': item.fontSize,
                fill: item.fill,
                'font-weight': item.fontWeight
            }));
        } else if (item.type === 'line') {
            frag.appendChild(createSVG('line', {
                x1: item.x1, y1: item.y1,
                x2: item.x2, y2: item.y2,
                stroke: item.stroke,
                'stroke-width': item.strokeWidth,
                'stroke-dasharray': item.strokeDasharray
            }));
        }
    }

    // POD 背景
    for (const pod of layout.pods) {
        const r = pod.bgRect;
        frag.appendChild(createSVG('rect', {
            x: r.x, y: r.y, width: r.width, height: r.height,
            fill: r.fill, stroke: r.stroke, 'stroke-width': r.strokeWidth, rx: r.rx
        }));
        frag.appendChild(createText(pod.podLabel.x, pod.podLabel.y, pod.podLabel.text, {
            'font-family': pod.podLabel.fontFamily,
            'font-size': pod.podLabel.fontSize,
            fill: pod.podLabel.fill,
            'font-weight': pod.podLabel.fontWeight
        }));
        frag.appendChild(createText(pod.podSubLabel.x, pod.podSubLabel.y, pod.podSubLabel.text, {
            'font-family': pod.podSubLabel.fontFamily,
            'font-size': pod.podSubLabel.fontSize,
            fill: pod.podSubLabel.fill
        }));
    }

    layer.innerHTML = '';
    layer.appendChild(frag);
}

/**
 * 渲染连线层
 * @param {SVGElement} layer
 * @param {import('./layout-engine.js').TopologyLayout} layout
 */
function renderLinkLayer(layer, layout) {
    const frag = document.createDocumentFragment();
    for (const link of layout.links) {
        const offset = Math.abs(link.y2 - link.y1) * 0.4;
        const d = `M ${link.x1} ${link.y1} C ${link.x1} ${link.y1 - offset}, ${link.x2} ${link.y2 + offset}, ${link.x2} ${link.y2}`;
        frag.appendChild(createSVG('path', {
            d, stroke: link.color, 'stroke-width': '1.5', fill: 'none',
            class: `link-line ${link.classes}`
        }));
    }
    layer.innerHTML = '';
    layer.appendChild(frag);
}

/**
 * 创建 Spine 层省略占位符
 * @param {SpineNode} node
 * @returns {DocumentFragment}
 */
function renderSpineGap(node) {
    const frag = document.createDocumentFragment();
    frag.appendChild(createSVG('rect', {
        x: node.x, y: node.y, width: node.width, height: node.height,
        rx: 8, fill: 'rgba(15,23,42,0.4)', stroke: '#334155',
        'stroke-width': 1, 'stroke-dasharray': '4,3'
    }));
    frag.appendChild(createText(node.x + node.width / 2, node.y + 20, `← x${node.count} →`, {
        'font-size': 13, fill: '#64748b', 'font-weight': 'bold', 'text-anchor': 'middle'
    }));
    frag.appendChild(createText(node.x + node.width / 2, node.y + 36, 'Spine省略', {
        'font-size': 9, fill: '#475569', 'text-anchor': 'middle'
    }));
    return frag;
}

/**
 * 创建虚拟双平面 Spine（VRF1/VRF2分区 + VRF逃生虚线）
 * @param {SpineNode} node
 * @returns {DocumentFragment}
 */
function renderVirtualSpine(node) {
    const frag = document.createDocumentFragment();
    const g = createSVG('g', {
        id: `dev-${node.id}`,
        class: `device-group dev-${node.id}`,
        'data-id': node.id,
        'data-tooltip': node.tooltip
    });

    const pad = 4;
    const gapW = 10;
    const vrfW = (node.width - pad * 2 - gapW) / 2;
    const topLabelH = 13;
    const portH = 10;
    const vrfX1 = node.x + pad;
    const vrfX2 = node.x + pad + vrfW + gapW;
    const vrfY = node.y + pad + topLabelH;
    const vrfH = node.height - pad * 2 - topLabelH - portH;
    const escapeCX = node.x + pad + vrfW + gapW / 2;

    // 物理机箱外框
    g.appendChild(createSVG('rect', {
        x: node.x, y: node.y, width: node.width, height: node.height,
        rx: 8, fill: '#0f172a', stroke: '#94a3b8', 'stroke-width': 2.5,
        filter: 'url(#shadow)'
    }));
    // 顶部金属高光
    g.appendChild(createSVG('line', {
        x1: node.x + 3, y1: node.y + 2,
        x2: node.x + node.width - 3, y2: node.y + 2,
        stroke: 'rgba(255,255,255,0.15)', 'stroke-width': 1
    }));
    // PHYSICAL 标签
    g.appendChild(createText(node.x + 6, node.y + 12, node.label || 'PHYSICAL', {
        'font-size': 7, fill: '#94a3b8', 'font-weight': 700, 'letter-spacing': 0.5
    }));

    // VRF1
    g.appendChild(createSVG('rect', {
        x: vrfX1, y: vrfY, width: vrfW, height: vrfH,
        rx: 4, fill: 'url(#grad-blue)', stroke: '#3b82f6',
        'stroke-width': 1, opacity: 0.95
    }));
    g.appendChild(createText(vrfX1 + vrfW / 2, vrfY + vrfH / 2 - 5, 'P1', {
        'font-size': 11, fill: '#fff', 'font-weight': 700, 'text-anchor': 'middle'
    }));
    g.appendChild(createText(vrfX1 + vrfW / 2, vrfY + vrfH / 2 + 10, 'VRF1', {
        'font-size': 7, fill: '#93c5fd', 'text-anchor': 'middle'
    }));

    // VRF2
    g.appendChild(createSVG('rect', {
        x: vrfX2, y: vrfY, width: vrfW, height: vrfH,
        rx: 4, fill: 'url(#grad-orange)', stroke: '#f97316',
        'stroke-width': 1, opacity: 0.95
    }));
    g.appendChild(createText(vrfX2 + vrfW / 2, vrfY + vrfH / 2 - 5, 'P2', {
        'font-size': 11, fill: '#fff', 'font-weight': 700, 'text-anchor': 'middle'
    }));
    g.appendChild(createText(vrfX2 + vrfW / 2, vrfY + vrfH / 2 + 10, 'VRF2', {
        'font-size': 7, fill: '#fdba74', 'text-anchor': 'middle'
    }));

    // VRF 逃生虚线
    g.appendChild(createSVG('line', {
        x1: escapeCX, y1: vrfY + 4, x2: escapeCX, y2: vrfY + vrfH - 4,
        stroke: '#fbbf24', 'stroke-width': 1, 'stroke-dasharray': '3,3', opacity: 0.5
    }));
    // → 箭头
    g.appendChild(createSVG('line', {
        x1: escapeCX - 3, y1: vrfY + vrfH / 2 - 10,
        x2: escapeCX + 3, y2: vrfY + vrfH / 2 - 10,
        stroke: '#fbbf24', 'stroke-width': 1.5
    }));
    g.appendChild(createSVG('polygon', {
        points: `${escapeCX + 3},${vrfY + vrfH / 2 - 12} ${escapeCX + 7},${vrfY + vrfH / 2 - 10} ${escapeCX + 3},${vrfY + vrfH / 2 - 8}`,
        fill: '#fbbf24'
    }));
    // ← 箭头
    g.appendChild(createSVG('line', {
        x1: escapeCX - 3, y1: vrfY + vrfH / 2 + 2,
        x2: escapeCX + 3, y2: vrfY + vrfH / 2 + 2,
        stroke: '#fbbf24', 'stroke-width': 1.5
    }));
    g.appendChild(createSVG('polygon', {
        points: `${escapeCX - 3},${vrfY + vrfH / 2} ${escapeCX - 7},${vrfY + vrfH / 2 + 2} ${escapeCX - 3},${vrfY + vrfH / 2 + 4}`,
        fill: '#fbbf24'
    }));
    // 逃生标签
    g.appendChild(createSVG('rect', {
        x: escapeCX - 15, y: vrfY + vrfH / 2 + 8,
        width: 30, height: 13, rx: 3,
        fill: 'rgba(251,191,36,0.12)', stroke: '#fbbf24', 'stroke-width': 0.5
    }));
    g.appendChild(createText(escapeCX, vrfY + vrfH / 2 + 18, 'VRF逃生', {
        'font-size': 6, fill: '#fbbf24', 'text-anchor': 'middle', 'font-weight': 700
    }));

    // 端口指示灯
    const portCount = 10;
    const portSpacing = (node.width - 20) / portCount;
    for (let i = 0; i < portCount; i++) {
        const px = node.x + 10 + i * portSpacing + portSpacing / 2 - 2;
        g.appendChild(createSVG('rect', {
            x: px, y: node.y + node.height - 8,
            width: 4, height: 4, fill: '#64748b',
            class: 'led-blink', rx: 0.5
        }));
    }

    frag.appendChild(g);
    return frag;
}

/**
 * 创建物理双平面 Spine（P1/P2独立物理交换机，无VRF分区）
 * @param {SpineNode} node
 * @returns {DocumentFragment}
 */
function renderPhysicalSpine(node) {
    const frag = document.createDocumentFragment();
    const g = createSVG('g', {
        id: `dev-${node.id}`,
        class: `device-group dev-${node.id}`,
        'data-id': node.id,
        'data-tooltip': node.tooltip
    });

    const w = node.width;
    const h = node.height;

    // P1 (蓝色) - 上半部分
    g.appendChild(createSVG('rect', {
        x: node.x, y: node.y, width: w, height: h / 2 - 2,
        rx: 6, fill: 'url(#grad-blue)', stroke: '#3b82f6',
        'stroke-width': 1.5, filter: 'url(#shadow)'
    }));
    g.appendChild(createText(node.x + w / 2, node.y + h / 4 - 2, `P1`, {
        'font-size': 10, fill: '#fff', 'font-weight': 700, 'text-anchor': 'middle'
    }));
    g.appendChild(createText(node.x + w / 2, node.y + h / 4 + 10, node.label || '', {
        'font-size': 6, fill: '#93c5fd', 'text-anchor': 'middle'
    }));

    // P2 (橙色) - 下半部分
    g.appendChild(createSVG('rect', {
        x: node.x, y: node.y + h / 2 + 2, width: w, height: h / 2 - 2,
        rx: 6, fill: 'url(#grad-orange)', stroke: '#f97316',
        'stroke-width': 1.5, filter: 'url(#shadow)'
    }));
    g.appendChild(createText(node.x + w / 2, node.y + h * 3 / 4 - 2, `P2`, {
        'font-size': 10, fill: '#fff', 'font-weight': 700, 'text-anchor': 'middle'
    }));
    g.appendChild(createText(node.x + w / 2, node.y + h * 3 / 4 + 10, node.label || '', {
        'font-size': 6, fill: '#fdba74', 'text-anchor': 'middle'
    }));

    // 分隔线
    g.appendChild(createSVG('line', {
        x1: node.x + 4, y1: node.y + h / 2,
        x2: node.x + w - 4, y2: node.y + h / 2,
        stroke: '#475569', 'stroke-width': 1, 'stroke-dasharray': '2,2'
    }));

    frag.appendChild(g);
    return frag;
}

/**
 * 创建单平面 Spine（仅蓝色，无平面分区）
 * @param {SpineNode} node
 * @returns {DocumentFragment}
 */
function renderSingleSpine(node) {
    const frag = document.createDocumentFragment();
    const g = createSVG('g', {
        id: `dev-${node.id}`,
        class: `device-group dev-${node.id}`,
        'data-id': node.id,
        'data-tooltip': node.tooltip
    });

    // 整体蓝色盒子
    g.appendChild(createSVG('rect', {
        x: node.x, y: node.y, width: node.width, height: node.height,
        rx: 8, fill: '#0f172a', stroke: '#3b82f6', 'stroke-width': 2.5,
        filter: 'url(#shadow)'
    }));
    // 顶部高光
    g.appendChild(createSVG('line', {
        x1: node.x + 3, y1: node.y + 2,
        x2: node.x + node.width - 3, y2: node.y + 2,
        stroke: 'rgba(255,255,255,0.15)', 'stroke-width': 1
    }));
    // 内部蓝色填充
    const pad = 6;
    g.appendChild(createSVG('rect', {
        x: node.x + pad, y: node.y + 14,
        width: node.width - pad * 2, height: node.height - 24,
        rx: 4, fill: 'url(#grad-blue)', stroke: '#3b82f6',
        'stroke-width': 1, opacity: 0.95
    }));
    // 标签
    g.appendChild(createText(node.x + 6, node.y + 12, node.label || 'SPINE', {
        'font-size': 7, fill: '#94a3b8', 'font-weight': 700, 'letter-spacing': 0.5
    }));
    g.appendChild(createText(node.x + node.width / 2, node.y + node.height / 2 - 2, '单平面', {
        'font-size': 10, fill: '#fff', 'font-weight': 700, 'text-anchor': 'middle'
    }));

    // 端口指示灯
    const portCount = 10;
    const portSpacing = (node.width - 20) / portCount;
    for (let i = 0; i < portCount; i++) {
        const px = node.x + 10 + i * portSpacing + portSpacing / 2 - 2;
        g.appendChild(createSVG('rect', {
            x: px, y: node.y + node.height - 8,
            width: 4, height: 4, fill: '#60a5fa',
            class: 'led-blink', rx: 0.5
        }));
    }

    frag.appendChild(g);
    return frag;
}

/**
 * 创建 Leaf 交换机
 * @param {import('./layout-engine.js').LeafNode} node
 * @param {'blue'|'orange'} planeType
 * @param {string} architecture
 * @returns {DocumentFragment}
 */
function renderLeafSwitch(node, planeType, architecture = 'virtual-dual-plane') {
    const frag = document.createDocumentFragment();
    const isSinglePlane = architecture === 'single-plane';
    const id = planeType === 'blue' ? node.l1Id : node.l2Id;
    const label = planeType === 'blue' ? node.l1Label : node.l2Label;
    const tooltip = planeType === 'blue' ? node.tooltipL1 : node.tooltipL2;
    const x = planeType === 'blue' ? node.x - 80 : node.x + 10;
    const width = 70;
    const height = 50;

    // 单平面模式下跳过橙色Leaf渲染
    if (isSinglePlane && planeType === 'orange') {
        return frag;
    }

    // 单平面模式下调整蓝色Leaf位置居中
    const leafX = isSinglePlane ? node.x - width / 2 : x;

    const g = createSVG('g', {
        id: `dev-${id}`,
        class: `device-group dev-${id}`,
        'data-id': id,
        'data-tooltip': tooltip
    });

    const fill = planeType === 'blue' ? 'url(#grad-blue)' : 'url(#grad-orange)';
    const stroke = planeType === 'blue' ? '#3b82f6' : '#f97316';

    g.appendChild(createSVG('rect', {
        x: leafX, y: node.y, width, height,
        rx: 6, fill, stroke, 'stroke-width': 1.5,
        filter: 'url(#shadow)'
    }));
    g.appendChild(createSVG('line', {
        x1: leafX + 2, y1: node.y + 2, x2: leafX + width - 2, y2: node.y + 2,
        stroke: 'rgba(255,255,255,0.2)', 'stroke-width': 1
    }));
    g.appendChild(createSVG('line', {
        x1: leafX + 4, y1: node.y + height / 2, x2: leafX + width - 4, y2: node.y + height / 2,
        stroke: 'rgba(0,0,0,0.3)', 'stroke-width': 1
    }));
    g.appendChild(createText(leafX + width / 2, node.y + height / 2 - 2, label, {
        'font-family': "'Inter','Microsoft YaHei',sans-serif",
        'font-size': 11, fill: '#ffffff', 'font-weight': 600,
        'text-anchor': 'middle', 'alignment-baseline': 'middle',
        'pointer-events': 'none'
    }));

    // 端口装饰
    const portCount = 8;
    const portSpacing = (width - 20) / portCount;
    const portFill = planeType === 'blue' ? '#60a5fa' : '#fdba74';
    for (let i = 0; i < portCount; i++) {
        const px = leafX + 10 + i * portSpacing + portSpacing / 2 - 2;
        g.appendChild(createSVG('rect', {
            x: px, y: node.y + height - 8,
            width: 4, height: 4, fill: portFill, class: 'led-blink'
        }));
    }

    frag.appendChild(g);
    return frag;
}

/**
 * 创建服务器
 * @param {import('./layout-engine.js').ServerNode} node
 * @param {string} architecture
 * @returns {DocumentFragment}
 */
function renderServer(node, architecture = 'virtual-dual-plane') {
    const isSinglePlane = architecture === 'single-plane';
    const frag = document.createDocumentFragment();
    const g = createSVG('g', {
        id: `dev-${node.id}`,
        class: `device-group dev-${node.id}`,
        'data-id': node.id,
        'data-tooltip': node.tooltip
    });

    g.appendChild(createSVG('rect', {
        x: node.x, y: node.y,
        width: node.width, height: node.height,
        rx: 8, fill: 'url(#grad-server)', stroke: '#38bdf8',
        'stroke-width': 1, filter: 'url(#shadow)'
    }));
    g.appendChild(createSVG('rect', {
        x: node.x + 10, y: node.y + 6,
        width: node.width - 20, height: 8,
        fill: 'url(#stripes)', rx: 1
    }));
    g.appendChild(createText(node.x + node.width / 2, node.y + node.height - 12, node.label, {
        'font-family': "'Inter','Microsoft YaHei',sans-serif",
        'font-size': 12, fill: '#e2e8f0', 'font-weight': 'bold',
        'text-anchor': 'middle', 'pointer-events': 'none'
    }));

    // GPU 槽位
    const slotWidth = (node.width - 40) / node.railCount;
    for (let i = 0; i < node.railCount; i++) {
        const slotX = node.x + 20 + i * slotWidth + 2;
        g.appendChild(createSVG('rect', {
            x: slotX, y: node.y + 25,
            width: slotWidth - 4, height: 25,
            fill: '#020617', stroke: '#334155', 'stroke-width': 1, rx: 2
        }));
        g.appendChild(createSVG('rect', {
            x: slotX + 4, y: node.y + 28,
            width: slotWidth - 12, height: 3,
            fill: '#06b6d4', opacity: 0.8
        }));
        g.appendChild(createText(slotX + slotWidth / 2, node.y + 40, `G${i + 1}`, {
            'font-size': 8, fill: '#64748b', 'text-anchor': 'middle'
        }));
    }

    frag.appendChild(g);
    return frag;
}

/**
 * 创建 LACP 标记
 * @param {number} cx
 * @param {number} cy
 * @returns {SVGElement}
 */
function createLACPBadge(cx, cy) {
    const g = createSVG('g', { class: 'pointer-events-none' });
    g.appendChild(createSVG('rect', {
        x: cx - 16, y: cy - 7, width: 32, height: 14,
        rx: 7, fill: '#1e293b', stroke: '#94a3b8', 'stroke-width': 1
    }));
    g.appendChild(createText(cx, cy + 3, 'LACP', {
        'font-size': 8, fill: '#cbd5e1', 'font-weight': 'bold', 'text-anchor': 'middle'
    }));
    return g;
}

/**
 * 渲染节点层
 * @param {SVGElement} layer
 * @param {import('./layout-engine.js').TopologyLayout} layout
 * @param {number} serverCount
 * @param {number} railCount
 * @param {Object} options
 */
function renderNodeLayer(layer, layout, serverCount, railCount, options = {}) {
    const architecture = layout.architecture || options.architecture || 'virtual-dual-plane';
    const isSinglePlane = architecture === 'single-plane';
    const frag = document.createDocumentFragment();

    // Spine 节点
    for (const sp of layout.spineNodes) {
        if (sp.type === 'gap') {
            frag.appendChild(renderSpineGap(sp));
        } else if (sp.type === 'virtualSpine') {
            frag.appendChild(renderVirtualSpine(sp));
        } else if (sp.type === 'physicalSpine') {
            frag.appendChild(renderPhysicalSpine(sp));
        } else if (sp.type === 'singleSpine') {
            frag.appendChild(renderSingleSpine(sp));
        }
    }

    // POD 节点
    for (const pod of layout.pods) {
        // Leaf
        for (const leaf of pod.leafNodes) {
            if (leaf.type === 'gap') {
                frag.appendChild(createSVG('rect', {
                    x: leaf.x, y: leaf.y, width: leaf.width, height: leaf.height,
                    rx: 8, fill: 'rgba(15,23,42,0.4)', stroke: '#334155',
                    'stroke-width': 1, 'stroke-dasharray': '4,3'
                }));
                frag.appendChild(createText(leaf.x + leaf.width / 2, leaf.y + 25, `← x${leaf.count} →`, {
                    'font-size': 13, fill: '#64748b', 'font-weight': 'bold', 'text-anchor': 'middle'
                }));
            } else {
                frag.appendChild(renderLeafSwitch(leaf, 'blue', architecture));
                frag.appendChild(renderLeafSwitch(leaf, 'orange', architecture));
            }
        }

        // Server
        for (const srv of pod.serverNodes) {
            if (srv.type === 'ellipsis') {
                frag.appendChild(createText(srv.x, srv.y, srv.text, {
                    'font-size': 14, fill: '#475569', 'font-weight': 'bold', 'text-anchor': 'middle'
                }));
            } else if (srv.type === 'server') {
                frag.appendChild(renderServer(srv, architecture));

                // 网卡端口装饰
                const portGroupSpacing = srv.width / (railCount + 1);
                for (let rail = 0; rail < railCount; rail++) {
                    const portX = srv.x + portGroupSpacing * (rail + 1);
                    const portY = srv.y;
                    const targetLeafGroupIdx = (railCount === 8) ? (rail + 1) : Math.floor(rail * (8 / railCount)) + 1;
                    const isTargetVisible = layout.visibleLeafGroupIds.has(targetLeafGroupIdx);

                    if (isTargetVisible) {
                        if (isSinglePlane) {
                            // 单平面：仅蓝色端口
                            frag.appendChild(createSVG('rect', {
                                x: portX - 6, y: portY - 14, width: 12, height: 14,
                                fill: '#1e3a8a', rx: 1
                            }));
                            frag.appendChild(createText(portX, portY - 4, '1', {
                                'font-size': 8, fill: '#fff', 'text-anchor': 'middle'
                            }));
                        } else {
                            // 双平面：蓝色+橙色端口
                            frag.appendChild(createSVG('rect', {
                                x: portX - 12, y: portY - 14, width: 10, height: 14,
                                fill: '#1e3a8a', rx: 1
                            }));
                            frag.appendChild(createSVG('rect', {
                                x: portX + 2, y: portY - 14, width: 10, height: 14,
                                fill: '#c2410c', rx: 1
                            }));
                            frag.appendChild(createText(portX - 7, portY - 4, '1', {
                                'font-size': 8, fill: '#fff', 'text-anchor': 'middle'
                            }));
                            frag.appendChild(createText(portX + 7, portY - 4, '2', {
                                'font-size': 8, fill: '#fff', 'text-anchor': 'middle'
                            }));
                        }

                        if (rail === 0 || rail === railCount - 1) {
                            frag.appendChild(createLACPBadge(portX, portY - 40));
                        }
                    } else {
                        frag.appendChild(createSVG('rect', {
                            x: portX - 8, y: portY - 12, width: 16, height: 12,
                            fill: '#0f172a', stroke: '#334155', 'stroke-width': 0.5,
                            rx: 1, opacity: 0.6
                        }));
                        frag.appendChild(createText(portX, portY - 5, '·', {
                            'font-size': 7, fill: '#475569', 'text-anchor': 'middle'
                        }));
                    }
                }
            }
        }
    }

    layer.innerHTML = '';
    layer.appendChild(frag);
}

/**
 * 渲染完整拓扑
 * @param {import('./layout-engine.js').TopologyLayout} layout
 * @param {number} serverCount
 * @param {number} railCount
 * @param {Object} options
 */
export function renderTopology(layout, serverCount, railCount, options = {}) {
    const bgLayer = document.getElementById('bgLayer');
    const linkLayer = document.getElementById('linkLayer');
    const nodeLayer = document.getElementById('nodeLayer');

    if (!bgLayer || !linkLayer || !nodeLayer) {
        console.error('SVG layers not found');
        return;
    }

    renderBgLayer(bgLayer, layout);
    renderLinkLayer(linkLayer, layout);
    renderNodeLayer(nodeLayer, layout, serverCount, railCount, options);
}

/**
 * 高亮指定设备的链路
 * @param {string} deviceId
 */
export function highlightDevice(deviceId) {
    const svgGroup = document.getElementById('nodeLayer')?.parentElement;
    if (!svgGroup) return;
    svgGroup.classList.add('svg-dimmed');

    const links = document.querySelectorAll(`.link-line.${deviceId}`);
    links.forEach(link => {
        link.classList.add('highlight');
        const classes = Array.from(link.classList);
        classes.forEach(cls => {
            if (cls.startsWith('dev-')) {
                const target = document.getElementById(cls);
                if (target) target.classList.add('highlight-device');
            }
        });
    });

    const self = document.getElementById(`dev-${deviceId}`);
    if (self) self.classList.add('highlight-device');
}

/**
 * 重置所有高亮
 */
export function resetHighlights() {
    const svgGroup = document.getElementById('nodeLayer')?.parentElement;
    if (svgGroup) svgGroup.classList.remove('svg-dimmed');

    document.querySelectorAll('.highlight').forEach(el => el.classList.remove('highlight'));
    document.querySelectorAll('.highlight-device').forEach(el => el.classList.remove('highlight-device'));
}

/**
 * 获取 SVG 序列化字符串（用于导出）
 * @returns {string}
 */
export function serializeSVG() {
    const svg = document.getElementById('topologySvg');
    if (!svg) return '';
    return new XMLSerializer().serializeToString(svg);
}
