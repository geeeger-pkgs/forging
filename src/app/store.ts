// ============================================================
// Forging · 应用层 store（Vue reactive 快照 + dispatch 桥 + 主循环）
// 约定：UI 组件只读 store.state；一切变更经 cmd() / dispatch
// ============================================================
import { reactive } from 'vue'
import { dispatch } from '../game/commands'
import { CONTENT, skillName } from '../game/content'
import { settleOffline } from '../game/offline'
import { systemRng } from '../game/rng'
import { simulate } from '../game/settle'
import { newGame } from '../game/state'
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

export const store = reactive({
  /** 内核状态（可序列化对象；模块加载后由 boot() 注入） */
  state: null as unknown as GameState,
  /** 离线摘要（非 null 时显示弹窗） */
  summary: null as OfflineSummary | null,
  toasts: [] as Toast[],
  ui: {
    activeSkill: 'mining' as SkillId,
    dialogRef: null as ActionRef | null,
    forgeCategory: 'tool' as 'tool' | 'weapon' | 'armor',
  },
  now: Date.now(),
})

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
      case 'enhanceResult':
        pushToast(
          e.success ? `强化成功：+${e.from} → +${e.to}` : `强化失败：+${e.from} → +${e.to}`,
          e.success ? 'good' : 'bad',
        )
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
  handleEvents(events)
  saveNow()
}

export function pickAction(ref: ActionRef): void {
  store.ui.dialogRef = ref
}

export function closeDialog(): void {
  store.ui.dialogRef = null
}

export function setSkill(id: SkillId): void {
  store.ui.activeSkill = id
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
  const summary = settleOffline(state, Date.now())
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
    if (events.length) handleEvents(events)
    if (Date.now() - lastSaveAt >= CONTENT.config.autosaveSec * 1000) saveNow()
  }, 250)
  window.addEventListener('beforeunload', () => saveNow())
}

/** 导出存档（设置面板使用） */
export function exportCurrent(): void {
  exportSave(store.state)
}
