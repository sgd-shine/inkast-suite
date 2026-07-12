import { describe, expect, it } from "vitest";
import {
	extractAwemeId,
	extractDouyinSecUid,
	parseDouyinPostResponse,
	parseDouyinProfileResponse,
	parseRouterData,
} from "./douyin";

describe("extractAwemeId", () => {
	it("从各种抖音链接形态抽 id", () => {
		expect(extractAwemeId("https://www.douyin.com/video/7646665973897973043")).toBe(
			"7646665973897973043",
		);
		expect(
			extractAwemeId(
				"https://www.douyin.com/search/x?aid=y&modal_id=7646665973897973043&type=general",
			),
		).toBe("7646665973897973043");
		expect(
			extractAwemeId("https://www.iesdouyin.com/share/video/7646665973897973043/?from_ssr=1"),
		).toBe("7646665973897973043");
	});
	it("取不到返回 null(短链需先跟随跳转)", () => {
		expect(extractAwemeId("https://v.douyin.com/abcd/")).toBeNull();
		expect(extractAwemeId("不是链接")).toBeNull();
	});
});

describe("extractDouyinSecUid", () => {
	it("从主页链接或 sec_uid 字符串抽作者 id", () => {
		const secUid = "MS4wLjABAAAAjN32ZoC90W_FXxpeck2ATV5PCQcnnHM2cSzm8SHdcGCEC3P_fxGweCSTutk3Mvqq";
		expect(extractDouyinSecUid(secUid)).toBe(secUid);
		expect(extractDouyinSecUid(`https://www.douyin.com/user/${secUid}`)).toBe(secUid);
		expect(extractDouyinSecUid(`https://www.iesdouyin.com/share/user/${secUid}?from_ssr=1`)).toBe(
			secUid,
		);
	});

	it("取不到返回 null", () => {
		expect(extractDouyinSecUid("https://www.douyin.com/video/123")).toBeNull();
		expect(extractDouyinSecUid("不是主页")).toBeNull();
	});
});

describe("parseRouterData", () => {
	// 仿真 SSR 分享页:window._ROUTER_DATA 嵌 loaderData[<page>].videoInfoRes.item_list[0].
	const html = `<html><head>
<script>window._ROUTER_DATA = ${JSON.stringify({
		loaderData: {
			video_layout: {},
			"video_(id)/page": {
				videoInfoRes: {
					item_list: [
						{
							desc: "VibeCoding变现指南 #青年创作者",
							video: {
								play_addr: { url_list: ["https://aweme.snssdk.com/aweme/v1/playwm/?video_id=abc"] },
							},
						},
					],
				},
			},
		},
	})}</script>
</head></html>`;

	it("抽出标题 + 播放地址", () => {
		expect(parseRouterData(html)).toEqual({
			title: "VibeCoding变现指南 #青年创作者",
			playUrl: "https://aweme.snssdk.com/aweme/v1/playwm/?video_id=abc",
		});
	});

	it("无 _ROUTER_DATA / 结构不符 → null(不编造)", () => {
		expect(parseRouterData("<html>反爬桩页</html>")).toBeNull();
		expect(parseRouterData('<script>window._ROUTER_DATA = {"loaderData":{}}</script>')).toBeNull();
	});

	it("无 play_addr → null", () => {
		const noUrl = `<script>window._ROUTER_DATA = ${JSON.stringify({
			loaderData: { "x/page": { videoInfoRes: { item_list: [{ desc: "d", video: {} }] } } },
		})}</script>`;
		expect(parseRouterData(noUrl)).toBeNull();
	});
});

describe("parseDouyinPostResponse", () => {
	it("把作品接口 aweme_list 转成可分享视频链接", () => {
		const body = JSON.stringify({
			aweme_list: [
				{
					aweme_id: "7650000000000000001",
					desc: " 第一条\n公开视频 ",
					author: { sec_uid: "SEC_A" },
				},
				{
					aweme_id: "7650000000000000002",
					desc: "第二条",
					author: { sec_uid: "SEC_A" },
				},
			],
		});
		expect(parseDouyinPostResponse(body, "SEC_A")).toEqual([
			{
				aweme_id: "7650000000000000001",
				title: "第一条 公开视频",
				share_url: "https://www.douyin.com/video/7650000000000000001",
			},
			{
				aweme_id: "7650000000000000002",
				title: "第二条",
				share_url: "https://www.douyin.com/video/7650000000000000002",
			},
		]);
	});

	it("过滤作者不匹配、重复和坏 id", () => {
		const body = JSON.stringify({
			aweme_list: [
				{ aweme_id: "1", desc: "太短不是合法 id", author: { sec_uid: "SEC_A" } },
				{ aweme_id: "7650000000000000001", desc: "A", author: { sec_uid: "SEC_B" } },
				{ aweme_id: "7650000000000000002", desc: "B", author: { sec_uid: "SEC_A" } },
				{ aweme_id: "7650000000000000002", desc: "B dup", author: { sec_uid: "SEC_A" } },
			],
		});
		expect(parseDouyinPostResponse(body, "SEC_A")).toEqual([
			{
				aweme_id: "7650000000000000002",
				title: "B",
				share_url: "https://www.douyin.com/video/7650000000000000002",
			},
		]);
		expect(parseDouyinPostResponse("", "SEC_A")).toEqual([]);
	});
});

describe("parseDouyinProfileResponse", () => {
	it("把作者 profile 接口转成可追踪元数据", () => {
		const body = JSON.stringify({
			user: {
				sec_uid: "SEC_A",
				nickname: " 柱子哥TzFilm ",
				aweme_count: 231,
				follower_count: "8765",
				following_count: 8,
				total_favorited: "123456",
				signature: "电影拉片",
			},
		});
		expect(parseDouyinProfileResponse(body)).toEqual({
			sec_uid: "SEC_A",
			nickname: "柱子哥TzFilm",
			aweme_count: 231,
			follower_count: 8765,
			following_count: 8,
			total_favorited: 123456,
			signature: "电影拉片",
		});
	});

	it("坏 JSON 或缺 user 返回 null", () => {
		expect(parseDouyinProfileResponse("")).toBeNull();
		expect(parseDouyinProfileResponse(JSON.stringify({ status_code: 0 }))).toBeNull();
	});
});
