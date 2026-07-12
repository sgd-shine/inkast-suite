import {
	AlertTriangle,
	CheckCircle2,
	CircleDot,
	Clapperboard,
	Download,
	FileText,
	FolderOpen,
	KeyRound,
	Link2,
	Loader2,
	ScanSearch,
	Search,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useI18n, useScopedT } from "@/contexts/I18nContext";
import type { AnalyzeEngineInfo, AnalyzeJob } from "@/lib/analyzeTypes";
import { localeToWhisperLanguage } from "@/lib/asr/language";
import { resampleTo16kMono, transcribeAudio } from "@/lib/asr/transcribe";
import type { TranscriptWord } from "@/lib/asr/types";
import { loadFileAsArrayBuffer } from "@/lib/exporter/streamingDecoder";
import { cn } from "@/lib/utils";
import type { ProducePrefill } from "@/lib/vfTypes";
import { KeyDialog } from "./KeyDialog";
import { MarkdownView } from "./MarkdownView";

const analyze = typeof window !== "undefined" ? window.electronAPI?.analyze : undefined;

const ACTIVE_PHASES = new Set(["probe", "extract", "analyze", "write"]);

// 复用录制 Tab 同款 whisper(transformers.js,本地/离线)。拉片接逐字稿后,模型据实分析台词/节奏,
// 不再凭画面脑补(见 2026-06-21 反馈调查)。AudioContext 懒建,整 App 共用一个。
let _audioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext {
	if (!_audioCtx) _audioCtx = new AudioContext();
	return _audioCtx;
}

function fmtTs(ms: number): string {
	const s = Math.max(0, Math.floor(ms / 1000));
	return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** 词级时间戳 → 带时间戳的逐字稿文本(按停顿/长度断行)。CJK 无空格、拉丁保留原文空格。 */
function buildTranscript(words: TranscriptWord[]): string {
	if (!words.length) return "";
	const lines: string[] = [];
	let buf: string[] = [];
	let lineStart = words[0].startMs;
	let lastEnd = words[0].startMs;
	const flush = () => {
		const text = buf.join("").trim();
		if (text) lines.push(`[${fmtTs(lineStart)}] ${text}`);
		buf = [];
	};
	for (const w of words) {
		if (buf.length && (w.startMs - lastEnd > 800 || buf.join("").length > 36)) {
			flush();
			lineStart = w.startMs;
		}
		buf.push(w.text);
		lastEnd = w.endMs;
	}
	flush();
	return lines.join("\n");
}

/** 转写视频音轨(读文件→解码→重采样 16k→whisper)。失败抛错,由调用方降级为无逐字稿。 */
async function transcribeVideo(
	videoPath: string,
	language: string | undefined,
	onProgress: (info: { stage: "download" | "transcribe"; progress: number }) => void,
): Promise<string> {
	const { data } = await loadFileAsArrayBuffer(videoPath);
	const audio = await getAudioCtx().decodeAudioData(data);
	const mono = await resampleTo16kMono(audio);
	const words = await transcribeAudio(mono, { language, onProgress });
	return buildTranscript(words);
}

/**
 * Inkast 整合 · 分析(拉片)Tab(P2)。
 * 选视频 → ffmpeg 抽帧 + Claude vision(拉片 skill 提示词)→ 拉片报告 + 复现 SOP,落 output/analyses。
 * 进度订阅 analyze:update(真实阶段:probe/extract/analyze/write)。真跑需 ANTHROPIC_API_KEY。
 */
export function AnalyzePanel({
	onSendToProduce,
	prefillUrl,
	onPrefillConsumed,
}: {
	onSendToProduce?: (p: ProducePrefill) => void;
	/** 驾驶舱「关注」去拉片:预填视频链接并自动拉取拆解。 */
	prefillUrl?: string | null;
	onPrefillConsumed?: () => void;
}) {
	const t = useScopedT("editor");
	const { locale } = useI18n();
	const [engine, setEngine] = useState<AnalyzeEngineInfo | null>(null);
	const [videoPath, setVideoPath] = useState("");
	const [title, setTitle] = useState("");
	// 我的赛道/账号人设(可选):填了 → 二创素材包贴着它做贴身改写;记住上次填的。
	const [persona, setPersona] = useState(
		() =>
			(typeof localStorage !== "undefined" && localStorage.getItem("inkast.analyze.persona")) || "",
	);
	const [current, setCurrent] = useState<AnalyzeJob | null>(null);
	const [past, setPast] = useState<AnalyzeJob[]>([]);
	// 历史搜索:按标题即时过滤(报告攒多了一眼难找)。
	const [historyQuery, setHistoryQuery] = useState("");
	const [report, setReport] = useState<string | null>(null);
	const [reportError, setReportError] = useState<string | null>(null);
	const [formError, setFormError] = useState<string | null>(null);
	const [keyDialogOpen, setKeyDialogOpen] = useState(false);
	// 转写音轨(逐字稿)开关 + 进度。默认开;失败不阻断分析。
	const [useTranscript, setUseTranscript] = useState(true);
	const [transcribeProgress, setTranscribeProgress] = useState<{
		stage: "download" | "transcribe";
		progress: number;
	} | null>(null);
	// 贴链接直接拆(Feature 1):URL 输入 + yt-dlp 状态/安装/下载进度。
	const [url, setUrl] = useState("");
	const [ytdlp, setYtdlp] = useState<{ ready: boolean; managed: boolean } | null>(null);
	const [installing, setInstalling] = useState<{ pct: number } | null>(null);
	const [fetching, setFetching] = useState<{ stage: "probe" | "download"; pct: number } | null>(
		null,
	);

	const refresh = useCallback(async () => {
		if (!analyze) return;
		setEngine(await analyze.engineInfo());
		setPast(await analyze.list());
	}, []);

	useEffect(() => {
		refresh();
		if (!analyze) return;
		analyze.ytdlpInfo().then(setYtdlp);
		const off = analyze.onUpdate((job) => {
			setCurrent(job);
			if (job.phase === "done") {
				setReport(job.report ?? null);
				setReportError(null);
				refresh();
			}
		});
		const offInstall = analyze.onYtdlpProgress((pct) => setInstalling({ pct }));
		const offFetch = analyze.onFetchProgress((info) => setFetching(info));
		return () => {
			off?.();
			offInstall?.();
			offFetch?.();
		};
	}, [refresh]);

	const pick = useCallback(async () => {
		if (!analyze) return;
		const p = await analyze.pickVideo();
		if (p) {
			setVideoPath(p);
			setFormError(null);
		}
	}, []);

	// 拉片核心:给定本地视频绝对路径 → 转写(可选)+ 抽帧 + 视觉模型拉片。本地选片与贴链接拉取都走它。
	const runAnalyze = useCallback(
		async (vp: string, ttl: string) => {
			if (!analyze || !vp) return;
			setFormError(null);
			setReport(null);
			setReportError(null);
			// 1) 先转写音轨拿逐字稿(本地 whisper,首次需下载模型)。失败不阻断,降级为无逐字稿分析。
			let transcript: string | undefined;
			if (useTranscript) {
				try {
					transcript =
						(await transcribeVideo(vp, localeToWhisperLanguage(locale) ?? undefined, (info) =>
							setTranscribeProgress(info),
						)) || undefined;
				} catch (e) {
					console.warn("[analyze] 转写失败,改为无逐字稿分析:", e);
					setFormError(t("analyze.transcribeFailed"));
				} finally {
					setTranscribeProgress(null);
				}
			}
			// 2) 抽帧 + 视觉模型拉片(带上逐字稿 + 可选的赛道/人设,产出③据它做贴身二创素材)。
			const r = await analyze.start(vp, ttl, transcript, persona.trim() || undefined);
			if (r.ok && r.job) setCurrent(r.job);
			else setFormError(r.error || t("analyze.errorFailed"));
		},
		[useTranscript, locale, persona, t],
	);

	const startAnalyze = useCallback(() => {
		const vp = videoPath.trim();
		if (!vp) {
			setFormError(t("analyze.errorNoVideo"));
			return;
		}
		runAnalyze(vp, title.trim());
	}, [videoPath, title, runAnalyze, t]);

	// 安装拆解组件(yt-dlp):App 内一键下载官方 standalone 到 userData(首次,~35MB)。
	const installYtdlp = useCallback(async () => {
		if (!analyze) return;
		setFormError(null);
		setInstalling({ pct: 0 });
		const r = await analyze.ytdlpInstall();
		setInstalling(null);
		if (r.ok) setYtdlp(await analyze.ytdlpInfo());
		else setFormError(r.error || t("analyze.ytdlpInstallFailed"));
	}, [t]);

	// 贴链接拉取并拆解。抖音走公开分享页提取(不需 yt-dlp);其余(YouTube 等)走 yt-dlp,缺则先引导安装。
	// overrideUrl:驾驶舱「关注」去拉片时直接传链接(不依赖异步的 url 状态)。
	const fetchAndAnalyze = useCallback(
		async (overrideUrl?: string) => {
			if (!analyze) return;
			const u = (overrideUrl ?? url).trim();
			if (!u) {
				setFormError(t("analyze.errorNoUrl"));
				return;
			}
			const douyin = /douyin\.com|iesdouyin\.com/i.test(u);
			if (!douyin && !ytdlp?.ready) {
				setFormError(t("analyze.ytdlpMissing"));
				return;
			}
			setFormError(null);
			setReport(null);
			setReportError(null);
			setFetching({ stage: "probe", pct: 0 });
			const r = await analyze.fetchUrl(u);
			setFetching(null);
			if (!r.ok || !r.filePath) {
				setFormError(r.error || t("analyze.errorFetchFailed"));
				return;
			}
			const ttl = title.trim() || r.title || "";
			setVideoPath(r.filePath);
			if (!title.trim() && r.title) setTitle(r.title);
			await runAnalyze(r.filePath, ttl);
		},
		[url, ytdlp, title, runAnalyze, t],
	);

	// 驾驶舱「关注」去拉片:预填链接 + 自动拉取拆解(消费一次即清,避免重挂载重复触发)。
	// biome-ignore lint/correctness/useExhaustiveDependencies: 仅随 prefillUrl 变化消费一次;故意不依赖 fetchAndAnalyze/onPrefillConsumed,否则会重复触发拉取。
	useEffect(() => {
		if (!prefillUrl) return;
		setUrl(prefillUrl);
		onPrefillConsumed?.();
		fetchAndAnalyze(prefillUrl);
	}, [prefillUrl]);

	const openReport = useCallback(
		async (slug: string) => {
			if (!analyze) return;
			// 主进程读不到 report.md 时返回空串;不区分会静默回退占位,体感是「点了没反应」。
			const md = await analyze.report(slug);
			if (md?.trim()) {
				setReport(md);
				setReportError(null);
			} else {
				setReport(null);
				setReportError(t("analyze.reportReadFailed"));
			}
		},
		[t],
	);

	const busy =
		transcribeProgress !== null ||
		fetching !== null ||
		installing !== null ||
		(current ? ACTIVE_PHASES.has(current.phase) : false);

	return (
		<div className="flex h-full w-full flex-col overflow-hidden bg-[#0A0C0E]">
			{/* 引擎状态 */}
			<div className="flex shrink-0 items-center gap-2.5 border-b border-white/[0.07] bg-[#0C0F12] px-5 py-2.5">
				<ScanSearch className="h-4 w-4 text-[#3DC489]" />
				<span className="text-[13px] font-semibold text-slate-100">{t("analyze.title")}</span>
				<span className="flex-1" />
				<Pill ok={engine?.hasFfmpeg}>{`ffmpeg ${engine?.hasFfmpeg ? "✓" : "✗"}`}</Pill>
				<Pill ok={engine?.hasKey}>{`key ${engine?.hasKey ? "✓" : "✗"}`}</Pill>
				{engine?.model && (
					<span className="font-mono text-[10.5px] text-slate-600">
						{engine.provider === "moonshot"
							? "Kimi"
							: engine.provider === "anthropic"
								? "Claude"
								: ""}{" "}
						{engine.model}
					</span>
				)}
				<button
					type="button"
					onClick={() => setKeyDialogOpen(true)}
					className="flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.04] px-2.5 py-1.5 text-[11.5px] font-medium text-slate-200 transition-colors hover:bg-white/[0.08]"
				>
					<KeyRound className="h-3.5 w-3.5" />
					{t("analyze.configKey")}
				</button>
			</div>

			<div className="flex min-h-0 flex-1 overflow-hidden">
				{/* 左:投料 + 历史 */}
				<div className="flex w-[320px] shrink-0 flex-col gap-3 overflow-auto border-r border-white/[0.07] p-5 custom-scrollbar">
					<button
						type="button"
						onClick={pick}
						className="flex items-center justify-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-[12px] font-medium text-slate-200 transition-colors hover:bg-white/[0.08]"
					>
						<FolderOpen className="h-3.5 w-3.5" />
						{t("analyze.pick")}
					</button>

					{/* 贴链接直接拆(抖音/YouTube):yt-dlp 下载到本地 → 走拉片。 */}
					<div className="space-y-1.5 rounded-lg border border-white/[0.07] bg-[#0C0F12] p-2.5">
						<div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
							<Link2 className="h-3 w-3" />
							{t("analyze.fromUrl")}
						</div>
						<input
							value={url}
							onChange={(e) => setUrl(e.target.value)}
							placeholder={t("analyze.urlPlaceholder")}
							className="w-full rounded-md border border-white/[0.1] bg-[#15181C] px-2.5 py-1.5 text-[11.5px] text-slate-200 outline-none placeholder:text-slate-600 focus:border-[#34B27B]/40"
						/>
						{/* 拉取按钮常显:抖音走分享页提取(免 yt-dlp);YouTube 等走 yt-dlp。 */}
						<button
							type="button"
							onClick={() => fetchAndAnalyze()}
							disabled={busy || !engine?.hasKey || engine?.hasFfmpeg === false}
							className="flex w-full items-center justify-center gap-1.5 rounded-md bg-[#34B27B] px-2.5 py-1.5 text-[11.5px] font-semibold text-[#06140d] transition-colors hover:bg-[#34B27B]/90 disabled:cursor-not-allowed disabled:opacity-40"
						>
							{fetching !== null ? (
								<>
									<Loader2 className="h-3.5 w-3.5 animate-spin" />
									{fetching.stage === "probe"
										? t("analyze.fetchProbing")
										: t("analyze.fetchDownloading", { pct: Math.round(fetching.pct) })}
								</>
							) : (
								<>
									<Download className="h-3.5 w-3.5" />
									{t("analyze.fetchAndAnalyze")}
								</>
							)}
						</button>
						{/* yt-dlp 未装:仅 YouTube 等需要(抖音不需要)→ 次级安装入口。 */}
						{ytdlp?.ready === false && (
							<button
								type="button"
								onClick={installYtdlp}
								disabled={installing !== null}
								className="flex w-full items-center justify-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/[0.08] px-2.5 py-1 text-[10.5px] font-medium text-amber-200 transition-colors hover:bg-amber-500/[0.14] disabled:opacity-50"
							>
								{installing !== null ? (
									<>
										<Loader2 className="h-3 w-3 animate-spin" />
										{t("analyze.ytdlpInstalling", { pct: Math.round(installing.pct) })}
									</>
								) : (
									<>
										<Download className="h-3 w-3" />
										{t("analyze.ytdlpInstall")}
									</>
								)}
							</button>
						)}
						<p className="text-[10px] leading-relaxed text-slate-600">{t("analyze.urlHint")}</p>
					</div>

					{videoPath && (
						<p className="break-all rounded-lg bg-[#15181C] px-3 py-2 font-mono text-[10.5px] text-slate-400">
							{videoPath}
						</p>
					)}
					<input
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						placeholder={t("analyze.titleField")}
						className="w-full rounded-lg border border-white/[0.1] bg-[#15181C] px-3 py-2 text-[12px] text-slate-200 outline-none placeholder:text-slate-600 focus:border-[#34B27B]/40"
					/>
					{/* 我的赛道/账号人设(可选):填了 → 二创素材包贴着你的定位/口吻改写,而非泛泛通用。 */}
					<div className="space-y-1">
						<textarea
							value={persona}
							onChange={(e) => {
								setPersona(e.target.value);
								try {
									localStorage.setItem("inkast.analyze.persona", e.target.value);
								} catch {
									/* localStorage 不可用时忽略 */
								}
							}}
							rows={2}
							placeholder={t("analyze.personaPlaceholder")}
							className="w-full resize-none rounded-lg border border-white/[0.1] bg-[#15181C] px-3 py-2 text-[12px] text-slate-200 outline-none placeholder:text-slate-600 focus:border-[#34B27B]/40"
						/>
						<p className="text-[10.5px] leading-relaxed text-slate-600">
							{t("analyze.personaHint")}
						</p>
					</div>
					{/* 转写音轨开关:接逐字稿让模型据实分析台词/节奏(首次需下载 whisper 模型)。 */}
					<label className="flex cursor-pointer items-start gap-2 text-[11px] leading-relaxed text-slate-400">
						<input
							type="checkbox"
							checked={useTranscript}
							onChange={(e) => setUseTranscript(e.target.checked)}
							disabled={busy}
							className="mt-0.5 accent-[#34B27B]"
						/>
						<span>{t("analyze.transcribeToggle")}</span>
					</label>
					{transcribeProgress && (
						<div className="flex items-center gap-2 rounded-lg bg-[#15181C] px-3 py-2 text-[11px] text-slate-400">
							<Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#3DC489]" />
							<span>
								{transcribeProgress.stage === "download"
									? t("analyze.transcribeDownloading")
									: t("analyze.transcribing", {
											pct: Math.round(transcribeProgress.progress),
										})}
							</span>
						</div>
					)}
					{formError && (
						<div className="flex items-start gap-1.5 rounded-lg bg-red-500/10 px-3 py-2 text-[11px] text-red-300">
							<AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
							<span>{formError}</span>
						</div>
					)}
					<button
						type="button"
						onClick={startAnalyze}
						disabled={busy || !engine?.hasKey || engine?.hasFfmpeg === false}
						className="flex items-center justify-center gap-1.5 rounded-lg bg-[#34B27B] px-3 py-2 text-[12px] font-semibold text-[#06140d] transition-colors hover:bg-[#34B27B]/90 disabled:cursor-not-allowed disabled:opacity-40"
					>
						{busy ? (
							<Loader2 className="h-3.5 w-3.5 animate-spin" />
						) : (
							<ScanSearch className="h-3.5 w-3.5" />
						)}
						{t("analyze.start")}
					</button>
					{!engine?.hasKey && (
						<button
							type="button"
							onClick={() => setKeyDialogOpen(true)}
							className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/[0.08] px-2.5 py-1.5 text-left text-[10.5px] leading-relaxed text-amber-200/90 transition-colors hover:bg-amber-500/[0.14]"
						>
							<KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0" />
							<span>{t("analyze.keyHint")}</span>
						</button>
					)}
					{engine?.hasFfmpeg === false && (
						<p className="text-[10.5px] leading-relaxed text-amber-300/80">
							{t("analyze.ffmpegHint")}
						</p>
					)}

					{/* 进度 */}
					{current && (
						<div className="rounded-lg border border-white/[0.07] bg-[#15181C] p-3">
							<div className="flex items-center gap-2 text-[11.5px] font-medium text-slate-200">
								{current.phase === "done" ? (
									<CheckCircle2 className="h-3.5 w-3.5 text-[#3DC489]" />
								) : current.phase === "error" ? (
									<AlertTriangle className="h-3.5 w-3.5 text-red-300" />
								) : (
									<Loader2 className="h-3.5 w-3.5 animate-spin text-[#3DC489]" />
								)}
								{t(`analyze.phase.${current.phase}`)}
							</div>
							{current.note && <p className="mt-1 text-[11px] text-slate-500">{current.note}</p>}
							{current.error && <p className="mt-1 text-[11px] text-red-300">{current.error}</p>}
							{current.frameCount ? (
								<p className="mt-1 text-[10.5px] text-slate-600">
									{t("analyze.frames", { count: current.frameCount })}
								</p>
							) : null}
						</div>
					)}

					{/* 历史 */}
					<div className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
						{t("analyze.history")}
					</div>
					{past.length === 0 ? (
						<p className="text-[11px] text-slate-600">{t("analyze.historyEmpty")}</p>
					) : (
						<>
							{/* 标题即时过滤(报告多了好找)。 */}
							<div className="relative">
								<Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-600" />
								<input
									value={historyQuery}
									onChange={(e) => setHistoryQuery(e.target.value)}
									placeholder={t("analyze.historySearch")}
									className="w-full rounded-lg border border-white/[0.08] bg-[#15181C] py-1.5 pl-7 pr-2 text-[11.5px] text-slate-200 outline-none placeholder:text-slate-600 focus:border-[#34B27B]/40"
								/>
							</div>
							{(() => {
								const q = historyQuery.trim().toLowerCase();
								const filtered = q ? past.filter((j) => j.title.toLowerCase().includes(q)) : past;
								if (filtered.length === 0)
									return (
										<p className="text-[11px] text-slate-600">{t("analyze.historyNoMatch")}</p>
									);
								return (
									<div className="space-y-1.5">
										{filtered.map((j) => (
											<button
												key={j.slug}
												type="button"
												onClick={() => openReport(j.slug)}
												className="flex w-full items-center gap-2 rounded-lg border border-white/[0.06] bg-[#15181C] px-2.5 py-2 text-left transition-colors hover:bg-white/[0.04]"
											>
												<FileText className="h-3.5 w-3.5 shrink-0 text-slate-500" />
												<span className="min-w-0 flex-1 truncate text-[11.5px] text-slate-300">
													{j.title}
												</span>
											</button>
										))}
									</div>
								);
							})()}
						</>
					)}
				</div>

				{/* 右:报告 */}
				<div className="min-w-0 flex-1 overflow-auto p-6 custom-scrollbar">
					{report ? (
						<div className="space-y-3">
							{onSendToProduce && (
								<button
									type="button"
									onClick={() =>
										onSendToProduce({
											type: "slides",
											input: report,
											title: title.trim() || t("analyze.title"),
										})
									}
									className="flex items-center gap-1.5 rounded-lg bg-[#34B27B]/[0.14] px-3 py-1.5 text-[11.5px] font-medium text-[#3DC489] transition-colors hover:bg-[#34B27B]/[0.22]"
								>
									<Clapperboard className="h-3.5 w-3.5" />
									{t("analyze.toProduce")}
								</button>
							)}
							<MarkdownView markdown={report} />
						</div>
					) : reportError ? (
						<div className="flex h-full flex-col items-center justify-center gap-3 text-center">
							<div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/[0.08] text-red-300">
								<AlertTriangle className="h-6 w-6" />
							</div>
							<p className="max-w-sm text-[12.5px] leading-relaxed text-red-300/90">
								{reportError}
							</p>
						</div>
					) : (
						<div className="flex h-full flex-col items-center justify-center gap-3 text-center">
							<div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.06] bg-[#15181C] text-[#3DC489]">
								<ScanSearch className="h-6 w-6" />
							</div>
							<p className="max-w-sm text-[12.5px] leading-relaxed text-slate-500">
								{t("analyze.placeholder")}
							</p>
						</div>
					)}
				</div>
			</div>

			<KeyDialog open={keyDialogOpen} onOpenChange={setKeyDialogOpen} onSaved={() => refresh()} />
		</div>
	);
}

function Pill({ ok, children }: { ok?: boolean; children: React.ReactNode }) {
	return (
		<span
			className={cn(
				"flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
				ok ? "bg-[#34B27B]/15 text-[#3DC489]" : "bg-red-500/15 text-red-300",
			)}
		>
			<CircleDot className="h-2.5 w-2.5" />
			{children}
		</span>
	);
}

export default AnalyzePanel;
