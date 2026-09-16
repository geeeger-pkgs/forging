# Forging v3.3 实机烟测报告 ·「地基与长尾」

> 阶段：⑤ 测试（实机烟测）。设计：`docs/design-v3.3.md`（修订版）；计划评审：`docs/review-v3.3-plan.md`。
> 环境：Chrome（ZCode IAB，`setViewportSize` 直连视口：375×720 / 1200×800），`npm run dev` localhost:5174，DEV 构建。
> 存档注入：用 localStorage 播种（读档前拦下应用 beforeunload 回写，见 v3.2 烟测同法），
> 场景 = 高等级（解锁赛季）+ 一件待领远征 + 一件满词缀金镐（供回收确认）。

## 1. 结果

| # | 测什么 | 实测 | 判定 |
|---|---|---|---|
| S1 | A 组组件测试层 | `npm test` 25 → **26 文件 / 457 项**全绿；`tests/components/` 在 jsdom 下运行，内核用例仍全部跑 node（数量不减） | ✅ |
| S2 | A2 操作矩阵可达性 | 15 条组件用例全部断言"元素存在 + 交互后 store 变化"；**虚假验证**：把卸下按钮条件改成 `false` → ①用例变红，还原 → 全绿 | ✅ |
| S3 | A4 真实档回归 | `tests/fixtures/save-v13.json`（字段齐全：装备/词缀/槽位/增益/自动回收/配装/赛季/深渊/材料/技能）载入后逐项保留，且两次载入幂等 | ✅ |
| S4 | C1 徽标 | 播种 1 条待领远征 + 教程可领 → 开关与抽屉「远征」项同时显示 `2`；无待领时不渲染（组件断言） | ✅（截图 `v33-mobile-season.png`） |
| S5 | C2 方向键 | 在 tablist 派发 ←/→/Home/End：`装备 →(→) 行囊 →(→) 资源`、`End` 停在资源、`Home` 回装备 | ✅ |
| S6 | C2 修正（实机发现） | 初次实测 `End` 把**已展开的资源分区收起**了（键盘复用了"再点一次收起"的点击语义）→ 已拆出 `selectRightTab`：键盘只选中、不收起 | ✅（修复后复测） |
| S7 | C3 键盘化 | 组件测试断言材料名/行囊名 `role=button` + `tabindex=0` + Enter（v3.2 已加 Space） | ✅ |
| S8 | C4 高价值回收确认 | 满词缀金镐（完美度 1.0 ≥ 阈值 0.95）点「回收」→ 弹确认 `回收「金镐 +5」？`；接受/拒绝行为由组件用例覆盖 | ✅ |
| S9 | B1 赛季缩放（玩家可见） | 图鉴页赛季面板显示 `目标已按你的账号进度调整：老手档 ×0.66`；目标数值 = 基础 ×0.66 向上取整（强化 T4：120/320/600 → **80/212/396**） | ✅（截图 `v33-mobile-season.png` / `v33-desktop-season.png`） |
| S10 | 桌面回归 | 1200px：无横向溢出、右栏 Tab 条隐藏（三区同显）、徽标照常可见 | ✅ |
| S11 | 门禁 | `npm test` 457 全绿｜`typecheck` 无错｜`build` gzip **107.48KB**（≤110KB）｜`gen:check` 通过｜`audit:fx:check` 通过｜`audit:content` 零发现 | ✅ |

## 2. 本轮实机抓到的问题（已修）

- **S6**：键盘 ←/→/Home/End 复用了 `toggleRightTab`，按到"当前已展开分区"会收起整个面板（APG 语义应为"选中"）。
  修复：拆出 `selectRightTab`（只选中/展开），键盘路径不再 toggle；点击路径保持"再点一次收起"。
  这类问题正是 v3.3 A 组要拦的类型 —— 组件用例里"方向键 + Home/End"那条在当时是绿的，
  因为它只走 →/End/Home 到**未展开**的分区；实机复测才暴露"停在已展开分区"的分支。

## 3. 环境限制（如实登记）

- 本轮 IAB 的 Playwright 命中判定仍会把"点击落在按钮内部 `<span>`"视为被覆盖（`covered by <span>`），
  故部分按钮用页面内 DOM `click()` 驱动；原生点击路径已在 v3.2 各轮验证过。
- 软键盘（iOS）与常驻底栏的相对位置无真机环境，仍未验证（`design-v3.3.md` §2 已登记为已知限制）。

## 4. 复现命令

```bash
npm run dev                         # localhost:5174
node scripts/sim-season.mjs          # B1 系数反推（先跑脚本，再跑生成器）
node scripts/gen-content.mjs         # 生成 data/*.json（会读 sim 输出；缺文件即报错）
npm test && npm run typecheck && npm run build
npm run gen:check && npm run audit:fx:check && npm run audit:content
```
