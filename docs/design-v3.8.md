# v3.8.0 设计定稿 · 存档的压缩与加密（FGS1）+ 剪贴板导入导出

> 起因（用户原话）：「存档目前导入导出是明文，而且只能导入导出文件；我需要你做一个方案，
> 加密和压缩存档，可以支持剪贴板导出和粘贴导入（因为有些移动端环境不允许调用下载或者上传），
> 也支持文件导出和文件导入。」
> 定位：**存档通道**专项。不改玩法、不改存档结构（`SAVE_VERSION` 仍为 15，无迁移）。

---

## 一、目标 / 非目标

**目标**

1. 导出物**压缩 + 加密**：不再是可读明文 JSON，体积更小，且能被校验篡改。
2. 导入导出支持**三条通道**：文件、剪贴板、粘贴框（后者覆盖"移动端不能下载/上传文件"的场景）。
3. **旧档不作废**：历史明文 JSON 导出文件仍可导入。

**非目标（明确写在界面与本文档里）**

- **不做对抗性安全**：这是单机游戏，存档就在玩家自己的浏览器里，密钥必须内置在客户端。
  任何人拿到 `FGS1` 串都能解开（读源码即得密钥）。这里要的是「防明文」+「防手滑改坏」+「防误读」。
  因此界面文案直说：*加密用于防明文与防误改，不是对抗性安全（密钥内置）*。
- 不做云同步、不做密码保护（密码会引入"忘记密码 = 丢档"的新失败模式）。

---

## 二、格式规范

```
导出文本 = "FGS1:" + base64( iv(12B) ‖ AES-GCM( flags(1B) ‖ payload ) )

flags  bit0 = 1 → payload = gzip( UTF-8 JSON )
       bit0 = 0 → payload = UTF-8 JSON（无 CompressionStream 时的降级路径）
```

- **密钥**：`TextEncoder('forging-save-key-v1-' + 24个0)`，AES-GCM 256；固定值，随源码可见（见非目标）。
- **IV**：每次导出由 `crypto.getRandomValues` 生成 12 字节 —— 同一天导出两次得到的串不同
  （不泄露"两次导出是同一档"）。GCM 认证标签即**篡改检测**：改一个字符 → 解密即失败。
- **base64**：分块（0x8000）拼接，避免大档 `String.fromCharCode(...arr)` 爆栈。
- **降级**：`typeof CompressionStream !== 'function'`（老 Safari/受限 WebView）→ 不压缩照常工作；
  解码端按 flags 决定是否 inflate，因此**跨设备互导不受两端能力差异影响**。
- **导入判定**：以 `FGS1:` 前缀区分编码档与旧版明文（明文档以 `{` 开头）。
- **拒绝规则**（与既有 `deserializeSave` 一致）：解密失败 / JSON 非法 / 结构不符 / 版本高于当前 → 返回 null，
  界面给一句可执行的提示（"检查是否完整复制"）。

体积实测：3053 字符的明文存档 → 2153 字符的 `FGS1` 串（约 −30%；JSON 冗余越高收益越大）。

---

## 三、通道矩阵与界面

| 通道 | 入口 | 实现 | 适用 |
|---|---|---|---|
| 文件 | 「导出文件」/「导入文件」 | `exportSave` → `forging-save-YYYYMMDD.fgs.txt`（`text/plain`） | 桌面、可下载/选文件的环境 |
| 剪贴板 | 「复制到剪贴板」/「从剪贴板读取」 | `navigator.clipboard.writeText/readText` | 手机、受限 WebView（无文件上传/下载 API） |
| 粘贴框 | `textarea` + 「从文本导入」 | 与上两者**共用同一份 `exportSaveText/importSaveText`** | 所有环境的兜底；可人工核对 |

- 导出文件名**不再用 `.json`**（避免玩家以为还是明文）；`accept` 放开为 `text/plain,application/json,.txt,.json`。
- 剪贴板读取失败（未授权/非安全上下文）→ 提示改用手动粘贴，而不是静默失败。
- 导入前 `confirm` 二次确认；导入成功后立即 `saveGame(next)` 再 `reload()`（新档已落盘，重载即生效）。
- 窄屏下粘贴框字号 ≥16px（防 iOS 聚焦放大），并允许纵向拉伸。

---

## 四、顺带修掉的缺陷：「清档重来」静默失效

**实机发现（本版最重要的副产物）**：点「清档重来」后进度原封不动。根因是一条只在浏览器里成立的时序：

```
onClear() { clearSave(); location.reload() }
                     ↑ 清掉两槽        ↑ reload → beforeunload → saveNow() → 把内存旧档写回刚清空的槽
```

修法：`store.suppressAutosave()` 置位后 `saveNow()` 直接返回；清档路径先置位再清槽再重载。
**回归用例**（`tests/components/save-channels.test.ts`）：清档后调用一次会写盘的 `cmd()`，断言两槽仍为空；
并写了**反证探针**——把 `suppressAutosave()` 那行注释掉，用例立刻变红（已实测）。
基线用例（未抑制时 `cmd()` 确实写盘）排在最前，防止"断言恒真"。

---

## 五、实现清单

| 文件 | 内容 |
|---|---|
| `src/app/save-codec.ts`（新） | `encodeSaveText` / `decodeSaveText` / `parseSaveText` / `isEncodedSave` |
| `src/app/persist.ts` | `exportSaveText`（给剪贴板复用）/ `importSaveText` / `exportSave`（异步、`.fgs.txt`）/ `importSaveFile` |
| `src/app/store.ts` | `exportCurrent` 改异步（编码是异步任务）；新增 `suppressAutosave()` |
| `src/ui/components/SettingsPanel.vue` | 存档区：格式说明 + 四个按钮 + 粘贴框（含从剪贴板读取/从文本导入） + 消息行 |
| `tests/save-codec.test.ts`（新，8 例） | 往返（含中文/emoji）、压缩确实变小、篡改检测、旧版明文、不可解、无 CompressionStream 降级、>64KB 分块、与 `deserializeSave` 全链 |
| `tests/components/save-channels.test.ts`（新，6 例） | 清档抑制（基线 + 回归）、剪贴板导出、剪贴板读入、文本导入写盘、空文本禁用、无效文本不改档 |

工具链：`vitest.config.ts` 补 `__APP_VERSION__`（组件引用构建期常量，缺它挂载即 ReferenceError）；
`tests/setup/jsdom-polyfills.ts` 补 webcrypto（**jsdom 的 `crypto` 没有 SubtleCrypto**，AES-GCM 无法运行）。

---

## 六、验收证据（实机，`localhost:5174`）

> 纪律：动手前把玩家存档两个槽的原始字节备份到项目外文件；测试完毕**按字节还原**。

| # | 动作 | 证据 |
|---|---|---|
| 1 | 「复制到剪贴板」 | 提示 `已复制加密存档到剪贴板（2153 字符）`；明文槽为 3053 字符 → 压缩生效 |
| 2 | 「从剪贴板读取」 | 粘贴框得到 2153 字符，前缀 `FGS1:`（写入与读回闭环） |
| 3 | **跨实现交叉验证** | 用 Node 的 `node:crypto` **独立重写**解码器解回 JSON：`gold 36350 / name 矿工 / version 15`，字段一致 |
| 4 | 粘贴框「从文本导入」 | 清档后导入原串 → 角色还原（`createdAt 1789466922239`、金币 36350、矿石数一致） |
| 5 | 「导出文件」 | 触发真实下载事件，文件名 `forging-save-20260917.fgs.txt`，提示文案正确 |
| 6 | 「清档重来」 | 修复前：金币/矿石原样（缺陷复现）；修复后：金币 36350 → 0、经验 0、新 `createdAt` |
| 7 | 收尾 | 原始字节还原两槽，应用正常启动并做常规离线结算（进度不回退） |

---

## 七、后续候选（不在本版范围）

- 导出文件名可带角色名（多档玩家友好）；
- 「导入后自动留一份旧档备份」的后悔药（当前依赖玩家自己先导出）；
- 存档体积预算与压缩率纳入 `toolchain` 门禁（当前只在文档里记录实测值）。
