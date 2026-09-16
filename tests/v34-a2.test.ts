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
import { seasonScaleCoef, seasonTargetsFor } from '../src/game/season'
import { doPrestige, prestigePointsFor } from '../src/game/prestige'
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
  it('SAVE_VERSION = 15（里程碑 v14 + 赛季档位快照 v15）', () => {
    expect(SAVE_VERSION).toBe(15)
  })

  it('v13 档迁移：用当前技能等级回填 bestSkillLevel（单调口径，不回退）', () => {
    const s = newGame('T', 0)
    s.version = 13
    s.skills.mining = xpForLevel(63)
    s.skills.smelting = xpForLevel(12)
    delete (s.meta as unknown as { bestSkillLevel?: number }).bestSkillLevel
    const back = deserializeSave(JSON.stringify(s))!
    expect(back.version).toBe(15)
    expect(back.meta.bestSkillLevel).toBe(63)
  })

  it('新档带初始值 1（不会误解锁任何里程碑）', () => {
    const s: GameState = newGame('T', 0)
    expect(s.meta.bestSkillLevel).toBe(1)
    expect(milestoneView(s.meta.bestSkillLevel).filter((m) => m.unlocked)).toEqual([])
  })
})

// ============================================================
// v3.4 A6：传承「快轮回 vs 满级轮回」（D 段证据 + 实现同步）
// 起因（v3.0 硬核评审）：玩家实测"120 快轮回 1~2.5h/点，要反着玩"。本轮先用 D 段建模量化。
// ============================================================
describe('A6 传承点数：消除反直觉最优解', () => {
  const simD = JSON.parse(readFileSync(join(process.cwd(), 'docs', 'sim-audit-output.json'), 'utf8')) as {
    d: { prestige: { fast: { points: number; perHour: number }; maxed: { points: number; perHour: number }; ratio: number; acceptable: boolean } }
  }

  it('证据：快轮回/满级轮回的每小时点数比 ≤1.25（改前实测 26.6× 倒挂）', () => {
    // v3.4 V1：改为**停点扫描**口径（旧 d.prestige 是单点对比，评审指出属自证）
    const scan = (simD.d as unknown as { stretchScan: { ratio: number; acceptable: boolean } }).stretchScan
    expect(scan.ratio).toBeLessThanOrEqual(1.25)
    expect(scan.acceptable).toBe(true)
  })

  it('实现与证据同式：门槛处 0 点、满级轮回 52 点（满级技能 ×6）', () => {
    expect(simD.d.prestige.fast.points).toBe(0)
    expect(simD.d.prestige.maxed.points).toBe(52) // 满级技能 ×6：28 + 24
    const s = newGame('T', 0)
    const xp100 = xpForLevel(100)
    s.skills = { mining: xp100, smelting: xp100, forging: xp100, enhancing: xp100 }
    expect(prestigePointsFor(s)).toBe(52)
  })

  it('门槛处不给点也不再"白轮回"：doPrestige 被拦下且提示可执行', () => {
    const s = newGame('T', 0)
    const xp30 = xpForLevel(30)
    s.skills = { mining: xp30, smelting: xp30, forging: xp30, enhancing: xp30 } // 总 120
    expect(prestigePointsFor(s)).toBe(0) // 30 级不满足均衡门槛（最低 ≥0.9×平均）
    const ev = doPrestige(s)
    expect(ev.some((e) => e.type === 'blocked')).toBe(true)
    expect(s.skills.mining, '被拦下时不应重置任何东西').toBe(xp30)
  })
})

describe('A2 自愈：bestSkillLevel 不因旧值永久停留', () => {
  it('载入时按当前技能等级单调修复（v14 档里字段被写成 1 也能恢复）', () => {
    const s = newGame('T', 0)
    s.version = 14
    s.skills.mining = xpForLevel(88)
    s.meta.bestSkillLevel = 1 // 模拟"字段被写成默认值、之后技能继续升级"
    const back = deserializeSave(JSON.stringify(s))!
    expect(back.meta.bestSkillLevel).toBe(88)
    expect(milestoneView(back.meta.bestSkillLevel).filter((m) => m.unlocked).length).toBe(2) // Lv80/85
  })

  it('不回退：字段高于当前技能等级时保持原值', () => {
    const s = newGame('T', 0)
    s.version = 14
    s.skills.mining = xpForLevel(10)
    s.meta.bestSkillLevel = 95
    const back = deserializeSave(JSON.stringify(s))!
    expect(back.meta.bestSkillLevel).toBe(95)
  })
})

describe('v3.4 处置回归（评审 V2~V5）', () => {
  const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

  it('V4：传承面板文案与公式一致（满级技能 ×4，不是 +1）', () => {
    const p = src('src/ui/components/PrestigePanel.vue')
    expect(p).toContain('满级技能 ×6')
    expect(p).not.toContain('满级技能 +1')
  })

  it('V5：0 点时按钮禁用且直写解锁条件（不再先确认后被拦）', () => {
    const p = src('src/ui/components/PrestigePanel.vue')
    expect(p).toContain('willGain === 0')
    expect(p).toContain('PRESTIGE_MIN_LEVEL + 10')
  })

  it('V2/V3：里程碑用独立 class（不被窄屏 .tl 隐藏）且文案写明技能与解锁条件', () => {
    const top = src('src/ui/components/TopBar.vue')
    expect(top).toContain('class="dim ms"')
    expect(top).toContain('技能里程碑')
    expect(top).toContain('任一技能 Lv')
    expect(top).toMatch(/\.ms \{[\s\S]{0,100}display: inline/)
  })
})

describe('V6 赛季档位快照（赛季内目标恒定）', () => {
  it('轮换时冻结档位；赛季中途提升技能等级不改变本季目标', () => {
    const s: GameState = newGame('T', 0)
    const ms = CONTENT.season.templates[0]
    // 新晋档（总等级 4）
    s.season.scale = CONTENT.season.scaleByMaturity.junior
    const before = seasonTargetsFor(s, ms.id)
    // 中途把技能练到很高（本应跨到老手档）
    s.skills.mining = xpForLevel(100)
    s.skills.smelting = xpForLevel(100)
    s.skills.forging = xpForLevel(100)
    s.skills.enhancing = xpForLevel(100)
    const after = seasonTargetsFor(s, ms.id)
    expect(after, '赛季内目标必须恒定（快照口径）').toEqual(before)
    // 对外报的系数也是快照值
    expect(seasonScaleCoef(s)).toBe(CONTENT.season.scaleByMaturity.junior)
  })

  it('缺失/异常快照时回落到当前档位（老档兼容）', () => {
    const s: GameState = newGame('T', 0)
    s.season.scale = 0
    expect(seasonScaleCoef(s)).toBe(CONTENT.season.scaleByMaturity.junior)
  })
})
