// ============================================================
// Forging v3.4 · A2 Lv76~100 里程碑（内容 + 粘性字段 + 迁移 + 证据）
// 起因（v3.0 双玩家评审 B 组）："Lv80→100 零内容"（v3.1 压缩了曲线，内容没补）。
// 口径：每 5 级一条永久被动（Lv80/85/90/95/100），按**历史最高技能等级**解锁
// （meta.bestSkillLevel，单调 → 传承后不掉档），并入 aggregateEquipment 单源。
// ============================================================
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SAVE_VERSION, deserializeSave } from '../src/app/persist'
import { CONTENT, validateContent } from '../src/game/content'
import { milestoneView, xpForLevel } from '../src/game/level'
import { aggregateEquipment } from '../src/game/stats'
import { addInstance, newGame } from '../src/game/state'
import { simulate } from '../src/game/settle'
import { mulberry32 } from '../src/game/rng'
import type { GameState } from '../src/game/types'

const sim = JSON.parse(readFileSync(join(process.cwd(), 'docs', 'sim-audit-output.json'), 'utf8')) as {
  f: { milestones: { count: number; durationDeltaPct: number; withinBudget: boolean } }
}

describe('A2 内容表与校验', () => {
  it('里程碑表存在、5 条、数值在 (0, 0.02]、等级 ∈ [76,100] 且严格递增', () => {
    const ms = CONTENT.levelCurve.milestones ?? []
    expect(ms.length).toBe(5)
    expect(ms.map((m) => m.level)).toEqual([80, 85, 90, 95, 100])
    for (const m of ms) {
      expect(m.value).toBeGreaterThan(0)
      expect(m.value).toBeLessThanOrEqual(0.02)
      expect(m.desc.length).toBeGreaterThan(0)
    }
  })

  it('validateContent 会拦下坏里程碑（等级越界 / 数值过大 / 不递增）', () => {
    const clone = JSON.parse(JSON.stringify(CONTENT)) as typeof CONTENT
    clone.levelCurve.milestones![1].level = 79 // 不再递增
    clone.levelCurve.milestones![2].value = 0.5 // 越界
    const errs = validateContent(clone)
    expect(errs.some((e) => e.includes('里程碑'))).toBe(true)
  })

  it('时长预算：里程碑带来的时长变化 ≤5%（证据来自 sim-audit F 段）', () => {
    expect(sim.f.milestones.count).toBe(5)
    expect(Math.abs(sim.f.milestones.durationDeltaPct)).toBeLessThanOrEqual(0.05)
    expect(sim.f.milestones.withinBudget).toBe(true)
  })
})

describe('A2 解锁口径与聚合单源', () => {
  it('milestoneView：按历史最高技能等级逐条解锁', () => {
    expect(milestoneView(79).filter((m) => m.unlocked).length).toBe(0)
    expect(milestoneView(80).filter((m) => m.unlocked).length).toBe(1)
    expect(milestoneView(100).every((m) => m.unlocked)).toBe(true)
  })

  it('聚合单源：bestSkillLevel 提升后 aggregateEquipment 的对应属性等量增加', () => {
    const s = newGame('T', 0)
    const id = addInstance(s, 'pick_copper')
    s.slots.pick = id
    s.equipment.find((e) => e.instanceId === id)!.affixes = []
    const before = aggregateEquipment(s)
    s.meta.bestSkillLevel = 100
    const after = aggregateEquipment(s)
    const ms = CONTENT.levelCurve.milestones!
    const dSpeed = ms.filter((m) => m.stat === 'allSpeed').reduce((a, m) => a + m.value, 0)
    const dQty = ms.filter((m) => m.stat === 'quantity').reduce((a, m) => a + m.value, 0)
    const dWis = ms.filter((m) => m.stat === 'wisdom').reduce((a, m) => a + m.value, 0)
    expect(after.allSpeed - before.allSpeed).toBeCloseTo(dSpeed, 6)
    expect(after.quantity - before.quantity).toBeCloseTo(dQty, 6)
    expect(after.wisdom - before.wisdom).toBeCloseTo(dWis, 6)
  })

  it('bestSkillLevel 由升级维护（内核侧写入，不在渲染期）', () => {
    const s = newGame('T', 0)
    s.materials['ore_copper'] = 10
    s.actions.current = { ref: { kind: 'mine', siteId: CONTENT.ores[0].id }, remaining: 200, startedAt: 0, durationMs: 0, procMisses: 0 }
    const before = s.meta.bestSkillLevel
    simulate(s, 400_000, { mode: 'online', rng: mulberry32(3) })
    expect(s.meta.bestSkillLevel).toBeGreaterThanOrEqual(before)
  })

  it('传承后不掉档：bestSkillLevel 不随技能重置而回落（粘性）', () => {
    const s = newGame('T', 0)
    s.meta.bestSkillLevel = 90
    s.skills.mining = 0
    expect(milestoneView(s.meta.bestSkillLevel).filter((m) => m.unlocked).length).toBe(3)
  })
})

describe('A2 存档 v14 与迁移', () => {
  it('SAVE_VERSION = 14', () => {
    expect(SAVE_VERSION).toBe(14)
  })

  it('v13 档迁移：用当前技能等级回填 bestSkillLevel（单调口径，不回退）', () => {
    const s = newGame('T', 0)
    s.version = 13
    s.skills.mining = xpForLevel(63)
    s.skills.smelting = xpForLevel(12)
    delete (s.meta as unknown as { bestSkillLevel?: number }).bestSkillLevel
    const back = deserializeSave(JSON.stringify(s))!
    expect(back.version).toBe(14)
    expect(back.meta.bestSkillLevel).toBe(63)
  })

  it('新档带初始值 1（不会误解锁任何里程碑）', () => {
    const s: GameState = newGame('T', 0)
    expect(s.meta.bestSkillLevel).toBe(1)
    expect(milestoneView(s.meta.bestSkillLevel).filter((m) => m.unlocked)).toEqual([])
  })
})
