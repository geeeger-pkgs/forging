// ============================================================
// Forging · 符文增益系统（v1.4）
// 规则：双槽；同种符文叠加时长（上限 60 分钟）；异种且槽满 → 替换剩余最短者
// 关键约束：临时增益不参与离线结算（offline 结算期间临时清空 state.buffs）
// ============================================================
import { RUNE_BY_ID } from './content'
import { materialCount, removeMaterial } from './state'
import type { BuffSlot, GameEvent, GameState, ItemId } from './types'

export const BUFF_SLOT_COUNT = 2
export const BUFF_EXTEND_CAP_MS = 60 * 60 * 1000

export interface BuffBonuses {
  speed: number
  efficiency: number
  rareFind: number
  enhanceRate: number
}

export function activeBuffs(state: GameState, now: number): BuffSlot[] {
  return state.buffs.filter((b) => b.until > now)
}

/** 当前生效增益合计（离线结算期间 state.buffs 被临时清空 → 自动为 0） */
export function buffBonuses(state: GameState, now: number): BuffBonuses {
  const out: BuffBonuses = { speed: 0, efficiency: 0, rareFind: 0, enhanceRate: 0 }
  for (const slot of activeBuffs(state, now)) {
    const def = RUNE_BY_ID.get(slot.defId)
    if (!def) continue
    out[def.effect] += def.value
  }
  return out
}

/** 清理已过期的增益槽（由主循环定期调用） */
export function pruneBuffs(state: GameState, now: number): void {
  if (state.buffs.length === 0) return
  state.buffs = state.buffs.filter((b) => b.until > now)
}

/** 激活符文：消耗 1 个；同种叠时 / 空槽放入 / 满槽替换最短 */
export function useRune(state: GameState, itemId: ItemId, now: number): GameEvent[] {
  const def = RUNE_BY_ID.get(itemId)
  if (!def) return [{ type: 'blocked', reason: '该物品不是符文' }]
  if (materialCount(state, itemId) < 1) return [{ type: 'blocked', reason: '没有可用的符文' }]
  removeMaterial(state, itemId, 1)

  const same = state.buffs.find((b) => b.defId === itemId)
  let until = now + def.durationMs
  if (same) {
    same.until = Math.min(same.until + def.durationMs, now + BUFF_EXTEND_CAP_MS)
    until = same.until
  } else if (state.buffs.length < BUFF_SLOT_COUNT) {
    state.buffs.push({ defId: itemId, until })
  } else {
    let weakest = 0
    for (let i = 1; i < state.buffs.length; i++) {
      if (state.buffs[i].until < state.buffs[weakest].until) weakest = i
    }
    state.buffs[weakest] = { defId: itemId, until }
  }
  return [{ type: 'buffActivated', name: def.name, until }]
}
