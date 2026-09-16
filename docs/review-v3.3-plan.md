# Forging v3.3 计划评审报告（独立评审员 · 对抗性）

> 阶段：③ 评审（计划）。对象：`docs/design-v3.3.md`（提交 `6882ae2`）。
> 评审员独立作业（可读代码/跑只读命令，未参与计划撰写）。
> **结论：打回**（方向正确；B1 的数值方案在数学上无法通过它自己写的 DoD，另有 3 个 Blocker 级事实错误）。

## 1. 打回理由（Blocker）

| # | 发现 | 证据（评审员实测） | 处置 |
|---|---|---|---|
| P-B1 | **B1 的缩放系数与 DoD 算术不相容**：`docs/sim-season-output.json` 的 `once/full`（每日 1 次上线 ×14 天，预算 112h）= 302.56h = **270%**；按计划的 ×0.85/×0.70 缩放后仍为 229% / 189%，连最低的铜档 ×0.70 也是 103%。要 ≤100% 需系数 ≤0.37。若改用"常驻"预算（336h），现状 302.56h 已是 90%，B1 的动机自相矛盾 | `docs/sim-season-output.json` 逐条算式；`scripts/sim-season.mjs:61-64`（只有 mid/end 两类账号，无"新号"）、`:151-161`（reforge 的 taskHours 恒为 0） | ✅ 已修订：**预算 profile 与账号分档写死并可判定**；系数**由脚本反推**（不得先定系数）；DoD 改为分 profile 承诺（见 §2） |
| P-B2 | **C1 的事实前提错误**：任务（`tasks.ts:136-149`）、图鉴里程碑（`codex.ts:151-174`）、赛季等级奖励（`season.ts:172-196`）**全部自动发放**，仓库内无 `claimable/canClaim/pendingReward`。按计划实现，徽标恒不出现——v3.2"死选择器"事故的翻版 | 全仓 grep + 三处发奖代码 | ✅ 已修订：徽标数据源改为**已有待领取语义**的：远征 `run.done && !claimed`（`expeditions.ts:272`）+ 教程可领（`NavBar.vue:104-107`）；"未读"类状态登记 v3.4 |
| P-B3 | **A1 的配置在已装 Vitest 5.0.0 中不存在**：`environmentMatchGlobs` 自 Vitest 4 起移除（评审员 grep `node_modules/vitest` 零命中）；且 `vitest.config.ts` 无 `plugins: [vue()]`，SFC 测试跑不起来（`vitest.config.ts` 存在时不合并 `vite.config.ts`） | `node_modules/vitest` 全目录 grep；`package.json` 锁 `vitest ^5.0.0` | ✅ 已修订：`vitest.config.ts` 加 `plugins: [vue()]`；环境隔离改**文件头 `// @vitest-environment jsdom`**（默认仍 node，内核测试零影响）；devDeps 加 `@vue/test-utils`、`jsdom` |
| P-B4 | **B2 的加成池位置写错且影响面未登记**：仓库无 `src/game/equipment.ts`；真实聚合入口是 `src/game/stats.ts:63-140 aggregateEquipment`，被深渊战力（`abyss.ts:93-105`）、结算（`settle.ts:108/131/245`）、金币（`economy.ts:22`）共用；`design-v3.0.md:49` 登记过堆叠结论"赛季/图鉴/伙伴无永久属性项"，`review-v3.0-two-players.md:56` 原话要求"重跑 sim-curve **+ 堆叠审计**" | 逐文件核实 | ✅ **已修订：B2 整组移出本版**（登记 v3.4，见 §2）——它的堆叠审计、传承语义、UI 展现面是三件独立工作，塞进本版会稀释 A/B1/C |

## 2. 修订后的 v3.3 范围（本报告即修订决议）

**保留并修正**：A 组（组件测试层）、C 组（交互补完，C1 换数据源）、B1（赛季目标缩放，改为脚本反推系数）。
**移出本版**：B2（Lv76~100 里程碑）→ v3.4，理由：需 `sim-audit` 堆叠段重跑 + 传承后是否保留的持久化语义 + 里程碑 UI 展现面，任一未定都会变成"面板≠结算"式事故。

### B1 修订稿（关键：先出证据，再定表）

| 项 | 修订后方案 |
|---|---|
| 预算 profile | 沿用产生 270% 的既有口径：`once`=每日 1 次上线（14 天 = 112h，`sim-season-output.json` 现有字段）、`twice`=每日 2 次（224h）、`always`=常驻（336h） |
| 账号分档 | 用**已存在且可判定**的 `totalLevelOf(state)`：新号 ≤60（×1.00）/ 中期 61~85 / 老号 ≥86（系数由脚本反推） |
| 系数来源 | `scripts/sim-season.mjs` 新增：按 profile × 模板 × 账号档输出"所需系数"，取**满足承诺口径的最大系数**写入 `data/season.json` 的 `scaleByMaturity`（先脚本后定表） |
| DoD 承诺（分 profile） | `twice` / `always`：**三档全部 ≤100% 预算**；`once`：**铜/银档 ≤100%**（金档不作承诺，如实登记为"需要更活跃的节奏"） |
| 反挂保护 | 缩放后 `targets` 必须**严格递增**且 ≥ 基础值 ×0.5（脚本断言 + 内容校验） |
| 满级门槛 | 改 `renownPerLevel`（4 → 3，满级 80 → 60 声望）；`levels: 20` 与等级奖励**不变**（奖励不减）；`sim-season.mjs` 里硬编码的 `levelReward` 改为读 `SEASON.levelReward` |
| 存档 | 缩放只依赖 `totalLevelOf` → **无需新增字段**，本版**不升 SAVE_VERSION**（评审员指出的冷启动漏洞随之消失） |
| 测试 | `tests/season.test.ts` S12 逐字段断言改为：**基础 targets 不被覆盖** + 新增 `targetsScaled`（或等价只读派生）字段由 sim 输出机器校验 |

### C 组修订稿

| # | 修订 |
|---|---|
| C1 | 徽标数据源 = **远征待领取 + 教程可领**；挂两处：`更多` 开关（窄屏，抽屉收起时可见）+ 抽屉内「远征」项（展开时可见，桌面也生效——评审员指出开关在桌面 `display:none`） |
| C2 | roving tabindex + ←/→/Home/End；如实定位为"窄屏外接键盘/读屏可用性"，不按"桌面 APG 缺口"记功 |
| C3 | `.clickable` 键盘化 + 窄屏触控高度补到 **40px**（与 v3.2 标准一致） |
| C4 | **降级为高价值回收二次确认**（实例完美度 ≥ 阈值或收益 ≥ N 金时 `confirm`）；"撤销"登记 v3.4，理由：`cmd()` 每命令 `saveNow()`、`totalGoldEarned` 单调计数器不随 `addGold(-x)` 回退、`Toasts` 无动作模型且 `pointer-events:none` —— 硬做会引入"进度入账两次"这类隐性错误 |

### 新增（评审员指出的遗漏）

- **A4**：补一份**真实 v13 存档 fixture**（`tests/fixtures/`）进迁移回归——现有 `migration.test.ts` 是合成样本，roadmap 要求"旧档逐版回归"。
- **B1-b**：`src/game/content.ts` 补 `scaleByMaturity` 与缩放后 targets 的校验（递增、下限、系数范围）。
- **登记**：效率符文在线口径（`design-v3.2.md` §2 明确记入 v3.3 的项）→ **本版不做**，改登记 **v3.4**，理由：它要重跑经济审计（`sim-audit` 经济段）且与 B2 同属"数值口径"批；本报告显式留痕，避免登记项无声蒸发。
- **体积**：实测 gzip 106.39KB / 预算 110KB（余量 3.61KB）；本版 A/C 组含组件测试（不进产物）+ 徽标（极小）+ 赛季表改动（零产物增量），预计余量足够；若超出则显式登记修订。

## 3. 修订后开发批次（按评审员建议顺序）

1. **批 1 · A 组地基**：devDeps + `vitest.config.ts`（vue 插件、默认 node）+ 3 条组件烟测验证 harness（直接挂 `RightPanel`/`NavBar`/`ItemDetailModal`，**不挂 App**——避免 `SceneCanvas`/audio/FxLayer 拖垮 jsdom）
2. **批 2 · A2 矩阵 + A4 fixture**：≥12 条"可达性"组件用例 + v13 真实档迁移回归
3. **批 3 · C 组**：C2 方向键 / C3 键盘化与触控高度 / C1 徽标 / C4 二次确认
4. **批 4 · B1（风险最高）**：先重写 `sim-season.mjs` 输出系数 → 再改 `season.json` + `content.ts` 校验 + `season.ts` 应用缩放 + 测试与 S12 更新
5. **批 5 · 收口**：门禁全跑 + 实机烟测（桌面 + 375/390，含徽标与方向键）+ `docs/smoke-v3.3.md` + 提交

## 4. 评审员验证边界（如实转录）

- 已验证：`npx vitest run`（24 文件 / 421 项 / 980ms 全绿）；`npm run build`（gzip 106.39KB）；读 `docs/sim-season-output.json` 逐条算占比；grep `node_modules/vitest@5.0.0`；`npm view @vue/test-utils`（2.5.0）/ `jsdom`（30.0.1）；`ls tests/fixtures`（不存在）；`.github`（不存在，故"CI"表述改为"门禁脚本"）。
- 未验证（只能推测）：`@vue/test-utils` 实际安装运行、jsdom 挂载是否被 canvas/audio 拖崩、改写后 sim 的实际数值、改动 `renownPerLevel` 后测试爆炸点。
