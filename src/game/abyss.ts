// ============================================================
// Forging · 深渊回廊（v2.4）
// 设计：docs/design-v2.4.md（先模拟后定档：scripts/sim-abyss.mjs → docs/sim-abyss-output.json）
//
// 口径硬定义（§2.1，逐项与 settle.ts 的实现一致）：
//   速度   = 采矿速度 = agg.allSpeed + agg.toolSpeed.mining + buff.speed + perk.speed + abyss.permanentSpeed
//   效率   = agg.efficiency + buff.efficiency + perk.efficiency
//   产量   = agg.quantity                      （无 buff/perk）
//   稀有   = agg.rareFind + buff.rareFind + perk.rareFind
//   经验   = agg.wisdom + perk.wisdom           （无 wisdom 符文）
//   强化率 = agg.enhanceRate + buff.enhanceRate（无 perk）
//   —— 战力是**注入 now** 的纯函数（符文增益可复现，测试不依赖 Date.now()）
//
// 体力（§2.3 实现级伪码）：按真实时间恢复、**溢出丢弃**、余数保留、单调守卫
// ============================================================
import { poolOf } from './affixes'
import { buffBonuses } from './buffs'
import { CONTENT, itemDef } from './content'
import { perkBonuses } from './prestige'
import { aggregateEquipment } from './stats'
import { addMaterial } from './state'
import type {
  AbyssModDef,
  AbyssShopItemDef,
  AbyssState,
  AbyssWeightKey,
  GameEvent,
  GameState,
  ItemId,
} from './types'

const DEF = CONTENT.abyss
const REGEN_MS = DEF.staminaRegenMinutes * 60_000

export function abyssDef() {
  return DEF
}

export function shopItem(id: string): AbyssShopItemDef | undefined {
  return DEF.shop.find((x) => x.id === id)
}

// ---------------- 体力 ----------------

/**
 * 恢复体力（幂等；可任意频率调用）：
 *   1) now ≤ staminaAt → 不动（回拨/异常时钟）
 *   2) ticks = ⌊(now − staminaAt) / REGEN_MS⌋，≤0 不动
 *   3) staminaAt 按 raw tick 推进（余数保留）
 *   4) cap = staminaMax + capExtra；已满只停止累积，**绝不截断**存量
 *      （v3.0 评审 BL1：原实现 Math.min(cap, …) 会在 capExtra 结束后静默删掉超上限部分）
 *
 * capExtra 仅由**离线结算**传入（设计 §2.3d）：离线回体上限 12+12=24，时间比例、不可刷。
 */
export function regenStamina(state: GameState, now: number, capExtra = 0): void {
  const a = state.abyss
  if (now <= a.staminaAt) return
  const ticks = Math.floor((now - a.staminaAt) / REGEN_MS)
  if (ticks <= 0) return
  a.staminaAt += ticks * REGEN_MS
  const cap = DEF.staminaMax + Math.max(0, capExtra)
  if (a.stamina >= cap) return // 满了就不再累积，也不动存量
  a.stamina = Math.min(cap, a.stamina + ticks)
}

/** 距下一点体力的毫秒数（"已满"按**在线上限**判定：离线超额部分是临时量） */
export function msToNextStamina(state: GameState, now: number): number {
  if (state.abyss.stamina >= DEF.staminaMax) return 0
  return Math.max(0, state.abyss.staminaAt + REGEN_MS - now)
}

/** 离线结算用：回体上限提升量（0 表示内容表未启用） */
export function offlineCapExtra(): number {
  return DEF.offlineCapExtra ?? 0
}

// ---------------- 战力（六项加权和） ----------------

export interface AbyssScoreBreakdown {
  /** 各项原始值 */
  values: Record<AbyssWeightKey, number>
  /** 各项贡献（有效权重 × 原值） */
  contributions: Record<AbyssWeightKey, number>
  total: number
  /** 本次使用的有效权重（含层词条修正；无功时即内容表权重） */
  weights: Record<AbyssWeightKey, number>
}

/**
 * 深渊战力（纯函数，注入 now 以便符文增益可复现）。
 * 六项口径见文件头注释；召唤方传入的 agg 由调用点提供以免重复计算。
 */
export function abyssScore(state: GameState, now: number, floor?: number): AbyssScoreBreakdown {
  const agg = aggregateEquipment(state)
  const buff = buffBonuses(state, now)
  const perk = perkBonuses(state)
  const values: Record<AbyssWeightKey, number> = {
    // 注意：永永速度已由 aggregateEquipment 汇总进 allSpeed（stats.ts），此处**不得再加一次**
    speed: agg.allSpeed + agg.toolSpeed.mining + buff.speed + perk.speed,
    efficiency: agg.efficiency + buff.efficiency + perk.efficiency,
    quantity: agg.quantity,
    rareFind: agg.rareFind + buff.rareFind + perk.rareFind,
    wisdom: agg.wisdom + perk.wisdom,
    enhanceRate: agg.enhanceRate + buff.enhanceRate,
  }
  // 层词条生效时用**同一份有效权重**算贡献与合计（面板明细必须自洽）
  const weights = floor === undefined ? DEF.weights : abyssWeights(floor)
  const contributions = {} as Record<AbyssWeightKey, number>
  let total = 0
  for (const k of Object.keys(values) as AbyssWeightKey[]) {
    const c = values[k] * (weights[k] ?? 0)
    contributions[k] = c
    total += c
  }
  return { values, contributions, total, weights }
}


// ---------------- 层词条（v3.0 L6） ----------------

/**
 * 轮换周期（层）：主题每 5 层切换、词条每 5 层轮换（同一常量）。
 * v3.4.6：从字面量提为导出常量 —— 面板文案「主题每 25 层循环、词条每 5 层轮换」
 * 现在从这里插值（此前是写死的数字，B 评审列为公式型漏网）。
 */
export const ABYSS_CYCLE = 5

/** 该层的词条（确定性：floor % ABYSS_CYCLE；floor 1 = 迅捷层，新玩家第一层不受惩罚） */
export function abyssModifier(floor: number): AbyssModDef {
  const m = DEF.mods.find((x) => x.mod === floor % ABYSS_CYCLE)
  // 内容表由 validateContent 保证五态完备；兜底返回"无修正"以免运行期抛错
  return m ?? { mod: floor % ABYSS_CYCLE, id: 'none', name: '寻常层', desc: '', reqMul: 1, crystalMul: 1, weightMul: {} }
}

/** 该层的有效权重（层词条修正后） */
export function abyssWeights(floor: number): Record<AbyssWeightKey, number> {
  const mod = abyssModifier(floor)
  const out = {} as Record<AbyssWeightKey, number>
  for (const k of Object.keys(DEF.weights) as AbyssWeightKey[]) {
    out[k] = (DEF.weights[k] ?? 0) * (mod.weightMul[k] ?? 1)
  }
  return out
}

/** 结晶取整（内容表声明；脚本与内核同源） */
function roundCrystal(v: number): number {
  return DEF.rounding === 'floor' ? Math.floor(v) : Math.round(v)
}

// ---------------- 层数与门槛 ----------------

/**
 * 层门槛。
 * v3.1：第 1~3 层用 **introReqs**（入门三层，让 T3 装备也能起步）；
 * 第 4 层起 = base × growth^(层−1) × 层词条门槛倍率。
 */
export function abyssRequirement(floor: number): number {
  const intro = DEF.introReqs ?? []
  if (floor >= 1 && floor <= intro.length) return intro[floor - 1]
  return DEF.base * Math.pow(DEF.growth, floor - 1) * abyssModifier(floor).reqMul
}

/** v3.1：连打 N 层的体力消耗（缺省按内容表；越界回落到 1 点/层上限） */
export function chainStaminaCost(floors: number): number {
  const cost = DEF.chainCost ?? []
  const n = Math.max(1, Math.min(Math.floor(floors), DEF.challengeMaxFloors))
  return cost[n - 1] ?? n
}

export function abyssTheme(floor: number): string {
  return DEF.themes[Math.floor((floor - 1) / ABYSS_CYCLE) % DEF.themes.length] ?? ''
}

export function firstClearCrystal(floor: number): number {
  return roundCrystal((DEF.firstClearCrystal.base + DEF.firstClearCrystal.perFloor * floor) * abyssModifier(floor).crystalMul)
}

/**
 * 扫荡结晶：**不吃层词条倍率**。
 * 原因（开发期自检）：扫荡以 bestFloor 为基准，若乘该层词条倍率，停在第 34 层（裂隙 ×0.8）
 * 与第 35 层（富矿 ×1.5）会得到 1 : 3 的悬崖式差异 —— 玩家无法选择停在哪层，
 * 却要为一个不可控因素承受 3 倍收益波动。故倍率只作用于**首通**。
 */
export function repeatCrystal(floor: number): number {
  return DEF.repeatCrystal.base + Math.floor(floor / DEF.repeatCrystal.perFloor)
}

// ---------------- 挑战 / 扫荡 ----------------

/**
 * 挑战（v3.0 L7 连打）：从 bestFloor+1 起**逐层判定**，最多连打 challengeMaxFloors 层，
 * 遇到首个不达标的层就停下。
 *   - 整次连打只消耗 **1 点体力**（与单层挑战一致）
 *   - 战力不足 → blocked 且**不消耗体力**（既有规则）
 *   - 首通奖励**逐层补发**（不存在"跳过层"，故无奖励黑洞）
 *   - 只发 **1 条** abyssCleared（含 clearedTo 与总结晶）
 */
export function challengeAbyss(state: GameState, now: number, events: GameEvent[], floors = 1): void {
  regenStamina(state, now)
  const a = state.abyss
  const want = Math.max(1, Math.min(Math.floor(floors), DEF.challengeMaxFloors))
  const first = a.bestFloor + 1
  const need0 = abyssRequirement(first)
  const score0 = abyssScore(state, now, first).total
  if (score0 < need0) {
    events.push({
      type: 'blocked',
      reason: `战力不足：第 ${first} 层（${abyssModifier(first).name}）需要 ${need0.toFixed(2)}（当前 ${score0.toFixed(2)}，还差 ${(need0 - score0).toFixed(2)}）`,
    })
    return
  }
  // v3.1：连打代价按内容表（×1/×2 各 1 点、×3 为 2 点）—— 失败仍不收费
  const cost = chainStaminaCost(want)
  if (a.stamina < cost) {
    events.push({ type: 'blocked', reason: `体力不足（连打 ${want} 层需 ${cost} 点，当前 ${a.stamina}）` })
    return
  }
  a.stamina -= cost

  let cleared = 0
  let gainTotal = 0
  for (let i = 0; i < want; i++) {
    const floor = a.bestFloor + 1
    const score = abyssScore(state, now, floor).total
    if (score < abyssRequirement(floor)) break
    const gain = firstClearCrystal(floor)
    a.bestFloor = floor
    a.crystals += gain
    gainTotal += gain
    cleared += 1
  }
  if (cleared === 0) {
    // 兜底（上面已判过 first 层；理论不可达）——保持不消耗体力的语义
    a.stamina += cost
    events.push({ type: 'blocked', reason: '战力不足' })
    return
  }
  const top = a.bestFloor
  events.push({
    type: 'abyssCleared',
    floor: top,
    crystals: gainTotal,
    clearedTo: top,
    count: cleared,
    modName: abyssModifier(top).name,
  })
}

/**
 * 扫荡（v3.0 L7 批量）：一次结算 count 次（上限 sweepMaxCount，且受体力截断）。
 *   - **逐次累加** stats.totalAbyssSweeps（成就依赖它）
 *   - 只发 **1 条** abyssSwept 汇总事件（crystals 为总量，count 为次数）
 *   - 单次收益不变（批量只是省点击，不改变经济）
 */
export function sweepAbyss(state: GameState, now: number, events: GameEvent[], count = 1): void {
  regenStamina(state, now)
  const a = state.abyss
  if (a.bestFloor < 1) {
    events.push({ type: 'blocked', reason: '尚未通关任何层，无法扫荡' })
    return
  }
  if (a.stamina < 1) {
    events.push({ type: 'blocked', reason: `体力不足（${a.stamina}/${DEF.staminaMax}）` })
    return
  }
  const n = Math.max(1, Math.min(Math.floor(count), DEF.sweepMaxCount, a.stamina))
  const per = repeatCrystal(a.bestFloor)
  const gain = per * n
  a.stamina -= n
  a.crystals += gain
  state.stats.totalAbyssSweeps += n
  events.push({ type: 'abyssSwept', crystals: gain, count: n })
}

// ---------------- 商店 ----------------

/** 第 k 次购买（k 从 0 起）的价格 */
export function priceOf(item: AbyssShopItemDef, k: number): number {
  return Math.round(item.crystal * Math.pow(item.priceGrowth, k))
}

export function nextPrice(state: GameState, id: string): number | null {
  const item = shopItem(id)
  if (!item) return null
  const bought = state.abyss.purchased[id] ?? 0
  if (bought >= item.max) return null
  return priceOf(item, bought)
}

/** 购买：一次生效、价格递增、上限与结晶校验（幂等字段 purchased） */
export function buyAbyssItem(state: GameState, id: string, events: GameEvent[]): void {
  const item = shopItem(id)
  if (!item) {
    events.push({ type: 'blocked', reason: '商品不存在' })
    return
  }
  const bought = state.abyss.purchased[id] ?? 0
  if (bought >= item.max) {
    events.push({ type: 'blocked', reason: `${item.name} 已购买上限（${item.max}）` })
    return
  }
  const price = priceOf(item, bought)
  if (state.abyss.crystals < price) {
    events.push({ type: 'blocked', reason: `深渊结晶不足（需要 ${price}）` })
    return
  }
  state.abyss.crystals -= price
  state.abyss.purchased[id] = bought + 1
  state.stats.totalAbyssPurchases += 1

  if (id === 'reroll_ticket') state.abyss.tickets += 1
  else if (id === 'permanent_speed') state.abyss.permanentSpeed += 1
  else if (id === 'title') state.abyss.title = true
  else if (item.itemId) addMaterial(state, item.itemId, 1)

  events.push({ type: 'abyssItemBought', name: item.name })
}

// ---------------- 视图 ----------------

export interface AbyssView {
  score: AbyssScoreBreakdown
  bestFloor: number
  nextFloor: number
  nextRequirement: number
  nextTheme: string
  gap: number
  stamina: number
  staminaMax: number
  msToNext: number
  crystals: number
  tickets: number
  permanentSpeed: number
  title: boolean
  shop: { def: AbyssShopItemDef; bought: number; price: number | null; affordable: boolean }[]
}

export function abyssView(state: GameState, now: number): AbyssView {
  const nextFloor = state.abyss.bestFloor + 1
  // v3.0 测评 D1（Blocker）：面板必须用**下一层的有效权重**算分数/差额/明细，
  // 否则倾斜层（迅捷/丰饶/试炼）会出现"面板说打不过、内核判定能过"的口径分裂。
  const score = abyssScore(state, now, nextFloor)
  const nextRequirement = abyssRequirement(nextFloor)
  return {
    score,
    bestFloor: state.abyss.bestFloor,
    nextFloor,
    nextRequirement,
    nextTheme: abyssTheme(nextFloor),
    gap: nextRequirement - score.total,
    stamina: state.abyss.stamina,
    staminaMax: DEF.staminaMax,
    msToNext: msToNextStamina(state, now),
    crystals: state.abyss.crystals,
    tickets: state.abyss.tickets,
    permanentSpeed: state.abyss.permanentSpeed,
    title: state.abyss.title,
    shop: DEF.shop.map((def) => {
      const price = nextPrice(state, def.id)
      return { def, bought: state.abyss.purchased[def.id] ?? 0, price, affordable: price !== null && state.abyss.crystals >= price }
    }),
  }
}

/** 券是否可用于指定装备（池内存在且未与锁定冲突） */
export function ticketUsable(state: GameState, itemId: ItemId, ticketAffixId: string, lockedIds: readonly string[]): string | null {
  if (state.abyss.tickets < 1) return '没有定向重铸券'
  if (lockedIds.includes(ticketAffixId)) return '券指定的词缀已被锁定'
  const pool = poolOf(itemDef(itemId))
  if (!pool.includes(ticketAffixId)) return '该词缀不属于这件装备的原型池'
  return null
}


/** 消耗一张券（仅在重铸成功路径调用） */
export function consumeTicket(state: GameState): void {
  state.abyss.tickets = Math.max(0, state.abyss.tickets - 1)
}

export const ABYSS_REGEN_MS = REGEN_MS
export type { AbyssState }
