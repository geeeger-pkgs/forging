// ============================================================
// Forging · 成就系统（v1.1）
// 规则：达成即自动解锁并发放奖励（幂等）；由 settle 与 commands 定期调用
// ============================================================
import { perfectScore } from './affixes'
import { codexProgress } from './codex'
import { levelForRenown } from './season'
import { CONTENT, itemDef } from './content'
import { totalValue } from './economy'
import { levelInfo } from './level'
import { addGold, addInstance, addMaterial, materialCount } from './state'
import type { AchievementDef, GameEvent, GameState } from './types'

/** affixSlots 成就判定阈值：已装备件的词缀完美度 ≥ 80% 计入 */
const AFFIX_SLOT_SCORE = 0.8

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
    case 'buffSlots':
      return state.buffs.length >= def.target
    case 'affixSlots': {
      // v2.1（评审 M6）：已装备且**词缀完美度达标**的槽位数
      // 注意：所有装备天生至少 1 条词缀，若只数"带词缀的槽"会与 slotsFilled 完全重复
      let n = 0
      for (const v of Object.values(state.slots)) {
        if (v === undefined) continue
        const inst = state.equipment.find((e) => e.instanceId === v)
        if (inst && perfectScore(inst.itemId, inst.affixes ?? []) >= AFFIX_SLOT_SCORE) n += 1
      }
      return n >= def.target
    }
    case 'affixCount':
      // v2.1：任一件装备的词缀条数达到目标（持有即可，无需装备）
      return state.equipment.some((e) => (e.affixes?.length ?? 0) >= def.target)
    case 'companionCount':
      // v2.2：招募到的伙伴数（v2.1 前无此字段的旧档按 0 计）
      return Object.keys(state.companions ?? {}).length >= def.target
    case 'companionRarity': {
      const want = def.rarity
      if (!want) return false
      return Object.keys(state.companions ?? {}).some((id) => {
        const c = CONTENT.companions.companions.find((x) => x.id === id)
        return c?.rarity === want
      })
    }
    case 'relicCount': {
      // 持有遗物总数（value 0，不构成金币通道）
      let n = 0
      for (const [id, qty] of Object.entries(state.materials ?? {})) {
        if (itemDef(id).category === 'relic') n += qty
      }
      return n >= def.target
    }
    case 'codexPercent': {
      // v2.3：图鉴收集度（目标为百分比整数，如 25/50/75/100）
      const { pct } = codexProgress(state)
      return pct * 100 >= def.target
    }
    case 'seasonLevel':
      // v2.3：赛季等级（未解锁时 season.index = -1）
      return state.season.index >= 0 && levelForRenown(state.season.renown) >= def.target
    case 'bannerLevel':
      return (state.meta.expeditions?.banner ?? 0) >= def.target
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
