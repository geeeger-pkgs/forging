<script setup lang="ts">
import type { ActionCard } from '../types'
import ItemIcon from './ItemIcon.vue'

defineProps<{ cards: ActionCard[] }>()
const emit = defineEmits<{ pick: [ActionCard] }>()
</script>

<template>
  <div class="grid">
    <button
      v-for="c in cards"
      :key="c.title"
      class="cell"
      :class="{ locked: c.locked }"
      @click="!c.locked && emit('pick', c)"
    >
      <ItemIcon v-if="c.itemId" :item-id="c.itemId" :size="38" />
      <span v-else class="icon">{{ c.icon }}</span>
      <span class="title">{{ c.title }}</span>
      <span class="note">{{ c.note }}</span>
    </button>
  </div>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, 140px);
  gap: 10px;
  align-content: start;
}
.cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 120px;
  background: var(--c-panel-2);
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
  color: var(--c-text);
  cursor: pointer;
  font-family: var(--font);
  transition: border-color 0.15s, transform 0.1s;
}
.cell:hover:not(.locked) {
  border-color: var(--c-accent);
  transform: translateY(-1px);
}
.cell.locked {
  cursor: not-allowed;
}
/* v2.0：锁定态不再整体降透明度（对比度达标），仅图标降调、文本用可达标亮度 */
.cell.locked > :first-child {
  opacity: 0.5;
}
.cell.locked .title,
.cell.locked .note {
  color: #868b9e;
}
.icon {
  font-size: 30px;
}
.title {
  font-size: 13px;
  font-weight: 600;
}
.note {
  font-size: 11px;
  color: var(--c-text-dim);
}
</style>
