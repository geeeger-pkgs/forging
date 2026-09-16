<script setup lang="ts">
// ============================================================
// 图鉴与赛季（v2.3）：上半部 6 分区收集度 + 里程碑；下半部赛季（声望/任务三档）
// ============================================================
import { computed, onMounted, ref } from 'vue'
import { store } from '../../app/store'
import { codexGate, codexIds, codexMilestonesClaimed, codexProgress, milestoneReached } from '../../game/codex'
import { CONTENT, itemDef } from '../../game/content'
import { fmtDur } from '../format'
import { SEASON_TASKS_PER_DAY, msToSeasonEnd, seasonUnlocked, seasonView, renownForLevel } from '../../game/season'
import type { CodexCategory } from '../../game/codex'

/** v3.2 C2：默认展开"进度最低"的分区（玩家最该补的那一栏），而不是全部收起 */
const open = ref<string | null>(null)
onMounted(() => {
  const cats = codexProgress(store.state).categories
  if (cats.length > 0) {
    const worst = [...cats].sort((x, y) => x.found / Math.max(1, x.total) - y.found / Math.max(1, y.total))[0]
    open.value = worst.id
  }
})

const progress = computed(() => codexProgress(store.state))
const claimed = computed(() => codexMilestonesClaimed(store.state))
/**
 * v3.0 评审 B-M1：里程碑是**分区门槛**（每个分区各自达标）。
 * 面板必须按同一判据显示状态并给出"还差哪个区"——
 * 此前用线性 pct 判断，会出现"面板说可达成、实际不达标"的误报。
 */
const gate = computed(() => codexGate(store.state))
function msReady(m: { req: Record<string, number> }): boolean {
  return milestoneReached(store.state, m)
}

/** 分区未解锁条目（展开时显示；伙伴/遗物/配方/词缀/矿场都给出可读名称） */
function missingOf(cat: CodexCategory): string[] {
  const found = codexIds(store.state, cat.id)
  if (cat.id === 'items') {
    return Object.keys(CONTENT.items)
      .filter((id) => itemDef(id).category !== 'relic' && !found.has(id))
      .map((id) => itemDef(id).name)
  }
  if (cat.id === 'recipes') {
    return CONTENT.recipes.filter((r) => !found.has(r.id)).map((r) => r.name)
  }
  if (cat.id === 'affixes') {
    return CONTENT.affixes.affixes.filter((a) => !found.has(a.id)).map((a) => a.name)
  }
  if (cat.id === 'companions') {
    return CONTENT.companions.companions.filter((c) => !found.has(c.id)).map((c) => c.name)
  }
  if (cat.id === 'relics') {
    return Object.keys(CONTENT.items)
      .filter((id) => itemDef(id).category === 'relic' && !found.has(id))
      .map((id) => itemDef(id).name)
  }
  return CONTENT.ores.filter((o) => !found.has(o.id)).map((o) => o.name)
}

/** 获取提示（v2.3 测评 UI-2：未收集项不能只给名字） */
function hintOf(cat: CodexCategory): string {
  switch (cat.id) {
    case 'items':
      return '提示：矿石来自采矿、锭来自熔炼、装备来自锻造（档位越高越难）'
    case 'recipes':
      return '提示：制作一次即登记（低档配方容易补，高档需要对应技能等级）'
    case 'affixes':
      return '提示：造装随机获得；重铸可反复刷新（按部位池抽取）'
    case 'companions':
      return '提示：消耗远征徽记招募（近郊路线保底产出）'
    case 'relics':
      return '提示：废弃矿道/古代遗迹/深渊前哨 的稀有掉落，或在深渊商店直接兑换'
    default:
      return '提示：在对应矿脉开采一次即登记'
  }
}

function pctText(x: number): string {
  return `${(x * 100).toFixed(1)}%`
}

const unlocked = computed(() => seasonUnlocked(store.state))
const season = computed(() => seasonView(store.state, store.now))
const msLeft = computed(() => msToSeasonEnd(store.now))

/** v3.2 B4 修正：统一 fmtDur（此前是 'X 天 Y 小时' 写法） */
function fmtLeft(ms: number): string {
  return fmtDur(ms)
}

function tierLabel(tier: number): string {
  return tier < 0 ? '未达成' : ['铜', '银', '金'][tier]
}

const renownTarget = computed(() => renownForLevel(season.value.level + 1))
</script>

<template>
  <div class="codex">
    <section class="card">
      <h3>
        图鉴
        <span class="dim">
          已收集 {{ progress.found }} / {{ progress.total }}（{{ pctText(progress.pct) }}）
        </span>
      </h3>
      <p class="dim">
        图鉴记录「曾经拥有/做过」的内容：物品与装备在产出瞬间登记（哪怕随后被消耗或回收），
        配方在首次制作成功时登记，词缀在造装或重铸出现时登记。点击分区可查看未收集项。
      </p>
      <div class="cats">
        <div v-for="c in progress.categories" :key="c.id" class="cat">
          <div class="chead" @click="open = open === c.id ? null : c.id">
            <b>{{ c.name }}</b>
            <span class="spacer" />
            <span class="dim small">{{ c.found }} / {{ c.total }} · {{ pctText(c.total ? c.found / c.total : 0) }}<template v-if="c.found < c.total">（还差 {{ c.total - c.found }} 条）</template></span>
          </div>
          <div class="bar"><i :style="{ width: (c.total ? (c.found / c.total) * 100 : 0) + '%' }" /></div>
          <div v-if="open === c.id" class="missing small">
            <template v-if="missingOf(c).length === 0"><span class="good">已收集完整 ✅</span></template>
            <template v-else>
              <div class="dim">{{ hintOf(c) }}</div>
              <span class="dim">未收集（{{ missingOf(c).length }}）：</span>
              <span class="dim">{{ missingOf(c).slice(0, 40).join('、') }}{{ missingOf(c).length > 40 ? ' …' : '' }}</span>
            </template>
          </div>
        </div>
      </div>
      <div class="milestones">
        <div
          v-for="m in CONTENT.season.codexMilestones"
          :key="m.pct"
          class="ms"
          :class="{ done: claimed.has(String(m.pct)), ready: !claimed.has(String(m.pct)) && msReady(m) }"
        >
          <b>「{{ m.title }}」</b>
          <span class="dim small">
            {{ m.gold }} 金 + 精华 ×{{ m.essence }}<template v-if="m.tokens"> + 徽记 ×{{ m.tokens }}</template>
          </span>
          <span class="spacer" />
          <span class="small" :class="claimed.has(String(m.pct)) || msReady(m) ? 'good' : 'dim'">
            {{ claimed.has(String(m.pct)) ? '已发放' : msReady(m) ? '可领取' : '未达成' }}
          </span>
        </div>
        <p v-if="gate.next" class="dim small">
          下一档「{{ gate.next.title }}」还差：{{
            gate.shortfall.map((x) => `${x.name} ${x.found}/${x.need}`).join(' ｜ ')
          }}<br />门槛按分区计算：每个分区都要各自达标（避免只堆单一分区）。
        </p>
      </div>
    </section>

    <section class="card">
      <h3>
        赛季
        <span class="dim">
          <template v-if="unlocked">第 {{ season.index }} 赛季 · 剩余 {{ fmtLeft(msLeft) }}</template>
          <template v-else>总等级 {{ CONTENT.season.unlockTotalLevel }} 解锁后开启</template>
        </span>
      </h3>
      <template v-if="unlocked">
        <div class="level">
          <b>声望 {{ season.renown }} / {{ season.maxRenown }}</b>
          <span class="dim small">等级 {{ season.level }} / {{ season.maxLevel }}<template v-if="season.level < season.maxLevel">（下一级需 {{ renownTarget }}）</template><template v-else>（已满级）</template></span>
        </div>
        <div class="bar"><i :style="{ width: season.pct * 100 + '%' }" /></div>
        <p class="dim small">
          每 {{ CONTENT.season.days }} 天轮换：{{ SEASON_TASKS_PER_DAY }} 条任务从 {{ CONTENT.season.templates.length }} 条模板中按赛季确定性抽取；每档只计最高达成（不叠加）；
          达到等级即时发放奖励。挖掘/熔炼/锻造/金币/远征离线照常推进，标记「需在线」的任务离线不增长。
        </p>
        <!-- v3.3 B1：目标已按账号分档缩放，如实标注（否则玩家会以为表里数字变了） -->
        <p class="dim small">
          目标已按你的账号进度调整：{{ season.maturity === 'junior' ? '新晋' : '老手' }}档 ×{{ season.scale.toFixed(2) }}
          （同一模板对不同阶段的账号给不同数量的目标，精力投入对齐 {{ CONTENT.season.days }} 天窗口；<b>本季目标已冻结至轮换，下赛季按届时进度重算</b>）
        </p>
        <div class="tasks">
          <div v-for="t in season.tasks" :key="t.defId" class="task">
            <div class="thead">
              <b>{{ t.title }}</b>
              <span class="dim small">{{ t.desc }}</span>
              <span v-if="t.onlineOnly" class="badge">需在线</span>
              <span class="spacer" />
              <span class="small" :class="t.tier >= 0 ? 'good' : 'dim'">{{ tierLabel(t.tier) }} · {{ t.renown }} 声望</span>
            </div>
            <div class="tiers small">
              <span v-for="(target, i) in t.targets" :key="i" :class="{ reached: t.tier >= i }">
                {{ ['铜', '银', '金'][i] }} {{ target.toLocaleString() }}{{ t.unit }}
              </span>
            </div>
            <div class="bar"><i :style="{ width: Math.min(1, t.progress / t.targets[2]) * 100 + '%' }" /></div>
            <div class="dim small">当前进度 {{ Math.round(t.progress).toLocaleString() }}{{ t.unit }}</div>
          </div>
        </div>
      </template>
      <p v-else class="dim">
        赛季系统在中后期解锁（总等级 {{ CONTENT.season.unlockTotalLevel }}）：每 {{ CONTENT.season.days }} 天轮换 {{ SEASON_TASKS_PER_DAY }} 条长线任务，
        完成后获得声望与等级奖励（金币/精华/远征徽记）。图鉴收集度独立发奖，不受此门槛影响。
      </p>
    </section>
  </div>
</template>

<style scoped>
.codex {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 720px;
}
/* v3.7：卡片外壳已上提为全局 .card（theme.css 统一质感）；此处仅保留本面板的标题差异 */
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
.cats {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 8px;
  margin: 8px 0;
}
.cat {
  border: 1px solid var(--c-border);
  border-radius: 6px;
  padding: 8px 10px;
}
.chead {
  display: flex;
  align-items: baseline;
  gap: 6px;
  cursor: pointer;
  font-size: 13px;
}
/* v3.2 评审 M3 残余：分区标题是展开/收起入口，窄屏给足触控高度 */
@media (max-width: 900px) {
  .chead {
    min-height: 40px;
    align-items: center;
  }
}
.bar {
  height: 5px;
  background: var(--c-bg-deep);
  border-radius: 3px;
  overflow: hidden;
  margin: 5px 0;
}
.bar i {
  display: block;
  height: 100%;
  background: var(--c-accent-2);
}
.missing {
  margin-top: 6px;
  line-height: 1.6;
}
.milestones {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.ms {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 13px;
  border-top: 1px dashed var(--c-border);
  padding-top: 4px;
}
.ms.done b {
  color: var(--c-success);
}
.ms.ready {
  border-color: var(--c-accent);
}
.ms.ready b {
  color: var(--c-accent);
}
.level {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 14px;
}
.tasks {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 8px;
  margin-top: 8px;
}
.task {
  border: 1px solid var(--c-border);
  border-radius: 6px;
  padding: 8px 10px;
}
.thead {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 13px;
}
.tiers {
  display: flex;
  gap: 10px;
  margin: 4px 0;
  color: var(--c-text-dim);
}
.tiers .reached {
  color: var(--c-success);
}
.badge {
  font-size: 10px;
  border: 1px solid var(--c-danger);
  color: var(--c-danger);
  border-radius: 4px;
  padding: 0 4px;
}
@media (max-width: 900px) {
  .codex {
    max-width: none;
  }
  .cats,
  .tasks {
    grid-template-columns: 1fr;
  }
  /* v3.6.2（评审 v3.6 M/m1）：任务头在 375px 会挤压折行（"未达成 · 0 声望"断成两行）→
     允许换行、去掉推开用的 spacer、让标题可收缩 */
  .thead {
    flex-wrap: wrap;
    row-gap: 2px;
  }
  .thead .spacer {
    display: none;
  }
  .thead b {
    min-width: 0;
  }
}
</style>
