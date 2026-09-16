# Forging · 挖矿锻造放置游戏

> 纯前端单机放置游戏：**挖掘 → 熔炼 → 锻造 → 强化 → 传承**。
> Vue 3 + TypeScript，除 `vue` 外零运行时依赖；离线可玩、可安装为 PWA。
> 系统结构参考 Milky Way Idle（研究素材见 `reference/`）。

---

## 快速开始

```bash
npm install      # 安装依赖
npm run dev      # 开发服务器（默认 http://localhost:5173）
npm run build    # 生产构建（vite build → dist/）
npm run preview  # 预览生产构建
npm test         # 全量测试（vitest run）
npm run typecheck
```

内容表与审计（`data/*.json` 由生成器维护，变更需过门禁）：

```bash
npm run gen           # 由 scripts/gen-content.mjs 重建内容表
npm run gen:check     # 校验产物与生成器同源（不改文件）
npm run audit:content # 内容可达性审计（未发现不可达内容）
npm run audit:fx      # 特效/事件覆盖审计（audit:fx:check 为校验模式）
```

---

## 部署到 GitHub Pages

纯前端、无后端，可直接部署为静态站点。仓库**已内置自动部署流程**
（`.github/workflows/deploy.yml`），配置一次后每次推送自动发布。

### 方式一：GitHub Actions（推荐，开箱即用）

1. 把仓库推到 GitHub；
2. 打开 **Settings → Pages**，把 **Source** 设为 **GitHub Actions**（**一次性**，见下）；
3. 推送到 `main`（或 `master`）——工作流会自动：**跑测试（门禁）→ 构建
   （按仓库名自动计算 `VITE_BASE=/<repo>/`）→ 发布**到 `https://<user>.github.io/<repo>/`。

> **为什么必须手动启用一次**：`actions/configure-pages` 的 `enablement: true`（让 Action 自动创建站点）
> 在**组织仓库 / 受限权限**下会被 `GITHUB_TOKEN` 策略拦下，报
> `Resource not accessible by integration`；手动启用后，该步骤只需**读取**站点信息即可通过。
>
> **常见报错对照**：
> - `Get Pages site failed … Not Found` → Pages 尚未启用（做上面的步骤 2）；
> - `Resource not accessible by integration`（create-a-pages-site）→ 同上，或组织把
>   Workflow permissions 限制为只读（请用"手动启用"路径，不要依赖 Action 自动创建）；
> - `Node.js 20 is deprecated` → runner 提示，不影响部署。
>
> 首次部署后站点生效需 1~2 分钟。仓库名为 `<user>.github.io`（用户主页仓库）时，
> 工作流自动改用根路径 base，无需改动。

### 方式二：手动构建 + gh-pages 分支

```bash
# 项目页部署（子路径）：base 必须为 /<repo>/，否则静态资源全部 404
VITE_BASE=/forging/ npm run build                       # macOS / Linux / CI
MSYS_NO_PATHCONV=1 VITE_BASE=/forging/ npm run build    # Windows Git Bash（防 POSIX 路径转换）

npx gh-pages -d dist                                    # 或用你习惯的方式把 dist/ 推到 gh-pages 分支
```

然后在 **Settings → Pages** 选择 `gh-pages` 分支。根路径部署则直接 `npm run build`（默认 base `/`）。

### 为什么需要 base

GitHub Pages 的项目页位于 `https://<user>.github.io/<repo>/` **子路径**下；若 base 仍是默认的 `/`，
产物会引用 `/assets/...`（指向站点根）→ 全部 404。`vite.config.ts` 读取环境变量 `VITE_BASE`，CI 已自动处理。

配套已适配（v3.7.13）：

- `index.html` 的 PWA 资源（manifest / icon / apple-touch-icon）改为**相对路径**引用，两种部署都正确；
- `public/manifest.webmanifest` 的 `start_url` / `scope` / icons 用相对路径（相对清单文件自身解析）；
- Service Worker 注册走 `import.meta.env.BASE_URL`，子路径下同样能注册。

### 其他静态托管

Cloudflare Pages / Vercel / Netlify / 自建 nginx 等都是根路径托管：直接 `npm run build`，
把 `dist/` 作为站点根即可，**无需设置 base**。

---

## 玩法一览

### 核心循环

**挖掘**矿石 → **熔炼**成锭 → **锻造**装备（带随机词缀与完美度）→ **强化**逐级精进 →
中期解锁 **深渊回廊**（战力检验的长线试炼）与 **远征**（离线队伍收益）→
**传承**（120 级解锁）重置技能等级，换永久**精通点**与跨轮回积累。

### 系统

| 系统 | 说明 |
|---|---|
| 四条技能线 | 挖掘 / 熔炼 / 锻造 / 强化（+ 全技能速度、经验、稀有掉落等六维属性） |
| 装备与词缀 | 每件装备自带词缀（工具/武器/护甲/饰品四类池），可锁定重铸、强化至 +10 |
| 符文增益 | 12 种符文 × 双槽，短时增益（离线不计时） |
| 赛季 | 14 天一轮任务 + 声望等级 + 图鉴里程碑（目标按账号档位自适应缩放） |
| 深渊回廊 | 层数不封顶的战力检验（层词条轮换：迅捷/丰饶/试炼/裂隙/富矿） |
| 远征与伙伴 | 三时长档 × 多路线队伍派遣，伙伴稀有度与特质；离线继续 |
| 图鉴 / 成就 | 收集度里程碑（六分区门槛）+ 46+ 成就 |
| 经济 | 金币商店、深渊结晶商店、工匠小箱开箱、定向重铸券 |
| 精通殿堂 | 传承点兑换 6 条精通线（含深造上限 ×2） |

### 放置特性

离线结算（上限 8h + 离线精通加成）、离线回体（24 > 在线 12）、自动回收（按完美度阈值）、
动作队列（可扩容）、无限模式、音效/特效档位与减少动效偏好。

---

## 技术结构

```
src/game   # 纯内核：无 DOM、无 Vue，确定性优先（26 文件 / ~6.1k 行）
src/app    # 壳层：store / 持久化（存档 v15）/ describe（弹窗口径）
src/ui     # 视图：组件 + 主题 tokens（theme.css）+ 画布场景/特效
data/      # 内容表（19 张 JSON；多数由 scripts/gen-content.mjs 生成，levelCurve 手写）
scripts/   # 生成器 + 模拟 + 审计（~3.3k 行）
tests/     # 32 文件 / ~8.2k 行 / 532 用例
docs/      # 设计与评审全量留档（120+ 篇，见下）
reference/ # Milky Way Idle 参考研究（截图与机制速记）
```

**分层约定**：`src/game` 不 import Vue/DOM；UI 只通过 `store` 与 `describe` 触达内核；
数值一律来自 `data/*.json`（界面文案中的数字全部从内容表插值，有守卫测试）。

---

## 工程纪律（本仓库的几条硬规则）

1. **模拟先行**：任何数值/经济变更，先写 `scripts/sim-*.mjs` 出证据、落 JSON，再定档。
2. **证据同源**：文档里的数字 == 脚本输出 == 内容表 == 测试断言（`tests/toolchain.test.ts` 门禁）。
3. **自探针**：新断言必须"篡改实现 → 变红 → 恢复"才算完成（防恒真/空跑断言）。
4. **文案数字守卫**：模板与白名单模块里不得硬编码 `×N / N天 / vN.N / 每N层` 等形态（`tests/copy-numbers.test.ts`）。
5. **存档迁移规则**：`SAVE_VERSION` 逐版纯函数迁移（当前 15）；未来版本拒载；单调字段加载自愈。
6. **UI 打磨清单**：对比度（三方向判定）/ 触屏目标 / 内部溢出 / 导航可达等自查项见 `docs/ui-checklist.md`。

---

## 质量现状

- **测试**：532 用例 / 32 文件全绿（含内核数值、存档迁移、组件可达性、守卫与契约）
- **类型与构建**：`vue-tsc --noEmit` 零错误；`vite build` 成功
- **审计**：内容可达性 / 特效事件覆盖 / 数值倒挂 / 赛季承诺集（脚本 + JSON 产物）
- **Lighthouse**（最近一次，生产构建）：performance 99 · accessibility 100 · best-practices 100 · seo 100
  （报告见 `docs/lighthouse-v3.5.*`）
- **封板依据**：`docs/release-v3.5.md`（未处置清单归零 + 双人终审记录）

---

## 文档导航（docs/）

| 前缀 | 内容 | 入口 |
|---|---|---|
| `design-*` | 各版本设计定稿（范围 / 证据要求 / 验收） | `design-v3.6.md`（当前 UI 线） |
| `review-*` | 各轮独立评审原件与处置记录（含证伪探针） | `review-v3.6.md` |
| `release-*` | 发布与封板文档（已知取舍 / 迁移规则 / 性能口径） | `release-v3.5.md` |
| `review-v3.x` | 版本级测评与清账 | `review-v3.4.md` |
| `smoke-*` | 实机烟测留档 | `smoke-v3.5.md` |
| `ui-checklist.md` | UI/UX 打磨检查清单（人工自查） | — |
| `08-roadmap-v3.md` | 版本进度表 + backlog | — |
| `sim-*-output.json` | 模拟脚本机器可读产物 | — |

> **截图策略**：为控制仓库体积，**截图不入库**（`.gitignore` 已忽略 `docs/*.png` 与 `reference/*.png`；
> 历史截图已清理，文档中的图片引用改为文字说明）。需要留档实机效果时请另存本地或使用外部图床。

---

## 版本

当前 **3.7.16**（v3.5.0 封板后转入 UI/UX 打磨线，版本号逐次跟随迭代：全局视觉升级、移动端交互修复、桌面右栏分区）。
历史版本与门禁记录见 `docs/08-roadmap-v3.md`；下一批候选（v3.5.1 backlog）见其 §五之二。

## 许可与来源

个人项目，未附开源许可。`reference/` 内为 Milky Way Idle 的公开界面研究截图与机制速记，仅作设计参考。
