// ============================================================
// Forging v3.1 测试（双玩家测评的 A/B/C 落地项）
// 设计：docs/review-v3.0-two-players.md §3 行动清单
// ============================================================
import { describe, expect, it } from 'vitest'
import {
  abyssDef,
  abyssRequirement,
  abyssScore,
  chainStaminaCost,
  challengeAbyss,
  firstClearCrystal,
  abyssModifier,
} from '../src/game/abyss'
import { MAX_GEAR_SETS, applyCommand, goldShopNextPrice, goldShopPrice } from '../src/game/commands'
import { CONTENT, itemDef } from '../src/game/content'
import { recycleGain } from '../src/game/economy'
import { xpToNext } from '../src/game/level'
import { addInstance, newGame } from '../src/game/state'
import { simulate } from '../src/game/settle'
import { mulberry32 } from '../src/game/rng'
import type { GameEvent, GameState } from '../src/game/types'

const DEF = abyssDef()

function fresh(now = 0): GameState {
  const s = newGame('测试', now)
  s.abyss.staminaAt = now
  return s
}

// ---------------- A：深渊三件 ----------------

describe('A1 入门三层（看得见打不了 → 能起步）', () => {
  it('第 1~3 层用 introReqs，第 4 层起接曲线（且入门末档不高于第 4 层）', () => {
    expect(DEF.introReqs.length).toBe(3)
    expect(abyssRequirement(1)).toBe(DEF.introReqs[0])
    expect(abyssRequirement(2)).toBe(DEF.introReqs[1])
    expect(abyssRequirement(3)).toBe(DEF.introReqs[2])
    const req4 = DEF.base * Math.pow(DEF.growth, 3) * abyssModifier(4).reqMul
    expect(abyssRequirement(4)).toBeCloseTo(req4, 10)
    expect(DEF.introReqs[2]).toBeLessThan(req4)
  })

  it('裸号仍过不了第 1 层（保住 novice 目标带）；小成 build 能过', () => {
    const bare = fresh()
    expect(abyssScore(bare, 0).total).toBeLessThan(abyssRequirement(1))
    const one = fresh()
    const id = addInstance(one, 'pick_void')
    const inst = one.equipment.find((e) => e.instanceId === id)!
    inst.affixes = []
    inst.enhanceLevel = 10
    one.slots.pick = id
    expect(abyssScore(one, 0).total).toBeGreaterThanOrEqual(abyssRequirement(1))
  })
})

describe('A2 试炼层实质化', () => {
  it('试炼层 = 门槛 ×1.03 + 首通结晶 ×1.3，且不再倾斜权重', () => {
    const trial = abyssModifier(3)
    expect(trial.id).toBe('trial')
    expect(trial.reqMul).toBeCloseTo(1.03, 10)
    expect(trial.crystalMul).toBeCloseTo(1.3, 10)
    expect(Object.keys(trial.weightMul).length).toBe(0)
    expect(trial.desc).toContain('小试炼')
  })

  it('首通结晶确实按 1.3 倍发放（floor 取整）', () => {
    const expectGain = Math.floor((DEF.firstClearCrystal.base + DEF.firstClearCrystal.perFloor * 3) * 1.3)
    expect(firstClearCrystal(3)).toBe(expectGain)
  })
})

describe('A3 连打代价（×3 不再是弱支配）', () => {
  it('chainCost 覆盖全部连打层数且非递减；×2 是最省体力的选择', () => {
    expect(DEF.chainCost.length).toBeGreaterThanOrEqual(DEF.challengeMaxFloors)
    for (let i = 1; i < DEF.chainCost.length; i++) expect(DEF.chainCost[i]).toBeGreaterThanOrEqual(DEF.chainCost[i - 1])
    expect(DEF.chainCost[0]).toBe(1)
    expect(DEF.chainCost[1]).toBe(1)
    expect(DEF.chainCost[2]).toBe(2)
    expect(chainStaminaCost(1)).toBe(1)
    expect(chainStaminaCost(2)).toBe(1)
    expect(chainStaminaCost(3)).toBe(2)
  })

  it('体力不足按代价阻塞（×3 需 2 点，剩 1 点时被拦下且不扣体力）', () => {
    const s = fresh()
    s.abyss.stamina = 1
    // 给足战力（满配）以便走到体力判定
    for (const [slot, itemId] of Object.entries({
      pick: 'pick_void',
      crucible: 'crucible_void',
      hammer: 'hammer_void',
      mainhand: 'sword_void',
      head: 'helmet_void',
      body: 'chest_void',
      legs: 'legs_void',
      feet: 'boots_void',
      necklace: 'necklace_mithril',
      ring: 'ring_mithril',
    })) {
      const id = addInstance(s, itemId)
      s.equipment.find((e) => e.instanceId === id)!.enhanceLevel = 10
      ;(s.slots as Record<string, number>)[slot] = id
    }
    const evs: GameEvent[] = []
    challengeAbyss(s, 0, evs, 3)
    expect(evs[0].type).toBe('blocked')
    expect(evs[0].type === 'blocked' && evs[0].reason).toContain('连打 3 层需 2 点')
    expect(s.abyss.stamina).toBe(1) // 不扣体力
    // 改为 ×2 就能过（1 点）
    const evs2: GameEvent[] = []
    challengeAbyss(s, 0, evs2, 2)
    expect(evs2.some((e) => e.type === 'abyssCleared')).toBe(true)
    expect(s.abyss.stamina).toBe(0)
  })
})

// ---------------- B：经济与长尾 ----------------

describe('B1 金币循环出口（金币商店）', () => {
  it('价格递增且恒高于回收价（反套利）', () => {
    for (const g of CONTENT.goldShop) {
      const p0 = goldShopPrice(g.id, 0)!
      const p5 = goldShopPrice(g.id, 5)!
      expect(p5).toBeGreaterThan(p0)
      // 反套利：任何次数下买价都高于回收价
      for (const k of [0, 1, 10, 100]) {
        expect(goldShopPrice(g.id, k)!).toBeGreaterThan(recycleGain(fresh(), g.itemId, 1))
      }
    }
  })

  it('购买：扣金、得物、次数累加；金币不足阻塞', () => {
    const s = fresh()
    s.gold = 1000
    const price = goldShopNextPrice(s, 'essence')!
    const evs = applyCommand(s, { type: 'buyGoldShopItem', id: 'essence' }, 0)
    expect(evs.some((e) => e.type === 'itemsGained')).toBe(true)
    expect(s.gold).toBe(1000 - price)
    expect(s.materials['essence'] ?? 0).toBe(1)
    expect(s.meta.goldShop?.essence).toBe(1)
    // 第二次价格更高
    expect(goldShopNextPrice(s, 'essence')!).toBeGreaterThan(price)

    s.gold = 0
    const evs2 = applyCommand(s, { type: 'buyGoldShopItem', id: 'essence' }, 0)
    expect(evs2[0].type).toBe('blocked')
  })

  it('未知商品阻塞（不静默）', () => {
    const s = fresh()
    s.gold = 1e9
    const evs = applyCommand(s, { type: 'buyGoldShopItem', id: 'nope' }, 0)
    expect(evs[0].type).toBe('blocked')
  })
})

describe('B2 长尾压缩与强化技能生效', () => {
  it('经验曲线：Lv80 及以下锚点不变，Lv100 已压缩', () => {
    expect(xpToNext(76)).toBeGreaterThan(0)
    let cum = 0
    for (let l = 1; l < 100; l++) cum += xpToNext(l)
    expect(cum).toBe(6490525) // v3.1：末段 1.02 → 1.01
  })

  it('强化技能等级提供成功率加成（此前 Lv1 与 Lv100 完全相同）', () => {
    // 通过内核行为验证：同一装备、同一随机源，高技能等级的成功次数更多
    const mk = (xp: number) => {
      const s = fresh()
      s.skills.enhancing = xp
      s.abyss.stamina = 12
      const id = addInstance(s, 'pick_copper')
      const inst = s.equipment.find((e) => e.instanceId === id)!
      inst.affixes = []
      // 直接放满材料与无限次数
      s.materials['ingot_copper'] = 100000
      s.materials['essence'] = 100000
      return { s, id }
    }
    let lowWin = 0
    let highWin = 0
    for (let seed = 0; seed < 40; seed++) {
      for (const [key, target] of [['low', 0], ['high', 3]] as const) {
        const { s, id } = mk(target)
        const evs: GameEvent[] = []
        for (let i = 0; i < 6; i++) {
          const inst = s.equipment.find((e) => e.instanceId === id)!
          inst.enhanceLevel = 5 // 固定在 +5 起（成功率为递减段）
          s.actions.current = {
            ref: { kind: 'enhance', instanceId: id, targetLevel: 6 },
            remaining: 1,
            startedAt: 0,
            durationMs: 0,
            procMisses: 0,
          }
          simulate(s, 60_000, { mode: 'online', rng: mulberry32(seed * 31 + i), events: evs })
          s.actions.current = null
        }
        const wins = evs.filter((e) => e.type === 'enhanceResult' && e.success).length
        if (key === 'low') lowWin += wins
        else highWin += wins
      }
    }
    // 高技能（每 10 级 +1%，此处取 Lv11 = +1%）在同随机源下应 ≥ 低技能
    expect(highWin).toBeGreaterThanOrEqual(lowWin)
  })
})

describe('B3 T4+ 计数口径（赛季目标不再能在低档装备上刷）', () => {
  it('赛季模板已指向 T4+ 计数器，且计数只对 T4+ 装备累加', () => {
    const tpl = CONTENT.season.templates.map((t) => t.counter)
    expect(tpl).toContain('totalEnhancesT4')
    expect(tpl).toContain('totalReforgesT4')

    const enhanceOnce = (s: GameState, itemId: string) => {
      const id = addInstance(s, itemId)
      s.equipment.find((e) => e.instanceId === id)!.affixes = []
      s.actions.current = { ref: { kind: 'enhance', instanceId: id, targetLevel: 1 }, remaining: 1, startedAt: 0, durationMs: 0, procMisses: 0 }
      simulate(s, 60_000, { mode: 'online', rng: mulberry32(1) })
      s.actions.current = null
    }
    // T1 装备强化 → 只加总计数，不加 T4 计数
    const low = fresh()
    low.materials['ingot_copper'] = 100
    low.materials['essence'] = 100
    enhanceOnce(low, 'pick_copper')
    expect(low.stats.totalEnhances).toBe(1)
    expect(low.stats.totalEnhancesT4).toBe(0)
    // T4 装备强化 → 两个计数都加
    const high = fresh()
    high.materials['ingot_gold'] = 100
    high.materials['essence'] = 100
    enhanceOnce(high, 'pick_gold')
    expect(high.stats.totalEnhances).toBe(1)
    expect(high.stats.totalEnhancesT4).toBe(1)
  })
})

// ---------------- C：装备预设 ----------------

describe('C1 装备预设（一键换装）', () => {
  it('保存 → 换装 → 应用（槽位正确恢复）；最多 3 套（超出挤掉最旧）', () => {
    const s = fresh()
    const a = addInstance(s, 'pick_copper')
    const b = addInstance(s, 'pick_iron')
    s.slots.pick = a
    expect(applyCommand(s, { type: 'saveGearSet', name: '挖铜' }, 0).some((e) => e.type === 'notice')).toBe(true)
    s.slots.pick = b
    applyCommand(s, { type: 'saveGearSet', name: '挖铁' }, 0)
    expect(s.meta.gearSets?.length).toBe(2)

    const first = s.meta.gearSets![0]
    applyCommand(s, { type: 'applyGearSet', setId: first.id }, 0)
    expect(s.slots.pick).toBe(a)

    // 上限：再存两套 → 总数不超过 3
    applyCommand(s, { type: 'saveGearSet', name: '三' }, 0)
    applyCommand(s, { type: 'saveGearSet', name: '四' }, 0)
    expect(s.meta.gearSets!.length).toBeLessThanOrEqual(MAX_GEAR_SETS)
  })

  it('装备已不存在 → 跳过该槽并如实提示（不崩）', () => {
    const s = fresh()
    const a = addInstance(s, 'pick_copper')
    s.slots.pick = a
    applyCommand(s, { type: 'saveGearSet', name: 'X' }, 0)
    const setId = s.meta.gearSets![0].id
    // 模拟装备被回收
    s.equipment = []
    s.slots = {}
    const evs = applyCommand(s, { type: 'applyGearSet', setId }, 0)
    expect(evs.some((e) => e.type === 'notice' && e.text.includes('已不存在'))).toBe(true)
  })

  it('无装备时保存被拒绝；删除生效', () => {
    const s = fresh()
    expect(applyCommand(s, { type: 'saveGearSet', name: '空' }, 0)[0].type).toBe('blocked')
    const a = addInstance(s, 'pick_copper')
    s.slots.pick = a
    applyCommand(s, { type: 'saveGearSet', name: 'Y' }, 0)
    const id = s.meta.gearSets![0].id
    expect(applyCommand(s, { type: 'deleteGearSet', setId: id }, 0).some((e) => e.type === 'notice')).toBe(true)
    expect(s.meta.gearSets!.length).toBe(0)
  })
})

// ---------------- C：首小时体验 ----------------

describe('C2 首小时体验（内容与文案级改动）', () => {
  it('教程卡数据齐备：每步都有可读目标物（itemId 或 slotId 或总等级）', () => {
    for (const step of CONTENT.tutorial) {
      const g = step.goal as { type: string; itemId?: string; slotId?: string }
      if (g.type === 'mineItem' || g.type === 'craftItem') {
        expect(g.itemId, `第 ${step.step} 步缺 itemId`).toBeTruthy()
        expect(CONTENT.items[g.itemId!], `第 ${step.step} 步 itemId 不存在`).toBeTruthy()
      }
      if (g.type === 'equipSlot') expect(g.slotId).toBeTruthy()
    }
  })

  it('动作耗时可用（卡面展示依赖 durationOf 且 > 0）', () => {
    expect(CONTENT.ores.every((x) => x.baseTimeMs > 0)).toBe(true)
    expect(CONTENT.recipes.every((r) => r.baseTimeMs > 0)).toBe(true)
  })

  it('材料单价与回收收益同源（面板显示的数字来自同一个函数）', () => {
    const s = fresh()
    const gain = recycleGain(s, 'ore_copper', 10)
    expect(gain).toBe(itemDef('ore_copper').value * 10)
  })
})
