<script setup lang="ts">
// ============================================================
// 深渊回廊（v2.4）：战力明细 / 下一层门槛 / 体力 / 挑战与扫荡 / 商店 / 记录
// ============================================================
import { computed, ref } from 'vue'
import { cmd, store } from '../../app/store'
import { abyssDef, abyssModifier, abyssView } from '../../game/abyss'
import { fmtDur } from '../format'

const DEF = abyssDef()
const view = computed(() => abyssView(store.state, store.now))

/** v3.0：连打层数（1..challengeMaxFloors）与批量扫荡次数 */
const chainTarget = ref(1)
const sweepCount = ref(Math.min(3, DEF.sweepMaxCount))
/** 本层词条（nextFloor 的词条，决定门槛与有效权重） */
const mod = computed(() => abyssModifier(view.value.nextFloor))
/** 下一层词条（预告"墙/喘息"节奏） */
const modNext = computed(() => abyssModifier(view.value.nextFloor + 1))

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
    // v3.0：显示**有效权重**（含本层词条修正），否则玩家按面板推算的差额会与判定不符
    weight: view.value.score.weights[k],
    baseWeight: DEF.weights[k],
    value: view.value.score.values[k],
    contribution: view.value.score.contributions[k],
  })).sort((a, b) => b.contribution - a.contribution),
)

/** v3.1：按"距离下一层还差多少"给出补强建议（取当前贡献最低的三项） */
const topGapLabels = computed(() => {
  const order = [...breakdown.value].sort((x, y) => x.contribution - y.contribution)
  return order.slice(0, 3).map((b) => b.label).join(' / ')
})

const canChallenge = computed(() => view.value.gap <= 0 && view.value.stamina >= chainCost.value)
/** v3.0 测评 Minor：扫荡次数选项去重 + 文案与实际执行次数一致 */
const sweepChoices = computed(() => {
  const max = sweepMax.value
  return [...new Set([1, 3, max].filter((n) => n >= 1 && n <= max))].sort((a, b) => a - b)
})
const sweepActual = computed(() => Math.min(sweepCount.value, sweepMax.value))
/** 连打可选项：受内容表上限与"下一层是否达标"限制（逐层判定，内核会在首个失败层停止） */
/** v3.1：连打体力代价（×1/×2 = 1 点、×3 = 2 点，取自内容表） */
const chainCost = computed(() => DEF.chainCost?.[chainTarget.value - 1] ?? chainTarget.value)
const chainOptions = computed(() => {
  const max = Math.min(DEF.challengeMaxFloors, 3)
  return Array.from({ length: max }, (_, i) => i + 1)
})
const canSweep = computed(() => view.value.bestFloor >= 1 && view.value.stamina >= 1)

/** 权重显示：最多两位小数、去尾零（原始浮点会渲染出 ×1.0499999999999998） */
function fmtW(x: number): string {
  return (Math.round(x * 100) / 100).toString()
}

/** v3.2 B4：统一用 fmtDur（"4m 33s" 这类写法） */
function fmtMs(ms: number): string {
  return fmtDur(ms)
}

/** 扫荡产出（与内核 repeatCrystal 同式；扫荡不吃层词条倍率） */
const bestSweepCrystal = computed(() => 1 + Math.floor(view.value.bestFloor / DEF.repeatCrystal.perFloor))
const sweepTotal = computed(() => bestSweepCrystal.value * sweepActual.value)
const sweepMax = computed(() => Math.min(DEF.sweepMaxCount, Math.max(1, view.value.stamina)))

function sweep(n: number): void {
  cmd({ type: 'sweepAbyss', count: n })
}
</script>

<template>
  <div class="abyss">
    <section class="card">
      <h3>
        战力检验
        <span class="dim">最高层 {{ view.bestFloor }} · 结晶 {{ view.crystals }} · 下一层主题「{{ view.nextTheme }}」</span>
      </h3>
      <p class="dim">
        即时判定的层数挑战：不占用动作流、不消耗材料，只用战力检验配装。战力为六项属性的加权和（公式见下）。
      </p>
      <div class="modbar" :class="mod.id">
        <b>本层词条：{{ mod.name }}</b>
        <span class="dim small">{{ mod.desc }}</span>
        <span class="spacer" />
        <span class="dim small">下一层：{{ modNext.name }}</span>
      </div>
      <div class="score">
        <div class="total">
          深渊战力 <b>{{ view.score.total.toFixed(2) }}</b>
          <span class="dim small">（第 {{ view.nextFloor }} 层门槛 {{ view.nextRequirement.toFixed(2) }}，含{{ mod.name }}）</span>
        </div>
        <div class="gap" :class="view.gap <= 0 ? 'good' : 'bad'">
          <template v-if="view.gap <= 0">✅ 已达到第 {{ view.nextFloor }} 层门槛</template>
          <template v-else>还差 {{ view.gap.toFixed(2) }} 战力</template>
        </div>
      </div>
      <div class="rows">
        <div v-for="b in breakdown" :key="b.key" class="row">
          <span class="rlabel">{{ b.label }}</span>
          <span class="dim small">
            ×{{ fmtW(b.weight) }}
            <em v-if="b.weight !== b.baseWeight" class="boost">（词条 ×{{ (b.weight / b.baseWeight).toFixed(1) }}）</em>
          </span>
          <span class="spacer" />
          <span class="rval">{{ b.value.toFixed(3) }}</span>
          <span class="rcon">= {{ b.contribution.toFixed(2) }}</span>
        </div>
      </div>
      <p class="dim small">
        口径：速度 = 采矿速度（工具/全速/符文/精通/深渊永久）；产量不含符文与精通、经验不含符文、强化率不含精通——与结算内核完全一致。
        <span class="fold-note">（窄屏下中间几项会折叠，合计以上方总战力为准）</span>
      </p>
    </section>

    <section class="card">
      <h3>
        体力
        <span class="dim">{{ view.stamina }} / {{ view.staminaMax }}<template v-if="view.msToNext > 0">（下一点 {{ fmtMs(view.msToNext) }}）</template></span>
      </h3>
      <div class="bar"><i :style="{ width: (view.stamina / view.staminaMax) * 100 + '%' }" /></div>
      <p class="dim small">
        每 {{ DEF.staminaRegenMinutes }} 分钟恢复 1 点，在线上限 {{ DEF.staminaMax }}（满后不再累积）；
        <b>离线回体上限 {{ DEF.staminaMax + DEF.offlineCapExtra }}</b>（按真实时长折算，仅离线期间生效）——纯放置玩家每日可打满 24 次。
      </p>
      <div class="actions">
        <div class="chain">
          <span class="dim small">连打</span>
          <button
            v-for="n in chainOptions"
            :key="n"
            class="btn sm"
            :class="{ primary: chainTarget === n }"
            @click="chainTarget = n"
          >
            ×{{ n }}
          </button>
        </div>
        <button
          class="btn primary"
          :disabled="!canChallenge"
          :title="view.gap > 0 ? '战力不足：不满足门槛时无法发起（也不会消耗体力）' : view.stamina < 1 ? '体力不足' : ''"
          @click="cmd({ type: 'challengeAbyss', floors: chainTarget })"
        >
          挑战第 {{ view.nextFloor }} 层起（连打 {{ chainTarget }} 层 · {{ chainCost }} 体力）
        </button>
      </div>
      <div class="actions">
        <div class="chain">
          <span class="dim small">扫荡次数</span>
          <button
            v-for="n in sweepChoices"
            :key="n"
            class="btn sm"
            :class="{ primary: sweepCount === n && n !== sweepMax }"
            @click="sweepCount = n"
          >
            {{ n === sweepMax ? `用尽体力（${sweepMax}）` : `×${n}` }}
          </button>
        </div>
        <button
          class="btn"
          :disabled="!canSweep"
          :title="view.bestFloor < 1 ? '尚未通关任何层' : view.stamina < 1 ? '体力不足' : ''"
          @click="sweep(sweepCount)"
        >
          <template v-if="view.bestFloor >= 1">扫荡 ×{{ sweepActual }}（+{{ sweepTotal }} 结晶）</template>
          <template v-else>扫荡（需先通关）</template>
        </button>
      </div>
      <p class="dim small">
        连打 = 从下一层起逐层判定：通过就继续，遇到第一个不达标的层停下（首通奖励逐层照发；战力不足不消耗体力）。
        层词条每 5 层一循环：{{ mod.name }}{{ mod.id === 'rich' ? '（墙：门槛 ×1.06、首通结晶 ×1.5）' : mod.id === 'rift' ? '（喘息：门槛 ×0.94、首通结晶 ×0.8）' : '（该层权重倾斜，重配装有利）' }}。
      </p>
      <p v-if="view.gap > 0" class="bad small">
        ⚠ 战力不足时挑战不会发起，也不会消耗体力——先去补配装。
        <template v-if="view.bestFloor === 0">
          <br />入门提示：第 1 层只需 {{ view.nextRequirement.toFixed(2) }}（入门三层之一），
          一件 T3+ 强化装备 + 少量速度/稀有词缀即可起步；再往上才需要整套 build。
        </template>
        <template v-else>
          <br />补强方向：按本层有效权重，当前贡献最低的三项是 {{ topGapLabels }}（先补它们性价比最高）。
        </template>
      </p>
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
        首通奖励 = (10 + 2×层) × 本层词条结晶倍率（裂隙 ×0.8 / 富矿 ×1.5），向下取整；
        扫荡奖励 = 1 + ⌊最高层 / 20⌋（不含词条倍率，避免停在裂隙层反而吃亏）。
        层数不封顶：主题每 25 层循环、词条每 5 层轮换，深度由配装决定。
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
/* v3.2 A3：折叠说明只在窄屏显示 */
.fold-note {
  display: none;
}
.modbar {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 6px 10px;
  border: 1px solid var(--c-border);
  border-left: 3px solid var(--c-accent-2);
  border-radius: 6px;
  background: var(--c-panel-2);
  margin: 6px 0 8px;
  font-size: 13px;
}
.modbar.rich {
  border-left-color: var(--c-accent);
}
.modbar.rift {
  border-left-color: #7f9bff;
}
.boost {
  color: var(--c-accent);
  font-style: normal;
}
.chain {
  display: flex;
  align-items: center;
  gap: 6px;
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
  /* v3.2 A3：折叠时给出说明（否则玩家看到的行之和 ≠ 总战力） */
  .fold-note {
    display: inline;
  }
  /* v3.0 C2：折叠"中间项"，保留**贡献最高 2 项 + 最弱 1 项**（最弱项才是"该补哪"的答案） */
  .rows .row:nth-child(n + 3):not(:last-child) {
    display: none;
  }
}
</style>
