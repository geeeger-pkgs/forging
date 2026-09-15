// ============================================================
// Forging · 自动化（v1.7）
// 自动回收：白名单材料超出保留量即自动卖出换金（幂等，主循环定期清扫）
// ============================================================
import { recycleGain } from './economy'
import { addGold, materialCount, removeMaterial } from './state'
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
