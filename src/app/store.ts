// ============================================================
// Forging · 应用层 store（Vue reactive 快照 + dispatch 桥 + 主循环）
// 约定：UI 组件只读 store.state；一切变更经 cmd() / dispatch
// 启动顺序：载入→迁移→离线结算→任务轮换+基线快照→自动回收清扫
// ============================================================
import { reactive } from 'vue'
import { checkAchievements } from '../game/achievements'
import { sweepAutoRecycle } from '../game/automation'
import { pruneBuffs } from '../game/buffs'
import { advanceExpeditions } from '../game/expeditions'
import { dispatch } from '../game/commands'
import { CONTENT, skillName } from '../game/content'
import { settleOffline } from '../game/offline'
import { systemRng } from '../game/rng'
import { simulate } from '../game/settle'
import { newGame } from '../game/state'
import { checkTasks, refreshTasks } from '../game/tasks'
import type { ForgeCategory } from '../ui/types'
import { exportSave, loadGame, saveGame } from './persist'
import type {
  ActionRef,
  Command,
  GameEvent,
  GameState,
  OfflineSummary,
  SkillId,
} from '../game/types'

export interface Toast {
  id: number
  text: string
  kind: 'info' | 'good' | 'bad'
}

/** 主面板视图：四技能 + 传承 + 任务 + 商店 + 成就 + 设置 */
export type UiView = SkillId | 'prestige' | 'tasks' | 'expedition' | 'shop' | 'achievements' | 'settings'

const TITLE = 'Forging · 挖矿锻造放置游戏'

export const store = reactive({
  /** 内核状态（可序列化对象；模块加载后由 boot() 注入） */
  state: null as unknown as GameState,
  /** 离线摘要（非 null 时显示弹窗） */
  summary: null as OfflineSummary | null,
  toasts: [] as Toast[],
  ui: {
    view: 'mining' as UiView,
    dialogRef: null as ActionRef | null,
    forgeCategory: 'tool' as ForgeCategory,
    searchText: '',
    inspectItemId: null as string | null,
    /** v2.1：装备实例详情弹窗（含词缀与重铸） */
    inspectInstanceId: null as number | null,
  },
  now: Date.now(),
})

// ---------------- 未读提醒（页面隐藏时） ----------------

let unread = 0

function markUnread(): void {
  unread += 1
  document.title = `(${unread}) ${TITLE}`
}

function clearUnread(): void {
  if (unread === 0) return
  unread = 0
  document.title = TITLE
}

// ---------------- 事件 → 提示 ----------------

let toastSeq = 0

function pushToast(text: string, kind: Toast['kind']): void {
  const id = ++toastSeq
  store.toasts.push({ id, text, kind })
  window.setTimeout(() => {
    const i = store.toasts.findIndex((t) => t.id === id)
    if (i >= 0) store.toasts.splice(i, 1)
  }, 3200)
}

function handleEvents(events: GameEvent[]): void {
  for (const e of events) {
    switch (e.type) {
      case 'levelUp':
        pushToast(`${skillName(e.skill)} 升到 Lv${e.level}`, 'good')
        break
      case 'tutorialGoalMet':
        pushToast(`教程任务达成（第 ${e.step} 步）`, 'good')
        break
      case 'achievementUnlocked':
        pushToast(`🏆 成就达成：${e.name}`, 'good')
        if (document.hidden) markUnread()
        break
      case 'taskCompleted':
        pushToast(`📋 任务完成：${e.title}`, 'good')
        if (document.hidden) markUnread()
        break
      case 'tasksRotated':
        pushToast(e.period === 'daily' ? '📋 每日任务已刷新' : '📋 周常任务已刷新', 'info')
        break
      case 'crateOpened':
        pushToast(e.text, 'good')
        break
      case 'buffActivated':
        pushToast(`符文生效：${e.name}`, 'good')
        break
      case 'prestigeDone':
        pushToast(`🔮 传承完成：获得精通点 ×${e.points}`, 'good')
        if (document.hidden) markUnread()
        break
      case 'perkChanged':
        break
      case 'loadoutApplied':
        pushToast(`🎯 预设已应用：${e.name}`, 'good')
        break
      case 'enhanceResult':
        if (e.guarded) {
          pushToast(`🛡 庇护生效：强化失败但等级未降（+${e.from}）`, 'info')
        } else {
          pushToast(
            e.success ? `强化成功：+${e.from} → +${e.to}` : `强化失败：+${e.from} → +${e.to}`,
            e.success ? 'good' : 'bad',
          )
        }
        break
      case 'reforged':
        pushToast(
          `⚒ 重铸完成：${e.name} 完美度 ${Math.round(e.before * 100)}% → ${Math.round(e.after * 100)}%`,
          e.after >= e.before ? 'good' : 'info',
        )
        break
      case 'expeditionDispatched':
        pushToast(`🧭 远征出发：${e.routeName}（${e.hours}h）`, 'info')
        break
      case 'expeditionDone':
        pushToast(`🧭 远征完成：${e.routeName}（${e.success ? '成功' : '保底'}）`, e.success ? 'good' : 'info')
        break
      case 'expeditionClaimed':
        pushToast(`🧭 远征结算：${e.routeName} +${e.gold} 金`, 'good')
        break
      case 'companionRecruited':
        pushToast(e.duplicate ? `🧭 ${e.name} 获得经验（重复招募）` : `🧭 新伙伴加入：${e.name}`, 'good')
        break
      case 'companionLevelUp':
        pushToast(`🧭 ${e.name} 升到 Lv${e.level}`, 'good')
        break
      case 'traitRerolled':
        pushToast(`🧭 ${e.name} 特质变为「${e.trait}」`, 'info')
        break
      case 'bannerUpgraded':
        pushToast(`🧭 远征队旗帜升至 ${e.level} 级`, 'good')
        break
      case 'notice':
        pushToast(e.text, 'info')
        break
      case 'blocked':
        pushToast(e.reason, 'bad')
        break
      case 'actionStopped':
        if (e.reason === 'noMaterials') pushToast('材料或装备不足，动作已停止', 'bad')
        break
      default:
        break
    }
  }
}

// ---------------- 命令入口 ----------------

export function cmd(command: Command): void {
  const events = dispatch(store.state, command, Date.now())
  events.push(...checkAchievements(store.state))
  events.push(...refreshTasks(store.state, Date.now()))
  events.push(...checkTasks(store.state))
  handleEvents(events)
  saveNow()
}

export function pickAction(ref: ActionRef): void {
  store.ui.dialogRef = ref
}

export function closeDialog(): void {
  store.ui.dialogRef = null
}

export function setView(v: UiView): void {
  store.ui.view = v
}

export function inspectItem(id: string | null): void {
  store.ui.inspectItemId = id
}

/** v2.1：打开装备实例详情（词缀 + 重铸）；传 null 关闭 */
export function inspectInstance(instanceId: number | null): void {
  store.ui.inspectInstanceId = instanceId
}

// ---------------- 启动与主循环 ----------------

let lastSaveAt = 0

function saveNow(): void {
  try {
    saveGame(store.state)
    lastSaveAt = Date.now()
  } catch (e) {
    console.warn('[forging] 保存失败', e)
  }
}

export function boot(): void {
  const saved = loadGame()
  const state = saved ?? newGame('矿工', Date.now())
  store.state = state
  const now = Date.now()
  // ① 离线结算（不计入今日任务；临时增益不参与）
  const summary = settleOffline(state, now)
  // ② 任务轮换 + 基线快照
  refreshTasks(state, now)
  checkTasks(state)
  pruneBuffs(state, now)
  // ③ 自动回收清扫（含离线期间产出）
  sweepAutoRecycle(state)
  store.summary = summary
  if (summary) {
    for (const n of summary.notes) pushToast(n, 'info')
  }
  saveNow()
}

export function startLoop(): void {
  window.setInterval(() => {
    store.now = Date.now()
    const events = simulate(store.state, store.now, { mode: 'online', rng: systemRng() })
    advanceExpeditions(store.state, store.now, 'online', systemRng(), events)
    events.push(...checkAchievements(store.state))
    events.push(...refreshTasks(store.state, store.now))
    events.push(...checkTasks(store.state))
    pruneBuffs(store.state, store.now)
    events.push(...sweepAutoRecycle(store.state))
    if (events.length) handleEvents(events)
    if (Date.now() - lastSaveAt >= CONTENT.config.autosaveSec * 1000) saveNow()
  }, 250)
  window.addEventListener('beforeunload', () => saveNow())
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) clearUnread()
  })
  window.addEventListener('focus', clearUnread)
}

/** 导出存档（设置面板使用） */
export function exportCurrent(): void {
  exportSave(store.state)
}

// 开发模式调试句柄（用于验收与排障；生产构建不暴露）
if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__forging = store
}
