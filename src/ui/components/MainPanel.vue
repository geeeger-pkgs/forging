<script setup lang="ts">
import { computed } from 'vue'
import { pickAction, store } from '../../app/store'
import { CONTENT, itemDef, skillName } from '../../game/content'
import { levelInfo } from '../../game/level'
import type { RecipeDef } from '../../game/types'
import { itemIcon } from '../icons'
import type { ActionCard } from '../types'
import ActionGrid from './ActionGrid.vue'
import EnhancePanel from './EnhancePanel.vue'
import SettingsPanel from './SettingsPanel.vue'
import ShopPanel from './ShopPanel.vue'

const view = computed(() => store.ui.view)
const title = computed(() => {
  if (view.value === 'shop') return '商店'
  if (view.value === 'settings') return '设置'
  return skillName(view.value)
})

const miningCards = computed<ActionCard[]>(() => {
  const lv = levelInfo(store.state.skills.mining).level
  return CONTENT.ores.map((s) => {
    const locked = lv < s.unlockLevel
    return {
      ref: { kind: 'mine', siteId: s.id } as const,
      title: s.name,
      icon: itemIcon(s.outputItemId),
      locked,
      note: locked ? `需要 Lv${s.unlockLevel}` : `${itemDef(s.outputItemId).name} ${s.yieldMin}~${s.yieldMax}`,
    }
  })
})

function recipeCard(r: RecipeDef): ActionCard {
  const lv = levelInfo(store.state.skills[r.skill]).level
  const locked = lv < r.unlockLevel
  return {
    ref: { kind: 'craft', recipeId: r.id },
    title: r.name,
    icon: itemIcon(r.outputs[0]?.itemId ?? ''),
    locked,
    note: locked ? `需要 Lv${r.unlockLevel}` : `Lv${r.unlockLevel}`,
  }
}

const smeltCards = computed<ActionCard[]>(() =>
  CONTENT.recipes.filter((r) => r.skill === 'smelting').map(recipeCard),
)

const forgeCats = [
  { id: 'tool', label: '工具' },
  { id: 'weapon', label: '武器' },
  { id: 'armor', label: '护甲' },
] as const

const forgeCards = computed<ActionCard[]>(() =>
  CONTENT.recipes
    .filter((r) => r.skill === 'forging' && r.category === store.ui.forgeCategory)
    .map(recipeCard),
)

function pick(card: ActionCard): void {
  pickAction(card.ref)
}
</script>

<template>
  <main class="main">
    <h2>{{ title }}</h2>

    <template v-if="view === 'mining'">
      <ActionGrid :cards="miningCards" @pick="pick" />
    </template>

    <template v-else-if="view === 'smelting'">
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
      </div>
      <ActionGrid :cards="forgeCards" @pick="pick" />
    </template>

    <template v-else-if="view === 'enhancing'">
      <EnhancePanel />
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
</style>
