// 抖音评论抓取(驾驶舱·Phase「评论抓取」)共享类型 + 纯函数(解析 / 去重 / 摘要,可测)。
//
// 抓取本体在 Inkast 内部用 Electron Chromium 浏览器上下文完成(页面自己算 a_bogus,不在 Node 伪造签名),
// 见 electron/lib/douyinComments.ts。匿名/未登录常被风控挡 → 诚实降级为 needs_login/blocked/no_public_data,
// 绝不伪造评论或成功状态;失败时保留「打开视频页面」人工兜底(可由 Computer Use 辅助)。
//
// 隐私最小化:只保留 displayName,不存 uid/头像/主页等身份字段。

/** 抓取结果状态(诚实降级)。 */
export type CommentFetchStatus =
	| "ok" // 拿到公开评论
	| "no_public_data" // 页面加载成功但没有可解析评论(可能被隐藏/无评论)
	| "needs_login" // 接口提示需登录态
	| "blocked" // 被风控/签名拦截
	| "needs_manual_refresh" // 超时等,建议人工打开页面
	| "error"; // 其它错误

/** 解析后的单条评论(最小字段)。 */
export interface ParsedComment {
	commentId: string;
	text: string;
	likeCount: number;
	replyCount: number;
	/** 评论发布时间(毫秒);拿不到为 0。 */
	createdAt: number;
	/** 展示名(隐私最小化,只留昵称)。 */
	displayName?: string;
}

/** 本地存储的评论(解析字段 + 抓取溯源)。 */
export interface StoredComment extends ParsedComment {
	fetchedAt: number;
	sourceVideoUrl: string;
}

/** 一条视频的评论抓取记录(comments.json 里按 videoUrl 存)。 */
export interface VideoComments {
	videoUrl: string;
	comments: StoredComment[];
	lastFetchedAt: number;
	status: CommentFetchStatus;
	message?: string;
	/** 最近一次抓取新增(去重后)条数。 */
	lastAdded?: number;
}

export interface CommentFetchResult {
	videoUrl: string;
	status: CommentFetchStatus;
	message?: string;
	comments: StoredComment[];
	added: number;
	total: number;
}

export interface CommentsIpcResult<T> {
	ok: boolean;
	data?: T;
	error?: string;
}

interface RawComment {
	cid?: string;
	aweme_id?: string;
	text?: string;
	digg_count?: number;
	reply_comment_total?: number;
	create_time?: number;
	user?: { nickname?: string };
}

/**
 * 解析抖音 web 评论接口(/aweme/v1/web/comment/list/)响应 → 评论数组 + 分页信息。纯函数。
 * 不是评论响应(缺 comments 字段)返回 null,便于 DevTools 捕获时过滤无关响应。
 */
export function parseDouyinCommentResponse(body: string): {
	comments: ParsedComment[];
	hasMore: boolean;
	cursor: number;
	statusCode?: number;
} | null {
	let json: {
		comments?: RawComment[];
		cursor?: number;
		has_more?: number | boolean;
		status_code?: number;
	};
	try {
		json = JSON.parse(body);
	} catch {
		return null;
	}
	if (!json || !Array.isArray(json.comments)) return null;
	const comments: ParsedComment[] = [];
	for (const c of json.comments) {
		const commentId = String(c?.cid ?? "").trim();
		if (!commentId) continue;
		const createSec = typeof c.create_time === "number" ? c.create_time : 0;
		comments.push({
			commentId,
			text: String(c.text ?? ""),
			likeCount: typeof c.digg_count === "number" ? c.digg_count : 0,
			replyCount: typeof c.reply_comment_total === "number" ? c.reply_comment_total : 0,
			createdAt: createSec > 0 ? createSec * 1000 : 0,
			displayName: c.user?.nickname ? String(c.user.nickname) : undefined,
		});
	}
	return {
		comments,
		hasMore: Boolean(json.has_more),
		cursor: typeof json.cursor === "number" ? json.cursor : 0,
		statusCode: typeof json.status_code === "number" ? json.status_code : undefined,
	};
}

/**
 * 去重合并:按 commentId 唯一;incoming 覆盖 existing(点赞/回复数取更新的),保序=先 existing 后新增。
 * 返回 { merged, added }。纯函数,支持增量刷新。
 */
export function dedupeComments(
	existing: readonly StoredComment[],
	incoming: readonly StoredComment[],
): { merged: StoredComment[]; added: number } {
	const byId = new Map<string, StoredComment>();
	for (const c of existing) byId.set(c.commentId, c);
	let added = 0;
	for (const c of incoming) {
		if (byId.has(c.commentId)) {
			const prev = byId.get(c.commentId) as StoredComment;
			// 更新可变计数与抓取时间,保留最早的 fetchedAt 语义无所谓,这里以最新为准。
			byId.set(c.commentId, {
				...prev,
				text: c.text || prev.text,
				likeCount: Math.max(prev.likeCount, c.likeCount),
				replyCount: Math.max(prev.replyCount, c.replyCount),
				displayName: c.displayName ?? prev.displayName,
				fetchedAt: c.fetchedAt,
			});
		} else {
			byId.set(c.commentId, c);
			added += 1;
		}
	}
	return { merged: [...byId.values()], added };
}

/** 高赞评论 Top N(点赞降序,并列按较新)。纯函数。 */
export function topComments(comments: readonly StoredComment[], n = 5): StoredComment[] {
	return [...comments]
		.sort((a, b) => b.likeCount - a.likeCount || b.createdAt - a.createdAt)
		.slice(0, Math.max(0, n));
}

/** 评论概览:总数 / 总赞 / 高赞前 N(供卡片与拉片报告用)。纯函数。 */
export function summarizeComments(
	comments: readonly StoredComment[],
	topN = 5,
): { total: number; totalLikes: number; top: StoredComment[] } {
	let totalLikes = 0;
	for (const c of comments) totalLikes += c.likeCount;
	return { total: comments.length, totalLikes, top: topComments(comments, topN) };
}
