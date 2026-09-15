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
    expect(Object.keys(CONTENT.items).length).toBe(102)
    expect(CONTENT.recipes.length).toBe(92)
    expect(CONTENT.enhance.length).toBe(10)
    expect(CONTENT.tutorial.length).toBe(8)
    expect(CONTENT.ores.length).toBe(8)
  })

  it('深层矿脉（v1.6）：T6/T7 装备、配方链与限定（饰品保持 5 档）', () => {
    expect(CONTENT.items['pick_starlite'].stats?.speed).toBeCloseTo(1.2)
    expect(CONTENT.items['pick_starlite'].stats?.efficiency).toBeCloseTo(0.06)
    expect(CONTENT.items['pick_void'].stats?.speed).toBeCloseTo(1.35)
    expect(CONTENT.ores.find((o) => o.id === 'void_seam')?.unlockLevel).toBe(80)

    const p7 = RECIPES_BY_ID.get('forge_pick_void')!
    expect(p7.inputs.map((i) => i.itemId)).toEqual(['pick_starlite', 'ingot_void', 'coal'])
    expect(p7.inputs.find((i) => i.itemId === 'coal')?.qty).toBe(2)
    expect(p7.unlockLevel).toBe(80)
    expect(p7.inputs.find((i) => i.itemId === 'ingot_void')?.qty).toBe(140)

    expect(CONTENT.items['necklace_void']).toBeUndefined()
    expect(RECIPES_BY_ID.get('smelt_void')?.xp).toBe(65)
  })

  it('符文（v1.4）：12 个定义 / 配方存在 / 效果合法', () => {
    expect(CONTENT.runes.length).toBe(12)
    expect(RECIPES_BY_ID.get('craft_rune_speed_1')?.inputs).toEqual([
      { itemId: 'essence', qty: 3 },
      { itemId: 'ingot_copper', qty: 5 },
    ])
    const r3 = RECIPES_BY_ID.get('craft_rune_enhance_3')!
    expect(r3.unlockLevel).toBe(50)
    expect(r3.inputs.map((i) => i.itemId)).toEqual(['essence', 'ingot_mithril'])
    expect(CONTENT.runes.find((r) => r.id === 'rune_rarefind_3')?.value).toBeCloseTo(0.6)
  })

  it('饰品（v1.3）：项链强化成功率 / 戒指效率 / 配方生成', () => {
    expect(CONTENT.items['necklace_mithril'].stats?.successRate).toBeCloseTo(0.03)
    expect(CONTENT.items['necklace_mithril'].stats?.rareFind).toBeCloseTo(0.04)
    expect(CONTENT.items['ring_gold'].stats?.efficiency).toBeCloseTo(0.05)
    expect(RECIPES_BY_ID.get('forge_necklace_copper')?.inputs).toEqual([{ itemId: 'ingot_copper', qty: 16 }])
    const n3 = RECIPES_BY_ID.get('forge_necklace_silver')!
    expect(n3.inputs.map((i) => i.itemId)).toEqual(['necklace_iron', 'ingot_silver', 'coal'])
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

  it('T4/T5 装备拥有第二属性（v1.1 副属性）', () => {
    const pick5 = CONTENT.items['pick_mithril']
    expect(pick5.stats?.speed).toBeCloseTo(1.05)
    expect(pick5.stats?.efficiency).toBeCloseTo(0.04)

    const pick4 = CONTENT.items['pick_gold']
    expect(pick4.stats?.efficiency).toBeCloseTo(0.02)

    const pick3 = CONTENT.items['pick_silver']
    expect(pick3.stats?.efficiency).toBeUndefined()
  })

  it('成就表已载入并通过校验', () => {
    expect(CONTENT.achievements.length).toBeGreaterThanOrEqual(25)
    expect(CONTENT.achievements.some((a) => a.id === 'mine_10')).toBe(true)
  })
})
