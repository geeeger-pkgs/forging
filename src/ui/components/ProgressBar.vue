<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps<{ startedAt: number; durationMs: number }>()

const pct = ref(0)
/** v2.5：剩余秒数。整数秒才更新 → 一帧内不重复触发响应式渲染 */
const remain = ref('')
let raf = 0
let lastShown = -1

/** 剩余时间的可读写法：<10s 显示一位小数（0.1s 粒度需要），否则显示整秒 */
function formatRemain(ms: number): string {
  if (ms <= 0) return '完成中'
  const s = ms / 1000
  if (s < 10) return `${s.toFixed(1)}s`
  if (s < 60) return `${Math.ceil(s)}s`
  const m = Math.floor(s / 60)
  const r = Math.floor(s % 60)
  return `${m}:${String(r).padStart(2, '0')}`
}

function frame(): void {
  const elapsed = Date.now() - props.startedAt
  const dur = Math.max(1, props.durationMs)
  pct.value = Math.max(0, Math.min(1, elapsed / dur))
  const left = Math.max(0, dur - elapsed)
  const tick = Math.ceil(left / 100)
  if (tick !== lastShown) {
    lastShown = tick
    remain.value = formatRemain(left)
  }
  raf = requestAnimationFrame(frame)
}

onMounted(() => {
  raf = requestAnimationFrame(frame)
})
onBeforeUnmount(() => cancelAnimationFrame(raf))
</script>

<template>
  <div class="wrap">
    <div class="bar">
      <div class="fill" :style="{ width: (pct * 100).toFixed(2) + '%' }" />
    </div>
    <span class="remain">{{ remain }}</span>
  </div>
</template>

<style scoped>
.wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}
.remain {
  color: var(--c-text-dim);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  min-width: 46px;
  text-align: right;
}
.bar {
  height: 8px;
  background: var(--c-bg-deep);
  border: 1px solid var(--c-border);
  border-radius: 4px;
  overflow: hidden;
  min-width: 80px;
  flex: 1;
}
.fill {
  height: 100%;
  background: linear-gradient(90deg, var(--c-accent-2), var(--c-accent));
  transition: none;
}
</style>
