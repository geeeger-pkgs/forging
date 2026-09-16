import { describe, expect, it } from 'vitest'
import { CONTENT } from '../src/game/content'
import { xpForLevel } from '../src/game/level'
import { settleOffline } from '../src/game/offline'
import { buyPerk, doPrestige, perkBonuses, prestigePointsFor, prestigeUnlocked, refundPerk } from '../src/game/prestige'
import { newGame } from '../src/game/state'
import type { GameState } from '../src/game/types'

/** 测试辅助：把四个技能直接设定到指定等级 */
function setSkillLevel(s: GameState, level: number): void {
  const xp = xpForLevel(level)
  s.skills = { mining: xp, smelting: xp, forging: xp, enhancing: xp }
}

describe('传承系统（v1.5）', () => {
  it('解锁阈值：总等级 ≥ 120', () => {
    const s = newGame('T', 0)
    setSkillLevel(s, 29) // 总 116
    expect(prestigeUnlocked(s)).toBe(false)
    setSkillLevel(s, 30) // 总 120
    expect(prestigeUnlocked(s)).toBe(true)
  })

  it('精通点结算：⌊总等级÷10⌋ + 满级技能奖励', () => {
    const s = newGame('T', 0)
    setSkillLevel(s, 30)
    expect(prestigePointsFor(s)).toBe(12)
    s.skills.mining = xpForLevel(100) // 满级（上限 100）→ +1（总 190 → 19 + 1）
    expect(prestigePointsFor(s)).toBe(20)
  })

  it('传承：重置技能/动作/队列；保留材料/金币/装备/成就/队列位/增益', () => {
    const s = newGame('T', 0)
    setSkillLevel(s, 30)
    s.materials['ore_copper'] = 99
    s.gold = 500
    s.queueSlots = 2
    s.flags.achievements.unlocked.push('mine_10')
    s.buffs.push({ defId: 'rune_speed_1', until: Date.now() + 60_000 })
    s.actions.current = {
      ref: { kind: 'mine', siteId: 'copper_seam' },
      remaining: null,
      startedAt: 0,
      durationMs: 6000,
      procMisses: 0,
    }
    s.actions.queue.push({
      ref: { kind: 'mine', siteId: 'copper_seam' },
      remaining: 1,
      startedAt: 0,
      durationMs: 6000,
      procMisses: 0,
    })

    const ev = doPrestige(s)
    expect(ev.some((e) => e.type === 'prestigeDone' && e.points === 12)).toBe(true)
    // 重置项
    expect(s.skills.mining).toBe(0)
    expect(s.actions.current).toBeNull()
    expect(s.actions.queue).toHaveLength(0)
    // 保留项
    expect(s.materials['ore_copper']).toBe(99)
    expect(s.gold).toBe(500)
    expect(s.queueSlots).toBe(2)
    expect(s.flags.achievements.unlocked).toContain('mine_10')
    expect(s.buffs).toHaveLength(1)
    // 点数与统计
    expect(s.meta.prestige.points).toBe(12)
    expect(s.stats.totalPrestiges).toBe(1)
    expect(s.stats.totalPrestigePointsEarned).toBe(12)
  })

  it('未达阈值传承被阻塞', () => {
    const s = newGame('T', 0)
    setSkillLevel(s, 20)
    expect(doPrestige(s).some((e) => e.type === 'blocked')).toBe(true)
  })

  it('购买/退款精通：扣点、上下限、退点、异常分支', () => {
    const s = newGame('T', 0)
    s.meta.prestige.points = 5
    expect(buyPerk(s, 'swift')).toHaveLength(1)
    expect(s.meta.prestige.perks['swift']).toBe(1)
    expect(s.meta.prestige.points).toBe(4)
    // 退款
    expect(refundPerk(s, 'swift')).toHaveLength(1)
    expect(s.meta.prestige.perks['swift']).toBe(0)
    expect(s.meta.prestige.points).toBe(5)
    // 未投入不可退
    expect(refundPerk(s, 'swift').some((e) => e.type === 'blocked')).toBe(true)
    // 点数不足
    s.meta.prestige.points = 0
    expect(buyPerk(s, 'swift').some((e) => e.type === 'blocked' && e.reason.includes('不足'))).toBe(true)
    // 未知精通
    expect(buyPerk(s, 'nope').some((e) => e.type === 'blocked')).toBe(true)
  })

  it('精通效果聚合（速度/经验/效率/稀有/离线/起点）', () => {
    const s = newGame('T', 0)
    s.meta.prestige.points = 100
    buyPerk(s, 'swift')
    buyPerk(s, 'wisdom')
    buyPerk(s, 'offline')
    buyPerk(s, 'headstart')
    const b = perkBonuses(s)
    expect(b.speed).toBeCloseTo(0.015)
    expect(b.wisdom).toBeCloseTo(0.03)
    expect(b.offlineHours).toBeCloseTo(1)
    expect(b.startLevel).toBeCloseTo(2)
  })

  it('精通深造（v1.9）：基础上限后价格 ×2、上限 ×2、退款对称', () => {
    const s = newGame('T', 0)
    const swift = CONTENT.perks.find((p) => p.id === 'swift')!
    s.meta.prestige.points = 1_000_000
    for (let i = 0; i < swift.max; i++) buyPerk(s, 'swift')
    expect(s.meta.prestige.perks['swift']).toBe(swift.max)

    // 深造就第一级：花费 ×2
    const before = s.meta.prestige.points
    buyPerk(s, 'swift')
    expect(s.meta.prestige.perks['swift']).toBe(swift.max + 1)
    expect(before - s.meta.prestige.points).toBe(swift.cost * 2)
    expect(perkBonuses(s).speed).toBeCloseTo(0.015 * (swift.max + 1))

    // 退款：深造级返 ×2，基础级返 ×1
    refundPerk(s, 'swift')
    expect(s.meta.prestige.points).toBe(before)
    const mid = s.meta.prestige.points
    refundPerk(s, 'swift')
    expect(s.meta.prestige.points).toBe(mid + swift.cost)

    // 买满深造至 2 倍上限后阻塞
    s.meta.prestige.points = 1_000_000
    for (let i = swift.max - 1; i < swift.max * 2; i++) {
      expect(buyPerk(s, 'swift').some((e) => e.type === 'blocked')).toBe(false)
    }
    expect(s.meta.prestige.perks['swift']).toBe(swift.max * 2)
    expect(buyPerk(s, 'swift').some((e) => e.type === 'blocked')).toBe(true)
  })

  it('起点精通在下次传承生效（技能起始 Lv3）', () => {
    const s = newGame('T', 0)
    s.meta.prestige.points = 2
    buyPerk(s, 'headstart') // 起始等级 +2 → Lv3
    setSkillLevel(s, 30)
    doPrestige(s)
    expect(s.skills.mining).toBe(xpForLevel(3))
  })

  it('离线精通扩展离线上限（8h → 10h）', () => {
    const s = newGame('T', 0)
    s.meta.prestige.points = 2
    buyPerk(s, 'offline')
    buyPerk(s, 'offline')
    s.actions.current = {
      ref: { kind: 'mine', siteId: 'copper_seam' },
      remaining: null,
      startedAt: 0,
      durationMs: 6000,
      procMisses: 0,
    }
    const summary = settleOffline(s, 10 * 3_600_000)!
    expect(summary.countedMs).toBe(10 * 3_600_000)
    // 只针对"离线时长上限"那条提示（v3.0 新增的离线回体提示含"离线可攒至"，不含"小时上限"）
    expect(summary.notes.some((n) => n.includes('小时上限'))).toBe(false)
  })

  it('精通数据表校验（6 条）', () => {
    expect(CONTENT.perks.length).toBe(6)
  })
})
