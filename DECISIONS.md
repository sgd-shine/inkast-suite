# DECISIONS — Inkast

> 决策记录(只追加,新决策放最上面)。日期为绝对日期。

## 2026-06-19 · 界面对齐 Phase 2 + Phase 3(本地 Code 执行,负责人授权一口气做完)

- **D30 Phase 2:智能粗剪从工具条下拉 → 右侧侧面板(`SmartCutPanel.tsx`)。** 对齐 `Inkast-智能粗剪-Demo.html`:头部 + 3 张统计卡(废话/停顿/可省 Xs)+ 分组操作(删停顿 / 识别废话 → 删语气词 + 逐条复核 / 字幕生成·显隐)。**全部复用既有 handler,零新逻辑**。时间线工具条的智能粗剪 `DropdownMenu` 换成一个按钮(`onOpenSmartCut`);原下拉里的全部 props 从 `TimelineEditor` 移除(连带清理 `DropdownMenu*`/Captions/Eye/EyeOff/ListChecks/Loader2/MessageSquareText import)。新 i18n `timeline.smartCut.{localTag,panelHint,close,statFillers,statPauses,statSavable}`。

- **D31 Phase 3:编辑器 deck 2 栏 → 3 栏 + 左侧媒体面板 + 顶部功能 Tab(`MediaPanel.tsx`)。**
  - **坐标安全先确认**:`VideoPlayback` 的 `overlaySize` 是 `ResizeObserver` 实测预览元素像素(非硬编码)。所以加左列、预览变窄 → overlaySize 自动重测 → 叠加/字幕/放大/摄像头/光标的百分比↔像素换算自动重算,**预览=导出仍成立**(导出用自己的画布尺寸 + 同一套百分比坐标)。这是交接 §5 点名的唯一真风险,已从根上排除。
  - **布局**:`index.css` 的 `.editor-main-deck` 用 `grid-template-areas`("media preview inspector"),三档断点(默认/≤1240/≥1900)都加左列;≤1020 重排成 `"media preview" / "inspector inspector"`。用 areas 而非列顺序,子元素增减不串位。
  - **MediaPanel**:顶部 Tab「媒体 / 智能」。媒体 = 插入图片/视频(复用 `triggerInsertImageOverlay`/`triggerInsertVideoOverlay`,也支持拖进预览 D17)+ 素材概览(主视频/摄像头/N 个叠加)+ 拖放提示。智能 = 内嵌 D30 的 `SmartCutPanel`。时间线「智能粗剪」按钮现在切到「智能」Tab(取代 Phase 2 的临时右抽屉,已删抽屉)。新 i18n `editor.media.*`。
  - **范围取舍**:交接列了 4 个 Tab(媒体/文本/调节/智能)。本轮做了**媒体 + 智能**(真正新增的左栏内容);**文本(标注)、调节(背景/外观)仍留在右侧 Inspector**——它们已有且工作良好,把右栏内容重路由到左栏是更大改动、收益低、风险高,故不动(交接也只要求"路由到已有功能",未强制全搬)。
  - **未碰**:`EditorState`/导出合成/撤销/dnd 拖拽;无 clip 模型按钮。
  - **验证**:Phase 2 与 Phase 3 各跑 tsc 0 · biome 无 fix · lint 仅既有 DrawOverlay · **263 tests**。⚠️ 3 栏布局 + 预览缩放的视觉/交互(尤其叠加/字幕/放大的预览=导出一致性)**无法 headless 验证**,已 build+resign+ditto → **强烈建议负责人真机核对**:开一个带叠加图片/视频 + 字幕 + 自动放大的工程,确认预览里位置和导出帧一致、时间线拖拽/跳转正常、左侧媒体面板与智能 Tab 可用。

## 2026-06-19 · 界面对齐 Phase 1:时间线外观对齐(本地 Code 执行)

- **D29 Phase 1 落地:效果轨左侧标签列 + sticky 刻度尺 + 工具条 icon+文字 + 时间线统一 `#0C0F12`。纯换皮,不加任何 clip 模型按钮(分割/左删右删/磁吸)。**
  - **关键发现:dnd-timeline 早就内建 `sidebarWidth`**,现有代码(playhead/ruler/点击换算)全都已按它偏移,只是从没设过(默认 0)。所以加左侧标签列是**激活既有能力**,不是改像素数学 —— 低风险。
  - **左侧标签列(Demo `.trk-h`)**:`TimelineWrapper` 给 `TimelineContext` 设 `sidebarWidth={96}`(导出常量 `TIMELINE_SIDEBAR_WIDTH`);`Row.tsx` 用 `useRow` 的 `setSidebarRef`/`rowSidebarStyle` 渲染标签列(图标+轨道名),并把 `background`(波形)/空状态提示移进**内容区 lane**(否则会铺到标签底下)。**坑**:lane 必须 `display:flex`,内部 `setNodeRef`(rowStyle `flex:1`)才会撑满行高、片段竖直定位才对。6 条轨图标+名:放大/剪掉/标注/打码/变速/叠加(i18n `timeline.trackLabels`)。
  - **sticky 刻度尺**:`TimelineAxis` 加 `sticky top-0 z-20`(`position:sticky` 自带定位上下文,绝对定位的刻度仍正确)。
  - **工具条 icon→icon+文字**:6 个效果按钮(`size=icon` 纯图标)→ `size=sm` 图标+短文字(复用 `trackLabels` + 新 `buttons.suggestZoomsLabel`),保留各自 hover 配色;工具条加 `overflow-x-auto` + 效果组 `shrink-0` 防窄屏挤压。
  - **配色统一**:时间线容器 `#0b0c0f`→`#0C0F12`、刻度尺 `#0c0d10`→`#0C0F12`、轨道 lane/标签列 `#0C0F12`(Demo `.tl`/`.ruler` 同色)。
  - **未碰**:`EditorState`/导出/撤销/dnd 拖拽逻辑;不加 clip 按钮(范围外)。
  - **验证**:tsc 0 · biome 无 fix · lint 仅既有 DrawOverlay · **263 tests**(纯 UI/样式,无新测试)。⚠️ 布局/交互(片段拖拽、播放头对齐、标签列对齐)**无法 headless 验证**,已打包 → **待负责人真机目测**:时间线左侧出现 6 个图标+名标签列、刻度尺、工具条带文字;拖拽/选中/跳转仍正常。

## 2026-06-19 · 转写(ASR)失败:根因确证 + 修复(换 timestamped 模型 + 语言提示)

- **D28 转写失败根因已确证并修复(Node 离线复现):① 模型不支持词级时间戳;② 没传语言中文出乱码。**
  - **复现方法(不打扰负责人)**:`@huggingface/transformers` 在 Node 也能跑同一套模型/代码。用 ffmpeg 从样片(`40_内部工具/.../pianchang-app-real-smoke-20260610.mp4`)抽 25s 16k 单声道 PCM,curl 把 `whisper-base` 全部权重下到本地 `/tmp/models`,Node 离线跑 pipeline(避开 Node-undici 拉大文件的偶发 `fetch failed`、Node 仅支持 cpu device 等环境差异)。
  - **根因①(崩溃)**:`onnx-community/whisper-base` 的 ONNX **没导出 cross-attentions**,`return_timestamps:"word"`(app 一直用词级)在 `_extract_token_timestamps` 必崩:**"Model outputs must contain cross attentions to extract timestamps … not exported with `output_attentions=True`"**。离线验证:同模型句级(`return_timestamps:true`)能转出文本、**词级必崩**。→ **改用 `onnx-community/whisper-base_timestamped`**(专门带 attention 输出),离线验证词级出 15 个 `{text,timestamp:[s,e]}` chunk。**这是负责人「转写失败」的真因,与网络无关**(之前 D27 怀疑的网络/wasm 不是主因;那行 ORT `VerifyEachNodeIsAssignedToAnEp` 只是普通 Warning)。
  - **根因②(乱码)**:不传 `language` 时 whisper **默认英语(不是自动检测)**→ 中文音频转成乱码英文("…Jiang Jie's video")。离线验证:传 `language:"chinese"` → 正确中文("這個是產品功能…")。→ **按界面 locale 给语言提示**:新 `src/lib/asr/language.ts` `localeToWhisperLanguage`(zh→chinese / ja→japanese …,未知→undefined,**4 单测**);`useTranscription(videoUrl, language?)` 透传给 worker;`VideoEditor` 传 `localeToWhisperLanguage(locale)`(为此把 `useI18n()` 上移到 useTranscription 之前)。
  - **保留 D27 的加固**:worker WASM 回退现覆盖**加载+推理**(原只覆盖加载);`useTranscription` 暴露 `error` + `console.error` 真错;`VideoEditor` status→error 时 `toast.error`(打包版也能看到);i18n `editor.errors.transcriptionFailed`。
  - **局限**:语言按界面语言强制(zh-CN 用户录英文会被强转中文 → 后续可加语言选择器);首次需联网下 `whisper-base_timestamped`(~75MB,旧 base 缓存白占但无害)。
  - **验证**:tsc 0 · biome 无 fix · lint 仅既有 DrawOverlay · **263 tests**(+4 language)。**待负责人 `npm run dev` 重测**:导入有人声(中文)视频 → 识别废话 → 应能转写出中文 + 词级删语气词/字幕可用。

- **D27 负责人实测「转写失败」(删停顿走能量 VAD,OK;删废话/字幕/逐条复核都依赖 whisper 转写,挂了)。根因当时不可知 —— `useTranscription` 把 worker 的真实错误吞了(只 `setStatus("error")`)。本轮先做"让错误可见 + 修掉一个确定的回退漏洞",再让负责人拿真实错误精准修。**(根因后由 D28 确证 = 模型不支持词级时间戳 + 没传语言,**非**网络。)
  - **确认非本机网络硬阻断**:shell 实测 `huggingface.co` 的 `whisper-base` config.json 200、量化权重(23MB,走 HF 新 Xet CDN `cas-bridge.xethub.hf.co`)也 200。所以"模型拉不下来"不是本机当前的硬伤(但负责人测时的网络/时段可能不同;ORT 的 wasm 运行时文件默认从 jsDelivr CDN 拉,China 下也可能是隐患 —— 留待真实错误确认)。
  - **修掉的确定漏洞(`whisperWorker.ts`)**:原 `try webgpu / catch wasm` **只包了"加载模型"**,没包推理 → WebGPU 加载成功但**推理**报错时直接挂、不回退 WASM。改成 `runOnce(device,dtype)`(加载+推理一体),`try webgpu / catch → wasm`,**推理失败也回退**;最终失败把 `webgpu: … | wasm: …` 两条错误都带上。
  - **错误可见(`useTranscription.ts`)**:加 `error: string|null` 返回字段;用显式 `reachedTranscribe` 标志区分「无音轨(解码失败)→no-audio」与「转写失败→error」(不再靠 setStatus 的 prev 推断);转写阶段失败 `console.error("[Inkast] 转写失败:", message, err)` 并存 `error`。
  - **UI 暴露(`VideoEditor.tsx`)**:status→error 时 `toast.error(errors.transcriptionFailed {error})`(ref 去重),打包版无 DevTools 也能看到真实错误。i18n 加 `editor.errors.transcriptionFailed`(zh+en)。
  - **验证**:tsc 0 · biome 无 fix · lint 仅既有 DrawOverlay · **259 tests**(无回归;无法 headless 跑真 whisper)。**转写在 `npm run dev` 即可测**(纯渲染+worker+网络,不需打包/原生 helper)——**待负责人 `npm run dev` + 开 DevTools 重测**:点「识别废话」→ 若仍失败,把 toast/控制台里的 `webgpu: … | wasm: …` 错误发来,据此定位(网络拉模型 / ORT wasm 运行时 / 推理报错)再精准修(可能需 HF 镜像 `env.remoteHost=hf-mirror.com` 或本地 bundling wasm)。

## 2026-06-19 · 界面对齐 Phase 0:Token & 标题栏 chrome(本地 Code 执行)

- **D26 负责人拍板做「界面对齐(纯换肤 + 左侧媒体面板)」(D25 的①档),交接见 [docs/Inkast_界面对齐_交接.md](docs/Inkast_界面对齐_交接.md)。本轮落地 Phase 0(纯视觉、零逻辑风险)。**
  - **Token 对齐**:全局把零星的 `#09090b` 统一成 Demo 的 `--ink:#0A0C0E`(11 个文件:App / 编辑器壳 / 各 Dialog / EditorEmptyState / TimelineEditor 等)。`#070809`(页/预览舞台)在标题栏与预览处本就正确,未动;时间线另有 `#0c0d10`/`#0b0c0f`/`#08090b` 等近黑变体留待 Phase 1 统一成 `#0C0F12`。纯改色字面量,无视觉可感差异,只为 token 一致。
  - **比例下拉搬到标题栏**:从时间线工具条(`TimelineEditor` 的 `.cliptools`)移到标题栏右侧(对齐 Demo `.tb-right` 的 `.ratio`)。逻辑抽成 `VideoEditor.handleAspectRatioChange`(切比例时若画版式方向冲突回落画中画,与原 `onAspectRatioChange` 完全一致)。`TimelineEditor` 删掉 `aspectRatio`/`onAspectRatioChange` 两个 props + 相关 import(`ASPECT_RATIOS`/`AspectRatio`/`getAspectRatioLabel`/`Check`/`ChevronDown`),`Button` 仍用故保留。
  - **绿色「导出」按钮**:标题栏右侧加 Demo `.exp` 风格按钮(`bg-#34B27B` + 墨色字 `#06140d` + `Download` 图标),复用既有 `handleOpenExportDialog`(立即按当前导出设置开始)。比例+导出**仅在有视频时**显示(无视频时导出无意义、且原比例下拉也只在有时间线时存在)。右侧 Inspector 里原有的导出面板**保留不动**(详细 格式/质量/GIF 设置仍在那;标题栏按钮是 Demo 风格的快捷入口)。
  - **未做(留后续 Phase)**:可选的 `文件/编辑/视图/帮助` 菜单条——现标题栏左侧已是功能化按钮(语言/新建录制/打开/保存)+ 右侧帮助菜单,加装饰性菜单标签反而降低 UX,故 Phase 0 跳过。时间线外观(Phase 1)、智能粗剪侧面板(Phase 2)、3 栏 + 顶部 Tab + 左侧媒体面板(Phase 3)未动。
  - **i18n**:`editor.json` 加 `export.button`(导出/Export)+ `aspectRatio`(画面比例/Aspect ratio),zh-CN + en 都加。
  - **验证**:`tsc --noEmit` 0 · `npm run lint` 仅 1 个既有 `DrawOverlay` 警告(未新增)· `npx biome check --write <改过文件>` 无 fix · `npm test` **259 passed**(基线持平,纯 UI 改动未动测试)。**纯前端 UI 改动,未跑 electron-builder/resign/ditto**(按铁律:非录屏改动用 `npm run dev` 审即可,避免留 adhoc 坏包)。**需负责人 `npm run dev` 目测**:导入一段视频 → 看标题栏右侧出现「比例下拉 + 绿色导出」、时间线工具条不再有比例下拉、整体更像 Demo;切比例/点导出功能正常。

## 2026-06-19 · §4 Phase 3 自动字幕(本地 Code 执行)+ Demo 界面差距评估

- **D24 §4 Phase 3 自动字幕落地,复用同一套 ASR 输出。至此 Demo 文档四大块全部有可用版本。**
  - **数据模型**:`SubtitleCue {id,startMs,endMs,text}`(`types.ts`);`EditorState` 加 `subtitleCues: SubtitleCue[]` + `showSubtitles: boolean`(默认 [] / false),贯穿 undo/redo + projectPersistence 归一化 + 保存/加载映射(含两处 save 对象 + 依赖数组,用 Python 精确插入避免 tab-only 重复行误配)。cue 时间戳在**源时间轴**,与转写词同坐标系 → ripple 删除/变速天然生效。
  - **生成**:纯函数 `buildSubtitleCues(words, {maxDurationMs=5000,maxChars=42,pauseGapMs=600})`(`src/lib/cut/subtitleCues.ts`,**12 单测**):长停顿/句末标点/超时长/超字数处断句;CJK 不加空格、拉丁加空格;`activeCueAt(cues,timeMs)` 取当前 cue。
  - **预览**:`SubtitleOverlay.tsx`(底部居中、深色药丸底、白色粗体,字号≈画面高 4.5%)挂在 `VideoPlayback` 的 overlay 容器里。
  - **导出烧录**:`frameRenderer.drawSubtitles(timeMs)` 在 `renderFrame` 末尾画到 `compositeCanvas`(最顶层、不随 3D 旋转),canvas 按字符折行,比例与预览一致 → **预览=成品**。`videoExporter`/`gifExporter` 配置加 `subtitleCues`+`showSubtitles`;**videoExporter 快路径加 blocker**(有字幕时禁用 source-copy passthrough,强制逐帧渲染)。
  - **入口**:智能粗剪下拉加「字幕」段 —— 转写完点「生成字幕」(`Captions`)→ 「显示/隐藏字幕」(`Eye/EyeOff`)开关;未转写时提示先识别废话。生成/开关都走 pushState 可撤销。
  - **局限**:字幕文本不随"删语气词/逐条复核"自动重算(删词后字幕仍含原词,需重新生成);样式暂固定(底部居中、单一配色),无逐条编辑 UI。
  - **验证**:`tsc` 0 · `lint` 过(仅既有 1 警告)· `npm test` **259 passed**(+12 subtitle)· `vite build` + `electron-builder --dir` + `resign` + `ditto`→/Applications 全过 · `codesign --verify --deep --strict` 通过(`com.sgd.inkast`)。**需负责人真机验收**:识别废话→生成字幕→预览看底部字幕→导出 MP4 确认字幕烧进画面。

- **D25(待负责人定)Demo 界面对齐 = 评估,不是已决。** 负责人问"现在界面只是在 OpenScreen 上改按钮,能不能对齐我们设计的 Demo 界面?影响大不大?"我用子代理把 4 个 Demo HTML(`40_内部工具/Inkast-剪辑器-完整版-Demo.html` 等)与现编辑器做了区域级差距分析,结论:
  - **视觉皮肤已对齐 80–90%**(同一套深色 token `#0A0C0E`/`#34B27B`/`#E7EBEF`、玻璃面板、绿色强调、Inspector 方向A、空状态、导出流程都已是 UI 样板的实现)。
  - **真正的差距是信息架构**:Demo 是剪映/CapCut 式**多轨 NLE**(顶部功能 Tab 切左侧素材库;视频/音频/摄像头是可分割/移动/复制的**片段**;贴纸/转场/滤镜/文本模板是一等公民)。现 app 是**单一不可变源 + 效果区间叠加**的录屏效果编辑器,**没有 clip 模型**。
  - **影响分级**:① 纯换肤(标题栏放比例+导出钮、时间线轨道加左侧标签、工具条 icon+label、智能粗剪做成侧面板、token 微调)= **低风险,约 1 周**,现状态/逻辑全可复用;② 顶部功能 Tab + 左侧素材库外壳 = 中风险(若只是"导航现有工具"安全,若要塞贴纸/转场/滤镜等新内容则是新功能);③ 多轨 clip 模型(分割/左删右删/复制/磁吸/联动)= **高风险、数周,等于重写编辑核心(时间线数据模型+导出合成器+撤销+预览管线)**,是另一个产品级投入,不该当"换肤"卖。
  - **建议**:先做 Phase 0–2(纯换肤 + 智能粗剪侧面板),把"长得像 Demo"低风险拿下;多轨 clip 编辑作为独立路线另行立项。**等负责人拍板做到哪一层。**

## 2026-06-19 · §4 Phase 2 逐条复核面板(本地 Code 执行)

- **D23 删废话补「逐条复核面板」:转写文本逐词列出,点词切换删/留,语气词预选,应用=转 TrimRegion。** 完成 D21 留的尾巴(原本只一键删全部),让"纯声音/纯词表不准"可手工精修 —— 呼应负责人"识别不完美但可手工调"。
  - **纯逻辑**(`src/lib/cut/wordSelection.ts`,**8 单测**):`fillerWordIndices(words,fillers)`(与语气词片段时间重叠的词下标,用于预选)+ `selectedWordsToSegments(words, Set<index>, {mergeGapMs=400,paddingMs=60})`(选中词→排序/合并相邻/加余量/不重叠的待删片段)。与 pauseDetection/fillerDetection 同构。
  - **面板**(`src/components/video-editor/TranscriptReviewPanel.tsx`,shadcn Dialog):转写逐词渲染成可点 `<button>`;**红色删除线=将删、黄底=识别到的语气词**;打开时预选全部语气词;底部「将删 N 段 · X 秒」+「全选语气词 / 清空」+「应用删除」。应用 → `onApply(segments)`。
  - **集成**:智能粗剪下拉 ready 段加「逐条复核…」(`ListChecks`,`onReviewFillers`→开面板);**即使没检测到语气词也给入口**(可手工挑词删)。`VideoEditor` 加 `reviewOpen` 状态 + `handleApplyReviewCuts`(片段→TrimRegion,跳过已被现有 trim 覆盖的,toast `smartCut.reviewApplied`)+ 渲染面板;从 `useTranscription` 多取 `words`。
  - **未做**:转写词与播放头联动高亮 / 点词跳转(纯 polish);自动字幕(Phase 3)仍是独立下一步。
  - **踩坑**:上轮用 `npx asar extract-file <archive> <path> <out>` 验证打包,asar 忽略 out 参数、把 `preload.mjs`/`main.js` 解到**仓库根目录**(非 git-ignored)→ `biome check .` 扫到这俩**压缩产物**报 220 error。已 `rm` 清掉。**教训:别用 `asar extract-file` 写当前目录;要验证打包内容用 `asar extract <archive> /tmp/xxx`(解到仓库外)。**
  - **验证**:`tsc` 0 · `lint` 过(仅既有 1 警告;清掉根目录误生成的 mjs/js 后恢复)· `npm test` **247 passed**(+8 wordSelection)· `vite build` + `electron-builder --dir` + `resign` + **`ditto` 到 /Applications** 全过 · `codesign --verify --deep --strict` 通过(`com.sgd.inkast`)。**需负责人真机验收**:识别废话→下拉点「逐条复核…」→ 点词增删 → 应用 → 播放/导出确认。

## 2026-06-19 · 口播提示词(提词器)做成可发现的 HUD 按钮(本地 Code 执行)

- **D22 提词器功能其实已存在(phase-1 checkpoint 就有),负责人没发现 → 问题是「可发现性」不是「缺功能」。本轮只补一个 HUD 入口按钮 + 开关状态高亮,不重写已有实现。**
  - **已存在且符合全部要求**:`src/components/prompter/Prompter.tsx`(可编辑讲稿 textarea + 字号 A−/A+ + **自动滚动** ▶/⏸ + 速度滑杆 10–160px/s)+ `electron/windows.ts createPrompterWindow()` 用 **`setContentProtection(true)`**(macOS `NSWindowSharingNone`)→ **窗口你看得见、但不进录屏**;`alwaysOnTop` + `setVisibleOnAllWorkspaces({visibleOnFullScreen})`;原本只有 **⌘⇧T** 全局快捷键触发(负责人不知道,所以以为没这功能)。
  - **本轮新增(可发现性)**:录制 HUD(`LaunchWindow`)控件组里加一个**提词器按钮**(`ScrollText` 图标,录制前/中都可点,开时绿色高亮),复用摄像头按钮那套**开关状态广播**模式:
    - `electron/windows.ts`:加 `ipcMain.on("prompter-toggle")`→`togglePrompterWindow()`;加 `broadcastPrompterState(open)`(遍历所有窗口 `webContents.send("prompter-state")`),在 `createPrompterWindow` 后广播 `true`、`closed` 时广播 `false`。
    - `electron/preload.ts`:暴露 `togglePrompter()` + `onPrompterState(cb)`;`electron-env.d.ts` 补类型。
    - `LaunchWindow.tsx`:`prompterOn` 状态订阅 `onPrompterState`,按钮 `onClick=togglePrompter`,title「提词器(仅你可见,不录入 · ⌘⇧T)」。i18n `launch.json` 加 `prompter.open/close`(zh+en)。
  - **为何不在录屏里**:这是用户明确要求,也是提词器存在的意义 —— `setContentProtection(true)` 已正确实现且本轮亲测打包后 `main.js` 里有 2 处 `setContentProtection`、preload 里有 `prompter-toggle/state`。
  - **验证**:`tsc` 0 · `lint` 过(仅既有 1 警告)· `npm test` **239 passed** · `vite build` + `electron-builder --dir` + `resign` 全过 · `codesign --verify --deep --strict` 通过(`com.sgd.inkast` / `Notch Island Local Dev`)· 打包 asar 内 preload/main 均含新 IPC。**需负责人真机验收**:录制 HUD 点提词器按钮(或 ⌘⇧T)→ 粘讲稿、▶ 自动滚动 → 录一小段确认**成品里看不到提词器**。
  - **注**:§4 Phase 2 的「逐条复核面板 + 自动字幕(Phase 3)」仍未做,留作后续。

## 2026-06-18 · §4 Phase 2 删废话 / 语气词(本地 ASR · 本地 Code 执行)

- **D21 §4 Phase 2「删废话」用 transformers.js whisper 在渲染进程内本地转写(负责人经 AskUserQuestion 选定此路线)。** 不引原生 helper、不碰签名/TCC,与 D10「无原生 helper」一致;唯一新依赖 `@huggingface/transformers@3.8.1`(纯 JS + WASM/WebGPU)。
  - **转写管线**(`src/lib/asr/`):
    - `whisperWorker.ts` —— Web Worker 里跑 `pipeline("automatic-speech-recognition", "onnx-community/whisper-base")`,优先 WebGPU(`dtype fp32`)失败回退 WASM(`dtype q8`);`return_timestamps:"word"` 出词级时间戳;`env.allowLocalModels=false`+`useBrowserCache=true` → 模型首次从 HF Hub 下载并缓存(Cache API),之后离线可用。webSecurity 已为 false,跨源拉取模型/ORT wasm 不被拦。
    - `transcribe.ts` —— 主线程把音频用 `OfflineAudioContext` 重采样成 16kHz 单声道(whisper 输入要求),零拷贝转给 worker,收进度 + 结果,秒→毫秒换成 `TranscriptWord`。
  - **语气词识别**(`src/lib/cut/fillerDetection.ts`,纯函数 + **12 单测**):对每个词归一化(去标点/空白、英文小写)后**整词精确匹配**词表(不做子串包含,"然后我们"不误删,只有独立成词的"然后"才命中);相邻命中(≤400ms)合并,前后各加 60ms 余量并 clamp。默认词表偏保守:清晰迟疑音 + demo 点名口头禅(嗯/呃/额/啊/那个/这个/就是/然后 + um/uh/erm…),刻意排除"其实/对吧/呢/吧"等高频实义词。词表/阈值均可配置。
  - **按需触发**(`src/hooks/useTranscription.ts`):转写昂贵(下模型 + WASM 推理),**不进编辑器自动跑**(与停顿检测不同)—— 用户点「智能粗剪 ▸ 识别废话」才跑;status idle/preparing/transcribing/ready/error/no-audio,带 0–1 进度。
  - **集成**:智能粗剪下拉拆「停顿」「废话/语气词」两段。废话段:idle→「识别废话(本地转写)」按钮 + 首次下载/耗时/不完美提示;转写中→进度条;ready→「检测到 N 处语气词 · 可省 X 秒」+「一键删除语气词」。删除走 `handleRemoveFillers` → 转成 **TrimRegion**(跳过已被现有 trim 完整覆盖的,避免与停顿重复叠加),一次 pushState=一步撤销,复用 ripple + 导出剪掉。
  - **为何复用 TrimRegion**:语气词片段在源时间轴,与停顿同构,TrimRegion 已贯通预览+导出,不必新建轨/逻辑。
  - **已知局限(负责人已认可"不完美、可手工调")**:① 首次转写需联网下模型(~几十–上百 MB,之后缓存离线);② WASM 推理耗时(几分钟录音约数十秒);③ 中文 whisper 词级时间戳偏碎、有时会"顺掉"语气词,识别准确度有限;④ 暂无逐条复核面板(只一键删全部,靠撤销/时间线手工调)——复核面板 + 字幕(Phase 3)留作下一步。
  - **验证**:`tsc` 零错误 · `lint` 过(仅 1 处既有 DrawOverlay 警告)· `npm test` **239 passed**(+12 filler)· `vite build` 过(`whisperWorker` 单独 chunk 849K,transformers+ORT 已打包)· `electron-builder --dir` + `resign-local.sh` 过,`codesign --verify --deep --strict` 通过,`Identifier=com.sgd.inkast` / `Authority=Notch Island Local Dev`,worker 已进 app.asar。**需负责人真机验收(首次联网下模型):录带语气词的→进编辑器→智能粗剪 ▸ 识别废话→等转写→一键删除语气词→播放/导出确认。**

## 2026-06-17 · §4 Phase 1 智能粗剪 · 删长停顿(本地 Code 执行)

- **D20 §4 先做 Phase 1「删长停顿」:能量法 VAD(无需 ASR),复用 TrimRegion 落地。** 按文档"强烈建议分阶段、先 Phase 1 拿稳收益"。
  - VAD(`src/lib/cut/pauseDetection.ts`,纯函数 + 6 单测):按 20ms 窗算 RMS;自适应阈值=噪声底(10%分位)+(人声电平 90%分位−噪声底)×0.15;连续静音 ≥ `minPauseMs`(默认 700ms)即一段停顿,两端各留 `paddingMs`(默认 120ms)留白避免切进人声;无人声(全静音/无音轨)返回空。
  - 解码(`src/hooks/usePauseDetection.ts`):复用 `useAudioPeaks` 同一套 `loadFileAsArrayBuffer` + Web Audio `decodeAudioData` → 下混单声道 → `detectPauses`。失败/无音轨 → status `no-audio`(静默降级)。
  - 集成(`VideoEditor`):进编辑器自动检测 → 顶部「智能粗剪」横幅「检测到 M 处长停顿 · 可省 X 秒 [一键删除停顿] [×]」。一键删除 = 把停顿区间批量转成 **TrimRegion**(一次 pushState=一步撤销),**复用现有 trim 的 ripple 删除 + 导出剪掉 + 预览跳过**,所以时间线吸合/时长缩短/导出变短全部自动。横幅"已忽略"按 videoPath 记忆,换视频自动重显。
  - 为何复用 TrimRegion:停顿在源时间轴,TrimRegion 也在源时间轴且已贯通预览+导出;不必新建 CutRegion/ripple 逻辑。
  - 暂未做(后续):① **删废话/语气词 = Phase 2**(需本地 ASR:WhisperKit/whisper 词级时间戳 + 中文语气词词表 + 转写复核面板,体量大、是独立外部依赖);② 自动字幕=Phase 3;③ 逐条复核勾选 + 时间线"智能标记"轨 + 音频交叉淡化(停顿两端都接近静音,硬切通常听不出,故 Phase 1 先不做交叉淡化)。阈值(minPauseMs/thresholdFraction)可能要按真实录音再调。
  - 验证:`tsc` 零错误 · `lint` 过 · `npm test` **227 passed**(+6 VAD)· `vite build` + `electron-builder` + `resign` 全过(`com.sgd.inkast`)。
  - **修订(负责人反馈:横幅不该自动出现在顶部,应是单独按钮):** 去掉顶部自动横幅,改成**时间线工具条的「智能粗剪」按钮**(WandSparkles 图标)。点开是下拉:显示「检测到 M 处长停顿 · 可省 X 秒」+「一键删除停顿」+ 提示(可撤销);分析中/无音轨/无停顿各有对应文案。检测照旧进编辑器自动后台跑,只是结果收进按钮里、不打扰。负责人也确认"纯声音判断不准但可手工调整",所以检测逻辑不改。`tsc`/lint/227 tests/build/resign 全过。

## 2026-06-17 · §3 Phase 2 视频片段叠加(预览 + 导出,本地 Code 执行)

- **D19 视频片段叠加层 = 新数据模型 `OverlayClipRegion`(独立于 annotation),预览与导出都打通。** 负责人选「一次做全」。
  - 数据模型(`types.ts`):`OverlayClipRegion{ id, startMs, endMs(源时间轴), sourcePath, sourceStartMs(裁剪), position/size(%), opacity, zIndex, muted }`。进 `EditorState`(可撤销)+ `projectPersistence` 归一化(存读)。
  - 插入(`VideoEditor`):时间线工具条「插入视频」按钮(`openVideoFilePicker`)+ **把视频直接拖进预览**(扩展原图片拖放,按 MIME 分流图片/视频)。在播放头插入、默认 5s(取 min(5s, 源时长))、画面居中、自动选中。
  - 预览(新 `OverlayClipLayer`):每个在 `[startMs,endMs]` 内的片段渲染成定位 `<video>`,`currentTime` 跟随主播放头(`sourceStartMs + 已播`)、play/pause 与主视频同步;选中后 react-rnd 拖动/缩放(与图片叠加同手感)。渲染在 `VideoPlayback` 的画面坐标层(随缩放)。
  - 时间线(`TimelineEditor`):新增**独立「叠加轨」**(`OVERLAY_ROW_ID`),复用 Row/Item;可拖动调整出现时间/时长(经 `handleItemSpanChange` 路由到 `onOverlayClipSpanChange`)。
  - 右侧面板(新 `OverlayClipSettingsPanel`):选中片段显示『画面』位置X/Y + 宽度 + 居中 + 不透明度 + 删除(复用 Phase 1 的 overlay.* 文案/控件)。选择互斥已修(各 select handler 互清)。
  - 导出(**重点**,`frameRenderer` + `videoExporter` + `gifExporter`):**复用导出在渲染进程内有 DOM 的事实** —— 为每个叠加片段建隐藏 `<video>`,导出每帧按 source 时间 `seek` 后在前景画布按 object-cover + 不透明度合成(MP4 与 GIF 同路径)。加入「直拷源」快路径的 blocker(有叠加片段必走完整合成)。导出结束释放 `<video>`。
  - 取舍/边界:① 逐帧 `seek` 取样在长片段/多片段时偏慢(但仅在片段活跃区间 seek,有界);② 片段**源裁剪起点 `sourceStartMs` 暂无 UI**(默认从源 0 播,时间线可改时长/位置但不能选源的哪一段)——属后续细化;③ 叠加片段默认静音(不混音轨)。
  - 验证:`tsc`(含 electron)零错误 · `lint` 过(仅既有 DrawOverlay warning)· `npm test` **221 passed** · `vite build` + `electron-builder` + `resign-local.sh` 全过(`com.sgd.inkast` 稳定签名)。**需负责人真机验收:插入/拖入视频→预览摆放/同步播放→导出 MP4/GIF 看叠加位置/大小/时间/不透明度是否正确。**

## 2026-06-17 · 摄像头叠加位置随录制 + §3 图片按钮调整(本地 Code 执行)

- **D18 录制时摄像头叠加窗的位置写入会话,编辑器/导出按"录制时拖到的位置"放画中画(不再固定右下角)。**
  - 现象(负责人):录制中可拖动摄像头头像窗,但录完进编辑器,画中画始终固定右下角。
  - 根因:`cameraOverlaySettings` 只存了 shape + size(D 之前已做映射),**位置从未被采集**。`syncCameraOverlayWindowMetrics`(窗口 `move` 时)只同步 size。编辑器 `webcamPosition` 本就支持(可拖),但从录制初始化时是 null → compositor 落默认右下角。
  - 改法(贯穿 5 层):① `electron/cameraOverlaySettings.ts` 新增 `position{cx,cy}` 归一化中心 + getter/更新。② `electron/windows.ts`:`move` 时 + 创建时把窗口中心相对显示器归一化后写入(`getDisplayMatching` 的 `display.bounds`)。③ `src/lib/recordingSession.ts`:`RecordingWebcamSettings.position` + 归一化校验。④ `electron-env.d.ts` 类型。⑤ `recordingSessionEditorState.ts`:把会话里的 position 换算成 `webcamPosition`(整屏直接用;框选区域录制再换算到裁剪区域内,均 clamp 到 [0,1])。compositor(`compositeLayout` L348)预览与导出共用同一 `webcamPosition`,所以**预览和导出都跟手**。
  - 范围/边界:多显示器下把叠加窗拖到非被录屏幕属边缘情形(按所在显示器归一化,录制只含被录屏);常见单屏场景正确。需负责人**重录一段**(移动头像→停→进编辑器看画中画是否在录制时的位置 + 导出确认)。
  - **修订(负责人复测:录制*前*的调整有效,录制*中*的拖动/缩放不被成品记录 → 即只用了录制前快照):** 根因是录制过程中叠加窗的 `move/resize` 事件没把最终状态同步上(只在录制前同步过)。改法:`cameraOverlaySettings` 加**实时刷新回调**(`setCameraOverlayLiveMetricsProvider`),`windows.ts` 注册"从当前叠加窗 `getBounds()` 重新同步 size+position";**保存会话读取设置时先刷新一次** → 拿到的是"录制结束时"窗口的真实位置/大小(录制中拖动/缩放也算)。`getBounds()` 与事件无关,所以即使 move 事件没触发也能拿到最终值。加**防重入守卫**(provider→update→snapshot→又读 recording 会无限递归)。新增 3 条单测覆盖刷新/防递归/clamp。
  - 验证:`tsc`(含 electron)零错误 · `lint` 过 · `npm test` **221 passed**(+3 camera overlay)· build + `resign-local.sh` 全过(`com.sgd.inkast` 稳定签名)。

- **D18b §3「插入图片」按钮改回普通功能按钮(去掉显眼绿色)。** 负责人反馈它不必做得那么特别(以后旁边会并列"插入视频"等),且插入类型不止图片。改为中性 ghost 样式的带文字按钮(仍可见、不喧宾夺主),并新增**把图片直接拖进预览**插入叠加层(绿色虚线提示)。

## 2026-06-17 · Demo 效果 §3 叠加轨 · Phase 1 图片叠加(本地 Code 执行)

- **D17 图片叠加(画中画)复用现有 annotation image 管线实现,不新建数据模型。** 要求见 `docs/Inkast_Demo效果_完整要求.md` §3,对照 `Inkast-剪辑器-完整版-Demo.html`。
  - 关键发现:`AnnotationRegion type:"image"` 已具备图片叠加的**完整管线** —— 数据模型(`imageContent` dataURL + `position`/`size`/`zIndex`)、预览渲染+拖动+右下角缩放(`AnnotationOverlay` 用 react-rnd)、导出合成(`annotationRenderer.renderImage` 走 `frameRenderer`)。**§3 Phase 1 = 把它补成一等公民,而非重写**(符合"复用优先")。
  - 补的 3 个缺口:
    1. **直接「插入图片」入口**:时间线工具条新增按钮 → 隐藏 file input → 在播放头插入一张图片叠加层(默认 5s、画面居中、自动选中)。原来要"先加文字标注再切 image 类型",太绕。(`TimelineEditor` 新增 `onInsertImageOverlay`;`VideoEditor` 加 `handleInsertImageOverlay`/file 读取。)
    2. **不透明度**:`AnnotationRegion` 加 `opacity?: number`(0–1,undefined=1);预览(`AnnotationOverlay` img style)、导出(`annotationRenderer` globalAlpha)、工程存读(`projectPersistence` 归一化)三处都接上。
    3. **『画面』数值控件**:选中图片叠加层时,右侧面板(`AnnotationSettingsPanel` image tab)显示 位置X/Y + 宽度(%)数值输入 + 画面居中 + 不透明度滑杆(props 经 `SettingsPanel` 透传)。位置/大小本来就能拖,数值控件是精调 + 不透明度的唯一入口。
  - 取舍/范围:图片叠加层目前**落在 annotation lane(标注轨)**,不是独立「叠加轨」—— 这是 Phase 1 复用换来的低风险。独立叠加轨 + **视频片段叠加**(需新 `OverlayClipRegion`:视频源引用 + 自身 trim + 第二视频解码合成)是 **Phase 2**(§3 第二个验收点,"真功夫"在导出合成)。
  - 验证:`tsc` 零错误 · `lint` 过(仅既有 DrawOverlay warning)· `npm test` **218 passed** · `vite build` 过。**纯前端,未重新 electron-builder**(避免把签名包打回 adhoc;审 §3 用 `npm run dev` 导入视频即可,无需录屏/签名)。待负责人验收"图片叠加导出正确"后做 Phase 2。

## 2026-06-17 · Demo 效果 §2 UI 清晰化(本地 Code 执行)

- **D16 编辑器 UI 按 `Inkast-UI-样板.html` 方向 A「清晰版」理顺,不动任何功能。** 要求见 `docs/Inkast_Demo效果_完整要求.md` §2。逐条:
  1. **Inspector 固定标题区**(`SettingsPanel.tsx`):面板顶部常驻 crumb + 标题。全局模式显示「全局设置 / 当前 tab 名」;选中时间线片段时显示「正在编辑选中片段 / ● 放大 N」+「← 返回全局」(新 props `selectedRegionLabel`、`onClearTimelineSelection`,VideoEditor 用与底部时间线相同的 `labels.zoomItem` 序号生成片段名)。选中片段描边加强(`ItemGlass.module.css` 给红/黄/琥珀 selected 补 4px 外环,与绿色一致)。
  2. **icon rail 分组 + 文字**:rail 分「画面」(背景/外观/摄像头/光标/裁剪)与「项目」(导出)两组,每项图标下加短文字标签(新 `settings.rail.*`)。**移除与底部时间线重名的「时间轴」rail 项**——其唯一的音频波形开关移到底部时间线工具条(`TimelineEditor` 新增 `onTrimWaveformChange` + AudioLines 切换钮,波形显示在时间线上、工具条是其自然归属)。光标项改用专属 `cursor.title`(原误用 `effects.title`)。
  3. **颜色语义**:审计确认编辑器已遵循 绿=主行动/选中、红=破坏性/删除;录制态红色在 HUD(§1 范畴)。无「绿色既表选中又表录制」过载。本块只做选中描边强化(见 1)。
  4. **文案人话化**:源选择 `分享`→`开始录制`(改用 `launch.sourceSelector.startRecording`,原 `common.actions.share` 不再引用;「框选区域」也 i18n 化);空状态补「录制新视频」作并列第一入口(主行动绿,触发既有 `startNewRecording`);`Effects`→「画面外观」、`Layout`→「摄像头布局」;时间线工具条 tooltip `添加缩放/剪辑/…`→「放大/剪掉/标注/打码/变速」,区域标签同步(`timeline.labels/buttons`)。
  5. **低频项收纳**:`报告错误 / 保存诊断 / GitHub 加星` 从 Inspector 底部移到编辑器顶栏新增「帮助」下拉菜单(`SettingsPanel` 删 `commonFooterLinks` + `onSaveDiagnostic` prop;VideoEditor 顶栏加 DropdownMenu,复用 `handleSaveDiagnostic` + `openExternalUrl`)。
  - 改动文件:`SettingsPanel.tsx`、`VideoEditor.tsx`、`timeline/TimelineEditor.tsx`、`timeline/ItemGlass.module.css`、`EditorEmptyState.tsx`、`launch/SourceSelector.tsx`,i18n `zh-CN`+`en` 的 `settings/timeline/launch/editor.json`。**复用优先**:新增 props/i18n key,未改任何业务逻辑;波形开关是同一状态换位置。
  - 验证:`tsc --noEmit` 零错误 · `npm run lint` 通过(仅既有 DrawOverlay hook warning)· `npm test` **218 passed** · `vite build` + `electron-builder --mac --arm64 --dir` 全过。**未碰签名身份 / `resign-local.sh` / TCC**(resign 留负责人执行,或用 `npm run dev` 审 UI)。
  - 待负责人验收「界面更清楚」后再进 §3(叠加轨)、§4(智能粗剪)。

## 2026-06-17 · A-② 真机验收结果 + 光标路线定档(本地 Code + 负责人)

- **D15 A-① 在 mac 失败(`cursor:"never"` 被 ScreenCaptureKit 忽略);负责人拍板"保持现状",不做 A-③、不做路线 B。**
  - 验收方式(Code 直接取证,非主观目测):抠了负责人 2026-06-17 01:36 那段 `editable-overlay` 录屏(`recording-1781685366400.webm`,A-① 新 build)在两个点击坐标处的原始帧 → **两处都有清晰的真·箭头光标烙进视频**。即 Chromium 在 macOS 的 `getDisplayMedia`(SCK 后端)**不认 `cursor` 约束**(Windows 才认)。A-① 无法产出"无系统光标的视频"。
  - 由此:**A-③ 不能做** —— D13 当前让 mac 不叠加,所以画面只有一个真光标、无重影;一旦重开叠加层就会在真光标上再叠一个 = 双光标回归。
  - **意外发现(修正交接文档的假设):** mac 端光标遥测 `provider:"native"` 其实**已抓到真实光标位图**(本段含**箭头 + I 字梁**两种,带 hotspot/scaleFactor,存于 `.cursor.json` 的 `assets[].imageDataUrl`)+ 点击事件。所以"形状/点击"数据**不是瓶颈**,唯一瓶颈是排不掉烙进的系统光标。这意味着将来若走路线 B(或正式签名),叠加层能直接渲染真形状,不会"恒为箭头"。
  - **负责人决定(2026-06-17):选「保持现状」。** 当前 build(A-① + D13)= 单个真·系统光标、无重影、形状会变、**零权限弹窗**,负责人实测"非常正常"。即终态。**保留 A-①**(getDisplayMedia,现代且与 win32 统一、无回归;`cursor:"never"` 在 mac 是无害 no-op),**保留 D13**(mac 不叠加)。
  - 未做、留作将来:路线 B(原生 SCK `showsCursor=false` → 无光标视频 + 叠加真形状光标 + 点击高亮 + §3 弹簧平滑)。代价=录屏权限弹窗回归(推翻 D10);彻底无弹窗的版本需 Apple 开发者账号正式签名+公证。§3 光标平滑升级也一并搁置(只对叠加层有意义,现状无叠加)。
  - 验证:改的是代码注释 + 文档,逻辑无变化;`tsc --noEmit` 零错误。未碰打包/签名/TCC。

## 2026-06-16 · Screen-Studio 干净光标 路线 A-①(本地 Code 执行)

- **D14 macOS 录屏改走 `getDisplayMedia` 并请求 `cursor:"never"`,把系统光标排除在视频本体外(为编辑器叠加平滑光标铺路)。**
  - 背景:D13 只是"mac 不叠加、直接用烙进的真光标"消除双光标,但拿不到干净/可美化光标。要 Screen-Studio 质感,必须采集端就不带系统光标。交接见 `docs/Inkast_ScreenStudio光标重写_交接.md` 路线 A。
  - 改法(`src/hooks/useScreenRecorder.ts` 约 L1169):把原 `if (platform === "win32")` 的 getDisplayMedia 分支扩展为 `win32 || darwin`。mac 仍是 **App 进程内捕获**——getDisplayMedia 经 `electron/main.ts` 同一个 `setDisplayMediaRequestHandler`(已确认跨平台供预选源、`useSystemPicker:false` 不弹系统选择器)拿源,**不重新启用原生 SCK helper、不引入新录屏权限弹窗**,与 D10 的权限持久路线一致。`editable-overlay` 模式下传 `cursor:"never"` 排除系统光标。linux 等仍走 legacy getUserMedia 分支。
  - 系统音频说明:loopback 内录在 Electron 41 **仅 Windows** 由 handler 提供(已查 electron.d.ts);mac getDisplayMedia 不带系统内录音频——但旧 `chromeMediaSource:"desktop"` 音频在 mac 本就不可用,故无回归、不崩溃,只是无系统声(麦克风照常)。
  - 验证:`tsc --noEmit` 零错误;`npm test` 218 passed;`vite build` + `electron-builder --mac --arm64 --dir` + `resign-local.sh` 全过(签名 valid,screen-capture/camera/audio-input entitlements 在)。**未碰打包配置/签名身份/TCC。**
  - ⏳ 待负责人 A-② 真机验收:录一段进编辑器看**视频本体里还有没有会变形的真光标**。无 → mac 认 `cursor:"never"`,做 A-③(VideoEditor 重开 darwin 叠加层)。有 → mac 不认,回退本改、走路线 B(原生 SCK,但会触发权限弹窗回归,需负责人拍板)。
  - A 的已知局限:叠加光标来自 JS 位置遥测、无形状/点击数据 → 恒为箭头(平滑单个无重影,但不随状态变 I 字梁/手型)。要真形状+点击高亮 = 路线 B。

## 2026-06-16 · 修复 macOS 光标重影(双光标)(Cowork 会话)

- **D13 macOS 不再叠加平滑光标,直接用录像里烙进的真·光标。**
  - 根因:`cursor:"never"`(排除系统光标)只在 `useScreenRecorder` 的 `if(platform==="win32")` 分支设置;macOS 经 `FORCE_GET_DISPLAY_MEDIA_ON_MAC` 走 getUserMedia 桌面采集,**无法排除系统光标 → 已烙进视频**。而 `VideoEditor.hasEditableCursorRecording` 仍含 `darwin`,于是又叠加一个**恒为箭头**(OpenScreen 默认资源、不随状态变形)且滞后的平滑光标 → mac 必现双光标,快移时拉开 = 重影。
  - 改法:`VideoEditor.tsx` 的 `hasEditableCursorRecording` 条件去掉 `darwin`(仅 `win32` 启用叠加层)。mac 直接显示录像里的真光标(会变形状、OS 渲染够平滑),叠加层关闭 → 重影消除。`effectiveShowCursor`/`showCursorSettings` 在 mac 随之关闭(它们本就只服务于那个失效的叠加层)。tsc 零错误。win32 不受影响(那边 cursor:"never" 真生效,叠加有意义)。
  - 取舍:mac 暂时拿不到"再平滑/美化"的光标。要做真平滑光标需采集端排除系统光标(原生 SCK `showsCursor=false`),与 D10(为权限持久化禁用原生 helper)冲突,留负责人定。

## 2026-06-16 · 自动跟随重写为弹簧相机(Cowork 会话)

- **D12 自动跟随相机从一阶指数平滑重写为带速度状态的临界阻尼弹簧。**
  - 背景:D11 的调参(调缓常量)负责人实测**仍跳屏/抖动/鼠标重影**,确认问题不在参数大小,而在模型——无速度的指数平滑遇到 target 突变会顿(跳屏)、对噪声只能靠死区(残留抖动)。
  - 改法:`videoPlayback/autoFollowSmoothing.ts` 重写。`smoothAutoFollowFocus` 现持有/返回 `AutoFollowState{focus,vx,vy}`,用临界阻尼弹簧(`damping=2√k`)积分:无超调(治抖动)、速度连续(吸收突变、治跳屏)、固定步长子积分(预览/导出一致)、死区随 `zoomScale` 收紧(治放大微抖)。手感单旋钮 `STIFFNESS`(默认 90)。
  - 连带:两个调用点(`VideoPlayback.tsx` 预览、`lib/exporter/frameRenderer.ts` 导出)改存 state、读 `.focus`、传 `zoomScale`;单测重写为 5 断言。`constants.ts` 里旧的 `AUTO_FOLLOW_SMOOTHING_FACTOR*`/`RAMP_DISTANCE` 现已不被引用(保留未删)。
  - 验证:`tsc --noEmit` 零错误;5 断言等价复算全绿。**完整 test/build/resign 待负责人 Mac 跑**。未碰打包/签名/TCC。`computeZoomTransform` 与光标重影留待真机复看后按需处理。

## 2026-06-16 · 自动跟随镜头再调缓(手感,Cowork 会话)

- **D11 把相机自动跟随(`focusMode:"auto"`)默认调得更"慢而稳"。**
  - 背景:负责人多轮反馈"自动放大/鼠标移动太快、看着累"。读代码确认效果引擎已成熟(spring 光标平滑 + `easeOutScreenStudio` + deadzone + 自适应平滑 + 自动建议密度控制),**非缺平滑,是默认手感偏快**。
  - 改动:`videoPlayback/constants.ts` 仅两处常量 —— `AUTO_FOLLOW_SMOOTHING_FACTOR_MAX 0.16→0.12`、`AUTO_FOLLOW_SMOOTHING_FACTOR 0.045→0.038`。指数平滑,factor 越小镜头追得越慢越稳。预览/导出共用,改一处两端同步。
  - 为何只动这两处:**光标本身**的速度已是用户滑杆(Cursor 面板「平滑度」),用户可自调;相机自动跟随系数是硬编码、用户改不了,所以优先动它。未碰打包/签名/TCC。
  - 验证:`tsc --noEmit` 零错误;`autoFollowSmoothing.test.ts` 三断言等价复算仍绿。**完整 test/build/resign 待负责人在 Mac 跑**。属"手感"改动,需真实录屏复看后定值(可继续降或调回)。后续可升级为 UI 滑杆。

## 2026-06-01 · 项目立项与命名

- **D1 以 OpenScreen 为脚手架二次开发(不从零写)。**
  - 仓库 `siddharthvaddem/openscreen`(MIT,37.9k★,活跃)。克隆为本目录 `Inkast`,保留上游 git 历史以便后续 `pull` 上游更新。
  - 理由:录屏/缩放/背景/时间轴/导出/光标美化已较完整,我们只需补"边录边画"实时层。

- **D2 项目名定为 `Inkast`(目录 `30_桌面App/Inkast`)。**
  - 含义:Ink(笔迹)+ (broad)cast(录播)= 实时把笔迹录播出去,精准对应"边录边画"。
  - 选它是因为:生造词(商标显著性强),且 npm 名可用、GitHub 仅 0★ 玩具项目、`inkast.com` 是待售停放域名(无在营产品)。
  - 排除项:LiveDraw(同类开源工具撞名)、Inkly(在营贺卡品牌)、Skribo(SKRIBO 文具连锁,邻近行业)。
  - ⚠️ **仅做了 npm/GitHub/DNS 轻量筛查,非正式商标检索。商业化前须做 USPTO/中国商标网正式检索。** App 显示名/目录名后期可低成本更名。备选名:Strokely。

- **D3 落地目录用 `30_桌面App/`(非 `50_产品原型/`)。**
  - 理由:这是长期 Electron 桌面工程,符合仓库 AGENTS.md"桌面 App 归 30_桌面App、不要把长期开发放原型/根目录"。

- **D4 v1 "边录边画"绑定"显示器/整屏捕获"(方案 A)。**
  - 代码级依据(已读 Swift 源码):显示器捕获 `SCContentFilter(display:, excludingWindows: [])` 不排除任何窗口 → 透明置顶覆盖窗会被录进画面;单窗口捕获 `desktopIndependentWindow` 只录单窗 → 录不到覆盖窗。
  - 单窗口捕获 + 实时笔迹属"方案 B(帧合成)",列为后期。

- **D5 录制实为原生 ScreenCaptureKit(非产品文档假设的 desktopCapturer)。**
  - 影响:Phase 0 增加一步 `npm run build:native:mac`(编译 Swift helper,需 Xcode;本机 macOS 26.5 + Swift 6.3.2 已具备)。
  - 利好:原生光标采集 + 平滑已基本实现,Phase 2"光标美化"由"从零(🔴)"降为"复用"。

## 2026-06-01 · Phase 0 期间修的两个启动 Bug(上游 OpenScreen 就有)

- **D6 Vite dev server 绑定 IPv4。** `vite.config.ts` 默认 host=localhost 在本机绑成 IPv6-only(`::1`),Electron 渲染层连不上 → 白屏。已加 `server.host="127.0.0.1"` + `strictPort`。
- **D7 麦克风权限请求改为非阻塞。** `electron/main.ts` 原来在 `app.whenReady()` 里 `await askForMediaAccess("microphone")`,而 `createWindow()` 在该链路末尾 —— 用户没点权限弹窗前,**整个 App 不出窗口**(实测 0 个 renderer/GPU 进程)。改为不 await(后台请求),窗口立即出现;录制流程仍会按需再申请麦克风权限。
  - 这两个修复都加了中文注释说明原因,方便日后理解;属于我们 fork 的本地改动。

## 2026-06-02 · 打包与权限(摄像头授权问题根因)

- **D8 本地打包后必须重新 ad-hoc 签名(带 entitlements)。** 无 Apple 开发者证书时,`electron-builder` 会**跳过真正签名**,产出的 `Inkast.app` 只是 `Identifier=Electron` 的 linker adhoc 签名、**不含任何 entitlements** → macOS TCC 不给摄像头/麦克风/屏幕录制授权(系统设置里都找不到它)。
  - 修复:`codesign --force --deep --options runtime --entitlements macos.entitlements --identifier com.sgd.inkast --sign -`,身份变为 `com.sgd.inkast` 且嵌入 camera/audio-input/screen-capture。已封装为 `scripts/resign-local.sh`,**每次本地构建后都要跑**。
  - 决定先走"打包 + 本地 ad-hoc 签名"路线给用户一个稳定可见、可截图、权限正常的 Inkast.app;dev 模式(npm run dev)留作 Phase 1 写代码用。

## 2026-06-02 · TCC 授权反复弹窗(签名身份不稳定)

- **D9 用稳定证书签名,而非 ad-hoc,让屏幕录制/摄像头/麦克风授权跨重建保留。**
  - 现象:每次开始录屏都弹权限请求,授权也"记不住"。根因:`resign-local.sh` 之前用 ad-hoc(`--sign -`),**每次重建签名身份(cdhash)都变** → macOS TCC 视为新 App,授权随之失效。
  - 修复:改用 keychain 里的**稳定自签名证书**(当前复用已存在的 `Notch Island Local Dev`;`resign-local.sh` 自动选取第一个有效签名身份,无则回退 ad-hoc 并告警)。用户对该身份**授权一次 + 重启**后长期有效,后续重建不再反复弹窗。
  - 后续可建专属 `Inkast Dev` 证书(更自包含;切换证书会让用户重新授权一次)。

## 2026-06-02 · 录屏权限持久化:改走 App 进程内捕获

- **D10 macOS 录屏改用 Electron `getDisplayMedia`(App 进程内捕获),而非独立原生 SCK helper。**
  - 根因:原生 helper 是独立进程 → macOS 视其为独立的"屏幕录制"TCC 主体;自签名(无 Team ID、未公证)下不与 Inkast 归组、也不持久记住其授权 → **每次录屏都重弹**。
  - 改法:`src/hooks/useScreenRecorder.ts` 加 `FORCE_GET_DISPLAY_MEDIA_ON_MAC = true`,在调用点跳过 `startNativeMacRecordingIfAvailable`,落到 getDisplayMedia/getUserMedia(桌面源)→ 捕获发生在 **Inkast 本体进程**,权限归 Inkast(稳定证书)→ 可持久。
  - 代价:暂时拿不到原生 helper 的光标元数据(编辑器光标平滑属 Phase 2);基础录屏 + 边录边画不受影响。将来正式签名/公证后把该 flag 置 `false` 恢复原生路径。
  - 不保证 macOS 26 永不再提示(自签名仍可能周期性提示),但比独立 helper 大幅改善。经用户确认采用此方案。

## 待定 / 后续

- 是否在 GitHub 建私有 fork 作远程备份(当前纯本地,`gh` 已登录 `sgd-shine`,需要时一句话即可建)。
- App 图标资源(Phase 0 改图标占位,正式图标后补)。
