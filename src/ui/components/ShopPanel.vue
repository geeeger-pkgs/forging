<script setup lang="ts">
import { computed } from 'vue'
import { cmd, store } from '../../app/store'
import { CONTENT, itemDef } from '../../game/content'

const slots = computed(() => store.state.queueSlots)
const maxSlots = CONTENT.config.maxQueueSlots
const tutorialGrant = computed(() => (store.state.flags.tutorial.claimed.includes(8) ? 1 : 0))

function pct(x: number): string {
  return x > 0 ? `+${(x * 100).toFixed(1)}%` : '—'
}

/** 可回收材料速览（单价 × 数量 = 回收总额） */
const sellable = computed(() =>
  Object.entries(store.state.materials)
    .filter(([, qty]) => qty > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([id, qty]) => ({ id, qty, name: itemDef(id).name, value: itemDef(id).value, total: itemDef(id).value * qty })),
)
</script>

<template>
  <div class="shop">
    <section class="card">
      <h3>行动队列扩容</h3>
      <p class="dim">当前队列位：{{ slots }} / {{ maxSlots }}{{ tutorialGrant ? '（含教程赠送 1 位）' : '' }}</p>
      <p class="dim">队列位让多个动作自动接力：当前动作完成后自动执行队首动作。</p>
      <button v-if="slots < maxSlots" class="btn primary" @click="cmd({ type: 'buyQueueSlot' })">
        购买队列位
      </button>
      <p v-else class="dim">队列已达上限（{{ maxSlots }}）。</p>
    </section>

    <section class="card">
      <h3>回收兑换</h3>
      <p class="dim">在右侧「资源 / 行囊」中点击「回收」即可换取金币；金币用于队列扩容。</p>
      <div v-if="sellable.length" class="sell-list">
        <div v-for="s in sellable" :key="s.id" class="sell-row">
          <span class="name">{{ s.name }}</span>
          <span class="dim">×{{ s.qty }} · 单价 {{ s.value }} · 共 {{ s.total }}💰</span>
        </div>
      </div>
      <p v-else class="dim">暂无可回收材料。</p>
    </section>

    <section class="card">
      <h3>属性速记</h3>
      <p class="dim">
        工具（镐/坩埚/锤）→ 对应技能速度（{{ pct(0.15) }} → {{ pct(1.05) }}）；剑 → 效率；战锤 → 全技能速度；头盔 →
        经验；胸甲 → 产量；腿甲 → 稀有掉落；靴甲 → 效率；<b>项链 → 强化成功率；戒指 → 效率</b>。
      </p>
    </section>
  </div>
</template>

<style scoped>
.shop {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 620px;
}
.card {
  background: var(--c-panel-2);
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
  padding: 14px 16px;
}
.card h3 {
  margin: 0 0 8px;
  font-size: 15px;
}
.dim {
  color: var(--c-text-dim);
  font-size: 13px;
  margin: 4px 0;
}
.sell-list {
  margin-top: 8px;
  max-height: 260px;
  overflow-y: auto;
}
.sell-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  padding: 3px 0;
  border-bottom: 1px dashed var(--c-border);
}
</style>
