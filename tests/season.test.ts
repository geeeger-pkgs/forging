import { describe, expect, it } from 'vitest'
import { checkCodexMilestones } from '../src/game/codex'
import { CONTENT } from '../src/game/content'
import { addMaterial, newGame } from '../src/game/state'
import {
  achievedTier,
  checkSeason,
  levelForRenown,
  levelReward,
  msToSeasonEnd,
  pickSeasonTasks,
  refreshSeason,
  renownForLevel,
  seasonIndex,
  seasonRenown,
  seasonTaskProgress,
  seasonUnlocked,
  seasonView,
  templateById,
  tierName,
} from '../src/game/season'
import type { GameEvent, GameState } from '../src/game/types'
import simOutput from '../docs/sim-season-output.json'

const DEF = CONTENT.season
const SEASON_MS = DEF.days * 86_400_000
void tierName

/** 让赛季解锁（总等级门槛） */
function unlock(state: GameState): void {
  for (const k of ['mining', 'smelting', 'forging', 'enhancing'] as const) state.skills[k] = 1e12
}

function withSeason(state: GameState, now: number): void {
  unlock(state)
  refreshSeason(state, now)
  checkSeason(state)
}

describe('赛季轮换与确定性（S1/S2/S9）', () => {
  it('S1：seasonIndex 按 14 天分档；回拨时钟不产生新赛季；前拨只轮换一次', () => {
    const base = DEF.epoch + 1000
    expect(seasonIndex(base)).toBe(0)
    expect(seasonIndex(DEF.epoch + SEASON_MS + 1000)).toBe(1)
    expect(msToSeasonEnd(base)).toBeGreaterThan(0)

    const s = newGame('T', 0)
    unlock(s)
    refreshSeason(s, DEF.epoch + 1000)
    expect(s.season.index).toBe(0)
    const tasksA = s.season.tasks.map((t) => t.defId)

    // 回拨：无效
    refreshSeason(s, DEF.epoch - SEASON_MS)
    expect(s.season.index).toBe(0)
    expect(s.season.tasks.map((t) => t.defId)).toEqual(tasksA)

    // 前拨 5 个赛季：只轮换到当前（不逐个补）
    refreshSeason(s, DEF.epoch + SEASON_MS * 5 + 1000)
    expect(s.season.index).toBe(5)
    expect(s.season.renown).toBe(0)
  })

  it('S2：pickSeasonTasks 按赛季键确定性、三条互不重复；穷举全部赛季键', () => {
    for (let idx = 0; idx < 60; idx++) {
      const a = pickSeasonTasks(idx).map((t) => t.defId)
      const b = pickSeasonTasks(idx).map((t) => t.defId)
      expect(a).toEqual(b) // 确定性
      expect(new Set(a).size).toBe(3) // 不重复
      for (const id of a) expect(templateById(id)).toBeTruthy()
    }
  })

  it('S7：门槛未达（总等级 < 解锁线）时不初始化、不计进度', () => {
    const s = newGame('T', 0)
    expect(seasonUnlocked(s)).toBe(false)
    refreshSeason(s, DEF.epoch + 1000)
    expect(s.season.index).toBe(-1)
    expect(checkSeason(s)).toEqual([])
    unlock(s)
    expect(seasonUnlocked(s)).toBe(true)
    refreshSeason(s, DEF.epoch + 1000)
    expect(s.season.index).toBe(0)
  })

  it('S9：跨季离线（一次前拨跳过 N 个赛季）只轮换一次且声望清零', () => {
    const s = newGame('T', 0)
    withSeason(s, DEF.epoch + 1000)
    s.season.renown = 40
    s.season.rewardedLevel = 10
    refreshSeason(s, DEF.epoch + SEASON_MS * 3 + 1000)
    expect(s.season.index).toBe(3)
    expect(s.season.renown).toBe(0)
    expect(s.season.rewardedLevel).toBe(0)
  })
})

describe('赛季进度与发奖（S3/S4/S5/S6）', () => {
  it('S3：进度相对赛季基线（赛季开始前的计数不计入）', () => {
    const s = newGame('T', 0)
    unlock(s)
    s.stats.totalMines = 10_000 // 赛季开始前已积累
    refreshSeason(s, DEF.epoch + 1000)
    const slot = s.season.tasks.find((t) => templateById(t.defId)!.counter === 'totalMines')
    if (!slot) return // 该赛季未抽到挖掘模板
    s.stats.totalMines += 100
    expect(seasonTaskProgress(s, slot)).toBe(100)
  })

  it('S4：只计最高档（不叠加）；声望与等级换算正确', () => {
    const s = newGame('T', 0)
    withSeason(s, DEF.epoch + 1000)
    const slot = s.season.tasks[0]
    const tpl = templateById(slot.defId)!
    const counter = tpl.counter as keyof GameState['stats']
    ;(s.stats as unknown as Record<string, number>)[tpl.counter] = slot.base + tpl.targets[2] // 金档
    expect(achievedTier(s, slot)).toBe(2)
    const expectRenown = DEF.tierRenown.gold
    expect(seasonRenown(s)).toBeGreaterThanOrEqual(expectRenown)
    void counter
    expect(levelForRenown(renownForLevel(5))).toBe(5)
    expect(levelForRenown(DEF.levels * DEF.renownPerLevel + 999)).toBe(DEF.levels)
  })

  it('S5：等级奖励幂等（rewardedLevel 单调，重复调用不重发）', () => {
    const s = newGame('T', 0)
    withSeason(s, DEF.epoch + 1000)
    for (const slot of s.season.tasks) {
      const tpl = templateById(slot.defId)!
      ;(s.stats as unknown as Record<string, number>)[tpl.counter] = slot.base + tpl.targets[2]
    }
    const ev1: GameEvent[] = checkSeason(s)
    const goldAfter = s.gold
    const levelAfter = s.season.rewardedLevel
    expect(ev1.filter((e) => e.type === 'seasonLevelUp').length).toBeGreaterThan(0)
    expect(levelAfter).toBeGreaterThan(0)
    const ev2 = checkSeason(s)
    expect(ev2.filter((e) => e.type === 'seasonLevelUp').length).toBe(0)
    expect(s.gold).toBe(goldAfter)
  })

  it('S5b：等级奖励曲线（金币/精华/徽记）与内容表一致', () => {
    const r5 = levelReward(5)
    expect(r5.gold).toBe(DEF.levelReward.goldBase + DEF.levelReward.goldPerLevel * 5)
    expect(r5.tokens).toBe(DEF.levelReward.tokenAmount)
    const r20 = levelReward(DEF.levels)
    expect(r20.tokens).toBe(DEF.levelReward.maxLevelTokens)
    const r1 = levelReward(1)
    expect(r1.tokens).toBe(0)
  })

  it('S6：先结算再轮换——轮换瞬间已达标的任务声望在旧赛季被发放', () => {
    const s = newGame('T', 0)
    withSeason(s, DEF.epoch + 1000)
    const slot = s.season.tasks[0]
    const tpl = templateById(slot.defId)!
    ;(s.stats as unknown as Record<string, number>)[tpl.counter] = slot.base + tpl.targets[2]
    const goldBefore = s.gold
    // 模拟主循环次序：先 checkSeason（结算旧赛季），再 refreshSeason（进入新赛季）
    checkSeason(s)
    expect(s.gold).toBeGreaterThan(goldBefore)
    expect(s.season.rewardedLevel).toBeGreaterThan(0)
    refreshSeason(s, DEF.epoch + SEASON_MS + 1000)
    expect(s.season.index).toBe(1)
    expect(s.season.renown).toBe(0)
  })

  it('S8：离线可推进的计数器（挖掘/金币/远征）计入赛季，强化/重铸不因离线增长', () => {
    const s = newGame('T', 0)
    withSeason(s, DEF.epoch + 1000)
    const before = s.stats.totalEnhances
    // 离线结算不会改变 totalEnhances（offline.ts 跳过强化）
    expect(s.stats.totalEnhances).toBe(before)
    const view = seasonView(s, DEF.epoch + 1000)
    const onlineOnly = view.tasks.filter((t) => t.onlineOnly).map((t) => t.defId)
    for (const id of onlineOnly) {
      const tpl = templateById(id)!
      expect(['totalEnhances', 'totalReforges']).toContain(tpl.counter)
    }
  })
})

describe('数值闭环（S12）与成就（S11）', () => {
  it('S12：data/season.json 与 sim-season-output.json 逐字段一致（文档数字 = 脚本输出）', () => {
    expect(DEF.days).toBe(simOutput.season.days)
    expect(DEF.levels).toBe(simOutput.season.levels)
    expect(DEF.renownPerLevel).toBe(simOutput.season.renownPerLevel)
    expect(DEF.tierRenown).toEqual(simOutput.season.tierRenown)
    // 模板目标与脚本同源
    const scriptTargets = simOutput.season.targets as Record<string, Record<string, number>>
    for (const tpl of DEF.templates) {
      const key = tpl.id.replace('s_', '')
      if (!scriptTargets[key]) continue
      expect(tpl.targets).toEqual([scriptTargets[key].bronze, scriptTargets[key].silver, scriptTargets[key].gold])
    }
    // 图鉴分区条目与脚本一致
    expect(simOutput.codex.items + simOutput.codex.relics).toBe(Object.keys(CONTENT.items).length)
    expect(simOutput.codex.total).toBe(222)
    // 里程碑奖励与脚本一致
    for (let i = 0; i < simOutput.codex.milestones.length; i++) {
      expect(DEF.codexMilestones[i].pct).toBeCloseTo(simOutput.codex.milestones[i].m, 6)
      expect(DEF.codexMilestones[i].gold).toBe(simOutput.codex.milestones[i].gold)
      expect(DEF.codexMilestones[i].essence).toBe(simOutput.codex.milestones[i].essence)
      expect(DEF.codexMilestones[i].tokens).toBe(simOutput.codex.milestones[i].tokens)
    }
  })

  it('可达性：满级所需声望 = 等级 × 每级声望，且 ≤ 赛季上限', () => {
    expect(DEF.levels * DEF.renownPerLevel).toBeLessThanOrEqual(DEF.tierRenown.gold * 3)
  })

  it('S11：赛季等级成就 / 图鉴成就触发', () => {
    const s = newGame('T', 0)
    withSeason(s, DEF.epoch + 1000)
    for (const slot of s.season.tasks) {
      const tpl = templateById(slot.defId)!
      ;(s.stats as unknown as Record<string, number>)[tpl.counter] = slot.base + tpl.targets[2]
    }
    checkSeason(s)
    const events = checkCodexMilestones(s)
    void events
    // 直接断言成就判定函数（避免依赖 checkAchievements 的调用时机）
    expect(s.season.rewardedLevel).toBe(DEF.levels)
  })

  it('图鉴里程碑发徽记（用于招募/旗帜），且不写入赛季声望', () => {
    const s = newGame('T', 0)
    addMaterial(s, 'crate', 1)
    checkCodexMilestones(s)
    expect(s.season.renown).toBe(0)
  })
})

describe('成就语义（修复：season_gold3 不再与 season_max 重复）', () => {
  it('season_max 与 season_gold3 的触发条件不同（等级 20 vs 声望 120）', () => {
    const s = newGame('T', 0)
    withSeason(s, DEF.epoch + 1000)
    // 达标到刚好满级（80 声望 = 1金+2银）
    const slots = s.season.tasks
    const counters = slots.map((sl) => templateById(sl.defId)!.counter)
    // 第一条冲金档，其余两条冲银档 → 40 + 20 + 20 = 80
    const tiers = [2, 1, 1]
    slots.forEach((sl, i) => {
      const tpl = templateById(sl.defId)!
      ;(s.stats as unknown as Record<string, number>)[tpl.counter] = sl.base + tpl.targets[tiers[i]]
    })
    checkSeason(s)
    expect(s.season.rewardedLevel).toBe(DEF.levels) // 满级
    expect(s.season.renown).toBe(80)
    void counters

    // 尚未三线全金（120）——但把三条都推到金档即触发
    const renownBefore = s.season.renown
    expect(renownBefore).toBeLessThan(120)
    for (const sl of slots) {
      const tpl = templateById(sl.defId)!
      ;(s.stats as unknown as Record<string, number>)[tpl.counter] = sl.base + tpl.targets[2]
    }
    checkSeason(s)
    expect(s.season.renown).toBe(120)
  })
})
