# Inkast 界面对齐(纯换肤 + 左侧媒体面板)— 交接文档

> 产出于 2026-06-19 会话末(上下文将满,负责人决定新会话实现)。
> 决策依据见 [DECISIONS.md](../DECISIONS.md) **D25**;进度见 [STATE.md](../STATE.md)。
> **新会话请先读本文 + STATE.md 顶部 + DECISIONS.md D22–D25。**

---

## 0. 一句话目标

把现在这个「OpenScreen 录屏效果编辑器」的**外观**对齐负责人设计的 Demo(剪映/CapCut 风),并加一个**左侧媒体面板**——但**只做换肤 + 重新摆放已有功能**,不引入新的剪辑内核。

## 1. 范围(负责人 2026-06-19 明确拍板)

**要做:**
- 🟢 **纯换肤**:标题栏、时间线、工具条、Inspector、智能粗剪面板对齐 Demo 视觉。
- 🟢 **左侧媒体面板(媒体 bin)**:列出录制的/导入的素材(图片、视频),**拖进预览当画中画叠加 / 插入**。建立在现有「单一主视频 + 效果区间叠加」模型上,**只是重新摆放已有的"插入图片/视频"能力** + 顶部 Tab 导航。

**明确不做(负责人原话:不需要):**
- ❌ 贴纸、滤镜、转场、特效库。
- ❌ **多片段时间线 / clip 模型**(导入多段视频拼接/分割/排序/磁吸)——这是重写内核、数周的独立路线,**本次不碰**。负责人选的是"媒体面板"档(低风险,约 1 周),不是"多轨剪辑"档。

> ⚠️ 实现时若发现某个 Demo 元素隐含 clip 模型(如主轨上多段视频、分割/左删右删按钮),**停下来确认**,不要顺手实现——那超出本次范围。

## 2. 当前状态(已完成,别重做)

Demo 文档(`docs/Inkast_Demo效果_完整要求.md`)四大块**功能层面全部有可用版**:
- ① 录屏/光标/自动放大(D12/D14/D15)
- ② UI 清晰化(D16)
- ③ 图片/视频叠加轨(D17/D19)
- ④ 智能粗剪:删停顿(D20)+ 删废话/语气词(D21)+ 逐条复核面板(D23)+ 自动字幕(D24)
- 口播提词器(D22,内容保护、不录入,HUD 有按钮)

**本次是纯 UI 改造,不动上述功能逻辑。** 现状态模型(`EditorState`)、导出管线、撤销/重做都保留。

## 3. 设计参考(Demo 静态稿)

在 `40_内部工具/`(即 `~/AI-Agent/40_App实验室/40_内部工具/`):
- **`Inkast-剪辑器-完整版-Demo.html`** ← 主参考(整个编辑器布局)
- `Inkast-UI-样板.html` ← 样式系统 + 板①②③/录制HUD/空状态/导出流程(app 已采用**板① 方向A**)
- `Inkast-智能粗剪-Demo.html` ← 智能粗剪侧面板样式(转写 + 废话蓝/停顿黄 chip + 统计卡 + 一键粗剪)
- `Inkast-效果引擎-Demo.html` ← 算法 spec(已实现,不用动)

**设计 token(Demo 与现 app 已基本一致,只需对齐零星漂移):**
- 背景 `#0A0C0E` / 页 `#070809` / 面板 `--panel:#15181C` `--panel2:#1B1F24` `--panel3:#22272D`
- 线 `rgba(255,255,255,.07)` / `.13`;文字 `#E7EBEF`(主)`#98A2AD`(次)`#5F6B76`(弱)
- 绿(主操作/选中)`#34B27B` / hi `#3DC489` / soft `rgba(52,178,123,.14)`;绿按钮上的字用墨色 `#06140d`
- 语义:红 `#F25563`(录制/播放头)、蓝 `#5AA0E6`(文本/标注)、黄 `#E0A23C`(打码)
- 圆角 `--r-lg:14px` `--r-md:10px` `--r-sm:7px`;面板卡 ~12px;字体 `-apple-system, "SF Pro Text", "PingFang SC"`,数字用 tabular-nums
- ⚠️ 现 app 个别处用 `#09090b`,Demo 用 `#0A0C0E`/`#070809`——对齐即可。

## 4. 分阶段计划(低风险优先,每阶段打包验收)

> 全程**只改 JSX/CSS/文案/Props 摆位**,不改 `EditorState`/导出/撤销逻辑。每阶段做完跑验证链(见 §6)+ 打包给负责人看。

### Phase 0 — Token & 标题栏 chrome(纯视觉,~0.5 天,零逻辑风险)✅ 已完成(2026-06-19,见 DECISIONS D26)
- ✅ 对齐零星 token:全局 `#09090b`→`#0A0C0E`(11 文件)。`#070809` 在标题栏/预览本就正确未动;时间线近黑变体留 Phase 1 统一 `#0C0F12`。
- ✅ **比例下拉从时间线工具条搬到标题栏右侧 + 绿色「导出」按钮**——比例逻辑抽成 `VideoEditor.handleAspectRatioChange`;导出复用 `handleOpenExportDialog`;两者仅有视频时显示;`TimelineEditor` 删掉 `aspectRatio`/`onAspectRatioChange` props。Inspector 导出面板保留。
- ⏭️ 可选的 `文件/编辑/视图/帮助` 菜单条:**跳过**(现标题栏已是功能化按钮,装饰性菜单反而降 UX)。
- 验证:tsc 0 · lint 仅既有 DrawOverlay 警告 · biome 无 fix · 259 tests。**待负责人 `npm run dev` 目测**(导入视频→看标题栏右侧比例+导出)。

### Phase 1 — 时间线外观对齐 ✅ 已完成(2026-06-19,见 DECISIONS D29)
- ✅ 左侧标签列:激活 dnd-timeline 既有 `sidebarWidth`(`TimelineWrapper` 设 96),`Row.tsx` 渲染图标+轨道名;波形/空提示移进 lane;lane 须 `display:flex` 保证片段竖直定位。
- ✅ sticky 刻度尺(`TimelineAxis` 加 `sticky top-0 z-20`);✅ 工具条 6 个效果按钮 icon→icon+文字;✅ 时间线统一 `#0C0F12`。
- ✅ 未加任何 clip 按钮。验证 tsc 0 / lint 既有 / 263 tests,已 build+resign+ditto。

<details><summary>原 Phase 1 计划(存档)</summary>


- 给现有 6 条效果轨(`row-zoom/trim/annotation/blur/speed/overlay`)加**左侧标签列**(图标 + 名称:放大/剪辑/标注/打码/变速/叠加),仿 Demo 的 `.trk-h`(96–120px)。
- 加 sticky 刻度尺带(ruler)。
- 工具条按钮从 **icon-only → icon+文字**,按 Demo 分组加分隔。
- **只给现有的东西贴标签/换皮,不要加 分割/左删右删/镜像/磁吸 等按钮**(那些没有后端逻辑,属于 clip 模型)。
- 文件:`timeline/TimelineEditor.tsx`(工具条 `~:1690`、轨 `~:825-945`)、`timeline/Row.tsx`(现在无标签列)。
</details>

### Phase 2 — 智能粗剪做成右侧面板 ✅ 已完成(2026-06-19,见 DECISIONS D30)
- ✅ `SmartCutPanel.tsx`:头部 + 3 统计卡(废话/停顿/可省 Xs)+ 分组操作(删停顿 / 识别废话→删语气词+逐条复核 / 字幕)。全部复用既有 handler。
- ✅ 时间线工具条智能粗剪 `DropdownMenu` → 一个按钮(`onOpenSmartCut`);相关 props 从 `TimelineEditor` 移除。逐条复核仍用 `TranscriptReviewPanel.tsx`。

### Phase 3 — 3 栏布局 + 顶部功能 Tab + 左侧媒体面板 ✅ 已完成(2026-06-19,见 DECISIONS D31)
- ✅ deck 2 栏 → 3 栏:`index.css` `.editor-main-deck` 改 `grid-template-areas`("media preview inspector",含 ≤1240/≤1020/≥1900 断点)。
- ✅ `MediaPanel.tsx`:顶部 Tab「媒体 / 智能」。媒体 = 插入图片/视频(复用 `triggerInsertImageOverlay`/`triggerInsertVideoOverlay`,也支持拖进预览)+ 素材概览。智能 = 内嵌 `SmartCutPanel`。时间线「智能粗剪」按钮切到「智能」Tab。
- ⚠️ **取舍**:只做了**媒体 + 智能**两个 Tab(真正新增的左栏内容);**文本(标注)/调节(背景)仍留右 Inspector**(已有且好用,重路由风险高、收益低,故不动)。
- ✅ 坐标安全已确认:`overlaySize` 是 ResizeObserver 实测,预览变窄自动重算 → 预览=导出成立(见 §5)。**仍强烈建议真机核对**带叠加+字幕+放大的工程。

## 5. ⚠️ 关键结构注意(Phase 3 唯一真风险)

2 栏 → 3 栏会**改变预览容器的尺寸**,而这些东西的坐标**全依赖预览容器尺寸**,改完必须逐一核对**预览=导出**没错位:
- 叠加图片/视频(`OverlayClipLayer`)、**字幕(`SubtitleOverlay`,本会话刚加)**、自动放大 focus、摄像头画中画(`compositeLayout.ts`)、原生光标 clip。
- 预览尺寸来源:`VideoPlayback.tsx` 的 `overlaySize`(containerWidth/Height);很多东西按它换算百分比↔像素。
- 做法:加左列后,先确认 `overlaySize` 仍正确反映预览实际像素,再继续;用一个带叠加+字幕+放大的工程,改前改后对比预览与导出帧。
- `index.css` 注释提到过 issue #305(HUD 100vw 溢出滚动条)——改 grid 时注意别引入横向滚动条。

## 6. 铁律 + 打包/验证流程(务必照做)

**项目铁律(绝不碰):**
- ❌ 不改签名身份、不动 `scripts/resign-local.sh` 的证书、不碰 TCC 权限链。
- ❌ 永不 `tccutil reset`。
- 录屏 TCC 绑在**代码签名身份**(`com.sgd.inkast` / `Notch Island Local Dev`),所以**每次 electron-builder 后必须 resign**,否则留下 adhoc 坏包→反复弹录屏授权。

**每阶段验证链(全绿才算完):**
```
npx tsc --noEmit
npm run lint            # 应为 1 个既有 DrawOverlay 警告;别引入新的
npx biome check --write <改过的文件>
npm test                # 当前基线 259 passed
# 要让负责人真机看时(纯前端 UI 改动其实 npm run dev 即可审,但录屏功能必须打包版):
npx vite build && npx electron-builder --mac --arm64 --dir && bash scripts/resign-local.sh
rm -rf /Applications/Inkast.app && ditto "release/1.4.0/mac-arm64/Inkast.app" /Applications/Inkast.app
codesign --verify --deep --strict /Applications/Inkast.app   # 须 exit 0
```
- **打包后必须 `ditto` 到 /Applications**(负责人从启动台/Spotlight 开;否则找不到/测到旧版)——见 STATE 的 D-workflow。
- 纯 UI 改动**别频繁 electron-builder**;`npm run dev` 或导入视频即可审 UI(dev 不能测录屏,身份不稳)。
- ⚠️ **别用 `asar extract-file <a> <path> <out>` 验证打包**——asar 会忽略 out 参数把文件解到**仓库根**(`preload.mjs`/`main.js`),污染 `biome check .`(D23 踩过)。要看包内文件用 `asar extract <a> /tmp/xxx`。

## 7. 验收方式
- 每阶段:`open /Applications/Inkast.app`(或 `npm run dev` 审纯 UI)→ 负责人目测"更像 Demo 了 + 功能没坏"。
- 重点回归:叠加/字幕/放大在预览和导出里位置一致;智能粗剪/转写/字幕仍能用;录屏授权不反复弹。

## 8. 现有关键文件地图(改造会用到)
- 编辑器壳:`src/components/video-editor/VideoEditor.tsx`(标题栏 ~2528、deck ~2668、Inspector 挂载 ~2779、时间线挂载 ~2962)
- 右 Inspector:`src/components/video-editor/SettingsPanel.tsx`(rail ~831、crumb ~896、面板模式 ~618)
- 时间线:`src/components/video-editor/timeline/TimelineEditor.tsx`(工具条 ~1690、轨 ~825–945、比例下拉 ~1969)、`timeline/Row.tsx`(无标签列)
- 布局 CSS:`src/index.css`(`editor-main-deck` grid ~87)
- 预览/坐标:`src/components/video-editor/VideoPlayback.tsx`(`overlaySize`)、`OverlayClipLayer.tsx`、`SubtitleOverlay.tsx`、`src/lib/compositeLayout.ts`
- 状态模型:`src/hooks/useEditorHistory.ts`(`EditorState`)、`src/components/video-editor/types.ts`、`projectPersistence.ts`
- i18n:`src/i18n/locales/{zh-CN,en}/{editor,timeline,launch,settings,common}.json`(只需更新 en + zh-CN,其余 fallback 到 en)
- 已建好的 Demo 对应物:`EditorEmptyState.tsx`、`ExportDialog.tsx`、`TranscriptReviewPanel.tsx`
