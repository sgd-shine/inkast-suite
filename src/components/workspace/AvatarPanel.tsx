import {
	AlertTriangle,
	Bot,
	CheckCircle2,
	FolderOpen,
	Loader2,
	Play,
	Settings2,
	Trash2,
	User,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import type { AvatarConfig, AvatarConfigPublic, AvatarJob } from "@/lib/avatarTypes";
import { cn } from "@/lib/utils";

const avatar = typeof window !== "undefined" ? window.electronAPI?.avatar : undefined;

const ACTIVE = new Set(["queued", "submitting", "processing"]);

/**
 * Inkast 整合 · 成片 · 数字人(云 API)。口播稿 + 已注册形象/音色 → 云(HeyGen 内置 / 通用 HTTP
 * 适配器)→ MP4。Apple Silicon 本地跑不了开源口型模型,走成熟云;不锁死一家。
 * 现实前提:需先在对应平台后台注册形象(实名/肖像授权)+ 拿 API key,这里只编排。
 */
export function AvatarPanel({ initialScript }: { initialScript?: string }) {
	const t = useScopedT("editor");
	const [cfg, setCfg] = useState<AvatarConfigPublic | null>(null);
	const [showCfg, setShowCfg] = useState(false);
	const [draft, setDraft] = useState<Partial<AvatarConfig>>({});
	const [apiKeyInput, setApiKeyInput] = useState("");
	const [genericJson, setGenericJson] = useState("");
	const [script, setScript] = useState(initialScript ?? "");
	const [title, setTitle] = useState("");
	const [jobs, setJobs] = useState<AvatarJob[]>([]);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [savedHint, setSavedHint] = useState(false);

	const loadCfg = useCallback(async () => {
		const r = await avatar?.getConfig();
		if (r?.ok && r.data) {
			setCfg(r.data);
			setDraft({
				provider: r.data.provider,
				avatarId: r.data.avatarId,
				talkingPhotoId: r.data.talkingPhotoId,
				voiceId: r.data.voiceId,
				width: r.data.width,
				height: r.data.height,
			});
			if (r.data.generic) setGenericJson(JSON.stringify(r.data.generic, null, 2));
			// 没配过(无 key)默认展开设置,引导填写。
			if (!r.data.hasApiKey) setShowCfg(true);
		}
	}, []);

	useEffect(() => {
		loadCfg();
		avatar?.listJobs().then((r) => {
			if (r?.ok && r.data) setJobs(r.data);
		});
		const off = avatar?.onJobUpdate((job) => {
			setJobs((prev) => {
				const i = prev.findIndex((j) => j.id === job.id);
				if (i === -1) return [job, ...prev];
				const next = [...prev];
				next[i] = job;
				return next;
			});
		});
		return off;
	}, [loadCfg]);

	const provider = draft.provider ?? "heygen";

	const saveCfg = useCallback(async () => {
		setError(null);
		const partial: Partial<AvatarConfig> = {
			provider,
			avatarId: draft.avatarId,
			talkingPhotoId: draft.talkingPhotoId,
			voiceId: draft.voiceId,
			width: draft.width,
			height: draft.height,
		};
		if (apiKeyInput.trim()) partial.apiKey = apiKeyInput.trim();
		if (provider === "generic") {
			try {
				partial.generic = genericJson.trim() ? JSON.parse(genericJson) : undefined;
			} catch {
				setError(t("avatar.genericJsonInvalid"));
				return;
			}
		}
		const r = await avatar?.setConfig(partial);
		if (r?.ok && r.data) {
			setCfg(r.data);
			setApiKeyInput("");
			setSavedHint(true);
			setTimeout(() => setSavedHint(false), 1800);
		} else setError(r?.error || t("avatar.saveFailed"));
	}, [provider, draft, apiKeyInput, genericJson, t]);

	const submit = useCallback(async () => {
		const s = script.trim();
		if (s.length < 10) {
			setError(t("avatar.errorScriptShort"));
			return;
		}
		setError(null);
		setSubmitting(true);
		const r = await avatar?.submit({ script: s, title: title.trim() });
		setSubmitting(false);
		if (r?.ok && r.data) {
			setJobs((prev) => [r.data as AvatarJob, ...prev.filter((j) => j.id !== r.data?.id)]);
		} else setError(r?.error || t("avatar.submitFailed"));
	}, [script, title, t]);

	const removeJob = useCallback(async (id: string) => {
		const r = await avatar?.remove(id);
		if (r?.ok && r.data) setJobs(r.data);
	}, []);

	const field =
		"w-full rounded-md border border-white/[0.1] bg-[#15181C] px-2.5 py-1.5 text-[11.5px] text-slate-200 outline-none placeholder:text-slate-600 focus:border-[#34B27B]/40";

	return (
		<div className="flex min-h-0 flex-1 overflow-hidden">
			{/* 左:配置 + 投料 */}
			<div className="flex w-[340px] shrink-0 flex-col gap-3 overflow-auto border-r border-white/[0.07] p-5 custom-scrollbar">
				{/* 设置(供应商/key/形象/音色) */}
				<button
					type="button"
					onClick={() => setShowCfg((v) => !v)}
					className="flex items-center gap-2 text-[12px] font-semibold text-slate-100"
				>
					<Settings2 className="h-3.5 w-3.5 text-[#3DC489]" />
					{t("avatar.config")}
					<span
						className={cn(
							"ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium",
							cfg?.hasApiKey ? "bg-[#34B27B]/15 text-[#3DC489]" : "bg-amber-500/15 text-amber-300",
						)}
					>
						{cfg?.hasApiKey ? t("avatar.configured") : t("avatar.notConfigured")}
					</span>
				</button>

				{showCfg && (
					<div className="space-y-2 rounded-lg border border-white/[0.07] bg-[#0C0F12] p-3">
						<select
							value={provider}
							onChange={(e) =>
								setDraft((d) => ({ ...d, provider: e.target.value as AvatarConfig["provider"] }))
							}
							className={cn(field, "cursor-pointer")}
						>
							<option value="heygen">HeyGen(海外·开箱即用)</option>
							<option value="generic">通用 HTTP 适配器(国内/自建)</option>
						</select>
						<input
							type="password"
							value={apiKeyInput}
							onChange={(e) => setApiKeyInput(e.target.value)}
							placeholder={cfg?.hasApiKey ? t("avatar.apiKeyKeep") : t("avatar.apiKey")}
							className={field}
						/>
						{provider === "heygen" ? (
							<>
								<input
									value={draft.avatarId ?? ""}
									onChange={(e) => setDraft((d) => ({ ...d, avatarId: e.target.value }))}
									placeholder={t("avatar.avatarId")}
									className={field}
								/>
								<input
									value={draft.talkingPhotoId ?? ""}
									onChange={(e) => setDraft((d) => ({ ...d, talkingPhotoId: e.target.value }))}
									placeholder={t("avatar.talkingPhotoId")}
									className={field}
								/>
								<input
									value={draft.voiceId ?? ""}
									onChange={(e) => setDraft((d) => ({ ...d, voiceId: e.target.value }))}
									placeholder={t("avatar.voiceId")}
									className={field}
								/>
							</>
						) : (
							<textarea
								value={genericJson}
								onChange={(e) => setGenericJson(e.target.value)}
								rows={7}
								placeholder={t("avatar.genericJsonHint")}
								className={cn(field, "resize-none font-mono text-[10.5px]")}
							/>
						)}
						<div className="flex items-center gap-2">
							<button
								type="button"
								onClick={saveCfg}
								className="rounded-md bg-[#34B27B] px-3 py-1.5 text-[11.5px] font-semibold text-[#06140d] transition-colors hover:bg-[#34B27B]/90"
							>
								{t("avatar.save")}
							</button>
							{savedHint && <span className="text-[11px] text-[#3DC489]">{t("avatar.saved")}</span>}
						</div>
						<p className="text-[10px] leading-relaxed text-slate-600">{t("avatar.setupHint")}</p>
					</div>
				)}

				{/* 投料:口播稿 */}
				<textarea
					value={script}
					onChange={(e) => setScript(e.target.value)}
					rows={7}
					placeholder={t("avatar.scriptPlaceholder")}
					className={cn(field, "resize-none")}
				/>
				<input
					value={title}
					onChange={(e) => setTitle(e.target.value)}
					placeholder={t("avatar.titleField")}
					className={field}
				/>
				{error && (
					<div className="flex items-start gap-1.5 rounded-lg bg-red-500/10 px-3 py-2 text-[11px] text-red-300">
						<AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
						<span>{error}</span>
					</div>
				)}
				<button
					type="button"
					onClick={submit}
					disabled={submitting || !cfg?.hasApiKey}
					className="flex items-center justify-center gap-1.5 rounded-lg bg-[#34B27B] px-3 py-2 text-[12px] font-semibold text-[#06140d] transition-colors hover:bg-[#34B27B]/90 disabled:cursor-not-allowed disabled:opacity-40"
				>
					{submitting ? (
						<Loader2 className="h-3.5 w-3.5 animate-spin" />
					) : (
						<Play className="h-3.5 w-3.5" />
					)}
					{t("avatar.generate")}
				</button>
				{!cfg?.hasApiKey && (
					<p className="text-[10.5px] leading-relaxed text-amber-300/80">
						{t("avatar.needConfig")}
					</p>
				)}
			</div>

			{/* 右:任务列表 */}
			<div className="flex min-w-0 flex-1 flex-col overflow-auto p-5 custom-scrollbar">
				<h2 className="mb-3 flex items-center gap-1.5 text-[13px] font-semibold text-slate-100">
					<Bot className="h-4 w-4 text-[#3DC489]" />
					{t("avatar.jobsTitle")}
				</h2>
				{jobs.length === 0 ? (
					<p className="mt-8 text-center text-[12px] text-slate-600">{t("avatar.jobsEmpty")}</p>
				) : (
					<div className="space-y-2">
						{jobs.map((job) => {
							const active = ACTIVE.has(job.status);
							return (
								<div
									key={job.id}
									className="rounded-xl border border-white/[0.07] bg-[#15181C] px-3.5 py-2.5"
								>
									<div className="flex items-center gap-2.5">
										{active ? (
											<Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#3DC489]" />
										) : job.status === "done" ? (
											<CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#3DC489]" />
										) : (
											<AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-300" />
										)}
										<User className="h-3 w-3 shrink-0 text-slate-500" />
										<span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-slate-200">
											{job.title}
										</span>
										<span className="shrink-0 text-[10px] text-slate-500">
											{t(`avatar.status.${job.status}`)}
										</span>
									</div>
									{job.message && active && (
										<p className="mt-1 pl-6 text-[11px] text-slate-500">{job.message}</p>
									)}
									{job.error && <p className="mt-1 pl-6 text-[11px] text-red-300">{job.error}</p>}
									<div className="mt-2 flex items-center gap-2 pl-6">
										{job.status === "done" && job.videoPath && (
											<button
												type="button"
												onClick={() => avatar?.openOutput(job.videoPath as string)}
												className="flex items-center gap-1.5 rounded-md bg-white/[0.04] px-2.5 py-1 text-[11px] text-slate-300 transition-colors hover:bg-white/[0.08]"
											>
												<FolderOpen className="h-3 w-3 text-[#3DC489]" />
												{t("avatar.openOutput")}
											</button>
										)}
										{!active && (
											<button
												type="button"
												onClick={() => removeJob(job.id)}
												className="flex items-center gap-1.5 rounded-md border border-white/[0.08] px-2.5 py-1 text-[11px] text-slate-400 transition-colors hover:bg-red-500/[0.12] hover:text-red-300"
											>
												<Trash2 className="h-3 w-3" />
												{t("avatar.delete")}
											</button>
										)}
									</div>
								</div>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);
}

export default AvatarPanel;
