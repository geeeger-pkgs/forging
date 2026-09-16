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
import { maturityFromScale, seasonScaleCoef, seasonTargetsFor } from '../src/game/season'
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

  it('实现与证据同式：门槛处 0 点、满级（最低技能 100）= 42 点（3.4.1 曲线）', () => {
    expect(simD.d.prestige.fast.points).toBe(0)
    expect(simD.d.prestige.maxed.points).toBe(42) // 3.4.1：min 100 → 6²+6
    const s = newGame('T', 0)
    const xp100 = xpForLevel(100)
    s.skills = { mining: xp100, smelting: xp100, forging: xp100, enhancing: xp100 }
    expect(prestigePointsFor(s)).toBe(42)
  })

  it('门槛处不给点也不再"白轮回"：doPrestige 被拦下且提示可执行', () => {
    const s = newGame('T', 0)
    const xp30 = xpForLevel(30)
    s.skills = { mining: xp30, smelting: xp30, forging: xp30, enhancing: xp30 } // 总 120
    expect(prestigePointsFor(s)).toBe(0) // 30 级 < 首点门槛（最低技能 50）
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
    expect(p).toContain('点数随<b>最低技能</b>提升')
    expect(p, '不得残留 markdown 强调语法（曾把 **最低技能** 原样渲染给玩家）').not.toContain('**最低技能**')
    expect(p).not.toContain('满级技能 +1')
  })

  it('V5：0 点时按钮禁用且直写解锁条件（不再先确认后被拦）', () => {
    const p = src('src/ui/components/PrestigePanel.vue')
    expect(p).toContain('willGain === 0')
    expect(p).toContain('PRESTIGE_FIRST_POINT_SKILL')
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

describe('三审 T4：maturityFromScale 覆盖（此前零测试）', () => {
  it('档位名由系数反推：0.34 → 新晋、0.66 → 老手；未知值取最近邻', () => {
    const j = CONTENT.season.scaleByMaturity.junior
    const v = CONTENT.season.scaleByMaturity.veteran
    expect(maturityFromScale(j)).toBe('junior')
    expect(maturityFromScale(v)).toBe('veteran')
    expect(maturityFromScale(j + 0.01)).toBe('junior')
    expect(maturityFromScale(v - 0.01)).toBe('veteran')
  })
})

describe('三审 T5：缩放目标的浮点假进位（实机截图发现）', () => {
  it('600 × 0.34 应为 204（而非 205）', () => {
    const s = newGame('T', 0)
    s.season.scale = 0.34
    const tpl = CONTENT.season.templates.find((x) => x.targets[2] === 600)!
    const t = seasonTargetsFor(s, tpl.id)
    expect(t[2]).toBe(204)
    for (const v of t) expect(Number.isInteger(v)).toBe(true)
  })
})

describe('3.4.2：面板档位表必须与实现逐数字一致（防「只查语义」的漂移）', () => {
  it('档位表数字与实现同值（2/6/12/20/30/42），不得残留旧曲线', () => {
    const p = readFileSync(join(process.cwd(), 'src/ui/components/PrestigePanel.vue'), 'utf8')
    expect(p).toContain('2/6/12/20/30/42')
    expect(p).not.toContain('1/4/9/16/25/36')
    const s = newGame('T', 0)
    const table: Record<number, number> = { 50: 2, 60: 6, 70: 12, 80: 20, 90: 30, 100: 42 }
    for (const [lv, pts] of Object.entries(table)) {
      const xp = xpForLevel(Number(lv))
      s.skills = { mining: xp, smelting: xp, forging: xp, enhancing: xp }
      expect(prestigePointsFor(s), '最低技能 ' + lv + ' 应得 ' + pts + ' 点').toBe(pts)
    }
  })
})

describe('3.4.1 终审处置：赛季档位按生涯最高技能等级取档', () => {
  it('刚传承（当前技能低）但生涯最高已过线 → 仍按老手档', () => {
    const s = newGame('T', 0)
    s.meta.bestSkillLevel = 100 // 生涯最高（曾经练满）
    s.stats.totalPrestiges = 1 // 3.4.2：只有已传承过的号才用生涯最高取档
    s.skills = { mining: 0, smelting: 0, forging: 0, enhancing: 0 } // 刚传承：当前很低
    expect(seasonScaleCoef(s)).toBe(CONTENT.season.scaleByMaturity.veteran)
  })

  it('从未练过（生涯最高也低）→ 新晋档', () => {
    const s = newGame('T', 0)
    s.meta.bestSkillLevel = 20 // 20×4 = 80 ≤ 119 → 新晋
    expect(seasonScaleCoef(s)).toBe(CONTENT.season.scaleByMaturity.junior)
  })
})
