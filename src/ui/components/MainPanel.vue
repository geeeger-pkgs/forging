<script setup lang="ts">
import { computed } from 'vue'
import { pickAction, store } from '../../app/store'
import { CONTENT, itemDef, skillName } from '../../game/content'
import { levelInfo } from '../../game/level'
import { durationOf } from '../../game/rules'
import { fmtDur } from '../format'
import type { RecipeDef } from '../../game/types'
import { FORGE_CATEGORIES, type ActionCard } from '../types'
import AchievementsPanel from './AchievementsPanel.vue'
import ActionGrid from './ActionGrid.vue'
import EnhancePanel from './EnhancePanel.vue'
import AbyssPanel from './AbyssPanel.vue'
import CodexPanel from './CodexPanel.vue'
import ExpeditionPanel from './ExpeditionPanel.vue'
import PrestigePanel from './PrestigePanel.vue'
import SceneCanvas from './SceneCanvas.vue'
import SettingsPanel from './SettingsPanel.vue'
import ShopPanel from './ShopPanel.vue'
import TasksPanel from './TasksPanel.vue'

const view = computed(() => store.ui.view)
const title = computed(() => {
  if (view.value === 'prestige') return '传承'
  if (view.value === 'tasks') return '任务'
  if (view.value === 'expedition') return '远征'
  if (view.value === 'abyss') return '深渊回廊'
  if (view.value === 'codex') return '图鉴与赛季'
  if (view.value === 'shop') return '商店'
  if (view.value === 'achievements') return '成就'
  if (view.value === 'settings') return '设置'
  return skillName(view.value)
})
/** 场景动画仅展示在技能视图 */
const showScene = computed(() =>
  ['mining', 'smelting', 'forging', 'enhancing'].includes(view.value),
)

/** v3.1：教程当前目标（用于卡面高亮与「前往」） */
const tutorialHint = computed(() => {
  const cur = store.state.flags.tutorial.current
  const step = CONTENT.tutorial.find((x) => x.step === cur)
  if (!step) return null
  const g = step.goal as { type: string; itemId?: string; slotId?: string }
  return { type: g.type, itemId: g.itemId, slotId: g.slotId }
})

/** 教程目标对应的"高亮卡"：矿场按产出物匹配、配方按产出物匹配 */
function isHinted(kind: 'mine' | 'craft', outputItemId?: string): boolean {
  const h = tutorialHint.value
  if (!h || !h.itemId) return false
  if (h.type === 'mineItem') return kind === 'mine' && outputItemId === h.itemId
  if (h.type === 'craftItem') return kind === 'craft' && outputItemId === h.itemId
  return false
}

const miningCards = computed<ActionCard[]>(() => {
  const lv = levelInfo(store.state.skills.mining).level
  return CONTENT.ores.map((s) => {
    const locked = lv < s.unlockLevel
    // v3.1：卡面直接给"耗时 · 产出"（此前只有产出，耗时要点开弹窗才知道）
    const dur = durationOf(store.state, { kind: 'mine', siteId: s.id })
    return {
      ref: { kind: 'mine', siteId: s.id } as const,
      title: s.name,
      icon: '🪨',
      itemId: s.outputItemId,
      locked,
      highlight: !locked && isHinted('mine', s.outputItemId),
      note: locked
        ? `需要 Lv${s.unlockLevel}`
        : `${fmtDur(dur)} · ${itemDef(s.outputItemId).name} ${s.yieldMin}~${s.yieldMax}`,
    }
  })
})

function recipeCard(r: RecipeDef): ActionCard {
  const lv = levelInfo(store.state.skills[r.skill]).level
  const locked = lv < r.unlockLevel
  const itemId = r.outputs[0]?.itemId
  // v3.1：卡面给"输入 → 产出 · 耗时"（此前已解锁配方只显示"Lv1"，信息量为零）
  const dur = durationOf(store.state, { kind: 'craft', recipeId: r.id })
  const ins = r.inputs
    .map((i) => `${i.qty} ${itemDef(i.itemId).name}`)
    .slice(0, 2)
    .join(' + ')
  const more = r.inputs.length > 2 ? ' +…' : ''
  return {
    ref: { kind: 'craft', recipeId: r.id },
    title: r.name,
    icon: '📦',
    itemId,
    locked,
    highlight: !locked && isHinted('craft', itemId),
    note: locked
      ? `需要 Lv${r.unlockLevel}`
      : `${ins}${more} → 1 ${itemId ? itemDef(itemId).name : ''} · ${fmtDur(dur)}`,
  }
}

/** 配方搜索过滤（QoL） */
function match(name: string): boolean {
  const q = store.ui.searchText.trim()
  return q === '' || name.includes(q)
}

const smeltCards = computed<ActionCard[]>(() =>
  CONTENT.recipes.filter((r) => r.skill === 'smelting' && match(r.name)).map(recipeCard),
)

const forgeCats = FORGE_CATEGORIES

const forgeCards = computed<ActionCard[]>(() =>
  CONTENT.recipes
    .filter((r) => r.skill === 'forging' && r.category === store.ui.forgeCategory && match(r.name))
    .map(recipeCard),
)

function pick(card: ActionCard): void {
  pickAction(card.ref)
}
</script>

<template>
  <main class="main">
    <h2>{{ title }}</h2>

    <!-- v2.5 §2.4：视图切换 120ms 淡入。
         实现用“只进不出的 CSS 动画”（不用 <Transition mode="out-in">）：
         后者要等 leave 过渡结束才挂载新视图，在"不绘制的环境/后台标签页"里会卡住不换页
         （面板内容以 store.ui.view 为准，避免视图已切换而内容滞留）。
         [data-fx='off'/'reduced'] 与 prefers-reduced-motion 下由 theme.css 取消动画。 -->
    <div :key="view" class="panel">
    <SceneCanvas v-if="showScene" />

    <template v-if="view === 'mining'">
      <ActionGrid :cards="miningCards" @pick="pick" />
    </template>

    <template v-else-if="view === 'smelting'">
      <input v-model="store.ui.searchText" class="search" placeholder="搜索配方名称…" />
      <ActionGrid :cards="smeltCards" @pick="pick" />
    </template>

    <template v-else-if="view === 'forging'">
      <div class="tabs">
        <button
          v-for="c in forgeCats"
          :key="c.id"
          class="tab"
          :class="{ active: store.ui.forgeCategory === c.id }"
          @click="store.ui.forgeCategory = c.id"
        >
          {{ c.label }}
        </button>
        <input v-model="store.ui.searchText" class="search search-inline" placeholder="搜索配方名称…" />
      </div>
      <ActionGrid :cards="forgeCards" @pick="pick" />
    </template>

    <template v-else-if="view === 'enhancing'">
      <EnhancePanel />
    </template>

    <template v-else-if="view === 'prestige'">
      <PrestigePanel />
    </template>

    <template v-else-if="view === 'tasks'">
      <TasksPanel />
    </template>

    <template v-else-if="view === 'expedition'">
      <ExpeditionPanel />
    </template>

    <template v-else-if="view === 'abyss'">
      <AbyssPanel />
    </template>

    <template v-else-if="view === 'codex'">
      <CodexPanel />
    </template>

    <template v-else-if="view === 'achievements'">
      <AchievementsPanel />
    </template>

    <template v-else-if="view === 'shop'">
      <ShopPanel />
    </template>

    <template v-else>
      <SettingsPanel />
    </template>
    </div>
  </main>
</template>

<style scoped>
.main {
  flex: 1;
  min-width: 0;
  padding: 14px 18px;
  overflow-y: auto;
}
h2 {
  margin: 0 0 12px;
  font-size: 18px;
}
/* 只淡入不位移：窄屏下位移会引起重排/横向抖动的观感问题。
   用 animation（而非 transition）→ 不参与 Vue 的过渡生命周期，切换永不阻塞。 */
.panel {
  animation: panelIn 0.12s ease-out;
}
@keyframes panelIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
.tabs {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 12px;
}
.tab {
  border: 1px solid var(--c-border);
  background: transparent;
  color: var(--c-text);
  border-radius: 999px;
  padding: 4px 14px;
  font-size: 13px;
  cursor: pointer;
  font-family: var(--font);
}
.tab.active {
  background: var(--c-accent-2);
  border-color: var(--c-accent-2);
  color: #fff;
}
.search {
  display: block;
  width: 240px;
  margin-bottom: 12px;
  background: var(--c-bg-deep);
  border: 1px solid var(--c-border);
  color: var(--c-text);
  border-radius: 6px;
  padding: 5px 10px;
  font-family: var(--font);
  font-size: 13px;
}
.search-inline {
  margin: 0 0 0 auto;
}

/* v1.8：窄屏适配 */
@media (max-width: 900px) {
  .main {
    padding: 10px 12px;
    /* v1.9：交给外层 .body 单滚动，避免嵌套滚动区 */
    flex: none;
    overflow-y: visible;
  }
  .tabs {
    flex-wrap: wrap;
  }
  .search,
  .search-inline {
    width: 100%;
    margin: 0 0 8px;
  }
}
</style>
