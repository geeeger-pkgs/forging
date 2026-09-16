# Forging v3.6 设计：界面显示与移动端交互优化

> 触发：用户指示「优化界面显示及移动端交互，然后再跑测试」。
> 方法：ui-ux-pro-max 技能检索（UX/Web 域）→ 生产构建实机审计（390×844 手机视口 + 1280×800 桌面）
> → 自动审计脚本（对比度 / 触摸目标 / 固定元素遮挡 / 溢出）→ 逐项修复 + 断言 + 探针。
> 版本号 3.6.0（封板后首个体验专版，不改玩法与数值）。

## 1. 审计证据（全部实机产出，非推断）

审计环境：dev server（:5173）+ iPhone 14 视口（390×844）+ Chromium；脚本遍历全部可见文本节点与可点元素。

| # | 维度 | 实测结果 |
|---|---|---|
| 1 | 横向溢出 | `scrollWidth == clientWidth`（375/390/1280 三档）✅ 无问题 |
| 2 | 安全区 | `viewport-fit=cover` + `App.vue` / `RightPanel.rtabs` / `Toasts` 均含 `env(safe-area-inset-*)` ✅ |
| 3 | 底部固定遮挡 | `body { padding-bottom: calc(60px + safe-area) }` > `.rtabs` 高 53px，滚到底无内容被遮 ✅ |
| 4 | 触摸目标（主区/图鉴/商店/任务/成就/传承/深渊/远征） | 全部 ≥40px（窄屏 `.btn, .btn.sm { min-height: 40px }` 生效）✅ |
| 5 | 触摸目标（**设置页表单控件**） | ❌ range 滑杆 **16px 高**（音量/动效/回收阈值）、checkbox 行 **21px 高**（label 命中区）、select **28px**、文本输入 **29px** |
| 6 | 对比度（**跨面板**） | ❌ `--c-accent-2 #4f7cff` 在卡片背景 `#1a2036` 上 **4.34**（成就进度/奖励、传承精通点、深渊贡献值）；❌ `--c-danger #e2544a` 上 **4.30**（设置「清档重来」、远征锁定原因、`.bad` 提示）。其余 token 达标（text 13.3 / dim 5.26 / accent 7.95 / success 6.82） |
| 7 | `touch-action` | ❌ 全仓零命中（移动端双击缩放的误触/延迟防护缺失） |
| 8 | 小字号 | ⚠️ 11px 文本 9+ 处（ActionGrid/PrestigePanel/RightPanel/TasksPanel/ItemDetailModal/ExpeditionPanel），手机可读性偏小 |
| 9 | 按压反馈 | ✅ `.btn:active` 1px 位移 + 边框色；`theme.css` 已有 |
| 10 | 动画降级 | ✅ `data-fx` 三档 + `prefers-reduced-motion` 兜底已有 |

> 技能检索（ui-ux-pro-max）：`--domain ux`（Touch Target Size / Tap Delay / Sticky Navigation）与
> `--domain web`（Safe Area Insets）已用于核对以上判据；`--stack vue` 两次检索均无数据库命中（如实记录，
> 未采用未验证输出）。

## 2. 优化项（每项：改法 + 可验证验收）

| # | 项 | 改法 | 验收（自动断言优先） |
|---|---|---|---|
| F1 | 强调蓝对比度 | `--c-accent-2: #4f7cff → #6288ff`（同在 #1a2036 上 4.34 → 4.97） | 新增 `tests/ui-contrast.test.ts`：解析 theme.css token，断言全部前景 token 在 `--c-panel-2` 上 ≥4.5 |
| F2 | 危险红对比度 | `--c-danger: #e2544a → #ea6a60`（4.30 → 5.16） | 同上 |
| F3 | 设置页控件触摸目标 | 窄屏（≤900px）媒体查询：`.opt-row` `min-height: 40px`；`.opt` 行 `min-height: 40px`；`.slider` `height: 36px`；`.select` / 文本输入 `min-height: 40px`、字号 14px；checkbox `18×18` | 源码断言（媒体查询存在 + 关键声明）+ 实机复测 ≥40px |
| F4 | `touch-action` 防护 | `theme.css` 全局 `html, body { touch-action: manipulation }` + 交互元素继承（不改滚动行为） | 源码断言 + 实机 `getComputedStyle(body).touchAction` |
| F5 | 11px 小字（窄屏） | 各组件在 ≤900px 媒体查询内把 11px 辅助文本提到 12px（仅窄屏，桌面不动） | 组件级源码断言（关键类）+ 实机复测 |

**非目标（本轮不做）**：玩法/数值/文案内容变更（封板版已定稿）；`--stack vue` 无据可依的框架级重构；
未在审计中出现的"美化"改动（避免无证据变更）。

## 3. 工作流与门禁

1. 实施 F1~F5（编辑器工具落盘，逐一 commit）；
2. 新增断言**必须过自探针**（篡改 → 红 → 恢复），纪律 2；
3. 回归：`npx vitest run` / `npm run typecheck` / `npm run build`；
4. 实机烟测（手机视口）：设置页拖滑杆 / 勾选 / select、抽屉、弹窗、成就/深渊面板文字对比度复扫；
5. 独立评审（1 名 UI/UX 视角 + 1 名玩家视角，证伪优先）→ 处置 → 复评。

## 4. 风险与对策

| 风险 | 对策 |
|---|---|
| 提亮 token 影响全应用观感 | 只动 accent-2 / danger 两个 token，色相不变（仅亮度 +8%~+12%）；改后出全面板截图对照 |
| 触摸目标放大导致窄屏拥挤 | 仅设置页表单行加高（信息密度低）；其余面板按钮已有 40px 规则，不动 |
| 字号提升引发换行/溢出 | 只在 ≤900px 生效且只提 1px；改后跑 375/390 溢出检查 |
| 无证据改动引入回归 | 每项改动绑定断言或实机复测证据；无证据的美化不做 |
