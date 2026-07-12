import { Check, ChevronDown, Copy, ExternalLink, Plus, Search, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import {
	CANDIDATE_NAMES,
	canAutoRefresh,
	categoryLabel,
	CREATOR_SEED,
	type CreatorSource,
	creatorKey,
	douyinSearchUrl,
	filterCreators,
	type TrackingTier,
} from "@/lib/creatorSeed";
import type { CreatorTrackInput } from "@/lib/followingTypes";
import { cn } from "@/lib/utils";

const TIER_TONE: Record<TrackingTier, string> = {
	core: "bg-[#34B27B]/15 text-[#3DC489]",
	secondary: "bg-sky-500/15 text-sky-300",
	reference: "bg-amber-500/15 text-amber-200",
	candidate: "bg-white/[0.08] text-slate-300",
};

type TierFilter = TrackingTier | "all";
const TIER_TABS: Array<{ id: TierFilter; labelKey: string }> = [
	{ id: "all", labelKey: "filterAll" },
	{ id: "core", labelKey: "tierCore" },
	{ id: "secondary", labelKey: "tierSecondary" },
	{ id: "reference", labelKey: "tierReference" },
	{ id: "candidate", labelKey: "tierCandidate" },
];

/**
 * Inkast 整合 · 驾驶舱「关注」内的「AI 博主种子池」推荐区(2026-07-01 交接报告落地)。
 * 静态内置 22 位博主种子;「添加跟踪」桥接进 following.json,搜索页/待复核诚实标注不可自动刷新。
 */
export function CreatorPoolSection({
	trackedKeys,
	onTrack,
}: {
	/** 已在关注列表里的博主键(creatorKey);用于显示「已跟踪」。 */
	trackedKeys: Set<string>;
	onTrack: (input: CreatorTrackInput) => Promise<{ ok: boolean; message?: string }>;
}) {
	const t = useScopedT("editor");
	const [open, setOpen] = useState(true);
	const [tier, setTier] = useState<TierFilter>("all");
	const [query, setQuery] = useState("");
	const [hideExcluded, setHideExcluded] = useState(true);
	const [copiedId, setCopiedId] = useState<string | null>(null);
	const [trackingKey, setTrackingKey] = useState<string | null>(null);

	const list = useMemo<CreatorSource[]>(
		() => filterCreators(CREATOR_SEED, { tier, query, hideExcluded }),
		[tier, query, hideExcluded],
	);

	const copyId = async (c: CreatorSource) => {
		if (!c.douyinId) return;
		try {
			await navigator.clipboard.writeText(c.douyinId);
			const k = creatorKey(c);
			setCopiedId(k);
			setTimeout(() => setCopiedId((v) => (v === k ? null : v)), 1500);
		} catch {
			/* 剪贴板不可用时忽略 */
		}
	};

	const openExternal = (url: string) => void window.electronAPI?.openExternalUrl?.(url);

	const track = async (c: CreatorSource) => {
		const k = creatorKey(c);
		setTrackingKey(k);
		await onTrack({
			creatorName: c.creatorName,
			douyinId: c.douyinId,
			profileUrl: c.profileUrl,
			trackingTier: c.trackingTier,
			category: c.category,
			tags: c.tags,
			verificationStatus: c.verificationStatus,
			requiresManualReview: c.requiresManualReview,
			canAutoRefresh: canAutoRefresh(c),
		});
		setTrackingKey(null);
	};

	const showCandidates = tier === "candidate" || tier === "all";
	const candidateMatches = useMemo(() => {
		const q = query.trim();
		return q ? CANDIDATE_NAMES.filter((n) => n.includes(q)) : [...CANDIDATE_NAMES];
	}, [query]);

	return (
		<div className="mb-3 rounded-xl border border-white/[0.07] bg-[#131619]">
			{/* 区头 */}
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left"
			>
				<Users className="h-4 w-4 text-[#3DC489]" />
				<span className="text-[12.5px] font-semibold text-slate-100">
					{t("cockpit.creatorPool.title")}
				</span>
				<span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-slate-400">
					{t("cockpit.creatorPool.count", {
						n: tier === "candidate" ? candidateMatches.length : list.length,
					})}
				</span>
				<ChevronDown
					className={cn(
						"ml-auto h-4 w-4 text-slate-500 transition-transform",
						open ? "" : "-rotate-90",
					)}
				/>
			</button>

			{open && (
				<div className="border-t border-white/[0.06] px-3.5 pb-3.5 pt-2.5">
					<p className="mb-2 text-[10.5px] leading-relaxed text-slate-500">
						{t("cockpit.creatorPool.subtitle")}
					</p>

					{/* 筛选行 */}
					<div className="mb-2.5 flex flex-wrap items-center gap-1.5">
						{TIER_TABS.map((tab) => (
							<button
								key={tab.id}
								type="button"
								onClick={() => setTier(tab.id)}
								className={cn(
									"rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
									tier === tab.id
										? "bg-[#34B27B] text-[#06140d]"
										: "bg-white/[0.05] text-slate-400 hover:bg-white/[0.09] hover:text-slate-200",
								)}
							>
								{t(`cockpit.creatorPool.${tab.labelKey}`)}
							</button>
						))}
						<div className="relative ml-auto min-w-[140px] flex-1">
							<Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-600" />
							<input
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								placeholder={t("cockpit.creatorPool.search")}
								className="w-full rounded-md border border-white/[0.09] bg-[#15181C] py-1 pr-2 text-[11px] text-slate-200 outline-none placeholder:text-slate-600 focus:border-[#34B27B]/40"
								style={{ paddingLeft: "1.6rem" }}
							/>
						</div>
						<label className="flex cursor-pointer select-none items-center gap-1 text-[10.5px] text-slate-400">
							<input
								type="checkbox"
								checked={hideExcluded}
								onChange={(e) => setHideExcluded(e.target.checked)}
								className="h-3 w-3 accent-[#34B27B]"
							/>
							{t("cockpit.creatorPool.hideExcluded")}
						</label>
					</div>

					{/* 卡片网格 */}
					{tier !== "candidate" &&
						(list.length === 0 ? (
							<p className="py-4 text-center text-[11px] text-slate-600">
								{t("cockpit.creatorPool.empty")}
							</p>
						) : (
							<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
								{list.map((c) => {
									const k = creatorKey(c);
									const isTracked = trackedKeys.has(k);
									return (
										<div
											key={k}
											className="flex flex-col gap-1.5 rounded-lg border border-white/[0.06] bg-[#15181C] p-2.5"
										>
											<div className="flex items-start gap-1.5">
												<p className="min-w-0 flex-1 break-words text-[12px] font-semibold leading-snug text-slate-100">
													{c.creatorName}
												</p>
												<span
													className={cn(
														"shrink-0 rounded px-1.5 py-0.5 text-[9.5px] font-medium",
														TIER_TONE[c.trackingTier],
													)}
												>
													{t(`cockpit.creatorPool.tier${cap(c.trackingTier)}`)}
												</span>
											</div>
											<div className="flex flex-wrap items-center gap-1">
												<span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[9.5px] text-slate-400">
													{categoryLabel(c.category)}
												</span>
												<span className="rounded bg-white/[0.04] px-1.5 py-0.5 text-[9.5px] text-slate-500">
													{t(`cockpit.creatorPool.verify_${c.verificationStatus}`)}
												</span>
											</div>
											<p className="truncate font-mono text-[10px] text-slate-600">
												{c.douyinId
													? `抖音号 ${c.douyinId}`
													: t("cockpit.creatorPool.noId")}
											</p>
											{c.requiresManualReview && (
												<p className="text-[10px] leading-relaxed text-amber-200/80">
													⚠ {c.manualReviewReason || t("cockpit.creatorPool.manualReview")}
												</p>
											)}
											{c.referenceOnlyReason && (
												<p className="text-[10px] leading-relaxed text-slate-500">
													{c.referenceOnlyReason}
												</p>
											)}
											<div className="mt-0.5 flex flex-wrap gap-1">
												{c.douyinId && (
													<button
														type="button"
														onClick={() => copyId(c)}
														className="flex items-center gap-1 rounded-md bg-white/[0.06] px-1.5 py-1 text-[10.5px] text-slate-300 transition-colors hover:bg-white/[0.1]"
													>
														{copiedId === k ? (
															<Check className="h-3 w-3 text-[#3DC489]" />
														) : (
															<Copy className="h-3 w-3" />
														)}
														{copiedId === k
															? t("cockpit.creatorPool.copied")
															: t("cockpit.creatorPool.copyId")}
													</button>
												)}
												<button
													type="button"
													onClick={() => openExternal(c.profileUrl)}
													className="flex items-center gap-1 rounded-md bg-white/[0.06] px-1.5 py-1 text-[10.5px] text-slate-300 transition-colors hover:bg-white/[0.1]"
												>
													<ExternalLink className="h-3 w-3" />
													{t("cockpit.creatorPool.openSearch")}
												</button>
												<button
													type="button"
													disabled={isTracked || trackingKey === k}
													onClick={() => track(c)}
													className={cn(
														"flex items-center gap-1 rounded-md px-1.5 py-1 text-[10.5px] font-medium transition-colors",
														isTracked
															? "cursor-default bg-white/[0.04] text-slate-500"
															: "bg-[#34B27B]/[0.16] text-[#3DC489] hover:bg-[#34B27B]/[0.26] disabled:opacity-50",
													)}
												>
													{isTracked ? (
														<Check className="h-3 w-3" />
													) : (
														<Plus className="h-3 w-3" />
													)}
													{isTracked
														? t("cockpit.creatorPool.tracked")
														: t("cockpit.creatorPool.track")}
												</button>
											</div>
										</div>
									);
								})}
							</div>
						))}

					{/* 待复核候选(仅名称,不自动导入) */}
					{showCandidates && candidateMatches.length > 0 && (
						<div className="mt-3 border-t border-white/[0.05] pt-2.5">
							<p className="mb-1.5 text-[10.5px] leading-relaxed text-amber-200/70">
								{t("cockpit.creatorPool.candidateHint")}
							</p>
							<div className="flex flex-wrap gap-1.5">
								{candidateMatches.map((name) => (
									<button
										key={name}
										type="button"
										onClick={() => openExternal(douyinSearchUrl(name))}
										title={t("cockpit.creatorPool.openSearch")}
										className="flex items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[10.5px] text-slate-400 transition-colors hover:border-[#34B27B]/30 hover:text-slate-200"
									>
										{name}
										<ExternalLink className="h-2.5 w-2.5 opacity-60" />
									</button>
								))}
							</div>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

function cap(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1);
}

export default CreatorPoolSection;
