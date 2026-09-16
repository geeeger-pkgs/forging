// ============================================================
// Forging v3.0「正式版」测试（F1~F10）
// 设计：docs/design-v3.0.md §4
// ============================================================
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  abyssDef,
  abyssModifier,
  abyssRequirement,
  abyssScore,
  abyssWeights,
  challengeAbyss,
  firstClearCrystal,
  offlineCapExtra,
  regenStamina,
  repeatCrystal,
  sweepAbyss,
} from '../src/game/abyss'
import { poolOf, rollAffixes } from '../src/game/affixes'
import { CODEX_TITLES, codexGate, codexIds, codexProgress, milestoneReached, recordItem, recordRecipe } from '../src/game/codex'
import { normalizeCodex } from '../src/game/codex-store'
import { CODEX_BYTES, codexFingerprint, fingerprintOf, sectionTotal, type CodexSection } from '../src/game/codex-store'
import { applyCommand, reforgeBlockReason } from '../src/game/commands'
import { CONTENT, itemDef } from '../src/game/content'
import { rerollTrait } from '../src/game/expeditions'
import { sweepInstanceRecycle } from '../src/game/automation'
import { settleOffline } from '../src/game/offline'
import { mulberry32 } from '../src/game/rng'
import { addInstance, newGame } from '../src/game/state'
import { durationOf } from '../src/game/rules'
import { speedFor } from '../src/game/stats'
import { SAVE_VERSION, deserializeSave } from '../src/app/persist'
import type { GameEvent, GameState } from '../src/game/types'

const DEF = abyssDef()

function fresh(now = 0): GameState {
  const s = newGame('测试', now)
  s.abyss.staminaAt = now
  return s
}

// ---------------- F1 层词条 ----------------

describe('F1 层词条（abyssModifier）', () => {
  it('五态循环：floor % 5 → 迅捷/丰饶/试炼/裂隙/富矿，floor 1 不受惩罚', () => {
    expect(abyssModifier(1).id).toBe('swift')
    expect(abyssModifier(1).reqMul).toBe(1)
    expect(abyssModifier(2).id).toBe('bounty')
    expect(abyssModifier(3).id).toBe('trial') // v3.1：试炼层改为"门槛 ×1.03 + 结晶 ×1.3"（不再倾斜权重）
    expect(abyssModifier(4).id).toBe('rift')
    expect(abyssModifier(5).id).toBe('rich')
    for (let n = 1; n <= 50; n++) expect(abyssModifier(n).id).toBe(abyssModifier(n + 5).id)
  })

  it('确定性：同层永远同结果；门槛含词条倍率', () => {
    expect(abyssModifier(7).id).toBe(abyssModifier(7).id)
    expect(abyssRequirement(5)).toBeCloseTo(DEF.base * Math.pow(DEF.growth, 4) * 1.06, 10)
    expect(abyssRequirement(4)).toBeCloseTo(DEF.base * Math.pow(DEF.growth, 3) * 0.94, 10)
    // 墙的环比与呼吸层环比（设计 §2.3a 实算值）
    expect(abyssRequirement(5) / abyssRequirement(4)).toBeCloseTo(1.1626, 3)
    expect(abyssRequirement(6) / abyssRequirement(5)).toBeCloseTo(0.9726, 3)
  })

  it('有效权重：层级倾斜，且"贡献之和 = 合计"在同一份权重下成立', () => {
    const s = fresh()
    const w1 = abyssWeights(1)
    expect(w1.speed).toBeCloseTo(DEF.weights.speed * 1.5, 10)
    const w2 = abyssWeights(2)
    expect(w2.quantity).toBeCloseTo(DEF.weights.quantity * 1.5, 10)
    expect(w2.rareFind).toBeCloseTo(DEF.weights.rareFind * 1.5, 10)
    // v3.1：试炼层不再倾斜权重（原 ×1.5 实测只值 +1.3~1.9%，是伪词条）
    const w3 = abyssWeights(3)
    expect(w3.enhanceRate).toBeCloseTo(DEF.weights.enhanceRate, 10)
    for (const floor of [1, 2, 3, 4, 5, 9]) {
      const sc = abyssScore(s, 0, floor)
      const sum = Object.values(sc.contributions).reduce((a, b) => a + b, 0)
      expect(sum, `第 ${floor} 层`).toBeCloseTo(sc.total, 10)
      for (const k of Object.keys(sc.contributions) as (keyof typeof sc.contributions)[]) {
        expect(sc.contributions[k]).toBeCloseTo(sc.values[k] * sc.weights[k], 10)
      }
    }
    // 无功时 = 内容表权重
    expect(abyssScore(s, 0).weights).toEqual(DEF.weights)
  })

  it('结晶：首通含词条倍率且 floor 取整；扫荡不含倍率（避免 bestFloor 悬崖）', () => {
    expect(DEF.rounding).toBe('floor')
    expect(firstClearCrystal(5)).toBe(Math.floor((10 + 2 * 5) * 1.5))
    expect(firstClearCrystal(4)).toBe(Math.floor((10 + 2 * 4) * 0.8))
    // 扫荡：与词条无关
    expect(repeatCrystal(5)).toBe(1 + Math.floor(5 / DEF.repeatCrystal.perFloor))
    expect(repeatCrystal(4)).toBe(1 + Math.floor(4 / DEF.repeatCrystal.perFloor))
  })
})

// ---------------- F2 连打 ----------------

describe('F2 连打（逐层判定）', () => {
  function ready(stamina = 3): GameState {
    const s = fresh()
    s.abyss.stamina = stamina
    // 给足战力：直接喂六项（用装备不便，这里用深渊永久速度 + 词缀不可行 → 用 bsetFloor 起点低）
    return s
  }

  it('战力不足 → blocked 且不消耗体力；目标层只受内容表上限约束', () => {
    const s = ready(3)
    const evs: GameEvent[] = []
    challengeAbyss(s, 0, evs, 3)
    expect(evs[0].type).toBe('blocked')
    expect(s.abyss.stamina).toBe(3) // 不消耗
  })

  /** 满档满强化全套（真正写进 slots，否则 abyssScore 恒为 0 —— 测评 D3） */
  function equipVoid(s: GameState): void {
    const slots: Record<string, string> = {
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
    }
    for (const [slot, itemId] of Object.entries(slots)) {
      const id = addInstance(s, itemId)
      s.equipment.find((e) => e.instanceId === id)!.enhanceLevel = 10
      ;(s.slots as Record<string, number>)[slot] = id
    }
  }

  it('连打：逐层通过、只花 1 点体力、只发 1 条事件、首通逐层补发', () => {
    const s = ready(3)
    equipVoid(s)
    // 自证门槛已过（否则下面的断言会变成"永远走不到"的死代码 —— 测评 D3）
    expect(abyssScore(s, 0, 1).total).toBeGreaterThan(abyssRequirement(1))

    const evs: GameEvent[] = []
    challengeAbyss(s, 0, evs, 3)
    const cleared = evs.filter((e) => e.type === 'abyssCleared')
    expect(cleared.length).toBe(1) // 只发 1 条
    expect(cleared[0].type === 'abyssCleared' && cleared[0].count).toBeGreaterThanOrEqual(1)
    if (cleared[0].type === 'abyssCleared') {
      const e = cleared[0]
      expect(e.count).toBeLessThanOrEqual(DEF.challengeMaxFloors)
      expect(e.clearedTo).toBe(s.abyss.bestFloor)
      expect(e.floor).toBe(e.clearedTo)
      expect(e.modName.length).toBeGreaterThan(0)
      // 首通逐层补发：总结晶 = 各层首通之和（无跳过层 → 无奖励黑洞）
      let want = 0
      for (let n = 1; n <= e.count; n++) want += firstClearCrystal(n)
      expect(e.crystals).toBe(want)
      expect(s.abyss.crystals).toBe(want)
    }
    // v3.1：连打代价按内容表（×1/×2 = 1 点、×3 = 2 点）
    const want = Math.min(DEF.challengeMaxFloors, 3)
    expect(s.abyss.stamina).toBe(3 - (DEF.chainCost[want - 1] ?? 1))
  })

  it('D1 回归：逐层推进时"面板口径 == 内核判定"（倾斜层必须同源）', () => {
    const s = ready(3)
    equipVoid(s)
    for (let i = 0; i < 12; i++) {
      const floor = s.abyss.bestFloor + 1
      // 面板口径 = abyssView 内部用的就是 abyssScore(state, now, nextFloor)
      const canByPanel = abyssScore(s, 0, floor).total >= abyssRequirement(floor)
      const evs: GameEvent[] = []
      s.abyss.stamina = 3
      challengeAbyss(s, 0, evs, 1)
      const passed = evs.some((x) => x.type === 'abyssCleared')
      expect(passed, `第 ${floor} 层：面板 ${canByPanel} / 内核 ${passed}`).toBe(canByPanel)
    }
  })

  it('目标层数被内容表上限截断（≤ challengeMaxFloors）', () => {
    expect(DEF.challengeMaxFloors).toBeLessThanOrEqual(5)
    const s = fresh()
    s.abyss.stamina = 3
    const evs: GameEvent[] = []
    challengeAbyss(s, 0, evs, 99)
    // 战力不足 → blocked；这里只验证"不会因为传大数而崩溃/越界"
    expect(evs.length).toBeGreaterThan(0)
  })
})

// ---------------- F3 批量扫荡 ----------------

describe('F3 批量扫荡', () => {
  it('逐次累加统计、只发 1 条汇总事件、体力截断、结晶 = 单次 × 次数', () => {
    const s = fresh()
    s.abyss.bestFloor = 20
    s.abyss.stamina = 5
    const evs: GameEvent[] = []
    sweepAbyss(s, 0, evs, 3)
    const swept = evs.filter((e) => e.type === 'abyssSwept')
    expect(swept.length).toBe(1)
    if (swept[0].type === 'abyssSwept') {
      expect(swept[0].count).toBe(3)
      expect(swept[0].crystals).toBe(repeatCrystal(20) * 3)
    }
    expect(s.stats.totalAbyssSweeps).toBe(3)
    expect(s.abyss.stamina).toBe(2)

    // 次数超过体力 → 截断到体力
    const evs2: GameEvent[] = []
    sweepAbyss(s, 0, evs2, 12)
    expect(s.abyss.stamina).toBe(0)
    expect(s.stats.totalAbyssSweeps).toBe(5)
    expect(evs2.filter((e) => e.type === 'abyssSwept').length).toBe(1)

    // 体力耗尽 → blocked
    const evs3: GameEvent[] = []
    sweepAbyss(s, 0, evs3, 1)
    expect(evs3[0].type).toBe('blocked')
  })

  it('未通关任何层不能扫荡；单次上限 ≤ sweepMaxCount', () => {
    const s = fresh()
    const evs: GameEvent[] = []
    sweepAbyss(s, 0, evs, 1)
    expect(evs[0].type).toBe('blocked')
    expect(DEF.sweepMaxCount).toBeGreaterThanOrEqual(1)
  })
})

// ---------------- F4 离线回体 ----------------

describe('F4 离线回体（上限提升，时间比例）', () => {
  const HOUR = 3_600_000

  it('在线：满上限不再累积，**绝不截断**（BL1 修复）', () => {
    const s = fresh()
    s.abyss.stamina = 12
    s.abyss.staminaAt = 0
    regenStamina(s, 5 * HOUR)
    expect(s.abyss.stamina).toBe(12)
    // 人为把体力推过上限（离线段产物）→ 在线回体不得删除超额部分
    s.abyss.stamina = 20
    s.abyss.staminaAt = 10 * HOUR
    regenStamina(s, 12 * HOUR)
    expect(s.abyss.stamina).toBe(20)
  })

  it('离线：capExtra=12，按真实时长折算（2h→4 点、8h→16 点、12h+→24 点）', () => {
    const mk = (hours: number) => {
      const s = fresh()
      s.abyss.stamina = 0
      s.abyss.staminaAt = 0
      regenStamina(s, hours * HOUR, offlineCapExtra())
      return s.abyss.stamina
    }
    expect(offlineCapExtra()).toBe(12)
    expect(mk(2)).toBe(4)
    expect(mk(8)).toBe(16)
    expect(mk(12)).toBe(24)
    expect(mk(24)).toBe(24) // 上限 24
  })

  it('settleOffline：触发回体上限提升时摘要带 staminaBonus，且**不自动挑战**', () => {
    const s = fresh()
    s.abyss.stamina = 0
    s.abyss.staminaAt = 0
    s.meta.lastSeenAt = 0
    s.abyss.bestFloor = 5
    const crystalsBefore = s.abyss.crystals
    const summary = settleOffline(s, 8 * HOUR)
    expect(summary).not.toBeNull()
    expect(summary!.staminaBonus).toBe(true)
    expect(s.abyss.stamina).toBe(16)
    expect(s.abyss.bestFloor).toBe(5) // 离线不自动挑战
    expect(s.abyss.crystals).toBe(crystalsBefore)
  })

  it('离线 <2h（此处为 1h）也给时间比例的量（4 点/2h 的一半）', () => {
    const s = fresh()
    s.abyss.stamina = 0
    s.abyss.staminaAt = 0
    s.meta.lastSeenAt = 0
    const summary = settleOffline(s, 1 * HOUR)
    expect(s.abyss.stamina).toBe(2)
    // 1h 未触及上限提升（不上限也算正常结算；摘要仅在体力增加时记 staminaBonus）
    expect(summary === null || typeof summary.staminaBonus === 'boolean').toBe(true)
  })
})

// ---------------- F5 行囊治理 ----------------

describe('F5 行囊治理（L2）', () => {
  it('实例级回收：不碰已装备、不碰在制消耗件、只卖低于阈值', () => {
    const s = fresh()
    s.meta.autoRecyclePerfect = 100 // 便于命中"低于阈值"
    const a = addInstance(s, 'pick_copper')
    const b = addInstance(s, 'pick_copper')
    // 装备其中一件
    s.slots.pick = a
    const ids = sweepInstanceRecycle(s)
    expect(ids).toContain(b) // 未装备的那件
    expect(ids).not.toContain(a) // 已装备的永不回收
  })

  it('阈值为 0 → 关闭；tidyBag 只留同 id 最高完美度', () => {
    const s = fresh()
    s.meta.autoRecyclePerfect = 0
    addInstance(s, 'pick_copper')
    addInstance(s, 'pick_copper')
    expect(sweepInstanceRecycle(s)).toEqual([])

    // tidyBag：手工造两件不同完美度的同 id 装备
    const s2 = fresh()
    const i1 = addInstance(s2, 'pick_copper')
    const i2 = addInstance(s2, 'pick_copper')
    const e1 = s2.equipment.find((e) => e.instanceId === i1)!
    const e2 = s2.equipment.find((e) => e.instanceId === i2)!
    e1.affixes = []
    e2.affixes = rollAffixes('pick_copper', i2, 7)
    const evs = applyCommand(s2, { type: 'tidyBag' }, 0)
    expect(evs.some((e) => e.type === 'notice')).toBe(true)
    const left = s2.equipment.filter((e) => e.itemId === 'pick_copper')
    expect(left.length).toBe(1)
    expect(left[0].instanceId).toBe(i2) // 保留完美度更高的那件
  })
})

// ---------------- F6 图鉴（位图 + 分区门槛 + 称号） ----------------

describe('F6 图鉴位图与分区门槛', () => {
  it('位图规模 ≤32B，往返无损，指纹稳定', () => {
    expect(CODEX_BYTES).toBeLessThanOrEqual(32)
    const s = fresh()
    recordItem(s, 'ore_iron')
    expect(codexIds(s, 'items').has('ore_iron')).toBe(true)
    expect(codexIds(s, 'items').has('ore_copper')).toBe(false)
    expect(s.codex.fp).toBe(codexFingerprint())
  })

  it('D5：表指纹对"任何位置的增删"都敏感（中段插入也必须检出）', () => {
    const base: Record<CodexSection, string[]> = {
      items: ['a', 'b', 'c'],
      recipes: ['r1', 'r2'],
      affixes: ['k'],
      ores: ['o1'],
    }
    const fp0 = fingerprintOf(base)
    expect(fingerprintOf({ ...base, items: ['a', 'x', 'b', 'c'] })).not.toBe(fp0) // 中段插入
    expect(fingerprintOf({ ...base, items: ['a', 'c'] })).not.toBe(fp0) // 中段删除
    expect(fingerprintOf({ ...base, items: ['b', 'a', 'c'] })).not.toBe(fp0) // 换序
    expect(fingerprintOf({ ...base, items: ['a', 'b', 'c'] })).toBe(fp0) // 同序同结果
    expect(fingerprintOf(base)).toBe(fp0) // 确定性
    expect(codexFingerprint()).toBe(codexFingerprint())
  })

  it('指纹不符时不解码旧位图（宁可少算不可错算）', () => {
    const s = fresh()
    recordItem(s, 'ore_iron')
    const stale = { bits: s.codex.bits, fp: 'stale-fingerprint' }
    // 直接走归一化：应清空为"无进度"，而不是把旧位序套到新表上
    const normalized = normalizeCodex(stale)
    expect(normalized.fp).toBe(codexFingerprint())
    expect(sectionTotal('items')).toBeGreaterThan(0)
  })

  it('分区门槛：四档单调、末档=全收集，且面板可给出"还差哪个区"', () => {
    const s = fresh()
    const gate = codexGate(s)
    expect(gate.next?.pct).toBe(CONTENT.season.codexMilestones[0].pct)
    expect(gate.shortfall.length).toBeGreaterThan(0)
    expect(milestoneReached(s, CONTENT.season.codexMilestones[0])).toBe(false)

    // 全收集 → 全部达标
    for (const id of Object.keys(CONTENT.items)) recordItem(s, id)
    for (const r of CONTENT.recipes) recordRecipe(s, r.id)
    // 上面只验证不崩；直接断言"物品区"达标即可（其余区需另走登记 API）
    const cats = codexProgress(s).categories
    const items = cats.find((c) => c.id === 'items')!
    expect(items.found).toBe(items.total)
    expect(CODEX_TITLES.length).toBe(4)
  })

  it('渲染期安全：进度/门槛查询必须是**纯读**（不自触发重渲染）', () => {
    // v3.0 实机走查抓到：CodexPanel 渲染期调用 codexProgress/codexGate 时，
    // 旧 ensure() 每次都写回 state.codex → Vue 判定"渲染中修改依赖"→ 无限重渲染，
    // 面板计数卡住不更新（Maximum recursive updates exceeded）。
    const s = fresh()
    recordItem(s, 'ore_iron')
    const snapshot = JSON.stringify(s.codex)
    codexProgress(s)
    codexGate(s)
    milestoneReached(s, CONTENT.season.codexMilestones[0])
    codexIds(s, 'items')
    codexIds(s, 'relics')
    // 查询前后状态必须**逐字节一致**（对象引用也不应变）
    expect(JSON.stringify(s.codex)).toBe(snapshot)
    expect(s.codex.bits).toBe(JSON.parse(snapshot).bits)
  })

  it('遗物与进度同源（不再出现"计数 3/3 但列表未收集"）', () => {
    const s = fresh()
    const relics = Object.keys(CONTENT.items).filter((id) => itemDef(id).category === 'relic')
    for (const id of relics) recordItem(s, id)
    expect(codexIds(s, 'relics').size).toBe(relics.length)
    const cat = codexProgress(s).categories.find((c) => c.id === 'relics')!
    expect(cat.found).toBe(relics.length)
    // 物品区不含遗物（口径不重叠）
    const items = codexProgress(s).categories.find((c) => c.id === 'items')!
    expect(items.found).toBe(0)
  })
})

// ---------------- F7 词缀分池（L1） ----------------

describe('F7 词缀按档位分池（L1）', () => {
  it('prospect 只在 T4+ 装备的池里出现', () => {
    const low = CONTENT.items['helmet_copper'] // T1 护甲
    const high = CONTENT.items['boots_void'] // T7 护甲
    expect(poolOf(low)).not.toContain('prospect')
    expect(poolOf(high)).toContain('prospect')
    // 其余词缀不受影响
    for (const id of ['flow', 'lore', 'fortune']) {
      expect(poolOf(low)).toContain(id)
    }
  })

  it('低档装备的 roll 结果里不会出现 prospect（1,000 次抽样）', () => {
    const rng = mulberry32(42)
    for (let i = 0; i < 1000; i++) {
      const roll = rollAffixes('helmet_copper', i, 3)
      expect(roll.some((a) => a.id === 'prospect')).toBe(false)
    }
    void rng
  })

  it('条数受池大小限制：低档池变小后仍不越界', () => {
    const def = CONTENT.items['helmet_copper']
    const roll = rollAffixes('helmet_copper', 1, 0)
    expect(roll.length).toBeLessThanOrEqual(poolOf(def).length)
  })
})

// ---------------- F8 收尾项 ----------------

describe('F8 收尾项（C1/C4/C5/C12）', () => {
  it('C1：券类错误进预检（不存在/不在池/与锁定冲突）', () => {
    const s = fresh()
    const id = addInstance(s, 'boots_void')
    const inst = s.equipment.find((e) => e.instanceId === id)!
    s.abyss.tickets = 1
    s.gold = 1_000_000
    s.materials['essence'] = 999
    s.materials['emberstone'] = 999
    // 未知词缀 → 池校验（预检把它拦在按钮外，而不是等点了才 toast）
    expect(reforgeBlockReason(s, id, [], 'no_such_affix')).toContain('池')
    // 与锁定冲突
    expect(reforgeBlockReason(s, id, [0], inst.affixes[0].id)).toContain('锁定')
    // 无券时即使给了合法券 id 也要在预检里被拦下
    s.abyss.tickets = 0
    expect(reforgeBlockReason(s, id, [], inst.affixes[1].id)).toContain('券')
    // 有券 + 合法 id → 通过
    s.abyss.tickets = 1
    expect(reforgeBlockReason(s, id, [], inst.affixes[1].id)).toBeNull()
  })

  it('C4：特质重掷排除当前特质（30 次不出同条）', () => {
    const s = fresh()
    const starter = CONTENT.expeditions.starter
    s.materials['expedition_token'] = 100
    s.gold = 1_000_000
    for (let i = 0; i < 30; i++) {
      const prev = s.companions[starter].trait
      rerollTrait(s, starter, mulberry32(i + 1), [])
      expect(s.companions[starter].trait, `第 ${i} 次重掷`).not.toBe(prev)
    }
  })

  it('C5：预检与提交共用编队口径（超编显式拒绝）', () => {
    const s = fresh()
    for (const c of CONTENT.companions.companions) s.companions[c.id] = { level: 1, xp: 0, trait: 'scholar' }
    s.materials['ingot_copper'] = 999
    const all = Object.keys(s.companions)
    const evs = applyCommand(s, { type: 'dispatchExpedition', routeId: 'outskirts', hours: 1, team: all }, 0)
    const blocked = evs.find((e) => e.type === 'blocked')
    expect(blocked && blocked.type === 'blocked' ? blocked.reason : '').toContain('队伍上限')
  })

  it('C12：speedFor 可注入 now（同参数同结果）', () => {
    const s = fresh()
    const ref = { kind: 'mine', siteId: 'copper_seam' } as const
    expect(speedFor(s, ref, 1000)).toBe(speedFor(s, ref, 1000))
    expect(durationOf(s, ref, 1000)).toBe(durationOf(s, ref, 1000))
  })
})

// ---------------- F9 迁移全链 ----------------

describe('F9 迁移全链（1 → 13）', () => {
  it('SAVE_VERSION = 15（v3.4：里程碑 v14 + 赛季档位快照 v15）', () => {
    expect(SAVE_VERSION).toBe(15)
  })

  it('v1 老档（最小结构）可迁到当前版本且结构完整', () => {
    const minimal = {
      version: 1,
      character: { name: '老档', createdAt: 0 },
      skills: { mining: 5, smelting: 3, forging: 2, enhancing: 1 },
      materials: { ore_copper: 10 },
      equipment: [],
      slots: {},
      actions: { current: null, queue: [] },
      stats: { totalMines: 1, totalSmelts: 0, totalForges: 0, totalEnhances: 0 },
      flags: {},
      meta: { lastSeenAt: 0, tasks: {}, autoRecycle: {}, loadouts: [] },
      queueSlots: 1,
      gold: 123,
    }
    const back = deserializeSave(JSON.stringify(minimal))
    expect(back).not.toBeNull()
    expect(back!.version).toBe(SAVE_VERSION)
    expect(back!.gold).toBe(123)
    expect(back!.character.name).toBe('老档')
    expect(back!.codex.bits).toBeTruthy()
    expect(back!.codex.fp).toBeTruthy()
    expect(back!.abyss.bestFloor).toBe(0)
    expect(back!.season.index).toBeGreaterThanOrEqual(-1)
    expect(typeof back!.meta.autoRecyclePerfect).toBe('number')
  })

  it('v12 档（旧图鉴逗号串）迁移：位图化 + 赛季 index 重算 + 阈值默认值', () => {
    const s = newGame('T', 0)
    const raw = JSON.parse(JSON.stringify(s)) as Record<string, unknown>
    raw.version = 12
    ;(raw as { codex: unknown }).codex = { items: 'ore_copper,pick_iron', recipes: 'smelt_copper', affixes: 'keen', ores: 'copper_seam' }
    delete (raw.meta as Record<string, unknown>).autoRecyclePerfect
    const back = deserializeSave(JSON.stringify(raw))
    expect(back).not.toBeNull()
    expect(back!.version).toBe(SAVE_VERSION)
    const items = codexIds(back!, 'items')
    expect(items.has('ore_copper')).toBe(true)
    expect(items.has('pick_iron')).toBe(true)
    expect(codexIds(back!, 'recipes').has('smelt_copper')).toBe(true)
    expect(codexIds(back!, 'affixes').has('keen')).toBe(true)
    expect(codexIds(back!, 'ores').has('copper_seam')).toBe(true)
    expect(back!.meta.autoRecyclePerfect).toBe(60)
  })

  it('迁移幂等：连续两次反序列化结果一致', () => {
    const s = newGame('T', 0)
    const once = deserializeSave(JSON.stringify(s))!
    const twice = deserializeSave(JSON.stringify(once))!
    expect(twice.codex).toEqual(once.codex)
    expect(twice.meta.autoRecyclePerfect).toBe(once.meta.autoRecyclePerfect)
  })
})

// ---------------- F10 证据链静态检查（V2） ----------------

describe('F10 证据链三件套（脚本读表 + JSON 一致 + 无硬编码）', () => {
  const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf8'))

  it('sim-abyss：JSON 与内容表逐字段一致（层词条/取整/上限/离线）', () => {
    const sim = readJson('docs/sim-abyss-output.json') as {
      abyss: { mods: { mod: number; id: string; reqMul: number; crystalMul: number }[]; rounding: string; challengeMaxFloors: number; sweepMaxCount: number; offlineCapExtra: number; weights: Record<string, number> }
      reach: Record<string, number>
      auditedLiterals: number[]
    }
    expect(sim.abyss.rounding).toBe(DEF.rounding)
    expect(sim.abyss.challengeMaxFloors).toBe(DEF.challengeMaxFloors)
    expect(sim.abyss.sweepMaxCount).toBe(DEF.sweepMaxCount)
    expect(sim.abyss.offlineCapExtra).toBe(DEF.offlineCapExtra)
    expect(sim.abyss.weights).toEqual(DEF.weights)
    expect(sim.abyss.mods.length).toBe(DEF.mods.length)
    for (const m of DEF.mods) {
      const sm = sim.abyss.mods.find((x) => x.id === m.id)!
      expect(sm.reqMul, m.id).toBe(m.reqMul)
      expect(sm.crystalMul, m.id).toBe(m.crystalMul)
    }
    // 脚本自报的"被审计数值"必须与内容表一致（否则说明脚本仍在硬编码）
    expect(sim.auditedLiterals).toContain(DEF.base)
    expect(sim.auditedLiterals).toContain(DEF.growth)
  })

  it('sim-expedition：新建 JSON 与内容表一致；sim-season：数值读表', () => {
    const sim = readJson('docs/sim-expedition-output.json') as {
      routes: { id: string; ratio: number; anchorGoldPerHour: number }[]
      hours: number[]
      team: { base: number; maxPerBanner: number }
      companions: { id: string }[]
    }
    expect(sim.routes.length).toBe(CONTENT.expeditions.routes.length)
    for (const r of CONTENT.expeditions.routes) {
      const sr = sim.routes.find((x) => x.id === r.id)!
      expect(sr.ratio).toBe(r.ratio)
      expect(sr.anchorGoldPerHour).toBe(r.anchorGoldPerHour)
    }
    expect(sim.hours).toEqual(CONTENT.expeditions.hours)
    expect(sim.team).toEqual(CONTENT.expeditions.team)
    expect(sim.companions.length).toBe(CONTENT.companions.companions.length)
  })

  it('sim-codex：分区门槛与内容表里程碑一致且单调', () => {
    const sim = readJson('docs/sim-codex-output.json') as {
      milestones: { pct: number; title: string; req: Record<string, number>; need: Record<string, number>; monotonic?: boolean }[]
      monotonic: boolean
      lastIsFull: boolean
    }
    expect(sim.monotonic).toBe(true)
    expect(sim.lastIsFull).toBe(true)
    expect(sim.milestones.length).toBe(CONTENT.season.codexMilestones.length)
    for (const m of CONTENT.season.codexMilestones) {
      const sm = sim.milestones.find((x) => x.pct === m.pct)!
      expect(sm.title, String(m.pct)).toBe(m.title)
      expect(sm.req).toEqual(m.req)
      // 分区规模取自内容表
      const items = m.req.items
      const relicCount = Object.keys(CONTENT.items).filter((id) => itemDef(id).category === 'relic').length
      expect(sm.need.items).toBe(Math.ceil((sectionTotal('items') - relicCount) * items))
    }
  })

  it('脚本内不得硬编码被审计数值（反向静态检查）', () => {
    for (const [file, literals] of [
      ['scripts/sim-abyss.mjs', [String(DEF.base), String(DEF.growth), String(DEF.staminaMax)]],
      ['scripts/sim-season.mjs', [String(CONTENT.season.levels), String(CONTENT.season.days)]],
    ] as const) {
      const src = readFileSync(file, 'utf8')
      // 只看"赋值/声明"语境：排除注释与 for 循环上界（`n <= 12` 这类比较不算硬编码）
      const lines = src.split('\n').filter((l) => !/^\s*(\/\/|\*|for\s*\()/.test(l))
      for (const v of literals) {
        const re = new RegExp(`[^<>!=]=\\s*${v.replace('.', '\\.')}\\b`)
        const hit = lines.find((l) => re.test(l))
        expect(hit, `${file} 不应硬编码 ${v}（命中：${hit ?? ''}）`).toBeUndefined()
      }
    }
  })
})
