// ============================================================
// Forging · 离线结算（期望模式，设计 §10）
// 规则：cap 8h；复用结算内核；强化不参与；材料不足停止；回线摘要
// ============================================================
import { CONTENT } from './content'
import { checkCodexMilestones } from './codex'
import { advanceExpeditions } from './expeditions'
import { checkSeason } from './season'
import { perkBonuses } from './prestige'
import { simulate } from './settle'
import type { ActionRef, GameEvent, GameState, OfflineSummary, SkillId } from './types'

function refKey(ref: ActionRef): string {
  if (ref.kind === 'mine') return `mine:${ref.siteId}`
  if (ref.kind === 'craft') return `craft:${ref.recipeId}`
  return `enhance:${ref.instanceId}`
}

export function settleOffline(state: GameState, now: number): OfflineSummary | null {
  const elapsed = now - state.meta.lastSeenAt
  if (elapsed <= 0) {
    state.meta.lastSeenAt = Math.max(state.meta.lastSeenAt, now)
    return null
  }

  // v1.5：离线上限 = 基础 8h + 离线精通加成
  const capHours = CONTENT.config.offlineCapHours + perkBonuses(state).offlineHours
  const capMs = capHours * 3_600_000
  const counted = Math.min(elapsed, capMs)
  const notes: string[] = []
  if (counted < elapsed) notes.push(`离线时长超过 ${capHours} 小时上限，超出部分未结算`)

  // 强化不参与离线：跳过当前/队列中的强化动作
  const cur = state.actions.current
  if (cur && cur.ref.kind === 'enhance') {
    const next = state.actions.queue.shift()
    if (next) {
      next.startedAt = state.meta.lastSeenAt
      next.durationMs = 0
      state.actions.current = next
    } else {
      state.actions.current = null
    }
    notes.push('当前强化动作不参与离线结算，已跳过')
  }
  const qBefore = state.actions.queue.length
  state.actions.queue = state.actions.queue.filter((a) => a.ref.kind !== 'enhance')
  if (state.actions.queue.length !== qBefore) notes.push('队列中的强化动作不参与离线结算，已跳过')

  const events: GameEvent[] = []
  // v2.2：远征推进（离线规则 1：只结算「完成时刻落在 cap 窗口内」的 run；规则 2：不自动续派）
  advanceExpeditions(state, state.meta.lastSeenAt + counted, 'expectation', null, events)
  // v1.4：临时增益（符文）不参与离线结算——结算期间临时清空 buffs，结束后恢复（照常计时/过期）
  const buffsBackup = state.buffs
  state.buffs = []
  simulate(state, state.meta.lastSeenAt + counted, { mode: 'expectation', events, maxRounds: 200_000 })
  state.buffs = buffsBackup
  state.meta.lastSeenAt = now // 超出 cap 的时长不结转
  // v2.3：赛季进度与图鉴里程碑（计数器单调递增，天然含离线产出；强化/重铸离线不增长）
  checkSeason(state)
  events.push(...checkCodexMilestones(state))

  // ---- 汇总 ----
  const exped: OfflineSummary['expeditions'] = []
  const roundsMap = new Map<string, { ref: ActionRef; count: number }>()
  const itemsMap = new Map<string, number>()
  const xpMap = new Map<SkillId, number>()
  const levels: { skill: SkillId; level: number }[] = []

  for (const ev of events) {
    switch (ev.type) {
      case 'actionCompleted': {
        const k = refKey(ev.ref)
        const hit = roundsMap.get(k)
        if (hit) hit.count += ev.rounds
        else roundsMap.set(k, { ref: ev.ref, count: ev.rounds })
        break
      }
      case 'itemsGained':
        for (const it of ev.items) itemsMap.set(it.itemId, (itemsMap.get(it.itemId) ?? 0) + it.qty)
        break
      case 'xpGained':
        xpMap.set(ev.skill, (xpMap.get(ev.skill) ?? 0) + ev.xp)
        break
      case 'levelUp':
        levels.push({ skill: ev.skill, level: ev.level })
        break
      case 'expeditionDone':
        exped.push({ routeName: ev.routeName, hours: ev.hours, success: ev.success, gold: ev.gold, expected: ev.expected })
        break
      case 'notice':
        notes.push(ev.text)
        break
      case 'blocked':
        notes.push(ev.reason)
        break
      case 'actionStopped':
        if (ev.reason === 'noMaterials') notes.push('材料或装备不足，动作已停止')
        break
      default:
        break
    }
  }

  const summary: OfflineSummary = {
    elapsedMs: elapsed,
    countedMs: counted,
    rounds: [...roundsMap.values()],
    items: [...itemsMap.entries()].map(([itemId, qty]) => ({ itemId, qty })),
    xp: [...xpMap.entries()].map(([skill, xp]) => ({ skill, xp })),
    levels,
    expeditions: exped,
    notes,
  }
  // 无任何结算内容时不弹摘要（但 lastSeenAt 已推进）
  const empty =
    summary.rounds.length === 0 &&
    summary.expeditions.length === 0 &&
    summary.items.length === 0 &&
    summary.xp.length === 0 &&
    summary.levels.length === 0 &&
    summary.notes.length === 0
  return empty ? null : summary
}
