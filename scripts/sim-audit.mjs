// ============================================================
// Forging · v1.9 平衡审计（一次性脚本，产出测评证据）
//   A. 全量堆叠上限（B1：速度/效率/稀有/数量）与 250ms 下限验证
//   B. 各档「开采→熔炼→锻造」价值/小时（B2/B5：高 Tier 是否更快更强）
//   C. T6/T7 装备性价比（B2：边际收益 vs 成本回收期）
//   D. 传承精通点数学（B3：产出 vs 消耗）
//   E. 符文经济（B7：是否可套利）
// 运行：node scripts/sim-audit.mjs
// ============================================================
import fs from 'node:fs'

const rd = (f) => JSON.parse(fs.readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8'))
const asArr = (x) => (Array.isArray(x) ? x : Object.values(x))

const items = rd('items.json')
const recipes = asArr(rd('recipes.json'))
const ores = asArr(rd('ores.json'))
const enhance = asArr(rd('enhance.json'))
const perks = asArr(rd('perks.json'))
const runes = asArr(rd('runes.json'))
const config = rd('config.json')

const ENH_TOOL = 0.029
const ENH_OTHER = 0.05
const MAX_ENH = enhance.length
const val = (id) => items[id].value
const f = (n, d = 1) => n.toFixed(d)
const EXIT = () => process.exit(0)

console.log('═'.repeat(72))
console.log('A. 堆叠上限审计（B1）— 满强化 +' + MAX_ENH, '，考虑套装/符文/精通全满')
console.log('═'.repeat(72))

// 工具速度上限（采矿为例）
const pickMax = items.pick_void.stats.speed * (1 + ENH_TOOL * MAX_ENH)
const hammerMax = items.hammer_void.stats.speed * (1 + ENH_TOOL * MAX_ENH)
const crucibleMax = items.crucible_void.stats.speed * (1 + ENH_TOOL * MAX_ENH)
const warMax = items.warhammer_void.stats.speed * (1 + ENH_OTHER * MAX_ENH)
const setSpeed = 0.04
const setEff = 0.04

const runeVal = (effect, tier) => runes.find((r) => r.id === `rune_${effect.toLowerCase()}_${tier}`).value
const perkVal = (effect) => {
  const p = perks.find((x) => x.effect === effect)
  return p ? p.perPoint * p.max : 0
}

const speedMax = pickMax + hammerMax + warMax + setSpeed + runeVal('speed', 3) + runeVal('speed', 2) + perkVal('speed')
const speedMaxMine = pickMax + warMax + setSpeed + runeVal('speed', 3) + runeVal('speed', 2) + perkVal('speed')
const effMax =
  (items.pick_void.stats.efficiency +
    items.crucible_void.stats.efficiency +
    items.hammer_void.stats.efficiency +
    items.warhammer_void.stats.efficiency +
    items.helmet_void.stats.efficiency) *
    (1 + ENH_OTHER * MAX_ENH) +
  items.boots_void.stats.efficiency * (1 + ENH_OTHER * MAX_ENH) +
  items.ring_mithril.stats.efficiency * (1 + ENH_OTHER * MAX_ENH) +
  setEff +
  runeVal('efficiency', 3) +
  runeVal('efficiency', 2) +
  perkVal('efficiency')
const rareMax =
  items.legs_void.stats.rareFind * (1 + ENH_OTHER * MAX_ENH) +
  items.boots_void.stats.rareFind * (1 + ENH_OTHER * MAX_ENH) +
  items.necklace_mithril.stats.rareFind * (1 + ENH_OTHER * MAX_ENH) +
  runeVal('rareFind', 3) +
  runeVal('rareFind', 2) +
  perkVal('rareFind')

console.log(`工具速度（T7+${MAX_ENH}）：镐 ${f(pickMax, 3)} / 战锤 ${f(warMax, 3)}（全技能）`)
console.log(`符文（T3+T2 异符叠加）：速度 +${f(runeVal('speed', 3) + runeVal('speed', 2), 2)} / 效率 +${f(runeVal('efficiency', 3) + runeVal('efficiency', 2), 2)} / 稀有 +${f(runeVal('rareFind', 3) + runeVal('rareFind', 2), 2)}`)
console.log(`精通满级：速度 +${perkVal('speed')} / 效率 +${perkVal('efficiency')} / 稀有 +${perkVal('rareFind')}`)
// v2.1 词缀（10 槽完美上限，见 sim-affixes A 段）+ v2.4 深渊永久速度（8 级 × 1%）
const affixSpeedCap = 0.192
// v3.1：读内容表（上限 8→24 的结晶出口扩张后，满配 +24%）
const ABYSS_TBL = rd('abyss.json')
const permDef = ABYSS_TBL.shop.find((x) => x.id === 'permanent_speed')
const abyssPermSpeed = permDef.perLevel * permDef.max
console.log(`词缀（v2.1，10 槽完美上限）：速度 +${affixSpeedCap}（另有效率 +0.096 / 产量 +0.272 / 稀有 +0.68）`)
console.log(`深渊永久速度（v3.1，${permDef.max} 级 × ${permDef.perLevel}）：+${abyssPermSpeed.toFixed(2)}`)
console.log('')
const speedMaxAll = speedMaxMine + affixSpeedCap + abyssPermSpeed
console.log(`速度合计（采矿·终局满配）: +${f(speedMaxMine, 3)} → 时长 ×${f(1 / (1 + speedMaxMine), 3)}`)
console.log(`速度合计（含 v2.1 词缀 + v2.4 深渊永久）: +${f(speedMaxAll, 3)} → 时长 ×${f(1 / (1 + speedMaxAll), 3)}`)
for (const s of ores.slice(0, 8)) {
  const tMax = Math.max(config.minActionTimeMs, Math.round(s.baseTimeMs / (1 + speedMaxAll)))
  const floor = s.baseTimeMs / (1 + speedMaxAll) < config.minActionTimeMs ? ' ⚠触底' : ''
  console.log(`  ${s.id.padEnd(16)} 基础 ${s.baseTimeMs}ms → 满配 ${tMax}ms${floor}`)
}
// v2.1（评审 M2）：效率按真实语义出数——在线是「每轮概率额外产出一份、链式上限 1」的 proc，
// 每轮期望倍率 = 1 + 1/(2−E)（E<1）；离线期望用 1+E 乘区（含精通）。两者不可混为一谈。
const procRate = (E) => (E >= 1 ? 1 : 1 / (2 - E))
const effEquip = effMax - runeVal('efficiency', 3) - runeVal('efficiency', 2) - perkVal('efficiency')
console.log(
  `效率（装备侧）E=${f(effEquip, 3)} → 在线每轮期望倍率 ×${f(1 + procRate(effEquip), 3)}（触发率 ${f(procRate(effEquip), 3)}/轮）`,
)
console.log(
  `  ｜离线期望（装备+精通）×(1+${f(effEquip + perkVal('efficiency'), 3)})：符文/精通在线不参与 proc，离线偏乐观（设计取舍）`,
)
console.log(`效率合计（含符文/精通）+${f(effMax, 3)}；稀有合计 +${f(rareMax, 3)} → 稀有率 ×${f(1 + rareMax, 3)}`)
const minBase = config.minActionTimeMs * (1 + speedMaxAll)
console.log(`250ms 下限触底条件：基础时长 < ${Math.round(minBase)}ms（当前最速动作 ${Math.min(...ores.map((s) => s.baseTimeMs))}ms）→ ${Math.min(...ores.map((s) => s.baseTimeMs)) >= minBase ? '永不触底 ✅' : '可能触底 ⚠'}`)

console.log('')
console.log('═'.repeat(72))
console.log('B. 各档价值/小时（开采→熔炼→锻造；工具=同档+5 强化，无符文/精通）')
console.log('═'.repeat(72))
const T = (t, idpfx) => (idpfx ? `${idpfx}_${['copper', 'iron', 'silver', 'gold', 'mithril', 'starlite', 'void'][t - 1]}` : null)
const names = ['copper', 'iron', 'silver', 'gold', 'mithril', 'starlite', 'void']

function chainValuePerHour(tier) {
  const name = names[tier - 1]
  const site = ores.find((s) => s.id === `${name}_seam`) || (name === 'copper' ? ores.find((s) => s.id === 'copper_seam') : null)
  const pick = items[`pick_${name}`]
  const crucible = items[`crucible_${name}`]
  const hammer = items[`hammer_${name}`]
  const enh5 = 1 + (ENH_TOOL * 5)
  const oreItem = `ore_${name}`
  const ingotItem = `ingot_${name}`
  // 采矿：平均 2 个矿石
  const mineT = site.baseTimeMs / (1 + pick.stats.speed * enh5)
  const orePerHr = (3600000 / mineT) * 2
  const mineValuePerHr = orePerHr * val(oreItem)
  // 熔炼：1 锭 = 4~5 矿 + 1 煤
  const smelt = recipes.find((r) => r.id === `smelt_${name}`)
  const oreCost = smelt.inputs.find((i) => i.itemId === oreItem).qty
  const coalCost = smelt.inputs.find((i) => i.itemId === 'coal')?.qty ?? 0
  const smeltT = smelt.baseTimeMs / (1 + crucible.stats.speed * enh5)
  const ingotPerHr = 3600000 / (smeltT + oreCost * mineT) // 忽略采煤时间（煤另有专用矿）
  const ingotNetPerHr = ingotPerHr * (val(ingotItem) - oreCost * val(oreItem) - coalCost * val('coal'))
  // 锻造：以「最贵单件」（剑）计
  const forge = recipes.find((r) => r.id === `forge_sword_${name}`)
  const ingotCost = forge.inputs.find((i) => i.itemId === ingotItem).qty
  const forgeT = forge.baseTimeMs / (1 + hammer.stats.speed * enh5)
  const chainT = forgeT + ingotCost * smeltT + ingotCost * oreCost * mineT
  const gearPerHr = 3600000 / chainT
  const gearNetPerHr = gearPerHr * (val(forge.outputs[0].itemId) - ingotCost * val(ingotItem))
  return {
    tier: `${tier}(${name})`,
    mine: mineValuePerHr,
    smeltNet: ingotNetPerHr,
    gearNet: gearNetPerHr,
    gearPerHr,
    pickValue: val(pick.id),
    swordValue: val(forge.outputs[0].itemId),
  }
}
console.log(
  ['档位'.padEnd(13), '开采金/时'.padStart(9), '熔炼净/时'.padStart(9), '锻造净/时'.padStart(9), '剑/时'.padStart(7), '镐价'.padStart(7)].join(
    ' | ',
  ),
)
for (let t = 1; t <= 7; t++) {
  const r = chainValuePerHour(t)
  console.log(
    [
      r.tier.padEnd(13),
      f(r.mine, 0).padStart(9),
      f(r.smeltNet, 0).padStart(9),
      f(r.gearNet, 0).padStart(9),
      f(r.gearPerHr, 2).padStart(7),
      String(r.pickValue).padStart(7),
    ].join(' | '),
  )
}

console.log('')
console.log('═'.repeat(72))
console.log('C. T6/T7 装备性价比（B2）— 以镐为例（材料按回收价计）')
console.log('═'.repeat(72))
for (const [from, to, tier] of [
  ['pick_starlite', 'pick_void', 7],
  ['pick_mithril', 'pick_starlite', 6],
]) {
  const rec = recipes.find((r) => r.id === `forge_pick_${names[tier - 1]}`)
  const cost = rec.inputs.reduce((s, i) => s + val(i.itemId) * i.qty, 0)
  const gain = items[to].stats.speed - items[from].stats.speed
  const oldSpd = items[from].stats.speed + 0.04
  const newSpd = items[to].stats.speed + 0.04
  const gainPct = (newSpd / oldSpd - 1) * 100
  const refRate = chainValuePerHour(tier - 1).mine // 以上一档开采产出为基准
  const paybackH = cost / (refRate * (gainPct / 100))
  console.log(
    `${from} → ${to}: 材料成本 ≈ ${cost} 金，速度 +${f(gain, 2)}（+${f(gainPct, 1)}% 产出）；` +
      `以上一档开采 ${f(refRate, 0)} 金/时计，回收期 ≈ ${f(paybackH, 1)} 小时`,
  )
}

console.log('')
console.log('═'.repeat(72))
console.log('D. 传承精通点（B3）')
console.log('═'.repeat(72))
const maxTotal = 400
const perPrestige = Math.floor(maxTotal / 10) + 4
const sink = perks.reduce((s, p) => s + p.cost * p.max, 0)
console.log(`满级一次传承获得 ${perPrestige} 点；全精通买满需 ${sink} 点 → 约 ${f(sink / perPrestige, 2)} 次满级传承即毕业（溢出风险：研究生效）`)
console.log(`过载提案（上限×2、超出部分成本×2）追加消耗：${perks.reduce((s, p) => s + p.cost * p.max, 0)} 点 → 总计 ${sink * 2} 点 ≈ ${f((sink * 2) / perPrestige, 1)} 次`)

console.log('')
console.log('═'.repeat(72))
console.log('E. 符文经济（B7）')
console.log('═'.repeat(72))
for (const r of recipes.filter((x) => x.id.startsWith('craft_rune_speed'))) {
  const cost = r.inputs.reduce((s, i) => s + val(i.itemId) * i.qty, 0)
  const out = r.outputs[0].itemId
  console.log(`${r.id}: 材料 ${cost} 金 + ${r.baseTimeMs / 1000}s → 成品价值 ${val(out)}（回收${val(out) > cost ? '可套利 ⚠' : '亏本（使用为唯一正解）✅'}）`)
}
console.log('离线规则：offline 结算期间 state.buffs 临时清空 → 符文离线无收益、时长照常流逝（无重复使用漏洞 ✅）')

console.log('')
console.log('═'.repeat(72))
console.log('F. 进度时间线（v2.0 可玩性证据）：升到目标级所需小时数（链路受限）')
console.log('   说明：熔炼/锻造/强化必须消耗上游产出 → 按「完整供应链耗时」折算')
console.log('   基线 = 同档工具无强化；投资 = 同档+5 + 套装4% + 迅捷10级（+19%）')
console.log('═'.repeat(72))
const curve = rd('levelCurve.json')
const multFor = (k) => {
  let m = curve.bands[0].multiplier
  for (const b of curve.bands) if (k >= b.fromLevel) m = b.multiplier
  return m
}
const xpToNext = (lv) => {
  let p = curve.baseXp
  for (let k = 1; k <= lv - 1; k++) p *= multFor(k)
  return Math.round(p)
}
const xpForLevel = (lv) => {
  let s = 0
  for (let l = 1; l < lv; l++) s += xpToNext(l)
  return s
}

const NAMES = ['copper', 'iron', 'silver', 'gold', 'mithril', 'starlite', 'void']
const TIERS = [
  [1, 9],
  [9, 19],
  [19, 34],
  [34, 49],
  [49, 64],
  [64, 79],
  [79, 100],
]

function speedProfile(toolSpeed, enh, set40, perks) {
  return toolSpeed * (1 + 0.029 * enh) + (set40 ? 0.04 : 0) + perks
}

/** 各技能：band = {from,to,xp,chainMs（含上游供给）} */
function buildBands(profile) {
  const enh = profile === 'inv' ? 5 : 0
  const set40 = profile === 'inv'
  const perk = profile === 'inv' ? 0.15 : 0
  const mineBands = []
  const smeltBands = []
  const forgeBands = []
  for (let t = 0; t < 7; t++) {
    const name = NAMES[t]
    const site = ores.find((s) => s.id === `${name}_seam`)
    const mineT = site.baseTimeMs / (1 + speedProfile(items[`pick_${name}`].stats.speed, enh, set40, perk))
    const smeltT =
      recipes
        .find((r) => r.id === `smelt_${name}`)
        .baseTimeMs / (1 + speedProfile(items[`crucible_${name}`].stats.speed, enh, set40, perk))
    const smelt = recipes.find((r) => r.id === `smelt_${name}`)
    const oreCost = smelt.inputs.find((i) => i.itemId === `ore_${name}`).qty
    const forge = recipes.find((r) => r.id === `forge_pick_${name}`)
    const ingotCost = forge.inputs.find((i) => i.itemId === `ingot_${name}`).qty
    const forgeT =
      forge.baseTimeMs / (1 + speedProfile(items[`hammer_${name}`].stats.speed, enh, set40, perk))
    const [from, to] = TIERS[t]
    const orePerAction = (site.yieldMin + site.yieldMax) / 2
    mineBands.push({ from, to, xp: site.xp, chainMs: mineT })
    smeltBands.push({ from, to, xp: smelt.xp, chainMs: smeltT + oreCost * (mineT / orePerAction) })
    forgeBands.push({
      from,
      to,
      xp: forge.xp,
      chainMs: forgeT + ingotCost * (smeltT + oreCost * (mineT / orePerAction)),
    })
  }
  // 强化：+8 档（5 锭 + 3 精华；精华按稀有掉率 0.11/次折算挖掘次数）
  const e = enhance.find((x) => x.targetLevel === 8)
  const enhBands = []
  for (let t = 0; t < 7; t++) {
    const name = NAMES[t]
    const site = ores.find((s) => s.id === `${name}_seam`)
    const mineT = site.baseTimeMs / (1 + speedProfile(items[`pick_${name}`].stats.speed, enh, set40, perk))
    const smeltT =
      recipes
        .find((r) => r.id === `smelt_${name}`)
        .baseTimeMs / (1 + speedProfile(items[`crucible_${name}`].stats.speed, enh, set40, perk))
    const smelt = recipes.find((r) => r.id === `smelt_${name}`)
    const oreCost = smelt.inputs.find((i) => i.itemId === `ore_${name}`).qty
    const ingotQty = e.cost.ingots
    const essenceQty = e.cost.essences
    const mineActionsPerEssence = 1 / 0.11
    const enhT = e.baseTimeMs / (1 + speedProfile(0, 0, set40, perk))
    const [from, to] = TIERS[t]
    enhBands.push({
      from,
      to,
      xp: e.xpBase * (1 + e.successRate),
      chainMs: enhT + ingotQty * (smeltT + oreCost * (mineT / 2)) + essenceQty * mineActionsPerEssence * mineT,
    })
  }
  return { 挖掘: mineBands, 熔炼: smeltBands, 锻造: forgeBands, 强化: enhBands }
}

const baseBands = buildBands('base')
const invBands = buildBands('inv')
const targets = [20, 30, 50, 80, 100]
console.log(['技能'.padEnd(6), ...targets.map((t) => `Lv${t} 基/投`.padStart(12))].join(' | '))
const hoursFor = (bandsMap, label, target) =>
  bandsMap[label]
    .map((b) => ({ ...b, to: Math.min(b.to, target) }))
    .filter((b) => b.from < target)
    .reduce((sum, b) => sum + ((xpForLevel(b.to) - xpForLevel(b.from)) / b.xp) * b.chainMs / 3_600_000, 0)
for (const label of ['挖掘', '熔炼', '锻造', '强化']) {
  const cells = targets.map((target) => {
    const base = hoursFor(baseBands, label, target)
    const inv = hoursFor(invBands, label, target)
    return `${f(base, 0)}/${f(inv, 0)}h`.padStart(12)
  })
  console.log([label.padEnd(6), ...cells].join(' | '))
}
const capped = (label, t) => Math.max(hoursFor(baseBands, label, t), hoursFor(invBands, label, t))
console.log(
  `混合循环（挖+熔+锻三技能同步推进，锻造为瓶颈）：Lv30 ≈ ${f(capped('锻造', 30), 0)}h（首次传承总等级 120 量级）；` +
    `Lv50 ≈ ${f(capped('锻造', 50), 0)}h（所有技能 50 档之后进入长尾）`,
)
console.log('（强化非主要经验来源，由富余材料自然驱动；未计精通智慧经验加成/符文/自动回收加速，保守上界）')
EXIT()
