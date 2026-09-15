<script setup lang="ts">
import { computed } from 'vue'
import { pickAction, store } from '../../app/store'
import { CONTENT, itemDef, skillName } from '../../game/content'
import { levelInfo } from '../../game/level'
import type { RecipeDef } from '../../game/types'
import { FORGE_CATEGORIES, type ActionCard } from '../types'
import AchievementsPanel from './AchievementsPanel.vue'
import ActionGrid from './ActionGrid.vue'
import EnhancePanel from './EnhancePanel.vue'
import PrestigePanel from './PrestigePanel.vue'
import SceneCanvas from './SceneCanvas.vue'
import SettingsPanel from './SettingsPanel.vue'
import ShopPanel from './ShopPanel.vue'
import TasksPanel from './TasksPanel.vue'

const view = computed(() => store.ui.view)
const title = computed(() => {
  if (view.value === 'prestige') return '传承'
  if (view.value === 'tasks') return '任务'
  if (view.value === 'shop') return '商店'
  if (view.value === 'achievements') return '成就'
  if (view.value === 'settings') return '设置'
  return skillName(view.value)
})
/** 场景动画仅展示在技能视图 */
const showScene = computed(() =>
  ['mining', 'smelting', 'forging', 'enhancing'].includes(view.value),
)

const miningCards = computed<ActionCard[]>(() => {
  const lv = levelInfo(store.state.skills.mining).level
  return CONTENT.ores.map((s) => {
    const locked = lv < s.unlockLevel
    return {
      ref: { kind: 'mine', siteId: s.id } as const,
      title: s.name,
      icon: '🪨',
      itemId: s.outputItemId,
      locked,
      note: locked ? `需要 Lv${s.unlockLevel}` : `${itemDef(s.outputItemId).name} ${s.yieldMin}~${s.yieldMax}`,
    }
  })
})

function recipeCard(r: RecipeDef): ActionCard {
  const lv = levelInfo(store.state.skills[r.skill]).level
  const locked = lv < r.unlockLevel
  const itemId = r.outputs[0]?.itemId
  return {
    ref: { kind: 'craft', recipeId: r.id },
    title: r.name,
    icon: '📦',
    itemId,
    locked,
    note: locked ? `需要 Lv${r.unlockLevel}` : `Lv${r.unlockLevel}`,
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

    <template v-else-if="view === 'achievements'">
      <AchievementsPanel />
    </template>

    <template v-else-if="view === 'shop'">
      <ShopPanel />
    </template>

    <template v-else>
      <SettingsPanel />
    </template>
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
