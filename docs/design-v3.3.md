# Forging v3.3 设计文档 ·「地基与长尾」

> 阶段：① 创意 → ② 计划（本文档）→ ③ 评审（独立评审仲裁）→ ④ 开发 → ⑤ 测试（含实机烟测）→ ⑥ 资深玩家评审
> 上游：`docs/08-roadmap-v3.md`（每版"可验收的最小完整闭环"）、`docs/review-v3.0-two-players.md` / `-hardcore.md`（登记项）、
> `docs/review-v3.2.md` §4（复审登记项）、`docs/design-v3.2.md` §2（明确不做项）
> 依赖：v3.2.0 已发布（存档 v13）；本版若新增持久字段则 **存档 v14**（见 §4）
> 原则：**先模拟后定档**（数值项必须有 `scripts/sim-*.mjs` + `docs/sim-*-output.json` 机器校验）；**证据链**（文档数字 = 脚本输出 = 内容表）

## 0. 动机（来自三处登记，不是临时起意）

| 来源 | 原话/登记 | 本版回应 |
|---|---|---|
| v3.2 评审（两人独立） | "**全绿 ≠ 本版 UI 可用**"：v3.2 的 Blocker（卸下不可达）与 Major（死选择器）在 379 项内核测试全绿的情况下溜过验收，因为**没有任何组件级测试** | A 组：建立组件测试层 + 关键操作矩阵 |
| v3.0 硬核评审 P3 | "赛季对中后期玩家是 **14 天 303h 苦役换 6.7 万金**（脚本自评 **270% 预算**）" | B 组：赛季目标动态缩放 + sim-season 重定档 |
| v3.0 双玩家评审 B 组 | "**Lv80→100 零内容**"（76+ 段 multiplier 1.01，无数值/玩法变化） | B 组：76~100 段补可见成长 |
| v3.2 评审复审 | 「更多」抽屉对新人是"不存在的功能"；tablist 缺方向键；材料名/行囊名不可键盘 | C 组：交互补完 |

> 一句话：v3.2 把"看得见的界面"打磨好了，v3.3 修**地基**（测试层）与**长尾**（中后期玩家的目标感）。

## 1. 范围

### A. 可达性测试层（工程地基，本版**必做**）

| # | 项 | 方案 |
|---|---|---|
| A1 | 引入组件测试环境 | 加 `@vue/test-utils` + `jsdom`（**仅 devDependencies**，运行时依赖仍只有 Vue）；`vitest.config` 用 `environmentMatchGlobs` 让 `tests/components/**` 跑 jsdom，其余保持 node（内核测试不受影响、不变慢） |
| A2 | 核心操作矩阵（组件级） | 覆盖 v3.2 出事故的路径：**槽位→详情→卸下**、行囊→装备/回收、右栏 Tab 开合与滚动、材料「…」菜单（行内渲染/空输入不提交/关自动）、抽屉开合与"更多 · 分区"、成就 0/N 显示、教程卡「前往」。断言"**操作可达**"（元素存在 + 触发后 store 变化），而非断言像素 |
| A3 | 门禁统一 | `npm test` 一条命令同时跑内核 + 组件；CI/文档 DoD 只认这一条 |

### B. 长线纵深（数值项，必须有模拟证据）

| # | 项 | 现状 | 方案 | 证据 |
|---|---|---|---|---|
| B1 | 赛季目标动态缩放 | 三档目标固定（如金币 25/50/80 万），中后期玩家 14 天要 303h（**270% 预算**）；满级需 80 级声望 | 目标按"账号成熟度"缩放：取**上一个赛季结束时的等级**（`meta.season.bestRenown` 新增，存档 v14）分 3 档系数（新号 ×1.00 / 中期 ×0.85 / 老号 ×0.70）；满级门槛 80 → 60 级声望 | `scripts/sim-season.mjs` 重跑 → `docs/sim-season-output.json` 含"三类账号 × 6 模板的达成工时 / 预算占比"，测试断言**全部 ≤100% 预算** |
| B2 | Lv80→100 段补内容 | 76+ 段 multiplier 1.01，玩家只看到数字变大 | 改为**每 5 级一个可见里程碑**（Lv80/85/90/95/100 各给一条永久被动：如全体挖速 +1%、强化成功率 +0.5%…），数值取自 `sim-curve` 重定档（保证总时长不因此缩短 >5%） | `scripts/sim-curve.mjs` 重跑 → `docs/sim-curve-output.json` 含 76~100 段时长与被动累计收益；测试断言曲线单调、总时长在预算内 |

> 两组都必须遵守：**内容表驱动**（`data/season.json` 加 `scaleByMaturity`、`data/levelCurve.json` 加 `milestones`），生成器 `scripts/gen-content.mjs` 同步，`npm run gen:check` 通过。

### C. 交互补完（v3.2 评审登记项）

| # | 项 | 方案 |
|---|---|---|
| C1 | 「更多」抽屉可领奖徽标 | 抽屉开关在**有可领取奖励**时显示小圆点 + 数量（任务可领 / 图鉴里程碑可领 / 赛季等级奖励可领 → 三者取并集；数据来自已有 selector，不新增状态） |
| C2 | tablist 方向键导航 | 右栏 Tab 支持 ←/→ 切换 + Home/End（roving tabindex：只有当前 tab 可 Tab 聚焦，符合 APG）；`aria-controls` 已就位 |
| C3 | 非按钮点击点键盘化 | 材料名 / 行囊名（`.clickable`）补 `role="button"` / `tabindex=0` / Enter+Space；`.clickable` 提升为可复用样式 |
| C4 | 回收撤销 | 单件回收后 toast 提供「撤销」（5 秒内，恢复实例/材料；不改写存档版本，撤销窗口只存在于内存 + 立即落盘前） |

> C4 若在实现中与"命令即落盘"（`cmd()` 内 `saveNow()`）冲突，则降级为"高价值回收二次确认"并如实登记，不硬做。

## 2. 明确不做（记入 v3.4 或后续）

- 行囊折叠进主面板、图鉴未收集条目图标/来源标签（v3.2 登记，本版聚焦地基与长尾）
- 底栏形态改"底部 sheet"（等真机反馈）、iOS 软键盘与底栏关系（无真机环境，**已知限制**登记）
- 动作预设/行囊拖拽排序、图鉴全文检索（成本高、收益低）
- 二段/三段教程（引导层新设计，需单独一次创意）

## 3. 验收标准（DoD）

- [ ] **A 组**：组件测试层可用（jsdom 隔离，内核测试不受影响）；核心操作矩阵 ≥12 条组件用例，且**每条都断言"可达"**（元素存在 + 交互后状态变化）；`npm test` 一条命令全绿
- [ ] **B 组**：赛季目标缩放与 76~100 里程碑均**表驱动**；`sim-season` / `sim-curve` 输出落盘并被测试机器校验；赛季三档目标对三类账号均 **≤100% 预算**；等级曲线总时长变化 ≤5%
- [ ] **C 组**：徽标 / 方向键 / 键盘化 / 撤销 四项均落地，且有源码契约或组件测试覆盖
- [ ] **存档**：若新增持久字段（`meta.season.bestRenown` 等）→ `SAVE_VERSION 13 → 14` + 迁移 + `tests/migration.test.ts` 补一版；旧档载入无感（真实旧档 JSON 回归）
- [ ] **门禁**：`npm test`｜`typecheck`｜`build`（gzip ≤110KB 预算内，超出则显式登记修订）｜`gen:check`｜`audit:fx:check`｜`audit:content`（零发现）
- [ ] **实机烟测**：真实浏览器跑桌面 + 375/390px：卸下/装备/回收可达、右栏方向键、徽标出现与消失、撤销窗口内/后行为；截图落盘 `docs/`
- [ ] **评审**：⑥ 资深玩家评审（≥1 名独立评审员）给出结论；Blocker 当版清零

## 4. 实现清单（文件级，供评审核对范围）

| # | 文件 | 改动 |
|---|---|---|
| 1 | `package.json` | devDeps：`@vue/test-utils`、`jsdom`；`test` 脚本不变（vitest 自动发现） |
| 2 | `vitest.config.ts` | `environmentMatchGlobs`：`tests/components/**` → jsdom，其余 node |
| 3 | `tests/components/*.test.ts`（新） | A2 操作矩阵 |
| 4 | `data/season.json` + `scripts/gen-content.mjs` | `scaleByMaturity`（3 档系数）、`levels` 80→60 相关重定档 |
| 5 | `data/levelCurve.json` | `milestones`（Lv80/85/90/95/100 被动） |
| 6 | `src/game/season.ts` | `seasonTargetsFor(state)`：按成熟度缩放；`meta.season.bestRenown` 维护 |
| 7 | `src/game/level.ts` | `levelMilestones(state)`：已达成里程碑与被动聚合 |
| 8 | `src/game/settle.ts` / `equipment.ts`(若在) | 里程碑被动并入现有加成池（**同池相加**，不新增乘区） |
| 9 | `src/app/persist.ts` | 迁移 v14（补 `bestRenown`）；`ensureFields` 幂等 |
| 10 | `src/ui/components/NavBar.vue` | C1 徽标（可领奖并集） |
| 11 | `src/ui/components/RightPanel.vue` | C2 方向键 + roving tabindex；C3 `.clickable` 键盘化 |
| 12 | `src/ui/components/Toasts.vue` / `src/app/store.ts` | C4 撤销动作 |
| 13 | `scripts/sim-season.mjs` / `scripts/sim-curve.mjs` | 重跑并落盘新输出 |
| 14 | 测试 | B 组断言（预算 ≤100%、曲线单调且时长变化 ≤5%）、A2 组件矩阵、C 组契约、迁移 v14 |

## 5. 风险与对策

| 风险 | 对策 |
|---|---|
| 引入 devDeps 破坏"依赖最小"纪律 | 明确只进 devDependencies；`npm run build` 产物与 gzip 预算不受影响（DoD 有断言） |
| 赛季缩放让老玩家"越玩越轻松"（反向不公平） | 缩放只作用于**目标数值**，声望/奖励不变；且下限保护（缩放后不低于上一档 ×1.5，防倒挂） |
| 里程碑被动引入新的堆叠失控 | 被动走**加法池**（与词缀/符文/精通同池）；`sim-curve` 输出含叠加后的 76~100 段时长 |
| 组件测试变慢/变脆 | 只测"可达性"（role/text + store 变化），不测像素；jsdom 只在 `tests/components/**` 生效 |
| 撤销机制与"命令即落盘"冲突 | 见 C4 备注：冲突则降级为高价值二次确认并登记 |

## 6. 证据计划（本版要产出的机器可读产物）

- `docs/sim-season-output.json`：三类账号 × 6 模板 × 三档的**达成工时 / 预算占比 / 缩放系数**
- `docs/sim-curve-output.json`：1~100 级段时长、76~100 里程碑被动累计、总时长对照（改前/改后）
- `tests/components/` 运行输出（组件矩阵）
- `docs/smoke-v3.3.md`：实机记录 + 截图
- `docs/review-v3.3-plan.md`（本计划的独立评审）、`docs/review-v3.3.md`（发布前资深玩家评审）
