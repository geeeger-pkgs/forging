import { describe, expect, it } from 'vitest'
import { levelInfo, totalLevel, xpToNext } from '../src/game/level'
import { newGame } from '../src/game/state'

const cumulative = (targetLevel: number): number => {
  let sum = 0
  for (let l = 1; l < targetLevel; l++) sum += xpToNext(l)
  return sum
}

describe('经验曲线（源级闭式口径）', () => {
  it('单级数值锚点', () => {
    expect(xpToNext(1)).toBe(30)
    expect(xpToNext(2)).toBe(41)
    expect(xpToNext(5)).toBe(100)
    expect(xpToNext(10)).toBe(447)
  })

  it('累计锚点（设计 §6 附录 C.1）', () => {
    expect(cumulative(10)).toBe(1193)
    expect(cumulative(20)).toBe(13151)
    expect(cumulative(35)).toBe(118091)
    expect(cumulative(50)).toBe(583137)
  })

  it('levelInfo 边界', () => {
    expect(levelInfo(0).level).toBe(1)
    expect(levelInfo(29).level).toBe(1)
    expect(levelInfo(30).level).toBe(2)
    expect(levelInfo(1193).level).toBe(10)
    expect(levelInfo(1192).level).toBe(9)
    expect(levelInfo(1e9).level).toBe(100)
    expect(levelInfo(1e9).xpNeed).toBe(Number.POSITIVE_INFINITY)
  })

  it('新角色总等级 = 4（四技能各 1 级）', () => {
    const s = newGame('Tester', 0)
    expect(totalLevel(s.skills)).toBe(4)
  })

  it('v1.6 扩展锚点（Lv51→100；v3.1 长尾压缩：末段 1.02 → 1.01）', () => {
    // v3.1：76+ 段 multiplier 1.02 → 1.01（测评：Lv80→100 占 49.9% XP 却零解锁）
    // 实算影响：Lv100 累计 −6.5%、长尾段 −12.9%；Lv80 及以下锚点不变
    expect(cumulative(50)).toBe(583137)
    expect(cumulative(65)).toBe(1716346)
    expect(cumulative(80)).toBe(3470848)
    expect(cumulative(100)).toBe(6490525)
    expect(levelInfo(1716346).level).toBe(65)
    expect(levelInfo(3470848).level).toBe(80)
    expect(levelInfo(6490525).level).toBe(100)
  })
})
