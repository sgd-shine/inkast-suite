import {
	AlertTriangle,
	Bookmark,
	CheckSquare,
	Clapperboard,
	Copy,
	ExternalLink,
	Flame,
	FolderOpen,
	ListTodo,
	Loader2,
	Newspaper,
	Plus,
	Quote,
	RefreshCw,
	Send,
	Settings2,
	Sparkles,
	Square,
	Video,
	X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import { useResizableWidth } from "@/hooks/useResizableWidth";
import { cleanFeedBody } from "@/lib/cockpitFeed";
import {
	type CockpitPrefs,
	cycleChannel,
	cycleGroup,
	FLOW,
	loadPrefs,
	loadStatuses,
	nextStatus,
	PREF_CHANNELS,
	PREF_GROUPS,
	PREF_PLATFORMS,
	PREF_PRESETS,
	type PrefState,
	prefList,
	prefStateLabel,
	prefSummary,
	savePrefs,
	setPreset,
	togglePlatform,
} from "@/lib/cockpitPrefs";
import type { CockpitCard, CockpitData, CockpitFeedItem, CockpitMedia } from "@/lib/cockpitTypes";
import { mediaKind } from "@/lib/mediaKind";
import {
	artifactsFor,
	injectedCards,
	injectedSourceFor,
	resolveDraft,
	resolveNote,
	resolveStatus,
	resolveTodos,
} from "@/lib/poolMerge";
import type { PoolArtifact, PoolTodo, TopicPool } from "@/lib/poolTypes";
import { activeProjects, type TopicProject } from "@/lib/topicProject";
import { cn } from "@/lib/utils";
import { FollowPanel } from "./FollowPanel";

const cockpit = typeof window !== "undefined" ? window.electronAPI?.cockpit : undefined;
const poolApi = typeof window !== "undefined" ? window.electronAPI?.pool : undefined;
const settingsApi = typeof window !== "undefined" ? window.electronAPI?.settings : undefined;
const articleApi = typeof window !== "undefined" ? window.electronAPI?.article : undefined;
const boardApi = typeof window !== "undefined" ? window.electronAPI?.publishBoard : undefined;

type SubTab = "topics" | "projects" | "opinions" | "sources" | "hot" | "peers" | "follow";
type Selection =
	| { kind: "card"; card: CockpitCard }
	| { kind: "feed"; item: CockpitFeedItem }
	| null;

/**
 * Inkast 整合 · 驾驶舱 Tab(对齐原型 内容驾驶舱_原型.html,高密度 3 栏:左导航 / 中卡片网格 / 右详情预览)。
 * 读 KnowledgePlanet 每日选题(按路径,不复制 vault) + 偏好引擎 + 主进程选题池(流转/回填/拉片注入,实时)。
 * 右栏含媒体预览(图片缩略图+灯箱、视频内联)。漏斗动作:选题「去录屏」/「去成片」。
 */
export function CockpitPanel({
	onGoRecord,
	onGoProduce,
	onGoAnalyze,
	jumpCardId,
	onJumpConsumed,
}: {
	onGoRecord?: (card: CockpitCard) => void;
	onGoProduce?: (card: CockpitCard) => void;
	/** 「关注」收藏的视频 → 去拉片(预填链接切到拉片自动拆解)。 */
	onGoAnalyze?: (url: string) => void;
	/** 全局检索「跳到选题」:切到选题视图并选中该卡(消费后由外层清空)。 */
	jumpCardId?: string | null;
	onJumpConsumed?: () => void;
}) {
	const t = useScopedT("editor");
	const [res, setRes] = useState<{
		ok: boolean;
		dir: string;
		day?: string;
		data?: CockpitData;
		error?: string;
	} | null>(null);
	const [tab, setTab] = useState<SubTab>("follow");
	const [prefs, setPrefs] = useState<CockpitPrefs>(() => loadPrefs());
	// 选题流转/回填/拉片注入卡现走主进程选题池(替代 localStorage),JobManager/AnalyzeService 可读写。
	const [pool, setPool] = useState<TopicPool | null>(null);
	const [showPref, setShowPref] = useState(false);
	const [selected, setSelected] = useState<Selection>(null);
	// 右侧详情/操作区可拖宽(中间选题列表相应缩放),宽度记住。
	const { width: detailWidth, onPointerDown: onDetailResize } = useResizableWidth(
		"cockpit-detail-w",
		300,
		240,
		640,
		"left",
	);

	const load = useCallback(async () => {
		if (!cockpit) return;
		const [today, poolRes] = await Promise.all([cockpit.today(), poolApi?.get()]);
		setRes(today);
		if (!poolRes) return;
		// 一次性迁移旧 localStorage 流转标记到选题池:主进程只补「池里还没有」的卡(不覆盖回填)、
		// 置 migratedLegacy 后不再迁(原子,避免重复迁移覆盖成片回填)。
		if (!poolRes.migratedLegacy && poolApi) {
			setPool(await poolApi.importLegacy(loadStatuses()));
		} else {
			setPool(poolRes);
		}
	}, []);

	useEffect(() => {
		load();
	}, [load]);

	// 池实时更新:成片回填(已成稿+产物)/拉片注入卡 在主进程发生时立即反映,无需手动刷新。
	useEffect(() => poolApi?.onUpdate(setPool), []);

	const updatePrefs = useCallback((next: CockpitPrefs) => {
		setPrefs(next);
		savePrefs(next);
	}, []);

	// 以当前显示的状态为基循环(不依赖可能滞后的 pool 闭包),主进程 setStatus 为权威。
	const cycleStatus = useCallback(async (card: CockpitCard, current: string) => {
		if (!poolApi) return;
		setPool(await poolApi.setStatus(card.id, nextStatus(current)));
	}, []);

	// 灌观点:把用户手写的观点存进选题池(vault 只读,故存增量层);流转时作为 opinion 进口播稿。
	const setCardNote = useCallback(async (id: string, note: string) => {
		if (!poolApi) return;
		setPool(await poolApi.setNote(id, note));
	}, []);

	// 选题待办(主线二:选题=可追踪项目)。增删改都走主进程选题池,实时回写。
	const addTodo = useCallback(async (id: string, text: string) => {
		if (!poolApi) return;
		setPool(await poolApi.addTodo(id, text));
	}, []);
	const toggleTodo = useCallback(async (id: string, todoId: string) => {
		if (!poolApi) return;
		setPool(await poolApi.toggleTodo(id, todoId));
	}, []);
	const removeTodo = useCallback(async (id: string, todoId: string) => {
		if (!poolApi) return;
		setPool(await poolApi.removeTodo(id, todoId));
	}, []);

	// 图文初稿弹窗:从选题(含我的观点)生成/编辑公众号图文,可一键送发布看板(主线一·图文线)。
	const [articleCard, setArticleCard] = useState<CockpitCard | null>(null);

	const openUrl = (url?: string) => {
		if (url) window.electronAPI?.openExternalUrl?.(url);
	};

	const data = res?.data;
	// 展示 = vault 当日卡(过偏好引擎过滤排序) ∪ 选题池注入卡。注入卡是用户经拉片明确喂入的,
	// 始终展示、不被偏好的「隐藏」过滤吞掉(否则它没有别处可见)。
	const cards = useMemo(() => {
		if (!data) return [];
		// 按 id 去重(vault 卡优先):正常注入卡 id 是 lp-* 不会撞,但万一同一拉片报告被注入后又
		// 进了 vault,同 id 两张会触发 React key 重复 + 两卡共享同一池增量。去重收口(review F4)。
		const merged = [...prefList<CockpitCard>(data.cards, prefs), ...injectedCards(pool)];
		const seen = new Set<string>();
		return merged.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
	}, [data, prefs, pool]);
	// 全量卡(vault 当日 + 拉片注入,不过偏好引擎、按 id 去重)。供「项目」聚合与跨面板跳转定位用。
	const allCards = useMemo<CockpitCard[]>(() => {
		if (!data) return [];
		const merged = [...data.cards, ...injectedCards(pool)];
		const seen = new Set<string>();
		return merged.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
	}, [data, pool]);
	// 「项目」视图:已跟进的选题(状态推进/有观点·草稿·产物·待办)聚合成可追踪项目。
	const projects = useMemo<TopicProject[]>(
		() => activeProjects(allCards, pool, FLOW),
		[allCards, pool],
	);
	// 「观点库」:把散在各选题里的「我的观点」聚成可检索复用的库(最近更新优先)。
	const opinions = useMemo(() => {
		if (!pool) return [];
		const titleById = new Map(allCards.map((c) => [c.id, c.title]));
		return Object.entries(pool.entries)
			.filter(([, e]) => e.note?.trim())
			.map(([id, e]) => ({
				id,
				title: titleById.get(id) ?? "",
				note: (e.note as string).trim(),
				updatedAt: e.updatedAt,
				canJump: titleById.has(id),
			}))
			.sort((a, b) => b.updatedAt - a.updatedAt);
	}, [pool, allCards]);
	const radar = useMemo(
		() => (data ? prefList<CockpitFeedItem>(data.radar, prefs) : []),
		[data, prefs],
	);
	const hot = useMemo(
		() => (data ? prefList<CockpitFeedItem>(data.hot, prefs) : []),
		[data, prefs],
	);
	const mp = useMemo(() => (data ? prefList<CockpitFeedItem>(data.mp, prefs) : []), [data, prefs]);

	const feedList = tab === "sources" ? radar : tab === "hot" ? hot : mp;

	// 切视图/数据变 → 默认选中当前列表首项(右栏不空);已选项仍在则保留(用最新卡对象),
	// 避免池实时更新把用户的选中跳回首项。
	useEffect(() => {
		if (tab === "topics" || tab === "projects") {
			const list = tab === "projects" ? projects.map((p) => p.card) : cards;
			setSelected((prev) => {
				if (prev?.kind === "card") {
					// 保留已选卡:列表内取最新对象;被偏好隐藏的卡(如检索跳转来的)回退到全量卡,不丢选中。
					const fresh =
						list.find((c) => c.id === prev.card.id) ?? allCards.find((c) => c.id === prev.card.id);
					if (fresh) return { kind: "card", card: fresh };
				}
				return list.length ? { kind: "card", card: list[0] } : null;
			});
		} else if (tab === "follow" || tab === "opinions") {
			// FollowPanel / 观点库 自带列表,不动右栏选中。
		} else {
			setSelected((prev) =>
				prev?.kind === "feed" && feedList.includes(prev.item)
					? prev
					: feedList.length
						? { kind: "feed", item: feedList[0] }
						: null,
			);
		}
	}, [tab, cards, feedList, projects, allCards]);

	// 全局检索「跳到选题」:切到选题视图并选中该卡(被偏好隐藏的卡也能选中,见上方选中保留逻辑)。
	useEffect(() => {
		if (!jumpCardId || allCards.length === 0) return;
		const card = allCards.find((c) => c.id === jumpCardId);
		if (card) {
			setTab("topics");
			setSelected({ kind: "card", card });
		}
		onJumpConsumed?.();
	}, [jumpCardId, allCards, onJumpConsumed]);

	const counts: Record<SubTab, number> = {
		topics: cards.length,
		projects: projects.length,
		opinions: opinions.length,
		sources: radar.length,
		hot: hot.length,
		peers: mp.length,
		follow: 0,
	};
	const navs: Array<{ id: SubTab; label: string; icon: React.ReactNode }> = [
		{ id: "follow", label: t("cockpit.tabs.follow"), icon: <Bookmark className="h-4 w-4" /> },
		{ id: "topics", label: t("cockpit.tabs.topics"), icon: <Sparkles className="h-4 w-4" /> },
		{ id: "projects", label: t("cockpit.tabs.projects"), icon: <ListTodo className="h-4 w-4" /> },
		{ id: "opinions", label: t("cockpit.tabs.opinions"), icon: <Quote className="h-4 w-4" /> },
		{ id: "sources", label: t("cockpit.tabs.sources"), icon: <Video className="h-4 w-4" /> },
		{ id: "hot", label: t("cockpit.tabs.hot"), icon: <Flame className="h-4 w-4" /> },
		{ id: "peers", label: t("cockpit.tabs.peers"), icon: <ExternalLink className="h-4 w-4" /> },
	];

	return (
		<div className="flex h-full w-full flex-col overflow-hidden bg-[#0A0C0E]">
			{/* 头部 */}
			<div className="flex shrink-0 items-center gap-3 border-b border-white/[0.07] bg-[#0C0F12] px-5 py-2.5">
				<span className="text-[13px] font-semibold text-slate-100">{t("cockpit.title")}</span>
				{res?.day && (
					<span className="rounded-full bg-[#34B27B]/15 px-2 py-0.5 text-[11px] font-medium text-[#3DC489]">
						{res.day}
					</span>
				)}
				<span className="min-w-0 flex-1 truncate text-[11px] text-slate-500">
					{prefSummary(prefs)}
				</span>
				<button
					type="button"
					onClick={() => setShowPref((v) => !v)}
					className={cn(
						"flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11.5px] font-medium transition-colors",
						showPref
							? "border-[#34B27B]/40 bg-[#34B27B]/[0.12] text-[#3DC489]"
							: "border-white/[0.1] bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]",
					)}
				>
					<Settings2 className="h-3.5 w-3.5" />
					{t("cockpit.prefs")}
				</button>
				<button
					type="button"
					onClick={load}
					className="rounded-md p-1 text-slate-500 hover:bg-white/[0.06] hover:text-slate-300"
					title={t("cockpit.refresh")}
				>
					<RefreshCw className="h-3.5 w-3.5" />
				</button>
			</div>

			{showPref && <PrefPanel prefs={prefs} onChange={updatePrefs} t={t} />}

			{!res ? (
				<p className="mt-8 text-center text-[12px] text-slate-600">…</p>
			) : !res.ok ? (
				<div className="mx-auto mt-10 max-w-lg space-y-3 text-center">
					<AlertTriangle className="mx-auto h-8 w-8 text-amber-400" />
					<h2 className="text-[14px] font-semibold text-slate-100">{t("cockpit.errorTitle")}</h2>
					<p className="text-[12px] text-red-300">{res.error}</p>
					<p className="font-mono text-[11px] text-slate-600">
						{t("cockpit.dir")}: {res.dir}
					</p>
					<p className="text-[11px] leading-relaxed text-slate-500">{t("cockpit.dirHint")}</p>
					{settingsApi && (
						<button
							type="button"
							onClick={async () => {
								const r = await settingsApi.pickCockpit();
								if (r?.ok) load();
							}}
							className="mx-auto flex items-center gap-1.5 rounded-lg border border-[#34B27B]/40 bg-[#34B27B]/[0.12] px-3 py-1.5 text-[11.5px] font-medium text-[#3DC489] transition-colors hover:bg-[#34B27B]/[0.2]"
						>
							<FolderOpen className="h-3.5 w-3.5" />
							{t("settings.choose")}
						</button>
					)}
				</div>
			) : (
				<div className="flex min-h-0 flex-1">
					{/* 左:视图导航 */}
					<nav className="flex w-[148px] shrink-0 flex-col gap-1 border-r border-white/[0.07] bg-[#0B0D10] p-2">
						{navs.map((nv) => (
							<button
								key={nv.id}
								type="button"
								onClick={() => setTab(nv.id)}
								className={cn(
									"flex items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] font-medium transition-colors",
									tab === nv.id
										? "bg-[#34B27B]/[0.12] text-[#3DC489]"
										: "text-slate-400 hover:bg-white/[0.05] hover:text-slate-200",
								)}
							>
								{nv.icon}
								<span className="min-w-0 flex-1 truncate text-left">{nv.label}</span>
								<span className="text-[10px] text-slate-500">{counts[nv.id]}</span>
							</button>
						))}
					</nav>

					{tab === "follow" ? (
						<FollowPanel onGoAnalyze={onGoAnalyze} />
					) : tab === "opinions" ? (
						<OpinionsView
							opinions={opinions}
							t={t}
							onJump={(id) => {
								const card = allCards.find((c) => c.id === id);
								if (card) {
									setTab("topics");
									setSelected({ kind: "card", card });
								}
							}}
						/>
					) : (
						<>
							{/* 中:卡片网格 / 项目列表 / 信源列表 */}
							<div className="min-w-0 flex-1 overflow-auto p-3 custom-scrollbar">
								{tab === "topics" ? (
									<div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
										{cards.map((c) => {
											const st = resolveStatus(c, pool, FLOW);
											return (
												<TopicCardCompact
													key={c.id}
													card={c}
													status={st}
													injectedSource={injectedSourceFor(c.id, pool)}
													selected={selected?.kind === "card" && selected.card.id === c.id}
													onSelect={() => setSelected({ kind: "card", card: c })}
													t={t}
												/>
											);
										})}
									</div>
								) : tab === "projects" ? (
									projects.length === 0 ? (
										<p className="mt-10 px-4 text-center text-[11.5px] leading-relaxed text-slate-600">
											{t("cockpit.project.empty")}
										</p>
									) : (
										<div className="space-y-2">
											{projects.map((p) => (
												<ProjectRow
													key={p.id}
													project={p}
													selected={selected?.kind === "card" && selected.card.id === p.id}
													onSelect={() => setSelected({ kind: "card", card: p.card })}
													t={t}
												/>
											))}
										</div>
									)
								) : (
									<div className="space-y-1.5">
										{feedList.map((it, i) => (
											<FeedRowCompact
												key={`${tab}-${i}-${it.title}`}
												item={it}
												selected={selected?.kind === "feed" && selected.item === it}
												onSelect={() => setSelected({ kind: "feed", item: it })}
												t={t}
											/>
										))}
									</div>
								)}
							</div>

							{/* 可拖拽分隔条:调中间列表 ↔ 右详情的宽度 */}
							<div
								role="separator"
								aria-orientation="vertical"
								aria-label={t("cockpit.resizeDetail")}
								onPointerDown={onDetailResize}
								className="w-1 shrink-0 cursor-col-resize bg-white/[0.05] transition-colors hover:bg-[#34B27B]/40"
							/>

							{/* 右:详情 + 媒体预览(常驻 —— 漏斗动作只在这里,不能在窄窗口隐藏掉) */}
							<div
								style={{ width: detailWidth }}
								className="shrink-0 overflow-auto border-l border-white/[0.07] bg-[#0B0D10]"
							>
								{selected?.kind === "card" ? (
									<TopicDetail
										key={selected.card.id}
										card={selected.card}
										status={resolveStatus(selected.card, pool, FLOW)}
										artifacts={artifactsFor(selected.card.id, pool)}
										injectedSource={injectedSourceFor(selected.card.id, pool)}
										note={resolveNote(selected.card.id, pool)}
										todos={resolveTodos(selected.card.id, pool)}
										t={t}
										onGoRecord={onGoRecord}
										onGoProduce={onGoProduce}
										onOpen={openUrl}
										onCycleStatus={(st) => cycleStatus(selected.card, st)}
										onSetNote={(n) => setCardNote(selected.card.id, n)}
										onAddTodo={(text) => addTodo(selected.card.id, text)}
										onToggleTodo={(tid) => toggleTodo(selected.card.id, tid)}
										onRemoveTodo={(tid) => removeTodo(selected.card.id, tid)}
										hasDraft={!!resolveDraft(selected.card.id, pool)}
										onArticle={(c) => setArticleCard(c)}
									/>
								) : selected?.kind === "feed" ? (
									<FeedDetail item={selected.item} onOpen={openUrl} t={t} />
								) : (
									<p className="mt-10 px-4 text-center text-[11.5px] text-slate-600">
										{t("cockpit.detailEmpty")}
									</p>
								)}
							</div>
						</>
					)}
				</div>
			)}

			{articleCard && (
				<ArticleModal
					card={articleCard}
					initialDraft={resolveDraft(articleCard.id, pool)}
					t={t}
					onClose={() => setArticleCard(null)}
					onPoolChange={setPool}
				/>
			)}
		</div>
	);
}

type T = (key: string, vars?: Record<string, string | number>) => string;

function stateChipClass(st: PrefState): string {
	if (st === "boost") return "border-[#34B27B]/40 bg-[#34B27B]/[0.12] text-[#3DC489]";
	if (st === "hide") return "border-red-500/40 bg-red-500/[0.1] text-red-300 line-through";
	return "border-white/[0.1] bg-white/[0.03] text-slate-400";
}

function Chip({
	children,
	tone = "neutral",
}: {
	children: React.ReactNode;
	tone?: "neutral" | "green" | "amber";
}) {
	return (
		<span
			className={cn(
				"rounded-full px-2 py-0.5 text-[10px] font-medium",
				tone === "green"
					? "bg-[#34B27B]/15 text-[#3DC489]"
					: tone === "amber"
						? "bg-amber-500/15 text-amber-300"
						: "bg-white/[0.06] text-slate-300",
			)}
		>
			{children}
		</span>
	);
}

// ───────────────────────── 中栏:紧凑卡片 / 信源行 ─────────────────────────

function TopicCardCompact({
	card,
	status,
	injectedSource,
	selected,
	onSelect,
	t,
}: {
	card: CockpitCard;
	status: string;
	injectedSource?: string;
	selected: boolean;
	onSelect: () => void;
	t: T;
}) {
	const isSeed = card.kind === "seed";
	return (
		<button
			type="button"
			onClick={onSelect}
			className={cn(
				"flex w-full flex-col gap-1.5 rounded-lg border p-2.5 text-left transition-colors",
				selected
					? "border-[#34B27B]/50 bg-[#34B27B]/[0.08]"
					: isSeed
						? "border-amber-500/40 bg-[#15181C] hover:bg-white/[0.04]"
						: "border-white/[0.07] bg-[#15181C] hover:bg-white/[0.04]",
			)}
		>
			<div className="flex flex-wrap items-center gap-1">
				{isSeed && <Chip tone="amber">★ {t("cockpit.seed")}</Chip>}
				{injectedSource && <Chip tone="green">🎬</Chip>}
				{card.topic && !isSeed && <Chip tone="green">{card.topic}</Chip>}
				{typeof card.heat === "number" && card.heat > 0 && <Chip tone="amber">🔥 {card.heat}</Chip>}
				<span className="flex-1" />
				<span className="rounded-full border border-white/[0.12] bg-white/[0.04] px-1.5 py-0.5 text-[9.5px] font-medium text-slate-300">
					{status}
				</span>
			</div>
			<h3 className="line-clamp-2 text-[12.5px] font-semibold leading-snug text-slate-100">
				{card.title}
			</h3>
			{card.angle && (
				<p className="line-clamp-1 text-[11px] leading-relaxed text-slate-500">{card.angle}</p>
			)}
		</button>
	);
}

function FeedRowCompact({
	item,
	selected,
	onSelect,
	t,
}: {
	item: CockpitFeedItem;
	selected: boolean;
	onSelect: () => void;
	t: T;
}) {
	return (
		<button
			type="button"
			onClick={onSelect}
			className={cn(
				"flex w-full flex-col gap-1 rounded-lg border p-2.5 text-left transition-colors",
				selected
					? "border-[#34B27B]/50 bg-[#34B27B]/[0.08]"
					: "border-white/[0.06] bg-[#15181C] hover:bg-white/[0.04]",
			)}
		>
			<div className="flex flex-wrap items-center gap-1">
				{(item.title_zh || item.topic) && <Chip tone="green">{item.title_zh || item.topic}</Chip>}
				{item.tier && <Chip>{item.tier}</Chip>}
				{item.src && <span className="text-[10px] text-slate-500">{item.src}</span>}
			</div>
			<h4 className="line-clamp-2 text-[12px] font-medium leading-snug text-slate-200">
				{item.title}
			</h4>
			{item.when && <span className="text-[10px] text-slate-600">{item.when}</span>}
			<span className="sr-only">{t("cockpit.open")}</span>
		</button>
	);
}

// ───────────────────────── 右栏:详情 + 媒体预览 ─────────────────────────

function DetailField({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div>
			<div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
				{label}
			</div>
			<div className="text-[11.5px] leading-relaxed text-slate-300">{children}</div>
		</div>
	);
}

function TopicDetail({
	card,
	status,
	artifacts,
	injectedSource,
	t,
	onGoRecord,
	onGoProduce,
	onOpen,
	onCycleStatus,
	note,
	onSetNote,
	todos,
	onAddTodo,
	onToggleTodo,
	onRemoveTodo,
	hasDraft,
	onArticle,
}: {
	card: CockpitCard;
	status: string;
	artifacts: PoolArtifact[];
	injectedSource?: string;
	t: T;
	onGoRecord?: (card: CockpitCard) => void;
	onGoProduce?: (card: CockpitCard) => void;
	onOpen: (url?: string) => void;
	onCycleStatus: (current: string) => void;
	note: string;
	onSetNote: (note: string) => void;
	todos: PoolTodo[];
	onAddTodo: (text: string) => void;
	onToggleTodo: (todoId: string) => void;
	onRemoveTodo: (todoId: string) => void;
	hasDraft: boolean;
	onArticle: (card: CockpitCard) => void;
}) {
	const isSeed = card.kind === "seed";
	// 我的观点草稿:本地编辑,失焦才落盘(避免逐字 IPC)。TopicDetail 按 card.id keyed,切卡自动重置。
	const [noteDraft, setNoteDraft] = useState(note);
	// 去录屏/去成片时把手写观点作为 opinion 灌进口播稿(composeTopicScript 读 card.opinion)。
	const enriched: CockpitCard = noteDraft.trim() ? { ...card, opinion: noteDraft.trim() } : card;
	return (
		<div className="flex flex-col gap-3 p-4">
			<div className="flex flex-wrap items-center gap-1.5">
				{isSeed && <Chip tone="amber">★ {t("cockpit.seed")}</Chip>}
				{injectedSource && <Chip tone="green">🎬 {injectedSource}</Chip>}
				{card.topic && !isSeed && <Chip tone="green">{card.topic}</Chip>}
				{card.score !== undefined && card.score !== "" && <Chip>★ {String(card.score)}</Chip>}
				{typeof card.heat === "number" && card.heat > 0 && <Chip tone="amber">🔥 {card.heat}</Chip>}
				{card.concept && <Chip>{t("cockpit.concept")}</Chip>}
				<span className="flex-1" />
				<button
					type="button"
					onClick={() => onCycleStatus(status)}
					title={t("cockpit.cycleStatus")}
					className="rounded-full border border-white/[0.12] bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium text-slate-300 transition-colors hover:bg-white/[0.1]"
				>
					{status}
				</button>
			</div>

			<h3 className="text-[14px] font-semibold leading-snug text-slate-100">{card.title}</h3>
			{card.angle && <p className="text-[12px] leading-relaxed text-slate-400">{card.angle}</p>}

			{card.body && card.body.length > 0 && (
				<ul className="space-y-1">
					{card.body.map((b) => (
						<li key={b} className="flex gap-1.5 text-[11.5px] leading-relaxed text-slate-400">
							<span className="text-[#3DC489]">·</span>
							<span className="min-w-0">{b}</span>
						</li>
					))}
				</ul>
			)}

			{card.opinion && (
				<div className="rounded-lg border-l-2 border-[#34B27B]/60 bg-[#34B27B]/[0.06] px-2.5 py-1.5">
					<span className="text-[10px] font-semibold uppercase tracking-wide text-[#3DC489]">
						{t("cockpit.opinion")}
					</span>
					<p className="mt-0.5 text-[11.5px] leading-relaxed text-slate-300">{card.opinion}</p>
				</div>
			)}

			{/* 我的观点(灌观点):写进本地选题池,去录屏/去成片时灌进口播稿。种子卡尤其在这里写自己的看法。 */}
			<div className="rounded-lg border border-[#34B27B]/30 bg-[#34B27B]/[0.05] px-2.5 py-2">
				<span className="text-[10px] font-semibold uppercase tracking-wide text-[#3DC489]">
					✍ {t("cockpit.myOpinion")}
				</span>
				<textarea
					value={noteDraft}
					onChange={(e) => setNoteDraft(e.target.value)}
					onBlur={() => {
						if (noteDraft !== note) onSetNote(noteDraft);
					}}
					rows={3}
					placeholder={t("cockpit.myOpinionPlaceholder")}
					className="mt-1 w-full resize-none rounded-md border border-white/[0.1] bg-[#15181C] px-2.5 py-1.5 text-[11.5px] leading-relaxed text-slate-200 outline-none placeholder:text-slate-600 focus:border-[#34B27B]/50"
				/>
			</div>
			{card.bear && (
				<div className="rounded-lg border-l-2 border-amber-500/60 bg-amber-500/[0.06] px-2.5 py-1.5">
					<span className="text-[10px] font-semibold uppercase tracking-wide text-amber-300">
						{t("cockpit.bear")}
					</span>
					<p className="mt-0.5 text-[11.5px] leading-relaxed text-slate-300">{card.bear}</p>
				</div>
			)}
			{card.why && <DetailField label={t("cockpit.why")}>{card.why}</DetailField>}
			{card.fit && <DetailField label={t("cockpit.fit")}>{card.fit}</DetailField>}

			{card.hooks && card.hooks.length > 0 && (
				<div className="rounded-lg bg-black/20 p-2">
					<div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
						{t("cockpit.hooks")}
					</div>
					<ul className="space-y-0.5">
						{card.hooks.map((h) => (
							<li key={h} className="text-[11px] leading-relaxed text-slate-400">
								{h}
							</li>
						))}
					</ul>
				</div>
			)}

			<MediaPreview media={card.media} onOpen={onOpen} t={t} />

			{artifacts.length > 0 && (
				<div className="flex flex-wrap gap-1.5">
					{artifacts.map((a) => (
						<button
							key={a.path}
							type="button"
							onClick={() => window.electronAPI?.library?.open(a.path)}
							title={a.path}
							className="flex items-center gap-1 rounded-md bg-[#34B27B]/[0.12] px-2 py-0.5 text-[10.5px] font-medium text-[#3DC489] hover:bg-[#34B27B]/[0.2]"
						>
							<Clapperboard className="h-3 w-3" />
							{a.kind === "film" ? t("cockpit.artifactFilm") : a.path.split("/").pop()}
						</button>
					))}
				</div>
			)}

			{/* 项目待办(主线二):把选题当可追踪项目,列下一步行动并勾选推进。 */}
			<TodoSection
				todos={todos}
				onAdd={onAddTodo}
				onToggle={onToggleTodo}
				onRemove={onRemoveTodo}
				t={t}
			/>

			<div className="flex flex-wrap items-center gap-2 pt-1">
				<button
					type="button"
					onClick={onGoRecord ? () => onGoRecord(enriched) : undefined}
					disabled={!onGoRecord}
					title={t("cockpit.goRecordHint")}
					className="flex items-center gap-1.5 rounded-lg bg-[#34B27B] px-3 py-1.5 text-[11.5px] font-semibold text-[#06140d] transition-colors hover:bg-[#34B27B]/90 disabled:opacity-40"
				>
					<Video className="h-3.5 w-3.5" />
					{t("cockpit.goRecord")}
				</button>
				<button
					type="button"
					onClick={onGoProduce ? () => onGoProduce(enriched) : undefined}
					disabled={!onGoProduce}
					title={t("cockpit.goProduceHint")}
					className="flex items-center gap-1.5 rounded-lg border border-[#34B27B]/40 bg-[#34B27B]/[0.12] px-2.5 py-1.5 text-[11.5px] font-medium text-[#3DC489] transition-colors hover:bg-[#34B27B]/[0.2] disabled:opacity-40"
				>
					<Clapperboard className="h-3.5 w-3.5" />
					{t("cockpit.goProduce")}
				</button>
				<button
					type="button"
					onClick={() => onArticle(enriched)}
					title={t("cockpit.genArticleHint")}
					className="flex items-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/[0.1] px-2.5 py-1.5 text-[11.5px] font-medium text-sky-300 transition-colors hover:bg-sky-500/[0.18]"
				>
					<Newspaper className="h-3.5 w-3.5" />
					{hasDraft ? t("cockpit.editArticle") : t("cockpit.genArticle")}
				</button>
				{card.url && (
					<button
						type="button"
						onClick={() => onOpen(card.url)}
						className="flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.04] px-2.5 py-1.5 text-[11.5px] font-medium text-slate-300 transition-colors hover:bg-white/[0.08]"
					>
						<ExternalLink className="h-3.5 w-3.5" />
						{t("cockpit.open")}
					</button>
				)}
			</div>
		</div>
	);
}

/** 选题待办清单(主线二):勾选/添加/删除下一步行动。本地输入态,提交后清空。 */
function TodoSection({
	todos,
	onAdd,
	onToggle,
	onRemove,
	t,
}: {
	todos: PoolTodo[];
	onAdd: (text: string) => void;
	onToggle: (todoId: string) => void;
	onRemove: (todoId: string) => void;
	t: T;
}) {
	const [text, setText] = useState("");
	const doneCount = todos.filter((td) => td.done).length;
	const submit = () => {
		const body = text.trim();
		if (!body) return;
		onAdd(body);
		setText("");
	};
	return (
		<div className="rounded-lg border border-white/[0.08] bg-black/20 p-2.5">
			<div className="mb-1.5 flex items-center justify-between">
				<span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
					<ListTodo className="h-3 w-3" />
					{t("cockpit.todo.title")}
				</span>
				{todos.length > 0 && (
					<span className="text-[10px] tabular-nums text-slate-500">
						{doneCount}/{todos.length}
					</span>
				)}
			</div>
			{todos.length > 0 && (
				<ul className="mb-1.5 space-y-0.5">
					{todos.map((td) => (
						<li key={td.id} className="group flex items-center gap-1.5">
							<button
								type="button"
								onClick={() => onToggle(td.id)}
								className="shrink-0 text-slate-500 transition-colors hover:text-[#3DC489]"
								title={t("cockpit.todo.toggle")}
							>
								{td.done ? (
									<CheckSquare className="h-3.5 w-3.5 text-[#3DC489]" />
								) : (
									<Square className="h-3.5 w-3.5" />
								)}
							</button>
							<span
								className={cn(
									"min-w-0 flex-1 break-words text-[11.5px] leading-snug",
									td.done ? "text-slate-600 line-through" : "text-slate-300",
								)}
							>
								{td.text}
							</span>
							<button
								type="button"
								onClick={() => onRemove(td.id)}
								className="shrink-0 text-slate-600 opacity-0 transition-opacity hover:text-red-300 group-hover:opacity-100"
								title={t("cockpit.todo.remove")}
							>
								<X className="h-3 w-3" />
							</button>
						</li>
					))}
				</ul>
			)}
			<div className="flex items-center gap-1.5">
				<input
					value={text}
					onChange={(e) => setText(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							e.preventDefault();
							submit();
						}
					}}
					placeholder={t("cockpit.todo.placeholder")}
					className="min-w-0 flex-1 rounded-md border border-white/[0.1] bg-[#15181C] px-2 py-1 text-[11.5px] text-slate-200 outline-none placeholder:text-slate-600 focus:border-[#34B27B]/40"
				/>
				<button
					type="button"
					onClick={submit}
					disabled={!text.trim()}
					className="flex shrink-0 items-center gap-1 rounded-md border border-[#34B27B]/40 bg-[#34B27B]/[0.12] px-2 py-1 text-[11px] font-medium text-[#3DC489] transition-colors hover:bg-[#34B27B]/[0.2] disabled:opacity-40"
				>
					<Plus className="h-3 w-3" />
					{t("cockpit.todo.add")}
				</button>
			</div>
		</div>
	);
}

/** 「项目」视图行(主线二):一张已跟进选题的项目摘要 —— 状态 / 待办进度 / 下一步 / 观点·产物标记。 */
function ProjectRow({
	project,
	selected,
	onSelect,
	t,
}: {
	project: TopicProject;
	selected: boolean;
	onSelect: () => void;
	t: T;
}) {
	const { status, title, topic, todoTotal, todoDone, pendingTodos, artifactCount, note, hasDraft } =
		project;
	return (
		<button
			type="button"
			onClick={onSelect}
			className={cn(
				"flex w-full flex-col gap-1.5 rounded-lg border p-2.5 text-left transition-colors",
				selected
					? "border-[#34B27B]/50 bg-[#34B27B]/[0.08]"
					: "border-white/[0.07] bg-[#15181C] hover:bg-white/[0.04]",
			)}
		>
			<div className="flex flex-wrap items-center gap-1">
				{topic && <Chip tone="green">{topic}</Chip>}
				<span className="rounded-full border border-white/[0.12] bg-white/[0.04] px-1.5 py-0.5 text-[9.5px] font-medium text-slate-300">
					{status}
				</span>
				<span className="flex-1" />
				{todoTotal > 0 && (
					<span
						className={cn(
							"flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9.5px] font-medium tabular-nums",
							todoDone === todoTotal
								? "bg-[#34B27B]/15 text-[#3DC489]"
								: "bg-amber-500/15 text-amber-300",
						)}
					>
						<ListTodo className="h-3 w-3" />
						{todoDone}/{todoTotal}
					</span>
				)}
			</div>
			<h3 className="line-clamp-2 text-[12.5px] font-semibold leading-snug text-slate-100">
				{title}
			</h3>
			{pendingTodos.length > 0 && (
				<p className="line-clamp-1 text-[11px] leading-relaxed text-amber-300/80">
					→ {pendingTodos[0].text}
				</p>
			)}
			<div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
				{note.trim() && <span>✍ {t("cockpit.project.hasOpinion")}</span>}
				{hasDraft && <span>📝 {t("cockpit.project.hasDraft")}</span>}
				{artifactCount > 0 && (
					<span>🎬 {t("cockpit.project.artifactN", { n: artifactCount })}</span>
				)}
			</div>
		</button>
	);
}

/** 我的观点库(主线三):把散在各选题的「我的观点」聚成一处,可检索、复制复用、跳回选题。 */
function OpinionsView({
	opinions,
	t,
	onJump,
}: {
	opinions: { id: string; title: string; note: string; updatedAt: number; canJump: boolean }[];
	t: T;
	onJump: (cardId: string) => void;
}) {
	const [q, setQ] = useState("");
	const [copiedId, setCopiedId] = useState<string | null>(null);
	const filtered = useMemo(() => {
		const k = q.trim().toLowerCase();
		if (!k) return opinions;
		return opinions.filter(
			(o) => o.note.toLowerCase().includes(k) || o.title.toLowerCase().includes(k),
		);
	}, [opinions, q]);
	const copy = (o: { id: string; note: string }) => {
		navigator.clipboard?.writeText(o.note);
		setCopiedId(o.id);
		setTimeout(() => setCopiedId((id) => (id === o.id ? null : id)), 1500);
	};
	return (
		<div className="flex min-w-0 flex-1 flex-col overflow-hidden">
			<div className="flex shrink-0 items-center gap-2 border-b border-white/[0.07] px-4 py-2.5">
				<Quote className="h-3.5 w-3.5 text-sky-300" />
				<span className="text-[12px] font-medium text-slate-300">
					{t("cockpit.opinions.title")}
				</span>
				<span className="text-[10px] text-slate-600">{opinions.length}</span>
				<span className="flex-1" />
				<input
					value={q}
					onChange={(e) => setQ(e.target.value)}
					placeholder={t("cockpit.opinions.search")}
					className="w-48 rounded-md border border-white/[0.1] bg-[#15181C] px-2 py-1 text-[11.5px] text-slate-200 outline-none placeholder:text-slate-600 focus:border-[#34B27B]/40"
				/>
			</div>
			<div className="min-h-0 flex-1 overflow-auto p-3 custom-scrollbar">
				{opinions.length === 0 ? (
					<p className="mt-10 px-4 text-center text-[11.5px] leading-relaxed text-slate-600">
						{t("cockpit.opinions.empty")}
					</p>
				) : filtered.length === 0 ? (
					<p className="mt-10 text-center text-[11.5px] text-slate-600">
						{t("cockpit.opinions.noMatch")}
					</p>
				) : (
					<div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
						{filtered.map((o) => (
							<div
								key={o.id}
								className="flex flex-col gap-1.5 rounded-lg border border-white/[0.07] bg-[#15181C] p-3"
							>
								<div className="flex items-center gap-1.5">
									<span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold text-slate-200">
										{o.title || t("cockpit.opinions.untitled")}
									</span>
									<button
										type="button"
										onClick={() => copy(o)}
										title={t("cockpit.opinions.copy")}
										className="shrink-0 rounded-md p-1 text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-slate-200"
									>
										<Copy className="h-3 w-3" />
									</button>
									{o.canJump && (
										<button
											type="button"
											onClick={() => onJump(o.id)}
											title={t("cockpit.opinions.jump")}
											className="shrink-0 rounded-md p-1 text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-[#3DC489]"
										>
											<ExternalLink className="h-3 w-3" />
										</button>
									)}
								</div>
								<p className="whitespace-pre-wrap text-[11.5px] leading-relaxed text-slate-400">
									{o.note}
								</p>
								{copiedId === o.id && (
									<span className="text-[10px] text-[#3DC489]">{t("cockpit.opinions.copied")}</span>
								)}
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}

function FeedDetail({
	item,
	onOpen,
	t,
}: {
	item: CockpitFeedItem;
	onOpen: (url?: string) => void;
	t: T;
}) {
	return (
		<div className="flex flex-col gap-3 p-4">
			<div className="flex flex-wrap items-center gap-1.5">
				{(item.title_zh || item.topic) && <Chip tone="green">{item.title_zh || item.topic}</Chip>}
				{item.tier && <Chip>{item.tier}</Chip>}
				{item.src && <span className="text-[10.5px] text-slate-500">{item.src}</span>}
				{item.when && <span className="text-[10.5px] text-slate-600">· {item.when}</span>}
			</div>
			<h3 className="text-[13.5px] font-semibold leading-snug text-slate-100">{item.title}</h3>
			{/* body 经 cleanFeedBody 过滤 vault 里的抓取噪音/套话,只留要点;全是噪音时整块隐藏。 */}
			{cleanFeedBody(item.body).map((b) => (
				<p key={b} className="text-[11.5px] leading-relaxed text-slate-400">
					{b}
				</p>
			))}
			<MediaPreview media={item.media} onOpen={onOpen} t={t} />
			{item.url && (
				<button
					type="button"
					onClick={() => onOpen(item.url)}
					className="flex w-fit items-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.04] px-2.5 py-1.5 text-[11.5px] font-medium text-slate-300 transition-colors hover:bg-white/[0.08]"
				>
					<ExternalLink className="h-3.5 w-3.5" />
					{t("cockpit.open")}
				</button>
			)}
		</div>
	);
}

/** 媒体预览(§5.1):卡封面图 + related 里按后缀判类 —— 图片缩略图(点开灯箱)、视频内联播、其余链接。 */
function MediaPreview({
	media,
	onOpen,
	t,
}: {
	media?: CockpitMedia;
	onOpen: (url?: string) => void;
	t: T;
}) {
	const [lightbox, setLightbox] = useState<string | null>(null);
	// 加载失败的图整张缩略图移除(vault image 可能空/失效),避免留下死的可点空框。
	const [failed, setFailed] = useState<Set<string>>(() => new Set());
	const related = media?.related ?? [];
	const allImages: string[] = [];
	if (media?.image) allImages.push(media.image);
	const videos: string[] = [];
	const links: { url: string; label: string }[] = [];
	for (const r of related) {
		if (!r.url) continue;
		const k = mediaKind(r.url);
		if (k === "image") allImages.push(r.url);
		else if (k === "video") videos.push(r.url);
		else links.push({ url: r.url, label: r.t || r.type || "link" });
	}
	const images = allImages.filter((src) => !failed.has(src));
	const playableVideos = videos.filter((src) => !failed.has(src));

	// 灯箱:Esc 关闭(点背景也关)。
	useEffect(() => {
		if (!lightbox) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setLightbox(null);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [lightbox]);

	if (images.length === 0 && playableVideos.length === 0 && links.length === 0) return null;

	return (
		<div className="space-y-2">
			{images.length > 0 && (
				<div className="grid grid-cols-3 gap-1.5">
					{images.map((src) => (
						<button
							key={src}
							type="button"
							onClick={() => setLightbox(src)}
							className="aspect-video overflow-hidden rounded-md border border-white/[0.08] bg-black/30"
						>
							<img
								src={src}
								alt=""
								loading="lazy"
								className="h-full w-full object-cover"
								onError={() => setFailed((f) => new Set(f).add(src))}
							/>
						</button>
					))}
				</div>
			)}
			{playableVideos.map((src) => (
				<video
					key={src}
					src={src}
					controls
					preload="metadata"
					className="w-full rounded-md border border-white/[0.08] bg-black"
					onError={() => setFailed((f) => new Set(f).add(src))}
				>
					<track kind="captions" />
				</video>
			))}
			{links.length > 0 && (
				<div className="flex flex-wrap gap-1.5">
					{links.map((l) => (
						<button
							key={l.url}
							type="button"
							onClick={() => onOpen(l.url)}
							className="flex items-center gap-1 rounded-md bg-white/[0.04] px-2 py-0.5 text-[10.5px] text-slate-400 hover:bg-white/[0.08]"
						>
							<ExternalLink className="h-3 w-3" />
							{l.label}
						</button>
					))}
				</div>
			)}

			{lightbox && (
				<button
					type="button"
					aria-label={t("cockpit.close")}
					onClick={() => setLightbox(null)}
					className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/85 p-8"
				>
					<img src={lightbox} alt="" className="max-h-full max-w-full rounded-lg object-contain" />
					<span className="absolute right-5 top-5 rounded-full bg-white/10 p-1.5 text-white/80">
						<X className="h-4 w-4" />
					</span>
				</button>
			)}
		</div>
	);
}

// ───────────────────────── 偏好面板(不变) ─────────────────────────

function PrefPanel({
	prefs,
	onChange,
	t,
}: {
	prefs: CockpitPrefs;
	onChange: (p: CockpitPrefs) => void;
	t: T;
}) {
	return (
		<div className="max-h-[42%] shrink-0 space-y-3 overflow-auto border-b border-white/[0.07] bg-[#0C0F12] p-4 custom-scrollbar">
			<Section label="Preset">
				<div className="flex flex-wrap gap-1.5">
					{Object.entries(PREF_PRESETS).map(([k, v]) => (
						<button
							key={k}
							type="button"
							onClick={() => onChange(setPreset(k))}
							className={cn(
								"rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors",
								prefs.preset === k
									? "border-[#34B27B]/40 bg-[#34B27B]/[0.12] text-[#3DC489]"
									: "border-white/[0.1] bg-white/[0.03] text-slate-300 hover:bg-white/[0.08]",
							)}
						>
							{v.label}
						</button>
					))}
				</div>
			</Section>
			<Section label="Topics">
				<div className="flex flex-wrap gap-1.5">
					{PREF_GROUPS.map((g) => {
						const st = prefs.groups[g.key] || "normal";
						return (
							<button
								key={g.key}
								type="button"
								onClick={() => onChange(cycleGroup(prefs, g.key))}
								className={cn(
									"rounded-md border px-2 py-1 text-[10.5px] transition-colors",
									stateChipClass(st),
								)}
							>
								{g.label}
								<span className="ml-1 opacity-70">{prefStateLabel(st)}</span>
							</button>
						);
					})}
				</div>
			</Section>
			<Section label="Channels">
				<div className="flex flex-wrap gap-1.5">
					{PREF_CHANNELS.map((c) => {
						const st = prefs.channels[c.key] || "normal";
						return (
							<button
								key={c.key}
								type="button"
								onClick={() => onChange(cycleChannel(prefs, c.key))}
								className={cn(
									"rounded-md border px-2 py-1 text-[10.5px] transition-colors",
									stateChipClass(st),
								)}
							>
								{c.label}
								<span className="ml-1 opacity-70">{prefStateLabel(st)}</span>
							</button>
						);
					})}
				</div>
			</Section>
			<Section label="Platforms">
				<div className="flex flex-wrap gap-1.5">
					{PREF_PLATFORMS.map((name) => {
						const on = prefs.platforms[name] !== false;
						return (
							<button
								key={name}
								type="button"
								onClick={() => onChange(togglePlatform(prefs, name))}
								className={cn(
									"rounded-md border px-2 py-1 text-[10.5px] transition-colors",
									on
										? "border-white/[0.12] bg-white/[0.05] text-slate-300"
										: "border-red-500/40 bg-red-500/[0.1] text-red-300 line-through",
								)}
							>
								{name}
							</button>
						);
					})}
				</div>
			</Section>
			<button
				type="button"
				onClick={() => onChange(setPreset("ai_trade"))}
				className="rounded-md border border-white/[0.1] bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:bg-white/[0.08]"
			>
				{t("cockpit.resetPrefs")}
			</button>
		</div>
	);
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div>
			<div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
				{label}
			</div>
			{children}
		</div>
	);
}

/** 图文初稿弹窗:选题(含我的观点)→ LLM 生成公众号图文 → 编辑 → 保存草稿 / 一键送发布看板。 */
function ArticleModal({
	card,
	initialDraft,
	t,
	onClose,
	onPoolChange,
}: {
	card: CockpitCard;
	initialDraft: string;
	t: T;
	onClose: () => void;
	onPoolChange: (pool: TopicPool) => void;
}) {
	const [content, setContent] = useState(initialDraft);
	const [generating, setGenerating] = useState(false);
	const [busy, setBusy] = useState<"save" | "send" | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [okMsg, setOkMsg] = useState<string | null>(null);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	const generate = useCallback(async () => {
		if (!articleApi) return;
		setGenerating(true);
		setError(null);
		setOkMsg(null);
		const r = await articleApi.generate(card);
		setGenerating(false);
		if (r.ok && r.text) {
			setContent(r.text);
			setOkMsg(t("cockpit.article.generated", { provider: r.provider ?? "" }));
		} else {
			setError(r.error || t("cockpit.article.genFailed"));
		}
	}, [card, t]);

	const save = useCallback(async () => {
		if (!poolApi || !content.trim()) return;
		setBusy("save");
		setError(null);
		onPoolChange(await poolApi.setDraft(card.id, content));
		setBusy(null);
		setOkMsg(t("cockpit.article.saved"));
	}, [card.id, content, onPoolChange, t]);

	const send = useCallback(async () => {
		if (!boardApi || !poolApi || !content.trim()) return;
		setBusy("send");
		setError(null);
		setOkMsg(null);
		const r = await boardApi.createDraft({
			title: card.title,
			content,
			sourceCardId: card.id,
			topicType: card.topic,
		});
		if (!r.ok) {
			setBusy(null);
			setError(r.error || t("cockpit.article.sendFailed"));
			return;
		}
		await poolApi.setDraft(card.id, content);
		// 回填发布产物 + 选题置「已推草稿」(打通漏斗最后一跳)。
		onPoolChange(
			await poolApi.recordArtifact(
				card.id,
				{ kind: "publish", path: r.data, at: Date.now() },
				"已推草稿",
			),
		);
		setBusy(null);
		setOkMsg(t("cockpit.article.sent"));
	}, [card.id, card.title, card.topic, content, onPoolChange, t]);

	return (
		<div
			className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
			onClick={onClose}
		>
			<div
				className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-white/[0.1] bg-[#0C0F12] shadow-2xl"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="flex shrink-0 items-center gap-2 border-b border-white/[0.07] px-4 py-3">
					<Newspaper className="h-4 w-4 text-sky-300" />
					<span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-slate-100">
						{t("cockpit.article.title")} · {card.title}
					</span>
					<button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-200">
						<X className="h-4 w-4" />
					</button>
				</div>
				<div className="flex min-h-0 flex-1 flex-col gap-2 p-4">
					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={generate}
							disabled={generating || busy !== null}
							className="flex items-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/[0.12] px-3 py-1.5 text-[11.5px] font-medium text-sky-300 transition-colors hover:bg-sky-500/[0.2] disabled:opacity-40"
						>
							{generating ? (
								<Loader2 className="h-3.5 w-3.5 animate-spin" />
							) : (
								<Sparkles className="h-3.5 w-3.5" />
							)}
							{content.trim() ? t("cockpit.article.regenerate") : t("cockpit.article.generate")}
						</button>
						<span className="text-[10.5px] text-slate-500">{t("cockpit.article.hint")}</span>
					</div>
					<textarea
						value={content}
						onChange={(e) => setContent(e.target.value)}
						placeholder={t("cockpit.article.placeholder")}
						spellCheck={false}
						className="min-h-[44vh] flex-1 resize-none rounded-lg border border-white/[0.1] bg-[#15181C] p-3 text-[12.5px] leading-relaxed text-slate-200 outline-none placeholder:text-slate-600 focus:border-sky-500/40"
					/>
					{error && (
						<p className="rounded bg-red-500/10 px-2.5 py-1.5 text-[11px] text-red-300">{error}</p>
					)}
					{okMsg && <p className="text-[11px] text-[#3DC489]">{okMsg}</p>}
				</div>
				<div className="flex shrink-0 items-center gap-2 border-t border-white/[0.07] px-4 py-3">
					<button
						type="button"
						onClick={save}
						disabled={busy !== null || !content.trim()}
						className="rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-[11.5px] font-medium text-slate-200 transition-colors hover:bg-white/[0.08] disabled:opacity-40"
					>
						{busy === "save" ? t("cockpit.article.saving") : t("cockpit.article.save")}
					</button>
					<span className="flex-1" />
					<button
						type="button"
						onClick={send}
						disabled={busy !== null || !content.trim()}
						className="flex items-center gap-1.5 rounded-lg bg-[#34B27B] px-3 py-1.5 text-[11.5px] font-semibold text-[#06140d] transition-colors hover:bg-[#34B27B]/90 disabled:opacity-40"
					>
						{busy === "send" ? (
							<Loader2 className="h-3.5 w-3.5 animate-spin" />
						) : (
							<Send className="h-3.5 w-3.5" />
						)}
						{t("cockpit.article.send")}
					</button>
				</div>
			</div>
		</div>
	);
}

export default CockpitPanel;
