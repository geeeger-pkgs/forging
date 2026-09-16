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
import { maturityClassOf, maturityFromScale, seasonScaleCoef, seasonTargetsFor } from '../src/game/season'
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

describe('3.4.3 区分性断言：取档只在"已传承"时才用生涯最高（回退即红）', () => {
  it('未传承的偏科号（单技能高、总等级 ≤119）必须判新晋——3.4.1 的宽口径会误判老手', () => {
    const s: GameState = newGame('T', 0)
    s.meta.bestSkillLevel = 60 // 单技能 60 → ×4 = 240 会被误判老手
    s.skills = { mining: xpForLevel(60), smelting: xpForLevel(20), forging: xpForLevel(20), enhancing: 0 }
    s.stats.totalPrestiges = 0 // 从未传承
    expect(maturityClassOf(s)).toBe('junior')
    s.stats.totalPrestiges = 1 // 已传承 → 生涯最高生效
    expect(maturityClassOf(s)).toBe('veteran')
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

describe('v3.4.4 全应用扫描处置：describe 口径与内核对齐（数字级）', () => {
  it('强化弹窗成功率含技能等级加成（Lv100 → +10pp）', async () => {
    const { describeAction } = await import('../src/app/describe')
    const s = newGame('T', 0)
    const id = addInstance(s, 'pick_copper')
    const inst = s.equipment.find((e) => e.instanceId === id)!
    inst.affixes = []
    const ref = { kind: 'enhance' as const, instanceId: id, targetLevel: 2 }
    s.skills.enhancing = xpForLevel(1)
    const low = describeAction(s, ref, 0).enhanceRate ?? 0
    s.skills.enhancing = xpForLevel(100)
    const high = describeAction(s, ref, 0).enhanceRate ?? 0
    expect(high - low, '技能等级应贡献 +10pp（⌊100/10⌋×1%）').toBeCloseTo(0.1, 6)
  })

  it('强化弹窗经验含 wisdom 乘区（与内核一致）', async () => {
    const { describeAction } = await import('../src/app/describe')
    const s = newGame('T', 0)
    const id = addInstance(s, 'pick_copper')
    s.equipment.find((e) => e.instanceId === id)!.affixes = []
    const ref = { kind: 'enhance' as const, instanceId: id, targetLevel: 2 }
    const base = describeAction(s, ref, 0).xp
    const perk = CONTENT.perks.find((p) => p.effect === 'wisdom')!
    expect(perk, '内容表缺少 wisdom 精通').toBeTruthy()
    s.meta.prestige.perks[perk.id] = 2
    const boosted = describeAction(s, ref, 0).xp
    // 精确：×2 点 ×3%/点 = +6%
    expect(boosted, '经验应按 (1+0.03×2) 提升').toBeCloseTo(base * 1.06, 6)
  })

  it('面板与弹窗的强化成功率同源（都含符文；RightPanel 用 effectiveStats）', () => {
    const rp = readFileSync(join(process.cwd(), 'src/ui/components/RightPanel.vue'), 'utf8')
    expect(rp).toContain('强化成功率 {{ pct(eff.enhanceRate) }}')
    const st = readFileSync(join(process.cwd(), 'src/game/stats.ts'), 'utf8')
    expect(st).toContain('enhanceRate: agg.enhanceRate + buff.enhanceRate')
  })
})

describe('v3.4.4 第二批：成就进度口径与判定同源（全应用扫描发现）', () => {
  it('affixSlots：进度 = 已装备且完美度达标的槽位数（不再数行囊件数）', async () => {
    const { achievementValue } = await import('../src/game/achievements')
    const s = newGame('T', 0)
    // 行囊里放 5 件带词缀但不装备的 → 旧口径会数成 5
    for (let i = 0; i < 5; i++) addInstance(s, 'pick_copper')
    const def = CONTENT.achievements.find((a) => a.type === 'affixSlots')!
    expect(def, '内容表缺少 affixSlots 类型').toBeTruthy()
    expect(achievementValue(s, def), '未装备不应计入').toBe(0)
  })

  it('abyssFloor / seasonLevel / companionCount / bannerLevel 有真实进度（不再是恒 0）', async () => {
    const { achievementValue } = await import('../src/game/achievements')
    const s = newGame('T', 0)
    s.abyss.bestFloor = 7
    s.meta.expeditions.banner = 3
    s.season.renown = CONTENT.season.renownPerLevel * 5
    // 不用 if 守卫：内容表里这些类型都存在，守卫只会把断言变成空跑（探针证伪过）
    const pick = (t: string) => {
      const a = CONTENT.achievements.find((d) => d.type === t)
      expect(a, `内容表缺少类型 ${t}`).toBeTruthy()
      return a!
    }
    expect(achievementValue(s, pick('abyssFloor'))).toBe(7)
    expect(achievementValue(s, pick('bannerLevel'))).toBe(3)
    expect(achievementValue(s, pick('seasonLevel'))).toBe(5)
    expect(achievementValue(s, pick('companionCount'))).toBeGreaterThanOrEqual(1)
  })
})

describe('v3.4.5：评审实测的四条口径（可复算）真修复', () => {
  it('弹窗稀有掉率真接线 stoneFind（此前形参无人传）', async () => {
    const { describeAction } = await import('../src/app/describe')
    const s = newGame('T', 0)
    const ref = { kind: 'mine' as const, siteId: 'void_seam' }
    const before = describeAction(s, ref, 0).drops.find((d) => d.itemId === 'emberstone')?.rate ?? 0
    // 给一件带勘探词缀的装备（stoneFind）→ 重铸石掉率应上升
    const id = addInstance(s, 'pick_copper')
    s.equipment.find((e) => e.instanceId === id)!.affixes = [{ id: 'prospect', value: 0.2 }]
    s.slots.pick = id
    // 自证前提：词缀确实贡献了 stoneFind（若词缀失效/改名，这里先红，而不是空跑）
    const { effectiveStats } = await import('../src/game/stats')
    const rf = effectiveStats(s, 0).rareFind
    const sf = effectiveStats(s, 0).stoneFind
    expect(sf, '勘探词缀应贡献 stoneFind>0').toBeGreaterThan(0)
    const after = describeAction(s, ref, 0).drops.find((d) => d.itemId === 'emberstone')?.rate ?? 0
    // 精确值：base×(1+rf+sf)，base=before/(1+rf)。调用点漏传 stoneFind 时 after=base×(1+rf)≠期望（探针已证红）
    expect(after, '勘探词缀必须按 (1+rareFind+stoneFind) 体现在重铸石掉率上').toBeCloseTo((before / (1 + rf)) * (1 + rf + sf), 9)
    expect(after).toBeGreaterThan(before)
  })

  it('弹窗经验含精通智慧（此前只给装备侧）', async () => {
    const { describeAction } = await import('../src/app/describe')
    const s = newGame('T', 0)
    const ref = { kind: 'mine' as const, siteId: 'copper_seam' }
    const base = describeAction(s, ref, 0).xp
    const perk = CONTENT.perks.find((p) => p.effect === 'wisdom')!
    expect(perk, '内容表缺少 wisdom 精通').toBeTruthy()
    s.meta.prestige.perks[perk.id] = 3
    // 精确：×3 点 ×3%/点 = +9%
    expect(describeAction(s, ref, 0).xp, '经验应按 (1+0.03×3) 提升').toBeCloseTo(base * 1.09, 6)
  })

  it('成就 codexPercent 单位与 target 一致（百分数，不出现 0.12 / 25）', async () => {
    const { achievementValue } = await import('../src/game/achievements')
    const s = newGame('T', 0)
    const def = CONTENT.achievements.find((a) => a.type === 'codexPercent')!
    expect(def, '内容表缺少 codexPercent 类型').toBeTruthy()
    const v = achievementValue(s, def)
    expect(v, '值域应是 0~100 的百分数').toBeGreaterThanOrEqual(0)
    expect(v).toBeLessThanOrEqual(100)
  })

  it('教程「前往」清搜索词（否则目标卡被过滤）', () => {
    const nav = readFileSync(join(process.cwd(), 'src/ui/components/NavBar.vue'), 'utf8')
    expect(nav).toMatch(/setView\(t\.view as never\)\r?\n\s*store\.ui\.searchText = ''/) // \r?\n：工作树是 CRLF
  })
})

describe('v3.4.5 第二批：成就 5 类真进度 + 其余口径', () => {
  it('affixCount / abyssCrystals / seasonRenown 有真实进度（不再恒 0）', async () => {
    const { achievementValue } = await import('../src/game/achievements')
    const s = newGame('T', 0)
    const id = addInstance(s, 'pick_copper')
    s.equipment.find((e) => e.instanceId === id)!.affixes = [{ id: 'keen', value: 0.02 }, { id: 'plenty', value: 0.02 }]
    s.abyss.crystals = 7
    s.season.renown = 30
    // 不用 if 守卫（同前）：类型存在，守卫会让篡改探针变绿
    const pick = (t: string) => {
      const a = CONTENT.achievements.find((d) => d.type === t)
      expect(a, `内容表缺少类型 ${t}`).toBeTruthy()
      return a!
    }
    expect(achievementValue(s, pick('affixCount')), '单件最多词缀数=2，不是"总词缀数"').toBe(2)
    expect(achievementValue(s, pick('abyssCrystals'))).toBe(7)
    expect(achievementValue(s, pick('seasonRenown'))).toBe(30)
  })

  it('codexPercent 进度是整数（面板不会出现 5.4 / 25）', async () => {
    const { achievementValue } = await import('../src/game/achievements')
    const s = newGame('T', 0)
    const def = CONTENT.achievements.find((a) => a.type === 'codexPercent')!
    expect(def, '内容表缺少 codexPercent 类型').toBeTruthy()
    expect(Number.isInteger(achievementValue(s, def))).toBe(true)
  })

  it('赛季等级奖励的精华数真读内容表字段（临时改字段 → 结果必须跟着变）', async () => {
    const { levelReward } = await import('../src/game/season')
    const r = CONTENT.season.levelReward
    const orig = r.essencePerFour
    // 旧写法 `… === r.essenceBase + floor(lv/4)*r.essencePerFour` 在字段=1 时与硬编码 /4 恒等，
    // 是恒真式（A 评审探针⑥：把实现改回硬编码，全套 526 仍绿）。此处改为"改字段必须改结果"。
    expect(orig, 'essencePerFour 应为正整数').toBeGreaterThan(0)
    try {
      for (const lv of [5, 12, 20]) {
        expect(levelReward(lv).essence, `基线 Lv${lv}`).toBe(r.essenceBase + Math.floor(lv / 4) * orig)
      }
      r.essencePerFour = orig + 1
      for (const lv of [5, 12, 20]) {
        expect(levelReward(lv).essence, `改字段后 Lv${lv}（硬编码实现会返回旧值→红）`).toBe(
          r.essenceBase + Math.floor(lv / 4) * (orig + 1),
        )
      }
    } finally {
      r.essencePerFour = orig
    }
  })
})

describe('v3.4.6：成就进度与判定同源（双人确认评审 A/B 各实测一条反例）', () => {
  it('companionRarity：只拥有普通伙伴时进度 0（此前恒为伙伴总数 → 面板 1/1 却锁着）', async () => {
    const { achievementValue, isMet } = await import('../src/game/achievements')
    const s = newGame('T', 0)
    const def = CONTENT.achievements.find((a) => a.type === 'companionRarity')!
    expect(def, '内容表缺少 companionRarity').toBeTruthy()
    expect(isMet(s, def), '开局只有初始普通伙伴').toBe(false)
    expect(achievementValue(s, def), '进度应为 0，而不是伙伴总数 6').toBe(0)
    const legend = CONTENT.companions.companions.find((c) => c.rarity === def.rarity)!
    expect(legend, '内容表应有目标稀有度伙伴').toBeTruthy()
    s.companions[legend.id] = { level: 1, xp: 0, trait: CONTENT.expeditions.traits[0].id }
    expect(achievementValue(s, def), '招募到目标稀有度 → 进度 1').toBe(1)
    expect(isMet(s, def), '与进度一致（1 ≥ 1）').toBe(true)
  })

  it('relicCount：同 id 多件按数量计（此前只数 id 种数 → 面板系统性低估）', async () => {
    const { achievementValue, isMet } = await import('../src/game/achievements')
    const s = newGame('T', 0)
    const def = CONTENT.achievements.find((a) => a.type === 'relicCount' && a.target === 3)!
    expect(def, '内容表缺少 relicCount(target=3)').toBeTruthy()
    const relic = Object.values(CONTENT.items).find((i) => i.category === 'relic')!
    expect(relic, '内容表应有遗物').toBeTruthy()
    s.materials[relic.id] = 2
    expect(achievementValue(s, def), '2 件同 id 遗物 = 2（旧口径为 1）').toBe(2)
    expect(isMet(s, def)).toBe(false)
    s.materials[relic.id] = 3
    expect(achievementValue(s, def)).toBe(3)
    expect(isMet(s, def), 'isMet ⟺ value≥target').toBe(true)
  })
})
