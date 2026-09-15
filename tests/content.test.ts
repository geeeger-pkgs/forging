import { describe, expect, it } from 'vitest'
import {
  CONTENT,
  ENHANCE_BY_TARGET,
  RECIPES_BY_ID,
  SITES_BY_ID,
  TUTORIAL_BY_STEP,
} from '../src/game/content'

describe('内容表', () => {
  it('载入并通过校验（模块导入即校验）', () => {
    expect(Object.keys(CONTENT.items).length).toBe(58)
    expect(CONTENT.recipes.length).toBe(50)
    expect(CONTENT.enhance.length).toBe(10)
    expect(CONTENT.tutorial.length).toBe(8)
    expect(CONTENT.ores.length).toBe(6)
  })

  it('关键引用存在', () => {
    expect(SITES_BY_ID.get('coal_seam')?.outputItemId).toBe('coal')
    expect(RECIPES_BY_ID.get('forge_pick_mithril')?.inputs.length).toBe(3)
    expect(ENHANCE_BY_TARGET.get(10)?.successRate).toBeCloseTo(0.36)
    expect(TUTORIAL_BY_STEP.get(8)?.rewards[0].queueSlot).toBe(1)
  })

  it('锻造配方与设计表一致（抽查 T2 铁镐）', () => {
    const pick = RECIPES_BY_ID.get('forge_pick_iron')
    expect(pick).toBeDefined()
    expect(pick!.inputs).toEqual([
      { itemId: 'pick_copper', qty: 1 },
      { itemId: 'ingot_iron', qty: 18 },
    ])
    expect(pick!.xp).toBe(27)
    expect(pick!.baseTimeMs).toBe(7000)
    expect(pick!.unlockLevel).toBe(10)
  })

  it('锻造配方生成规则（T3+ 含煤；锭量按 ×1.5 上取整）', () => {
    const p3 = RECIPES_BY_ID.get('forge_pick_silver')
    expect(p3!.inputs).toEqual([
      { itemId: 'pick_iron', qty: 1 },
      { itemId: 'ingot_silver', qty: 27 },
      { itemId: 'coal', qty: 1 },
    ])
    const p5 = RECIPES_BY_ID.get('forge_pick_mithril')
    expect(p5!.inputs.find((i) => i.itemId === 'ingot_mithril')?.qty).toBe(62)
  })

  it('熔炼配方 T3+ 含煤', () => {
    expect(RECIPES_BY_ID.get('smelt_copper')!.inputs).toEqual([{ itemId: 'ore_copper', qty: 2 }])
    expect(RECIPES_BY_ID.get('smelt_silver')!.inputs).toEqual([
      { itemId: 'ore_silver', qty: 3 },
      { itemId: 'coal', qty: 1 },
    ])
  })
})
