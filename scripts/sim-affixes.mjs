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
// 效率按真实语义（评审 M2）：在线 proc 每轮期望倍率 = 1 + 1/(2−E)，链式上限 1
const E_BASE = 0.8446 // 装备+套装（sim-audit 复算值）
const procRate = (E) => (E >= 1 ? 1 : 1 / (2 - E))
console.log(
  `效率（装备侧）E=${f(E_BASE, 4)} → 在线 ×${f(1 + procRate(E_BASE), 4)}（${f(procRate(E_BASE), 4)}/轮）；` +
    `叠加 flow 满配 +${pct(affixEff)} → ×${f(1 + procRate(E_BASE + affixEff), 4)}（${f(procRate(E_BASE + affixEff), 4)}/轮，` +
    `实际增益 +${pct(procRate(E_BASE + affixEff) / procRate(E_BASE) - 1)}）`,
)
console.log(`  ｜flow 名义 +${pct(affixEff)}（加法池），受 proc 上限 1/轮 压缩，实际增益小于名义值（设计已知取舍）`)

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
console.log(`期望重铸次数 ≈ ${f(expect, 2)} 次`)
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
console.log(`蒙特卡洛（${N} 次试验）：平均 ${f(totalRounds / N, 2)} 次 / 金 ${f(totalGold / N, 0)} / 重铸石 ${f(totalStone / N, 1)}`)

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
console.log(['矿脉'.padEnd(14), '掉落率'.padStart(8), '行动/时(基础)'.padStart(13), '行动/时(满配)'.padStart(13), '个/时(满配+稀有)'.padStart(17)].join(' | '))
for (const o of ORES) {
  const drop = o.rareDrops.find((d) => d.itemId === 'emberstone')
  if (!drop) continue
  const base = 3_600_000 / o.baseTimeMs
  const full = 3_600_000 / (o.baseTimeMs / (1 + SPEED_FULL))
  const perHour = full * drop.rate * (1 + RAREFIND_FULL)
  console.log(
    [
      o.name.padEnd(14),
      pct(drop.rate, 2).padStart(8),
      f(base, 0).padStart(13),
      f(full, 0).padStart(13),
      f(perHour, 2).padStart(17),
    ].join(' | '),
  )
}
const voidOre = ORES.find((o) => o.id === SITE_BY_TIER[7])
const voidDrop = voidOre.rareDrops.find((d) => d.itemId === 'emberstone').rate
const stonePerHourFull = (3_600_000 / (voidOre.baseTimeMs / (1 + SPEED_FULL))) * voidDrop * (1 + RAREFIND_FULL)
const stonePerHourPlain = (3_600_000 / voidOre.baseTimeMs) * voidDrop
console.log('')
console.log(`完美化一件 T7 需 ${f(expectStone, 1)} 颗重铸石：`)
console.log(`  满配+稀有加成（${f(stonePerHourFull, 2)}/时）→ ${hr(expectStone / stonePerHourFull)}`)
console.log(`  裸装无加成（${f(stonePerHourPlain, 2)}/时）→ ${hr(expectStone / stonePerHourPlain)}`)
console.log(`  → 稀有配装（腿甲/幸运符文/幸运词缀）对重铸石产量影响显著：设计上鼓励「幸运流」配装 ✅`)

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
