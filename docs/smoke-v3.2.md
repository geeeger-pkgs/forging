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

## 4. 复现命令

```bash
npm run dev                 # localhost:5174
# 浏览器：打开 / 后执行（DEV 构建）
#   iframe(w=390|375|1200) 加载 '/' → 读 computed style 与 scrollWidth
npm test && npm run typecheck && npm run build
npm run gen:check && npm run audit:fx:check && npm run audit:content
```
