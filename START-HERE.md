# START HERE — Inkast 整合项目（新会话先读这页）

把 **内容驾驶舱 + 拉片 + 片场(video-factory / video-pipeline) + 散落视频功能** 全部并进 **Inkast**，做成一个桌面 App。本目录 `Inkast-Suite` 是工作副本，**所有开发在这里做**。原 `Inkast/` 是冻结备份，别动。

## 现状（已就绪）
- 备份：原 Inkast 已打 tag `inkast-pre-suite-2026-06-19`，原地冻结，继续当日常 App。
- 副本：本目录（分支 `suite`，481 个源码文件，未装依赖、初始 commit 待补）。

## 第一步（开干就跑这几条）
```bash
npm install
git add -A && git commit -m "fork: Inkast → suite 起点 (2026-06-19)"   # 沙箱里没落地，这里本机补上
npm test        # 基线约 259 tests，确认副本与原件等价
npm run dev     # 看界面（dev 别测录屏）
```

## 工作流主线（要做成这条漏斗，全在一个 App 内）
内容驾驶舱(选题/文案) → 拉片对标 → 录屏 → 成片 → 发布
Tab 顺序：驾驶舱 │ 分析(拉片) │ 录制 │ 成片(片场) │ 资料库

## 阶段（详见主方案，逐阶段等负责人验收）
P1 端到端打通(内嵌 video-factory 面板) → P2 编排内化(jobs/stageParser 进主进程) → P3 拉片进 App → P4 ASR 统一为 FunASR/SenseVoice → P5 接驾驶舱+闭环 → P6 接管 → **P7 退役清理**。

## 收口规则（P7，务必照做）
产品完整可用并通过验收后，把"除 Inkast 外的其他产品"退役：**先**把 video-pipeline 引擎内化进 Inkast，**再**逐个确认 video-factory / 拉片散件 / 内容驾驶舱原型 / 各 Demo 已被吸收，**先归档到 `90_Archive` 再删原目录**，最终只留统一的 Inkast。
安全闸：绝不删仍被运行依赖的东西；最终那批删除要负责人点头才执行。

## 铁律
不改原 Inkast 与 video-pipeline 本体（集成都在本副本做）· 无后端不上 UI · 打包后必须 resign + ditto · 每个 Phase 末尾等负责人验收。

## 详细文档
- 主方案：`~/AI-Agent/40_App实验室/40_内部工具/Inkast整合_主方案与执行计划_2026-06-19.md`
- 架构评估：`~/AI-Agent/40_App实验室/40_内部工具/视频工具整合_评估与架构_2026-06-19.md`
