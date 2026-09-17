// ============================================================
// 存档编解码（v3.8.0）：压缩 + 加密 + 剪贴板文本通道
// 需求（用户）：导出导入此前是明文且只能走文件；移动端环境常无法下载/上传。
// 覆盖：往返 / 压缩生效 / 篡改检测 / 旧明文兼容 / 降级（无 CompressionStream）/ 大存档
// ============================================================
import { describe, expect, it } from 'vitest'
import { decodeSaveText, encodeSaveText, isEncodedSave, parseSaveText } from '../src/app/save-codec'
import { newGame } from '../src/game/state'

describe('存档编解码（压缩 + 加密 + 文本通道）', () => {
  it('往返：json → FGS1 → json（含中文与 emoji）', async () => {
    const json = JSON.stringify({ name: '锻造师·李', emoji: '🔥⚒️', n: 42, nested: { a: [1, 2, 3] } })
    const enc = await encodeSaveText(json)
    expect(isEncodedSave(enc), '应以 FGS1: 开头').toBe(true)
    expect(await decodeSaveText(enc)).toBe(json)
  })

  it('压缩生效：真实存档编码后明显变小', async () => {
    const s = newGame('测试', 0)
    const json = JSON.stringify(s)
    const enc = await encodeSaveText(json)
    expect(enc.length, `编码 ${enc.length} 字符 vs 原文 ${json.length} 字符`).toBeLessThan(json.length)
  })

  it('篡改检测：改一个字符 → 解密失败（AES-GCM 认证标签）', async () => {
    const enc = await encodeSaveText(JSON.stringify({ a: 1 }))
    const mid = Math.floor(enc.length / 2)
    const ch = enc[mid] === 'A' ? 'B' : 'A'
    const tampered = enc.slice(0, mid) + ch + enc.slice(mid + 1)
    await expect(decodeSaveText(tampered)).rejects.toThrow(/篡改|损坏/)
  })

  it('兼容旧明文 JSON（老导出的文件不作废）', async () => {
    const json = JSON.stringify({ version: 15, gold: 1 })
    expect(await parseSaveText('  ' + json)).toBe(json)
  })

  it('无法识别的输入给出可读错误（UI 直接展示）', async () => {
    await expect(parseSaveText('hello world')).rejects.toThrow(/无法识别/)
    await expect(parseSaveText('')).rejects.toThrow(/为空/)
    await expect(parseSaveText('FGS1:not-base64!!')).rejects.toThrow(/base64|解密|过短/)
  })

  it('无 CompressionStream 环境：降级为"只加密不压缩"，仍能往返', async () => {
    const origC = globalThis.CompressionStream
    // @ts-expect-error 有意的降级路径测试
    delete globalThis.CompressionStream
    try {
      const json = JSON.stringify({ x: 'y'.repeat(200), 中文: true })
      const enc = await encodeSaveText(json)
      expect(await decodeSaveText(enc), '降级路径也能读回').toBe(json)
    } finally {
      globalThis.CompressionStream = origC
    }
  })

  it('大存档（>64KB）分块 base64 不爆栈', async () => {
    const big = JSON.stringify({ data: Array.from({ length: 6000 }, (_, i) => `item-${i}`) })
    expect(big.length).toBeGreaterThan(64_000)
    const enc = await encodeSaveText(big)
    expect(await decodeSaveText(enc)).toBe(big)
  })

  it('完整链路：newGame → 编码 → 解析 → 迁移链可接受（deserializeSave）', async () => {
    const { deserializeSave } = await import('../src/app/persist')
    const s = newGame('导入测试', 0)
    s.gold = 12345
    const enc = await encodeSaveText(JSON.stringify(s))
    const back = deserializeSave(await parseSaveText(enc))
    expect(back, '加密导出应能被现有迁移链接收').not.toBeNull()
    expect(back!.gold, '字段无损').toBe(12345)
    expect(back!.character.name).toBe('导入测试')
  })
})
