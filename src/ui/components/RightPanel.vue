<script setup lang="ts">
import { computed } from 'vue'
import { cmd, store } from '../../app/store'
import { itemDef } from '../../game/content'
import { instanceById } from '../../game/state'
import { SLOT_IDS, aggregateEquipment } from '../../game/stats'
import type { SlotId } from '../../game/types'
import ItemIcon from './ItemIcon.vue'

const SLOT_LABEL: Record<SlotId, string> = {
  pick: '镐',
  crucible: '坩埚',
  hammer: '锤',
  mainHand: '主手',
  head: '头部',
  body: '身体',
  legs: '腿部',
  feet: '脚部',
}

const slots = computed(() =>
  SLOT_IDS.map((id) => {
    const instId = store.state.slots[id]
    const inst = instId !== undefined ? instanceById(store.state, instId) : undefined
    return {
      id,
      label: SLOT_LABEL[id],
      inst: inst ?? null,
      name: inst ? itemDef(inst.itemId).name : '',
    }
  }),
)

const materials = computed(() =>
  Object.entries(store.state.materials)
    .filter(([, qty]) => qty > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, qty]) => ({ id, qty, name: itemDef(id).name })),
)

const bagItems = computed(() => {
  const equipped = new Set(Object.values(store.state.slots))
  return store.state.equipment
    .filter((e) => !equipped.has(e.instanceId))
    .map((e) => ({ inst: e, name: itemDef(e.itemId).name }))
})

const agg = computed(() => aggregateEquipment(store.state))

function pct(x: number): string {
  return x > 0 ? `+${(x * 100).toFixed(1)}%` : '—'
}
function unequip(slot: SlotId): void {
  cmd({ type: 'unequip', slot })
}
function equipInstance(instanceId: number): void {
  cmd({ type: 'equip', instanceId })
}
function recycleMaterial(itemId: string, qty: number): void {
  cmd({ type: 'recycleMaterial', itemId, qty })
}
function recycleInstance(instanceId: number): void {
  cmd({ type: 'recycleInstance', instanceId })
}
</script>

<template>
  <aside class="right">
    <section>
      <h4>装备</h4>
      <div class="slots">
        <div v-for="s in slots" :key="s.id" class="slot" :class="{ filled: s.inst }">
          <div class="slot-label">{{ s.label }}</div>
          <template v-if="s.inst">
            <div class="slot-item">
              <ItemIcon :item-id="s.inst.itemId" :size="18" />
              <span class="slot-name">{{ s.name }}<em>+{{ s.inst.enhanceLevel }}</em></span>
            </div>
            <button class="btn sm" @click="unequip(s.id)">卸下</button>
          </template>
          <div v-else class="slot-empty">空</div>
        </div>
      </div>
      <div class="stats-line">
        效率 {{ pct(agg.efficiency) }} · 产量 {{ pct(agg.quantity) }} · 经验 {{ pct(agg.wisdom) }} · 稀有 {{ pct(agg.rareFind) }}<br />
        挖速 {{ pct(agg.toolSpeed.mining + agg.allSpeed) }} · 熔速 {{ pct(agg.toolSpeed.smelting + agg.allSpeed) }} · 锻速
        {{ pct(agg.toolSpeed.forging + agg.allSpeed) }}
      </div>
    </section>

    <section>
      <h4>资源</h4>
      <div v-if="materials.length === 0" class="dim">暂无</div>
      <div v-for="m in materials" :key="m.id" class="row">
        <ItemIcon :item-id="m.id" :size="16" />
        <span class="name">{{ m.name }}</span>
        <span class="qty">×{{ m.qty }}</span>
        <button class="btn sm" @click="recycleMaterial(m.id, 1)">回收1</button>
        <button class="btn sm" @click="recycleMaterial(m.id, Math.min(10, m.qty))">×10</button>
      </div>
    </section>

    <section>
      <h4>行囊（装备）</h4>
      <div v-if="bagItems.length === 0" class="dim">暂无</div>
      <div v-for="b in bagItems" :key="b.inst.instanceId" class="row">
        <ItemIcon :item-id="b.inst.itemId" :size="16" />
        <span class="name">{{ b.name }}<em class="dim"> +{{ b.inst.enhanceLevel }}</em></span>
        <button class="btn sm" @click="equipInstance(b.inst.instanceId)">装备</button>
        <button class="btn sm" @click="recycleInstance(b.inst.instanceId)">回收</button>
      </div>
    </section>
  </aside>
</template>

<style scoped>
.right {
  width: 300px;
  min-width: 300px;
  background: var(--c-panel);
  border-left: 1px solid var(--c-border);
  padding: 10px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
h4 {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--c-text-dim);
}
.slots {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
.slot {
  border: 1px dashed var(--c-border);
  border-radius: 6px;
  padding: 6px 8px;
  min-height: 58px;
  font-size: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.slot.filled {
  border-style: solid;
}
.slot-label {
  color: var(--c-text-dim);
  font-size: 11px;
}
.slot-item {
  display: flex;
  align-items: center;
  gap: 4px;
}
.slot-name em {
  font-style: normal;
  color: var(--c-accent-2);
}
.slot-empty {
  color: var(--c-text-dim);
}
.stats-line {
  margin-top: 8px;
  font-size: 11px;
  color: var(--c-text-dim);
  line-height: 1.8;
}
.row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  padding: 3px 0;
}
.name {
  flex: 1;
}
.name em {
  font-style: normal;
}
.qty {
  color: var(--c-text-dim);
}
.dim {
  color: var(--c-text-dim);
  font-size: 12px;
}
</style>
