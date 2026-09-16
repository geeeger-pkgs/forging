<script setup lang="ts">
// ============================================================
// Forging · 全局表现层（v2.5，性能修复 + 测评 B1）
// 设计：docs/design-v2.5.md §2.3
//
// 为什么是**全局覆盖层**而不是挂在技能页的场景画布内（测评 B1）：
//   1. 表现事件（强化成功/深渊通关/成就/升级…）发生在**任何**页面，
//      挂在技能页会让"深渊通关"的环与爆发在深渊页根本看不见；
//   2. 挂在条件渲染的组件里，未挂载期间的总线只能缓存在队列里，
//      切回技能页时会**迟到重放**一堆过期飘字（评审实测可复现）。
// 现在：本层常驻（App.vue 顶层，pointer-events: none），订阅即绘制，过期即丢弃。
// 坐标以视口为准（主内容区中央偏上），因此在任何视图下都落在可见范围内。
// ============================================================
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { subscribeScene } from '../../app/scene-bus'
import { recordDraw, setLiveCounts } from '../fx-probe'
import { resolveFxLevel } from '../fx-map'
import { CONTENT } from '../../game/content'
import { store } from '../../app/store'

const canvasRef = ref<HTMLCanvasElement | null>(null)
let raf = 0
const BUDGET = CONTENT.fx.budget
const MAX_P = BUDGET.maxParticles

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
const popups: Popup[] = []
const rings: Ring[] = []

// v3.7.5：粒子/飘字色对齐 v3.7 新 token（金 #ffb03a / 蓝 #6f91ff / 危险 #ff7a6e / 紫 #a78bfa / dim #96a0bd）
const BURST_COLORS = {
  spark: ['#ffb03a', '#ffd77a', '#ff7a6e'],
  ore: ['#c98a5b', '#8a5a3a', '#d9b08c'],
  gold: ['#ffd77a', '#ffb03a', '#fff3c4'],
  gray: ['#6e7690', '#96a0bd', '#454d63'],
  blue: ['#6f91ff', '#9db4ff', '#cfe0ff'],
  abyss: ['#a78bfa', '#8fb0ff', '#e0b3ff'],
} as const
const POPUP_COLORS: Record<Popup['kind'], string> = { item: '#7fd4c1', xp: '#6f91ff', gold: '#ffb03a' }

/** 视口尺寸（每帧读，窗口缩放无需额外监听） */
function viewport(): { w: number; h: number } {
  if (typeof window === 'undefined') return { w: 760, h: 400 }
  return { w: window.innerWidth, h: window.innerHeight }
}

/**
 * 表现锚点。
 * 技能页有**场景舞台**（`.scene` 画布）时，把爆发/飘字落回舞台里（观感：像在矿洞里炸开）；
 * 其它页面（深渊/商店/任务…）没有舞台，退化为"主内容区上部居中"。
 * 实机截图自检：纯视口锚点会把粒子和飘字撒在动作卡网格上，盖住按钮文字。
 * 只在**事件到达时**读一次 rect（不是每帧），不引入每帧强制布局。
 */
function anchor(): { x: number; y: number } {
  const { w, h } = viewport()
  if (typeof document !== 'undefined') {
    const stage = document.querySelector('canvas.scene') as HTMLCanvasElement | null
    if (stage) {
      const r = stage.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) return { x: r.left + r.width * 0.5, y: r.top + r.height * 0.62 }
    }
  }
  return { x: w * 0.42, y: Math.min(h * 0.26, 240) }
}

function burst(kind: keyof typeof BURST_COLORS, count: number): void {
  const a0 = anchor()
  const colors = BURST_COLORS[kind]
  const n = Math.min(count, BUDGET.maxBurstParticles)
  for (let i = 0; i < n && particles.length < MAX_P; i++) {
    const a = Math.random() * Math.PI * 2
    const sp = 0.5 + Math.random() * 2.4
    particles.push({
      x: a0.x,
      y: a0.y,
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

/** 飘字入队：同帧多条按已有条数纵向错行（避免叠成一团）；slots 限制在可见范围内 */
function pushPopup(text: string, kind: Popup['kind']): void {
  if (popups.length >= BUDGET.maxPopups) popups.shift()
  const slot = Math.min(popups.length, 4) // 测评 Minor-6：slot≥5 会飘到画布外
  const a0 = anchor()
  popups.push({
    text,
    kind,
    x: a0.x + (Math.random() - 0.5) * 60,
    y: a0.y + 40 - slot * 17, // 从舞台下沿往上错行，5 条都留在舞台内（截图自检）
    life: 0,
    max: 90,
  })
}

function pushRing(): void {
  if (rings.length >= 3) rings.shift()
  const a0 = anchor()
  rings.push({ x: a0.x, y: a0.y, life: 0, max: 48 })
}

let unsub: (() => void) | null = null
let cssW = 0
let cssH = 0

function frame(): void {
  raf = requestAnimationFrame(frame)
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const t0 = performance.now()

  const { w, h } = viewport()
  if (w !== cssW || h !== cssH) {
    cssW = w
    cssH = h
    const dpr = Math.min(2, (globalThis.devicePixelRatio ?? 1) || 1)
    canvas.width = Math.floor(w * dpr)
    canvas.height = Math.floor(h * dpr)
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  ctx.clearRect(0, 0, w, h)
  const level = resolveFxLevel(store.state?.meta?.settings?.fx)

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]
    p.life++
    p.x += p.vx
    p.y += p.vy
    p.vy += p.gravity
    const lifeT = 1 - p.life / p.max
    if (lifeT <= 0 || p.y > h + 20) {
      particles.splice(i, 1)
      continue
    }
    ctx.globalAlpha = Math.max(0, lifeT)
    ctx.fillStyle = p.color
    ctx.fillRect(p.x, p.y, p.size, p.size)
  }
  ctx.globalAlpha = 1

  for (let i = popups.length - 1; i >= 0; i--) {
    const p = popups[i]
    p.life += 1
    p.y -= 0.55
    if (p.life >= p.max) {
      popups.splice(i, 1)
      continue
    }
    ctx.globalAlpha = Math.max(0, 1 - p.life / p.max)
    ctx.font = '600 13px ui-sans-serif, system-ui'
    ctx.textAlign = 'center'
    // v3.1：先描一圈深色边再填色 —— 非技能页的飘字会落在正文上（测评 B-5）
    ctx.lineWidth = 3
    ctx.strokeStyle = 'rgba(8,10,18,0.85)'
    ctx.strokeText(p.text, p.x, p.y)
    ctx.fillStyle = POPUP_COLORS[p.kind]
    ctx.fillText(p.text, p.x, p.y)
  }
  ctx.globalAlpha = 1
  ctx.textAlign = 'start'

  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i]
    r.life += 1
    if (r.life >= r.max) {
      rings.splice(i, 1)
      continue
    }
    const k = r.life / r.max
    ctx.globalAlpha = Math.max(0, 0.5 * (1 - k))
    ctx.strokeStyle = '#ffb03a'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(r.x, r.y, 6 + k * 60, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.globalAlpha = 1

  // 关档时立即清空存量（不等自然消亡）：切档后屏幕上不应再有残留粒子/飘字
  if (level === 'off') {
    particles.length = 0
    popups.length = 0
    rings.length = 0
  }

  recordDraw(performance.now() - t0)
  setLiveCounts(particles.length, popups.length)
}

onMounted(() => {
  unsub = subscribeScene((cmd) => {
    // 档位在此再判一次：总线只负责"要不要画"，不关心"能不能画"
    const level = resolveFxLevel(store.state?.meta?.settings?.fx)
    if (level === 'off') return
    if (cmd.kind === 'burst' && cmd.burst) burst(cmd.burst, BUDGET.maxBurstParticles)
    else if (cmd.kind === 'ring') pushRing()
    else if (cmd.kind === 'popup' && cmd.text) pushPopup(cmd.text, cmd.popupKind ?? 'item')
  })
  raf = requestAnimationFrame(frame)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  unsub?.()
})
</script>

<template>
  <canvas ref="canvasRef" class="fx-layer" aria-hidden="true" />
</template>

<style scoped>
/* 覆盖视口、不拦截指针：表现层永远不该挡住操作 */
.fx-layer {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  pointer-events: none;
  z-index: 45; /* 高于面板，低于弹窗(50)与提示条(80) */
}
</style>
