<script setup lang="ts">
import { computed } from 'vue'
import { cmd, store } from '../../app/store'
import { CONTENT, itemDef } from '../../game/content'
import { goldShopNextPrice } from '../../game/commands'

const slots = computed(() => store.state.queueSlots)
const maxSlots = CONTENT.config.maxQueueSlots
const tutorialGrant = computed(() => (store.state.flags.tutorial.claimed.includes(8) ? 1 : 0))

function pct(x: number): string {
  return x > 0 ? `+${(x * 100).toFixed(1)}%` : '—'
}

/** v3.1 金币商店：当前价格 + 已购次数 */
const goldShop = computed(() =>
  CONTENT.goldShop.map((g) => {
    const bought = store.state.meta.goldShop?.[g.id] ?? 0
    const price = goldShopNextPrice(store.state, g.id) ?? g.basePrice
    return { ...g, bought, price, affordable: store.state.gold >= price }
  }),
)

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
      <h3>金币商店<span class="dim">（循环出口：金 → 助剂，价格随次数 ×1.02）</span></h3>
      <p class="dim">金币在中后期会饱和——这里的助剂是可无限购买的出口，价格逐次递增（防套利：买价恒高于回收价）。</p>
      <div class="sell-list">
        <div v-for="g in goldShop" :key="g.id" class="sell-row">
          <span class="name">{{ g.name }}<em class="dim"> 已购 {{ g.bought }}</em></span>
          <span class="spacer" />
          <button class="btn sm" :class="{ primary: g.affordable }" :disabled="!g.affordable" @click="cmd({ type: 'buyGoldShopItem', id: g.id })">
            {{ g.price }} 金
          </button>
        </div>
      </div>
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

    <section class="card">
      <h3>词缀与重铸</h3>
      <p class="dim">
        每件装备天生带 <b>1~4 条词缀</b>（档位越高条数越多），数值随机 → 同档装备也各有优劣；
        在右侧点击任意装备即可查看词缀与<b>完美度</b>，并可消耗金币 / 精华 / 重铸石 <b>重铸</b>（不满意可锁定个别词缀再重摇，锁定越多越贵）。
      </p>
      <p class="dim">
        重铸石来自 <b>T4 以上矿脉</b> 的稀有掉落与工匠小箱——本店不直售，请下矿自取。
      </p>
      <p class="dim">
        加成范围：<b>稀有掉落</b>（腿甲 / 幸运符文 / 幸运词缀）提高矿脉与小箱的稀有产出；
        <b>勘探词缀</b> 只提高矿脉的重铸石掉落（小箱不受其加成）。词缀池按部位不同（工具/武器/护甲/饰品各 5 条）。
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
.spacer {
  flex: 1;
}
.sell-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  padding: 3px 0;
  border-bottom: 1px dashed var(--c-border);
}
</style>
