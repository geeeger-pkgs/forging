# Forging v2.5 设计文档 ·「视听与手感」（修订版）

> 阶段：① 创意 → ② 计划 → ③ 评审（**初稿被打回**：Blocker 3 / Major 7 / Minor 14，见 `docs/review-v2.5-plan.md`）→ **修订（本文档）** → ④ 开发 → ⑤ 测试（含实机烟测）→ ⑥ 测评
> 上游：docs/08-roadmap-v3.md（v2.5 = 表现层：交互与效果优化）
> 依赖：v2.4 已发布（深渊/存档 v11）；本版存档 **v12**（仅新增设置字段）
> 本版是**表现层**版本：证据由"数值模拟"改为**可执行的表现层证据**（§3），且明确区分「静态可断言」与「运行时需实测」两类。

## 1. 动机（创意）

v2.1~v2.4 把系统做厚了，但**反馈仍只有文字**：强化成功/失败、通关、开箱、升级在"感觉"上是同一件事。本版补齐三件事：**听得见的反馈**（程序化音效）、**看得见的重量**（粒子/飘字/光环）、**可关可调不打扰**（三档动效 + 音量 + 遵守系统偏好），且**零外部资源**（保持"运行时仅依赖 Vue"的承诺）。

一句话：**前面几个版本回答"能做什么"，本版回答"做起来手感如何"。**

## 2. 系统设计（计划）

### 2.1 程序化音效引擎（`src/ui/audio.ts`，零资源）

- 技术：WebAudio **振荡器 + 增益包络 + 白噪声缓冲**，无任何音频文件（体积零增长）。
- **硬规则**：
  1. `AudioContext` **不在模块加载时创建**；首次真实用户手势（`pointerdown`/`keydown`）后创建并 `resume()`；此前 `playCue` **静默返回 false**（不报错、不排队）。
  2. 同时发声 ≤ `maxConcurrentVoices`(8)：超限**丢弃新请求**（防爆音与 CPU 尖峰）。
  3. `sound=false` 或 `volume=0` → **完全不创建节点**。
  4. `resume()` 被策略拒绝 → 保持未就绪、下次手势重试，不抛错。
- **音效清单（16 条，每条都有明确事件来源）**：

| # | cue | 名称 | 音色 | 事件来源 |
|---|---|---|---|---|
| 1 | `actionStart` | 开始动作 | triangle 220Hz 60ms | `actionStarted`、`expeditionDispatched`、`loadoutApplied` |
| 2 | `actionComplete` | 动作完成 | triangle 330Hz 80ms | `actionCompleted`、`abyssSwept` |
| 3 | `levelUp` | 技能升级 | sine 440/554/659 320ms | `levelUp`、`companionLevelUp` |
| 4 | `prestige` | 传承 | sine 392/523/659/784 700ms | `prestigeDone` |
| 5 | `seasonLevel` | 赛季升级 | sine 523/659 260ms | `seasonLevelUp` |
| 6 | `enhanceSuccess` | 强化成功 | square 660/990 180ms | `enhanceResult(success)`、`reforged` |
| 7 | `enhanceFail` | 强化失败 | noise 200Hz 160ms | `enhanceResult(fail)` |
| 8 | `enhanceGuarded` | 庇护生效 | triangle 392Hz 140ms | `enhanceResult(guarded)` |
| 9 | `crateOpen` | 开箱 | noise 420→660Hz 220ms | `crateOpened`（非大奖） |
| 10 | `lootBig` | 大奖 | sine 660/990/1320 600ms | `crateOpened`（文本含「大奖」）、`buffActivated` |
| 11 | `rareDrop` | 稀有掉落 | sine 880/1320 400ms | `itemsGained`（含稀有物品，见 §2.2 判定） |
| 12 | `taskComplete` | 任务完成 | triangle 523/659 240ms | `taskCompleted`、`tutorialGoalMet`、`expeditionDone` |
| 13 | `achievement` | 成就达成 | sine 659/784/988 420ms | `achievementUnlocked`、`codexMilestone`、`bannerUpgraded` |
| 14 | `abyssClear` | 深渊通关 | sine 196/247/294 520ms | `abyssCleared` |
| 15 | `purchase` | 购买/支出 | triangle 494/587 180ms | `abyssItemBought`、`expeditionClaimed`、`traitRerolled`、`perkChanged`、`goldGained(<0)` |
| 16 | `blocked` | 操作被阻塞 | square 220→165Hz 160ms | `blocked` |

> 初稿的 `queueAdvance`（无事件来源）**已删除**；`rareDrop` / `lootBig` 补上了真实来源。

### 2.2 事件 → 表现映射（`src/ui/fx-map.ts`，**纯模块**）

**关键修正（评审 B1/B2）**：映射逻辑放在**纯模块**里（不依赖 DOM / 不依赖 store），因此 **node 测试可直接导入并穷举**；`store.handleEvents` 只做薄适配（结果交给 `playCue` / 场景层 / 飘字层）。

```ts
export interface FxPlan {
  cue?: string
  burst?: 'spark' | 'gold' | 'gray' | 'blue' | 'abyss'
  ring?: boolean
  popup?: { text: string; kind: 'item' | 'xp' | 'gold' }
}
export function resolveFx(ev: GameEvent, ctx: { itemName: (id: string) => string; isRare: (id: string) => boolean }): FxPlan | null
```

**分支规则（初稿遗漏，评审 B2 点出）**：
- `enhanceResult`：`guarded → enhanceGuarded`（+blue burst）；`success → enhanceSuccess`（+gold burst）；否则 `enhanceFail`（+gray burst）。
- `goldGained`：`amount < 0 → purchase`；`amount > 0 → popup(+N 金)`。
- `crateOpened`：文本含「大奖」→ `lootBig`，否则 `crateOpen`。
- `itemsGained`：含稀有物品 → `rareDrop`；始终产生 popup（`+N 名称`）。

**覆盖要求**：`GameEvent` 的**全部成员**都必须在表中有条目（无表现的显式返回 `null`），由测试穷举守护（§4 F1）。

> **同时修一处类型债（评审发现）**：`challengeAbyss` / `sweepAbyss` / `buyAbyssItem` 是 **Command**，却同时出现在 `GameEvent` 联合里（v2.4 补丁误入）→ 本版从 `GameEvent` 中**移除**这三个成员。修正后事件数 **37 → 34**；v2.5 自身新增 `settingsChanged`（设置变更需回执给壳层同步音频引擎）→ 最终 **35 个事件**，全部有发射点（脚本/测试双证，F1/F11 断言）。

### 2.3 场景动效（`SceneCanvas` 扩展 + 飘字层）

- **粒子**：沿用既有 `burst(x,y,kind,count)`；`MAX_P` 改为读 `CONTENT.fx.budget.maxParticles`（**单一来源**，修评审 M5 的双真值）；新增 kind：`gold`/`gray`/`blue`/`abyss`。
- **交互预算**：单次爆发 ≤ `maxBurstParticles`(60)、爆发频率 ≤ `maxBurstsPerSecond`(4)；超出丢弃。
- **飘字**：同屏 ≤ `maxPopups`(6)，`+N 名称` / `+XP` / `+N 金`，向上飘散淡出。
- **光环**：技能升级/成就/深渊通关时扩散环。
- **降级**：`fx = reduced` → 关闭常驻粉尘与交互爆发，仅保留飘字与光环；`fx = off` → 表现层完全不绘制（rAF 仍驱动场景本体）。
- **性能埋点**：表现层内部用 `performance.now()` 采样 `drawMs`（绘制耗时）与 `tickMs`（主循环表现层开销），**仅在 `document.visibilityState === 'visible'` 时采样**（后台 rAF 暂停，采样无意义），滚动窗口 P95 暴露给探针。

### 2.4 手感与信息层级

- 按钮 `:active` 位移 + 亮度；禁用态维持 v2.0 的对比度标准。
- 面板切换 120ms 淡入；`[data-fx='off']` 与 `prefers-reduced-motion` 下取消。
- 动作卡：剩余时间数字与进度条并列。
- Toast：类型图标 + 滑入 + 同类 2 秒合并计数（防刷屏）。

### 2.5 设置与无障碍（评审修正：`auto` 档）

- `meta.settings = { sound: boolean; volume: number(0~100); fx: 'auto' | 'full' | 'reduced' | 'off' }`
- **解析规则**（壳层 `resolveFxLevel()`）：`auto` + `prefers-reduced-motion: reduce` → `reduced`；`auto` 否则 → `full`；用户显式档位优先。
- 根节点绑定 `data-fx="<解析后的档位>"`；CSS 用 `[data-fx='off']` / `[data-fx='reduced']` 关闭过渡与动画 → **用户档位能真正关掉 CSS 动效**（初稿零落点，评审 Major）。
- **信息不丢失的准确表述（评审修正）**：飘字是**冗余表达**（同名信息在右侧栏资源/行囊、经验条、金币栏本就可读）；需要"不丢"的**关键事件**（升级/成就/任务/开箱/强化/深渊/阻塞）**均有 toast**，与动效档位无关（F9 按此断言）。
- 移动端：iOS 静音档下 WebAudio 无声属平台行为，文档如实说明（不伪造绕过）。
- 音量滑杆与开关均键盘可达；提供「试听」按钮（点击即手势，顺带解锁音频）。

### 2.6 集成点（完整清单）

| # | 位置 | 改动 |
|---|---|---|
| 1 | `data/fx.json`（新，生成器产出） | 16 条 cue + 7 项预算 + 设置默认值（`fx: 'auto'`） |
| 2 | `src/ui/audio.ts`（新） | WebAudio 引擎（`unlockAudio`/`installGestureUnlock`/`playCue`/`setAudioEnabled`/`setAudioVolume`/`audioStatus`/`__resetAudioForTest`） |
| 3 | `src/ui/fx-map.ts`（新，纯模块） | `resolveFx(ev, ctx)`：事件 → {cue, burst, ring, popup}，覆盖全部 35 个事件 |
| 4 | `src/ui/fx-probe.ts`（新） | 采样与探针：`recordDraw/recordTick/p95/installFxProbe`（DEV 挂 `window.__fx`） |
| 5 | `src/ui/components/SceneCanvas.vue` | 新 burst kind、爆发频率限制、飘字层、光环、降级、`recordDraw` 埋点、`MAX_P` 读内容表 |
| 6 | `src/app/store.ts` | `handleEvents` 接 `resolveFx` → 音效/场景/飘字；`recordTick` 埋点；首手势 `installGestureUnlock` |
| 7 | `src/app/scene-bus.ts`（新，极小） | 表现指令总线（store → SceneCanvas，避免 store 依赖组件） |
| 8 | `src/ui/components/SettingsPanel.vue` | 音效开关 / 音量滑杆 / 动效四档 + 试听 |
| 9 | `src/App.vue` | 根节点 `data-fx` 绑定 + 解析 |
| 10 | `src/ui/styles/theme.css` | `[data-fx]` 与 `@media (prefers-reduced-motion)` 降级；`:active` 反馈 |
| 11 | `src/ui/components/Toasts.vue` / `ActionGrid.vue` | 图标+滑入+合并计数 / 时间数字 |
| 12 | `src/game/types.ts` | `FxDef`/`SettingsState`/`meta.settings`；**移除 GameEvent 里 3 个 Command 成员** |
| 13 | `src/app/persist.ts` / `src/game/state.ts` | `SAVE_VERSION 11→12` + 迁移 + `ensureFields` + `newGame` |
| 14 | `src/game/content.ts` | 载入/校验 `fx.json` |
| 15 | `scripts/audit-fx.mjs`（新） | **静态**证据（§3.1） |
| 16 | `tests/fx.test.ts`（新） | §4 全部用例 |

### 2.7 存档

- `SAVE_VERSION` 11 → **12**：补 `meta.settings = { sound: true, volume: 60, fx: 'auto' }`；`ensureFields` 幂等补齐；非法档位回落 `auto`。

## 3. 证据（静态可断言 / 运行时需实测，**两类分开**）

### 3.1 静态断言（`scripts/audit-fx.mjs` + 测试，可复跑）

| # | 证据 | 判定标准 | 由谁断言 |
|---|---|---|---|
| E1 | cue 清单结构 | ≥16 条；wave/freqs/durationMs/gain 合法；id 唯一 | audit + 测试 |
| E2 | 事件→表现覆盖 | 在每个 `GameEvent['type']` 上调用 `resolveFx` 不抛错 | **测试穷举**（脚本读不到 TS） |
| E3 | cue 名一致性 | 实现中出现的 cue 字面量 ⊆ `data/fx.json` 的 id 集合 | audit（正则扫描 `src/ui/*.ts`） |
| E4 | 预算常量 | 7 项均为正且量级合理（粒子 ≤300、并发 ≤16、帧预算 ≤5ms） | audit + 测试 |
| E5 | 零资源 | `public/` 与 `dist/` 无新增音频/图片扩展名（白名单：既有 sw/manifest/icon/robots/llms） | audit |
| E6 | 设置默认值 | 默认档 ∈ fxLevels；volume ∈ [0,100]；`fx='auto'` | audit + 测试 |

### 3.2 运行时实测（实机烟测，**仅页面可见时采样**）

| # | 测什么 | 方法 | 目标 | v2.5 实测 |
|---|---|---|---|---|
| R1 | 自动播放门槛 | 加载后 `__fx.audio().ready === false` → 点击后 `=== true` | 严格 | ✅ false/`ctxState=null` → true/`running` |
| R2 | 表现层帧内耗时 | 可见状态 `draw` 的 p50/p95/max | ≤ `frameBudgetMs`(1.5ms) | ✅ 0.10 / 0.20 / 0.30ms（180 样本） |
| R3 | 主循环表现开销 | 同上，`tick` | ≤ `loopBudgetMs`(0.5ms) | ✅ 0.20 / 0.30 / 0.30ms |
| R4 | 动效开关生效 | `fx=off` → 峰值粒子 0 且飘字 0；`reduced` → 粒子 0、飘字可 >0 | 严格 | ✅ off：0/0；reduced：0/**3** |
| R5 | 设置持久化 | 改设置 → 重载 → 值保持且 `data-fx` 正确、**引擎同步** | 严格 | ✅ 三处一致 + `audio.enabled=false` 生效 |

> **不采用 rAF 帧间隔采样**（评审 B3）：放置游戏常驻后台会被节流，帧间隔无意义；改为测量**表现层自身代码耗时**，且只在可见时采样。
>
> **统计口径（烟测修正）**：样本少时 P95 会退化为"最大值"，因此探针同时输出 **p50/p95/max/samples**；
> 判定用 p95，但同时记录 p50 与样本数，避免用单点偶然值下结论。
>
> **读数落点（烟测修正）**：`window.__fx` 暴露 `snapshot()` / `audio()`（**函数**，可前后两次读取）与 `reset()`；
> `particles/popups` 由 `SceneCanvas` 每帧上报真实值，另记 **峰峰值**（瞬时值可能刚好为 0）。
> 存活读数曾长期为 0（只被 store 以 `(0,0)` 写入）—— 这类"读数落点存在但没人写"的问题由本轮烟测抓出，见 `docs/smoke-v2.5.md` §2（D1~D7）。

## 4. 测试计划（`tests/fx.test.ts`）

| # | 用例 |
|---|---|
| F1 | `resolveFx` **穷举**：35 个事件各造样本 → 不抛错；无表现的显式返回 null |
| F2 | 分支规则：`enhanceResult` 三分支 → 不同 cue+burst；`goldGained` 正负 → popup / purchase；`crateOpened` 大奖 → lootBig |
| F3 | 稀有判定：`itemsGained` 含 essence/crate/emberstone/token/relic → rareDrop |
| F4 | 并发上限：假 AudioContext 连发 20 次 → `active ≤ 8`；超限返回 false |
| F5 | 自动播放：未初始化 `playCue === false`；注入假 ctx(running) 后 `=== true` |
| F6 | 音量/开关：`volume=0` 或 `sound=false` → 不创建节点、返回 false |
| F7 | 设置解析：`auto` + reduced-motion → `reduced`；非法档 ↗ `auto`；四档映射 `data-fx` |
| F8 | 迁移 11→12 补默认设置；往返幂等；`ensureFields` 对缺字段档生效 |
| F9 | 关键事件必有 toast 出口（升级/成就/任务/开箱/强化/深渊/阻塞）——断言事件→toast 映射表，不依赖 DOM |
| F10 | 预算常量与 `audit-fx.mjs` 输出一致（文档数字 = 脚本输出） |
| F11 | GameEvent 联合不含 Command 成员（防再误入） |

## 5. 风险与对策

| 风险 | 对策 / 现状 |
|---|---|
| 自动播放被拦截 | 首次手势后才创建；未手势静默丢弃（F5 + R1） |
| 音效 CPU 尖峰/爆音 | 并发 ≤8、超限丢弃、短包络（F4） |
| 粒子拖慢主循环 | 爆发频率上限 + 三档降级 + 埋点实测（R2/R3） |
| 无障碍/前庭敏感 | `auto` 跟随系统偏好 + 一等开关 + `data-fx` 真关 CSS 动效（F7/R4） |
| iOS 静音档无声 | 平台行为，如实说明 |
| 零资源承诺 | audit E5 白名单基线化 |
| 新事件忘接表现 | `resolveFx` 穷举 + F1 |
| 类型债复发 | F11 断言 GameEvent 不含 Command 成员 |

## 6. 验收标准（Definition of Done）

- [x] 16 条程序化音效；零外部资源（E5 白名单断言；audit E1~E6 全过）
- [x] `resolveFx` 覆盖全部 35 个事件（F1）+ 分支规则（F2/F3）
- [x] 三类动效 + 四档设置（auto 解析）+ `data-fx` 真关 CSS 动效（F7；R4 实测 off 与 reduced 均生效）
- [x] 设置三项持久化（存档 v12）+ 迁移无损（F8）+ **引擎启动同步**（烟测 D5 修复）
- [x] 烟测 R1~R5 全过（p50/p95/max 报告 + 2 张截图，`docs/smoke-v2.5.md`；含 D1~D7 缺陷处置）
- [x] 测试全绿（**298**）/ typecheck / build（gzip JS 93.2KB ← v2.4 84.5KB，+8.7KB 为音效引擎与表现层）

## 7. 范围外（记入 backlog）

- 背景音乐（BGM）→ v3.0 视时间决定
- 音效主题包 → 零资源前提下不做
- 触觉反馈（Vibration API）→ 兼容性差，不做

## 8. 评审处置记录（③ 评审 → 修订）

评审报告：`docs/review-v2.5-plan.md`（**打回**：Blocker 3 / Major 7 / Minor 14）。

| 编号 | 结论 | 处置 |
|---|---|---|
| **B1** 烟测读数落点不存在（`window.__forging` 无音频状态；粒子计数组件私有；`handleEvents` 未导出且 `store.ts` 在 node 下导入即抛错） | 成立 | ①映射逻辑抽到**纯模块** `fx-map.ts`（node 可直接测）；②新增 `fx-probe.ts` 与 `window.__fx` 探针（DEV）；③新增 `scene-bus.ts` 让 store 不依赖组件；④读数落点写进 §3.2 |
| **B2** "单一映射表"在文档里不存在；cue 实为 17 条；3 条 cue 无来源；分支无法表达 | 成立 | ①§2.1 给出 **16 条 cue 与事件来源表**（删 `queueAdvance`，补 `rareDrop`/`lootBig` 来源）；②§2.2 给出 **resolveFx 分支规则**；③修类型债：3 个 Command 误入 GameEvent → 移除（37→34） |
| **B3** 性能预算不可验证（常量与实测混写；rAF 帧间隔在后台不可靠） | 成立 | §3 拆成 **3.1 静态断言**与 **3.2 运行时实测**（表现层自身耗时 P95，仅可见时采样）；**弃用 rAF 帧间隔** |
| Major：`MAX_P` 双真值 | 成立 | 组件改读 `CONTENT.fx.budget.maxParticles` |
| Major：飘字无 toast 出口使"不丢信息"不成立 | 成立 | 改为准确表述：飘字是**冗余表达**；F9 只断言关键事件均有 toast |
| Major：`prefers-reduced-motion` 零落点、用户档位关不掉 CSS 动效 | 成立 | 引入 **`auto`** 档 + 壳层解析 + 根节点 `data-fx` + CSS 降级块 |
| Major 其余 4 条 / Minor 14 条 | 逐条采纳 | 含零资源白名单基线化、烟测改用探针计数（R4）、cue 名一致性静态扫描（E3）、文档 cue 数量订正等 |
