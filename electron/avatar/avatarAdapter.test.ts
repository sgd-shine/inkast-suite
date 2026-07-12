import { describe, expect, it } from "vitest";
import type { AvatarConfig } from "../../src/lib/avatarTypes";
import {
	buildGenericSubmit,
	buildHeyGenGenerate,
	buildHeyGenStatus,
	extractByPath,
	interpolate,
	parseGenericStatus,
	parseGenericSubmit,
	parseHeyGenGenerate,
	parseHeyGenStatus,
	validateConfig,
} from "./avatarAdapter";

describe("helpers", () => {
	it("interpolate 替换 {{key}},缺失留空", () => {
		expect(interpolate("a={{x}};b={{y}}", { x: "1" })).toBe("a=1;b=");
	});
	it("extractByPath 点路径", () => {
		expect(extractByPath({ a: { b: { c: 7 } } }, "a.b.c")).toBe(7);
		expect(extractByPath({ a: 1 }, "a.b")).toBeUndefined();
	});
});

describe("validateConfig", () => {
	it("HeyGen 缺 key/形象/音色逐项报错", () => {
		expect(validateConfig({ provider: "heygen" })).toMatch(/Key/);
		expect(validateConfig({ provider: "heygen", apiKey: "k" })).toMatch(/形象/);
		expect(validateConfig({ provider: "heygen", apiKey: "k", avatarId: "a" })).toMatch(/音色/);
		expect(
			validateConfig({ provider: "heygen", apiKey: "k", avatarId: "a", voiceId: "v" }),
		).toBeNull();
		// talking_photo 也算有形象
		expect(
			validateConfig({ provider: "heygen", apiKey: "k", talkingPhotoId: "tp", voiceId: "v" }),
		).toBeNull();
	});
	it("generic 缺 submitUrl 报错", () => {
		expect(validateConfig({ provider: "generic", generic: { submitUrl: "" } })).toMatch(
			/submitUrl/,
		);
		expect(validateConfig({ provider: "generic", generic: { submitUrl: "https://x" } })).toBeNull();
	});
});

describe("HeyGen 适配器", () => {
	const base: AvatarConfig = {
		provider: "heygen",
		apiKey: "K",
		avatarId: "AV1",
		voiceId: "VO1",
	};

	it("generate 请求:avatar 形态 + x-api-key + 口播稿进 input_text", () => {
		const r = buildHeyGenGenerate(base, "你好世界");
		expect(r.url).toContain("/v2/video/generate");
		expect(r.headers["x-api-key"]).toBe("K");
		const b = r.body as {
			video_inputs: { character: Record<string, string>; voice: Record<string, string> }[];
			dimension: { width: number; height: number };
		};
		expect(b.video_inputs[0].character).toEqual({
			type: "avatar",
			avatar_id: "AV1",
			avatar_style: "normal",
		});
		expect(b.video_inputs[0].voice).toEqual({
			type: "text",
			input_text: "你好世界",
			voice_id: "VO1",
		});
		expect(b.dimension).toEqual({ width: 1280, height: 720 });
	});

	it("talking_photo 优先于 avatar", () => {
		const r = buildHeyGenGenerate({ ...base, talkingPhotoId: "TP9" }, "hi");
		const b = r.body as { video_inputs: { character: Record<string, string> }[] };
		expect(b.video_inputs[0].character).toEqual({ type: "talking_photo", talking_photo_id: "TP9" });
	});

	it("parse generate:取 data.video_id;失败带错误", () => {
		expect(parseHeyGenGenerate({ data: { video_id: "vid123" } })).toEqual({
			ok: true,
			remoteId: "vid123",
		});
		expect(parseHeyGenGenerate({ error: { message: "bad key" } })).toEqual({
			ok: false,
			error: "bad key",
		});
	});

	it("status 请求带 video_id;parse 三态", () => {
		expect(buildHeyGenStatus(base, "vid123").url).toContain("video_id=vid123");
		expect(parseHeyGenStatus({ data: { status: "processing" } })).toEqual({ status: "processing" });
		expect(
			parseHeyGenStatus({ data: { status: "completed", video_url: "https://cdn/x.mp4" } }),
		).toEqual({ status: "done", videoUrl: "https://cdn/x.mp4" });
		expect(parseHeyGenStatus({ data: { status: "failed", error: { message: "oops" } } })).toEqual({
			status: "failed",
			error: "oops",
		});
	});
});

describe("通用适配器", () => {
	const cfg: AvatarConfig = {
		provider: "generic",
		apiKey: "TOKEN",
		avatarId: "A",
		voiceId: "V",
		generic: {
			submitUrl: "https://api.example.com/jobs",
			headers: { Authorization: "Bearer {{apiKey}}" },
			bodyTemplate: '{"script":"{{script}}","avatar":"{{avatarId}}","voice":"{{voiceId}}"}',
			jobIdPath: "data.id",
			statusUrl: "https://api.example.com/jobs/{{jobId}}",
			statusPath: "data.status",
			videoUrlPath: "data.url",
			doneValues: "succeeded",
			failedValues: "failed",
		},
	};

	it("submit:模板插值 + 头部鉴权 + 口播稿安全注入 JSON", () => {
		const r = buildGenericSubmit(cfg, '含"引号"和\n换行');
		expect(r.url).toBe("https://api.example.com/jobs");
		expect(r.headers.Authorization).toBe("Bearer TOKEN");
		const b = r.body as { script: string; avatar: string; voice: string };
		expect(b.script).toBe('含"引号"和\n换行'); // 反斜杠转义后 JSON.parse 还原
		expect(b.avatar).toBe("A");
	});

	it("parse submit 取 jobId;status 三态", () => {
		expect(parseGenericSubmit({ data: { id: "job-7" } }, cfg.generic!)).toEqual({
			ok: true,
			remoteId: "job-7",
		});
		expect(parseGenericStatus({ data: { status: "processing" } }, cfg.generic!)).toEqual({
			status: "processing",
		});
		expect(
			parseGenericStatus({ data: { status: "succeeded", url: "https://x.mp4" } }, cfg.generic!),
		).toEqual({ status: "done", videoUrl: "https://x.mp4" });
		expect(parseGenericStatus({ data: { status: "failed" } }, cfg.generic!)).toEqual({
			status: "failed",
			error: "状态:failed",
		});
	});
});
