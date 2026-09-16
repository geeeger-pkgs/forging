# Forging v3.4 计划评审报告（独立评审员 · 对抗性）

> 阶段：③ 评审（计划）。对象：`docs/design-v3.4.md`（提交 `c6d5ef5`）。**结论：有条件通过 —— 10 项事实性错误 + 2 项遗漏，全部须在开工前落到计划里**（本报告即修订依据）。

## 1. Blocker / Major 与处置

| # | 评审发现（证据） | 处置 |
|---|---|---|
| 1 | A1 的"面板 == 结算"按原 §5 做不出来：在线 `E = aggregateEquipment(state).efficiency`（`settle.ts:108`）与面板 `pct(agg.efficiency)`（`RightPanel.vue:452`）都只含装备侧；并入 buff/perk 后二者必然不等 | ✅ 新增共享纯函数 `effectiveEfficiency(state, now)`，**结算与面板同源**（`stats.ts` 定义、`settle.ts`/`RightPanel.vue`/`describe` 路径共用），写入 §5 |
| 2 | A1 的裁判模型是错的：`sim-audit.mjs:91-101` 用 `procRate = 1/(2−E)`，只在保底 `need=2`（E≥0.5）时等于实现；E=0.2 时实际 0.297/轮、脚本 0.556。且"A 段/经济段"引用错位 | ✅ 改为**复用 settle 口径**（`E>0` 时 `procMisses>=ceil(1/E) || rng<E`）重算，证据段明确为 `sim-audit` **A 段**；并在计划里写明"在线 proc 是整轮重发（含稀有掉落与 XP），离线 eff 只乘产量/XP"——两者语义不同，sim 分开建模 |
| 3 | `data/levelCurve.json` **不由 `gen-content.mjs` 生成**（OUT 表 `gen-content.mjs:513-525` 无它，`gen:check` 只覆盖 10 张表） | ✅ 删除"改表 + gen:check 同源"的说法；改为"手写表 + `content.ts` 校验"（milestones 的递增/上限/条数校验进 `validateContent`） |
| 4 | A2 的"时长对照"产不出：`sim-curve.mjs` 只有累计 XP、无吞吐模型；时长在 `sim-audit` **F 段**（`:213-230`）；`sim-abyss.mjs:126` 还复制了一份聚合规则 | ✅ 时长对照落到 `sim-audit` F 段（读 `levelCurve.json`）；§5 补 `sim-abyss.mjs` 与 F 段 |
| 5 | A2 与"SAVE_VERSION 保持 13"自相矛盾：传承重置技能（`prestige.ts:75-79`），"传承后保留里程碑"必须有粘性字段（先例 `season.ts:42`） | ✅ **定稿：SAVE_VERSION 14**，新增 `meta.bestTotalLevel`（单调），里程碑由它派生 → 传承不掉级；迁移 + `tests/migration.test.ts` 补一版 + 真实档回归 |
| 6 | A6 证据做不出来：`sim-audit` D 段（`:192-197`）无快轮回/时间模型，且**全脚本不落 JSON**（`docs/` 无 sim-audit-output.json） | ✅ §5 明确：`sim-audit` D 段新增"快轮回 vs 满级轮回的**每小时点数**模型"并**新增落盘** `docs/sim-audit-output.json`（测试据此断言） |
| 7 | 26 条清账口径自相矛盾（§1 说"8 条清 6"，§4 的桶列了 9 项；组数对不上） | ✅ §4 改为**唯一 26 行总表**（条目/分组/处置/证据），§1/§2 与它一一对应 |
| 8 | D1 前提已不成立（路线图已在 `c6d5ef5` 补行） | ✅ D1 改为"收口后更新三行状态（v3.4 完成、v3.5 进行中）" |
| 9 | A3 漏文件：`data/season.json`、`gen-content.mjs`、受影响的 `tests/season.test.ts:184`（S12）与 `tests/v33-b1.test.ts` | ✅ §5 补三处 |
| 10 | C5 前半句与代码不符：`BurstKind` 已是闭合联合（`fx-map.ts:16,53`），未收窄的是 `cue?: string`；E3 确实不扫 burst（`audit-fx.mjs:41-60`） | ✅ C5 改述为"`cue` 类型收窄 + E3 覆盖 burst 扫描" |

## 2. 遗漏项（补入 §2 裁定表）

| 项 | 来源 | 处置 |
|---|---|---|
| "图鉴未收集条目图标/来源标签"未进裁定行 | `design-v3.3.md:58` | ✅ 补进 §2 的 UI 裁定行（收益/成本不划算，不做） |
| **"新技能线（采集/炼药）登记为 v3.x 首选内容扩张方向"** —— 全仓唯一明写"登记下一版"的遗留 | `design-v3.0.md:255` | ✅ 必须给终局结论：**正式裁定不做**（封板版不扩新技能线：需要新技能/配方/矿场/平衡一整套，属新版本级内容；v3.5 发布说明写明"后续版本的第一优先方向"作为**方向声明**而非挂账） |

## 3. 评审员验证边界
实跑 `npm run gen:check`（通过，仅 10 张表）+ `node -e` 只读复算（proc 保底公式、`recycleConfirm`=0.95/20000/3）+ `curl` HEAD 200 与 Chrome/Edge 可执行文件存在（C1 补跑前提成立）；只读 settle/stats/buffs/prestige/tasks/offline/sim-*/gen-content/audit-fx 与相关 docs；**未跑** vitest/build/sim-*（受约束）；"26 条穷尽"无法独立复核（E1~E8 标签仅存在于计划文本）。
