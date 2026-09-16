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
      :class="{ locked: c.locked, hint: c.highlight }"
      @click="!c.locked && emit('pick', c)"
    >
      <ItemIcon v-if="c.itemId" :item-id="c.itemId" :size="38" />
      <span v-else class="icon">{{ c.icon }}</span>
      <span class="title">{{ c.title }}</span>
      <span class="note">{{ c.note }}</span>
      <span v-if="c.highlight" class="hint-tag">教程目标</span>
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
  position: relative; /* v3.1：教程目标角标 */
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
/* v3.6.1（评审 B-m5）：hover 效果只在真 hover 设备生效（触屏点完不残留高亮） */
@media (hover: hover) {
  .cell:hover:not(.locked) {
    border-color: var(--c-accent);
    transform: translateY(-1px);
  }
}
/* v3.6.1：触屏按压反馈（点按瞬间的位移，替代 hover 残留） */
.cell:active:not(.locked) {
  transform: translateY(1px);
  border-color: var(--c-accent);
}
.cell.hint {
  border-color: var(--c-accent);
  box-shadow: inset 0 0 0 1px var(--c-accent);
}
.hint-tag {
  position: absolute;
  top: 4px;
  right: 6px;
  font-size: 10px;
  color: var(--c-accent);
  border: 1px solid var(--c-accent);
  border-radius: 999px;
  padding: 0 6px;
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
  /* v3.6.2：硬编码 #868b9e（4.76 勉强达标）→ 主题 token（5.26；锁定感由图标降调承担） */
  color: var(--c-text-dim);
}
.icon {
  font-size: 30px;
}
.title {
  font-size: 13px;
  font-weight: 600;
}
.note {
  font-size: var(--fs-note); /* v3.6 F5 */
  color: var(--c-text-dim);
}
</style>
