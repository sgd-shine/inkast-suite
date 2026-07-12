# Inkast

**一站式本地内容创作工作台（macOS）：选题 → 拉片 → 录屏 → 剪辑 → 成片 → 资料库，一个 App 走完短视频创作全流程。**

> Inkast is a local-first content creation studio for macOS. It takes you from topic planning and competitor video breakdowns, through native screen recording and timeline editing, to a gated production pipeline and a unified library — all in one desktop app, all on your machine.

- **本地优先**：数据与产物落在本机，API 密钥用系统 `safeStorage` 加密存储
- **诚实工程**：无假进度条（只显示引擎真实阶段）、抓取失败诚实降级不造假数据
- **规模**：约 6.5 万行 TypeScript · 477 个单元测试 · `tsc --strict` 0 错误 · 全项目 0 `@ts-ignore`

---

## 功能全景（5-Tab 工作台）

### 🧭 内容驾驶舱 — 选题从这里开始
- 每日选题看板：读取选题 JSON 数据源，富卡片展示（分数/角度/正文/状态流转）
- 偏好引擎：8 组预设 + boost/hide 过滤排序，自动记忆
- 选题项目化:每个跟进中的选题带**待办清单**与进度，「项目」子 Tab 聚合所有进行中选题
- 观点库：所有选题笔记聚合检索、复制、跳回原选题
- 全局检索（⌘K）：跨选题/观点/拉片报告/录屏/成片/发布稿
- 关注（抖音创作者追踪）：博主作品数基线与更新提醒、公开视频卡一键去拉片、**公开评论抓取**（App 内置浏览器上下文真实请求，失败诚实降级 + 人工兜底）
- AI 博主种子池：22 位已核验 AI 领域创作者 + 18 位候选，分级筛选、一键跟踪

### 🔍 拉片分析 — 把别人的好视频拆成方法论
- 视频逐帧拆解：ffmpeg 抽帧 + Claude Vision → 结构化拆片报告与可复用 SOP
- 抖音贴链接直接拆解（公开分享页提取，免下载工具）
- 报告一键送入成片漏斗

### 🎬 录制 — 演示者友好的原生录屏
- 窗口 / 区域 / 全屏录制，麦克风 + 系统声
- macOS 原生 ScreenCaptureKit 采集，录制流式落盘（长录不怕崩）
- 摄像头画中画：形状/大小/位置预览所见即所得，独立图层进导出
- **实时画笔标注**：边录边画重点
- **提词器**浮窗（内容保护，不会被录进画面）
- 鼠标跟随缩放建议 + 光标遥测，可编辑光标替换

### ✂️ 编辑 — 时间线上把素材打磨成片
- 裁剪、分段变速、区域 crop、自动/手动缩放动效（深度/时长/缓动可调）
- 智能粗剪：静音检测自动去气口
- 音频独立轨 + 波形可视化；本地 Whisper 语音转写
- 壁纸/纯色/渐变背景、运动模糊、隐私区域模糊、点击高亮
- 文字 / 箭头 / 图片标注；工程可保存重开
- MP4 / GIF 导出：弹窗内统一配置格式、画质、尺寸

### 🏭 成片 — 带确认闸门的生产流水线
- 投料 → 脚本生成 → **Gate A 文案确认** → **Gate B 渲染前预览**（封面 + 动效预览，不满意可回退改稿）→ 渲染出片
- 真实进度：只显示引擎真实阶段标记，绝无假进度
- 视频生成引擎为外部可配路径，App 与引擎解耦

### 📚 资料库 — 所有产出一个地方管
- 录屏 / 成片 / 拉片报告统一浏览，一键送进成片或视频工作流
- 一键导出备份（配置与状态，不含媒体与密钥）

### 🌐 全局
- 13 种界面语言（简繁中文、英、日、韩、西、法、俄、土、越、阿等）
- 各环节漏斗互通：选题 → 录制 → 成片 → 发布，上下文自动带入

---

## 技术栈

Electron · React · TypeScript · Vite · PixiJS · dnd-timeline · Vitest（477 tests）· Biome · Playwright

## 快速开始

```bash
npm install
npm run dev        # 开发模式
npm test           # 477 个单元测试
npm run typecheck  # tsc --strict
```

### 本地打包（macOS）

```bash
npm run build-vite
npx electron-builder --mac --arm64 --dir
bash scripts/resign-local.sh
```

产物在 `release/1.4.0/mac-arm64/Inkast.app`。迭代期间不要重置 macOS TCC 权限；本项目用上面的稳定本地签名脚本保持摄像头/录屏授权状态。

### 数据目录配置

驾驶舱/发布看板/视频工作流的数据目录默认为空，通过 App 内设置面板选择，或环境变量指定：

| 环境变量 | 用途 |
|---|---|
| `INKAST_COCKPIT_DIR` | 每日选题 JSON 目录 |
| `INKAST_PUBLISHING_DIR` | 发布看板数据根 |
| `INKAST_VIDEOFLOW_DIR` | 视频工作流工作区 |

对应的 `userData` 配置文件：`cockpit.json` / `publishing.json` / `videoflow.json`。

## 项目文档

- [STATE.md](STATE.md) — 进度快照与验证记录
- [DECISIONS.md](DECISIONS.md) — 关键决策日志
- [docs/INTEGRATION.md](docs/INTEGRATION.md) — 整合架构权威 spec

## 致谢与上游

Inkast 的录屏与编辑器基座源自 [OpenScreen](https://github.com/siddharthvaddem/openscreen)（Siddharth Vaddem，MIT 协议）——一个优秀的开源 Screen Studio 替代品。Inkast 在其之上重构为内容创作套件：新增驾驶舱、拉片分析、成片流水线、资料库与创作者追踪等全部上层能力。上游版权声明保留于 [LICENSE](./LICENSE)。

## License

[MIT](./LICENSE)。使用本软件即表示同意作者不对使用产生的任何问题、损失或索赔承担责任。
