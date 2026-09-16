<script setup lang="ts">
import { computed } from 'vue'
import { cmd, store } from '../../app/store'
import { activeBuffs } from '../../game/buffs'
import { codexMilestonesClaimed } from '../../game/codex'
import { CONTENT, RUNE_BY_ID } from '../../game/content'
import { totalValue } from '../../game/economy'
import { milestoneView, totalLevel } from '../../game/level'
import { refLabel } from '../../game/refs'
import { buffIcon, fmtNum } from '../icons'
import ProgressBar from './ProgressBar.vue'

const cur = computed(() => store.state.actions.current)
const queue = computed(() => store.state.actions.queue)
const shownQueue = computed(() => queue.value.slice(0, 4))
const overflow = computed(() => Math.max(0, queue.value.length - 4))
const tl = computed(() => totalLevel(store.state.skills))
/** v3.4 A2：里程碑进度（按历史最高技能等级；传承后不掉档） */
const milestones = computed(() => milestoneView(store.state.meta.bestSkillLevel ?? 1))
const nextMilestone = computed(() => milestones.value.find((m) => !m.unlocked) ?? null)
const tv = computed(() => totalValue(store.state))

/** v3.0 L4：已达成图鉴里程碑的最高档称号 */
const codexTitle = computed(() => {
  const claimed = codexMilestonesClaimed(store.state)
  const hit = CONTENT.season.codexMilestones.filter((m) => claimed.has(String(m.pct)))
  return hit.length > 0 ? hit[hit.length - 1].title : ''
})

const buffs = computed(() =>
  activeBuffs(store.state, store.now).map((b) => {
    const def = RUNE_BY_ID.get(b.defId)
    return {
      icon: buffIcon(def?.effect ?? ''),
      name: def?.name ?? b.defId,
      min: Math.max(1, Math.ceil((b.until - store.now) / 60000)),
    }
  }),
)
</script>

<template>
  <header class="top">
    <div class="left">
      <span class="gold">💰 {{ fmtNum(store.state.gold) }}</span>
      <span class="dim tv">总价值 {{ fmtNum(tv) }}</span>
    </div>

    <div class="center">
      <div v-if="cur" class="current">
        <span class="label">{{ refLabel(cur.ref) }}</span>
        <span v-if="cur.remaining !== null" class="count">×{{ cur.remaining }}</span>
        <!-- v2.5：剩余时间由进度条自带（0.1s 粒度，短动作也能看清倒数） -->
        <ProgressBar :started-at="cur.startedAt" :duration-ms="cur.durationMs" />
        <button class="btn sm stop" @click="cmd({ type: 'stopAction' })">停止</button>
      </div>
      <!-- v3.2 C3 修正：空态要给出下一步，而不是"无所事事……"（设计点名的例子，评审 Minor） -->
      <div v-else class="idle">暂无进行中的动作（下一步：在下方点一个矿脉或配方开始）</div>

      <div v-if="queue.length" class="queue">
        <span class="qlabel">队列</span>
        <span v-for="(q, i) in shownQueue" :key="i" class="qitem">
          {{ refLabel(q.ref) }}<em v-if="q.remaining !== null">×{{ q.remaining }}</em>
        </span>
        <span v-if="overflow" class="qitem">+{{ overflow }} 项</span>
        <button class="btn sm" @click="cmd({ type: 'clearQueue' })">清空</button>
      </div>
    </div>

    <div class="right">
      <div v-if="buffs.length" class="buffs">
        <span v-for="(b, i) in buffs" :key="i" class="buff" :title="b.name">{{ b.icon }} {{ b.min }}m</span>
      </div>
      <span class="pname">{{ store.state.character.name }}</span>
      <span v-if="store.state.abyss?.title" class="title-badge" title="深渊商店购买的称号">深渊行者</span>
      <!-- v3.0 L4：图鉴四档称号（取已达成的最高档） -->
      <span v-if="codexTitle" class="title-badge codex" title="图鉴里程碑称号">图鉴·{{ codexTitle }}</span>
      <span class="dim tl">总等级 {{ tl }}</span>
      <!-- v3.4 A2：Lv76~100 里程碑（回答满级段还有什么；下一档悬停可见说明） -->
      <span
        v-if="milestones.length"
        class="dim ms"
         :title="nextMilestone ? `任一技能达到 Lv${nextMilestone.level} 解锁：${nextMilestone.desc}` : '技能里程碑已全部达成'"
      >
        🏅 技能里程碑 {{ milestones.filter((m) => m.unlocked).length }}/{{ milestones.length }}
        <template v-if="nextMilestone"> · 任一技能 Lv{{ nextMilestone.level }}</template>
      </span>
    </div>
  </header>
</template>

<style scoped>
.top {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 16px;
  background: var(--c-panel);
  border-bottom: 1px solid var(--c-border);
  min-height: 56px;
}
.left {
  min-width: 150px;
  display: flex;
  flex-direction: column;
}
.gold {
  color: var(--c-accent);
  font-weight: 600;
}
.center {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.current {
  display: flex;
  align-items: center;
  gap: 10px;
}
.label {
  font-weight: 600;
}
.count {
  color: var(--c-text-dim);
  font-size: 12px;
}
.time {
  color: var(--c-text-dim);
  font-size: 12px;
  min-width: 44px;
}
/* v3.2 B5：停止不再是全屏唯一危险色 —— 平时描边、hover 才显红（改档位/清档才是真危险操作） */
.stop {
  border-color: var(--c-border);
  color: var(--c-text-dim);
}
.stop:hover {
  border-color: var(--c-danger);
  color: var(--c-danger);
}
.idle {
  color: var(--c-text-dim);
}
.queue {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--c-text-dim);
}
.qitem em {
  font-style: normal;
  margin-left: 2px;
}
.right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  min-width: 120px;
  gap: 2px;
}
.buffs {
  display: flex;
  gap: 6px;
}
.buff {
  background: var(--c-panel-2);
  border: 1px solid var(--c-accent-2);
  border-radius: 999px;
  padding: 1px 8px;
  font-size: 11px;
  color: var(--c-accent);
}
.title-badge.codex {
  border-color: var(--c-accent-2);
  color: var(--c-accent-2);
}
.title-badge {
  font-size: 11px;
  color: var(--c-accent);
  border: 1px solid var(--c-accent);
  border-radius: 4px;
  padding: 0 4px;
}
.pname {
  font-weight: 600;
}
.dim {
  color: var(--c-text-dim);
  font-size: 12px;
}

/* v3.4 处置 V2/V3：技能里程碑用**独立 class**，不随 .tl 被窄屏隐藏（手机上必须可见） */
.ms {
  color: var(--c-text-dim);
  font-size: 12px;
}
@media (max-width: 640px) {
  .ms {
    display: inline;
    /* v3.6.1（评审 A-m1/B-m6）：里程碑是阅读文本（曾窄屏被降到 11px，比桌面还小）→ 用字号 token */
    font-size: var(--fs-note);
  }
}

/* v3.2 A4：窄屏精简——总价值/总等级移出（信息在设置页与成就页可取） */
@media (max-width: 640px) {
  .tv,
  .tl {
    display: none;
  }
}
/* v1.8：窄屏换行布局 */
@media (max-width: 900px) {
  .top {
    flex-wrap: wrap;
    gap: 8px 12px;
    padding: 8px 12px;
  }
  .left,
  .right {
    min-width: 0;
  }
  .center {
    order: 3;
    flex: 1 1 100%;
  }
}
</style>
