// ============================================================
// Forging · 成就系统（v1.1）
// 规则：达成即自动解锁并发放奖励（幂等）；由 settle 与 commands 定期调用
// ============================================================
import { CONTENT, itemDef } from './content'
import { totalValue } from './economy'
import { levelInfo } from './level'
import { addGold, addInstance, addMaterial, materialCount } from './state'
import type { AchievementDef, GameEvent, GameState } from './types'

export function achievementProgress(state: GameState): { unlocked: number; total: number } {
  return { unlocked: state.flags.achievements.unlocked.length, total: CONTENT.achievements.length }
}

/** 检查并解锁所有已达成成就（幂等）；返回事件流 */
export function checkAchievements(state: GameState): GameEvent[] {
  const events: GameEvent[] = []
  const unlocked = state.flags.achievements.unlocked
  for (const def of CONTENT.achievements) {
    if (unlocked.includes(def.id)) continue
    if (!isMet(state, def)) continue
    unlocked.push(def.id)
    applyRewards(state, def, events)
    events.push({ type: 'achievementUnlocked', id: def.id, name: def.name })
  }
  return events
}

export function isMet(state: GameState, def: AchievementDef): boolean {
  switch (def.type) {
    case 'stat': {
      const v = (state.stats as unknown as Record<string, number>)[def.stat ?? ''] ?? 0
      return v >= def.target
    }
    case 'skillLevel':
      return def.skill !== undefined && levelInfo(state.skills[def.skill]).level >= def.target
    case 'enhanceLevel':
      return state.equipment.some((e) => e.enhanceLevel >= def.target)
    case 'totalLevel': {
      let sum = 0
      for (const id of Object.keys(state.skills) as (keyof typeof state.skills)[]) {
        sum += levelInfo(state.skills[id]).level
      }
      return sum >= def.target
    }
    case 'totalValue':
      return totalValue(state) >= def.target
    case 'itemCount':
      return def.itemId !== undefined && materialCount(state, def.itemId) >= def.target
    case 'slotsFilled': {
      let filled = 0
      for (const v of Object.values(state.slots)) if (v !== undefined) filled++
      return filled >= def.target
    }
  }
}

function applyRewards(state: GameState, def: AchievementDef, events: GameEvent[]): void {
  for (const rw of def.rewards) {
    if (rw.gold) {
      addGold(state, rw.gold)
      events.push({ type: 'goldGained', amount: rw.gold })
    }
    if (rw.itemId && rw.qty) {
      const d = itemDef(rw.itemId)
      if (d.stackable) addMaterial(state, rw.itemId, rw.qty)
      else for (let i = 0; i < rw.qty; i++) addInstance(state, rw.itemId)
      events.push({ type: 'itemsGained', items: [{ itemId: rw.itemId, qty: rw.qty }] })
    }
  }
}
