<script setup lang="ts">
import { computed } from 'vue'
import { cmd, store } from '../../app/store'
import { CONTENT, TASK_DAILY_BY_ID, TASK_WEEKLY_BY_ID, itemDef } from '../../game/content'
import { msToNextDay, PAID_REROLL_COST, taskProgress } from '../../game/tasks'
import { msToSeasonEnd, seasonUnlocked, seasonView } from '../../game/season'
import { fmtDur } from '../format'
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

// v2.3：赛季摘要（发现性——完整面板在图鉴页）
const seasonOn = computed(() => seasonUnlocked(store.state))
const season = computed(() => (seasonOn.value ? seasonView(store.state, store.now) : null))
const seasonLeft = computed(() => fmtDur(msToSeasonEnd(store.now)))
const nextIn = computed(() => fmtDur(msToNextDay(store.now)))

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
/**
 * v3.4 B4：重掷。免费次数用完后是**付费**动作（100 金/次，每日 3 次）——
 * 此前点击即扣，误触代价无声；现在付费档先确认（免费档不打扰）。
 */
function reroll(index: number): void {
  const t = store.state.meta.tasks
  // v3.4 W4：金币不足时不弹确认（否则"确认了却被拦"——正是 V5 想消灭的体验）
  if (t.rerollsLeft <= 0 && t.paidRerollsLeft > 0 && store.state.gold >= PAID_REROLL_COST) {
    const msg = `免费重掷已用完：花费 ${PAID_REROLL_COST} 金重掷本条？\n（今日还剩 ${t.paidRerollsLeft} 次付费重掷）`
    if (!window.confirm(msg)) return
  }
  cmd({ type: 'rerollTask', index })
}
</script>

<template>
  <div class="tasks">
    <p v-if="season" class="summary season-line">
      🗓 第 {{ season.index }} 赛季 · 剩余 {{ seasonLeft }} · 声望等级 {{ season.level }} / {{ season.maxLevel }}
      <span class="dim small">（赛季 = 周常的长周期版：{{ CONTENT.season.days }} 天一轮，任务更重、奖励更大）</span>
      （{{ season.renown }} / {{ season.maxRenown }} 声望）→ 详见「图鉴」页
    </p>
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
        <!-- v3.4 W4：两池都耗尽时禁用并说明（此前点了才被内核拦下） -->
        <button
          v-if="!r.slot.done"
          class="btn sm"
          :disabled="tasks.rerollsLeft <= 0 && tasks.paidRerollsLeft <= 0"
          :title="tasks.rerollsLeft <= 0 && tasks.paidRerollsLeft <= 0 ? '今日重掷次数已用完' : '重掷本条任务'"
          @click="reroll(i)"
        >
          重掷
        </button>
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
.season-line {
  border-left: 3px solid var(--c-accent-2);
  padding-left: 8px;
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
