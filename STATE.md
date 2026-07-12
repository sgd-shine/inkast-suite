# STATE — Inkast

> 进度快照。决策见 [DECISIONS.md](DECISIONS.md),架构见 [docs/Inkast_架构现状笔记.md](docs/Inkast_架构现状笔记.md)。

## 🔗 Inkast 整合(suite 分支,2026-06-19)
本副本(Inkast-Suite / 分支 `suite`)是整合工作区:把 内容驾驶舱 + 拉片 + 片场(video-factory/video-pipeline) 并进一个 App。**权威 spec:[docs/INTEGRATION.md](docs/INTEGRATION.md)**(代码级验证版)。

**5-Tab 工作台已全部补齐**(`src/components/workspace/`)。启动即进工作台(编辑器窗口 `windowType=editor` 渲染 `<Workspace>`;`createWindow`=HUD 保留给 switchToHud,"返回录屏"链路不破)。

| Tab | 状态 | 说明 |
|---|---|---|
| 驾驶舱 | ✅ 真数据·已对齐原型 | `CockpitPanel` 读每日选题(按路径) + **偏好引擎**(8 预设 / boost·hide 过滤排序,localStorage 与原型互通) + **种子锚点** + **选题流转** + 富卡片;「去录屏」→ 录制、「去成片」漏斗 |
| 分析 | ✅ 已接后端 | `AnalyzePanel`+`AnalyzeService`:ffmpeg 抽帧 + Claude vision → 报告/SOP(`output/analyses`);报告「去成片」漏斗。真跑需 `ANTHROPIC_API_KEY` |
| 录制 | ✅ | 内嵌完整 `<VideoEditor embedded>`,原编辑器全功能 |
| 成片 | ✅ 已接后端 | `ProducePanel`+`JobManager`(移植 video-factory,SSE→IPC,server.mjs 退役):投料/真实进度/确认点A/产物;接收漏斗预填。真出片需引擎 key+.venv |
| 资料库 | ✅ 真数据 | `LibraryPanel` 读 录屏/成片/拉片报告(按路径);录屏「去成片」漏斗 |

- **漏斗已点选可达**:驾驶舱选题→录制 · 资料库录屏→成片 · 分析报告→成片(预填进可编辑投料,审后再提交=不自动花 API)。
- **语言**:工作台顶栏 🌐 中/英切换(自动记住)。**签名**:`resign-local.sh` 已参数化 bundle id(`INKAST_BUNDLE_ID`/`INKAST_APP_NAME`,默认不变),为 Suite 并存预留。
- 反假进度(成片只搬 stageParser 真实 marker;分析阶段都是真实步骤)。引擎 video-pipeline 保持**外部路径**,不 vendor。
- 验证:tsc 0 · **287/287**(263+24 移植编排测试)· lint 仅既有 DrawOverlay 警告 · vite 生产打包(5450 模块 + main + preload)通过。**未碰录屏链路、未重打包**(用 `npm run dev` 看)。
- ⏭️ **待负责人(需你的环境/操作)**:① 配 `ANTHROPIC_API_KEY`/`DEEPSEEK_API_KEY` + 引擎 `.venv` → 成片/分析 真·端到端出片验收;② 钉子②(ASR 字级 go/no-go,需真实中文录音);③ 钉子③(新 bundle id 打包 + TCC 重授权 + 真录一段,脚本已就绪);④ 打包 resign+ditto 给正式 App(P5 接管时)。
- 提交:`e687b87` fork → `bf855c4` re-sync → `be032f9` 外壳 → `7103197`/`452485e` 成片 → `a174d38` 启动即工作台 → `d8bd97b` 驾驶舱 → `9a8005f` 资料库 → `a20589b` 分析 → `b23c054` 驾驶舱对齐 → `e0d6564` 语言 → `1313b0f` 漏斗 → `ea6fe4c` 签名参数化。

### ✅ 2026-07-01 评论抓取 Phase 1(抖音视频公开评论,Inkast 内部浏览器上下文 + 诚实降级)
负责人定方向:**核心抓取在 Inkast 内部完成(Electron Chromium 页面自算 a_bogus,不伪造签名),Computer Use 只作人工兜底,失败诚实降级,先做评论抓取**。全 app-only 未碰引擎,**tsc 0 · 477 测(+7)· biome 改动文件 clean · i18n zh/en 齐**。dev 已热更(electron 重启注册新 IPC)。
- **纯逻辑** `src/lib/commentTypes.ts`(+`commentTypes.test.ts` 7 测):`CommentFetchStatus`(ok/no_public_data/needs_login/blocked/needs_manual_refresh/error)· `parseDouyinCommentResponse`(web `/comment/list/` JSON→评论,秒→毫秒,**隐私最小化只留 displayName**,非评论响应返 null)· `dedupeComments`(按 commentId 增量去重,计数取新)· `topComments`/`summarizeComments`。
- **抓取本体** `electron/lib/douyinComments.ts` `fetchDouyinComments`:仿 `probeDouyinUser` —— 隐藏 BrowserWindow(**内存会话 partition 无 `persist:` 前缀,窗口销毁即清,不落 cookie**)+ DESKTOP_UA + DevTools `Network` 捕获 `/aweme/v1/web/comment/list/` 响应,滚动触发分页累计到 limit(默认 200 封顶 500),稳定无新增即停。诚实状态:有评论=ok;body 含 login/验证=needs_login;status_code≠0=blocked;加载了没评论=no_public_data;没捕到=needs_manual_refresh。
- **存储** `electron/cockpit/comments.ts` `CommentsStore`→`userData/comments.json`(atomicWrite,按 videoUrl 存):`get/all/fetch/remove` + `comments:*` IPC(main 注册)。仅抖音单条视频;其它平台/失败诚实标状态、保留既有评论、不造假。
- **UI** `VideoCommentStrip.tsx`(挂 `FollowPanel` 抖音视频卡下方):抓取/重新抓取按钮 + 状态芯片 + 评论数 + 新增数 + 高赞 Top5 展开 + `lastFetched`;失败态(needs_login/blocked/needs_manual_refresh/error)显式给「打开视频页面」人工兜底 + manualHint(不假装后台已抓成功)。FollowPanel 挂 `commentsApi`、`comments.all()` 预载、`fetchComments` 回写。
- **关键认知**:① 抖音评论比作品列表**更深一层反爬**(评论 API 强制 a_bogus + 常需登录),**匿名/无登录大概率被挡** → 本 Phase 交付的是「真实尝试 + 诚实降级 + 人工兜底」,不是保证抓到;② 沙箱连不上抖音 CDN,**live 抓取未真机验**,纯逻辑已单测;③ 内存会话守住「不存凭据」铁律,代价是无登录态命中率低,这是设计取舍不是 bug。**待负责人真机验** live 抓取命中率。**Phase 2 留后**:内部 scheduler/job queue(定时刷新+速率限制+暂停恢复+日志)、拉片报告注入评论摘要/痛点、创作者卡片评论状态字段。

### ✅ 2026-07-01 驾驶舱「关注」内落地 AI 博主种子池(交接报告 → 内置种子包)
落 `research/douyin-ai-creators/inkast-content-cockpit-creator-handoff-20260701.md`(+配套 seed JSON,22 位已确认博主 + 18 个待复核候选)。AskUserQuestion 确认「完整落地 + 放进现有『关注』子 Tab」。**全 app-only 未碰引擎,tsc 0 · 470 测(+13)· biome 改动文件 clean · `npm run build`(vite + electron-builder DMG)整链过,已清 release 构建产物避免幽灵 App;未 install(交负责人打包)。**
- **内置种子(不靠外部路径,契合单一 App 铁律)**:`src/lib/creatorSeed.ts` —— 由 seed JSON 生成的静态 `CREATOR_SEED`(22)+ `CANDIDATE_NAMES`(18,仅名称)+ `DEFAULT_EXCLUDE_TAGS`(短剧/情感/游戏…)+ 纯函数 `filterCreators/isExcluded/canAutoRefresh/creatorKey/categoryLabel/douyinSearchUrl`(`creatorSeed.test.ts` 13 测)。
- **UI**:`CreatorPoolSection.tsx` 挂在 `FollowPanel` 顶部 —— 可折叠推荐区;tier 筛选(全部/主追/次级/参考/待复核)+ 搜索 + 「隐藏被剔除类目」开关(默认开);创作者卡显示 名称/优先级/核验状态/类目/抖音号/复核提示,按钮 复制抖音号·打开搜索·添加跟踪(已跟踪禁用);待复核候选仅名称芯片 + 打开搜索(不自动导入)。
- **桥接跟踪**:following.ts 新增 `addCreator(input)`(去重、带入种子元数据、诚实标注可否自动刷新)+ `following:addCreator` IPC + preload/electron-env.d.ts 类型;SavedVideo 扩 `douyinId/trackingTier/verificationStatus/category/sourceTags/requiresManualReview`;`CreatorTrackInput` 新类型。**诚实降级**:refresh 对 需人工复核 / 只有搜索页(无 sec_uid)的博主不抓取、不抛错、不造假卡,标 blocked + 人工路径。已跟踪状态由 FollowPanel 的 channel 项按 `creatorKey`(抖音号优先)回推。
- **验收对齐**:选秋芝2046/赛文乔伊/朋克周/卡兹克 ✅ · 复制抖音号/打开搜索 ✅ · 单条视频送拉片=沿用现有「关注」列表 去拉片/贴链接 ✅ · 待复核不自动刷新 ✅ · 被剔除类目默认隐藏 ✅ · 抓取失败诚实无假数据 ✅。**待负责人**:真机点添加跟踪/刷新验诚实态;抖音博主作品「批量列表」平台反爬仍做不到(单条可提取),种子池是「推荐 + 人工复制单条」形态。

### ✅ 2026-06-27 编辑器布局优化:导出收口 · 智能粗剪去重 · 音频独立成轨(已打包)
负责人列三处布局重复/重叠:① 导出按钮有两个 ② 智能粗剪有两个位置 ③「删除轨道」和「音频轨道」重叠、要做轨道管理。**先对齐再改**(AskUserQuestion 确认三处取舍),全 app-only 未碰引擎。**tsc 0 · 457 测 · lint 仅既有 DrawOverlay · vite build + resign + install 到 `/Applications/Inkast.app`(签名有效)**。
- **① 导出收口进弹窗**:原本顶栏绿色「导出」按钮(立即用当前 state 导出)+ 右侧设置栏「导出」rail 面板(**唯一**能选 格式 MP4/GIF·画质·GIF 选项的地方)两处并存。负责人选「配置移进弹窗」。抽出 `ExportSettingsControls.tsx`(格式/画质/GIF 控件,逻辑照搬原面板),`ExportDialog` 加**配置相位**:绿色按钮 → 打开弹窗(`handleOpenExportDialog` 只开窗不导出)→ 弹窗里选设置 → 弹窗内「导出」(`handleStartExport` 构建 settings + handleExport)→ 进度相位。写默认位置失败的兜底「选择保存位置」也移进弹窗(`needsManualSave` 本地标志:仅这种情况 finally 不自动关窗;成功/一般错误仍自动关)。SettingsPanel 删除 export rail 项 + 内容块 + 相关 props/`exportPanelMode`/`formatSourceDimensions`/`MP4_EXPORT_SHORT_SIDES`/"export" 模式 + 清理 imports(Download/Film/Image/getTestId/GIF_*/DEFAULT_EXPORT|GIF_SETTINGS)。`videoElement` 保留(裁剪数值仍用)。
- **② 智能粗剪去重**:删时间线工具条上的「智能粗剪」按钮(它只是 `setMediaTab("smart")` 的快捷入口),保留左侧媒体面板「智能」Tab(SmartCutPanel)= 唯一入口。`onOpenSmartCut` prop 从 TimelineEditor 接口/destructure/VideoEditor 调用处一并清掉。
- **③ 音频独立成轨**:原本「音频波形」开关开启时把波形画在「剪掉(trim)」轨道的**背景**上 → 视觉重叠。改成:trim 轨去掉 `background` 波形;新增专属 `AUDIO_ROW_ID` 行(`AudioLines` 图标 + `trackLabels.audio`),开关开启时作为独立 lane 渲染 `BackgroundWaveform`(topInset/bottomInset 6),不再与任何轨重叠。工具条「音频波形」开关现在等价于「显示音频轨」。新 i18n `timeline.trackLabels.audio`(zh 音频 / en Audio)。
- **测试/testid 维护**:e2e `gif-export.spec` 改走新流程(顶栏 `testId-export-button` 开窗 → 选格式 → `testId-export-start-button` 导出);`getTestId` 联合类型 `export-panel-button` → `export-start-button`;绿色顶栏按钮加 `testId-export-button`(满足 windows-native-checklist 可见性断言,语义更准)。新 dialogs i18n `export.exportTitle/chooseSettings`(zh/en)。

### ✅ 2026-06-27 主线二/三/五(选题项目化+待办 · 全局检索+观点库+导出备份 · 成片 Gate B 预览,已打包)
负责人:「除了抖音博主列表和数字人收尾交给我和 CodeX,其他自己规划连续执行方案优化完」。一轮做完三主线。全 app-only **未碰引擎**。提交 `e824db4`。**tsc 0 · 445 测(+30)· lint 既有 · i18n zh/en 键齐(400/400)· build+resign+install 到 `/Applications/Inkast.app`(签名有效、camera/audio/screen-capture entitlement 在)**。
- **主线二·选题=可追踪项目+待办**:`PoolEntry` 加 `todos[]`;`topicPool` 加 `addTodo/toggleTodo/removeTodo` + IPC(与 note/status 互不清掉,+4 测)。新纯函数 `src/lib/topicProject.ts`(`isTracked`/`summarizeProject`/`activeProjects`,+9 测)。驾驶舱选题详情加**待办清单**(勾选/增删);新「**项目**」子 Tab(`ListTodo`):聚合所有已跟进选题(状态推进/有观点·草稿·产物·待办),显示进度 `done/total` + 下一步 + 标记,点开回选题详情。`allCards`(不过偏好引擎)hoist 出来供项目聚合 + 跨面板跳转定位用。
- **主线三·检索/观点库/导出备份**:① 新纯函数 `src/lib/searchIndex.ts`(词项 AND 匹配 + 标题加权 + 片段提取,+11 测);Workspace 顶栏**全局检索浮层**(`SearchOverlay`,⌘K):跨 选题/我的观点/拉片报告/录屏/成片/发布稿,**纯渲染端聚合只读 IPC(cockpit/pool/library/publishBoard),不新增后端不读盘**;选题/观点 → 跳驾驶舱选中(CockpitPanel 新 `jumpCardId` prop,被偏好隐藏的卡也能选中),文件 → 访达打开。② 驾驶舱「**观点库**」子 Tab(`Quote`):聚合所有 `note`,可检索/复制/跳回选题。③ 新 `electron/backup/backup.ts` + `backup:export`:把 App 状态/配置(`cockpit-pool/following/produce/avatar/cockpit/engine/publishing.json` + `video-factory/jobs.json` + manifest)拷到选定目录,**不含媒体文件与密钥**;设置面板加「导出备份」。
- **主线五·成片 Gate B 渲染前预览**:引擎**实证支持** `--preview-pack`(run.py:867/1122,仅需 `build/<slug>/script.json`,渲 `output/previews/<slug>/cover.png` + `motion-preview.mp4`,不覆盖正式成片)。`jobManager` 加 `preview` 阶段 + `awaiting-preview` 态 + `confirmPreview`;`confirm` 按 `wantPreview` 分流(默认 slides 开);`replan` 支持从预览态回退;`#collectPreviewArtifacts` 收产物;假引擎补 `--preview-pack` 分支,+3 测。`ProducePanel` 投料加「**渲染前预览**」开关(默认开)+ **Gate B 闸门**(预览产物可打开 + 确认渲染/返回改稿);`awaiting-preview` 进 Tab 角标(琥珀)+ 系统通知。
- **关键认知**:① 全局检索做成纯渲染端聚合现成只读 IPC = 不碰后端、零读盘、即时;② Gate B 预览只需拆页产物(script.json),无需先配音,故能在确认文案后立刻出预览;③ 与并行 CodeX 抖音任务**隔离**(只提交我的文件,未碰 douyin/following/FollowPanel/followingTypes;打包时负责人同意一并打进 CodeX 在制改动)。**真机验**:驾驶舱「项目」Tab 看进行中选题+勾待办 · ⌘K 全局搜 · 「观点库」聚合复制 · 设置→导出备份 · 成片勾「渲染前预览」→确认文案→看预览→确认渲染。

### ✅ 2026-06-27 驾驶舱关注源追踪:抖音博主不再只是主页收藏
负责人指出「可以打开主页,但不能直接看到关注博主内容;关注没有意义」。本轮把抖音博主源从静态书签升级为**手动追踪源**:添加/检查更新时用隐藏 Electron Chromium 监听页面真实 profile + post 接口,不伪造 `a_bogus`、不读取 cookie 文件。作品 feed 若被风控挡住,仍用 profile 的 `aweme_count` 建立基线并在后续刷新时提示「疑似新增 N 条」;若当前会话拿到 `aweme_list`,自动补成普通视频卡,继续支持复制链接/去拉片。
- **后端**:`electron/lib/douyin.ts` 新增 `probeDouyinUser()` + `parseDouyinProfileResponse()`。`listDouyinUserVideos()` 保持旧语义(拿不到视频就抛错),关注源用 probe 的 profile 降级结果。`FollowingStore.refresh(id)` 新增 IPC `following:refresh`,写回 `awemeCount/lastAwemeCount/newAwemeCount/trackerStatus/lastCheckedAt`。
- **前端**:`FollowPanel` 博主卡新增「检查更新」按钮,显示作品数、疑似新增数、上次检查时间;能补入公开视频时在列表顶部生成视频卡,仍可「复制链接 / 去拉片」。添加博主时会先建立作品数基线。
- **验证**:`npx vitest --run electron/lib/douyin.test.ts src/lib/followingTypes.test.ts` 15 passed;`npm run typecheck` pass;`npm test` 447 passed;`npm run lint` exit 0(仅既有 DrawOverlay warning);`npm run build-vite` pass;`git diff --check` pass。`npm run i18n:check` 仍因全仓多语言旧缺键失败。
- **剩余风险**:抖音作品 feed 仍由平台风控决定是否返回;本实现能在 feed 空响应时提供更新提醒,但不能在未登录/异地风控场景强制拿到最新视频链接。强保证仍需要负责人确认「App 内登录抖音浏览器会话」边界。

### ✅/🟡 2026-06-26 驾驶舱关注博主修正:抖音主页可跟踪,作品列表走浏览器辅助并诚实降级
负责人要求「驾驶舱里选择定向博主跟踪,复制视频链接,进入拉片」。复盘 Claude 卡点:**单视频 SSR 分享页**和**博主作品 feed**是两条完全不同链路;前者 `iesdouyin/share/video/<id>?from_ssr=1` 有 `_ROUTER_DATA`,后者 `/aweme/v1/web/aweme/post/` 即使真实 Chromium 已生成 `a_bogus`/`x-secsdk-web-signature`,在当前匿名/美国网络上下文仍返回 **HTTP 200 + 空 body**,页面显示「服务异常」。所以根因不是少 cookie/UA,也不是 yt-dlp 写法笨,而是作品 feed 被单独风控。
- **实现修正**:`electron/lib/douyin.ts` 新增 `extractDouyinSecUid`、`parseDouyinPostResponse`、`listDouyinUserVideos(secUidOrUrl)`。列表函数不在 Node 里伪造签名,而是创建隐藏 Electron `BrowserWindow` 让抖音页面自己加载,用 DevTools Protocol 监听页面实际发出的 post 接口响应;若返回 `aweme_list`,转成 `{aweme_id,title,share_url}`。
- **产品降级**:`FollowingStore.add()` 现在识别裸 sec_uid / 抖音主页。YouTube 频道仍自动列作品;抖音主页会先尝试浏览器辅助列作品,若当前环境仍返回空,也会把博主主页保存成「关注源」,显示原因,提供**复制主页 / 打开主页**;单条视频卡仍提供**复制链接 / 去拉片**。
- **UI**:`FollowPanel` 区分「博主源」和「视频卡」,新增博主徽标与「打开主页」。提示文案改成「先尝试浏览器辅助,失败也保存关注源」,不再直接拦掉抖音博主主页。
- **验证**:真实探测示例 sec_uid `MS4wLjABAAAAjN32ZoC90W_FXxpeck2ATV5PCQcnnHM2cSzm8SHdcGCEC3P_fxGweCSTutk3Mvqq`:Node/curl 用户页=72KB JS 壳、无作品;真实 Chrome profile API 正常、post API 请求带签名但响应空。自动单测 `431/431` 通过;`npm run typecheck` 通过;`npm run build-vite` 通过。`npm run lint`/`npm run i18n:check` 仍受既有全仓格式/多语言缺口影响,非本轮新增链路阻断。
- **剩余风险**:在已登录/中国网络/抖音风控放行的 Electron 会话里,`listDouyinUserVideos` 应能吃到页面实际 post JSON;当前匿名环境无法承诺「示例 sec_uid ≥5 条」。这不是再堆服务端请求能解决的点;后续若要强保证,需要做显式「抖音登录/浏览器会话」入口,由负责人确认账号授权边界。

### ✅ 2026-06-26 数字人·成片集成(HeyGen 内置 + 通用 HTTP 适配器,已打包,待负责人配 key 真机验)
负责人定:**弃用本地 PersonalAvatarKit(Codex 半成品、零真实产出)→ 调研开源数字人 → 走云 API**。**调研硬结论**(GitHub README 实读):高质量开源口型模型(Duix-Avatar/HeyGem·MuseTalk·Wav2Lip·LatentSync·Ultralight)**清一色 NVIDIA CUDA**,Apple Silicon Mac 本地跑不了;搜遍 GitHub **无 MLX/CoreML 原生方案**;唯一跨平台的 AIGCPanel 在 Mac 上重活也得走云/远程。声音克隆这半边 Mac 可(引擎已有 f5-tts-mlx)。→ **难的是脸/口型,只能上云或上 NVIDIA**。负责人选**云 API**;再选 **HeyGen 内置 + 通用适配器**(HeyGen API 最干净、GitHub 一堆 SDK、一张照片即生成形象、x-api-key;国内腾讯智影/硅基/百度曦灵零开放 SDK、企业门槛高)。
- **架构(provider 适配器,不锁死一家)**:纯逻辑 `electron/avatar/avatarAdapter.ts`(HeyGen `/v2/video/generate`→轮询 `/v1/video_status.get`→视频地址 + 通用 HTTP 按 JSON 路径映射;`interpolate`/`extractByPath`/`validateConfig`,**+10 单测**)+ 薄编排 `avatarManager.ts`(submit→poll 6s/超时 12min→下载 MP4 到 `userData/avatar-outputs`;config 落 `userData/avatar.json`,**API key 经 safeStorage 加密**;jobs 落 `avatar-jobs.json` 原子写;EventEmitter→`avatar:jobUpdate`)+ `registerAvatarHandlers`(avatar:getConfig/setConfig/submit/listJobs/remove/openOutput)。main.ts 接 `AvatarManager`。preload + d.ts 全加 `avatar.*`。
- **UI**:成片 Tab 顶部加**模式切换**「文案→翻页视频 | 数字人口播」(`viewMode`,勿与 JobMode `mode` 撞名)→ 数字人模式渲染新 `AvatarPanel`(左:供应商/key/形象 avatar_id 或 talking_photo_id/音色 voice_id 设置[generic 走 JSON 映射]+ 口播稿;右:任务列表 状态/打开成片/删除;口播稿可从成片输入带过来)。新 i18n `produce.mode.*` + `avatar.*`(中英齐)。
- **现实前提(UI 已诚实标注)**:云方案都要**先在 HeyGen 后台注册形象(实名/肖像授权)+ 拿 API key**(HeyGen 一张照片即可建形象);Inkast 只把口播稿送过去取回 MP4,不做数字人本体。
- **⚠️ 没你的 HeyGen key 没法端到端实测**(纯逻辑已单测锁住请求/响应映射;HTTP 编排照 HeyGen 文档契约)。**真机验**:成片→数字人口播→填 HeyGen key + avatar_id/talking_photo_id + voice_id → 贴口播稿 → 生成 → 轮询出 MP4 → 打开成片。**tsc0 · 406 测(+16:10 adapter+6 ytdlp)· lint 既有 · build+resign+install。**
- **未做/留后**:HeyGen 形象/音色「列表拉取」(现在手填 id)· talking_photo 上传照片建形象(现需先在 HeyGen 后台建)· 通用适配器接某家国内具体 API(等你给账号/契约)· 数字人产物入资料库/漏斗回写。

### ✅ 2026-06-26 驾驶舱「关注」(Phase 2:收藏想拉片的视频 → 一键去拉片,已打包)
负责人「继续驾驶舱关注博主浏览」。**先验证后做**:抖音博主作品列表**拉不到**(实测 iesdouyin 用户 SSR 页 72KB 无 `_ROUTER_DATA`/无任何作品数据——博主 feed 是受 a_bogus 签名保护的另一接口,SSR/yt-dlp 都够不到);**YouTube 频道列表可用**(yt-dlp `--flat-playlist`)。故做成「收藏夹 + YouTube 频道自动列」的诚实形态。
- **驾驶舱第 5 个子 Tab「关注」**(`Bookmark` 图标,在 topics/sources/hot/peers 后):新 `FollowPanel`——贴链接添加:**YouTube 频道→自动列最近 12 条作品批量加;单条视频(抖音/YouTube/B站)→取标题加一张卡**;抖音博主主页→诚实拦「拉不到作品,请贴单条视频链接」。每张卡:平台标 + 标题 + **复制链接** + **去拉片** + 删除。
- **去拉片一体化**:`FollowPanel.onGoAnalyze(url)` → `CockpitPanel.onGoAnalyze` → `Workspace` 设 `analyzePrefillUrl` + 切到拉片 Tab → `AnalyzePanel` 新 `prefillUrl` prop:消费一次(`onPrefillConsumed` 清空)→ 预填 URL + **自动 fetchAndAnalyze**(抖音走 SSR 提取/YouTube 走 yt-dlp,复用现成链路)。
- **后端**:`electron/cockpit/following.ts`(`FollowingStore` 落 `userData/following.json` 原子写;`add(url)` 按 `classifyLink` 分流:YT 频道→`listChannelVideos`、单条→`fetchDouyinShareInfo`[抖音]/`ytdlpProbeTitle`[其余] 取标题;去重)。新纯函数 `src/lib/followingTypes.ts` `classifyLink`(平台×频道/视频,**+5 测**)。`douyin.ts` 抽 `fetchDouyinShareInfo`(probe 不下载,复用);`ytdlp.ts` 加 `ytdlpProbeTitle`。新 IPC `following:list/add/remove/clear` + preload + d.ts。
- **tsc0 · 415 测(+9:5 douyin+4 following…实为 followingTypes 5)· lint 仅既有 · build+resign+install。** **真机验**:驾驶舱→关注→贴 YouTube 频道(列最近作品)/贴抖音单条视频链接(加卡)→ 复制链接 / 去拉片(自动切拉片拆解)。
- **限制(诚实)**:抖音博主「批量列作品」做不到(平台反爬);抖音靠贴单条视频链接收藏。

### ✅ 2026-06-26 抖音贴链接拆解攻克(负责人给合规提示词 → SSR 分享页提取,免 yt-dlp,已打包)
负责人指出 CodeX 用「公开分享链接提取」成功了,给了提示词。**关键差别(我之前漏的):用移动端 UA 请求 iesdouyin 的 SSR 分享页 `?from_ssr=1`,HTML 里直接渲染 `window._ROUTER_DATA`**——我之前只 curl PC 页(反爬桩)和走 yt-dlp 坏 extractor,没试这条。**实测(用户真实视频 id 7646665973897973043):移动 UA + iesdouyin SSR → 200/39KB → `_ROUTER_DATA` 解析出 desc + `play_addr.url_list[0]` 公开(带水印)播放地址,全成功**(下载这步我沙箱连不上抖音 CDN http=000=网络限制,但 CodeX 已证下载可行,且就是普通 GET)。
- **合规边界**:只读公开分享页暴露的带水印播放地址,**不去水印、不绕登录/权限/DRM**。
- **实现** `electron/lib/douyin.ts`(**抖音不再依赖 yt-dlp**):`extractAwemeId`(/video/、modal_id、share/video/ 多形态,纯函数)+ `parseRouterData`(抽 `window._ROUTER_DATA`→`loaderData[<page>].videoInfoRes.item_list[0].video.play_addr.url_list[0]`,纯函数)+ `resolveAwemeId`(短链 v.douyin 跟随跳转)+ 移动 UA+Referer 下载(跟随 30x,进度)。**+5 单测**(id 抽取/RouterData 解析/桩页与无 play_addr → null 不编造)。
- **接线**:`analyze:fetchUrl` 按 `isDouyin(url)` 分流——抖音走 `fetchDouyinVideo`,其余(YouTube 等)走 yt-dlp。拉片面板:拉取按钮常显(抖音免 yt-dlp),yt-dlp 安装按钮降为「仅 YouTube 等需要」次级入口;urlHint 改「抖音直接贴公开链接免 yt-dlp」。
- **tsc0 · 411 测(+5)· lint 既有 · build+resign+install。** **真机验**:成片… 不对,拉片面板贴抖音公开视频链接(含搜索页 modal_id 那种)→ 拉取→拆解出报告;贴 v.douyin 短链也应能解析。
- **替代了上一条「抖音挡死」的结论**:抖音贴链接现已可用(YouTube 一直可用)。Phase 2 驾驶舱关注博主仍可后续(抖音博主列表是另一接口,需再验)。

### 🟡 2026-06-26 贴链接拆解真机验:YouTube 通,抖音被反爬挡死(此结论已被上一条推翻 —— 换 SSR 分享页路径后抖音可用)
负责人真机贴抖音链接报「拉取失败/需登录」。**实跑已安装 yt-dlp(2026.06.09)逐层定位**——关键事实(用户机器实测):
- **install + arm64 执行 + Chrome cookie 读取全正常**(`Extracted 1091 cookies from chrome`)→ 自下载二进制+ad-hoc 签名方案成立。
- **YouTube ✅**(`--dump-single-json` 拿到 title/时长/33 formats)。
- **抖音 ❌ 平台级反爬,无解(已穷举)**:① 用户贴的是**搜索页 URL**(`/search/...?modal_id=<id>`)→ yt-dlp 报 Unsupported(已修:`normalizeVideoUrl` 抽 modal_id→`/video/<id>`)② 规范地址 + chrome cookie / fresh ttwid(curl 现取)/ mobile UA / `--impersonate chrome`(curl_cffi 已内置)/ iesdouyin share 端点 **全部**仍报 `Fresh cookies needed`;verbose 真因=`Downloading web detail JSON` 拿到**空响应**(`Failed to parse JSON: line 1 column 1`)③ curl 抖音视频页只回 6KB JS 反爬桩页,无 RENDER_DATA/play 地址。**根因:抖音网页接口要浏览器执行 JS 算 `a_bogus` 签名,服务端工具(yt-dlp/curl)拿不到 → 换 cookie/UA/impersonate 都无效。**
- **本轮修(commit 待提交)**:`normalizeVideoUrl`(抖音搜索页 modal_id→规范地址,+测)+ `isDouyin` + 抖音探测只试 1 次不空等 3 轮 + `friendlyFetchError` 改诚实(抖音=平台反爬提示,不再误导「请登录」;其余暴露 yt-dlp 真实报错尾部)。**tsc0 · 396 测(+6 ytdlp)· lint 既有。**
- **🔴 抖音唯一可行路径 = App 内开 Electron BrowserWindow 加载抖音视频页(真 Chromium 跑 JS 签名)→ webRequest 截 CDN mp4 / 读 `<video>.src` → 下载**。更重、且抖音持续对抗会脆(需维护),沙箱测不了(只能真机迭代)。**待负责人定:做不做这个浏览器抓取。** 不做则抖音走「本地视频」,贴链接只服务 YouTube/其它 yt-dlp 站点。

### ✅ 2026-06-26 贴链接直接拆 · Phase 1(拉片支持抖音/YouTube 链接,已打包,待真机验)
负责人要「贴链接直接拆」(优先抖音+YouTube)+ 驾驶舱关注博主浏览。本轮做 **Phase 1:拉片面板支持贴链接**(Phase 2 驾驶舱关注博主→列最近视频→一键去拉片,下一轮)。全 app-only。**tsc0 · 390 测 · lint 既有 · build+resign+install。**
- **yt-dlp 自包含(同 whisper「首次下载」模式)**:新 `electron/lib/ytdlp.ts`——`resolveYtdlp`(先 userData 自管副本,再系统 brew/PATH via augmentedPath)/ `installYtdlp`(App 内一键下载官方 macOS standalone 到 `userData/bin/yt-dlp`,**chmod + ad-hoc 重签 `codesign -s -`**[arm64 拒未签名二进制]+ 验证 `--version`)/ `fetchVideo`(probe 取标题+选 cookie 方案 → 下载到 `userData/analyze-downloads/<ts>` → 找产物;进度回调)/ `listChannelVideos`(`--flat-playlist` 列博主最近视频,Phase 2 用)。spawn 全用 `augmentedPath`(让 yt-dlp 找到 ffmpeg 合流)。
- **抖音 cookie**:抖音常需登录 → probe/下载按 **[无 → chrome → safari]** 升级重试取浏览器 cookie;失败给人话错误(需登录/不支持/已删/超时)。
- **拉片面板**:左栏加「或 贴链接直接拆」块(URL 输入 + 「拉取并拆解」)。未装 yt-dlp → 显「安装拆解组件(~35MB)」按钮(带下载进度);装好 → 拉取(probe/下载进度)→ 落本地 → **走现有 runAnalyze**(转写+抽帧+视觉拉片,产出①②③ + persona 全复用)。`startAnalyze` 重构出 `runAnalyze(vp,ttl)` 供本地选片与链接拉取共用。新 IPC `analyze:ytdlpInfo/ytdlpInstall/fetchUrl` + 进度推送 `analyze:ytdlpProgress/fetchProgress`。
- **⚠️ 未能在开发沙箱实测 yt-dlp**(沙箱正确拦截了「下载+执行外部二进制」)→ 下载/执行在你的机器(真实运行时)才发生。**真机验重点**:① 点「安装拆解组件」能否下成功并跑起来(arm64 签名);② 贴 YouTube 链接能拉取+拆解;③ 贴抖音链接(可能要先在 Chrome/Safari 登录抖音);④ 失败时错误提示是否人话。若自下载二进制在你机器跑不起来,退路是 `brew install yt-dlp`(代码已优先用系统 yt-dlp)。
- **Phase 2(下一轮)**:驾驶舱「关注博主」视图——维护博主主页 URL(`following.json`)→ `listChannelVideos` 列最近视频(标题+可复制链接)→ 一键去拉片(Workspace 加 analyzePrefill,URL 预填进拉片自动拉取)。`listChannelVideos` 已就绪,只差 store + UI + prefill 接线。

### ✅ 2026-06-25 摄像头大小上限放开 + 提交 checkpoint(已打包,待真机验)
负责人反馈「录屏成品摄像头非常小,录制前调大也不生效」。**根因**(读全链路定位):摄像头尺寸在 **6 处**被硬封顶在预设 [10,50]——decode `webcamSizeToFraction` / encode `clampSizePreset` / 两处 `normalizeWebcamSizePreset`(recordingSession + recordingSessionEditorState)/ 编辑器滑条 `max=50` / 叠加窗拖拽 `CAMERA_OVERLAY_MAX=720`。50 = 几何均值的 50% ≈ 16:9 画面宽 ~37%,默认 25 ≈ 18% 宽 → 摄像头永远偏小;**拖拽→成片的 WYSIWYG 映射本就大致成立(叠加窗 px ≈ 成片摄像头 px),纯被上限卡死**。**修**(`32b2fee`):6 处上限 50→100(单调、**向后兼容**:预设 ≤50 的旧工程渲染完全不变)+ 叠加窗拖拽上限 720→1200 + 滑条 max 100。现摄像头最大可到几何均值 100% ≈ 16:9 宽 ~75%,够做口播大头。改 3 处测试(封顶值 50→100)。**tsc0 · 390 测 · lint 既有 · build+resign+install。** 真机验:录制前把摄像头预览窗拖大 → 成片里摄像头同步变大;编辑器右栏摄像头大小滑条现可拉到 100%。
- **提交**(负责人「可以提交」):`76eb052` 把本会话两批(主线四+三快赢、拉片升级)+ 此前累积整合工作做了一个 checkpoint 提交(60 文件,跨多批次交织无法干净拆分,一次提交);`32b2fee` 摄像头修复。分支 `suite`,均过 pre-commit(lint-staged+typecheck)。
- **待负责人对齐后做(本轮提的 3 件里另 2 件,需决策)**:① 贴链接直接拆 + 驾驶舱热门视频浏览/关注博主快速查看(可复制链接→一体化进拉片);② 成片加数字人(映射本地已有数字人项目 or GitHub 开源)。**数字人在 Mac arm64 多为 CUDA/Linux 向,且属新重型后端依赖(与「app-only 不碰引擎本体」张力),需选型 + 本地项目接口信息。**

### ✅ 2026-06-25 拉片技能升级:整合社区开源拉片 skill,产出转向「二次创作直接可用」(已打包,待真机验)
负责人反馈「拉片成果使用价值极低」,点名参考 `hongfamonvAI/hook-lab`。我扒了 GitHub 一批拉片开源项目源码(读了 SKILL/prompt/schema,非只看 README)整合升级。全 app-only **没碰引擎**(改的是 `analyzeService` 的提示词 + 前端输入 + 类型透传)。**tsc 0 · lint 仅既有 DrawOverlay · 390 测试(+1 互喂回归)· vite 打包过 · build+resign+install 到 `/Applications/Inkast.app`(签名有效、entitlement 在)。**
- **调研结论(8+ 项目)**:`hook-lab`(Hook 分类法+强度+3 个带改写文案的角度)· `pelpeljakob-creator/viral-video-analyzer`(逐段产 3 种 AI 提示词:visual 生图/copywriting 仿文案/recreation 拍摄;+hook_score/情绪曲线/内容公式/复刻蓝图)· `keng1304/video-breakdown`(每镜头→Seedance/Kling/中文 prompt + 7 级景别词库,但用本地 CV 模型太重,只借思路)· `Jeorrysyd/xhs-viral-decoder`(人设改写映射表:原→角度→可直接发的标题,套账号 validated formula)· `hanli1999/video-breakdown-skill`(与我们同源六步,多了判型表)· 另 rico3cats/3dudu/ViralX/xiaolu7586 等。
- **诊断**:旧 `LAPIAN_PROMPT` **重「拉技术」**(图形层/工具链/调色),产出=报告+SOP,对二次创作几乎没给料。
- **升级(负责人选「全套」)**:`LAPIAN_PROMPT` 重写成**三产出**:**①拉片报告**(补 Hook 分类+强度评分、内容结构+情绪曲线、判型 口播/教程/叙事/产品/混剪)· **②复刻 SOP**(留,拉技术)· **③二次创作素材包(★直接可用)**=可复用内容公式+填空模板 / Hook 仿写×5(可发布,带平台) / 改写标题×8 表 / 逐段 AI 生成提示词(生图·生视频·仿文案) / 口播稿仿写模板 + 二创质量自检。守住 事实/推断/不知道 纪律。
- **个性化(负责人选「加,可选填」)**:AnalyzePanel 加可选「我的赛道/账号人设」输入(localStorage 记住)→ `analyze:start` 透传 persona → `framePreamble` 注入 → 产出③贴着账号定位/口吻/句式生成,不填则按本片赛道通用改写。链路:start/pipeline/callVision/framePreamble/callMoonshot/callAnthropic + IPC payload + preload + d.ts 全加 persona 形参。
- **互喂兼容**:报告结构改了(关键发现前多了 Hook/情绪曲线/可复刻度,后接配帧逐段表,再接产出③),`extractKeyFindings` 锚定「关键发现」+ 配帧停止仍正确抽 5 条不溢到产出③ → **加了一条新结构回归测试**锁住。
- **真机验**:拉片一条对标视频 → 报告有 Hook 分类/情绪曲线/判型;产出③有可直接发的 Hook×5/改写标题×8/逐段生图+仿文案提示词/口播模板;填了「我的赛道/人设」后产出③贴着你的定位改写。配合上一批的 Markdown 渲染,三产出排版清晰。
- **改动文件**:`electron/analyze/analyzeService.ts`(prompt 重写 + persona 透传)· preload · electron-env.d.ts · `src/components/workspace/AnalyzePanel.tsx`(persona 输入)· 两份 editor.json · `src/lib/lapianFindings.test.ts`(+1)。

### ✅ 2026-06-23 主线四 + 主线三快赢(长任务通知/Tab角标/耗时/撤销条/拉片Markdown,已打包,待真机验)
产品 review 收敛的「主线四 + 主线三快赢」5 项全做完。全 app-only **没碰引擎**。**tsc 0 · lint 仅既有 DrawOverlay · 389 测试(+16 markdown)· vite 生产打包过 · build+resign+install 到 `/Applications/Inkast.app`(签名有效、camera/audio/screen-capture entitlement 在)。**
- **① 长任务终态系统通知 + Dock 角标**:新 `electron/lib/notify.ts`(`notifyTaskAttention`/`clearAttention`,管 Dock 角标计数 `app.dock.setBadge` + `Notification`)。成片 done/awaiting-confirm/failed(main.ts 用 `lastJobStatus` Map 去重,只在状态跨入终态那次提醒)+ 拉片 done/error(`AnalyzeService` 加 `onTerminal` 回调,在 push 终态时触发)→ **仅当主窗口不在前台/最小化时**才系统通知 + 角标 +1(前台靠应内 Tab 角标,不打扰);点通知唤回窗口;窗口重获焦点(`browser-window-focus` + `isEditorWindow`)即清零角标。文案走 `common.json` notify.*(中英)。
- **② Tab 栏角标(Workspace 层维护)**:成片/分析 Tab 切走就卸载,故任务状态汇总移到 Workspace 订阅(`vf.onJobUpdate`+`vf.listJobs` 种子 + `analyze.onUpdate`)。成片角标:待确认(琥珀,优先)> 在跑/排队(绿+脉冲)显计数;分析角标:活跃阶段=在跑。`TabBadge` 组件,`workspace.badge.running/awaiting` i18n。
- **③ 成片任务卡耗时/完成时间 + 历史均时预估**:`fmtDuration`/`fmtClock` 纯函数;运行中走表(nowMs 每秒 tick,仅有 running 时起定时器)显「已用 Xm + 预计约 Y(历史 N 次均时,从 done 任务 startedAt→finishedAt 平均)」;终态显「耗时 X · HH:MM 完成」。头部紧凑时长 + 展开体详情行。`produce.jobs.elapsed/duration/finishedAt/estimate`。
- **④ 危险操作应内撤销条(诚实降级)**:用 sonner toast(App 根已挂 Toaster)。**移动=真撤销**:`publishBoard:move` 改返回「源→新位置」配对 `PublishMovePair[]`,新 `publishBoard:revertMove`(把 to 精确改回 from,**含子目录**,不按阶段根重新落点;两端过白名单+回滚);单条(FileActionModal)与批量(runBatch)都弹「撤销」。**删除→废纸篓=不假装能撤销**(trashItem 无可靠还原 API),只给「打开废纸篓」(新 `publishBoard:openTrash`→`shell.openPath(~/.Trash)`,仅 mac)。**成片删任务=真撤销**:`JobManager.remove` 删前把日志读进内存缓存(FIFO 上限 30),新 `restore(job)`(渲染端回传 job 对象重插+写回日志,**不重跑引擎**),`vf:restoreJob` IPC,删后弹「撤销」。
- **⑤ 拉片报告 Markdown 渲染 + 历史搜索**:项目无现成 md 依赖 → 自研**安全**渲染(不引依赖、不用 dangerouslySetInnerHTML、无 XSS 面):`src/lib/markdown.ts` 纯解析(标题/列表/GFM表格/代码块/引用/分隔线/段落 + 行内 **粗**/`码`/*斜*,+16 测)+ `MarkdownView.tsx` 构建 React 元素(暗色样式)。AnalyzePanel 右栏 `<pre>` 一坨 → `<MarkdownView>`;左栏历史加搜索框(按 title 即时过滤,`analyze.historySearch/historyNoMatch`)。
- **真机验**:投长任务(成片/拉片)切到别的 App → 完成弹通知 + Dock 角标,点通知回前台清角标;在驾驶舱等别的 Tab 时看成片/分析 Tab 角标;成片卡耗时/完成时间;看板移动后「撤销」回原位、删除后「打开废纸篓」、成片删任务「撤销」;拉片报告 Markdown 排版 + 历史搜索。
- **改动文件**:新 `electron/lib/notify.ts`/`src/lib/markdown.ts`+test/`src/components/workspace/MarkdownView.tsx`;改 main.ts/analyzeService/jobManager/registerJobHandlers/publishBoard(电+纯逻辑)/preload/electron-env.d.ts/Workspace/ProducePanel/AnalyzePanel/PublishPanel + 两份 editor.json/common.json。

### ✅ 2026-06-21 主线一:图文线 + 漏斗闭环(产品 review 后负责人选,已打包,待真机验)
5 视角 product review(workflow)后,负责人选「主线一:图文线+闭环」。全 app-only **不碰引擎**。**tsc 0 · lint 仅既有 · 373 测试 · 已 install 到 `/Applications/Inkast.app`。**
- **图文初稿生成**:新 `electron/lib/llmText.ts`(App 内直连 6 供应商文本 LLM,Anthropic /v1/messages + OpenAI 兼容 /chat/completions,不走引擎 .venv;provider 复用成片选的 produce.json,auto 按可用 key)+ `electron/article/articleService.ts`(`article:generate`)+ `src/lib/articlePrompt.ts`(`composeArticleInput` 纯函数+测,把 angle/why/bear/**我的观点** 拼成素材)。
- **图文弹窗**(驾驶舱 TopicDetail「生成图文/编辑图文」按钮 → `ArticleModal`):生成→编辑→**保存草稿**(`pool.setDraft`,`PoolEntry.draft` 新字段)/ **一键送发布看板**。
- **🟢 漏斗最后一跳打通**(原来「已推草稿」终态无人触发):`publishBoard:createDraft` 把图文草稿落成带 frontmatter 的 .md 写进 `Publishing/Drafts`,**frontmatter 主动写 sourceCardId**(选题↔发布稿稳定关联键就地建立,不靠事后模糊匹配)+ 选题置「已推草稿」+ `pool.recordArtifact(kind:"publish")` 回填(新 IPC `pool:setDraft`/`pool:recordArtifact`,`PoolArtifact` 加 publish kind)。
- 池 mutator 全改 `{...prev}` 展开保留 note/draft/artifacts 不被互相清掉(+测)。
- **review 其余主线待负责人后续**:主线二(选题=可追踪项目+待办)· 主线三(检索/观点库/导出备份)· 主线四(长任务通知/Tab 角标/撤销)· 主线五(成片 Gate B 预览)。

### ✅ 2026-06-21 负责人三 UI:驾驶舱可调宽 + 资料库预览 + 看板占满/总览(已打包,待真机验)
全 app-only。**tsc 0 · lint 仅既有 · 371 测试 · 已 install 到 `/Applications/Inkast.app`。**
- **① 驾驶舱右详情可拖宽**:新 `src/hooks/useResizableWidth.ts`(拖拽分隔条 + localStorage 记宽);驾驶舱右详情/操作区 300→可拖(240–640),中间选题列表相应缩放。
- **② 资料库站内预览**:列表项点开右侧抽屉——录屏/成片**内联播放**(`loadFileAsArrayBuffer`→blob URL,关时 revoke)、拉片报告**读文本**(新 `library:read` IPC,白名单+文本扩展名+2MB 上限);Finder 打开降级为 hover 图标。
- **③ 发布看板占满屏 + 总览板块**:列从固定 284px 改 `flex-1 min-w-[248px]`(铺满宽度);新增**总览条**(候选→草稿→准备→已发布 漏斗计数 + 本周发布 N + 最久停留 N 天)。
- **待负责人后续**:产品 review(多 agent 找遗漏功能)结果待整理成下一批候选。

### ✅ 2026-06-21 负责人四细节:种子写观点 + 拉片逐字稿进报告 + 成片任务管理 + 看板批量(已打包,待真机验)
全 app-only。**tsc 0 · lint 仅既有 · 371 测试 · 已 build+resign+install 到 `/Applications/Inkast.app`(签名有效/entitlement 在)。**
- **① 驾驶舱「我的观点」(灌观点)**:种子等卡 vault 只读没法写观点 → 详情面板加可编辑「我的观点」框,存进**选题池**(`PoolEntry.note`,`pool:setNote` IPC;`setStatus`/`recordArtifact` 保留 note 不被状态变更清掉,+测);去录屏/去成片时把手写观点作为 `opinion` 灌进 `composeTopicScript`(`resolveNote` + TopicDetail 按 card.id keyed,切卡重置草稿,失焦落盘)。
- **② 拉片逐字稿进报告**:转写出来只喂了模型、没展示 → `analyzeService` 把逐字稿单独落 `transcript.txt` + **附在 report.md 末尾**(「## 附:音轨逐字稿」),报告视图直接可见;互喂仍用模型报告(不含附录)解析关键发现。
- **③ 成片任务管理(取消/删除/重跑)**:JobManager 存 `runningChild` 句柄 + `#canceled` Set;`cancel(id)`(运行中杀进程→close 据 #canceled 标 interrupted;排队中直接标)+ `remove(id)`(删任务+日志,运行中拦);`vf:cancel`/`vf:remove` IPC。ProducePanel 任务卡:运行/排队→「取消/停止」;其余→「重跑」+「删除」。
- **④ 发布看板批量管理**:ItemRow 加复选框(选中/hover 显示)+ 批量操作条(已选 N · 移动到 草稿/发布准备/已发布 · 删除→废纸篓 · 取消选择);复用后端 `move`/`trash`(本就接受数组)。
- **真机验:** 驾驶舱写观点→去成片看口播稿是否带上;拉片报告末尾有无逐字稿;成片任务能否取消/删除;看板能否多选批量移/删。

### ✅ 2026-06-21 负责人三反馈:拉片重写 + 成片逻辑纠偏 + 看板视图(已打包,待负责人真机验)
4 路调查工作流定位根因后,按负责人两决策(录屏走录制 Tab、拉片=密采高清帧+逐字稿)落地。全 app-only **不碰引擎**。**tsc 0 · lint 仅既有 DrawOverlay · 370 测试 · vite 打包过(whisperWorker chunk 在)。**
- **📦 已 build+resign+install 到 `/Applications/Inkast.app`**(`com.sgd.inkast` / `Notch Island Local Dev`,`codesign --verify` 有效,camera/audio/screen-capture entitlement 在 → 录屏/摄像头授权不失效)。**待负责人打开重测:** 文案→视频(走 slides 拆页出多页画面)· 拉片(密采高清帧+逐字稿,首次下 whisper 模型)· 发布看板新视图。
- **发布看板定调(负责人「按你想法」):保持纯文件系统流水线视图,不接 vault 选题状态**——删 `statusToStage` 死代码 + 注明缘由(选题卡与 Publishing 稿无稳定关联键、只能标题模糊匹配会造幽灵卡;选题流转状态在驾驶舱已可见)。后续文件管理功能使用中再加。
- **成片纠偏(根因:文案走错引擎路径)**:文案/想法投料原走 `--input --simple` → 引擎判 idea 正则骨架 → 整篇退化成 1 页空白板 + 单段配音。**修:ProducePanel 文案投料统一走 slides 拆页路径**(`type:"slides"`,拆页→确认点 A→渲染,出多页分镜);删类型/模式选择器=单一「文案→视频」流;无 LLM key 投料前拦截(slides 强依赖 key)。驾驶舱/拉片「去成片」预填 type 改 slides。`composeTopicScript` 之前已补观点字段。
- **录屏分工(负责人定:录屏走录制 Tab,成片只做文案→视频)**:**移除 LibraryPanel 录屏「去成片」**+ onSendToProduce prop(录屏的剪/字幕/缩放/导出在录制 Tab 收口,成片引擎不再处理录屏=避免 smartcut 对成品无效的「原片交付」)。ProducePanel 去掉 recording 投料类型。
- **拉片重写(密采高清帧 + 接逐字稿)**:`analyzeService.extractFrames` 从 **固定 12 帧/360px → 按时长每 ~4s 一帧、封顶 48 帧、宽 960px、-q:v 3**(看清字幕/版式;原来段都配不上、字全糊)。**接逐字稿**:AnalyzePanel 复用录制 Tab 同款本地 whisper(`transcribeAudio`+`loadFileAsArrayBuffer`+`resampleTo16kMono`)转写音轨→带时间戳逐字稿→透传 `analyze:start(…, transcript)`→塞进 vision prompt(framePreamble);失败不阻断(降级仅看画面)。转写开关默认开 + 进度 UI。callAnthropic 重构复用 framePreamble。**未做(更重,留后)**:agentic 多轮「逐帧细看」精修循环(XL)。
- **看板视图做好(负责人定:先视图,文件管理后续)**:后端读 .md frontmatter(`parseFrontmatter` 纯函数+测)→ 卡片有摘要/题材/栏目标签/标题;草稿/已发布列**按子目录二级分组**(可折叠,治 165 篇一堵墙);顶部**全库停太久总数**徽标;停留**精确天数**(>30 红);**骨架加载** + 友好空态;点卡片**站内只读预览抽屉**(复用 board.read)。
- **新测试**:cockpitPrefs(13)/publishBoard symlink 逃逸(4)/parseFrontmatter(2)/subtitleCues 拉丁/recordingSession follow/gifExporter 竖屏。**未纳入**:发布看板接 vault 状态(仍待定)· 真端到端(需负责人环境)· 拉片 agentic 多轮 · 成片 Gate B/资料库搜索等。

### ✅ 2026-06-21 全维度 review + 稳健性/设置面板批次(待负责人验收)
6 维度并行审查 + 对抗验证(workflow,12 agent)。基础健康真实(tsc0/lint 仅既有 DrawOverlay/**346 测试全过**/vite 生产打包过)。负责人「按推荐来」定两决策 + 我做了稳健性修复 + App 内设置面板。**未碰录屏链路、未重打包(`npm run dev` 看)。**

- **🔒 决策①:多轨 NLE = 参考观感即可,单轨+叠加层是终态**(关掉长期悬置大决策,Demo 文档已降级该项,不重写编辑内核)。
- **🔒 决策②:主攻 = 稳健性修复 + App 内设置面板**(纯代码)。
- **稳健性(确认的真 bug)**:① JobManager `logStream` 加 `'error'` 监听(磁盘满/写失败不再崩主进程,同 recordingStream.ts 模式)② 抽 `electron/lib/atomicWrite.ts` 原子写(tmp+rename),全部持久化(jsonStore/keyStore/jobManager/produceConfig/engineConfig + publishBoard:write)改用之,杜绝写一半崩溃截断丢密钥/选题流转;keys.json 保 0600 ③ jobManager close 回调加顶层 `catch`(#touch 抛错不冒泡崩进程)④ publishBoard:move 中途失败尽力回滚已移动 + 如实报半移动态。
- **🟢 App 内设置面板(落地负责人"别靠散落路径")**:新 `electron/settings/settings.ts`(`settings:get/pickEngine/pickPublishing/pickCockpit` IPC)+ `src/lib/settingsTypes.ts` + `SettingsDialog.tsx`(顶栏 ⚙)。引擎/发布/驾驶舱三条外部路径在 UI 里选目录→校验(hasEngine/hasPublishing/hasCockpit)→落 userData(engine.json/publishing.json/**新 cockpit.json**)→即时生效(引擎热更 `JobManager.setPipelineRoot`,发布/驾驶舱每次请求重解析)。`engineRootInfo/publishingRootInfo/cockpitDirInfo` 报 路径+ok+来源(env/config/default)。三个面板错误态(驾驶舱/发布目录不存在、成片引擎红灯)各加「选择目录」按钮;dirHint 从"设环境变量"(打包版 GUI 读不到)改为"点选择目录"。`resolveCockpitDir`/`registerCockpitHandlers` 加 app 参。**新 userData 文件**:`cockpit.json`(驾驶舱目录配置)。
- **🟢 成片引擎去路径依赖 = 方案 A「采用为 App 专属副本」(负责人 2026-06-21 在 4 方案里选 A)**:`settings:adoptEngine` 把当前配置的引擎**冻结复制**到 `userData/engine`(原子:复制到 `.adopting`→校验→删旧→rename;`fs.cp` `dereference:false` 保软链,排除 build/output/input/.git/.DS_Store),重指 engine.json + 热更 JobManager。之后改/移/删开发树都不影响成片。**关键:引擎刻意只用相对 `.venv/bin/python`(软链到外部 uv Python,拷贝后仍有效)+ `python -m`/Python API/`npx`,不用 console-script shebang**——故整树可直接拷贝无需重建 venv/修 shebang(已用迷你 fixture 验证软链保留+解析+排除生效)。SettingsDialog 引擎行加「采用为 App 专属副本」按钮 + 「App 专属副本」徽标(`PathSetting.managed`=路径==userData/engine)。**未实测**:真机点采用复制 ~2.4GB + 采用后真出片(需负责人机器/时间/key)。**未做(更重的)方案 B 全量打包进 .app / C 瘦身重写**,A 够用即止。
- **小缺口**:口播稿 `composeTopicScript` 补 opinion/bear/why/fit 灌观点字段(+测)· KeyDialog 供应商说明走 i18n(`keys.use.*`/`keys.saveFailed`)· 拉片报告读失败显式提示(不再静默回占位,`analyze.reportReadFailed`)· stray 文件清理(删根目录重复 web-demuxer.wasm + gitignore `样片/`/`*.openscreen`)· Workspace 注释 5-Tab→6-Tab。
- **未纳入本轮(需负责人环境/单独排)**:真端到端验收(配 key+.venv 跑通;代码就绪≠已验证,第一次真跑大概率撞集成 bug)· 发布看板接 vault `card.status`(`statusToStage` 是死代码,看板与选题流转割裂,待定接上 or 删码改文档)· 分析 agentic 精修(D)/ASR(C)。

### ✅ 2026-06-21 工程护城河 + 残留小修(负责人选「工程护城河 + 残留小修」)
**tsc 0 · lint 仅既有 DrawOverlay · 368 测试(+22)· vite 打包过。**
- **护城河**:`package.json` 加 `typecheck`(`tsc --noEmit`);`.husky/pre-commit` = lint-staged + typecheck;新 `.husky/pre-push` = `npm test`;新 `.github/workflows/ci.yml`(ubuntu:npm ci→typecheck→lint→test;不跑 builder/浏览器导出测)。补上"346 测试全靠手动"的缺口(review testqa F1)。
- **补关键测试**:`src/lib/cockpitPrefs.test.ts`(13 例:prefDecision 各分支/prefList 过滤排序+稳定/cycle 三态环/togglePlatform/normalizePrefs 归一/nextStatus 回绕,F2)· `electron/publish/publishBoard.test.ts`(4 例:真 symlink 逃逸/../越界/前缀兄弟目录全被 `assertInside` 拦,F3;为此 export `assertInside`/`realpathNearest`)· subtitleCues 拉丁折半 1 例 · recordingSession follow 轨迹清洗 2 例 · gifExporter 竖屏/large/非法比例 3 例。
- **残留小修**:成片回写**全部**平台变体(非只第一条,main.ts onComplete,funnel F2)· JobManager 二级 SIGKILL 定时器存句柄并随 close/error 一起 clear(backend F4)· 驾驶舱视频坏 URL 加 onError 降级(frontend F3)· 驾驶舱卡片按 id 去重(funnel F4)· subtitleCues `visualLength` 真正实现"拉丁每 2 字符算 1"(原 1:1 与文档不符,英文字幕切太碎,testqa F4)。
- **仍未做(明确缓)**:发布看板接 vault 状态(需负责人定)· analyze `videoPath` 路径白名单(F6,判断题)· engineReady 只查 video.sh 不查 .venv(F5,smoke 已兜底)· 真端到端验收(B,需负责人环境)· 分析 agentic(D)/ASR(C)/资料库增强(F)/成片 Gate B(E)。

### ✅ 下一阶段优化 · W1+W2+W3 三波次全做完(2026-06-19/20,待负责人验收)
按 `docs/下一阶段_执行交接_全维度优化方案` 三波次(架构→数据→UI)全部落地。**均 tsc 0 · 320 tests · lint 仅既有 DrawOverlay · vite 生产打包过。未碰录屏链路、未重打包(`npm run dev` 看)。** 两轮并行对抗审查 + 修真实 bug。

**W1(架构)** `53201f0`→`067c291`:选题池(localStorage→主进程 `cockpit-pool.json` + `pool:update` 实时推送)· 三条漏斗(拉片互喂/去录屏带选题/成片回填,验收 §7③ 全通)· 发布看板(第 6 Tab,单一映射表)· 密钥配置(safeStorage)。
**W2(数据)** `302584b`:驾驶舱补判断字段(opinion/bear/heat/concept)· 分析 prompt caching · hasFfmpeg 真实探测。
**审查修复** `e270dbf`:6 路对抗审查 → 池实时推送、迁移护栏(`importLegacy` 原子+标记)、回填只挂真成片视频、预填消费即清、注入卡常显、白名单按目录段边界、keys.json 0600。Anthropic API 形状经核验合法。
**W3(视觉)** `67441b8`→`1b884bd`:① 双标题栏消除(嵌入编辑器去重语言切换+浅一档工具条)· 默认语言跟随系统/中文 ② **驾驶舱高密度 3 栏重做**(左视图导航/中卡片网格/右详情+媒体预览;`src/lib/mediaKind.ts` 按后缀判类→图片缩略图+全屏灯箱/视频内联) ③ 品牌色 token 收口(tailwind `ink.*`,审计无蓝色残留,不做高风险无差别迁移) ④ 引擎 doctor 显性化(成片启动自检+投料前拦缺依赖;分析 ffmpeg 提示+禁用)。
- **未做(明确置后)**:i18n 其余 12 语言(`i18n:check` 红,产品主打中英已齐,缺键回退英文,doc §2 [W3·低优先])。
- **新 env**:`INKAST_PUBLISHING_DIR`。**新 userData 文件**:`cockpit-pool.json`/`keys.json`/`publishing.json`。

- **W1·本地选题池(§6.2)** `53201f0`:选题流转从渲染私有 localStorage → 主进程 `cockpit-pool.json`(`electron/cockpit/topicPool.ts` + 通用 `electron/lib/jsonStore.ts`),使 JobManager/AnalyzeService 也能读写。vault 仍只读,池只存增量(状态覆盖/回填产物/注入卡)。`pool:get/setStatus/addInjected` IPC + 纯合并 `src/lib/poolMerge.ts`。CockpitPanel 改读池(一次性迁移旧标记)。
- **W1·三条漏斗数据流(验收 §7③ 全通)**:① **拉片→选题池互喂** `fbb5df3`(`src/lib/lapianFindings.ts` 解析关键发现→注入卡,解析不到不造假);② **去录屏带选题** `abaaa5e`(口播稿 `composeTopicScript` 塞进内容保护提词窗,`prompter-set/get-script` IPC);③ **成片回填** `abaaa5e`(`SubmitInput.sourceCardId` → JobManager `onComplete` → 回写「已成稿」+ 成片产物徽标)。新增「去成片」按钮(选题转 idea 投料带溯源)。
- **W1·发布看板(§5.5/§6.3)** `e49ee6e`:第 6 个 Tab「发布」,只读扫 `Operations/Publishing` → 流水线分格(候选/草稿/发布准备/已发布)+ 计数 + 停太久告警。**★单一映射表** `src/lib/publishBoard.ts` MAPPING(改结构主要改这表);不认识的归「未分类」高亮告警。实测 198 文件→候选28/草稿88/发布准备5/已发布42/未分类0。`publishBoard:list/open`(路径边界白名单)。**只读监控,不碰发布执行。**
- **W1·密钥配置后端(真端到端 任务 A)** `067c291`:顶栏🔑弹窗填 Claude/DeepSeek,`safeStorage` 加密落 `userData/keys.json`(不落明文/不进 git),启动解密注入 `process.env`(JobManager/分析之前),重启仍在。成片 Tab 缺 key 黄条(兑现 friendlyError 假设)。
- **W2·数据保真** `302584b`:驾驶舱补 vault 判断字段(§3.1:opinion 观点/bear 看空/heat/concept,之前全丢)· 分析 prompt caching(§5.2:LAPIAN_PROMPT→system+cache_control,末帧加缓存,为精修循环铺路)· hasFfmpeg 真实探测(`ffmpeg -version`)。
- **新 env**:`INKAST_PUBLISHING_DIR`(发布看板根,默认 KnowledgePlanet Publishing)。**新 userData 文件**:`cockpit-pool.json`(选题池)· `keys.json`(密文)· `publishing.json`(发布根配置)。
- ⏭️ **未做(W3 视觉,留下一会话)**:驾驶舱高密度 3 栏重做 + 媒体预览(§2/§5.1)· 全局 token 统一 + 双标题栏消除(§2)· 发布看板视觉精修 · i18n 其余 12 语言(置后)。companion task B(doctor 自检显性化)亦未做。

## 一句话
基于 OpenScreen(MIT)二次开发的 macOS 本地录屏 App,核心:**边录屏边用 Excalidraw 实时画讲解**。**Phase 1 MVP 已跑通**(2026-06-02)。

## ✅ 界面对齐 —— Phase 0–3 全部落地(2026-06-19),待负责人真机验收
**负责人 2026-06-19 拍板**:只**换肤 + 把已有功能重新摆 + 加左侧媒体面板**;不要贴纸/滤镜/转场,不做多片段 clip 模型。**完整交接见 [docs/Inkast_界面对齐_交接.md](docs/Inkast_界面对齐_交接.md)**。**Phase 0–3 + 转写修复已全部 build+resign+ditto 到 `/Applications/Inkast.app`**(`com.sgd.inkast`,`codesign --verify` exit 0;dist 内确含 tabMedia/statSavable/whisper-base_timestamped)。

- ✅ **Phase 0 — Token & 标题栏 chrome(D26)**:全局 `#09090b`→`#0A0C0E`;比例下拉 + 绿色「导出」按钮搬到标题栏右侧(仅有视频时显示)。
- ✅ **Phase 1 — 时间线外观对齐(D29)**:6 轨左侧图标+名称标签列(激活 dnd-timeline `sidebarWidth=96`)、sticky 刻度尺、工具条 icon→icon+文字、时间线 `#0C0F12`。
- ✅ **Phase 2 — 智能粗剪侧面板(D30)**:`SmartCutPanel.tsx`,统计卡 + 分组操作,复用全部既有 handler;时间线工具条下拉改成按钮。
- ✅ **Phase 3 — 3 栏 + 左侧媒体面板 + 顶部 Tab(D31)**:`MediaPanel.tsx`(媒体/智能 Tab);`editor-main-deck` 用 grid-areas 改 3 栏。**坐标安全已确认**:`overlaySize` 是 ResizeObserver 实测 → 预览变窄自动重算 → 预览=导出仍成立。文本/调节仍在右 Inspector(降风险,未重路由)。
- 验证(每阶段):tsc 0 · biome 无 fix · lint 仅既有 DrawOverlay · **263 tests**。
- ⚠️ **真机验收重点(无法 headless 验证)**:① 3 栏布局下,带叠加图片/视频 + 字幕 + 自动放大的工程,**预览位置与导出帧一致**;② 时间线拖拽/选中/跳转正常;③ 左侧媒体面板「媒体/智能」Tab、插入图片/视频、智能粗剪都能用;④ 录屏授权不反复弹。
- 新会话先读交接文档 + 本文件顶部 + DECISIONS D22–D31。

## 🐛 2026-06-19 转写(ASR)失败已修(详见 DECISIONS D27/D28)
负责人实测「转写失败」(删停顿 OK,因为它走能量 VAD 不需转写)。**Node 离线复现确证根因**(用 ffmpeg 抽样片音频 + curl 下模型 + Node 跑同一套 transformers.js):
- **根因① 崩溃**:`onnx-community/whisper-base` 没导出 cross-attentions,app 用的词级时间戳(`return_timestamps:"word"`)必崩 → **改用 `onnx-community/whisper-base_timestamped`**。
- **根因② 乱码**:不传 language 时 whisper 默认英语 → 中文出乱码 → **按界面语言传提示**(`localeToWhisperLanguage`,zh→chinese)。
- 另加固:WASM 回退覆盖推理(非只加载)+ 真实错误 toast/console 暴露。验证:tsc 0 · lint 既有 · **263 tests**。
- 📦 **已 build+resign+ditto 到 `/Applications/Inkast.app`**(`com.sgd.inkast` / `Notch Island Local Dev`,`codesign --verify` exit 0;dist 内 worker 确含 `whisper-base_timestamped`)。**此包同时含 Phase 0 标题栏改造**。**待负责人从启动台打开 Inkast 重测**:导入中文人声视频 → 识别废话 → 应出中文 + 词级删语气词/字幕可用。首次需联网下新模型(~75MB,之后离线)。若仍失败会弹红色 toast 带真实错误。

## 🟡 当前:推进「Demo 效果」(`docs/Inkast_Demo效果_完整要求.md`)
- ✅ **口播提示词(提词器)** — 功能其实 phase-1 就有(`Prompter.tsx` + `createPrompterWindow` 的 `setContentProtection(true)`,自动滚动 + 速度 + 字号,⌘⇧T 触发),负责人没发现。**2026-06-19 补可发现性**:录制 HUD 控件组加「提词器」按钮(`ScrollText`,录前/录中都可点,开时高亮),走 `prompter-toggle`/`prompter-state` IPC + `onPrompterState` 状态广播(仿摄像头按钮)。**窗口内容保护、不进录屏**(亲测打包 main.js 含 `setContentProtection`)。详见 DECISIONS **D22**。验证:tsc 0 · lint 过 · 239 tests · build+resign 全过(`com.sgd.inkast`)。需负责人真机验收:HUD 点提词器→粘讲稿→▶ 自动滚动→录一小段确认成品看不到它。
- ✅ **① 录屏/光标/自动放大手感** — 负责人已验收(D12/D14/D15)。
- 🟡 **② UI 清晰化(§2)** — Code 已实现+build,**待负责人验收「界面更清楚」**。详见 DECISIONS **D16**。逐条:Inspector 固定标题区(全局/选中片段切换 +「← 返回全局」)、rail 分「画面/项目」两组+文字标签(移除与底部时间线重名的「时间轴」项,波形开关移到时间线工具条)、文案人话化(开始录制/画面外观/摄像头布局/放大·剪掉·标注·打码·变速/空状态补「录制新视频」)、低频项收进顶栏「帮助」菜单、选中片段描边加强。
  - 验证:`tsc` 零错误 · `lint` 过(仅既有 DrawOverlay warning)· `npm test` **218 passed** · `vite build` + `electron-builder --mac --arm64 --dir` + `resign-local.sh` 过。
  - 📦 `release/1.4.0/mac-arm64/Inkast.app` **已重签**(`Identifier=com.sgd.inkast` / `Notch Island Local Dev`,screen-capture entitlement 在)→ 录屏授权可持久。审 UI:`open` 它,或 `npm run dev` 但**dev 下别录屏**(见下方铁律补充)。

### 📦 2026-06-19 打包后安装到 /Applications(负责人选定)
- 负责人「找不到 app」:打包产物埋在 `release/1.4.0/mac-arm64/Inkast.app`,不在「应用程序」、Spotlight 搜不到。
- **决定**:每次 `vite build → electron-builder → resign-local.sh` 之后,**再 `ditto` 一份到 `/Applications/Inkast.app`**(`rm -rf` 旧副本 → `ditto` 保留签名/xattr → `codesign --verify` 确认 `com.sgd.inkast` 身份不变 → 录屏授权随身份保留,不失效)。这样启动台/Spotlight 搜「Inkast」即可开。
- **新流程铁律**:打包链 = `vite build` → `electron-builder --dir` → `resign-local.sh` → **`ditto` 到 /Applications**。少最后一步 → 负责人又测到旧版/找不到。

### ⚠️ 2026-06-17 踩坑:electron-builder 后必须 resign,否则反复弹录屏授权
- 现象:负责人 `npm run dev` / 开打包版录屏 → **无限重复弹"Screen Recording permission is required"**,授权后回来仍弹。
- 根因:macOS 把录屏 TCC 绑在**代码签名身份**(非 bundle id)。① `npm run dev` 跑的是 dev Electron(`com.github.Electron`),身份不稳→必弹;② 我为 §2 跑了 `electron-builder`,把上一版**已重签的好 app 覆盖成 adhoc**(`Identifier=Electron`,cdhash 每次变)→ 系统当新 app→授权存不住。即 D8/D9 的坑被重新踩出来。
- 修复:`bash scripts/resign-local.sh`(复用现有稳定证书,不改签名身份)→ 恢复 `com.sgd.inkast` → 负责人授权一次+退出重开即持久。已于 2026-06-17 重签完成。
- **教训(写进流程)**:纯前端改动**不要重新 electron-builder**(`npm run dev` 或导入视频即可审 UI);**一旦跑了 electron-builder,必须紧跟 `resign-local.sh`**,否则留下 adhoc 坏包。dev 模式**不能用来测录屏**(身份不稳,必弹)。
  - 验收通过后再做 **③ 叠加轨(§3)** 和 **④ 智能粗剪(§4)**。
- 🟡 **③ 叠加图片/视频片段轨道(§3)**:**Phase 1 图片叠加已实现+verify,待负责人验收**(详见 DECISIONS **D17**)。复用 annotation image 管线补 3 缺口:① 时间线工具条「插入图片」按钮(播放头插入画中画、默认 5s 居中)② 不透明度(预览/导出/存读都接上)③ 右侧『画面』数值控件(位置X/Y + 宽度 + 居中 + 不透明度)。图片叠加层暂落在标注轨;独立叠加轨 + **视频片段叠加** = Phase 2。验证:tsc 0 · lint 过 · 218 tests · vite build 过(纯前端,未重打包)。审法:`npm run dev` → 导入一段视频 → 工具条点「插入图片」→ 预览拖/缩放 + 右侧调不透明度 → 导出 MP4/GIF 看叠加是否正确。
  - **2026-06-17 负责人反馈三修**:① 「插入图片」原是图标条里的纯图标钮、太难找 → 先改成显眼绿色按钮,再按反馈**改回普通中性按钮**(以后旁边会并列"插入视频")。② 新增**把图片直接拖进预览**即插入叠加层(外部文件拖放,带绿色虚线提示;不影响内部 pointer 拖动)。③ 修**顶栏拖不动窗口**:根因是左侧 `flex-1` 容器整块标了 `no-drag`、把整条 titlebar 盖成不可拖 → 改为容器可拖、只给各控件标 `no-drag`,空白处恢复可拖。
  - **2026-06-17 摄像头叠加位置随录制(D18)**:录制时拖动头像窗的位置现在写入会话,编辑器/导出按该位置放画中画(不再固定右下角)。贯穿 cameraOverlaySettings→windows→recordingSession→recordingSessionEditorState→compositeLayout。**需重录验证**。
  - 📦 **打包版已重 build + resign**(含上述全部 + §3 Phase1):`release/1.4.0/mac-arm64/Inkast.app`(`com.sgd.inkast` 稳定签名)。验证:tsc(含 electron)0 · lint 过 · 218 tests · build+resign 全过。**摄像头位置改的是录制链路,必须用打包版重录测**(dev 测不了录屏)。
- 🟡 **§3 Phase 2 视频片段叠加(预览 + 导出)已实现,待负责人验收**(详见 DECISIONS **D19**):新模型 `OverlayClipRegion`;插入(工具条「插入视频」+ 拖视频进预览);预览同步播放 + 拖/缩放/不透明度;时间线独立「叠加轨」;右侧『画面』面板;**导出 MP4/GIF 逐帧合成**(隐藏 `<video>` 按 source 时间 seek)。已 build+resign 进打包版(`com.sgd.inkast`)。验证:tsc 0 · lint 过 · 221 tests · vite/builder/resign 全过。暂未做:源裁剪起点 UI、片段音轨。
- 🟡 **④ 智能粗剪(§4)Phase 1「删长停顿」已实现,待负责人验收**(详见 DECISIONS **D20**):能量 VAD 检测停顿(`lib/cut/pauseDetection.ts` + `hooks/usePauseDetection.ts`)→ 进编辑器自动出「智能粗剪」横幅(M 处停顿 · 可省 X 秒)→ 一键删除转 TrimRegion(复用现有 ripple+导出,时长缩短、可撤销)。已 build+resign。验证:tsc 0 · lint 过 · 227 tests · build/resign 全过。Phase 2(删废话,需本地 ASR)/Phase 3(字幕)/逐条复核 UI/交叉淡化 = 后续。阈值可能需按真实录音再调。**2026-06-18 按负责人反馈:智能粗剪从顶部自动横幅改成时间线工具条的「智能粗剪」按钮(点开下拉看检测结果再一键删);检测逻辑不变(负责人认可"纯声音不准但可手工调")。**

  **2026-06-18 · §4 Phase 2「删废话/语气词」已落地(本地 ASR,详见 DECISIONS D21)** —— 负责人选定 transformers.js whisper 路线。新增 `@huggingface/transformers@3.8.1`;`src/lib/asr/`(whisperWorker 在 Web Worker 跑 `onnx-community/whisper-base`,WebGPU→WASM 回退,词级时间戳;transcribe 主线程重采样 16kHz 单声道 + 收进度)、`src/lib/cut/fillerDetection.ts`(纯函数 12 单测,整词精确匹配保守词表)、`src/hooks/useTranscription.ts`(**按需**触发,非自动)。智能粗剪下拉拆「停顿/废话」两段,废话段点「识别废话」转写→「一键删除语气词」→转 TrimRegion(跳过已被现有 trim 覆盖的)。验证:tsc 0 · lint 过 · **239 tests** · vite build(whisperWorker 单独 849K chunk)· builder+resign 全过(`com.sgd.inkast`)· worker 已进 app.asar。**局限**:首次转写需联网下模型(~几十-上百 MB,之后缓存离线)、WASM 推理耗时、中文词级时间戳偏碎准确度有限、暂无逐条复核面板(只一键删全部+撤销)。**下一步**:逐条复核面板 + 自动字幕(Phase 3,复用同一套 ASR 输出)。需负责人真机验收(首次联网)。

  **2026-06-19 · §4 Phase 2 逐条复核面板已落地(详见 DECISIONS D23)** —— 转写文本逐词列出、点词切换删/留、语气词预选(红删除线/黄底)、应用=转 TrimRegion。`src/lib/cut/wordSelection.ts`(纯函数 8 单测:`fillerWordIndices` + `selectedWordsToSegments`)+ `TranscriptReviewPanel.tsx`(shadcn Dialog)。智能粗剪下拉加「逐条复核…」入口(没语气词也给,可手工挑词)。验证:tsc 0 · lint 过 · **247 tests** · build+resign+ditto/Applications 全过(`com.sgd.inkast`)。踩坑:`asar extract-file` 误把 preload/main 解到仓库根→biome 报 220 error,已清,教训记 D23。

  **2026-06-19 · §4 Phase 3 自动字幕已落地(详见 DECISIONS D24)—— Demo 文档四大块至此全部有可用版本。** `SubtitleCue` 入 EditorState(+持久化);纯函数 `buildSubtitleCues`(12 单测)按停顿/标点/时长/字数断句;`SubtitleOverlay.tsx` 预览底部居中;`frameRenderer.drawSubtitles` 烧进导出(快路径加 blocker);智能粗剪下拉「字幕」段:生成字幕 / 显示·隐藏开关。验证:tsc 0 · lint 过 · **259 tests** · build+resign+ditto 全过(`com.sgd.inkast`)。局限:删词后字幕不自动重算(需重新生成)、样式固定、无逐条编辑。
  **2026-06-19 · Demo 界面对齐 = 评估待拍板(D25)。** 子代理做了 Demo HTML vs 现编辑器区域级差距分析:视觉皮肤已对齐 80–90%(同套 token);真正差距是 Demo 的**多轨 NLE 信息架构**(片段化视频/音频/摄像头 + 素材库),现 app 是单源+效果区间、无 clip 模型。换肤=低风险约 1 周;多轨 clip 编辑=数周、重写核心、独立立项。等负责人定做到哪层。

## ✅ 已验证可用(用户实测)
- 录屏:整屏捕获,**不再反复弹权限**(走 Electron getDisplayMedia,权限归 Inkast 本体)。
- 边录边画:全屏透明 Excalidraw 画布,**跟随被录制的那块屏幕**;⌘⇧D 开关 / ⌘⇧E 绘制⇄穿透 / ⌘⇧X 清屏。
- 摄像头实时画中窗:**⌘⇧C + HUD 按钮并存**,跟随被录屏幕,可拖动/缩放/圆方/镜像。
- 提词器:**⌘⇧T**,`setContentProtection` **不录入视频**,可编辑/调速/字号/自动滚动(「👁 仅你可见」)。
- 鼠标跟随缩放:**已做成自动**(进编辑器自动跑 Suggest Zooms,无需手点;光标遥测写入 `<video>.cursor.json`)。
- 导出 **MP4**(编辑器 → Export;`Mp4OutputFormat`,QuickTime 可播)。

> 用户语:「基本我们提的需求已经都开发完成了」(2026-06-03)。剩下的是体验打磨 + 区域录制 + 图标。

## ⚠️ 待办(2026-06-06 刷新)
1. 🟡 **E 区域录制(已开发,待实测)**:源选择器选中「屏幕」后多出「框选区域」按钮 → 拖框选区(Enter 确认 / Esc 取消)→ 照常录整屏 → 进编辑器自动裁到选区(`cropRegion` + `aspectRatio:"native"`,配合 padding 0 铺满无黑边)。新增:`region-select` 全屏透明覆盖窗 + `RegionSelect` 组件 + 主进程存选区(`open-source-selector` 时重置,确认走 `region-selector-confirm`)+ VideoEditor 新录制分支(`getCurrentRecordingSession`)套用。改动文件:`electron/{main,windows,preload,ipc/handlers,electron-env.d}.ts`、`src/App.tsx`、`src/components/region-select/RegionSelect.tsx`、`SourceSelector.tsx`、`VideoEditor.tsx`。
2. **缩放平滑度可视化微调**:缓动已是 Screen-Studio 级(`easeOutScreenStudio`,`videoPlayback/zoomRegionUtils.ts`)。如还要继续调,优先看三处:① 进出时长/ramp ② 自动候选密度/停留阈值 ③ 焦点跟随平滑(`motionSmoothing.ts`、`focusUtils.ts`)。需用户拿真实录屏边看边调。
3. App 图标 .icns 待补。
4. (可选)录完自动导出 MP4。

### ✅ 本次已完成(从待办移出)
- ~~鼠标跟随做成自动~~(VideoEditor guarded useEffect,a6ef892)。
- ~~摄像头小窗跟随录屏屏幕~~(复用 `getOverlayTargetDisplay()`)。
- ~~控制条加可见按钮~~(HUD 摄像头按钮 + ⌘⇧C 并存)。
- ~~提词器~~(⌘⇧T,内容保护,a6ef892)。
- ~~录屏「多余背景」/「录屏即成品」~~:用户 2026-06-06 同步「录制出的 MP4 已经满幅无背景」。
- ~~鼠标跟随灵敏度/区域准确度~~(2026-06-06):自动 zoom 建议改为 crop-aware 坐标;框选区域录屏时使用裁剪后的 cursor telemetry,不再拿整屏坐标找焦点。候选逻辑从单纯停留检测升级为点击/双击/右键等交互锚点优先 + 慢速稳定段聚类 + 快速经过过滤;自动 zoom 时长限制在 1.2–2.8s,并限制每段视频的建议密度。
- ~~头像与鼠标跟随同步~~(2026-06-06 三次修正):自动建议生成的 zoom region 现在带 `focusMode:"auto"`;预览和 MP4/GIF 导出都使用 `zoomCursorTelemetry` 驱动自动焦点。PiP 摄像头头像是顶层 HUD 浮层:只同步鼠标跟随的 zoom 缩放节奏,明确忽略追焦平移 `x/y`,并按最终画布 safe margin clamp,不会被鼠标移动拖出屏幕或被屏幕内容遮挡;`vertical-stack`/`dual-frame` 独立版式不跟随。用户复测后确认仍会跑出屏幕的根因是旧 live camera overlay 被 WYSIWYG 截进屏幕视频本体;现已改为 content-protected 预览窗口,并让 HUD/⌘⇧C 的 overlay 状态同步打开独立 webcam recorder,停止录制时作为单独 webcam track 挂到 session。旧录制里已经烙进屏幕源的头像无法靠后期逻辑完全修复,需用新版重录。
- ~~录前头像框形状/大小映射到成品~~(2026-06-06):camera overlay 的圆/方 shape 和窗口 size 现在会写入主进程 `cameraOverlaySettings`,保存 recording session 时作为 `webcamSettings` 写入 `.session.json`;新录制进入 VideoEditor 时用该 metadata 初始化 `webcamMaskShape` 和 `webcamSizePreset`,导出 MP4/GIF 沿用同一 webcam track 设置。
- 本次验证:`npm test`(210 passed),`npm run lint`(pass,仅既有 DrawOverlay hook warning),`npm run build-vite`, `npx electron-builder --mac --arm64 --dir`, `bash scripts/resign-local.sh`(signature valid,含 camera/screen entitlements)。

## 2026-06-07 第二阶段打磨记录
- 自动缩放跟随区域第一轮:新增 `buildZoomCursorTelemetry`,预览和 MP4/GIF 导出共用同一条 crop-aware zoom telemetry;框选区域录制/裁剪后,裁剪外光标样本不再被 clamp 到边缘参与 `focusMode:"auto"`,减少鼠标短暂移出选区时画面追到边缘的误判。
- 自动分段密度与光标残影修复:根因是自动候选选择允许 1.8s 间隔且总量按每 7s 一个放行,连续点击会产生过密 zoom 段;同时光标默认 `motionBlur=0.35`,预览/导出都会形成移动残影。现已抽出 `selectZoomSuggestions`,默认按约 12s 一个、最多 12 个、候选中心至少 4.5s 间隔;光标运动模糊默认改为 0,仍可在设置里手动打开。
- 本次验证:focused tests (`zoomCursorTelemetry`,`zoomSuggestionUtils`,`editorDefaults`,`webcamZoomSync`,`compositeLayout`) 24 passed;`npm test` 213 passed;`npm run lint` pass(仅既有 DrawOverlay hook warning);`npm run build-vite` pass(仅既有大 chunk warning)。本轮未跑 `electron-builder`/`resign-local.sh`,因为只改前端 telemetry/测试/状态文档,未触碰打包、签名或 TCC 权限链。

## 2026-06-08 第二阶段打磨记录
- 自动跟随镜头平滑度第二轮:根因是 `focusMode:"auto"` 在 zoom-in 阶段直接追随 raw 光标,鼠标微抖会被放大成画面抖动;全量缩放后的跟随参数也偏快(`0.1→0.25`,ramp `0.15`),且预览/导出的时间归一化不一致。
- 新增 `smoothAutoFollowFocus`:小幅光标抖动 deadzone `0.006` 内不移动镜头;自动跟随参数改为 `0.045→0.16`,ramp `0.28`,真实大位移仍会加速追上;预览和 MP4/GIF 导出共用同一 helper,都按 elapsed time 做归一化。编辑器预览遇到 seek/大时间跳变时重置平滑状态,避免从旧位置慢慢追。
- 本次验证:focused tests (`autoFollowSmoothing`,`zoomSuggestionUtils`,`zoomCursorTelemetry`) 9 passed;`npm test` 216 passed;`npm run lint` pass(仅既有 DrawOverlay hook warning);`npm run build-vite` pass(仅既有大 chunk warning)。本轮未跑 `electron-builder`/`resign-local.sh`,因为未触碰打包、签名或 TCC 权限链。

## 2026-06-16 第三阶段打磨(Cowork 会话)
- 先试**调缓常量**(`AUTO_FOLLOW_SMOOTHING_FACTOR_MAX 0.16→0.12` 等)→ 负责人实测**仍跳屏/抖动/鼠标重影**,确认不是调参能解决。
- **重写自动跟随相机运动核心**(`videoPlayback/autoFollowSmoothing.ts`):把无速度的一阶指数平滑换成 **Screen-Studio 式带速度状态的临界阻尼弹簧**(`AutoFollowState{focus,vx,vy}`)。临界阻尼=无超调(治抖动);速度帧间连续=吸收 target 突变(治跳屏);固定步长子积分=预览/导出手感一致;死区随 `zoomScale` 收紧(治放大时被放大的微抖)。调手感只改一个常量 `STIFFNESS`(默认 90,大=跟手 / 小=稳)。
- 接口改动:`smoothAutoFollowFocus` 现返回 `AutoFollowState`(含速度)。两个调用点 `VideoPlayback.tsx`(预览)与 `lib/exporter/frameRenderer.ts`(导出)改为保存该 state、读 `.focus`、并传入 `zoomScale`。其单测重写为 5 断言。
- 本轮**未动**:`computeZoomTransform`(zoom 进出过渡)、**光标重影**(若重写后仍有重影 → 多半是 cursor motion blur 或单光标渲染,下一轮修 `cursorRenderer.ts`)。未碰打包/签名/TCC。
- 验证(沙箱,跑不了 vitest/vite,只能 tsc+逻辑):`tsc --noEmit` 全项目**零类型错误**;新弹簧 5 断言等价逻辑复算**全绿**。**完整 `npm test` + build + resign 需负责人在 Mac 跑确认**。
- 追加(负责人反馈"抖动好转,但快速移动不够丝滑"):相机刚度改为**随距离自适应**(`STIFFNESS_MIN 70 / STIFFNESS_MAX 320`,远/快→紧跟、近/慢→柔落),仍逐帧临界阻尼无超调;快速移动跟手感更接近 Screen Studio。tsc 零错误、5 断言绿。
- **鼠标重影根因已定位并修复**:`cursor:"never"`(排除系统光标)**只在 `if(platform==="win32")` 分支生效**;macOS 走 `getUserMedia` 桌面采集(`FORCE_GET_DISPLAY_MEDIA_ON_MAC`),光标**已被烙进视频**。但 `VideoEditor` 的 `hasEditableCursorRecording` 仍含 `darwin` → 又叠了一个**恒为箭头**(OpenScreen 默认资源,不随状态变形)的平滑光标 → mac 上必然双光标,快移时叠加层滞后拉开 = 重影。负责人实测描述完全吻合(看得到下面那个不变形的箭头)。
  - 修法(`VideoEditor.tsx`):`hasEditableCursorRecording` 条件去掉 `darwin`,仅 `win32` 叠加 → mac 直接用录像里的真·光标(会变形状、够平滑),不再叠加 → 重影消除。tsc 零错误。
  - ⚠️ 代价/取舍:mac 现在显示的是**真·系统光标**,不是"影院级再平滑/美化"的叠加光标。要在 mac 上做真平滑光标,必须采集端排除系统光标(原生 SCK `showsCursor=false`)—— 这与 D10"为权限持久化而禁用原生 helper"冲突,属架构取舍,留负责人定。
- ⏳ 真机复看:① 跳屏/抖动 ✅好转;② 重影应消失(只剩一个会变形状的真光标);③ 跟随快慢不合适就调 `STIFFNESS_MAX/MIN`。

### Screen-Studio 干净光标 · 路线 A-①(本地 Code 执行,已 build)
- 做了 **A-①**(交接 `docs/Inkast_ScreenStudio光标重写_交接.md`):`useScreenRecorder.ts` 约 L1169 把 getDisplayMedia 分支从 `win32` 扩到 `win32 || darwin`,mac 也请求 `cursor:"never"` 排除系统光标。仍 App 进程内捕获(同一个 `setDisplayMediaRequestHandler`,不弹选择器、不启用原生 helper)→ 不动 D10 权限链、无新弹窗。详见 DECISIONS **D14**。
- 系统音频:Electron 41 loopback 仅 Windows;mac getDisplayMedia 无系统内录声(旧路径在 mac 本就无,无回归),麦克风不受影响。
- 验证:`tsc` 零错误;`npm test` **218 passed**;`vite build` + `electron-builder --mac --arm64 --dir` + `resign-local.sh` **全过**(签名 valid,entitlements: screen-capture/camera/audio-input)。**未碰签名身份/TCC。**
- 📦 测试 App:`release/1.4.0/mac-arm64/Inkast.app`(已重签)。

### A-② 验收结果 + 光标路线定档(2026-06-17)— 详见 DECISIONS **D15**
- **A-① 在 mac 失败**:Code 抠了负责人那段录屏(`recording-1781685366400.webm`,A-① build)两个点击帧 → **真·光标已烙进视频** → macOS 的 getDisplayMedia(SCK)**不认 `cursor:"never"`**。所以 **A-③ 不做**(重开叠加层 = 在真光标上再叠一个 = 双光标回归)。
- **意外发现**:mac 光标遥测 `provider:"native"` 其实**已抓真实光标位图**(本段含箭头 + I 字梁)+ 点击。形状/点击数据不缺,缺的只是"无系统光标的视频"。修正了交接里"恒为箭头"的假设。
- **负责人定档「保持现状」**:当前 build(A-① + D13)= 单个真·系统光标、无重影、形状会变、**零权限弹窗**,实测"非常正常",**即终态**。保留 A-①、保留 D13。
- 搁置(将来按需):**路线 B**(原生 SCK 无光标 + 叠加真形状光标 + 点击高亮 + §3 弹簧平滑)— 代价是录屏权限弹窗回归(推翻 D10),无弹窗版需 Apple 正式签名+公证。**§3 光标平滑升级**也一并搁置(只对叠加层有意义)。
- 系统音频备注:mac 两条路径都不带系统内录声(loopback 仅 Windows);麦克风不受影响(负责人本轮误拒麦克风权限未测,逻辑未改动,应无问题)。

## 🚫 铁律(踩过的坑,见 memory: macos-screen-recording-tcc-pitfall)
- **永不** `tccutil reset` 屏幕录制,**永不**改签名身份。重打包**只用** `scripts/resign-local.sh`(固定证书 `Notch Island Local Dev`)→ 授权可跨重建保留(已验证:同证书重打包后录屏仍免弹窗)。
- 彻底无弹窗的唯一正路 = Apple 开发者账号正式签名+公证(用户暂不做)。

## 怎么跑 / 怎么出新版给用户
```bash
cd 30_桌面App/Inkast
# 改完代码后,重打包并重签(必须重签,否则权限/启动出问题):
npx vite build && npx electron-builder --mac --arm64 --dir && bash scripts/resign-local.sh
open release/1.4.0/mac-arm64/Inkast.app
```
- dev 模式 `npm run dev` 仅适合非录屏的纯前端调试(dev 跑的是未公证的 "Electron",录屏权限会另弹)。

## 我们对上游的本地改动(fork diff,勿回退)
1. `vite.config.ts`:`server.host="127.0.0.1"`(修 IPv6 白屏)。
2. `electron/main.ts`:麦克风权限非阻塞;新增 ⌘⇧C/D/E/X 全局快捷键。
3. `electron/windows.ts`:新增 camera-overlay、draw-overlay 窗 + `getOverlayTargetDisplay()`(画布跟随录屏屏幕)。
4. `electron/preload.ts`:overlay 相关 IPC。
5. `src/App.tsx`:路由 camera-overlay / draw-overlay。
6. `src/components/{camera-overlay,draw-overlay}/*`:两个覆盖层组件(新增)。
7. `src/hooks/useScreenRecorder.ts`:`FORCE_GET_DISPLAY_MEDIA_ON_MAC`(录屏走 App 进程,权限可持久)。
8. 品牌 Inkast + `scripts/resign-local.sh`(固定证书重签)。
