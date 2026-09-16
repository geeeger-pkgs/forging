// ============================================================
// Forging · 自动化（v1.7）
// 自动回收：白名单材料超出保留量即自动卖出换金（幂等，主循环定期清扫）
// ============================================================
import { perfectScore } from './affixes'
import { CONTENT, itemDef } from './content'
import { recycleGain } from './economy'
import { addGold, freeInstances, isEquipped, materialCount, removeMaterial } from './state'
import type { GameEvent, GameState } from './types'

/** 清扫自动回收：对每个开启自动的材料，卖出「超出保留量」的部分 */
export function sweepAutoRecycle(state: GameState): GameEvent[] {
  const cfg = state.meta.autoRecycle
  const events: GameEvent[] = []
  for (const [itemId, keep] of Object.entries(cfg)) {
    const have = materialCount(state, itemId)
    if (have <= keep) continue
    const sold = have - keep
    const gain = recycleGain(state, itemId, sold)
    removeMaterial(state, itemId, sold)
    addGold(state, gain)
    events.push({ type: 'goldGained', amount: gain })
  }
  return events
}

// ---------------- v3.0 L2：实例级自动回收 + 行囊治理 ----------------

/**
 * 实例级自动回收（v3.0 L2 承诺清算）。
 *
 * 规则（设计 v3.0 §2.6 C14，逐条都有守护）：
 *   1. **不回收已装备**的实例（`isEquipped`）
 *   2. **不回收在制/队列动作将要消耗**的实例：按配方输入匹配 itemId，
 *      保留该 itemId 中完美度最高的一件（否则主循环清扫会把队列要用的装备卖掉，
 *      等到完成时静默变成 noMaterials）
 *   3. 只回收**完美度低于阈值**的实例（阈值 0 = 关闭；缺省 60）
 *   4. **离线不结算**（调用点只在 boot 后与在线清扫，不放进 settleOffline）
 *
 * 返回被回收的实例 id 列表（调用方负责发事件）。
 */
export function sweepInstanceRecycle(state: GameState): number[] {
  const thr = state.meta.autoRecyclePerfect ?? 0
  if (thr <= 0) return []
  const busyIds = new Set<number>()
  // 规则 2：在制/队列的配方输入 → 每个 itemId 保留一件最高完美度
  const refs = [state.actions.current, ...state.actions.queue].filter((a): a is NonNullable<typeof a> => !!a)
  const needKeep = new Set<string>()
  // 只有 craft（锻造/熔炼都走 craft）会消耗"装备类"输入
  const EQUIP_CATS = new Set(['tool', 'weapon', 'armor', 'jewelry'])
  for (const act of refs) {
    const r = act.ref
    if (r.kind !== 'craft') continue
    const recipe = CONTENT.recipes.find((x) => x.id === r.recipeId)
    for (const input of recipe?.inputs ?? []) {
      if (EQUIP_CATS.has(itemDef(input.itemId).category)) needKeep.add(input.itemId)
    }
  }
  for (const itemId of needKeep) {
    const best = freeInstances(state, itemId)
      .filter((i) => !isEquipped(state, i.instanceId))
      .sort((a, b) => perfectScore(b.itemId, b.affixes) - perfectScore(a.itemId, a.affixes))[0]
    if (best) busyIds.add(best.instanceId)
  }

  const out: number[] = []
  for (const inst of [...state.equipment]) {
    if (isEquipped(state, inst.instanceId)) continue // 规则 1
    if (busyIds.has(inst.instanceId)) continue // 规则 2
    const score = perfectScore(inst.itemId, inst.affixes)
    if (score * 100 >= thr) continue // 规则 3：只卖低于阈值的
    out.push(inst.instanceId)
  }
  return out
}
