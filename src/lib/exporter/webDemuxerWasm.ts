import getAssetPath from "@/lib/assetPath";

/**
 * web-demuxer.wasm 的加载 URL(导出时解封装输入视频用)。
 *
 * 打包版必须指向 **asar 外** 的真实文件(`resources/wasm/web-demuxer.wasm`,见
 * electron-builder.json5 的 extraResources):web-demuxer 在 Web Worker 里 fetch 这个 wasm,
 * 而 Web Worker 上下文 fetch asar 内的 `file://…/app.asar/…wasm` 不走 Electron 的 asar 拦截,
 * 会读到 asar 容器的原始字节 → WASM magic word 错(`expected 00 61 73 6d`)→ 导出失败。
 *
 * getAssetPath:dev(http)返回相对路径走 vite(public/wasm/);打包(file://)返回 assetBaseUrl
 * (=resourcesPath)下的绝对 file:// URL。再用 window.location 兜一层转成绝对(worker 需要绝对 URL)。
 */
export function getWebDemuxerWasmUrl(): string {
	return new URL(getAssetPath("wasm/web-demuxer.wasm"), window.location.href).href;
}
