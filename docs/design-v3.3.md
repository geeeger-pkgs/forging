# Forging v3.3 设计文档 ·「地基与长尾」（修订版）

> 阶段：① 创意 → ② 计划 → ③ 评审（**初稿被打回**：Blocker 4 / Major 7 / Minor 7，见 `docs/review-v3.3-plan.md`）→ **修订（本文档）** → ④ 开发 → ⑤ 测试（含实机烟测）→ ⑥ 资深玩家评审
> 上游：`docs/08-roadmap-v3.md`、`docs/review-v3.0-two-players.md`、`docs/review-v3.0-hardcore.md`、`docs/review-v3.2.md`、`docs/design-v3.2.md` §2
> 依赖：v3.2.0（存档 v13）。**本版不改存档结构 → SAVE_VERSION 保持 13**
> 原则：**先模拟后定档**（数值项必须"脚本先出结论、内容表照抄"）；**证据链**（文档数字 = 脚本输出 = 内容表 = 测试断言）

## 0. 动机

| 来源 | 登记原话 | 本版回应 |
|---|---|---|
| v3.2 评审（两人独立） | "**全绿 ≠ 本版 UI 可用**"：Blocker 在 379 项内核测试全绿下溜过验收，因为没有任何组件级测试 | A 组：组件测试层 + 核心操作可达性矩阵 |
| v3.0 硬核评审 P3 | "赛季对中后期玩家是 **14 天 303h 苦役**（脚本自评 **270% 预算**）" | B1：赛季目标按账号分档缩放（系数由脚本反推）+ 满级 80→60 声望 |
| v3.2 评审复审 | 「更多」抽屉对新人是"不存在的功能"；tablist 缺方向键；材料名/行囊名不可键盘；回收不可撤销 | C 组：交互补完（C4 降级为二次确认） |

> v3.2 打磨了"看得见的界面"，v3.3 修**地基**（测试层）与**长尾**（中后期玩家的赛季目标感）。

## 1. 范围

### A. 可达性测试层（工程地基）

| # | 项 | 方案（已按评审修订） |
|---|---|---|
| A1 | 组件测试环境 | devDeps：`@vue/test-utils` + `jsdom`（**仅 devDependencies**；运行时依赖仍只有 Vue）。`vitest.config.ts` 补 **`plugins: [vue()]`**（存在 vitest.config 时不合并 vite.config，SFC 否则跑不起来）；环境隔离用**文件头 `// @vitest-environment jsdom`**（默认仍 node → 421 项内核测试零影响、不变慢。⚠ Vitest 5 已移除 `environmentMatchGlobs`） |
| A2 | 核心操作矩阵（≥12 条） | 直接挂 `RightPanel` / `NavBar` / `ItemDetailModal`（**不挂 App**：避免 `SceneCanvas`/audio/FxLayer 在 jsdom 下拖崩）。覆盖 v3.2 出事路径：槽位→详情→**卸下**、行囊装备/回收、右栏 Tab 开合（含窄屏滚动）、材料「…」菜单（行内/空输入不提交/关自动）、抽屉开合与"更多 · 分区"、成就 0/N、教程卡「前往」。断言"**可达**"= 元素存在 + 交互后 store 状态变化 |
| A3 | 门禁 | `npm test` 一条命令同跑内核 + 组件（仓库无 CI，故表述为"门禁脚本"，不写 CI） |
| A4 | 真实旧档回归 | 补 `tests/fixtures/save-v13.json`（真实结构样本）进 `migration.test.ts`——现有用例是合成样本，roadmap 要求"旧档逐版回归" |

### B1. 赛季目标动态缩放（数值项，脚本先行）

| 项 | 方案 |
|---|---|
| 问题 | `docs/sim-season-output.json`：`once/full`（每日 1 次 ×14 天 = 112h 预算）需 **302.56h = 270%**；中后期玩家把赛季过成"14 天苦役" |
| 预算 profile | 沿用既有口径：`once` 112h / `twice` 224h / `always` 336h |
| 账号分档 | 用**已存在可判定**的 `totalLevelOf(state)`：新晋（≤119）/ 老手（≥120，= 传承解锁线）；**无新增存档字段**（不升 SAVE_VERSION） |
| 系数来源 | `scripts/sim-season.mjs` **先**输出"满足承诺口径的最小系数"，再写入 `data/season.json.scaleByMaturity`（先脚本后定表；生成器缺 sim 输出即报错） |
| **实测（定稿）** | **新晋 ×0.67（T3 模型）｜老手 ×0.66（T7 模型）**；下限 0.35（表内登记）。缩放后**承诺集最差占比 99.1% ≤100%**、严格递增 ✅、下限保护 ✅。证据：`docs/sim-season-output.json.maturity` |
| **参赛资格修正** | 赛季在总等级 60 解锁 → T1 产出的新号**根本不参赛**（脚本保留其作为对照行：连 always/铜档都要 114% 预算）。因此分档只按参保账号定义，初稿的新号档是伪需求 |
| 承诺集 | twice/always × {全铜, 全银, 1金+2银}；once × {全铜 全档, 全银 老手}；**3 金不承诺**（容错档） |
| 测试 | S12 改为"**基础 targets 不被覆盖** + 派生 `targetsScaled` 由 sim 输出机器校验"；`season.ts` 缩放为纯函数只读派生 |

### C. 交互补完

| # | 项 | 方案（已按评审修订） |
|---|---|---|
| C1 | 可领奖徽标 | 数据源 = **远征待领取（`run.done && !claimed`）+ 教程可领**（任务/图鉴/赛季奖励是自动发放，**没有**可领取态——初稿此处是事实错误）。挂两处：`更多` 开关（窄屏收起时可见）+ 抽屉内「远征」项（展开时与桌面可见） |
| C2 | tablist 方向键 | roving tabindex + ←/→/Home/End（定位：窄屏外接键盘/读屏可用性） |
| C3 | 非按钮点击点键盘化 | 材料名/行囊名补 `role="button"`/`tabindex=0`/Enter+Space；`.clickable` 窄屏触控高度补到 **40px**（与 v3.2 标准一致） |
| C4 | 回收二次确认（降级） | 实例回收：完美度 ≥ 阈值 **或** 单件收益 ≥ N 金时 `confirm`。"5 秒撤销"**不做**（登记 v3.4）——理由：`cmd()` 每命令 `saveNow()`；`totalGoldEarned` 是单调计数器，`addGold(-x)` 不回退 → 会"进度入账两次"；`Toasts` 无动作模型且 `pointer-events: none` |

## 2. 明确不做（登记 v3.4，附理由）

| 项 | 理由 |
|---|---|
| **Lv76~100 里程碑**（初稿 B2） | 涉及三件独立工作：① 被动入 `stats.ts aggregateEquipment` 单源（被深渊/结算/经济共用，需重跑 `sim-audit` **堆叠审计**，`design-v3.0.md:49` 的"无永久属性项"结论要改）；② 传承后是否保留（需持久化语义与可能的新字段）；③ 里程碑 UI 展现面。塞进本版会稀释 A/B1/C |
| **效率符文在线口径** | v3.2 §2 明确记入 v3.3，本次再延期：它与 Lv76~100 同属"数值口径批"，需重跑经济审计（`sim-audit` 经济段），与 B2 同批做更省 |
| 底栏改底部 sheet、iOS 软键盘 | 等真机反馈；软键盘相对位置**已知限制**（无真机环境） |
| 行囊折叠进主面板、图鉴未收集图标/来源标签、拖拽排序、图鉴全文检索 | 收益/成本不划算 |
| 二段/三段教程 | 引导层新设计，需单独创意 |

## 3. 验收标准（DoD）

- [ ] **A 组**：`vitest.config.ts` 含 `plugins: [vue()]`，默认环境仍 node；组件用例以 `// @vitest-environment jsdom` 逐文件声明；**A2 操作矩阵 ≥12 条**，每条断言"元素可达 + 交互后 store 变化"；**A4** 真实 v13 fixture 迁移回归通过；`npm test` 全绿且内核用例数量不减
- [ ] **B1**：`docs/sim-season-output.json` 新增"profile × 账号档 × 模板"的工时/预算占比/**反推系数**；`data/season.json.scaleByMaturity` 与脚本输出一致；承诺口径（`twice`/`always` 三档、`once` 铜银档）**全部 ≤100% 预算**；缩放后 targets 严格递增且 ≥base×0.5；`renownPerLevel=3`（满级 60）且等级奖励不变；S12 断言"base targets 未被覆盖"
- [ ] **C 组**：C1 徽标（两处挂点，且"无可领时消失"）、C2 方向键、C3 键盘化 + 40px、C4 二次确认（阈值表驱动）均落地，各有组件或源码契约测试
- [ ] **存档**：SAVE_VERSION 保持 13（本版不新增字段）；真实 v13 档载入无感
- [ ] **门禁**：`npm test`｜`typecheck`｜`build`（gzip ≤110KB；超出则显式登记修订）｜`gen:check`｜`audit:fx:check`｜`audit:content`（零发现）
- [ ] **实机烟测**：桌面 + 375/390px：卸下/装备/回收仍可达、右栏方向键、徽标出现与消失、回收二次确认触发与取消、赛季面板缩放后目标数值；截图落盘 `docs/`
- [ ] **评审**：⑥ 资深玩家评审（≥1 名独立评审员）；Blocker 当版清零

## 4. 实现清单（文件级）

| # | 文件 | 改动 |
|---|---|---|
| 1 | `package.json` | devDeps：`@vue/test-utils`、`jsdom`（不进 dependencies） |
| 2 | `vitest.config.ts` | `plugins: [vue()]`；默认 `environment: 'node'` 不变 |
| 3 | `tests/components/*.test.ts`（新） | A2 矩阵（文件头 `// @vitest-environment jsdom`） |
| 4 | `tests/fixtures/save-v13.json`（新）+ `tests/migration.test.ts` | A4 真实旧档回归 |
| 5 | `scripts/sim-season.mjs` | 新增 3 类账号 × 6 模板 × 3 profile 的工时与**反推系数**；`levelReward` 改读表；落盘 `docs/sim-season-output.json` |
| 6 | `data/season.json` + `scripts/gen-content.mjs` | `scaleByMaturity`（照抄脚本输出）；`renownPerLevel` 4→3 |
| 7 | `src/game/season.ts` | `seasonTargetsFor(state)`（纯函数只读派生，不改 base）；`totalLevelOf` 分档 |
| 8 | `src/game/content.ts` | 校验：`scaleByMaturity` 系数范围、缩放后递增与下限、满级声望一致 |
| 9 | `src/ui/components/NavBar.vue` | C1 徽标（两处挂点；数据 = 远征待领取 + 教程可领） |
| 10 | `src/ui/components/RightPanel.vue` | C2 方向键 + roving tabindex；C3 `.clickable` 键盘化 + 40px；C4 回收确认 |
| 11 | `src/ui/components/SeasonPanel`(若有)/`TasksPanel.vue` | 展示缩放后目标（标注"按账号分档") |
| 12 | 测试 | B1 断言（承诺口径、递增、下限、S12）、C 组契约、A2/A4 |

## 5. 风险与对策

| 风险 | 对策 |
|---|---|
| 引入 devDeps 破坏"依赖最小"纪律 | 只进 devDependencies；`npm run build` 产物与 gzip 不受影响（DoD 有断言） |
| 缩放让老玩家"越玩越轻松"（反向不公平） | 缩放只作用于**目标数值**，声望/奖励不变；下限保护 base×0.5 且严格递增（脚本+内容校验双保险） |
| 组件测试变脆/变慢 | 只测"可达性"（role/text + store 变化），不测像素；jsdom 逐文件声明，内核用例仍跑 node |
| 徽标数据源再次踩空 | 数据源限定为**已确认存在**的待领取语义（远征/教程），并要求"无可领时消失"的组件断言 |
| 回收确认打扰高频操作 | 只在"高价值/高完美度"触发，阈值表驱动 + 可测试 |
| 赛季改表波及既有断言 | 已识别 `tests/season.test.ts` S12 与 `sim-season.mjs` 硬编码 `levelReward`；批 4 一起改 |

## 6. 证据计划

- `docs/sim-season-output.json`：profile × 账号档 × 模板 → 工时 / 预算占比 / **反推系数** / 缩放后 targets
- `tests/components/` 运行输出（操作矩阵）
- `docs/smoke-v3.3.md` + 截图
- `docs/review-v3.3-plan.md`（本计划的评审与修订决议）、`docs/review-v3.3.md`（发布前资深玩家评审）
