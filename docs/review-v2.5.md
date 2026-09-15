# Forging v2.5「视听与手感」测评报告（发布前）

> 测评人：资深玩家测评代理（放置类游戏 2000+ 小时视角 + 证据优先）｜日期：2026-09-15
> 版本：v2.5.0 ｜ 对象：HEAD `74308ce`（工作区干净；测评**未修改任何文件**）
> 复跑：`node scripts/audit-fx.mjs`（E1~E6 全过，产物与仓库逐字节一致）、`npx vitest run`（298 passed）、`npm run typecheck`、`npx vite build`（gzip JS 93.34KB）、`grep dist`、临时目录重跑 `gen-content.mjs`、node 直接 import `src/ui/fx-map.ts` 做数值重算、穷举 35 个事件的发射点
> **能力边界声明**：本代理不使用浏览器工具，R1~R5 的实机读数与"音效好不好听"只做代码级/参数级判定；这两项在下文逐条标注"无法验证"。

---

## 一、总评（6.0 / 10）与一句话结论

**总评 6.0 / 10 —— 不通过（Blocker 2 条未清零，需当版处置后复审）。**

**一句话结论：本版的核心交付我逐条验证为真**（16 条 cue 全有事件来源、`resolveFx` 穷举 35 事件、三档降级、存档 v12、设置面板、Toast/进度条、门禁四绿、数值零改动），**但两条 Blocker 一条是玩家可见的错误反馈**（表现指令在画布未挂载时排队、切回技能页"迟到重放"；而深渊通关的环/爆发恰恰在最该出现的深渊页不可见——计划评审 M3 声称已采纳实际未改），**另一条破坏了内容管线不变量**（`data/fx.json` 不是生成器产物：跑一次 `npm run gen` 就会把默认档从 `auto` 改回 `full`、并复活设计已删除的无来源 cue，同时让 audit E6 与 F10 立刻失败）。

扣分构成：B1 −1.3 ｜ B2 −0.8 ｜ M1~M5 合计 −1.3 ｜ Minor 11 条合计 −0.6。

---

## 二、独立复跑的证据（可复现）

| 命令 | 结果 |
|---|---|
| `node scripts/audit-fx.mjs` | E1 16 条 / E3 引用 16、未引用 0、未定义 0 / E4 七项常量 / E5 命中 0 / E6 `auto`；**exit 0**，且产物与仓库 JSON 逐字节一致 |
| `npx vitest run` | 19 文件 **298 passed** |
| `npm run typecheck` | exit 0 |
| `npx vite build` | JS 305.05KB / **gzip 93.34KB**（v2.4 84.5 → +8.8KB） |
| 临时目录重跑 `gen-content.mjs` | 9 个 data 文件中 **8 个逐字节一致，仅 `fx.json` 有 12 行差异**（B2 证据） |
| `grep __fx dist/assets/*.js` | 命中 1 处（M4 证据） |
| 穷举 35 个 `GameEvent` 成员 × 全 `src/` 发射点 | **35/35 均有发射点，0 死成员**（设计 §2.2 声明为真） |

---

## 三、Blocker

### B1 表现指令「迟到重放」；深渊通关表现在深渊页不可见
**证据链**
1. `src/app/scene-bus.ts:19-37`（旧）：无订阅者时缓存进 `pending`（上限 8，FIFO），`subscribeScene` 挂载时**全部补放**；测试 `tests/fx.test.ts` 曾把该行为写成用例（"未订阅时短队列缓存，订阅后补放"）。
2. `src/ui/components/MainPanel.vue:33-35,93`：`SceneCanvas` 只在四个技能视图挂载；切页即卸载退订。
3. 主循环与 `cmd()` 与视图无关（`src/app/store.ts` 的 250ms 循环 + `dispatchFx`）。
4. **结果 A（玩家可见）**：在设置/深渊/商店页挂机时，每轮完成都会 `emitScene`；切回技能页瞬间一次性补放最多 8 条过期表现。5s 采矿 + 逛 30s 设置页可稳定复现。
5. **结果 B（承诺未落地）**：`abyssCleared` 的紫环 + 爆发 + 飘字在深渊页产生，而深渊页没有画布 → 玩家看不到任何通关表现；`docs/review-v2.4.md` 还专门要求 v2.5 的粒子/飘字优先用在深渊。

### B2 `data/fx.json` 与生成器不同源
```
node scripts/gen-content.mjs  →  diff（提交版 vs 重生成）
23a24,33  > "id": "queueAdvance" …            （设计 §2.1 明确已删除）
194c204   < "fx": "auto"   ---   > "fx": "full"
```
`scripts/gen-content.mjs` 仍保留 `queueAdvance` 且 `defaults.fx = 'full'`，而 `data/fx.json` 是开发期**手改**的 → 跑一次内容管线就会：①无障碍回退（`prefers-reduced-motion` 用户被拉回全动效）；②audit E6 与 F10 失败；③复活无来源 cue。设计 §2.6 #1 写的是"生成器产出"，与实现不符。

---

## 四、Major

| # | 问题 | 证据 | 后果 |
|---|---|---|---|
| M1 | 音效没有"不打扰"策略：后台标签页照响、无 per-cue 冷却、无快捷静音（计划评审 M4 未处置，§8 却记录"逐条采纳"） | `grep hidden src/ui/audio.ts` 零命中；`playCue` 只限并发；全库无静音入口 | 挂机时每轮必响；后台被节流后成"无规律敲击" |
| M2 | `tick ≤0.5ms` 的读数不再覆盖它声称度量的成本（建图被挪进微任务后计量没跟上） | `store.ts` 的 `recordTick` 只包同步段；建图在 `queueMicrotask` | 证据与定义不匹配（`design §2.3` 把 tick 定义为"主循环表现层开销"） |
| M3 | `off` 档语义不自洽：静音音效、试听仍响、画布仍在动；UI 文案写"无任何动效与音效表现" | `store.ts` 的 `if (level !== 'off')` 把音效一起短路；`SettingsPanel` 文案 | 「特效=关闭 + 音效=开」这一档不可达；语义自相矛盾 |
| M4 | 生产构建仍暴露 `window.__fx`（`installFxProbe()` 无 DEV 守卫） | `grep __fx dist/assets/*.js` 命中 | 烟测报告"生产不暴露"可证伪 |
| M5 | §2.4「面板 120ms 淡入」零实现；§2.6 #11 指向 `ActionGrid.vue`（实际在 `ProgressBar/TopBar`）；iOS 静音档说明在设置页不存在 | `grep Transition`；`SettingsPanel.vue` 无 iOS 文案 | 承诺与实现不符 |

## 五、Minor（11 条）

1. `audit-fx.mjs` 的 `E4.pass`/`E6.pass` 硬编码 `true`（失败只进 `fails[]`）。
2. 断言强度：F9 用源码字符串包含法；F10 比的是"提交的 JSON ↔ 内容表"而非脚本本次输出；F7 的"非法档位回落"用例因新档本就是 `auto` 而无区分度（且 `applySettings` 是"忽略非法值"、`sanitizeSettings` 是"回落默认"，两者规则并不相同）。
3. UI/CSS 修复无测试雷达（`theme.css` 的 `[data-fx]`、`Toasts` 的 `aria-live`、上限读内容表）。
4. `content.ts` 的 fx 校验漏 `maxBurstsPerSecond` 与 `fxLevels`。
5. 音频总线无限幅（8 路并发直连 destination）。
6. 飘字槽位 `slot≥5` 会飘出画布（`maxPopups=6` 实际可用约 4 条）。
7. 音量滑杆用 `@input` → 拖动触发 N 次 `cmd()` 与存档写入。
8. 文案/文档小错：设置页说明句语义颠倒；§2.1"（体积零增长）"；§5"粒子拖慢主循环"；§2.4"位移 + 亮度"实为位移 + 边框色。
9. 死代码：`cueList()` 只有测试在用；`playCue` 的 `opts.gain/detune` 无调用方；`theme.css` 的 `.popup/.ring` 无对应 DOM。
10. 频率上限只管事件侧；场景的帧内爆发不经 `requestBurst()`。
11. Toast 合并语义与文档不符（仅与紧邻上一条同文案同色合并）。

## 六、观察项（可留 v3.0）

`resolveFxLevel('auto')` 每帧/每批调用 `matchMedia`（可缓存）；手写千分位在 `≥1e21`/`NaN` 上退化（当前量级不可达）；`App.vue` 的 `data-fx` 不追踪系统偏好变化（有 `@media` 兜底）；R3 只有 6 个样本；路线图 §六 v2.5 进度行待补。

## 七、逐维结论摘要

- **A 玩家可感知效果**：机制健全（手势前静默、并发 ≤8、cue 与事件一一对应、稀有/普通分层播报）；信息层次方向正确（成功金/失败灰/庇护蓝/深渊紫）。问题：B1（深渊页看不到）+ M1 + M3 + Minor-5/6。
- **B 交互与手感**：进度条 0.1s 剩余时间、按钮按压、Toast 图标/滑入/合并计数/`aria-live` 均落地；无限动作与极短动作表现合理。问题：Minor-7/11。
- **C 设置与无障碍**：`data-fx` 真关 CSS 动效；显式档位优先于系统偏好；对比度手算 5.7:1；键盘全可达。问题：M3/M4/M5 的表述不实。
- **D 数值是否被破坏**：**没有**。`git diff` 显示 `src/game/` 仅新增 `setSettings`（纯设置写入）、fx 载入校验、1 行默认设置与纯类型改动；无收益/概率/时间曲线被动。重算（生成器篡改检测、千分位边界、`sanitizeSettings` 收敛与幂等、`deserializeSave` 行为等价）全部通过。
- **E 代码与证据质量**：§2.6 集成点 16 项中 14 项一致（#1、#11 不符，且漏 `MainPanel.vue`）；E1~E6 真断言；F1~F6/F8 质量好，F7/F9/F10 偏弱。

## 八、处置要求（本版必须清零）

1. **B1**：表现层改为**常驻全局层**（或在无订阅者时丢弃 + 按视图门禁），并让深渊通关表现**在深渊页可见**。
2. **B2**：修生成器（删 `queueAdvance`、默认档 `auto`），重跑 `npm run gen`，并加"同源"回归守卫。
3. M1~M5 与高优先 Minor（1/3/4/6/7/10）建议同版处置。

> **当版放行意见**：Blocker 未清零前不放行。两条 Blocker 的修复量都很小（合计 ≤80 行），处置后本版可回到 8.0 量级。
