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
- 算力服务器数量 (serverCount)
- GPU规格 (gpuType)
- 算力服务器存储网卡配置 (serverStorageNic): BF3 2*200G / CX7 2*200G / CX7 400G
- 存储服务器数量 (storageServerCount): 0-1024, 默认12
- 存储网卡配置 (storageNic): BF3 2*200G / CX7 2*200G / CX7 400G
- 存储网卡数量 (storageNicCount): 1/2/4, 默认2
- 组网架构 (architecture): 单平面/物理双平面/虚拟双平面

## 用户偏好
- 简体中文交流，专业技术背景
- 偏好表格格式输出，结构化分类报告
- 先提完整需求框架，后续分步补充细节
- 执行确认机制：AI提供详细计划，用户回复"执行"后执行
- 处理Excel前需列出重复记录供确认后才删除
