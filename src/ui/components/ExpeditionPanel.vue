<script setup lang="ts">
// ============================================================
// 远征与伙伴（v2.2）：伙伴 / 路线 / 进行中 三段式
// ============================================================
import { computed, ref } from 'vue'
import { cmd, store } from '../../app/store'
import { CONTENT, ROUTE_BY_ID, TRAIT_BY_ID, itemDef } from '../../game/content'
import {
  HOUR_MS,
  bannerUpgradeCost,
  bannerPowerMultiplier,
  companionPower,
  ownedCompanions,
  routeUnlockReason,
  successRate,
  supplyCost,
  teamPower,
  teamSize,
} from '../../game/expeditions'
import { levelInfo } from '../../game/level'
import { materialCount } from '../../game/state'
import type { ExpeditionRouteDef } from '../../game/types'

const RARITY_CN: Record<string, string> = { common: '平凡', elite: '精锐', legend: '传奇' }
const RARITY_COLOR: Record<string, string> = { common: '#9aa4b0', elite: '#7f9bff', legend: '#f5a623' }

const state = computed(() => store.state)
const banner = computed(() => store.state.meta.expeditions.banner)
const cap = CONTENT.companions.startLevelCap

/** 队伍上限与当前选择（会话内，派遣时提交） */
const maxTeam = computed(() => teamSize(store.state))
const picked = ref<string[]>([])

const companions = computed(() =>
  ownedCompanions(store.state).map(({ def, st }) => ({
    id: def.id,
    name: def.name,
    rarity: def.rarity,
    rarityCn: RARITY_CN[def.rarity],
    color: RARITY_COLOR[def.rarity],
    level: st.level,
    xp: st.xp,
    xpNeed: st.level >= cap ? 0 : Math.round(CONTENT.expeditions.levelCurve.base * Math.pow(st.level, CONTENT.expeditions.levelCurve.exponent)),
    trait: TRAIT_BY_ID.get(st.trait),
    power: companionPower(def, st.level),
    desc: def.desc,
  })),
)

const locked = computed(() => CONTENT.companions.companions.filter((c) => !store.state.companions[c.id]))

const teamPowerNow = computed(() => teamPower(store.state, picked.value.length ? picked.value : undefined))
const bannerMult = computed(() => bannerPowerMultiplier(banner.value))

/** 每条路线的展示数据 */
interface RouteView {
  def: ExpeditionRouteDef
  lockReason: string | null
  running: boolean
  pickable: boolean
  power: number
  rate: number
}
const routes = computed<RouteView[]>(() =>
  CONTENT.expeditions.routes.map((def) => {
    const lockReason = routeUnlockReason(store.state, def)
    const running = store.state.meta.expeditions.runs.some((r) => r.routeId === def.id)
    const team = picked.value.length ? picked.value : Object.keys(store.state.companions)
    return {
      def,
      lockReason,
      running,
      pickable: picked.value.length > 0,
      power: teamPower(store.state, team),
      rate: successRate(store.state, def, team),
    }
  }),
)

const hours = CONTENT.expeditions.hours
const pickHours = ref(8)

const runs = computed(() =>
  store.state.meta.expeditions.runs.map((r) => {
    const def = ROUTE_BY_ID.get(r.routeId)
    const total = r.hours * HOUR_MS
    const left = Math.max(0, r.endsAt - store.now)
    return {
      id: r.id,
      name: def?.name ?? r.routeId,
      hours: r.hours,
      done: r.done,
      left,
      pct: total > 0 ? Math.min(1, 1 - left / total) : 1,
      outcome: r.outcome,
      team: r.team.map((id) => CONTENT.companions.companions.find((c) => c.id === id)?.name ?? id),
    }
  }),
)

function togglePick(id: string): void {
  const at = picked.value.indexOf(id)
  if (at >= 0) picked.value.splice(at, 1)
  else if (picked.value.length < maxTeam.value) picked.value.push(id)
}

/** 未编队时按「全员出战」提交（与面板文案一致；否则会因空队伍被内核拒绝） */
function dispatch(routeId: string): void {
  const team = picked.value.length ? [...picked.value] : Object.keys(store.state.companions)
  cmd({ type: 'dispatchExpedition', routeId, hours: pickHours.value, team })
}

function fmtLeft(ms: number): string {
  const s = Math.ceil(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h} 时 ${m} 分` : `${m} 分 ${s % 60} 秒`
}

const bannerCost = computed(() => bannerUpgradeCost(store.state))
const tokens = computed(() => materialCount(store.state, 'expedition_token'))
const relics = computed(() =>
  Object.keys(store.state.materials)
    .filter((id) => itemDef(id).category === 'relic' && (store.state.materials[id] ?? 0) > 0)
    .map((id) => ({ id, name: itemDef(id).name, qty: store.state.materials[id] })),
)
void state
void levelInfo
</script>

<template>
  <div class="exp">
    <section class="card">
      <h3>
        伙伴（{{ companions.length }} / {{ CONTENT.companions.companions.length }}）
        <span class="dim">队伍上限 {{ maxTeam }} 人 · 战力 ×{{ bannerMult.toFixed(2) }}（旗帜 {{ banner }}/{{ CONTENT.expeditions.banner.maxLevel }}）</span>
      </h3>
      <p class="dim">
        点选伙伴编队（可选 {{ maxTeam }} 人，未选则全员出战）；战力不足不会阻止派遣，只降低成功率与产出。
        当前编队战力 <b>{{ Math.round(teamPowerNow) }}</b>。
      </p>
      <div class="comps">
        <div
          v-for="c in companions"
          :key="c.id"
          class="comp"
          :class="{ picked: picked.includes(c.id) }"
          :style="{ borderColor: picked.includes(c.id) ? c.color : undefined }"
        >
          <div class="chead">
            <span class="cname" :style="{ color: c.color }">{{ c.name }}</span>
            <span class="crarity">{{ c.rarityCn }}</span>
            <span class="spacer" />
            <button class="btn sm" :class="{ primary: picked.includes(c.id) }" @click="togglePick(c.id)">
              {{ picked.includes(c.id) ? '已编入' : '编入' }}
            </button>
          </div>
          <div class="dim small">Lv{{ c.level }} / {{ cap }} · 战力 {{ Math.round(c.power) }}</div>
          <div class="xpbar"><i :style="{ width: (c.xpNeed > 0 ? Math.min(1, c.xp / c.xpNeed) : 1) * 100 + '%' }" /></div>
          <div class="small">
            特质：<b>{{ c.trait?.name ?? '—' }}</b>
            <span class="dim">（{{ c.trait?.desc ?? '' }}）</span>
            <button class="btn sm" @click="cmd({ type: 'rerollTrait', companionId: c.id })">
              重掷（徽记×{{ CONTENT.expeditions.traitReroll.tokens }}）
            </button>
          </div>
          <div class="dim small">{{ c.desc }}</div>
        </div>
        <div v-if="companions.length === 0" class="dim">还没有伙伴——招募一位开始远征。</div>
      </div>

      <div class="recruit">
        <button class="btn primary" @click="cmd({ type: 'recruitCompanion' })">
          招募伙伴（徽记 ×{{ CONTENT.expeditions.recruit.tokens }} + {{ CONTENT.expeditions.recruit.gold }} 金）
        </button>
        <span class="dim small">
          持有徽记 {{ tokens }}；已有全部伙伴时，重复招募转为 +{{ CONTENT.expeditions.recruit.duplicateXp }} 经验
        </span>
        <span v-if="locked.length" class="dim small">待招募：{{ locked.map((c) => c.name).join('、') }}</span>
      </div>
    </section>

    <section class="card">
      <h3>远征路线 <span class="dim">时长档：<button v-for="h in hours" :key="h" class="btn sm" :class="{ primary: pickHours === h }" @click="pickHours = h">{{ h }}h</button></span></h3>
      <div class="routes">
        <div v-for="r in routes" :key="r.def.id" class="route" :class="{ disabled: !!r.lockReason || r.running }">
          <div class="rhead">
            <b>{{ r.def.name }}</b>
            <span class="spacer" />
            <span class="dim small">需求战力 {{ r.def.reqPower }}</span>
          </div>
          <div class="dim small">
            产出 ≈ {{ Math.round(r.def.anchorGoldPerHour * r.def.ratio * pickHours) }} 金/次（含材料）·
            补给 {{ supplyCost(store.state, r.def, pickHours, picked.length ? picked : Object.keys(store.state.companions)).qty }}
            {{ itemDef(r.def.supply.itemId).name }} ·
            徽记 ≈ {{ (r.def.tokenPer8h / 8 * pickHours).toFixed(2) }}
            <template v-if="r.def.relic">· {{ itemDef(r.def.relic).name }}</template>
          </div>
          <div class="dim small">
            成功率 <b :class="{ good: r.rate >= 1 }">{{ (r.rate * 100).toFixed(0) }}%</b>（编队战力 {{ Math.round(r.power) }}）
            · 失败仍有 {{ (CONTENT.expeditions.failYieldShare * 100).toFixed(0) }}% 保底
          </div>
          <p v-if="r.lockReason" class="bad small">🔒 {{ r.lockReason }}</p>
          <p v-else-if="r.running" class="dim small">已有远征在进行</p>
          <button v-else class="btn primary sm" @click="dispatch(r.def.id)">派遣 {{ pickHours }}h</button>
        </div>
      </div>
    </section>

    <section class="card">
      <h3>进行中 / 待领取</h3>
      <div v-if="runs.length === 0" class="dim">暂无进行中的远征。</div>
      <div v-for="r in runs" :key="r.id" class="run">
        <div class="rhead">
          <b>{{ r.name }}</b>
          <span class="dim small">{{ r.hours }}h · {{ r.team.join('、') }}</span>
          <span class="spacer" />
          <button v-if="r.done" class="btn primary sm" @click="cmd({ type: 'claimExpedition', runId: r.id })">领取</button>
          <span v-else class="dim small">{{ fmtLeft(r.left) }}</span>
        </div>
        <div class="xpbar"><i :style="{ width: r.pct * 100 + '%' }" /></div>
        <div v-if="r.done && r.outcome" class="dim small">
          结果：{{ r.outcome.success ? '成功' : '保底（成功率未达成）' }} ·
          {{ Math.round(r.outcome.gold) }} 金 ·
          <template v-for="m in r.outcome.materials" :key="m.itemId">{{ itemDef(m.itemId).name }} ×{{ Math.floor(m.qty) }} ·</template>
          徽记 ≈{{ r.outcome.tokens.toFixed(2) }}
        </div>
      </div>
    </section>

    <section class="card">
      <h3>远征队旗帜</h3>
      <p class="dim">
        等级 {{ banner }} / {{ CONTENT.expeditions.banner.maxLevel }}：每级 <b>+8% 队伍战力</b> 与 <b>+1 队伍位</b>。
      </p>
      <button v-if="bannerCost" class="btn primary" @click="cmd({ type: 'upgradeBanner' })">
        升级旗帜（徽记 ×{{ bannerCost.tokens }} + {{ bannerCost.gold }} 金）
      </button>
      <p v-else class="dim">旗帜已满级。</p>
      <p v-if="relics.length" class="dim small">
        遗物收藏：<template v-for="r in relics" :key="r.id">{{ r.name }} ×{{ r.qty }}　</template>
      </p>
      <p class="dim small">遗物无回收价值（收藏与后续版本用途），远征是唯一来源。</p>
    </section>
  </div>
</template>

<style scoped>
.exp {
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
.comps {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 8px;
  margin: 8px 0;
}
.comp {
  border: 1px solid var(--c-border);
  border-radius: 6px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.comp.picked {
  background: rgba(79, 124, 255, 0.08);
}
.chead {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.cname {
  font-weight: 600;
}
.crarity {
  font-size: 11px;
  color: var(--c-text-dim);
}
.xpbar {
  height: 4px;
  background: var(--c-bg-deep);
  border-radius: 2px;
  overflow: hidden;
}
.xpbar i {
  display: block;
  height: 100%;
  background: var(--c-accent-2);
}
.recruit {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
}
.routes {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 8px;
}
.route {
  border: 1px solid var(--c-border);
  border-radius: 6px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.route.disabled {
  opacity: 0.75;
}
.rhead {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.run {
  border-top: 1px dashed var(--c-border);
  padding: 8px 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
@media (max-width: 900px) {
  .exp {
    max-width: none;
  }
  .comps,
  .routes {
    grid-template-columns: 1fr;
  }
}
</style>
