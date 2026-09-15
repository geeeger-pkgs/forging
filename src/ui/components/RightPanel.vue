<script setup lang="ts">
import { computed } from 'vue'
import { cmd, inspectItem, store } from '../../app/store'
import { CONTENT, itemDef } from '../../game/content'
import { instanceById } from '../../game/state'
import { SLOT_IDS, aggregateEquipment } from '../../game/stats'
import type { ItemDef, SlotId } from '../../game/types'
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
  necklace: '项链',
  ring: '戒指',
}

const TIER_CN: Record<number, string> = { 1: '铜', 2: '铁', 3: '银', 4: '金', 5: '秘银' }

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

const setText = computed(() => {
  const { setTier, setCount } = agg.value
  if (!setTier || setCount < 3) return '—'
  const parts = [`${TIER_CN[setTier]}×${setCount}`]
  if (setCount >= 5) parts.push('+4% 全速')
  if (setCount >= 8) parts.push('+4% 效率')
  return parts.join(' ')
})

/** 物品详情（属性 + 用途查询） */
const inspected = computed(() => {
  const id = store.ui.inspectItemId
  if (!id) return null
  const def = CONTENT.items[id]
  if (!def) return null
  const usedIn = CONTENT.recipes
    .filter((r) => r.inputs.some((i) => i.itemId === id))
    .slice(0, 5)
    .map((r) => r.name)
  return { def, usedIn }
})

function statsText(def: ItemDef): string {
  const s = def.stats
  if (!s) return ''
  const parts: string[] = []
  const pct = (x: number): string => `+${(x * 100).toFixed(1)}%`
  if (s.speed) parts.push(`速度 ${pct(s.speed)}`)
  if (s.efficiency) parts.push(`效率 ${pct(s.efficiency)}`)
  if (s.quantity) parts.push(`产量 ${pct(s.quantity)}`)
  if (s.wisdom) parts.push(`经验 ${pct(s.wisdom)}`)
  if (s.rareFind) parts.push(`稀有 ${pct(s.rareFind)}`)
  if (s.successRate) parts.push(`强化成功率 ${pct(s.successRate)}`)
  return parts.join(' · ')
}

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
function recycleAll(itemId: string, qty: number): void {
  if (qty >= 20 && !window.confirm(`回收全部 ${qty} 个「${itemDef(itemId).name}」？`)) return
  cmd({ type: 'recycleMaterial', itemId, qty })
}
function recycleInstance(instanceId: number): void {
  cmd({ type: 'recycleInstance', instanceId })
}
function inspect(instanceId: number | null, itemId?: string): void {
  if (itemId) {
    inspectItem(itemId)
    return
  }
  if (instanceId !== null) {
    const inst = instanceById(store.state, instanceId)
    if (inst) inspectItem(inst.itemId)
  }
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
            <div class="slot-item" @click="inspect(s.inst.instanceId)">
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
        {{ pct(agg.toolSpeed.forging + agg.allSpeed) }}<br />
        强化成功率 {{ pct(agg.enhanceRate) }} · 套装 {{ setText }}
      </div>
    </section>

    <section>
      <h4>资源</h4>
      <div v-if="materials.length === 0" class="dim">暂无</div>
      <div v-for="m in materials" :key="m.id" class="row">
        <span class="clickable" @click="inspect(null, m.id)">
          <ItemIcon :item-id="m.id" :size="16" />
          <span class="name">{{ m.name }}</span>
        </span>
        <span class="qty">×{{ m.qty }}</span>
        <button v-if="m.id === 'crate'" class="btn sm" @click="cmd({ type: 'openCrate' })">开启</button>
        <button class="btn sm" @click="recycleMaterial(m.id, 1)">回收1</button>
        <button class="btn sm" @click="recycleMaterial(m.id, Math.min(10, m.qty))">×10</button>
        <button class="btn sm" @click="recycleAll(m.id, m.qty)">全部</button>
      </div>
    </section>

    <section>
      <h4>行囊（装备）</h4>
      <div v-if="bagItems.length === 0" class="dim">暂无</div>
      <div v-for="b in bagItems" :key="b.inst.instanceId" class="row">
        <span class="clickable" @click="inspect(b.inst.instanceId)">
          <ItemIcon :item-id="b.inst.itemId" :size="16" />
          <span class="name">{{ b.name }}<em class="dim"> +{{ b.inst.enhanceLevel }}</em></span>
        </span>
        <button class="btn sm" @click="equipInstance(b.inst.instanceId)">装备</button>
        <button class="btn sm" @click="recycleInstance(b.inst.instanceId)">回收</button>
      </div>
    </section>

    <section v-if="inspected" class="inspect">
      <div class="inspect-head">
        <ItemIcon :item-id="inspected.def.id" :size="22" />
        <span class="inspect-name">{{ inspected.def.name }}</span>
        <span class="spacer" />
        <button class="btn sm" @click="inspectItem(null)">✕</button>
      </div>
      <div v-if="statsText(inspected.def)" class="stat-line">{{ statsText(inspected.def) }}</div>
      <div class="dim">
        价值 {{ inspected.def.value }} 金<template v-if="inspected.def.tier"> · T{{ inspected.def.tier }}</template>
        · {{ inspected.def.category }}
      </div>
      <div v-if="inspected.usedIn.length" class="dim">用途：{{ inspected.usedIn.join('、') }}<template v-if="inspected.usedIn.length >= 5"> 等</template></div>
      <div v-else class="dim">用途：暂无（可回收换金）</div>
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
  cursor: pointer;
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
  gap: 5px;
  font-size: 13px;
  padding: 3px 0;
}
.clickable {
  display: flex;
  align-items: center;
  gap: 5px;
  flex: 1;
  cursor: pointer;
}
.clickable:hover .name {
  color: var(--c-accent);
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
.stat-line {
  font-size: 12px;
  color: var(--c-accent-2);
}
.inspect {
  border: 1px solid var(--c-accent-2);
  border-radius: var(--radius);
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.inspect-head {
  display: flex;
  align-items: center;
  gap: 6px;
}
.inspect-name {
  font-weight: 600;
}
.spacer {
  flex: 1;
}
</style>
