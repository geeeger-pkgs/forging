// ============================================================
// Forging · 表现指令总线（v2.5）
// 设计：docs/design-v2.5.md §2.6 #7 —— store 只负责把 FxPlan 推进总线，
// SceneCanvas 订阅总线执行绘制；两者不互相 import（评审 B1 的落点问题）
// ============================================================
import type { BurstKind } from '../ui/fx-map'

export interface SceneCommand {
  kind: 'burst' | 'ring' | 'popup'
  burst?: BurstKind
  ring?: boolean
  text?: string
  popupKind?: 'item' | 'xp' | 'gold'
}

type Listener = (cmd: SceneCommand) => void

const listeners = new Set<Listener>()
/** 未挂载时的短队列（组件挂载后补放，避免开场丢表现） */
const pending: SceneCommand[] = []

export function subscribeScene(fn: Listener): () => void {
  listeners.add(fn)
  while (pending.length > 0) {
    const cmd = pending.shift()
    if (cmd) fn(cmd)
  }
  return () => listeners.delete(fn)
}

export function emitScene(cmd: SceneCommand): void {
  if (listeners.size === 0) {
    if (pending.length < 8) pending.push(cmd)
    return
  }
  for (const fn of listeners) fn(cmd)
}

/** 仅测试用 */
export function __resetSceneBus(): void {
  listeners.clear()
  pending.length = 0
}
