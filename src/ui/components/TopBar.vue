<script setup lang="ts">
import { computed } from 'vue'
import { cmd, store } from '../../app/store'
import { totalLevel } from '../../game/level'
import { refLabel } from '../../game/refs'
import ProgressBar from './ProgressBar.vue'

const cur = computed(() => store.state.actions.current)
const queue = computed(() => store.state.actions.queue)
const tl = computed(() => totalLevel(store.state.skills))
const remainSec = computed(() => {
  const c = cur.value
  if (!c) return ''
  return ((Math.max(0, c.startedAt + c.durationMs - store.now)) / 1000).toFixed(1) + 's'
})
</script>

<template>
  <header class="top">
    <div class="left">
      <span class="gold">💰 {{ store.state.gold }}</span>
    </div>

    <div class="center">
      <div v-if="cur" class="current">
        <span class="label">{{ refLabel(cur.ref) }}</span>
        <span v-if="cur.remaining !== null" class="count">×{{ cur.remaining }}</span>
        <ProgressBar :started-at="cur.startedAt" :duration-ms="cur.durationMs" />
        <span class="time">{{ remainSec }}</span>
        <button class="btn danger sm" @click="cmd({ type: 'stopAction' })">停止</button>
      </div>
      <div v-else class="idle">无所事事……</div>

      <div v-if="queue.length" class="queue">
        <span class="qlabel">队列</span>
        <span v-for="(q, i) in queue" :key="i" class="qitem">
          {{ refLabel(q.ref) }}<em v-if="q.remaining !== null">×{{ q.remaining }}</em>
        </span>
        <button class="btn sm" @click="cmd({ type: 'clearQueue' })">清空</button>
      </div>
    </div>

    <div class="right">
      <span class="pname">{{ store.state.character.name }}</span>
      <span class="dim">总等级 {{ tl }}</span>
    </div>
  </header>
</template>

<style scoped>
.top {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 16px;
  background: var(--c-panel);
  border-bottom: 1px solid var(--c-border);
  min-height: 56px;
}
.left {
  min-width: 120px;
}
.gold {
  color: var(--c-accent);
  font-weight: 600;
}
.center {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.current {
  display: flex;
  align-items: center;
  gap: 10px;
}
.label {
  font-weight: 600;
}
.count {
  color: var(--c-text-dim);
  font-size: 12px;
}
.time {
  color: var(--c-text-dim);
  font-size: 12px;
  min-width: 44px;
}
.idle {
  color: var(--c-text-dim);
}
.queue {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--c-text-dim);
}
.qitem em {
  font-style: normal;
  margin-left: 2px;
}
.right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  min-width: 120px;
}
.pname {
  font-weight: 600;
}
.dim {
  color: var(--c-text-dim);
  font-size: 12px;
}
</style>
