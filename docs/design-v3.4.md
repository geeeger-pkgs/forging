# Forging v3.4 设计文档 ·「清账」（修订版）

> 阶段：① 创意 → ② 计划 → ③ 评审（**初稿 10 项事实错误 + 2 项遗漏**，见 `docs/review-v3.4-plan.md`）→ **修订（本文档）** → ④ 开发 → ⑤ 测试（含实机烟测）→ ⑥ 资深玩家评审
> 上游：`docs/review-v3.3.md` §4、`docs/design-v3.3.md` §2、`docs/09-release-v3.0.md`、`docs/review-v3.0-*.md`
> 依赖：v3.3.0（存档 v13）→ **本版升存档 v14**（A2 需要粘性字段，评审 #5 已裁定）
> 原则：**先模拟后定档**；**证据链**（文档数字 = 脚本输出 = 内容表 = 测试断言 = 面板显示）

## 0. 动机与总目标

v3.4 是**清账版**：把 2026-09-16 全量盘点出的 **26 条未处置项**逐条给终局处置，为 **v3.5 封板**（用户判据：**未处置清单归零** —— 每条要么完成，要么正式裁定并写进发布说明）铺平道路。

## 1. 范围（与 §4 的 26 行总表一一对应）

### A. 本版完成（8 条）

| # | 事项 | 方案（已按评审修订） | 证据要求 |
|---|---|---|---|
| A1 | **丰饶符文/效率精通在线不生效** | ① 新增**共享纯函数** `effectiveEfficiency(state, now)`（`stats.ts` 定义）：`agg.efficiency + buff.efficiency + perk.efficiency`；② 在线触发率改用它（`settle.ts:108` 的 `E`）；③ **面板与详情同源**（`RightPanel.vue:452`、`describe` 路径改用它）；④ `sim-audit` **A 段**的 `procRate` 复用 settle 口径重算（现用 `1/(2−E)` 只在 E≥0.5 成立，**是错的**）；⑤ 文档写明：在线 proc = 整轮重发（含稀有掉落/XP），离线 eff 只乘产量/XP —— 语义不同，分开建模 | `docs/sim-audit-output.json`（本版新增落盘）含 A 段修正前后对照；测试断言"面板值 == 结算用值" |
| A2 | **Lv76~100 无内容** | 每 5 级一条**永久被动**（Lv80/85/90/95/100）并入 `aggregateEquipment` **单源**；**评审 #5 定稿：新增 `meta.bestTotalLevel`（单调）**，里程碑由它派生 → 传承不掉；`data/levelCurve.json` 是**手写表**（不由生成器管，评审 #3），故里程碑校验进 `validateContent` | `sim-audit` **F 段**（时长对照，读表）+ **堆叠段**重跑；`sim-abyss.mjs`（复制了聚合规则）同步复核；SAVE_VERSION 14 + 迁移 + 真实档回归 |
| A3 | **赛季新晋档下沿无证据** | `sim-season` 增补 **T2 stage** 覆盖 60~85 段；若系数需变，表随脚本输出更新（先脚本后定表） | `sim-season-output.json` 增加 `stageParams.t2` 与相应承诺行；`data/season.json`、`gen-content.mjs`、`tests/season.test.ts`(S12)、`tests/v33-b1.test.ts` 同步 |
| A6 | **传承快轮回无惩罚**（新发现） | `sim-audit` **D 段**新增"快轮回 vs 满级轮回的**每小时点数**模型"并落 JSON；若快轮回仍显著更优 → 点数改随总等级超线性（形式由脚本反推）；若影响有限 → 正式裁定不改（写入发布说明） | `docs/sim-audit-output.json` 的 `prestige` 段；测试断言"快轮回/小时 ≤ 满级轮回/小时"或裁定记录 |
| B4 | **任务付费重掷无确认**（新发现） | 免费次数用完后付费重掷加二次确认；**难度分池正式裁定不做**（随机是设计） | 组件用例：确认出现 / 取消不扣金 |
| B3 | **组件矩阵 5 缺口** | 配装**应用/删除**、材料**回收 10 / 全部回收**、**强化动作**、**深渊挑战**、**远征领取** 各 1 条"交互后 store 变化"断言 | 组件用例（挂载级） |
| C1 | **Lighthouse 从未跑** | 先尝试补跑（网络可用、Chrome/Edge 存在 —— 评审已证实）；跑不起来则**正式修订验收口径**（v2.0 四类 ≥95 基线 + 本版烟测实测替代 + 写明不可跑原因） | `docs/lighthouse-v3.5.*` 或 `docs/release-v3.5.md` 的口径修订段 |
| C5 | fx 类型与审计覆盖 | 暴露的 `cue?: string` 类型收窄为闭合联合；`audit-fx` **E3 覆盖 burst 扫描**（现只扫 cue） | `audit:fx:check` 通过 + 类型收窄 |

### B. 正式裁定不做（写进 `docs/release-v3.5.md` 已知取舍）

| 项 | 裁定理由 |
|---|---|
| 回收撤销（B1） | 每命令即时落盘 + `totalGoldEarned` 单调计数 + Toast 无动作模型，硬做会引入"进度入账两次"；已有二次确认 |
| 未读/可领状态（B2） | 任务/图鉴/赛季奖励均自动发放，无"待领取"态；徽标只对真有该语义的远征/教程 |
| 三段教程（B5） | 章节二 8 步已覆盖符文/重铸/远征/图鉴/深渊/赛季/总等级 40 |
| **新技能线（采集/炼药）** | `design-v3.0.md:255` 明确"登记 v3.x 首选扩张方向" —— 封板版不扩（需新技能/配方/矿场/平衡整套）；在发布说明中作为**方向声明**保留，不作为挂账 |
| 图鉴未收集图标/来源标签、行囊折叠、拖拽排序、图鉴检索、底栏 sheet | 收益/成本不划算或等真机反馈 |
| 赛季"新晋/老手"标签简化（A5）、回收阈值再校准（A4） | 如实标注优于隐藏；阈值刚由 v3.3 评审校准，无新证据不动 |
| automation craft-only（C3）、实例回收 60%（C4） | 设计如此，注释/设置页已说明作用域 |
| iOS 真机/软键盘（E1/E2）、Enter 自动化路径（E3）、后台静音（E4）、时间前拨上限（E5）、离线上限（E6）、性能口径降级（E7）、词缀盐（E8） | 既有客观边界与已登记取舍，逐条汇总进发布说明 |

## 2. 封板（v3.5）判据 —— 用户要求：**必须清光**

v3.4 结束时未处置清单归零（完成 / 正式裁定二选一）。v3.5 只做四件事：**终验七维复核**（架构/内容/可玩性/交互与效果/数值/稳定性/质量）→ **全量回归**（测试/typecheck/build/三审计/实机烟测/存档 1→14 全链）→ **发布文档**（版本 3.5.0 + 已知取舍全集 + 内容迁移规则 + 性能口径 + Lighthouse 结论）→ **最终评审**（Blocker 清零即封板）。

## 3. 26 行总表（条目 / 分组 / 处置 / 证据落点）

| # | 条目 | 分组 | 处置 | 证据落点 |
|---|---|---|---|---|
| 1 | A1 效率符文在线口径 | 体验 | v3.4 做 | sim-audit-output.json + 同源测试 |
| 2 | A2 Lv76~100 里程碑 | 体验 | v3.4 做 | sim-audit F/堆叠段 + 迁移回归 |
| 3 | A3 赛季 T2 证据 | 工程 | v3.4 做 | sim-season-output.json.maturity |
| 4 | A4 回收阈值校准 | 记账 | 裁定不动 | release-v3.5 |
| 5 | A5 赛季标签简化 | 记账 | 裁定保留 | release-v3.5 |
| 6 | A6 传承快轮回 | 体验 | v3.4 做或裁定 | sim-audit-output.json.prestige |
| 7 | B1 撤销 | 体验 | 裁定不做 | release-v3.5 |
| 8 | B2 未读状态 | 体验 | 裁定不做 | release-v3.5 |
| 9 | B3 组件矩阵 5 缺口 | 工程 | v3.4 做 | tests/components/* |
| 10 | B4 重掷确认 | 体验 | v3.4 做（分池裁定不做） | 组件用例 |
| 11 | B5 三段教程 | 记账 | 裁定不做 | release-v3.5 |
| 12 | C1 Lighthouse | 工程 | v3.4 做或修订口径 | lighthouse-v3.5.* 或 release-v3.5 |
| 13 | C2 内容迁移规则 | 工程 | v3.4 写入规则 + 本版若动内容表即执行 | release-v3.5 + 迁移测试 |
| 14 | C3 automation craft-only | 记账 | 裁定不做 | release-v3.5 |
| 15 | C4 实例回收 60% | 记账 | 裁定不做 | release-v3.5 |
| 16 | C5 cue 类型 / E3 burst | 记账 | v3.4 顺手做 | audit-fx.mjs + fx-map.ts |
| 17 | D1 路线图行状态 | 记账 | v3.4 收口后更新 | 08-roadmap-v3.md |
| 18 | D2 DoD 勾选（v3.0/v3.3） | 记账 | v3.4 订正（v3.3 已勾） | design-v3.0/3.3.md |
| 19 | E1 iOS 真机 | 体验 | 裁定声明 | release-v3.5 |
| 20 | E2 软键盘×底栏 | 体验 | 裁定声明 | release-v3.5 |
| 21 | E3 Enter 自动化路径 | 记账 | 裁定保留 | release-v3.5 |
| 22 | E4 后台静音 | 记账 | 裁定保留 | release-v3.5 |
| 23 | E5 时间前拨上限 | 记账 | 裁定保留 | release-v3.5 |
| 24 | E6 离线回体放宽 | 记账 | 裁定保留 | release-v3.5 |
| 25 | E7 性能口径降级 | 记账 | 裁定保留 | release-v3.5 |
| 26 | E8 词缀盐残余风险 | 记账 | 裁定保留 | release-v3.5 |
| + | 新技能线（采集/炼药） | 扩张 | 裁定不做（方向声明） | release-v3.5 |
| + | 图鉴未收集图标/来源标签 | 体验 | 裁定不做 | release-v3.5 |

## 4. 实现清单（文件级，评审 #1/#4/#9 已补全）

| # | 文件 | 改动 |
|---|---|---|
| 1 | `src/game/stats.ts` | `effectiveEfficiency(state, now)`；A2 里程碑被动并入 `aggregateEquipment` |
| 2 | `src/game/settle.ts` | A1：在线 `E` 用 `effectiveEfficiency` |
| 3 | `src/ui/components/RightPanel.vue` | A1：面板/详情同源显示 |
| 4 | `src/game/prestige.ts` | A6：点数公式（依据 D 段证据；不改则记录裁定） |
| 5 | `src/app/persist.ts` | **SAVE_VERSION 14** + 迁移（`meta.bestTotalLevel`，取当前总等级回填） |
| 6 | `src/game/types.ts` / `content.ts` | `meta.bestTotalLevel`；`levelCurve` 校验（milestones 递增/上限/条数）、`cue` 类型闭合 |
| 7 | `data/levelCurve.json` | 里程碑表（手写；校验在 content.ts，**不由生成器管**） |
| 8 | `scripts/sim-audit.mjs` | A 段 procRate 口径修正；D 段快轮回模型；F 段里程碑时长对照；**新增落盘 `docs/sim-audit-output.json`** |
| 9 | `scripts/sim-abyss.mjs` | 聚合规则复制处同步复核（堆叠结论） |
| 10 | `scripts/sim-season.mjs` + `data/season.json` + `scripts/gen-content.mjs` | A3：T2 stage 与系数复核（表随脚本输出） |
| 11 | `src/ui/components/TasksPanel.vue` | B4：付费重掷确认 |
| 12 | `tests/components/*` | B3：五缺口 |
| 13 | `scripts/audit-fx.mjs` | C5：E3 覆盖 burst |
| 14 | `tests/migration.test.ts` / `tests/season.test.ts`(S12) / `tests/v33-b1.test.ts` | 迁移 v14、S12 与 B1 断言同步 |
| 15 | `docs/08-roadmap-v3.md` / `docs/release-v3.5.md`（草） | D1/D2 + 裁定全集 |

## 5. 风险与对策

| 风险 | 对策 |
|---|---|
| A2 里程碑扰动深渊/经济 | 单源 `aggregateEquipment` + `sim-audit` 堆叠段 + `sim-abyss` 复核；对 v3.0 堆叠结论的修订显式登记 |
| A1 改动引入套利 | A 段重算 + 符文仍随离线清空；面板与结算同源避免"看得见吃不到" |
| A6 动传承（核心长线） | 先出 D 段证据；只消除反直觉最优解，不整体加强/削弱 |
| 升存档 v14 | 迁移取"当前总等级"回填（不回退）；真实 v13 档 + 合成样本双回归 |
| Lighthouse 跑不起来 | 正式口径修订（含原因与替代证据），不留"待补" |
