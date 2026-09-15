<script setup lang="ts">
import { computed } from 'vue'
import { cmd, store } from '../../app/store'
import { TASK_DAILY_BY_ID, TASK_WEEKLY_BY_ID, itemDef } from '../../game/content'
import { PAID_REROLL_COST, msToNextDay, taskProgress } from '../../game/tasks'
import type { TaskSlot } from '../../game/types'

interface TaskDefLite {
  title: string
  desc: string
  unit: string
}

interface Row {
  slot: TaskSlot
  title: string
  desc: string
  unit: string
  progress: number
}

function rowsOf(slots: TaskSlot[], byId: Map<string, TaskDefLite>): Row[] {
  return slots.map((slot) => {
    const def = byId.get(slot.defId)
    return {
      slot,
      title: def?.title ?? slot.defId,
      desc: def?.desc ?? '',
      unit: def?.unit ?? '',
      progress: taskProgress(store.state, slot),
    }
  })
}

const daily = computed(() => rowsOf(store.state.meta.tasks.daily, TASK_DAILY_BY_ID))
const weekly = computed(() => {
  const w = store.state.meta.tasks.weekly
  return w ? rowsOf([w], TASK_WEEKLY_BY_ID) : []
})
const tasks = computed(() => store.state.meta.tasks)
const nextIn = computed(() => {
  const ms = msToNextDay(store.now)
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return `${h} 小时 ${m} 分`
})

function rewardText(slot: TaskSlot): string {
  const parts: string[] = []
  if (slot.gold > 0) parts.push(`${slot.gold} 💰`)
  if (slot.essence > 0) parts.push(`${itemDef('essence').name} ×${slot.essence}`)
  if (slot.crates > 0) parts.push(`${itemDef('crate').name} ×${slot.crates}`)
  return parts.length ? parts.join('、') : '—'
}
function pct(r: Row): number {
  return Math.min(100, (r.progress / Math.max(1, r.slot.target)) * 100)
}
function reroll(index: number): void {
  cmd({ type: 'rerollTask', index })
}
</script>

<template>
  <div class="tasks">
    <p class="summary">
      每日任务 · {{ tasks.dailyDate }}（{{ nextIn }}后刷新）<br />
      重掷：免费 {{ tasks.rerollsLeft }} 次 · 付费 {{ tasks.paidRerollsLeft }} 次（{{ PAID_REROLL_COST }} 金币/次）<br />
      提示：完成即自动发奖；离线收益不计入当日任务（基线隔离）。
    </p>

    <div v-for="(r, i) in daily" :key="'d' + i" class="card" :class="{ done: r.slot.done }">
      <div class="row1">
        <span class="mark">{{ r.slot.done ? '✅' : '📋' }}</span>
        <span class="title">{{ r.title }}</span>
        <span class="dim">{{ r.desc }} {{ r.slot.target }} {{ r.unit }}</span>
        <span class="spacer" />
        <span class="reward">{{ rewardText(r.slot) }}</span>
        <button v-if="!r.slot.done" class="btn sm" @click="reroll(i)">重掷</button>
      </div>
      <div class="bar"><i :style="{ width: pct(r) + '%' }" /></div>
      <div class="prog">{{ Math.min(r.progress, r.slot.target) }} / {{ r.slot.target }}</div>
    </div>

    <template v-if="weekly.length">
      <h3 class="weekly-title">周常任务 · {{ tasks.weekKey }}</h3>
      <div v-for="(r, i) in weekly" :key="'w' + i" class="card weekly" :class="{ done: r.slot.done }">
        <div class="row1">
          <span class="mark">{{ r.slot.done ? '✅' : '🗓️' }}</span>
          <span class="title">{{ r.title }}</span>
          <span class="dim">{{ r.desc }} {{ r.slot.target }} {{ r.unit }}</span>
          <span class="spacer" />
          <span class="reward">{{ rewardText(r.slot) }}</span>
        </div>
        <div class="bar"><i :style="{ width: pct(r) + '%' }" /></div>
        <div class="prog">{{ Math.min(r.progress, r.slot.target) }} / {{ r.slot.target }}</div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.tasks {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 720px;
}
.summary {
  margin: 0 0 2px;
  color: var(--c-text-dim);
  font-size: 13px;
  line-height: 1.8;
}
.card {
  background: var(--c-panel-2);
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.card.done {
  border-color: var(--c-success);
  opacity: 0.85;
}
.card.weekly {
  border-color: var(--c-accent-2);
}
.row1 {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}
.mark {
  font-size: 16px;
}
.title {
  font-weight: 600;
}
.spacer {
  flex: 1;
}
.reward {
  color: var(--c-accent);
  font-size: 12px;
}
.bar {
  height: 6px;
  background: var(--c-bg-deep);
  border-radius: 3px;
  overflow: hidden;
}
.bar i {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, var(--c-accent-2), var(--c-accent));
}
.prog {
  font-size: 11px;
  color: var(--c-text-dim);
  text-align: right;
}
.weekly-title {
  margin: 8px 0 0;
  font-size: 14px;
  color: var(--c-accent-2);
}
</style>
