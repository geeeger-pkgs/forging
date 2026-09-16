# Forging v3.2 实机烟测报告 ·「界面打磨」

> 阶段：⑤ 测试（实机烟测）+ DoD 逐条复核。设计：`docs/design-v3.2.md` §3（DoD）。
> 环境：Chrome（ZCode IAB，视口 375×720，`npm run dev` localhost:5174），DEV 构建。
> 窄屏方法：IAB 不提供视口调节，故注入**同源 iframe**（宽 390 / 1200）加载应用，媒体查询按 iframe 视口求值（与 v3.0 R8 同法）。

## 1. 结果（DoD 逐条）

| # | DoD 条目 | 实测 | 判定 |
|---|---|---|---|
| 1a | 375px 无横向溢出 | `documentElement.scrollWidth === innerWidth === 375`；390px 同 | ✅ |
| 1b | 工具抽屉可开合 | 默认收起（`#nav-tools` display:none、aria-expanded=false）→ 点「更多」展开出 8 个入口、aria=true → 再点收起 | ✅（修复后） |
| 1c | 右栏 Tab 可切换、默认不遮挡主内容 | 默认零 section 可见、`position: static`（不覆盖主内容）；点「装备」→ gear 显示且 aria-selected=true；再点收起 | ✅ |
| 1d | 桌面（1200px）降级正确 | 工具区 8 入口全展示（collapsed class 失效）+ 开关隐藏；右栏三分区同显、Tab 条隐藏 | ✅ |
| 2a | 键盘焦点可见 | 聚焦后 `outline-style: solid`（`theme.css :focus-visible` 规则命中） | ✅ |
| 2b | 键盘可操作 + aria 同步 | Space 实测：抽屉「更多」开合、右栏 Tab 切换，`aria-expanded`/`aria-selected` 同步翻转 | ✅ |
| 3 | 日常操作零系统弹窗 | 源码扫描：`src/ui` 无 `window.prompt(`；实机：点「存配装」→ 无 JS 对话框、出现内联输入 → 输入「深渊套」+Enter → 无对话框、输入关闭、命令按预期返回 `✖ 当前没有已装备的物品`（该存档无装备） | ✅（修复后） |
| 4 | 时长/百分比格式与边界 | `tests/format.test.ts`：0/负数/NaN/∞、<10s 一位小数、59s、**59.9s → "1m 0s"**、60s、3599s、3600s、`fmtPct` 一位小数与 `—` 兜底 | ✅（修复后） |
| 5 | test / typecheck / build | 391 项 23 文件全绿；`vue-tsc --noEmit` 无错；`vite build` 成功 gzip **105.85KB**（≤110KB 修订预算） | ✅ |

## 2. 核验中发现并修复的 3 项（详见 design-v3.2 §3「核验发现」）

1. **窄屏抽屉默认态写反**：初值 `!TOOL_VIEWS.includes(view)` → 技能页为 true → 窄屏默认展开，首屏被工具区占满（与设计相反）。修为 `TOOL_VIEWS.includes(store.ui.view)`。**这是本轮 DoD 复核靠实机（非人眼通读）抓出来的**。
2. **`audit:content` 误报长期挂账**：T4 计数器 `X = (X ?? 0) + 1` 写法不被静态规则识别（只认 `X++`/`X +=`），v3.1 起报「从未累加」；toolchain 测试当时只拦 Blocker，故 Major 静默留存。已扩展规则 + 测试收紧为**零发现**。
3. **审计报告版本号硬编码**：`version: '3.0.0'` → 改读 `package.json`（产物现为 3.2.0）。

## 3. 已知限制（如实登记）

- **自动化通道的 Enter 不触发原生 button 的 click**：Playwright `locator.press('Enter')` 与 CUA 原始按键两条路径实测均不激活（Space 正常）。
  涉及控件（抽屉「更多」、右栏三个 Tab）均为原生 `<button>`、无 `tabindex=-1`、无 `preventDefault`，真实浏览器按平台语义 Enter/Space 均可激活；
  故键盘可操作性以 **Space 路径**为准记录，Enter 路径**未在本环境取得证据**。
- 右栏 Tab 条为 `position: sticky; bottom: 0`，在超长页面中会随滚动吸附于视口底部（设计如此，便于随时切换分区）。

## 4. 第二轮：评审处置后的复验（375×720 真视口）

> 评审结论与逐条处置见 `docs/review-v3.2.md`。本轮把视口方法从"同源 iframe 注入"换成 IAB 的
> `setViewportSize`（本机已支持；v3.0 期不支持，故当时用 iframe），两法结论一致。

| 项 | 实测 | 判定 |
|---|---|---|
| 底栏首屏可见（评审 Major） | 未滚动时 `top=667 / bottom=720`（视口 720） | ✅（原 sticky 实现只在页面底部可见） |
| 抽屉默认收起 | display:none + aria-expanded=false | ✅ |
| 抽屉选中后收起 | 展开 → 点「图鉴」→ 视图切到"图鉴与赛季"且抽屉收起 | ✅（原先有 watch 把收起又顶开，已删） |
| 卸下可达（评审 Blocker） | 点槽位 → 弹窗 footer `卸下/关闭/⚒重铸` → 点击后槽位「空」、装备留在行囊 | ✅ |
| 材料菜单行内 | 菜单 1 个实例、位于被点行内（`gapPx=2`）、无输入时「应用」置灰 | ✅ |
| 触控尺寸 | `.rtab` 实测 40px；`.btn.sm` 窄屏 min-height 40px | ✅ |
| 门禁 | 414 测试 / 24 文件全绿、typecheck 通过、build gzip 106.08KB | ✅ |

> **插曲（如实登记）**：首轮"卸下后装备消失"实为该存档开启了**实例级自动回收（<60% 完美度）**，
> 卸下即按玩家设定自动卖出——既有设计行为，非缺陷；关闭设置后复验装备留在行囊。
> 本轮已补 `已卸下「X」→ 行囊` 提示（评审 N2），此类误解不再出现。

## 5. 第三轮：评审复审后的修正复验（375×720）

> 两名评审员复审（7.5 / 8.0，共同放行条件 N1）后的修正，逐条见 `docs/review-v3.2.md` §4。

| 项 | 实测 | 判定 |
|---|---|---|
| N1 面板可达性 | 页面顶部（`scrollTop=0`）点「资源」→ 滚动容器到 537，`#rtabpanel-mats` 进入视口（`top=487`），首行「工匠小箱 ×5」可见 | ✅ |
| N2 卸下提示 | 行囊「装备」→ 点槽位 → 弹窗「卸下」→ 提示条 `• 已卸下「铜镐」→ 行囊`，槽位变「空」 | ✅ |
| N4 导航当前分区 | 选「图鉴」后抽屉收起，开关文案 `更多 · 图鉴` 且带 active 态，主区标题「图鉴与赛季」 | ✅ |
| N5 提示条与底栏 | 提示条容器底 654 < 底栏顶 667（不再被压住） | ✅ |
| N3 倒计时天档 | 单测断言 `fmtDur(14d) === "14d 0h"`（该存档赛季未解锁，实机未见倒计时文案） | ✅（单测） |
| 成就进度 | 82 项中 71 项未完成**全部**显示 `cur / target`（其中 52 项为 `0 / N`） | ✅ |
| 底栏不遮内容 | 滚到底：最后一行材料底 650 < 底栏顶 667 | ✅ |
| 门禁 | 421 测试 / 24 文件全绿、typecheck 通过、build gzip 106.39KB | ✅ |

> 说明：本轮 IAB 的 Playwright 命中判定会把"点击落在按钮内部 `<span>`"视为被覆盖（`covered by <span>`），
> 故部分按钮改用页面内 DOM `click()` 驱动（真实点击路径已在前几轮以原生点击/Space 键验证过）。

## 6. 复现命令

```bash
npm run dev                 # localhost:5174
# 浏览器（DEV 构建）：setViewportSize(375/390/1200) 后读 computed style / scrollWidth
#   （v3.0 期本机 IAB 不支持视口调节，当时用同源 iframe 注入；两法结论一致）
npm test && npm run typecheck && npm run build
npm run gen:check && npm run audit:fx:check && npm run audit:content
```
