// ============================================================
// Forging · 内容生成器（确定性）
// 生成：data/items.json、data/recipes.json、data/runes.json
// v1.6：档位扩展至 T7（铜/铁/银/金/秘银/星尘/虚空）；饰品保持 5 档
// 运行：node scripts/gen-content.mjs
// ============================================================
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs'
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
// v2.2：远征徽记（招募/旗帜/特质重掷货币）与遗物（value 0：不构成第二产金通道）
addItem({ id: 'expedition_token', name: '远征徽记', category: 'reagent', enhanceable: false, value: 200, stackable: true })
addItem({ id: 'relic_gear', name: '遗物·锈蚀齿轮', category: 'relic', enhanceable: false, value: 0, stackable: true })
addItem({ id: 'relic_shard', name: '遗物·铭文碎片', category: 'relic', enhanceable: false, value: 0, stackable: true })
addItem({ id: 'relic_core', name: '遗物·深渊之核', category: 'relic', enhanceable: false, value: 0, stackable: true })

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
// desc：机内效果说明（弹窗展示；评审 B1 —— 玩家必须能读懂每条词缀在做什么）
const AFFIXES = [
  { id: 'keen', name: '锋锐', effect: 'speed', base: 0.012, perTier: 0.006, desc: '动作速度（工具=对应技能，武器=全技能）' },
  { id: 'plenty', name: '丰产', effect: 'quantity', base: 0.02, perTier: 0.008, desc: '产出数量' },
  { id: 'flow', name: '流畅', effect: 'efficiency', base: 0.006, perTier: 0.003, desc: '效率（每轮概率额外产出一份）' },
  { id: 'lore', name: '博识', effect: 'wisdom', base: 0.02, perTier: 0.01, desc: '技能经验' },
  { id: 'fortune', name: '幸运', effect: 'rareFind', base: 0.02, perTier: 0.01, desc: '稀有掉落率（精华/小箱/重铸石）' },
  { id: 'precision', name: '精准', effect: 'enhanceRate', base: 0.01, perTier: 0.005, desc: '强化成功率' },
  { id: 'aegis', name: '庇护', effect: 'guard', base: 0.02, perTier: 0.01, desc: '强化失败时免降级概率' },
  { id: 'midas', name: '点金', effect: 'goldFind', base: 0.03, perTier: 0.015, desc: '回收金币收益' },
  {
    id: 'prospect',
    name: '勘探',
    effect: 'stoneFind',
    base: 0.05,
    perTier: 0.025,
    desc: '重铸石掉落率（仅 T4 以上矿脉；小箱不受加成）',
    // v3.0 L1：只对 T4+ 装备生效 → 同样只在 T4+ 装备的词缀池里出现（否则低档装备会摇到死词缀）
    tierMin: 4,
  },
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

// ---------------- 伙伴与远征（v2.2） ----------------
// 数值口径见 docs/design-v2.2.md §2 与 scripts/sim-expedition.mjs（先模拟后定档）
// 战力 = L × R × (1 + 0.02 × (L−1))；需求战力 ≤ 5 × 75.84 × 1.24 = 470.2（内容校验守护）
const companions = [
  { id: 'apprentice', name: '学徒·小砾', rarity: 'common', rarityFactor: 1.0, startLevel: 1, desc: '矿镇里长大的孩子，认路比认字快。' },
  { id: 'prospector', name: '勘探者·灰岩', rarity: 'common', rarityFactor: 1.0, startLevel: 1, desc: '一辈子在废矿里找矿脉的老手。' },
  { id: 'ranger', name: '游侠·青穗', rarity: 'elite', rarityFactor: 1.25, startLevel: 1, desc: '走过遗迹外围的每一道裂隙。' },
  { id: 'scholar', name: '学者·墨衡', rarity: 'elite', rarityFactor: 1.25, startLevel: 1, desc: '为一行铭文能在遗迹里蹲三天。' },
  { id: 'warden', name: '守望者·铁誓', rarity: 'legend', rarityFactor: 1.6, startLevel: 1, desc: '深渊前哨的最后一位守望者。' },
  { id: 'seer', name: '先知·星屑', rarity: 'legend', rarityFactor: 1.6, startLevel: 1, desc: '据说能听见虚空矿脉的心跳。' },
]

const traits = [
  { id: 'diligent', name: '勤勉', desc: '补给消耗 −25%（每队只生效一次）', effect: 'supply', value: -0.25 },
  { id: 'greedy', name: '贪婪', desc: '金币产出 +20%（每队只生效一次）', effect: 'gold', value: 0.2 },
  { id: 'scholar', name: '博识', desc: '伙伴经验 +25%（每队只生效一次）', effect: 'xp', value: 0.25 },
  { id: 'seeker', name: '寻宝', desc: '徽记与遗物概率 +30%（每队只生效一次）', effect: 'find', value: 0.3 },
]

const TIER_SUFFIX = { 1: 'copper', 2: 'iron', 3: 'silver', 4: 'gold', 5: 'mithril', 6: 'starlite', 7: 'void' }
const routes = [
  {
    id: 'outskirts', name: '近郊勘探', unlock: { type: 'companion', value: 1 }, reqPower: 3,
    anchorGoldPerHour: 2812, ratio: 0.09, tier: 1,
    supply: { itemId: 'ingot_copper', qtyPer8h: 16 }, tokenPer8h: 1.0, relic: null, relicChancePerHour: 0,
    stonePer8h: 0, xpPerHour: 25, materialItemId: 'ore_copper',
  },
  {
    id: 'oldmine', name: '废弃矿道', unlock: { type: 'skill', skill: 'mining', value: 20 }, reqPower: 30,
    anchorGoldPerHour: 18527, ratio: 0.09, tier: 3,
    supply: { itemId: 'ingot_iron', qtyPer8h: 24 }, tokenPer8h: 0.6, relic: 'relic_gear', relicChancePerHour: 0.045,
    stonePer8h: 0, xpPerHour: 45, materialItemId: 'ore_silver',
  },
  {
    id: 'ruins', name: '古代遗迹', unlock: { type: 'skill', skill: 'forging', value: 35 }, reqPower: 120,
    anchorGoldPerHour: 30590, ratio: 0.09, tier: 4,
    supply: { itemId: 'ingot_mithril', qtyPer8h: 8 }, tokenPer8h: 0.5, relic: 'relic_shard', relicChancePerHour: 0.045,
    stonePer8h: 3, xpPerHour: 90, materialItemId: 'ore_gold',
  },
  {
    id: 'abyss', name: '深渊前哨', unlock: { type: 'totalLevel', value: 150 }, reqPower: 300,
    anchorGoldPerHour: 74845, ratio: 0.09, tier: 7,
    supply: { itemId: 'ingot_void', qtyPer8h: 8 }, tokenPer8h: 0.4, relic: 'relic_core', relicChancePerHour: 0.045,
    stonePer8h: 0, xpPerHour: 150, materialItemId: 'ore_void',
  },
]

const expeditions = {
  routes,
  traits,
  hours: [1, 4, 8],
  /** 产出拆分：金币 60% / 材料 40%（材料按路线本位矿石发放） */
  goldShare: 0.6,
  team: { base: 2, maxPerBanner: 1 },
  banner: {
    maxLevel: 3,
    powerPerLevel: 0.08,
    cost: [
      { tokens: 5, gold: 20000 },
      { tokens: 8, gold: 60000 },
      { tokens: 12, gold: 150000 },
    ],
  },
  recruit: { tokens: 3, gold: 5000, duplicateXp: 300 },
  traitReroll: { tokens: 1, gold: 2000 },
  levelCurve: { base: 25, exponent: 1.5 },
  /** 失败保底：产出 40%，徽记/遗物概率减半 */
  failYieldShare: 0.4,
  /** 初始伙伴（使远征在开局即可启动，避免"无伙伴→无徽记→无法招募"死锁） */
  starter: 'apprentice',
}

const companionsDef = { companions, startLevelCap: 30 }

// ---------------- 图鉴与赛季（v2.3） ----------------
// 数值口径：docs/design-v2.3.md（先模拟后定档，scripts/sim-season.mjs → docs/sim-season-output.json）
const season = {
  /** 赛季纪元（UTC 2026-01-01T00:00:00Z）；seasonIndex = floor((now − epoch) / 14d)，且仅当前向轮换 */
  // v3.0 C8：EPOCH 对齐到**周一 00:00 (+08:00)**（旧值 2026-01-01T00:00Z 是周四，与本地日/周常错位）
  epoch: Date.parse('2026-01-05T00:00:00+08:00'),
  days: 14,
  /** 解锁门槛：总等级 */
  unlockTotalLevel: 60,
  levels: 20,
  renownPerLevel: 4,
  tierRenown: { bronze: 10, silver: 20, gold: 40 },
  /** 每级奖励（即时自动发放） */
  levelReward: { goldBase: 500, goldPerLevel: 250, essenceBase: 1, essencePerFour: 1, tokenEvery: 5, tokenAmount: 2, maxLevelTokens: 10 },
  /** 任务模板（计数器复用既有 TaskCounter） */
  templates: [
    { id: 's_mine', title: '深层采掘', desc: '挖掘任意矿脉', counter: 'totalMines', unit: '次', targets: [4000, 9000, 18000] },
    { id: 's_craft', title: '炉火不熄', desc: '熔炼或锻造', counter: 'totalCrafts', unit: '次', targets: [1000, 2400, 4800] },
    // C10：口径写清是**毛收入**（含任务/成就/卖店/远征；赛季等级奖励同样计入）
    { id: 's_gold', title: '财富积累', desc: '累计获得金币（毛收入：任务/成就/卖店/远征均计入）', counter: 'totalGoldEarned', unit: '金', targets: [250000, 500000, 800000] },
    { id: 's_enhance', title: '锤炼不止', desc: '强化尝试（需在线）', counter: 'totalEnhances', unit: '次', targets: [120, 320, 600] },
    { id: 's_expedition', title: '远行不辍', desc: '完成远征', counter: 'totalExpeditions', unit: '次', targets: [12, 20, 28] },
    { id: 's_reforge', title: '精益求精', desc: '重铸词缀（需在线）', counter: 'totalReforges', unit: '次', targets: [15, 35, 60] },
  ],
  /** 图鉴里程碑（每 25%；与赛季解耦，只给自奖励） */
  /**
   * 图鉴里程碑（v3.0 §2.2c）：**分区门槛**而不是线性百分比。
   * 病灶：物品+配方占 88.3%，旧的"总数 50%"≈全物品+7 条配方 → 玩家在单一分区撞墙。
   * 现在每档都要求在**每个分区**各达标（pct 仅用于展示与成就 codex_25/50/75/100）。
   * 门槛值由 scripts/sim-codex.mjs 实算并落 JSON，测试逐条断言。
   */
  codexMilestones: [
    { pct: 0.25, title: '初识万象', gold: 2500, essence: 10, tokens: 0, req: { items: 0.4, recipes: 0.3, affixes: 0.34, companions: 0.34, relics: 0.34, ores: 0.5 } },
    { pct: 0.5, title: '博览群书', gold: 12000, essence: 25, tokens: 3, req: { items: 0.7, recipes: 0.6, affixes: 0.67, companions: 0.67, relics: 0.67, ores: 0.75 } },
    { pct: 0.75, title: '格物致知', gold: 30000, essence: 45, tokens: 6, req: { items: 0.9, recipes: 0.85, affixes: 1, companions: 1, relics: 1, ores: 1 } },
    { pct: 1.0, title: '万物归一', gold: 80000, essence: 80, tokens: 15, req: { items: 1, recipes: 1, affixes: 1, companions: 1, relics: 1, ores: 1 } },
  ],
}

// ---------------- 深渊回廊（v2.4） ----------------
// 数值口径：docs/design-v2.4.md（先模拟后定档，scripts/sim-abyss.mjs → docs/sim-abyss-output.json）
// base/growth 由 sim-abyss.mjs **反解 + ±3% 邻域搜索**定档（34 个取值满足三档目标带）
const abyss = {
  /** 体力：上限与恢复间隔（毫秒）；溢出丢弃（见 abyss.ts regenStamina） */
  staminaMax: 12,
  staminaRegenMinutes: 30,
  /** 战力权重（六项加权和；口径逐项见 abyss.ts abyssScore） */
  weights: { speed: 1.0, efficiency: 1.5, quantity: 1.0, rareFind: 0.7, wisdom: 0.5, enhanceRate: 2.0 },
  /** 门槛 = base × growth^(层−1) × 层词条门槛倍率 */
  base: 2.736,
  growth: 1.031,
  themes: ['矿脉裂隙', '熔岩回廊', '符文甬道', '无光深渊', '虚空之喉'],
  /**
   * v3.0 层词条（L6）：按 floor % 5 取值，floor 1 = 迅捷层（新玩家第一层不受惩罚）。
   * 设计期实算（docs/design-v3.0.md §2.3a）：可达层 10/26/35 → 9/24/34；
   * 门槛环比：裂隙→富矿 ×1.1626（墙）、富矿→迅捷 ×0.9726（喘息）、其余 ×1.0310。
   */
  mods: [
    { mod: 1, id: 'swift', name: '迅捷层', desc: '速度权重 ×1.5', reqMul: 1.0, crystalMul: 1.0, weightMul: { speed: 1.5 } },
    { mod: 2, id: 'bounty', name: '丰饶层', desc: '产量与稀有权重 ×1.5', reqMul: 1.0, crystalMul: 1.0, weightMul: { quantity: 1.5, rareFind: 1.5 } },
    { mod: 3, id: 'trial', name: '试炼层', desc: '强化率权重 ×1.5', reqMul: 1.0, crystalMul: 1.0, weightMul: { enhanceRate: 1.5 } },
    { mod: 4, id: 'rift', name: '裂隙层', desc: '门槛 ×0.94（墙前的喘息层），结晶 ×0.8', reqMul: 0.94, crystalMul: 0.8, weightMul: {} },
    { mod: 0, id: 'rich', name: '富矿层', desc: '门槛 ×1.06（每 5 层一道墙），结晶 ×1.5', reqMul: 1.06, crystalMul: 1.5, weightMul: {} },
  ],
  /** 结晶取整（脚本与内核同源，避免 ×1.5/×0.8 产生小数） */
  rounding: 'floor',
  /** 连打：一次挑战最多连打几层（逐层判定，首个失败层停止） */
  challengeMaxFloors: 3,
  /** 批量扫荡：一次最多扫荡次数（UI「用尽体力」按体力上限取 min） */
  sweepMaxCount: 12,
  /** 离线回体上限提升（仅离线段有效；时间比例，不可刷） */
  offlineCapExtra: 12,
  /** 首通结晶 = base + perFloor × 层 */
  firstClearCrystal: { base: 10, perFloor: 2 },
  /** 扫荡结晶 = base + ⌊层 / perFloor⌋ */
  repeatCrystal: { base: 1, perFloor: 20 },
  /** 商店：可重复项用 priceGrowth 递增；一次性项 priceGrowth = 1 */
  shop: [
    { id: 'reroll_ticket', name: '定向重铸券', desc: '重铸时指定一条词缀 id 保底出现（可重复购买，价格递增）', crystal: 100, max: 12, priceGrowth: 1.3 },
    { id: 'permanent_speed', name: '永久速度', desc: '永久 +1% 速度 / 级（可重复购买，价格递增）', crystal: 150, max: 8, priceGrowth: 1.3, perLevel: 0.01 },
    { id: 'relic_gear', name: '遗物·锈蚀齿轮', desc: '直接兑换该遗物（补齐图鉴 100%）', crystal: 200, max: 1, priceGrowth: 1, itemId: 'relic_gear' },
    { id: 'relic_shard', name: '遗物·铭文碎片', desc: '直接兑换该遗物（补齐图鉴 100%）', crystal: 200, max: 1, priceGrowth: 1, itemId: 'relic_shard' },
    { id: 'relic_core', name: '遗物·深渊之核', desc: '直接兑换该遗物（补齐图鉴 100%）', crystal: 200, max: 1, priceGrowth: 1, itemId: 'relic_core' },
    { id: 'title', name: '称号「深渊行者」', desc: '顶栏展示称号', crystal: 200, max: 1, priceGrowth: 1 },
  ],
}

// ---------------- 视听与手感（v2.5） ----------------
// 设计：docs/design-v2.5.md（表现层版本；证据由 scripts/audit-fx.mjs 输出）
// 音效全部程序化合成（振荡器 + 包络 + 噪声），**零外部资源**
const fx = {
  /** 音效清单：wave ∈ sine/square/triangle/sawtooth/noise；freqs 为按序播放的音高（Hz） */
  cues: [
    { id: 'actionStart', name: '开始动作', wave: 'triangle', freqs: [220], durationMs: 60, gain: 0.5 },
    { id: 'actionComplete', name: '动作完成', wave: 'triangle', freqs: [330], durationMs: 80, gain: 0.45 },
    // 注意：**不要恢复 'queueAdvance'**。队列接力没有事件来源（GameEvent 无对应成员），
    // 会让 audit E3「cue 名一致性」永远报未引用；v2.5 设计评审已删除该 cue。
    // 历史教训：v2.5 开发期曾手改 data/fx.json（删 cue、改默认档），
    // 而生成器没同步 → 任何人跑 `npm run gen` 就会回滚这些修正（测评 B2）。
    // 因此：**fx 的任何改动都必须改这里，再跑 npm run gen**。
    { id: 'levelUp', name: '技能升级', wave: 'sine', freqs: [440, 554, 659], durationMs: 320, gain: 0.5 },
    { id: 'prestige', name: '传承', wave: 'sine', freqs: [392, 523, 659, 784], durationMs: 700, gain: 0.55 },
    { id: 'seasonLevel', name: '赛季升级', wave: 'sine', freqs: [523, 659], durationMs: 260, gain: 0.45 },
    { id: 'enhanceSuccess', name: '强化成功', wave: 'square', freqs: [660, 990], durationMs: 180, gain: 0.4 },
    { id: 'enhanceFail', name: '强化失败', wave: 'noise', freqs: [200], durationMs: 160, gain: 0.45 },
    { id: 'enhanceGuarded', name: '庇护生效', wave: 'triangle', freqs: [392], durationMs: 140, gain: 0.4 },
    { id: 'crateOpen', name: '开箱', wave: 'noise', freqs: [420, 660], durationMs: 220, gain: 0.45 },
    { id: 'rareDrop', name: '稀有掉落', wave: 'sine', freqs: [880, 1320], durationMs: 400, gain: 0.42 },
    { id: 'lootBig', name: '大奖', wave: 'sine', freqs: [660, 990, 1320], durationMs: 600, gain: 0.5 },
    { id: 'taskComplete', name: '任务完成', wave: 'triangle', freqs: [523, 659], durationMs: 240, gain: 0.45 },
    { id: 'achievement', name: '成就达成', wave: 'sine', freqs: [659, 784, 988], durationMs: 420, gain: 0.5 },
    { id: 'abyssClear', name: '深渊通关', wave: 'sine', freqs: [196, 247, 294], durationMs: 520, gain: 0.5 },
    { id: 'purchase', name: '购买', wave: 'triangle', freqs: [494, 587], durationMs: 180, gain: 0.42 },
    { id: 'blocked', name: '操作被阻塞', wave: 'square', freqs: [220, 165], durationMs: 160, gain: 0.35 },
  ],
  /** 预算与上限（证据脚本据此断言） */
  budget: {
    maxParticles: 260,      // 与 SceneCanvas 既有 MAX_P 一致（既有常驻粉尘 + 交互爆发共享）
    maxBurstParticles: 60,  // 单次交互爆发上限
    maxBurstsPerSecond: 4,  // 交互爆发频率上限
    maxPopups: 6,           // 同屏飘字上限
    frameBudgetMs: 1.5,     // 单帧表现层绘制预算（1440px 桌面，烟测实测）
    loopBudgetMs: 0.5,      // 主循环（250ms tick）额外耗时预算（音效触发 + 事件入队）
    maxConcurrentVoices: 8, // WebAudio 同时发声上限
  },
  /**
   * 设置默认值（写入 meta.settings）。
   * fx 默认 **'auto'**（跟随系统「减少动态效果」偏好），不是 'full'：
   * 默认全动效会让前庭敏感玩家一进游戏就被强动效包围，无障碍上不可接受。
   */
  defaults: { sound: true, volume: 60, fx: 'auto' },
  /** 实际生效档位（'auto' 是玩家档位，由壳层 resolveFxLevel 解析成这三档之一） */
  fxLevels: ['full', 'reduced', 'off'],
}

// ---------------- 输出 ----------------
void TIER_SUFFIX
const OUT = {
  'companions.json': companionsDef,
  'expeditions.json': expeditions,
  'season.json': season,
  'abyss.json': abyss,
  'fx.json': fx,
  'items.json': items,
  'recipes.json': recipes,
  'runes.json': runes,
  'affixes.json': affixDefs,
}

/**
 * `--check`：只比对不写盘（供 `npm run gen:check` 与 tests/toolchain.test.ts 使用）。
 * 目的：保证 data/*.json 与生成器**同源** —— 曾经出现过"手改 data/fx.json 而生成器没同步"，
 * 结果跑一次 `npm run gen` 就回滚了设计修正（v2.5 测评 Blocker B2）。
 */
if (process.argv.includes('--check')) {
  const drift = []
  for (const [name, value] of Object.entries(OUT)) {
    const want = JSON.stringify(value, null, 2) + '\n'
    let have = null
    try {
      have = readFileSync(join(dataDir, name), 'utf8')
    } catch {
      drift.push(`${name}（缺失）`)
      continue
    }
    const norm = (t) => t.replace(/\r\n/g, '\n')
    if (norm(have) !== want) drift.push(name)
  }
  if (drift.length === 0) {
    console.log(`[gen-content] --check 通过：${Object.keys(OUT).length} 个 data 文件与生成器同源`)
  } else {
    console.error(`[gen-content] --check 失败：${drift.join(', ')} 与生成器不一致`)
    console.error('  修正：改 scripts/gen-content.mjs（不要手改 data/*.json），然后 npm run gen')
    process.exitCode = 1
  }
} else {
  for (const [name, value] of Object.entries(OUT)) {
    writeFileSync(join(dataDir, name), JSON.stringify(value, null, 2) + '\n')
  }
}

const itemCount = Object.keys(items).length
console.log(`[gen-content] items: ${itemCount}（材料 18 + 装备 ${itemCount - 18 - runes.length} + 符文 ${runes.length}），recipes: ${recipes.length}`)
console.log(`[gen-content] affixes: ${AFFIXES.length}（4 池）`)
console.log(`[gen-content] companions: ${companions.length}（按 ${companionsDef.startLevelCap} 级上限）｜ routes: ${routes.length} × ${expeditions.hours.length} 档`)
console.log(`[gen-content] season: ${season.days} 天 / ${season.levels} 级 / ${season.templates.length} 模板`)
console.log(`[gen-content] abyss: 体力 ${abyss.staminaMax} / 门槛 ${abyss.base}×${abyss.growth}^n / 商店 ${abyss.shop.length} 项`)
console.log(`[gen-content] fx: 音效 ${fx.cues.length} 条 / 预算 ${Object.keys(fx.budget).length} 项`)
console.log('[gen-content] 输出: data/items.json, data/recipes.json, data/runes.json, data/affixes.json, data/companions.json, data/expeditions.json, data/season.json, data/abyss.json, data/fx.json')
