// 关注/收藏(驾驶舱·Phase 2):维护「博主关注源 + 想拉片的视频」。
// YouTube 频道 → 自动列最近作品批量加;抖音主页 → 浏览器辅助追踪作品数,能列作品时补入视频卡。
// 单条视频(抖音/YouTube/B站)→ 取标题加一张卡,一键去拉片。
import fs from "node:fs";
import path from "node:path";
import type { App, IpcMain } from "electron";
import {
	classifyLink,
	type CreatorTrackInput,
	type FollowingResult,
	type FollowingUpdateResult,
	type SavedVideo,
} from "../../src/lib/followingTypes";
import { atomicWriteFileSync } from "../lib/atomicWrite";
import {
	type DouyinUserProfile,
	type DouyinUserVideo,
	extractDouyinSecUid,
	fetchDouyinShareInfo,
	probeDouyinUser,
} from "../lib/douyin";
import { listChannelVideos, ytdlpProbeTitle } from "../lib/ytdlp";

const CHANNEL_LIMIT = 12;

function douyinChannelTitle(profile: DouyinUserProfile | undefined, secUid?: string): string {
	if (profile?.nickname) return `抖音博主 · ${profile.nickname}`;
	return secUid ? `抖音博主 · ${secUid.slice(0, 12)}…` : "抖音博主主页";
}

function douyinProbeMessage(args: {
	freshCount: number;
	currentCount?: number;
	previousCount?: number;
	errors?: string[];
	initial?: boolean;
}): { message: string; status: SavedVideo["trackerStatus"]; newCount?: number } {
	const delta =
		args.currentCount !== undefined && args.previousCount !== undefined
			? Math.max(0, args.currentCount - args.previousCount)
			: undefined;
	if (args.freshCount > 0) {
		return {
			message: `已补入 ${args.freshCount} 条公开视频。`,
			status: "updated",
			newCount: delta ?? args.freshCount,
		};
	}
	if (delta && delta > 0) {
		return {
			message: `检测到作品数增加 ${delta} 条;作品列表接口未返回链接,可打开主页复制最新视频。`,
			status: "updated",
			newCount: delta,
		};
	}
	if (args.currentCount !== undefined) {
		return {
			message:
				args.initial || args.previousCount === undefined
					? `已记录作品数基线 ${args.currentCount};后续可点检查更新。`
					: "作品数暂无变化。",
			status: "unchanged",
			newCount: 0,
		};
	}
	return {
		message:
			args.errors?.slice(-1)[0] || "本次未拿到作者作品数;可稍后重试,或打开主页复制单条视频链接。",
		status: "blocked",
	};
}

export class FollowingStore {
	private file: string;
	private app: App;
	constructor(app: App) {
		this.app = app;
		this.file = path.join(app.getPath("userData"), "following.json");
	}

	list(): SavedVideo[] {
		try {
			const j = JSON.parse(fs.readFileSync(this.file, "utf8")) as { items?: SavedVideo[] };
			return Array.isArray(j.items) ? j.items : [];
		} catch {
			return [];
		}
	}

	private save(items: SavedVideo[]): void {
		atomicWriteFileSync(this.file, JSON.stringify({ items }, null, 1));
	}

	private mk(
		url: string,
		title: string,
		platform: SavedVideo["platform"],
		channelLabel?: string,
		kind: SavedVideo["kind"] = "video",
		note?: string,
		extra: Partial<SavedVideo> = {},
	): SavedVideo {
		return {
			id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
			url,
			title,
			platform,
			kind,
			addedAt: Date.now(),
			channelLabel,
			note,
			lastCheckedAt: kind === "channel" ? Date.now() : undefined,
			...extra,
		};
	}

	private toSavedDouyinVideos(
		videos: DouyinUserVideo[],
		existing: Set<string>,
		channelLabel: string,
	): SavedVideo[] {
		return videos
			.filter((v) => v.share_url && !existing.has(v.share_url))
			.map((v) => this.mk(v.share_url, v.title, "douyin", channelLabel));
	}

	/** 贴链接添加。返回新列表 + 本次新增数。 */
	async add(url: string): Promise<FollowingUpdateResult> {
		const u = String(url || "").trim();
		if (!u) throw new Error("请粘贴链接。");
		const c = classifyLink(u);
		const items = this.list();
		const existing = new Set(items.map((i) => i.url));

		if (c.platform === "youtube" && c.kind === "channel") {
			const vids = await listChannelVideos(this.app, u, CHANNEL_LIMIT);
			const label = vids[0]?.uploader;
			const fresh = vids
				.filter((v) => v.url && !existing.has(v.url))
				.map((v) => this.mk(v.url, v.title, "youtube", v.uploader || label));
			if (fresh.length) this.save([...fresh, ...items]);
			return { items: this.list(), added: fresh.length };
		}
		if (c.platform === "douyin" && c.kind === "channel") {
			const secUid = extractDouyinSecUid(u);
			const channelUrl = secUid ? `https://www.douyin.com/user/${secUid}` : u;
			let title = douyinChannelTitle(undefined, secUid || undefined);
			let note = "已保存博主主页;可打开主页复制单条视频链接。";
			let fresh: SavedVideo[] = [];
			let channelExtra: Partial<SavedVideo> = {
				trackerStatus: "idle",
				trackerMessage: note,
			};
			try {
				const probe = await probeDouyinUser(channelUrl, CHANNEL_LIMIT);
				title = douyinChannelTitle(probe.profile, secUid || probe.sec_uid);
				fresh = this.toSavedDouyinVideos(probe.videos, existing, title);
				const currentCount = probe.profile?.aweme_count;
				const msg = douyinProbeMessage({
					freshCount: fresh.length,
					currentCount,
					errors: probe.errors,
					initial: true,
				});
				note = msg.message;
				channelExtra = {
					profileNickname: probe.profile?.nickname,
					awemeCount: currentCount,
					newAwemeCount: msg.newCount,
					trackerStatus: msg.status,
					trackerMessage: msg.message,
				};
			} catch (e) {
				note = e instanceof Error ? e.message : "抖音当前没有返回作品列表,已先保存博主主页。";
				channelExtra = {
					trackerStatus: "blocked",
					trackerMessage: note,
				};
			}
			const channelExists = items.some(
				(i) => (i.kind ?? "video") === "channel" && i.url === channelUrl,
			);
			const channel = this.mk(
				channelUrl,
				title,
				"douyin",
				undefined,
				"channel",
				note ||
					(fresh.length
						? `已拉取 ${fresh.length} 条公开视频。`
						: "已保存博主主页;可打开主页复制单条视频链接。"),
				channelExtra,
			);
			const withChannel = channelExists
				? items.map((i) =>
						(i.kind ?? "video") === "channel" && i.url === channelUrl
							? {
									...i,
									title,
									note: channel.note,
									lastCheckedAt: Date.now(),
									...channelExtra,
								}
							: i,
					)
				: [channel, ...items];
			this.save([...fresh, ...withChannel]);
			return {
				items: this.list(),
				added: fresh.length + (channelExists ? 0 : 1),
				updated: Boolean(fresh.length),
				message: note,
			};
		}
		if (c.kind === "channel") {
			throw new Error("目前只能自动列 YouTube 频道作品;其它平台请贴单条视频链接。");
		}
		if (c.kind === "unknown") throw new Error("识别不了这个链接;请贴视频链接或 YouTube 频道链接。");

		// 单条视频:取标题加卡(去重)。
		if (existing.has(u)) return { items, added: 0 };
		const title =
			c.platform === "douyin"
				? (await fetchDouyinShareInfo(u)).title
				: await ytdlpProbeTitle(this.app, u);
		this.save([this.mk(u, title, c.platform), ...items]);
		return { items: this.list(), added: 1 };
	}

	/** 从内置种子池「添加跟踪」:把博主作为频道源加入关注列表(去重)。搜索页/需复核的诚实标注不可自动刷新。 */
	async addCreator(input: CreatorTrackInput): Promise<FollowingUpdateResult> {
		const c = input;
		if (!c?.profileUrl) throw new Error("博主信息不完整。");
		const items = this.list();
		const key = (c.douyinId && c.douyinId.trim()) || c.profileUrl.trim();
		const already = items.find(
			(i) =>
				(i.kind ?? "video") === "channel" &&
				(((i.douyinId && i.douyinId.trim()) || i.url.trim()) === key || i.url === c.profileUrl),
		);
		if (already) {
			return { items, added: 0, updated: false, message: `已在跟踪「${c.creatorName}」。` };
		}
		const note = c.requiresManualReview
			? "已加入跟踪。该账号需人工复核最近内容,不做自动刷新;请打开主页/搜索确认。"
			: c.canAutoRefresh
				? "已加入跟踪,可点「检查更新」拉取最近公开作品。"
				: "已加入跟踪。仅有搜索页,无法自动抓取作品;打开主页/搜索复制视频链接后可去拉片。";
		const channel = this.mk(c.profileUrl, `抖音博主 · ${c.creatorName}`, "douyin", undefined, "channel", note, {
			douyinId: c.douyinId,
			trackingTier: c.trackingTier,
			verificationStatus: c.verificationStatus,
			category: c.category,
			sourceTags: c.tags,
			requiresManualReview: c.requiresManualReview,
			trackerStatus: c.requiresManualReview || !c.canAutoRefresh ? "blocked" : "idle",
			trackerMessage: note,
		});
		this.save([channel, ...items]);
		return { items: this.list(), added: 1, updated: false, message: note };
	}

	/** 关注源手动检查更新。抖音即使拿不到作品列表,也会用作者作品数给更新提醒。 */
	async refresh(id: string): Promise<FollowingUpdateResult> {
		const items = this.list();
		const target = items.find((i) => i.id === id);
		if (!target) throw new Error("关注源不存在。");
		if ((target.kind ?? "video") !== "channel") {
			return { items, added: 0, updated: false, message: "单条视频不需要检查更新。" };
		}
		if (target.platform !== "douyin") {
			return { items, added: 0, updated: false, message: "该平台暂不支持关注源追踪。" };
		}
		// 诚实降级:需人工复核 / 只有搜索页(无 sec_uid)的博主不做自动抓取,标注人工路径,不抛错、不造假数据。
		const manualNote = target.requiresManualReview
			? "该账号需人工复核最近内容,不做自动刷新;请打开主页/搜索复制视频链接。"
			: "该博主只有搜索页,无法自动抓取作品;请打开主页/搜索复制视频链接后去拉片。";
		const secUid = extractDouyinSecUid(target.url);
		if (target.requiresManualReview || !secUid) {
			const updated: SavedVideo = {
				...target,
				note: manualNote,
				lastCheckedAt: Date.now(),
				trackerStatus: "blocked",
				trackerMessage: manualNote,
			};
			this.save(items.map((i) => (i.id === target.id ? updated : i)));
			return { items: this.list(), added: 0, updated: false, message: manualNote };
		}

		const existing = new Set(items.map((i) => i.url));
		const checkedAt = Date.now();
		try {
			const previousCount = target.awemeCount;
			const probe = await probeDouyinUser(target.url, CHANNEL_LIMIT);
			const title = douyinChannelTitle(probe.profile, secUid || probe.sec_uid);
			const fresh = this.toSavedDouyinVideos(probe.videos, existing, title);
			const currentCount = probe.profile?.aweme_count;
			const msg = douyinProbeMessage({
				freshCount: fresh.length,
				currentCount,
				previousCount,
				errors: probe.errors,
			});
			const updatedChannel: SavedVideo = {
				...target,
				title,
				note: msg.message,
				lastCheckedAt: checkedAt,
				profileNickname: probe.profile?.nickname ?? target.profileNickname,
				awemeCount: currentCount ?? target.awemeCount,
				lastAwemeCount: previousCount ?? target.lastAwemeCount,
				newAwemeCount: msg.newCount,
				trackerStatus: msg.status,
				trackerMessage: msg.message,
			};
			this.save([...fresh, ...items.map((i) => (i.id === target.id ? updatedChannel : i))]);
			return {
				items: this.list(),
				added: fresh.length,
				updated: msg.status === "updated",
				message: msg.message,
			};
		} catch (e) {
			const message =
				e instanceof Error ? e.message : "本次检查失败;可稍后重试,或打开主页复制单条视频链接。";
			const updatedChannel: SavedVideo = {
				...target,
				note: message,
				lastCheckedAt: checkedAt,
				trackerStatus: "blocked",
				trackerMessage: message,
			};
			this.save(items.map((i) => (i.id === target.id ? updatedChannel : i)));
			return { items: this.list(), added: 0, updated: false, message };
		}
	}

	remove(id: string): SavedVideo[] {
		const items = this.list().filter((i) => i.id !== id);
		this.save(items);
		return items;
	}

	clear(): SavedVideo[] {
		this.save([]);
		return [];
	}
}

export function registerFollowingHandlers(ipcMain: IpcMain, app: App): void {
	const store = new FollowingStore(app);
	const wrap = async <T>(fn: () => T | Promise<T>): Promise<FollowingResult<T>> => {
		try {
			return { ok: true, data: await fn() };
		} catch (e) {
			return { ok: false, error: e instanceof Error ? e.message : String(e) };
		}
	};
	ipcMain.handle("following:list", () => wrap(() => store.list()));
	ipcMain.handle("following:add", (_e, url: string) => wrap(() => store.add(url)));
	ipcMain.handle("following:addCreator", (_e, input: CreatorTrackInput) =>
		wrap(() => store.addCreator(input)),
	);
	ipcMain.handle("following:refresh", (_e, id: string) => wrap(() => store.refresh(id)));
	ipcMain.handle("following:remove", (_e, id: string) => wrap(() => store.remove(id)));
	ipcMain.handle("following:clear", () => wrap(() => store.clear()));
}
