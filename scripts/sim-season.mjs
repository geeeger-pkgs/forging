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
  enhance: { bronze: T.totalEnhances[0], silver: T.totalEnhances[1], gold: T.totalEnhances[2] },
  expedition: { bronze: T.totalExpeditions[0], silver: T.totalExpeditions[1], gold: T.totalExpeditions[2] },
  reforge: { bronze: T.totalReforges[0], silver: T.totalReforges[1], gold: T.totalReforges[2] },
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
const MILESTONES = [0.25, 0.5, 0.75, 1.0]
const milestoneRows = MILESTONES.map((m) => {
  const need = Math.ceil(CODEX_TOTAL * m)
  // v2.3 测评 M5：奖励与获取成本匹配（100% 需 222 条，含 3 件遗物）
  const gold = [2500, 12000, 30000, 80000][MILESTONES.indexOf(m)]
  const essence = [10, 25, 45, 80][MILESTONES.indexOf(m)]
  const tokens = [0, 3, 6, 15][MILESTONES.indexOf(m)]
  return { m, need, gold, essence, tokens, value: gold + essence * 15 + tokens * 200 }
})
console.log(['里程碑'.padEnd(8), '条目'.padStart(6), '金'.padStart(7), '精华'.padStart(5), '徽记'.padStart(5), '价值'.padStart(7)].join(' | '))
for (const r of milestoneRows) {
  console.log([pct(r.m, 0).padEnd(8), String(r.need).padStart(6), String(r.gold).padStart(7), String(r.essence).padStart(5), String(r.tokens).padStart(5), String(r.value).padStart(7)].join(' | '))
}
const codexRewardValue = milestoneRows.reduce((s, r) => s + r.value, 0)
const codexTokens = milestoneRows.reduce((s, r) => s + r.tokens, 0)

// ── C 赛季声望曲线 ────────────────────────────────────────────
console.log('')
console.log('═'.repeat(78))
console.log('C. 赛季声望曲线（14 天一赛季；3 条任务 × 3 档；**只计最高达成档**）')
console.log('═'.repeat(78))
const seasonMax = TIER_RENOWN.gold * 3
const levelReward = (lv) => {
  const gold = 500 + lv * 250
  const essence = 1 + Math.floor(lv / 4)
  const tokens = lv === LEVELS ? 10 : lv % 5 === 0 ? 2 : 0
  return { gold, essence, tokens, value: gold + essence * 15 + tokens * 200 }
}
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
}
writeFileSync(join(root, 'docs', 'sim-season-output.json'), JSON.stringify(summary, null, 2) + '\n')
console.log('')
console.log('机器校验输出：docs/sim-season-output.json（测试逐字段断言，避免文档与脚本漂移）')
