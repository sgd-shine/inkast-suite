// 关注/收藏(驾驶舱·Phase 2)共享类型 + 链接分类(纯函数,可测)。
// 抖音博主作品列表不能用 Node/curl 直连拿;主进程会优先尝试 Electron 浏览器上下文。
// 拉不到作品列表时仍记录作者 profile 的作品数变化,让关注源具备更新提醒价值。

export type FollowPlatform = "youtube" | "douyin" | "bilibili" | "other";

/** 收藏的一条视频(驾驶舱「关注」面板展示;去拉片用 url)。 */
export interface SavedVideo {
	id: string;
	url: string;
	title: string;
	platform: FollowPlatform;
	kind?: "video" | "channel";
	addedAt: number;
	/** 来自 YouTube 频道批量添加时,记一下频道名(分组/溯源)。 */
	channelLabel?: string;
	note?: string;
	lastCheckedAt?: number;
	profileNickname?: string;
	awemeCount?: number;
	lastAwemeCount?: number;
	newAwemeCount?: number;
	trackerStatus?: "idle" | "updated" | "unchanged" | "blocked";
	trackerMessage?: string;
	// —— 来自内置博主种子池(「添加跟踪」时带入,便于卡片显示核验/优先级/类目)——
	douyinId?: string;
	trackingTier?: string;
	verificationStatus?: string;
	category?: string;
	sourceTags?: string[];
	requiresManualReview?: boolean;
}

/** 「添加跟踪」时从种子卡带入主进程的载荷(纯数据,不含 UI 态)。 */
export interface CreatorTrackInput {
	creatorName: string;
	douyinId?: string;
	profileUrl: string;
	trackingTier: string;
	category: string;
	tags: string[];
	verificationStatus: string;
	requiresManualReview: boolean;
	/** 是否可尝试自动刷新最近作品(仅有 sec_uid 用户主页且无需人工复核时为 true)。 */
	canAutoRefresh: boolean;
}

export interface FollowingResult<T> {
	ok: boolean;
	data?: T;
	error?: string;
}

export interface FollowingUpdateResult {
	items: SavedVideo[];
	added: number;
	updated?: boolean;
	message?: string;
}

export interface LinkClass {
	platform: FollowPlatform;
	/** channel=博主主页/频道(可列作品,仅 YouTube 真支持);video=单条视频;unknown=识别不了。 */
	kind: "channel" | "video" | "unknown";
}

/** 链接分类(纯函数):判平台 + 是频道页还是单条视频。 */
export function classifyLink(url: string): LinkClass {
	const u = (url || "").trim();
	if (/^MS4wLjAB[A-Za-z0-9_-]+$/.test(u)) return { platform: "douyin", kind: "channel" };
	if (/youtube\.com|youtu\.be/i.test(u)) {
		if (/[?&]v=|youtu\.be\/|\/shorts\//i.test(u)) return { platform: "youtube", kind: "video" };
		if (/\/@|\/channel\/|\/c\/|\/user\//i.test(u)) return { platform: "youtube", kind: "channel" };
		return { platform: "youtube", kind: "unknown" };
	}
	if (/douyin\.com|iesdouyin\.com/i.test(u)) {
		if (/v\.douyin\.com/i.test(u) || /\/video\/\d+|[?&]modal_id=\d+|\/share\/video\/\d+/i.test(u))
			return { platform: "douyin", kind: "video" };
		if (/\/user\//i.test(u)) return { platform: "douyin", kind: "channel" };
		return { platform: "douyin", kind: "unknown" };
	}
	if (/bilibili\.com|b23\.tv/i.test(u)) {
		if (/b23\.tv/i.test(u) || /\/video\/(BV|av)/i.test(u))
			return { platform: "bilibili", kind: "video" };
		if (/space\.bilibili\.com/i.test(u)) return { platform: "bilibili", kind: "channel" };
		return { platform: "bilibili", kind: "unknown" };
	}
	// 其它:当作一条直链视频交给 yt-dlp 试。
	return { platform: "other", kind: "video" };
}
