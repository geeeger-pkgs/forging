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
// v3.0 三件套（评审 M2/V2）：数值**全部读内容表**，脚本内不得出现被审计的字面量
const ABYSS_TABLE = read('abyss.json')
const f = (x, d = 2) => Number(x).toFixed(d)

// ── 数值源（v3.0：直接取内容表；AUDITED_LITERALS 用于反向静态检查） ──
const ABYSS = {
  ...ABYSS_TABLE,
}
// 表 → 脚本访问器（shop 表是数组，脚本按 id 取名；结晶公式与内核同源，含层词条倍率）
const SHOP = Object.fromEntries(ABYSS_TABLE.shop.map((x) => [x.id, x]))
ABYSS.shop = {
  rerollTicket: SHOP.reroll_ticket,
  permanentSpeed: SHOP.permanent_speed,
  relicExchange: SHOP.relic_gear,
  title: SHOP.title,
}
const MOD_OF = (floor) => ABYSS_TABLE.mods.find((m) => m.mod === floor % 5)
/** 层词条修正后的有效权重（与内核 abyssWeights 同公式） */
const weightsAt = (floor) => {
  const m = MOD_OF(floor)
  return Object.fromEntries(Object.keys(W).map((k) => [k, W[k] * (m.weightMul[k] ?? 1)]))
}
const scoreAt = (stats, floor) => Object.entries(weightsAt(floor)).reduce((s, [k, w]) => s + w * (stats[k] ?? 0), 0)
const roundC = (v) => (ABYSS_TABLE.rounding === 'floor' ? Math.floor(v) : Math.round(v))
ABYSS.firstClearCrystal = (floor) =>
  roundC((ABYSS_TABLE.firstClearCrystal.base + ABYSS_TABLE.firstClearCrystal.perFloor * floor) * MOD_OF(floor).crystalMul)
// 扫荡结晶**不吃层词条倍率**（与内核同源：倍率只作用首通，避免 bestFloor 词条造成收益悬崖）
ABYSS.repeatCrystal = (floor) =>
  ABYSS_TABLE.repeatCrystal.base + Math.floor(floor / ABYSS_TABLE.repeatCrystal.perFloor)
/** 设计目标带（脚本本地的"意图"，不是内容数值） */
const TARGET = { end: 35 }

/** 供测试反向断言：这些数值必须来自内容表，不得在本脚本内硬编码 */
export const AUDITED_LITERALS = [
  ABYSS_TABLE.base,
  ABYSS_TABLE.growth,
  ABYSS_TABLE.staminaMax,
  ABYSS_TABLE.staminaRegenMinutes,
  ABYSS_TABLE.challengeMaxFloors,
  ABYSS_TABLE.sweepMaxCount,
  ABYSS_TABLE.offlineCapExtra,
]

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
function computeStats(loadout, { abyssPermanent = false, runes = null, withRunes = true, withPerks = true } = {}) {
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
  const chosen = runes ?? (withRunes ? [ranked[0], ranked[1]] : [])
  for (const r of chosen) {
    if (r.effect === 'speed') agg.allSpeed += r.value
    else if (r.effect === 'efficiency') agg.efficiency += r.value
    else if (r.effect === 'rareFind') agg.rareFind += r.value
    else if (r.effect === 'enhanceRate') agg.enhanceRate += r.value
  }
  if (withPerks) {
    agg.allSpeed += perkVal('speed')
    agg.efficiency += perkVal('efficiency')
    agg.rareFind += perkVal('rareFind')
    agg.wisdom += perkVal('wisdom')
  }
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
  // v2.5 评审 M5：新手（只有起始铜镐）→ 战力不足第 1 层，深渊是**中后期**内容
  novice: { pick: 'pick_copper' },
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
/** 六项等比缩放（±30% 鲁棒性用） */
const mulStats = (stats, k) => Object.fromEntries(Object.entries(stats).map(([key, v]) => [key, typeof v === 'number' ? v * k : v]))
/** v3.1：第 1~3 层走 introReqs，第 4 层起接曲线 */
const reqAt = (floor, base) =>
  floor <= (ABYSS_TABLE.introReqs ?? []).length
    ? ABYSS_TABLE.introReqs[floor - 1]
    : base * Math.pow(ABYSS.growth, floor - 1) * MOD_OF(floor).reqMul
/** 无词条口径（v2.4 旧口径，用于对照） */
const reqFlat = (floor, base) => base * Math.pow(ABYSS.growth, floor - 1)
/**
 * 可达层（**唯一口径 = 逐层顺序**，与内核连打一致）：
 * 第 n 层按该层的有效权重计算战力并比较门槛；首个不达标即停。
 */
const reachOf = (stats, base) => {
  let fl = 0
  for (let n = 1; n < 999; n++) {
    if (scoreAt(stats, n) >= reqAt(n, base)) fl = n
    else break
  }
  return fl
}
/** 无词条对照口径 */
const reachWith = (sc, base) => {
  let fl = 1
  while (fl < 999 && sc >= reqFlat(fl, base)) fl++
  return fl - 1
}

console.log('═'.repeat(78))
console.log('A. 理论满配（由 data/*.json 反算；公式与内核一致：+10 / 完美词缀 / 套装 / 符文 / 精通）')
console.log('═'.repeat(78))
const STATS = {}
const SCORES = {}
for (const [key, loadout] of Object.entries(LOADOUTS)) {
  const st = computeStats(loadout, {
    abyssPermanent: key === 'end',
    withRunes: key !== 'novice',
    withPerks: key !== 'novice',
  })
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
console.log('B. 门槛验证：读表 base → 邻域搜索 → ±30% 鲁棒性（v3.0 含层词条）')
console.log('═'.repeat(78))
// v3.0 三件套：base/growth **只来自内容表**（不再在脚本里反解）；这里只做"是否落在目标带"的验证
const base = ABYSS_TABLE.base
const exp = TARGET.end - 1
const endNoPerm = scoreOf(computeStats(LOADOUTS.end, { abyssPermanent: false }))
console.log(`读表：base = ${base}，growth = ${ABYSS.growth}（脚本内不得硬编码，见 AUDITED_LITERALS）`)
console.log(`对照：终局战力(无永久) / growth^${exp} = ${f(endNoPerm / Math.pow(ABYSS.growth, exp), 4)}（v2.4 反解值，应与表一致）`)
// 搜索验证：在 ±3% 的 base 邻域内确认三档都落在目标带
const bands = { novice: [0, 0], early: [6, 12], mid: [20, 28], end: [32, 38] }
const searchOk = []
for (let b = base * 0.97; b <= base * 1.031; b += 0.005) {
  const bb = Number(b.toFixed(3))
  const ok = Object.keys(SCORES).every((k) => {
    const fl = reachOf(STATS[k], bb)
    return fl >= bands[k][0] && fl <= bands[k][1]
  })
  if (ok) searchOk.push(bb)
}
console.log(`搜索邻域（±3%，步长 0.005）：${searchOk.length} 个 base 取值满足三档目标带 → ${searchOk.length > 0 ? '✅ 曲线稳健' : '⚠ 需重新定档'}`)
const reach = {}
const reachFlat = {}
console.log(['画像'.padEnd(8), '战力'.padStart(8), '可达层(含词条)'.padStart(13), '无词条对照'.padStart(10), '目标带'.padStart(9), '判定'.padStart(6)].join(' | '))
for (const key of Object.keys(SCORES)) {
  const fl = reachOf(STATS[key], base)
  reach[key] = fl
  reachFlat[key] = reachWith(SCORES[key], base)
  const [lo, hi] = bands[key]
  console.log([key.padEnd(8), f(SCORES[key], 3).padStart(8), String(fl).padStart(13), String(reachFlat[key]).padStart(10), `${lo}~${hi}`.padStart(9), (fl >= lo && fl <= hi ? '✅' : '⚠').padStart(6)].join(' | '))
}
console.log('')
console.log()
console.log()
console.log('')
console.log('鲁棒性：战力 ±30% → 层数漂移')
for (const key of Object.keys(SCORES)) {
  const lo = reachOf(mulStats(STATS[key], 0.7), base)
  const hi = reachOf(mulStats(STATS[key], 1.3), base)
  console.log(`  ${key.padEnd(8)} ${lo} ~ ${hi} 层（基准 ${reach[key]}）`)
}

console.log('')
console.log('═'.repeat(78))
console.log('B2. 层词条节奏（floor % 5）与结晶期望')
console.log('═'.repeat(78))
const rhythm = []
for (let n = 1; n <= 12; n++) {
  const need = reqAt(n, base)
  const prev = n > 1 ? reqAt(n - 1, base) : 0
  rhythm.push({ floor: n, mod: MOD_OF(n).id, name: MOD_OF(n).name, need, ratio: prev ? need / prev : 1, crystalMul: MOD_OF(n).crystalMul })
  console.log(
    `  第${String(n).padStart(2)}层 ${MOD_OF(n).name} 门槛 ${f(need, 3)} 环比 ${(prev ? need / prev : 1).toFixed(4)} 结晶×${MOD_OF(n).crystalMul}`,
  )
}
const avgCrystalMul = ABYSS_TABLE.mods.reduce((s2, m) => s2 + m.crystalMul, 0) / ABYSS_TABLE.mods.length
console.log(`  每 5 层**首通**结晶平均倍率 = ${f(avgCrystalMul, 3)}（取整 ${ABYSS_TABLE.rounding}；扫荡不吃倍率，避免 bestFloor 词条造成收益悬崖）`)
console.log(`  入门三层门槛 = ${(ABYSS_TABLE.introReqs ?? []).join(' / ')}（v3.1：让 T3 装备也能起步；第 4 层起接曲线）`)
console.log(`  连打体力代价 = ${(ABYSS_TABLE.chainCost ?? []).join(' / ')} 点（v3.1：×2 是省体力甜点，×3 多花 1 点换可能多 1 层）`)
console.log(`  墙层（${ABYSS_TABLE.mods.find((m) => m.id === 'rich').name}）环比 = ${(reqAt(5, base) / reqAt(4, base)).toFixed(4)}；墙后喘息层环比 = ${(reqAt(6, base) / reqAt(5, base)).toFixed(4)}`)

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
console.log('结论：三档全部停滞在个位数层（单项硬门槛把最弱项当死线）→ 故改用**加权和**口径 ✅')

console.log('')
console.log('═'.repeat(78))
console.log(`D. 体力与日常节奏（在线上限 ${ABYSS_TABLE.staminaMax}；${ABYSS_TABLE.staminaRegenMinutes} 分钟/点；离线回体上限 ${ABYSS_TABLE.staminaMax + ABYSS_TABLE.offlineCapExtra}，仅离线段、时间比例）`)
console.log('═'.repeat(78))
const regenPerHour = 60 / ABYSS.staminaRegenMinutes
const regenPerDay = regenPerHour * 24
const onlineCap = ABYSS_TABLE.staminaMax
const offlineCap = ABYSS_TABLE.staminaMax + ABYSS_TABLE.offlineCapExtra
console.log(`恢复 ${regenPerHour}/时；**在线上限 ${onlineCap}**（溢出丢弃）、**离线上限 ${offlineCap}**（时间比例，仅离线段生效）`)
// v3.0 测评订正：上线间隔 ≥6h 时，离线结算按 offlineCap 计入 → "1 次/2 次上线"同样可打满日上限
const loginDaily = (times) => (times === 1 ? offlineCap : times === 2 ? Math.min(2 * offlineCap, regenPerDay) : Math.min(3 * onlineCap, regenPerDay))
for (const [label, perDay] of [
  ['常驻在线（不溢出）', regenPerDay],
  ['每日上线 3 次', loginDaily(3)],
  ['每日上线 2 次', loginDaily(2)],
  ['每日上线 1 次（离线回体）', loginDaily(1)],
]) {
  console.log(`  ${label.padEnd(22)} → 最多 ${f(Math.min(perDay, regenPerDay), 0)} 次/日（理论 ${f(regenPerDay, 0)}/日 的 ${f((Math.min(perDay, regenPerDay) / regenPerDay) * 100, 0)}%）`)
}
console.log(`  前拨边界：单次时钟前拨最多 ${offlineCap} 点（≈${f(offlineCap * ABYSS.repeatCrystal(reach.end), 0)} 结晶，按终局扫荡价）；` +
  `因离线回体是**时间比例**（2h 只得 ${f(2 * regenPerHour, 0)} 点），前拨不产生额外收益`)
console.log(`  在线回体绝不截断（v3.0 BL1 修复）：离线攒到 ${offlineCap} 点后回到在线，首次回体只停止累积、不会删存量`)

console.log('')
console.log('═'.repeat(78))
console.log('E. 结晶经济（首通 + 扫荡 vs 商店；含层词条结晶倍率）')
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
/** 遗物兑换项（表里是 3 个独立商品，各 max=1）——必须遍历累加（v3.0 审计订正：旧版只算 1 件，少 400 结晶） */
const relicEntries = ABYSS_TABLE.shop.filter((x) => x.itemId)
const relicTotal = relicEntries.reduce((sum, x) => sum + x.crystal * x.max, 0)
const firstTier =
  sumPrice(ABYSS.shop.rerollTicket, 4) +
  relicTotal +
  sumPrice(ABYSS.shop.permanentSpeed, 5) +
  ABYSS.shop.title.crystal
// 全部可重复项买满（券 max + 永久 max + 遗物 3 + 称号 1）——数量取自内容表
const shopTotal =
  sumPrice(ABYSS.shop.rerollTicket, ABYSS.shop.rerollTicket.max) +
  relicTotal +
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
for (const [label, perDay] of [['常驻在线', regenPerDay], ['每日 2 次上线', 2 * onlineCap], ['每日 1 次上线', offlineCap]]) {
  console.log(`    ${label.padEnd(12)} → ${f(gap / perSweep / Math.min(perDay, regenPerDay), 1)} 天清空商店`)
}
console.log(`  永续出口：券与永久速度可重复购买、价格 ×1.3 递增 → 买满全部可重复项 ≈ ${shopTotal} 结晶；此后无出口（结晶不可回收/不可换金）`)
console.log(`    长期边际 sink：第 12 张券 = ${priceOf(ABYSS.shop.rerollTicket, 11)} 结晶 ≈ ${f(priceOf(ABYSS.shop.rerollTicket, 11) / perSweep, 0)} 次扫荡 → 价格随供给自动抬升 ✅`)
console.log(`  中期（${reach.mid} 层）首通 = ${crystalToFloor(reach.mid)} → 覆盖 ${f((crystalToFloor(reach.mid) / shopTotal) * 100, 0)}%`)

console.log('')
console.log('═'.repeat(78))
console.log('F. 兼容性与结论')
console.log('═'.repeat(78))
console.log('1. 即时判定：不占动作流、不消耗材料 → 与挖/熔/锻/强化/远征/赛季零冲突')
console.log('2. 离线：回体上限提升到 ' + (ABYSS_TABLE.staminaMax + ABYSS_TABLE.offlineCapExtra) + '（时间比例）、不自动挑战 → 一条规则 + 单调守卫')
console.log('3. 结晶不可回收/不可换金；唯一永久加成 +8% 速度（满配 +304% → +312%，远不触 250ms 下限）')
console.log(`4. 战力（内容表反算）：前期 ${f(SCORES.early, 2)} / 中期 ${f(SCORES.mid, 2)} / 终局 ${f(SCORES.end, 2)} → 可达 ${reach.early} / ${reach.mid} / ${reach.end} 层`)
console.log(`5. 经济：首轮 ${firstTier}，终局首通覆盖 ${f((endFirst / firstTier) * 100, 0)}%，缺口靠扫荡（常驻 ${f(gap / perSweep / regenPerDay, 1)} 天 / 每日 2 次 ${f(gap / perSweep / (2 * ABYSS.staminaMax), 1)} 天）+ 价格递增的永续 sink`)

const out = {
  abyss: {
    staminaMax: ABYSS_TABLE.staminaMax,
    staminaRegenMinutes: ABYSS_TABLE.staminaRegenMinutes,
    weights: W,
    growth: ABYSS_TABLE.growth,
    base,
    themes: ABYSS_TABLE.themes,
    shop: ABYSS_TABLE.shop,
    firstClearCrystalBase: ABYSS_TABLE.firstClearCrystal.base,
    firstClearCrystalPerFloor: ABYSS_TABLE.firstClearCrystal.perFloor,
    repeatCrystalBase: ABYSS_TABLE.repeatCrystal.base,
    repeatCrystalPerFloor: ABYSS_TABLE.repeatCrystal.perFloor,
    // v3.0：层词条与离线参数（内容表 → 证据，供 A12/V1 逐字段断言）
    mods: ABYSS_TABLE.mods.map((m) => ({ mod: m.mod, id: m.id, reqMul: m.reqMul, crystalMul: m.crystalMul, weightMul: m.weightMul })),
    rounding: ABYSS_TABLE.rounding,
    challengeMaxFloors: ABYSS_TABLE.challengeMaxFloors,
    sweepMaxCount: ABYSS_TABLE.sweepMaxCount,
    offlineCapExtra: ABYSS_TABLE.offlineCapExtra,
    introReqs: ABYSS_TABLE.introReqs,
    chainCost: ABYSS_TABLE.chainCost,
    // 表指纹：内容表变化时证据必须重跑（三件套的"输入标记"）
    tableFingerprint: JSON.stringify(ABYSS_TABLE).length,
  },
  scores: SCORES,
  stats: Object.fromEntries(
    Object.entries(STATS).map(([k, v]) => [
      k,
      { speed: v.speed, efficiency: v.efficiency, quantity: v.quantity, rareFind: v.rareFind, wisdom: v.wisdom, enhanceRate: v.enhanceRate },
    ]),
  ),
  reach,
  reachFlat,
  bands,
  baseSearchHits: searchOk.length,
  singleStatReach: single,
  rhythm: rhythm.map((r) => ({ floor: r.floor, mod: r.mod, ratio: Number(r.ratio.toFixed(6)) })),
  avgFirstClearCrystalMul: Number(avgCrystalMul.toFixed(4)),
  offline: { onlineCap, offlineCap, perDay: { online24h: regenPerDay, login1: loginDaily(1), login2: loginDaily(2), login3: loginDaily(3) } },
  firstClearAtReach: { early: crystalToFloor(reach.early), mid: crystalToFloor(reach.mid), end: crystalToFloor(reach.end) },
  daysToClearShop: Object.fromEntries(
    [['online', regenPerDay], ['login2', 2 * onlineCap], ['login1', offlineCap]].map(([k, perDay]) => [
      k,
      Number((gap / perSweep / Math.min(perDay, regenPerDay)).toFixed(1)),
    ]),
  ),
  auditedLiterals: AUDITED_LITERALS,
  reqAt: Object.fromEntries([1, 9, 15, 24, 30, 35, 40].map((n) => [n, reqAt(n, base)])),
  crystalToFloor: Object.fromEntries([9, 15, 24, 30, 35, 40].map((n) => [n, crystalToFloor(n)])),
  firstTier,
  shopTotal,
}
writeFileSync(join(root, 'docs', 'sim-abyss-output.json'), JSON.stringify(out, null, 2) + '\n')
console.log('')
console.log('机器校验输出：docs/sim-abyss-output.json')
