# Forging v2.5 设计文档 ·「视听与手感」

> 阶段：① 创意 → ② 计划（本文档）→ ③ 评审（独立评审仲裁）→ ④ 开发 → ⑤ 测试（含实机烟测）→ ⑥ 测评
> 上游：docs/08-roadmap-v3.md（v2.5 = 表现层：交互与效果优化）
> 依赖：v2.4 已发布（深渊/存档 v11）；本版存档 **v12**（仅新增设置字段）
> 特殊说明：本版是**表现层**版本，因此"数值证据"换成**可测的表现层证据**：音效覆盖清单、动效触发清单、性能预算实测、无障碍开关矩阵（见 §3）。

## 1. 动机（创意）

v2.1~v2.4 把系统做厚了，但**反馈仍只有文字**：动作完成只有数字跳动与 toast，强化成功/失败、通关、开箱、升级在"感觉"上是同一件事。玩家（尤其放置玩家）在意的三件事本版一次补齐：

1. **听得见的反馈**：锻造有锤声、强化成功有金属鸣响、失败有闷响、开箱有开锁声、深渊通关有回响。
2. **看得见的重量**：敲击火星、强化火花、升级光环、掉落飘字——把"数字变大"变成"画面上发生了事"。
3. **可关、可调、不打扰**：音效与动效都必须能一键关闭/降级，遵守系统的「减少动态效果」偏好，且**零外部资源**（保持"仅依赖 Vue"的承诺）。

一句话：**前面几个版本回答"能做什么"，本版回答"做起来手感如何"。**

## 2. 系统设计（计划）

### 2.1 程序化音效引擎（`src/ui/audio.ts`，零资源）

- 技术：**WebAudio 振荡器 + 增益包络 + 噪声缓冲**，不引入任何音频文件（体积零增长）。
- 自动播放策略（**硬规则**）：AudioContext **不在模块加载时创建**；首次真实用户手势（pointerdown/keydown）后创建并 `resume()`；在此之前所有播放请求静默丢弃（不报错、不排队）。
- 同时发声上限 **8 个节点**；超限丢弃新的（防止快速连点造成爆音与 CPU 尖峰）。
- 音效清单（**覆盖全部关键事件**，共 16 条；映射表见 §2.4）：

| 分组 | 音效 | 音色设计 |
|---|---|---|
| 动作 | `actionStart` / `actionComplete` / `queueAdvance` | 短促木质敲击（三角波 + 快衰减） |
| 成长 | `levelUp` / `prestige` / `seasonLevel` | 上行三音琶音（正弦 + 长衰减） |
| 锻造 | `enhanceSuccess` / `enhanceFail` / `enhanceGuarded` | 金属鸣响（方波 + 高频泛音）/ 闷响（低通噪声）/ 盾鸣 |
| 收获 | `crateOpen` / `rareDrop` / `lootBig` | 开锁咔哒 → 上行音 / 清脆铃音 |
| 系统 | `taskComplete` / `achievement` / `abyssClear` / `purchase` / `blocked` | 各自的短动机（成就为三音上行、阻塞为下行二音） |

### 2.2 场景动效（`SceneCanvas` 扩展 + 飘字层）

- **粒子系统**：敲击火星（动作完成时按技能着色）、强化火花（成功金色/失败灰色/庇护蓝色）、深渊通关回响（紫色扩散环）。
- **飘字**：`+N 矿石`、`+XP`、`+N 金` 在场景区向上飘散并淡出（最多同屏 6 条）。
- **升级光环**：技能升级时角色周围一圈扩散光环。
- 性能预算（硬性，见 §3 实测）：同屏粒子 ≤ **120**、飘字 ≤ **6**、每帧 CPU 预算 ≤ **1.5ms**（1440px 桌面）、主循环（250ms tick）额外耗时 ≤ **0.5ms**。
- 降级：`fx = reduced` 时只保留飘字与光环、关闭粒子；`fx = off` 时完全不绘制（并停止 rAF 内的表现层计算）。

### 2.3 手感与信息层级（交互）

- 按钮按下反馈（`:active` 位移 + 亮度），禁用态保持 v2.0 建立的对比度标准。
- 面板切换 120ms 淡入（`prefers-reduced-motion` 时取消）。
- 动作卡：剩余时间以细进度条 + 数字并列（不再只靠进度条）。
- Toast 增加类型图标与轻微滑入；同类型 2 秒内合并计数（避免刷屏）。

### 2.4 事件 → 表现映射（**单一映射表**，可审计）

`src/ui/fx-map.ts` 导出 `FX_MAP: Record<GameEvent['type'], { sound?: string; fx?: 'spark'|'ring'|'popup' }>`，由 `store.handleEvents` 统一消费。**要求：`GameEvent` 的每个成员都必须出现在表里**（未映射到声音的必须显式标注 `sound: undefined`），由 `scripts/audit-fx.mjs` + 测试守护——防止"加了新事件但没接表现"。

### 2.5 设置与无障碍

- 新增设置项（持久化到 `meta.settings`）：
  - `sound: boolean`（默认 **true**，但受自动播放策略约束：首次手势前无声）
  - `volume: number`（0~100，默认 60）
  - `fx: 'full' | 'reduced' | 'off'`（默认 `full`；检测到 `prefers-reduced-motion: reduce` 时默认 `reduced`）
- 移动端：遵守静音开关（WebAudio 在 iOS 静音档下无声是平台行为，文档如实说明，不伪造"绕过静音"）。
- 无障碍：动效关闭为**一等功能**（不是隐藏设置）；设置项均可键盘操作。

### 2.6 集成点（完整清单）

| # | 位置 | 改动 |
|---|---|---|
| 1 | `src/ui/audio.ts`（新） | WebAudio 引擎：`initAudio()`（手势后创建/resume）、`playCue(name, opts)`、`setVolume/setEnabled`、并发上限；导出 `__resetAudioForTest()` |
| 2 | `src/ui/fx-map.ts`（新） | `FX_MAP`（事件类型 → 音效/动效），**穷举 GameEvent** |
| 3 | `src/ui/components/SceneCanvas.vue` | 粒子系统（火星/火花/回响环）+ 飘字层 + `fx` 降级 + 预算上限 |
| 4 | `src/app/store.ts` | `handleEvents` 接 `FX_MAP`（音效 + 动效触发）；首次手势初始化音频；`meta.settings` 读写 |
| 5 | `src/ui/components/SettingsPanel.vue` | 音效开关 / 音量滑杆 / 动效强度三选（+ 试听按钮） |
| 6 | `src/ui/components/ActionGrid.vue` / `ProgressBar.vue` | 剩余时间数字与进度并列（手感） |
| 7 | `src/ui/components/Toasts.vue` | 图标 + 滑入 + 同类合并计数 |
| 8 | `src/ui/styles/theme.css` | `@media (prefers-reduced-motion: reduce)` 全局降级；按钮 `:active` 反馈 |
| 9 | `src/game/types.ts` | `GameState.meta.settings: { sound: boolean; volume: number; fx: FxLevel }` |
| 10 | `src/app/persist.ts` | `SAVE_VERSION 11→12` + 迁移默认值 + `ensureFields` |
| 11 | `src/game/state.ts` | `newGame` 补 `meta.settings` |
| 12 | `scripts/audit-fx.mjs`（新） | 输出：音效清单与覆盖、事件→表现映射完整性、动效预算常量、设置矩阵（**本版的"证据脚本"**） |
| 13 | `tests/fx.test.ts`（新） | FX_MAP 穷举、音量/开关边界、降级解析、设置迁移、假 AudioContext 下的并发上限 |
| 14 | `src/ui/components/NavBar.vue` / `TopBar.vue` | 音量快捷开关（可选，键盘可达） |

### 2.7 存档

- `SAVE_VERSION` 11 → **12**：补 `meta.settings = { sound: true, volume: 60, fx: 'full' }`；`ensureFields` 幂等补齐；旧档升级后默认开启音效（受手势策略约束）。

## 3. 证据（本版为表现层：以可测清单 + 实测性能替代数值模拟）

`scripts/audit-fx.mjs` 输出：

| # | 证据项 | 判定标准 |
|---|---|---|
| E1 | 音效清单 | ≥16 条，且每条都有音色参数（波形/频率/时长/包络） |
| E2 | 事件→表现覆盖 | `GameEvent` 全部成员出现在 `FX_MAP`（未配声音的显式声明） |
| E3 | 动效预算常量 | 粒子 ≤120 / 飘字 ≤6 / 单帧 ≤1.5ms（脚本读取常量并断言） |
| E4 | 设置矩阵 | `(sound × volume × fx)` 的关键组合行为表（含 off/0 音量=完全静默） |
| E5 | 无障碍 | `prefers-reduced-motion` 默认降级路径存在；关闭动效不损失信息（信息仍在文本/toast） |
| E6 | 零资源 | `public/` 与 `dist/` 中不新增音频/图片资产（脚本检查扩展名） |

**实机烟测**（真机浏览器，本版必做）：
1. 首次加载**无声音**（未手势）→ 点击后 `AudioContext` 处于 running（用 `page.evaluate` 读 `window.__forging` 暴露的音频状态）。
2. 触发一次动作完成 → 粒子/飘字出现（读取场景层对象计数）。
3. 设置里关闭动效 → 粒子数归零；音量 0 → 播放调用被短路。
4. 重载后设置**保持**（存档 v12）。
5. 用 `PerformanceObserver`/`requestAnimationFrame` 采样 3 秒帧间隔，报告 P95 帧时（目标 ≤20ms）。

## 4. 测试计划（`tests/fx.test.ts`）

| # | 用例 |
|---|---|
| F1 | `FX_MAP` 穷举：遍历 `GameEvent['type']` 联合的每种事件，断言表中有条目（用真实事件样本数组穷举） |
| F2 | 音效定义完整性：每条有波形/频率/时长；名称唯一 |
| F3 | 并发上限：假 AudioContext 下连发 20 次 → 活跃节点 ≤8 |
| F4 | 自动播放策略：未初始化时 `playCue` 静默返回 false；初始化后返回 true |
| F5 | 音量与开关：`volume=0` 或 `sound=false` → 不创建节点 |
| F6 | 降级解析：`fx='off'` 时动效请求被拒；`reduced` 只放行飘字/光环 |
| F7 | 设置迁移：11→12 补默认值；往返幂等；`fx` 非法值回落 `full` |
| F8 | 事件→表现：`levelUp` 触发音效 + 光环；`blocked` 触发音效且**不**触发粒子（负例） |
| F9 | 信息不丢失：动效关闭时仍产生 toast（无障碍承诺） |
| F10 | 预算常量与 `audit-fx.mjs` 输出一致（机器校验） |

## 5. 风险与对策

| 风险 | 对策 / 现状 |
|---|---|
| 自动播放被浏览器拦截 | 首次手势后才创建/resume；未手势时静默丢弃（E/烟测 1） |
| 音效造成 CPU 尖峰/爆音 | 同时节点 ≤8、超限丢弃、短包络（F3） |
| 粒子拖慢主循环 | 预算常量 + 降级档 + 烟测帧时 P95 目标 |
| 无障碍/前庭敏感 | `prefers-reduced-motion` 默认降级 + 动效一等开关 + 关闭不丢信息（F9） |
| iOS 静音档无声 | 平台行为，文档如实说明（不伪造绕过） |
| 零资源承诺被破坏 | audit 脚本检查无新增音频/图片资产（E6） |
| 新事件忘接表现 | `FX_MAP` 穷举 + 测试守护（F1） |
| 存档体积 | 仅 3 个字段（< 60B） |

## 6. 验收标准（Definition of Done）

- [ ] 16+ 条程序化音效；零外部资源（E6 脚本断言）
- [ ] `FX_MAP` 覆盖全部 `GameEvent`（F1 穷举守护）
- [ ] 粒子/飘字/光环三类动效，三档强度可切；关闭后信息不丢失（F9）
- [ ] 设置三项持久化（存档 v12）+ 迁移无损
- [ ] 烟测 5 项全过（含 P95 帧时报告）
- [ ] 测试全绿（≥265）/ typecheck / build（体积增幅记录）

## 7. 范围外（记入 backlog）

- 背景音乐（BGM）→ 需要更长的程序化作曲，v3.0 视时间决定
- 音效主题包/皮肤 → 无外部资源前提下不做
- 触觉反馈（Vibration API）→ 移动端兼容性差，不做

## 8. 评审记录

待 ③ 评审后回填（docs/review-v2.5-plan.md）。
