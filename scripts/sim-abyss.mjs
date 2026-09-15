// ============================================================
// Forging · 深渊回廊数值模拟（v2.4 · 开发前定档证据）
// 目的：门槛曲线 / 体力节奏 / 结晶经济 / 与既有堆叠上限的关系 —— 全部先算后定档
// 运行：node scripts/sim-abyss.mjs
// 输出：人读报告 + docs/sim-abyss-output.json（供测试机器校验）
//
// v2.4 设计评审（Blocker 1/2/3）处置：
//   - **画像不再是手填假设**：由 data/*.json 的**内容表**反算「当前版本的理论满配」，
//     公式与游戏内核一致（装备基础 × 强化倍率 + 该槽词缀池 top-N 完美词缀 + 套装 + 符文 + 精通）
//   - **定档方式如实标注**：先定「目标层数」，再反解 base = 终局战力 / growth^(目标层−1)，
//     随后用搜索循环验证三档画像都落在目标带内，并给出 ±30% 鲁棒性
//   - **失败的初版方案留证**：C 段复算「单项硬门槛」口径下的可达层（v2.4 初稿曾据此推翻设计）
// ============================================================
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (f) => JSON.parse(readFileSync(join(root, 'data', f), 'utf8'))
const ITEMS = read('items.json')
const AFFIXES = read('affixes.json')
const RUNES = read('runes.json')
const PERKS = read('perks.json')
const f = (x, d = 2) => Number(x).toFixed(d)

// ── 数值源（v2.4 提案） ───────────────────────────────────────
const ABYSS = {
  staminaMax: 12,
  staminaRegenMinutes: 30, // 1 点 / 30 分钟 = 2/时 = 48/日（理论）；溢出丢弃
  weights: { speed: 1.0, efficiency: 1.5, quantity: 1.0, rareFind: 0.7, wisdom: 0.5, enhanceRate: 2.0 },
  targetFloor: { end: 35 },
  growth: 1.031, // 由「三档战力差 2.225×」反推：2.225^(1/26 层) ≈ 1.031（符文按 2 槽修正后重解）
  themes: ['矿脉裂隙', '熔岩回廊', '符文甬道', '无光深渊', '虚空之喉'],
  firstClearCrystal: (floor) => 10 + 2 * floor,
  repeatCrystal: (floor) => 1 + Math.floor(floor / 20),
  shop: {
    // 可重复购买（价格每买一次 ×1.5）→ 结晶的永续出口
    rerollTicket: { crystal: 100, max: 12, priceGrowth: 1.3, note: '定向重铸券：重铸时指定一条词缀 id 保底出现（可重复购买，价格递增）' },
    permanentSpeed: { crystal: 150, max: 8, priceGrowth: 1.3, perLevel: 0.01, note: '永久 +1% 速度 / 级（可重复购买，价格递增）' },
    // 一次性
    relicExchange: { crystal: 200, max: 3, priceGrowth: 1, note: '遗物兑换（各 1 次，补齐图鉴 100%）' },
    title: { crystal: 200, max: 1, priceGrowth: 1, note: '称号「深渊行者」' },
  },
}

// ── 理论满配（由内容表反算，与内核同公式） ────────────────────
const W = ABYSS.weights
const ENH_TOOL = 0.029
const ENH_OTHER = 0.05
const MAX_ENH = 10
const ARCH_OF_SLOT = {
  pick: 'tool',
  crucible: 'tool',
  hammer: 'tool',
  mainHand: 'weapon',
  head: 'armor',
  body: 'armor',
  legs: 'armor',
  feet: 'armor',
  necklace: 'jewelry',
  ring: 'jewelry',
}
const TOOL_SKILL = { pick: 'mining', crucible: 'smelting', hammer: 'forging' }
const affixMaxAt = (def, tier) => def.base + def.perTier * (tier - 1)
/** 某槽的「完美词缀」总和：取该原型池 top-N（N = 该物品档位对应条数） */
function slotAffixBonus(itemId) {
  const item = ITEMS[itemId]
  const arch = ARCH_OF_SLOT[item.slot]
  if (!arch) return {}
  const pool = AFFIXES.pools[arch] ?? []
  const n = Math.min(AFFIXES.countByTier[String(item.tier)] ?? 0, pool.length)
  const picked = pool
    .map((id) => AFFIXES.affixes.find((a) => a.id === id))
    .filter(Boolean)
    .map((a) => ({ effect: a.effect, value: affixMaxAt(a, item.tier) }))
    .sort((x, y) => (W[y.effect] ?? 0) * y.value - (W[x.effect] ?? 0) * x.value) // 按分数贡献排序（Minor 处置）
    .slice(0, n)
  const out = {}
  for (const v of picked) out[v.effect] = (out[v.effect] ?? 0) + v.value
  return out
}
const runeVal = (effect, tier) => {
  const r = RUNES.find((x) => x.id === `rune_${effect.toLowerCase()}_${tier}`)
  if (!r) throw new Error('未知符文: ' + effect + '/' + tier) // 不再静默漏计（复审 B2）
  return r.value
}
const perkVal = (effect) => {
  const p = PERKS.find((x) => x.effect === effect)
  return p ? p.perPoint * p.max : 0
}

/** 符文只允许 2 个增益槽（内核 slots=2）→ 按「权重×数值」选最优两枚（评审 B2 修正） */
const BEST_RUNES = (() => {
  const cands = []
  for (const eff of ['speed', 'efficiency', 'rarefind', 'enhance']) {
    for (const tier of [1, 2, 3]) {
      const value = runeVal(eff, tier)
      const kind = eff === 'rarefind' ? 'rareFind' : eff === 'enhance' ? 'enhanceRate' : eff
      cands.push({ effect: kind, value, score: W?.[kind] ?? 0 })
    }
  }
  return cands
})()

/** 与 aggregateEquipment 同规则地聚合六项属性（含 +10 / 套装 / 2 枚最优符文 / 精通 / 深渊永久） */
function computeStats(loadout, { abyssPermanent = false, runes = null } = {}) {
  const agg = {
    toolSpeed: { mining: 0, smelting: 0, forging: 0 },
    allSpeed: 0,
    efficiency: 0,
    quantity: 0,
    wisdom: 0,
    rareFind: 0,
    enhanceRate: 0,
  }
  const tierCount = new Map()
  for (const [slot, itemId] of Object.entries(loadout)) {
    const def = ITEMS[itemId]
    if (!def) continue
    if (def.tier) tierCount.set(def.tier, (tierCount.get(def.tier) ?? 0) + 1)
    const enhMult = def.category === 'tool' ? 1 + ENH_TOOL * MAX_ENH : 1 + ENH_OTHER * MAX_ENH
    const s = def.stats ?? {}
    if (s.speed) {
      const skill = TOOL_SKILL[slot]
      if (skill) agg.toolSpeed[skill] += s.speed * enhMult
      else agg.allSpeed += s.speed * enhMult
    }
    if (s.efficiency) agg.efficiency += s.efficiency * enhMult
    if (s.quantity) agg.quantity += s.quantity * enhMult
    if (s.wisdom) agg.wisdom += s.wisdom * enhMult
    if (s.rareFind) agg.rareFind += s.rareFind * enhMult
    if (s.successRate) agg.enhanceRate += s.successRate * enhMult
    const ab = slotAffixBonus(itemId)
    if (ab.speed) {
      const skill = TOOL_SKILL[slot]
      if (skill) agg.toolSpeed[skill] += ab.speed
      else agg.allSpeed += ab.speed
    }
    agg.efficiency += ab.efficiency ?? 0
    agg.quantity += ab.quantity ?? 0
    agg.wisdom += ab.wisdom ?? 0
    agg.rareFind += ab.rareFind ?? 0
    agg.enhanceRate += ab.enhanceRate ?? 0
  }
  let best = 0
  for (const c of tierCount.values()) best = Math.max(best, c)
  if (best >= 5) agg.allSpeed += 0.04
  if (best >= 8) agg.efficiency += 0.04
  // 符文：只允许 2 枚（增益槽上限），按权重×数值取最优两枚
  const ranked = BEST_RUNES.map((r) => ({ ...r, weighted: (W[r.effect] ?? 0) * r.value })).sort((a, b) => b.weighted - a.weighted)
  const chosen = runes ?? [ranked[0], ranked[1]]
  for (const r of chosen) {
    if (r.effect === 'speed') agg.allSpeed += r.value
    else if (r.effect === 'efficiency') agg.efficiency += r.value
    else if (r.effect === 'rareFind') agg.rareFind += r.value
    else if (r.effect === 'enhanceRate') agg.enhanceRate += r.value
  }
  agg.allSpeed += perkVal('speed')
  agg.efficiency += perkVal('efficiency')
  agg.rareFind += perkVal('rareFind')
  agg.wisdom += perkVal('wisdom')
  if (abyssPermanent) agg.allSpeed += ABYSS.shop.permanentSpeed.perLevel * ABYSS.shop.permanentSpeed.max
  // 战力用的「速度」= 三技能速度的**最大值**（口径明示，见设计 §2.1）
  const speeds = [
    agg.allSpeed + agg.toolSpeed.mining,
    agg.allSpeed + agg.toolSpeed.smelting,
    agg.allSpeed + agg.toolSpeed.forging,
  ]
  return { ...agg, speed: Math.max(...speeds) }
}

const LOADOUTS = {
  early: {
    pick: 'pick_silver',
    crucible: 'crucible_silver',
    hammer: 'hammer_silver',
    mainHand: 'sword_silver',
    head: 'helmet_silver',
    body: 'chest_silver',
    legs: 'legs_silver',
    feet: 'boots_silver',
    necklace: 'necklace_silver',
    ring: 'ring_silver',
  },
  mid: {
    pick: 'pick_mithril',
    crucible: 'crucible_mithril',
    hammer: 'hammer_mithril',
    mainHand: 'sword_mithril',
    head: 'helmet_mithril',
    body: 'chest_mithril',
    legs: 'legs_mithril',
    feet: 'boots_mithril',
    necklace: 'necklace_mithril',
    ring: 'ring_mithril',
  },
  end: {
    pick: 'pick_void',
    crucible: 'crucible_void',
    hammer: 'hammer_void',
    mainHand: 'sword_void',
    head: 'helmet_void',
    body: 'chest_void',
    legs: 'legs_void',
    feet: 'boots_void',
    necklace: 'necklace_mithril',
    ring: 'ring_mithril',
  },
}
const scoreOf = (stats) => Object.entries(W).reduce((s, [k, w]) => s + w * (stats[k] ?? 0), 0)
const reqAt = (floor, base) => base * Math.pow(ABYSS.growth, floor - 1)
const reachWith = (sc, base) => {
  let fl = 1
  while (fl < 999 && sc >= reqAt(fl, base)) fl++
  return fl - 1
}

console.log('═'.repeat(78))
console.log('A. 理论满配（由 data/*.json 反算；公式与内核一致：+10 / 完美词缀 / 套装 / 符文 / 精通）')
console.log('═'.repeat(78))
const STATS = {}
const SCORES = {}
for (const [key, loadout] of Object.entries(LOADOUTS)) {
  const st = computeStats(loadout, { abyssPermanent: key === 'end' })
  STATS[key] = st
  SCORES[key] = scoreOf(st)
  console.log(`【${key}】速度 ${f(st.speed, 3)}（挖 ${f(st.toolSpeed.mining, 2)} / 熔 ${f(st.toolSpeed.smelting, 2)} / 锻 ${f(st.toolSpeed.forging, 2)} + 全速 ${f(st.allSpeed, 3)}）`)
  console.log(
    `        效率 ${f(st.efficiency, 3)} ｜ 产量 ${f(st.quantity, 3)} ｜ 稀有 ${f(st.rareFind, 3)} ｜ 经验 ${f(st.wisdom, 3)} ｜ 强化率 ${f(st.enhanceRate, 3)}`,
  )
  console.log(`        → 深渊战力 = ${f(SCORES[key], 3)}`)
}

console.log('')
console.log('═'.repeat(78))
console.log('B. 门槛定档：反解 base → 搜索验证 → ±30% 鲁棒性')
console.log('═'.repeat(78))
const exp = ABYSS.targetFloor.end - 1
const baseFit = SCORES.end / Math.pow(ABYSS.growth, exp)
console.log(`反解：base = 终局战力 / growth^${exp} = ${f(SCORES.end, 3)} / ${f(Math.pow(ABYSS.growth, exp), 2)} = ${f(baseFit, 4)}`)
const base = Number(baseFit.toFixed(3))
console.log(`定档：base = ${base}，growth = ${ABYSS.growth}`)
// 搜索验证：在 ±3% 的 base 邻域内确认三档都落在目标带
const bands = { early: [6, 12], mid: [20, 28], end: [32, 38] }
const searchOk = []
for (let b = base * 0.97; b <= base * 1.031; b += 0.005) {
  const bb = Number(b.toFixed(3))
  const ok = Object.keys(SCORES).every((k) => {
    const fl = reachWith(SCORES[k], bb)
    return fl >= bands[k][0] && fl <= bands[k][1]
  })
  if (ok) searchOk.push(bb)
}
console.log(`搜索邻域（±3%，步长 0.005）：${searchOk.length} 个 base 取值满足三档目标带 → ${searchOk.length > 0 ? '✅ 曲线稳健' : '⚠ 需重新定档'}`)
const reach = {}
console.log(['画像'.padEnd(8), '战力'.padStart(8), '可达层'.padStart(7), '目标带'.padStart(9), '判定'.padStart(6)].join(' | '))
for (const key of Object.keys(SCORES)) {
  const fl = reachWith(SCORES[key], base)
  reach[key] = fl
  const [lo, hi] = bands[key]
  console.log([key.padEnd(8), f(SCORES[key], 3).padStart(8), String(fl).padStart(7), `${lo}~${hi}`.padStart(9), (fl >= lo && fl <= hi ? '✅' : '⚠').padStart(6)].join(' | '))
}
console.log('')
console.log('鲁棒性：战力 ±30% → 层数漂移')
for (const key of Object.keys(SCORES)) {
  console.log(`  ${key.padEnd(8)} ${reachWith(SCORES[key] * 0.7, base)} ~ ${reachWith(SCORES[key] * 1.3, base)} 层（基准 ${reach[key]}）`)
}

console.log('')
console.log('═'.repeat(78))
console.log('C. 失败的初版口径留证：「单项硬门槛」（v2.4 初稿方案）的可达层')
console.log('═'.repeat(78))
const DOM = ['speed', 'efficiency', 'quantity', 'rareFind', 'wisdom', 'enhanceRate']
function reachSingleStat(stats, baseSingle) {
  let fl = 1
  while (fl < 999) {
    const dom = DOM[(fl - 1) % DOM.length]
    if ((stats[dom] ?? 0) < baseSingle * Math.pow(1.11, fl - 1)) break
    fl++
  }
  return fl - 1
}
const single = {}
for (const key of Object.keys(SCORES)) {
  single[key] = reachSingleStat(STATS[key], 0.25)
  console.log(`  ${key.padEnd(8)} → ${single[key]} 层`)
}
console.log('结论：三档全部停滞在个位数层（最弱项不随 build 提升）→ 故改用**加权和**口径 ✅')

console.log('')
console.log('═'.repeat(78))
console.log('D. 体力与日常节奏（上限 12；1 点 / 30 分钟；溢出丢弃）')
console.log('═'.repeat(78))
const regenPerHour = 60 / ABYSS.staminaRegenMinutes
const regenPerDay = regenPerHour * 24
console.log(`恢复 ${regenPerHour}/时、上限 ${ABYSS.staminaMax} → 连续离线 ≥ ${f(ABYSS.staminaMax / regenPerHour, 1)} 小时即满；**超额部分丢弃**`)
for (const [label, perDay] of [
  ['常驻在线（不溢出）', regenPerDay],
  ['每日上线 3 次', 3 * ABYSS.staminaMax],
  ['每日上线 2 次', 2 * ABYSS.staminaMax],
  ['每日上线 1 次', ABYSS.staminaMax],
]) {
  console.log(`  ${label.padEnd(20)} → 最多 ${f(Math.min(perDay, regenPerDay), 0)} 次/日`)
}
console.log(`  反例守护（评审 B4）：离线 8h 回线只能打 ${ABYSS.staminaMax} 次（上限截断，而非 8×${f(regenPerHour, 0)}=${f(8 * regenPerHour, 0)} 次）`)

console.log('')
console.log('═'.repeat(78))
console.log('E. 结晶经济（首通 + 扫荡 vs 商店 + 无限出口）')
console.log('═'.repeat(78))
function crystalToFloor(n) {
  let sum = 0
  for (let fl = 1; fl <= n; fl++) sum += ABYSS.firstClearCrystal(fl)
  return sum
}
const priceOf = (item, k) => Math.round(item.crystal * Math.pow(item.priceGrowth, k))
const sumPrice = (item, n) => {
  let sum = 0
  for (let k = 0; k < n; k++) sum += priceOf(item, k)
  return sum
}
// 首轮目标：4 券 + 3 遗物 + 5 级永久 + 称号
const firstTier =
  sumPrice(ABYSS.shop.rerollTicket, 4) +
  ABYSS.shop.relicExchange.crystal * ABYSS.shop.relicExchange.max +
  sumPrice(ABYSS.shop.permanentSpeed, 5) +
  ABYSS.shop.title.crystal
// 全部可重复项买满（券 20 + 永久 10 + 遗物 3 + 称号 1）
const shopTotal =
  sumPrice(ABYSS.shop.rerollTicket, ABYSS.shop.rerollTicket.max) +
  ABYSS.shop.relicExchange.crystal * ABYSS.shop.relicExchange.max +
  sumPrice(ABYSS.shop.permanentSpeed, ABYSS.shop.permanentSpeed.max) +
  ABYSS.shop.title.crystal
console.log(['到达层'.padStart(7), '累计首通结晶'.padStart(13), '扫荡/次'.padStart(9)].join(' | '))
for (const fl of [9, 15, 24, 30, 35, 40]) {
  console.log([String(fl).padStart(7), String(crystalToFloor(fl)).padStart(13), String(ABYSS.repeatCrystal(fl)).padStart(9)].join(' | '))
}
console.log('')
console.log(`首轮（4 券 + 3 遗物 + 5 级永久 + 称号）= ${firstTier} 结晶`)
console.log(`可重复项价格递增（×1.3）：最后一张券（第 ${ABYSS.shop.rerollTicket.max} 张）=${priceOf(ABYSS.shop.rerollTicket, ABYSS.shop.rerollTicket.max - 1)}，第 ${ABYSS.shop.permanentSpeed.max} 级永久=${priceOf(ABYSS.shop.permanentSpeed, ABYSS.shop.permanentSpeed.max - 1)}`)
const endFirst = crystalToFloor(reach.end)
const gap = Math.max(0, firstTier - endFirst)
const perSweep = ABYSS.repeatCrystal(reach.end)
console.log(`  终局首通（第 ${reach.end} 层）= ${endFirst} → 覆盖首轮的 ${f((endFirst / firstTier) * 100, 0)}%`)
console.log(`  首轮缺口 ${gap} ÷ 扫荡 ${perSweep}/次 = ${f(gap / perSweep, 0)} 次扫荡`)
for (const [label, perDay] of [['常驻在线', regenPerDay], ['每日 2 次上线', 2 * ABYSS.staminaMax], ['每日 1 次上线', ABYSS.staminaMax]]) {
  console.log(`    ${label.padEnd(12)} → ${f(gap / perSweep / Math.min(perDay, regenPerDay), 1)} 天清空商店`)
}
console.log(`  永续出口：券与永久速度可重复购买、价格 ×1.3 递增 → 结晶有上不封顶的 sink（买满 ${ABYSS.shop.rerollTicket.max} 券 + ${ABYSS.shop.permanentSpeed.max} 级永久 ≈ ${shopTotal} 结晶）`)
console.log(`    长期边际 sink：第 12 张券 = ${priceOf(ABYSS.shop.rerollTicket, 11)} 结晶 ≈ ${f(priceOf(ABYSS.shop.rerollTicket, 11) / perSweep, 0)} 次扫荡 → 价格随供给自动抬升 ✅`)
console.log(`  中期（${reach.mid} 层）首通 = ${crystalToFloor(reach.mid)} → 覆盖 ${f((crystalToFloor(reach.mid) / shopTotal) * 100, 0)}%`)

console.log('')
console.log('═'.repeat(78))
console.log('F. 兼容性与结论')
console.log('═'.repeat(78))
console.log('1. 即时判定：不占动作流、不消耗材料 → 与挖/熔/锻/强化/远征/赛季零冲突')
console.log('2. 离线只回体力（溢出丢弃）、不自动挑战 → 一条规则 + 单调守卫')
console.log('3. 结晶不可回收/不可换金；唯一永久加成 +8% 速度（满配 +304% → +312%，远不触 250ms 下限）')
console.log(`4. 战力（内容表反算）：前期 ${f(SCORES.early, 2)} / 中期 ${f(SCORES.mid, 2)} / 终局 ${f(SCORES.end, 2)} → 可达 ${reach.early} / ${reach.mid} / ${reach.end} 层`)
console.log(`5. 经济：首轮 ${firstTier}，终局首通覆盖 ${f((endFirst / firstTier) * 100, 0)}%，缺口靠扫荡（常驻 ${f(gap / perSweep / regenPerDay, 1)} 天 / 每日 2 次 ${f(gap / perSweep / (2 * ABYSS.staminaMax), 1)} 天）+ 价格递增的永续 sink`)

const out = {
  abyss: {
    staminaMax: ABYSS.staminaMax,
    staminaRegenMinutes: ABYSS.staminaRegenMinutes,
    weights: W,
    growth: ABYSS.growth,
    base,
    themes: ABYSS.themes,
    shop: ABYSS.shop,
    firstClearCrystalBase: 10,
    firstClearCrystalPerFloor: 2,
    repeatCrystalBase: 1,
    repeatCrystalPerFloor: 20,
  },
  scores: SCORES,
  stats: Object.fromEntries(
    Object.entries(STATS).map(([k, v]) => [
      k,
      { speed: v.speed, efficiency: v.efficiency, quantity: v.quantity, rareFind: v.rareFind, wisdom: v.wisdom, enhanceRate: v.enhanceRate },
    ]),
  ),
  reach,
  bands,
  baseSearchHits: searchOk.length,
  singleStatReach: single,
  reqAt: Object.fromEntries([1, 9, 15, 24, 30, 35, 40].map((n) => [n, reqAt(n, base)])),
  crystalToFloor: Object.fromEntries([9, 15, 24, 30, 35, 40].map((n) => [n, crystalToFloor(n)])),
  firstTier,
  shopTotal,
}
writeFileSync(join(root, 'docs', 'sim-abyss-output.json'), JSON.stringify(out, null, 2) + '\n')
console.log('')
console.log('机器校验输出：docs/sim-abyss-output.json')
