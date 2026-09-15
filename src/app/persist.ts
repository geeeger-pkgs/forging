// ============================================================
// Forging · 存档（localStorage 双槽 + 版本迁移 + 导出/导入）
// ============================================================
import type { GameState } from '../game/types'

const SAVE_KEY = 'forging.save'
const BAK_KEY = 'forging.save.bak'
export const SAVE_VERSION = 3

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
        return migrate(data)
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
    return migrate(data)
  } catch {
    return null
  }
}

export function clearSave(): void {
  localStorage.removeItem(SAVE_KEY)
  localStorage.removeItem(BAK_KEY)
}
