import { describe, expect, it } from "vitest";
import {
	dedupeComments,
	parseDouyinCommentResponse,
	type StoredComment,
	summarizeComments,
	topComments,
} from "./commentTypes";

const mk = (o: Partial<StoredComment> & { commentId: string }): StoredComment => ({
	text: "",
	likeCount: 0,
	replyCount: 0,
	createdAt: 0,
	fetchedAt: 1,
	sourceVideoUrl: "https://www.douyin.com/video/1",
	...o,
});

describe("parseDouyinCommentResponse", () => {
	it("解析标准评论响应(秒→毫秒,昵称→displayName)", () => {
		const body = JSON.stringify({
			status_code: 0,
			cursor: 20,
			has_more: 1,
			comments: [
				{
					cid: "c1",
					text: "这个工具怎么下载",
					digg_count: 42,
					reply_comment_total: 3,
					create_time: 1690000000,
					user: { nickname: "小明", uid: "SHOULD_NOT_LEAK" },
				},
			],
		});
		const r = parseDouyinCommentResponse(body);
		expect(r).not.toBeNull();
		expect(r?.hasMore).toBe(true);
		expect(r?.cursor).toBe(20);
		expect(r?.comments).toHaveLength(1);
		const c = r?.comments[0];
		expect(c?.commentId).toBe("c1");
		expect(c?.likeCount).toBe(42);
		expect(c?.replyCount).toBe(3);
		expect(c?.createdAt).toBe(1690000000 * 1000);
		expect(c?.displayName).toBe("小明");
		// 隐私最小化:解析结果里不含 uid。
		expect(JSON.stringify(c)).not.toContain("SHOULD_NOT_LEAK");
	});

	it("非评论响应 / 坏 JSON → null(便于过滤无关捕获)", () => {
		expect(parseDouyinCommentResponse("not json")).toBeNull();
		expect(parseDouyinCommentResponse(JSON.stringify({ foo: 1 }))).toBeNull();
	});

	it("缺 cid 的评论被跳过;缺字段给默认值", () => {
		const body = JSON.stringify({
			comments: [{ text: "无 cid" }, { cid: "c2", text: "只有文本" }],
		});
		const r = parseDouyinCommentResponse(body);
		expect(r?.comments).toHaveLength(1);
		expect(r?.comments[0]).toMatchObject({ commentId: "c2", likeCount: 0, replyCount: 0 });
	});
});

describe("dedupeComments 增量去重", () => {
	it("按 commentId 去重,新条计入 added", () => {
		const existing = [mk({ commentId: "a", likeCount: 1 })];
		const incoming = [mk({ commentId: "a", likeCount: 5 }), mk({ commentId: "b" })];
		const { merged, added } = dedupeComments(existing, incoming);
		expect(added).toBe(1);
		expect(merged).toHaveLength(2);
		// 点赞数取更新后的较大值。
		expect(merged.find((c) => c.commentId === "a")?.likeCount).toBe(5);
	});

	it("重复抓取同一批 → added 0", () => {
		const batch = [mk({ commentId: "x" }), mk({ commentId: "y" })];
		expect(dedupeComments(batch, batch).added).toBe(0);
	});
});

describe("摘要", () => {
	const list = [
		mk({ commentId: "a", likeCount: 10 }),
		mk({ commentId: "b", likeCount: 100 }),
		mk({ commentId: "c", likeCount: 50 }),
	];
	it("topComments 点赞降序", () => {
		expect(topComments(list, 2).map((c) => c.commentId)).toEqual(["b", "c"]);
	});
	it("summarizeComments 汇总总数/总赞/高赞", () => {
		const s = summarizeComments(list, 2);
		expect(s.total).toBe(3);
		expect(s.totalLikes).toBe(160);
		expect(s.top[0].commentId).toBe("b");
	});
});
