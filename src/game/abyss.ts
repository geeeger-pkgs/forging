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
 *   4) stamina 上限截断 → **满体力期间的时间被丢弃**（离线 8h 也只补到上限）
 */
export function regenStamina(state: GameState, now: number): void {
  const a = state.abyss
  if (now <= a.staminaAt) return
  const ticks = Math.floor((now - a.staminaAt) / REGEN_MS)
  if (ticks <= 0) return
  a.staminaAt += ticks * REGEN_MS
  a.stamina = Math.min(DEF.staminaMax, a.stamina + ticks)
}

/** 距下一点体力的毫秒数 */
export function msToNextStamina(state: GameState, now: number): number {
  if (state.abyss.stamina >= DEF.staminaMax) return 0
  return Math.max(0, state.abyss.staminaAt + REGEN_MS - now)
}

// ---------------- 战力（六项加权和） ----------------

export interface AbyssScoreBreakdown {
  /** 各项原始值 */
  values: Record<AbyssWeightKey, number>
  /** 各项贡献（权重 × 原值） */
  contributions: Record<AbyssWeightKey, number>
  total: number
}

/**
 * 深渊战力（纯函数，注入 now 以便符文增益可复现）。
 * 六项口径见文件头注释；召唤方传入的 agg 由调用点提供以免重复计算。
 */
export function abyssScore(state: GameState, now: number): AbyssScoreBreakdown {
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
  const contributions = {} as Record<AbyssWeightKey, number>
  let total = 0
  for (const k of Object.keys(values) as AbyssWeightKey[]) {
    const c = values[k] * (DEF.weights[k] ?? 0)
    contributions[k] = c
    total += c
  }
  return { values, contributions, total }
}


// ---------------- 层数与门槛 ----------------

export function abyssRequirement(floor: number): number {
  return DEF.base * Math.pow(DEF.growth, floor - 1)
}

export function abyssTheme(floor: number): string {
  return DEF.themes[Math.floor((floor - 1) / 5) % DEF.themes.length] ?? ''
}

export function firstClearCrystal(floor: number): number {
  return DEF.firstClearCrystal.base + DEF.firstClearCrystal.perFloor * floor
}

export function repeatCrystal(floor: number): number {
  return DEF.repeatCrystal.base + Math.floor(floor / DEF.repeatCrystal.perFloor)
}

// ---------------- 挑战 / 扫荡 ----------------

/**
 * 挑战下一层：战力不足 → blocked（**不消耗体力**，评审复审 ① 统一语义）。
 * 成功 → bestFloor+1 + 首通结晶（幂等：仅 floor > bestFloor 时发放）。
 */
export function challengeAbyss(state: GameState, now: number, events: GameEvent[]): void {
  regenStamina(state, now)
  const a = state.abyss
  const next = a.bestFloor + 1
  const need = abyssRequirement(next)
  const score = abyssScore(state, now).total
  if (score < need) {
    events.push({ type: 'blocked', reason: `战力不足：第 ${next} 层需要 ${need.toFixed(2)}（当前 ${score.toFixed(2)}，还差 ${(need - score).toFixed(2)}）` })
    return
  }
  if (a.stamina < 1) {
    events.push({ type: 'blocked', reason: `体力不足（${a.stamina}/${DEF.staminaMax}）` })
    return
  }
  a.stamina -= 1
  a.bestFloor = next
  const gain = firstClearCrystal(next)
  a.crystals += gain
  events.push({ type: 'abyssCleared', floor: next, crystals: gain })
}

/** 扫荡：仅当已通关至少 1 层 */
export function sweepAbyss(state: GameState, now: number, events: GameEvent[]): void {
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
  a.stamina -= 1
  const gain = repeatCrystal(a.bestFloor)
  a.crystals += gain
  state.stats.totalAbyssSweeps += 1
  events.push({ type: 'abyssSwept', crystals: gain })
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
  const score = abyssScore(state, now)
  const nextFloor = state.abyss.bestFloor + 1
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
