# AGENTS.md — Inkast

macOS 本地录屏 App,**基于 OpenScreen(MIT)二次开发**。核心差异化:边录屏边用 Excalidraw 实时画讲解,笔迹直接录进视频。

## 执行规范(来自负责人 SGD)
- 路线图与验收门见上级目录 `../../Claude_Code_执行清单.md` 与 `../../边录边画讲解录屏App_产品方案.md`。
- **严格按 Phase 顺序**,每个 Phase 末给可运行验收点,**等负责人确认再进下一阶段**。
- 完成一项就更新 `STATE.md` 与执行清单的进度记录。
- 以 OpenScreen 为脚手架,**复用优先、不从零写**;新模块放清晰目录、加注释,方便负责人以后自己改。

## 约束
- 仅 macOS 本地自用:不做账号/云端/分享/上架签名分发。
- v1 边录边画绑定显示器捕获(单窗口捕获实时合成 = 方案 B,后期)。
- 许可证:OpenScreen / Excalidraw 均 MIT,可改可用;Screen Studio 只借鉴思路,不复制其代码/资源。
- 保留 `LICENSE`(上游 MIT 版权)。秘钥/证书不入库。

## 怎么跑 / 关键文件
- 跑:`npm run dev`。原生 helper:`npm run build:native:mac`。
- 架构地图:`docs/Inkast_架构现状笔记.md`。本地改动与决策:`DECISIONS.md`。
- 覆盖窗模板:`electron/windows.ts`;窗口路由:`src/App.tsx`(`?windowType=`);快捷键:`electron/globalShortcut.ts`。

## Imported Claude Cowork project instructions
