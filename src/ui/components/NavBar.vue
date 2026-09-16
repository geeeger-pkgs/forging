<script setup lang="ts">
import { computed } from 'vue'
import { cmd, setView, store } from '../../app/store'
import { CONTENT, TUTORIAL_BY_STEP } from '../../game/content'
import { levelInfo } from '../../game/level'
import { skillIcon } from '../icons'

const skills = computed(() =>
  CONTENT.skills.map((s) => {
    const info = levelInfo(store.state.skills[s.id])
    const pct = !Number.isFinite(info.xpNeed) || info.xpNeed === 0 ? 1 : Math.min(1, info.xpInto / info.xpNeed)
    return { id: s.id, name: s.name, level: info.level, pct }
  }),
)

/**
 * v3.1：教程卡写清"要什么、差多少、去哪做"。
 * 测评 B-2：原卡只有「进度 0 / 10」，第 3/7 步（材料墙）只能靠撞墙学；现在给出目标物与数量，
 * 并提供「前往」把玩家送到对应视图（矿场/配方/装备/强化）。
 */
const tutorial = computed(() => {
  const t = store.state.flags.tutorial
  const step = TUTORIAL_BY_STEP.get(t.current)
  if (!step) return null
  const g = step.goal as { type: string; itemId?: string; slotId?: string; target: number }
  const itemName = g.itemId ? (CONTENT.items[g.itemId]?.name ?? g.itemId) : null
  const goalText =
    g.type === 'mineItem'
      ? `挖掘 ${itemName} ×${g.target}`
      : g.type === 'craftItem'
        ? `制作 ${itemName} ×${g.target}`
        : g.type === 'equipSlot'
          ? '装备一件工具/武器'
          : g.type === 'enhanceInstance'
            ? `强化装备 ×${g.target}`
            : `总等级达到 ${g.target}`
  return {
    step,
    goalText,
    view: goalView(g),
    done: t.completed.includes(step.step),
    progress: t.progress,
    target: g.target,
    remain: Math.max(0, g.target - t.progress),
  }
})

/** 教程目标 → 该去哪个视图（craftItem 按配方所属技能推导：熔炼/锻造） */
function goalView(g: { type: string; itemId?: string }): string {
  if (g.type === 'mineItem') return 'mining'
  if (g.type === 'equipSlot' || g.type === 'enhanceInstance') return 'enhancing'
  if (g.type === 'totalLevel') return 'mining'
  if (g.type === 'craftItem' && g.itemId) {
    const r = CONTENT.recipes.find((x) => x.outputs.some((o) => o.itemId === g.itemId))
    if (r) return r.skill === 'smelting' ? 'smelting' : 'forging'
  }
  return 'mining'
}

function gotoStep(): void {
  const t = tutorial.value
  if (t) setView(t.view as never)
}

function claim(): void {
  const t = tutorial.value
  if (t) cmd({ type: 'claimTutorial', step: t.step.step })
}

/** 快捷静音（测评 M1）：音效要有一个"随手按掉"的入口，而不是非进设置页不可 */
const soundOn = computed(() => store.state.meta.settings?.sound ?? true)
function toggleMute(): void {
  cmd({ type: 'setSettings', patch: { sound: !soundOn.value } })
}
</script>

<template>
  <nav class="nav">
    <button
      v-for="s in skills"
      :key="s.id"
      class="item"
      :class="{ active: store.ui.view === s.id }"
      @click="setView(s.id)"
    >
      <span class="icon">{{ skillIcon(s.id) }}</span>
      <span class="body">
        <span class="name">{{ s.name }}<em>{{ s.level }}</em></span>
        <span class="xpbar"><i :style="{ width: (s.pct * 100).toFixed(1) + '%' }" /></span>
      </span>
    </button>

    <div class="tools">
      <button class="item" :class="{ active: store.ui.view === 'prestige' }" @click="setView('prestige')">
        <span class="icon">🔮</span>
        <span class="body"><span class="name">传承</span></span>
      </button>
      <button class="item" :class="{ active: store.ui.view === 'tasks' }" @click="setView('tasks')">
        <span class="icon">📋</span>
        <span class="body"><span class="name">任务</span></span>
      </button>
      <button class="item" :class="{ active: store.ui.view === 'expedition' }" @click="setView('expedition')">
        <span class="icon">🧭</span>
        <span class="body"><span class="name">远征</span></span>
      </button>
      <button class="item" :class="{ active: store.ui.view === 'codex' }" @click="setView('codex')">
        <span class="icon">📖</span>
        <span class="body"><span class="name">图鉴</span></span>
      </button>
      <button class="item" :class="{ active: store.ui.view === 'abyss' }" @click="setView('abyss')">
        <span class="icon">🕳</span>
        <span class="body"><span class="name">深渊</span></span>
      </button>
      <button class="item" :class="{ active: store.ui.view === 'shop' }" @click="setView('shop')">
        <span class="icon">🛒</span>
        <span class="body"><span class="name">商店</span></span>
      </button>
      <button class="item" :class="{ active: store.ui.view === 'achievements' }" @click="setView('achievements')">
        <span class="icon">🏆</span>
        <span class="body"><span class="name">成就</span></span>
      </button>
      <button class="item" :class="{ active: store.ui.view === 'settings' }" @click="setView('settings')">
        <span class="icon">⚙️</span>
        <span class="body"><span class="name">设置</span></span>
      </button>
    </div>

    <button
      class="item mute"
      :title="soundOn ? '关闭音效（设置页可调音量与特效档位）' : '开启音效'"
      :aria-pressed="!soundOn"
      @click="toggleMute"
    >
      <span class="icon">{{ soundOn ? '🔊' : '🔇' }}</span>
      <span class="body"><span class="name">{{ soundOn ? '音效开' : '已静音' }}</span></span>
    </button>

    <div v-if="tutorial" class="tutorial">
      <div class="t-title">📘 教程 · {{ tutorial.step.title }}</div>
      <div class="t-goal">{{ tutorial.goalText }}</div>
      <div class="t-progress">
        {{ tutorial.done ? '目标已达成' : `进度 ${tutorial.progress} / ${tutorial.target}（还差 ${tutorial.remain}）` }}
      </div>
      <div class="t-actions">
        <button v-if="!tutorial.done" class="btn sm" @click="gotoStep">前往</button>
        <button v-if="tutorial.done" class="btn primary sm" @click="claim">领取奖励</button>
      </div>
    </div>
  </nav>
</template>

<style scoped>
.nav {
  width: 200px;
  min-width: 200px;
  background: var(--c-panel);
  border-right: 1px solid var(--c-border);
  display: flex;
  flex-direction: column;
  padding: 8px;
  gap: 4px;
  overflow-y: auto;
}
.item {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--c-text);
  border-radius: 6px;
  padding: 6px 8px;
  cursor: pointer;
  font-family: var(--font);
  text-align: left;
}
.item:hover {
  background: var(--c-panel-2);
}
.item.active {
  background: var(--c-panel-2);
  border-color: var(--c-accent-2);
}
.icon {
  font-size: 18px;
}
.body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.name {
  font-size: 13px;
  display: flex;
  justify-content: space-between;
}
.name em {
  font-style: normal;
  color: var(--c-accent);
}
.xpbar {
  height: 3px;
  background: var(--c-bg-deep);
  border-radius: 2px;
  overflow: hidden;
}
.xpbar i {
  display: block;
  height: 100%;
  background: var(--c-accent-2);
}
.tools {
  margin-top: 6px;
  border-top: 1px solid var(--c-border);
  padding-top: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.tutorial {
  margin-top: auto;
  border: 1px solid var(--c-border);
  border-radius: 6px;
  padding: 8px;
  font-size: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.t-title {
  font-weight: 600;
}
.t-goal {
  font-size: 12px;
  color: var(--c-text);
  font-weight: 600;
}
.t-actions {
  display: flex;
  gap: 6px;
  margin-top: 4px;
}
.t-progress {
  color: var(--c-text-dim);
}

/* v1.8：窄屏横向滚动条 */
@media (max-width: 900px) {
  .nav {
    width: auto;
    min-width: 0;
    flex-direction: row;
    flex-wrap: wrap;
    border-right: none;
    border-bottom: 1px solid var(--c-border);
    overflow-y: visible;
    max-height: none;
  }
  .item {
    flex: 0 0 auto;
    padding: 6px 10px;
  }
  .xpbar {
    display: none;
  }
  .tools {
    margin-top: 0;
    border-top: none;
    padding-top: 0;
    flex-direction: row;
    /* v2.2 测评 M5：6 个工具按钮在 390px 下会溢出（设置不可达）→ 允许换行 */
    flex-wrap: wrap;
    flex: 1 1 100%;
  }
  .tools .item {
    flex: 1 1 auto;
    min-width: 0;
  }
  .tutorial {
    margin-top: 0;
    flex: 1 1 100%;
  }
}
</style>
