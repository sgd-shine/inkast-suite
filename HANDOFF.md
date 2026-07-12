# HANDOFF — Inkast

> 给"下一个接手的人/会话"的最短上手说明。

## 现在在哪
Phase 0(地基)基本完成;**只差验收门 0**:用户实测"录整屏 → 编辑器 → 导出 MP4"(需授予 macOS 屏幕录制权限)。等用户确认通过后进入 Phase 1。

## 30 秒上手
1. `cd 30_桌面App/Inkast && npm run dev`
2. 屏幕底部中间出现控制条 = 启动成功。
3. 想看全貌:读 [STATE.md](STATE.md) → [docs/Inkast_架构现状笔记.md](docs/Inkast_架构现状笔记.md) → [DECISIONS.md](DECISIONS.md)。

## 三个必须知道的点
1. **方案 A 可行**:显示器捕获会录进透明置顶覆盖窗(Swift 源码 `excludingWindows:[]` 已证实);单窗口捕获不行 → v1 边录边画绑定显示器捕获。
2. **覆盖窗有现成模板**:`electron/windows.ts → createHudOverlayWindow()`(透明/置顶/穿透/跨 Space),Phase 1 克隆它做 Excalidraw 覆盖窗。
3. **两个本地修复别回退**:Vite IPv4 绑定、麦克风非阻塞(见 DECISIONS D6/D7),否则会复现白屏/不出窗口。

## Phase 1 第一步(已规划)
先做 1A.0 探针:静态彩色方块的透明置顶窗,录一段显示器确认笔迹会被录进去;再正式接 Excalidraw。
