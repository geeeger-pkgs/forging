// ============================================================
// Forging · 视听与手感（v2.5）测试 F1~F11
// 设计：docs/design-v2.5.md §4
// 环境为 node（无 DOM）：因此映射/引擎都必须可在 node 下驱动
// ============================================================
// 用 Vite 的 `?raw` 读取源码/证据文件：无需 @types/node，且在 vitest 里是构建期依赖
// （文件被改动后测试自动重跑，不会读到旧副本）
import storeSrc from '../src/app/store.ts?raw'
import typesSrc from '../src/game/types.ts?raw'
import auditOutput from '../docs/audit-fx-output.json'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  __resetAudioForTest,
  audioStatus,
  cueList,
  playCue,
  setAudioContextFactory,
  setAudioEnabled,
  setAudioVolume,
  unlockAudio,
} from '../src/ui/audio'
import { resolveFx, resolveFxLevel, type FxContext } from '../src/ui/fx-map'
import { __resetFxProbe, fxSnapshot, noteCue, recordDraw, requestBurst, setLiveCounts } from '../src/ui/fx-probe'
import { __resetSceneBus, emitScene, subscribeScene } from '../src/app/scene-bus'
import { applyCommand } from '../src/game/commands'
import { CONTENT } from '../src/game/content'
import { newGame } from '../src/game/state'
import { SAVE_VERSION, deserializeSave, sanitizeSettings } from '../src/app/persist'
import type { GameEvent } from '../src/game/types'

const ctx: FxContext = {
  itemName: (id) => CONTENT.items[id]?.name ?? id,
  isRare: (id) => ['essence', 'crate', 'reagent', 'relic'].includes(CONTENT.items[id]?.category ?? ''),
  skillName: (id) => CONTENT.skills.find((s) => s.id === id)?.name ?? id,
}
const SITE = CONTENT.ores[0].id

afterEach(() => {
  __resetAudioForTest()
  setAudioContextFactory(null)
  __resetFxProbe()
  __resetSceneBus()
  vi.useRealTimers()
})

// ---------------- F1 穷举 ----------------

describe('F1 resolveFx 穷举（设计 §2.2 契约）', () => {
  /** 每个 GameEvent 成员造一个样本（新增事件若忘记在此登记，F11 会失败） */
  const SAMPLES: GameEvent[] = [
    { type: 'actionStarted', ref: { kind: 'mine', siteId: SITE } },
    { type: 'actionCompleted', ref: { kind: 'mine', siteId: SITE }, rounds: 3 },
    { type: 'actionStopped', reason: 'user' },
    { type: 'itemsGained', items: [{ itemId: 'ore_copper', qty: 5 }] },
    { type: 'xpGained', skill: 'mining', xp: 12 },
    { type: 'levelUp', skill: 'mining', level: 5 },
    { type: 'enhanceResult', instanceId: 1, from: 3, to: 4, success: true },
    { type: 'reforged', instanceId: 1, name: '铜镐', before: 0.2, after: 0.5 },
    { type: 'expeditionDispatched', routeName: '近郊矿道', hours: 2 },
    { type: 'expeditionDone', routeName: '近郊矿道', hours: 2, success: true, gold: 120, expected: false },
    { type: 'expeditionClaimed', routeName: '近郊矿道', gold: 120 },
    { type: 'companionRecruited', name: '矿工阿岩', duplicate: false },
    { type: 'companionLevelUp', name: '矿工阿岩', level: 3 },
    { type: 'traitRerolled', name: '矿工阿岩', trait: '坚毅' },
    { type: 'bannerUpgraded', level: 2 },
    { type: 'codexMilestone', pct: 0.5, gold: 500 },
    { type: 'seasonLevelUp', level: 4 },
    { type: 'seasonRotated', index: 2 },
    { type: 'abyssCleared', floor: 12, crystals: 34 },
    { type: 'abyssSwept', crystals: 2 },
    { type: 'abyssItemBought', name: '永久增幅' },
    { type: 'tutorialGoalMet', step: 3 },
    { type: 'tutorialRewarded', step: 3 },
    { type: 'achievementUnlocked', id: 'a1', name: '初次采矿' },
    { type: 'taskCompleted', title: '采 100 铜矿' },
    { type: 'tasksRotated', period: 'daily' },
    { type: 'crateOpened', text: '获得：铜锭 ×3' },
    { type: 'buffActivated', name: '迅捷符文', until: Date.now() + 60000 },
    { type: 'prestigeDone', points: 5 },
    { type: 'perkChanged', perkId: 'p_speed' },
    { type: 'loadoutApplied', name: '挖矿' },
    { type: 'goldGained', amount: 100 },
    { type: 'settingsChanged', settings: { sound: true, volume: 60, fx: 'auto' } },
    { type: 'notice', text: '消耗了高词缀装备' },
    { type: 'blocked', reason: '缺少材料' },
  ]

  it('样本覆盖全部事件类型（防漏登记）', () => {
    const types = new Set(SAMPLES.map((e) => e.type))
    expect(types.size).toBe(SAMPLES.length)
    // 事件总数与 types.ts 一致（35 = 34 − 3 个误入的 Command + settingsChanged）
    expect(types.size).toBe(35)
  })

  it('每个事件都能解析且不抛错；无表现者显式返回 null', () => {
    const noFx: string[] = []
    for (const ev of SAMPLES) {
      const plan = resolveFx(ev, ctx)
      if (plan === null) noFx.push(ev.type)
      else expect(typeof plan).toBe('object')
    }
    // 显式无表现的事件（设计 §2.2）：设置变更/通知/轮换/停止 不产生表现
    expect(noFx.sort()).toEqual(['actionStopped', 'notice', 'seasonRotated', 'settingsChanged', 'tasksRotated'].sort())
  })

  it('所有 cue 名都在内容表内', () => {
    const ids = new Set(CONTENT.fx.cues.map((c) => c.id))
    for (const ev of SAMPLES) {
      const plan = resolveFx(ev, ctx)
      if (plan?.cue) expect(ids.has(plan.cue), `${ev.type} -> ${plan.cue}`).toBe(true)
    }
  })
})

// ---------------- F2 分支规则 ----------------

describe('F2 分支规则（评审 B2）', () => {
  it('enhanceResult 三分支 cue/burst 各不相同', () => {
    const ok = resolveFx({ type: 'enhanceResult', instanceId: 1, from: 3, to: 4, success: true }, ctx)
    const fail = resolveFx({ type: 'enhanceResult', instanceId: 1, from: 3, to: 2, success: false }, ctx)
    const guard = resolveFx({ type: 'enhanceResult', instanceId: 1, from: 3, to: 3, success: false, guarded: true }, ctx)
    expect(ok?.cue).toBe('enhanceSuccess')
    expect(fail?.cue).toBe('enhanceFail')
    expect(guard?.cue).toBe('enhanceGuarded')
    expect(new Set([ok?.cue, fail?.cue, guard?.cue]).size).toBe(3)
    expect(new Set([ok?.burst, fail?.burst, guard?.burst]).size).toBe(3)
  })

  it('goldGained：支出走 purchase 音、收入只飘字', () => {
    const spend = resolveFx({ type: 'goldGained', amount: -250 }, ctx)
    const gain = resolveFx({ type: 'goldGained', amount: 250 }, ctx)
    expect(spend?.cue).toBe('purchase')
    expect(spend?.popup).toBeUndefined()
    expect(gain?.cue).toBeUndefined()
    expect(gain?.popup).toEqual({ text: '+250 金', kind: 'gold' })
  })

  it('crateOpened：大奖 → lootBig，普通 → crateOpen', () => {
    expect(resolveFx({ type: 'crateOpened', text: '🎉 大奖：遗物碎片 ×1' }, ctx)?.cue).toBe('lootBig')
    expect(resolveFx({ type: 'crateOpened', text: '获得：煤 ×5' }, ctx)?.cue).toBe('crateOpen')
  })
})

// ---------------- F3 稀有判定 ----------------

describe('F3 稀有判定（itemsGained）', () => {
  it('含稀有类别 → rareDrop + gold 爆发 + 飘字', () => {
    const plan = resolveFx({ type: 'itemsGained', items: [{ itemId: 'essence', qty: 1 }] }, ctx)
    expect(plan?.cue).toBe('rareDrop')
    expect(plan?.burst).toBe('gold')
    expect(plan?.popup?.kind).toBe('item')
  })

  it('重铸石/远征令牌/遗物碎片同样算稀有', () => {
    for (const id of ['emberstone', 'expedition_token', 'relic_shard', 'crate']) {
      expect(resolveFx({ type: 'itemsGained', items: [{ itemId: id, qty: 1 }] }, ctx)?.cue, id).toBe('rareDrop')
    }
  })

  it('普通材料 → 只飘字，不发声不爆发（防噪音）', () => {
    const plan = resolveFx({ type: 'itemsGained', items: [{ itemId: 'ore_copper', qty: 8 }] }, ctx)
    expect(plan?.cue).toBeUndefined()
    expect(plan?.burst).toBeUndefined()
    expect(plan?.popup?.text).toContain('铜')
  })

  it('混合批次只要含 1 件稀有即按稀有播报', () => {
    const plan = resolveFx(
      { type: 'itemsGained', items: [{ itemId: 'ore_copper', qty: 3 }, { itemId: 'essence', qty: 1 }] },
      ctx,
    )
    expect(plan?.cue).toBe('rareDrop')
  })
})

// ---------------- 假 AudioContext（F4/F5/F6 共用） ----------------

interface FakeCtx {
  state: 'suspended' | 'running'
  currentTime: number
  sampleRate: number
  destination: unknown
  nodes: number
  created: number
  resume: () => Promise<void>
  createGain: () => unknown
  createOscillator: () => unknown
  createBuffer: (ch: number, len: number, rate: number) => unknown
  createBufferSource: () => unknown
  createBiquadFilter: () => unknown
}

function makeFakeCtx(opts: { failResume?: boolean } = {}) {
  const created = { count: 0 }
  const gain = (): unknown => {
    created.count += 1
    return {
      gain: {
        value: 0,
        setValueAtTime: () => undefined,
        linearRampToValueAtTime: () => undefined,
        exponentialRampToValueAtTime: () => undefined,
      },
      connect: () => undefined,
    }
  }
  const src = (): unknown => {
    created.count += 1
    return { connect: () => undefined, start: () => undefined, stop: () => undefined, buffer: null, loop: false, frequency: { value: 0 } }
  }
  const Ctor = function FakeAudioContext(this: FakeCtx) {
    this.state = 'suspended'
    this.currentTime = 0
    this.sampleRate = 48000
    this.destination = {}
    this.nodes = 0
    this.created = 0
    this.resume = () => {
      if (opts.failResume) return Promise.reject(new Error('blocked by policy'))
      this.state = 'running'
      return Promise.resolve()
    }
    this.createGain = gain
    this.createOscillator = src
    this.createBuffer = (_ch: number, len: number, _rate: number) => {
      created.count += 1
      return { getChannelData: () => new Float32Array(len) }
    }
    this.createBufferSource = src
    this.createBiquadFilter = () => {
      created.count += 1
      return { type: 'lowpass', frequency: { value: 0 }, connect: () => undefined }
    }
  }
  return { Ctor, created }
}

// ---------------- F4 并发上限 ----------------

describe('F4 并发上限（设计 §2.2 爆音防护）', () => {
  it('连发 20 次：实际发声数 ≤ maxConcurrentVoices，其余返回 false', async () => {
    const { Ctor } = makeFakeCtx()
    setAudioContextFactory(Ctor as unknown as new () => AudioContext)
    expect(unlockAudio()).toBe(true)
    await Promise.resolve()
    let ok = 0
    for (let i = 0; i < 20; i++) if (playCue('levelUp')) ok += 1
    expect(ok).toBe(CONTENT.fx.budget.maxConcurrentVoices)
    expect(ok).toBeLessThan(20)
    expect(audioStatus().active).toBe(CONTENT.fx.budget.maxConcurrentVoices)
  })

  it('计时器到期后释放额度（时长+20ms）', async () => {
    vi.useFakeTimers()
    const { Ctor } = makeFakeCtx()
    setAudioContextFactory(Ctor as unknown as new () => AudioContext)
    unlockAudio()
    await Promise.resolve()
    for (let i = 0; i < CONTENT.fx.budget.maxConcurrentVoices; i++) playCue('actionStart')
    expect(playCue('actionStart')).toBe(false)
    vi.advanceTimersByTime(CONTENT.fx.cues.find((c) => c.id === 'actionStart')!.durationMs + 30)
    expect(audioStatus().active).toBe(0)
    expect(playCue('actionStart')).toBe(true)
  })
})

// ---------------- F5 自动播放门槛 ----------------

describe('F5 自动播放门槛（R1 的 node 侧对应）', () => {
  it('未解锁（无 ctx）→ playCue === false，且不抛错', () => {
    setAudioContextFactory(null)
    expect(audioStatus().ready).toBe(false)
    expect(playCue('levelUp')).toBe(false)
  })

  it('注入假 ctx 后 unlock → ready 且能发声', async () => {
    const { Ctor } = makeFakeCtx()
    setAudioContextFactory(Ctor as unknown as new () => AudioContext)
    expect(unlockAudio()).toBe(true)
    // resume 是异步的；等一个微任务后 state 变 running
    await Promise.resolve()
    expect(audioStatus().ready).toBe(true)
    expect(playCue('levelUp')).toBe(true)
    expect(audioStatus().active).toBe(1)
  })

  it('resume 被策略拒绝 → 不抛错、ready 保持 false（下次手势重试）', async () => {
    const { Ctor } = makeFakeCtx({ failResume: true })
    setAudioContextFactory(Ctor as unknown as new () => AudioContext)
    unlockAudio()
    await Promise.resolve()
    await Promise.resolve()
    expect(audioStatus().ready).toBe(false)
    expect(playCue('levelUp')).toBe(false)
  })

  it('未知 cue id → false（不静默播错音）', async () => {
    const { Ctor } = makeFakeCtx()
    setAudioContextFactory(Ctor as unknown as new () => AudioContext)
    unlockAudio()
    await Promise.resolve()
    expect(playCue('no_such_cue')).toBe(false)
  })
})

// ---------------- F6 音量与开关 ----------------

describe('F6 音量/开关短路', () => {
  it('sound=false → 不创建节点且返回 false', async () => {
    const { Ctor, created } = makeFakeCtx()
    setAudioContextFactory(Ctor as unknown as new () => AudioContext)
    unlockAudio()
    await Promise.resolve()
    const before = created.count
    setAudioEnabled(false)
    expect(playCue('levelUp')).toBe(false)
    expect(created.count).toBe(before)
    expect(unlockAudio()).toBe(false)
  })

  it('volume=0 → 返回 false', async () => {
    const { Ctor } = makeFakeCtx()
    setAudioContextFactory(Ctor as unknown as new () => AudioContext)
    unlockAudio()
    await Promise.resolve()
    setAudioVolume(0)
    expect(playCue('levelUp')).toBe(false)
    setAudioVolume(60)
    expect(playCue('levelUp')).toBe(true)
  })

  it('音量夹紧到 0~100', () => {
    setAudioVolume(-50)
    expect(audioStatus().volume).toBe(0)
    setAudioVolume(9999)
    expect(audioStatus().volume).toBe(1)
  })

  it('cueList 与内容表一致（16 条）', () => {
    expect(cueList().length).toBe(CONTENT.fx.cues.length)
    expect(cueList().length).toBeGreaterThanOrEqual(16)
  })
})

// ---------------- F7 设置解析（含 applyCommand） ----------------

describe('F7 设置命令与档位解析', () => {
  it('setSettings 写入并发出 settingsChanged；非法值被夹紧而非拒绝', () => {
    const s = newGame('测试', 0)
    const evs = applyCommand(s, { type: 'setSettings', patch: { volume: 999, sound: false } }, 0)
    expect(evs.length).toBe(1)
    expect(evs[0].type).toBe('settingsChanged')
    expect(s.meta.settings?.volume).toBe(100)
    expect(s.meta.settings?.sound).toBe(false)

    applyCommand(s, { type: 'setSettings', patch: { volume: -5 } }, 0)
    expect(s.meta.settings?.volume).toBe(0)

    applyCommand(s, { type: 'setSettings', patch: { fx: 'nonsense' as never } }, 0)
    expect(s.meta.settings?.fx).toBe('auto')
  })

  it('四档都能写入（auto/full/reduced/off）', () => {
    const s = newGame('测试', 0)
    for (const fx of ['auto', 'full', 'reduced', 'off'] as const) {
      applyCommand(s, { type: 'setSettings', patch: { fx } }, 0)
      expect(s.meta.settings?.fx).toBe(fx)
    }
  })

  it('settingsChanged 事件本身不产生表现（关音效时不应响一声）', () => {
    const plan = resolveFx({ type: 'settingsChanged', settings: { sound: true, volume: 60, fx: 'off' } }, ctx)
    expect(plan).toBeNull()
  })

  it('resolveFxLevel：显式档位原样返回；auto/缺省按系统偏好解析', () => {
    expect(resolveFxLevel('off')).toBe('off')
    expect(resolveFxLevel('reduced')).toBe('reduced')
    expect(resolveFxLevel('full')).toBe('full')
    // node 无 matchMedia：auto 与 undefined 都退化为 full
    expect(resolveFxLevel('auto')).toBe('full')
    expect(resolveFxLevel(undefined)).toBe('full')
  })

  it('resolveFxLevel：auto + prefers-reduced-motion:reduce → reduced（用户显式档位仍优先）', () => {
    const g = globalThis as unknown as { matchMedia?: (q: string) => { matches: boolean } }
    const saved = g.matchMedia
    g.matchMedia = (q: string) => ({ matches: q.includes('prefers-reduced-motion') })
    try {
      expect(resolveFxLevel('auto')).toBe('reduced')
      expect(resolveFxLevel(undefined)).toBe('reduced')
      // 显式 full 是玩家的明确选择，不被系统偏好覆盖
      expect(resolveFxLevel('full')).toBe('full')
      expect(resolveFxLevel('off')).toBe('off')
    } finally {
      if (saved === undefined) delete g.matchMedia
      else g.matchMedia = saved
    }
  })

  it('resolveFxLevel：matchMedia 抛错时按 full 兜底（不崩界面）', () => {
    const g = globalThis as unknown as { matchMedia?: (q: string) => { matches: boolean } }
    const saved = g.matchMedia
    g.matchMedia = () => {
      throw new Error('blocked')
    }
    try {
      expect(resolveFxLevel('auto')).toBe('full')
    } finally {
      if (saved === undefined) delete g.matchMedia
      else g.matchMedia = saved
    }
  })
})

// ---------------- F8 存档 v12 迁移 ----------------

describe('F8 存档 v12：设置字段迁移与幂等', () => {
  it('SAVE_VERSION === 12', () => {
    expect(SAVE_VERSION).toBe(12)
  })

  it('新档自带默认设置', () => {
    const s = newGame('测试', 0)
    expect(s.meta.settings).toEqual(CONTENT.fx.defaults)
  })

  it('v11 旧档（无 settings）迁移 → 补默认值且保留其它字段', () => {
    const s = newGame('测试', 0)
    const raw = JSON.parse(JSON.stringify(s)) as Record<string, unknown>
    raw.version = 11
    const meta = raw.meta as Record<string, unknown>
    delete meta.settings
    const back = deserializeSave(JSON.stringify(raw))
    expect(back).not.toBeNull()
    expect(back!.version).toBe(12)
    expect(back!.meta.settings).toEqual(CONTENT.fx.defaults)
    expect(back!.gold).toBe(s.gold)
  })

  it('当前版本存档往返：设置原样保留', () => {
    const s = newGame('测试', 0)
    s.meta.settings = { sound: false, volume: 25, fx: 'reduced' }
    const back = deserializeSave(JSON.stringify(s))
    expect(back!.meta.settings).toEqual({ sound: false, volume: 25, fx: 'reduced' })
  })

  it('迁移幂等：连续两次反序列化设置一致', () => {
    const s = newGame('测试', 0)
    const once = deserializeSave(JSON.stringify(s))!
    const twice = deserializeSave(JSON.stringify(once))!
    expect(twice.meta.settings).toEqual(once.meta.settings)
  })

  it('非法档位回落 auto；越界音量夹紧', () => {
    const raw = JSON.parse(JSON.stringify(newGame('测试', 0))) as Record<string, unknown>
    ;(raw.meta as Record<string, unknown>).settings = { sound: true, volume: 500, fx: 'bogus' }
    const back = deserializeSave(JSON.stringify(raw))
    expect(back).not.toBeNull()
    expect(back!.meta.settings?.fx).toBe('auto')
    expect(back!.meta.settings?.volume).toBe(100)
  })

  it('高于当前版本的存档被拒绝（旧客户端不破坏新档）', () => {
    const raw = JSON.parse(JSON.stringify(newGame('测试', 0))) as Record<string, unknown>
    raw.version = SAVE_VERSION + 1
    expect(deserializeSave(JSON.stringify(raw))).toBeNull()
  })

  it('sanitizeSettings：缺字段补默认、非法类型不崩', () => {
    expect(sanitizeSettings(undefined)).toEqual(CONTENT.fx.defaults)
    expect(sanitizeSettings({ sound: 'yes', volume: 'loud', fx: 7 })).toEqual(CONTENT.fx.defaults)
    expect(sanitizeSettings({ sound: false, volume: -3, fx: 'full' })).toEqual({ sound: false, volume: 0, fx: 'full' })
  })

  it('损坏 JSON / 结构不符 → null（不抛错）', () => {
    expect(deserializeSave('{not json')).toBeNull()
    expect(deserializeSave('{"version":12}')).toBeNull()
    expect(deserializeSave('[]')).toBeNull()
  })
})

// ---------------- F10 预算常量 = 脚本输出 ----------------

describe('F10 文档数字 = 脚本输出（audit-fx-output.json）', () => {
  const audit = auditOutput as {
    E1: { count: number; ids: string[]; pass: boolean }
    E2: { gameEventCount: number }
    E3: { usedCues: string[]; unusedCues: string[]; unknown: string[]; pass: boolean }
    E4: { budget: Record<string, number>; pass: boolean }
    E5: { media: string[]; pass: boolean }
    E6: { defaults: { sound: boolean; volume: number; fx: string }; fxLevels: string[]; pass: boolean }
    fails: string[]
  }

  it('审计脚本无失败项', () => {
    expect(audit.fails).toEqual([])
    expect(audit.E1.pass && audit.E3.pass && audit.E4.pass && audit.E5.pass && audit.E6.pass).toBe(true)
  })

  it('E1/E3：cue 清单与引用一致，无未定义、无未引用', () => {
    expect(audit.E1.count).toBe(CONTENT.fx.cues.length)
    expect(audit.E1.ids.sort()).toEqual(CONTENT.fx.cues.map((c) => c.id).sort())
    expect(audit.E3.unknown).toEqual([])
    expect(audit.E3.unusedCues).toEqual([])
  })

  it('E4：7 项预算与内容表逐项相等', () => {
    for (const k of ['maxParticles', 'maxBurstParticles', 'maxBurstsPerSecond', 'maxPopups', 'frameBudgetMs', 'loopBudgetMs', 'maxConcurrentVoices']) {
      expect(audit.E4.budget[k], k).toBe((CONTENT.fx.budget as unknown as Record<string, number>)[k])
    }
  })

  it('E6：默认设置与内容表一致', () => {
    expect(audit.E6.defaults).toEqual(CONTENT.fx.defaults)
    expect(audit.E6.fxLevels.sort()).toEqual([...CONTENT.fx.fxLevels].sort())
  })
})

// ---------------- F11 类型卫生 ----------------

describe('F11 GameEvent 不含 Command 成员（防 v2.4 类型债复发）', () => {
  const src = typesSrc
  const evBlock = src.slice(src.indexOf('export type GameEvent ='), src.indexOf('// ---------- 离线结算摘要'))
  const cmdBlock = src.slice(src.indexOf('export type Command ='), src.indexOf('// ---------- 事件'))

  it('三个 v2.4 误入的 Command 已从事件联合移除', () => {
    for (const name of ['challengeAbyss', 'sweepAbyss', 'buyAbyssItem']) {
      expect(cmdBlock.includes(`{ type: '${name}'`), `Command 应含 ${name}`).toBe(true)
      expect(evBlock.includes(`{ type: '${name}'`), `GameEvent 不应含 ${name}`).toBe(false)
    }
  })

  it('事件总数与 F1 样本一致（35）', () => {
    const types = [...evBlock.matchAll(/^\s*\| \{ type: '([A-Za-z]+)'/gm)].map((m) => m[1])
    expect(new Set(types).size).toBe(types.length)
    expect(types.length).toBe(35)
  })
})

// ---------------- 探针与总线（R2~R4 的 node 侧单元） ----------------

describe('探针与场景总线（烟测读数的单元保障）', () => {
  it('recordDraw/recordTick 只保留窗口样本并给出 P95', () => {
    for (let i = 1; i <= 200; i++) recordDraw(i / 100)
    const snap = fxSnapshot()
    expect(snap.draw.samples).toBeLessThanOrEqual(180)
    expect(snap.draw.p95).toBeGreaterThan(0)
    expect(snap.draw.budget).toBe(CONTENT.fx.budget.frameBudgetMs)
  })

  it('requestBurst 受 maxBurstsPerSecond 限制', () => {
    let ok = 0
    for (let i = 0; i < 20; i++) if (requestBurst()) ok += 1
    expect(ok).toBe(CONTENT.fx.budget.maxBurstsPerSecond)
    expect(fxSnapshot().bursts).toBe(CONTENT.fx.budget.maxBurstsPerSecond)
  })

  it('noteCue/setLiveCounts 写入快照（烟测读 particles/popups）', () => {
    noteCue('levelUp')
    setLiveCounts(12, 3)
    const snap = fxSnapshot()
    expect(snap.lastCue).toBe('levelUp')
    expect(snap.cues).toBe(1)
    expect(snap.particles).toBe(12)
    expect(snap.popups).toBe(3)
  })

  it('场景总线：未订阅时短队列缓存，订阅后补放', () => {
    emitScene({ kind: 'burst', burst: 'gold' })
    emitScene({ kind: 'popup', text: '+5 铜矿', popupKind: 'item' })
    const got: string[] = []
    const off = subscribeScene((c) => got.push(c.kind))
    expect(got).toEqual(['burst', 'popup'])
    emitScene({ kind: 'ring', ring: true })
    expect(got).toEqual(['burst', 'popup', 'ring'])
    off()
    emitScene({ kind: 'ring', ring: true })
    expect(got).toEqual(['burst', 'popup', 'ring'])
  })

  it('场景总线：队列上限 8（离线开场不积压）', () => {
    for (let i = 0; i < 20; i++) emitScene({ kind: 'ring', ring: true })
    let n = 0
    subscribeScene(() => {
      n += 1
    })
    expect(n).toBe(8)
  })
})

// ---------------- F9 关键事件必有 toast 出口 ----------------

describe('F9 关键事件均有 toast 出口（信息不依赖动效）', () => {
  it('关键事件在 store.handleEvents 中都有文案分支', () => {
    // 与设计 §2.5 一致：这些是"必须不丢"的信息
    const mustToast = [
      'levelUp',
      'achievementUnlocked',
      'taskCompleted',
      'crateOpened',
      'enhanceResult',
      'abyssCleared',
      'blocked',
      'prestigeDone',
    ]
    for (const name of mustToast) {
      expect(storeSrc.includes(`case '${name}':`), `${name} 缺少 toast 分支`).toBe(true)
    }
  })

  it('动效档位不影响 toast（off 档仍推 toast）', () => {
    // dispatchFx 只在 level!=='off' 时播表现；toast 分支在其外层循环，与档位无关
    expect(storeSrc.includes("if (level !== 'off')")).toBe(true)
    const toastLoopIdx = storeSrc.indexOf('function handleEvents')
    const fxIdx = storeSrc.indexOf("if (level !== 'off')")
    expect(fxIdx).toBeGreaterThan(-1)
    expect(toastLoopIdx).toBeGreaterThan(fxIdx)
  })
})
