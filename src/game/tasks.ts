// ============================================================
// Forging · 任务系统（v1.2）
// 每日 3 + 周常 1；按本地日期/ISO 周【前向】轮换；基线快照隔离离线收益与消费
// 完成即自动发奖（幂等）；重掷：每日 1 免费 + 100 金/次（上限 3）
// ============================================================
import { CONTENT } from './content'
import { addGold, addMaterial } from './state'
import type { GameEvent, GameState, TaskSlot } from './types'

const PAID_REROLL_COST = 100

// ---------- 日期工具 ----------

/** 本地日期键：YYYY-MM-DD（字符串比较，前向才轮换） */
export function dateKey(now: number): string {
  const d = new Date(now)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** ISO 周键：YYYY-Www */
export function weekKey(now: number): string {
  const d = new Date(now)
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum) // 移动到本周四
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

// ---------- 计数器与进度 ----------

export function counterValue(state: GameState, counter: string): number {
  const stats = state.stats as unknown as Record<string, number>
  return stats[counter] ?? 0
}

function defOf(slot: TaskSlot) {
  return (
    CONTENT.tasks.daily.find((t) => t.id === slot.defId) ??
    CONTENT.tasks.weekly.find((t) => t.id === slot.defId)
  )
}

export function taskProgress(state: GameState, slot: TaskSlot): number {
  const def = defOf(slot)
  if (!def) return 0
  return Math.max(0, counterValue(state, def.counter) - slot.base)
}

export function remainingRerolls(state: GameState): { free: number; paid: number } {
  return { free: state.meta.tasks.rerollsLeft, paid: state.meta.tasks.paidRerollsLeft }
}

export { PAID_REROLL_COST }

// ---------- 生成 ----------

function rollDailySlot(state: GameState, excludeIds?: string[]): TaskSlot {
  const pool = CONTENT.tasks.daily.filter((t) => !excludeIds?.includes(t.id))
  const t = pool[Math.floor(Math.random() * pool.length)] ?? CONTENT.tasks.daily[0]
  const tier = Math.floor(Math.random() * 3)
  return {
    defId: t.id,
    target: t.targets[tier],
    gold: t.gold[tier],
    essence: t.essence[tier],
    crates: t.crates[tier],
    base: counterValue(state, t.counter),
    done: false,
  }
}

/** 生成 3 个互不重复的每日任务 */
function rollDailySet(state: GameState): TaskSlot[] {
  const slots: TaskSlot[] = []
  for (let i = 0; i < 3; i++) {
    slots.push(rollDailySlot(state, slots.map((s) => s.defId)))
  }
  return slots
}

function rollWeeklySlot(state: GameState): TaskSlot {
  const t = CONTENT.tasks.weekly[Math.floor(Math.random() * CONTENT.tasks.weekly.length)]
  return {
    defId: t.id,
    target: t.target,
    gold: t.gold,
    essence: t.essence,
    crates: t.crates,
    base: counterValue(state, t.counter),
    done: false,
  }
}

// ---------- 轮换（仅日期/周键前向时） ----------

export function refreshTasks(state: GameState, now: number): GameEvent[] {
  const events: GameEvent[] = []
  const dk = dateKey(now)
  const wk = weekKey(now)
  const tasks = state.meta.tasks

  if (tasks.dailyDate === '') {
    tasks.dailyDate = dk
    tasks.daily = rollDailySet(state)
    tasks.rerollsLeft = 1
    tasks.paidRerollsLeft = 3
  } else if (dk > tasks.dailyDate) {
    tasks.dailyDate = dk
    tasks.daily = rollDailySet(state)
    tasks.rerollsLeft = 1
    tasks.paidRerollsLeft = 3
    events.push({ type: 'tasksRotated', period: 'daily' })
  }

  if (tasks.weekKey === '') {
    tasks.weekKey = wk
    tasks.weekly = rollWeeklySlot(state)
  } else if (wk > tasks.weekKey) {
    tasks.weekKey = wk
    tasks.weekly = rollWeeklySlot(state)
    events.push({ type: 'tasksRotated', period: 'weekly' })
  }

  // 旧档兜底：日期未变但槽位为空
  if (tasks.daily.length === 0) {
    tasks.daily = rollDailySet(state)
  }
  return events
}

// ---------- 完成检查（幂等自动发奖） ----------

export function checkTasks(state: GameState): GameEvent[] {
  const events: GameEvent[] = []
  const all: TaskSlot[] = [...state.meta.tasks.daily]
  if (state.meta.tasks.weekly) all.push(state.meta.tasks.weekly)
  for (const slot of all) {
    if (slot.done) continue
    if (taskProgress(state, slot) < slot.target) continue
    slot.done = true
    collectRewards(state, slot, events)
  }
  return events
}

function collectRewards(state: GameState, slot: TaskSlot, events: GameEvent[]): void {
  const def = defOf(slot)
  const title = def ? def.title : slot.defId
  if (slot.gold > 0) {
    addGold(state, slot.gold)
    events.push({ type: 'goldGained', amount: slot.gold })
  }
  if (slot.essence > 0) {
    addMaterial(state, 'essence', slot.essence)
    events.push({ type: 'itemsGained', items: [{ itemId: 'essence', qty: slot.essence }] })
  }
  if (slot.crates > 0) {
    addMaterial(state, 'crate', slot.crates)
    events.push({ type: 'itemsGained', items: [{ itemId: 'crate', qty: slot.crates }] })
  }
  events.push({ type: 'taskCompleted', title })
}

// ---------- 重掷 ----------

export function rerollTask(state: GameState, index: number): GameEvent[] {
  const tasks = state.meta.tasks
  const slot = tasks.daily[index]
  if (!slot) return [{ type: 'blocked', reason: '任务不存在' }]
  if (slot.done) return [{ type: 'blocked', reason: '已完成的任务不能重掷' }]

  if (tasks.rerollsLeft > 0) {
    tasks.rerollsLeft -= 1
  } else if (tasks.paidRerollsLeft > 0) {
    if (state.gold < PAID_REROLL_COST) {
      return [{ type: 'blocked', reason: `金币不足（重掷需要 ${PAID_REROLL_COST}）` }]
    }
    addGold(state, -PAID_REROLL_COST)
    tasks.paidRerollsLeft -= 1
  } else {
    return [{ type: 'blocked', reason: '今日重掷次数已用完' }]
  }

  tasks.daily[index] = rollDailySlot(state, [slot.defId])
  return []
}

/** 距下次每日刷新（毫秒） */
export function msToNextDay(now: number): number {
  const d = new Date(now)
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0)
  return next.getTime() - now
}
