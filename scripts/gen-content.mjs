// ============================================================
// Forging · 内容生成器（确定性）
// 生成：data/items.json、data/recipes.json、data/runes.json
// v1.6：档位扩展至 T7（铜/铁/银/金/秘银/星尘/虚空）；饰品保持 5 档
// 运行：node scripts/gen-content.mjs
// ============================================================
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = join(root, 'data')
mkdirSync(dataDir, { recursive: true })

const TIERS = [1, 2, 3, 4, 5, 6, 7]
const SUFFIX = { 1: 'copper', 2: 'iron', 3: 'silver', 4: 'gold', 5: 'mithril', 6: 'starlite', 7: 'void' }
const TIER_CN = { 1: '铜', 2: '铁', 3: '银', 4: '金', 5: '秘银', 6: '星尘', 7: '虚空' }
const ingotPrice = (t) => 5 * t * t
const ESSENCE_RATE = { 1: 0.017, 2: 0.024, 3: 0.037, 4: 0.053, 5: 0.071, 6: 0.095, 7: 0.11 }
const UNLOCK = { 1: 1, 2: 10, 3: 20, 4: 35, 5: 50, 6: 65, 7: 80 }

// ---------------- items ----------------
const items = {}
const addItem = (def) => {
  if (items[def.id]) throw new Error('duplicate item: ' + def.id)
  items[def.id] = def
}

// 材料：矿石 / 锭（7 档）
const ORE_NAME = { 1: '铜矿石', 2: '铁矿石', 3: '银矿石', 4: '金矿石', 5: '秘银矿石', 6: '星尘矿石', 7: '虚空矿石' }
const INGOT_NAME = { 1: '铜锭', 2: '铁锭', 3: '银锭', 4: '金锭', 5: '秘银锭', 6: '星尘锭', 7: '虚空锭' }
for (const t of TIERS) {
  addItem({
    id: `ore_${SUFFIX[t]}`, name: ORE_NAME[t], tier: t, category: 'ore',
    enhanceable: false, value: Math.round(ingotPrice(t) * 0.4), stackable: true,
  })
  addItem({
    id: `ingot_${SUFFIX[t]}`, name: INGOT_NAME[t], tier: t, category: 'ingot',
    enhanceable: false, value: ingotPrice(t), stackable: true,
  })
}
addItem({ id: 'coal', name: '煤', category: 'coal', enhanceable: false, value: 3, stackable: true })
addItem({ id: 'essence', name: '精华', category: 'essence', enhanceable: false, value: 15, stackable: true })
addItem({ id: 'crate', name: '工匠小箱', category: 'crate', enhanceable: false, value: 25, stackable: true })
// v2.1：重铸石（词缀锁定消耗；采集侧资源，不设商店直售）
addItem({ id: 'emberstone', name: '重铸石', category: 'reagent', enhanceable: false, value: 60, stackable: true })

// 装备 9 类（T1~T7）+ 饰品 2 类（T1~T5）
const CATS = [
  { key: 'pick',      name: '镐',   slot: 'pick',     category: 'tool',    stat: 'speed',       vals: [0.15, 0.30, 0.50, 0.75, 1.05, 1.20, 1.35], maxTier: 7 },
  { key: 'crucible',  name: '坩埚', slot: 'crucible', category: 'tool',    stat: 'speed',       vals: [0.15, 0.30, 0.50, 0.75, 1.05, 1.20, 1.35], maxTier: 7 },
  { key: 'hammer',    name: '锤',   slot: 'hammer',   category: 'tool',    stat: 'speed',       vals: [0.15, 0.30, 0.50, 0.75, 1.05, 1.20, 1.35], maxTier: 7 },
  { key: 'sword',     name: '剑',   slot: 'mainHand', category: 'weapon',  stat: 'efficiency',  vals: [0.02, 0.03, 0.04, 0.06, 0.08, 0.10, 0.12], maxTier: 7 },
  { key: 'warhammer', name: '战锤', slot: 'mainHand', category: 'weapon',  stat: 'speed',       vals: [0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08], maxTier: 7 },
  { key: 'helmet',    name: '头盔', slot: 'head',     category: 'armor',   stat: 'wisdom',      vals: [0.03, 0.04, 0.05, 0.06, 0.08, 0.10, 0.12], maxTier: 7 },
  { key: 'chest',     name: '胸甲', slot: 'body',     category: 'armor',   stat: 'quantity',    vals: [0.05, 0.08, 0.11, 0.14, 0.18, 0.22, 0.26], maxTier: 7 },
  { key: 'legs',      name: '腿甲', slot: 'legs',     category: 'armor',   stat: 'rareFind',    vals: [0.05, 0.08, 0.12, 0.16, 0.20, 0.25, 0.30], maxTier: 7 },
  { key: 'boots',     name: '靴甲', slot: 'feet',     category: 'armor',   stat: 'efficiency',  vals: [0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07], maxTier: 7 },
  { key: 'necklace',  name: '项链', slot: 'necklace', category: 'jewelry', stat: 'successRate', vals: [0.01, 0.015, 0.02, 0.025, 0.03], maxTier: 5 },
  { key: 'ring',      name: '戒指', slot: 'ring',     category: 'jewelry', stat: 'efficiency',  vals: [0.02, 0.03, 0.04, 0.05, 0.06], maxTier: 5 },
]

// 锻造材料表：T1 手录，T2 起按规则生成
// 规则：新锭 = ceil(前档 × 1.5)；XP = 前档 × 2.25；T3+ 加煤 ×1（T6+ ×2）；时间 = (复杂件 ? 8 : 6) + (档位 − 1)
const T1_INGOTS = { pick: 12, crucible: 10, hammer: 12, sword: 18, warhammer: 14, helmet: 10, chest: 16, legs: 14, boots: 8, necklace: 16, ring: 10 }
const COMPLEX = new Set(['sword', 'warhammer', 'chest', 'necklace', 'ring'])

const ingotsByTier = {}
for (const cat of CATS) {
  ingotsByTier[cat.key] = { 1: T1_INGOTS[cat.key] }
  for (let t = 2; t <= cat.maxTier; t++) ingotsByTier[cat.key][t] = Math.ceil(ingotsByTier[cat.key][t - 1] * 1.5)
}

const recipes = []

// 熔炼配方
const SMELT = [
  { t: 1, ore: 2, coal: 0, timeSec: 6,  xp: 5 },
  { t: 2, ore: 2, coal: 0, timeSec: 7,  xp: 7.5 },
  { t: 3, ore: 3, coal: 1, timeSec: 9,  xp: 12.5 },
  { t: 4, ore: 3, coal: 1, timeSec: 11, xp: 20 },
  { t: 5, ore: 4, coal: 1, timeSec: 14, xp: 30 },
  { t: 6, ore: 4, coal: 1, timeSec: 17, xp: 45 },
  { t: 7, ore: 5, coal: 1, timeSec: 22, xp: 65 },
]
for (const s of SMELT) {
  const inputs = [{ itemId: `ore_${SUFFIX[s.t]}`, qty: s.ore }]
  if (s.coal > 0) inputs.push({ itemId: 'coal', qty: s.coal })
  recipes.push({
    id: `smelt_${SUFFIX[s.t]}`,
    name: `熔炼${INGOT_NAME[s.t]}`,
    skill: 'smelting',
    category: 'material',
    tier: s.t,
    unlockLevel: UNLOCK[s.t],
    baseTimeMs: s.timeSec * 1000,
    xp: s.xp,
    inputs,
    outputs: [{ itemId: `ingot_${SUFFIX[s.t]}`, qty: 1 }],
    rareDrops: [{ itemId: 'essence', rate: ESSENCE_RATE[s.t] }],
  })
}

// 锻造配方（含饰品；T4+ 副属性）
const SECONDARY = {
  pick: { stat: 'efficiency', vals: [0.02, 0.04, 0.06, 0.08] },
  crucible: { stat: 'efficiency', vals: [0.02, 0.04, 0.06, 0.08] },
  hammer: { stat: 'efficiency', vals: [0.02, 0.04, 0.06, 0.08] },
  sword: { stat: 'quantity', vals: [0.03, 0.06, 0.09, 0.12] },
  warhammer: { stat: 'efficiency', vals: [0.02, 0.04, 0.06, 0.08] },
  helmet: { stat: 'efficiency', vals: [0.02, 0.04, 0.06, 0.08] },
  chest: { stat: 'wisdom', vals: [0.03, 0.06, 0.09, 0.12] },
  legs: { stat: 'wisdom', vals: [0.03, 0.06, 0.09, 0.12] },
  boots: { stat: 'rareFind', vals: [0.03, 0.06, 0.09, 0.12] },
  necklace: { stat: 'rareFind', vals: [0.02, 0.04] },
  ring: { stat: 'quantity', vals: [0.03, 0.06] },
}
for (const cat of CATS) {
  for (let t = 1; t <= cat.maxTier; t++) {
    const id = `${cat.key}_${SUFFIX[t]}`
    const ingots = ingotsByTier[cat.key][t]
    const value = Math.round(ingots * ingotPrice(t) * 0.5)
    const stats = { [cat.stat]: cat.vals[t - 1] }
    if (t >= 4) {
      const sec = SECONDARY[cat.key]
      stats[sec.stat] = sec.vals[t - 4]
    }
    addItem({
      id,
      name: `${TIER_CN[t]}${cat.name}`,
      tier: t,
      category: cat.category,
      slot: cat.slot,
      stats,
      enhanceable: true,
      value,
      stackable: false,
    })

    const inputs = []
    if (t > 1) inputs.push({ itemId: `${cat.key}_${SUFFIX[t - 1]}`, qty: 1 })
    inputs.push({ itemId: `ingot_${SUFFIX[t]}`, qty: ingots })
    if (t >= 3) inputs.push({ itemId: 'coal', qty: t >= 6 ? 2 : 1 })

    const xp = Math.round(T1_INGOTS[cat.key] * Math.pow(2.25, t - 1) * 100) / 100
    const timeSec = (COMPLEX.has(cat.key) ? 8 : 6) + (t - 1)

    recipes.push({
      id: `forge_${cat.key}_${SUFFIX[t]}`,
      name: `${TIER_CN[t]}${cat.name}`,
      skill: 'forging',
      category: cat.category,
      tier: t,
      unlockLevel: UNLOCK[t],
      baseTimeMs: timeSec * 1000,
      xp,
      inputs,
      outputs: [{ itemId: id, qty: 1 }],
      rareDrops: [{ itemId: 'essence', rate: ESSENCE_RATE[t] }],
    })
  }
}

// ---------------- 符文（v1.4） ----------------
const RUNE_EFFECTS = [
  { key: 'speed', name: '疾风', vals: [0.15, 0.25, 0.4] },
  { key: 'efficiency', name: '丰饶', vals: [0.1, 0.15, 0.25] },
  { key: 'rarefind', name: '幸运', vals: [0.2, 0.35, 0.6] },
  { key: 'enhance', name: '祝福', vals: [0.03, 0.05, 0.08] },
]
const RUNE_TIERS = [
  { essence: 3, ingotSuffix: 'copper', ingotQty: 5, unlock: 1, xp: 12, time: 6 },
  { essence: 8, ingotSuffix: 'silver', ingotQty: 8, unlock: 20, xp: 35, time: 10 },
  { essence: 20, ingotSuffix: 'mithril', ingotQty: 12, unlock: 50, xp: 90, time: 16 },
]
const RUNE_TIER_CN = ['一', '二', '三']
const runes = []
for (const eff of RUNE_EFFECTS) {
  RUNE_TIERS.forEach((tier, i) => {
    const t = i + 1
    const id = `rune_${eff.key}_${t}`
    const name = `${eff.name}符文·${RUNE_TIER_CN[i]}阶`
    const ingotId = `ingot_${tier.ingotSuffix}`
    const value = Math.round((tier.essence * 15 + tier.ingotQty * ingotPrice(t)) * 0.8)
    addItem({ id, name, tier: t, category: 'rune', enhanceable: false, value, stackable: true })
    recipes.push({
      id: `craft_${id}`,
      name,
      skill: 'forging',
      category: 'rune',
      tier: t,
      unlockLevel: tier.unlock,
      baseTimeMs: tier.time * 1000,
      xp: tier.xp,
      inputs: [
        { itemId: 'essence', qty: tier.essence },
        { itemId: ingotId, qty: tier.ingotQty },
      ],
      outputs: [{ itemId: id, qty: 1 }],
      rareDrops: [],
    })
    const effect = eff.key === 'enhance' ? 'enhanceRate' : eff.key === 'rarefind' ? 'rareFind' : eff.key
    runes.push({ id, name, effect, value: eff.vals[i], durationMs: 600000 })
  })
}

// ---------------- 词缀（v2.1） ----------------
// 数值口径：max(tier) = base + perTier × (tier − 1)；实际值 = max × roll，roll ∈ [0.55, 1.0]
// 池按「装备原型 = 物品 category」划分；条数按档位递增（T1~2 一条 → T7 四条）
const AFFIXES = [
  { id: 'keen', name: '锋锐', effect: 'speed', base: 0.012, perTier: 0.006 },
  { id: 'plenty', name: '丰产', effect: 'quantity', base: 0.02, perTier: 0.008 },
  { id: 'flow', name: '流畅', effect: 'efficiency', base: 0.006, perTier: 0.003 },
  { id: 'lore', name: '博识', effect: 'wisdom', base: 0.02, perTier: 0.01 },
  { id: 'fortune', name: '幸运', effect: 'rareFind', base: 0.02, perTier: 0.01 },
  { id: 'precision', name: '精准', effect: 'enhanceRate', base: 0.01, perTier: 0.005 },
  { id: 'aegis', name: '庇护', effect: 'guard', base: 0.02, perTier: 0.01 },
  { id: 'midas', name: '点金', effect: 'goldFind', base: 0.03, perTier: 0.015 },
  { id: 'prospect', name: '勘探', effect: 'stoneFind', base: 0.05, perTier: 0.025 },
]

// 池各 5 条：T7 抽 4 条 → 5 种组合（避免"条数=池大小"导致组合退化，评审 M4）
const affixDefs = {
  affixes: AFFIXES,
  pools: {
    tool: ['keen', 'plenty', 'flow', 'lore', 'fortune'],
    weapon: ['keen', 'plenty', 'flow', 'lore', 'midas'],
    armor: ['flow', 'lore', 'fortune', 'aegis', 'prospect'],
    jewelry: ['precision', 'aegis', 'midas', 'fortune', 'prospect'],
  },
  countByTier: { 1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 3, 7: 4 },
  rollMin: 0.55,
  rollMax: 1.0,
  /** 单条词缀视为「完美」的品质阈值（成就与 UI 高亮；与 §3 模拟的 90% 是两回事） */
  perfectThreshold: 0.95,
  // 重铸造价：金按档位分表（与该档开采金/时挂钩），锁每多一条 +90% 金 + 1 重铸石
  reforge: {
    goldByTier: { 1: 120, 2: 400, 3: 1100, 4: 2600, 5: 5200, 6: 7600, 7: 9500 },
    lockGoldFactor: 0.9,
    essenceByTier: { 1: 1, 2: 2, 3: 2, 4: 3, 5: 3, 6: 4, 7: 4 },
    emberstonePerLock: 1,
  },
}

// ---------------- 输出 ----------------
writeFileSync(join(dataDir, 'items.json'), JSON.stringify(items, null, 2) + '\n')
writeFileSync(join(dataDir, 'recipes.json'), JSON.stringify(recipes, null, 2) + '\n')
writeFileSync(join(dataDir, 'runes.json'), JSON.stringify(runes, null, 2) + '\n')
writeFileSync(join(dataDir, 'affixes.json'), JSON.stringify(affixDefs, null, 2) + '\n')

const itemCount = Object.keys(items).length
console.log(`[gen-content] items: ${itemCount}（材料 18 + 装备 ${itemCount - 18 - runes.length} + 符文 ${runes.length}），recipes: ${recipes.length}`)
console.log(`[gen-content] affixes: ${AFFIXES.length}（4 池）`)
console.log('[gen-content] 输出: data/items.json, data/recipes.json, data/runes.json, data/affixes.json')
