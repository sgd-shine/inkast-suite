import { afterEach, describe, expect, it, vi } from "vitest";
import { getWebDemuxerWasmUrl } from "./webDemuxerWasm";

describe("getWebDemuxerWasmUrl", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("dev(http):走 vite public 的相对路径,转成绝对 http URL", () => {
		vi.stubGlobal("window", {
			location: { protocol: "http:", href: "http://localhost:5173/?windowType=editor" },
		});
		expect(getWebDemuxerWasmUrl()).toBe("http://localhost:5173/wasm/web-demuxer.wasm");
	});

	it("packaged(file://):指向 asar 外 assetBaseUrl(resources)下的真实文件,不是 app.asar 内", () => {
		vi.stubGlobal("window", {
			location: {
				protocol: "file:",
				href: "file:///Applications/Inkast.app/Contents/Resources/app.asar/dist/index.html?windowType=editor",
			},
			electronAPI: { assetBaseUrl: "file:///Applications/Inkast.app/Contents/Resources/" },
		});
		const url = getWebDemuxerWasmUrl();
		expect(url).toBe("file:///Applications/Inkast.app/Contents/Resources/wasm/web-demuxer.wasm");
		// 关键不变量:绝不指向 app.asar 内(那正是 worker fetch 读到坏字节的根因)。
		expect(url).not.toContain("app.asar");
	});
});
