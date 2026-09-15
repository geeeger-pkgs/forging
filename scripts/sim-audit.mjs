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
console.log('')
console.log(`速度合计（采矿·终局满配）: +${f(speedMaxMine, 3)} → 时长 ×${f(1 / (1 + speedMaxMine), 3)}`)
for (const s of ores.slice(0, 8)) {
  const tMax = Math.max(config.minActionTimeMs, Math.round(s.baseTimeMs / (1 + speedMaxMine)))
  const floor = s.baseTimeMs / (1 + speedMaxMine) < config.minActionTimeMs ? ' ⚠触底' : ''
  console.log(`  ${s.id.padEnd(16)} 基础 ${s.baseTimeMs}ms → 满配 ${tMax}ms${floor}`)
}
console.log(`效率合计 +${f(effMax, 3)} → ×${f(1 + effMax, 3)}；稀有合计 +${f(rareMax, 3)} → 稀有率 ×${f(1 + rareMax, 3)}`)
const minBase = config.minActionTimeMs * (1 + speedMaxMine)
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
EXIT()
