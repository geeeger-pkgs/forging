<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { cmd, inspectInstance, inspectItem, store } from '../../app/store'
import { perfectScore } from '../../game/affixes'
import { recycleGain } from '../../game/economy'
import { fmtPct } from '../format'
import { CONTENT, itemDef } from '../../game/content'
import { effectiveStats } from '../../game/stats'
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
/** v3.4 A1：有效属性（与结算同源；随 store.now 走，符文到期即时反映） */
const eff = computed(() => effectiveStats(store.state, store.now))

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

/** v3.2 B3：按当前视图高亮相关的属性（挖矿页亮挖速/产量，强化页亮强化率…） */
const isMineView = computed(() => store.ui.view === 'mining')
const isEnhanceView = computed(() => store.ui.view === 'enhancing')

/**
 * 当前查看的实例是否已装备 → 是则返回其槽位。
 * v3.2 修正：卸下入口已迁至 `ItemDetailModal`（点击槽位/行囊即开）；
 * 本文件原先那个「材料详情区卸下」按钮的渲染条件与槽位点击互斥，永不显示（评审 Blocker），已删除；
 * 该 computed 现仅用于「槽位行高亮当前查看项」。
 */
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
const RIGHT_TABS = [
  { id: 'gear', label: '装备' },
  { id: 'bag', label: '行囊' },
  { id: 'mats', label: '资源' },
] as const satisfies readonly { id: RightTab; label: string }[]
const rightTab = ref<RightTab>('gear')
const rightOpen = ref(false)
/** v3.4.4：外部（如教程「前往」）请求切到某个分区并展开 */
watch(
  () => store.ui.rightTabWanted,
  (t) => {
    if (!t) return
    void selectRightTab(t as RightTab)
    store.ui.rightTabWanted = null
  },
)

/**
 * v3.3 C2：tablist 的 roving tabindex + 方向键。
 * 收起（无选中）时把「装备」留在 Tab 序列里，保证键盘能进得来；
 * ←/→ 在三个分区之间切换，Home/End 跳到首/尾（APG tab 模式）。
 */
const rovingTabId = computed<RightTab>(() => (rightOpen.value ? rightTab.value : 'gear'))
function onTabKeydown(e: KeyboardEvent): void {
  const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End']
  if (!keys.includes(e.key)) return
  e.preventDefault()
  const ids = RIGHT_TABS.map((t) => t.id) as RightTab[]
  const cur = ids.indexOf(rovingTabId.value)
  const nextIdx =
    e.key === 'Home'
      ? 0
      : e.key === 'End'
        ? ids.length - 1
        : e.key === 'ArrowRight'
          ? (cur + 1) % ids.length
          : (cur - 1 + ids.length) % ids.length
  const next = ids[nextIdx]
  if (rightOpen.value && rightTab.value === next) {
    // 已是当前分区：只把焦点带过去，不改开合
    document.getElementById(`rtab-${next}`)?.focus()
    return
  }
  void selectRightTab(next)
  // 焦点跟随（roving tabindex 的"焦点与选中同步"语义）
  requestAnimationFrame(() => document.getElementById(`rtab-${next}`)?.focus())
}
/**
 * v3.2 评审 N1（两名评审共同要求的放行条件）：底栏常驻后，"点开"必须把玩家带到面板。
 * 面板内容仍在文档末尾（主内容之后），只切换状态的话在页面中部点「资源」→ 视口不动，
 * 唯一变化是按钮变蓝 → 新手判定"这个按钮是坏的"。故窄屏展开后滚动到该分区。
 */
async function toggleRightTab(t: RightTab): Promise<void> {
  if (rightOpen.value && rightTab.value === t) {
    rightOpen.value = false // 再点一次收起（仅**点击**语义；键盘选中走下文的 selectRightTab）
    return
  }
  return selectRightTab(t)
}

/**
 * 选中并展开某分区（**不**收起）。
 * v3.3 实机发现：键盘 ←/→/Home/End 若复用 toggle，按到「当前已选中且已展开」的那一项会**收起面板**
 * （End 停在资源、再按 End 就关掉整个面板），与 APG 选中语义不符。
 */
async function selectRightTab(t: RightTab): Promise<void> {
  const wasOpen = rightOpen.value
  rightTab.value = t
  rightOpen.value = true
  if (typeof window === 'undefined' || !window.matchMedia('(max-width: 900px)').matches) return
  await nextTick()
  const panel = document.getElementById(`rtabpanel-${t}`)
  if (!panel) return
  // 收起→展开时滚动到面板起始处；分区间切换时只保证面板在视口内（避免"跳一下"）
  panel.scrollIntoView({ block: wasOpen ? 'nearest' : 'start', behavior: 'smooth' })
}

/** v3.2 B1：材料「…」菜单与自动保留量内联输入（替代系统 prompt） */
const openMenu = ref<string | null>(null)
const keepDraft = ref<number | null>(null)
/** 草稿仅当是合法数字才可提交：空输入 = 取消（此前空输入会被当成 0，等于静默关闭自动回收 → 评审 Minor） */
const keepValid = computed(() => typeof keepDraft.value === 'number' && Number.isFinite(keepDraft.value))
function materialById(id: string) {
  return materials.value.find((m) => m.id === id)
}
function toggleMenu(id: string): void {
  keepDraft.value = null // 每次开合都清草稿，避免「上一个材料的保留量」被应用到这一个
  openMenu.value = openMenu.value === id ? null : id
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
  if (!id || !keepValid.value) return // 未输入数字：不写库（避免误设 0 把材料全部自动卖掉）
  cmd({ type: 'setAutoRecycle', itemId: id, keep: Math.max(0, Math.floor(keepDraft.value as number)) })
  keepDraft.value = null
  openMenu.value = null
}
function clearKeep(id: string): void {
  cmd({ type: 'setAutoRecycle', itemId: id, keep: null })
  keepDraft.value = null
  openMenu.value = null
}

/** v3.1 装备预设：3 套一键换装（深渊层词条要求为某层重配装；此前约 20 击/轮） */
const gearSets = computed(() => store.state.meta.gearSets ?? [])
/**
 * v3.2 B1 收尾：保存配装改用**内联输入**（此前是 window.prompt —— 日常操作里最后一个系统弹窗，
 * 违反本版 DoD"仅破坏性操作才用 confirm"）。
 */
const gearNameDraft = ref('')
const showGearNameInput = ref(false)
function saveGearSet(): void {
  if (!showGearNameInput.value) {
    showGearNameInput.value = true
    return
  }
  cmd({ type: 'saveGearSet', name: gearNameDraft.value })
  gearNameDraft.value = ''
  showGearNameInput.value = false
}
/** 取消（按钮或 Esc）：退出输入态且不保存（此前只能硬存或刷新 → 评审 Minor） */
function cancelGearName(): void {
  gearNameDraft.value = ''
  showGearNameInput.value = false
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
/**
 * v3.3 C4：高价值回收二次确认（"撤销"的降级方案，见 design-v3.3 §1-C4）。
 * 阈值表驱动（`data/config.json.recycleConfirm`），只对"删了会心疼"的两类触发：
 *   · 完美度 ≥ perfectScore（接近满词缀，通常是主力装备）
 *   · 单件回收金 ≥ goldGain
 */
function recycleInstance(instanceId: number): void {
  const inst = store.state.equipment.find((e) => e.instanceId === instanceId)
  const cfg = CONTENT.config.recycleConfirm
  if (inst && cfg) {
    const score = perfectScore(inst.itemId, inst.affixes)
    const gain = recycleGain(store.state, inst.itemId, 1)
    // v3.3 评审校准：0.9 是"及格线"（设计里的目标线），清杂鱼装备时几乎次次弹窗 →
    // 改为完美阈值 0.95 + 2 万金（≈末期 16 分钟产出）+ **强化投入保护**（+N 的投入不返还，
    // 此前一件 +5 的装备可能被静默回收）
    const invested = inst.enhanceLevel >= cfg.enhanceLevel
    const highValue = score >= cfg.perfectScore || gain >= cfg.goldGain || invested
    const tip = invested ? `\n注意：强化 +${inst.enhanceLevel} 的投入不返还` : ''
    const msg = `回收「${itemDef(inst.itemId).name} +${inst.enhanceLevel}」？\n完美度 ${fmtPct(score)}、回收 +${gain} 金${tip}\n（不可撤销）`
    if (highValue && !window.confirm(msg)) return
  }
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
  return `${count}词缀 ${fmtPct(score)}`
}

/** 高亮阈值统一取自内容表（评审 m4：不再硬编码 0.9） */
const TOP_SCORE = CONTENT.affixes.perfectThreshold
function isTop(score: number): boolean {
  return score >= TOP_SCORE
}
</script>

<template>
  <aside class="right" :class="{ 'tab-open': rightOpen }" :data-tab="rightTab">
    <!-- v3.2 A2：窄屏 Tab 条（桌面隐藏）。**常驻视口底部**——评审 Major：
         此前用 sticky（包含块是页面末尾的 aside），未滚到页面底部时根本不可见，等于没有入口。 -->
    <nav
      class="rtabs"
      role="tablist"
      aria-label="右侧面板分区（装备 / 行囊 / 资源）"
      @keydown="onTabKeydown"
    >
      <button
        v-for="t in RIGHT_TABS"
        :key="t.id"
        class="rtab"
        role="tab"
        :id="`rtab-${t.id}`"
        :aria-controls="`rtabpanel-${t.id}`"
        :aria-selected="rightOpen && rightTab === t.id"
        :class="{ active: rightOpen && rightTab === t.id }"
        :tabindex="rovingTabId === t.id ? 0 : -1"
        @click="toggleRightTab(t.id)"
      >
        {{ t.label }}
      </button>
    </nav>
    <section id="rtabpanel-gear" role="tabpanel" aria-labelledby="rtab-gear" data-sec="gear">
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
        <template v-if="showGearNameInput">
          <input
            v-model="gearNameDraft"
            class="num-input"
            :placeholder="`配装${gearSets.length + 1}`"
            maxlength="10"
            @keyup.enter="saveGearSet"
            @keyup.esc="cancelGearName"
          />
          <button class="btn sm primary" title="确认保存" @click="saveGearSet">保存</button>
          <button class="btn sm" title="取消（Esc）" @click="cancelGearName">取消</button>
        </template>
        <button v-else class="btn sm" title="保存当前着装（最多 3 套）" @click="saveGearSet">存配装</button>
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
            <!-- v3.2 修正：槽位是可点入口，但此前只有 cursor:pointer（触屏无 hover、键盘不可达）
                 → 补 title / role / tabindex / Enter，并高亮"正在查看"的槽位（评审 Minor/Nit） -->
            <div
              class="slot-item"
              :class="{ inspecting: inspectedSlot === s.id }"
              role="button"
              tabindex="0"
              :title="`查看「${s.name}」详情（可卸下 / 重铸）`"
              @click="inspect(s.inst.instanceId)"
              @keyup.enter="inspect(s.inst.instanceId)"
              @keydown.space.prevent="inspect(s.inst.instanceId)"
            >
              <ItemIcon :item-id="s.inst.itemId" :size="18" />
              <span class="slot-name">{{ s.name }}<em>+{{ s.inst.enhanceLevel }}</em></span>
              <span class="chev" aria-hidden="true">›</span>
            </div>
            <div v-if="s.affix > 0" class="affix-badge" :class="{ top: isTop(s.score) }">
              {{ affixBadge(s.affix, s.score) }}
            </div>
          </template>
          <div v-else class="slot-empty">空</div>
        </div>
      </div>
      <div class="stats-line">
        <!-- v3.4 A1：面板与结算同源（装备 + 符文 + 精通）—— 此前只显示装备侧，符文激活后数值不动 -->
        <span :class="{ hot: isMineView }">效率 {{ pct(eff.efficiency) }}</span> ·
        <span :class="{ hot: isMineView }">产量 {{ pct(agg.quantity) }}</span> ·
        <span :class="{ hot: isMineView || isEnhanceView }">经验 {{ pct(eff.wisdom) }}</span> ·
        <span :class="{ hot: isMineView }">稀有 {{ pct(eff.rareFind) }}</span><br />
        <span :class="{ hot: isMineView }">挖速 {{ pct(eff.toolSpeed.mining) }}</span> ·
        <span :class="{ hot: store.ui.view === 'smelting' }">熔速 {{ pct(eff.toolSpeed.smelting) }}</span> ·
        <span :class="{ hot: store.ui.view === 'forging' }">锻速 {{ pct(eff.toolSpeed.forging) }}</span><br />
        <span :class="{ hot: isEnhanceView }">强化成功率 {{ pct(eff.enhanceRate) }}</span> · 套装 {{ setText }}
      </div>
    </section>

    <section id="rtabpanel-mats" role="tabpanel" aria-labelledby="rtab-mats" data-sec="mats">
      <h3>资源</h3>
      <div v-if="materials.length === 0" class="dim">暂无资源（下一步：回矿场挖矿或熔炼矿石）</div>
      <div v-for="m in materials" :key="m.id" class="mat-item">
        <div class="row">
          <!-- v3.3 C3：可点文字也要能键盘到达（此前只有鼠标 hover/cursor 提示） -->
          <span
            class="clickable"
            role="button"
            tabindex="0"
            :title="`查看「${m.name}」用途`"
            @click="inspect(null, m.id)"
            @keyup.enter="inspect(null, m.id)"
            @keydown.space.prevent="inspect(null, m.id)"
          >
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
              :title="autoKeep(m.id) !== undefined ? `自动回收已开启（保留 ${autoKeep(m.id)}）` : '更多操作（回收 / 自动保留）'"
              @click="toggleMenu(m.id)"
            >
              {{ autoKeep(m.id) !== undefined ? `自动·留${autoKeep(m.id)}` : '…' }}
            </button>
          </template>
          <span v-else class="dim small" title="图鉴收集品：无回收价值，也不参与自动回收">收藏品</span>
        </div>
        <!-- v3.2 修正：菜单在**被点的那一行**下方展开（此前只有一个实例渲染在整个列表末尾，材料多时离手很远、甚至滚出屏幕 → 评审 Minor） -->
        <div v-if="openMenu === m.id" class="mat-menu">
          <button class="btn sm" @click="recycleThen('1')">回收 1</button>
          <button class="btn sm" @click="recycleThen('10')">回收 10</button>
          <button class="btn sm" title="从该材料开始自动回收：保留量以上的部分自动卖出" @click="recycleThen('all')">全部回收</button>
          <span class="spacer" />
          <label class="dim small" title="保留量以上的部分会被自动卖出">自动保留</label>
          <span class="dim small">（留 0 = 全部卖出）</span>
          <input
            v-model.number="keepDraft"
            class="num-input"
            type="number"
            min="0"
            step="10"
            :placeholder="String(autoKeep(m.id) ?? 0)"
            @keyup.enter="applyKeep"
          />
          <button class="btn sm primary" :disabled="!keepValid" title="输入数字后应用（留 0 = 全部自动卖出）" @click="applyKeep">应用</button>
          <button
            v-if="autoKeep(m.id) !== undefined"
            class="btn sm"
            title="关闭该材料的自动回收（不再自动卖出）"
            @click="clearKeep(m.id)"
          >
            关自动
          </button>
          <button class="btn sm" title="收起（不修改）" @click="toggleMenu(m.id)">关闭</button>
        </div>
      </div>
    </section>

    <section id="rtabpanel-bag" role="tabpanel" aria-labelledby="rtab-bag" data-sec="bag">
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
        <!-- v3.3 C3：键盘可达（role/tabindex/Enter+Space），与材料行一致 -->
        <span
          class="clickable"
          role="button"
          tabindex="0"
          :title="`查看「${b.name}」详情（可卸下 / 重铸）`"
          @click="inspect(b.inst.instanceId)"
          @keyup.enter="inspect(b.inst.instanceId)"
          @keydown.space.prevent="inspect(b.inst.instanceId)"
        >
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
  border-radius: 4px;
  padding: 1px 2px;
}
.slot-item:hover,
.slot-item.inspecting {
  background: var(--c-panel-2);
}
.slot-item.inspecting {
  outline: 1px solid var(--c-accent-2);
}
.slot-item .chev {
  color: var(--c-text-dim);
  font-size: 14px;
  line-height: 1;
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
  font-size: 12px;
  color: var(--c-text-dim);
  line-height: 1.8;
}
/* v3.2 B3 修正：当前视图相关的数值高亮。**容器类名是 stats-line**——此前误写成 `.stat-line .hot`
   （少一个 s，那是"物品详情属性行"的类），高亮从未生效（评审 Major：白加 class） */
.stats-line .hot {
  color: var(--c-accent);
  font-weight: 600;
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
  align-self: stretch; /* v3.2 评审：让热区撑满整行，而不是只有文字那一条 */
  min-height: 28px;
  cursor: pointer;
}
/* v3.3 评审：窄屏触控高度补到 40px（此前只有 28px，DoD 却已写已落地） */
@media (max-width: 900px) {
  .clickable {
    min-height: 40px;
  }
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
  /* v3.2 A2 修正：Tab 条**常驻视口底部**（fixed，而非 sticky——sticky 的包含块是页面末尾的 aside，
     不滚到底就看不见，等于没有入口）。主内容留出等高的底部内边距，避免遮住最后一行。
     展开分区时 Tab 条同样固定在底部（面板在其上方展开）。 */
  .rtabs {
    display: flex;
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    background: var(--c-panel);
    border-top: 1px solid var(--c-border);
    padding: 6px 8px calc(6px + env(safe-area-inset-bottom, 0px));
    z-index: 6;
  }
  .rtab {
    min-height: 40px;
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
