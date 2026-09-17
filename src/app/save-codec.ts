// ============================================================
// Forging · 存档编解码（v3.8.0）
//
// 需求（用户）：导出导入此前是明文 JSON 且只能走文件；移动端环境常无法下载/上传文件。
// 本模块提供：**压缩 + 加密**的文本格式 + 剪贴板通道的底层编解码。
//
// 格式：`FGS1:<base64>`；payload = iv(12B) || AES-GCM( flags(1B) || [gzip](utf8(json)) )
//   · 加密：Web Crypto AES-GCM（**固定密钥**，纯前端零依赖）。目的是"不是明文、不可手改"，
//     **不是对抗性安全**（代码公开 → 密钥公开，如实标注；AES-GCM 的认证标签顺带提供
//     完整性校验：改动一个字符即解密失败 → 导入端能明确报"被篡改或损坏"）
//   · 压缩：CompressionStream/DecompressionStream('gzip')（浏览器内置）；环境不支持时
//     flags 置 0 跳过压缩，导入端按 flags 处理 → 双向兼容
//   · 兼容：导入侧仍接受**旧版明文 JSON**（以 `{` 开头）——老导出的文件不作废
// ============================================================

/** 固定密钥材料（32 字节 = AES-256；见文件头"非对抗性安全"说明） */
const KEY_MATERIAL = new TextEncoder().encode('forging-save-key-v1-000000000000')
const PREFIX = 'FGS1:'
const FLAG_GZIP = 1
const IV_BYTES = 12

let keyPromise: Promise<CryptoKey> | null = null
function getKey(): Promise<CryptoKey> {
  keyPromise ??= crypto.subtle.importKey('raw', KEY_MATERIAL, 'AES-GCM', false, ['encrypt', 'decrypt'])
  return keyPromise
}

/** 归一到 ArrayBuffer 背书的视图（TS 5.7 起 Web Crypto/Streams 要求 Uint8Array<ArrayBuffer>） */
function toAB(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(bytes.length)
  out.set(bytes)
  return out
}

/** 分块 base64（大存档下 String.fromCharCode(...bytes) 会爆栈） */
function toB64(bytes: Uint8Array): string {
  let s = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(s)
}
function fromB64(b64: string): Uint8Array {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

async function gzipBytes(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined') return null
  try {
    const cs = new CompressionStream('gzip')
    const writer = cs.writable.getWriter()
    void writer.write(toAB(bytes))
    void writer.close()
    return new Uint8Array(await new Response(cs.readable).arrayBuffer())
  } catch {
    return null // 压缩失败 = 不压缩（导入端按 flags 处理）
  }
}

async function gunzipBytes(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') throw new Error('当前环境不支持解压（无法读取压缩存档）')
  const ds = new DecompressionStream('gzip')
  const writer = ds.writable.getWriter()
  void writer.write(toAB(bytes))
  void writer.close()
  return new Uint8Array(await new Response(ds.readable).arrayBuffer())
}

/** 是否为本格式的加密存档文本 */
export function isEncodedSave(text: string): boolean {
  return text.trim().startsWith(PREFIX)
}

/** 存档 JSON → `FGS1:...`（压缩 + 加密；无 CompressionStream 时自动跳过压缩） */
export async function encodeSaveText(json: string): Promise<string> {
  const raw = new TextEncoder().encode(json)
  const gz = await gzipBytes(raw)
  const body = new Uint8Array(1 + (gz ? gz.length : raw.length))
  body[0] = gz ? FLAG_GZIP : 0
  body.set(gz ?? raw, 1)

  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await getKey(), body))
  const out = new Uint8Array(IV_BYTES + ct.length)
  out.set(iv, 0)
  out.set(ct, IV_BYTES)
  return PREFIX + toB64(out)
}

/** `FGS1:...` → 存档 JSON；篡改/损坏/格式不符时抛错（AES-GCM 认证失败） */
export async function decodeSaveText(text: string): Promise<string> {
  const t = text.trim()
  if (!isEncodedSave(t)) throw new Error('不是 FGS1 格式的存档')
  let bytes: Uint8Array
  try {
    bytes = fromB64(t.slice(PREFIX.length))
  } catch {
    throw new Error('存档文本不是有效的 base64（可能复制不完整）')
  }
  if (bytes.length <= IV_BYTES) throw new Error('存档数据过短')

  const iv = toAB(bytes.subarray(0, IV_BYTES))
  const ct = bytes.subarray(IV_BYTES)
  let plain: Uint8Array
  try {
    plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await getKey(), toAB(ct)))
  } catch {
    throw new Error('解密失败：存档被篡改或已损坏')
  }
  const flags = plain[0]
  const body = plain.subarray(1)
  const raw = flags & FLAG_GZIP ? await gunzipBytes(body) : body
  return new TextDecoder().decode(raw)
}

/**
 * 解析任意受支持的存档文本 → 存档 JSON。
 * 支持：① `FGS1:` 加密压缩格式；② 旧版明文 JSON（`{` 开头，老导出文件）。
 * 其他输入抛错并给出可读原因（供 UI 直接展示）。
 */
export async function parseSaveText(text: string): Promise<string> {
  const t = text.trim()
  if (!t) throw new Error('存档文本为空')
  if (t.startsWith('{')) return t // 旧版明文
  if (isEncodedSave(t)) return decodeSaveText(t)
  throw new Error('无法识别的存档格式：应为 FGS1: 开头的加密文本，或旧版明文 JSON')
}
