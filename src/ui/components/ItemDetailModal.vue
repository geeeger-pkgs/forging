<script setup lang="ts">
// ============================================================
// 装备实例详情（v2.1）：基础属性 + 词缀品质 + 重铸（锁定/造价）
// ============================================================
import { computed, ref, watch } from 'vue'
import { cmd, inspectInstance, store } from '../../app/store'
import { affixDef, affixQuality, maxLocks, perfectScore, reforgeCost } from '../../game/affixes'
import { reforgeBlockReason } from '../../game/commands'
import { CONTENT, itemDef } from '../../game/content'
import { instanceById, isEquipped, materialCount } from '../../game/state'
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

const inst = computed(() => {
  const id = store.ui.inspectInstanceId
  return id === null ? null : instanceById(store.state, id) ?? null
})

const def = computed<ItemDef | null>(() => (inst.value ? itemDef(inst.value.itemId) : null))

const locks = ref<number[]>([])
watch(
  () => store.ui.inspectInstanceId,
  () => {
    locks.value = []
  },
)

function toggleLock(i: number): void {
  const at = locks.value.indexOf(i)
  if (at >= 0) locks.value.splice(at, 1)
  else locks.value.push(i)
}

const score = computed(() => {
  const i = inst.value
  return i ? perfectScore(i.itemId, i.affixes) : 0
})

const cost = computed(() => {
  const i = inst.value
  return i ? reforgeCost(i.itemId, locks.value.length) : null
})

const blockReason = computed(() => {
  const i = inst.value
  if (!i) return '装备不存在'
  return reforgeBlockReason(store.state, i.instanceId, locks.value)
})

function quality(i: number): number {
  const it = inst.value
  if (!it) return 0
  return affixQuality(it.itemId, it.affixes[i])
}

function qualityPct(i: number): string {
  return `${Math.round(quality(i) * 100)}%`
}

function isPerfect(i: number): boolean {
  return quality(i) >= CONTENT.affixes.perfectThreshold
}

/** 单条词缀的装备没有可锁定项（至少留 1 条参与重摇） */
const canLock = computed(() => (inst.value ? maxLocks(inst.value.itemId) > 0 : false))

/**
 * 整件完美度高亮线（0.9 = 设计 §3 的玩家目标线）。
 * 与「单条词缀 ★完美」的 `perfectThreshold`(0.95) 语义不同：后者是成就/单条品质口径。
 */
const TARGET_SCORE = 0.9
const LOCK_GOLD_FACTOR = CONTENT.affixes.reforge.lockGoldFactor

function statsText(d: ItemDef): string {
  const s = d.stats
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

const have = computed(() => ({
  gold: store.state.gold,
  essence: materialCount(store.state, 'essence'),
  emberstone: materialCount(store.state, 'emberstone'),
}))

function doReforge(): void {
  const i = inst.value
  if (!i) return
  cmd({ type: 'reforge', instanceId: i.instanceId, locks: [...locks.value] })
}

function close(): void {
  inspectInstance(null)
}
</script>

<template>
  <div v-if="inst && def" class="overlay" @click.self="close">
    <div class="dialog detail-dialog">
      <header>
        <ItemIcon :item-id="inst.itemId" :size="24" />
        <h3>
          {{ def.name }}<span class="enh">+{{ inst.enhanceLevel }}</span>
        </h3>
        <button class="btn sm" @click="close">✕</button>
      </header>

      <div class="row">
        <label>部位</label>
        <span>{{ def.slot ? SLOT_LABEL[def.slot] : '—' }}<template v-if="isEquipped(store.state, inst.instanceId)"> · 已装备</template></span>
      </div>
      <div v-if="statsText(def)" class="row">
        <label>基础</label>
        <span class="accent">{{ statsText(def) }}</span>
      </div>
      <div class="row">
        <label>完美度</label>
        <span :class="{ good: score >= TARGET_SCORE }">{{ (score * 100).toFixed(1) }}%</span>
      </div>

      <div class="affix-head">
        <span>词缀（{{ inst.affixes.length }}）</span>
        <span class="dim">{{ canLock ? '锁定后重铸不会改变该条' : '仅 1 条词缀，无可锁定项' }}</span>
      </div>

      <div v-if="inst.affixes.length === 0" class="dim">该物品没有词缀（仅 T1 以上装备拥有）</div>
      <div
        v-for="(a, i) in inst.affixes"
        :key="a.id"
        class="affix"
        :class="{ locked: locks.includes(i), perfect: isPerfect(i) }"
      >
        <button
          v-if="canLock"
          class="btn sm lockbtn"
          :class="{ primary: locks.includes(i) }"
          :aria-label="locks.includes(i) ? '取消锁定该词缀' : '锁定该词缀'"
          @click="toggleLock(i)"
        >
          {{ locks.includes(i) ? '🔒' : '🔓' }}
        </button>
        <span v-else class="lockbtn spacer-dot" aria-hidden="true">·</span>
        <span class="aname">{{ affixDef(a.id).name }}</span>
        <span class="aval">+{{ (a.value * 100).toFixed(1) }}%</span>
        <span class="aq" :class="{ good: isPerfect(i) }">{{ qualityPct(i) }}<template v-if="isPerfect(i)"> ★</template></span>
      </div>

      <div v-if="cost" class="cost">
        <div class="row">
          <label>造价</label>
          <span>
            <span :class="{ bad: have.gold < cost.gold }">{{ cost.gold }} 金</span> ·
            <span :class="{ bad: have.essence < cost.essence }">精华 ×{{ cost.essence }}</span>
            <template v-if="cost.emberstone > 0">
              · <span :class="{ bad: have.emberstone < cost.emberstone }">重铸石 ×{{ cost.emberstone }}</span>
            </template>
          </span>
        </div>
        <p v-if="locks.length > 0" class="dim small">
          锁定 {{ locks.length }} 条：重铸石消耗 {{ cost.emberstone }}，金币造价 ×{{
            (1 + LOCK_GOLD_FACTOR * locks.length).toFixed(1)
          }}
        </p>
      </div>

      <p v-if="blockReason" class="reason bad">⚠ {{ blockReason }}</p>

      <footer>
        <span class="dim small gold">💰 {{ have.gold }} · 精华 {{ have.essence }} · 重铸石 {{ have.emberstone }}</span>
        <div class="right-actions">
          <button class="btn" @click="close">关闭</button>
          <button class="btn primary" :disabled="!!blockReason" @click="doReforge">⚒ 重铸</button>
        </div>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.detail-dialog {
  width: 460px;
  max-width: calc(100vw - 24px);
}
header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
header h3 {
  flex: 1;
  margin: 0;
}
.enh {
  color: var(--c-accent-2);
  margin-left: 4px;
}
.row {
  display: flex;
  gap: 10px;
  font-size: 13px;
  line-height: 1.9;
}
.row label {
  width: 52px;
  color: var(--c-text-dim);
  flex-shrink: 0;
}
.accent {
  color: var(--c-accent-2);
}
.good {
  color: var(--c-success);
}
.bad {
  color: var(--c-danger);
}
.dim {
  color: var(--c-text-dim);
  font-size: 12px;
}
.small {
  font-size: 11px;
}
.affix-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin: 10px 0 4px;
  font-size: 13px;
  color: var(--c-text-dim);
}
.affix {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  padding: 4px 6px;
  border: 1px solid var(--c-border);
  border-radius: 6px;
  margin-bottom: 4px;
}
.affix.locked {
  border-color: var(--c-accent);
}
.affix.perfect {
  border-color: var(--c-success);
}
.lockbtn {
  padding: 2px 6px;
}
.spacer-dot {
  color: var(--c-text-dim);
  width: 22px;
  text-align: center;
}
.aname {
  flex: 1;
}
.aval {
  color: var(--c-accent-2);
  font-variant-numeric: tabular-nums;
}
.aq {
  width: 46px;
  text-align: right;
  color: var(--c-text-dim);
  font-variant-numeric: tabular-nums;
}
.cost {
  margin-top: 10px;
  border-top: 1px solid var(--c-border);
  padding-top: 8px;
}
.reason {
  margin: 8px 0 0;
  font-size: 13px;
}
footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
}
.right-actions {
  display: flex;
  gap: 8px;
}
@media (max-width: 900px) {
  .detail-dialog {
    width: 100%;
  }
}
</style>
