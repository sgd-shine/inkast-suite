import { describe, expect, it } from "vitest";
import { cleanFeedBody } from "./cockpitFeed";

// 取自 vault 2026-06-20.json 的真实 body
const RADAR = [
	"GitHub Blog 这条信号的要点是：Qubot, our internal Copilot-powered analytics agent. The post How we bui…。它先作为「AI工作流」的事实入口，后续判断要回到原文和第二来源。",
	"可读段落补充：Learn how GitHub built Qubot",
	"可读段落补充：Qubot, our internal Cop",
];
const HOT = [
	"Wired 这条信号的要点是：AI 工作流信号 | WIRED。它先作为「社会科技」的事实入口，后续判断要回到原文和第二来源。",
	"可读段落补充：English Deutsch Español Français Italiano 日本語 繁體中文",
	"承重：只作热度和选题灵感，不单独写成事实。",
];
const SOCIAL = [
	"OpenAI YouTube 这条视频围绕「AI 工作流信号」展开，重点是演示相关模型、工具或设备在真实流程里的用法。 它先作为「AI工作流」的观察入口，后续细节仍要回到原视频和第二来源。",
	"承重：只作热度和选题灵感，不单独写成事实。",
];

describe("cleanFeedBody", () => {
	it("删除抓取噪音段(可读段落补充)和元数据段(承重)", () => {
		const out = cleanFeedBody(HOT).join("\n");
		expect(out).not.toContain("可读段落补充");
		expect(out).not.toContain("承重");
		expect(out).not.toContain("English Deutsch"); // 网页导航菜单噪音
	});

	it("裁掉模板前缀(这条信号的要点是)和套话尾(它先作为…第二来源),只留要点", () => {
		const joined = cleanFeedBody(RADAR).join("\n");
		expect(joined).not.toContain("这条信号的要点是");
		expect(joined).not.toContain("它先作为");
		expect(joined).not.toContain("第二来源");
		expect(joined).toContain("Qubot"); // 核心要点保留
	});

	it("视频类前缀(这条视频围绕…展开，重点是)也裁掉", () => {
		const out = cleanFeedBody(SOCIAL);
		expect(out).toHaveLength(1); // 承重段已删,只剩第一段要点
		expect(out[0]).not.toContain("这条视频围绕");
		expect(out[0]).not.toContain("第二来源");
		expect(out[0]).toContain("演示相关模型"); // 核心保留
	});

	it("全是噪音 → 空数组(调用方据此隐藏整块)", () => {
		expect(cleanFeedBody(["可读段落补充：xxx", "承重：yyy"])).toEqual([]);
	});

	it("空输入 → 空数组", () => {
		expect(cleanFeedBody(undefined)).toEqual([]);
		expect(cleanFeedBody(null)).toEqual([]);
		expect(cleanFeedBody([])).toEqual([]);
	});
});
