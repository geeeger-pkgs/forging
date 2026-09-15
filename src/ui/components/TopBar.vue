<script setup lang="ts">
import { computed } from 'vue'
import { cmd, store } from '../../app/store'
import { activeBuffs } from '../../game/buffs'
import { RUNE_BY_ID } from '../../game/content'
import { totalValue } from '../../game/economy'
import { totalLevel } from '../../game/level'
import { refLabel } from '../../game/refs'
import { buffIcon, fmtNum } from '../icons'
import ProgressBar from './ProgressBar.vue'

const cur = computed(() => store.state.actions.current)
const queue = computed(() => store.state.actions.queue)
const shownQueue = computed(() => queue.value.slice(0, 4))
const overflow = computed(() => Math.max(0, queue.value.length - 4))
const tl = computed(() => totalLevel(store.state.skills))
const tv = computed(() => totalValue(store.state))
const remainSec = computed(() => {
  const c = cur.value
  if (!c) return ''
  return ((Math.max(0, c.startedAt + c.durationMs - store.now)) / 1000).toFixed(1) + 's'
})

const buffs = computed(() =>
  activeBuffs(store.state, store.now).map((b) => {
    const def = RUNE_BY_ID.get(b.defId)
    return {
      icon: buffIcon(def?.effect ?? ''),
      name: def?.name ?? b.defId,
      min: Math.max(1, Math.ceil((b.until - store.now) / 60000)),
    }
  }),
)
</script>

<template>
  <header class="top">
    <div class="left">
      <span class="gold">💰 {{ fmtNum(store.state.gold) }}</span>
      <span class="dim">总价值 {{ fmtNum(tv) }}</span>
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
        <span v-for="(q, i) in shownQueue" :key="i" class="qitem">
          {{ refLabel(q.ref) }}<em v-if="q.remaining !== null">×{{ q.remaining }}</em>
        </span>
        <span v-if="overflow" class="qitem">+{{ overflow }} 项</span>
        <button class="btn sm" @click="cmd({ type: 'clearQueue' })">清空</button>
      </div>
    </div>

    <div class="right">
      <div v-if="buffs.length" class="buffs">
        <span v-for="(b, i) in buffs" :key="i" class="buff" :title="b.name">{{ b.icon }} {{ b.min }}m</span>
      </div>
      <span class="pname">{{ store.state.character.name }}</span>
      <span v-if="store.state.abyss?.title" class="title-badge" title="深渊商店购买的称号">深渊行者</span>
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
  min-width: 150px;
  display: flex;
  flex-direction: column;
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
  gap: 2px;
}
.buffs {
  display: flex;
  gap: 6px;
}
.buff {
  background: var(--c-panel-2);
  border: 1px solid var(--c-accent-2);
  border-radius: 999px;
  padding: 1px 8px;
  font-size: 11px;
  color: var(--c-accent);
}
.title-badge {
  font-size: 11px;
  color: var(--c-accent);
  border: 1px solid var(--c-accent);
  border-radius: 4px;
  padding: 0 4px;
}
.pname {
  font-weight: 600;
}
.dim {
  color: var(--c-text-dim);
  font-size: 12px;
}

/* v1.8：窄屏换行布局 */
@media (max-width: 900px) {
  .top {
    flex-wrap: wrap;
    gap: 8px 12px;
    padding: 8px 12px;
  }
  .left,
  .right {
    min-width: 0;
  }
  .center {
    order: 3;
    flex: 1 1 100%;
  }
}
</style>
