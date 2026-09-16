<script setup lang="ts">
import { computed } from 'vue'
import { store } from '../../app/store'
import { achievementValue } from '../../game/achievements'
import { CONTENT, itemDef } from '../../game/content'
import type { AchievementDef } from '../../game/types'

/**
 * v3.2 B6：82 项平铺、看不出"还差多少"（测评 B-B6）。
 * 现在：显示 current/target 进度，并按**接近完成度**排序（未完成优先、越接近越靠前）。
 */
const list = computed(() => {
  const unlocked = new Set(store.state.flags.achievements.unlocked)
  return CONTENT.achievements
    .map((a) => {
      const cur = Math.min(achievementValue(store.state, a), a.target)
      return { ...a, done: unlocked.has(a.id), cur, ratio: a.target > 0 ? cur / a.target : 0 }
    })
    .sort((x, y) => {
      if (x.done !== y.done) return x.done ? 1 : -1 // 未完成在前
      if (!x.done && x.ratio !== y.ratio) return y.ratio - x.ratio // 接近完成在前
      return x.id.localeCompare(y.id)
    })
})
const doneCount = computed(() => list.value.filter((a) => a.done).length)

function rewardText(a: AchievementDef): string {
  return a.rewards
    .map((r) => (r.gold ? `${r.gold} 💰` : r.itemId ? `${itemDef(r.itemId).name} ×${r.qty ?? 1}` : ''))
    .filter(Boolean)
    .join('、')
}
</script>

<template>
  <div class="ach">
    <p class="summary">已解锁 <em>{{ doneCount }}</em> / {{ list.length }}</p>
    <div class="grid">
      <div v-for="a in list" :key="a.id" class="card" :class="{ done: a.done }">
        <div class="head">
          <span class="mark">{{ a.done ? '🏆' : '🔒' }}</span>
          <span class="name">{{ a.name }}</span>
        </div>
        <div class="desc">{{ a.desc }}</div>
        <div v-if="!a.done && a.cur > 0" class="prog">{{ a.cur }} / {{ a.target }}<span v-if="a.cur === 0" class="dim">（进行中）</span></div>
        <div class="reward">奖励：{{ rewardText(a) }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ach {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.summary {
  margin: 0;
  color: var(--c-text-dim);
  font-size: 13px;
}
.summary em {
  font-style: normal;
  color: var(--c-accent);
  font-weight: 600;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 10px;
}
.card {
  background: var(--c-panel-2);
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
  padding: 10px 12px;
  opacity: 0.5;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.card.done {
  opacity: 1;
  border-color: var(--c-accent);
}
.head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  font-size: 14px;
}
.desc {
  font-size: 12px;
  color: var(--c-text-dim);
}
.prog {
  font-size: 12px;
  color: var(--c-accent-2);
  font-variant-numeric: tabular-nums;
  margin-top: 2px;
}
.reward {
  font-size: 12px;
  color: var(--c-accent-2);
}
</style>
