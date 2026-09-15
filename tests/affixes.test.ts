import { describe, expect, it } from 'vitest'
import {
  affixCountOf,
  affixDef,
  affixMax,
  affixQuality,
  maxLocks,
  perfectAffixCount,
  perfectScore,
  poolOf,
  reforgeCost,
  rollAffixes,
  rollAffixesWith,
} from '../src/game/affixes'
import { checkAchievements } from '../src/game/achievements'
import { sweepAutoRecycle } from '../src/game/automation'
import { applyCommand } from '../src/game/commands'
import { validateContent, CONTENT, RECIPES_BY_ID, itemDef } from '../src/game/content'
import { recycleGain } from '../src/game/economy'
import { mulberry32 } from '../src/game/rng'
import { simulate } from '../src/game/settle'
import { addInstance, newGame } from '../src/game/state'
import { aggregateEquipment } from '../src/game/stats'
import type { AffixRoll, GameState } from '../src/game/types'

const DEFS = CONTENT.affixes

function equip(state: GameState, itemId: string, enhanceLevel = 0): number {
  const id = addInstance(state, itemId, enhanceLevel)
  const def = itemDef(itemId)
  if (!def.slot) throw new Error('not equipment: ' + itemId)
  state.slots[def.slot] = id
  return id
}

/** 构造指定词缀的实例（绕过 roll，用于精确断言） */
function equipWith(state: GameState, itemId: string, affixes: AffixRoll[], enhanceLevel = 0): number {
  const id = addInstance(state, itemId, enhanceLevel)
  const inst = state.equipment.find((e) => e.instanceId === id)!
  inst.affixes = affixes
  const def = itemDef(itemId)
  if (def.slot) state.slots[def.slot] = id
  return id
}

function startEnhance(s: GameState, instanceId: number, targetLevel: number): void {
  s.actions.current = {
    ref: { kind: 'enhance', instanceId, targetLevel },
    remaining: 1,
    startedAt: 0,
    durationMs: 0,
    procMisses: 0,
  }
}

describe('词缀 · 条数与池（A1/A2）', () => {
  it('条数由档位决定：T1=1 / T3=2 / T5=3 / T7=4', () => {
    expect(affixCountOf(itemDef('pick_copper'))).toBe(1)
    expect(affixCountOf(itemDef('pick_silver'))).toBe(2)
    expect(affixCountOf(itemDef('pick_mithril'))).toBe(3)
    expect(affixCountOf(itemDef('pick_void'))).toBe(4)
  })

  it('饰品（T5 上限）同样按档位取条数', () => {
    expect(affixCountOf(itemDef('necklace_mithril'))).toBe(3)
    expect(affixCountOf(itemDef('ring_iron'))).toBe(1)
  })

  it('材料 / 符文类没有词缀', () => {
    expect(affixCountOf(itemDef('ore_copper'))).toBe(0)
    expect(affixCountOf(itemDef('rune_speed_1'))).toBe(0)
    expect(rollAffixes('essence', 1)).toEqual([])
  })

  it('词缀取自对应原型池且互不重复（各原型抽样）', () => {
    const cases: [string, keyof typeof DEFS.pools][] = [
      ['pick_void', 'tool'],
      ['sword_void', 'weapon'],
      ['chest_void', 'armor'],
      ['necklace_mithril', 'jewelry'],
    ]
    for (const [itemId, arch] of cases) {
      const pool = poolOf(itemDef(itemId))
      expect(pool).toEqual(DEFS.pools[arch])
      for (let seed = 0; seed < 30; seed++) {
        const rolls = rollAffixes(itemId, seed * 977 + 1)
        const ids = rolls.map((r) => r.id)
        expect(new Set(ids).size).toBe(ids.length) // 不重复
        for (const id of ids) expect(pool).toContain(id)
      }
    }
  })
})

describe('词缀 · 数值与品质（A3/A4）', () => {
  it('数值落在 [rollMin, rollMax] × max(tier)，品质落在 [0.55, 1]', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rolls = rollAffixes('pick_void', seed)
      for (const r of rolls) {
        const max = affixMax(
          DEFS.affixes.find((a) => a.id === r.id)!,
          7,
        )
        expect(r.value).toBeGreaterThanOrEqual(max * DEFS.rollMin - 1e-9)
        expect(r.value).toBeLessThanOrEqual(max * DEFS.rollMax + 1e-9)
        const q = affixQuality('pick_void', r)
        expect(q).toBeGreaterThanOrEqual(DEFS.rollMin - 1e-6)
        expect(q).toBeLessThanOrEqual(DEFS.rollMax + 1e-6)
      }
    }
  })

  it('确定性：同一 (itemId, instanceId) 结果恒定；不同 id 会变化', () => {
    const a = rollAffixes('pick_void', 42)
    const b = rollAffixes('pick_void', 42)
    expect(a).toEqual(b)
    const variants = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((i) => JSON.stringify(rollAffixes('pick_void', i))))
    expect(variants.size).toBeGreaterThan(1)
  })

  it('高品质 roll 可产生「完美」词缀（≥95%）', () => {
    let found = 0
    for (let seed = 1; seed <= 400; seed++) {
      const rolls = rollAffixes('chest_void', seed)
      found += perfectAffixCount('chest_void', rolls)
    }
    expect(found).toBeGreaterThan(0)
  })

  it('完美度 = 品质均值；空词缀为 0', () => {
    expect(perfectScore('pick_void', [])).toBe(0)
    const maxKeen = affixMax(DEFS.affixes.find((a) => a.id === 'keen')!, 7)
    const rolls: AffixRoll[] = [
      { id: 'keen', value: maxKeen },
      { id: 'plenty', value: 0.8 * affixMax(DEFS.affixes.find((a) => a.id === 'plenty')!, 7) },
    ]
    expect(perfectScore('pick_void', rolls)).toBeCloseTo((1 + 0.8) / 2, 6)
  })
})

describe('词缀 · 属性聚合（A5）', () => {
  it('工具「锋锐」计入本技能速度（加法）', () => {
    const s = newGame('T', 0)
    equipWith(s, 'pick_copper', [{ id: 'keen', value: 0.05 }])
    const agg = aggregateEquipment(s)
    expect(agg.toolSpeed.mining).toBeCloseTo(0.15 + 0.05, 6)
    expect(agg.allSpeed).toBeCloseTo(0, 6)
  })

  it('武器「锋锐」计入全技能速度', () => {
    const s = newGame('T', 0)
    equipWith(s, 'warhammer_copper', [{ id: 'keen', value: 0.03 }])
    const agg = aggregateEquipment(s)
    expect(agg.allSpeed).toBeCloseTo(0.02 + 0.03, 6)
    expect(agg.toolSpeed.mining).toBeCloseTo(0, 6)
  })

  it('词缀不受强化倍率放大（与基础属性为两条独立轴）', () => {
    const s = newGame('T', 0)
    equipWith(s, 'pick_copper', [{ id: 'keen', value: 0.05 }], 10)
    // 基础 15% × (1+2.9%×10) = 19.35%；词缀 5% 原值
    expect(aggregateEquipment(s).toolSpeed.mining).toBeCloseTo(0.1935 + 0.05, 6)
  })

  it('庇护 / 点金 进入聚合池', () => {
    const s = newGame('T', 0)
    equipWith(s, 'chest_copper', [{ id: 'aegis', value: 0.06 }])
    equipWith(s, 'ring_copper', [{ id: 'midas', value: 0.09 }])
    const agg = aggregateEquipment(s)
    expect(agg.guard).toBeCloseTo(0.06, 6)
    expect(agg.goldFind).toBeCloseTo(0.09, 6)
  })
})

describe('重铸（A6/A7）', () => {
  function richState(): GameState {
    const s = newGame('T', 0)
    s.gold = 1_000_000
    s.materials['essence'] = 100
    s.materials['emberstone'] = 50
    return s
  }

  it('造价按档位与锁定数计算（T7：9500 ×(1+0.9×锁定)）', () => {
    expect(reforgeCost('pick_void', 0)).toEqual({ gold: 9500, essence: 4, emberstone: 0 })
    expect(reforgeCost('pick_void', 1)).toEqual({ gold: 18050, essence: 4, emberstone: 1 })
    expect(reforgeCost('pick_void', 3)).toEqual({ gold: 35150, essence: 4, emberstone: 3 })
    expect(reforgeCost('pick_copper', 0)).toEqual({ gold: 120, essence: 1, emberstone: 0 })
  })

  it('非装备 / 材料不可重铸', () => {
    expect(reforgeCost('essence', 0)).toBeNull()
    const s = richState()
    const events = applyCommand(s, { type: 'reforge', instanceId: 999, locks: [] }, 0, mulberry32(1))
    expect(events.some((e) => e.type === 'blocked')).toBe(true)
  })

  it('重铸扣除三级造价、保留锁定词缀、重摇其余、不影响强化等级', () => {
    const s = richState()
    const id = equip(s, 'pick_void', 6)
    const inst = s.equipment.find((e) => e.instanceId === id)!
    const before = inst.affixes.map((a) => ({ ...a }))
    const cost = reforgeCost('pick_void', 1)!

    const events = applyCommand(s, { type: 'reforge', instanceId: id, locks: [0] }, 0, mulberry32(7))

    expect(s.gold).toBe(1_000_000 - cost.gold)
    expect(s.materials['essence']).toBe(100 - cost.essence)
    expect(s.materials['emberstone']).toBe(50 - 1)
    expect(inst.affixes.length).toBe(before.length)
    expect(inst.affixes[0]).toEqual(before[0]) // 锁定条原值保留
    expect(inst.enhanceLevel).toBe(6) // 强化等级不受影响
    expect(s.stats.totalReforges).toBe(1)
    expect(events.some((e) => e.type === 'reforged')).toBe(true)
    // 未锁定的 3 条应重摇（连续分布，全部与原来相同的概率极低）
    const changed = [1, 2, 3].some((i) => inst.affixes[i].value !== before[i].value)
    expect(changed).toBe(true)
  })

  it('阻塞：金币 / 精华 / 重铸石不足、锁定越界、锁定全部', () => {
    const s = newGame('T', 0)
    const id = equip(s, 'pick_void')
    const reason = (): string => {
      const ev = applyCommand(s, { type: 'reforge', instanceId: id, locks: [] }, 0, mulberry32(3))
      const b = ev.find((e) => e.type === 'blocked')
      return b && b.type === 'blocked' ? b.reason : ''
    }
    expect(reason()).toContain('金币不足')

    s.gold = 1_000_000
    expect(reason()).toContain('精华不足')

    s.materials['essence'] = 10
    s.materials['emberstone'] = 0
    const withLock = applyCommand(s, { type: 'reforge', instanceId: id, locks: [0] }, 0, mulberry32(3))
    const b1 = withLock.find((e) => e.type === 'blocked')
    expect(b1 && b1.type === 'blocked' ? b1.reason : '').toContain('重铸石不足')

    s.materials['emberstone'] = 10
    const bad = applyCommand(s, { type: 'reforge', instanceId: id, locks: [0, 0] }, 0, mulberry32(3))
    const b2 = bad.find((e) => e.type === 'blocked')
    expect(b2 && b2.type === 'blocked' ? b2.reason : '').toContain('重复锁定')

    const all = applyCommand(s, { type: 'reforge', instanceId: id, locks: [0, 1, 2, 3] }, 0, mulberry32(3))
    const b3 = all.find((e) => e.type === 'blocked')
    expect(b3 && b3.type === 'blocked' ? b3.reason : '').toContain('至少需要保留 1 条')

    // 全部阻塞时状态不变
    expect(s.stats.totalReforges).toBe(0)
  })

  it('A13（评审 B1）：锁定后重铸不产生重复词缀、条数不变、池语义保持', () => {
    const s = richState()
    const id = equip(s, 'pick_void') // tool 池 5 条 → T7 抽 4 条
    const inst = s.equipment.find((e) => e.instanceId === id)!
    const pool = new Set(poolOf(itemDef('pick_void')))
    for (let i = 0; i < 20; i++) {
      const keep = i % 4 // 轮流锁定不同下标
      const before = inst.affixes[keep]
      applyCommand(s, { type: 'reforge', instanceId: id, locks: [keep] }, 0, mulberry32(1000 + i))
      const ids = inst.affixes.map((a) => a.id)
      expect(inst.affixes.length).toBe(4)
      expect(new Set(ids).size).toBe(4) // 无重复
      expect(inst.affixes[keep]).toEqual(before) // 锁定条原值保留
      for (const a of inst.affixes) expect(pool.has(a.id)).toBe(true)
      // 未锁定条不得与锁定条同名
      inst.affixes.forEach((a, idx) => {
        if (idx !== keep) expect(a.id).not.toBe(before.id)
      })
    }
  })

  it('A14：锁定数边界（T1 单条不可锁 / 越界 / 非法下标）状态不变', () => {
    const s = richState()
    const id = equip(s, 'pick_copper') // T1 → 1 条词缀
    expect(maxLocks('pick_copper')).toBe(0)
    expect(maxLocks('pick_void')).toBe(3)
    const ev = applyCommand(s, { type: 'reforge', instanceId: id, locks: [0] }, 0, mulberry32(1))
    const b = ev.find((e) => e.type === 'blocked')
    expect(b && b.type === 'blocked' ? b.reason : '').toContain('至少需要保留 1 条')
    expect(s.stats.totalReforges).toBe(0)

    const id7 = equip(s, 'pick_void')
    const bad = applyCommand(s, { type: 'reforge', instanceId: id7, locks: [9] }, 0, mulberry32(1))
    const b2 = bad.find((e) => e.type === 'blocked')
    expect(b2 && b2.type === 'blocked' ? b2.reason : '').toContain('下标非法')
    expect(s.stats.totalReforges).toBe(0)
  })

  it('A15：造价逐档与内容表一致（金/精华/重铸石）', () => {
    const items: [string, number][] = [
      ['pick_copper', 1],
      ['pick_iron', 2],
      ['pick_silver', 3],
      ['pick_gold', 4],
      ['pick_mithril', 5],
      ['pick_starlite', 6],
      ['pick_void', 7],
    ]
    for (const [itemId, tier] of items) {
      for (let k = 0; k <= 3; k++) {
        const cost = reforgeCost(itemId, k)!
        expect(cost.gold).toBe(Math.round(CONTENT.affixes.reforge.goldByTier[String(tier)] * (1 + 0.9 * k)))
        expect(cost.essence).toBe(CONTENT.affixes.reforge.essenceByTier[String(tier)])
        expect(cost.emberstone).toBe(k * CONTENT.affixes.reforge.emberstonePerLock)
      }
    }
  })

  it('A16：离线（expectation）与在线造装得到同一套词缀（含盐的确定性）', () => {
    const s = newGame('T', 0)
    s.skills.forging = 1e9
    s.materials['ingot_copper'] = 100
    const salt = s.meta.affixSalt
    // 离线：expectation 模式走 grantExpected → addInstance
    s.actions.current = {
      ref: { kind: 'craft', recipeId: 'forge_pick_copper' },
      remaining: 2,
      startedAt: 0,
      durationMs: 0,
      procMisses: 0,
    }
    simulate(s, 600_000, { mode: 'expectation' })
    expect(s.equipment.length).toBeGreaterThan(0)
    for (const inst of s.equipment) {
      expect(inst.affixes).toEqual(rollAffixes(inst.itemId, inst.instanceId, salt))
    }
  })

  it('A17：点金只作用于回收，不影响任务/开箱/成就金币', () => {
    const s = newGame('T', 0)
    equipWith(s, 'ring_copper', [{ id: 'midas', value: 0.5 }])
    // 自动回收与手动回收同价
    s.materials['ore_copper'] = 10
    s.meta.autoRecycle['ore_copper'] = 4
    const before = s.gold
    sweepAutoRecycle(s)
    expect(s.gold - before).toBe(Math.round(2 * 6 * 1.5))
    const manual = applyCommand(s, { type: 'recycleMaterial', itemId: 'ore_copper', qty: 4 }, 0)
    const g = manual.find((e) => e.type === 'goldGained')
    expect(g && g.type === 'goldGained' ? g.amount : 0).toBe(Math.round(2 * 4 * 1.5))
  })

  it('A18（评审 B5）：锻造消耗优先吃「低强化 + 低完美度」的实例，并提示高价值消耗', () => {
    const s = newGame('T', 0)
    // 高完美度 +0 与 低完美度 +5 两件同 id
    const good = equipWith(s, 'pick_copper', [], 0)
    const bad = equipWith(s, 'pick_copper', [], 5)
    const goodInst = s.equipment.find((e) => e.instanceId === good)!
    const badInst = s.equipment.find((e) => e.instanceId === bad)!
    goodInst.affixes = [{ id: 'keen', value: affixMax(affixDef('keen'), 1) }] // 100% 完美
    badInst.affixes = [{ id: 'keen', value: affixMax(affixDef('keen'), 1) * 0.6 }] // 60%
    delete s.slots.pick // 两件都未装备

    const recipe = RECIPES_BY_ID.get('forge_pick_iron')!
    s.skills.forging = 1e9 // 等级远超解锁线
    for (const inp of recipe.inputs) {
      if (itemDef(inp.itemId).stackable) s.materials[inp.itemId] = inp.qty * 3
    }
    s.actions.current = {
      ref: { kind: 'craft', recipeId: 'forge_pick_iron' },
      remaining: 1,
      startedAt: 0,
      durationMs: 0,
      procMisses: 0,
    }
    const events = simulate(s, 600_000, { mode: 'online', rng: mulberry32(3) })

    // 词缀优先：+0 高完美度件保留，+5 低完美度件被消耗
    const left = s.equipment.filter((e) => e.itemId === 'pick_copper').map((e) => e.instanceId)
    expect(left).toContain(good)
    expect(left).not.toContain(bad)
    // 消耗高价值（强化 +5）时给出非阻塞提示
    expect(events.some((e) => e.type === 'notice')).toBe(true)
  })

  it('A23（评审 M6）：affixSlots 统计「完美度达标」的槽位，与 slotsFilled 不等价', () => {
    const s = newGame('T', 0)
    // 装备 6 件，但词缀品质压到阈值以下
    const slots: [string, string][] = [
      ['pick_copper', 'pick'],
      ['crucible_copper', 'crucible'],
      ['hammer_copper', 'hammer'],
      ['sword_copper', 'mainHand'],
      ['helmet_copper', 'head'],
      ['chest_copper', 'body'],
    ]
    for (const [itemId] of slots) {
      const id = addInstance(s, itemId)
      const inst = s.equipment.find((e) => e.instanceId === id)!
      const tier = itemDef(inst.itemId).tier ?? 1
      inst.affixes = inst.affixes.map((a) => ({ ...a, value: affixMax(affixDef(a.id), tier) * 0.6 }))
      s.slots[itemDef(itemId).slot!] = id
    }
    checkAchievements(s)
    expect(s.flags.achievements.unlocked).not.toContain('affix_slots_6')
    // 提升到阈值以上后应解锁
    for (const id of Object.values(s.slots)) {
      const inst = s.equipment.find((e) => e.instanceId === id)!
      inst.affixes = inst.affixes.map((a) => ({ ...a, value: affixMax(affixDef(a.id), 1) }))
    }
    checkAchievements(s)
    expect(s.flags.achievements.unlocked).toContain('affix_slots_6')
  })

  it('重铸使用真随机：同一件装备两次重铸结果不同（同种子对照）', () => {
    const s = richState()
    const id = equip(s, 'pick_void')
    const inst = s.equipment.find((e) => e.instanceId === id)!
    applyCommand(s, { type: 'reforge', instanceId: id, locks: [] }, 0, mulberry32(11))
    const a = inst.affixes.map((x) => x.value).join(',')
    applyCommand(s, { type: 'reforge', instanceId: id, locks: [] }, 0, mulberry32(12))
    const b = inst.affixes.map((x) => x.value).join(',')
    expect(a).not.toBe(b)
    expect(s.stats.totalReforges).toBe(2)
  })
})

describe('庇护词缀（A8）', () => {
  it('失败且降级档：庇护生效 → 等级不变、事件标记 guarded', () => {
    const s = newGame('T', 0)
    s.materials['ingot_copper'] = 99
    s.materials['essence'] = 99
    const id = equipWith(s, 'ring_copper', [{ id: 'aegis', value: 0.5 }], 4)
    startEnhance(s, id, 5) // +5 档 downgrade: true

    // rng：第 1 次判定成功率（0.99 → 失败），第 2 次判定庇护（0.10 < 0.5 → 触发）
    const seq = [0.99, 0.1]
    let i = 0
    const rng = { next: (): number => seq[Math.min(i++, seq.length - 1)] }
    const events = simulate(s, 100_000, { mode: 'online', rng })

    const inst = s.equipment.find((e) => e.instanceId === id)!
    expect(inst.enhanceLevel).toBe(4)
    const ev = events.find((e) => e.type === 'enhanceResult')
    expect(ev && ev.type === 'enhanceResult' ? ev.success : true).toBe(false)
    expect(ev && ev.type === 'enhanceResult' ? ev.guarded : false).toBe(true)
  })

  it('无庇护词缀时失败照常降级', () => {
    const s = newGame('T', 0)
    s.materials['ingot_copper'] = 99
    s.materials['essence'] = 99
    const id = equipWith(s, 'ring_copper', [], 4)
    startEnhance(s, id, 5)
    const rng = { next: (): number => 0.99 }
    const events = simulate(s, 100_000, { mode: 'online', rng })
    const inst = s.equipment.find((e) => e.instanceId === id)!
    expect(inst.enhanceLevel).toBe(3)
    const ev = events.find((e) => e.type === 'enhanceResult')
    expect(ev && ev.type === 'enhanceResult' ? ev.guarded : true).toBe(false)
  })
})

describe('点金词缀（A9）', () => {
  it('回收材料收益 ×(1 + goldFind)：手动与自动同价', () => {
    const s = newGame('T', 0)
    equipWith(s, 'ring_copper', [{ id: 'midas', value: 0.5 }])
    s.materials['ore_copper'] = 10
    expect(recycleGain(s, 'ore_copper', 4)).toBe(Math.round(2 * 4 * 1.5))

    const ev = applyCommand(s, { type: 'recycleMaterial', itemId: 'ore_copper', qty: 4 }, 0)
    const gold = ev.find((e) => e.type === 'goldGained')
    expect(gold && gold.type === 'goldGained' ? gold.amount : 0).toBe(12)
    expect(s.gold).toBe(12)
  })

  it('无点金时按原价回收（回归）', () => {
    const s = newGame('T', 0)
    s.materials['ore_copper'] = 3
    expect(recycleGain(s, 'ore_copper', 3)).toBe(6)
  })
})

describe('词缀成就（A11）', () => {
  it('累计完美词缀触发成就，且造装即计数', () => {
    const s = newGame('T', 0)
    for (let i = 0; i < 40; i++) addInstance(s, 'chest_void')
    expect(s.stats.perfectAffixes).toBeGreaterThan(0)
    checkAchievements(s)
    expect(s.flags.achievements.unlocked).toContain('affix_perfect_1')
  })

  it('重铸次数成就与 affixCount / affixSlots 成就', () => {
    const s = newGame('T', 0)
    s.gold = 1_000_000
    s.materials['essence'] = 200
    const id = addInstance(s, 'pick_void')
    for (let i = 0; i < 25; i++) applyCommand(s, { type: 'reforge', instanceId: id, locks: [] }, 0, mulberry32(i + 1))
    checkAchievements(s)
    expect(s.flags.achievements.unlocked).toContain('affix_reforge_25')
    expect(s.flags.achievements.unlocked).toContain('affix_count_4')

    // affixSlots 语义为「完美度 ≥80% 的已装备槽位」（见 A23 的专项用例）
    expect(s.flags.achievements.unlocked).not.toContain('affix_slots_6')
  })
})

describe('词缀内容校验（A12）', () => {
  it('当前内容表通过校验', () => {
    expect(validateContent(CONTENT)).toEqual([])
  })

  it('负例：池引用不存在的词缀 / 条数超出池容量 / 完美阈值越界 → 报错', () => {
    const clone = JSON.parse(JSON.stringify(CONTENT)) as typeof CONTENT
    clone.affixes.pools.tool = ['keen', 'nope']
    clone.affixes.countByTier['7'] = 9
    clone.affixes.perfectThreshold = 2
    const errs = validateContent(clone)
    expect(errs.some((e) => e.includes('引用不存在的词缀'))).toBe(true)
    expect(errs.some((e) => e.includes('超出最小池容量'))).toBe(true)
    expect(errs.some((e) => e.includes('完美阈值'))).toBe(true)
  })

  it('重铸石物品已登记且可被采集掉落引用', () => {
    expect(itemDef('emberstone').stackable).toBe(true)
    const drops = CONTENT.ores.flatMap((o) => o.rareDrops.filter((d) => d.itemId === 'emberstone'))
    expect(drops.length).toBeGreaterThanOrEqual(4)
  })

  it('rollAffixesWith 使用注入随机源（可复现）', () => {
    const a = rollAffixesWith(mulberry32(99), 'pick_void')
    const b = rollAffixesWith(mulberry32(99), 'pick_void')
    expect(a).toEqual(b)
    expect(a.length).toBe(4)
  })
})
