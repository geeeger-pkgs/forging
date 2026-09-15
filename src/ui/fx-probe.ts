// ============================================================
// Forging · 表现层探针（v2.5）
// 设计：docs/design-v2.5.md §3.2 —— 烟测需要有**真实读数落点**（评审 B1/B3）：
//   - 采样的是「表现层自身代码耗时」（performance.now 前后差），而非 rAF 帧间隔
//     （放置游戏常驻后台会被节流，帧间隔无意义）
//   - 仅在 document.visibilityState === 'visible' 时采样
//   - DEV 下把只读快照挂到 window.__fx 供烟测读取
// ============================================================
import { CONTENT } from '../game/content'

const WINDOW = 180
const drawSamples: number[] = []
const tickSamples: number[] = []

const counters = { bursts: 0, burstsThisSecond: 0, popups: 0, particles: 0, lastCue: null as string | null, cues: 0 }
let secondMark = 0

function visible(): boolean {
  return typeof document === 'undefined' || document.visibilityState === 'visible'
}

function push(arr: number[], v: number): void {
  arr.push(v)
  if (arr.length > WINDOW) arr.shift()
}

/** 场景层单帧绘制耗时（ms） */
export function recordDraw(ms: number): void {
  if (!visible()) return
  push(drawSamples, ms)
}

/** 主循环中表现层开销（ms） */
export function recordTick(ms: number): void {
  if (!visible()) return
  push(tickSamples, ms)
}

export function noteCue(id: string): void {
  counters.lastCue = id
  counters.cues += 1
}

/** 一次交互爆发（受频率上限约束，超出返回 false） */
export function requestBurst(): boolean {
  const now = Date.now()
  if (now - secondMark >= 1000) {
    secondMark = now
    counters.burstsThisSecond = 0
  }
  if (counters.burstsThisSecond >= CONTENT.fx.budget.maxBurstsPerSecond) return false
  counters.burstsThisSecond += 1
  counters.bursts += 1
  return true
}

export function setLiveCounts(particles: number, popups: number): void {
  counters.particles = particles
  counters.popups = popups
}

function p95(arr: number[]): number {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]
}

export function fxSnapshot(): {
  draw: { p95: number; samples: number; budget: number }
  tick: { p95: number; samples: number; budget: number }
  particles: number
  popups: number
  bursts: number
  cues: number
  lastCue: string | null
  visible: boolean
} {
  return {
    draw: { p95: p95(drawSamples), samples: drawSamples.length, budget: CONTENT.fx.budget.frameBudgetMs },
    tick: { p95: p95(tickSamples), samples: tickSamples.length, budget: CONTENT.fx.budget.loopBudgetMs },
    particles: counters.particles,
    popups: counters.popups,
    bursts: counters.bursts,
    cues: counters.cues,
    lastCue: counters.lastCue,
    visible: visible(),
  }
}

/** DEV 下挂 window.__fx（烟测读数落点） */
export function installFxProbe(): void {
  if (typeof window === 'undefined') return
  ;(window as unknown as Record<string, unknown>).__fx = {
    snapshot: fxSnapshot,
    /** 由 store 注入，避免探针依赖 store（node 下不可导入） */
    audio: null as unknown,
  }
}

export function attachAudioStatus(fn: () => unknown): void {
  if (typeof window === 'undefined') return
  const w = window as unknown as { __fx?: { audio: unknown } }
  if (w.__fx) w.__fx.audio = fn()
}

/** 仅测试用 */
export function __resetFxProbe(): void {
  drawSamples.length = 0
  tickSamples.length = 0
  counters.bursts = 0
  counters.burstsThisSecond = 0
  counters.popups = 0
  counters.particles = 0
  counters.lastCue = null
  counters.cues = 0
  secondMark = 0
}
