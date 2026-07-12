# Inkast 整合 · 集成 Spec（代码级验证版 · 2026-06-19）

> 单一权威文档。把 **内容驾驶舱 + 拉片 + 片场(video-factory/video-pipeline) + 散落视频功能** 并进 Inkast，做成一个桌面 App。
> 上游方案：`40_内部工具/Inkast整合_主方案与执行计划_2026-06-19.md` + `视频工具整合_评估与架构_2026-06-19.md`。
> **本文与上游的区别：所有结论都已用 6 个子代理读真实代码逐条验证**，并修正了多处"文档 vs 现实"的偏差（见 §1）。引用均带 `file:line`。

---

## 0. 本会话已落地 + 三项决策

- ✅ **Phase 0**：`npm install`(974 包) · `npm test` **263/263**(=原件，证明忠实副本) · 初始提交 `e687b87`。
- ✅ **副本 re-sync**（提交 `bf855c4`）：原件 Inkast 自 6-7 commit 起 6 月工作**全未提交**(69 改动挂工作树)，`MediaPanel.tsx`/`SmartCutPanel.tsx` 仅存于未跟踪状态、冻结 tag 只到 6-7。已按工作树校验同步，使副本与日常 Inkast 等价，并纳入 git 作可靠备份。tsc 0 · 263/263 持平。
- **决策(负责人 2026-06-19 拍板，均"按推荐")**：
  1. **基线** → re-sync 到最新（已完成）。
  2. **ASR** → 分阶段：FunASR/SenseVoice 先替换"批量转写"(低风险)，**保留** Inkast 现有词级 whisper 给交互式剪辑；字级时间戳(Paraformer/对齐)走 go/no-go 钉子后再定。
  3. **路线** → 原生优先 + 先打钉子：**跳过 webview-embed**，3 个钉子(外壳拓扑/ASR 字级/新签名 TCC)后直接做原生 JobManager→IPC；合并原 Phase 1+2。

---

## 1. 文档 vs 现实：6 处关键修正（最重要，先读）

| # | 上游文档的假设 | 代码里的现实 | 影响 |
|---|---|---|---|
| 1 | 原 Inkast 已冻结当备份 | **未冻结**：6 月工作全未提交、冻结 tag 仅到 6-7；最新编辑器文件曾仅存于未跟踪态 | 已 re-sync + 入 git（§0）。今后把原件视为**真冻结**，不再 pull。 |
| 2 | "给 Inkast 加 5 个 Tab" | **Inkast 是多窗口 App，不是带 Tab 的 SPA**。`App.tsx:71` 按 `?windowType=` 路由到 **8 个独立 BrowserWindow**；录制 HUD 与编辑器是**互相替换**的两个窗口(`main.ts:380`)；camera/draw/prompter 用 `setContentProtection`，**必须保持独立窗口**(不能做成 Tab) | 5-Tab 外壳是**净新增架构**，全计划最被低估的一项。方案见 §2。 |
| 3 | 统一 ASR 是个大而险的替换 | 引擎字幕默认 `from_script`(按 TTS 时长+字数，**无 ASR**)；智能粗剪切点靠 ffmpeg `silencedetect/freezedetect`(**与 ASR 无关**)。真正用 ASR 的只有"批量转写+拉片"(句级) 和 Inkast 交互式词级剪辑 | SenseVoice 换"批量"=低风险；**字级时间戳是净新增能力，不是迁移**(whisper 也给不好)。见 §6。 |
| 4 | Phase 1 用 webview 内嵌片场面板 | 面板硬依赖 `fetch(/api/*)`+`EventSource`，**必须同时跑 server.mjs**(在 Electron 里再起第二个 Node HTTP 服务)，且是丢弃件 | **跳过**。直接原生 IPC。`jobs.mjs`(385 行)+`stageParser.mjs`(44 行=全部 IPC 契约) 已是注入式、可近乎原样移植。见 §4。 |
| 5 | 拉片 skill → 分析 Tab 后端(像有现成模块) | **拉片是 Claude Code 的 SKILL.md 提示词，不是代码**；pipeline 里 0 处 vision 调用 | `AnalyzeService` **净新增**(~4–6 天)；复用 `reference.py` 确定性那半，LLM vision+精修循环是真活；~$25/30min(缓存必开)。见 §7。 |
| 6 | Phase 7 把引擎 vendored 进 `Inkast/engine/` | `.venv` **1.9 GB、仅 arm64-mac(mlx_metal)、不可重定位**(uv 硬路径、console-script shebang 已坏) | **不要 vendor**。保持外部路径 + 配置 + `video.sh smoke` 自检(doctor)。自包含 Python 打包=另立项目。 |

附加现实：**Gate B(成片确认)与 录屏→成片 自动交接 当前都不存在**——是净新增，不是迁移(`jobs.mjs` 仅有 slides 的 plan/render 两阶段=Gate A)。

---

## 2. 五 Tab 外壳拓扑（净新增架构）

**现状**：单一 `index.html`→`src/main.tsx`→`src/App.tsx`，`switch(windowType)` 选组件；窗口工厂在 `electron/windows.ts`(8 个 `createXWindow()`)。录制 HUD 与编辑器是两个会互换的窗口。**无任何顶层 Tab/路由**。

**推荐拓扑**（待钉子 1 验证）：
- **编辑器窗口长成"带 Tab 的工作台外壳"**，承载 `分析 / 成片 / 资料库 / 驾驶舱` 四个面板 + 编辑器本体作为一个面板。
- **录制 Tab = 启动器**：不重嵌录制器，而是驱动现有 HUD/overlay 窗口(走既有 IPC `open-source-selector`/`switch-to-editor`/全局快捷键)。
- **overlay 窗口(camera/draw/prompter)保持独立窗口**(内容保护，做不成 Tab)。
- 接入点：`App.tsx:71` 加 `case "workspace"`；`windows.ts` 加 `createWorkspaceWindow()`；注意更新 `isEditorWindow()`(`windows.ts:124`)、菜单路由(`main.ts:128`)、未保存关闭流(`main.ts:390`)、`app.on("activate")` 对 `windowType=editor` 的判断。
- 风险点：编辑器自带 44px 标题栏(`VideoEditor.tsx:2599`)与外壳 topbar 会重复 → 需抑制其一，避免双标题栏/拖拽区回归。

**复用既有模式**(别造新轮子)：
- 长任务+IPC 进度：`handlers.ts:64` 的 `EventEmitter` + `spawn` JSON-event 流(`:1141`)；`recordingStream.ts` 的"注册器类"是 JobManager 的模板。
- IPC 契约：`preload.ts` 单一 `electronAPI`，两种惯用法——`invoke`(请求/响应) + `onXxx(cb)→unsubscribe`(事件流)。**新服务建议用 `nativeBridge.ts` 的 `{domain,action,payload,requestId}`→`{ok,data|error}` 带版本号信封**(比散装 channel 更好)。
- 新服务放新文件：`electron/jobs/`、`electron/services/analyze/`(别往 90KB 的 `handlers.ts` 里塞)。

---

## 3. IPC 契约（需在写代码前定稿）

### 3.1 JobManager(成片) —— 映射 video-factory
- 推送(main→renderer)：`manager.on("update", job)` → `webContents.send("vf:jobUpdate", job)`(替代唯一 SSE 通道)。`job` 对象：`{id,slug,title,type,input,engineInput,mode,status,stages[],variants[],artifacts[],exitCode,reportStatus,error,phase,plan}`。
- 请求/响应(12 个 `ipcMain.handle`)：`vf:health` `vf:saveLlmKey` `vf:listJobs` `vf:listInbox` `vf:jobLog` `vf:submitJob` `vf:rerun` `vf:confirm` `vf:replan` `vf:savePlan` `vf:openPath` `vf:smoke`。
- `friendlyError`/`labelForStage` 在 main 跑，发预翻译文案给 renderer。

### 3.2 AnalyzeService(分析/拉片)
- `analyze:start({input})` → 事件流 `analyze:progress({phase})`(phase∈ probe/extract/transcribe/analyze/write) → `analyze:done({slug, outputDir})`。

### 3.3 驾驶舱(只读)
- `cockpit:today()` → 读 `…/Review/每日驾驶舱/<date>.json`(今日→回退 14 天)，按路径读 vault、不复制。

---

## 4. video-factory 移植清单（SSE→IPC）

**原样移入**(零依赖、纯 ESM std-lib，Node 22 OK)：
- `lib/jobs.mjs`(385 行 EventEmitter)→ `electron/jobs/jobManager.ts`。构造器已参数化 `{pipelineRoot,dataDir,timeoutMs}`(`jobs.mjs:67`)：`pipelineRoot`→外部 video-pipeline，`dataDir`→`app.getPath('userData')/video-factory`。**逻辑不改。**
- `lib/stageParser.mjs`(44 行)→ **原样、勿动**(它是"唯一事实来源"，反假进度的核心)。
- `test/jobs.test.mjs` + `test/stageParser.test.mjs`(含假引擎 harness)→ 一并移植，是反假进度的回归安全网。

**重写**(server.mjs 仅 ~80 行 SSE/HTTP)：
- SSE → `webContents.send`(§3.1)。
- 12 endpoint → `ipcMain.handle`。
- LLM key：`POST /api/llm-key` 的逻辑移进 main，写 `process.env` 让 spawn 继承(`jobs.mjs:200` 已 `env:{...process.env}`)。
- `POST /api/open` → `shell.openPath`/`showItemInFolder`(**保留 `allowedPath` 白名单**)。
- `app.js`(~318 行)逻辑→ React 成片 Tab(plan 编辑器 + `planDirty` 守卫是唯一稍繁处)。

**工作量/风险**：移植+IPC+preload ~1.5 天 LOW；React 成片 Tab ~1.5–2 天 LOW-MED；引擎 sidecar 可执行位/env ~0.5 天 MED(打包 resign 历史易踩)。**合计 3–4 天，LOW-MED。**

---

## 5. 引擎 sidecar 契约（video-pipeline，不改本体）

- **入口**：`bash video.sh <args>`(`video.sh:176` exec `.venv/bin/python -m pipeline.run`)；`cwd`=pipelineRoot；`env` 带 API keys；`stdio:["ignore","pipe","pipe"]`。
- **args**(funnel 相关，来自 `buildArgs` jobs.mjs:17)：录制→成片 `<slug> --input /abs.mov --simple|--publish-ready`；想法→成片 `<slug> --input "<text|/path.md>" …`；翻页 plan 阶段 `--slides-draft …`(停在 Gate A)；render 阶段 `--from voice --simple`。**长文案写临时 .md 传路径，勿管道 stdin**(>255B 会"File name too long")。
- **stdout STAGE MARKERS**(=stageParser 的 5 条正则，须逐字节匹配)：
  - `=== [<stage>] ===`(run.py:597) → stage；canonical=`storyboard,voice,screencast,subtitles,compose`(run.py:28)
  - `--- variant platform=X style=Y ---`(:538) → variant
  - `  成片 -> <path>`(:541,644) → artifact(相对 pipelineRoot，按 cwd 解析)
  - `✅ 完成`(:651) → success
- **判定**：exit 0 **必要不充分**——还要读 `build/<slug>/run-report.json` 的 `.status`(`pass`)。保留 45min 看门狗(SIGTERM→10s→SIGKILL)。
- **输出布局**：`build/<slug>/`(中间真值 script.json/audio/subtitles.srt/transcript.json/run-report.*) + `output/<stem>.mp4|srt`。
- **Gate A(文案确认)**：引擎不暂停——`*-draft` 跑到写 script.json 后 exit 0；orchestrator 置 `awaiting-confirm`、读 plan、`savePlan`(回写并重算 `bullet_offsets`)、`confirm`→`--from voice` 第二次 spawn。**逻辑在 jobs.mjs，随移植即得。**
- **Gate B(成片确认)**：引擎无 resume——是**两次调用**(先 `--preview-pack`/`--simple` 出预览，人确认后 `--only compose --selected --ship`)。**非 slides 类型的两阶段确认=净新增 orchestrator 代码(~1 天)。**
- **健康自检**：`video.sh smoke`(`video.sh:81`→`pipeline.smoke` 查 faster_whisper/mlx/f5/soundfile)。App 启动 + 每个任务前跑，报真实可操作错误。

---

## 6. ASR 决策（分阶段，决策 2）

**用 ASR 的地方(按精度排序)**：拉片转写=句级✓ · 字幕 whisper 后端(罕用)=段级✓ · 智能粗剪 drop-by-id=段级✓ · **智能粗剪切点=ffmpeg，无 ASR✓** · **逐词字幕弹/字级切点=Inkast 净新增诉求(whisper 也给不好)**。

- **Tier 1(句/段级 · 低风险)**：`funasr_asr.py` 暴露与 `_speech()` 同形 `[(start,end,text)]`，按 `asr.engine` 配置切换；替换全部现有 faster-whisper 用途(拉片+批量字幕+drop-by-id)。**~2 天，LOW**，不改引擎本体(drop-in 后端)。
- **保留**：Inkast 现有 `whisper-base_timestamped`(D28) 继续给交互式词级剪辑——这是目前唯一在产出词级切点的东西，**不拆**。
- **Tier 2(字级 · 推迟、钉子门)**：Paraformer-zh-timestamp 或 FunASR `fa-zh` 强制对齐。**~3–5 天，MED-HIGH**(快语速+口头禅+叠音漂移 ±80–200ms，达不到 <50ms 字级切点门是真不确定)。
- **Go/No-Go 钉子(先做，~半天)**：拿 3 段真实录音(`build/Inkast录屏测试` 现成) → ① SenseVoice vs 现 whisper 比 CER+段数(过门：CER≤whisper)；② Paraformer/`fa-zh` 导字级时间戳，手验 20 个切点(过门：≥90% 在 ±50–80ms)。**不过门 → 切点继续用 ffmpeg(=现状，零风险)，ASR 只做转写层。**

---

## 7. 分析（拉片）Tab spec

- **净新增 `electron/services/analyze/`**：`AnalyzeService.ts`(编排+IPC 进度) · `frames.ts`(ffprobe+两遍自适应抽帧+场景帧；移植 `reference.py` 的 `_ffprobe_json`/`_extract_scene_frames`(scene>0.28,scale 360,≤12)/`_audio_stats`) · `transcript.ts`(ASR 适配器，接口 `[{start,end,text}]`) · `lapianPrompt.ts`(原样粘 `拉片Skill_可直接用.md:185-213`) · `claude.ts`(anthropic SDK + **vision** base64 帧 + **prompt caching** 缓存帧块)。
- **模型**：Opus 4.8 主 + Haiku 4.5 辅(SKILL 指定)；key 走 `ANTHROPIC_API_KEY` env，勿硬编码。
- **输出**：`output/analyses/<slug>/`(report.md + sop.md + analysis.json + frames/ + transcript.srt) → 资料库 + 驾驶舱读取。
- **成本/时延**：~$25/30min(cache-read 主导，缓存必开，重拆同源近免费) · ~3–7min/视频(转写 bound)。
- **不要 `pipeline/lapian.py`**：LLM 那半属外壳(违 铁律 + 现实)；若要 CLI 复用，只共享"确定性媒体半"(ffprobe+帧+转写，无 LLM)。
- **风险 MED**：精修循环("逐帧细看")+ 报告质量对齐交互式 Claude Code 输出 是不确定项。
- **互喂闭环**：复现 SOP 的 PHASE0 逐字稿 → 直接当驾驶舱 文案 / `script.json` 骨架；关键发现×5 → 选题 inbox 卡。

---

## 8. 驾驶舱数据绑定（按路径，决策 = 不复制 vault）

- **它是什么**：只读"每日选题/信源看板"(`内容驾驶舱_原型.html`，3064 行)，4 视图 today/radar/hot/mp + 客户端偏好引擎(18 主题组/8 渠道/8 预设，存 localStorage)——**逻辑可复用**。
- **数据真源(已验证存在，6 个实时文件)**：`~/AI-Agent/10_知识星球/KnowledgePlanet/Operations/Publishing/Review/每日驾驶舱/<YYYY-MM-DD>.json`(兄弟目录 `今日种子/` `每日概要/`)。schema：`{day,cards[],radar[],hot[],social[],mp[]}`；card 含 `id,lane,kind(seed|rec),topic,score,angle,body[],status…`，`status` 走 `候选→已选→已灌观点→已成稿→已推草稿`。
- **接法**：配置 `cockpitDataDir`(默认上面绝对路径)；main 进程读最新 json 经 IPC 发渲染(替代原型的 `file://` fetch，本就是它的弱点)；render 可先 webview 托管原型只换数据源(~2 天)，或全 React 重写 4 视图+偏好引擎(~5–7 天)。
- **新活**：选题→「去录屏」handoff + 拉片报告→回喂卡 是净新增(原型 promote 仅是 toast 桩)。写 json 的 runtime(Codex,库外)不进 App，**Inkast 只读+UI**。

---

## 9. 复用 / 重写 / 退役 决策表（主方案"第 0 步" inventory）

| 散件 | 决策 | 去向 | 依据 |
|---|---|---|---|
| Inkast-剪辑器/效果引擎/智能粗剪/UI-样板 4 个 Demo.html | **归档(当 spec)** | — | 四大块已全部 shipped(STATE D17–D24)，Demo 只是设计稿 |
| screen-studio-cn-assistant | **归档** | 退役 | 是第三方 Screen Studio 的 CN 助手，非录制器；Inkast 原生录制取代它；**有 launchd，归档前先 `npm run uninstall:auto-open`** |
| soulforge-legacy / echo-realm | **原地不动** | — | 暗黑/2.5D ARPG 游戏，grep player/timeline/export/video=0 命中，无可复用 |
| pipeline/reference.py | **复用(原样)** | 成片 sidecar | 对标分析，成片输入；铁律=child_process 调，不重写 |
| pipeline/illustrator.py | **复用(原样,休眠)** | 成片 sidecar | 配图挂载点 `provider:null` no-op，无害 |
| pipeline/floating_logo_effect.py | **复用(可选特效)** | 成片 sidecar | 自包含 PIL+ffmpeg 浮标动效，按需暴露 |
| 内容驾驶舱_原型.html | **重写(换数据源)/或 webview 托管** | 驾驶舱 Tab | 唯一真正的新集成活，见 §8 |

**结论**：散件迁移风险 **LOW**——几乎没有要迁的代码，4 个 Demo 是 spec 不是债；驾驶舱原型是唯一构建项。

---

## 10. 风险登记册（择高危）

| # | 风险 | 级别 | 缓解 |
|---|---|---|---|
| R1 | 5-Tab 外壳 vs 多窗口现实 | **HIGH** | 钉子 1 先验拓扑(§2)；overlay 窗口保持独立 |
| R2 | 新 bundle id `com.sgd.inkast-suite` 破 resign + 需重授权 | **HIGH** | `electron-builder.json5:4` 与 `resign-local.sh` 现硬编码 `com.sgd.inkast`；先参数化(env/arg)；接受一次性重授权；保留旧 Inkast 当兜底 |
| R3 | 打包 adhoc 坏包(漏 resign) | **HIGH** | 固化单脚本链 `vite build→builder --dir→resign(<id>)→ditto`；永不裸跑 `npm run build` |
| R4 | App 调外部 `.venv` 路径漂移 | **MED→HIGH** | 路径入配置；启动+每任务前 `video.sh smoke`；报真实错 |
| R5 | 范围蔓延进多轨 NLE(D25 已推迟) | **HIGH** | 硬线：整合=接线不重写编辑内核；多轨另立项，写进验收门 |
| R6 | ASR 字级时间戳门达不到 | **MED** | §6 钉子先验；不拆现有 whisper |
| R7 | 假进度回潮 | **MED** | stageParser 原样移植；IPC 只载真 `update` 事件，无定时器进度 |
| R9 | 引擎 vendor=1.9GB/arm64-only | **MED**(P6) | 不 vendor；外部路径+doctor；自包含打包另立项 |

---

## 11. 修订版分阶段路线（继承"验收门 + 无后端不上 UI"）

- **P0 备份+脚手架** ✅(install/test/commit/re-sync 已完成) · 待补：参数化 `appId`/`--identifier` 支持新签名。
- **P-钉子(~2 天，门控全局)**：① 外壳拓扑(编辑器窗口长成 Tab 外壳，1 天) ② ASR 字级 go/no-go(½ 天，§6) ③ 新 bundle id resign+TCC 重授权+真录一段(½ 天)。
- **P1 原生编排(合并原 1+2)**：JobManager/stageParser→IPC、退役 server.mjs、`smoke` 健康门、**显式 录屏导出→成片任务**(默认排"草稿"待点击，不自动花 API)。**跳过 webview。**
- **P2 分析(拉片)Tab**：ffmpeg+Claude→`output/analyses/`→资料库(§7)。
- **P3 ASR 统一**：仅当钉子②过门；否则交互式留现 whisper、SenseVoice 只做批量字幕。
- **P4 驾驶舱 + 闭环**：按路径接 KnowledgePlanet(§8)；分析→选题/文案→去录屏→成片 全程一个 App。
- **P5 接管**：稳定通过验收+实用一段→接管为正式 Inkast，今日还原备份归档 `90_Archive/`。
- **P6 退役清理**：**归档不 vendor**；引擎保持外部+配置+doctor；散件按 §9 先归档再删；最终删除经负责人点头。

诚实工期：比上游"Phase0/1 各 1 天、零重写"多约一周，几乎全在外壳+IPC(§1 第 2、4 项)，非功能本身。

---

## 12. 待办决策

- ✅ 已定：基线 re-sync(决策1) · ASR 分阶段(决策2) · 原生优先+钉子/跳 webview(决策3) · 引擎保持外部路径 · LLM 半留外壳不进 lapian.py · 散件按 §9。
- ⏳ 待负责人(可后续):
  - **D-handoff**：录屏导出→成片 触发方式 = 推荐"排草稿待点击"(不自动花 API)，待确认。
  - **D-asr-门槛**：字级过门的数值标准(建议 ±50–80ms / ≥90%)，钉子②时定。
  - **D-keys**：`ANTHROPIC_API_KEY`/`DEEPSEEK_API_KEY` 在 App 里的存储方式(设置面板 + 安全存储)。
  - **D-bundle**：是否确实用 `com.sgd.inkast-suite` 独立并存(=一次性重授权)；确认后参数化签名脚本。
