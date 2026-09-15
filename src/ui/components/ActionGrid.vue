<script setup lang="ts">
import type { ActionCard } from '../types'

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
      <span class="icon">{{ c.icon }}</span>
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
  opacity: 0.38;
  cursor: not-allowed;
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
