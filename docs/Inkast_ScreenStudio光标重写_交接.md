# Inkast · Screen-Studio 干净光标 — 重写交接(给本地 Code 执行)

> 由 Cowork 会话(2026-06-16)产出。Cowork 端能改 TS、能跑 `tsc`,**但无法在 Linux 沙箱里编译 Swift / 跑 Electron / 真机录屏**。
> 故:**实现按本文,在 Mac 上 build + 真机录一段验证。** 你(Code)是手 + 能 build,负责人是眼睛。

---

## 0. 结论(根因,已定位到代码)

负责人现象:编辑器里光标有**重影**,快速移动时能看到"下面那个不变形状的箭头"。

根因链:
1. `cursor:"never"`(录屏排除系统光标)**只在 `useScreenRecorder.ts` 的 `if (platform === "win32")` 分支设置**(约 L1169–1181)。
2. macOS 走 `else` 分支,用 **`getUserMedia` + `chromeMediaSource`(legacy 桌面采集)**(约 L1182–1218),**该 API 没有 `cursor` 选项 → 系统光标必然被烙进视频本体**。(`FORCE_GET_DISPLAY_MEDIA_ON_MAC = true`,为权限持久化禁用了原生 SCK,见 DECISIONS D10。)
3. 但 `VideoEditor.tsx` 的 `hasEditableCursorRecording` 原本在 mac 也成立 → 编辑器又**叠加一个平滑光标**;而 JS 遥测无光标形状 → 叠加层**恒为默认箭头**(`lib/cursor/nativeCursor.ts` 默认 `arrow`)。
4. = mac 上"真光标(烙进、会变形)"+"叠加箭头(平滑、滞后、不变形)"两个 → 快移时拉开 = **重影**。

**关键:烙进视频的光标,编辑器层抹不掉。要 Screen-Studio 那种干净光标,必须"录屏不带光标 + 自绘平滑光标"。这是录屏采集层的事。**

> 当前仓库状态:已临时把 `hasEditableCursorRecording` 的 `darwin` 去掉(DECISIONS D13)→ mac 不叠加、只显示真光标 → **至少不再双光标**。本次重写做成后,按下文 A-③ 把 `darwin` 加回来。

---

## 1. 路线 A(先做;不碰权限链;可逆)

**思路:mac 也走 `getDisplayMedia` 并请求 `cursor:"never"`,把系统光标排除在视频外;再让编辑器叠加平滑光标(此时它是画面里唯一的光标)。** 留在 D10 的"App 进程内 getDisplayMedia"路径上,**不重新启用原生 helper → 不会引入新的权限弹窗**。

### A-① 录屏采集:mac 切到 getDisplayMedia + cursor:"never"
文件:`src/hooks/useScreenRecorder.ts`(约 L1169)。把 win32 专属的 getDisplayMedia 分支**扩展到 darwin**:

```diff
- if (platform === "win32") {
+ // editable-overlay 模式:用 getDisplayMedia 请求排除系统光标,编辑器再自绘平滑光标。
+ // mac 同样走这条(App 进程内捕获,权限随 D10 持久),靠 cursor:"never" 排除光标。
+ if (platform === "win32" || platform === "darwin") {
     screenMediaStream = await navigator.mediaDevices.getDisplayMedia({
       video: {
         cursor: cursorCaptureMode === "editable-overlay" ? "never" : "always",
         width: { max: TARGET_WIDTH },
         height: { max: TARGET_HEIGHT },
         frameRate: { ideal: TARGET_FRAME_RATE },
       } as MediaTrackConstraints,
       audio: systemAudioEnabled,
     } as DisplayMediaStreamOptions);
   } else {
     // …保留现有 getUserMedia 分支给其它平台(linux 等)…
   }
```

**Code 必须在 mac 上核对的点(我无法验证):**
- mac 的 `getDisplayMedia` 是否经 `electron/main.ts` 的 `setDisplayMediaRequestHandler` **拿到预选源、不弹系统选择器**(win32 已这样;确认 handler 跨平台供源,必要时把 `selectedSource.id` 传过去)。
- 系统音频(`audio: systemAudioEnabled`)在 mac getDisplayMedia 下是否仍正常(win32 OK)。
- 录屏 TCC 权限是否仍走 Inkast 本体(不应新弹窗,因为没启用原生 helper)。

### A-② 真机验收(决定 A 成 / 败)
mac build 后录一小段,进编辑器:
- **视频本体里没有光标**(只剩编辑器叠加的那个) → ✅ **A 成功**:macOS 认 `cursor:"never"`。继续 A-③。
- **视频里仍有一个会变形的真光标**(又变双) → ❌ macOS **不认** `cursor:"never"`(Chromium/SCK 后端未排除)→ A 失败,**回退 A-①,改走路线 B**。

### A-③ 编辑器:把叠加平滑光标在 mac 重新打开(仅 A 成功后)
文件:`src/components/video-editor/VideoEditor.tsx`,`hasEditableCursorRecording`(约 L286)。把 D13 去掉的 `darwin` 加回:

```diff
  recordingCursorCaptureMode === "editable-overlay" &&
- nativePlatform === "win32" &&
+ (nativePlatform === "win32" || nativePlatform === "darwin") &&
  hasNativeCursorRecordingData(cursorRecordingData);
```
(同时删掉 D13 那几行解释注释。)

### A 的已知局限(务必先跟负责人说清)
路线 A 的叠加光标来自 **JS 位置遥测,没有形状/点击数据** → 光标**恒为箭头**(平滑、单个、无重影,但**不随状态变 I 字梁/手型**)。
- 若负责人接受"干净平滑的箭头" → A 即终态。
- 若要**真形状 + 点击高亮**(完整 Screen-Studio) → 需要光标元数据 = 路线 B。

---

## 2. 路线 B(A 不行,或要完整 Screen-Studio 质感)

**用原生 ScreenCaptureKit 录屏、关掉光标、并单独拿光标元数据(位置/形状/点击)。这才是 Screen Studio 的标准做法。**

### B-① 采集:启用原生 SCK 无光标
- `useScreenRecorder.ts`:`FORCE_GET_DISPLAY_MEDIA_ON_MAC = false`,走 `startNativeMacRecordingIfAvailable`。
- 原生 helper(Swift)`SCStreamConfiguration`:**`showsCursor = false`**(录屏不含光标)。
- helper 同时上报光标元数据流:`{ timeMs, x, y, cursorType, clickType }`,写入编辑器的 `cursorRecordingData`(契约见 `src/native/contracts.ts`,已有 `cursorType` 字段)。

### B-② 编辑器:喂真 cursorType → 自动有形状
- `cursorRenderer.ts` 的 `findLatestStableCursorType` 已会按 `cursorType` 切 sprite(arrow/text/pointer/hand…),点击有 `clickBounce`。**只要遥测带真 cursorType/click,形状与点击高亮自动就有。**
- `hasEditableCursorRecording` 同 A-③ 打开 darwin。

### B 的代价(负责人已知,需其拍板)
- 原生 helper 是独立进程 → 自签名/未公证下 macOS 视为独立"屏幕录制"TCC 主体 → **大概率重新触发录屏权限弹窗**(推翻 D10 当初的修复)。彻底无弹窗的唯一正路 = Apple 开发者账号正式签名 + 公证。
- 即:**B = 完整光标质感,但要负责人接受权限弹窗回归(或去做正式签名公证)。**

---

## 3. 平滑光标渲染升级(A / B 共用,建议)

`cursorRenderer.ts` 的 `SmoothedCursorState` 已是 spring(`getCursorSpringConfig`)。建议把它也换成**和相机同款的"距离自适应临界阻尼弹簧"**(本次已给相机 `autoFollowSmoothing.ts` 做了:远/快→高刚度紧跟、近/慢→低刚度柔落、始终临界阻尼无超调),让**光标与镜头手感一致、快移丝滑**。
- 复用 `autoFollowSmoothing.ts` 里的 `stiffnessForDistance` + `springStep` 思路,或把 `getCursorSpringConfig` 的映射调成距离自适应。
- 这是"丝滑度"的最后一公里,A/B 都受益。

---

## 4. 给 Code 的执行顺序 + 验收

1. **A-①**(mac→getDisplayMedia+cursor:never)→ `npm test` + `tsc` → **mac build**(`npx vite build && npx electron-builder --mac --arm64 --dir && bash scripts/resign-local.sh`)→ 录一段。
2. 按 **A-②** 判定:视频里有没有烙进的光标。
   - 无 → 做 **A-③**(开 mac 叠加)→ 再录,确认"单个平滑光标、无重影"。把局限(恒箭头)告诉负责人,问要不要上 B 补形状。
   - 有 → 回退 A-①,走 **B**(并先跟负责人确认接受权限弹窗回归)。
3. 收尾做 **§3** 光标平滑升级,跟相机手感对齐。
4. 每步更新 `STATE.md` / `DECISIONS.md`(项目规矩:一步一验收,负责人确认再进下一步;**别碰签名/`resign-local.sh` 证书身份**)。

---

## 附:本次 Cowork 已改 & 已验证(tsc 全过)

- `videoPlayback/autoFollowSmoothing.ts`:相机自动跟随重写为**距离自适应临界阻尼弹簧**(治抖动/跳屏,快移更跟手)。`smoothAutoFollowFocus` 返回 `AutoFollowState{focus,vx,vy}`;调用点 `VideoPlayback.tsx`/`frameRenderer.ts` 已同步;单测 5 断言重写(逻辑复算全绿)。
- `VideoEditor.tsx`:D13 临时让 mac 不叠加光标(消除双光标);本重写 A-③ 会按需加回。
- 验证手段:`tsc --noEmit` 零错误 + node 逻辑复算;**未跑** vitest/electron-builder(沙箱不支持)。

---

## 执行结果(2026-06-17,本地 Code 在 Mac 上 build + 真机取证)

- **A-① 已做**:`useScreenRecorder.ts` getDisplayMedia 分支扩到 `win32 || darwin`。`tsc` 零错误、`npm test` 218 passed、`vite build`+`electron-builder --mac --arm64 --dir`+`resign-local.sh` 全过。
- **A-② = ❌ 失败(已取证,非目测)**:抠负责人录屏 `recording-1781685366400.webm` 两个点击帧 → 真·光标已烙进视频 → **macOS getDisplayMedia(SCK)忽略 `cursor:"never"`**。故 **A-③ 不做**(会双光标回归)。
- **意外发现**:mac 光标遥测 `provider:"native"` 已抓**真实光标位图**(箭头+I字梁)+点击 → 交接里"叠加层恒为箭头"的假设**不成立**;形状/点击数据不缺,缺的只是无光标视频。
- **负责人定档「保持现状」**:当前 build(A-① + D13)= 单真光标、无重影、形状会变、零弹窗 = 终态。**§3、路线 B 均搁置**(B 需接受权限弹窗回归或正式签名公证)。
- 决策见 **DECISIONS D14/D15**,进度见 **STATE.md**。
