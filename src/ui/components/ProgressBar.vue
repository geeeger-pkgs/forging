<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps<{ startedAt: number; durationMs: number }>()

const pct = ref(0)
let raf = 0

function frame(): void {
  const elapsed = Date.now() - props.startedAt
  pct.value = Math.max(0, Math.min(1, elapsed / Math.max(1, props.durationMs)))
  raf = requestAnimationFrame(frame)
}

onMounted(() => {
  raf = requestAnimationFrame(frame)
})
onBeforeUnmount(() => cancelAnimationFrame(raf))
</script>

<template>
  <div class="bar">
    <div class="fill" :style="{ width: (pct * 100).toFixed(2) + '%' }" />
  </div>
</template>

<style scoped>
.bar {
  height: 8px;
  background: var(--c-bg-deep);
  border: 1px solid var(--c-border);
  border-radius: 4px;
  overflow: hidden;
  min-width: 120px;
}
.fill {
  height: 100%;
  background: linear-gradient(90deg, var(--c-accent-2), var(--c-accent));
  transition: none;
}
</style>
