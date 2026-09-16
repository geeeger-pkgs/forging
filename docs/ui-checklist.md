# UI/UX 打磨检查清单（人工/实机）

> **背景**：v3.6 ~ v3.6.2 期间用**源码契约测试**（`tests/ui-contrast|ui-mobile|ui-polish|components/panel-copy-numbers`）
> 锁过一批 UI 值。用户指示：后续 UI 可能大改，**契约测试停用**（这些断言绑定了具体类名/样式值/文案，
> 大改时会成为负担）——本文件承接它们守住的知识，改为**打磨时逐条自查**。
>
> 仍然保留的自动化守卫：
> - `tests/copy-numbers.test.ts`：模板/白名单 .ts 里**不许硬编码** `×N / N天 / vN.N / 每N层条套级 / N+×层`（内容一致性，与布局无关）；
> - `tests/components/reachability.test.ts` / `tutorial-landing.test.ts`：元素可达与教程落点（**行为级**，非样式）；
> - 内核全部测试（数值/存档/赛季/成就/迁移）。

## 1. 对比度（WCAG AA，暗色主题）

- 正文/小字文本对比度 ≥ **4.5:1**；大字（≥24px 或 ≥18.66px 粗体）≥ 3:1。
- 改色时注意**三个方向**，别只查一个：
  1. token 压深色底（常规）；
  2. **文字压彩色底**（如选中 Tab 的白字压强调蓝——曾 3.24，需深色文字）；
  3. **opacity 合成的禁用态**（整卡 0.5 会把文字压到 2.26 → 禁用态请用"深底 + 可读文本 + 🔒/虚线"表达，不要整体降透明）。
- 参考值（on `--c-panel-2`）：text 13.27 / dim 5.26 / accent 7.95 / accent-2 **4.97** / success 6.82 / danger **5.16**。
- 工具：浏览器 `evaluate` 遍历叶子文本算对比度（旧脚本见 git 历史 v3.6 提交）；或 `node` 手算。

## 2. 移动端触摸目标（窄屏 ≤900px）

- 交互元素命中区 ≥ **40px 高**（项目标准；`.btn/.btn.sm` 已有全局兜底）。
- **容易漏的**自定义控件：`.tab / .search / .sel / .num / .num-input / .slot-item / .slider / .select / .text-input / .opt`。
- **输入类控件字号 ≥16px**（iOS 对 <16px 聚焦会强制放大页面）；注意 scoped 样式会按特异性压过全局兜底，必须写在组件内。
- `range` 滑杆给足高度（≥36px）才有可拖的命中区。

## 3. 移动端布局

- **导航可达**：滚动容器内导航必须有 sticky/等价方案——曾出现成就页滚到 8000+px 后导航完全不可见。
- **溢出检查查内层滚动容器**（`.body`），不要只查 `documentElement`（曾漏报 75px：select 固有宽度撑破容器）。
- 固定底栏（右栏 Tab 条）：内容容器留等高 padding + `env(safe-area-inset-bottom)`。
- 长文本：窄屏给行内布局 `flex-wrap: wrap` + 文本项 `min-width: 0`，并隐藏推开用的 `.spacer`。
- 弹窗：`max-height` 用 `dvh`（iOS 工具栏下 `vh` 是"大视口"）。

## 4. 交互细节

- 全局 `touch-action: manipulation`（防双击缩放误触）。
- hover 效果包在 `@media (hover: hover)` 内（触屏点完不残留高亮），配套给 `:active` 按压反馈。
- 内层滚动容器 `overscroll-behavior-y: contain`（防 Android pull-to-refresh 误刷新）。
- 折叠/展开类交互给 `aria-expanded`；图标按钮给可访问名。

## 5. 文案

- 数字从内容表插值（`copy-numbers` 守卫在跑；面板级精确文案断言已随契约测试停用——大改时人工抽查数值与 `data/*.json` 一致）。
- 术语中文化：T1~T7 尽量写"金档（T4）"式中文注（档位表见 `src/ui/format.ts` 的 `TIER_CN/tierLabel`）。
- 空状态/说明文案要能回答"我该做什么"（例："该装备暂无词缀——锻造产出的装备才会自带词缀"）。

## 6. 打磨后的自验流程（简便版）

1. `npx vitest run`（内核 + 行为级测试应全绿；UI 大改后如有行为测试变红，按新交互更新）；
2. `npm run typecheck`；
3. `npm run dev` 实机过一遍：手机视口（390×844）与桌面（1280×800）各看关键页；对照本清单 §1~§5 自查；
4. 有改动就 commit。
