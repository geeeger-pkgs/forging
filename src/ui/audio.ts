// ============================================================
// Forging · 程序化音效引擎（v2.5）
// 设计：docs/design-v2.5.md §2.1 —— 零外部资源（振荡器 + 包络 + 噪声缓冲）
//
// 硬规则：
//   1. AudioContext **不在模块加载时创建**：首次真实用户手势（pointerdown/keydown）后才创建并 resume
//      → 满足浏览器自动播放策略；在此之前 playCue 静默返回 false（不报错、不排队）
//   2. 同时发声上限 maxConcurrentVoices（超出丢弃新请求，避免爆音与 CPU 尖峰）
//   3. sound=false 或 volume=0 → 完全不创建节点
//   4. resume() 失败（策略拒绝）→ 保持未就绪态，下次手势重试；不抛错
// ============================================================
import { CONTENT } from '../game/content'
import type { FxCueDef } from '../game/types'

const CUES: ReadonlyMap<string, FxCueDef> = new Map(CONTENT.fx.cues.map((c) => [c.id, c]))
const BUDGET = CONTENT.fx.budget

interface AudioState {
  ctx: AudioContext | null
  master: GainNode | null
  volume: number
  enabled: boolean
  active: number
  /** 供测试与调试读取 */
  lastError: string | null
}

const state: AudioState = {
  ctx: null,
  master: null,
  volume: CONTENT.fx.defaults.volume / 100,
  enabled: CONTENT.fx.defaults.sound,
  active: 0,
  lastError: null,
}

/** 最小可用的 AudioContext 构造器（测试可注入假的实现） */
type CtxFactory = new () => AudioContext
let ctxFactory: CtxFactory | null = null

export function setAudioContextFactory(f: CtxFactory | null): void {
  ctxFactory = f
  state.ctx = null
  state.master = null
}

function ensureContext(): AudioContext | null {
  if (state.ctx) return state.ctx
  try {
    const Ctor =
      ctxFactory ??
      ((globalThis as unknown as { AudioContext?: new () => AudioContext; webkitAudioContext?: new () => AudioContext })
        .AudioContext ??
        (globalThis as unknown as { webkitAudioContext?: new () => AudioContext }).webkitAudioContext)
    if (!Ctor) {
      state.lastError = 'no-audio-context'
      return null
    }
    const ctx = new Ctor()
    const master = ctx.createGain()
    master.gain.value = state.volume
    master.connect(ctx.destination)
    state.ctx = ctx
    state.master = master
    return ctx
  } catch (e) {
    state.lastError = String(e)
    return null
  }
}

/**
 * 用户手势后调用（幂等）：创建并 resume 音频上下文。
 * 返回是否已就绪。策略拒绝时返回 false 且不抛错（下次手势会重试）。
 */
export function unlockAudio(): boolean {
  if (!state.enabled || state.volume <= 0) return false
  const ctx = ensureContext()
  if (!ctx) return false
  if (ctx.state === 'suspended') {
    void ctx.resume().catch((e: unknown) => {
      state.lastError = String(e)
    })
  }
  // 预热噪声缓冲：把手势之外的首次构建成本提前付掉（不在动作结算帧里付）
  try {
    noise(ctx)
  } catch {
    // 预失败不影响发声（真用到时再试）
  }
  return true
}

/** 首次手势监听（幂等安装；HMR 下不重复注册） */
let installed = false
type GestureTarget = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>
export function installGestureUnlock(target: GestureTarget = document): void {
  if (installed) return
  installed = true
  const handler = (): void => {
    if (unlockAudio()) {
      target.removeEventListener('pointerdown', handler)
      target.removeEventListener('keydown', handler)
    }
  }
  target.addEventListener('pointerdown', handler)
  target.addEventListener('keydown', handler)
}

export function setAudioEnabled(on: boolean): void {
  state.enabled = on
}

export function setAudioVolume(v0to100: number): void {
  state.volume = Math.max(0, Math.min(1, v0to100 / 100))
  if (state.master) state.master.gain.value = state.volume
}

export function audioReady(): boolean {
  return state.ctx !== null && state.ctx.state === 'running'
}

/** 调试/烟测用状态快照 */
export function audioStatus(): { ready: boolean; ctxState: string | null; active: number; volume: number; enabled: boolean } {
  return {
    ready: audioReady(),
    ctxState: state.ctx ? state.ctx.state : null,
    active: state.active,
    volume: state.volume,
    enabled: state.enabled,
  }
}

/**
 * 噪声缓冲（懒创建，1 秒白噪声）。
 * 首次创建要填 48000 个样本（实测 ~1ms 尖峰）→ 不能落在动作结算路径上，
 * 因此在 unlockAudio（用户手势、非结算帧）时预热（v2.5 烟测 R3 修正）。
 */
let noiseBuf: AudioBuffer | null = null
function noise(ctx: AudioContext): AudioBuffer {
  if (noiseBuf) return noiseBuf
  const len = Math.floor(ctx.sampleRate)
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  noiseBuf = buf
  return buf
}

/**
 * 播放一条音效。返回是否真的发声（未就绪/被禁用/超并发 → false）。
 * 音色：wave=sine|square|triangle|sawtooth 走振荡器；noise 走白噪声 + 低通。
 */
export function playCue(id: string, opts: { gain?: number; detune?: number } = {}): boolean {
  // 判定同步完成（返回值 = "这条会不会响"），**建图异步**：
  // WebAudio 节点构建是毫秒级工作，若放在动作结算路径上会顶穿主循环预算（烟测 R3 实测 1.7ms/0.5ms）。
  // queueMicrotask 而非 setTimeout：微任务不被后台节流，同帧内完成，听感无差别。
  if (!state.enabled || state.volume <= 0) return false
  // 只读**已存在**的上下文，绝不在这里创建：
  //   1) 自动播放策略要求创建只发生在用户手势里（unlockAudio）
  //   2) 构造 AudioContext 是 5~15ms 级操作，放在事件分发路径上会直接爆帧
  //      （v2.5 烟测实测：boot 首批事件 tick 12.2ms，修完回到 0.1~0.4ms）
  const ctx = state.ctx
  if (!ctx || ctx.state !== 'running' || !state.master) return false
  const cue = CUES.get(id)
  if (!cue) return false
  if (state.active >= BUDGET.maxConcurrentVoices) return false

  state.active += 1
  globalThis.setTimeout(() => {
    state.active = Math.max(0, state.active - 1)
  }, cue.durationMs + 20)

  const master = state.master
  globalThis.queueMicrotask(() => {
    try {
      const now = ctx.currentTime
      const dur = cue.durationMs / 1000
      const perNote = dur / Math.max(1, cue.freqs.length)
      const gainScale = (opts.gain ?? 1) * cue.gain
      cue.freqs.forEach((freq, i) => {
        const start = now + i * perNote
        const end = start + perNote
        const g = ctx.createGain()
        g.gain.setValueAtTime(0, start)
        g.gain.linearRampToValueAtTime(gainScale, start + Math.min(0.02, perNote * 0.3))
        g.gain.exponentialRampToValueAtTime(0.0001, end)
        g.connect(master)
        if (cue.wave === 'noise') {
          const src = ctx.createBufferSource()
          src.buffer = noise(ctx)
          const lp = ctx.createBiquadFilter()
          lp.type = 'lowpass'
          lp.frequency.value = freq * 2
          src.connect(lp)
          lp.connect(g)
          src.start(start)
          src.stop(end)
        } else {
          const osc = ctx.createOscillator()
          osc.type = cue.wave
          osc.frequency.value = freq
          if (opts.detune) osc.detune.value = opts.detune
          osc.connect(g)
          osc.start(start)
          osc.stop(end)
        }
      })
    } catch (e) {
      state.lastError = String(e)
    }
  })
  return true
}

/** 音效清单（UI「试听」与审计共用） */
export function cueList(): { id: string; name: string }[] {
  return CONTENT.fx.cues.map((c) => ({ id: c.id, name: c.name }))
}

/** 仅测试用：重置内部状态 */
export function __resetAudioForTest(): void {
  state.ctx = null
  state.master = null
  state.active = 0
  state.enabled = CONTENT.fx.defaults.sound
  state.volume = CONTENT.fx.defaults.volume / 100
  state.lastError = null
  noiseBuf = null
  installed = false
}
