<script setup lang="ts">
import { computed } from 'vue'
import { pickAction, store } from '../../app/store'
import { MAX_ENHANCE, itemDef } from '../../game/content'
import { itemIcon } from '../icons'

const rows = computed(() =>
  store.state.equipment.map((inst) => ({
    inst,
    name: itemDef(inst.itemId).name,
    icon: itemIcon(inst.itemId),
    max: inst.enhanceLevel >= MAX_ENHANCE,
  })),
)

function enhance(instanceId: number, level: number): void {
  pickAction({ kind: 'enhance', instanceId, targetLevel: level + 1 })
}
</script>

<template>
  <div class="enhance">
    <p class="hint">选择要强化的装备（+1 ~ +4 失败不掉级；+5 起失败降 1 级，永不销毁）</p>
    <p v-if="rows.length === 0" class="hint">尚无装备，先去锻造吧。</p>
    <div v-for="r in rows" :key="r.inst.instanceId" class="row">
      <span class="icon">{{ r.icon }}</span>
      <span class="name">{{ r.name }}</span>
      <span class="lv" :class="{ hot: r.inst.enhanceLevel >= 5 }">+{{ r.inst.enhanceLevel }}</span>
      <button v-if="!r.max" class="btn sm" @click="enhance(r.inst.instanceId, r.inst.enhanceLevel)">强化 → +{{ r.inst.enhanceLevel + 1 }}</button>
      <span v-else class="dim">已满级</span>
    </div>
  </div>
</template>

<style scoped>
.enhance {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 560px;
}
.hint {
  color: var(--c-text-dim);
  font-size: 12px;
  margin: 0 0 4px;
}
.row {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--c-panel-2);
  border: 1px solid var(--c-border);
  border-radius: 6px;
  padding: 8px 12px;
}
.icon {
  font-size: 20px;
}
.name {
  flex: 1;
}
.lv {
  color: var(--c-accent-2);
  font-weight: 600;
}
.lv.hot {
  color: var(--c-accent);
}
.dim {
  color: var(--c-text-dim);
  font-size: 12px;
}
</style>
