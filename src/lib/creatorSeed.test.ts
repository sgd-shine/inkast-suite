import { describe, expect, it } from "vitest";
import {
	CANDIDATE_NAMES,
	canAutoRefresh,
	categoryLabel,
	CREATOR_SEED,
	creatorKey,
	type CreatorSource,
	DEFAULT_EXCLUDE_TAGS,
	douyinSearchUrl,
	filterCreators,
	isExcluded,
} from "./creatorSeed";

const mk = (o: Partial<CreatorSource>): CreatorSource => ({
	creatorName: "测试",
	profileUrl: "https://www.douyin.com/search/x",
	trackingTier: "core",
	category: "ai_tool_review",
	tags: ["AI工具"],
	verificationStatus: "confirmed_public",
	useInCockpit: true,
	requiresManualReview: false,
	...o,
});

describe("creatorSeed 数据完整性", () => {
	it("种子池非空且字段齐全", () => {
		expect(CREATOR_SEED.length).toBeGreaterThanOrEqual(20);
		for (const c of CREATOR_SEED) {
			expect(c.creatorName).toBeTruthy();
			expect(c.profileUrl).toMatch(/^https?:\/\//);
			expect(["core", "secondary", "reference", "candidate"]).toContain(c.trackingTier);
		}
	});

	it("候选账号只有名称,不进种子池(不自动导入)", () => {
		expect(CANDIDATE_NAMES.length).toBeGreaterThan(0);
		const seedNames = new Set(CREATOR_SEED.map((c) => c.creatorName));
		// 候选与已确认种子不重叠。
		for (const n of CANDIDATE_NAMES) expect(seedNames.has(n)).toBe(false);
	});
});

describe("creatorKey", () => {
	it("优先抖音号,缺失回退主页 URL", () => {
		expect(creatorKey({ douyinId: "123", profileUrl: "https://x" })).toBe("123");
		expect(creatorKey({ douyinId: undefined, profileUrl: "https://x" })).toBe("https://x");
		expect(creatorKey({ douyinId: "  ", profileUrl: "https://x" })).toBe("https://x");
	});
});

describe("isExcluded", () => {
	it("命中被剔除类目标签", () => {
		expect(isExcluded({ tags: ["AI工具", "短剧"] })).toBe(true);
		expect(isExcluded({ tags: ["AI工具", "教程"] })).toBe(false);
		expect(isExcluded({ tags: ["恋爱"] }, DEFAULT_EXCLUDE_TAGS)).toBe(true);
	});
});

describe("canAutoRefresh", () => {
	it("只有搜索页(无 sec_uid 用户页)→ 不能自动刷新", () => {
		expect(canAutoRefresh(mk({ profileUrl: "https://www.douyin.com/search/秋芝" }))).toBe(false);
	});
	it("用户主页(/user/)→ 可尝试刷新", () => {
		expect(canAutoRefresh(mk({ profileUrl: "https://www.douyin.com/user/MS4wLjABAAAA" }))).toBe(
			true,
		);
	});
	it("需人工复核的账号一律不自动刷新", () => {
		expect(
			canAutoRefresh(
				mk({ profileUrl: "https://www.douyin.com/user/MS4wLjABAAAA", requiresManualReview: true }),
			),
		).toBe(false);
	});
});

describe("filterCreators", () => {
	const sample: CreatorSource[] = [
		mk({ creatorName: "核心A", trackingTier: "core", tags: ["AI工具"] }),
		mk({ creatorName: "次级B", trackingTier: "secondary", tags: ["AIGC"] }),
		mk({ creatorName: "参考C", trackingTier: "reference", tags: ["AI电商"] }),
		mk({ creatorName: "剧场D", trackingTier: "core", tags: ["短剧", "情感"] }),
	];

	it("按优先级排序(core 在前)", () => {
		const out = filterCreators(sample);
		expect(out[0].trackingTier).toBe("core");
		expect(out.map((c) => c.trackingTier)).toEqual(["core", "core", "secondary", "reference"]);
	});

	it("tier 过滤", () => {
		const out = filterCreators(sample, { tier: "secondary" });
		expect(out).toHaveLength(1);
		expect(out[0].creatorName).toBe("次级B");
	});

	it("hideExcluded 隐藏被剔除类目", () => {
		const out = filterCreators(sample, { hideExcluded: true });
		expect(out.find((c) => c.creatorName === "剧场D")).toBeUndefined();
		expect(out).toHaveLength(3);
	});

	it("query 命中名称/标签/类目", () => {
		expect(filterCreators(sample, { query: "AI电商" }).map((c) => c.creatorName)).toEqual([
			"参考C",
		]);
		expect(filterCreators(sample, { query: "核心" })).toHaveLength(1);
	});
});

describe("展示辅助", () => {
	it("categoryLabel 有映射用中文,缺失回退原 slug", () => {
		expect(categoryLabel("ai_tool_review")).toBe("AI 工具测评");
		expect(categoryLabel("unknown_cat")).toBe("unknown_cat");
	});
	it("douyinSearchUrl 编码名称", () => {
		expect(douyinSearchUrl("秋芝2046")).toBe(
			"https://www.douyin.com/search/%E7%A7%8B%E8%8A%9D2046",
		);
	});
});
