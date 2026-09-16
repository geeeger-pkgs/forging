// ============================================================
// Forging v3.3 · B1 赛季目标按账号分档缩放（证据链 + 承诺口径）
// 设计：docs/design-v3.3.md §1-B1；证据：docs/sim-season-output.json（scripts/sim-season.mjs 反推）
// 本文件只做两件事：
//   ① 断言"内容表 == 脚本输出"（表照抄脚本，不许手填）
//   ② 断言承诺口径（twice/always × 全铜·全银·1金2银；once × 全铜 + 老手全银）缩放后 ≤100% 预算，
//      以及反挂保护（严格递增、≥ base×下限）
// ============================================================
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CONTENT } from '../src/game/content'
import { maturityClassOf, seasonScaleCoef, seasonTargetsFor, seasonView } from '../src/game/season'
import { xpForLevel } from '../src/game/level'
import { newGame } from '../src/game/state'

const DEF = CONTENT.season
const sim = JSON.parse(readFileSync(join(process.cwd(), 'docs', 'sim-season-output.json'), 'utf8')) as {
  season: { renownPerLevel: number; fullLevelRenown: number; targets: Record<string, Record<string, number>> }
  maturity: {
    scaleByMaturity: Record<string, number>
    coefFloor: number
    promises: { cls: string; offline: string; scenario: string; ratioAfter: number; promised: boolean }[]
    scaledTargets: Record<string, Record<string, number[]>>
    guards: { monotone: boolean; floorOk: boolean }
    promisedMaxRatioAfter: number
  }
}

describe('B1 证据链：内容表 == 脚本反推', () => {
  it('缩放系数与下限逐字段一致（表照抄脚本输出）', () => {
    expect(DEF.scaleByMaturity).toEqual(sim.maturity.scaleByMaturity)
    expect(DEF.coefFloor).toBe(sim.maturity.coefFloor)
  })

  it('满级门槛 60 声望（renownPerLevel 4→3），且等级数与奖励不变', () => {
    expect(DEF.levels).toBe(20)
    expect(DEF.renownPerLevel).toBe(3)
    expect(DEF.levels * DEF.renownPerLevel).toBe(60)
    expect(sim.season.renownPerLevel).toBe(3)
    expect(sim.season.fullLevelRenown).toBe(60)
  })

  it('脚本的自检全绿（严格递增 / 下限保护）', () => {
    expect(sim.maturity.guards.monotone).toBe(true)
    expect(sim.maturity.guards.floorOk).toBe(true)
  })
})

describe('B1 承诺口径：缩放后工时 ≤100% 预算', () => {
  it('承诺集最差占比 ≤100%', () => {
    expect(sim.maturity.promisedMaxRatioAfter).toBeLessThanOrEqual(1)
  })

  it('承诺集非空且有约束力（不是"没承诺所以过"）', () => {
    const promised = sim.maturity.promises.filter((p) => p.promised)
    expect(promised.length).toBeGreaterThanOrEqual(8)
    // 至少有一条在缩放前是超预算的（否则说明这套缩放毫无作用、可能白改）
    const overs = promised.filter((p) => p.ratioAfter > 0.6)
    expect(overs.length, '承诺集里应有接近上限的样本，证明约束是真的').toBeGreaterThan(0)
  })

  it('3 金档不承诺（容错档），且未参赛的新号档不在系数表里', () => {
    expect(sim.maturity.promises.filter((p) => p.scenario === 'gold2' && p.promised)).toEqual([])
    expect(Object.keys(sim.maturity.scaleByMaturity).sort()).toEqual(['junior', 'veteran'])
  })
})

describe('B1 分档与派生：内核实现与表一致', () => {
  it('分档边界：≤119 总等级为新晋，≥120 为老手', () => {
    // 注意：state.skills 存的是**经验**（levelInfo 换算等级）；总等级 = 四技能等级之和
    // 单技能上限 MAX_LEVEL=100，故高总等级要用多技能拼（挖 100 + 熔 19/20 + 初始各 1）
    const s = newGame('T', 0)
    s.skills.mining = xpForLevel(100)
    s.skills.smelting = xpForLevel(17)
    expect(maturityClassOf(s)).toBe('junior') // 100 + 17 + 1 + 1 = 119
    s.skills.smelting = xpForLevel(18)
    expect(maturityClassOf(s)).toBe('veteran') // 120
    expect(seasonScaleCoef(s)).toBe(DEF.scaleByMaturity.veteran)
  })

  it('派生目标 == 脚本输出的 scaledTargets（同一公式）', () => {
    const s = newGame('T', 0) // 新晋
    for (const tpl of DEF.templates) {
      const derived = seasonTargetsFor(s, tpl.id)
      expect(derived, `模板 ${tpl.id} 派生结果应与脚本一致`).toEqual(sim.maturity.scaledTargets.junior[tpl.counter])
    }
  })

  it('缩放后的目标严格递增且不低于基础 × 下限', () => {
    const s = newGame('T', 0)
    for (const tpl of DEF.templates) {
      const t = seasonTargetsFor(s, tpl.id)
      expect(t[0]).toBeLessThan(t[1])
      expect(t[1]).toBeLessThan(t[2])
      t.forEach((v, i) => expect(v).toBeGreaterThanOrEqual(tpl.targets[i] * DEF.coefFloor))
    }
  })

  it('老手目标 = 基础 × 0.66（比新晋略小，来自 T7 模型反推）', () => {
    const s = newGame('T', 0)
    s.skills.mining = xpForLevel(100)
    s.skills.smelting = xpForLevel(20)
    const tpl = DEF.templates[0]
    const t = seasonTargetsFor(s, tpl.id)
    expect(t).toEqual(sim.maturity.scaledTargets.veteran[tpl.counter])
  })
})

// ============================================================
// v3.3 评审处置回归（两名评审员，各 7.5/10 有条件放行）
// ============================================================
describe('评审处置：证据链与下界', () => {
  it('sim 的等级奖励读内容表（不再硬编码），并逐行落 JSON', () => {
    const rows = (sim.maturity as unknown as { levelRewardRows: { gold: number; essence: number; tokens: number }[] })
      .levelRewardRows
    expect(rows.length).toBe(DEF.levels)
    const r = DEF.levelReward
    rows.forEach((row, i) => {
      const lv = i + 1
      expect(row.gold).toBe(r.goldBase + r.goldPerLevel * lv)
      expect(row.essence).toBe(r.essenceBase + Math.floor(lv / 4))
      expect(row.tokens).toBe(lv >= DEF.levels ? r.maxLevelTokens : lv % r.tokenEvery === 0 ? r.tokenAmount : 0)
    })
  })

  it('面板分母用满级声望（60），不是三金容错上限（120）', () => {
    const s = newGame('T', 0)
    s.skills.mining = xpForLevel(100)
    s.season.renown = 60
    s.season.tasks = []
    const view = seasonView(s, 0)
    expect(view.maxRenown).toBe(DEF.levels * DEF.renownPerLevel)
    expect(view.maxRenown).toBe(60)
    expect(view.level).toBe(DEF.levels) // 60 声望即满级
  })
})
