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
/** 音效调度耗时（playCue 微任务内部，v2.5 测评 M2）：与 tick 分开记，两者相加才是表现层真实开销 */
const buildSamples: number[] = []

const counters = {
  bursts: 0,
  burstsThisSecond: 0,
  popups: 0,
  particles: 0,
  /** 峰值：烟测在任意时刻读数，瞬时值可能刚好为 0（粒子/飘字都是短命对象），
   *  峰值才能证明"确实出现/确实从未出现"（R4 的判定依据） */
  peakParticles: 0,
  peakPopups: 0,
  lastCue: null as string | null,
  cues: 0,
}
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

/** 主循环中表现层开销（ms，仅同步段：映射 + 入队） */
export function recordTick(ms: number): void {
  if (!visible()) return
  push(tickSamples, ms)
}

/** 单条音效的调度耗时（ms，微任务内） */
export function recordBuild(ms: number): void {
  if (!visible()) return
  push(buildSamples, ms)
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
  if (particles > counters.peakParticles) counters.peakParticles = particles
  if (popups > counters.peakPopups) counters.peakPopups = popups
}

/**
 * 分位数统计。样本少时 P95 会退化成"最大值"，容易把一次 JIT 预热当成常态，
 * 因此同时给出 p50 / p95 / max —— 烟测报告三者都记，避免用单点结论糊弄评审。
 */
function stat(arr: number[]): { p50: number; p95: number; max: number; samples: number } {
  if (arr.length === 0) return { p50: 0, p95: 0, max: 0, samples: 0 }
  const sorted = [...arr].sort((a, b) => a - b)
  const at = (q: number): number => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]
  return { p50: at(0.5), p95: at(0.95), max: sorted[sorted.length - 1], samples: sorted.length }
}

export function fxSnapshot(): {
  draw: { p50: number; p95: number; max: number; samples: number; budget: number }
  tick: { p50: number; p95: number; max: number; samples: number; budget: number }
  audio: { p50: number; p95: number; max: number; samples: number }
  particles: number
  popups: number
  peakParticles: number
  peakPopups: number
  bursts: number
  cues: number
  lastCue: string | null
  /** 被总线丢弃的表现指令数（B1 不变量：常驻表现层下应恒为 0） */
  sceneDropped: number
  visible: boolean
} {
  return {
    draw: { ...stat(drawSamples), budget: CONTENT.fx.budget.frameBudgetMs },
    tick: { ...stat(tickSamples), budget: CONTENT.fx.budget.loopBudgetMs },
    audio: stat(buildSamples),
    particles: counters.particles,
    popups: counters.popups,
    peakParticles: counters.peakParticles,
    peakPopups: counters.peakPopups,
    bursts: counters.bursts,
    cues: counters.cues,
    lastCue: counters.lastCue,
    sceneDropped: droppedGetter(),
    visible: visible(),
  }
}

/**
 * 总线丢弃计数读取器（由 store 注入 scene-bus 的 sceneDropped）。
 * 探针不 import 总线：保持"探针只被注入、不反向依赖"的形状。
 */
let droppedGetter: () => number = () => 0
export function attachSceneDropped(fn: () => number): void {
  droppedGetter = fn
}

/** DEV 下挂 window.__fx（烟测读数落点） */
export function installFxProbe(): void {
  if (typeof window === 'undefined') return
  ;(window as unknown as Record<string, unknown>).__fx = {
    snapshot: fxSnapshot,
    /** 烟测用：清窗口/峰值，做"改档位 → 重置 → 观察"的前后对比（R4） */
    reset: __resetFxProbe,
    /** 由 store 注入，避免探针依赖 store（node 下不可导入） */
    audio: null as unknown,
  }
}

/**
 * 注入音频状态读取函数（存**函数**而非函数结果，v2.5 烟测修正）。
 * R1 比较的是"手势前 ready=false → 手势后 ready=true"的前后变化，
 * 存启动瞬间的快照值只会让烟测永远读到旧值。
 */
export function attachAudioStatus(fn: () => unknown): void {
  if (typeof window === 'undefined') return
  const w = window as unknown as { __fx?: { audio: unknown } }
  if (w.__fx) w.__fx.audio = fn
}

/** 仅测试用 */
export function __resetFxProbe(): void {
  drawSamples.length = 0
  tickSamples.length = 0
  buildSamples.length = 0
  counters.bursts = 0
  counters.burstsThisSecond = 0
  counters.popups = 0
  counters.particles = 0
  counters.peakParticles = 0
  counters.peakPopups = 0
  counters.lastCue = null
  counters.cues = 0
  secondMark = 0
}
