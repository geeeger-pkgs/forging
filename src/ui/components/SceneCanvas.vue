// ============================================================
// Forging · Canvas 场景层（程序化动画；纯装饰，不参与游戏逻辑）
// 随当前动作切换：挖矿 / 熔炼 / 锻造 / 强化 / 空闲
// ============================================================
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { store } from '../../app/store'
import { subscribeScene } from '../../app/scene-bus'
import { recordDraw } from '../fx-probe'
import { CONTENT } from '../../game/content'
import { skillOf } from '../../game/refs'
import type { SkillId } from '../../game/types'

const canvasRef = ref<HTMLCanvasElement | null>(null)
const W = 760
const H = 120
let raf = 0
/** v2.5：预算与上限一律取自内容表（单一来源；评审 M5 修掉 MAX_P 双真值） */
const BUDGET = CONTENT.fx.budget
const MAX_P = BUDGET.maxParticles

/** v2.5：飘字与光环（表现层；off/reduced 档由 store 侧决定是否入队） */
interface Popup {
  text: string
  kind: 'item' | 'xp' | 'gold'
  x: number
  y: number
  life: number
  max: number
}
interface Ring {
  x: number
  y: number
  life: number
  max: number
}
const popups: Popup[] = []
const rings: Ring[] = []
const POPUP_COLORS: Record<Popup['kind'], string> = { item: '#7fd4c1', xp: '#4f7cff', gold: '#f5a623' }

function pushPopup(text: string, kind: Popup['kind']): void {
  if (popups.length >= BUDGET.maxPopups) popups.shift()
  popups.push({ text, kind, x: W * 0.5 + (Math.random() - 0.5) * 80, y: H * 0.55, life: 0, max: 90 })
}

function pushRing(): void {
  if (rings.length >= 3) rings.shift()
  rings.push({ x: W * 0.5, y: H * 0.5, life: 0, max: 48 })
}

interface P {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  size: number
  color: string
  gravity: number
}

const particles: P[] = []

const BURST_COLORS = {
  spark: ['#f5a623', '#ffd77a', '#e2544a'],
  ore: ['#c98a5b', '#8a5a3a', '#d9b08c'],
  dust: ['#8a93ad', '#6e7690', '#aab3c8'],
  // v2.5 新增：强化成功 / 失败 / 庇护 / 深渊
  gold: ['#ffd77a', '#f5a623', '#fff3c4'],
  gray: ['#6e7690', '#8a93ad', '#454d63'],
  blue: ['#4f7cff', '#8fb0ff', '#cfe0ff'],
  abyss: ['#c26ef0', '#7f9bff', '#e0b3ff'],
} as const

function burst(x: number, y: number, kind: keyof typeof BURST_COLORS, count: number): void {
  const colors = BURST_COLORS[kind]
  for (let i = 0; i < count && particles.length < MAX_P; i++) {
    const a = Math.random() * Math.PI * 2
    const sp = 0.5 + Math.random() * 2.4
    particles.push({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 1.4,
      life: 0,
      max: 40 + Math.random() * 40,
      size: 1 + Math.random() * 2.4,
      color: colors[Math.floor(Math.random() * colors.length)],
      gravity: kind === 'spark' ? 0.045 : 0.09,
    })
  }
}

let lastKey = ''
let lastProgress = 0

function frame(): void {
  raf = requestAnimationFrame(frame)
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const t0 = performance.now()

  const act = store.state.actions.current
  const key = act ? JSON.stringify(act.ref) : 'idle'
  const progress = act ? Math.min(1, Math.max(0, (Date.now() - act.startedAt) / Math.max(1, act.durationMs))) : 0
  const skill: SkillId | null = act ? skillOf(act.ref) : null

  // 完成 / 切动作 → 粒子爆发
  if ((key !== lastKey || progress < lastProgress - 0.02) && lastKey !== '' && lastKey !== 'idle') {
    if (skill === 'mining') burst(W * 0.62, H * 0.52, 'ore', 16)
    else if (skill === 'smelting') burst(W * 0.42, H * 0.42, 'spark', 18)
    else if (skill === 'forging') burst(W * 0.5, H * 0.5, 'spark', 22)
    else if (skill === 'enhancing') burst(W * 0.5, H * 0.45, 'spark', 24)
  }
  lastKey = key
  lastProgress = progress

  // 背景
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, '#10152a')
  g.addColorStop(1, '#0a0d18')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#151b30'
  ctx.fillRect(0, H - 20, W, 20)
  ctx.strokeStyle = '#232c4a'
  ctx.beginPath()
  ctx.moveTo(0, H - 20)
  ctx.lineTo(W, H - 20)
  ctx.stroke()

  // 环境浮尘（仅 full 档；reduced/off 关闭）
  const fxLevel = resolveFxLevel()
  if (fxLevel === 'full' && Math.random() < 0.07 && particles.length < MAX_P) {
    particles.push({
      x: Math.random() * W,
      y: H - 20,
      vx: -0.2 + Math.random() * 0.4,
      vy: -0.2 - Math.random() * 0.4,
      life: 0,
      max: 140,
      size: 1,
      color: '#3a4568',
      gravity: -0.001,
    })
  }

  const t = Date.now() / 1000
  if (skill === 'mining') drawMining(ctx, progress)
  else if (skill === 'smelting') drawFurnace(ctx, progress, t)
  else if (skill === 'forging') drawAnvil(ctx, progress)
  else if (skill === 'enhancing') drawEnhance(ctx, progress, t)
  else drawIdle(ctx, t)

  // 粒子
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]
    p.life++
    p.x += p.vx
    p.y += p.vy
    p.vy += p.gravity
    const lifeT = 1 - p.life / p.max
    if (lifeT <= 0 || p.y > H + 10) {
      particles.splice(i, 1)
      continue
    }
    ctx.globalAlpha = Math.max(0, lifeT)
    ctx.fillStyle = p.color
    ctx.fillRect(p.x, p.y, p.size, p.size)
  }
  ctx.globalAlpha = 1

  // 底部进度细线
  if (act) {
    ctx.fillStyle = 'rgba(79,124,255,0.25)'
    ctx.fillRect(0, H - 3, W, 3)
    ctx.fillStyle = '#f5a623'
    ctx.fillRect(0, H - 3, W * progress, 3)
  }

  // v2.5 飘字
  for (let i = popups.length - 1; i >= 0; i--) {
    const p = popups[i]
    p.life += 1
    p.y -= 0.55
    if (p.life >= p.max) {
      popups.splice(i, 1)
      continue
    }
    const a = 1 - p.life / p.max
    ctx.globalAlpha = Math.max(0, a)
    ctx.fillStyle = POPUP_COLORS[p.kind]
    ctx.font = '600 12px ui-sans-serif, system-ui'
    ctx.textAlign = 'center'
    ctx.fillText(p.text, p.x, p.y)
  }
  ctx.globalAlpha = 1
  ctx.textAlign = 'start'

  // v2.5 光环（升级/成就/深渊）
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i]
    r.life += 1
    if (r.life >= r.max) {
      rings.splice(i, 1)
      continue
    }
    const k = r.life / r.max
    ctx.globalAlpha = Math.max(0, 0.5 * (1 - k))
    ctx.strokeStyle = '#f5a623'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(r.x, r.y, 6 + k * 42, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.globalAlpha = 1

  recordDraw(performance.now() - t0)
}

function drawMining(ctx: CanvasRenderingContext2D, progress: number): void {
  ctx.fillStyle = '#2a3352'
  ctx.beginPath()
  ctx.moveTo(W * 0.56, H - 20)
  ctx.lineTo(W * 0.64, H - 62)
  ctx.lineTo(W * 0.72, H - 42)
  ctx.lineTo(W * 0.78, H - 20)
  ctx.closePath()
  ctx.fill()
  const phase = Math.sin(progress * Math.PI)
  const ang = -0.9 + phase * 1.5
  ctx.save()
  ctx.translate(W * 0.6, H - 28)
  ctx.rotate(ang)
  ctx.strokeStyle = '#b98a5b'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(0, -46)
  ctx.stroke()
  ctx.strokeStyle = '#cfd6e4'
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.arc(0, -46, 14, Math.PI * 0.15, Math.PI * 0.85, false)
  ctx.stroke()
  ctx.restore()
}

function drawFurnace(ctx: CanvasRenderingContext2D, progress: number, t: number): void {
  const x = W * 0.34
  const y = H - 64
  ctx.fillStyle = '#232c4a'
  ctx.fillRect(x, y, 64, 44)
  ctx.fillStyle = '#1a2036'
  ctx.fillRect(x + 10, y + 14, 44, 30)
  const flick = 0.55 + 0.45 * Math.sin(t * 9) + 0.2 * progress
  ctx.globalAlpha = Math.max(0.15, Math.min(1, flick))
  ctx.fillStyle = '#f5a623'
  ctx.beginPath()
  ctx.moveTo(x + 22, y + 40)
  ctx.quadraticCurveTo(x + 32, y + 12 - 10 * progress, x + 42, y + 40)
  ctx.closePath()
  ctx.fill()
  ctx.globalAlpha = 1
  ctx.fillStyle = '#151b30'
  ctx.fillRect(x + 26, y - 10, 12, 10)
}

function drawAnvil(ctx: CanvasRenderingContext2D, progress: number): void {
  const x = W * 0.42
  const base = H - 20
  ctx.fillStyle = '#3a4568'
  ctx.fillRect(x, base - 16, 56, 16)
  ctx.fillRect(x + 12, base - 26, 32, 10)
  ctx.fillRect(x - 6, base - 34, 68, 8)
  const phase = Math.sin(progress * Math.PI)
  const ang = -1.1 + phase * 1.8
  ctx.save()
  ctx.translate(x + 28, base - 40)
  ctx.rotate(ang)
  ctx.strokeStyle = '#8a6a4a'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(0, -34)
  ctx.stroke()
  ctx.fillStyle = '#9aa4b0'
  ctx.fillRect(-10, -44, 20, 10)
  ctx.restore()
}

function drawEnhance(ctx: CanvasRenderingContext2D, progress: number, t: number): void {
  const cx = W * 0.46
  const cy = H * 0.5
  const pulse = 0.5 + 0.5 * Math.sin(t * 5 + progress * Math.PI * 2)
  ctx.globalAlpha = 0.25 + 0.5 * pulse
  ctx.strokeStyle = '#b48ef0'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(cx, cy, 16 + 6 * pulse, 0, Math.PI * 2)
  ctx.stroke()
  ctx.globalAlpha = 1
  ctx.fillStyle = '#b48ef0'
  ctx.beginPath()
  ctx.moveTo(cx, cy - 12)
  ctx.lineTo(cx + 8, cy)
  ctx.lineTo(cx, cy + 12)
  ctx.lineTo(cx - 8, cy)
  ctx.closePath()
  ctx.fill()
}

function drawIdle(ctx: CanvasRenderingContext2D, t: number): void {
  ctx.globalAlpha = 0.5
  ctx.fillStyle = '#3a4568'
  for (let i = 0; i < 3; i++) {
    const sx = W * (0.2 + 0.3 * i)
    const sy = H * 0.35 + Math.sin(t * 1.2 + i * 2) * 4
    ctx.beginPath()
    ctx.arc(sx, sy, 1.6, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1

}

/** 档位解析（与 store 同源语义；组件侧只需知道是否为 full） */
function resolveFxLevel(): 'full' | 'reduced' | 'off' {
  const fx = store.state.meta.settings?.fx
  if (fx === 'full' || fx === 'reduced' || fx === 'off') return fx
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    try {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 'reduced'
    } catch {
      // 忽略
    }
  }
  return 'full'
}

let unsub: (() => void) | null = null
onMounted(() => {
  raf = requestAnimationFrame(frame)
  unsub = subscribeScene((cmd) => {
    if (cmd.kind === 'burst') burst(W * 0.5, H * 0.5, cmd.burst ?? 'spark', Math.min(24, BUDGET.maxBurstParticles))
    else if (cmd.kind === 'ring') pushRing()
    else if (cmd.kind === 'popup' && cmd.text) pushPopup(cmd.text, cmd.popupKind ?? 'item')
  })
})
onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  if (unsub) unsub()
})
</script>

<template>
  <canvas ref="canvasRef" class="scene" :width="W" :height="H" />
</template>

<style scoped>
.scene {
  display: block;
  width: 100%;
  height: 120px;
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
  margin-bottom: 12px;
}
</style>
