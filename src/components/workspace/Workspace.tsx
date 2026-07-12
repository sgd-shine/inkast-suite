import {
	Clapperboard,
	Compass,
	FolderOpen,
	KeyRound,
	Languages,
	Megaphone,
	ScanSearch,
	Search,
	Settings2,
	Video,
} from "lucide-react";
import { lazy, type ReactNode, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useI18n, useScopedT } from "@/contexts/I18nContext";
import { useShortcuts } from "@/contexts/ShortcutsContext";
import type { Locale } from "@/i18n/config";
import { getAvailableLocales, getLocaleName } from "@/i18n/loader";
import { composeTopicScript } from "@/lib/topicScript";
import { cn } from "@/lib/utils";
import type { Job, ProducePrefill } from "@/lib/vfTypes";
import { AnalyzePanel } from "./AnalyzePanel";
import { CockpitPanel } from "./CockpitPanel";
import { KeyDialog } from "./KeyDialog";
import { LibraryPanel } from "./LibraryPanel";
import { ProducePanel } from "./ProducePanel";
import { PublishPanel } from "./PublishPanel";
import { SearchOverlay } from "./SearchOverlay";
import { SettingsDialog } from "./SettingsDialog";

const VideoEditor = lazy(() => import("@/components/video-editor/VideoEditor"));
const ShortcutsConfigDialog = lazy(() =>
	import("@/components/video-editor/ShortcutsConfigDialog").then((module) => ({
		default: module.ShortcutsConfigDialog,
	})),
);

type WorkspaceTab = "cockpit" | "analyze" | "record" | "produce" | "library" | "publish";

// 分析「在跑」的阶段(与 AnalyzePanel 的 ACTIVE_PHASES 一致)。done/error/idle 不算在跑。
const ANALYZE_ACTIVE_PHASES = new Set(["probe", "extract", "analyze", "write"]);

/** Tab 角标:待确认(琥珀,优先)> 在跑(绿,带脉冲)。无任务不渲染。计数 ≥1 才显示数字。 */
function TabBadge({
	running,
	awaiting,
	title,
}: {
	running: number;
	awaiting: number;
	title: string;
}) {
	if (awaiting > 0)
		return (
			<span
				title={title}
				className="ml-0.5 inline-flex min-w-[15px] items-center justify-center rounded-full bg-amber-500/90 px-1 text-[9.5px] font-bold leading-none text-[#1a1300] tabular-nums"
			>
				{awaiting}
			</span>
		);
	if (running > 0)
		return (
			<span
				title={title}
				className="ml-0.5 inline-flex items-center gap-0.5 rounded-full bg-[#34B27B]/90 px-1 py-px text-[9.5px] font-bold leading-none text-[#06140d] tabular-nums"
			>
				<span className="h-1 w-1 animate-pulse rounded-full bg-[#06140d]/70" />
				{running}
			</span>
		);
	return null;
}

/**
 * Inkast 整合 · 6-Tab 工作台外壳(钉子①)。
 *
 * 现实约束(见 docs/INTEGRATION.md §2):Inkast 是多窗口 App,不是带 Tab 的 SPA。
 * 编辑器窗口(windowType=editor)即整个主界面;这里把它长成顶部带 6 Tab 的工作台:
 *   驾驶舱 │ 分析 │ 录制 │ 成片 │ 资料库 │ 发布  ——  一条从想法到发布的漏斗。
 *
 * 「录制」Tab 内嵌完整的 VideoEditor(传 embedded:去窗口拖拽/红绿灯偏移,降为工具条),
 * 一旦挂载就常驻(切 Tab 用 display:none 隐藏,保留编辑器状态)。其余 Tab 均已接真实后端:
 * 驾驶舱=CockpitPanel(读 vault) / 分析=AnalyzePanel(ffmpeg+Claude) / 成片=ProducePanel(JobManager) / 资料库=LibraryPanel。
 *
 * 顶栏由本外壳提供:可拖动 + mac 红绿灯留白 + Tab 切换。窗口生命周期(main.ts)与
 * 录制→编辑器交接流程完全不动 —— 开编辑器窗口即得工作台,录完照旧加载会话进「录制」Tab。
 */

function EditorFallback() {
	const t = useScopedT("editor");
	return (
		<div className="flex h-full flex-col items-center justify-center gap-3 bg-[#0A0C0E]">
			<svg
				className="animate-spin text-[#34B27B]"
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
				width={28}
				height={28}
				aria-hidden="true"
			>
				<circle
					className="opacity-25"
					cx="12"
					cy="12"
					r="10"
					stroke="currentColor"
					strokeWidth="4"
				/>
				<path
					className="opacity-75"
					fill="currentColor"
					d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
				/>
			</svg>
			<span className="text-sm text-white/50">{t("loadingEditor")}</span>
		</div>
	);
}

export function Workspace() {
	const t = useScopedT("editor");
	const { isMac } = useShortcuts();
	const { locale, setLocale } = useI18n();
	const availableLocales = getAvailableLocales();
	const [active, setActive] = useState<WorkspaceTab>("record");
	// 编辑器一旦挂载就保留,避免切 Tab 丢失编辑状态。
	const [editorMounted, setEditorMounted] = useState(true);
	const [keyDialogOpen, setKeyDialogOpen] = useState(false);
	const [settingsOpen, setSettingsOpen] = useState(false);
	// 全局检索浮层(主线三)+「跳到选题」目标(切到驾驶舱并选中)。
	const [searchOpen, setSearchOpen] = useState(false);
	const [cockpitJumpId, setCockpitJumpId] = useState<string | null>(null);
	const jumpToTopic = useCallback((cardId: string) => {
		setCockpitJumpId(cardId);
		setActive("cockpit");
	}, []);
	const clearCockpitJump = useCallback(() => setCockpitJumpId(null), []);
	// 路径设置变更后,bump 一下让对应面板重挂载刷新(驾驶舱/发布读新目录)。
	const [pathNonce, setPathNonce] = useState(0);
	// 漏斗预填:资料库录屏 / 拉片报告 → 成片(切 Tab + 带投料,用户审后再提交)。
	const [producePrefill, setProducePrefill] = useState<ProducePrefill | null>(null);
	const goProduce = (prefill: ProducePrefill) => {
		setProducePrefill(prefill);
		setActive("produce");
	};
	// ProducePanel 消费预填后清空,避免重挂载把已消费的 sourceCardId 误挂到新投料。
	const clearPrefill = useCallback(() => setProducePrefill(null), []);
	// 驾驶舱「关注」→ 去拉片:把视频链接预填进拉片面板并切过去(自动拉取拆解)。
	const [analyzePrefillUrl, setAnalyzePrefillUrl] = useState<string | null>(null);
	const goAnalyze = useCallback((url: string) => {
		setAnalyzePrefillUrl(url);
		setActive("analyze");
	}, []);
	const clearAnalyzePrefill = useCallback(() => setAnalyzePrefillUrl(null), []);

	// 主线四·task 2:Tab 角标。成片/分析 Tab 切走就卸载,故任务状态汇总在 Workspace 层订阅维护
	// (vf:jobUpdate + analyze:update),即便用户在别的 Tab 也能看到「有任务在跑 / 待你确认」。
	const [produceJobs, setProduceJobs] = useState<Job[]>([]);
	const [analyzeActive, setAnalyzeActive] = useState(false);
	useEffect(() => {
		const api = window.electronAPI;
		// 成片:先拉全量种子,再订阅增量(合并更新的 job)。
		api?.vf?.listJobs().then((res) => {
			if (res.ok && res.data) setProduceJobs(res.data);
		});
		const offJob = api?.vf?.onJobUpdate((job) => {
			setProduceJobs((prev) => {
				const idx = prev.findIndex((j) => j.id === job.id);
				if (idx === -1) return [job, ...prev];
				const next = [...prev];
				next[idx] = job;
				return next;
			});
		});
		// 分析:无持久化在跑态(单任务、不跨重启),只靠实时阶段判断「在跑」。
		const offAnalyze = api?.analyze?.onUpdate((job) => {
			setAnalyzeActive(ANALYZE_ACTIVE_PHASES.has(job.phase));
		});
		return () => {
			offJob?.();
			offAnalyze?.();
		};
	}, []);
	// 全局检索快捷键 ⌘K / Ctrl+K(主线三)。
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
				e.preventDefault();
				setSearchOpen((v) => !v);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	const produceBadge = useMemo(() => {
		let running = 0;
		let awaiting = 0;
		for (const j of produceJobs) {
			if (j.status === "running" || j.status === "queued") running++;
			else if (j.status === "awaiting-confirm" || j.status === "awaiting-preview") awaiting++;
		}
		return { running, awaiting };
	}, [produceJobs]);

	const tabs: Array<{ id: WorkspaceTab; label: string; icon: ReactNode }> = [
		{ id: "cockpit", label: t("workspace.tabs.cockpit"), icon: <Compass className="h-4 w-4" /> },
		{ id: "analyze", label: t("workspace.tabs.analyze"), icon: <ScanSearch className="h-4 w-4" /> },
		{ id: "record", label: t("workspace.tabs.record"), icon: <Video className="h-4 w-4" /> },
		{
			id: "produce",
			label: t("workspace.tabs.produce"),
			icon: <Clapperboard className="h-4 w-4" />,
		},
		{ id: "library", label: t("workspace.tabs.library"), icon: <FolderOpen className="h-4 w-4" /> },
		{
			id: "publish",
			label: t("workspace.tabs.publish"),
			icon: <Megaphone className="h-4 w-4" />,
		},
	];

	return (
		<div className="flex h-screen flex-col overflow-hidden bg-[#0A0C0E] text-slate-200 selection:bg-[#34B27B]/30">
			{/* 顶栏:可拖动窗口 + mac 红绿灯留白 + 6 Tab + 设置/密钥/语言 */}
			<div
				className="flex h-11 flex-shrink-0 items-center gap-0.5 border-b border-white/[0.07] bg-[#070809]/85 px-2 backdrop-blur-xl"
				style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
			>
				{/* mac 交通灯占位(titleBarStyle:hiddenInset, trafficLightPosition {12,12}) */}
				<div className={isMac ? "w-[64px] shrink-0" : "w-1 shrink-0"} aria-hidden="true" />
				{tabs.map((tab) => (
					<button
						key={tab.id}
						type="button"
						onClick={() => {
							if (tab.id === "record") setEditorMounted(true);
							setActive(tab.id);
						}}
						aria-current={active === tab.id ? "page" : undefined}
						className={cn(
							"flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors",
							active === tab.id
								? "bg-white/[0.08] text-slate-100"
								: "text-slate-400 hover:bg-white/[0.05] hover:text-slate-200",
						)}
						style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
					>
						{tab.icon}
						{tab.label}
						{tab.id === "produce" && (
							<TabBadge
								running={produceBadge.running}
								awaiting={produceBadge.awaiting}
								title={
									produceBadge.awaiting > 0
										? t("workspace.badge.awaiting", { n: produceBadge.awaiting })
										: t("workspace.badge.running", { n: produceBadge.running })
								}
							/>
						)}
						{tab.id === "analyze" && (
							<TabBadge
								running={analyzeActive ? 1 : 0}
								awaiting={0}
								title={t("workspace.badge.running", { n: 1 })}
							/>
						)}
					</button>
				))}
				<span className="flex-1" />
				{/* 全局检索(主线三):跨选题/观点/拉片报告/录屏/成片/发布稿一处搜(⌘K) */}
				<button
					type="button"
					onClick={() => setSearchOpen(true)}
					className="flex items-center gap-1 rounded-lg px-2 py-1 text-white/50 transition-colors hover:bg-white/[0.06] hover:text-white/90"
					style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
					title={t("search.title")}
				>
					<Search size={14} />
				</button>
				{/* 外部路径设置(引擎/发布/驾驶舱,负责人定调:别靠散落路径) */}
				<button
					type="button"
					onClick={() => setSettingsOpen(true)}
					className="flex items-center gap-1 rounded-lg px-2 py-1 text-white/50 transition-colors hover:bg-white/[0.06] hover:text-white/90"
					style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
					title={t("settings.title")}
				>
					<Settings2 size={14} />
				</button>
				{/* LLM 密钥配置(safeStorage 加密,真端到端前置) */}
				<button
					type="button"
					onClick={() => setKeyDialogOpen(true)}
					className="flex items-center gap-1 rounded-lg px-2 py-1 text-white/50 transition-colors hover:bg-white/[0.06] hover:text-white/90"
					style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
					title={t("keys.title")}
				>
					<KeyRound size={14} />
				</button>
				{/* 语言切换(切中文/英文,自动记住) */}
				<div
					className="flex items-center gap-1 rounded-lg px-2 py-1 text-white/50 hover:text-white/90"
					style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
				>
					<Languages size={14} />
					<select
						value={locale}
						onChange={(e) => setLocale(e.target.value as Locale)}
						className="cursor-pointer appearance-none bg-transparent pr-1 text-[11px] font-medium outline-none"
						style={{ color: "inherit" }}
						aria-label="Language"
					>
						{availableLocales.map((loc) => (
							<option key={loc} value={loc} className="bg-[#0A0C0E] text-white">
								{getLocaleName(loc)}
							</option>
						))}
					</select>
				</div>
			</div>

			{/* 内容区 */}
			<div className="relative min-h-0 flex-1">
				{/* 录制 Tab:常驻挂载,非激活时隐藏以保留编辑器状态 */}
				{editorMounted && (
					<div className={cn("absolute inset-0", active !== "record" && "hidden")}>
						<Suspense fallback={<EditorFallback />}>
							<VideoEditor embedded />
							<ShortcutsConfigDialog />
						</Suspense>
					</div>
				)}
				{active === "cockpit" && (
					<CockpitPanel
						key={`cockpit-${pathNonce}`}
						onGoRecord={(card) => {
							// 去录屏带选题:口播稿塞进内容保护的提词窗(§5.1),再切到录制 Tab。
							setEditorMounted(true);
							window.electronAPI?.setPrompterScript?.(composeTopicScript(card));
							setActive("record");
						}}
						onGoProduce={(card) =>
							// 去成片带溯源:选题口播稿走 slides 拆页路径(拆页→确认→渲染);完成回写「已成稿」(§5.4)。
							goProduce({
								type: "slides",
								input: composeTopicScript(card),
								title: card.title,
								sourceCardId: card.id,
							})
						}
						onGoAnalyze={goAnalyze}
						jumpCardId={cockpitJumpId}
						onJumpConsumed={clearCockpitJump}
					/>
				)}
				{active === "analyze" && (
					<AnalyzePanel
						onSendToProduce={goProduce}
						prefillUrl={analyzePrefillUrl}
						onPrefillConsumed={clearAnalyzePrefill}
					/>
				)}
				{active === "produce" && (
					<ProducePanel prefill={producePrefill} onPrefillConsumed={clearPrefill} />
				)}
				{active === "library" && <LibraryPanel />}
				{active === "publish" && <PublishPanel key={`publish-${pathNonce}`} />}
			</div>

			<SearchOverlay
				open={searchOpen}
				onClose={() => setSearchOpen(false)}
				onJumpTopic={jumpToTopic}
			/>
			<KeyDialog open={keyDialogOpen} onOpenChange={setKeyDialogOpen} />
			<SettingsDialog
				open={settingsOpen}
				onOpenChange={setSettingsOpen}
				onChanged={() => setPathNonce((n) => n + 1)}
			/>
		</div>
	);
}

export default Workspace;
