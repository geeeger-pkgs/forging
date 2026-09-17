// ============================================================
// Forging · 动作可行性预检（v3.7.18）
// 从 commands.ts 下沉到独立模块的原因：settle.ts（结算内核）需要在启动队列项**之前**
// 预检可行性（不可行就跳过，见 settle.ts 的「队列自动启动」），而 commands.ts 已
// import settle.ts（dispatch → simulate）——若 settle 反向 import commands 会构成循环。
// 本模块只依赖 content / level / rules / state 等底层模块，commands 与 settle 共用
// 同一份实现（单一真值；commands 处保留 re-export 以避免惊动既有调用方）。
// ============================================================
import { MAX_ENHANCE, RECIPES_BY_ID, SITES_BY_ID, itemDef } from './content'
import { levelInfo } from './level'
import { enhanceCostFor } from './rules'
import { freeInstances, instanceById, materialCount } from './state'
import type { ActionRef, GameState, ItemId } from './types'

/** 开始前校验（等级 / 材料 / 装备 / 强化目标）；返回阻塞原因或 null */
export function startBlockReason(state: GameState, ref: ActionRef): string | null {
  if (ref.kind === 'mine') {
    const site = SITES_BY_ID.get(ref.siteId)
    if (!site) return `未知矿场: ${ref.siteId}`
    const lv = levelInfo(state.skills[site.skill]).level
    if (lv < site.unlockLevel) return `需要 挖掘 Lv${site.unlockLevel}（当前 ${lv}）`
    return null
  }
  if (ref.kind === 'craft') {
    const r = RECIPES_BY_ID.get(ref.recipeId)
    if (!r) return `未知配方: ${ref.recipeId}`
    const lv = levelInfo(state.skills[r.skill]).level
    if (lv < r.unlockLevel) return `需要 Lv${r.unlockLevel}（当前 ${lv}）`
    return inputShortageReason(state, r.inputs)
  }
  // enhance
  const inst = instanceById(state, ref.instanceId)
  if (!inst) return '被强化物品不存在'
  if (ref.targetLevel > MAX_ENHANCE) return '已达最高强化等级'
  if (ref.targetLevel !== inst.enhanceLevel + 1) return '强化目标与物品当前等级不匹配'
  const cost = enhanceCostFor(inst.itemId, ref.targetLevel)
  for (const c of cost) {
    if (materialCount(state, c.itemId) < c.qty) return `材料不足：${itemDef(c.itemId).name} ×${c.qty}`
  }
  return null
}

/**
 * 软阻塞（材料 / 装备暂时不足）：**可以预排入队**，轮到它时再尝试（仍不足则跳过）。
 * v3.7.20（用户验收场景）：玩家要能预排一条生产链
 * （例：无材料时排「挖掘×1 → 熔炼×10 → 锻造×1」，靠上游产出喂下游），
 * 因此"入队"不再要求材料齐备；等级不足 / 目标物品不存在等**硬阻塞**仍然拒绝入队。
 * 实现按文案前缀判定（改动见 tests/queue.test.ts 的硬/软阻塞用例；文案改动会红）。
 */
export function isSoftBlock(reason: string | null): boolean {
  if (!reason) return false
  return reason.startsWith('材料不足') || reason.startsWith('缺少装备') || reason.startsWith('请先卸下')
}

function inputShortageReason(
  state: GameState,
  inputs: readonly { itemId: ItemId; qty: number }[],
): string | null {
  for (const inp of inputs) {
    const def = itemDef(inp.itemId)
    if (def.stackable) {
      if (materialCount(state, inp.itemId) < inp.qty) return `材料不足：${def.name} ×${inp.qty}`
    } else {
      const free = freeInstances(state, inp.itemId)
      if (free.length < inp.qty) {
        const total = state.equipment.filter((e) => e.itemId === inp.itemId).length
        const equippedCount = total - free.length
        return equippedCount > 0
          ? `请先卸下：${def.name}（装备中不可消耗）`
          : `缺少装备：${def.name} ×${inp.qty}`
      }
    }
  }
  return null
}
