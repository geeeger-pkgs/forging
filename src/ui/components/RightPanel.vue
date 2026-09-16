<script setup lang="ts">
import { computed, ref } from 'vue'
import { cmd, inspectInstance, inspectItem, store } from '../../app/store'
import { perfectScore } from '../../game/affixes'
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

const TIER_CN: Record<number, string> = { 1: '铜', 2: '铁', 3: '银', 4: '金', 5: '秘银', 6: '星尘', 7: '虚空' }

const slots = computed(() =>
  SLOT_IDS.map((id) => {
    const instId = store.state.slots[id]
    const inst = instId !== undefined ? instanceById(store.state, instId) : undefined
    return {
      id,
      label: SLOT_LABEL[id],
      inst: inst ?? null,
      name: inst ? itemDef(inst.itemId).name : '',
      affix: inst ? inst.affixes.length : 0,
      score: inst ? perfectScore(inst.itemId, inst.affixes) : 0,
    }
  }),
)

const materials = computed(() =>
  Object.entries(store.state.materials)
    .filter(([, qty]) => qty > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, qty]) => ({ id, qty, name: itemDef(id).name, value: itemDef(id).value, total: itemDef(id).value * qty })),
)

/** v3.0 L2：行囊排序键（完美度 / 强化 / 档位），默认按完美度降序 */
const bagSort = ref<'perfect' | 'enhance' | 'tier'>('perfect')
const bagItems = computed(() => {
  const equipped = new Set(Object.values(store.state.slots))
  const list = store.state.equipment
    .filter((e) => !equipped.has(e.instanceId))
    .map((e) => ({
      inst: e,
      name: itemDef(e.itemId).name,
      affix: e.affixes.length,
      score: perfectScore(e.itemId, e.affixes),
      tier: itemDef(e.itemId).tier ?? 0,
    }))
  const key = bagSort.value
  return list.sort((a, b) =>
    key === 'enhance'
      ? (b.inst.enhanceLevel ?? 0) - (a.inst.enhanceLevel ?? 0) || b.score - a.score
      : key === 'tier'
        ? (b.tier ?? 0) - (a.tier ?? 0) || b.score - a.score
        : b.score - a.score || (b.inst.enhanceLevel ?? 0) - (a.inst.enhanceLevel ?? 0),
  )
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
/** 当前查看的实例是否已装备 → 是则返回其槽位（详情内的「卸下」按钮用） */
/** v3.2 B3：按当前视图高亮相关的属性（挖矿页亮挖速/产量，强化页亮强化率…） */
const isMineView = computed(() => store.ui.view === 'mining')
const isEnhanceView = computed(() => store.ui.view === 'enhancing')

const inspectedSlot = computed<SlotId | null>(() => {
  const instId = store.ui.inspectInstanceId
  if (instId === null) return null
  for (const [slot, id] of Object.entries(store.state.slots)) {
    if (id === instId) return slot as SlotId
  }
  return null
})

function equipInstance(instanceId: number): void {
  cmd({ type: 'equip', instanceId })
}
/**
 * v3.0 L2：整理前二次确认。
 * 测评 D2：原实现一击不可逆且并列时会"卖强留弱"（内核已修：并列保留高强化）；
 * 回收价不含强化投入，因此确认框里如实提示"将被回收的最高强化等级"。
 */
function tidyBag(): void {
  const equipped = new Set(Object.values(store.state.slots))
  let willDrop = 0
  let topEnh = 0
  const byItem = new Map<string, number[]>()
  for (const inst of store.state.equipment) {
    if (equipped.has(inst.instanceId)) continue
    const list = byItem.get(inst.itemId) ?? []
    list.push(inst.instanceId)
    byItem.set(inst.itemId, list)
  }
  for (const [itemId, ids] of byItem) {
    if (ids.length <= 1) continue
    const list = store.state.equipment
      .filter((e) => e.itemId === itemId && !equipped.has(e.instanceId))
      .sort(
        (a, b) =>
          perfectScore(b.itemId, b.affixes) - perfectScore(a.itemId, a.affixes) ||
          (b.enhanceLevel ?? 0) - (a.enhanceLevel ?? 0),
      )
    for (const inst of list.slice(1)) {
      willDrop += 1
      topEnh = Math.max(topEnh, inst.enhanceLevel ?? 0)
    }
  }
  if (willDrop > 0) {
    const extra = topEnh > 0 ? `（其中最高强化 +${topEnh}，回收价不含强化投入）` : ''
    if (!window.confirm(`整理将回收 ${willDrop} 件重复装备（每个原型只留完美度最高的一件）${extra}。确定继续？`)) return
  }
  cmd({ type: 'tidyBag' })
}

/**
 * v3.2 A2：窄屏右栏 Tab。
 * 窄屏下右栏原本整块沉在动作网格之后（卖矿/换装要滚过整页，测评 B-10）；
 * 现在默认收起，用底部一排 Tab 切换三个分区；桌面端（>900px）三块始终全展示。
 */
type RightTab = 'gear' | 'bag' | 'mats'
const rightTab = ref<RightTab>('gear')
const rightOpen = ref(false)
function toggleRightTab(t: RightTab): void {
  if (rightOpen.value && rightTab.value === t) {
    rightOpen.value = false // 再点一次收起
    return
  }
  rightTab.value = t
  rightOpen.value = true
}

/** v3.2 B1：材料「…」菜单与自动保留量内联输入（替代系统 prompt） */
const openMenu = ref<string | null>(null)
const keepDraft = ref<number | null>(null)
function materialById(id: string) {
  return materials.value.find((m) => m.id === id)
}
function recycleThen(kind: '1' | '10' | 'all'): void {
  const id = openMenu.value
  const m = id ? materialById(id) : undefined
  if (!id || !m) return
  if (kind === 'all') recycleAll(id, m.qty)
  else recycleMaterial(id, kind === '1' ? 1 : Math.min(10, m.qty))
  openMenu.value = null
}
function applyKeep(): void {
  const id = openMenu.value
  if (!id) return
  const v = keepDraft.value
  cmd({ type: 'setAutoRecycle', itemId: id, keep: v === null || Number.isNaN(v) ? null : Math.max(0, Math.floor(v)) })
  keepDraft.value = null
  openMenu.value = null
}

/** v3.1 装备预设：3 套一键换装（深渊层词条要求为某层重配装；此前约 20 击/轮） */
const gearSets = computed(() => store.state.meta.gearSets ?? [])
function saveGearSet(): void {
  const input = window.prompt('保存当前着装为配装（最多 3 套，超出挤掉最旧的）：名称', `配装${gearSets.value.length + 1}`)
  if (input === null) return
  cmd({ type: 'saveGearSet', name: input })
}

/** v3.0：是否可回收（0 收益的遗物/徽记不可回收，避免误删图鉴进度） */
function recyclable(itemId: string): boolean {
  return (CONTENT.items[itemId]?.value ?? 0) > 0
}

function recycleMaterial(itemId: string, qty: number): void {
  cmd({ type: 'recycleMaterial', itemId, qty })
}
function recycleAll(itemId: string, qty: number): void {
  if (qty >= 20 && !window.confirm(`回收全部 ${qty} 个「${itemDef(itemId).name}」？`)) return
  cmd({ type: 'recycleMaterial', itemId, qty })
}
function autoKeep(itemId: string): number | undefined {
  return store.state.meta.autoRecycle[itemId]
}
function recycleInstance(instanceId: number): void {
  cmd({ type: 'recycleInstance', instanceId })
}
/** 材料 → 简单详情条；装备实例 → 词缀详情弹窗（v2.1） */
function inspect(instanceId: number | null, itemId?: string): void {
  if (itemId) {
    inspectItem(itemId)
    return
  }
  if (instanceId !== null) inspectInstance(instanceId)
}

/** 词缀徽标文本：无词缀返回空串 */
function affixBadge(count: number, score: number): string {
  if (count <= 0) return ''
  return `${count}词缀 ${Math.round(score * 100)}%`
}

/** 高亮阈值统一取自内容表（评审 m4：不再硬编码 0.9） */
const TOP_SCORE = CONTENT.affixes.perfectThreshold
function isTop(score: number): boolean {
  return score >= TOP_SCORE
}
</script>

<template>
  <aside class="right" :class="{ 'tab-open': rightOpen }" :data-tab="rightTab">
    <!-- v3.2 A2：窄屏 Tab 条（桌面隐藏） -->
    <nav class="rtabs" role="tablist" aria-label="右侧面板分区">
      <button
        v-for="t in ([
          { id: 'gear', label: '装备' },
          { id: 'bag', label: '行囊' },
          { id: 'mats', label: '资源' },
        ] as const)"
        :key="t.id"
        class="rtab"
        role="tab"
        :aria-selected="rightOpen && rightTab === t.id"
        :class="{ active: rightOpen && rightTab === t.id }"
        @click="toggleRightTab(t.id)"
      >
        {{ t.label }}
      </button>
    </nav>
    <section data-sec="gear">
      <h3>装备</h3>
      <div class="gearsets">
        <button
          v-for="g in gearSets"
          :key="g.id"
          class="btn sm"
          :title="`一键穿戴「${g.name}」`"
          @click="cmd({ type: 'applyGearSet', setId: g.id })"
        >
          {{ g.name }}
        </button>
        <button class="btn sm" title="保存当前着装（最多 3 套）" @click="saveGearSet">存配装</button>
        <button
          v-for="g in gearSets"
          :key="'del-' + g.id"
          class="btn sm danger"
          :title="`删除「${g.name}」`"
          @click="cmd({ type: 'deleteGearSet', setId: g.id })"
        >
          ✕
        </button>
      </div>
      <div class="slots">
        <div v-for="s in slots" :key="s.id" class="slot" :class="{ filled: s.inst }">
          <div class="slot-label">{{ s.label }}</div>
          <template v-if="s.inst">
            <div class="slot-item" @click="inspect(s.inst.instanceId)">
              <ItemIcon :item-id="s.inst.itemId" :size="18" />
              <span class="slot-name">{{ s.name }}<em>+{{ s.inst.enhanceLevel }}</em></span>
            </div>
            <div v-if="s.affix > 0" class="affix-badge" :class="{ top: isTop(s.score) }">
              {{ affixBadge(s.affix, s.score) }}
            </div>
            <!-- v3.2 B2：卸下移入装备详情（点击槽位即打开），槽位行不再常驻 10 个按钮 -->
          </template>
          <div v-else class="slot-empty">空</div>
        </div>
      </div>
      <div class="stats-line">
        <span :class="{ hot: isMineView }">效率 {{ pct(agg.efficiency) }}</span> ·
        <span :class="{ hot: isMineView }">产量 {{ pct(agg.quantity) }}</span> ·
        <span :class="{ hot: isMineView || isEnhanceView }">经验 {{ pct(agg.wisdom) }}</span> ·
        <span :class="{ hot: isMineView }">稀有 {{ pct(agg.rareFind) }}</span><br />
        <span :class="{ hot: isMineView }">挖速 {{ pct(agg.toolSpeed.mining + agg.allSpeed) }}</span> ·
        <span :class="{ hot: store.ui.view === 'smelting' }">熔速 {{ pct(agg.toolSpeed.smelting + agg.allSpeed) }}</span> ·
        <span :class="{ hot: store.ui.view === 'forging' }">锻速 {{ pct(agg.toolSpeed.forging + agg.allSpeed) }}</span><br />
        <span :class="{ hot: isEnhanceView }">强化成功率 {{ pct(agg.enhanceRate) }}</span> · 套装 {{ setText }}
      </div>
    </section>

    <section data-sec="mats">
      <h3>资源</h3>
      <div v-if="materials.length === 0" class="dim">暂无资源（去挖矿或熔炼获得）</div>
      <div v-for="m in materials" :key="m.id" class="row">
        <span class="clickable" @click="inspect(null, m.id)">
          <ItemIcon :item-id="m.id" :size="16" />
          <span class="name">{{ m.name }}</span>
        </span>
        <span class="qty" :title="`单价 ${m.value} 金 · 全部回收 +${m.total} 金`">
          ×{{ m.qty }}<em class="price">（单价 {{ m.value }}）</em>
        </span>
        <button v-if="m.id === 'crate'" class="btn sm" @click="cmd({ type: 'openCrate' })">开启</button>
        <button v-if="CONTENT.items[m.id]?.category === 'rune'" class="btn sm" @click="cmd({ type: 'useRune', itemId: m.id })">激活</button>
        <!-- v3.0：0 收益物品（遗物/徽记）不出现在回收入口（防误删图鉴进度） -->
        <template v-if="recyclable(m.id)">
          <!-- v3.2 B1：回收收进「…」菜单（此前一行 4 个按钮），自动保留量改内联输入 -->
          <button
            class="btn sm menu-btn"
            :class="{ primary: autoKeep(m.id) !== undefined }"
            :aria-expanded="openMenu === m.id"
            :title="autoKeep(m.id) !== undefined ? `自动回收已开启（保留 ${autoKeep(m.id)}）` : '更多操作'"
            @click="openMenu = openMenu === m.id ? null : m.id"
          >
            {{ autoKeep(m.id) !== undefined ? `自动·留${autoKeep(m.id)}` : '…' }}
          </button>
        </template>
        <span v-else class="dim small" title="图鉴收集品：无回收价值，也不参与自动回收">收藏品</span>
      </div>
      <div v-if="openMenu && materialById(openMenu)" class="mat-menu">
        <span class="dim small">{{ materialById(openMenu)!.name }}：</span>
        <button class="btn sm" @click="recycleThen('1')">回收 1</button>
        <button class="btn sm" @click="recycleThen('10')">回收 10</button>
        <button class="btn sm" @click="recycleThen('all')">全部回收</button>
        <span class="spacer" />
        <label class="dim small">自动保留</label>
        <input
          v-model.number="keepDraft"
          class="num-input"
          type="number"
          min="0"
          step="10"
          :placeholder="String(autoKeep(openMenu) ?? 0)"
        />
        <button class="btn sm primary" @click="applyKeep()">应用</button>
        <button class="btn sm" @click="openMenu = null">关闭</button>
      </div>
    </section>

    <section data-sec="bag">
      <h3>行囊（装备）</h3>
      <div class="bagbar">
        <span class="dim small">排序</span>
        <button class="btn sm" :class="{ primary: bagSort === 'perfect' }" @click="bagSort = 'perfect'">完美度</button>
        <button class="btn sm" :class="{ primary: bagSort === 'enhance' }" @click="bagSort = 'enhance'">强化</button>
        <button class="btn sm" :class="{ primary: bagSort === 'tier' }" @click="bagSort = 'tier'">档位</button>
        <span class="spacer" />
        <button class="btn sm" title="同一原型只保留最高完美度（并列时留高强化）的一件，其余回收换金" @click="tidyBag()">整理</button>
      </div>
      <div v-if="bagItems.length === 0" class="dim">行囊为空（锻造装备后会出现在这里）</div>
      <div v-for="b in bagItems" :key="b.inst.instanceId" class="row">
        <span class="clickable" @click="inspect(b.inst.instanceId)">
          <ItemIcon :item-id="b.inst.itemId" :size="16" />
          <span class="name">
            {{ b.name }}<em class="dim"> +{{ b.inst.enhanceLevel }}</em>
            <em v-if="b.affix > 0" class="affix-inline" :class="{ top: isTop(b.score) }">
              {{ affixBadge(b.affix, b.score) }}
            </em>
          </span>
        </span>
        <button class="btn sm" @click="equipInstance(b.inst.instanceId)">装备</button>
        <button class="btn sm" @click="recycleInstance(b.inst.instanceId)">回收</button>
      </div>
    </section>

    <section v-if="inspected" class="inspect">
      <!-- 详情内卸下（v3.2 B2） -->
      <div class="inspect-head">
        <ItemIcon :item-id="inspected.def.id" :size="22" />
        <span class="inspect-name">{{ inspected.def.name }}</span>
        <span class="spacer" />
        <button v-if="inspectedSlot" class="btn sm" title="卸下该槽位装备" @click="unequip(inspectedSlot)">卸下</button>
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
.gearsets {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 2px 0 6px;
}
.bagbar {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 4px 0 6px;
}
/* v3.2 A2：Tab 条（桌面隐藏） */
.rtabs {
  display: none;
  gap: 6px;
}
.rtab {
  flex: 1;
  border: 1px solid var(--c-border);
  background: transparent;
  color: var(--c-text);
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 13px;
  font-family: var(--font);
  cursor: pointer;
}
.rtab.active {
  border-color: var(--c-accent);
  color: var(--c-accent);
}
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
h3 {
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
.affix-badge {
  font-size: 10px;
  color: var(--c-accent-2);
  border: 1px solid var(--c-border);
  border-radius: 4px;
  padding: 0 4px;
  align-self: flex-start;
}
.affix-badge.top,
.affix-inline.top {
  color: var(--c-success);
  border-color: var(--c-success);
}
.affix-inline {
  font-style: normal;
  font-size: 10px;
  color: var(--c-accent-2);
  margin-left: 4px;
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
.price {
  color: var(--c-text-dim);
  font-style: normal;
  font-size: 11px;
  margin-left: 4px;
}
.qty {
  color: var(--c-text-dim);
}
.dim {
  color: var(--c-text-dim);
  font-size: 12px;
}
.stat-line .hot {
  color: var(--c-accent);
  font-weight: 600;
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
/* v3.2 B1：材料操作菜单 */
.mat-menu {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 6px 4px;
  margin: 2px 0 6px;
  border: 1px dashed var(--c-border);
  border-radius: 6px;
}
.num-input {
  width: 72px;
  background: var(--c-bg-deep);
  border: 1px solid var(--c-border);
  color: var(--c-text);
  border-radius: 6px;
  padding: 3px 6px;
  font-family: var(--font);
  font-size: 12px;
}
.spacer {
  flex: 1;
}

/* v1.8：窄屏纵向堆叠 */
@media (max-width: 900px) {
  .right {
    width: auto;
    min-width: 0;
    border-left: none;
    border-top: 1px solid var(--c-border);
    overflow-y: visible;
  }
  /* v3.2 A2：窄屏用 Tab 切换分区；未展开时不占高度 */
  .rtabs {
    display: flex;
    position: sticky;
    bottom: 0;
    background: var(--c-panel);
    padding: 6px 0;
    z-index: 5;
  }
  .right > section {
    display: none;
  }
  .right.tab-open[data-tab='gear'] > section[data-sec='gear'],
  .right.tab-open[data-tab='mats'] > section[data-sec='mats'],
  .right.tab-open[data-tab='bag'] > section[data-sec='bag'] {
    display: block;
  }
  /* 详情弹层（点击装备查看）始终可显示 */
  .right > section.inspect {
    display: block;
  }
  .slots {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  }
}
</style>
