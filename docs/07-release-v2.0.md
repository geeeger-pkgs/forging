# Forging v2.0 发布文档（正式版）

> 发布状态：**v2.0 正式版** ｜ 发布门禁全绿（106 测试 / typecheck / build / Lighthouse 100×4）
> 类型：纯前端单机放置游戏（Idle / Incremental）｜ 依赖：仅 Vue 3（无后端、无账号、无网络通信）

## 一、玩法总览

**核心循环**：开采 → 熔炼 → 锻造 → 强化 → 传承（转生）

| 系统 | 内容 |
|---|---|
| 技能 | 挖掘 / 熔炼 / 锻造 / 强化，各 100 级（闭式经验曲线，7 段倍率） |
| 矿场 | 7 档矿脉 + 煤矿场（Lv1~80 解锁），稀有掉落（精华/工匠小箱） |
| 配方 | 92 条：熔炼 7 + 工具 21 + 武器 14 + 护甲 28 + 饰品 10 + 符文 12 |
| 装备 | 10 槽位（镐/坩埚/锤/主手/头/身/腿/脚/项链/戒指），强化 +1~+10（成功率递降、+5 起可降级），同档套装加成（5 件 +4% 全速 / 8 件再 +4% 效率） |
| 符文 | 12 种（速度/效率/稀有/强化率 ×3 阶），双增益槽、同符叠加时长（上限 60 分钟）、离线排除 |
| 传承 | 总等级 ≥120 解锁；精通点 = ⌊总等级÷10⌋ + 每满级技能 +1；6 条精通线，支持**深造**（上限 ×2、深造价 ×2） |
| 任务 | 8 类日常 ×3 难度 + 周常，按日期前向轮换（防"攒任务"） |
| 成就 | 52 项，自动授予与发奖 |
| 自动化 | 自动回收（白名单保留量）、动作预设（一键重放 + 应用前预检） |
| 离线 | 默认 8 小时（精通最高 24 小时），离线结算排除临时符文增益 |
| 平台 | 桌面 + 移动响应式（≤900px）、PWA 可安装、首访后离线可开 |

## 二、运行与构建

```bash
npm install        # 安装依赖（仅 Vue 3 + 工具链）
npm run dev        # 开发服务器（默认 http://localhost:5173）
npm run build      # 生产构建（输出 dist/，约 204KB JS / 59.9KB gzip + 16.8KB CSS）
npm run preview    # 本地预览生产构建（http://localhost:4173）
npm run typecheck  # vue-tsc 类型检查
npm test           # Vitest 全量测试（106 项 / 13 文件）
npm run gen        # 重新生成 data/*.json（内容生成器）
```

### 部署

- **任意静态托管**（Nginx / Caddy / GitHub Pages / Netlify / Vercel / 对象存储）：上传 `dist/` 即可，无需服务端。
- **PWA 前提**：HTTPS（或 localhost）。首次访问后 Service Worker 预缓存外壳与入口资源 → 断网可开。
- **缓存更新**：构建版本号自动注入 SW 注册 URL（`/sw.js?v=<version>+<buildId>`），新版本激活后自动清理旧缓存，无需手动操作。

## 三、存档

- 位置：浏览器 `localStorage`（键 `forging.save.v1` 体系，双槽备份 + 损坏回退）。
- 版本：`SAVE_VERSION = 7`，内置 **1→7 链式迁移**（旧档无损升级）；拒绝加载未来版本存档。
- 导出/导入：设置页支持 JSON 导出与导入（导入前确认覆盖）。
- 兼容承诺：v2.x 内不破坏存档结构；新增字段一律走迁移链。

## 四、质量指标（发布门禁）

| 指标 | 结果 |
|---|---|
| 测试 | 106 项 / 13 文件全绿（含迁移回归、离线结算、自动化、预检） |
| 类型 | `vue-tsc --noEmit` 零错误（TypeScript 5.9.3 钉版） |
| 构建 | Vite 8 生产构建成功；JS 204.14KB（gzip 59.85KB）、CSS 16.79KB（gzip 3.44KB） |
| Lighthouse（桌面快照） | **Accessibility 100 / Best Practices 100 / SEO 100 / Agentic Browsing 100**（21 项全过，docs/lighthouse-v2.0.html） |
| 性能（生产构建） | LCP 174ms（TTFB 4ms）/ CLS 0.00 |
| 离线 | 首访后断网重载完整可用（里程碑实测） |
| 依赖 | 运行时仅 `vue`；devDeps 5 个（vite / plugin-vue / typescript / vue-tsc / vitest） |

## 五、项目结构

```
src/
  app/           壳层：store（主循环 250ms）、persist（存档+迁移）、进销存
  game/          内核（纯函数域）：settle / commands / rules / stats / buffs /
                 prestige / online离线 / tasks / achievements / crates / ...
  ui/            Vue 组件：MainPanel / RightPanel / NavBar / TopBar /
                 ActionDialog / 各面板 / SceneCanvas / Toasts ...
data/            12 张内容表（items/recipes/ores/levelCurve/runes/perks/tasks/achievements/...）
scripts/         gen-content.mjs（内容生成）+ sim-*.mjs（数值模拟/审计）
tests/           13 个测试文件（106 用例）
docs/            设计与评审档案（00~06、review-v1.3~v2.0、发布文档）
public/          PWA 资产（manifest / sw.js / icon.svg / apple-touch-icon.png / robots.txt / llms.txt）
```

## 六、数值基线（审计与模拟结论，详见 docs/review-v1.9.md / review-v2.0.md）

- 满配速度上限 +285%（×3.85 产出），永不触及 250ms 动作下限（触底阈值 963ms，最速动作 6000ms）。
- 开采产金 2,812 → 74,845 金/时（7 档逐级 +70%~240%）。
- T6/T7 镐边际回收期 3.2h / 5.7h；精炼/锻造为设计性价值消耗（装备为目标，非卖金手段）。
- 符文制造成本恒高于回收价（无套利）；精通点深造后总消耗 156 点（≈3.5 次满级传承）。
- 进度时间线（链路受限，保守上界）：三技能同步 Lv30 ≈134h、Lv50 ≈946h（首传总等级 120 在 Lv30 阶段达成）。

## 七、已知边界与后续方向（非阻塞）

- 符文增益在离线期间不生效、时长照常流逝（v1.4 定案的设计取舍）。
- 真机 iOS 仅做了模拟器级验证（安全区/图标已就位），建议在真实设备复核一次安装体验。
- 后续内容方向（未纳入 v2.0）：新技能线（如采集/炼药）、装备词缀、赛季任务、音效与动效强化。
