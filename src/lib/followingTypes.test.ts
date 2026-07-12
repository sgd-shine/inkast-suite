import { describe, expect, it } from "vitest";
import { classifyLink } from "./followingTypes";

describe("classifyLink", () => {
	it("YouTube:频道 vs 单条视频", () => {
		expect(classifyLink("https://www.youtube.com/@SomeCreator")).toEqual({
			platform: "youtube",
			kind: "channel",
		});
		expect(classifyLink("https://www.youtube.com/channel/UCabc")).toEqual({
			platform: "youtube",
			kind: "channel",
		});
		expect(classifyLink("https://www.youtube.com/watch?v=aqz-KE-bpKQ")).toEqual({
			platform: "youtube",
			kind: "video",
		});
		expect(classifyLink("https://youtu.be/aqz-KE-bpKQ")).toEqual({
			platform: "youtube",
			kind: "video",
		});
		expect(classifyLink("https://www.youtube.com/shorts/abc")).toEqual({
			platform: "youtube",
			kind: "video",
		});
	});

	it("抖音:单条视频(含搜索页/短链)vs 博主主页", () => {
		expect(
			classifyLink("MS4wLjABAAAAjN32ZoC90W_FXxpeck2ATV5PCQcnnHM2cSzm8SHdcGCEC3P_fxGweCSTutk3Mvqq"),
		).toEqual({
			platform: "douyin",
			kind: "channel",
		});
		expect(classifyLink("https://www.douyin.com/video/7646665973897973043")).toEqual({
			platform: "douyin",
			kind: "video",
		});
		expect(classifyLink("https://www.douyin.com/search/x?modal_id=7646665973897973043")).toEqual({
			platform: "douyin",
			kind: "video",
		});
		expect(classifyLink("https://v.douyin.com/abcd/")).toEqual({
			platform: "douyin",
			kind: "video",
		});
		expect(classifyLink("https://www.douyin.com/user/MS4wLjABAAAA")).toEqual({
			platform: "douyin",
			kind: "channel",
		});
	});

	it("B站:视频 vs 空间", () => {
		expect(classifyLink("https://www.bilibili.com/video/BV1xx411").platform).toBe("bilibili");
		expect(classifyLink("https://www.bilibili.com/video/BV1xx411").kind).toBe("video");
		expect(classifyLink("https://space.bilibili.com/123")).toEqual({
			platform: "bilibili",
			kind: "channel",
		});
	});

	it("其它链接默认当直链视频", () => {
		expect(classifyLink("https://example.com/x.mp4")).toEqual({
			platform: "other",
			kind: "video",
		});
	});
});
