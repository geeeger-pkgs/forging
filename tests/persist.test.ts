import { beforeEach, describe, expect, it } from 'vitest'
import { SAVE_VERSION, clearSave, importSaveFile, loadGame, saveGame } from '../src/app/persist'
import { newGame } from '../src/game/state'

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

  it('v1 → v3 迁移：补齐成就/挖矿计数/任务/累计金币（保留旧数据）', () => {
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
    expect(loaded!.version).toBe(3)
    expect(loaded!.stats.totalMines).toBe(0)
    expect(loaded!.stats.totalCrafts).toBe(7)
    expect(loaded!.stats.totalGoldEarned).toBe(0)
    expect(loaded!.flags.achievements.unlocked).toEqual([])
    expect(loaded!.flags.tutorial.current).toBe(3)
    expect(loaded!.materials['ore_copper']).toBe(9)
    expect(loaded!.meta.tasks.daily).toEqual([]) // 待首启 refreshTasks 生成
  })

  it('v2 → v3 迁移：补齐任务与累计计数', () => {
    const s = newGame('V2', 1)
    const v2 = { ...s, version: 2 }
    delete (v2 as Record<string, unknown>).meta // 重建 v2 形态
    const statsV2 = { totalCrafts: 3, totalEnhances: 1, totalMines: 5 }
    ;(v2 as Record<string, unknown>).meta = { lastSeenAt: 1, carry: { items: {} } }
    ;(v2 as Record<string, unknown>).stats = statsV2
    localStorage.setItem('forging.save', JSON.stringify(v2))
    const loaded = loadGame()
    expect(loaded!.version).toBe(3)
    expect(loaded!.stats.totalMines).toBe(5)
    expect(loaded!.stats.totalSmelts).toBe(0)
    expect(loaded!.meta.tasks.paidRerollsLeft).toBe(3)
  })

  it('拒绝高于当前版本的存档', () => {
    const s = newGame('Future', 1)
    localStorage.setItem('forging.save', JSON.stringify({ ...s, version: 99 }))
    expect(loadGame()).toBeNull()
  })
})
