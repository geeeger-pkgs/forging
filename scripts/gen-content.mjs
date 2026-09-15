// ============================================================
// Forging · 内容生成器（确定性）
// 生成：data/items.json、data/recipes.json
// 规则来源：docs/01-game-design-v0.2.md §3~§5、§13
// 运行：node scripts/gen-content.mjs
// ============================================================
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = join(root, 'data')
mkdirSync(dataDir, { recursive: true })

const TIERS = [1, 2, 3, 4, 5]
const SUFFIX = { 1: 'copper', 2: 'iron', 3: 'silver', 4: 'gold', 5: 'mithril' }
const TIER_CN = { 1: '铜', 2: '铁', 3: '银', 4: '金', 5: '秘银' }
const ingotPrice = (t) => 5 * t * t
const ESSENCE_RATE = { 1: 0.017, 2: 0.024, 3: 0.037, 4: 0.053, 5: 0.071 }
const UNLOCK = { 1: 1, 2: 10, 3: 20, 4: 35, 5: 50 }

// ---------------- items ----------------
const items = {}
const addItem = (def) => {
  if (items[def.id]) throw new Error('duplicate item: ' + def.id)
  items[def.id] = def
}

// 材料：矿石 / 锭
const ORE_NAME = { 1: '铜矿石', 2: '铁矿石', 3: '银矿石', 4: '金矿石', 5: '秘银矿石' }
const INGOT_NAME = { 1: '铜锭', 2: '铁锭', 3: '银锭', 4: '金锭', 5: '秘银锭' }
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

// 装备 9 类 × 5 档（设计 §4 属性表）
const CATS = [
  { key: 'pick',      name: '镐',   slot: 'pick',     category: 'tool',    stat: 'speed',       vals: [0.15, 0.30, 0.50, 0.75, 1.05] },
  { key: 'crucible',  name: '坩埚', slot: 'crucible', category: 'tool',    stat: 'speed',       vals: [0.15, 0.30, 0.50, 0.75, 1.05] },
  { key: 'hammer',    name: '锤',   slot: 'hammer',   category: 'tool',    stat: 'speed',       vals: [0.15, 0.30, 0.50, 0.75, 1.05] },
  { key: 'sword',     name: '剑',   slot: 'mainHand', category: 'weapon',  stat: 'efficiency',  vals: [0.02, 0.03, 0.04, 0.06, 0.08] },
  { key: 'warhammer', name: '战锤', slot: 'mainHand', category: 'weapon',  stat: 'speed',       vals: [0.02, 0.03, 0.04, 0.05, 0.06] },
  { key: 'helmet',    name: '头盔', slot: 'head',     category: 'armor',   stat: 'wisdom',      vals: [0.03, 0.04, 0.05, 0.06, 0.08] },
  { key: 'chest',     name: '胸甲', slot: 'body',     category: 'armor',   stat: 'quantity',    vals: [0.05, 0.08, 0.11, 0.14, 0.18] },
  { key: 'legs',      name: '腿甲', slot: 'legs',     category: 'armor',   stat: 'rareFind',    vals: [0.05, 0.08, 0.12, 0.16, 0.20] },
  { key: 'boots',     name: '靴甲', slot: 'feet',     category: 'armor',   stat: 'efficiency',  vals: [0.01, 0.02, 0.03, 0.04, 0.05] },
  // v1.3 饰品：项链（强化成功率，模拟定档 +1%~+3%）/ 戒指（效率）
  { key: 'necklace',  name: '项链', slot: 'necklace', category: 'jewelry', stat: 'successRate', vals: [0.01, 0.015, 0.02, 0.025, 0.03] },
  { key: 'ring',      name: '戒指', slot: 'ring',     category: 'jewelry', stat: 'efficiency',  vals: [0.02, 0.03, 0.04, 0.05, 0.06] },
]

// 锻造材料表：T1 手录（设计 §5.2），T2 起按规则生成
// 规则：新锭 = ceil(前档 × 1.5)；XP = 前档 × 2.25；T3+ 加煤 ×1；时间 = (复杂件 ? 8 : 6) + (档位 − 1)
const T1_INGOTS = { pick: 12, crucible: 10, hammer: 12, sword: 18, warhammer: 14, helmet: 10, chest: 16, legs: 14, boots: 8, necklace: 16, ring: 10 }
const COMPLEX = new Set(['sword', 'warhammer', 'chest', 'necklace', 'ring'])

const ingotsByTier = {}
for (const cat of CATS) {
  ingotsByTier[cat.key] = { 1: T1_INGOTS[cat.key] }
  for (const t of [2, 3, 4, 5]) ingotsByTier[cat.key][t] = Math.ceil(ingotsByTier[cat.key][t - 1] * 1.5)
}

const recipes = []

// 熔炼配方（设计 §5.1）
const SMELT = [
  { t: 1, ore: 2, coal: 0, timeSec: 6,  xp: 5 },
  { t: 2, ore: 2, coal: 0, timeSec: 7,  xp: 7.5 },
  { t: 3, ore: 3, coal: 1, timeSec: 9,  xp: 12.5 },
  { t: 4, ore: 3, coal: 1, timeSec: 11, xp: 20 },
  { t: 5, ore: 4, coal: 1, timeSec: 14, xp: 30 },
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

// 锻造配方（设计 §5.2）
// v1.1：T4/T5 装备附加第二属性（增强高阶打造动机）
const SECONDARY = {
  pick: { stat: 'efficiency', vals: [0.02, 0.04] },
  crucible: { stat: 'efficiency', vals: [0.02, 0.04] },
  hammer: { stat: 'efficiency', vals: [0.02, 0.04] },
  sword: { stat: 'quantity', vals: [0.03, 0.06] },
  warhammer: { stat: 'efficiency', vals: [0.02, 0.04] },
  helmet: { stat: 'efficiency', vals: [0.02, 0.04] },
  chest: { stat: 'wisdom', vals: [0.03, 0.06] },
  legs: { stat: 'wisdom', vals: [0.03, 0.06] },
  boots: { stat: 'rareFind', vals: [0.03, 0.06] },
  necklace: { stat: 'rareFind', vals: [0.02, 0.04] },
  ring: { stat: 'quantity', vals: [0.03, 0.06] },
}
for (const cat of CATS) {
  for (const t of TIERS) {
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
    if (t >= 3) inputs.push({ itemId: 'coal', qty: 1 })

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

// ---------------- 输出 ----------------
writeFileSync(join(dataDir, 'items.json'), JSON.stringify(items, null, 2) + '\n')
writeFileSync(join(dataDir, 'recipes.json'), JSON.stringify(recipes, null, 2) + '\n')

const itemCount = Object.keys(items).length
console.log(`[gen-content] items: ${itemCount}（材料 13 + 装备 ${itemCount - 13}），recipes: ${recipes.length}（熔炼 5 + 锻造 ${recipes.length - 5}）`)
console.log('[gen-content] 输出: data/items.json, data/recipes.json')
