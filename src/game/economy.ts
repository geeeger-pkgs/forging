// ============================================================
// Forging · 经济（总价值核算；成就与 UI 共用）
// ============================================================
import { itemDef } from './content'
import type { GameState } from './types'

/** 总价值（材料按回收价；装备按回收价 + 强化附加 10%/级） */
export function totalValue(state: GameState): number {
  let sum = 0
  for (const [id, qty] of Object.entries(state.materials)) sum += itemDef(id).value * qty
  for (const inst of state.equipment) sum += itemDef(inst.itemId).value * (1 + 0.1 * inst.enhanceLevel)
  return Math.round(sum)
}
