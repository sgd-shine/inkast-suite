// 评论抓取存储(驾驶舱·Phase「评论抓取」):按 videoUrl 存进 userData/comments.json。
// 抓取本体走 electron/lib/douyinComments.ts(浏览器上下文);这里负责去重、增量合并、诚实状态落盘。
import fs from "node:fs";
import path from "node:path";
import type { App, IpcMain } from "electron";
import {
	type CommentsIpcResult,
	type CommentFetchResult,
	dedupeComments,
	type StoredComment,
	type VideoComments,
} from "../../src/lib/commentTypes";
import { classifyLink } from "../../src/lib/followingTypes";
import { atomicWriteFileSync } from "../lib/atomicWrite";
import { fetchDouyinComments } from "../lib/douyinComments";

interface CommentsFile {
	byVideo?: Record<string, VideoComments>;
}

export class CommentsStore {
	private file: string;

	constructor(app: App) {
		this.file = path.join(app.getPath("userData"), "comments.json");
	}

	private read(): Record<string, VideoComments> {
		try {
			const j = JSON.parse(fs.readFileSync(this.file, "utf8")) as CommentsFile;
			return j.byVideo && typeof j.byVideo === "object" ? j.byVideo : {};
		} catch {
			return {};
		}
	}

	private write(byVideo: Record<string, VideoComments>): void {
		atomicWriteFileSync(this.file, JSON.stringify({ byVideo }, null, 1));
	}

	/** 一条视频的评论记录(没有则 undefined)。 */
	get(videoUrl: string): VideoComments | undefined {
		return this.read()[videoUrl];
	}

	/** 全部视频的评论记录(供概览)。 */
	all(): Record<string, VideoComments> {
		return this.read();
	}

	remove(videoUrl: string): Record<string, VideoComments> {
		const byVideo = this.read();
		delete byVideo[videoUrl];
		this.write(byVideo);
		return byVideo;
	}

	/**
	 * 抓取一条视频的评论并增量合并落盘。仅支持抖音(其它平台诚实返回不支持)。
	 * 抓取失败不抛错、不造假:落诚实状态,保留既有评论。
	 */
	async fetch(
		videoUrl: string,
		opts: { limit?: number } = {},
	): Promise<CommentFetchResult> {
		const url = String(videoUrl || "").trim();
		if (!url) throw new Error("请提供视频链接。");
		console.log(`[comments] fetch requested: ${url}`);
		const cls = classifyLink(url);
		const byVideo = this.read();
		const prev = byVideo[url];
		const existing: StoredComment[] = prev?.comments ?? [];

		if (cls.platform !== "douyin" || cls.kind !== "video") {
			const rec: VideoComments = {
				videoUrl: url,
				comments: existing,
				lastFetchedAt: Date.now(),
				status: "needs_manual_refresh",
				message: "目前只支持抖音单条视频评论抓取;其它平台请打开视频页面人工查看。",
				lastAdded: 0,
			};
			byVideo[url] = rec;
			this.write(byVideo);
			return {
				videoUrl: url,
				status: rec.status,
				message: rec.message,
				comments: existing,
				added: 0,
				total: existing.length,
			};
		}

		const now = Date.now();
		let raw: Awaited<ReturnType<typeof fetchDouyinComments>>;
		try {
			raw = await fetchDouyinComments(url, { limit: opts.limit });
		} catch (e) {
			const errMsg = e instanceof Error ? e.message : String(e);
			// 有既存评论就不因本次异常降级为失败:保留成果,只提示本次没成功。
			const rec: VideoComments = {
				videoUrl: url,
				comments: existing,
				lastFetchedAt: now,
				status: existing.length > 0 ? "ok" : "error",
				message:
					existing.length > 0
						? `本次抓取出错(${errMsg}),已保留此前 ${existing.length} 条评论,可稍后重试。`
						: errMsg,
				lastAdded: 0,
			};
			byVideo[url] = rec;
			this.write(byVideo);
			return {
				videoUrl: url,
				status: rec.status,
				message: rec.message,
				comments: existing,
				added: 0,
				total: existing.length,
			};
		}

		const incoming: StoredComment[] = raw.comments.map((c) => ({
			...c,
			fetchedAt: now,
			sourceVideoUrl: url,
		}));
		const { merged, added } = dedupeComments(existing, incoming);
		// 只要合并后有评论就是成功态:本次可能 0 新增/未拿到新数据,但不该盖掉已抓成果。
		// 仅当一条都没有时,才透传抓取本体的诚实降级状态(needs_login/blocked/no_public_data/needs_manual_refresh)。
		let status = raw.status;
		let message = raw.message;
		if (merged.length > 0) {
			status = "ok";
			if (added > 0) {
				message = `本次新增 ${added} 条,共 ${merged.length} 条。`;
			} else if (raw.comments.length === 0) {
				message = `本次未拿到新评论(可能加载慢/被限流),已保留此前 ${merged.length} 条,可稍后重试。`;
			} else {
				message = `本次无新增,共 ${merged.length} 条。`;
			}
		}
		const rec: VideoComments = {
			videoUrl: url,
			comments: merged,
			lastFetchedAt: now,
			status,
			message,
			lastAdded: added,
		};
		byVideo[url] = rec;
		this.write(byVideo);
		return {
			videoUrl: url,
			status,
			message,
			comments: merged,
			added,
			total: merged.length,
		};
	}
}

export function registerCommentsHandlers(ipcMain: IpcMain, app: App): void {
	const store = new CommentsStore(app);
	const wrap = async <T>(fn: () => T | Promise<T>): Promise<CommentsIpcResult<T>> => {
		try {
			return { ok: true, data: await fn() };
		} catch (e) {
			return { ok: false, error: e instanceof Error ? e.message : String(e) };
		}
	};
	ipcMain.handle("comments:get", (_e, videoUrl: string) => wrap(() => store.get(videoUrl) ?? null));
	ipcMain.handle("comments:all", () => wrap(() => store.all()));
	ipcMain.handle("comments:fetch", (_e, videoUrl: string, limit?: number) =>
		wrap(() => store.fetch(videoUrl, { limit })),
	);
	ipcMain.handle("comments:remove", (_e, videoUrl: string) => wrap(() => store.remove(videoUrl)));
}
