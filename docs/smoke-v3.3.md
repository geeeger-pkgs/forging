# Forging v3.3 实机烟测报告 ·「地基与长尾」

> 阶段：⑤ 测试（实机烟测）。设计：`docs/design-v3.3.md`（修订版）；计划评审：`docs/review-v3.3-plan.md`。
> 环境：Chrome（ZCode IAB，`setViewportSize` 直连视口：375×720 / 1200×800），`npm run dev` localhost:5174，DEV 构建。
> 存档注入：用 localStorage 播种（读档前拦下应用 beforeunload 回写，见 v3.2 烟测同法），
> 场景 = 高等级（解锁赛季）+ 一件待领远征 + 一件满词缀金镐（供回收确认）。

## 1. 结果

| # | 测什么 | 实测 | 判定 |
|---|---|---|---|
| S1 | A 组组件测试层 | `npm test` **26 文件 / 463 项**全绿（组件用例 25 条）；jsdom 逐文件声明，内核用例仍跑 node（数量不减） | ✅ |
| S2 | A2 操作矩阵可达性 | 组件用例 25 条（A2 矩阵 12 + C 组与处置回归 13）；其中 **store 变化级**断言 15 条、元素/aria 级 10 条（评审指出原表述夸大，已按实修正）；**虚假验证**：把卸下按钮条件改成 `false` → ①用例变红，还原 → 全绿 | ✅ |
| S3 | A4 真实档回归 | `tests/fixtures/save-v13.json`（字段齐全：装备/词缀/槽位/增益/自动回收/配装/赛季/深渊/材料/技能）载入后逐项保留，且两次载入幂等 | ✅ |
| S4 | C1 徽标 | 播种 1 条待领远征 + 教程可领 → 开关与抽屉「远征」项同时显示 `2`；无待领时不渲染（组件断言） | ✅（截图 `v33-mobile-season.png`） |
| S5 | C2 方向键 | 在 tablist 派发 ←/→/Home/End：`装备 →(→) 行囊 →(→) 资源`、`End` 停在资源、`Home` 回装备 | ✅ |
| S6 | C2 修正（实机发现） | 初次实测 `End` 把**已展开的资源分区收起**了（键盘复用了"再点一次收起"的点击语义）→ 已拆出 `selectRightTab`：键盘只选中、不收起 | ✅（修复后复测） |
| S7 | C3 键盘化 | 组件测试断言材料名/行囊名 `role=button` + `tabindex=0` + Enter（v3.2 已加 Space） | ✅ |
| S8 | C4 高价值回收确认 | 满词缀金镐（完美度 1.0 ≥ 阈值 **0.95**）点「回收」→ 弹确认 `回收「金镐 +5」？`（阈值经评审由 0.9 上调 + 新增"强化 +3 起必确认"）；接受/拒绝/强化投入三分支由组件用例覆盖 | ✅ |
| S9 | B1 赛季缩放（玩家可见） | 图鉴页赛季面板显示 `目标已按你的账号进度调整：老手档 ×0.66`；目标数值 = 基础 ×0.66 向上取整（强化 T4：120/320/600 → **80/212/396**） | ✅（截图 `v33-mobile-season.png` / `v33-desktop-season.png`） |
| S10 | 桌面回归 | 1200px：无横向溢出、右栏 Tab 条隐藏（三区同显）、徽标照常可见 | ✅ |
| S11 | 门禁 | `npm test` **463 全绿**｜`typecheck` 无错｜`build` gzip 见 §5｜`gen:check` 通过｜`audit:fx:check` 通过｜`audit:content` 零发现 | ✅ |

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

## 5. 评审处置后的复跑（两名评审员各 7.5/10、无 Blocker；条件项全部落地）

| 项 | 结果 |
|---|---|
| C3 触控高度（评审 M1，两人共同指出） | `.clickable` 窄屏补 `min-height: 40px`（此前 DoD 写了但没实现）+ 样式契约用例 |
| C4 阈值（评审 M2） | `perfectScore 0.9 → 0.95`、`goldGain 5000 → 20000`、新增 `enhanceLevel ≥ 3` 触发（文案追加"强化 +N 的投入不返还"）；config 校验 + 三分支用例 |
| C1 徽标（评审 M3） | 计数按目的地拆分（远征项只报远征、开关报总数）；改 `role=status` + 强调色（不再用危险红） |
| 赛季分母（评审 Minor） | `seasonView.maxRenown` 改为满级声望 60；实机截图可见 `声望 0 / 60`（此前 `/120`） |
| 证据链（评审 Major） | sim 的 `levelReward` 改读内容表并落 JSON（20 行）；新增用例逐行比对"脚本 == 表" |
| 键盘（评审 Minor） | 槽位/材料/行囊的 Space 由 `keyup` 改 `keydown`（按下瞬间的默认滚动不再发生） |
| 重截证据（评审 M4） | `docs/v33-mobile-season.png`（375px：赛季面板 + "目标已按你的账号进度调整：老手档 ×0.66" + 缩放后目标 165k/330k/528k 与 80/212/396 + 声望 0/60）、`docs/v33-desktop-season.png` |
| 门禁 | `npm test` 463 全绿｜`typecheck` 无错｜`build` gzip 见提交信息｜`gen:check` / `audit:fx:check` / `audit:content` 全通过 |
