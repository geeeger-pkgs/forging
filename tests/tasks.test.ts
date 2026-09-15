import { describe, expect, it } from 'vitest'
import { CONTENT } from '../src/game/content'
import { checkTasks, counterValue, dateKey, msToNextDay, refreshTasks, rerollTask, taskProgress, weekKey } from '../src/game/tasks'
import { newGame } from '../src/game/state'
import type { GameState } from '../src/game/types'

const DAY = 86_400_000
const T0 = new Date(2026, 8, 15, 12, 0, 0).getTime() // 2026-09-15 12:00 本地

function freshGame(now: number): GameState {
  const s = newGame('T', now)
  refreshTasks(s, now)
  return s
}

function counterOf(defId: string): string {
  const def = [...CONTENT.tasks.daily, ...CONTENT.tasks.weekly].find((d) => d.id === defId)
  if (!def) throw new Error('unknown def: ' + defId)
  return def.counter
}

describe('任务系统', () => {
  it('首次初始化：3 个互不重复的每日 + 1 个周常，基线为当前计数器', () => {
    const s = freshGame(T0)
    expect(s.meta.tasks.daily.length).toBe(3)
    expect(new Set(s.meta.tasks.daily.map((t) => t.defId)).size).toBe(3)
    expect(s.meta.tasks.weekly).not.toBeNull()
    expect(s.meta.tasks.rerollsLeft).toBe(1)
    const slot = s.meta.tasks.daily[0]
    expect(taskProgress(s, slot)).toBe(0)
  })

  it('日期键与周键格式', () => {
    expect(dateKey(T0)).toBe('2026-09-15')
    expect(weekKey(T0)).toMatch(/^2026-W\d{2}$/)
    expect(msToNextDay(T0)).toBe(12 * 3600 * 1000)
  })

  it('日期前向才轮换；同日不轮换；时钟回拨不轮换', () => {
    const s = freshGame(T0)
    const firstIds = s.meta.tasks.daily.map((t) => t.defId)
    // 同日刷新：无变化
    const ev1 = refreshTasks(s, T0 + 3600_000)
    expect(ev1).toHaveLength(0)
    expect(s.meta.tasks.daily.map((t) => t.defId)).toEqual(firstIds)
    // 时钟回拨：不轮换
    refreshTasks(s, T0 - DAY)
    expect(s.meta.tasks.daily.map((t) => t.defId)).toEqual(firstIds)
    // 前向换日：轮换
    const ev2 = refreshTasks(s, T0 + DAY)
    expect(ev2.some((e) => e.type === 'tasksRotated' && e.period === 'daily')).toBe(true)
    expect(s.meta.tasks.rerollsLeft).toBe(1)
  })

  it('离线收益不计入次日任务（基线隔离）', () => {
    const s = freshGame(T0)
    // 模拟离线：计数器增长后跨天刷新
    s.stats.totalMines += 500
    refreshTasks(s, T0 + DAY)
    for (const slot of s.meta.tasks.daily) {
      expect(taskProgress(s, slot)).toBe(0) // 新的基线吸收了历史增量
    }
  })

  it('完成即自动发奖（幂等）', () => {
    const s = freshGame(T0)
    const slot = s.meta.tasks.daily[0]
    const stats = s.stats as unknown as Record<string, number>
    stats[counterOf(slot.defId)] += slot.target

    const events = checkTasks(s)
    expect(events.some((e) => e.type === 'taskCompleted')).toBe(true)
    expect(slot.done).toBe(true)
    expect(s.stats.totalTasksDone).toBe(1)
    expect(s.stats.totalWeekliesDone).toBe(0)
    const goldAfter = s.gold
    checkTasks(s) // 幂等
    expect(s.gold).toBe(goldAfter)
    expect(s.stats.totalTasksDone).toBe(1)
  })

  it('重掷：免费 → 付费 100 金 → 次数耗尽', () => {
    const s = freshGame(T0)
    s.gold = 50
    // 免费
    expect(rerollTask(s, 0)).toHaveLength(0)
    expect(s.meta.tasks.rerollsLeft).toBe(0)
    // 付费但金币不足
    const blocked = rerollTask(s, 1)
    expect(blocked.some((e) => e.type === 'blocked' && e.reason.includes('金币不足'))).toBe(true)
    // 付费成功
    s.gold = 100
    expect(rerollTask(s, 1)).toHaveLength(0)
    expect(s.meta.tasks.paidRerollsLeft).toBe(2)
    expect(s.gold).toBe(0)
  })

  it('已完成的任务不可重掷', () => {
    const s = freshGame(T0)
    s.meta.tasks.daily[0].done = true
    const ev = rerollTask(s, 0)
    expect(ev.some((e) => e.type === 'blocked' && e.reason.includes('已完成'))).toBe(true)
  })

  it('计数器读取', () => {
    const s = freshGame(T0)
    s.stats.totalGoldEarned = 42
    expect(counterValue(s, 'totalGoldEarned')).toBe(42)
    expect(counterValue(s, 'unknown')).toBe(0)
  })
})
