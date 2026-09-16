// ============================================================
// Forging · 教程推进（设计 §11）
// 规则：当前步骤（flags.tutorial.current）计进度；目标达成进入 completed；领取后进入下一技能步
// ============================================================
import { codexProgress } from './codex'
import { CONTENT, TUTORIAL_BY_STEP, itemDef } from './content'
import { totalLevel } from './level'
import { seasonView } from './season'
import { addGold, addInstance, addMaterial } from './state'
import type { GameEvent, GameState, ItemId, SlotId } from './types'

export interface TutorialCtx {
  itemId?: ItemId
  slotId?: SlotId
}

/** 推进当前步骤进度；返回事件（可能包含 tutorialGoalMet） */
export function tutorialProgress(
  state: GameState,
  goalType: string,
  amount: number,
  ctx?: TutorialCtx,
): GameEvent[] {
  const t = state.flags.tutorial
  const step = TUTORIAL_BY_STEP.get(t.current)
  if (!step || amount <= 0) return []
  if (t.completed.includes(step.step)) return []
  const g = step.goal
  if (g.type !== goalType) return []
  if (g.itemId && ctx?.itemId !== g.itemId) return []
  if (g.slotId && ctx?.slotId !== g.slotId) return []
  t.progress += amount
  if (t.progress >= g.target) {
    t.completed.push(step.step)
    return [{ type: 'tutorialGoalMet', step: step.step }]
  }
  return []
}

/** 总等级类目标检查（任意 XP 变化后调用） */
export function tutorialCheckTotalLevel(state: GameState): GameEvent[] {
  const t = state.flags.tutorial
  const step = TUTORIAL_BY_STEP.get(t.current)
  if (!step || step.goal.type !== 'totalLevel') return []
  if (t.completed.includes(step.step)) return []
  if (totalLevel(state.skills) >= step.goal.target) {
    t.completed.push(step.step)
    return [{ type: 'tutorialGoalMet', step: step.step }]
  }
  return []
}

/** 领取奖励并推进到下一步 */
export function claimTutorial(state: GameState, step: number): GameEvent[] {
  const t = state.flags.tutorial
  if (!t.completed.includes(step) || t.claimed.includes(step)) return []
  const def = TUTORIAL_BY_STEP.get(step)
  if (!def) return []
  const events: GameEvent[] = []
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
    if (rw.queueSlot) {
      state.queueSlots = Math.min(state.queueSlots + rw.queueSlot, CONTENT.config.maxQueueSlots)
    }
  }
  t.claimed.push(step)
  if (t.current === step) {
    t.current = step + 1
    t.progress = 0
  }
  events.push({ type: 'tutorialRewarded', step })
  // 新步骤若条件已满足（如“总等级”类目标），立即判定达成
  events.push(...tutorialCheckTotalLevel(state))
  return events
}

// ---------------- v3.1 章节二：面向"第二小时"的目标（两位玩家测评：教程只覆盖四技能） ----------------

/**
 * 通用统计类目标检查（主循环定期调用，与 checkTasks 同节奏）。
 * 覆盖 goal.type：
 *   'stat'      → state.stats[counter] ≥ target（可选按档位：T4+ 计数）
 *   'abyssFloor'→ state.abyss.bestFloor ≥ target
 *   'codexPct'  → 图鉴线性百分比 ≥ target（0~1）
 *   'seasonLevel'→ 赛季声望等级 ≥ target
 * 设计意图：教程只教四技能，符文/重铸/远征/图鉴/深渊/赛季全靠玩家自己摸（测评 B-7）；
 * 章节二按"解锁即触发"的顺序补上引导，且**不阻塞任何玩法**（仅提示）。
 */
export function checkTutorialStats(state: GameState): GameEvent[] {
  const t = state.flags.tutorial
  const step = TUTORIAL_BY_STEP.get(t.current)
  if (!step) return []
  if (t.completed.includes(step.step)) return []
  const g = step.goal as { type: string; counter?: string; target: number }
  let cur = 0
  if (g.type === 'stat') {
    const stats = state.stats as unknown as Record<string, number>
    cur = g.counter ? (stats[g.counter] ?? 0) : 0
  } else if (g.type === 'abyssFloor') {
    cur = state.abyss?.bestFloor ?? 0
  } else if (g.type === 'codexPct') {
    cur = codexProgress(state).pct
  } else if (g.type === 'seasonLevel') {
    cur = seasonView(state, state.meta.lastSeenAt ?? 0).level
  } else {
    return []
  }
  if (cur >= g.target) {
    t.completed.push(step.step)
    return [{ type: 'tutorialGoalMet', step: step.step }]
  }
  return []
}
