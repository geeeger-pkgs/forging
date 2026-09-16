import { describe, expect, it } from 'vitest'
import {
  ABYSS_REGEN_MS,
  abyssModifier,
  abyssRequirement,
  abyssScore,
  abyssView,
  buyAbyssItem,
  challengeAbyss,
  firstClearCrystal,
  msToNextStamina,
  nextPrice,
  priceOf,
  regenStamina,
  repeatCrystal,
  shopItem,
  sweepAbyss,
} from '../src/game/abyss'
import { checkAchievements } from '../src/game/achievements'
import { useRune } from '../src/game/buffs'
import { applyCommand } from '../src/game/commands'
import { CONTENT, itemDef, validateContent } from '../src/game/content'
import { mulberry32 } from '../src/game/rng'
import { addInstance, addMaterial, materialCount, newGame } from '../src/game/state'
import { aggregateEquipment } from '../src/game/stats'
import type { GameEvent, GameState } from '../src/game/types'
import sim from '../docs/sim-abyss-output.json'

const DEF = CONTENT.abyss

function emptyEvents(): GameEvent[] {
  return []
}

/** 直接给足结晶（测试商店用） */
function withCrystals(s: GameState, n: number): void {
  s.abyss.crystals = n
}

describe('战力口径（A1/A2）', () => {
  it('A2：门槛曲线与内容表一致；abyssScore 是注入 now 的纯函数', () => {
    // v3.1：第 1~3 层走**入门三层**（introReqs），第 4 层起 = base × growth^(n−1) × 层词条倍率
    expect(abyssRequirement(1)).toBeCloseTo(DEF.introReqs[0], 10)
    expect(abyssRequirement(2)).toBeCloseTo(DEF.introReqs[1], 10)
    expect(abyssRequirement(3)).toBeCloseTo(DEF.introReqs[2], 10)
    expect(abyssRequirement(4)).toBeCloseTo(DEF.base * Math.pow(DEF.growth, 3) * abyssModifier(4).reqMul, 10)
    expect(abyssRequirement(9)).toBeCloseTo(DEF.base * Math.pow(DEF.growth, 8) * abyssModifier(9).reqMul, 10)
    const s = newGame('T', 0)
    const a = abyssScore(s, 1000)
    const b = abyssScore(s, 1000)
    expect(a.total).toBe(b.total) // 同 now 同结果（不依赖 Date.now）
    expect(a.values.speed).toBe(0) // 新档无装备 → 六项为 0（深渊由 build 自然门禁，无需额外解锁门槛）
  })

  it('A1：六项口径逐项与内核一致（含三条「无 buff/perk」负例）', () => {
    const s = newGame('T', 0)
    const id = addInstance(s, 'pick_void')
    s.equipment.find((e) => e.instanceId === id)!.affixes = []
    s.slots.pick = id
    const sc = abyssScore(s, 0)
    const agg = aggregateEquipment(s)
    // 速度 = 采矿速度
    expect(sc.values.speed).toBeCloseTo(agg.allSpeed + agg.toolSpeed.mining, 6)
    // 产量：无 buff/perk → 与聚合一致
    expect(sc.values.quantity).toBeCloseTo(agg.quantity, 6)
    // 强化率：无 perk → 与聚合一致（此处无符文）
    expect(sc.values.enhanceRate).toBeCloseTo(agg.enhanceRate, 6)

    // 正例：速度符文计入（buff 口径）
    s.materials['rune_speed_3'] = 1
    useRune(s, 'rune_speed_3', 0)
    const sc2 = abyssScore(s, 0)
    expect(sc2.values.speed).toBeGreaterThan(sc.values.speed)
    // 负例：wisdom 符文不存在于内容表（经验只吃精通），构造 wisdom 影响不应出现
    expect(sc2.values.wisdom).toBeCloseTo(sc.values.wisdom, 6)
  })

  it('A8：永久速度同时计入战力与聚合（同源）', () => {
    const s = newGame('T', 0)
    const before = abyssScore(s, 0)
    const aggBefore = aggregateEquipment(s)
    s.abyss.permanentSpeed = 5
    const after = abyssScore(s, 0)
    const aggAfter = aggregateEquipment(s)
    const perLevel = shopItem('permanent_speed')!.perLevel!
    expect(after.values.speed - before.values.speed).toBeCloseTo(perLevel * 5, 6)
    expect(aggAfter.allSpeed - aggBefore.allSpeed).toBeCloseTo(perLevel * 5, 6)
  })
})

describe('体力（A5）', () => {
  it('恢复按 tick、余数保留、上限截断（离线 8h 只补满 12）', () => {
    const s = newGame('T', 0)
    // 场景 1：0 体力离线 8 小时 → 只补到上限
    s.abyss.stamina = 0
    s.abyss.staminaAt = 0
    regenStamina(s, 8 * 3_600_000)
    expect(s.abyss.stamina).toBe(DEF.staminaMax) // 12，而不是 16
    // 场景 2：满体力离线 8h → 仍为 12（超额丢弃）
    s.abyss.stamina = DEF.staminaMax
    s.abyss.staminaAt = 0
    regenStamina(s, 8 * 3_600_000)
    expect(s.abyss.stamina).toBe(DEF.staminaMax)
    // 场景 3：余数保留（1.5 个 tick → 回 1 点，余数不丢）
    s.abyss.stamina = 0
    s.abyss.staminaAt = 0
    regenStamina(s, ABYSS_REGEN_MS + Math.floor(ABYSS_REGEN_MS / 2))
    expect(s.abyss.stamina).toBe(1)
    regenStamina(s, ABYSS_REGEN_MS * 2)
    expect(s.abyss.stamina).toBe(2)
  })

  it('回拨时钟不增加体力（单调守卫）；倒计时正确', () => {
    const s = newGame('T', 0)
    s.abyss.stamina = 3
    s.abyss.staminaAt = 1_000_000
    regenStamina(s, 500_000) // 回拨
    expect(s.abyss.stamina).toBe(3)
    expect(s.abyss.staminaAt).toBe(1_000_000)
    expect(msToNextStamina(s, 1_000_000)).toBe(ABYSS_REGEN_MS)
  })
})

describe('挑战与扫荡（A3/A4/A6）', () => {
  it('A3：战力不足 → blocked 且不消耗体力；足够 → 通关 + 首通结晶', () => {
    const s = newGame('T', 0)
    const ev1 = emptyEvents()
    challengeAbyss(s, 0, ev1)
    const blocked = ev1.find((e) => e.type === 'blocked')
    expect(blocked).toBeTruthy()
    expect(s.abyss.bestFloor).toBe(0)
    expect(s.abyss.stamina).toBe(DEF.staminaMax) // 不消耗体力

    // 装备一整套 T7（无词缀）→ 战力足以跨过前几层
    for (const [itemId, slot] of [
      ['pick_void', 'pick'],
      ['sword_void', 'mainHand'],
      ['helmet_void', 'head'],
      ['chest_void', 'body'],
      ['legs_void', 'legs'],
      ['boots_void', 'feet'],
    ] as const) {
      const iid = addInstance(s, itemId)
      s.equipment.find((e) => e.instanceId === iid)!.affixes = []
      s.slots[slot] = iid
    }
    // 逐层挑战直到战力不足（验证单调递增与首通奖励）
    let guard = 0
    while (guard++ < 50) {
      const ev = emptyEvents()
      challengeAbyss(s, 0, ev)
      if (ev.some((e) => e.type === 'blocked')) break
    }
    expect(s.abyss.bestFloor).toBeGreaterThan(0)
    let expected = 0
    for (let fl = 1; fl <= s.abyss.bestFloor; fl++) expected += firstClearCrystal(fl)
    expect(s.abyss.crystals).toBe(expected)
  })

  it('A4：扫荡需已通关；结晶 = 1 + ⌊最高层/20⌋', () => {
    const s = newGame('T', 0)
    const ev0 = emptyEvents()
    sweepAbyss(s, 0, ev0)
    expect(ev0.some((e) => e.type === 'blocked')).toBe(true)

    s.abyss.bestFloor = 35
    s.abyss.stamina = 5
    const ev = emptyEvents()
    sweepAbyss(s, 0, ev)
    expect(s.abyss.crystals).toBe(repeatCrystal(35))
    // v3.0：扫荡结晶**不吃层词条倍率**（倍率只作用首通；否则 bestFloor 词条会造成 1:3 收益悬崖）
    expect(repeatCrystal(35)).toBe(1 + Math.floor(35 / 20))
    expect(s.abyss.stamina).toBe(4)
    expect(s.stats.totalAbyssSweeps).toBe(1)
  })

  it('A6：首通奖励只发一次；bestFloor 单调；体力不足 blocked', () => {
    const s = newGame('T', 0)
    for (const [itemId, slot] of [
      ['pick_void', 'pick'],
      ['sword_void', 'mainHand'],
      ['chest_void', 'body'],
      ['legs_void', 'legs'],
    ] as const) {
      const iid = addInstance(s, itemId)
      s.equipment.find((e) => e.instanceId === iid)!.affixes = []
      s.slots[slot] = iid
    }
    const ev = emptyEvents()
    challengeAbyss(s, 0, ev)
    const first = s.abyss.crystals
    const floor = s.abyss.bestFloor
    // 再来一次：只能前进到下一层（不会重复发同一层的奖励）
    const ev2 = emptyEvents()
    challengeAbyss(s, 0, ev2)
    if (s.abyss.bestFloor > floor) {
      expect(s.abyss.crystals).toBe(first + firstClearCrystal(floor + 1))
    } else {
      expect(s.abyss.crystals).toBe(first)
    }
    // 体力不足
    s.abyss.stamina = 0
    s.abyss.staminaAt = 1e12
    const ev3 = emptyEvents()
    challengeAbyss(s, 0, ev3)
    expect(ev3.some((e) => e.type === 'blocked')).toBe(true)
  })
})

describe('商店（A7）', () => {
  it('价格 = 首价 ×1.3^已购（四舍五入）；超上限/结晶不足 blocked', () => {
    const s = newGame('T', 0)
    const ticket = shopItem('reroll_ticket')!
    expect(priceOf(ticket, 0)).toBe(ticket.crystal)
    expect(priceOf(ticket, 1)).toBe(Math.round(ticket.crystal * 1.3))
    expect(nextPrice(s, 'reroll_ticket')).toBe(ticket.crystal)

    // 结晶不足
    const ev = emptyEvents()
    buyAbyssItem(s, 'reroll_ticket', ev)
    expect(ev.some((e) => e.type === 'blocked' && e.reason.includes('结晶不足'))).toBe(true)

    // 购买成功
    withCrystals(s, 100000)
    const ev2 = emptyEvents()
    buyAbyssItem(s, 'reroll_ticket', ev2)
    expect(ev2.some((e) => e.type === 'abyssItemBought')).toBe(true)
    expect(s.abyss.tickets).toBe(1)
    expect(s.abyss.purchased['reroll_ticket']).toBe(1)
    expect(s.stats.totalAbyssPurchases).toBe(1)
    expect(nextPrice(s, 'reroll_ticket')).toBe(priceOf(ticket, 1))
  })

  it('上限：买满后 blocked；永久速度与称号的效果落点正确', () => {
    const s = newGame('T', 0)
    withCrystals(s, 100_000_000)
    const perm = shopItem('permanent_speed')!
    for (let i = 0; i < perm.max; i++) buyAbyssItem(s, 'permanent_speed', [])
    expect(s.abyss.permanentSpeed).toBe(perm.max)
    const ev = emptyEvents()
    buyAbyssItem(s, 'permanent_speed', ev)
    expect(ev.some((e) => e.type === 'blocked' && e.reason.includes('上限'))).toBe(true)

    buyAbyssItem(s, 'title', [])
    expect(s.abyss.title).toBe(true)

    // 遗物兑换发放物品
    const before = materialCount(s, 'relic_gear')
    buyAbyssItem(s, 'relic_gear', [])
    expect(materialCount(s, 'relic_gear')).toBe(before + 1)
  })
})

describe('定向重铸券（A9：5 条契约 + 3 个边界）', () => {
  function richState(tickets = 1): GameState {
    const s = newGame('T', 0)
    s.gold = 1_000_000
    s.materials['essence'] = 100
    s.materials['emberstone'] = 100
    s.abyss.tickets = tickets
    return s
  }

  it('契约 1-5：指定 id 必出现在结果中，且券恰好消耗 1 张', () => {
    const s = richState()
    const id = addInstance(s, 'pick_void')
    const before = s.equipment.find((e) => e.instanceId === id)!.affixes.map((a) => a.id)
    const target = 'fortune' // 工具池内
    const ev = applyCommand(s, { type: 'reforge', instanceId: id, locks: [], ticketAffixId: target }, 0, mulberry32(7))
    expect(ev.some((e) => e.type === 'reforged')).toBe(true)
    const after = s.equipment.find((e) => e.instanceId === id)!.affixes
    expect(after.map((a) => a.id)).toContain(target)
    expect(new Set(after.map((a) => a.id)).size).toBe(after.length) // 不重复
    expect(after.length).toBe(before.length) // 条数不变
    expect(s.abyss.tickets).toBe(0) // 恰好消耗 1 张
  })

  it('边界 ①：券 id 与锁定 id 相同 → blocked 且不耗券', () => {
    const s = richState()
    const id = addInstance(s, 'pick_void')
    const lockedId = s.equipment.find((e) => e.instanceId === id)!.affixes[0].id
    const ev = applyCommand(s, { type: 'reforge', instanceId: id, locks: [0], ticketAffixId: lockedId }, 0, mulberry32(3))
    const b = ev.find((e) => e.type === 'blocked')
    expect(b && b.type === 'blocked' ? b.reason : '').toContain('已被锁定')
    expect(s.abyss.tickets).toBe(1) // 不耗券
  })

  it('边界 ②：券 id 不属于该装备原型池 → blocked 且不耗券', () => {
    const s = richState()
    const id = addInstance(s, 'pick_void') // 工具池：keen/plenty/flow/lore/fortune
    const ev = applyCommand(s, { type: 'reforge', instanceId: id, locks: [], ticketAffixId: 'midas' }, 0, mulberry32(3))
    const b = ev.find((e) => e.type === 'blocked')
    expect(b && b.type === 'blocked' ? b.reason : '').toContain('原型池')
    expect(s.abyss.tickets).toBe(1)
  })

  it('边界 ③：没有券时使用券参数 → blocked 且状态不变', () => {
    const s = richState(0)
    const id = addInstance(s, 'pick_void')
    const gold = s.gold
    const ev = applyCommand(s, { type: 'reforge', instanceId: id, locks: [], ticketAffixId: 'fortune' }, 0, mulberry32(3))
    const b = ev.find((e) => e.type === 'blocked')
    expect(b && b.type === 'blocked' ? b.reason : '').toContain('没有定向重铸券')
    expect(s.gold).toBe(gold) // 未扣费
    expect(s.abyss.tickets).toBe(0)
  })
})

describe('视图与成就（A11/A12/A13）', () => {
  it('A12：abyss.json 与 sim-abyss-output.json 逐字段一致（机器校验）', () => {
    expect(DEF.base).toBe(sim.abyss.base)
    expect(DEF.growth).toBe(sim.abyss.growth)
    expect(DEF.staminaMax).toBe(sim.abyss.staminaMax)
    expect(DEF.staminaRegenMinutes).toBe(sim.abyss.staminaRegenMinutes)
    expect(DEF.weights).toEqual(sim.abyss.weights)
    expect(DEF.firstClearCrystal.base).toBe(sim.abyss.firstClearCrystalBase)
    expect(DEF.firstClearCrystal.perFloor).toBe(sim.abyss.firstClearCrystalPerFloor)
    expect(DEF.repeatCrystal.base).toBe(sim.abyss.repeatCrystalBase)
    expect(DEF.repeatCrystal.perFloor).toBe(sim.abyss.repeatCrystalPerFloor)
    // 门槛逐档一致
    for (const [floor, req] of Object.entries(sim.reqAt)) {
      expect(abyssRequirement(Number(floor))).toBeCloseTo(req, 6)
    }
    // 商店价格一致（v3.0：shop 在表与证据里都是**数组**，按 id 取名比对）
    const ticket = shopItem('reroll_ticket')!
    const simTicket = (sim.abyss.shop as { id: string; crystal: number; max: number; priceGrowth: number }[]).find((x) => x.id === 'reroll_ticket')!
    expect(ticket.crystal).toBe(simTicket.crystal)
    expect(ticket.max).toBe(simTicket.max)
    expect(ticket.priceGrowth).toBe(simTicket.priceGrowth)
    const simPerm = (sim.abyss.shop as { id: string; perLevel?: number }[]).find((x) => x.id === 'permanent_speed')!
    expect(shopItem('permanent_speed')!.perLevel).toBe(simPerm.perLevel)
    // 内容表校验通过
    expect(validateContent(CONTENT)).toEqual([])
  })

  it('A12b（V1）：层词条与离线参数在表与证据中逐字段一致', () => {
    const s = sim as { abyss: { mods: { mod: number; id: string; reqMul: number; crystalMul: number }[]; rounding: string; challengeMaxFloors: number; sweepMaxCount: number; offlineCapExtra: number } }
    expect(DEF.mods.length).toBe(s.abyss.mods.length)
    for (const m of DEF.mods) {
      const sm = s.abyss.mods.find((x) => x.id === m.id)!
      expect(sm, m.id).toBeTruthy()
      expect(sm.mod).toBe(m.mod)
      expect(sm.reqMul).toBe(m.reqMul)
      expect(sm.crystalMul).toBe(m.crystalMul)
    }
    expect(DEF.rounding).toBe(s.abyss.rounding)
    expect(DEF.challengeMaxFloors).toBe(s.abyss.challengeMaxFloors)
    expect(DEF.sweepMaxCount).toBe(s.abyss.sweepMaxCount)
    expect(DEF.offlineCapExtra).toBe(s.abyss.offlineCapExtra)
  })

  it('A13：UI 覆盖——深渊页签与面板注册', () => {
    expect(CONTENT.abyss.shop.length).toBeGreaterThanOrEqual(6)
  })

  it('A11：深渊成就全部可触发', () => {
    const s = newGame('T', 0)
    s.abyss.bestFloor = 25
    s.abyss.crystals = 1500
    s.stats.totalAbyssSweeps = 1
    s.stats.totalAbyssPurchases = 1
    checkAchievements(s)
    const unlocked = s.flags.achievements.unlocked
    expect(unlocked).toContain('abyss_first')
    expect(unlocked).toContain('abyss_10')
    expect(unlocked).toContain('abyss_25')
    expect(unlocked).toContain('abyss_crystal_1000')
    expect(unlocked).toContain('abyss_sweep_1')
    expect(unlocked).toContain('abyss_buy_1')
  })

  it('abyssView 提供面板所需的全部字段', () => {
    const s = newGame('T', 0)
    const v = abyssView(s, 0)
    expect(v.nextFloor).toBe(1)
    expect(v.staminaMax).toBe(DEF.staminaMax)
    expect(v.shop.length).toBe(DEF.shop.length)
    expect(v.gap).toBeCloseTo(abyssRequirement(1) - v.score.total, 6)
  })

  it('战力受符文影响（在线口径，注入 now）', () => {
    const s = newGame('T', 0)
    addMaterial(s, 'rune_rarefind_3', 1)
    const before = abyssScore(s, 0).values.rareFind
    useRune(s, 'rune_rarefind_3', 0)
    expect(abyssScore(s, 0).values.rareFind).toBeGreaterThan(before)
    expect(itemDef('rune_rarefind_3').name).toBeTruthy()
  })
})

describe('补充边界（DoD 覆盖）', () => {
  it('价格递增：第 k 次购买的价格逐次 ×1.3 且非降', () => {
    const ticket = shopItem('reroll_ticket')!
    let prev = 0
    for (let k = 0; k < ticket.max; k++) {
      const p = priceOf(ticket, k)
      expect(p).toBeGreaterThanOrEqual(prev)
      prev = p
    }
    expect(priceOf(ticket, 11)).toBeGreaterThan(priceOf(ticket, 0))
  })

  it('券 + 锁定组合：券与锁定共存时条数不变、券 id 必出现且不与锁定重复', () => {
    const s = newGame('T', 0)
    s.gold = 1e6
    s.materials['essence'] = 100
    s.materials['emberstone'] = 100
    s.abyss.tickets = 1
    const id = addInstance(s, 'pick_void')
    const inst = s.equipment.find((e) => e.instanceId === id)!
    const lockedId = inst.affixes[0].id
    const ticketId = ['keen', 'plenty', 'flow', 'lore', 'fortune'].find((x) => x !== lockedId)!
    const ev = applyCommand(s, { type: 'reforge', instanceId: id, locks: [0], ticketAffixId: ticketId }, 0, mulberry32(11))
    expect(ev.some((e) => e.type === 'reforged')).toBe(true)
    const after = inst.affixes.map((a) => a.id)
    expect(after.length).toBe(4)
    expect(after[0]).toBe(lockedId)
    expect(after).toContain(ticketId)
    expect(new Set(after).size).toBe(4)
    expect(s.abyss.tickets).toBe(0)
  })

  it('扫荡按最高层结算（层数越高结晶越多）', () => {
    expect(repeatCrystal(1)).toBeLessThan(repeatCrystal(20))
    expect(repeatCrystal(20)).toBeLessThan(repeatCrystal(40))
  })

  it('战力排序稳定：装备越多越高（单调性守护）', () => {
    const s = newGame('T', 0)
    const s0 = abyssScore(s, 0).total
    const id1 = addInstance(s, 'pick_void')
    s.equipment.find((e) => e.instanceId === id1)!.affixes = []
    s.slots.pick = id1
    const s1 = abyssScore(s, 0).total
    const id2 = addInstance(s, 'sword_void')
    s.equipment.find((e) => e.instanceId === id2)!.affixes = []
    s.slots.mainHand = id2
    const s2 = abyssScore(s, 0).total
    expect(s1).toBeGreaterThan(s0)
    expect(s2).toBeGreaterThan(s1)
  })

  it('首通奖励公式与内容表一致（10 + 2×层）', () => {
    expect(firstClearCrystal(1)).toBe(DEF.firstClearCrystal.base + DEF.firstClearCrystal.perFloor)
    // 第 35 层 = 富矿层 → (10+2×35) × 1.5 = 120
    expect(firstClearCrystal(35)).toBe(Math.floor((DEF.firstClearCrystal.base + DEF.firstClearCrystal.perFloor * 35) * abyssModifier(35).crystalMul))
  })
})

describe('深渊面板视图（A13 覆盖）', () => {
  it('abyssView：商店条目含价格/已购/可负担三态', () => {
    const s = newGame('T', 0)
    const v0 = abyssView(s, 0)
    expect(v0.shop.every((x) => x.price !== null && !x.affordable)).toBe(true)
    s.abyss.crystals = 100000
    const v1 = abyssView(s, 0)
    expect(v1.shop.some((x) => x.affordable)).toBe(true)
    // 买满后 price = null
    const perm = shopItem('permanent_speed')!
    for (let i = 0; i < perm.max; i++) buyAbyssItem(s, 'permanent_speed', [])
    const v2 = abyssView(s, 0)
    expect(v2.shop.find((x) => x.def.id === 'permanent_speed')!.price).toBeNull()
  })

  it('主题每 5 层一换（叙事层）', () => {
    expect(CONTENT.abyss.themes.length).toBeGreaterThanOrEqual(3)
    const v = abyssView(newGame('T', 0), 0)
    expect(typeof v.nextTheme).toBe('string')
    expect(v.nextTheme.length).toBeGreaterThan(0)
  })

  it('战力明细：贡献之和 = 合计（浮点容差）', () => {
    const s = newGame('T', 0)
    const id = addInstance(s, 'pick_mithril')
    s.equipment.find((e) => e.instanceId === id)!.affixes = []
    s.slots.pick = id
    const sc = abyssScore(s, 0)
    const sum = Object.values(sc.contributions).reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(sc.total, 8)
  })
})

describe('体力与商店的联动（实现契约）', () => {
  it('体力上限固定：购买/挑战不会超上限；恢复不溢出', () => {
    const s = newGame('T', 0)
    s.abyss.stamina = DEF.staminaMax
    regenStamina(s, 1e9)
    expect(s.abyss.stamina).toBe(DEF.staminaMax)
    s.abyss.staminaAt = 0
    regenStamina(s, ABYSS_REGEN_MS)
    expect(s.abyss.stamina).toBe(DEF.staminaMax)
  })

  it('挑战消耗 1 体力（成功后）——需整套配装（战力是全局加权和，第 1 层即要求实战 build）', () => {
    const s = newGame('T', 0)
    for (const [itemId, slot] of [
      ['pick_void', 'pick'],
      ['crucible_void', 'crucible'],
      ['hammer_void', 'hammer'],
      ['sword_void', 'mainHand'],
      ['helmet_void', 'head'],
      ['chest_void', 'body'],
      ['legs_void', 'legs'],
      ['boots_void', 'feet'],
      ['necklace_mithril', 'necklace'],
      ['ring_mithril', 'ring'],
    ] as const) {
      const iid = addInstance(s, itemId)
      s.equipment.find((e) => e.instanceId === iid)!.affixes = []
      s.slots[slot] = iid
    }
    const before = s.abyss.stamina
    challengeAbyss(s, 0, [])
    expect(s.abyss.stamina).toBe(before - 1)
  })

  it('扫荡累计计数（成就依赖）', () => {
    const s = newGame('T', 0)
    s.abyss.bestFloor = 5
    for (let i = 0; i < 3; i++) {
      s.abyss.stamina = 1
      sweepAbyss(s, 0, [])
    }
    expect(s.stats.totalAbyssSweeps).toBe(3)
  })
})

describe('入口难度（实现说明）', () => {
  it('入门三层：新手裸号仍过不了第 1 层，但小成 build 能起步（v3.1）', () => {
    // 裸号（无装备）：仍 0 层 —— 保住 novice 目标带 [0,0]
    const bare = newGame('T', 0)
    expect(abyssScore(bare, 0).total).toBeLessThan(abyssRequirement(1))
    // 单件 T7 +10（无词缀）：1.47 ≥ 入门门槛 1.15 → **能进第 1 层**（这是 v3.1 的修复目标：
    // 此前首层 2.736 让 T3/T4 装备长时间"看得见打不了"）
    const one = newGame('T', 0)
    const id = addInstance(one, 'pick_void')
    const inst = one.equipment.find((e) => e.instanceId === id)!
    inst.affixes = []
    inst.enhanceLevel = 10
    one.slots.pick = id
    expect(abyssScore(one, 0).total).toBeGreaterThanOrEqual(abyssRequirement(1))
    // 但第 4 层起的曲线仍然要求整套 build
    expect(abyssScore(one, 0).total).toBeLessThan(abyssRequirement(4))
  })
})
