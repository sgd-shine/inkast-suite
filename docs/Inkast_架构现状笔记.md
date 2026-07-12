# Inkast 架构现状笔记(基于 OpenScreen)

> 本文是 Phase 0 的交付物之一:把 OpenScreen(我们 fork 的脚手架)的关键模块"在哪些文件"梳理清楚,
> 方便后续在正确的位置叠加"边录边画"功能。基于克隆时的 `main` 分支(2026-06,37.9k★)。
> 阅读约定:`路径:行号` 可点击跳转。

---

## 0. 一句话总览

OpenScreen = **Electron(多窗口主进程)+ React/Vite 渲染层 + 原生 ScreenCaptureKit 录制 + WebCodecs/PixiJS 合成导出**。
单一渲染入口(`index.html` → `src/App.tsx`),用 URL 查询参数 `?windowType=xxx` 决定每个 BrowserWindow 渲染哪个界面。

---

## 1. 进程 / 窗口模型(最重要)

主进程入口:[`electron/main.ts`](../electron/main.ts)

- App 启动后开的**第一个窗口就是 HUD 覆盖窗**(底部录制控制条):
  `createWindow()` → `createHudOverlayWindow()`(`electron/main.ts:95`)。
- 窗口工厂全在 [`electron/windows.ts`](../electron/windows.ts):
  - `createHudOverlayWindow()` — **透明/无边框/置顶/点击穿透/跨 Space** 的控制条(600×160,底部居中)。★这是我们做 Excalidraw 覆盖窗的现成模板。
  - `createSourceSelectorWindow()` — 录制源选择窗。
  - `createCountdownOverlayWindow()` — 开录前 3-2-1 倒计时覆盖窗。
  - `createEditorWindow()` — 录后编辑器窗。
- **窗口路由靠 `?windowType=`**:渲染层 [`src/App.tsx:58`](../src/App.tsx) 的 `switch(windowType)`:
  - `hud-overlay` → `<LaunchWindow/>`(控制台/开录 UI)
  - `source-selector` → `<SourceSelector/>`
  - `countdown-overlay` → `<CountdownOverlay/>`
  - `editor` → `<VideoEditor/>`(整个录后编辑器,懒加载)
- 透明窗会把 `body/html/#root` 背景设为 `transparent`(`src/App.tsx:30`)。
- 托盘图标、应用菜单、未保存提醒都在 `electron/main.ts`。
- 进入编辑器时会关掉 HUD 再开编辑器窗(`createEditorWindowWrapper`,`electron/main.ts:368`),`mainWindow` 引用复用。

> **我们要加的"实时画布覆盖窗"落点已确定**:
> 1. `electron/windows.ts` 新增 `createDrawOverlayWindow()`(克隆 HUD 那套参数,尺寸改成目标显示器整屏工作区,`windowType=draw-overlay`)。
> 2. `src/App.tsx` 新增 `case "draw-overlay": return <DrawOverlay/>`,并把 `draw-overlay` 加进透明背景判断。
> 3. `electron/main.ts` 管理它的生命周期 + 与录制状态联动 + 新增 IPC。

---

## 2. 录制(Recording)

**macOS 走原生 ScreenCaptureKit,不是纯 `desktopCapturer`。**

- 原生 helper(Swift):[`electron/native/screencapturekit/`](../electron/native/screencapturekit/)
  - `Sources/OpenScreenScreenCaptureKitHelper/main.swift` — 屏幕/窗口/系统音频捕获。
  - `Sources/OpenScreenMacOSCursorHelper/main.swift` — 原生光标轨迹采集。
  - 需先编译:`npm run build:native:mac`(脚本 `scripts/build-macos-screencapturekit-helper.mjs`)。
- 主进程桥接:`electron/ipc/nativeBridge.ts`、`electron/native-bridge/*`、`electron/ipc/recordingStream.ts`。
- 渲染层编排:[`src/hooks/useScreenRecorder.ts`](../src/hooks/useScreenRecorder.ts)
  - 目标 60fps、4K(3840×2160,带 QHD/1080 回退)、自适应码率。
  - 同时支持原生 Mac 路径(`src/lib/nativeMacRecording.ts`)与 Electron `getDisplayMedia`→`MediaRecorder`→`.webm` 路径(`fixWebmDuration` 修正时长)。
  - `recorderHandle.ts` 封装录制句柄;`recordingSession.ts` 定义会话/产物类型与 `CursorCaptureMode`。
- 录制源选择:`src/components/launch/SourceSelector.tsx`;主进程 `getSelectedDesktopSource()`(`electron/ipc/handlers.ts`),并由 `setDisplayMediaRequestHandler`(`electron/main.ts:495`)把选中源喂给 `getDisplayMedia`。
- **源 ID 区分 display / window**:`parseMacDisplayIdFromSourceId` / `parseMacWindowIdFromSourceId`(`src/lib/nativeMacRecording.ts`)。

> **方案 A 关键结论(已读 Swift 源码确认)**:
> 显示器捕获用 `SCContentFilter(display:, excludingWindows: [])` —— **不排除任何窗口**,所以我们的透明置顶覆盖窗会被自然录进画面 ✅。
> 单窗口捕获用 `SCContentFilter(desktopIndependentWindow:)` —— 只录那一个窗口,录不到覆盖窗 ❌。
> → 这正是"边录边画 v1 必须绑定显示器捕获"的代码级依据。

---

## 3. 合成 / 特效(PixiJS + WebCodecs)

- 预览期渲染:[`src/components/video-editor/videoPlayback/`](../src/components/video-editor/videoPlayback/)
  - `zoomTransform.ts` / `zoomRegionUtils.ts` / `zoomSuggestionUtils.ts` / `cursorFollowUtils.ts` — 自动/手动缩放、跟随鼠标。
  - `cursorRenderer.ts` / `motionSmoothing.ts` — **光标平滑美化**(配合原生光标采集)。
  - `layoutUtils.ts` / `overlayUtils.ts` / `mathUtils.ts` — 合成布局。
- 背景 / 圆角 / 阴影 / 模糊:`src/lib/wallpaper.ts`、`gradientParser.ts`、`backgroundImageUpload.ts`、`compositeLayout.ts`、`blurEffects.ts`(+ `pixi-filters`、`@pixi/filter-drop-shadow`)。
- 依赖:`pixi.js@8`、`pixi-filters`、`gsap`、`motion`(Framer Motion)。

---

## 4. 时间轴(录后编辑)

- [`src/components/video-editor/timeline/`](../src/components/video-editor/timeline/):`TimelineEditor.tsx`、`Row/Subrow/Item`、`KeyframeMarkers.tsx`、`BackgroundWaveform.tsx`、`zoomSuggestionUtils.ts`。
- 基于 `dnd-timeline`。变速:`customPlaybackSpeed.ts`。历史/撤销:`src/hooks/useEditorHistory.ts`。
- 编辑器主控:`src/components/video-editor/VideoEditor.tsx`(裁剪 `CropControl`、设置面板、回放控制等)。

---

## 5. 导出(Export)

- [`src/lib/exporter/`](../src/lib/exporter/):
  - `videoExporter.ts` / `index.ts` — 导出主流程。
  - `frameRenderer.ts` / `annotationRenderer.ts` / `threeDPass.ts` — 逐帧渲染(把背景/缩放/光标/标注合成进帧)。
  - `videoDecoder.ts` / `streamingDecoder.ts` / `videoFrameQueue` — WebCodecs 解码。
  - `audioEncoder.ts` / `muxer.ts` — 音频编码 + 封装(`mp4box`/`mediabunny`/`web-demuxer`)。
  - `gifExporter.ts` — GIF 导出。`mp4ExportSettings.ts` — MP4 参数。
- UI:`ExportDialog.tsx`、`FormatSelector.tsx`、`GifOptionsPanel.tsx`;比例工具 `src/utils/aspectRatioUtils.ts`。

---

## 6. 已存在但"录后"的标注(与我们要做的"实时层"区分)

- `src/components/video-editor/AnnotationOverlay.tsx`、`AnnotationSettingsPanel.tsx`、`ArrowSvgs.tsx`,导出端 `src/lib/exporter/annotationRenderer.ts`。
- 这是**录完之后**在编辑器里加的箭头/形状/文字 —— 不是边录边画。
- 我们的实时 Excalidraw 覆盖层是**新增的一等公民**;未来"方案 B"(把实时笔迹转成可编辑元素)可以把笔迹喂进这套已有的标注/导出管线。

---

## 7. 全局快捷键现状

- [`electron/globalShortcut.ts`](../electron/globalShortcut.ts):**目前只注册了一个**"打开 App"快捷键(默认 `Ctrl+Shift+O`,可配置)。
- 注册方式:`globalShortcut.register(accelerator, callback)`。
- → 我们的画布快捷键(开关画布 / 绘制⇄穿透 / 清屏 / 撤销 / 切工具)在这里扩展即可。

---

## 8. 权限(macOS)

- `electron/main.ts:469-493`:放行 `media/audioCapture/microphone/videoCapture/camera/screen/display-capture`。
- 启动即申请麦克风;屏幕录制权限在点击录制源选择时惰性触发(避免系统弹窗被自家窗口挡住)。
- 关闭了 `MacCatapLoopbackAudioForScreenShare`,改用"屏幕与系统音频录制"权限(dev 环境更省心)。
- 入口实体文件:`macos.entitlements`、`electron-builder.json5`。

---

## 9. 构建 / 脚本 / 工具链

- 运行:`npm run dev`(Vite + Electron,`vite-plugin-electron`)。
- 原生 helper:`npm run build:native:mac`(需 Xcode/Swift,本机已具备)。
- 打包:`npm run build:mac`(electron-builder)。
- Lint/格式:Biome(`npm run lint` / `lint:fix`);测试:Vitest(`npm test`)+ Playwright e2e。
- Node 引擎要求 22.22.1(`.nvmrc`);本机 22.22.2,实测可用。

---

## 10. "复用 vs 新写"速查(详见执行清单)

| 能力 | 复用现成文件 | 我们新写 |
|---|---|---|
| 显示器录制 / 音频 | `useScreenRecorder.ts`、SCK helper、`recordingStream.ts` | 绑定 display 源 + 与覆盖窗联动 |
| 透明置顶/穿透窗 | `windows.ts → createHudOverlayWindow` | `createDrawOverlayWindow`(整屏) |
| 全局快捷键 | `globalShortcut.ts` | 画布相关快捷键 |
| 缩放/背景/模糊/光标/时间轴/导出 | `videoPlayback/*`、`lib/exporter/*`、`timeline/*` | Phase 2 调优 |
| 实时画布 | —— | `src/components/draw-overlay/*` + `@excalidraw/excalidraw` |
