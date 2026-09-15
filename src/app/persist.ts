// ============================================================
// Forging · 存档（localStorage 双槽 + 版本迁移 + 导出/导入）
// ============================================================
import { perfectAffixCount, rollAffixes } from '../game/affixes'
import type { EquipInstance, GameState } from '../game/types'

const SAVE_KEY = 'forging.save'
const BAK_KEY = 'forging.save.bak'
export const SAVE_VERSION = 8

/** 存档私有词缀盐（迁移 7→8 时生成一次并持久化） */
function newAffixSalt(): number {
  return (Math.floor(Math.random() * 0xffffffff) + 1) >>> 0
}

export function saveGame(state: GameState): void {
  try {
    const json = JSON.stringify(state)
    const prev = localStorage.getItem(SAVE_KEY)
    if (prev) localStorage.setItem(BAK_KEY, prev)
    localStorage.setItem(SAVE_KEY, json)
  } catch (e) {
    console.warn('[forging] 保存失败', e)
  }
}

function isValidSave(s: unknown): s is GameState {
  if (!s || typeof s !== 'object') return false
  const o = s as Record<string, unknown>
  return typeof o.version === 'number' && !!o.skills && !!o.materials && !!o.actions && !!o.meta
}

/** 版本迁移链（v→v+1）；后续版本在此登记 */
const MIGRATIONS: Record<number, (s: GameState) => GameState> = {
  1: (s) => ({
    ...s,
    version: 2,
    stats: { ...s.stats, totalMines: s.stats.totalMines ?? 0 },
    flags: { ...s.flags, achievements: s.flags.achievements ?? { unlocked: [] } },
  }),
  2: (s) => ({
    ...s,
    version: 3,
    stats: {
      ...s.stats,
      totalSmelts: s.stats.totalSmelts ?? 0,
      totalForges: s.stats.totalForges ?? 0,
      totalGoldEarned: s.stats.totalGoldEarned ?? 0,
      totalCratesOpened: s.stats.totalCratesOpened ?? 0,
    },
    meta: {
      ...s.meta,
      tasks: s.meta.tasks ?? {
        dailyDate: '',
        daily: [],
        rerollsLeft: 1,
        paidRerollsLeft: 3,
        weekKey: '',
        weekly: null,
      },
    },
  }),
  3: (s) => ({
    ...s,
    version: 4,
    stats: {
      ...s.stats,
      totalTasksDone: s.stats.totalTasksDone ?? 0,
      totalWeekliesDone: s.stats.totalWeekliesDone ?? 0,
      totalJewelryForged: s.stats.totalJewelryForged ?? 0,
    },
  }),
  4: (s) => ({
    ...s,
    version: 5,
    buffs: (s as unknown as { buffs?: GameState['buffs'] }).buffs ?? [],
    stats: { ...s.stats, totalRunesCrafted: s.stats.totalRunesCrafted ?? 0 },
  }),
  5: (s) => ({
    ...s,
    version: 6,
    meta: {
      ...s.meta,
      prestige:
        (s.meta as unknown as { prestige?: GameState['meta']['prestige'] }).prestige ?? { points: 0, perks: {} },
    },
    stats: {
      ...s.stats,
      totalPrestiges: s.stats.totalPrestiges ?? 0,
      totalPrestigePointsEarned: s.stats.totalPrestigePointsEarned ?? 0,
    },
  }),
  6: (s) => ({
    ...s,
    version: 7,
    meta: {
      ...s.meta,
      autoRecycle: (s.meta as unknown as { autoRecycle?: GameState['meta']['autoRecycle'] }).autoRecycle ?? {},
      loadouts: (s.meta as unknown as { loadouts?: GameState['meta']['loadouts'] }).loadouts ?? [],
    },
  }),
  // v2.1：旧档装备确定性回填词缀（与造装同一函数 + 本档私有盐 → 同一档结果恒定、可复现）
  7: (s) => {
    const salt = s.meta.affixSalt ?? newAffixSalt()
    const equipment: EquipInstance[] = (s.equipment ?? []).map((e) => ({
      ...e,
      affixes: e.affixes ?? rollAffixes(e.itemId, e.instanceId, salt),
    }))
    let perfect = 0
    for (const e of equipment) perfect += perfectAffixCount(e.itemId, e.affixes)
    return {
      ...s,
      version: 8,
      equipment,
      meta: { ...s.meta, affixSalt: salt },
      stats: {
        ...s.stats,
        totalReforges: s.stats.totalReforges ?? 0,
        // 语义：累计「新摇出」的完美词缀条数（造装 + 重铸）；旧档按回填结果计入
        perfectAffixes: s.stats.perfectAffixes ?? perfect,
      },
    }
  },
}

function migrate(s: GameState): GameState {
  let cur = s
  while (cur.version < SAVE_VERSION) {
    const m = MIGRATIONS[cur.version]
    if (!m) break
    cur = m(cur)
  }
  return cur
}

/**
 * 载入兜底（幂等）：补齐"技术上已是当前版本、但缺字段"的存档。
 * v2.1 测评 m5：v8 档若缺 affixSalt，旧实现静默回落 0 → 造装词缀可被外部预计算，此处补齐。
 */
function ensureFields(s: GameState): GameState {
  if (typeof s.meta.affixSalt === 'number') return s
  const salt = newAffixSalt()
  return { ...s, meta: { ...s.meta, affixSalt: salt } }
}

/** 载入（主槽 → 备份槽，均失败返回 null） */
export function loadGame(): GameState | null {
  for (const key of [SAVE_KEY, BAK_KEY]) {
    const raw = localStorage.getItem(key)
    if (!raw) continue
    try {
      const data = JSON.parse(raw)
      if (isValidSave(data)) {
        // 拒绝高于当前版本的存档（防止旧客户端破坏新档）
        if (data.version > SAVE_VERSION) continue
        return ensureFields(migrate(data))
      }
    } catch {
      // 尝试下一槽位
    }
  }
  return null
}

export function exportSave(state: GameState): void {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const d = new Date()
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  a.href = url
  a.download = `forging-save-${stamp}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export async function importSaveFile(file: File): Promise<GameState | null> {
  try {
    const text = await file.text()
    const data = JSON.parse(text)
    if (!isValidSave(data)) return null
    return ensureFields(migrate(data))
  } catch {
    return null
  }
}

export function clearSave(): void {
  localStorage.removeItem(SAVE_KEY)
  localStorage.removeItem(BAK_KEY)
}
