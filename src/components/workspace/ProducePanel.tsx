import {
	AlertTriangle,
	Ban,
	CheckCircle2,
	ChevronDown,
	ChevronRight,
	CircleDot,
	Clock,
	Eye,
	FileText,
	FolderOpen,
	KeyRound,
	Loader2,
	Play,
	RefreshCw,
	Stethoscope,
	Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useScopedT } from "@/contexts/I18nContext";
import type { KeyStatus, SlidesProvider } from "@/lib/keyTypes";
import { cn } from "@/lib/utils";
import type { Job, JobMode, JobType, ProducePrefill, SmokeResult } from "@/lib/vfTypes";
import { AvatarPanel } from "./AvatarPanel";
import { KeyDialog } from "./KeyDialog";

const vf = typeof window !== "undefined" ? window.electronAPI?.vf : undefined;
// 引擎自检每会话自动跑一次即可(切回成片 Tab 不重复跑)。结果也提到模块级,
// 这样重挂载后 smoke 状态虽重置,投料前仍能信任本会话已通过的自检,不白白重跑/卡住。
let autoSmokeRan = false;
let lastSmoke: SmokeResult | undefined;

/** 毫秒 → 紧凑时长(45s / 4m02s / 1h3m)。非法/负值返回空串(调用方据此不显示)。 */
function fmtDuration(ms: number): string {
	if (!Number.isFinite(ms) || ms < 0) return "";
	const s = Math.floor(ms / 1000);
	if (s < 60) return `${s}s`;
	const m = Math.floor(s / 60);
	const rs = s % 60;
	if (m < 60) return rs ? `${m}m${String(rs).padStart(2, "0")}s` : `${m}m`;
	const h = Math.floor(m / 60);
	const rm = m % 60;
	return rm ? `${h}h${rm}m` : `${h}h`;
}

/** ISO 时间 → 本地 HH:MM(完成时刻)。解析失败返回空串。 */
function fmtClock(iso: string | null): string {
	if (!iso) return "";
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return "";
	return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const STATUS_STYLES: Record<string, string> = {
	queued: "bg-slate-500/15 text-slate-300",
	running: "bg-[#34B27B]/15 text-[#3DC489]",
	"awaiting-confirm": "bg-amber-500/15 text-amber-300",
	"awaiting-preview": "bg-violet-500/15 text-violet-300",
	done: "bg-[#34B27B]/20 text-[#3DC489]",
	failed: "bg-red-500/15 text-red-300",
	interrupted: "bg-orange-500/15 text-orange-300",
};

/**
 * Inkast 整合 · 成片 Tab(P1)。
 * 用 window.electronAPI.vf(JobManager 的 IPC 表面)做:引擎状态/自检、投料(录屏/想法/翻页)、
 * 实时进度(订阅 vf:jobUpdate,进度来自 stageParser 真实 marker)、产物打开、确认点 A(翻页改稿→确认)。
 * 反假进度:所有进度/状态均来自主进程真实事件,无任何前端模拟。
 */
export function ProducePanel({
	prefill,
	onPrefillConsumed,
}: {
	prefill?: ProducePrefill | null;
	onPrefillConsumed?: () => void;
}) {
	const t = useScopedT("editor");
	const [jobs, setJobs] = useState<Job[]>([]);
	const [engine, setEngine] = useState<{ pipelineRoot: string; ready: boolean } | null>(null);
	const [smoke, setSmoke] = useState<{ running: boolean; result?: SmokeResult; error?: string }>(
		() => ({ running: false, result: lastSmoke }),
	);
	// 成片只做「文案/想法 → 多页视频」:统一走引擎 slides 拆页路径(拆页→确认点 A→渲染),
	// 不再有 idea 零 API 空板路径,也不收录屏(录屏在「录制」Tab 收口)。详见 2026-06-21 反馈调查。
	const [type] = useState<JobType>("slides");
	const [input, setInput] = useState("");
	const mode: JobMode = "simple";
	const [titleField, setTitleField] = useState("");
	// Gate B:确认文案后先出渲染前预览(cover + 3s motion),人确认再正式渲染。默认开。
	const [wantPreview, setWantPreview] = useState(true);
	const [submitting, setSubmitting] = useState(false);
	const [formError, setFormError] = useState<string | null>(null);
	const [expanded, setExpanded] = useState<string | null>(null);
	// 成片视图:文案→翻页视频(引擎)| 数字人口播(云 API 适配器)。(注意:勿与下方 JobMode `mode` 撞名)
	const [viewMode, setViewMode] = useState<"slides" | "avatar">("slides");
	// 任务卡耗时:running 任务需要每秒走表;有 running 时才起定时器(无任务时不空转)。
	const [nowMs, setNowMs] = useState(() => Date.now());
	const anyRunning = jobs.some((j) => j.status === "running");
	useEffect(() => {
		if (!anyRunning) return;
		setNowMs(Date.now());
		const id = setInterval(() => setNowMs(Date.now()), 1000);
		return () => clearInterval(id);
	}, [anyRunning]);
	// 历史均时预估:已完成任务的「startedAt→finishedAt」平均时长,给运行中任务一个参考(可选)。
	const { avgDurationMs, sampleCount } = useMemo(() => {
		const durs: number[] = [];
		for (const j of jobs) {
			if (j.status !== "done" || !j.startedAt || !j.finishedAt) continue;
			const d = new Date(j.finishedAt).getTime() - new Date(j.startedAt).getTime();
			if (Number.isFinite(d) && d > 0) durs.push(d);
		}
		return {
			avgDurationMs: durs.length ? durs.reduce((a, b) => a + b, 0) / durs.length : 0,
			sampleCount: durs.length,
		};
	}, [jobs]);
	// 选题溯源 id(来自驾驶舱「去成片」):随投料带给 JobManager,成片完成回写选题「已成稿」。
	const [sourceCardId, setSourceCardId] = useState<string | undefined>(undefined);
	// 成片供应商显式选择(持久化到 produce.json,引擎 spawn 时注入 SLIDES_PROVIDER)。
	const [slidesProvider, setSlidesProviderState] = useState<SlidesProvider>("auto");
	const changeProvider = useCallback(async (p: SlidesProvider) => {
		setSlidesProviderState(p);
		await vf?.setSlidesProvider(p);
	}, []);
	// LLM 密钥状态:缺 key 时顶部黄条提示配置(兑现 jobManager friendlyError 指向的「黄条」)。
	const [keyStatus, setKeyStatus] = useState<KeyStatus | null>(null);
	const [keyDialogOpen, setKeyDialogOpen] = useState(false);
	const refreshKeys = useCallback(async () => {
		const api = window.electronAPI?.keys;
		if (api) setKeyStatus(await api.status());
	}, []);
	// 成片可用任一供应商的 key(Claude/Kimi/DeepSeek/通义/智谱/OpenAI),全没配才算缺。
	const noKey =
		keyStatus !== null &&
		!keyStatus.anthropic &&
		!keyStatus.moonshot &&
		!keyStatus.deepseek &&
		!keyStatus.qwen &&
		!keyStatus.glm &&
		!keyStatus.openai;

	// 漏斗预填:从 资料库录屏 / 拉片报告 / 驾驶舱选题 跳来时带入投料(用户审后再点「开始成片」,不自动花 API)。
	// 消费一次即通知外层清空 —— 否则 ProducePanel 重挂载会把已消费的 sourceCardId 重新挂到无关投料上。
	useEffect(() => {
		if (!prefill) return;
		// 成片只收文案(type 恒为 slides);预填只取文本/标题/溯源,忽略 prefill.type。
		setInput(prefill.input);
		setTitleField(prefill.title ?? "");
		setSourceCardId(prefill.sourceCardId);
		setFormError(null);
		onPrefillConsumed?.();
	}, [prefill, onPrefillConsumed]);

	const refreshJobs = useCallback(async () => {
		if (!vf) return;
		const res = await vf.listJobs();
		if (res.ok && res.data) setJobs(res.data);
	}, []);

	const refreshEngine = useCallback(async () => {
		if (!vf) return;
		const res = await vf.engineInfo();
		if (res.ok && res.data) setEngine(res.data);
	}, []);

	useEffect(() => {
		refreshJobs();
		refreshEngine();
		refreshKeys();
		vf?.getSlidesProvider().then(setSlidesProviderState);
		if (!vf) return;
		// 进度推送:把更新的 job 合并进列表(新任务置顶)。
		const off = vf.onJobUpdate((job) => {
			setJobs((prev) => {
				const idx = prev.findIndex((j) => j.id === job.id);
				if (idx === -1) return [job, ...prev];
				const next = [...prev];
				next[idx] = job;
				return next;
			});
		});
		return off;
	}, [refreshJobs, refreshEngine, refreshKeys]);

	const runSmoke = useCallback(async (): Promise<SmokeResult | undefined> => {
		if (!vf) return undefined;
		setSmoke({ running: true });
		const res = await vf.smoke();
		lastSmoke = res.data; // 提到模块级,重挂载后投料前可信任本会话自检结果
		setSmoke({ running: false, result: res.data, error: res.error });
		refreshEngine();
		return res.data;
	}, [refreshEngine]);

	// 启动后自动跑一次引擎自检(每会话一次):缺依赖提前显性化,不必手点(task B)。
	useEffect(() => {
		if (autoSmokeRan || !vf) return;
		autoSmokeRan = true;
		runSmoke();
	}, [runSmoke]);

	const handleSubmit = useCallback(async () => {
		if (!vf) return;
		const text = input.trim();
		if (!text) {
			setFormError(t("produce.submit.errorEmpty"));
			return;
		}
		// 文案拆页强依赖 LLM key(slides 路径);没 key 直接拦在投料前并弹配置,而不是让引擎跑出空板/失败。
		if (noKey) {
			setFormError(t("produce.submit.errorNoKey"));
			setKeyDialogOpen(true);
			return;
		}
		setSubmitting(true);
		setFormError(null);
		// 投料前自检引擎依赖:上次未通过/没跑过就现跑,缺依赖拦下并提示(task B),不白白投料挂掉。
		if (smoke.result?.code !== 0) {
			const s = await runSmoke();
			if (!s || s.code !== 0) {
				setSubmitting(false);
				setFormError(t("produce.smokeBlocked"));
				return;
			}
		}
		const res = await vf.submitJob({
			type,
			input: text,
			mode,
			title: titleField.trim(),
			sourceCardId,
			wantPreview,
		});
		setSubmitting(false);
		if (res.ok) {
			setInput("");
			setTitleField("");
			setSourceCardId(undefined);
		} else {
			setFormError(res.error || t("produce.errors.submitFailed"));
		}
	}, [type, input, titleField, sourceCardId, wantPreview, smoke.result, runSmoke, noKey, t]);

	const act = useCallback(
		async (fn: () => Promise<{ ok: boolean; error?: string }> | undefined): Promise<boolean> => {
			const res = await fn();
			if (res && !res.ok) {
				setFormError(res.error || t("produce.errors.actionFailed"));
				return false;
			}
			return true;
		},
		[t],
	);

	return (
		<div className="flex h-full w-full flex-col overflow-hidden bg-[#0A0C0E]">
			{/* 成片模式:文案→翻页视频(引擎) | 数字人口播(云 API) */}
			<div className="flex shrink-0 items-center gap-1 border-b border-white/[0.07] bg-[#070809] px-5 py-1.5">
				{(["slides", "avatar"] as const).map((m) => (
					<button
						key={m}
						type="button"
						onClick={() => setViewMode(m)}
						className={cn(
							"rounded-md px-3 py-1 text-[11.5px] font-medium transition-colors",
							viewMode === m
								? "bg-[#34B27B]/15 text-[#3DC489]"
								: "text-slate-400 hover:bg-white/[0.05] hover:text-slate-200",
						)}
					>
						{t(`produce.mode.${m}`)}
					</button>
				))}
			</div>
			{viewMode === "avatar" ? (
				<AvatarPanel initialScript={input} />
			) : (
				<>
					{/* 缺 LLM 密钥黄条:成片拆页需要 Claude/DeepSeek。点开配置弹窗,保存即生效。 */}
					{noKey && (
						<div className="flex shrink-0 items-center gap-2 border-b border-amber-500/20 bg-amber-500/[0.08] px-5 py-2 text-[11.5px] text-amber-200">
							<AlertTriangle className="h-3.5 w-3.5 shrink-0" />
							<span className="min-w-0 flex-1">{t("produce.noKey")}</span>
							<button
								type="button"
								onClick={() => setKeyDialogOpen(true)}
								className="flex shrink-0 items-center gap-1 rounded-md border border-amber-400/40 bg-amber-400/10 px-2 py-1 font-medium text-amber-100 transition-colors hover:bg-amber-400/20"
							>
								<KeyRound className="h-3 w-3" />
								{t("produce.configKey")}
							</button>
						</div>
					)}

					{/* 引擎状态条 */}
					<div className="flex shrink-0 items-center gap-3 border-b border-white/[0.07] bg-[#0C0F12] px-5 py-2.5">
						<span
							className={cn(
								"flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium",
								engine?.ready ? "bg-[#34B27B]/15 text-[#3DC489]" : "bg-red-500/15 text-red-300",
							)}
						>
							<CircleDot className="h-3 w-3" />
							{engine
								? engine.ready
									? t("produce.engine.ready")
									: t("produce.engine.notReady")
								: "…"}
						</span>
						{engine && (
							<span className="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-500">
								{engine.pipelineRoot}
							</span>
						)}
						{engine && !engine.ready && window.electronAPI?.settings && (
							<button
								type="button"
								onClick={async () => {
									const r = await window.electronAPI?.settings?.pickEngine();
									if (r?.ok) refreshEngine();
								}}
								className="flex items-center gap-1.5 rounded-lg border border-[#34B27B]/40 bg-[#34B27B]/[0.12] px-2.5 py-1.5 text-[11.5px] font-medium text-[#3DC489] transition-colors hover:bg-[#34B27B]/[0.2]"
							>
								<FolderOpen className="h-3.5 w-3.5" />
								{t("settings.choose")}
							</button>
						)}
						<button
							type="button"
							onClick={() => runSmoke()}
							disabled={smoke.running}
							className="flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.04] px-2.5 py-1.5 text-[11.5px] font-medium text-slate-200 transition-colors hover:bg-white/[0.08] disabled:opacity-40"
						>
							{smoke.running ? (
								<Loader2 className="h-3.5 w-3.5 animate-spin" />
							) : (
								<Stethoscope className="h-3.5 w-3.5" />
							)}
							{t("produce.engine.smoke")}
						</button>
					</div>

					{smoke.result || smoke.error ? (
						<div
							className={cn(
								"shrink-0 border-b border-white/[0.07] px-5 py-2 font-mono text-[11px]",
								smoke.error || smoke.result?.code !== 0 ? "text-red-300" : "text-[#3DC489]",
							)}
						>
							<pre className="max-h-24 overflow-auto whitespace-pre-wrap custom-scrollbar">
								{smoke.error || smoke.result?.output || t("produce.engine.smokeOk")}
							</pre>
						</div>
					) : null}

					<div className="flex min-h-0 flex-1 overflow-hidden">
						{/* 投料表单 */}
						<div className="flex w-[320px] shrink-0 flex-col gap-3 overflow-auto border-r border-white/[0.07] p-5 custom-scrollbar">
							<h2 className="text-[13px] font-semibold text-slate-100">
								{t("produce.submit.title")}
							</h2>
							<p className="text-[11px] leading-relaxed text-slate-500">
								{t("produce.submit.hint")}
							</p>

							<textarea
								value={input}
								onChange={(e) => setInput(e.target.value)}
								rows={6}
								placeholder={t("produce.submit.placeholder_slides")}
								className="w-full resize-none rounded-lg border border-white/[0.1] bg-[#15181C] px-3 py-2 text-[12px] text-slate-200 outline-none placeholder:text-slate-600 focus:border-[#34B27B]/40"
							/>

							<input
								value={titleField}
								onChange={(e) => setTitleField(e.target.value)}
								placeholder={t("produce.submit.titleField")}
								className="w-full rounded-lg border border-white/[0.1] bg-[#15181C] px-3 py-2 text-[12px] text-slate-200 outline-none placeholder:text-slate-600 focus:border-[#34B27B]/40"
							/>

							{/* 成片供应商显式选择(写哪个 key 就用哪个;auto=引擎按可用 key 自动选)。 */}
							<div className="space-y-1">
								<div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
									{t("produce.submit.provider")}
								</div>
								<select
									value={slidesProvider}
									onChange={(e) => changeProvider(e.target.value as SlidesProvider)}
									className="w-full cursor-pointer rounded-lg border border-white/[0.1] bg-[#15181C] px-3 py-2 text-[12px] text-slate-200 outline-none focus:border-[#34B27B]/40"
								>
									<option value="auto">{t("produce.submit.providerAuto")}</option>
									<option value="anthropic">Claude (Anthropic)</option>
									<option value="moonshot">Kimi (Moonshot)</option>
									<option value="deepseek">DeepSeek</option>
									<option value="qwen">通义千问 (Qwen)</option>
									<option value="glm">智谱 GLM</option>
									<option value="openai">OpenAI</option>
								</select>
							</div>

							{/* Gate B:渲染前先出预览(cover + 3s motion),确认后再正式渲染 */}
							<label className="flex cursor-pointer items-start gap-2 rounded-lg border border-white/[0.08] bg-[#15181C] px-3 py-2">
								<input
									type="checkbox"
									checked={wantPreview}
									onChange={(e) => setWantPreview(e.target.checked)}
									className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[#34B27B]"
								/>
								<span className="min-w-0">
									<span className="block text-[11.5px] font-medium text-slate-300">
										{t("produce.preview.option")}
									</span>
									<span className="block text-[10.5px] leading-relaxed text-slate-600">
										{t("produce.preview.optionHint")}
									</span>
								</span>
							</label>

							{formError && (
								<div className="flex items-start gap-1.5 rounded-lg bg-red-500/10 px-3 py-2 text-[11px] text-red-300">
									<AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
									<span>{formError}</span>
								</div>
							)}

							<button
								type="button"
								onClick={handleSubmit}
								disabled={submitting || !engine?.ready}
								className="flex items-center justify-center gap-1.5 rounded-lg bg-[#34B27B] px-3 py-2 text-[12px] font-semibold text-[#06140d] transition-colors hover:bg-[#34B27B]/90 disabled:cursor-not-allowed disabled:opacity-40"
							>
								{submitting ? (
									<Loader2 className="h-3.5 w-3.5 animate-spin" />
								) : (
									<Play className="h-3.5 w-3.5" />
								)}
								{t("produce.submit.button")}
							</button>
							{!engine?.ready && (
								<p className="text-[10.5px] leading-relaxed text-slate-600">
									{t("produce.engine.notReadyHint")}
								</p>
							)}
						</div>

						{/* 任务列表 */}
						<div className="flex min-w-0 flex-1 flex-col overflow-auto p-5 custom-scrollbar">
							<div className="mb-3 flex items-center justify-between">
								<h2 className="text-[13px] font-semibold text-slate-100">
									{t("produce.jobs.title")}
								</h2>
								<button
									type="button"
									onClick={refreshJobs}
									className="rounded-md p-1 text-slate-500 hover:bg-white/[0.06] hover:text-slate-300"
									title={t("produce.jobs.refresh")}
								>
									<RefreshCw className="h-3.5 w-3.5" />
								</button>
							</div>

							{jobs.length === 0 ? (
								<p className="mt-8 text-center text-[12px] text-slate-600">
									{t("produce.jobs.empty")}
								</p>
							) : (
								<div className="space-y-2">
									{jobs.map((job) => (
										<JobCard
											key={job.id}
											job={job}
											t={t}
											nowMs={nowMs}
											avgDurationMs={avgDurationMs}
											sampleCount={sampleCount}
											expanded={expanded === job.id}
											onToggle={() => setExpanded(expanded === job.id ? null : job.id)}
											onRerun={() => act(() => vf?.rerun(job.id))}
											onCancel={() => act(() => vf?.cancel(job.id))}
											onRemove={async () => {
												if (!vf) return;
												const r = await vf.remove(job.id);
												if (r.ok && r.data) {
													setJobs(r.data);
													// 真撤销:把刚删的任务卡原样还原(不重跑引擎,日志若有缓存一并写回)。
													toast(t("produce.jobs.removed", { title: job.title || job.slug }), {
														duration: 8000,
														action: {
															label: t("produce.jobs.undoRemove"),
															onClick: async () => {
																const rr = await vf.restoreJob(job);
																if (rr.ok && rr.data) setJobs(rr.data);
																else toast.error(rr.error || t("produce.errors.actionFailed"));
															},
														},
													});
												} else setFormError(r.error || t("produce.errors.actionFailed"));
											}}
											onConfirm={() => act(() => vf?.confirm(job.id))}
											onConfirmPreview={() => act(() => vf?.confirmPreview(job.id))}
											onReplan={() => act(() => vf?.replan(job.id))}
											onSavePlan={(plan) => act(() => vf?.savePlan(job.id, plan))}
											onOpen={(p) => vf?.openPath(p)}
										/>
									))}
								</div>
							)}
						</div>
					</div>

					<KeyDialog
						open={keyDialogOpen}
						onOpenChange={setKeyDialogOpen}
						onSaved={(s) => {
							setKeyStatus(s);
							refreshEngine();
						}}
					/>
				</>
			)}
		</div>
	);
}

type T = (key: string, vars?: Record<string, string | number>) => string;

function JobCard({
	job,
	t,
	nowMs,
	avgDurationMs,
	sampleCount,
	expanded,
	onToggle,
	onRerun,
	onCancel,
	onRemove,
	onConfirm,
	onConfirmPreview,
	onReplan,
	onSavePlan,
	onOpen,
}: {
	job: Job;
	t: T;
	nowMs: number;
	avgDurationMs: number;
	sampleCount: number;
	expanded: boolean;
	onToggle: () => void;
	onRerun: () => void;
	onCancel: () => void;
	onRemove: () => void;
	onConfirm: () => void;
	onConfirmPreview: () => void;
	onReplan: () => void;
	onSavePlan: (plan: { pages: NonNullable<Job["plan"]>["pages"] }) => void | Promise<boolean>;
	onOpen: (p: string) => void;
}) {
	const running = job.status === "running" || job.status === "queued";
	const statusKey =
		job.status === "awaiting-confirm"
			? "awaiting"
			: job.status === "awaiting-preview"
				? "awaitingPreview"
				: job.status;
	// 耗时:运行中 = 走表的已用时长(nowMs−startedAt);终态 = 总时长(finishedAt−startedAt)。
	const startedMs = job.startedAt ? new Date(job.startedAt).getTime() : 0;
	const finishedMs = job.finishedAt ? new Date(job.finishedAt).getTime() : 0;
	const elapsedMs = job.status === "running" && startedMs ? nowMs - startedMs : 0;
	const totalMs = startedMs && finishedMs ? finishedMs - startedMs : 0;
	// 头部一眼可见的紧凑时长(运行中走表 / 终态总时长);排队中无。
	const headerDuration =
		job.status === "running" ? fmtDuration(elapsedMs) : totalMs ? fmtDuration(totalMs) : "";
	const clock = fmtClock(job.finishedAt);
	return (
		<div className="overflow-hidden rounded-xl border border-white/[0.07] bg-[#15181C]">
			<button
				type="button"
				onClick={onToggle}
				className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-white/[0.02]"
			>
				{expanded ? (
					<ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500" />
				) : (
					<ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-500" />
				)}
				{running ? (
					<Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#3DC489]" />
				) : job.status === "done" ? (
					<CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#3DC489]" />
				) : job.status === "failed" ? (
					<AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-300" />
				) : (
					<CircleDot className="h-3.5 w-3.5 shrink-0 text-slate-500" />
				)}
				<span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-slate-200">
					{job.title}
				</span>
				{headerDuration && (
					<span className="shrink-0 font-mono text-[10px] tabular-nums text-slate-500">
						{headerDuration}
					</span>
				)}
				<span
					className={cn(
						"shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
						STATUS_STYLES[job.status] || "bg-slate-500/15 text-slate-300",
					)}
				>
					{t(`produce.status.${statusKey}`)}
				</span>
			</button>

			{expanded && (
				<div className="space-y-3 border-t border-white/[0.06] px-3.5 py-3">
					{/* 耗时 / 完成时间 / 历史均时预估 */}
					{(job.status === "running" ? startedMs : totalMs) ? (
						<div className="flex items-center gap-1.5 text-[10.5px] text-slate-500">
							<Clock className="h-3 w-3 shrink-0" />
							{job.status === "running" ? (
								<span>
									{t("produce.jobs.elapsed", { d: fmtDuration(elapsedMs) })}
									{avgDurationMs > 0 && sampleCount > 0 && (
										<span className="text-slate-600">
											{" · "}
											{t("produce.jobs.estimate", {
												d: fmtDuration(avgDurationMs),
												n: sampleCount,
											})}
										</span>
									)}
								</span>
							) : (
								<span>
									{t("produce.jobs.duration", { d: fmtDuration(totalMs) })}
									{clock && ` · ${t("produce.jobs.finishedAt", { t: clock })}`}
								</span>
							)}
						</div>
					) : null}

					{/* 真实阶段进度 */}
					{job.stages.length > 0 && (
						<div className="flex flex-wrap gap-1.5">
							{job.stages.map((s) => (
								<span
									key={`${s.key}-${s.at}`}
									className="rounded-md bg-white/[0.06] px-2 py-0.5 text-[10.5px] text-slate-300"
								>
									{s.label}
								</span>
							))}
						</div>
					)}

					{job.error && (
						<div className="flex items-start gap-1.5 rounded-lg bg-red-500/10 px-3 py-2 text-[11px] text-red-300">
							<AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
							<span>{job.error}</span>
						</div>
					)}

					{/* 确认点 A:翻页拆稿待确认 */}
					{job.status === "awaiting-confirm" && job.plan && (
						<PlanEditor
							plan={job.plan}
							t={t}
							onSave={onSavePlan}
							onConfirm={onConfirm}
							onReplan={onReplan}
						/>
					)}

					{/* Gate B:渲染前预览待确认 */}
					{job.status === "awaiting-preview" && (
						<PreviewGate
							artifacts={job.previewArtifacts ?? []}
							t={t}
							onConfirm={onConfirmPreview}
							onReplan={onReplan}
							onOpen={onOpen}
						/>
					)}

					{/* 产物 */}
					{job.artifacts.length > 0 && (
						<div className="space-y-1">
							<div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
								{t("produce.jobs.artifacts")}
							</div>
							{job.artifacts.map((a) => (
								<button
									key={a}
									type="button"
									onClick={() => onOpen(a)}
									className="flex w-full items-center gap-1.5 rounded-md bg-white/[0.04] px-2.5 py-1.5 text-left text-[11px] text-slate-300 transition-colors hover:bg-white/[0.08]"
								>
									<FolderOpen className="h-3.5 w-3.5 shrink-0 text-[#3DC489]" />
									<span className="min-w-0 flex-1 truncate font-mono">{a.split("/").pop()}</span>
								</button>
							))}
						</div>
					)}

					<div className="flex items-center gap-2 pt-1">
						{running ? (
							<button
								type="button"
								onClick={onCancel}
								className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/[0.08] px-2.5 py-1.5 text-[11px] font-medium text-red-300 transition-colors hover:bg-red-500/[0.16]"
							>
								<Ban className="h-3 w-3" />
								{t("produce.jobs.cancel")}
							</button>
						) : (
							<>
								<button
									type="button"
									onClick={onRerun}
									className="flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-medium text-slate-300 transition-colors hover:bg-white/[0.08]"
								>
									<RefreshCw className="h-3 w-3" />
									{t("produce.jobs.rerun")}
								</button>
								<button
									type="button"
									onClick={onRemove}
									className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.02] px-2.5 py-1.5 text-[11px] font-medium text-slate-400 transition-colors hover:bg-red-500/[0.12] hover:text-red-300"
								>
									<Trash2 className="h-3 w-3" />
									{t("produce.jobs.delete")}
								</button>
							</>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

/** Gate B 渲染前预览闸门:展示轻量预览产物(cover/motion,可打开查看),确认后正式渲染或回退改稿。 */
function PreviewGate({
	artifacts,
	t,
	onConfirm,
	onReplan,
	onOpen,
}: {
	artifacts: string[];
	t: T;
	onConfirm: () => void;
	onReplan: () => void;
	onOpen: (p: string) => void;
}) {
	return (
		<div className="space-y-2.5 rounded-lg border border-violet-500/20 bg-violet-500/[0.04] p-3">
			<div className="flex items-center gap-1.5 text-[11.5px] font-medium text-violet-300">
				<Eye className="h-3.5 w-3.5" />
				{t("produce.preview.title")}
			</div>
			<p className="text-[10.5px] leading-relaxed text-slate-500">{t("produce.preview.hint")}</p>
			{artifacts.length > 0 ? (
				<div className="space-y-1">
					{artifacts.map((a) => (
						<button
							key={a}
							type="button"
							onClick={() => onOpen(a)}
							className="flex w-full items-center gap-1.5 rounded-md bg-white/[0.04] px-2.5 py-1.5 text-left text-[11px] text-slate-300 transition-colors hover:bg-white/[0.08]"
						>
							<FolderOpen className="h-3.5 w-3.5 shrink-0 text-violet-300" />
							<span className="min-w-0 flex-1 truncate font-mono">{a.split("/").pop()}</span>
						</button>
					))}
				</div>
			) : (
				<p className="text-[10.5px] text-amber-300/80">{t("produce.preview.none")}</p>
			)}
			<div className="flex items-center gap-2 pt-0.5">
				<button
					type="button"
					onClick={onConfirm}
					className="flex items-center gap-1.5 rounded-lg bg-[#34B27B] px-3 py-1.5 text-[11.5px] font-semibold text-[#06140d] transition-colors hover:bg-[#34B27B]/90"
				>
					<CheckCircle2 className="h-3.5 w-3.5" />
					{t("produce.preview.confirm")}
				</button>
				<button
					type="button"
					onClick={onReplan}
					className="rounded-lg border border-white/[0.1] bg-white/[0.04] px-2.5 py-1.5 text-[11.5px] font-medium text-slate-300 transition-colors hover:bg-white/[0.08]"
				>
					{t("produce.preview.replan")}
				</button>
			</div>
		</div>
	);
}

function PlanEditor({
	plan,
	t,
	onSave,
	onConfirm,
	onReplan,
}: {
	plan: NonNullable<Job["plan"]>;
	t: T;
	onSave: (plan: { pages: NonNullable<Job["plan"]>["pages"] }) => void | Promise<boolean>;
	onConfirm: () => void;
	onReplan: () => void;
}) {
	const [pages, setPages] = useState(plan.pages);
	const dirty = useRef(false);

	const update = (i: number, patch: Partial<(typeof pages)[number]>) => {
		dirty.current = true;
		setPages((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
	};

	return (
		<div className="space-y-2.5 rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-3">
			<div className="flex items-center gap-1.5 text-[11.5px] font-medium text-amber-300">
				<FileText className="h-3.5 w-3.5" />
				{t("produce.confirm.title")}
			</div>
			{pages.map((p, i) => (
				<div key={p.id} className="space-y-1.5 rounded-md bg-black/20 p-2">
					<input
						value={p.heading}
						onChange={(e) => update(i, { heading: e.target.value })}
						placeholder={t("produce.confirm.heading")}
						className="w-full rounded border border-white/[0.08] bg-[#15181C] px-2 py-1 text-[11.5px] font-medium text-slate-100 outline-none focus:border-amber-400/40"
					/>
					<textarea
						value={p.narration}
						onChange={(e) => update(i, { narration: e.target.value })}
						rows={2}
						placeholder={t("produce.confirm.narration")}
						className="w-full resize-none rounded border border-white/[0.08] bg-[#15181C] px-2 py-1 text-[11px] text-slate-300 outline-none focus:border-amber-400/40"
					/>
				</div>
			))}
			<div className="flex items-center gap-2 pt-0.5">
				<button
					type="button"
					onClick={async () => {
						// dirty 时先保存改稿再确认:confirm 后端只用已持久化的 script.json,不先存会
						// 静默丢弃用户编辑(确认是最显眼主操作,最易踩)。保存失败(红字已提示)则不确认。
						if (dirty.current) {
							const saved = await onSave({ pages });
							if (saved === false) return;
							dirty.current = false;
						}
						onConfirm();
					}}
					className="flex items-center gap-1.5 rounded-lg bg-[#34B27B] px-3 py-1.5 text-[11.5px] font-semibold text-[#06140d] transition-colors hover:bg-[#34B27B]/90"
				>
					<CheckCircle2 className="h-3.5 w-3.5" />
					{t("produce.confirm.confirm")}
				</button>
				<button
					type="button"
					onClick={() => onSave({ pages })}
					disabled={!dirty.current}
					className="rounded-lg border border-white/[0.1] bg-white/[0.04] px-2.5 py-1.5 text-[11.5px] font-medium text-slate-300 transition-colors hover:bg-white/[0.08] disabled:opacity-40"
				>
					{t("produce.confirm.save")}
				</button>
				<button
					type="button"
					onClick={() => onReplan()}
					className="rounded-lg border border-white/[0.1] bg-white/[0.04] px-2.5 py-1.5 text-[11.5px] font-medium text-slate-300 transition-colors hover:bg-white/[0.08]"
				>
					{t("produce.confirm.replan")}
				</button>
			</div>
		</div>
	);
}

export default ProducePanel;
