# MEMORY.md - 长期记忆

## 项目：AIDC智算拓扑生成器

### 开发偏好
- **内联版本构建**：不需要每次修改代码后都重建 `aidc_network_diagram_inline.html`，只在用户明确要求或需要发布时才执行 `node build-inline.js`。
- 代码修改时只需关注多文件模块化版本（`index.html` + `js/*.js`），通过 `start-server.bat` 在 localhost:8080 调试。

### 技术架构
- ES Module 多文件架构：config.js, state.js, storage.js, hardware-engine.js, layout-engine.js, svg-renderer.js, stats-panel.js, interaction.js, export.js, app.js
- SVG 三层渲染：bgLayer, linkLayer, nodeLayer
- 三种组网架构：单平面(蓝) / 物理双平面(P1/P2独立) / 虚拟双平面(VRF1/VRF2分区+逃生)
- hardware-engine 使用 memoization 缓存，composite key 包含所有选项参数
- localStorage 持久化，含字段校验
- 内联构建：`node build-inline.js`（剥离 import/export，拼接 JS，内联 CSS）

### 侧边栏配置项（当前）
- 算力服务器数量 (serverCount): 默认 128
- GPU规格 (gpuType): 默认 B300_8
- 算力服务器存储网卡配置 (serverStorageNic): BF3 2*200G / CX7 2*200G / CX7 400G
- 存储服务器数量 (storageServerCount): 0-1024, 默认12
- 存储网卡配置 (storageNic): BF3 2*200G / CX7 2*200G / CX7 400G
- 存储网卡数量 (storageNicCount): 1/2/4, 默认2
- 组网架构 (architecture): 单平面/物理双平面/虚拟双平面, 默认虚拟双平面
- 连线明暗 (linkOpacity): 默认 60%（范围 3%~100%）
- 连线粗细 (linkStrokeWidth): 默认 2.0（范围 0.5~4.0）

### 拓扑图压缩显示策略（三层统一）
| 层级 | 阈值 | 压缩行为 |
|------|------|----------|
| **Spine** | >3台 | 显示第1、第2台 + gap + 最后1台 |
| **Leaf** | >3对/POD | 显示第1、第2对 + gap + 最后1对 |
| **Server** | 始终 | 固定显示3个槽位：第1台、第2台、ellipsis、最后1台 |
| **POD** | >2个 | 显示POD1、POD2 + gap(>3时) + 最后1个POD |

- 压缩逻辑统一使用 `buildCompressedPositions(totalCount)`（Spine/Leaf/Server）和 `buildPodPositions(podCount)`（POD层）
- gap占位符统一风格：虚线矩形 + `← xN →` + 类型省略标签
- 画布宽度基于可见位置数计算，最大4个POD位置（4×1400=5600px），不再随实际POD数无限扩展

### 导出逻辑
- `export.js` 使用 `getExportCSS()` 动态函数，从 `appState.linkStyle` 实时读取 `opacity` 和 `strokeWidth` 注入导出 SVG
- 确保导出时连线的明暗和粗细与当前设置完全一致

## 用户偏好
- 简体中文交流，专业技术背景
- 偏好表格格式输出，结构化分类报告
- 先提完整需求框架，后续分步补充细节
- 执行确认机制：AI提供详细计划，用户回复"执行"后执行
- 处理Excel前需列出重复记录供确认后才删除
