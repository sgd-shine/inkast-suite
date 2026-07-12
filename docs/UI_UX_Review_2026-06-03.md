# Inkast Video Studio — UI/UX 设计评审报告

> 评审日期：2026-06-03 ｜ 顾问视角：真实用户 + 设计系统
> 约束：不改录屏/导出/项目格式/状态管理等底层逻辑；不做账号/云端/分享/素材市场；不做营销首页；保持桌面软件质感；优先提升"我知道下一步点哪里"。
> 本报告面向 Codex 落地，所有建议都标注了**文件 / 组件 / 具体改法**，可直接执行。

---

## 0. 评审依据（基于真实代码，非文字描述）

本次评审直接读取了仓库 `30_桌面App/Inkast` 的真实源码，关键事实：

| 维度 | 真实情况（代码取证） |
|---|---|
| 技术栈 | React + Vite + Electron + Radix UI + shadcn(new-york, base=stone) + Excalidraw + PixiJS + lucide/react-icons |
| 主题 token | `src/index.css` 暗色 `--background: 20 14.3% 4.1%`(暖黑/stone)、`--primary`(暗色)= **近白色**、`--muted-foreground` 为暖灰 stone |
| 品牌绿 | `#34B27B` 在 `src/` 中**硬编码约 190 次**（仅 hex；另有大量 `rgba(52,178,123,*)` 变体），未进入任何 token |
| 文字色 | 组件大量用**冷灰** `text-slate-200/400/500`（与暖灰 stone token 不同色温） |
| 画布底色 | `.editor-workspace` 用 `#08090b→#050606`（偏冷蓝黑）+ 绿色径向光晕，与 stone token 底色不一致 |
| 第二点缀色 | HUD 阴影用紫色 `rgba(100,80,200)` / `#6c55ff`；另散落 `#2563eb`(蓝)、`#d97706`/`#fbbf24`(琥珀) |
| 品牌名 | `package.json` productName = **Inkast**，但几乎所有用户可见文案仍写 **OpenScreen**（菜单"About OpenScreen"、"Save OpenScreen Project"、文件后缀 `.openscreen`、logo 资源 `openscreen.png`） |
| 右侧 rail | `SettingsPanel.tsx` `settings-mode-rail`，宽 `w-11`(44px)：Background / **Video Effects** / Layout(无摄像头时禁用) / Timeline / Cursor / Export。Crop 不在 rail，是弹窗 |
| 疑似 bug | `SettingsPanel.tsx` 中 Cursor rail 项 `label: t("effects.title")` → Cursor 的 tooltip 显示成 "Video Effects" |

关键文件：`EditorEmptyState.tsx`、`SettingsPanel.tsx`、`VideoEditor.tsx`(顶栏 ~L2089)、`launch/LaunchWindow.tsx`(录制 HUD)、`launch/SourceSelector.tsx`、`timeline/TimelineEditor.tsx`、`src/index.css`、`tailwind.config.cjs`、`src/i18n/locales/en/*.json`。

---

## 1. 一句话判断

**这是一个"工程师做给工程师用"的高密度暗色工作台——能力很强、质感在线，但它一直在让用户"读懂工具"，而不是"被工具引导"；越往深用越像在操作一台精密仪器，而不是在讲一个视频。**

---

## 2. 当前交互语言总结（设计模式）

1. **暗色玻璃工作台**：近黑底 + 半透明白描边面板(`rgba(255,255,255,0.075)`) + 大投影 + 16–18px 圆角，密度偏高、克制、专业，方向是对的。
2. **绿色 = 万能强调色**：`#34B27B` 同时承担选中、焦点环、主 CTA(Export)、滑块光晕、滚动条 hover、画布光晕——"什么都绿"导致"绿"不再有信息量。
3. **图标轨 + 上下文面板**：右侧 44px 竖向 icon rail 切换"全局设置"，选中时间线区域时同一块面板**整体替换**为"选中对象设置"，rail 高亮被抑制。
4. **快捷键内嵌进按钮文字**：时间线按钮直接写 `Add Zoom (Z)`、`Add Trim (T)`……把键盘语言塞进标签，专业但偏工程腔。
5. **浮动 HUD = 录制大脑**：底部可横/竖切换的悬浮控制条，拖动把手 + 源/音频/摄像头/光标开关 + 录制按钮，设备小面板 hover 展开。
6. **弹窗承载重操作**：源选择、Crop、导出进度、未保存提醒都走 Radix Dialog，主流程被打断成一连串模态。
7. **文案偏系统/工程**：源选择底部按钮是 **Share**(系统投屏隐喻)、错误提示是 "No cursor telemetry available"、品牌名混用 OpenScreen——更像开发者日志而非产品语言。
8. **结果优先于路径**：单个功能(缩放 3D、16× 变速、马赛克块大小)做得很细，但"先干什么、再干什么"的引导几乎为零——没有 onboarding、没有空选择提示、没有项目名。

---

## 3. 信息架构问题（最容易迷路/误解的地方）

**A. "全局设置"与"选中对象设置"共用一块面板，且无明确状态标识。**
选中时间线上的 Zoom 后，右侧整块换成 Zoom 设置，同时 rail 所有图标失活(`isActive = … && !hasTimelineSelection`)。用户看到的是"我的 Background/Effects 面板消失了"，却没有醒目的"你正在编辑：Zoom 2 / 点此返回全局"提示。这是最大的迷路点。

**B. 空状态没有"录制"入口，三种入口只露两种。**
`EditorEmptyState` 只有 `Import Video File…` 和 `Load Project…`，"录制新视频"完全不在这屏——它藏在编辑器顶栏的 "Return to Recorder"。新用户打开 Studio 会以为这工具"只能导入，不能录"。

**C. 拖拽语义自相矛盾。**
空状态可以拖 `.openscreen`，但拖视频会弹错误框"只能拖项目文件，导入视频请用按钮"。用户的心智是"拖进来就该能用"，这里却用弹窗惩罚了正确直觉。

**D. rail 里混入了一个"动作"和一个"单开关面板"。**
Export 是动作却和 Background/Effects 等"设置"并列在同一条 rail；Timeline 这个 rail 项点开后只有一个开关(Show Audio Waveform)——一个图标位浪费在单一低频开关上。

**E. Blur 概念重复。**
Blur 既是时间线工具(`Add Blur (B)`，独立 Blur 区域)，又是 Annotation 的一种类型(`typeBlur`)。两条路径做相似的事，用户不知道该从哪进。

**F. Crop 心智模型断裂。**
Crop 不在 rail 却是个全屏弹窗，和"在预览里直接框选"的预期不符；它和 Background/Layout 都改"画面构图"，却被放到完全不同的交互层级。

**G. 没有文档身份。**
顶栏(`VideoEditor.tsx` L2089)只有 语言 / Return to Recorder / Load / Save 四个 `text-white/50` 幽灵按钮，**不显示当前项目名**，右半边 44px 完全空着。用户无法一眼确认"我在编辑哪个项目、存没存"。

---

## 4. 关键用户路径评审

### 4.1 录制前（HUD + 源选择）— ★★★☆☆
浮动 HUD 信息齐全、可横竖切换是亮点。问题：
- 源选择像**系统投屏弹窗**而非"选择录制对象"：底部按钮叫 **Share**，文案 "Please select a source to record"，空/错状态还提到 "reopen OpenScreen"。应改成"开始录制这个画面"的语言与视觉。
- "光标模式"用 `Use editable cursor / Use system cursor`——"editable cursor"对普通用户是黑话，不知道选它能在录后换光标。
- HUD 上开关很多但**没有分组与层级**：源、系统音、麦、摄像头、光标平铺成一排同权重图标，"录什么"和"带不带音"没有视觉主次。

### 4.2 录制中 — ★★★★☆
红色 `record-pulse` 呼吸光晕、计时、暂停/继续/重录/取消齐全，状态清晰，是全 app 做得最好的一段。可再加：录制中把无关开关弱化/隐藏，只留"停止/暂停/取消"三件套，降低误触。

### 4.3 录后编辑（Studio + 时间线 + Inspector）— ★★☆☆☆
这是最该打磨的一段，也是问题最密集的：
- 上文 IA 问题 A（全局 vs 选中无标识）在这里集中爆发。
- 时间线对非剪辑用户偏"工程化"：`Add Zoom (Z) / Suggest Zooms from Cursor / Add Trim (T) …` 一排带快捷键的命令式按钮，没有"这些是什么、什么时候用"的引导；选中反馈弱。
- Inspector 标签不统一：Cursor 这个 rail 项的标签被错误复用成 `t("effects.title")`，于是它的 tooltip 也显示成 **"Video Effects"**（与 Effects 撞名，见 P0-5）；`Camera Shape` 与 `Webcam Size` 在同一面板混用 "Camera/Webcam" 两个词；`Blur BG`/`off`/`on` 缩写小写——细节标签零散。

### 4.4 导出 — ★★★☆☆
进度弹窗(Exporting / Rendering Frames / Finalizing / frames 计数 / Cancel)信息充分，成功有 Show in Folder，失败有红色诊断区，骨架是好的。问题：
- 配置(MP4/GIF、分辨率)在 rail 的 Export 面板，保存位置又是另一个系统弹窗，**"配置 → 选位置 → 进度 → 完成"被切成多个模态**，缺少一个"确认导出"的汇总点(格式 / 分辨率 / 预计大小 / 时长)。
- 成功态只有 Show in Folder，缺"再导一个 GIF / 返回继续编辑"的下一步。

---

## 5. 视觉风格建议

> 总原则：**降低"绿"的滥用、统一灰色色温、把颜色变成信息（区域类型配色）、修对比度**。质感不动，只做"秩序化"。

### 5.1 颜色与色彩审美（重点展开）

当前调色板的真实问题是**"三套灰 + 四种强调色 + 一个没被 token 化的品牌绿"**叠在一起，导致暗色界面看着"高级但发灰、发杂"。

**问题 1：品牌绿没有 token 化（190 处硬编码）。**
`#34B27B`、hover `#2d9e6c`、active `#27885c`、`rgba(52,178,123,*)`、以及零散的 `bg-green-500/emerald-500` 工具类同时存在——同一个"绿"在界面里是好几个略不同的绿。
→ **改法**：把品牌绿写进 `--primary`/`--accent`(暗色)，建立 `--brand-50…900` 一条色阶，全仓 `#34B27B` 系列替换为 `bg-primary text-primary border-primary ring-primary`。见附录 A 的可粘贴 token。

**问题 2：两种灰色色温打架。**
主题 token 是**暖灰 stone**(`--muted-foreground` ≈ `#a8a29e`)，组件却大量用**冷灰 slate**(`text-slate-400` ≈ `#94a3b8`)，画布底 `#08090b` 又偏冷蓝黑。暖底 + 冷字 = 整体发"脏"。
→ **改法**：选**冷中性**(更显"精密/专业")统一全栈。把 shadcn base 从 stone 切到 **zinc/slate**，token 底色对齐到画布的冷黑 `#0a0b0d`，然后用 `--muted-foreground` 取代散落的 `text-slate-*`。一套灰，立刻干净。

**问题 3：强调色过载，绿失去意义。**
绿(选中/CTA/焦点/滑块/滚动条/光晕) + 紫(HUD 阴影) + 蓝 + 琥珀 + 红(录制)。HUD 的紫色光晕(`rgba(100,80,200)`)和编辑器的绿光晕让"录制端"和"编辑端"像两个产品。
→ **改法**：
- **绿只做两件事**：主操作(Export/Share/Done)＋"激活/选中"。
- **红只做两件事**：录制状态 + 破坏性(Delete/Trim 删除段)。
- **琥珀只做警告**(权限缺失、不可放置)。
- **删掉 HUD 的紫色光晕**，统一成品牌绿(或彻底中性),让录制端与编辑端同源。
- 滚动条 hover、滑块光晕这类"环境绿"降到中性或极弱，省下绿给真正的主操作。

**问题 4（机会点）：用颜色编码时间线区域类型——把颜色变成信息架构。**
现在 Zoom/Trim/Speed/Blur/Annotation 在时间线上靠文字区分。给每类一个固定语义色，并在**时间线区块、Inspector 标题、区域徽章**三处一致使用：

| 区域 | 语义色 | 理由 |
|---|---|---|
| Trim | 红 `#ef4444` | 它=删除，红最直觉(与现有 trim 红一致) |
| Zoom | 品牌绿 `#34B27B` | 最常用、正向强调 |
| Speed | 蓝 `#3B82F6` | 中性"调速"，与删除/强调区分 |
| Blur | 紫 `#8B5CF6` | 遮挡/隐私，独特色 |
| Annotation | 琥珀 `#F59E0B` | "讲解元素"暖色，吸引注意 |

这样用户**扫一眼时间线就知道每段是什么**，是性价比最高的"我知道在看什么"改进。

**问题 5：对比度不达标。**
空状态的 `text-slate-600`(支持格式) / `text-slate-700`(拖拽提示) 在 `#09090b` 上几乎不可见，footer 的 Report Bug/Star 同理。最该被读到的引导反而最暗。
→ **改法**：正文次级文字 ≥ `#94a3b8`(slate-400)，辅助提示 ≥ `#cbd5e1` 不低于 `#8b96a8`；小字(<13px)走 AA。提升空状态两行提示对比度。

### 5.2 其余视觉维度（密度/面板/按钮/图标/字号/边框/动效）

- **密度**：上半区(预览+Inspector)可适当"留白升级"，下半区时间线保持紧凑。Inspector 段落间距从挤压改为 `space-y-3`+分组卡，减少"一堵设置墙"的压迫感。
- **面板**：白描边 `rgba(255,255,255,0.075)` 偏灰糊；统一到 `--border` token，并用 1px 内高光(`inset 0 1px 0 rgba(255,255,255,0.04)`)做层次，比加重描边更"贵"。
- **按钮**：建立**三级按钮**——Primary(实心绿，仅 Export/Done/确认录制)、Secondary(`white/5`+描边)、Ghost(纯文字，顶栏)。当前顶栏 4 个全 `white/50` 幽灵按钮，Save 没主次。
- **图标**：lucide 与 react-icons/bs 混用(HUD 用 `BsRecordCircle/BsPlayCircle`，其余 lucide)。统一到 lucide(`Circle`/`Play`)，线宽、视觉重量才一致。
- **字号**：建一套 `text-[10px]/[11px]/[13px]/[15px]` 的阶梯并固定语义(标签/正文/标题)，现在 `text-[8px]`(摄像头形状标签)、`text-[10px] uppercase tracking-wider` 等散值太多，readability 差。
- **边框圆角**：面板 16–18px、控件 10px、按钮 12px——已较统一，保持；但 `squircle`(corner-shape)兼容性有限，建议仅作渐进增强。
- **动效**：`record-pulse`(录制呼吸)、`mic-panel-in`、accordion 都克制得当，保持。新增**选中态过渡**(rail/区块 120–160ms)和**面板切换的轻微淡入**，让"全局↔选中"的状态变化被感知到。

---

## 6. 文案 / 命名建议

| 现状 | 问题 | 建议 |
|---|---|---|
| 全局 "OpenScreen"（菜单/弹窗/文件类型/`openscreen.png`/`.openscreen`） | 与品牌 Inkast 冲突，用户困惑"我装的到底是什么" | 用户可见文案统一改 **Inkast**(`.openscreen` 后缀可保留兼容但显示名改 "Inkast Project")；logo 资源更名 |
| 源选择按钮 **Share** | 系统投屏隐喻，不是"选录制对象" | 改 **Start Recording / 开始录制**；标题 "Choose what to record / 选择要录制的画面" |
| `Use editable cursor` | 黑话，不知有何用 | 改 **Editable cursor (replace later) / 可后期编辑的光标**，加一句副文案 |
| 时间线 `Add Zoom (Z)` 等 | 命令式 + 快捷键混在标签里 | 标签留动词("缩放/Zoom"),快捷键移到 tooltip 或末尾灰色小字；首次使用给一句话说明 |
| Cursor rail 项显示 "Video Effects"（错用 `effects.title`） | 与 Effects 撞名、含义错 | 改用 `cursor.title`="Cursor / 光标"；顺带把 "Video Effects" 简化为 **Effects / 效果**（见 P0-5） |
| `Camera Shape` + `Webcam Size` 同屏 | Camera/Webcam 混用 | 统一 **Webcam**(摄像头)；Zoom 里的 "Camera follows cursor" 改 "View follows cursor" 避免与摄像头混 |
| `Suggest Zooms from Cursor` / "No cursor telemetry" | 工程腔 | "自动添加缩放 / Auto-add zooms"；错误改 "需要先录一段带光标移动的视频" |
| `Blur BG` / `off` / `on` | 缩写、小写不统一 | "Blur Background / 模糊背景"，开关用统一 Switch 不带 on/off 文字 |
| 中文用户 | 当前中文包存在但 IA 名词偏直译 | 录前用"录什么/带不带声音/带不带摄像头/光标能不能改"的口语化分组标题 |

---

## 7. 具体优化清单（P0 / P1 / P2）

> 格式：优先级 · 问题 · 为什么 · 怎么改（文件/组件）

### P0（影响"我知道下一步点哪里"，必须先做）

- **P0-1 选中态要有明确标题 + 返回。** *为什么*：全局/选中共用面板且 rail 失活，是最大迷路点。*怎么改*：`SettingsPanel.tsx` 在 `hasTimelineSelection` 时，面板顶部渲染一个**上下文头**：`[类型色点] Zoom 2 ·（X 范围）· [返回全局]`；返回按钮清空选择。头部背景用 5.1 的区域语义色。
- **P0-2 空状态补"录制"入口。** *为什么*：三入口缺一，用户以为不能录。*怎么改*：`EditorEmptyState.tsx` 在 Import/Load 之上加主按钮 **"录制新视频 / Record New Video"**(调起 recorder 流程)，形成 录制 / 导入 / 打开 三选一。
- **P0-3 拖视频即导入。** *为什么*：拖拽被弹窗惩罚违反直觉。*怎么改*：`EditorEmptyState.handleDrop` 对视频后缀(`emptyState.supportedFormats` 列表)走 `onVideoImported`，仅未知类型才报错；drop overlay 文案区分"松手导入视频/打开项目"。
- **P0-4 顶栏显示项目名 + Save 主次。** *为什么*：无文档身份、存没存看不出。*怎么改*：`VideoEditor.tsx` L2089 顶栏右半空白处居中显示 `项目名 ·（未保存圆点）`；Save 升为 Secondary 按钮，其余保持 Ghost。
- **P0-5 修 Cursor rail 标签 bug。** *为什么*：Cursor 项 tooltip 显示 "Video Effects"。*怎么改*：`SettingsPanel.tsx` 该项 `label: t("effects.title")` → `t("cursor.title")`(新增 `settings.cursor.title = "Cursor"`)。

### P1（明显提升清晰度与质感）

- **P1-1 品牌绿 token 化。** *为什么*：190 处硬编码无法统一/换肤。*怎么改*：见附录 A，落 `--primary/--accent` + 色阶，全仓替换 `#34B27B`→`primary`。
- **P1-2 统一灰色色温。** *为什么*：暖 stone token vs 冷 slate 工具类发脏。*怎么改*：shadcn base stone→zinc/slate，`text-slate-*` 收敛到 `text-muted-foreground/foreground`。
- **P1-3 时间线区域语义配色。** *为什么*：扫一眼即识别段落类型。*怎么改*：`timeline/Item.tsx`/`Row.tsx` 按类型取色(附录 B)，Inspector 头部同色。
- **P1-4 源选择产品化。** *为什么*：像系统弹窗。*怎么改*：`SourceSelector.tsx` + `common.actions.share`→ "Start Recording"；标题/空态文案改"选择要录制的画面"，去掉 "OpenScreen" 字样。
- **P1-5 导出加"确认汇总"步。** *为什么*：配置/选址/进度被切碎。*怎么改*：`ExportDialog.tsx` 在选保存位置前插一屏摘要(格式·分辨率·时长·预计大小·保存到…)，一个主按钮 Export。
- **P1-6 顶栏按钮三级化 + 图标统一。** *怎么改*：HUD 的 `react-icons/bs` 换 lucide；顶栏 Save 提级。
- **P1-7 录制中精简 HUD。** *怎么改*：`LaunchWindow.tsx` 录制态隐藏源/音频/摄像头开关，只留 停止/暂停/取消。

### P2（锦上添花 / 长期一致性）

- **P2-1 把 Timeline 这个 rail 项降级。** 单一波形开关并入 Effects 或时间线右键菜单，rail 空出一格。
- **P2-2 合并 Blur 双入口。** 让 `Add Blur` 与 Annotation 的 Blur 共用一套 Blur 设置，文案统一。
- **P2-3 Annotation 升级为"讲解元素库"。** Text/Image/Arrow/Blur 用统一的"添加元素"入口 + 一致的选中/编辑模式（见方向 C）。
- **P2-4 footer links 收进"帮助"菜单。** Report Bug/Save Diagnostics/Star on GitHub 不必长期占面板底部。
- **P2-5 字号/间距 token 化。** 清理 `text-[8px]` 等散值，建立 type scale。
- **P2-6 首次使用引导。** 时间线工具第一次出现时给一行 coachmark（非弹窗）。

---

## 8. 三个可选 UI 方向（不改底层功能）

### 方向 A — 专业工具密度，只做"清晰化"（克制翻新）
保持现有布局与密度，只做：统一灰色色温、绿 token 化、选中态加上下文头、顶栏加项目名、时间线区域配色、修文案。**改动量最小，风险最低**，界面立刻"有秩序"。受众：已有专业用户，怕被打乱。

### 方向 B — 更像 Screen Studio 的创作者友好界面（推荐基调）
在 A 之上：放大预览、Inspector 分组卡片化并增加留白、把"录制/导入/打开"做成清爽的起始屏、导出做成"汇总确认 + 预览缩略图"、HUD 分组化。保留全部能力，但**默认呈现更友好、进阶项收进折叠**。受众：做演示/教程的非剪辑专业人士（核心人群）。

### 方向 C — 轻量剪辑台 / 教程视频工作台（最大改动）
把"边录边画讲解"作为一等公民：统一的"讲解元素库"(文字/箭头/图片/高亮/模糊/缩放)像工具箱一样常驻；时间线弱化为"段落轨"，强调"讲到哪、画了什么"。**最贴合产品差异化(实时讲解)**，但改动面大、需重排 IA，周期长。

---

## 9. 推荐方向与原因

**推荐：以方向 B 为目标基调，落地节奏 = 先 A（P0+部分 P1）打底，再向 B 收敛，把 C 的"讲解元素库"理念作为后续单点演进（P2-3）。**

原因：
1. **匹配人群**：核心用户是做产品演示/教程/讲解的人，不是专业剪辑师。B 在"保留专业能力"和"我知道下一步"之间最平衡，正好命中"轻量、专业、专注"的定位。
2. **尊重约束**：A→B 全部是**界面层**改动（标题、分组、配色 token、文案、留白、模态合并），不触录屏/导出/项目格式/状态管理，Codex 可直接落地。
3. **风险可控**：先做 5 个 P0 就能解决最痛的"迷路/不知道能录/拖拽反直觉/没文档身份"，立竿见影且几乎零风险；再分批做 P1 的色彩与一致性。
4. **守住质感与差异化**：不退回营销页或玩具化；同时为产品真正的差异点（实时讲解）预留了 C 的升级路径，不浪费已建好的密度与暗色质感。

---

## 附录 A — 可粘贴的颜色 token（`src/index.css` 暗色块增量）

```css
.dark {
  /* —— 统一冷中性灰（替代暖 stone / 散落 slate）—— */
  --background: 220 14% 5%;        /* #0a0b0d 对齐画布冷黑 */
  --card: 222 14% 6%;
  --border: 220 10% 16%;
  --muted-foreground: 215 16% 65%; /* ≈ slate-400，统一次级文字 */

  /* —— 品牌绿进 token（停止 190 处硬编码）—— */
  --primary: 154 55% 45%;          /* #34B27B */
  --primary-foreground: 0 0% 100%;
  --ring: 154 55% 45%;             /* 焦点环 = 品牌绿 */

  /* —— 区域语义色（时间线 + Inspector 头共用）—— */
  --region-trim: 0 84% 60%;        /* #ef4444 */
  --region-zoom: 154 55% 45%;      /* #34B27B */
  --region-speed: 217 91% 60%;     /* #3B82F6 */
  --region-blur: 258 90% 66%;      /* #8B5CF6 */
  --region-annotation: 38 92% 50%; /* #F59E0B */
}
```
落地：全仓 `#34B27B / #2d9e6c / rgba(52,178,123,*) / bg-green-500 / bg-emerald-500` → `primary` 系；`text-slate-400/500` → `text-muted-foreground`；删除 `tailwind.config.cjs` HUD 阴影里的紫色 `rgba(100,80,200,*)`，换 `rgba(52,178,123,*)` 或去色。

## 附录 B — 区域类型配色对照（供 `timeline/Item.tsx`、`SettingsPanel` 头部使用）

| 类型 | token | hex | 用在 |
|---|---|---|---|
| Trim | `--region-trim` | #ef4444 | 时间线块、删除按钮 |
| Zoom | `--region-zoom` | #34B27B | 时间线块、Inspector 头 |
| Speed | `--region-speed` | #3B82F6 | 同上 |
| Blur | `--region-blur` | #8B5CF6 | 同上 |
| Annotation | `--region-annotation` | #F59E0B | 同上 |

## 附录 C — 顶栏建议结构（`VideoEditor.tsx` L2089）

```
[≣ 语言]  [⤺ 返回录制]  [📂 打开]  [💾 保存(Secondary)]   ···   < 项目名 · ●未保存 >   ···   (空/可放导出入口)
   左：低权重 Ghost                         中：文档身份(新增)            右：留给主操作
```
