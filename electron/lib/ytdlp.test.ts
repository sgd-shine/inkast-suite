import { describe, expect, it } from "vitest";
import { isDouyin, normalizeVideoUrl } from "./ytdlp";

describe("isDouyin", () => {
	it("识别抖音域名", () => {
		expect(isDouyin("https://www.douyin.com/video/123")).toBe(true);
		expect(isDouyin("https://www.iesdouyin.com/share/video/123/")).toBe(true);
		expect(isDouyin("https://www.youtube.com/watch?v=abc")).toBe(false);
	});
});

describe("normalizeVideoUrl", () => {
	it("抖音搜索/弹窗页 modal_id → 规范视频地址(yt-dlp 不认搜索页)", () => {
		const u =
			"https://www.douyin.com/search/%E6%9F%B1%E5%AD%90%E5%93%A5?aid=xxx&modal_id=7646665973897973043&type=general";
		expect(normalizeVideoUrl(u)).toBe("https://www.douyin.com/video/7646665973897973043");
	});

	it("已是规范抖音视频地址 → 原样", () => {
		const u = "https://www.douyin.com/video/7646665973897973043";
		expect(normalizeVideoUrl(u)).toBe(u);
	});

	it("非数字 modal_id 不误改", () => {
		const u = "https://www.douyin.com/search/x?modal_id=abc";
		expect(normalizeVideoUrl(u)).toBe(u);
	});

	it("YouTube / 其它链接原样(交给 yt-dlp 处理)", () => {
		const yt = "https://www.youtube.com/watch?v=aqz-KE-bpKQ";
		expect(normalizeVideoUrl(yt)).toBe(yt);
		const sh = "https://v.douyin.com/abcdef/";
		expect(normalizeVideoUrl(sh)).toBe(sh);
	});

	it("去首尾空白;非法 URL 原样返回", () => {
		expect(normalizeVideoUrl("  https://youtu.be/x  ")).toBe("https://youtu.be/x");
		expect(normalizeVideoUrl("不是链接")).toBe("不是链接");
	});
});
