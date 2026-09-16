// ============================================================
// Forging · 存档（localStorage 双槽 + 版本迁移 + 导出/导入）
// ============================================================
import { perfectAffixCount, rollAffixes } from '../game/affixes'
import { checkCodexBackfill } from '../game/codex'
import { emptyCodex, normalizeCodex } from '../game/codex-store'
import { CONTENT } from '../game/content'
import { levelInfo } from '../game/level'
import { realignSeasonForEpoch } from '../game/season'
import type { EquipInstance, FxLevel, FxSetting, GameState, SettingsState } from '../game/types'

const SAVE_KEY = 'forging.save'
const BAK_KEY = 'forging.save.bak'
export const SAVE_VERSION = 14

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
  // v2.2：伙伴与远征（逐项补默认值；初始伙伴由 ensureFields 统一补，避免与 newGame 分叉）
  8: (s) => ({
    ...s,
    version: 9,
    companions: (s as unknown as { companions?: GameState['companions'] }).companions ?? {},
    meta: {
      ...s.meta,
      expeditions:
        (s.meta as unknown as { expeditions?: GameState['meta']['expeditions'] }).expeditions ?? {
          runs: [],
          banner: 0,
          nextRunId: 1,
        },
    },
    stats: {
      ...s.stats,
      totalExpeditions: s.stats.totalExpeditions ?? 0,
      totalRecruits: s.stats.totalRecruits ?? 0,
      totalRelics: s.stats.totalRelics ?? 0,
      totalTokensEarned: s.stats.totalTokensEarned ?? 0,
    },
  }),
  // v2.5：表现层设置（音效/音量/动效档；旧档默认开启音效，受首次手势策略约束）
  11: (s) => ({
    ...s,
    version: 12,
    meta: {
      ...s.meta,
      settings: (s.meta as unknown as { settings?: GameState['meta']['settings'] }).settings ?? { ...CONTENT.fx.defaults },
    },
  }),
  /**
   * v3.0：图鉴改位图（旧逗号串 → 位图，按内容表 id 顺序编位；遗物同池登记）。
   * 同时补 v3.0 新字段：实例级自动回收阈值（默认 60%，0 = 关闭）。
   * 迁移是**确定性**的：同一旧档必然得到同一位图。
   */
  12: (s) => {
    const legacy = (s as unknown as { codex?: Partial<Record<'items' | 'recipes' | 'affixes' | 'ores', string>> }).codex
    const next: GameState = {
      ...s,
      version: 13,
      codex: normalizeCodex({ bits: '', fp: '' }, legacy),
      meta: {
        ...s.meta,
        autoRecyclePerfect: (s.meta as unknown as { autoRecyclePerfect?: number }).autoRecyclePerfect ?? 60,
      },
    }
    // v3.0 C8：赛季 EPOCH 对齐（保留 renown/rewardedLevel，只重算 index 与任务集）
    realignSeasonForEpoch(next, Date.now())
    return next
  },
  // v2.4：深渊回廊（体力给满 12：迁移不纯但被持久化，与 newAffixSalt 同先例）
  10: (s) => ({
    ...s,
    version: 11,
    abyss:
      (s as unknown as { abyss?: GameState['abyss'] }).abyss ?? {
        bestFloor: 0,
        crystals: 0,
        stamina: CONTENT.abyss.staminaMax,
        staminaAt: Date.now(),
        purchased: {},
        tickets: 0,
        permanentSpeed: 0,
        title: false,
      },
    stats: {
      ...s.stats,
      totalAbyssSweeps: s.stats.totalAbyssSweeps ?? 0,
      totalAbyssPurchases: s.stats.totalAbyssPurchases ?? 0,
    },
  }),
  // v2.3：图鉴与赛季（codex 空串起步 + season 未解锁态 + 里程碑记录；冷启动回溯在 loadGame 后执行）
  9: (s) => ({
    ...s,
    version: 10,
    codex: (s as unknown as { codex?: GameState['codex'] }).codex ?? emptyCodex(),
    season:
      (s as unknown as { season?: GameState['season'] }).season ?? { index: -1, renown: 0, rewardedLevel: 0, tasks: [] },
    meta: {
      ...s.meta,
      codexMilestones: (s.meta as unknown as { codexMilestones?: string }).codexMilestones ?? '',
      seasonUnlockedOnce: (s.meta as unknown as { seasonUnlockedOnce?: boolean }).seasonUnlockedOnce ?? false,
    },
  }),
}

/** v3.4 A2：用当前技能等级回填历史最高技能等级（里程碑口径，单调不回退） */
MIGRATIONS[13] = (s) => {
  const skills = s.skills as Record<string, number>
  let best = 1
  for (const xp of Object.values(skills)) best = Math.max(best, levelInfo(Number(xp) || 0).level)
  return { ...s, version: 14, meta: { ...s.meta, bestSkillLevel: best } }
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
 * 设置消毒（幂等，v2.5）：缺字段补默认、非法档位回落 auto、音量夹紧到 0~100。
 * 与 commands.applySettings 同规则 —— 界面与存档两条入口都必须收敛到同一合法域。
 */
export function sanitizeSettings(raw: unknown): SettingsState {
  const d = CONTENT.fx.defaults
  const o = (raw ?? {}) as Partial<SettingsState>
  const fx: FxSetting =
    o.fx === 'auto' || (typeof o.fx === 'string' && CONTENT.fx.fxLevels.includes(o.fx as FxLevel)) ? (o.fx as FxSetting) : d.fx
  const vol = typeof o.volume === 'number' && Number.isFinite(o.volume) ? Math.round(o.volume) : d.volume
  return {
    sound: typeof o.sound === 'boolean' ? o.sound : d.sound,
    volume: Math.max(0, Math.min(100, vol)),
    fx,
  }
}

/**
 * 载入兜底（幂等）：补齐"技术上已是当前版本、但缺字段"的存档。
 * v2.1 测评 m5：v8 档若缺 affixSalt，旧实现静默回落 0 → 造装词缀可被外部预计算，此处补齐。
 */
function ensureFields(s: GameState): GameState {
  let out = s
  if (typeof out.meta.affixSalt !== 'number') {
    out = { ...out, meta: { ...out.meta, affixSalt: newAffixSalt() } }
  }
  if (!out.meta.expeditions) {
    out = { ...out, meta: { ...out.meta, expeditions: { runs: [], banner: 0, nextRunId: 1 } } }
  }
  if (!out.companions) out = { ...out, companions: {} }
  // v3.1：T4+ 计数（老档回填 0；此前的历史次数无法按档位追溯，如实从 0 起算）
  if (typeof (out.stats as unknown as Record<string, number>).totalEnhancesT4 !== 'number') {
    out = { ...out, stats: { ...out.stats, totalEnhancesT4: 0, totalReforgesT4: 0 } }
  }
  out = { ...out, codex: normalizeCodex(out.codex ?? { bits: '', fp: '' }, out.codex as never) }
  // v2.5：设置补齐 + 非法值消毒（手改存档/跨版本导入都不应让界面进入未定义档位）
  out = { ...out, meta: { ...out.meta, settings: sanitizeSettings(out.meta.settings) } }
  if (!out.abyss) {
    out = {
      ...out,
      abyss: { bestFloor: 0, crystals: 0, stamina: CONTENT.abyss.staminaMax, staminaAt: Date.now(), purchased: {}, tickets: 0, permanentSpeed: 0, title: false },
    }
  }
  if (!out.season) out = { ...out, season: { index: -1, renown: 0, rewardedLevel: 0, tasks: [] } }
  if (typeof out.meta.codexMilestones !== 'string') out = { ...out, meta: { ...out.meta, codexMilestones: '' } }
  if (typeof out.meta.seasonUnlockedOnce !== 'boolean') {
    out = { ...out, meta: { ...out.meta, seasonUnlockedOnce: false } }
  }
  // v2.2：老档若无任何伙伴，补发初始伙伴（否则远征永久不可用）
  const starter = CONTENT.expeditions.starter
  if (Object.keys(out.companions).length === 0 && CONTENT.companions.companions.some((c) => c.id === starter)) {
    const def = CONTENT.companions.companions.find((c) => c.id === starter) as { startLevel: number }
    out = { ...out, companions: { ...out.companions, [starter]: { level: def.startLevel, xp: 0, trait: CONTENT.expeditions.traits[0].id } } }
  }
  return out
}

/**
 * 纯函数反序列化（v2.5）：JSON 文本 → GameState（含校验/迁移/补字段/图鉴回填）。
 * 从 loadGame 与 importSaveFile 抽出来，使"迁移链 + 消毒"能在 node 测试里直接断言，
 * 而不是只能靠 localStorage/File 的桩（测试可读性 ↑，也避免两份逻辑漂移）。
 */
export function deserializeSave(raw: string): GameState | null {
  try {
    const data = JSON.parse(raw) as unknown
    if (!isValidSave(data)) return null
    // 拒绝高于当前版本的存档（防止旧客户端破坏新档）
    if ((data as GameState).version > SAVE_VERSION) return null
    const state = ensureFields(migrate(data as GameState))
    checkCodexBackfill(state)
    return state
  } catch {
    return null
  }
}

/** 载入（主槽 → 备份槽，均失败返回 null） */
export function loadGame(): GameState | null {
  for (const key of [SAVE_KEY, BAK_KEY]) {
    const raw = localStorage.getItem(key)
    if (!raw) continue
    const state = deserializeSave(raw)
    if (state) return state
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
    return deserializeSave(await file.text())
  } catch {
    return null
  }
}

export function clearSave(): void {
  localStorage.removeItem(SAVE_KEY)
  localStorage.removeItem(BAK_KEY)
}
