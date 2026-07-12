import {
	Check,
	Copy,
	ExternalLink,
	Loader2,
	Plus,
	RefreshCw,
	ScanSearch,
	Trash2,
	Youtube,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import type { VideoComments } from "@/lib/commentTypes";
import type { CreatorTrackInput, FollowPlatform, SavedVideo } from "@/lib/followingTypes";
import { cn } from "@/lib/utils";
import { CreatorPoolSection } from "./CreatorPoolSection";
import { VideoCommentStrip } from "./VideoCommentStrip";

const following = typeof window !== "undefined" ? window.electronAPI?.following : undefined;
const commentsApi = typeof window !== "undefined" ? window.electronAPI?.comments : undefined;

const PLATFORM_LABEL: Record<FollowPlatform, string> = {
	youtube: "YouTube",
	douyin: "抖音",
	bilibili: "B站",
	other: "链接",
};
const PLATFORM_TONE: Record<FollowPlatform, string> = {
	youtube: "bg-red-500/15 text-red-300",
	douyin: "bg-[#34B27B]/15 text-[#3DC489]",
	bilibili: "bg-sky-500/15 text-sky-300",
	other: "bg-white/[0.08] text-slate-300",
};

/**
 * Inkast 整合 · 驾驶舱「关注」(Phase 2)。收藏想拉片的视频与博主追踪源。
 * 抖音博主主页会记录 profile 作品数变化;能列出公开视频时会补成普通视频卡。
 */
export function FollowPanel({ onGoAnalyze }: { onGoAnalyze?: (url: string) => void }) {
	const t = useScopedT("editor");
	const [items, setItems] = useState<SavedVideo[]>([]);
	const [url, setUrl] = useState("");
	const [adding, setAdding] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [hint, setHint] = useState<string | null>(null);
	const [copiedId, setCopiedId] = useState<string | null>(null);
	const [refreshingId, setRefreshingId] = useState<string | null>(null);
	const [commentsByVideo, setCommentsByVideo] = useState<Record<string, VideoComments>>({});
	const [fetchingComment, setFetchingComment] = useState<string | null>(null);

	useEffect(() => {
		following?.list().then((r) => {
			if (r?.ok && r.data) setItems(r.data);
		});
		commentsApi?.all().then((r) => {
			if (r?.ok && r.data) setCommentsByVideo(r.data);
		});
	}, []);

	// 评论抓取:抓取本体在主进程浏览器上下文完成,失败诚实降级(不造假)。失败/异常都给可见反馈。
	const fetchComments = useCallback(async (videoUrl: string) => {
		if (!commentsApi) {
			setError("评论抓取接口不可用(请确认已加载最新版本 / 重启应用)。");
			return;
		}
		setFetchingComment(videoUrl);
		setError(null);
		let r: Awaited<ReturnType<NonNullable<typeof commentsApi>["fetch"]>> | undefined;
		try {
			r = await commentsApi.fetch(videoUrl);
		} catch (e) {
			r = { ok: false, error: e instanceof Error ? e.message : String(e) };
		}
		setFetchingComment(null);
		if (r?.ok && r.data) {
			setCommentsByVideo((prev) => ({
				...prev,
				[videoUrl]: {
					videoUrl,
					comments: r?.data?.comments ?? [],
					lastFetchedAt: Date.now(),
					status: r?.data?.status ?? "error",
					message: r?.data?.message,
					lastAdded: r?.data?.added,
				},
			}));
		} else {
			setError(r?.error || "评论抓取失败。");
		}
	}, []);

	const add = useCallback(async () => {
		const u = url.trim();
		if (!u || !following) return;
		setAdding(true);
		setError(null);
		setHint(null);
		const r = await following.add(u);
		setAdding(false);
		if (r?.ok && r.data) {
			setItems(r.data.items);
			setUrl("");
			setHint(r.data.message || t("cockpit.follow.added", { n: r.data.added }));
			setTimeout(() => setHint(null), 2200);
		} else {
			setError(r?.error || t("cockpit.follow.addFailed"));
		}
	}, [url, t]);

	const remove = useCallback(async (id: string) => {
		const r = await following?.remove(id);
		if (r?.ok && r.data) setItems(r.data);
	}, []);

	const refresh = useCallback(
		async (item: SavedVideo) => {
			if (!following) return;
			setRefreshingId(item.id);
			setError(null);
			setHint(null);
			const r = await following.refresh(item.id);
			setRefreshingId(null);
			if (r?.ok && r.data) {
				setItems(r.data.items);
				setHint(r.data.message || t("cockpit.follow.refreshDone", { n: r.data.added }));
				setTimeout(() => setHint(null), 2600);
			} else {
				setError(r?.error || t("cockpit.follow.refreshFailed"));
			}
		},
		[t],
	);

	const copy = useCallback(async (item: SavedVideo) => {
		try {
			await navigator.clipboard.writeText(item.url);
			setCopiedId(item.id);
			setTimeout(() => setCopiedId((c) => (c === item.id ? null : c)), 1500);
		} catch {
			/* 剪贴板不可用时忽略 */
		}
	}, []);

	const openExternal = useCallback((link: string) => {
		void window.electronAPI?.openExternalUrl?.(link);
	}, []);

	// 已跟踪博主键(与种子池 creatorKey 对齐:抖音号优先,否则主页 URL)——供种子池显示「已跟踪」。
	const trackedKeys = useMemo(
		() =>
			new Set(
				items
					.filter((i) => (i.kind ?? "video") === "channel")
					.map((i) => (i.douyinId?.trim() ? i.douyinId.trim() : i.url.trim())),
			),
		[items],
	);

	// 种子池「添加跟踪」→ 桥接进 following.json,即时回写关注列表。
	const trackCreator = useCallback(
		async (input: CreatorTrackInput): Promise<{ ok: boolean; message?: string }> => {
			if (!following) return { ok: false };
			setError(null);
			const r = await following.addCreator(input);
			if (r?.ok && r.data) {
				setItems(r.data.items);
				setHint(r.data.message || t("cockpit.creatorPool.track"));
				setTimeout(() => setHint(null), 2600);
				return { ok: true, message: r.data.message };
			}
			setError(r?.error || t("cockpit.creatorPool.trackFailed"));
			return { ok: false, message: r?.error };
		},
		[t],
	);

	const formatCheckedAt = useCallback((ts?: number) => {
		if (!ts) return null;
		const d = new Date(ts);
		if (Number.isNaN(d.getTime())) return null;
		return new Intl.DateTimeFormat(undefined, {
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
		}).format(d);
	}, []);

	return (
		<div className="flex h-full w-full flex-col overflow-hidden">
			{/* 添加栏 */}
			<div className="flex shrink-0 flex-col gap-1.5 border-b border-white/[0.07] px-5 py-3">
				<div className="flex items-center gap-2">
					<input
						value={url}
						onChange={(e) => setUrl(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") add();
						}}
						placeholder={t("cockpit.follow.placeholder")}
						className="min-w-0 flex-1 rounded-lg border border-white/[0.1] bg-[#15181C] px-3 py-2 text-[12px] text-slate-200 outline-none placeholder:text-slate-600 focus:border-[#34B27B]/40"
					/>
					<button
						type="button"
						onClick={add}
						disabled={adding || !url.trim()}
						className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[#34B27B] px-3 py-2 text-[12px] font-semibold text-[#06140d] transition-colors hover:bg-[#34B27B]/90 disabled:cursor-not-allowed disabled:opacity-40"
					>
						{adding ? (
							<Loader2 className="h-3.5 w-3.5 animate-spin" />
						) : (
							<Plus className="h-3.5 w-3.5" />
						)}
						{t("cockpit.follow.add")}
					</button>
				</div>
				{error && <p className="text-[11px] text-red-300">{error}</p>}
				{hint && <p className="text-[11px] text-[#3DC489]">{hint}</p>}
				<p className="text-[10.5px] leading-relaxed text-slate-600">{t("cockpit.follow.hint")}</p>
			</div>

			{/* 种子池 + 收藏列表 */}
			<div className="min-h-0 flex-1 overflow-auto p-4 custom-scrollbar">
				<CreatorPoolSection trackedKeys={trackedKeys} onTrack={trackCreator} />
				{items.length === 0 ? (
					<p className="mt-6 text-center text-[12px] text-slate-600">
						{t("cockpit.follow.empty")}
					</p>
				) : (
					<div className="space-y-2">
						{items.map((item) => {
							const kind = item.kind ?? "video";
							const checkedAt = formatCheckedAt(item.lastCheckedAt);
							const hasAwemeCount = typeof item.awemeCount === "number";
							const newAwemeCount = item.newAwemeCount ?? 0;
							const noteTone =
								item.trackerStatus === "updated"
									? "text-[#3DC489]"
									: item.trackerStatus === "blocked"
										? "text-amber-200/75"
										: "text-slate-500";
							const isDouyinVideo = kind === "video" && item.platform === "douyin";
							return (
								<div
									key={item.id}
									className="group rounded-lg border border-white/[0.06] bg-[#15181C] px-3.5 py-2.5"
								>
									<div className="flex items-start gap-2.5">
									<span
										className={cn(
											"mt-0.5 flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[9.5px] font-medium",
											PLATFORM_TONE[item.platform],
										)}
									>
										{item.platform === "youtube" && <Youtube className="h-2.5 w-2.5" />}
										{kind === "channel"
											? t("cockpit.follow.channelBadge", {
													platform: PLATFORM_LABEL[item.platform],
												})
											: PLATFORM_LABEL[item.platform]}
									</span>
									<div className="min-w-0 flex-1">
										<p className="break-words text-[12px] font-medium leading-snug text-slate-200">
											{item.title}
										</p>
										{item.channelLabel && (
											<p className="mt-0.5 truncate text-[10px] text-slate-500">
												{item.channelLabel}
											</p>
										)}
										{kind === "channel" && (hasAwemeCount || newAwemeCount > 0 || checkedAt) && (
											<div className="mt-1 flex flex-wrap items-center gap-1.5">
												{hasAwemeCount && (
													<span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-slate-400">
														{t("cockpit.follow.awemeCount", { n: item.awemeCount ?? 0 })}
													</span>
												)}
												{newAwemeCount > 0 && (
													<span className="rounded bg-[#34B27B]/15 px-1.5 py-0.5 text-[10px] font-medium text-[#3DC489]">
														{t("cockpit.follow.newAwemeCount", { n: newAwemeCount })}
													</span>
												)}
												{checkedAt && (
													<span className="rounded bg-white/[0.05] px-1.5 py-0.5 text-[10px] text-slate-500">
														{t("cockpit.follow.checkedAt", { time: checkedAt })}
													</span>
												)}
											</div>
										)}
										<p className="mt-0.5 truncate font-mono text-[10px] text-slate-600">
											{item.url}
										</p>
										{item.note && (
											<p className={cn("mt-1 text-[10.5px] leading-relaxed", noteTone)}>
												{item.note}
											</p>
										)}
									</div>
									<div className="flex shrink-0 flex-col items-end gap-1">
										<div className="flex max-w-[190px] flex-wrap justify-end gap-1">
											<button
												type="button"
												onClick={() => copy(item)}
												title={t("cockpit.follow.copy")}
												className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-white/[0.08] hover:text-slate-200"
											>
												{copiedId === item.id ? (
													<Check className="h-3.5 w-3.5 text-[#3DC489]" />
												) : (
													<Copy className="h-3.5 w-3.5" />
												)}
											</button>
											{kind === "channel" ? (
												<>
													<button
														type="button"
														onClick={() => refresh(item)}
														disabled={refreshingId === item.id}
														className="flex items-center gap-1 rounded-md bg-[#34B27B]/[0.14] px-2 py-1.5 text-[11px] font-medium text-[#3DC489] transition-colors hover:bg-[#34B27B]/[0.22] disabled:cursor-wait disabled:opacity-60"
													>
														{refreshingId === item.id ? (
															<Loader2 className="h-3.5 w-3.5 animate-spin" />
														) : (
															<RefreshCw className="h-3.5 w-3.5" />
														)}
														{refreshingId === item.id
															? t("cockpit.follow.refreshing")
															: t("cockpit.follow.refresh")}
													</button>
													<button
														type="button"
														onClick={() => openExternal(item.url)}
														className="flex items-center gap-1 rounded-md bg-white/[0.08] px-2 py-1.5 text-[11px] font-medium text-slate-300 transition-colors hover:bg-white/[0.12]"
													>
														<ExternalLink className="h-3.5 w-3.5" />
														{t("cockpit.follow.openProfile")}
													</button>
												</>
											) : (
												<button
													type="button"
													onClick={() => onGoAnalyze?.(item.url)}
													className="flex items-center gap-1 rounded-md bg-[#34B27B]/[0.14] px-2 py-1.5 text-[11px] font-medium text-[#3DC489] transition-colors hover:bg-[#34B27B]/[0.22] disabled:cursor-wait disabled:opacity-60"
												>
													<ScanSearch className="h-3.5 w-3.5" />
													{t("cockpit.follow.goAnalyze")}
												</button>
											)}
											<button
												type="button"
												onClick={() => remove(item.id)}
												title={t("cockpit.follow.remove")}
												className="rounded-md p-1.5 text-slate-500 opacity-0 transition-opacity hover:bg-red-500/[0.12] hover:text-red-300 group-hover:opacity-100"
											>
												<Trash2 className="h-3.5 w-3.5" />
											</button>
										</div>
									</div>
									</div>
									{isDouyinVideo && (
										<VideoCommentStrip
											videoUrl={item.url}
											record={commentsByVideo[item.url]}
											fetching={fetchingComment === item.url}
											onFetch={fetchComments}
											onOpen={openExternal}
										/>
									)}
								</div>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);
}

export default FollowPanel;
