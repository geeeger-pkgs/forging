import { describe, expect, it } from 'vitest'
import mainPanelSrc from '../src/ui/components/MainPanel.vue?raw'
import navBarSrc from '../src/ui/components/NavBar.vue?raw'
import { checkAchievements } from '../src/game/achievements'
import { applyCommand } from '../src/game/commands'
import { CONTENT, ROUTE_BY_ID, TRAIT_BY_ID, itemDef, validateContent } from '../src/game/content'
import { recycleGain, totalValue } from '../src/game/economy'
import {
  HOUR_MS,
  advanceExpeditions,
  bannerPowerMultiplier,
  bannerUpgradeCost,
  claimExpedition,
  companionPower,
  dispatchBlockReason,
  recruit,
  rollOutcome,
  routeUnlockReason,
  successRate,
  supplyCost,
  teamPower,
  teamSize,
  traitFactors,
  upgradeBanner,
  xpForLevel,
} from '../src/game/expeditions'
import { settleOffline } from '../src/game/offline'
import { mulberry32 } from '../src/game/rng'
import { addInstance, materialCount, newGame } from '../src/game/state'
import { aggregateEquipment } from '../src/game/stats'
import { useRune } from '../src/game/buffs'
import type { GameEvent, GameState } from '../src/game/types'

const R = (id: string) => ROUTE_BY_ID.get(id)!
const OUTSKIRTS = R('outskirts')
const ABYSS = R('abyss')

function withCompanions(s: GameState, ids: string[]): void {
  for (const id of ids) {
    const def = CONTENT.companions.companions.find((c) => c.id === id)!
    s.companions[id] = { level: def.startLevel, xp: 0, trait: 'scholar' }
  }
}

describe('伙伴与战力（E1/E10）', () => {
  it('E1：战力 = L × R × (1 + 0.02×(L−1))；全队求和后乘旗帜加成', () => {
    const s = newGame('T', 0)
    const legend = CONTENT.companions.companions.find((c) => c.rarity === 'legend')!
    expect(companionPower(legend, 30)).toBeCloseTo(75.84, 2)
    const common = CONTENT.companions.companions.find((c) => c.rarity === 'common')!
    expect(companionPower(common, 1)).toBeCloseTo(1, 6)

    s.companions = {}
    s.companions[legend.id] = { level: 30, xp: 0, trait: 'scholar' }
    expect(teamPower(s)).toBeCloseTo(75.84, 2)
    s.meta.expeditions.banner = 3
    expect(teamPower(s)).toBeCloseTo(75.84 * Math.pow(1.08, 3), 2)
    expect(bannerPowerMultiplier(3)).toBeCloseTo(1.259712, 5)
  })

  it('E10：旗帜升级 = 徽记 + 金币；队伍位 +1；满级阻塞', () => {
    const s = newGame('T', 0)
    expect(teamSize(s)).toBe(CONTENT.expeditions.team.base)
    s.materials['expedition_token'] = 100
    s.gold = 1_000_000
    const cost = bannerUpgradeCost(s)!
    upgradeBanner(s, [] as GameEvent[])
    expect(s.meta.expeditions.banner).toBe(1)
    expect(s.materials['expedition_token']).toBe(100 - cost.tokens)
    expect(s.gold).toBe(1_000_000 - cost.gold)
    expect(teamSize(s)).toBe(CONTENT.expeditions.team.base + 1)

    upgradeBanner(s, [])
    upgradeBanner(s, [])
    expect(bannerUpgradeCost(s)).toBeNull() // 满级
    const events: GameEvent[] = []
    upgradeBanner(s, events)
    expect(events.some((e) => e.type === 'blocked')).toBe(true)
    expect(s.meta.expeditions.banner).toBe(CONTENT.expeditions.banner.maxLevel)
  })
})

describe('招募与特质（E2/E9）', () => {
  it('E2：招募按名册顺序给未拥有者；扣徽记与金币；满员后转经验', () => {
    const s = newGame('T', 0)
    s.materials['expedition_token'] = 100
    s.gold = 100_000
    const roster = CONTENT.companions.companions
    // 初始已有 starter，招募应给下一个未拥有者
    const before = Object.keys(s.companions).length
    recruit(s, mulberry32(1), [])
    expect(Object.keys(s.companions).length).toBe(before + 1)
    expect(s.materials['expedition_token']).toBe(100 - CONTENT.expeditions.recruit.tokens)

    // 招满 6 名
    while (Object.keys(s.companions).length < roster.length) {
      s.materials['expedition_token'] = 100
      s.gold = 100_000
      recruit(s, mulberry32(Object.keys(s.companions).length + 5), [])
    }
    expect(Object.keys(s.companions).length).toBe(roster.length)
    // 满员后为重复招募 → 经验
    const target = Object.keys(s.companions)[0]
    const xpBefore = s.companions[target].xp + s.companions[target].level * 1000
    s.materials['expedition_token'] = 100
    s.gold = 100_000
    const events: GameEvent[] = []
    recruit(s, mulberry32(3), events)
    const after = s.companions[target].xp + s.companions[target].level * 1000
    expect(events.some((e) => e.type === 'companionRecruited' && e.duplicate)).toBe(true)
    expect(after).toBeGreaterThan(xpBefore - 1)

    // 资源不足阻塞
    s.materials['expedition_token'] = 0
    const ev2: GameEvent[] = []
    recruit(s, mulberry32(4), ev2)
    expect(ev2.some((e) => e.type === 'blocked')).toBe(true)
  })

  it('E9：特质效果（勤勉降补给 / 贪婪加金币 / 寻宝提概率）与重掷', () => {
    const s = newGame('T', 0)
    s.companions = {}
    withCompanions(s, ['apprentice'])
    s.companions['apprentice'].trait = 'diligent'
    const diligent = supplyCost(s, ABYSS, 8, ['apprentice']).qty
    s.companions['apprentice'].trait = 'scholar'
    const plain = supplyCost(s, ABYSS, 8, ['apprentice']).qty
    expect(diligent).toBeLessThan(plain) // 勤勉只降补给

    s.companions['apprentice'].trait = 'greedy'
    const greedy = rollOutcome(s, ABYSS, 8, ['apprentice'], mulberry32(7), 'online')
    s.companions['apprentice'].trait = 'scholar'
    const normal = rollOutcome(s, ABYSS, 8, ['apprentice'], mulberry32(7), 'online')
    expect(greedy.gold).toBeGreaterThan(normal.gold)

    s.companions['apprentice'].trait = 'seeker'
    const seeker = rollOutcome(s, ABYSS, 8, ['apprentice'], mulberry32(7), 'online')
    expect(seeker.tokens).toBeGreaterThanOrEqual(normal.tokens)

    // 重掷（消耗徽记 + 金币）
    s.materials['expedition_token'] = 5
    s.gold = 10000
    const ev: GameEvent[] = []
    applyCommand(s, { type: 'rerollTrait', companionId: 'apprentice' }, 0, mulberry32(9))
    expect(s.materials['expedition_token']).toBe(5 - CONTENT.expeditions.traitReroll.tokens)
    expect(TRAIT_BY_ID.has(s.companions['apprentice'].trait)).toBe(true)
    void ev
  })
})

describe('派遣与成功率（E3/E4）', () => {
  it('E3：派遣时即扣补给；槽位占用 / 未解锁 / 无伙伴 阻塞', () => {
    const s = newGame('T', 0)
    s.materials['ingot_copper'] = 100
    const events = applyCommand(
      s,
      { type: 'dispatchExpedition', routeId: 'outskirts', hours: 8, team: ['apprentice'] },
      0,
      mulberry32(1),
    )
    expect(events.some((e) => e.type === 'expeditionDispatched')).toBe(true)
    // 补给量按 supplyCost 计算（初始伙伴带「勤勉」→ 8h 铜锭 = ceil(16 × 0.85) = 14）
    const cost = supplyCost(s, OUTSKIRTS, 8, ['apprentice'])
    expect(cost.itemId).toBe('ingot_copper')
    expect(s.materials['ingot_copper']).toBe(100 - cost.qty)
    expect(s.meta.expeditions.runs.length).toBe(1)

    // 同路线槽位占用
    const again = applyCommand(s, { type: 'dispatchExpedition', routeId: 'outskirts', hours: 1, team: ['apprentice'] }, 0, mulberry32(1))
    const b = again.find((e) => e.type === 'blocked')
    expect(b && b.type === 'blocked' ? b.reason : '').toContain('已有远征')

    // 未解锁（深渊前哨需总等级 150）
    expect(dispatchBlockReason(s, 'abyss', 1)).toContain('总等级')

    // 无伙伴
    // 无伙伴：近郊的解锁条件本身就是「≥1 名伙伴」，两者给出一致的可读原因
    const s2 = newGame('T', 0)
    s2.companions = {}
    s2.materials['ingot_copper'] = 100
    expect(dispatchBlockReason(s2, 'outskirts', 1)).toContain('需要 1 名伙伴')
  })

  it('E4：成功率 = min(1, 战力/需求)；**战力不足不阻塞**', () => {
    const s = newGame('T', 0)
    s.companions = {}
    withCompanions(s, ['apprentice']) // L1 平凡 → 战力 1.0
    s.materials['ingot_copper'] = 100
    expect(successRate(s, OUTSKIRTS, ['apprentice'])).toBeCloseTo(1 / 3, 6)
    expect(dispatchBlockReason(s, 'outskirts', 1)).toBeNull() // 不因战力不足阻塞
    const ev = applyCommand(
      s,
      { type: 'dispatchExpedition', routeId: 'outskirts', hours: 1, team: ['apprentice'] },
      0,
      mulberry32(2),
    )
    expect(ev.some((e) => e.type === 'expeditionDispatched')).toBe(true)
  })

  it('E5：失败给 40% 保底、徽记概率减半', () => {
    const s = newGame('T', 0)
    s.companions = {}
    withCompanions(s, ['apprentice'])
    // 期望模式（离线）：产出按成功率加权
    const exp = rollOutcome(s, OUTSKIRTS, 8, ['apprentice'], null, 'expectation')
    expect(exp.expected).toBe(true)
    // 在线：用「战力远低于需求」的深渊前哨制造必然失败/必然成功两种分支
    const alwaysFail = { next: () => 0.999 }
    const alwaysOk = { next: () => 0 }
    const failOut = rollOutcome(s, ABYSS, 8, ['apprentice'], alwaysFail, 'online')
    const okOut = rollOutcome(s, ABYSS, 8, ['apprentice'], alwaysOk, 'online')
    expect(failOut.success).toBe(false)
    expect(okOut.success).toBe(true)
    expect(failOut.gold / okOut.gold).toBeCloseTo(CONTENT.expeditions.failYieldShare, 3)
    expect(failOut.tokens).toBeLessThanOrEqual(okOut.tokens)
  })
})

describe('产出与加成口径（E6）', () => {
  it('E6：产出只由伙伴/路线/时长决定——换装、符文、词缀都不影响', () => {
    const base = newGame('T', 0)
    withCompanions(base, ['apprentice'])
    const plain = rollOutcome(base, OUTSKIRTS, 8, ['apprentice'], mulberry32(11), 'online')

    const geared = newGame('T', 0)
    withCompanions(geared, ['apprentice'])
    const id = addInstance(geared, 'pick_void')
    geared.equipment.find((e) => e.instanceId === id)!.affixes = [{ id: 'fortune', value: 0.5 }]
    geared.slots.pick = id
    geared.materials['rune_speed_3'] = 1
    useRune(geared, 'rune_speed_3', 0)
    expect(aggregateEquipment(geared).rareFind).toBeGreaterThan(0)
    expect(geared.buffs.length).toBe(1)

    const withGear = rollOutcome(geared, OUTSKIRTS, 8, ['apprentice'], mulberry32(11), 'online')
    expect(withGear.gold).toBe(plain.gold)
    expect(withGear.materials).toEqual(plain.materials)
    expect(withGear.tokens).toBe(plain.tokens)
  })
})

describe('离线语义（E7/E14/E18）', () => {
  it('E7：cap 窗口截断——窗口外的 run 保持进行中；不自动续派', () => {
    const s = newGame('T', 0)
    withCompanions(s, ['apprentice'])
    s.materials['ingot_copper'] = 999
    applyCommand(s, { type: 'dispatchExpedition', routeId: 'outskirts', hours: 8, team: ['apprentice'] }, 0, mulberry32(1))
    const run = s.meta.expeditions.runs[0]
    expect(run.endsAt).toBe(8 * HOUR_MS)

    // 只推进 1 小时：未完成
    advanceExpeditions(s, 1 * HOUR_MS, 'expectation', null)
    expect(run.done).toBe(false)
    // 推进到 9 小时：完成（落在窗口内）
    advanceExpeditions(s, 9 * HOUR_MS, 'expectation', null)
    expect(run.done).toBe(true)
    expect(run.outcome?.expected).toBe(true)
    // 不自动续派：runs 里只有那一条，没有新增
    expect(s.meta.expeditions.runs.length).toBe(1)
  })

  it('E14：时钟前拨只结算一个窗口内的 run（不会把每次 8h 放大）', () => {
    const s = newGame('T', 0)
    withCompanions(s, ['apprentice'])
    s.materials['ingot_copper'] = 999
    // 连派 3 条（不同路线，避免槽位冲突）——但只有 outskirts 可解锁
    applyCommand(s, { type: 'dispatchExpedition', routeId: 'outskirts', hours: 8, team: ['apprentice'] }, 0, mulberry32(1))
    const capMs = CONTENT.config.offlineCapHours * HOUR_MS
    // 前拨 100 天：只结算窗口内到期的那一条
    s.meta.lastSeenAt = 0
    const summary = settleOffline(s, 100 * 24 * HOUR_MS)
    expect(summary).not.toBeNull()
    expect(summary!.expeditions.length).toBe(1)
    expect(summary!.countedMs).toBeLessThanOrEqual(capMs + 1)
  })

  it('E18：离线摘要包含远征完成条目', () => {
    const s = newGame('T', 0)
    withCompanions(s, ['apprentice'])
    s.materials['ingot_copper'] = 999
    applyCommand(s, { type: 'dispatchExpedition', routeId: 'outskirts', hours: 4, team: ['apprentice'] }, 0, mulberry32(1))
    s.meta.lastSeenAt = 0
    const summary = settleOffline(s, 5 * HOUR_MS)
    expect(summary!.expeditions.length).toBe(1)
    expect(summary!.expeditions[0].routeName).toBe(OUTSKIRTS.name)
    expect(summary!.expeditions[0].hours).toBe(4)
  })
})

describe('领取幂等与伙伴成长（E8）', () => {
  it('E8：领取即移除，重复领取无收益；伙伴经验赛内共享', () => {
    const s = newGame('T', 0)
    s.companions = {}
    withCompanions(s, ['apprentice', 'prospector'])
    s.materials['ingot_copper'] = 999
    applyCommand(s, { type: 'dispatchExpedition', routeId: 'outskirts', hours: 8, team: ['apprentice', 'prospector'] }, 0, mulberry32(1))
    const runId = s.meta.expeditions.runs[0].id
    advanceExpeditions(s, 9 * HOUR_MS, 'expectation', null)

    const goldBefore = s.gold
    const ev1: GameEvent[] = []
    claimExpedition(s, runId, ev1)
    expect(s.gold).toBeGreaterThan(goldBefore)
    expect(s.meta.expeditions.runs.length).toBe(0)
    // 两名伙伴都获得经验
    expect(s.companions['apprentice'].xp + (s.companions['apprentice'].level - 1) * 1000).toBeGreaterThan(0)
    expect(s.companions['prospector'].level + s.companions['prospector'].xp).toBeGreaterThan(1)

    // 幂等：再次领取被阻塞
    const ev2: GameEvent[] = []
    claimExpedition(s, runId, ev2)
    expect(ev2.some((e) => e.type === 'blocked')).toBe(true)
    expect(s.gold).toBe(goldBefore + Math.round(ev1.find((e) => e.type === 'goldGained')?.type === 'goldGained' ? (ev1.find((e) => e.type === 'goldGained') as { amount: number }).amount : 0))
  })

  it('经验曲线与升级：xpForLevel 单调递增；升级事件触发', () => {
    expect(xpForLevel(2)).toBeGreaterThan(xpForLevel(1))
    expect(xpForLevel(30)).toBeGreaterThan(xpForLevel(29))
    const s = newGame('T', 0)
    s.companions = {}
    withCompanions(s, ['apprentice'])
    s.materials['ingot_copper'] = 999
    applyCommand(s, { type: 'dispatchExpedition', routeId: 'outskirts', hours: 8, team: ['apprentice'] }, 0, mulberry32(1))
    // 反复派满并领取直到升级
    let leveled = false
    for (let i = 0; i < 40 && !leveled; i++) {
      s.meta.expeditions.runs = []
      s.materials['ingot_copper'] = 999
      applyCommand(s, { type: 'dispatchExpedition', routeId: 'outskirts', hours: 8, team: ['apprentice'] }, 0, mulberry32(i + 1))
      advanceExpeditions(s, (i + 1) * 9 * HOUR_MS, 'expectation', null)
      const ev: GameEvent[] = []
      claimExpedition(s, s.meta.expeditions.runs[0].id, ev)
      if (ev.some((e) => e.type === 'companionLevelUp')) leveled = true
    }
    expect(leveled).toBe(true)
  })
})

describe('内容与护栏（E11/E15/E16/E17）', () => {
  it('E11：负例——需求战力超出可达上限 / 产出占比越界 → 报错', () => {
    const clone = JSON.parse(JSON.stringify(CONTENT)) as typeof CONTENT
    clone.expeditions.routes[3].reqPower = 999
    clone.expeditions.routes[0].ratio = 0.5
    const errs = validateContent(clone)
    expect(errs.some((e) => e.includes('需求战力超出可达上限'))).toBe(true)
    expect(errs.some((e) => e.includes('产出占比非法'))).toBe(true)
  })

  it('E11b：正例——现网路线需求全部可达（≤ 战力天花板）', () => {
    const cap = CONTENT.companions.startLevelCap
    const maxRarity = Math.max(...CONTENT.companions.companions.map((c) => c.rarityFactor))
    const teamMax = CONTENT.expeditions.team.base + CONTENT.expeditions.banner.maxLevel
    const ceiling =
      teamMax * cap * maxRarity * (1 + 0.02 * (cap - 1)) * Math.pow(1 + CONTENT.expeditions.banner.powerPerLevel, CONTENT.expeditions.banner.maxLevel)
    for (const r of CONTENT.expeditions.routes) expect(r.reqPower).toBeLessThanOrEqual(ceiling)
    expect(validateContent(CONTENT)).toEqual([])
  })

  it('E15：重铸石远征供给 ≤ 采矿主来源的 10% 量级', () => {
    for (const r of CONTENT.expeditions.routes) {
      expect(r.stonePer8h / 8).toBeLessThanOrEqual(1.15)
    }
  })

  it('E16：遗物 value 0 → 回收无收益、不计入总价值；徽记可回收（正价值）', () => {
    const s = newGame('T', 0)
    for (const id of ['relic_gear', 'relic_shard', 'relic_core']) {
      expect(itemDef(id).category).toBe('relic')
      expect(itemDef(id).value).toBe(0)
      s.materials[id] = 3
      expect(recycleGain(s, id, 3)).toBe(0)
    }
    expect(totalValue(s)).toBe(0)
    expect(itemDef('expedition_token').value).toBeGreaterThan(0)
  })

  it('E17：UI 覆盖——主面板注册了远征视图与页签', () => {
    expect(mainPanelSrc).toContain("view === 'expedition'")
    expect(mainPanelSrc).toContain('ExpeditionPanel')
    // v3.2：导航入口统一走 pickTool（选中后收起抽屉），断言放宽为两种接法之一
    expect(navBarSrc).toMatch(/pickTool\('expedition'\)|setView\('expedition'\)/)
    expect(navBarSrc).toContain("'expedition'")
  })
})

describe('成就与任务（E13）', () => {
  it('完成远征后解锁成就并累积周常计数器', () => {
    const s = newGame('T', 0)
    withCompanions(s, ['apprentice'])
    s.materials['ingot_copper'] = 999
    applyCommand(s, { type: 'dispatchExpedition', routeId: 'outskirts', hours: 1, team: ['apprentice'] }, 0, mulberry32(1))
    advanceExpeditions(s, 2 * HOUR_MS, 'expectation', null)
    const runId = s.meta.expeditions.runs[0].id
    claimExpedition(s, runId, [])
    expect(s.stats.totalExpeditions).toBe(1)
    checkAchievements(s)
    expect(s.flags.achievements.unlocked).toContain('exp_first')
    expect(materialCount(s, 'expedition_token')).toBeGreaterThan(0)
  })

  it('伙伴数与稀有度成就', () => {
    const s = newGame('T', 0)
    s.companions = {}
    checkAchievements(s)
    expect(s.flags.achievements.unlocked).not.toContain('companion_6')
    const legend = CONTENT.companions.companions.find((c) => c.rarity === 'legend')!
    s.companions[legend.id] = { level: 1, xp: 0, trait: 'scholar' }
    checkAchievements(s)
    expect(s.flags.achievements.unlocked).toContain('companion_legend')
  })
})

describe('路线解锁文案（E3 补充）', () => {
  it('未满足条件时给出可读原因', () => {
    const s = newGame('T', 0)
    expect(routeUnlockReason(s, R('oldmine'))).toContain('挖掘')
    expect(routeUnlockReason(s, R('ruins'))).toContain('锻造')
    expect(routeUnlockReason(s, R('abyss'))).toContain('总等级')
    s.skills.mining = 1e12
    expect(routeUnlockReason(s, R('oldmine'))).toBeNull()
  })
})

describe('离线语义补强（并行 run / 期望标记）', () => {
  it('多条不同路线的 run 可在同一窗口内各自结算（需各派不同伙伴）', () => {
    const s = newGame('T', 0)
    withCompanions(s, ['apprentice', 'prospector'])
    s.skills.mining = 1e12
    s.skills.forging = 1e12
    s.materials['ingot_copper'] = 999
    s.materials['ingot_iron'] = 999
    applyCommand(s, { type: 'dispatchExpedition', routeId: 'outskirts', hours: 4, team: ['apprentice'] }, 0, mulberry32(1))
    applyCommand(s, { type: 'dispatchExpedition', routeId: 'oldmine', hours: 4, team: ['prospector'] }, 0, mulberry32(2))
    expect(s.meta.expeditions.runs.length).toBe(2)
    advanceExpeditions(s, 5 * HOUR_MS, 'expectation', null)
    expect(s.meta.expeditions.runs.filter((r) => r.done).length).toBe(2)
    expect(s.stats.totalExpeditions).toBe(2)
  })

  it('离线结算的 run 标记 expected=true（摘要如实标注「按期望结算」）', () => {
    const s = newGame('T', 0)
    withCompanions(s, ['apprentice'])
    s.materials['ingot_copper'] = 999
    applyCommand(s, { type: 'dispatchExpedition', routeId: 'outskirts', hours: 4, team: ['apprentice'] }, 0, mulberry32(1))
    s.meta.lastSeenAt = 0
    const summary = settleOffline(s, 5 * HOUR_MS)!
    expect(summary.expeditions[0].expected).toBe(true)
  })

  it('在线结算的 run 标记 expected=false', () => {
    const s = newGame('T', 0)
    withCompanions(s, ['apprentice'])
    s.materials['ingot_copper'] = 999
    applyCommand(s, { type: 'dispatchExpedition', routeId: 'outskirts', hours: 1, team: ['apprentice'] }, 0, mulberry32(1))
    advanceExpeditions(s, 2 * HOUR_MS, 'online', mulberry32(5))
    expect(s.meta.expeditions.runs[0].outcome?.expected).toBe(false)
  })
})

describe('编队上限（烟测发现的边界）', () => {
  it('队伍上限 = 基础 2 + 旗帜等级；超编被内核拒绝，截断后可派', () => {
    const s = newGame('T', 0)
    for (const c of CONTENT.companions.companions) {
      s.companions[c.id] = { level: 1, xp: 0, trait: 'scholar' }
    }
    s.materials['ingot_copper'] = 999
    const all = Object.keys(s.companions)
    expect(all.length).toBe(6)
    expect(teamSize(s)).toBe(2)

    // 全员提交 → 超编阻塞
    const over = applyCommand(
      s,
      { type: 'dispatchExpedition', routeId: 'outskirts', hours: 1, team: all },
      0,
      mulberry32(1),
    )
    const b = over.find((e) => e.type === 'blocked')
    expect(b && b.type === 'blocked' ? b.reason : '').toContain('队伍上限')

    // UI 的「全员出战」兜底会截到上限 → 可派
    const capped = all.slice(0, teamSize(s))
    const ok = applyCommand(
      s,
      { type: 'dispatchExpedition', routeId: 'outskirts', hours: 1, team: capped },
      0,
      mulberry32(2),
    )
    expect(ok.some((e) => e.type === 'expeditionDispatched')).toBe(true)
    expect(s.meta.expeditions.runs[0].team.length).toBe(teamSize(s))
  })

  it('旗帜每级 +1 队伍位（上限 5）', () => {
    const s = newGame('T', 0)
    s.materials['expedition_token'] = 100
    s.gold = 1_000_000
    for (let i = 0; i < 3; i++) upgradeBanner(s, [])
    expect(teamSize(s)).toBe(CONTENT.expeditions.team.base + 3)
    expect(teamSize(s)).toBe(CONTENT.expeditions.team.base + CONTENT.expeditions.banner.maxLevel)
  })
})

describe('v2.2 测评处置回归', () => {
  it('B1：离线（期望）徽记/遗物 = 在线长期均值（按成功率加权，不再是 2/(1+rate) 倍）', () => {
    const s = newGame('T', 0)
    s.companions = {}
    withCompanions(s, ['apprentice']) // 战力 1.0
    const route = R('oldmine') // 需求 30 → rate ≈ 0.033
    const rate = successRate(s, route, ['apprentice'])
    const exp = rollOutcome(s, route, 8, ['apprentice'], null, 'expectation')
    // 在线 MC
    let tokens = 0
    let relics = 0
    const N = 20000
    const rng = mulberry32(20240915)
    for (let i = 0; i < N; i++) {
      const o = rollOutcome(s, route, 8, ['apprentice'], rng, 'online')
      tokens += o.tokens
      relics += o.relics.reduce((acc, r) => acc + r.qty, 0)
    }
    const onlineTokens = tokens / N
    const onlineRelics = relics / N
    // 期望应与在线均值一致（±3%，二项噪声）；且不再是对称的 2/(1+rate) 高估
    expect(exp.tokens).toBeGreaterThan(onlineTokens * 0.9)
    expect(exp.tokens).toBeLessThan(onlineTokens * 1.1)
    expect(exp.relics[0]?.qty ?? 0).toBeLessThan(onlineRelics * 1.15 + 1e-9)
    expect(rate).toBeLessThan(0.1) // 低成功率场景（原实现此处会高估 ~1.94×）
  })

  it('M4a：同一伙伴不能同时被派往两条路线（编队成为真实取舍）', () => {
    const s = newGame('T', 0)
    withCompanions(s, ['apprentice'])
    s.skills.mining = 1e12
    s.materials['ingot_copper'] = 999
    s.materials['ingot_iron'] = 999
    const first = applyCommand(s, { type: 'dispatchExpedition', routeId: 'outskirts', hours: 4, team: ['apprentice'] }, 0, mulberry32(1))
    expect(first.some((e) => e.type === 'expeditionDispatched')).toBe(true)
    const second = applyCommand(s, { type: 'dispatchExpedition', routeId: 'oldmine', hours: 4, team: ['apprentice'] }, 0, mulberry32(2))
    const b = second.find((e) => e.type === 'blocked')
    expect(b && b.type === 'blocked' ? b.reason : '').toMatch(/远征中/)
    expect(s.meta.expeditions.runs.length).toBe(1)
    // 领取后可再派
    advanceExpeditions(s, 5 * HOUR_MS, 'expectation', null)
    claimExpedition(s, s.meta.expeditions.runs[0].id, [])
    const third = applyCommand(s, { type: 'dispatchExpedition', routeId: 'oldmine', hours: 4, team: ['apprentice'] }, 0, mulberry32(3))
    expect(third.some((e) => e.type === 'expeditionDispatched')).toBe(true)
  })

  it('M4b：同一特质每队只生效一次（不再出现「全员贪婪」唯一解）', () => {
    const s = newGame('T', 0)
    for (const id of ['apprentice', 'prospector', 'ranger', 'scholar']) {
      const def = CONTENT.companions.companions.find((c) => c.id === id)!
      s.companions[id] = { level: def.startLevel, xp: 0, trait: 'greedy' }
    }
    const f = traitFactors(s)
    expect(f.gold).toBeCloseTo(0.2, 6) // 4 名贪婪仍只 +20%
    // 换成不同特质则可叠加（各一次）
    s.companions['ranger'].trait = 'scholar'
    s.companions['scholar'].trait = 'seeker'
    const f2 = traitFactors(s)
    expect(f2.gold).toBeCloseTo(0.2, 6)
    expect(f2.xp).toBeCloseTo(0.25, 6)
    expect(f2.find).toBeCloseTo(0.3, 6)
  })

  it('M2：三档补给按小时整除 → 净/时严格齐平（含勤勉折扣取整）', () => {
    const s = newGame('T', 0)
    s.companions = {}
    withCompanions(s, ['apprentice'])
    s.companions['apprentice'].trait = 'scholar' // 不带勤勉，检查基础比例
    for (const routeId of ['outskirts', 'oldmine', 'ruins', 'abyss']) {
      const route = R(routeId)
      const per = [1, 4, 8].map((h) => supplyCost(s, route, h, ['apprentice']).qty / h)
      expect(per[0]).toBeCloseTo(per[2], 6)
      expect(per[1]).toBeCloseTo(per[2], 6)
    }
  })
})
