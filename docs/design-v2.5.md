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

- 技术：WebAudio **振荡器 + 增益包络 + 白噪声缓冲**，无任何音频文件（体积增幅记入 §6 与路线图进度表）。
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

### 2.3 场景动效（**两层分工**：场景本体 + 全局表现层）

> **测评 B1 修正后的结构**（原设计把表现层挂在技能页的 `SceneCanvas` 上，导致两个问题：
> ①在其它页面产生的表现会排队、切回技能页时"迟到重放"；②深渊通关的环/爆发在深渊页看不见）。
> 现在明确分为两层：

| 层 | 文件 | 职责 | 挂载范围 |
|---|---|---|---|
| **场景本体** | `SceneCanvas.vue` | 动作动画（镐/炉/砧/强化）、常驻浮尘、动作完成爆发（经总线投给表现层） | 仅技能页（`v-if` 保持既有布局） |
| **全局表现层** | `FxLayer.vue`（新） | 粒子爆发、飘字、光环；`position: fixed` + `pointer-events: none` | **常驻**（`App.vue` 顶层），任何页面都可见 |

- **粒子**：`MAX_P` 读 `CONTENT.fx.budget.maxParticles`（**单一来源**，修评审 M5 的双真值）；色系：事件侧 `spark`/`gold`/`gray`/`blue`/`abyss`，场景侧 `ore`/`spark`。
- **交互预算**：单次爆发 ≤ `maxBurstParticles`(60)、爆发频率 ≤ `maxBurstsPerSecond`(4)；**事件爆发与场景完成爆发共用同一 `requestBurst()` 闸门**（测评 Minor-10：原先只约束事件侧）。
- **飘字**：同屏 ≤ `maxPopups`(6)，纵向错行槽位**夹在可见范围内**（测评 Minor-6：原 `slot≥5` 会飘出画布）：`+N 名称` / `+XP` / `+N 金`。
- **光环**：技能升级/成就/深渊通关时扩散环。
- **降级**：`fx = reduced` → 关闭常驻浮尘与交互爆发，仅保留飘字与光环；`fx = off` → 覆盖层立即清空并停止绘制（`store.dispatchFx` 短路 + 层内二次判定），**场景本体与音效不受影响**（测评 M3）。
- **淘汰语义（测评 B1）**：总线在无订阅者时**直接丢弃**（`sceneDropped()` 计数可见），不做队列补放 —— 表现是即时反馈，过期即无意义。
- **性能埋点**：`performance.now()` 采样三项，仅在 `document.visibilityState === 'visible'` 时采样，滚动窗口输出 **p50/p95/max/samples**：
  - `draw`：两个画布（场景 + 全局表现层）的单帧绘制耗时；
  - `tick`：事件批次的**同步段**（映射 + 入队 + 取声部）；
  - `audio`：**微任务内的音效调度耗时**（单独计量）。
  测评 M2 的诉求是"读数不能只覆盖同步段"——处置方式为**两段分别计量、相加判定**（`tick + audio ≤ loopBudgetMs`），而不是把两者混进一个数（混进去会把 toast/存档等非表现层开销也算进来）。

### 2.4 手感与信息层级

- 按钮 `:active` 位移 + 边框高亮（`:active` 只做 1px 位移，不引入重排）；禁用态维持 v2.0 的对比度标准。
- 视图切换 120ms 淡入（`MainPanel` 的 `Transition`，**仅淡入不位移**）；`[data-fx='off'/'reduced']` 与 `prefers-reduced-motion` 下由 `theme.css` 统一取消。
- 动作卡：剩余时间数字与进度条并列（实现在 `ProgressBar.vue`，`TopBar` 使用）。
- Toast：类型图标（✔/✖/•，不依赖颜色单通道）+ 滑入 + **与上一条同文案同色合并计数**（受 3.2s TTL 限制，非严格"2 秒窗口"，测评 Minor-11 已如实收紧表述）；同屏上限 4 条。
- 快捷静音：导航栏底部「音效开 / 已静音」一键切换（测评 M1）。

### 2.5 设置与无障碍（评审修正：`auto` 档）

- `meta.settings = { sound: boolean; volume: number(0~100); fx: 'auto' | 'full' | 'reduced' | 'off' }`
- **解析规则**（壳层 `resolveFxLevel()`）：`auto` + `prefers-reduced-motion: reduce` → `reduced`；`auto` 否则 → `full`；用户显式档位优先。
- 根节点绑定 `data-fx="<解析后的档位>"`；CSS 用 `[data-fx='off']` / `[data-fx='reduced']` 关闭过渡与动画 → **用户档位能真正关掉 CSS 动效**（初稿零落点，评审 Major）。
- **信息不丢失的准确表述（评审修正）**：飘字是**冗余表达**（同名信息在右侧栏资源/行囊、经验条、金币栏本就可读）；需要"不丢"的**关键事件**（升级/成就/任务/开箱/强化/深渊/阻塞）**均有 toast**，与动效档位无关（F9 按此断言）。
- 移动端：iOS 静音档下 WebAudio 无声属平台行为，**设置页已如实写明**（测评 M5：此前只在文档里写、界面没写）。
- 音量滑杆与开关均键盘可达；「试听」按钮点击即手势（顺带解锁音频），**每次换一条 cue**（按钮显示当前名称，`cueList()` 因此不再是死代码，测评 Minor-9）。
- **音效与特效解耦（测评 M3）**：`sound/volume` 只管声音；`fx` 只管画面。后台标签页（`document.hidden`）自动静音；同一 cue 有 120ms 冷却（挂机时不至于变成持续敲击）。

### 2.6 集成点（完整清单）

| # | 位置 | 改动 |
|---|---|---|
| 1 | `data/fx.json`（新，**生成器产出**） | 16 条 cue + 7 项预算 + 设置默认值（`fx: 'auto'`）；由 `scripts/gen-content.mjs` 生成，`npm run gen:check` / audit **E7** / `tests/toolchain.test.ts` 三重守护同源（测评 B2） |
| 2 | `src/ui/audio.ts`（新） | WebAudio 引擎（`unlockAudio`/`installGestureUnlock`/`playCue`/`setAudioEnabled`/`setAudioVolume`/`audioStatus`/`cueList`/`__resetAudioForTest`）；后台静默 + per-cue 冷却 + 微任务建图 |
| 3 | `src/ui/fx-map.ts`（新，纯模块） | `resolveFx(ev, ctx)`：事件 → {cue, burst, ring, popup}，覆盖全部 35 个事件；`resolveFxLevel()` 同在此模块（可测） |
| 4 | `src/ui/fx-probe.ts`（新） | 采样与探针：`recordDraw/recordTick/stat(p50,p95,max)/installFxProbe`（**仅 DEV** 挂 `window.__fx`，测评 M4） |
| 5 | `src/ui/components/SceneCanvas.vue` | **场景本体**：动作动画 + 常驻浮尘 + 完成爆发（走 `requestBurst` + 总线）；`MAX_P` 读内容表；不再订阅总线 |
| 5b | `src/ui/components/FxLayer.vue`（新） | **全局表现层**：粒子/飘字/光环，`fixed` 覆盖层 + `pointer-events:none`，常驻挂载（测评 B1） |
| 6 | `src/app/store.ts` | `handleEvents` 接 `resolveFx` → 音效/表现；`recordTick`（**同步段**，与探针的 `audio` 统计分列，测评 M2）；boot 同步存档设置 + 首手势 `installGestureUnlock` |
| 7 | `src/app/scene-bus.ts`（新，极小） | 表现指令总线（store → FxLayer）；**无订阅者即丢弃**（测评 B1） |
| 8 | `src/ui/components/SettingsPanel.vue` | 音效开关 / 音量滑杆（`@change` 提交）/ 动效四档 / 试听（逐条 cue）/ iOS 说明 |
| 9 | `src/App.vue` | 根节点 `data-fx` 绑定 + 解析；挂载 `<FxLayer />` |
| 10 | `src/ui/styles/theme.css` | `[data-fx]` 与 `@media (prefers-reduced-motion)` 降级；`:active` 反馈 |
| 11 | `src/ui/components/Toasts.vue` / `ProgressBar.vue`（+`TopBar.vue`） | 图标+滑入+合并计数 / 时间数字（测评 M5 修正指向：时间数字不在 `ActionGrid`） |
| 12 | `src/game/types.ts`（+ `src/ui/fx-map.ts`） | `types.ts`：`FxDef`/`SettingsState`/`meta.settings`，**移除 GameEvent 里 3 个 Command 成员**；`fx-map.ts`：`BurstKind` 增 `ore`（场景侧动作完成爆发用色） |
| 13 | `src/app/persist.ts` / `src/game/state.ts` | `SAVE_VERSION 11→12` + 迁移 + `ensureFields`/`sanitizeSettings` + `newGame`；抽出纯函数 `deserializeSave` |
| 14 | `src/game/content.ts` | 载入/校验 `fx.json`（含 `maxBurstsPerSecond` 与 `fxLevels`，测评 Minor-4） |
| 15 | `scripts/audit-fx.mjs`（新） | **静态**证据 E1~E7（E7 见 §3.1 末行：内容管线同源） |
| 16 | `tests/fx.test.ts`（新） | §4 全部用例 + 静态落点守护（CSS 降级 / `aria-live` / 单一真值 / 常驻层） |
| 17 | `src/ui/components/MainPanel.vue` | 视图切换 120ms 淡入（§2.4；评审 M6 曾点名此处漏登记） |
| 18 | `src/ui/components/NavBar.vue` | 快捷静音按钮（测评 M1） |
| 19 | `scripts/gen-content.mjs` / `tests/toolchain.test.ts` | 生成器 `--check` 同源模式 + 回归用例（测评 B2） |

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
| **E7** | **内容管线同源**（测评 B2） | `data/*.json` 与 `scripts/gen-content.mjs` 逐字节一致（`--check` 只比对不写盘） | audit E7 + `tests/toolchain.test.ts` |

### 3.2 运行时实测（实机烟测，**仅页面可见时采样**）

| # | 测什么 | 方法 | 目标 | v2.5 实测 |
|---|---|---|---|---|
| R1 | 自动播放门槛 | 加载后 `__fx.audio().ready === false` → **真实手势**点击后 `=== true` | 严格 | ✅ false/`ctxState=null` → true/`running`（坐标点击复核） |
| R2 | 表现层帧内耗时 | 可见状态 `draw` 的 p50/p95/max | ≤ `frameBudgetMs`(1.5ms) | ✅ 0.10 / 0.20 / 0.30ms（180 样本） |
| R3 | 主循环表现开销 | `tick`（同步段）+ `audio`（音效调度）**两部分相加** | ≤ `loopBudgetMs`(0.5ms) | ✅ 两轮：合计 p95 **0.40ms** / **0.50ms**（压线，p50 合计 0.20ms） |
| R4 | 动效开关生效 | `fx=off` → 峰值粒子 0 且飘字 0；`reduced` → 粒子 0、飘字可 >0 | 严格 | ✅ off：0/0；reduced：0/**3** |
| R5 | 设置持久化 | 改设置 → 重载 → 值保持且 `data-fx` 正确、**引擎同步** | 严格 | ✅ 三处一致 + `audio.enabled=false` 生效 |
| R6 | **跨视图可见（测评 B1）** | 非技能页（商店）挂机：表现层峰值 >0 且 `sceneDropped === 0` | 严格 | ✅ peakParticles 260 / peakPopups 6 / bursts 3 / **dropped 0**（页面仅 1 个画布＝全局表现层） |

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
| 自动播放被拦截 | 首次手势后才创建；未手势静默丢弃（F5 + R1）；`playCue` **绝不创建**上下文（F5 新增用例） |
| 音效 CPU 尖峰/爆音 | 并发 ≤8、超限丢弃、短包络（F4）；建图在微任务、噪声缓冲解锁时预热（烟测 D1） |
| 音效打扰（挂机/后台） | 后台静默（`document.hidden`）+ 同 cue 120ms 冷却 + 导航栏快捷静音（测评 M1） |
| 表现层拖慢主循环 | 爆发频率上限（**含场景侧**）+ 三档降级 + 埋点实测（R2/R3，p50/p95/max）；R3 合计 p95 已压线（0.50/0.50ms），v3.0 新增逐事件表现前需复测 |
| 表现"迟到重放" | 全局常驻表现层 + 总线无订阅者即丢弃（测评 B1，`sceneDropped()` 可观测） |
| 无障碍/前庭敏感 | `auto` 跟随系统偏好 + 一等开关 + `data-fx` 真关 CSS 动效（F7/R4） |
| 音效/特效语义混淆 | 两者独立：`off` 只关覆盖层视觉，不静音；设置页与选项文案同步改写（测评 M3） |
| iOS 静音档无声 | 平台行为，**设置页已写明**（测评 M5） |
| 零资源承诺 | audit E5 白名单基线化 |
| 内容与生成器漂移 | `npm run gen:check` + audit E7 + `tests/toolchain.test.ts` 三重守护（测评 B2） |
| 生产包暴露调试句柄 | `installFxProbe/attachAudioStatus` 包在 `import.meta.env.DEV` 内（测评 M4） |
| 新事件忘接表现 | `resolveFx` 穷举 + F1 |
| 类型债复发 | F11 断言 GameEvent 不含 Command 成员 |

## 6. 验收标准（Definition of Done）

- [x] 16 条程序化音效；零外部资源（E5 白名单断言；audit E1~E6 全过）
- [x] `resolveFx` 覆盖全部 35 个事件（F1）+ 分支规则（F2/F3）
- [x] 三类动效 + 四档设置（auto 解析）+ `data-fx` 真关 CSS 动效（F7；R4 实测 off 与 reduced 均生效）
- [x] 设置三项持久化（存档 v12）+ 迁移无损（F8）+ **引擎启动同步**（烟测 D5 修复）
- [x] 烟测 R1~**R6** 全过（p50/p95/max 报告 + 2 张截图，`docs/smoke-v2.5.md`；含 D1~D14 缺陷处置）
- [x] 测试全绿（**309**）/ typecheck / build（gzip JS 94.75KB ← v2.4 84.5KB，+10.25KB 为音效引擎与全局表现层）／`npm run gen:check` 与 `npm run audit:fx:check` 同源断言

## 7. 范围外（记入 backlog）

- 背景音乐（BGM）→ v3.0 视时间决定
- 音效主题包 → 零资源前提下不做
- 触觉反馈（Vibration API）→ 兼容性差，不做
- **表现层逐事件开销的余量**：R3 合计 p95 已压到预算上限（0.50ms），v3.0 若新增逐事件表现需重新评估（`loopBudgetMs` 与实现二选一调整）
- `FxPlan.burst` 类型未按"事件侧只产 5 色"收窄（现由约定 + audit E3 静态扫描保证）
- auto 档每帧调用 `matchMedia`（µs 级，已计入 draw 读数）

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

## 9. 测评处置记录（⑥ 测评 → 处置）

测评报告：`docs/review-v2.5.md`（**不通过**：Blocker 2 / Major 5 / Minor 11 / 观察项 5，总评 6.0/10）。

| 编号 | 结论 | 处置（含落点） |
|---|---|---|
| **B1** 表现指令"迟到重放"；深渊通关表现在深渊页不可见（计划评审 M3 未真正落地） | 成立 | 结构改为**两层**：新增常驻全局表现层 `FxLayer.vue`（`App.vue` 顶层，`fixed`+`pointer-events:none`），`SceneCanvas` 只留场景本体；`scene-bus.ts` 无订阅者**直接丢弃**（`sceneDropped()` 计数）；测试从"缓存补放"改写为"丢弃不重放"，并新增"FxLayer 常驻 + 场景不订阅"的静态守护 |
| **B2** `data/fx.json` 与生成器不同源（跑 `npm run gen` 会回滚 `auto` 默认档并复活无来源 cue） | 成立 | ①`gen-content.mjs` 删 `queueAdvance` + `defaults.fx='auto'`（并写入"必须改生成器"的注释）；②新增 `--check` 模式与 `npm run gen:check`；③audit 新增 **E7 内容管线同源**；④`tests/toolchain.test.ts` 加回归用例 |
| **M1** 音效无"不打扰"策略（后台照响 / 无冷却 / 无快捷静音） | 成立 | `playCue` 增加 `document.hidden` 短路与 120ms per-cue 冷却（`CUE_COOLDOWN_MS` 可导出、有测试）；导航栏新增**快捷静音**按钮（`aria-pressed`）；风险表补行 |
| **M2** `tickMs` 口径不再覆盖建图成本 | 成立 | **两段分别计量、相加判定**：`tick` 记同步段（`store.ts` 同步调用），新增 `audio` 统计记 `playCue` 微任务内的参数调度（`recordBuild`）；同时用**声部池**把节点分配挪到解锁时 → 实测 `tick` p95 0.30 + `audio` p95 0.10 = **0.40ms ≤ 0.5ms**；探针输出 p50/p95/max/samples（见 `docs/smoke-v2.5.md` R3） |
| **M3** `off` 档语义不自洽（连带静音、试听仍响、文案矛盾） | 成立 | 音效与特效**解耦**：`dispatchFx` 只对视觉短路，`playCue` 由 `sound/volume` 决定；选项文案与说明改写（"关闭只关覆盖层粒子与飘字；场景动画与音效不受影响"）；`FxLayer` 在 off 档清空存量并停绘 |
| **M4** 生产构建暴露 `window.__fx` | 成立 | `installFxProbe/attachAudioStatus` 包进 `import.meta.env.DEV`；`docs/smoke-v2.5.md` 的相应声明同步修正（并如实记录"此前声明不实"） |
| **M5** §2.4 面板淡入零实现；§2.6 #11 指向错；iOS 说明不存在 | 成立 | ①`MainPanel` 实现 120ms 淡入（仅淡入不位移）并登记为集成点 #17；②§2.6 #11 修正为 `Toasts.vue` / `ProgressBar.vue`(+`TopBar.vue`)；③设置页补 iOS 静音档与后台静音说明 |
| Minor-1 `pass` 硬编码 | 成立 | E4/E6 的 `pass` 改为按本次检查结果计算 |
| Minor-3 UI/CSS 修复无测试雷达 | 成立 | 新增"静态落点守护"：`theme.css` 的 `[data-fx]` 块、`Toasts` 的 `aria-live`、粒子上限单一来源（无硬编码 260）、`FxLayer` 常驻 |
| Minor-4 预算键校验漏项 | 成立 | `content.ts` 校验补 `maxBurstsPerSecond` 与 `fxLevels`（并加两条关系断言） |
| Minor-6 飘字槽位溢出画布 | 成立 | 槽位夹到 ≤4，锚点回到可见范围 |
| Minor-7 音量滑杆写放大 | 成立 | 改 `@change` 提交（`:value` + 本地 `shownVolume` 保持跟手） |
| Minor-9 死代码 | 成立 | `cueList()` 接入「试听」（逐条轮播并显示名称）；`opts.gain/detune` 保留为引擎能力并在注释中标注；`theme.css` 的 `.popup/.ring` 选择器删除 |
| Minor-10 频率上限只覆盖事件侧 | 成立 | 场景完成爆发改走 `requestBurst()` |
| 观察项（matchMedia 缓存、千分位极端值、`data-fx` 不追踪偏好、R3 样本数、路线图行） | 记录 | 除"路线图行"当版补齐外，其余留 v3.0（`review-v2.5.md` §六） |
