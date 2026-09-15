# Forging 技术设计文档 v0.1（R2）

> 版本 v0.1 ｜ 2026-09-15 ｜ 状态：R2 定稿（用户确认：Vue 3）｜ 起草：P10
> 上游：《战略输入 v0.1》（docs/00）、《游戏设计文档 v0.2》（docs/01）
> 默认决策（可改）：① 界面仅简体中文 ② v1 无动画场景层（Canvas 作为 v1.1+ 可选增强）

## 1. 选型（已定）

| 层 | 选择 | 理由 |
|---|---|---|
| 构建 | Vite（最新稳定） | 秒级热更、TS/JSON 开箱、产物小 |
| 语言 | TypeScript（strict） | 8 张内容表 + 内核函数，类型即契约 |
| UI | **Vue 3**（SFC + `<script setup>`） | 属性级依赖追踪：更新成本随「变化的值」走而非组件树，直击高频散点更新（计数器/进度条）场景；生态与训练语料成熟，构建代理友好 |
| 状态 | Vue `reactive` + 命令桥（**零额外依赖**，不用 Pinia） | 游戏逻辑全部驻留纯函数内核；store 仅为「快照 + dispatch」薄桥，避免逻辑渗入状态库 |
| 样式 | CSS 变量（暗色主题 tokens）+ scoped CSS | 不引 UI 组件库，视觉可整体替换 |
| 测试 | Vitest（内核单测为主） | 与 Vite 同链；内核纯函数 + 种子 RNG 可精确断言 |

**依赖白名单**：`vue`、`vite`、`@vitejs/plugin-vue`、`typescript`、`vue-tsc`、`vitest`。新增依赖需评审。

## 2. 目录与文件域（P9-A / P9-B 分工）

```
forging/
├─ data/                     # 8 张内容表（JSON）：skills/ores/items/recipes/levelCurve/enhance/tutorial/config
├─ src/
│  ├─ game/                  # 【P9-A】纯内核：无 DOM、无 Vue、可单测
│  │  ├─ types.ts            # GameState / Command / GameEvent / 内容表类型（接口冻结）
│  │  ├─ content.ts          # 载入 data/*.json + 启动校验（引用完整性/数值合法性）
│  │  ├─ settle.ts           # 在线结算核心（惰性推进）
│  │  ├─ offline.ts          # 离线结算（期望模式，复用 settle）
│  │  ├─ commands.ts         # start/stop/enqueue/equip/unequip/enhance/recycle/buyQueueSlot/claimTutorial
│  │  ├─ enhance.ts          # 强化判定（含 RNG 注入）
│  │  ├─ economy.ts          # 回收 / 购买
│  │  ├─ tutorial.ts         # 教程进度推进
│  │  └─ rng.ts              # 可注入种子 RNG
│  ├─ app/                   # 【P9-B】壳：运行时与持久化
│  │  ├─ store.ts            # reactive 快照 + dispatch 命令桥 + events 分发
│  │  ├─ persist.ts          # 存档读写 / 迁移链 / 导出导入 / 备份槽
│  │  └─ bootstrap.ts        # 启动序列：载档 → 离线结算 → 首帧 → 摘要弹窗
│  ├─ ui/                    # 【P9-B】Vue 组件
│  │  ├─ layout/  panels/  dialogs/  common/
│  │  └─ styles/theme.css    # 主题 tokens（暗色）
│  └─ main.ts
└─ tests/                    # 内核测试 + 数据校验 + 黄金用例
```

**接口冻结**：`src/game/types.ts` 于 M1 开工冻结；M1 出口后变更须评审（并行开发前提）。

## 3. 内核契约（types.ts 要点）

- `GameState`：可序列化、带 `version`；含 character / skills / inventory / equipment / actions{current,queue} / gold / flags / meta(含小数结转) / stats
- `Command`：UI 唯一入口（枚举）
- `GameEvent`：回流事件（actionCompleted / levelUp / itemObtained / enhanceResult / tutorialAdvanced …）供 toast / 离线摘要 / 音效聚合
- 内容表类型：8 张 JSON 的 TS 类型定义

## 4. 结算模型（惰性推进，Idle 标准模式）

1. `settle(state, nowMs)`：以「动作完成时刻」为节点循环推进；**不逐帧模拟**
2. **执行管道**（固定顺序）：完成判定 → 效率 proc 判定 → 产出/掉落 → XP → 升级检查 → 教程进度 → 队列启动下一项
3. **双模式**：`online`（真实随机）/ `offline`（期望 + 小数结转）共享同一核心（`expectationMode` 开关）
4. **精度**：时间整数毫秒、XP 整数；掉落期望长期对齐、单次发放为整数
5. RNG 可注入种子（测试确定性）

## 5. Vue 层设计

**① store 模式**（`src/app/store.ts`）：

```ts
state: reactive(LoadedState)   // 内核状态的可渲染快照
dispatch(cmd: Command): void   // → 内核纯函数 → 写回快照 + 产出 events[]
// events → toast / 离线摘要 / 音效（预留）
```

约定：组件**禁止**直接修改 state，一律经 dispatch（评审门禁项）。

**② 热路径组件**：
- `LiveNumber.vue`：自订阅单一数值；变化只触碰自身文本节点
- `ProgressBar.vue`：rAF 节流、只读时间戳渲染（不触发状态更新）

**③ 组件清单**（映射设计文档 §12 信息架构）：
- layout：TopBar / NavBar / MainPanel
- panels：ActionGrid / InventoryPanel / EquipmentPanel / SkillPanel / ShopPanel / StatsPanel
- dialogs：ActionDialog / OfflineSummary / SettingsDialog / TutorialOverlay
- common：LiveNumber / ProgressBar / ItemCard / Tooltip

## 6. 存档系统

- 双槽：`forging.save`（主）+ `forging.save.bak`（上一自动保存点）
- 自动保存：每 5s + 关键事件（升级/强化/购买/教程完成）
- 迁移链：`migrations: {1→2, 2→3 …}` 逐级升级；载入失败回退备份槽并提示
- 导出/导入：`forging-save-YYYYMMDD.json` 下载 / 上传校验后覆盖

## 7. 离线结算

- `settleOffline(state, elapsedMs)`：cap 8h → 复用结算内核（期望模式）→ `OfflineSummary` 供弹窗
- 边界：时钟回拨（delta ≤ 0 忽略）、材料不足停止并记录、强化不参与
- **黄金用例**：设计文档 §10 的 600s 示例逐行断言（M1 必过）

## 8. 性能策略（用户关切专项）

1. **更新粒度 = 变化的值**（Vue 属性级追踪；散点更新天然 O(1)）
2. 热路径 rAF 节流；diff 后直写 DOM 属性/文本
3. 长列表虚拟化**预留**（单面板 >200 节点时启用）
4. **Canvas 场景层预留**（与 UI 解耦，v1.1+ 动画不拖累面板）
5. 内核纯函数 → 必要时整体移入 **Web Worker**（结算与渲染彻底分离）
6. 面板按需挂载（v-if / KeepAlive 策略，非活跃页签不渲染）

## 9. 测试与验收映射（S1~S7）

| 成功标准 | 验证手段 |
|---|---|
| S1 核心循环 30 分钟 | 手动验收清单（教程 1→8 步） |
| S2 离线收益 | 单测：600s 黄金用例 + 8h cap + 材料不足边界 |
| S3 存档可靠 | 单测：导出→导入往返一致；迁移链；损坏回退 |
| S4 内容量 | 数据校验测试（45 件/5 档/8 槽/10 强化档） |
| S5 数据驱动 | 启动校验 + 校验脚本（引用完整性/单调性） |
| S6 质量 | vitest 全绿（锚点 1193/13151/118091/583137、时间公式、强化期望 44±ε、vue-tsc 无错） |
| S7 体验细节 | 手动清单：队列 1→4、1/∞ 循环、离线摘要弹窗 |

## 10. 风险与对策

| 风险 | 对策 |
|---|---|
| 时钟篡改 | 单机接受；仅做负增量保护 |
| 浮点累积误差 | 时间整数 ms、XP 整数、概率期望累计 |
| 存档损坏/版本跳跃 | 双槽备份 + 迁移链 + 导入校验 |
| 依赖膨胀 | 白名单制，新增需评审 |
| 内核与 UI 耦合 | 文件域隔离；内核零 DOM 依赖；vue-tsc + vitest 把关 |
| Agent 生成 Vue 代码风格漂移 | 模板/约定写入文档；评审门禁（禁止直改 state） |

## 11. 里程碑与出口标准（对接 R3）

| 里程碑 | 内容 | 出口标准 |
|---|---|---|
| **M1 内核** | 内容表（8 张）+ game 内核 + 单测 + 结算 demo | 单测全绿；曲线/离线黄金用例通过 |
| **M2 骨架可玩** | UI 壳 + 存档 + 挖→炼→锻链路 | 手动走通「首件铜镐」；刷新不丢档 |
| **M3 完整内容** | 5 档全量 + 8 槽装备 + 强化 + 离线 + 商店/队列 | S2/S4/S7 验收项通过 |
| **M4 打磨验收** | 教程链 + 统计 + 导出导入 + 离线摘要 + 验收 | S1/S3/S5/S6 全过；出验收报告 |

节奏：P9-A（内核线）与 P9-B（壳线）在 **M1 接口冻结后并行**；每里程碑设演示检查点与独立验证。
