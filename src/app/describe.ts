// ============================================================
// Forging · 动作描述器（UI 展示用；只读，不改状态）
// ============================================================
import { ENHANCE_BY_TARGET, RECIPES_BY_ID, SITES_BY_ID, itemDef, skillName } from '../game/content'
import { startBlockReason } from '../game/commands'
import { levelInfo } from '../game/level'
import { baseTimeOf, durationOf, enhanceCostFor, rareDropsOf, yieldRangeOf } from '../game/rules'
import { freeInstances, instanceById, materialCount } from '../game/state'
import { aggregateEquipment } from '../game/stats'
import type { ActionRef, GameState, ItemId, SkillId } from '../game/types'

export interface InputInfo {
  itemId: ItemId
  name: string
  need: number
  have: number
  ok: boolean
}

export interface DropInfo {
  itemId: ItemId
  name: string
  rate: number
}

export interface ActionDesc {
  ref: ActionRef
  title: string
  skillId: SkillId
  skillName: string
  unlockLevel: number
  level: number
  okLevel: boolean
  durationMs: number
  baseTimeMs: number
  xp: number
  xpSuccessDoubled: boolean
  /** 强化动作的实际成功率（v1.2 起展示，0~1） */
  enhanceRate?: number
  inputs: InputInfo[]
  outputs: { itemId: ItemId; name: string; qty: number }[]
  mineYield?: { min: number; max: number; itemId: ItemId; name: string }
  drops: DropInfo[]
  canStart: boolean
  blockReason?: string
}

export function describeAction(state: GameState, ref: ActionRef): ActionDesc {
  const agg = aggregateEquipment(state)
  const blockReason = startBlockReason(state, ref) ?? undefined
  const dur = durationOf(state, ref)

  if (ref.kind === 'mine') {
    const site = SITES_BY_ID.get(ref.siteId)
    if (!site) throw new Error(`未知矿场: ${ref.siteId}`)
    const y = yieldRangeOf(ref.siteId)
    const lv = levelInfo(state.skills[site.skill]).level
    const outDef = itemDef(site.outputItemId)
    return {
      ref,
      title: site.name,
      skillId: site.skill,
      skillName: skillName(site.skill),
      unlockLevel: site.unlockLevel,
      level: lv,
      okLevel: lv >= site.unlockLevel,
      durationMs: dur,
      baseTimeMs: baseTimeOf(ref),
      xp: site.xp * (1 + agg.wisdom),
      xpSuccessDoubled: false,
      inputs: [],
      outputs: [],
      mineYield: { min: y.min, max: y.max, itemId: y.itemId, name: outDef.name },
      drops: dropsInfo(ref, agg.rareFind),
      canStart: !blockReason,
      blockReason,
    }
  }

  if (ref.kind === 'craft') {
    const recipe = RECIPES_BY_ID.get(ref.recipeId)
    if (!recipe) throw new Error(`未知配方: ${ref.recipeId}`)
    const lv = levelInfo(state.skills[recipe.skill]).level
    const inputs: InputInfo[] = recipe.inputs.map((inp) => {
      const def = itemDef(inp.itemId)
      const have = def.stackable ? materialCount(state, inp.itemId) : freeInstances(state, inp.itemId).length
      return { itemId: inp.itemId, name: def.name, need: inp.qty, have, ok: have >= inp.qty }
    })
    return {
      ref,
      title: recipe.name,
      skillId: recipe.skill,
      skillName: skillName(recipe.skill),
      unlockLevel: recipe.unlockLevel,
      level: lv,
      okLevel: lv >= recipe.unlockLevel,
      durationMs: dur,
      baseTimeMs: baseTimeOf(ref),
      xp: recipe.xp * (1 + agg.wisdom),
      xpSuccessDoubled: false,
      inputs,
      outputs: recipe.outputs.map((o) => ({ itemId: o.itemId, name: itemDef(o.itemId).name, qty: o.qty })),
      drops: dropsInfo(ref, agg.rareFind),
      canStart: !blockReason,
      blockReason,
    }
  }

  // enhance
  const inst = instanceById(state, ref.instanceId)
  const step = ENHANCE_BY_TARGET.get(ref.targetLevel)
  if (!inst || !step) throw new Error('强化引用的物品或档位不存在')
  const cost = enhanceCostFor(inst.itemId, ref.targetLevel)
  const inputs: InputInfo[] = cost.map((c) => {
    const def = itemDef(c.itemId)
    const have = materialCount(state, c.itemId)
    return { itemId: c.itemId, name: def.name, need: c.qty, have, ok: have >= c.qty }
  })
  return {
    ref,
    title: `${itemDef(inst.itemId).name} +${inst.enhanceLevel} → +${ref.targetLevel}`,
    skillId: 'enhancing',
    skillName: skillName('enhancing'),
    unlockLevel: 1,
    level: levelInfo(state.skills.enhancing).level,
    okLevel: true,
    durationMs: dur,
    baseTimeMs: baseTimeOf(ref),
    xp: step.xpBase,
    xpSuccessDoubled: true,
    enhanceRate: Math.min(1, step.successRate + agg.enhanceRate),
    inputs,
    outputs: [],
    drops: [],
    canStart: !blockReason,
    blockReason,
  }
}

function dropsInfo(ref: ActionRef, rareFind: number): DropInfo[] {
  return rareDropsOf(ref).map((d) => ({
    itemId: d.itemId,
    name: itemDef(d.itemId).name,
    rate: d.rate * (1 + rareFind),
  }))
}
