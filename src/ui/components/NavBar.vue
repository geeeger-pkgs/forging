<script setup lang="ts">
import { computed, ref } from 'vue'
import { cmd, setView, store } from '../../app/store'
import { CONTENT, TUTORIAL_BY_STEP } from '../../game/content'
import { levelInfo } from '../../game/level'
import { FORGE_CATEGORIES } from '../types'
import { skillIcon } from '../icons'
import { fmtPct } from '../format'

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
  const g = step.goal as { type: string; itemId?: string; slotId?: string; counter?: string; target: number }
  const itemName = g.itemId ? (CONTENT.items[g.itemId]?.name ?? g.itemId) : null
  const goalText = goalLabel(g, itemName)
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

/**
 * v3.3 C1：可领奖徽标。
 * 数据源只取**已确认存在待领取语义**的两处（评审 P-B2：任务/图鉴里程碑/赛季奖励都是自动发放，
 * 没有可领取态 —— 初稿把它们当数据源会做出一个永远不出现的徽标）：
 *   ① 远征 run.done（完成待领，见 ExpeditionsState）
 *   ② 教程当前步已完成但未领取（claimTutorial 的判定条件）
 */
const pendingExpeditions = computed(() => store.state.meta.expeditions?.runs?.filter((r) => r.done).length ?? 0)
const pendingTutorial = computed(() => {
  const t = store.state.flags.tutorial
  return t.completed.includes(t.current) && !t.claimed.includes(t.current) ? 1 : 0
})
/** 「更多」开关上的总数（跨分区提示有东西可拿） */
const pendingCount = computed(() => pendingExpeditions.value + pendingTutorial.value)

/** v3.1：章节二目标的计数器可读名（面板文案用） */
const COUNTER_LABEL: Record<string, string> = {
  totalReforges: '重铸词缀',
  totalExpeditions: '完成远征',
  totalEnhancesT4: '强化金档以上装备（T4+）',
  totalEnhances: '强化装备',
  totalMines: '挖掘',
  totalCrafts: '制作',
  totalGoldEarned: '累计获得金币',
}

function goalLabel(g: { type: string; itemId?: string; counter?: string; target: number }, itemName: string | null): string {
  switch (g.type) {
    case 'mineItem':
      return `挖掘 ${itemName} ×${g.target}`
    case 'craftItem':
      return `制作 ${itemName} ×${g.target}`
    case 'equipSlot':
      return '装备一件工具/武器'
    case 'enhanceInstance':
      return `强化装备 ×${g.target}`
    case 'stat':
      return `${COUNTER_LABEL[g.counter ?? ''] ?? g.counter ?? '目标'} ×${g.target}`
    case 'abyssFloor':
      return `深渊回廊通关 ${g.target} 层`
    case 'codexPct':
      return `图鉴收集达到 ${fmtPct(g.target)}`
    case 'seasonLevel':
      return `赛季声望等级达到 ${g.target}`
    default:
      return `总等级达到 ${g.target}`
  }
}

/** 统计类目标的落点（按计数器推导；缺省去任务页看进度） */
const STAT_VIEW: Record<string, string> = {
  totalReforges: 'forging',
  totalExpeditions: 'expedition',
  totalEnhancesT4: 'enhancing',
  totalEnhances: 'enhancing',
}

/** 教程目标 → 该去哪个视图（craftItem 按配方所属技能推导：熔炼/锻造） */
function goalView(g: { type: string; itemId?: string; counter?: string }): string {
  if (g.type === 'mineItem') return 'mining'
  if (g.type === 'equipSlot' || g.type === 'enhanceInstance') return 'enhancing'
  if (g.type === 'totalLevel') return 'mining'
  // v3.1 章节二落点
  if (g.type === 'stat') return STAT_VIEW[g.counter ?? ''] ?? 'tasks'
  if (g.type === 'abyssFloor') return 'abyss'
  if (g.type === 'codexPct') return 'codex'
  if (g.type === 'seasonLevel') return 'codex'
  if (g.type === 'craftItem' && g.itemId) {
    const r = CONTENT.recipes.find((x) => x.outputs.some((o) => o.itemId === g.itemId))
    if (r) return r.skill === 'smelting' ? 'smelting' : 'forging'
  }
  return 'mining'
}

/**
 * v3.4.4（全应用扫描）：教程「前往」此前只切**视图**，第 4/7/9 步会落到"没有目标卡"的分区
 * （锻造页默认停在"工具"分区、装备入口在右栏）→ 观感等同按钮坏了。
 * 现在同时切换锻造分区 / 打开右栏对应页签。
 */
function gotoStep(): void {
  const t = tutorial.value
  if (!t) return
  setView(t.view as never)
  store.ui.searchText = '' // v3.4.5：清搜索词，否则目标卡被过滤（落点空白）
  const g = t.step.goal as { type: string; itemId?: string; slotId?: string }
  if (g.type === 'craftItem' && g.itemId) {
    const r = CONTENT.recipes.find((x) => x.outputs.some((o) => o.itemId === g.itemId))
    const cats = FORGE_CATEGORIES.map((c) => c.id) as string[]
    if (r && cats.includes(r.category)) store.ui.forgeCategory = r.category as never
  }
  if (g.type === 'equipSlot') store.ui.rightTabWanted = 'bag' // 右栏切到行囊（装备入口）
}

function claim(): void {
  const t = tutorial.value
  if (t) cmd({ type: 'claimTutorial', step: t.step.step })
}

/**
 * v3.2 A1：窄屏工具抽屉。
 * 390px 下把 8 个工具入口 + 静音 + 教程卡全平铺会吃掉半个首屏（测评 B-10）；
 * 桌面端（>900px）始终展开（CSS 忽略该 class），窄屏默认收起，点「更多」展开。
 * v3.2 修正两处：
 *   ① 初始值曾写反（`!TOOL_VIEWS.includes`）——技能页为 true，窄屏反而默认展开；
 *   ② 曾有一条"进入工具页自动展开"的 watch，与"选完收起"互相打架（watch 后跑，把收起又顶开）
 *      —— 已删除：抽屉状态完全交给用户（「更多」开合 / 选中任一工具后自动收起）。
 */
const TOOL_LABEL: Record<string, string> = {
  prestige: '传承',
  tasks: '任务',
  expedition: '远征',
  codex: '图鉴',
  abyss: '深渊',
  shop: '商店',
  achievements: '成就',
  settings: '设置',
}
/** 当前是否停在某个工具分区（收起时用它显示"更多 · 图鉴"） */
const currentToolLabel = computed(() => TOOL_LABEL[store.ui.view] ?? null)
const toolsOpen = ref(currentToolLabel.value !== null)
/** v3.6.1：教程卡折叠（窄屏 sticky 导航下教程卡占 ~140px，可收起；桌面同样可用） */
const tutOpen = ref(true)
function pickTool(v: string): void {
  setView(v as never)
  toolsOpen.value = false
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

    <!-- v3.2 评审 N4：抽屉收起时"我在哪"不可见 —— 开关本身显示当前分区名并加 active 态 -->
    <button
      class="item tools-toggle"
      :class="{ active: currentToolLabel !== null }"
      :aria-expanded="toolsOpen"
      aria-controls="nav-tools"
      :title="
        toolsOpen
          ? '收起工具'
          : currentToolLabel
            ? `当前分区：${currentToolLabel}（点开切换）`
            : '展开工具（传承/任务/远征/图鉴/深渊/商店/成就）'
      "
      @click="toolsOpen = !toolsOpen"
    >
      <span class="icon">{{ toolsOpen ? '▾' : '▸' }}</span>
      <span class="body">
        <span class="name">
          更多<em v-if="!toolsOpen && currentToolLabel"> · {{ currentToolLabel }}</em>
          <!-- v3.3 C1：有可领取奖励时给个明确的有东西可拿信号 -->
          <span
            v-if="pendingCount > 0"
            class="badge"
            role="status"
            :title="`有 ${pendingCount} 项奖励可领取（远征 / 教程）`"
            :aria-label="`有 ${pendingCount} 项奖励可领取`"
          >
            {{ pendingCount }}
          </span>
        </span>
      </span>
    </button>

    <div id="nav-tools" class="tools" :class="{ collapsed: !toolsOpen }">
      <button class="item" :class="{ active: store.ui.view === 'prestige' }" @click="pickTool('prestige')">
        <span class="icon">🔮</span>
        <span class="body"><span class="name">传承</span></span>
      </button>
      <button class="item" :class="{ active: store.ui.view === 'tasks' }" @click="pickTool('tasks')">
        <span class="icon">📋</span>
        <span class="body"><span class="name">任务</span></span>
      </button>
      <button class="item" :class="{ active: store.ui.view === 'expedition' }" @click="pickTool('expedition')">
        <span class="icon">🧭</span>
        <span class="body">
          <span class="name">
            远征
            <!-- v3.3 C1 徽标挂点 2：抽屉展开时（含桌面）也能看到。
                 **只报远征自己的待领数**（评审：混入教程数会让玩家点进远征却空空如也） -->
            <span
              v-if="pendingExpeditions > 0"
              class="badge"
              :title="`有 ${pendingExpeditions} 支远征待领取`"
              :aria-label="`有 ${pendingExpeditions} 支远征待领取`"
            >
              {{ pendingExpeditions }}
            </span>
          </span>
        </span>
      </button>
      <button class="item" :class="{ active: store.ui.view === 'codex' }" @click="pickTool('codex')">
        <span class="icon">📖</span>
        <span class="body"><span class="name">图鉴</span></span>
      </button>
      <button class="item" :class="{ active: store.ui.view === 'abyss' }" @click="pickTool('abyss')">
        <span class="icon">🕳</span>
        <span class="body"><span class="name">深渊</span></span>
      </button>
      <button class="item" :class="{ active: store.ui.view === 'shop' }" @click="pickTool('shop')">
        <span class="icon">🛒</span>
        <span class="body"><span class="name">商店</span></span>
      </button>
      <button class="item" :class="{ active: store.ui.view === 'achievements' }" @click="pickTool('achievements')">
        <span class="icon">🏆</span>
        <span class="body"><span class="name">成就</span></span>
      </button>
      <button class="item" :class="{ active: store.ui.view === 'settings' }" @click="pickTool('settings')">
        <span class="icon">⚙️</span>
        <span class="body"><span class="name">设置</span></span>
      </button>
    </div>

    <button
      class="item mute"
      :title="soundOn ? '关闭音效（设置页可调音量与特效档位）' : '开启音效'"
      :aria-pressed="!soundOn"
      :aria-label="soundOn ? '音效开，点击静音' : '已静音，点击开启音效'"
      @click="toggleMute"
    >
      <span class="icon" aria-hidden="true">{{ soundOn ? '🔊' : '🔇' }}</span>
      <span class="body"><span class="name">{{ soundOn ? '音效开' : '已静音' }}</span></span>
    </button>

    <div v-if="tutorial" class="tutorial" :class="{ folded: !tutOpen }">
      <!-- v3.5 终审 B（n1）：给教程卡加步序，长线目标不再像"卡住" -->
      <!-- v3.6.1（评审 B-M1）：标题改为可折叠按钮——窄屏 sticky 导航下省 ~140px 屏高 -->
      <button
        class="t-title"
        :aria-expanded="tutOpen"
        :title="tutOpen ? '收起教程卡（省屏幕高度）' : '展开教程卡'"
        @click="tutOpen = !tutOpen"
      >
        <span class="t-name">📘 教程 · {{ tutorial.step.title }}</span>
        <span class="dim small t-step">第 {{ tutorial.step.step }} / {{ CONTENT.tutorial.length }} 步</span>
        <span class="chev" aria-hidden="true">{{ tutOpen ? '▾' : '▸' }}</span>
      </button>
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
  border-radius: var(--r-sm);
  padding: 6px 8px;
  cursor: pointer;
  font-family: var(--font);
  text-align: left;
  transition:
    background var(--t-fast) var(--ease),
    border-color var(--t-fast) var(--ease);
}
.item:hover {
  background: var(--c-panel-2);
}
/* v3.7：选中态 = 左侧金色几何条 + 渐变铺底（块状风格），比"换个边框色"更醒目 */
.item.active {
  background: linear-gradient(90deg, rgba(255, 176, 58, 0.16), rgba(255, 176, 58, 0.04) 62%, transparent);
  border-color: transparent;
  box-shadow: inset 3px 0 0 var(--c-accent);
}
.item.active .name {
  color: var(--c-accent);
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
/* v3.3 C1：可领奖徽标（小圆点 + 数量；不依赖颜色单通道，数字本身就是语义） */
.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  margin-left: 6px;
  border-radius: 8px;
  /* v3.3 评审：红=报错联想，改用强调色（"有奖励可拿"的语义更贴切） */
  background: var(--c-accent);
  color: #1a1204;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
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
/* 桌面端不需要抽屉开关（>900px 时隐藏，见媒体查询） */
.tools-toggle {
  display: none;
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
  /* v3.6.1：标题是折叠开关（按钮 reset：外观与文本一致，但键盘/读屏可达）
     v3.7：三段式（标题 flex:1 省略号 / 步序 / chevron），桌面 200px 侧栏不再折行 */
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 0;
  background: transparent;
  border: none;
  color: var(--c-text);
  font-family: var(--font);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}
.chev {
  color: var(--c-text-dim);
  flex: 0 0 auto;
}
/* v3.7：桌面 200px 侧栏里"标题 + 步序"会折行 → 标题省略号、步序独立短标签 */
.t-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.t-step {
  flex: 0 0 auto;
  white-space: nowrap;
}
.tutorial.folded .t-goal,
.tutorial.folded .t-progress,
.tutorial.folded .t-actions {
  display: none;
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

/*
 * v1.8：窄屏横向导航
 * v3.7.3（用户反馈"排布很怪"）：原 flex 自然宽度换行 → 每行宽度参差、
 * 右侧各空 90~116px，且"强化（技能）"与"更多/音效（开关）"混排断行。
 * 改为 **4 列等宽网格**：技能 4 项一行整齐；「更多 / 音效」各占半行；
 * 抽屉展开与教程卡整行跨列。触控目标 ≥40px 保持。
 */
@media (max-width: 900px) {
  .nav {
    width: auto;
    min-width: 0;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
    align-items: stretch;
    border-right: none;
    border-bottom: 1px solid var(--c-border);
    overflow-y: visible;
    max-height: none;
    /*
     * v3.6.1（评审 B-M1，实机证实）：导航此前随内容一起滚走——成就页 82 张卡在 375px 下
     * 约 9000px（8+ 屏），滚到底后 nav top=-8132px 完全不可达。窄屏粘在滚动容器顶部。
     */
    position: sticky;
    top: 0;
    z-index: 15;
    align-content: flex-start;
  }
  .item {
    justify-content: center;
    padding: 6px 6px;
    min-width: 0;
    /* v3.2 修正：窄屏触控目标 ≥40px（评审 Major） */
    min-height: 40px;
  }
  /*
   * v3.7.9（用户反馈"挖掘两个字竖着了"）：4 列网格下技能项可用宽仅 ~40px
   * （图标 30 + gap 8 + padding）→ "挖掘 23" 被迫折行成"挖 / 掘 23"。
   * 技能项改**图标在上、文字在下**（移动端 tab 的标准形态），文字获得整格宽度。
   * 只作用于顶层技能项；「更多（span 3，宽 272 足够横排）」与「音效（纯图标）」不受影响；
   * 抽屉内工具项（宽 87、内容 ≤62px）实测无需改。
   */
  .nav > .item:not(.tools-toggle):not(.mute) {
    flex-direction: column;
    align-items: center;
    gap: 1px;
    padding: 5px 4px;
    min-height: 52px;
  }
  .nav > .item:not(.tools-toggle):not(.mute) .name {
    font-size: 12px;
    white-space: nowrap;
  }
  .nav > .item:not(.tools-toggle):not(.mute) .name em {
    font-size: 11px;
    margin-left: 3px;
  }
  .xpbar {
    display: none;
  }
  /*
   * v3.7.8（用户反馈"音效开关需要多占那么多位置吗"）：音效只是静音快捷开关，
   * 不配占半行 —— 窄屏只显示图标（占 1 格，40px 命中区不变，aria-label 提供可访问名），
   * 「更多」占其余 3 格。
   */
  .tools-toggle {
    display: flex; /* 桌面为 display:none（仅窄屏出现）—— v3.7.3 改网格时必须保留这行 */
    grid-column: span 3;
  }
  .mute {
    grid-column: span 1;
  }
  .mute .body {
    display: none;
  }
  .mute .icon {
    font-size: 18px;
  }
  /* 抽屉展开：整行跨列，内部同样 4 列网格（8 个工具整齐两行） */
  .tools {
    grid-column: 1 / -1;
    margin-top: 0;
    border-top: none;
    padding-top: 0;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
  }
  /* v3.2 A1：抽屉收起（默认） */
  .tools.collapsed {
    display: none;
  }
  .tools .item {
    min-width: 0;
  }
  .tutorial {
    grid-column: 1 / -1;
    margin-top: 0;
  }
}
</style>
