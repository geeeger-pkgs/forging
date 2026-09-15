# Forging v2.5 实机烟测报告 ·「视听与手感」

> 阶段：⑤ 测试（实机烟测）。设计：`docs/design-v2.5.md` §3.2（R1~R6）。
> 环境：Chrome（ZCode IAB，1440×1000），`npm run dev`（localhost:5174），DEV 构建（`window.__fx` 探针可用）。

## 0. 结论

**R1~R6 全过**，但过程**发现 4 个真实缺陷并当场修复**（详见 §2）——
其中 2 个是"文档承诺了但实现没做到"（自动播放门槛被破坏、off 档仍冒粒子），
1 个是"读数落点造假"（场景存活数从未上报），1 个是"设置未同步到引擎"（关掉音效后重载还会响）。
这类问题单元测试测不出来（它们只在"真实浏览器 + 真实手势 + 真实 rAF"下暴露），正是本轮烟测的价值。

## 1. 结果（按设计 §3.2 的判定标准）

| # | 测什么 | 实测 | 目标 | 判定 |
|---|---|---|---|---|
| R1 | 自动播放门槛 | 加载后 `ready=false, ctxState=null` → 首次点击后 `ready=true, ctxState=running` | 严格 | ✅ |
| R2 | 表现层帧内耗时（draw） | p50 0.10ms / p95 0.20ms / max 0.30ms（180 样本，仅可见时采样） | ≤ 1.5ms | ✅ |
| R3 | 主循环表现开销（tick + audio） | **同步段** p50 0.20 / p95 0.40 / max 0.40ms（6 样本）＋ **音效调度** p50 0.00 / p95 0.10 / max 0.10ms（6 样本）→ **合计 p95 0.50ms**（p50 合计 0.20ms） | ≤ 0.5ms | ✅（压线） |
| R4a | `fx=off` | `data-fx=off`；peak 粒子 **0**、peak 飘字 **0**、burst **0**；画布仍在绘制（场景本体）；音效不受影响（解耦后） | 严格 | ✅ |
| R4b | `fx=reduced` | `data-fx=reduced`；peak 粒子 **0**、peak 飘字 **3**、cue **5**（信息不丢） | 严格 | ✅ |
| R5 | 设置持久化 | `{sound:false,volume:40,fx:full}` → 重载后状态、`localStorage`、`data-fx` 三者一致；引擎 `enabled=false` | 严格 | ✅ |
| R6 | **跨视图可见（测评 B1 复核）** | 在**商店页**挂机：`peakParticles=260 / peakPopups=6 / bursts=3 / sceneDropped=0`，页面只有 1 个画布（＝全局表现层） | 严格 | ✅ |

补充实测（full 档）：`peakParticles=52 / peakPopups=2 / bursts=2 / cues=2`，一轮动作完成时确实出现粒子爆发与飘字（见截图）。

> **R3 口径说明（测评 M2）**：测评指出原口径只包住 `dispatchFx` 的同步段，而音效建图在微任务里发生（读数偏乐观）。
> 处置后改为**两部分分别计量**：`tick`（同步：映射 + 入队 + 取声部）与 `audio`（playCue 微任务内的参数调度），
> 二者相加才是表现层的逐批开销。同时用**声部池**把分配成本挪到解锁时（池化后每批 audio 仅 0~0.1ms）。
> 判定用两者之和。**如实记录**：两轮实测的合计 p95 分别为 0.40ms 与 **0.50ms**（后者正好等于预算上限，样本各 6 条），
> 即"p95 零余量、p50 余量约 0.3ms"。预算未放宽；把"再往上加表现层逐事件开销就会越线"记为 **v3.0 观察项**（见 design §7）。

### 截图证据

| 文件 | 内容 |
|---|---|
| `docs/smoke-v2.5-full-fx.png` | full 档：挖矿完成瞬间的粒子爆发、`+5 XP` / `+3 铜矿石` 飘字（错行）、顶部进度条内置剩余时间 `5.3s` |
| `docs/smoke-v2.5-settings.png` | 设置页「视听与手感」：音效开关（已就绪）/ 音量滑杆 60 / 特效四档 / 关于显示 v2.5 |

## 2. 发现的缺陷与修复（全部当版修复并回归）

> **补充（测评后）**：D1~D7 是烟测自查发现的；随后**资深玩家测评**（`docs/review-v2.5.md`，6.0/10 不通过）
> 又抓出 **B1/B2 两条 Blocker 与 M1~M5**，处置见 `docs/design-v2.5.md` §9。
> 本报告的 D8~D14 是那轮处置带来的实现变更（含一处**本报告此前的声明不实**，已更正）。

| # | 缺陷 | 证据 | 修复 |
|---|---|---|---|
| **D8** | `docs/smoke-v2.5.md` §4 曾写"探针只在 DEV 构建挂载"——实际 `installFxProbe()` 无 DEV 守卫，`dist` 里能 grep 到 `window.__fx` | 测评 M4（`grep __fx dist/assets/*.js` 命中） | 守卫补齐（`import.meta.env.DEV`），本报告声明同步更正 |
| **D9** | 表现指令在画布未挂载时排队，切回技能页"迟到重放"；深渊通关表现在深渊页完全不可见 | 测评 B1 | 新增常驻全局表现层 `FxLayer.vue`；总线无订阅者即丢弃（`sceneDropped()`） |
| **D10** | `data/fx.json` 与生成器不同源（跑 `npm run gen` 会回滚 `auto` 默认档、复活无来源 cue） | 测评 B2（临时目录重跑 + diff） | 修生成器 + `--check` 模式 + audit **E7** + toolchain 回归用例 |
| **D11** | 音效后台照响、无冷却、无快捷静音 | 测评 M1 | `document.hidden` 短路 + 120ms per-cue 冷却 + 导航栏快捷静音 |
| **D12** | `tickMs` 口径不含建图成本（读数偏乐观） | 测评 M2 | `recordTick` 移到批次末尾微任务（含建图），探针输出 p50/p95/max |
| **D13** | `off` 档连带静音音效、试听仍响、文案自相矛盾 | 测评 M3 | 音效与特效解耦；文案改写；off 档清空存量并停绘覆盖层 |
| **D14** | `§2.4` 面板淡入未实现；飘字槽位溢出画布；滑杆写放大；频率上限只覆盖事件侧 | 测评 M5 / Minor-6/7/10 | 实现 120ms 淡入；槽位夹到 4；滑杆改 `@change`；场景爆发走 `requestBurst()` |
| **D15** | 表现层改全局后，粒子与飘字落在**动作卡网格上**（盖住按钮文字） | 实机截图自检（本轮） | 锚点改为：有场景舞台（`canvas.scene`）时落回舞台内，其它页面退回主内容区上部；且在**事件到达时**读一次 rect（不每帧强制布局） |

| # | 缺陷 | 证据 | 修复 |
|---|---|---|---|
| **D1** | **tick 预算被顶穿**：`dispatchFx` 内部同步构造 WebAudio 图（首个事件批实测 12.2ms，稳定后 1.7ms） | 烟测第一版：`tick.p95=12.2ms / budget 0.5ms` | ①`playCue` 改为**同步判定 + 微任务建图**；②噪声缓冲改为**解锁时预热**；③映射里的 `toLocaleString` 换成纯字符串分组（ICU 调用最贵）→ p95 0.30ms |
| **D2** | **自动播放门槛被破坏**：`playCue` 会 `ensureContext()`，导致 boot 首批事件就创建 AudioContext（违反"只出手势创建"的自定规则） | 烟测：boot 首帧 tick 12.2ms（构造音频上下文）；`ctxState` 在手势前就可能非 null | `playCue` 只读已存在的上下文，创建权收归 `unlockAudio()`；新增回归用例（F5 之后） |
| **D3** | **存活读数造假**：`setLiveCounts` 只被 store 以 `(0,0)` 调用，SceneCanvas 从未上报 → `particles/popups` 恒为 0，"降级验证"无法判定 | 首轮 full 档实测 `bursts=6, cues=6` 但 `peakParticles=0` | SceneCanvas 每帧上报真实存活数；探针新增**峰值**统计（瞬时值可能刚好为 0）；store 侧删掉写 0 的假上报 |
| **D4** | **off 档仍冒粒子**：动作完成爆发与浮尘未判档位 | 修 D3 后 off 档实测 `peakParticles=16`（应 0） | 爆发与浮尘统一 `fxLevel === 'full'` 门禁 |
| **D5** | **设置未同步到音频引擎**：引擎默认 `sound=true/volume=0.6`，boot 不读存档设置 → 关掉音效后重载仍会发声 | R5 首测：设置 volume 40 而 `audio.volume=0.6`；设置 sound=false 而 `audio.enabled=true` | `boot()` 载入后 `setAudioEnabled/setAudioVolume` 同步存档值 |
| **D6** | 组件内重复实现 `resolveFxLevel`（双真值，会漂移） | 代码审查自检：`SceneCanvas.vue` 自带一份拷贝 | 删拷贝，统一从纯模块 `ui/fx-map.ts` 导入 |
| **D7** | 同帧多条飘字重叠糊字 | 首张截图：`+2 铜矿石` 与另一条叠在一起 | 按入队条数纵向错行 17px |

> 附带说明：D1 的"预算"没有放宽 —— 目标仍是 **tick ≤ 0.5ms / draw ≤ 1.5ms**，改的是**实现**（把重活挪出结算路径），
> 常数保持与设计文档一致。

## 3. 复现步骤（可重跑）

```bash
npm run dev                 # 端口 5174（5173 被占用时自动顺延）
# 浏览器打开 → 控制台/自动化读取：
#   window.__fx.audio()      → { ready, ctxState, active, volume, enabled }
#   window.__fx.snapshot()   → { draw:{p50,p95,max,samples,budget}, tick:{...}, particles, popups, peakParticles, peakPopups, bursts, cues, lastCue, visible }
#   window.__fx.reset()      → 清窗口与峰值（用于"改档位 → 重置 → 观察"的前后对比）
```

烟测序列：①重载后读 `audio()`（期望 ready=false）→ ②真实点击任意按钮（手势）→ 再读（期望 true）
→ ③开始挖矿并 `reset()`，等 20~45s 读 `snapshot()`（R2/R3 + 峰值）
→ ④设置里切 `off`/`reduced` 并各跑一轮读峰值（R4）
→ ⑤改设置后重载（R5）。

## 4. 遗留与边界（如实记录）

- **iOS 静音档无声**：平台行为（WebAudio 受静音开关影响），不做绕过；设置页已如实说明。
- 后台标签页 rAF 暂停 → draw/tick 采样自动停止（设计如此：仅可见时采样），因此**不采信**帧间隔类指标。
- 探针只在 DEV 构建挂载 `window.__fx`（**此声明在首轮烟测时并不成立**，测评 M4 抓出并在处置中修复：
  `installFxProbe/attachAudioStatus` 现在包在 `import.meta.env.DEV` 内；`grep __fx dist/assets/*.js` 应为空）。
- 音效在移动端首次手势前**完全静默**（不排队、不补播），与设计 §2.1 一致。
