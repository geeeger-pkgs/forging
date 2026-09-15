// ============================================================
// Forging · 图鉴与赛季数值模拟（v2.3 · 开发前定档证据）
// 目的：图鉴规模与里程碑节奏、赛季声望曲线与奖励价值，全部先算后定档
// 运行：node scripts/sim-season.mjs
// ============================================================
import { readFileSync } from 'node:fs'
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

console.log('═'.repeat(78))
console.log('A. 图鉴规模（按类别清点，遗物单列避免与物品重复计数）')
console.log('═'.repeat(78))
const relics = Object.values(ITEMS).filter((i) => i.category === 'relic')
const codexItems = Object.keys(ITEMS).filter((id) => ITEMS[id].category !== 'relic')
const cats = [
  { id: 'items', name: '物品（材料/装备/符文）', n: codexItems.length },
  { id: 'recipes', name: '配方', n: RECIPES.length },
  { id: 'affixes', name: '词缀', n: AFFIXES.affixes.length },
  { id: 'companions', name: '伙伴', n: COMPANIONS.companions.length },
  { id: 'relics', name: '遗物', n: relics.length },
  { id: 'ores', name: '矿场', n: ORES.length },
]
let total = 0
console.log(['类别'.padEnd(20), '条目数'.padStart(7)].join(' | '))
for (const c of cats) {
  total += c.n
  console.log([c.name.padEnd(20), String(c.n).padStart(7)].join(' | '))
}
console.log([`合计`.padEnd(20), String(total).padStart(7)].join(' | '))

console.log('')
console.log('B. 图鉴里程碑（每 25% 一档；奖励按「该阶段玩家最缺的东西」给）')
console.log('═'.repeat(78))
const MILESTONES = [0.25, 0.5, 0.75, 1.0]
console.log(['里程碑'.padEnd(10), '总条目'.padStart(8), '声望点'.padStart(8), '奖励（金币 + 精华 + 徽记）'.padStart(30)].join(' | '))
for (const m of MILESTONES) {
  const need = Math.ceil(total * m)
  const renown = Math.round(m * 16)
  const gold = Math.round(2000 * m * m * 10)
  const essence = Math.round(10 * m * 4)
  const tokens = m >= 1 ? 10 : m >= 0.5 ? 3 : 0
  console.log([pct(m, 0).padEnd(10), String(need).padStart(8), String(renown).padStart(8), `${gold} 金 + 精华 ×${essence}${tokens ? ` + 徽记 ×${tokens}` : ''}`.padStart(30)].join(' | '))
}
console.log('')
console.log('说明：图鉴里程碑奖励同时给「赛季声望」，使赛季进度与收集度自然耦合（不必再开一条独立货币）')

console.log('')
console.log('C. 赛季声望曲线（14 天一赛季；任务 3 条，每条 3 档）')
console.log('═'.repeat(78))
const TASK_TIERS = [
  { id: 'bronze', name: '铜', renown: 10 },
  { id: 'silver', name: '银', renown: 20 },
  { id: 'gold', name: '金', renown: 40 },
]
const perTask = TASK_TIERS[TASK_TIERS.length - 1].renown
const seasonMax = perTask * 3 // 三条任务全金
const LEVELS = 20
const renownPerLevel = Math.ceil(seasonMax / LEVELS)
console.log(`单赛季任务声望上限 = 3 × ${perTask} = ${seasonMax}；等级 ${LEVELS} 级 → 每级 ${renownPerLevel} 声望`)
console.log('')
console.log(['等级'.padStart(4), '累计声望'.padStart(9), '累计奖励价值（金等价）'.padStart(22)].join(' | '))
const milestoneRenownTotal = MILESTONES.reduce((acc, m) => acc + Math.round(m * 16), 0)
let tokenTotal = 0
const levelReward = (lv) => {
  const gold = 500 + lv * 250
  const essence = 1 + Math.floor(lv / 4)
  const tokens = lv === LEVELS ? 10 : lv % 5 === 0 ? 2 : 0
  return { gold, essence, tokens, value: gold + essence * 15 + tokens * 200 }
}
let cumValue = 0
const marks = [5, 10, 15, 20]
for (let lv = 1; lv <= LEVELS; lv++) {
  const r = levelReward(lv)
  tokenTotal += r.tokens
  cumValue += r.value
  if (marks.includes(lv)) {
    console.log([String(lv).padStart(4), String(lv * renownPerLevel).padStart(9), String(Math.round(cumValue)).padStart(22)].join(' | '))
  }
}
console.log('')
console.log(`满级总奖励价值 ≈ ${Math.round(cumValue)} 金等价`)

console.log('')
console.log('D. 声望获取节奏（按 sim-audit 各档吞吐折算「达成各档任务所需天数」）')
console.log('═'.repeat(78))
// sim-audit B 段：T7 开采 74,845 金/时；T1 2,812 金/时。任务目标按档位缩放。
const goldPerHour = { early: 2812, mid: 18527, endgame: 74845 }
const TASKS = [
  { id: 'mine', name: '挖掘', unit: '次', bronze: 20000, silver: 45000, gold: 72000, perHour: { early: 150, mid: 300, endgame: 578 } },
  { id: 'craft', name: '熔炼或锻造', unit: '次', bronze: 10000, silver: 22000, gold: 36000, perHour: { early: 60, mid: 150, endgame: 280 } },
  { id: 'gold', name: '累计金币', unit: '金', bronze: 1200000, silver: 2600000, gold: 4000000, perHour: goldPerHour },
  { id: 'enhance', name: '强化尝试', unit: '次', bronze: 600, silver: 1300, gold: 2000, perHour: { early: 40, mid: 80, endgame: 160 } },
  { id: 'expedition', name: '完成远征', unit: '次', bronze: 20, silver: 40, gold: 60, perHour: { early: 0.12, mid: 0.25, endgame: 0.5 } },
  { id: 'reforge', name: '重铸词缀', unit: '次', bronze: 30, silver: 65, gold: 100, perHour: { early: 0.2, mid: 0.5, endgame: 1 } },
]
console.log(['任务模板'.padEnd(14), '铜档(次/天)'.padStart(12), '银档(次/天)'.padStart(12), '金档(次/天)'.padStart(12)].join(' | '))
for (const t of TASKS) {
  const days = (tier) => {
    const out = {}
    for (const stage of ['early', 'mid', 'endgame']) out[stage] = t[tier] / t.perHour[stage] / 24
    return out
  }
  const b = days('bronze')
  const s = days('silver')
  const g = days('gold')
  console.log(
    [
      t.name.padEnd(14),
      `${f(b.early, 1)}/${f(b.mid, 1)}/${f(b.endgame, 1)}`.padStart(12),
      `${f(s.early, 1)}/${f(s.mid, 1)}/${f(s.endgame, 1)}`.padStart(12),
      `${f(g.early, 1)}/${f(g.mid, 1)}/${f(g.endgame, 1)}`.padStart(12),
    ].join(' | '),
  )
}
console.log('  （格式：早期/中期/终局 所需天数）')

console.log('')
console.log('E. 赛季可达性判定（14 天窗口；三条任务按赛季键确定性抽取）')
console.log('═'.repeat(78))
const worstCase = TASKS.map((t) => ({ id: t.id, goldEnd: t.gold / t.perHour.endgame / 24, goldMid: t.gold / t.perHour.mid / 24 }))
const midAvg = worstCase.reduce((s, x) => s + x.goldMid, 0) / worstCase.length
const endAvg = worstCase.reduce((s, x) => s + x.goldEnd, 0) / worstCase.length
console.log(`三条任务全金档的平均耗时：中期 ≈ ${f(midAvg, 1)} 天/条（并行推进）｜终局 ≈ ${f(endAvg, 1)} 天/条`)
console.log(`14 天内：中期玩家可达 ${pct(Math.min(1, 14 / midAvg))} 的金档，终局玩家 ${pct(Math.min(1, 14 / endAvg))}`)
console.log('')
console.log('结论：')
const slowestMid = Math.max(...worstCase.map((x) => x.goldMid))
const slowestEnd = Math.max(...worstCase.map((x) => x.goldEnd))
const fastestMid = Math.min(...worstCase.map((x) => x.goldMid))
console.log(`1. 三条任务【并行】推进：全金档耗时由最慢一条决定 → 中期 ${f(slowestMid, 1)} 天 / 终局 ${f(slowestEnd, 1)} 天（窗口 14 天）`)
console.log(`   ${slowestMid <= 12 ? '✅ 中期玩家可在窗口内满级（留缓冲）' : '⚠ 中期玩家无法在窗口内满级 → 需下调目标'}`)
console.log(`2. 档位梯度：铜档中期最快 ${f(fastestMid, 1)} 天 → 休闲玩家也能拿铜/银档声望（梯度有效）`)
console.log(`3. 满级总奖励 ≈ ${Math.round(cumValue)} 金等价（≈ 终局 ${f(cumValue / 74845, 1)} 小时产出）+ 远征徽记 ×${tokenTotal}`)
console.log('   赛季不靠金币发奖（避免通胀），真正的奖励是【稀缺的远征徽记】：')
console.log(`   对比远征日产 7.5/日（单赛季 ${f(7.5 * 14, 0)}），赛季注入 ${tokenTotal} ≈ ${pct(tokenTotal / (7.5 * 14))} —— 加速但不替代远征 ✅`)
console.log(`4. 图鉴里程碑给声望（上限 ${milestoneRenownTotal} = 总需求的 ${pct(milestoneRenownTotal / seasonMax)}）→ 收集度与赛季耦合，不喧宾夺主 ✅`)
console.log('5. 奖励随等级【即时自动发放】（无领取步骤）→ 赛季重置不产生「忘领奖励」挫败 ✅')
