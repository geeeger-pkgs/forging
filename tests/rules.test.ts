import { describe, expect, it } from 'vitest'
import { CONTENT } from '../src/game/content'
import { baseTimeOf, durationOf, enhanceCostFor, xpOf, yieldRangeOf } from '../src/game/rules'
import { aggregateEquipment, speedFor } from '../src/game/stats'
import { addInstance, newGame } from '../src/game/state'
import type { GameState } from '../src/game/types'

function equip(state: GameState, itemId: string, enhanceLevel = 0): void {
  const id = addInstance(state, itemId, enhanceLevel)
  const def = CONTENT.items[itemId]
  if (!def.slot) throw new Error('not equipment: ' + itemId)
  state.slots[def.slot] = id
}

describe('动作时长与速度', () => {
  it('裸装挖铜 = 6000ms', () => {
    const s = newGame('T', 0)
    expect(durationOf(s, { kind: 'mine', siteId: 'copper_seam' })).toBe(6000)
  })

  it('铜镐 +0：6s → 6000/1.15 ≈ 5217ms（设计 §1 示例）', () => {
    const s = newGame('T', 0)
    equip(s, 'pick_copper')
    expect(speedFor(s, { kind: 'mine', siteId: 'copper_seam' })).toBeCloseTo(0.15)
    expect(durationOf(s, { kind: 'mine', siteId: 'copper_seam' })).toBe(5217)
  })

  it('铜镐 +10：×1.29 → 6000/1.1935 ≈ 5027ms', () => {
    const s = newGame('T', 0)
    equip(s, 'pick_copper', 10)
    expect(speedFor(s, { kind: 'mine', siteId: 'copper_seam' })).toBeCloseTo(0.1935)
    expect(durationOf(s, { kind: 'mine', siteId: 'copper_seam' })).toBe(5027)
  })

  it('工具速度只作用于对应技能（铜镐不影响熔炼）', () => {
    const s = newGame('T', 0)
    equip(s, 'pick_copper')
    const smelt = { kind: 'craft', recipeId: 'smelt_copper' } as const
    expect(speedFor(s, smelt)).toBe(0)
    expect(durationOf(s, smelt)).toBe(6000)
  })

  it('战锤提供全技能速度', () => {
    const s = newGame('T', 0)
    equip(s, 'warhammer_copper')
    expect(speedFor(s, { kind: 'mine', siteId: 'copper_seam' })).toBeCloseTo(0.02)
    expect(speedFor(s, { kind: 'craft', recipeId: 'smelt_copper' })).toBeCloseTo(0.02)
  })

  it('剑提供效率、头盔提供 XP、胸甲提供产量、腿甲提供稀有', () => {
    const s = newGame('T', 0)
    equip(s, 'sword_iron')
    equip(s, 'helmet_iron')
    equip(s, 'chest_iron')
    equip(s, 'legs_iron')
    const agg = aggregateEquipment(s)
    expect(agg.efficiency).toBeCloseTo(0.03)
    expect(agg.wisdom).toBeCloseTo(0.04)
    expect(agg.quantity).toBeCloseTo(0.08)
    expect(agg.rareFind).toBeCloseTo(0.08)
  })

  it('非工具强化主属性 ×(1+5%×n)', () => {
    const s = newGame('T', 0)
    equip(s, 'sword_copper', 4) // efficiency 0.02 → 0.02×1.2
    const agg = aggregateEquipment(s)
    expect(agg.efficiency).toBeCloseTo(0.024)
  })

  it('速度下限保护可用（minActionTimeMs 参数存在）', () => {
    expect(CONTENT.config.minActionTimeMs).toBe(250)
  })

  it('套装加成（v1.2）：≥5 件同档 +4% 全速；8 件再 +4% 效率', () => {
    const s = newGame('T', 0)
    equip(s, 'pick_iron')
    equip(s, 'crucible_iron')
    equip(s, 'hammer_iron')
    equip(s, 'helmet_iron')
    equip(s, 'chest_iron')
    const agg5 = aggregateEquipment(s)
    expect(agg5.setTier).toBe(2)
    expect(agg5.setCount).toBe(5)
    expect(agg5.allSpeed).toBeCloseTo(0.04)
    expect(agg5.efficiency).toBeCloseTo(0)

    equip(s, 'legs_iron')
    equip(s, 'boots_iron')
    equip(s, 'sword_iron')
    const agg8 = aggregateEquipment(s)
    expect(agg8.setCount).toBe(8)
    expect(agg8.allSpeed).toBeCloseTo(0.04)
    // 套装 0.04 + 铁剑效率 0.03 + 铁靴效率 0.02
    expect(agg8.efficiency).toBeCloseTo(0.09)
  })
})

describe('经验与消耗', () => {
  it('xpOf：矿场/配方/强化', () => {
    expect(xpOf({ kind: 'mine', siteId: 'copper_seam' })).toBe(5)
    expect(xpOf({ kind: 'craft', recipeId: 'smelt_iron' })).toBe(7.5)
    expect(xpOf({ kind: 'craft', recipeId: 'forge_sword_copper' })).toBe(18)
    expect(xpOf({ kind: 'enhance', instanceId: 1, targetLevel: 5 })).toBe(15)
  })

  it('强化消耗解析：铜镐 +5 → 铜锭×4 + 精华×2（设计 §9）', () => {
    expect(enhanceCostFor('pick_copper', 5)).toEqual([
      { itemId: 'ingot_copper', qty: 4 },
      { itemId: 'essence', qty: 2 },
    ])
    expect(enhanceCostFor('sword_mithril', 10)).toEqual([
      { itemId: 'ingot_mithril', qty: 8 },
      { itemId: 'essence', qty: 5 },
    ])
  })

  it('矿场产出范围', () => {
    expect(yieldRangeOf('copper_seam')).toEqual({ min: 1, max: 3, itemId: 'ore_copper' })
    expect(yieldRangeOf('coal_seam')).toEqual({ min: 2, max: 4, itemId: 'coal' })
  })

  it('baseTimeOf 覆盖三类动作', () => {
    expect(baseTimeOf({ kind: 'mine', siteId: 'mithril_seam' })).toBe(17000)
    expect(baseTimeOf({ kind: 'craft', recipeId: 'forge_sword_gold' })).toBe(11000)
    expect(baseTimeOf({ kind: 'enhance', instanceId: 1, targetLevel: 1 })).toBe(6000)
  })
})
