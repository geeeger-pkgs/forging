# Forging v3.6 设计：界面显示与移动端交互优化

> 触发：用户指示「优化界面显示及移动端交互，然后再跑测试」。
> 方法：ui-ux-pro-max 技能检索（UX/Web 域）→ 生产构建实机审计（390×844 手机视口 + 1280×800 桌面）
> → 自动审计脚本（对比度 / 触摸目标 / 固定元素遮挡 / 溢出）→ 逐项修复 + 断言 + 探针。
> 版本号 3.6.0（封板后首个体验专版，不改玩法与数值）。

## 1. 审计证据（全部实机产出，非推断）

审计环境：dev server（:5173）+ iPhone 14 视口（390×844）+ Chromium；脚本遍历全部可见文本节点与可点元素。

> **口径订正（v3.6.1，评审实测证伪）**：下表的"横向溢出"与"触摸目标"两行口径过宽——
> ① 溢出当时只查 `documentElement`，**漏了内层滚动容器 `.body`**（设置页实际溢出 75px，v3.6.1 已修）；
> ② 触摸目标当时只覆盖主区/图鉴/…面板按钮，**漏了 `.tab/.search/.sel/.num-input/.slot-item`**（v3.6.1 已修）。
> 修复与复测见 §5。

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

## 5. v3.6.1 评审处置（双人评审 → 实机证实 → 修复）

### 5.1 评审发现与处置

| 严重度 | 发现（评审视角） | 实机证实 | 处置 |
|---|---|---|---|
| Major | **窄屏导航不可达**（B）：NavBar 在滚动容器内，成就页 82 卡 ≈ 9000px | ✅ 滚到底 nav top=**-8132px** | **已修**：窄屏 `.nav { position: sticky; top: 0; z-index: 15 }` + 教程卡折叠开关（`.t-title` 变按钮，实测导航 233→**139px**，复测滚到底 nav 仍可见） |
| Major | **内层滚动容器溢出**（B）：设置页 select 固有宽度撑破 `.body`；旧审计只查 documentElement 漏报 | ✅ `.body` 溢出 **75px** | **已修**：`.select { min-width: 0; flex: 1 }`，复测溢出 **0** |
| Major | **非 .btn 控件漏兜底**（B）：.tab 27px / .search 29px / .sel 23px / .num-input 22px / .slot-item 20px | ✅ 全部复现 | **已修**：theme.css 窄屏统一 min-height 40px；复测 .tab=40 / .search=40 / .slot-item=40 |
| Major | **白字压 accent-2 仅 3.24**（A/B）：本轮提亮 token 反而恶化 | 计算验证（旧 3.71 → 3.24） | **已修**：`.tab.active` 改深色文字（5.45） |
| Major | **iOS 输入 <16px 聚焦放大**（B）：F3 只到 14px 差 2px | 实机实测 select/text-input 仍 **13px**（全局兜底被 scoped 特异性压过） | **已修**：5 个组件 scoped 窄屏 16px（MainPanel/ItemDetailModal/SettingsPanel/ActionDialog/RightPanel）；复测 `.search`=16px |
| Major | **对比度盲区**（A/B）：opacity 合成（成就 0.5 → 2.26）、token 当背景 | 计算验证 | **部分修**（.tab.active）；opacity 合成面（成就/深渊/远征禁用态）**登记 v3.6.2** |
| Minor | 断言可被注释/移出媒体查询骗过（A-m3/m4） | worktree 探针复现 | **已修**：`ui-mobile.test.ts` 与 `ui-contrast.test.ts` 增加剥注释 + 媒体查询配平提取 |
| Minor | `.ms` 窄屏被降 11px（A-m1/B-m6） | 计算+源码 | **已修**：改用 `--fs-note` |
| Minor | 长文本无换行兜底 / overscroll 链式 / iOS vh / 自定义控件无按压反馈 / hover 触屏残留（B-m1/m2/m3/m5） | 源码审查 | **已做**：overscroll-behavior: contain、dialog 84dvh、`.cell:hover` 包 `@media (hover:hover)` + `:active`、`.tab/.rtab/.slot-item:active`；长文本兜底**登记** |
| Minor | 硬编码色残留（ActionGrid `#868b9e` 4.76 勉强过线等，A-m2） | 计算 | **登记 v3.6.2**（当前达标，属 token 纪律） |

### 5.2 探针与回归

- **探针（8 处篡改实测全红）**：sticky 删除 / `.slot-item` 从兜底移除 / `.tab.active` 回退 #fff / select 收缩删除 / overscroll 删除 / `tutOpen` 去响应式 / `.ms` 回退 11px / 组件 16px 删除。
- **回归**：559 passed / 34 文件 ｜ typecheck ｜ build（gzip 110.47KB）｜ 实机复测（导航 sticky、溢出 0、.tab/.slot-item 40px、搜索框 16px、深色 active 字）。
- **版本**：3.6.0（package.json + 审计产物）。

