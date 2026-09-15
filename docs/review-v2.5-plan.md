# Forging v2.5「视听与手感」独立评审报告

> 评审人：独立评审代理 ｜ 日期：2026-09-15 ｜ 对象：`docs/design-v2.5.md`（评审基线 = 工作区快照 17:48，含自校正提交 `1fd7b03`；该文件在评审过程中被更新过一次，本报告针对**更新后**的版本）
> 方法：逐条对照设计与真实代码（file:line）；实跑 `npx vitest run`（**245/18 全绿**）、`npx vite build`（JS 282.40KB / gzip 84.55，CSS 25.66 / 4.60，123 modules）、`npx vue-tsc --noEmit`（0 错）；用系统临时目录中的 vitest 探针（跑完已删）实测 `src/app/store.ts` 在 node 测试环境的可导入性；用脚本逐字统计 `GameEvent` 联合成员与发射点、`data/fx.json` 字段。**未改动任何源码/数据/设计文档**。
> 快照说明：评审期间工作区已有**未提交的实现进行中**（新增 `data/fx.json`、`src/ui/audio.ts`；修改 `types/content/state/persist/gen-content`），本报告仅在"设计假设是否成立"的判断中引用它们作为证据，不构成对实现的评审。
> 沿用前四版评审的严厉标准：每条结论必须可复算、指名章节、给 file:line 或命令。

---

## 一、总体结论（打回 · 需修订后重新评审）+ 计数

**结论：打回（结构性修订后再评审）。** 创意方向正确（路线图 `docs/08-roadmap-v3.md:16` 的 v2.5 = 表现层；v2.4 测评第七章第 2 条也点名要把粒子/飘字优先用在深渊），本稿**确实吸取了部分历史教训**：`data/fx.json` 作为音效/预算的单一数据源（自校正提交 `1fd7b03`）正面回应了"B4 脚本读不到 TS 常量"这一类问题；迁移与 `newGame` 双双登记（`§2.6 #10/#11`，v2.4-plan M8 的教训没有重犯）；iOS 静音档如实说明不伪造绕过。但是，本版把"数值证据"换成了"表现层证据"之后，**证据的判定标准与读数落点没有跟上**——三条 Blockers 全部落在"证据不可执行/不可审计/不可复现"这一本项目反复抓的类型上：

1. **烟测的读数落点不存在（B1）**：§3 烟测 1 要"用 `page.evaluate` 读 `window.__forging` 暴露的**音频状态**"，但 `window.__forging` 只在 `import.meta.env.DEV` 下暴露、且它就是 `store` 本身（`src/app/store.ts:313-316`），既没有音频引擎状态也没有粒子计数，§2.6（自称"完整清单"）也没有登记任何调试句柄；同时 `store.handleEvents` 未导出（`store.ts:98`），且 `store.ts` 在 node 测试环境**导入即抛 `ReferenceError: window is not defined`**（实测）——F8/F9 这两条"经 store 验证"的用例没有落点。这就是 v2.4 测评 M2（声称的集成点未落地）的同类问题，且这次出现在设计阶段。
2. **"单一映射表"在文档里不存在（B2）**：§2.1 写"共 16 条；映射表见 §2.4"，§2.4:53 只有类型与穷举要求、**没有任何映射表**；实际 cue 是 **17 条**（且 `data/fx.json` 已按 17 条生成）；三个 cue（`queueAdvance`/`rareDrop`/`lootBig`）**没有可对应的事件来源**；`enhanceResult` 的成功/失败/庇护三分支、`goldGained` 的负数入账在"一事件一条目"的 `Record<GameEvent['type'], …>` 里无法表达；事件联合里还有 3 个**从未发射**的成员（见 §五）。
3. **性能预算的"脚本断言"是对常量的自证（B3）**：E3 把常量（260/60/4/6）与运行时测量（1.5ms/0.5ms）写在同一条"脚本直读断言"下；脚本读 `data/fx.json` 只能断言**数字本身**，不能断言实现符合它；F10"与 audit 输出一致"若两端都读同一个 JSON 就是同义反复；烟测 5 的"rAF 采样 3 秒帧间隔 → P95 ≤ 20ms"既不度量 1.5ms 的帧内工作量，又恰好在一个**长期后台运行**的放置游戏最不可靠的场景（后台 rAF 暂停/节流）采样。而 v2.4 累积的教训恰恰是"不可复现的数字"。

**计数：Blocker 3 条 / Major 7 条 / Minor 14 条。**
另：本版**设计评审发生在开发之后**——工作区已有未提交的实现（`data/fx.json`、`src/ui/audio.ts`、5 个文件被改），且评审窗口内一度出现 `GameState` 顶层与 `meta` 双写 `settings`、typecheck 失败（17:46 快照 TS2741），说明文档里"设置写在哪"的歧义是真实成本。建议在 B1~B3 的文档修订完成前**暂停把实现合入主线**。

### 任务书 8 问逐条结论

1. **可测性（E1~E6）**：逐条判定见 §二 B3 与下表——**E1 部分可测**（字段完备可断言，"音色"只能验结构）、**E2 可测但责任方写错**（只能在 TS 侧穷举，脚本读不到 `fx-map.ts`）、**E3 部分可测**（常量可断言，1.5ms/0.5ms 不可）、**E4 可测但需先枚举矩阵**、**E5 前半可测后半不成立**（见 M5）、**E6 可测但必须基线化**（见 M-m13 与 §二 B3 备注）。
2. **穷举声明的真伪**：`GameEvent` 当前 **37 个成员**（`types.ts:856-894`），逐个列全见 §五；其中 **3 个从未被发射**（`challengeAbyss/sweepAbyss/buyAbyssItem`，`types.ts:872-874`，它们与 `Command` 同名重复）；**12 个事件有 cue、25 个没有**（允许显式 undefined，但文档未给映射）；17 条 cue 中 **3 条无事件来源**。因此 §2.1 的"16 条音效覆盖全部关键事件"在现文下不可审计（B2）。
3. **自动播放与生命周期**：手势后建 ctx 的**方向正确**，但设计未写挂载点（组件树/入口）、`{ once }` 与双事件重复触发的幂等、监听器清理与 HMR 重入、`resume()` 被拒后的状态与重试（工作区实现已自行定义，见 `src/ui/audio.ts:4-8`），这些必须回填（M-m6、§六 #1/#21）。
4. **性能预算**：260/60/4/6/8 是常量（可断言），1.5ms/0.5ms 是运行时（不可脚本断言）；"P95 帧时 ≤20ms"的采样方法与后台标签页节流直接矛盾，且不度量帧内工作量（B3）。
5. **无障碍**：`prefers-reduced-motion` **在代码里零命中**（grep 全库无 `matchMedia`/`prefers-reduced-motion`），而"默认 reduced"无处落账（内核不能读 DOM，迁移/新档已实际写入 `full`）——见 M1；"关闭动效不丢信息"对 `itemsGained/xpGained/goldGained` 三个飘字来源**不成立**，且 toast 无 `aria-live`（M5）；设置控件用原生 input/button 可键盘操作，这一点没问题。
6. **集成点完整性**：§2.6 缺至少 10 处（`handleEvents` 导出/DEV 句柄、`MainPanel` 淡入与挂载策略、`content.ts` 的 fx 校验、`package.json`/`SettingsPanel` 版本文案、路线图进度、`SceneCanvas` 常量改读 fx.json、`[data-fx]` CSS 绑定、`importSaveFile` 路径、`tests/content.test.ts` 计数），且 #6 指向了错误的文件（剩余时间在 `TopBar.vue:44-49` 早已同时有进度条与数字）。逐条见 §六。
7. **可玩性/取舍**：默认开启音效 + 无 `document.hidden` 暂停 + 无 per-cue 冷却 + 无静音时段，与"放置游戏长期挂机、标签常驻后台"直接冲突（M4）；动效三档命名（full/reduced/off）可用，但 `reduced` 仍保留"飘字+光环"两发动效、且现有场景动画（镐的摆动/炉火闪烁）不在降级范围内，需在文档里写清"降级覆盖哪些动（M1/m-m11）"。
8. **测试计划（§4）**：F1~F10 方向对，但 F1 的"真实事件样本数组"没有防漂移机制、F8/F9 无落点、缺 14 类用例（§七），DoD"≥265"与列出的 10 条用例不匹配（245+10=255，且 F8/F9 当前不可执行）。

---

## 二、Blocker（必须开发前处置）

### B1 本版证据的读数落点不存在：烟测 1/2/3 与 F8/F9 无法按文档执行（"声称的集成点未落地"复发）

- **章节**：§3 烟测 1/2/3（第 102-104 行）、§2.6 全表、§4 F8/F9（第 119-120 行）、§6 DoD"烟测 5 项全过"（第 142 行）。
- **证据（实测）**：
  1. `window.__forging` 的类型是 `store` 对象本体，且在 `if (import.meta.env.DEV)` 分支内（`src/app/store.ts:313-316`）——**生产构建（`npm run preview`）下该句柄不存在**；且 `store` 的字段只有 `state/summary/toasts/ui/now`（`store.ts:52-68`），**没有任何音频状态**（`audioStatus()` 是工作区新文件 `src/ui/audio.ts:118` 才有的函数，设计未登记暴露）。烟测 1 的"读 `window.__forging` 暴露的音频状态"在文档写下时点即不成立。
  2. 烟测 2/3 的"读取场景层对象计数 / 粒子数归零"没有读数点：`particles` 与 `MAX_P` 是 `SceneCanvas.vue` 组件内部变量（`SceneCanvas.vue:28-29`），没有任何导出或 DEV 句柄；`§2.6` 也未登记新增句柄。
  3. **烟测 2 对既有实现没有区分力**：`SceneCanvas.vue:71-77` 在当前（v2.4）代码里**已经在动作完成时爆发 16~24 个粒子**，所以"触发一次动作完成 → 粒子出现"在未做 v2.5 的代码上同样通过——这条烟测无法证明新系统存在（v2.4 复审 Minor 5 的"39/39 全过、无筛选力"是同类）。
  4. **node 测试环境无法直接使用 store**：`import('src/app/store.ts')` 实测抛 `ReferenceError: window is not defined`（`store.ts:315` 是模块顶层执行）；`handleEvents` 是模块私有函数（`store.ts:98`，未导出）；`pushToast` 依赖 `window.setTimeout`（`store.ts:92`）、`markUnread` 依赖 `document.hidden`（`store.ts:109/113/126/172/182`）。因此 F8"levelUp 触发音效 + 光环"、F9"动效关闭时仍产生 toast"**按现文无法编写**。
- **风险**：本版 DoD 的三条（E6 脚本断言、烟测 5 项、F8/F9 守护）都建立在这些落点上；不修就是"证据写了但没有机制"，会在 ⑥ 测评被原样抓住（v2.4 M2 的剧本）。
- **修改建议**：①`§2.6` 增一行：`store.ts` 在 DEV 下暴露 `window.__forgingFx = { audio: audioStatus(), counts: { particles, popups, burstsPerSec }, frameWorkMsP95 }`，并写明烟测在 `vite dev`（或 `?debug=1` 的显式 opt-in）下执行；②把 FX 决策从组件里抽出**纯函数**（`fxForEvent(e) → { cue: string | null; effect: 'spark' | 'ring' | 'popup' | null; color? }`），`handleEvents` 只做接线——这样 F8 直接测纯函数，不必碰 store；③若坚持测 store，写清 `vi.stubGlobal('window', …)`/`document` 的桩法与 `handleEvents` 的导出方式；④烟测 2 改为断言**新信号**（如 `popups > 0` 与"新增的爆发计数/按技能着色断言"），避免与既有爆发混淆。

### B2 "单一映射表"不存在：FX_MAP 的穷举声明不可审计，且 17 条 cue 有 3 条无事件来源

- **章节**：§2.1（第 25 行"共 16 条；映射表见 §2.4"）、§2.4（第 53 行）、§2.6 #2/#13、§3 E2（第 95 行）、§4 F1（第 112 行）、DoD 第 138/139 行。
- **证据**：
  1. **§2.4 没有映射表**。第 53 行只有 `FX_MAP` 的类型与"每个成员必须出现在表里"的要求；§2.1 第 25 行承诺的"映射表见 §2.4"指向空内容。也就是说：本版的核心可审计产物**在文档里没有任何一条具体内容**。
  2. **计数三处不一致**：§2.1"共 16 条"、§2.6 #12"16 条含音色参数"、E1"≥16 条"、DoD"16+"；而按 §2.1 表格逐名点数 = 3+3+3+3+5 = **17 条**，工作区已生成的 `data/fx.json` 也是 **17 条 cue**（实测：`actionStart…blocked`）。
  3. **无事件来源的 cue**：`queueAdvance`（无"队列接力"事件；队列推进表现为下一次 `actionStarted`，`src/game/settle.ts:85`，在纯按事件类型的映射里无法与普通开始区分）、`rareDrop`、`lootBig`（`crateOpened` 只有 `text` 字符串，见 `src/game/crates.ts:28-47` 五个分支；大奖只体现为金币 300 与文案，没有任何结构化稀有度字段）。除非解析文案，这三条永远不响——而解析文案与"单一映射表（可审计）"直接冲突。
  4. **per-type 映射无法表达 payload 变体**：`enhanceResult` 的 `success/guarded`（`types.ts:862`，`store.ts:133-142` 已按三分支弹不同文案）、`actionStopped.reason`（`types.ts:858`）、`goldGained` 存在**负数金额**（`commands.ts:272-279` 的 `buyQueueSlot` 发 `goldGained(amount: -cost)`）——若飘字/音效按 `goldGained` 触发会显示负值或误响，必须过滤 `amount > 0` 或在映射层表达条件，文档均未写。
  5. **3 个死事件成员**：`types.ts:872-874` 的 `challengeAbyss/sweepAbyss/buyAbyssItem` 与 `Command`（`types.ts:849-851`）同名重复，全仓 grep 显示**没有任何游戏事件发射**（仅 `AbyssPanel.vue:92/100/126` 作为命令使用）。`Record<GameEvent['type'], …>` 于是强制为死成员写条目，并使"防新事件漏表现"的守护把噪声当信号。
  6. **脚本读不到映射**：`scripts/*.mjs` 全部是纯 node（只读 `data/*.json`，无 TS 导入），`node_modules/.bin` 里没有 tsx/ts-node/vite-node；自校正把**cue 与预算**放进了 `data/fx.json`，但把**映射**留在了 `src/ui/fx-map.ts`（§2.6 #2）——`audit-fx.mjs` 依然读不到 E2 需要的东西。
  7. **"显式 `sound: undefined`"不可区分**：`{ sound?: string }` 下，省略与显式 undefined 在运行期只能靠 `'sound' in entry` 区分；要"可审计"应改为必填 `sound: string | null`（或 `noSound: true`）。
- **风险**：E2/F1/DoD 三条都建立在这张表上；照现文实现，开发只能自拟映射、漏配与错配没有任何机器守护，Cue 名单与实际触发率脱节（三条永不触发的 cue 会被当成"已实现"）。
- **修改建议**：①把映射也放进 `data/fx.json`（建议结构 `map: { [eventType]: { sound: string | null; fx: 'spark'|'ring'|'popup'|null } }`），TS 侧只保留 payload 条件分支的纯函数（`enhanceResult` 三分支、`goldGained>0`、`crateOpened` 若要区分大奖则给事件加结构化字段——这需要登记 `types.ts:886` 与 `crates.ts:28-47` 的改动）；②在 §2.2/§2.4 里把 37 行映射表写出来（可折叠为"有声音的 12 个事件 + 其余显式 null"）；③统一计数为 17 条，并说明三条无来源 cue 是删除还是补事件；④清理/标注 `types.ts:872-874` 死成员；⑤F1 用**编译期完备性**守护（见 §七）。

### B3 性能预算不可验证：常量被当成测量结果、F10 自证、后台采样与放置游戏现实冲突

- **章节**：§2.2 预算（第 40-41 行）、§3 E3（第 96 行）、烟测 5（第 106 行）、§4 F10（第 121 行）、DoD 第 142 行。
- **证据**：
  1. **E3 的判定标准混装两类东西**："总粒子 ≤260 / 交互爆发 ≤60 / ≤4 次每秒 / 飘字 ≤6"是常量（脚本可断言数值相等），"单帧 ≤1.5ms / 主循环额外 ≤0.5ms"是**运行时测量**（脚本读 `data/fx.json` 的 `frameBudgetMs: 1.5` 只能证明"文件里写着 1.5"，永远不能证明"跑起来 ≤1.5"——这正是本项目前几版反复出现的"数字不可复现"）。
  2. **F10 是同义反复**：若 audit 与测试两端都从 `data/fx.json`/`CONTENT.fx` 取值（工作区 `src/ui/audio.ts:16` 已按此实现），"预算常量与 audit 输出一致"永远为真，零信息量；真正该断言的是**运行时行为**（池不超限、爆发 ≤60/≤4 次秒），而当前粒子池逻辑在 Vue 组件内部（`SceneCanvas.vue:28-29,37-54`），node 环境不可测。
  3. **烟测 5 的采样方法不可靠**：①rAF 的帧间隔在 60Hz 下上限 ≈16.7ms，P95 ≤20ms 近乎恒真，**不度量** 1.5ms 的帧内工作；②`PerformanceObserver` 的 longtask 只捕捉 >50ms，粒度完全够不上 1.5ms；③**后台标签页 rAF 会暂停、250ms 定时器会被节流**（放置游戏的常态使用方式），在后台采样得到的是节流伪影而不是性能；④3 秒窗口太短，冷启动/GC 都会污染 P95。
  4. **双真值风险**：`maxParticles: 260` 进了 `data/fx.json`，但实现点仍是 `SceneCanvas.vue:29` 的 `const MAX_P = 260`；§2.6 #3 并没有写"SceneCanvas 的常量改由 fx.json 读取"，于是"同源"只落实在文件层、未落实到代码层（v2.4 M9 的双真值类型）。
- **风险**：本版是"表现层版本"，性能是唯一硬指标；按现文执行，⑥ 测评无法复现任何性能结论，DoD 的"P95 帧时报告"会退化为一张无意义的截图。
- **修改建议**：①E3 拆成三条：**E3a 常量断言**（fx.json 数值 == 文档承诺值）、**E3b 行为断言**（把粒子池/爆发节流/飘字队列/降级解析抽成纯模块（如 `src/ui/fx-model.ts`），node 单测：池 ≤260、单次 ≤60、注入时钟下 ≤4 次/秒、飘字 ≤6、超限丢弃语义）、**E3c 帧预算（仅浏览器）**：在 rAF 回调首尾与 tick 处理器里用 `performance.now()` 打点，DEV 下暴露 `frameWorkMsP95`/`tickExtraMsP95`，烟测在**可见**状态下采样 ≥30s 后断言 1.5ms/0.5ms；②烟测 5 改写为"帧工作量 P95"（报数即可，别用帧间隔当指标），并单列一条"后台行为：rAF 暂停/定时器节流下不产生无界积压"；③`SceneCanvas.vue:29` 的 `MAX_P` 改为读 `CONTENT.fx.budget.maxParticles`（§2.6 #3 补一句）；④F10 改为"运行时行为 == fx.json 常量"，即删除对 audit 输出的同源比较。

---

## 三、Major

### M1 `prefers-reduced-motion` 的"默认 reduced"没有落点，且用户档位无法作用于 CSS 动效

- **章节**：§2.5 第 60 行、§2.7 第 86 行、§2.6 #8（第 75 行）。
- **证据**：①全库 grep **零命中** `matchMedia`/`prefers-reduced-motion`（`theme.css` 也没有该媒体查询；唯一的 `@media` 是 `theme.css:100` 的窄屏弹窗）；②"默认 reduced"不能放内核：`newGame`（`src/game/state.ts:10-74`）必须保持无 DOM（路线图原则 1，`08-roadmap-v3.md:23`），且 `persist.ts` 的迁移/`ensureFields` 在 node 测试里运行（`vitest.config.ts:5` environment: node），读取 `matchMedia` 会直接崩；③工作区实现已经证明这个洞是真实的：`state.ts:42`、`persist.ts:148-156/217` 全部落 `CONTENT.fx.defaults`（`fx:'full'`）——**升级档与新档都不可能拿到 reduced**；④即使放到 `boot()` 里补救，也没有"这是默认值还是用户显式选择"的标记位，存档一写（`cmd()` 每次保存 + 5s 自动保存）就再也无法区分；⑤CSS 侧的动效（面板 120ms 淡入、按钮 `:active` 位移、toast 滑入、现有 `.btn`/`.cell` 过渡 `theme.css:47,49`、`ActionGrid.vue:46,50`）只受 OS 媒体查询控制，**用户显式选 `off`/`reduced` 不会关掉它们**——两套开关不同源。
- **建议**：把设置建模为 `fx: 'auto' | 'full' | 'reduced' | 'off'`（默认 `auto`，落点写死为**壳层 boot**：`auto` 在首次保存前解析为 `matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduced' : 'full'`，并记录 `fxResolvedFromAuto: boolean`）；同时把生效档位绑到根节点属性（`document.documentElement.dataset.fx`），CSS 写 `@media (prefers-reduced-motion: reduce)` **与** `[data-fx='reduced'|'off']` 两组规则；文档明确"检测一次性还是动态监听"（建议：未显式选择时监听 `change` 自动跟随；显式选择后不覆盖）。

### M2 设置项的写入路径未定义（命令层原则 / 保存时机 / 唯一落点）

- **章节**：§2.6 #4/#5/#9/#11、§2.5。
- **证据**：项目约定"命令层唯一入口：新增交互一律走 `Command` → `applyCommand`"（`08-roadmap-v3.md:24`），UI 组件当前除 `store.ui.*` 与导入存档外不直接改内核状态（全库 grep：`src/ui` 无 `store.state.meta.* =` 写操作）；`meta.settings` 的写入既没有 `Command` 变体（`types.ts` Command 联合 849-851 附近的深渊命令是最后一批），也没有 store 侧 setter（`store.ts` 导出的是 `cmd/pickAction/closeDialog/setView/inspectItem/inspectInstance/exportCurrent`）。工作区实现中途出现过 `GameState` 顶层 + `meta` **双写 settings**、typecheck 报 TS2741 的窗口（快照 17:46），正是这个歧义的成本。
- **建议**：§2.6 写死：设置字段唯一落点 `meta.settings`；新增 `Command` 变体或 store 侧 `setSettings(patch)`，内部更新并 `saveNow()`；文档给出"滑杆 `input` 事件是否逐次写档"的策略（建议 `change` 写档，避免 5s 自动保存与高频写叠加）。

### M3 深渊通关回响环画在了"看不到它"的页面上

- **章节**：§2.2 第 37 行（"深渊通关回响（紫色扩散环）"）、§2.6 #3。
- **证据**：`SceneCanvas` 只在四个技能视图挂载——`MainPanel.vue:33-35` 的 `showScene = ['mining','smelting','forging','enhancing']`，`:93` `<SceneCanvas v-if="showScene" />`；深渊面板（`MainPanel.vue:136-138`）不挂载画布，且切页会卸载组件（`SceneCanvas.vue:249-252` 取消 rAF、粒子数组随组件销毁）。玩家在深渊页点"挑战/扫荡"时**永远看不到通关环**。
- **建议**：三选一写进设计：①把表现层提为**全局层**（`App.vue` 挂一个覆盖层 canvas/DOM，跨视图存活）；②在 `AbyssPanel` 内做独立的轻量反馈（如按钮脉冲/结晶数字动画）；③承认"仅技能页可见"并删除该效果。无论哪种，§2.6 必须登记 `MainPanel.vue`/`App.vue`。

### M4 默认开启音效 × 放置长挂机：无后台暂停、无冷却、无静音时段，风险表也没登记

- **章节**：§2.5 第 58 行（默认 true）、§2.1 第 23-24 行、§5 风险表（第 125-134 行）。
- **证据**：主循环 250ms 一跳（`store.ts:284-300`），`actionCompleted` 会在每个动作完成时发射（最短动作 250ms，`data/config.json.minActionTimeMs`），也就是**前台约每 0.25~3 秒一次**敲击声；后台标签页里定时器被节流但**仍会触发**（Chrome 后台 ~1s，5 分钟后可至 1 分钟一次），用户会听到一串无规律的敲击；项目已有 `visibilitychange` 先例（`store.ts:302-304`，只用于清未读），但没有音频暂停策略。设计里既没有 `document.hidden` 静音、也没有 per-cue 冷却（8 voices 只是并发上限，不是频率上限）、也没有静音时段；风险表七行无"打扰"。
- **建议**：最少写死"`document.hidden` 时音频引擎挂起（`ctx.suspend()` 或 `playCue` 短路），回前台恢复"；加 per-cue 最小间隔（建议 ≥120ms，超限丢弃）与重要度排序（blocked/levelUp 优先）；把"快捷静音"从 §2.6 #14 的"（可选）"提升为**必做**（默认开启音效的前提）；若要默认开启，master gain 建议压低并给首次进入设置的"试听"引导。若不愿做后台暂停，则建议 `sound` 默认 false（首次手势后首次进入设置/顶栏提示开启），并把这一取舍写进风险表。

### M5 "关闭动效不丢信息"对三个最高频的飘字来源不成立；toast 对屏幕阅读器不可达

- **章节**：§2.2 第 38 行（飘字来源）、E5（第 98 行）、F9（第 120 行）、DoD 第 140 行。
- **证据**：飘字覆盖 `+N 矿石/+XP/+N 金`（对应 `itemsGained/xpGained/goldGained`），而 `store.handleEvents`（`store.ts:98-203`）**没有这三个事件的任何分支**——`fx=off` 时它们的增量反馈消失，只剩 HUD 总量（TopBar 金币 `TopBar.vue:39`、NavBar 经验条 `NavBar.vue:10-16`、右栏材料）。F9"动效关闭时仍产生 toast"作为通用断言对这三类必然失败；E5 的"信息仍在文本/toast"需要一张**逐事件的信息替代表**。另外 `Toasts.vue:6-8` 没有 `role="status"`/`aria-live`，屏幕阅读器用户根本听不到"文本替代"（v2.0 Lighthouse a11y 100 不覆盖动态播报）。
- **建议**：①在 §2.5/E5 增加逐事件表（音效/动效/文本替代各自承载什么，"无替代"的要显式写"接受，因其为 HUD 已有量的瞬时增量"或补一条汇总行）；②`Toasts.vue` 增加 `aria-live="polite"`（并在合并计数时保证播报内容含次数）；③F9 改为表驱动断言。

### M6 §2.6 "完整清单"仍缺 10 处，且 #6 指向错误的文件

- 逐条见 §六。要点：`store.ts` 的导出/DEV 句柄与 `oast` 合并落点、`MainPanel.vue`（面板淡入 + 画布挂载策略）、`content.ts`（fx.json 校验与 `CONTENT.fx` 装配，工作区已实现但设计未写）、`types.ts`（`ContentTables.fx`——设计只写了 `meta.settings`）、`SceneCanvas` 常量改读 fx.json、`theme.css` 需新增 `[data-fx]` 选择器、`package.json:4`/`SettingsPanel.vue:150`/`08-roadmap-v3.md:69` 版本与进度、`importSaveFile`（`persist.ts:258-269`）同走 11→12、`tests/content.test.ts` 计数。特别地 **§2.6 #6 写错了对象**："动作卡：剩余时间以细进度条 + 数字并列"——现实现里同时有进度条与数字的是 `TopBar.vue:44-49`（`ProgressBar` + `remainSec`，`:48`），而 `ActionGrid.vue` 是动作选择网格（卡片 note 是产出/等级，`MainPanel.vue:47/62`），`ProgressBar` 的 props 只有 `startedAt/durationMs`（`ProgressBar.vue:4`）。"不再只靠进度条"与现状不符，需先定"到底改哪个界面、改什么"。

### M7 测试计划覆盖不足 + F1 无防漂移机制 + DoD 计数无分配

- **章节**：§4 F1-F10、DoD 第 143 行。
- **证据**：F1 的"真实事件样本数组"是**手写数组**，与 `GameEvent` 联合没有强绑定——这正是"加了新事件没接表现"要防的场景（数组漏一项，测试照样绿）；F8/F9 无落点（B1）；10 条用例 vs DoD"≥265"（基线 245，等差 20 个用例没有出处）；缺手势生命周期、hidden/后台、音量边界与脏值、设置往返与导入迁移、toast 合并、CSS 静态断言、E6 基线 diff 等（§七）。
- **建议**：F1 改为编译期完备性（`const ALL: Record<GameEvent['type'], true> = {…}` 放测试内，联合增删即编译失败）+ 运行时遍历断言；DoD 改为"≥275，分配：fx.test ≥20、persist +4、content +2、UI 静态 2~3"；补齐 §七 清单。

---

## 四、Minor

- **m1** §2.2 第 41 行的口径说明残留未填占位符："与既有实现（ 的 ）冲突"——自校正提交 `1fd7b03` 忘了填 file:line（应写 `SceneCanvas.vue:29`）。
- **m2** §2.6 表格**行号重复**：`audit-fx.mjs` 与 `tests/fx.test.ts` 两行都编号 13（表内共 15 行、编号只到 14）。
- **m3** E1 与前文要求"每条都有音色参数（波形/频率/时长/**包络**）"，但 `data/fx.json` 的 cue 字段只有 `id/name/wave/freqs/durationMs/gain`（实测），没有 attack/decay/release 一类包络参数；F2 也只写"波形/频率/时长"。要么补字段，要么把 E1 的标准改成"结构完备（wave/freqs/durationMs/gain 合法）"。
- **m4** `wave:'noise'` 的 `freqs` 语义未定义：`data/fx.json` 的 `enhanceFail` 是 `{wave:'noise', freqs:[200]}`——噪声源没有音高，200Hz 是滤波器截止还是被忽略？F2 对噪声断言"频率"没有意义（应改成"freqs 仅对振荡器类型必填，噪声类型解释为滤波截止"）。
- **m5** §2.2 第 40 行称"其中场景本身的常驻粉尘占多数"与实现不符：粉尘生成概率 0.07/帧、寿命 140 帧（`SceneCanvas.vue:96-107`），稳态约 **10 个**；占多数的是动作爆发的 16~24 粒/次。该括注是"260 而不是 120"的论证依据，写错会误导预算校验。
- **m6** F7"fx 非法值回落 `full`"对 reduced-motion 用户不友好（脏档/手改存档会把偏好系统偏好的用户推回全动效）；建议回落 `auto`/`reduced`，并补 `volume` 越界（<0、>100、NaN、字符串）的归一化断言。
- **m7** 试听按钮语义未写：播哪条 cue、`sound=false` 时是否可试听（建议可试听但只播一条）、是否占用 8 并发额度、滑杆 `input` 连续事件是否会连发（建议仅 `change` 或按钮触发）。`audio.ts:144` 的 `playCue` 无冷却，连发会直接撞上限。
- **m8** E4"关键组合"未枚举：建议写死 `sound {true,false} × fx {full,reduced,off} × volume {0,60,100}` 共 18 格，并断言 `sound=false` 与 `volume=0` 是否都"不创建 ctx"（两者语义是否等价未定义）。
- **m9** Toast 合并键未定义（`kind` 还是事件类型/文本模板？"同类"若指 `good/bad/info`，"强化成功"与"任务完成"会被合并且语义错乱）；合并需要给 `store.toasts` 增字段（`store.ts:32-36`、`Toasts.vue:7` 直接渲染 `t.text`），与 `markUnread`（`store.ts:74-83`）和 3200ms 生命周期的交互也未写。
- **m10** §2.7 只写"旧档升级"，未写 `importSaveFile`（`persist.ts:258-269`）——导入的 v11 档同样要过 11→12 与 `ensureFields` 补齐；v2.4 测评 m10 是同类缺口。
- **m11** §2.3"动作卡：剩余时间以细进度条 + 数字并列"与实现不符（见 M6）；若本意是给 `ProgressBar` 加数字，需新增 props 与用途说明；若是给动作选择卡加"预计时长"，需求完全没写。
- **m12** §2.6 #14"音量快捷开关（**可选**）"把不确定项写进"完整清单"：要么删掉"可选"写死并给出判定标准（键盘可达 + 状态可见），要么移入 §7 范围外/backlog。
- **m13** §2.1 第 22 行"不引入任何音频文件（体积零增长）"措辞不实：资产零增长成立，但代码会增长（audio + fx-map + 画布改动），DoD 自己还要"记录体积增幅"。应改为"外部资产零增长；代码体积增量在 DoD 记录"。
- **m14** §5 风险表"粒子拖慢主循环"表述错位：粒子在 rAF（`SceneCanvas.vue:59-142`），250ms 主循环里只有音效触发与事件入队（§2.2 第 40 行自己也是这么写的）；风险表按前者写会让人误以为要防主循环里的粒子开销。同表缺"后台/挂机打扰"（M4）与"E6 基线误报"两条。

---

## 五、附录：GameEvent 全量清单与音效覆盖对照表

> 数据源：工作区快照 `src/game/types.ts:856-894`（联合共 **37** 个成员）；"发射次数"= 全 `src/` 内 `type: '<名称>'` 字面量出现次数（排除 types.ts 的定义行）；"设计 cue"指 §2.1 的 17 条音效清单。

| # | 事件（types.ts:行） | 发射次数 | 设计 cue | 说明 |
|---|---|---|---|---|
| 1 | `actionStarted` (856) | 3 | `actionStart` | 下一动作启动（含队列推进），`settle.ts:85` |
| 2 | `actionCompleted` (857) | 2 | `actionComplete` | 高频（每次动作完成） |
| 3 | `actionStopped` (858) | 8 | — | reason: user/noMaterials/queueEmpty；负载不同，建议按 reason 分支 |
| 4 | `itemsGained` (859) | 17 | — | 飘字 `+N 矿石` 的来源（§2.2），无 toast |
| 5 | `xpGained` (860) | 1 | — | 飘字 `+XP` 的来源，无 toast |
| 6 | `levelUp` (861) | 1 | `levelUp` | 光环 + toast |
| 7 | `enhanceResult` (862) | 1 | `enhanceSuccess/Fail/Guarded`（3 分支） | 需按 `success`/`guarded` 选 cue，per-type 映射表达不了 |
| 8 | `reforged` (863) | 1 | — | 重铸完成（有 toast），无音效 |
| 9 | `expeditionDispatched` (864) | 1 | — | 远征 |
| 10 | `expeditionDone` (865) | 1 | — | 远征 |
| 11 | `expeditionClaimed` (866) | 1 | — | 远征结算 |
| 12 | `companionRecruited` (867) | 2 | — | 新伙伴（稀有事件，未配） |
| 13 | `companionLevelUp` (868) | 1 | — | 伙伴升级 |
| 14 | `traitRerolled` (869) | 1 | — | 特质重掷 |
| 15 | `bannerUpgraded` (870) | 1 | — | 旗帜升级 |
| 16 | `challengeAbyss` (872) | **0** | — | **死成员**（与 Command 同名，仅 `AbyssPanel.vue:92` 作命令用） |
| 17 | `sweepAbyss` (873) | **0** | — | **死成员**（仅 `AbyssPanel.vue:100` 作命令用） |
| 18 | `buyAbyssItem` (874) | **0** | — | **死成员**（仅 `AbyssPanel.vue:126` 作命令用） |
| 19 | `codexMilestone` (875) | 1 | — | 图鉴里程碑（有 toast + 未读） |
| 20 | `seasonLevelUp` (876) | 1 | `seasonLevel` | 名称不一致但可映射 |
| 21 | `seasonRotated` (877) | 1 | — | 新赛季 |
| 22 | `abyssCleared` (878) | 1 | `abyssClear` | 通关（环 + toast） |
| 23 | `abyssSwept` (879) | 1 | — | 扫荡（每日 12~48 次，刻意不出声是合理取舍，需写明） |
| 24 | `abyssItemBought` (880) | 1 | `purchase` | 商店购买（唯一明确的 purchase 来源） |
| 25 | `tutorialGoalMet` (881) | 2 | — | 教学 |
| 26 | `tutorialRewarded` (882) | 1 | — | 教学奖励（`handleEvents` 无 case） |
| 27 | `achievementUnlocked` (883) | 1 | `achievement` | |
| 28 | `taskCompleted` (884) | 1 | `taskComplete` | |
| 29 | `tasksRotated` (885) | 2 | — | 任务刷新 |
| 30 | `crateOpened` (886) | 5 | `crateOpen`（+ `rareDrop`/`lootBig` 无来源） | 只有 `text` 字符串，无稀有度结构（`crates.ts:28-47`） |
| 31 | `buffActivated` (887) | 1 | — | 符文生效 |
| 32 | `prestigeDone` (888) | 1 | `prestige` | |
| 33 | `perkChanged` (889) | 2 | — | `handleEvents` 空分支 |
| 34 | `loadoutApplied` (890) | 1 | — | 预设应用 |
| 35 | `goldGained` (891) | 13 | — | 飘字 `+N 金` 来源；**含负数**（`commands.ts:278`），必须过滤 |
| 36 | `notice` (893) | 1 | — | 通用提示 |
| 37 | `blocked` (894) | 66 | `blocked` | 最高频事件；需节流（同 toast 一样会刷） |

**统计与判定**：37 个成员 = **34 个有发射 + 3 个死成员**；**12 个事件有 cue**、25 个没有（允许，但需显式 `null` 才可审计）；17 条 cue 中 `queueAdvance`/`rareDrop`/`lootBig` **无事件来源**（14 条可用）。文档三处"16 条"与实际的 17 条不一致（§2.1:25、§2.6 #12、E1:94、DoD:138）。

---

## 六、遗漏改动点清单（对照代码逐个 file:line）

> 标注：`[已列]` / `[部分]`（文档一句泛指、未给契约）/ `[未列]`（必须）。行号 = 评审时工作区快照（实现进行中，`types/content/state/persist` 的行号随实现漂移，符号名不受影响）。

| # | 文件:行 | 需要的改动 | 文档状态 |
|---|---|---|---|
| 1 | `src/app/store.ts:98` | `handleEvents` 未导出（模块私有）→ 导出或把 FX 决策抽成纯函数；否则 F8/F9 无落点 | 未列（必须，B1） |
| 2 | `src/app/store.ts:313-316` | `__forging` 仅 DEV 且只含 store，无音频/粒子状态 → 新增 `window.__forgingFx` DEV 句柄并登记 | 未列（必须，B1） |
| 3 | `src/app/store.ts:89-96` | toast 合并计数落点（`pushToast` 结构、去重键、`markUnread` 交互） | 部分（#7 一句） |
| 4 | `src/app/store.ts:207-219 / 255-281 / 284-300` | `cmd()`/`boot()`/`startLoop()` 三入口的 FX 一致性（boot 早于手势→静默丢弃；后台 tick 的音频策略） | 未列 |
| 5 | `src/ui/components/SceneCanvas.vue:29` | `MAX_P` 改为读 `CONTENT.fx.budget.maxParticles`（消除 fx.json 与代码的双真值） | 未列（必须，B3） |
| 6 | `src/ui/components/SceneCanvas.vue:28-29,37-54,249-252` | 粒子池/爆发节流抽出为 node 可测纯模块；组件卸载销毁粒子导致跨页特效不可见 | 未列（B3/M3） |
| 7 | `src/ui/components/MainPanel.vue:33-35,93` | 画布挂载策略（深渊环可见性）与面板 120ms 淡入落点 | 未列（M3/m11） |
| 8 | `src/game/types.ts:872-874` | 死事件成员（`challengeAbyss/sweepAbyss/buyAbyssItem`）清理或标注，避免 FX_MAP 为死成员写条目 | 未列（B2） |
| 9 | `src/game/types.ts:785` | `meta.settings` 唯一落点（工作区已实现为可选字段，设计需写死"唯一"与类型） | 部分（#9） |
| 10 | `src/game/content.ts:40,349-368,397` | `data/fx.json` 载入/校验/装配（工作区已实现，设计未登记 `content.ts`；校验应覆盖 cue id 唯一、wave 枚举、budget 完备） | 未列 |
| 11 | `src/game/state.ts:42` | `newGame` 补 `meta.settings`（已列 ✅）；但"默认 reduced"不能落在这里（M1） | 已列（#11） |
| 12 | `src/app/persist.ts:11,148-156,217,258-269` | 版本 11→12、迁移、`ensureFields`（已列）；**漏**：`importSaveFile` 同路径（现有测试的 10→11 用例需升级为 10→12 全链） | 部分（#10） |
| 13 | `src/ui/components/SettingsPanel.vue:138-154` | 新设置卡片 + 写入路径（无 Command/setter）+ 试听语义 + 版本文案（`:150` 仍写 v2.4） | 部分（#5） |
| 14 | `src/ui/components/Toasts.vue:6-8` | 图标/滑入/合并计数 + **`aria-live`**（无障碍文本替代对 SR 不可达） | 部分（#7） |
| 15 | `src/ui/components/TopBar.vue:44-49` | §2.6 #6 指向错误：剩余时间数字早已在 TopBar（`ProgressBar` + `remainSec`），需先定需求 | 列错对象（M6/m11） |
| 16 | `src/ui/styles/theme.css`（全局） | 除 `@media (prefers-reduced-motion)` 外，需 `[data-fx='reduced'|'off']` 选择器与根属性绑定（用户档位要能关 CSS 动效）；现有过渡清单：`theme.css:47,49`、`ActionGrid.vue:46,50` | 部分（#8） |
| 17 | `package.json:4` / `SettingsPanel.vue:150` / `docs/08-roadmap-v3.md:69` | 2.4.0→2.5.0；设置页版本文案；路线图进度行（v2.4 测评 m8 同类） | 未列 |
| 18 | `tests/content.test.ts:108` 等 | fx 表计数与校验断言（cue 数、budget 键集合）；`tests/persist.test.ts` 迁移用例分配 | 未列（§4 只列 fx.test） |
| 19 | `scripts/gen-content.mjs`（已产出 `data/fx.json`） | 生成物确定性（无时间戳/随机）、与 `docs/` 输出对照；E6 需要 `public/` 基线清单（`apple-touch-icon.png`、`icon.svg`）作为 diff 基准 | 部分 |
| 20 | `src/ui/audio.ts:91`（工作区新文件） | `installGestureUnlock(document)` 的 HMR/重复注册/清理契约（设计 #1 只写了 `initAudio()`） | 未列 |
| 21 | `public/`（`apple-touch-icon.png`、`icon.svg`、`manifest.webmanifest`、`sw.js`）与 `dist/` | E6 的"不新增"必须定义为"与 v2.4 发布资产清单 diff"，否则脚本一跑就误报（见 B3 建议） | 未列 |

---

## 七、测试计划补强建议

§4 的 F1~F10 方向正确，但按本稿风险至少补 12 类（建议 `tests/fx.test.ts` 20~24 例，另在 persist/content 各加 2~4 例，DoD 从"≥265"改为 **≥275** 并给出分配）：

- **T1 手势生命周期**：`pointerdown` 与 `keydown` 双监听只解锁一次（幂等）；重复调用 `installGestureUnlock` 不重复绑定（HMR 场景）；`resume()` 被拒/ctx 非 running 时 `playCue` 返回 false 且**下次手势重试**；未手势时无 AudioContext 实例（`audioStatus().ctxState === null`）。
- **T2 后台/可见性**：若采纳 M4 策略，断言 `document.hidden` 时 `playCue` 短路或 `ctx.suspend()`，回前台恢复；不产生积压队列（连续 20 次后台请求后 `active === 0`）。
- **T3 音量与脏值边界**：`volume` 0/100、-1/101、`NaN`、字符串（手改存档/导入）→ 归一化；`sound=false` 与 `volume=0` 都不创建节点（两者语义是否等价需按 M-m8 定档后断言）。
- **T4 并发与冷却**：假 AudioContext 下连发 20 次 → 并发 ≤8（F3）；若采纳 per-cue 冷却，注入假时钟断言 ≤1 次/间隔。
- **T5 设置迁移**：11→12 默认值；缺 `meta.settings`/非法 `fx`/越界 `volume`；**importSaveFile 路径**；往返幂等（把现有 `persist.test.ts` 的 10→11 链升级为 10→12 全链）。
- **T6 降级矩阵**：`fx {full,reduced,off} × {粒子, 飘字, 光环, 常驻粉尘}` 的决策纯函数（18 格表驱动），断言 off 全拒、reduced 仅放行飘字/光环。
- **T7 预算行为（非常量）**：抽出的 fx-model 上断言：池 ≤260（连续注入 1000 个爆发）、单次爆发 ≤60、注入时钟下 ≤4 次/秒、飘字 ≤6、超限丢弃的新请求不影响已排队项。
- **T8 FX_MAP 完备性**：编译期 `Record<GameEvent['type'], true>` 全量表 + 运行时遍历；断言 3 个死成员的策略（显式 `null` 或删除）；断言 `sound` 字段必填（`string | null`）以区分"显式无声音"。
- **T9 cue 选择逻辑**：`enhanceResult` 三态（成功/失败/庇护）各选对 cue；`goldGained` 负数不发声/不出飘字；`crateOpened` 若保留 `rareDrop/lootBig`，断言大奖路径选 `lootBig`（需先给事件加结构化字段）。
- **T10 信息不丢失（表驱动）**：逐事件断言"音效/动效/文本替代"三类落点（对 `itemsGained/xpGained/goldGained` 按 M5 的最终口径断言）。
- **T11 设置读写的持久化往返**：`setSettings` → `saveGame` → `loadGame` 后值保留；非法值被归一化并落盘。
- **T12 UI/样式静态断言**：`theme.css` 含 `prefers-reduced-motion` 块与 `[data-fx]` 选择器；`Toasts.vue` 含 `aria-live`；设置控件为原生 `input`/`button`（键盘可达）；`SceneCanvas` 的 `MAX_P` 来自 `CONTENT.fx.budget`（防双真值）。
- **T13 E6 基线 diff**：`public/` 与 v2.4 资产清单一致（只允许白名单），`dist/` 无音频扩展名（`.mp3/.wav/.ogg/.m4a/.flac`）。
- **T14 烟测改写**：烟测 1 断言"手势前无 AudioContext / 手势后 `ctxState==='running'`"；烟测 2 断言**新信号**（飘字数与新增爆发计数，而非既有爆发）；烟测 3 断言 off 后计数归零与 `volume=0` 时 `playCue===false`；烟测 5 改为"帧工作量 P95 + tick 额外耗时 P95"、在可见状态采样 ≥30s，并单列后台节流行为。

---

### 附：事实性更正清单（供文档修订时逐条勾选）

1. §2.1:25 / §2.6 #12 / E1 / DoD 的"16 条"→ 实为 **17 条**（`data/fx.json` 已生成 17 条）。
2. §2.1:25"映射表见 §2.4"→ §2.4 **没有映射表**（B2）。
3. §2.6 #6"动作卡：剩余时间…不再只靠进度条"→ 现状 `TopBar.vue:44-49` 已同时有进度条与数字；`ActionGrid` 无进度概念（m11）。
4. §2.2:40"常驻粉尘占多数"→ 稳态约 10 粒，爆发才是多数（m5）。
5. §2.2:41 口径说明残留空括号"（ 的 ）"（m1）。
6. §2.6 表两行同编号 13（m2）。
7. E1"包络"→ `data/fx.json` 无包络字段（m3）；`noise` 的 `freqs` 语义未定义（m4）。
8. §2.1:22"体积零增长"→ 仅资产零增长（m13）。
9. §5"粒子拖慢主循环"→ 粒子在 rAF，主循环只有音频/入队（m14）。
10. §2.5:60"默认 reduced"→ 迁移/新档实际落 `full`，且无落点（M1）；全库无 `matchMedia`。
11. §3 烟测 1"读 `window.__forging` 的音频状态"→ DEV-only 且无音频状态（B1）。
12. §2.6 #14"（可选）"→ 与"完整清单"自相矛盾（m12）。
13. `types.ts:872-874` 三个死事件成员（B2/§五）。
14. §2.7 未覆盖 `importSaveFile` 路径（m10）；§2.6 未登记 `content.ts`/`MainPanel.vue`/版本收尾（M6/§六）。
