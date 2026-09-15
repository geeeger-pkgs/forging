// ============================================================
// Forging · 词缀与重铸数值模拟（v2.1）
// 目的：开发前给出「词缀强度上界 / 完美化成本 / 重铸石供需」的量化证据
// 运行：node scripts/sim-affixes.mjs
// 数据源：data/affixes.json + data/items.json（与运行时同一份内容表）
// 产金/时基线来自 scripts/sim-audit.mjs B 段（v1.9 审计结论，此处引用常量）
// ============================================================
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const AFFIXES = JSON.parse(readFileSync(join(root, 'data/affixes.json'), 'utf8'))
const ITEMS = JSON.parse(readFileSync(join(root, 'data/items.json'), 'utf8'))
const ORES = JSON.parse(readFileSync(join(root, 'data/ores.json'), 'utf8'))
const CFG = JSON.parse(readFileSync(join(root, 'data/config.json'), 'utf8'))

const f = (x, d = 2) => Number(x).toFixed(d)
const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`
const hr = (x) => `${f(x, 2)} h`

// 产金/时（sim-audit B 段「开采金/时」）
const GOLD_PER_HOUR = { 1: 2812, 2: 9673, 3: 18527, 4: 30590, 5: 46636, 6: 61534, 7: 74845 }
// 矿石基础时长（ms）与解锁档（按档位取代表矿脉）
const SITE_BY_TIER = { 1: 'copper_seam', 2: 'iron_seam', 3: 'silver_seam', 4: 'gold_seam', 5: 'mithril_seam', 6: 'starlite_seam', 7: 'void_seam' }
// v1.9 审计：满配速度 +285% → 时长 ×0.260；稀有合计 +1.840 → 稀有率 ×2.840
const SPEED_FULL = 2.85
const RAREFIND_FULL = 1.84

console.log('═'.repeat(76))
console.log('A. 词缀上限表（完美 roll = 1.0；每档 max = base + perTier×(tier−1)）')
console.log('═'.repeat(76))

const SLOTS_BY_ARCH = { tool: ['pick', 'crucible', 'hammer'], weapon: ['mainHand'], armor: ['head', 'body', 'legs', 'feet'], jewelry: ['necklace', 'ring'] }
/** 各原型的最高档位（评审 B2：饰品只到 T5，完美值必须按 T5 计） */
const MAX_TIER_BY_ARCH = { tool: 7, weapon: 7, armor: 7, jewelry: 5 }

const affixById = Object.fromEntries(AFFIXES.affixes.map((a) => [a.id, a]))

/** 逐槽计算「该槽该词缀的完美值」并汇总（同一词缀在不同原型档位上限不同） */
const slotCountOfAffix = (affixId) => {
  let n = 0
  for (const arch of Object.keys(AFFIXES.pools)) {
    if (!AFFIXES.pools[arch].includes(affixId)) continue
    n += SLOTS_BY_ARCH[arch].length
  }
  return n
}
const capOfAffix = (affixId) => {
  let sum = 0
  for (const arch of Object.keys(AFFIXES.pools)) {
    if (!AFFIXES.pools[arch].includes(affixId)) continue
    const t = MAX_TIER_BY_ARCH[arch]
    sum += SLOTS_BY_ARCH[arch].length * (affixById[affixId].base + affixById[affixId].perTier * (t - 1))
  }
  return sum
}
const capNoteOfAffix = (affixId) => {
  const parts = []
  for (const arch of Object.keys(AFFIXES.pools)) {
    if (!AFFIXES.pools[arch].includes(affixId)) continue
    const t = MAX_TIER_BY_ARCH[arch]
    parts.push(`${SLOTS_BY_ARCH[arch].length}×T${t}`)
  }
  return parts.join(' + ')
}

console.log(
  ['词缀'.padEnd(10), '效果'.padEnd(12), '可出槽分布'.padStart(18), '上限贡献'.padStart(10)].join(' | '),
)
for (const a of AFFIXES.affixes) {
  console.log(
    [a.name.padEnd(10), a.effect.padEnd(12), capNoteOfAffix(a.id).padStart(18), `+${pct(capOfAffix(a.id))}`.padStart(10)].join(' | '),
  )
}
console.log('')
console.log('组合多样性（池各 5 条）：')
for (const arch of Object.keys(AFFIXES.pools)) {
  const n7 = AFFIXES.countByTier['7']
  const pool = AFFIXES.pools[arch].length
  const comb = (n, k) => (k > n ? 0 : k === 0 ? 1 : comb(n - 1, k - 1) + comb(n - 1, k))
  console.log(
    `  ${arch.padEnd(8)} 池 ${pool} 条 → T1/T2 ${comb(pool, 1)} 种 / T3/T4 ${comb(pool, 2)} 种 / T5/T6 ${comb(pool, 3)} 种 / T7(${n7}) ${comb(pool, n7)} 种`,
  )
}

console.log('')
console.log('  词缀条数（按档位）：', Object.entries(AFFIXES.countByTier).map(([t, n]) => `T${t}×${n}`).join(' / '))

console.log('')
console.log('═'.repeat(76))
console.log('B. 满配叠加审计（8 槽 T7 + 2 槽 T5 全完美词缀 + 既有满配）')
console.log('═'.repeat(76))

const maxOf = (id, tier) => affixById[id].base + affixById[id].perTier * (tier - 1)
// 每槽按「该原型池内该属性的最大完美值 × 该原型最高档」计（上界口径）
const slotMax = {}
for (const arch of Object.keys(SLOTS_BY_ARCH)) {
  const t = MAX_TIER_BY_ARCH[arch]
  for (const slot of SLOTS_BY_ARCH[arch]) {
    let speed = 0, eff = 0, qty = 0
    for (const id of AFFIXES.pools[arch]) {
      const e = affixById[id].effect
      if (e === 'speed') speed = Math.max(speed, maxOf(id, t))
      if (e === 'efficiency') eff = Math.max(eff, maxOf(id, t))
      if (e === 'quantity') qty = Math.max(qty, maxOf(id, t))
    }
    slotMax[slot] = { speed, eff, qty, arch }
  }
}
const toolSlots = SLOTS_BY_ARCH.tool
const affixSpeedMining = toolSlots.reduce((s, x) => s + slotMax[x].speed, 0) + slotMax.mainHand.speed
const affixEff = Object.values(slotMax).reduce((s, x) => s + x.eff, 0)
const affixQty = Object.values(slotMax).reduce((s, x) => s + x.qty, 0)

console.log(`词缀速度合计（采矿·全完美上限）: +${pct(affixSpeedMining)}`)
console.log(`词缀效率合计（全完美上限）    : +${pct(affixEff)}`)
console.log(`词缀产量合计（全完美上限）    : +${pct(affixQty)}`)
const totalSpeed = SPEED_FULL + affixSpeedMining
const mult = 1 / (1 + totalSpeed)
console.log(`速度合计（既有满配 + 词缀上限）: +${pct(totalSpeed)} → 时长 ×${f(mult, 3)}`)
const fastestBase = Math.min(...ORES.map((o) => o.baseTimeMs))
console.log(`  最速动作 ${fastestBase}ms → 满配 ${f(fastestBase * mult, 0)}ms（下限 ${CFG.minActionTimeMs}ms）`)
console.log(`  250ms 触底条件：基础时长 < ${f(CFG.minActionTimeMs / mult, 0)}ms → 当前最速基础 ${fastestBase}ms ${fastestBase >= CFG.minActionTimeMs / mult ? '永不触底 ✅' : '触底 ⚠'}`)
// 效率按真实语义（评审 M2/M3）：在线 proc 每轮期望倍率 = 1 + 1/(2−E)，链式上限 1
// 装备侧 E 与 sim-audit.mjs 同口径现场推导（m6：两脚本不得各写一个基线）
const ENH_OTHER_MULT = 1 + 0.05 * 10
const E_BASE =
  (ITEMS.pick_void.stats.efficiency +
    ITEMS.crucible_void.stats.efficiency +
    ITEMS.hammer_void.stats.efficiency +
    ITEMS.warhammer_void.stats.efficiency +
    ITEMS.helmet_void.stats.efficiency) *
    ENH_OTHER_MULT +
  ITEMS.boots_void.stats.efficiency * ENH_OTHER_MULT +
  ITEMS.ring_mithril.stats.efficiency * ENH_OTHER_MULT +
  0.04 // 套装 8 件 +4% 效率
const procRate = (E) => (E >= 1 ? 1 : 1 / (2 - E))
const procBase = 1 + procRate(E_BASE)
const procFlow = 1 + procRate(E_BASE + affixEff)

console.log(
  `效率（装备侧，与 sim-audit 同口径）E=${f(E_BASE, 4)} → 在线每轮期望倍率 ×${f(procBase, 4)}（触发率 ${f(procRate(E_BASE), 4)}/轮）`,
)
console.log(
  `  叠加 flow 满配 +${pct(affixEff)} → E=${f(E_BASE + affixEff, 4)} → ×${f(procFlow, 4)}：` +
    `**对总产出的边际增益 +${pct(procFlow / procBase - 1)}**（触发率口径 +${pct(procRate(E_BASE + affixEff) / procRate(E_BASE) - 1)}，两者勿混用）`,
)
console.log(`  ｜flow 名义 +${pct(affixEff)}（加法池），受 proc 上限 1/轮 压缩，实际增益远小于名义值（设计已知取舍）`)

console.log('')
console.log('═'.repeat(76))
console.log('C. 完美化成本（目标：4 条词缀全部 ≥90% 品质）')
console.log('═'.repeat(76))

const q = 0.9
const p = (1 - q) / (AFFIXES.rollMax - AFFIXES.rollMin) // 单条达到阈值概率
console.log(`单条达标概率 P(roll ≥ ${q}) = ${f(p, 4)}`)
// 最优策略：达标即锁，未达标继续摇（每阶段期望次数 = 1/P(至少一条达标)）
let expect = 0
let expectGold = 0
let expectEssence = 0
let expectStone = 0
for (let locked = 0; locked < 4; locked++) {
  const unlocked = 4 - locked
  const pAny = 1 - Math.pow(1 - p, unlocked)
  const rounds = 1 / pAny
  expect += rounds
  const cost = AFFIXES.reforge.goldByTier['7'] * (1 + AFFIXES.reforge.lockGoldFactor * locked)
  expectGold += rounds * cost
  expectEssence += rounds * AFFIXES.reforge.essenceByTier['7']
  expectStone += rounds * locked
}
console.log(`【逐条锁定策略（达阈值即锁，最优）】期望重铸次数 ≈ ${f(expect, 2)} 次（解析值 = 保守上界）`)
console.log(`期望消耗（T7）：金 ${f(expectGold, 0)} ｜ 精华 ${f(expectEssence, 1)} ｜ 重铸石 ${f(expectStone, 1)}`)
console.log(`  金折算（T7 产金 ${GOLD_PER_HOUR[7]}/时）: ${hr(expectGold / GOLD_PER_HOUR[7])}`)

// 蒙特卡洛交叉验证
let totalRounds = 0, totalStone = 0, totalGold = 0
const N = 20000
let seed = 12345
const rnd = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff
  return seed / 0x7fffffff
}
for (let t = 0; t < N; t++) {
  let locked = 0
  let rounds = 0
  while (locked < 4 && rounds < 100000) {
    rounds++
    totalGold += AFFIXES.reforge.goldByTier['7'] * (1 + AFFIXES.reforge.lockGoldFactor * locked)
    totalStone += locked
    let gained = 0
    for (let i = 0; i < 4 - locked; i++) {
      const roll = AFFIXES.rollMin + rnd() * (AFFIXES.rollMax - AFFIXES.rollMin)
      if (roll >= q) gained++
    }
    locked += gained
  }
  totalRounds += rounds
}
console.log(`【蒙特卡洛（${N} 次试验，一次可锁多条）】平均 ${f(totalRounds / N, 2)} 次 / 金 ${f(totalGold / N, 0)} / 重铸石 ${f(totalStone / N, 1)}`)
console.log('  （解析值 10.50 为保守上界，MC 8.81 为实战均值；文档采用解析值）')

// M1（v2.1 测评）：对照组——完全不锁定、每次全摇的期望
const allReroll = 1 / Math.pow(p, 4)
const allRerollGold = allReroll * AFFIXES.reforge.goldByTier['7']
console.log('')
console.log(`【对照：一次全摇（不锁定）】P(4 条全达标) = ${f(Math.pow(p, 4), 6)} → 期望 ${f(allReroll, 0)} 次 × 9,500 = ${f(allRerollGold, 0)} 金`)
console.log(`  → 逐条锁定比一次全摇便宜 ${f(allRerollGold / expectGold, 1)} 倍（${f(expectGold / 1000, 1)}k vs ${f(allRerollGold / 10000, 1)} 万金）✅ 锁定机制价值有一手证据`)

console.log('')
console.log('═'.repeat(76))
console.log('D. 重铸经济（单次造价 vs 该档产金/时）')
console.log('═'.repeat(76))
console.log(
  ['档位'.padEnd(6), '词缀'.padStart(4), '最大锁'.padStart(6), '无锁造价'.padStart(9), '占产金/时'.padStart(10), '锁1'.padStart(8), '锁2'.padStart(8), '锁3'.padStart(8), '精华'.padStart(5)].join(' | '),
)
for (let t = 1; t <= 7; t++) {
  const g = AFFIXES.reforge.goldByTier[String(t)]
  const lf = AFFIXES.reforge.lockGoldFactor
  const n = AFFIXES.countByTier[String(t)] // 词缀条数
  const maxLock = n - 1 // 至少留 1 条参与重摇
  const cell = (k) => (k > maxLock ? '—'.padStart(8) : String(Math.round(g * (1 + k * lf))).padStart(8))
  console.log(
    [
      `T${t}`.padEnd(6),
      String(n).padStart(4),
      String(maxLock).padStart(6),
      String(g).padStart(9),
      pct(g / GOLD_PER_HOUR[t]).padStart(10),
      cell(1),
      cell(2),
      cell(3),
      String(AFFIXES.reforge.essenceByTier[String(t)]).padStart(5),
    ].join(' | '),
  )
}
console.log('  （「—」= 该档词缀条数不足，无法锁定到该数量；「占产金/时」= 无锁重铸造价 ÷ 该档开采金/时）')

console.log('')
console.log('═'.repeat(76))
console.log('E. 重铸石供需（T4+ 稀有掉落）')
console.log('═'.repeat(76))
// M4（v2.1 测评）：必须并列两个口径——基础口径（仅速度 +285%/稀有 +184%）
// 与 v2.1 满配口径（再叠加 keen +19.2% 速度、fortune +68% 稀有、prospect +110% 重铸石）
const STONEFIND_FULL = 1.1 // prospect 满配上限（4×T7 20% + 2×T5 15%）
const speedFullV21 = SPEED_FULL + affixSpeedMining
console.log(
  [
    '矿脉'.padEnd(14),
    '掉落率'.padStart(8),
    '行动/时(v2.1满配)'.padStart(16),
    '个/时(基础口径)'.padStart(16),
    '个/时(v2.1满配)'.padStart(16),
  ].join(' | '),
)
for (const o of ORES) {
  const drop = o.rareDrops.find((d) => d.itemId === 'emberstone')
  if (!drop) continue
  const fullBase = 3_600_000 / (o.baseTimeMs / (1 + SPEED_FULL))
  const fullV21 = 3_600_000 / (o.baseTimeMs / (1 + speedFullV21))
  const perHourBase = fullBase * drop.rate * (1 + RAREFIND_FULL)
  const perHourV21 = fullV21 * drop.rate * (1 + RAREFIND_FULL + STONEFIND_FULL)
  console.log(
    [
      o.name.padEnd(14),
      pct(drop.rate, 2).padStart(8),
      f(fullV21, 0).padStart(16),
      f(perHourBase, 2).padStart(16),
      f(perHourV21, 2).padStart(16),
    ].join(' | '),
  )
}
const voidOre = ORES.find((o) => o.id === SITE_BY_TIER[7])
const voidDrop = voidOre.rareDrops.find((d) => d.itemId === 'emberstone').rate
const stonePerHourBase = (3_600_000 / (voidOre.baseTimeMs / (1 + SPEED_FULL))) * voidDrop * (1 + RAREFIND_FULL)
const stonePerHourFull =
  (3_600_000 / (voidOre.baseTimeMs / (1 + speedFullV21))) * voidDrop * (1 + RAREFIND_FULL + STONEFIND_FULL)
const stonePerHourPlain = (3_600_000 / voidOre.baseTimeMs) * voidDrop
console.log('')
console.log(`完美化一件 T7 需 ${f(expectStone, 1)} 颗重铸石：`)
console.log(`  v2.1 满配（速度+keen、稀有+fortune、勘探齐备）${f(stonePerHourFull, 2)}/时 → ${hr(expectStone / stonePerHourFull)}`)
console.log(`  基础口径（仅速度+285%、稀有+184%，无 prospect）${f(stonePerHourBase, 2)}/时 → ${hr(expectStone / stonePerHourBase)}`)
console.log(`  裸装无加成（${f(stonePerHourPlain, 2)}/时）→ ${hr(expectStone / stonePerHourPlain)}`)
console.log(`  → 幸运流+勘探流配装把重铸石产量 ×${f(stonePerHourFull / stonePerHourBase, 2)}：配装动机成立 ✅；prospect 只加成矿脉（小箱 5% 固定，不受加成）`)

console.log('')
console.log('═'.repeat(76))
console.log('G. 庇护（aegis）对 +1→+10 强化期望成本的影响（M2：Markov 精确解 + MC 交叉）')
console.log('═'.repeat(76))

const ENH = JSON.parse(readFileSync(join(root, 'data/enhance.json'), 'utf8'))
const stepAt = (target) => ENH.find((e) => e.targetLevel === target)

/**
 * 期望尝试次数：E[i] = 从 +i 升到 +10 的期望尝试数（guard = 失败免降级概率）
 * 递推：设 E[i] = a[i] + b[i]·E[i+1]
 *   非降级档：E[i] = 1/p + E[i+1]                        → a=1/p, b=1
 *   降级档  ：E[i] = 1 + p·E[i+1] + f·[(1−g)·E[i−1] + g·E[i]]
 *             代入 E[i−1] = a[i−1] + b[i−1]·E[i] 后解出：
 *             D = 1 − f·g − f·(1−g)·b[i−1]，a[i] = (1 + f·(1−g)·a[i−1])/D，b[i] = p/D
 *   i=0 降级：失败原地 → E[0] = (1 + p·E[1])/p → a=1/p, b=1
 */
function expectedAttempts(guard) {
  const a = new Array(10).fill(0)
  const b = new Array(10).fill(0)
  for (let i = 0; i < 10; i++) {
    const st = stepAt(i + 1)
    const pS = st.successRate
    const fFail = 1 - pS
    if (!st.downgrade || i === 0) {
      a[i] = 1 / pS
      b[i] = 1
      continue
    }
    const D = 1 - fFail * guard - fFail * (1 - guard) * b[i - 1]
    a[i] = (1 + fFail * (1 - guard) * a[i - 1]) / D
    b[i] = pS / D
  }
  const e = new Array(11).fill(0)
  for (let i = 9; i >= 0; i--) e[i] = a[i] + b[i] * e[i + 1]
  return e[0]
}

/** 期望材料消耗（MC：按访问次数统计每档消耗） */
function expectedMaterials(guard, trials = 40000) {
  let s = 987654321
  const rnd2 = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
  let ingots = 0
  let essences = 0
  for (let t = 0; t < trials; t++) {
    let level = 0
    let guardCount = 0
    while (level < 10 && guardCount < 1_000_000) {
      guardCount++
      const st = stepAt(level + 1)
      ingots += st.cost.ingots
      essences += st.cost.essences
      if (rnd2() < st.successRate) level += 1
      else if (st.downgrade && !(rnd2() < guard)) level = Math.max(0, level - 1)
    }
  }
  return { ingots: ingots / trials, essences: essences / trials }
}

console.log(['庇护'.padEnd(10), '期望尝试'.padStart(9), '同级锭'.padStart(8), '精华'.padStart(7)].join(' | '))
const rows = []
for (const g of [0, 0.2, 0.44]) {
  const att = expectedAttempts(g)
  const mat = expectedMaterials(g)
  rows.push({ g, att, ...mat })
  console.log([pct(g, 0).padEnd(10), f(att, 1).padStart(9), f(mat.ingots, 0).padStart(8), f(mat.essences, 0).padStart(7)].join(' | '))
}
const noGuard = rows[0]
const maxGuard = rows[rows.length - 1]
console.log(
  `→ 满配 ${pct(maxGuard.g, 0)} 庇护把强化材料削减 ${pct(1 - maxGuard.ingots / noGuard.ingots)}（锭 ${f(noGuard.ingots, 0)}→${f(maxGuard.ingots, 0)}）` +
    `、精华 ${pct(1 - maxGuard.essences / noGuard.essences)}（${f(noGuard.essences, 0)}→${f(maxGuard.essences, 0)}）`,
)
console.log('  这是 v2.1 对既有强化系统最大的单一冲击，已量化登记（设计 §6）；作为 6 槽终局投资的回报被接受')

console.log('')
console.log('═'.repeat(76))
console.log('H. 词缀对既有四条曲线的冲击（M6：经验/产量/稀有/强化材料）')
console.log('═'.repeat(76))
const LORE_CAP = capOfAffix('lore')
const PLENTY_CAP = capOfAffix('plenty')
const FORTUNE_CAP = capOfAffix('fortune')
const MIDAS_CAP = capOfAffix('midas')
const xpPerk = 0.45 // 智慧精通满级 +45%


console.log(`经验 lore：满配 +${pct(LORE_CAP)} → 与智慧精通合计 ×${f(1 + xpPerk + LORE_CAP, 2)}（v2.0 基线 ×${f(1 + xpPerk, 2)}）`)
console.log(`  → 升级时间 ×${f((1 + xpPerk) / (1 + xpPerk + LORE_CAP), 3)}（约 −${pct(1 - (1 + xpPerk) / (1 + xpPerk + LORE_CAP))}）；v2.0 发布文档的等级时间线需按此下修`)
console.log(`产量 plenty：满配 +${pct(PLENTY_CAP)} → 产出 ×${f(1 + PLENTY_CAP, 3)}`)
console.log(`效率 flow：名义 +${pct(affixEff)} → proc 倍率 ×${f(procBase, 4)} → ×${f(procFlow, 4)}，对总产出边际增益 +${pct(procFlow / procBase - 1)}（触发率口径 +${pct((procRate(E_BASE + affixEff) - procRate(E_BASE)) / procRate(E_BASE))}，勿混用）`)
console.log(`稀有 fortune：满配 +${pct(FORTUNE_CAP)} → 稀有产率 ×${f(1 + FORTUNE_CAP, 3)}（精华/小箱/重铸石同步提速）`)
console.log(`金币 midas：满配 +${pct(MIDAS_CAP)} → 回收收益 ×${f(1 + MIDAS_CAP, 3)}`)
console.log(`庇护 aegis：满配 ${pct(maxGuard.g, 0)} → 强化材料 ×${f(maxGuard.ingots / noGuard.ingots, 3)}（见 G 段）`)
console.log(
  `综合（v2.1 满配 / v2.0 满配）：吞吐 ×${f((1 + PLENTY_CAP) * (procFlow / procBase), 3)}、金币 ×${f((1 + PLENTY_CAP) * (procFlow / procBase) * (1 + MIDAS_CAP), 3)}、经验获取 ×${f(1 + LORE_CAP, 3)}`,
)
console.log('  → v2.0 审计中的等级时间线/回收期结论随之移动；v3.0 全量审计将以此为输入（已登记）')

console.log('')
console.log('═'.repeat(76))
console.log('F. 结论（写入设计文档 §3.1）')
console.log('═'.repeat(76))
console.log(`1. 词缀为加法池，满配上限 +${pct(affixSpeedMining)} 速度；叠加既有 +285% 后时长 ×${f(mult, 3)}，最速动作 ${f(fastestBase * mult, 0)}ms ≫ 250ms → 不触底、不失控 ✅`)
console.log(`2. 单件 T7 完美化（4 条全 ≥90%）≈ ${f(expect, 1)} 次重铸 / ${f(expectGold / 1000, 1)}k 金（${f(expectGold / GOLD_PER_HOUR[7], 1)} 小时产金）/ ${f(expectStone, 0)} 重铸石（${f(expectStone / stonePerHourFull, 1)} 小时满配采集）`)
console.log(`3. 十槽完美化 ≈ ${f((expectGold * 10) / 1000, 0)}k 金 + ${f(expectStone * 10, 0)} 重铸石 → 约为终局 ${f((expectGold * 10) / GOLD_PER_HOUR[7], 0)} 小时产出，作为长线追逐目标合理 ✅`)
console.log('4. 重铸造价占该档产金/时 4.1%(T2)~12.7%(T7)：前中期相对便宜（鼓励早期就洗）、终局约 1/8 小时/次，趋势单调不跳变 ✅')
console.log(`5. 门禁归属（评审 M3）：精华产出充裕（终局 ≈268/时，远大于需求）→ 实际门槛是「前中期金币 / 终局重铸石」，文档如实表述`)
console.log(`6. 完美阈值口径（评审 M5）：本模拟的「≥90%」是玩家追逐目标；内容表 perfectThreshold=0.95 用于成就/高亮，两者不同且均已显式声明`)
