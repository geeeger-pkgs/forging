<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { fmtDur } from '../format'

const props = defineProps<{ startedAt: number; durationMs: number }>()

const pct = ref(0)
/** v2.5：剩余秒数。整数秒才更新 → 一帧内不重复触发响应式渲染 */
const remain = ref('')
let raf = 0
let lastShown = -1

/** 剩余时间：统一走 fmtDur（v3.2 B4 修正，此前这里是 'm:ss' 第三种写法） */
function formatRemain(ms: number): string {
  if (ms <= 0) return '完成中'
  return fmtDur(ms)
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
  height: 9px;
  background: var(--c-bg-deep);
  border: 1px solid var(--c-border);
  border-radius: 5px;
  overflow: hidden;
  min-width: 80px;
  flex: 1;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.5);
}
.fill {
  height: 100%;
  /* v3.7：金色锻造渐变 + 顶部高光 + 极简发光（熔炉进度感） */
  background: linear-gradient(180deg, #ffd076, #ff9f1f 60%, #f08a00);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.45),
    0 0 10px rgba(255, 176, 58, 0.35);
  transition: none;
}
</style>
