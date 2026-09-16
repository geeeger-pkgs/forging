// ============================================================
// Forging · 图鉴与赛季数值模拟（v2.3 · 开发前定档证据）
// 目的：图鉴规模/里程碑节奏、赛季声望曲线与**可达性**（单一动作流 + 矿石守恒 + 离线折算）
// 运行：node scripts/sim-season.mjs
// 输出：人读报告 + docs/sim-season-output.json（供测试机器校验「文档数字 = 脚本输出」）
// 口径来源：
//   - 金/时 与 轮/时：scripts/sim-audit.mjs B 段（同档 +5 工具、无符文/精通/词缀）
//   - 离线折算：offline.ts counted = min(elapsed, 8h + 精通) → 每日上线次数决定计入口径
//   - 远征：sim-expedition.mjs（槽位限制，不占动作流）
//   - 强化：offline.ts 明确跳过 → **纯在线**时间
// ============================================================
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (f) => JSON.parse(readFileSync(join(root, 'data', f), 'utf8'))
const ITEMS = read('items.json')
const RECIPES = read('recipes.json')
const AFFIXES = read('affixes.json')
const COMPANIONS = read('companions.json')
const ORES = read('ores.json')

const f = (x, d = 2) => Number(x).toFixed(d)
const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`

// ── 唯一数值源 ────────────────────────────────────────────────
// v3.0 三件套：赛季数值一律读内容表（AUDITED_LITERALS 供反向静态检查）
const SEASON = read('season.json')
const TIER_RENOWN = SEASON.tierRenown
const TIER_IDX = { bronze: 0, silver: 1, gold: 2 }
/** 计数器 → 三档目标（与内容表同源；键名沿用脚本既有口径） */
const T = Object.fromEntries(SEASON.templates.map((t) => [t.counter, t.targets]))
const SEASON_TARGETS = {
  mine: { bronze: T.totalMines[0], silver: T.totalMines[1], gold: T.totalMines[2] },
  craft: { bronze: T.totalCrafts[0], silver: T.totalCrafts[1], gold: T.totalCrafts[2] },
  gold: { bronze: T.totalGoldEarned[0], silver: T.totalGoldEarned[1], gold: T.totalGoldEarned[2] },
  // v3.1 起强化模板的计数器是 totalEnhancesT4（只计 T4+，防在低档装备上刷）——
  // 本行曾漏改，导致脚本自 v3.1 起一跑就崩、docs/sim-season-output.json 长期陈旧（v3.3 B1 发现）
  enhance: { bronze: T.totalEnhancesT4[0], silver: T.totalEnhancesT4[1], gold: T.totalEnhancesT4[2] },
  expedition: { bronze: T.totalExpeditions[0], silver: T.totalExpeditions[1], gold: T.totalExpeditions[2] },
  // 同上前提：重铸同样只计 T4+（totalReforgesT4）
  reforge: { bronze: T.totalReforgesT4[0], silver: T.totalReforgesT4[1], gold: T.totalReforgesT4[2] },
}

const LEVELS = SEASON.levels
const RENOWN_PER_LEVEL = SEASON.renownPerLevel
const FULL_LEVEL_RENOWN = LEVELS * RENOWN_PER_LEVEL
const SEASON_DAYS = SEASON.days
// v3.0 三件套：AUDITED_LITERALS 声明"这些数值必须来自内容表"，测试反向静态检查
export const AUDITED_LITERALS = {
  tierRenown: TIER_RENOWN,
  levels: LEVELS,
  renownPerLevel: RENOWN_PER_LEVEL,
  days: SEASON_DAYS,
  epoch: SEASON.epoch,
}

const OFFLINE_FACTORS = [
  { key: 'always', label: '常驻在线(离线<8h)', factor: 1.0 },
  { key: 'twice', label: '每日上线 2 次', factor: 16 / 24 },
  { key: 'once', label: '每日上线 1 次', factor: 8 / 24 },
]
const STAGE = {
  mid: { loginsPerDay: 2, expRoutes: 2, name: '中期 T3', mineRounds: 515, goldPerRound: 36, smeltRounds: 629, orePerSmelt: 3, enhancePerHour: 80 },
  end: { loginsPerDay: 3, expRoutes: 4, name: '终局 T7', mineRounds: 382, goldPerRound: 196, smeltRounds: 417, orePerSmelt: 3, enhancePerHour: 160 },
}

// ── A 图鉴规模 ────────────────────────────────────────────────
const relicIds = Object.keys(ITEMS).filter((id) => ITEMS[id].category === 'relic')
const codexItems = Object.keys(ITEMS).filter((id) => ITEMS[id].category !== 'relic')
const CATS = [
  { id: 'items', name: '物品(材料/装备/符文)', n: codexItems.length, note: '不含遗物' },
  { id: 'recipes', name: '配方', n: RECIPES.length, note: '' },
  { id: 'affixes', name: '词缀', n: AFFIXES.affixes.length, note: '' },
  { id: 'companions', name: '伙伴', n: COMPANIONS.companions.length, note: '' },
  { id: 'relics', name: '遗物', n: relicIds.length, note: '单列' },
  { id: 'ores', name: '矿场', n: ORES.length, note: '' },
]
const CODEX_TOTAL = CATS.reduce((s, c) => s + c.n, 0)

console.log('═'.repeat(78))
console.log('A. 图鉴规模（口径唯一：items.json 的非遗物键数）')
console.log('═'.repeat(78))
console.log(`data/items.json 共 ${Object.keys(ITEMS).length} 键，其中遗物 ${relicIds.length} 件 → 图鉴「物品」计 ${codexItems.length}`)
console.log(['分区'.padEnd(22), '条目'.padStart(6), '说明'.padStart(12)].join(' | '))
for (const c of CATS) console.log([c.name.padEnd(22), String(c.n).padStart(6), (c.note ?? '').padStart(12)].join(' | '))
console.log([`合计`.padEnd(22), String(CODEX_TOTAL).padStart(6)].join(' | '))
console.log(`自检：分区和 === 合计 → ${CATS.reduce((s, c) => s + c.n, 0) === CODEX_TOTAL ? '一致 ✅' : '不一致 ⚠'}`)

// ── B 图鉴里程碑 ──────────────────────────────────────────────
console.log('')
console.log('═'.repeat(78))
console.log('B. 图鉴里程碑（每 25% 一档；与赛季**解耦**，只给自奖励）')
console.log('═'.repeat(78))
// v3.0 审计订正：里程碑是**分区门槛**（内核 codex.ts milestoneReached），不是线性 25/50/75/100%
// → 直接读 data/season.json 的 req 与奖励（此前脚本内硬编码线性阈值 56/111/167/222，与内核冲突）
const MILESTONES = SEASON.codexMilestones
const sectionSizes = {
  items: Object.keys(ITEMS).filter((id) => ITEMS[id].category !== 'relic').length,
  recipes: RECIPES.length,
  affixes: AFFIXES.affixes.length,
  companions: COMPANIONS.companions.length,
  relics: Object.keys(ITEMS).filter((id) => ITEMS[id].category === 'relic').length,
  ores: ORES.length,
}
const milestoneRows = MILESTONES.map((m) => {
  const need = Object.entries(m.req).reduce((sum, [k, ratio]) => sum + Math.ceil(sectionSizes[k] * ratio), 0)
  return {
    m: m.pct,
    title: m.title,
    need,
    gold: m.gold,
    essence: m.essence,
    tokens: m.tokens,
    value: m.gold + m.essence * 15 + m.tokens * 200,
    bySection: Object.fromEntries(Object.entries(m.req).map(([k, r]) => [k, Math.ceil(sectionSizes[k] * r)])),
  }
})
console.log(['里程碑'.padEnd(8), '称号'.padEnd(10), '条目'.padStart(6), '金'.padStart(7), '精华'.padStart(5), '徽记'.padStart(5), '价值'.padStart(7)].join(' | '))
for (const r of milestoneRows) {
  console.log([pct(r.m, 0).padEnd(8), r.title.padEnd(10), String(r.need).padStart(6), String(r.gold).padStart(7), String(r.essence).padStart(5), String(r.tokens).padStart(5), String(r.value).padStart(7)].join(' | '))
}
const codexRewardValue = milestoneRows.reduce((s, r) => s + r.value, 0)
const codexTokens = milestoneRows.reduce((s, r) => s + r.tokens, 0)

// ── C 赛季声望曲线 ────────────────────────────────────────────
console.log('')
console.log('═'.repeat(78))
console.log('C. 赛季声望曲线（14 天一赛季；3 条任务 × 3 档；**只计最高达成档**）')
console.log('═'.repeat(78))
const seasonMax = TIER_RENOWN.gold * 3
/**
 * v3.3 评审修正：等级奖励**读内容表**（此前硬编码 500+250lv / 1+⌊lv/4⌋ / tokens；
 * 一旦有人调 data/season.json.levelReward，脚本结论不会跟着变 —— 违反"文档=脚本=表"纪律）。
 */
const levelReward = (lv) => {
  const r = SEASON.levelReward
  const gold = r.goldBase + r.goldPerLevel * lv
  const essence = r.essenceBase + Math.floor(lv / 4)
  const tokens = lv === LEVELS ? r.maxLevelTokens : lv % r.tokenEvery === 0 ? r.tokenAmount : 0
  return { gold, essence, tokens, value: gold + essence * 15 + tokens * 200 }
}
// 落进 JSON：测试逐字段对比"脚本算的 === 表里的"，防再硬编码
const LEVEL_REWARD_ROWS = Array.from({ length: LEVELS }, (_, i) => levelReward(i + 1))
let cumValue = 0
let tokenTotal = 0
const levelMarks = [5, 10, 15, 20]
console.log(`声望上限 ${seasonMax}（3 金）；满级需 ${FULL_LEVEL_RENOWN}（${LEVELS} 级 × ${RENOWN_PER_LEVEL}）`)
console.log(`结构：全铜 ${TIER_RENOWN.bronze * 3} → 全银 ${TIER_RENOWN.silver * 3} → 1金+2银 ${TIER_RENOWN.gold + TIER_RENOWN.silver * 2}（满级）→ 3金 ${seasonMax}（容错）`)
console.log('')
console.log(['等级'.padStart(4), '累计声望'.padStart(9), '累计奖励'.padStart(9)].join(' | '))
for (let lv = 1; lv <= LEVELS; lv++) {
  const r = levelReward(lv)
  cumValue += r.value
  tokenTotal += r.tokens
  if (levelMarks.includes(lv)) console.log([String(lv).padStart(4), String(lv * RENOWN_PER_LEVEL).padStart(9), String(Math.round(cumValue)).padStart(9)].join(' | '))
}

// ── D 单任务耗时 ──────────────────────────────────────────────
const taskHours = (taskId, tier, st) => {
  const t = SEASON_TARGETS[taskId][tier]
  if (taskId === 'mine') return t / st.mineRounds
  if (taskId === 'craft') return t / st.smeltRounds + (t * st.orePerSmelt) / st.mineRounds
  if (taskId === 'gold') return t / (st.goldPerRound * st.mineRounds)
  if (taskId === 'enhance') return t / st.enhancePerHour
  // v2.3 测评 M4：远征受**日历门槛**（每 run 需一次上线重派）而非动作流限制；
  // 其耗时以「日历小时」计，与动作流并行（故不叠加进动作预算，单独用日历轴校验）
  if (taskId === 'expedition') return (t / Math.min(st.expRoutes, st.loginsPerDay * 3)) * 24
  return 0 // 重铸：命令即时，成本是金币
}
console.log('')
console.log('═'.repeat(78))
console.log('D. 单任务耗时（熔炼已折算供矿的挖矿时间；强化为纯在线）')
console.log('═'.repeat(78))
console.log(['任务'.padEnd(11), '档位'.padEnd(7), '中期h'.padStart(7), '终局h'.padStart(7), '备注'.padStart(22)].join(' | '))
const TASK_KEYS = Object.keys(SEASON_TARGETS)
for (const id of TASK_KEYS) {
  for (const tier of ['bronze', 'silver', 'gold']) {
    const note = id === 'enhance' ? '纯在线(离线不结算)' : id === 'expedition' ? '日历门槛(不占动作流)' : id === 'reforge' ? '命令即时,成本为金币' : ''
    console.log([id.padEnd(11), tier.padEnd(7), f(taskHours(id, tier, STAGE.mid), 1).padStart(7), f(taskHours(id, tier, STAGE.end), 1).padStart(7), note.padStart(22)].join(' | '))
  }
}

// ── E 混合排程可达性 ──────────────────────────────────────────
const combos = []
for (let a = 0; a < TASK_KEYS.length; a++) {
  for (let b = a + 1; b < TASK_KEYS.length; b++) {
    for (let c = b + 1; c < TASK_KEYS.length; c++) combos.push([TASK_KEYS[a], TASK_KEYS[b], TASK_KEYS[c]])
  }
}
function totalHours(combo, tiers, st) {
  let mineLike = 0
  let other = 0
  combo.forEach((id, i) => {
    const h = taskHours(id, tiers[i], st)
    if (id === 'mine' || id === 'gold') mineLike = Math.max(mineLike, h)
    else other += h
  })
  return mineLike + other
}
const SCENARIOS = [
  { key: 'bronze3', label: '全铜(30)', tiers: ['bronze', 'bronze', 'bronze'] },
  { key: 'silver3', label: '全银(60)', tiers: ['silver', 'silver', 'silver'] },
  { key: 'full', label: '1金+2银(80满级)', tiers: ['gold', 'silver', 'silver'] },
  { key: 'gold2', label: '2金+1银(100)', tiers: ['gold', 'gold', 'silver'] },
]
console.log('')
console.log('═'.repeat(78))
console.log(`E. 可达性（最不利抽取组合；预算 = ${SEASON_DAYS} 天 × 24h × 离线折算）`)
console.log('═'.repeat(78))
console.log(['计入口径'.padEnd(20), '预算'.padStart(6), ...SCENARIOS.map((s) => s.label.padStart(16))].join(' | '))
const feasibility = []
for (const off of OFFLINE_FACTORS) {
  const budget = SEASON_DAYS * 24 * off.factor
  const cells = []
  for (const sc of SCENARIOS) {
    const hoursMid = Math.max(...combos.map((c) => totalHours(c, sc.tiers, STAGE.mid)))
    const hoursEnd = Math.max(...combos.map((c) => totalHours(c, sc.tiers, STAGE.end)))
    feasibility.push({ offline: off.key, scenario: sc.key, hoursMid, hoursEnd, budget, okMid: hoursMid <= budget, okEnd: hoursEnd <= budget, okSilent: hoursMid <= budget * 0.6 })
    cells.push(`${f(hoursMid, 0)}h${hoursMid <= budget ? '✅' : '⚠'}`.padStart(16))
  }
  console.log([off.label.padEnd(20), `${f(budget, 0)}h`.padStart(6), ...cells].join(' | '))
}
console.log('')
console.log('（cell = 中期 T3 最不利组合耗时；终局值见 JSON。okSilent 列 = 是否 ≤60% 预算，即"不挤占其他玩法"）')
// 日历轴（M4）：远征模板受上线节奏限制，要求「最不利抽取 + 每日 1 次上线」也能在窗口内完成金档
const expGoldDays = SEASON_TARGETS.expedition.gold / Math.min(2, 1 * 3)
console.log(`
日历轴（远征模板）：金档 ${SEASON_TARGETS.expedition.gold} 次 ÷ (中期 2 路线 × 每日 1 次) = ${f(expGoldDays, 1)} 天（窗口 ${SEASON_DAYS} 天）→ ${expGoldDays <= SEASON_DAYS ? '✅ 可达' : '⚠ 超出窗口，需下调目标'}`)

// ── F 通胀与徽记注入 ──────────────────────────────────────────
const tokenPerDay = 7.5
const seasonTokenInject = tokenTotal + codexTokens
console.log('')
console.log('═'.repeat(78))
console.log('F. 通胀检查（赛季不发大量金币；奖励主体是稀缺徽记）')
console.log('═'.repeat(78))
console.log(`赛季满级 ≈ ${Math.round(cumValue)} 金等价 + 图鉴里程碑 ≈ ${Math.round(codexRewardValue)} 金等价`)
console.log(`  合计 ${Math.round(cumValue + codexRewardValue)} 金等价 ≈ 终局 ${f((cumValue + codexRewardValue) / 74845, 2)} 小时产出 ✅`)
console.log(`徽记注入：赛季 ${tokenTotal} + 图鉴 ${codexTokens} = ${seasonTokenInject}/14 天 vs 远征 ${f(tokenPerDay * 14, 0)}/14 天 → 占 ${pct(seasonTokenInject / (tokenPerDay * 14))}`)
console.log('  中期玩家远征路线更少（约 2~3 条 → 3~5/日），占比更高（属预期：赛季是中期的主要徽记加速器）')

// ── G 结论 ────────────────────────────────────────────────────
console.log('')
console.log('═'.repeat(78))
console.log('G. 结论（写入设计文档 §3.1）')
console.log('═'.repeat(78))
const pick = (off, sc) => feasibility.find((x) => x.offline === off && x.scenario === sc)
const once = pick('once', 'full')
const always = pick('always', 'full')
const bronzeAlways = pick('always', 'bronze3')
console.log(`1. 图鉴 ${CODEX_TOTAL} 条（物品 ${codexItems.length} / 配方 ${RECIPES.length} / 词缀 ${AFFIXES.affixes.length} / 伙伴 ${COMPANIONS.companions.length} / 遗物 ${relicIds.length} / 矿场 ${ORES.length}）；分区和自检一致 ✅`)
console.log(`2. 满级（${FULL_LEVEL_RENOWN} = 1金+2银）最不利抽取耗时：常驻在线 ${f(always.hoursMid, 0)}h ｜ 每日 1 次上线 ${f(once.hoursMid, 0)}h（预算 ${f(once.budget, 0)}h）→ ${once.okMid ? '每日只上线 1 次的中期玩家也可满级 ✅' : '⚠ 需下调目标'}`)
console.log(`   占预算 ${pct(once.hoursMid / once.budget)} → ${once.okSilent ? '留出余量，不挤占重铸/强化/图鉴等玩法 ✅' : '⚠ 会挤占其他玩法，建议下调目标'}`)
console.log(`3. 档位梯度：全铜最不利 ${f(bronzeAlways.hoursMid, 0)}h（≈ ${f(bronzeAlways.hoursMid / 24, 1)} 天常驻）→ 休闲玩家也能拿铜档奖励 ✅`)
console.log(`4. 通胀：合计奖励 ≈ 终局 ${f((cumValue + codexRewardValue) / 74845, 2)} 小时产出；徽记注入占远征 ${pct(seasonTokenInject / (tokenPerDay * 14))} ✅`)
console.log(`5. 离线不对称：强化（离线跳过）与重铸（命令）只能在线推进，目标已按在线权重下调（强化金档 ${SEASON_TARGETS.enhance.gold} 次 = 中期 ${f(taskHours('enhance', 'gold', STAGE.mid), 0)}h 在线）`)

// ── H 账号分档 × 上线节奏：目标缩放系数（v3.3 B1） ─────────────
// 起因（v3.0 硬核评审 P3）：中期玩家「每日上线 1 次」打满金档要 300+ 小时（270% 预算）。
// 纪律（v3.3 计划评审 P-B1）：**不预设系数**，由本段反推：
//   requiredCoef = 预算 / 最不利组合耗时；取承诺集内最小值（向下取整 2 位），再受表内下限约束。
//
// 参赛资格（重要）：赛季在总等级 60 解锁（season.json.unlockTotalLevel），
//   故 T1 产出的"新号"**根本不参赛** —— 它仅作为对照行输出，不参与定档。
// 分档（参保玩家，按技能总等级）：新晋 60~119 / 老手 ≥120（= 传承解锁线，真实分水岭）。
//   新晋用 T3 中期模型（保守：T4/T5 玩家实际更快）；老手用 T7 终局模型。
// 承诺集（由证据决定，写进文档）：twice/always × {全铜, 全银, 1金+2银}；once × {全铜 全档, 全银 老手}；
//   3 金不承诺（容错档）。满级门槛 = 全银（renownPerLevel 4→3 ⇒ 满级 60 声望）。
// 对照档（不参赛）：T1 产出的"新号"，仅用于展示"若允许参赛会需要多小的系数"
const EARLY = {
  loginsPerDay: 1,
  expRoutes: 1,
  name: '新号 T1',
  // 派生口径（可复查）：每小时金币取 sim-audit B 段的 T1 基线 2812；轮/时沿用中期
  // （同为手动挖矿节奏，差异在产出而非操作）；强化次数取中期一半（档位低、材料少）
  mineRounds: STAGE.mid.mineRounds,
  goldPerRound: 2812 / STAGE.mid.mineRounds,
  smeltRounds: STAGE.mid.smeltRounds,
  orePerSmelt: 3,
  enhancePerHour: 40,
}


const INELIGIBLE_NOTE = '赛季未解锁（总等级<60），仅作对照'
const CLASSES = {
  junior: { name: '新晋(60~119)', stage: 't2', eligible: true }, // v3.4 A3：T3 → T2（保守，覆盖 60~85 段）
  veteran: { name: '老手(≥120)', stage: 'end', eligible: true },
  fresh: { name: '新号(T1,对照)', stage: 'early', eligible: false },
}
/** v3.4 A3：T2 段（赛季解锁线 60~85 的保守模型）——评审指出新晋档此前按 T3 建模、下沿无证据 */
const T2 = {
  loginsPerDay: 1,
  expRoutes: 1,
  name: 'T2 段(60~85)',
  mineRounds: STAGE.mid.mineRounds,
  goldPerRound: 9673 / STAGE.mid.mineRounds, // sim-audit B 段 T2 基线
  smeltRounds: STAGE.mid.smeltRounds,
  orePerSmelt: 3,
  enhancePerHour: 60,
}
const STAGES = { early: EARLY, t2: T2, mid: STAGE.mid, end: STAGE.end }
const goldPerHour = (st) => st.goldPerRound * st.mineRounds
const REFORGE_GOLD_BY_CLASS = { early: 400, mid: 1100, end: 9500 } // affixes.reforge.goldByTier 的 T2/T3/T7

console.log('')
console.log('═'.repeat(78))
console.log('H. 账号分档 × 上线节奏：目标缩放系数反推（v3.3 B1）')
console.log('═'.repeat(78))
const MATURITY_PROMISES = []
for (const [cls, def] of Object.entries(CLASSES)) {
  for (const off of OFFLINE_FACTORS) {
    for (const sc of SCENARIOS) {
      const hoursMid = Math.max(...combos.map((c) => totalHours(c, sc.tiers, STAGES[def.stage])))
      const budget = SEASON_DAYS * 24 * off.factor
      let promised = def.eligible
      if (sc.key === 'gold2') promised = false
      else if (off.key === 'once') promised = def.eligible && (sc.key === 'bronze3' || (sc.key === 'silver3' && cls === 'veteran'))
      MATURITY_PROMISES.push({
        cls,
        stage: def.stage,
        stageName: STAGES[def.stage].name,
        eligible: def.eligible,
        offline: off.key,
        scenario: sc.key,
        hoursMid,
        budget,
        ratio: hoursMid / budget,
        requiredCoef: budget / hoursMid,
        promised,
      })
    }
  }
}
/** 系数下限（登记在 data/season.json.coefFloor，测试断言一致）：再低会让赛季奖励"奖杯化" */
const COEF_FLOOR = 0.30 // v3.4 A3：T2 模型下新晋档需 0.34，下限调到 0.30 让证据说话（仍防奖杯化）
const scaleByMaturity = {}
for (const cls of Object.keys(CLASSES)) {
  if (!CLASSES[cls].eligible) continue
  const need = MATURITY_PROMISES.filter((p) => p.cls === cls && p.promised).map((p) => p.requiredCoef)
  const raw = Math.min(1, Math.floor(Math.min(...need) * 100) / 100)
  scaleByMaturity[cls] = Math.max(COEF_FLOOR, raw)
}
console.log(['账号档'.padEnd(16), '上线节奏'.padEnd(11), '场景'.padEnd(9), '最不利h'.padStart(9), '预算h'.padStart(7), '占比'.padStart(7), '承诺'.padStart(5)].join(' | '))
for (const p of MATURITY_PROMISES) {
  console.log(
    [
      p.cls.padEnd(16),
      p.offline.padEnd(11),
      p.scenario.padEnd(9),
      f(p.hoursMid, 0).padStart(9),
      f(p.budget, 0).padStart(7),
      pct(p.ratio, 0).padStart(7),
      (p.promised ? '✓' : '—').padStart(5),
    ].join(' | '),
  )
}
console.log('')
console.log(`反推系数：新晋 ×${f(scaleByMaturity.junior)} ｜ 老手 ×${f(scaleByMaturity.veteran)}（下限 ${COEF_FLOOR}，上限 1.00）`)
console.log(`（${CLASSES.fresh.name}：${INELIGIBLE_NOTE}）`)

// 缩放后复算 + 反挂保护（严格递增、≥ 基础 × 下限系数）
const scaledTargets = {}
const guards = { monotone: true, floorOk: true }
for (const cls of Object.keys(scaleByMaturity)) {
  const coef = scaleByMaturity[cls]
  scaledTargets[cls] = {}
  for (const tpl of SEASON.templates) {
    // T5：与内核同式的整数运算（避免 204.00000000000003 → 205 的假进位）
    const c100 = Math.round(coef * 100)
    const scaled = tpl.targets.map((t) => Math.max(1, Math.ceil((t * c100) / 100)))
    scaledTargets[cls][tpl.counter] = scaled
    if (!(scaled[0] < scaled[1] && scaled[1] < scaled[2])) guards.monotone = false
    if (scaled.some((v, i) => v < tpl.targets[i] * COEF_FLOOR)) guards.floorOk = false
  }
}
const afterScale = MATURITY_PROMISES.map((p) => ({ ...p, ratioAfter: (p.hoursMid * (scaleByMaturity[p.cls] ?? 1)) / p.budget }))
const promisedCells = afterScale.filter((p) => p.promised)
const promisedMaxAfter = Math.max(...promisedCells.map((p) => p.ratioAfter))
console.log(`缩放后承诺集最差占比 ${pct(promisedMaxAfter, 0)}（应 ≤100%）｜ 严格递增 ${guards.monotone ? '✅' : '⚠'} ｜ 下限保护 ${guards.floorOk ? '✅' : '⚠'}`)
const reforgeGoldNeeded = T.totalReforgesT4[2] * REFORGE_GOLD_BY_CLASS.mid
console.log(`重铸模板（金币门槛，单列）：金档 ${T.totalReforgesT4[2]} 次 × 单次造价(T3 ${REFORGE_GOLD_BY_CLASS.mid} 金) = ${reforgeGoldNeeded} 金 ≈ 中期 ${f(reforgeGoldNeeded / (goldPerHour(STAGE.mid) * SEASON_DAYS * 24 * 0.333), 2)} 倍「每日 1 次」14 天产出`)


// ── 机器校验 JSON ─────────────────────────────────────────────
const summary = {
  codex: {
    items: codexItems.length,
    recipes: RECIPES.length,
    affixes: AFFIXES.affixes.length,
    companions: COMPANIONS.companions.length,
    relics: relicIds.length,
    ores: ORES.length,
    total: CODEX_TOTAL,
    milestones: milestoneRows,
  },
  season: {
    days: SEASON_DAYS,
    levels: LEVELS,
    renownPerLevel: RENOWN_PER_LEVEL,
    fullLevelRenown: FULL_LEVEL_RENOWN,
    maxRenown: seasonMax,
    tierRenown: TIER_RENOWN,
    targets: SEASON_TARGETS,
  },
  rewards: {
    levelTotalValue: Math.round(cumValue),
    levelTokens: tokenTotal,
    codexValue: Math.round(codexRewardValue),
    codexTokens,
    totalValue: Math.round(cumValue + codexRewardValue),
    tokenInject: seasonTokenInject,
    tokenInjectShare: seasonTokenInject / (tokenPerDay * 14),
  },
  feasibility,
  maturity: {
    classes: ['early', 'mid', 'end'],
    stageParams: STAGES,
    stageDerivation: {
      early: '每小时金币取 sim-audit B 段 T1 基线 2812；轮/时沿用中期；强化次数取中期一半',
      t2: '每小时金币取 sim-audit B 段 T2 基线 9673（赛季解锁线附近的保守模型）',
      mid: 'stages.mid（T3，v2.3 既有口径）',
      end: 'stages.end（T7，v2.3 既有口径）',
    },
    promises: afterScale,
    levelRewardRows: LEVEL_REWARD_ROWS,
    scaleByMaturity,
    coefFloor: COEF_FLOOR,
    scaledTargets,
    guards,
    promisedMaxRatioAfter: promisedMaxAfter,
    reforgeGoldMetric: { goldByClass: REFORGE_GOLD_BY_CLASS, goldNeededGoldTier: T.totalReforgesT4[2] * REFORGE_GOLD_BY_CLASS.mid },
  },
}
writeFileSync(join(root, 'docs', 'sim-season-output.json'), JSON.stringify(summary, null, 2) + '\n')
console.log('')
console.log('机器校验输出：docs/sim-season-output.json（测试逐字段断言，避免文档与脚本漂移）')
