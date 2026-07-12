import { ExternalLink, Heart, Loader2, MessageSquare } from "lucide-react";
import { useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import { type CommentFetchStatus, summarizeComments, type VideoComments } from "@/lib/commentTypes";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<CommentFetchStatus, string> = {
	ok: "bg-[#34B27B]/15 text-[#3DC489]",
	no_public_data: "bg-white/[0.06] text-slate-400",
	needs_login: "bg-amber-500/15 text-amber-200",
	blocked: "bg-red-500/12 text-red-300",
	needs_manual_refresh: "bg-amber-500/15 text-amber-200",
	error: "bg-red-500/12 text-red-300",
};

/**
 * 抖音视频评论抓取条(挂在「关注」里抖音单条视频卡下方)。
 * 诚实状态优先:失败给「打开视频页面」人工兜底,绝不假装后台已抓成功。
 */
export function VideoCommentStrip({
	videoUrl,
	record,
	fetching,
	onFetch,
	onOpen,
}: {
	videoUrl: string;
	record?: VideoComments;
	fetching: boolean;
	onFetch: (videoUrl: string) => void;
	onOpen: (videoUrl: string) => void;
}) {
	const t = useScopedT("editor");
	const [expanded, setExpanded] = useState(false);

	const comments = record?.comments ?? [];
	const summary = summarizeComments(comments, 5);
	const status = record?.status;
	const showManualFallback =
		status === "needs_login" ||
		status === "blocked" ||
		status === "needs_manual_refresh" ||
		status === "error";

	const fetchedAt = record?.lastFetchedAt
		? new Intl.DateTimeFormat(undefined, {
				month: "2-digit",
				day: "2-digit",
				hour: "2-digit",
				minute: "2-digit",
			}).format(new Date(record.lastFetchedAt))
		: null;

	return (
		<div className="mt-1.5 border-t border-white/[0.05] pt-2">
			<div className="flex flex-wrap items-center gap-1.5">
				<button
					type="button"
					onClick={() => onFetch(videoUrl)}
					disabled={fetching}
					className="flex items-center gap-1 rounded-md bg-[#34B27B]/[0.14] px-2 py-1 text-[10.5px] font-medium text-[#3DC489] transition-colors hover:bg-[#34B27B]/[0.22] disabled:cursor-wait disabled:opacity-60"
				>
					{fetching ? (
						<Loader2 className="h-3 w-3 animate-spin" />
					) : (
						<MessageSquare className="h-3 w-3" />
					)}
					{fetching
						? t("cockpit.comments.fetching")
						: comments.length
							? t("cockpit.comments.refetch")
							: t("cockpit.comments.fetch")}
				</button>

				{status && (
					<span
						className={cn(
							"rounded px-1.5 py-0.5 text-[9.5px] font-medium",
							STATUS_TONE[status],
						)}
					>
						{t(`cockpit.comments.status_${status}`)}
					</span>
				)}
				{comments.length > 0 && (
					<span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[9.5px] text-slate-400">
						{t("cockpit.comments.count", { n: comments.length })}
					</span>
				)}
				{record?.lastAdded ? (
					<span className="rounded bg-[#34B27B]/15 px-1.5 py-0.5 text-[9.5px] font-medium text-[#3DC489]">
						{t("cockpit.comments.added", { n: record.lastAdded })}
					</span>
				) : null}
				{comments.length > 0 && (
					<button
						type="button"
						onClick={() => setExpanded((v) => !v)}
						className="rounded-md px-1.5 py-0.5 text-[9.5px] text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-slate-200"
					>
						{expanded ? t("cockpit.comments.hide") : t("cockpit.comments.viewTop")}
					</button>
				)}
				{showManualFallback && (
					<button
						type="button"
						onClick={() => onOpen(videoUrl)}
						className="flex items-center gap-1 rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[9.5px] text-slate-300 transition-colors hover:bg-white/[0.1]"
					>
						<ExternalLink className="h-2.5 w-2.5" />
						{t("cockpit.comments.openPage")}
					</button>
				)}
				{fetchedAt && (
					<span className="text-[9.5px] text-slate-600">
						{t("cockpit.comments.lastFetched", { time: fetchedAt })}
					</span>
				)}
			</div>

			{record?.message && (
				<p className="mt-1 text-[10px] leading-relaxed text-slate-500">{record.message}</p>
			)}
			{showManualFallback && (
				<p className="mt-0.5 text-[10px] leading-relaxed text-amber-200/60">
					{t("cockpit.comments.manualHint")}
				</p>
			)}

			{expanded && summary.top.length > 0 && (
				<div className="mt-1.5 space-y-1">
					<p className="text-[10px] font-medium text-slate-400">
						{t("cockpit.comments.topTitle")}
					</p>
					{summary.top.map((c) => (
						<div key={c.commentId} className="rounded-md bg-white/[0.03] px-2 py-1.5">
							<div className="flex items-center gap-1.5 text-[9.5px] text-slate-500">
								<span className="flex items-center gap-0.5 text-[#3DC489]">
									<Heart className="h-2.5 w-2.5" />
									{c.likeCount}
								</span>
								{c.displayName && <span className="truncate">· {c.displayName}</span>}
							</div>
							<p className="mt-0.5 break-words text-[10.5px] leading-relaxed text-slate-300">
								{c.text}
							</p>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

export default VideoCommentStrip;
