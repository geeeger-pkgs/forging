// ============================================================
// Forging · 经济（总价值核算 + 回收收益；成就与 UI 共用）
// ============================================================
import { itemDef } from './content'
import { aggregateEquipment } from './stats'
import type { GameState, ItemId } from './types'

/** 总价值（材料按回收价；装备按回收价 + 强化附加 10%/级） */
export function totalValue(state: GameState): number {
  let sum = 0
  for (const [id, qty] of Object.entries(state.materials)) sum += itemDef(id).value * qty
  for (const inst of state.equipment) sum += itemDef(inst.itemId).value * (1 + 0.1 * inst.enhanceLevel)
  return Math.round(sum)
}

/**
 * 回收收益（v2.1）：回收价 × 数量 × (1 + 点金词缀合计)。
 * 手动回收与自动回收共用，保证两条路径同价。
 */
export function recycleGain(state: GameState, itemId: ItemId, qty: number): number {
  const base = itemDef(itemId).value * qty
  return Math.round(base * (1 + aggregateEquipment(state).goldFind))
}
