// ============================================================
// Forging · 动作规则：基础时间 / 实际时长 / 经验 / 稀有掉落 / 强化消耗
// ============================================================
import {
  CONTENT,
  ENHANCE_BY_TARGET,
  RECIPES_BY_ID,
  SITES_BY_ID,
  ingotIdForTier,
  itemDef,
} from './content'
import { speedFor } from './stats'
import type { ActionRef, GameState, ItemId, RareDrop } from './types'

export function baseTimeOf(ref: ActionRef): number {
  if (ref.kind === 'mine') {
    const s = SITES_BY_ID.get(ref.siteId)
    if (!s) throw new Error(`未知矿场: ${ref.siteId}`)
    return s.baseTimeMs
  }
  if (ref.kind === 'craft') {
    const r = RECIPES_BY_ID.get(ref.recipeId)
    if (!r) throw new Error(`未知配方: ${ref.recipeId}`)
    return r.baseTimeMs
  }
  const e = ENHANCE_BY_TARGET.get(ref.targetLevel)
  if (!e) throw new Error(`未知强化档位: +${ref.targetLevel}`)
  return e.baseTimeMs
}

/** 实际单次时长（含速度加成与下限保护；每次结算按当前装备重算 → 换装下一轮生效） */
export function durationOf(state: GameState, ref: ActionRef): number {
  const t = baseTimeOf(ref) / (1 + speedFor(state, ref))
  return Math.max(CONTENT.config.minActionTimeMs, Math.round(t))
}

/** 单次完成的基础经验 */
export function xpOf(ref: ActionRef): number {
  if (ref.kind === 'mine') {
    const s = SITES_BY_ID.get(ref.siteId)
    if (!s) throw new Error(`未知矿场: ${ref.siteId}`)
    return s.xp
  }
  if (ref.kind === 'craft') {
    const r = RECIPES_BY_ID.get(ref.recipeId)
    if (!r) throw new Error(`未知配方: ${ref.recipeId}`)
    return r.xp
  }
  const e = ENHANCE_BY_TARGET.get(ref.targetLevel)
  if (!e) throw new Error(`未知强化档位: +${ref.targetLevel}`)
  return e.xpBase
}

export function rareDropsOf(ref: ActionRef): readonly RareDrop[] {
  if (ref.kind === 'mine') return SITES_BY_ID.get(ref.siteId)?.rareDrops ?? []
  if (ref.kind === 'craft') return RECIPES_BY_ID.get(ref.recipeId)?.rareDrops ?? []
  return []
}

/** 强化消耗（同级锭 + 精华；由被强化物品的档位解析锭种） */
export function enhanceCostFor(itemId: ItemId, targetLevel: number): { itemId: ItemId; qty: number }[] {
  const def = itemDef(itemId)
  if (!def.tier) throw new Error(`物品无档位，不可强化: ${itemId}`)
  const step = ENHANCE_BY_TARGET.get(targetLevel)
  if (!step) throw new Error(`未知强化档位: +${targetLevel}`)
  const out: { itemId: ItemId; qty: number }[] = [{ itemId: ingotIdForTier(def.tier), qty: step.cost.ingots }]
  if (step.cost.essences > 0) out.push({ itemId: 'essence', qty: step.cost.essences })
  return out
}

/** 矿场产出范围（均匀 [min, max]） */
export function yieldRangeOf(siteId: string): { min: number; max: number; itemId: ItemId } {
  const s = SITES_BY_ID.get(siteId)
  if (!s) throw new Error(`未知矿场: ${siteId}`)
  return { min: s.yieldMin, max: s.yieldMax, itemId: s.outputItemId }
}
