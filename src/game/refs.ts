// ============================================================
// Forging · 动作引用解析（ActionRef → 技能 / 展示标签）
// ============================================================
import { RECIPES_BY_ID, SITES_BY_ID } from './content'
import type { ActionRef, SkillId } from './types'

export function skillOf(ref: ActionRef): SkillId {
  if (ref.kind === 'mine') return 'mining'
  if (ref.kind === 'craft') {
    const r = RECIPES_BY_ID.get(ref.recipeId)
    if (!r) throw new Error(`未知配方: ${ref.recipeId}`)
    return r.skill
  }
  return 'enhancing'
}

export function refLabel(ref: ActionRef): string {
  if (ref.kind === 'mine') return SITES_BY_ID.get(ref.siteId)?.name ?? ref.siteId
  if (ref.kind === 'craft') return RECIPES_BY_ID.get(ref.recipeId)?.name ?? ref.recipeId
  return `强化 +${ref.targetLevel}`
}

/** 动作引用相等性 */
export function sameRef(a: ActionRef, b: ActionRef): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'mine' && b.kind === 'mine') return a.siteId === b.siteId
  if (a.kind === 'craft' && b.kind === 'craft') return a.recipeId === b.recipeId
  if (a.kind === 'enhance' && b.kind === 'enhance') {
    return a.instanceId === b.instanceId && a.targetLevel === b.targetLevel
  }
  return false
}
