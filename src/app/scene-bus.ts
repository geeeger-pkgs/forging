// ============================================================
// Forging · 表现指令总线（v2.5）
// 设计：docs/design-v2.5.md §2.6 #7 —— store 只负责把 FxPlan 推进总线，
// 全局表现层 FxLayer 订阅总线执行绘制；两者不互相 import（评审 B1 的落点问题）
//
// v2.5 测评 B1 修正：**无订阅者时直接丢弃，不做队列缓存**。
// 原实现把表现缓存在 pending 里等组件挂载后补放，而组件只在技能页挂载 →
// 在设置/深渊页挂机后切回技能页会一次性"迟到重放"最多 8 条过期飘字/爆发。
// 表现是**即时反馈**，过期即无意义；FxLayer 常驻后订阅者始终存在。
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
/** 统计：无订阅者时被丢弃的指令数（供测试断言"丢弃而非缓存"） */
let dropped = 0

export function subscribeScene(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function emitScene(cmd: SceneCommand): void {
  if (listeners.size === 0) {
    dropped += 1
    return
  }
  for (const fn of listeners) fn(cmd)
}

/** 仅测试/诊断用：被丢弃的指令数 */
export function sceneDropped(): number {
  return dropped
}

/** 仅测试用 */
export function __resetSceneBus(): void {
  listeners.clear()
  dropped = 0
}
