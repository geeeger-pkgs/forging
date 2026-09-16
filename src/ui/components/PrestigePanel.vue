<script setup lang="ts">
import { computed } from 'vue'
import { cmd, store } from '../../app/store'
import { CONTENT } from '../../game/content'
import { levelInfo, totalLevel } from '../../game/level'
import {
  PRESTIGE_FIRST_POINT_SKILL,
  PRESTIGE_MIN_LEVEL,
  perkMaxLevel,
  perkNextCost,
  prestigePointsFor,
  prestigeUnlocked,
} from '../../game/prestige'

const total = computed(() => totalLevel(store.state.skills))
const unlocked = computed(() => prestigeUnlocked(store.state))
const points = computed(() => store.state.meta.prestige.points)
const willGain = computed(() => prestigePointsFor(store.state))
/** v3.4 W2：0 点提示需要展示卡在哪一项 */
const minSkill = computed(() => Math.min(...Object.values(store.state.skills).map((xp) => levelInfo(xp).level)))
const perks = computed(() =>
  CONTENT.perks.map((p) => ({
    def: p,
    level: store.state.meta.prestige.perks[p.id] ?? 0,
    cap: perkMaxLevel(p),
    next: perkNextCost(p, store.state.meta.prestige.perks[p.id] ?? 0),
  })),
)

function confirmPrestige(): void {
  if (!unlocked.value) return
  const p = willGain.value
  if (!window.confirm(`传承将重置技能等级与经验、清空当前动作与队列。\n保留材料/装备/金币/成就/任务/队列位/增益。\n本次可获得 ${p} 精通点。确定传承？`)) {
    return
  }
  cmd({ type: 'prestige' })
}
</script>

<template>
  <div class="prestige">
    <section class="card">
      <h3>🔮 精通的传承</h3>
      <p class="dim">
        当前总等级：<b class="hl">{{ total }}</b> / 解锁线 {{ PRESTIGE_MIN_LEVEL }}
      </p>
      <div class="bar"><i :style="{ width: Math.min(100, (total / PRESTIGE_MIN_LEVEL) * 100) + '%' }" /></div>
      <p class="dim">
        重置：技能等级与经验 ｜ 当前动作与队列<br />
        保留：材料 / 装备 / 金币 / 成就 / 任务 / 队列位 / 符文增益
      </p>
      <p v-if="unlocked" class="gain">本次传承可获得 <b class="hl">{{ willGain }}</b> 精通点（点数随<b>最低技能</b>提升：50/60/70/80/90/100 → 2/6/12/20/30/42）</p>
      <!-- v3.4 处置 V5：0 点时直接禁用并说明（此前先弹破坏性确认、确认后才被内核拦下） -->
      <!-- 3.4.1（终审 Major）：解锁前也可预览首点门槛与档位表 —— 此前两者都在 unlocked 之后渲染，中期玩家会误按"总 120 即有点"规划 -->
      <p v-if="!unlocked" class="dim small">
        提示：解锁后点数取决于<b>最低技能（四项中最低者）</b>——最低技能达到 Lv{{ PRESTIGE_FIRST_POINT_SKILL }} 才有首点（50/60/70/80/90/100 → 2/6/12/20/30/42 点）
      </p>
      <p v-if="unlocked && willGain === 0" class="dim small">
        当前 0 点：<b>最低技能</b>需达到 Lv{{ PRESTIGE_FIRST_POINT_SKILL }} 才有首点（2 点；现 Lv{{ minSkill }}）
        ——精通要求四项技能均衡（档位表见上）
      </p>
      <button class="btn primary" :disabled="!unlocked || willGain === 0" @click="confirmPrestige">
        {{ unlocked ? '立即传承' : `总等级 ${PRESTIGE_MIN_LEVEL} 解锁` }}
      </button>
    </section>

    <section class="card">
      <h3>精通殿堂 <span class="pts">可用精通点 {{ points }}</span></h3>
      <p class="dim">购买/退款即时生效，退款免费；效果永久保留，跨传承累计。</p>
      <p class="dim">
        深造：基础上限后可继续购买至 2 倍，深造部分每级价格 ×2（例：迅捷 20 → 40 级）。
      </p>
      <div class="grid">
        <div
          v-for="p in perks"
          :key="p.def.id"
          class="perk"
          :class="{ maxed: p.level >= p.cap, over: p.level > p.def.max }"
        >
          <div class="perk-head">
            <span class="perk-name">{{ p.def.name }}<span v-if="p.level > p.def.max" class="tag">深造</span></span>
            <span class="perk-lv">{{ p.level }} / {{ p.cap }}</span>
          </div>
          <div class="dim">{{ p.def.desc }} · 下一级 {{ p.next }} 点<span v-if="p.next > p.def.cost">（深造 ×2）</span></div>
          <div class="perk-actions">
            <button class="btn sm" :disabled="p.level <= 0" @click="cmd({ type: 'refundPerk', perkId: p.def.id })">− 退款</button>
            <button class="btn sm" :disabled="p.level >= p.cap" @click="cmd({ type: 'buyPerk', perkId: p.def.id })">+ 购买</button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.prestige {
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
}
.hl {
  color: var(--c-accent);
}
.pts {
  color: var(--c-accent-2);
  font-size: 13px;
  margin-left: 8px;
}
.dim {
  color: var(--c-text-dim);
  font-size: 13px;
  margin: 4px 0;
  line-height: 1.8;
}
.gain {
  color: var(--c-success);
  font-size: 13px;
}
.bar {
  height: 8px;
  background: var(--c-bg-deep);
  border-radius: 4px;
  overflow: hidden;
  margin: 8px 0;
}
.bar i {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, var(--c-accent-2), var(--c-accent));
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 10px;
  margin-top: 8px;
}
.perk {
  background: var(--c-panel);
  border: 1px solid var(--c-border);
  border-radius: 6px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.perk.maxed {
  border-color: var(--c-success);
}
.perk.over {
  border-color: var(--c-accent-2);
}
.tag {
  display: inline-block;
  margin-left: 6px;
  padding: 0 5px;
  font-size: 11px;
  font-weight: 400;
  border: 1px solid var(--c-accent-2);
  border-radius: 4px;
  color: var(--c-accent-2);
  vertical-align: 1px;
}
.perk-head {
  display: flex;
  justify-content: space-between;
  font-size: 14px;
  font-weight: 600;
}
.perk-lv {
  color: var(--c-accent-2);
}
.perk-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
button.primary {
  margin-top: 6px;
}
</style>
