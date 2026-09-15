// ============================================================
// Forging · Canvas 场景层（程序化动画；纯装饰，不参与游戏逻辑）
// 随当前动作切换：挖矿 / 熔炼 / 锻造 / 强化 / 空闲
//
// v2.5 测评 B1 后的分工：
//   本组件 = **场景本体**（技能页专属：镐摆动、炉火、铁砧、常驻浮尘、动作完成爆发）
//   全局表现（粒子/飘字/光环）→ FxLayer.vue（常驻覆盖层，跨视图可见）
//   → 因此本组件不再订阅总线：总线上的表现不会因为"当前不在技能页"而丢失或迟到重放
// ============================================================
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { store } from '../../app/store'
import { recordDraw } from '../fx-probe'
// 档位解析只保留**一份实现**（纯模块）：组件曾自带一份拷贝，属于双真值，v2.5 自检时删除
import { resolveFxLevel } from '../fx-map'
import { CONTENT } from '../../game/content'
import { requestBurst } from '../fx-probe'
import { emitScene } from '../../app/scene-bus'
import { skillOf } from '../../game/refs'
import type { SkillId } from '../../game/types'

const canvasRef = ref<HTMLCanvasElement | null>(null)
const W = 760
const H = 120
let raf = 0
/** v2.5：预算与上限一律取自内容表（单一来源；评审 M5 修掉 MAX_P 双真值） */
const BUDGET = CONTENT.fx.budget
const MAX_P = BUDGET.maxParticles

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

/**
 * 本组件只保留**常驻浮尘**（场景氛围的一部分，属于场景本体）。
 * 交互爆发/飘字/光环全部走全局表现层 FxLayer（跨视图可见，测评 B1）。
 */
const dust: P[] = []

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

  // 档位（每帧读一次：设置改动即刻生效）
  const fxLevel = resolveFxLevel(store.state.meta.settings?.fx)

  // 完成 / 切动作 → 交互爆发（投向全局表现层；仅 full 档，且与事件爆发共享频率上限）
  // 修正记录：①原先未判档位，off 档仍会冒粒子（烟测 R4）；②原先不经 requestBurst，
  // 频率上限只约束了事件侧（测评 Minor-10）
  if (fxLevel === 'full' && (key !== lastKey || progress < lastProgress - 0.02) && lastKey !== '' && lastKey !== 'idle') {
    if (requestBurst()) {
      if (skill === 'mining') emitScene({ kind: 'burst', burst: 'ore' })
      else if (skill === 'smelting') emitScene({ kind: 'burst', burst: 'spark' })
      else if (skill === 'forging') emitScene({ kind: 'burst', burst: 'spark' })
      else if (skill === 'enhancing') emitScene({ kind: 'burst', burst: 'spark' })
    }
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
  if (fxLevel === 'full' && Math.random() < 0.07 && dust.length < MAX_P) {
    dust.push({
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

  // 常驻浮尘（场景氛围）
  for (let i = dust.length - 1; i >= 0; i--) {
    const p = dust[i]
    p.life++
    p.x += p.vx
    p.y += p.vy
    p.vy += p.gravity
    const lifeT = 1 - p.life / p.max
    if (lifeT <= 0 || p.y > H + 10) {
      dust.splice(i, 1)
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

  recordDraw(performance.now() - t0)
  // 存活粒子/飘字由 FxLayer 上报（本组件只有场景氛围浮尘，不计入交互表现读数）
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

// 场景本体：只画动作动画与浮尘。**不订阅总线**（表现由常驻的 FxLayer 承担，测评 B1）
onMounted(() => {
  raf = requestAnimationFrame(frame)
})
onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
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
