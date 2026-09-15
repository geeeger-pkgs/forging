import { beforeEach, describe, expect, it } from 'vitest'
import { SAVE_VERSION, clearSave, importSaveFile, loadGame, saveGame } from '../src/app/persist'
import { rollAffixes } from '../src/game/affixes'
import { CONTENT } from '../src/game/content'
import { addInstance, newGame } from '../src/game/state'

// —— localStorage 桩（node 环境） ——
function makeStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string): string | null => map.get(k) ?? null,
    setItem: (k: string, v: string): void => {
      map.set(k, String(v))
    },
    removeItem: (k: string): void => {
      map.delete(k)
    },
    clear: (): void => map.clear(),
    key: (i: number): string | null => [...map.keys()][i] ?? null,
    get length(): number {
      return map.size
    },
  }
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: makeStorage(), configurable: true })
})

describe('存档持久化', () => {
  it('保存 → 载入 往返一致（关键字段）', () => {
    const s = newGame('打磨测试', 1000)
    s.materials['ore_copper'] = 42
    s.gold = 33
    saveGame(s)
    const loaded = loadGame()
    expect(loaded).not.toBeNull()
    expect(loaded!.character.name).toBe('打磨测试')
    expect(loaded!.materials['ore_copper']).toBe(42)
    expect(loaded!.gold).toBe(33)
    expect(loaded!.version).toBe(SAVE_VERSION)
  })

  it('主槽损坏时回退备份槽', () => {
    const a = newGame('A', 1)
    a.gold = 1
    saveGame(a) // 主槽 = A
    const b = newGame('B', 2)
    b.gold = 2
    saveGame(b) // 备份槽 = A，主槽 = B
    localStorage.setItem('forging.save', '{broken json')
    const loaded = loadGame()
    expect(loaded!.character.name).toBe('A')
    expect(loaded!.gold).toBe(1)
  })

  it('两槽皆无效 → null', () => {
    localStorage.setItem('forging.save', 'xxx')
    localStorage.setItem('forging.save.bak', 'yyy')
    expect(loadGame()).toBeNull()
  })

  it('clearSave 清空两槽', () => {
    const s = newGame('C', 3)
    saveGame(s)
    saveGame(s)
    clearSave()
    expect(loadGame()).toBeNull()
  })

  it('importSaveFile：合法导入 / 非法拒绝 / 结构不符拒绝', async () => {
    const s = newGame('Import', 5)
    s.gold = 99
    const good = new File([JSON.stringify(s)], 'forging-save.json', { type: 'application/json' })
    const imported = await importSaveFile(good)
    expect(imported!.character.name).toBe('Import')
    expect(imported!.gold).toBe(99)

    const notJson = new File(['not json'], 'bad.json', { type: 'application/json' })
    expect(await importSaveFile(notJson)).toBeNull()

    const wrongShape = new File([JSON.stringify({ version: 1 })], 'wrong.json')
    expect(await importSaveFile(wrongShape)).toBeNull()
  })

  it('v1 → v7 链式迁移：补齐成就/计数/任务/饰品/符文/传承/自动化（保留旧数据）', () => {
    const v1 = {
      version: 1,
      character: { name: '旧档', createdAt: 1 },
      skills: { mining: 0, smelting: 0, forging: 0, enhancing: 0 },
      materials: { ore_copper: 9 },
      equipment: [],
      slots: {},
      nextInstanceId: 1,
      gold: 5,
      actions: { current: null, queue: [] },
      queueSlots: 1,
      flags: { tutorial: { current: 3, progress: 1, completed: [1, 2], claimed: [1, 2] } },
      meta: { lastSeenAt: 1, carry: { items: {} } },
      stats: { totalCrafts: 7, totalEnhances: 2 },
    }
    localStorage.setItem('forging.save', JSON.stringify(v1))
    const loaded = loadGame()
    expect(loaded).not.toBeNull()
    expect(loaded!.version).toBe(SAVE_VERSION)
    expect(loaded!.stats.totalMines).toBe(0)
    expect(loaded!.stats.totalCrafts).toBe(7)
    expect(loaded!.stats.totalGoldEarned).toBe(0)
    expect(loaded!.stats.totalTasksDone).toBe(0)
    expect(loaded!.stats.totalJewelryForged).toBe(0)
    expect(loaded!.stats.totalRunesCrafted).toBe(0)
    expect(loaded!.stats.totalPrestiges).toBe(0)
    expect(loaded!.buffs).toEqual([])
    expect(loaded!.meta.prestige.points).toBe(0)
    expect(loaded!.meta.prestige.perks).toEqual({})
    expect(loaded!.meta.autoRecycle).toEqual({})
    expect(loaded!.meta.loadouts).toEqual([])
    expect(loaded!.flags.achievements.unlocked).toEqual([])
    expect(loaded!.flags.tutorial.current).toBe(3)
    expect(loaded!.materials['ore_copper']).toBe(9)
    expect(loaded!.meta.tasks.daily).toEqual([]) // 待首启 refreshTasks 生成
  })

  it('v2 → v7 链式迁移：补齐任务/饰品/符文/传承/自动化计数', () => {
    const s = newGame('V2', 1)
    const v2 = { ...s, version: 2 }
    delete (v2 as Record<string, unknown>).meta // 重建 v2 形态
    const statsV2 = { totalCrafts: 3, totalEnhances: 1, totalMines: 5 }
    ;(v2 as Record<string, unknown>).meta = { lastSeenAt: 1, carry: { items: {} } }
    ;(v2 as Record<string, unknown>).stats = statsV2
    delete (v2 as Record<string, unknown>).buffs
    localStorage.setItem('forging.save', JSON.stringify(v2))
    const loaded = loadGame()
    expect(loaded!.version).toBe(SAVE_VERSION)
    expect(loaded!.stats.totalMines).toBe(5)
    expect(loaded!.stats.totalSmelts).toBe(0)
    expect(loaded!.stats.totalTasksDone).toBe(0)
    expect(loaded!.stats.totalRunesCrafted).toBe(0)
    expect(loaded!.stats.totalPrestiges).toBe(0)
    expect(loaded!.buffs).toEqual([])
    expect(loaded!.meta.prestige.points).toBe(0)
    expect(loaded!.meta.autoRecycle).toEqual({})
    expect(loaded!.meta.loadouts).toEqual([])
    expect(loaded!.meta.tasks.paidRerollsLeft).toBe(3)
  })

  it('拒绝高于当前版本的存档', () => {
    const s = newGame('Future', 1)
    localStorage.setItem('forging.save', JSON.stringify({ ...s, version: 99 }))
    expect(loadGame()).toBeNull()
  })

  it('v7 → v8：旧档装备确定性回填词缀（与造装函数一致、可复现）', () => {
    const s = newGame('Legacy', 1)
    const pickId = addInstance(s, 'pick_mithril', 5)
    const swordId = addInstance(s, 'sword_gold', 2)
    // 去掉 v2.1 字段，模拟 v7 存档形态
    for (const e of s.equipment) delete (e as unknown as Record<string, unknown>).affixes
    delete (s.stats as unknown as Record<string, unknown>).totalReforges
    delete (s.stats as unknown as Record<string, unknown>).perfectAffixes
    localStorage.setItem('forging.save', JSON.stringify({ ...s, version: 7 }))

    const loaded = loadGame()
    expect(loaded).not.toBeNull()
    expect(loaded!.version).toBe(SAVE_VERSION)
    // 回填使用本档私有盐（评审 B6）：结果可复现，但要带上存档里的 salt
    expect(typeof loaded!.meta.affixSalt).toBe('number')
    for (const inst of loaded!.equipment) {
      expect(inst.affixes).toEqual(rollAffixes(inst.itemId, inst.instanceId, loaded!.meta.affixSalt))
      expect(inst.affixes.length).toBeGreaterThan(0)
    }
    expect(loaded!.equipment.find((e) => e.instanceId === pickId)!.affixes.length).toBe(3) // T5
    expect(loaded!.equipment.find((e) => e.instanceId === swordId)!.affixes.length).toBe(2) // T4
    expect(loaded!.stats.totalReforges).toBe(0)
    expect(loaded!.stats.perfectAffixes).toBeGreaterThanOrEqual(0)

    // 幂等：再次写入并读取，词缀不再变化
    saveGame(loaded!)
    const again = loadGame()
    expect(again!.equipment).toEqual(loaded!.equipment)
  })

  it('v1 → v8 全链：迁移后装备同样带词缀且强化等级保留', () => {
    const s = newGame('Chain', 1)
    const id = addInstance(s, 'pick_copper', 3)
    for (const e of s.equipment) delete (e as unknown as Record<string, unknown>).affixes
    const v1 = {
      ...s,
      version: 1,
      stats: { totalCrafts: 1 },
      meta: { lastSeenAt: 1, carry: { items: {} } },
      flags: { tutorial: { current: 1, progress: 0, completed: [], claimed: [] } },
    }
    localStorage.setItem('forging.save', JSON.stringify(v1))

    const loaded = loadGame()
    expect(loaded!.version).toBe(SAVE_VERSION)
    const inst = loaded!.equipment.find((e) => e.instanceId === id)!
    expect(inst.enhanceLevel).toBe(3)
    expect(inst.affixes).toEqual(rollAffixes('pick_copper', id, loaded!.meta.affixSalt))
  })

  it('v8 档缺 affixSalt 时载入自动补齐（测评 m5：不再静默回落 0）', () => {
    const s = newGame('NoSalt', 1)
    const v8 = JSON.parse(JSON.stringify(s)) as Record<string, unknown>
    delete ((v8 as { meta: Record<string, unknown> }).meta as Record<string, unknown>).affixSalt
    localStorage.setItem('forging.save', JSON.stringify(v8))
    const loaded = loadGame()
    expect(loaded).not.toBeNull()
    expect(typeof loaded!.meta.affixSalt).toBe('number')
    expect(loaded!.meta.affixSalt).toBeGreaterThan(0)
  })

  it('v8 → v9（E12）：补齐伙伴/远征/统计；老档无伙伴时补发初始伙伴', () => {
    const s = newGame('T', 1)
    const v8 = JSON.parse(JSON.stringify(s)) as Record<string, unknown>
    delete v8.companions
    delete (v8.meta as Record<string, unknown>).expeditions
    const st = v8.stats as Record<string, unknown>
    delete st.totalExpeditions
    delete st.totalRecruits
    delete st.totalRelics
    delete st.totalTokensEarned
    localStorage.setItem('forging.save', JSON.stringify({ ...v8, version: 8 }))

    const loaded = loadGame()
    expect(loaded).not.toBeNull()
    expect(loaded!.version).toBe(SAVE_VERSION)
    expect(loaded!.meta.expeditions).toEqual({ runs: [], banner: 0, nextRunId: 1 })
    expect(loaded!.stats.totalExpeditions).toBe(0)
    expect(loaded!.stats.totalRecruits).toBe(0)
    expect(loaded!.stats.totalRelics).toBe(0)
    expect(loaded!.stats.totalTokensEarned).toBe(0)
    // 迁移链不补初始伙伴（由 ensureFields 统一补），保证 newGame 与载入一致
    expect(Object.keys(loaded!.companions).length).toBe(1)
    expect(loaded!.companions[CONTENT.expeditions.starter]).toBeDefined()
  })

  it('v1 → v9 全链：远征字段与进行中的 run 往返保留', () => {
    const s = newGame('T', 1)
    s.meta.expeditions.runs.push({
      id: 7,
      routeId: 'outskirts',
      hours: 8,
      startedAt: 1000,
      endsAt: 1000 + 8 * 3600_000,
      team: [CONTENT.expeditions.starter],
      done: false,
      outcome: null,
    })
    s.meta.expeditions.banner = 2
    s.meta.expeditions.nextRunId = 8
    saveGame(s)
    const loaded = loadGame()!
    expect(loaded.meta.expeditions.banner).toBe(2)
    expect(loaded.meta.expeditions.runs.length).toBe(1)
    expect(loaded.meta.expeditions.runs[0].id).toBe(7)
    expect(loaded.meta.expeditions.nextRunId).toBe(8)
  })

  it('v8 往返：词缀与盐完整保留（导出/导入幂等）', () => {
    const s = newGame('Salt', 1)
    const id = addInstance(s, 'pick_void')
    saveGame(s)
    const loaded = loadGame()!
    const inst = loaded.equipment.find((e) => e.instanceId === id)!
    expect(inst.affixes).toEqual(rollAffixes('pick_void', id, s.meta.affixSalt))
    expect(loaded.meta.affixSalt).toBe(s.meta.affixSalt)
  })
})

describe('v2.3 迁移（S10）', () => {
  it('v9 → v10：补齐图鉴与赛季字段；赛季为未解锁态', () => {
    const s = newGame('T', 1)
    const v9 = JSON.parse(JSON.stringify(s)) as Record<string, unknown>
    delete v9.codex
    delete v9.season
    delete (v9.meta as Record<string, unknown>).codexMilestones
    localStorage.setItem('forging.save', JSON.stringify({ ...v9, version: 9 }))
    const loaded = loadGame()
    expect(loaded).not.toBeNull()
    expect(loaded!.version).toBe(SAVE_VERSION)
    expect(loaded!.codex).toEqual({ items: '', recipes: '', affixes: '', ores: '' })
    expect(loaded!.season).toEqual({ index: -1, renown: 0, rewardedLevel: 0, tasks: [] })
    expect(loaded!.meta.codexMilestones).toBe('')
  })

  it('v9 → v10：冷启动回溯登记持有物（配方/词缀历史不回溯）', () => {
    const s = newGame('T', 1)
    addInstance(s, 'pick_copper')
    s.materials['ore_iron'] = 5
    const v9 = JSON.parse(JSON.stringify(s)) as Record<string, unknown>
    v9.codex = { items: '', recipes: '', affixes: '', ores: '' }
    localStorage.setItem('forging.save', JSON.stringify({ ...v9, version: 9 }))
    const loaded = loadGame()!
    expect(loaded.codex.items).toContain('ore_iron')
    expect(loaded.codex.items).toContain('pick_copper')
    expect(loaded.codex.recipes).toBe('')
  })

  it('v1 → v10 全链：赛季与图鉴字段齐全，进行中的远征保留', () => {
    const s = newGame('T', 1)
    const v1 = {
      ...s,
      version: 1,
      stats: { totalCrafts: 1 },
      meta: { lastSeenAt: 1, carry: { items: {} } },
      flags: { tutorial: { current: 1, progress: 0, completed: [], claimed: [] } },
    }
    localStorage.setItem('forging.save', JSON.stringify(v1))
    const loaded = loadGame()!
    expect(loaded.version).toBe(SAVE_VERSION)
    expect(loaded.codex).toBeDefined()
    expect(loaded.season.index).toBe(-1)
    expect(Object.keys(loaded.companions).length).toBe(1)
  })
})

describe('v2.4 迁移（A10）', () => {
  it('v10 → v11：补齐深渊状态（体力给满、无最高层记录）', () => {
    const s = newGame('T', 1)
    const v10 = JSON.parse(JSON.stringify(s)) as Record<string, unknown>
    delete v10.abyss
    const st = v10.stats as Record<string, unknown>
    delete st.totalAbyssSweeps
    delete st.totalAbyssPurchases
    localStorage.setItem('forging.save', JSON.stringify({ ...v10, version: 10 }))
    const loaded = loadGame()
    expect(loaded).not.toBeNull()
    expect(loaded!.version).toBe(SAVE_VERSION)
    expect(loaded!.abyss.bestFloor).toBe(0)
    expect(loaded!.abyss.crystals).toBe(0)
    expect(loaded!.abyss.stamina).toBe(CONTENT.abyss.staminaMax)
    expect(loaded!.abyss.tickets).toBe(0)
    expect(loaded!.abyss.permanentSpeed).toBe(0)
    expect(loaded!.abyss.title).toBe(false)
    expect(loaded!.stats.totalAbyssSweeps).toBe(0)
    expect(loaded!.stats.totalAbyssPurchases).toBe(0)
  })

  it('v11 往返：深渊状态完整保留（含已购次数与券）', () => {
    const s = newGame('T', 1)
    s.abyss.bestFloor = 12
    s.abyss.crystals = 345
    s.abyss.stamina = 4
    s.abyss.tickets = 2
    s.abyss.permanentSpeed = 3
    s.abyss.title = true
    s.abyss.purchased = { reroll_ticket: 2, title: 1 }
    saveGame(s)
    const loaded = loadGame()!
    expect(loaded.abyss).toEqual(s.abyss)
  })

  it('v1 → v11 全链：深渊字段齐全且不产生满体力（staminaAt = 迁移时刻）', () => {
    const s = newGame('T', 1)
    const v1 = {
      ...s,
      version: 1,
      abyss: undefined,
      stats: { totalCrafts: 1 },
      meta: { lastSeenAt: 1, carry: { items: {} } },
      flags: { tutorial: { current: 1, progress: 0, completed: [], claimed: [] } },
    }
    localStorage.setItem('forging.save', JSON.stringify(v1))
    const loaded = loadGame()!
    expect(loaded.version).toBe(SAVE_VERSION)
    expect(loaded.abyss.bestFloor).toBe(0)
    expect(loaded.abyss.stamina).toBeLessThanOrEqual(CONTENT.abyss.staminaMax)
    expect(loaded.abyss.staminaAt).toBeGreaterThan(0)
  })
})
