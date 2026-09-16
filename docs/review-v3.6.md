# Forging v3.6 双人评审记录（评审原件要点）

> 归档（主会话按评审员原文整理，仅排版）。评审对象：ac63cdd（v3.6 实施）。
> A = UI 可访问性 / 证据证伪视角；B = 移动端玩家体验视角。两人独立执行、互不可见。

## 评审员 A（可访问性 / 证伪）

**结论：需修**（1 Major + 7 Minor/Nit，无 Blocker）。

- **M1（Major）**：`MainPanel.vue` 的 `.tab.active { background: var(--c-accent-2); color: #fff }`
  —— 白字对比度 3.71（旧）→ **3.24**（本轮提亮后恶化），13px 正文不达 AA；
  且新增的 `ui-contrast.test.ts` 只断言"token 对 panel-2"一个方向，锁不住"token 当背景"。
- **对比度矩阵（自算，18 组）**：6 个前景 token × 3 个背景全部 ≥4.5（最差 panel-2）；
  旧值 #4f7cff/#e2544a 确实不达标（4.34/4.30）——修复依据成立，新值 4.97/5.16 精确吻合。
- m1：TopBar `.ms` 窄屏被降到 11px（阅读文本，同屏别处是 12px）→ 漏改。
- m2：硬编码色残留（ActionGrid `#868b9e` 4.76 勉强、AbyssPanel 边框 `#7f9bff`、Expedition RARITY_COLOR）——达标但脱离 token。
- m3：**断言可被注释骗过**（把声明写进 `/* */` 仍绿）；m4：**F3 规则移出媒体查询仍绿**（作用域未断言）。
- m5：滑杆 36px 与文档"≥40px"/项目 `.btn` 40px 标准不一致。
- m6：其他输入控件（.search 29px / .sel 25px / .num-input 24px / .num）未纳入。
- m7：`touch-action: manipulation` 会禁用双击缩放，文档未列该无障碍取舍（保留捏合缩放，合规）。
- **探针**：4 项真篡改全部必红；2 项"伪造式篡改"（注释化/移出媒体查询）仍绿 → 断言弱点（已修）。

## 评审员 B（移动端玩家体验）

**结论：可以放行**（无阻塞项），但两条声明需订正 + 1 项需实测确认。

- **M1（Major）**：**窄屏导航不可达**——NavBar 在滚动容器内，成就页 82 卡在 375px ≈ 6,800~9,000px；
  滚到底后导航完全不可见，且内层滚动容器让 iOS 点状态栏回顶失效（技能/更多/静音/教程领奖徽标全在顶部）。
- **M2（Major）**：右栏 `.slot-item` 可点体 ~20px（手机换装/看词缀/卸下的主路径，未进审计清单）。
- **M3（Major）**：主区非 `.btn` 控件漏兜底：`.tab`≈26px、`.search`≈29px、`.sel`≈23px、`.num`≈26px、`.num-input`≈22px。
- **M4（Major）**：iOS 对 <16px 输入聚焦即放大——F3 只到 14px，"恰好差 2px 没解决"。
- **M5（Major）**：对比度盲区：`.tab.active` 3.24；`opacity` 合成面（成就 0.5 → 2.26；深渊/远征 0.75 → 3.42/3.57）——
  审计读 computed color 看不穿 opacity，所以"违规 0"口径过宽。
- **M6（Major/待实测）**：设置页 select 固有宽度（长 option）≈344px > 可用 ≈247px，本批 +25px 恶化；
  内层滚动容器的溢出 documentElement 级审计查不到。**给出一行复现命令**。
- m1 长文本无换行兜底（CodexPanel .thead 已见折行）｜m2 无 overscroll-behavior（Android pull-to-refresh 误触）｜
  m3 iOS 工具栏下 `vh` 是"大视口"（弹窗吸底按钮可能被盖）｜m4 无回顶入口（与 M1 同源）｜
  m5 自定义控件无 `:active`、`.cell:hover` 在触屏残留｜m6 残留 11px 阅读文本（`.ms`）。
- 评估：F1/F2 数值真实（色相变化 <1°，语义色不互串）；F5 在涉及界面上无换行/溢出增量；F3 只让设置页多滚 ~4%。

## 主会话处置（v3.6.1）

实机证实 M1/M3/M6 三条（nav top=-8132px、.body 溢出 75px、.tab 27px）后全部修复；
M2/M4/M5 按评审建议修复；m1~m6 部分修复、部分登记 v3.6.2。详见 `docs/design-v3.6.md` §5。
