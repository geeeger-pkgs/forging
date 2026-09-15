<script setup lang="ts">
// ============================================================
// 深渊回廊（v2.4）：战力明细 / 下一层门槛 / 体力 / 挑战与扫荡 / 商店 / 记录
// ============================================================
import { computed } from 'vue'
import { cmd, store } from '../../app/store'
import { abyssDef, abyssView } from '../../game/abyss'

const DEF = abyssDef()
const view = computed(() => abyssView(store.state, store.now))

const WEIGHT_LABEL: Record<string, string> = {
  speed: '速度',
  efficiency: '效率',
  quantity: '产量',
  rareFind: '稀有',
  wisdom: '经验',
  enhanceRate: '强化率',
}
const ORDER = ['speed', 'efficiency', 'quantity', 'rareFind', 'wisdom', 'enhanceRate'] as const

/** 贡献从高到低（面板明示权重与贡献，玩家可自行推算差额） */
const breakdown = computed(() =>
  ORDER.map((k) => ({
    key: k,
    label: WEIGHT_LABEL[k],
    weight: DEF.weights[k],
    value: view.value.score.values[k],
    contribution: view.value.score.contributions[k],
  })).sort((a, b) => b.contribution - a.contribution),
)

const canChallenge = computed(() => view.value.gap <= 0 && view.value.stamina >= 1)
const canSweep = computed(() => view.value.bestFloor >= 1 && view.value.stamina >= 1)

function fmtMs(ms: number): string {
  const s = Math.ceil(ms / 1000)
  const m = Math.floor(s / 60)
  return m > 0 ? `${m} 分 ${s % 60} 秒` : `${s} 秒`
}

/** 扫荡产出（与内核 repeatCrystal 同式） */
const bestSweepCrystal = computed(() => 1 + Math.floor(view.value.bestFloor / DEF.repeatCrystal.perFloor))
</script>

<template>
  <div class="abyss">
    <section class="card">
      <h3>
        深渊回廊
        <span class="dim">最高层 {{ view.bestFloor }} · 结晶 {{ view.crystals }} · 已通关主题「{{ view.nextTheme }}」</span>
      </h3>
      <p class="dim">
        即时判定的层数挑战：不占用动作流、不消耗材料，只用战力检验配装。战力为六项属性的加权和（公式见下）。
      </p>
      <div class="score">
        <div class="total">
          深渊战力 <b>{{ view.score.total.toFixed(2) }}</b>
          <span class="dim small">（下一层门槛 {{ view.nextRequirement.toFixed(2) }}）</span>
        </div>
        <div class="gap" :class="view.gap <= 0 ? 'good' : 'bad'">
          <template v-if="view.gap <= 0">✅ 已达到第 {{ view.nextFloor }} 层门槛</template>
          <template v-else>还差 {{ view.gap.toFixed(2) }} 战力</template>
        </div>
      </div>
      <div class="rows">
        <div v-for="b in breakdown" :key="b.key" class="row">
          <span class="rlabel">{{ b.label }}</span>
          <span class="dim small">×{{ b.weight }}</span>
          <span class="spacer" />
          <span class="rval">{{ b.value.toFixed(3) }}</span>
          <span class="rcon">= {{ b.contribution.toFixed(2) }}</span>
        </div>
      </div>
      <p class="dim small">
        口径：速度 = 采矿速度（工具/全速/符文/精通/深渊永久）；产量不含符文与精通、经验不含符文、强化率不含精通——与结算内核完全一致。
      </p>
    </section>

    <section class="card">
      <h3>
        体力
        <span class="dim">{{ view.stamina }} / {{ view.staminaMax }}<template v-if="view.msToNext > 0">（下一点 {{ fmtMs(view.msToNext) }}）</template></span>
      </h3>
      <div class="bar"><i :style="{ width: (view.stamina / view.staminaMax) * 100 + '%' }" /></div>
      <p class="dim small">每 {{ DEF.staminaRegenMinutes }} 分钟恢复 1 点；离线照常恢复，满体力期间的时间不累积（上限截断）。</p>
      <div class="actions">
        <button
          class="btn primary"
          :disabled="!canChallenge"
          :title="view.gap > 0 ? '战力不足：不满足门槛时无法发起（也不会消耗体力）' : view.stamina < 1 ? '体力不足' : ''"
          @click="cmd({ type: 'challengeAbyss' })"
        >
          挑战第 {{ view.nextFloor }} 层（1 体力）
        </button>
        <button
          class="btn"
          :disabled="!canSweep"
          :title="view.bestFloor < 1 ? '尚未通关任何层' : view.stamina < 1 ? '体力不足' : ''"
          @click="cmd({ type: 'sweepAbyss' })"
        >
          扫荡（+{{ bestSweepCrystal }} 结晶）
        </button>
      </div>
      <p v-if="view.gap > 0" class="bad small">⚠ 战力不足时挑战不会发起，也不会消耗体力——先去补配装。</p>
    </section>

    <section class="card">
      <h3>
        深渊商店
        <span class="dim">结晶 {{ view.crystals }} · 重铸券 {{ view.tickets }} 张 · 永久速度 {{ view.permanentSpeed }} 级</span>
      </h3>
      <div class="shop">
        <div v-for="s in view.shop" :key="s.def.id" class="item" :class="{ owned: s.price === null }">
          <div class="ihead">
            <b>{{ s.def.name }}</b>
            <span class="spacer" />
            <span class="dim small">{{ s.bought }} / {{ s.def.max }}</span>
          </div>
          <div class="dim small">{{ s.def.desc }}</div>
          <button
            class="btn sm"
            :class="{ primary: s.affordable }"
            :disabled="s.price === null || !s.affordable"
            @click="cmd({ type: 'buyAbyssItem', itemId: s.def.id })"
          >
            <template v-if="s.price === null">已购满</template>
            <template v-else>{{ s.price }} 结晶</template>
          </button>
        </div>
      </div>
      <p class="dim small">
        可重复购买项的价格逐次 ×1.3；结晶不可回收、不可换金（只在本店使用）。
      </p>
    </section>

    <section class="card">
      <h3>记录</h3>
      <p class="dim">
        最高层 <b>{{ view.bestFloor }}</b> ｜ 累计扫荡 {{ store.state.stats.totalAbyssSweeps }} 次 ｜ 累计购买 {{ store.state.stats.totalAbyssPurchases }} 次
        <template v-if="view.title"><br />称号：<b>深渊行者</b></template>
      </p>
      <p class="dim small">
        首通奖励 = 10 + 2×层；扫荡奖励 = 1 + ⌊最高层 / 20⌋。战力提升后回廊深度自然延伸（层数无上限）。
      </p>
    </section>
  </div>
</template>

<style scoped>
.abyss {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 720px;
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
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: baseline;
}
.dim {
  color: var(--c-text-dim);
  font-size: 13px;
  margin: 4px 0;
}
.small {
  font-size: 12px;
}
.good {
  color: var(--c-success);
}
.bad {
  color: var(--c-danger);
}
.spacer {
  flex: 1;
}
.score {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin: 6px 0;
}
.total b {
  font-size: 20px;
  color: var(--c-accent);
}
.rows {
  margin: 6px 0;
}
.row {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 13px;
  padding: 2px 0;
}
.rlabel {
  width: 44px;
  color: var(--c-text-dim);
}
.rval {
  width: 60px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.rcon {
  width: 64px;
  text-align: right;
  color: var(--c-accent-2);
  font-variant-numeric: tabular-nums;
}
.bar {
  height: 6px;
  background: var(--c-bg-deep);
  border-radius: 3px;
  overflow: hidden;
  margin: 6px 0;
}
.bar i {
  display: block;
  height: 100%;
  background: var(--c-accent-2);
}
.actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
.shop {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 8px;
}
.item {
  border: 1px solid var(--c-border);
  border-radius: 6px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.item.owned {
  opacity: 0.75;
}
.ihead {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 13px;
}
@media (max-width: 900px) {
  .abyss {
    max-width: none;
  }
  .shop {
    grid-template-columns: 1fr;
  }
  .rows .row:nth-child(n + 3) {
    display: none;
  }
}
</style>
