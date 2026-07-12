import {
	AlertTriangle,
	Clapperboard,
	Eye,
	FileText,
	FolderOpen,
	Loader2,
	RefreshCw,
	Video,
	Wand2,
	X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useScopedT } from "@/contexts/I18nContext";
import { loadFileAsArrayBuffer } from "@/lib/exporter/streamingDecoder";
import type { LibraryItem, LibraryResult } from "@/lib/libraryTypes";
import { cn } from "@/lib/utils";

const library = typeof window !== "undefined" ? window.electronAPI?.library : undefined;

type T = (key: string, vars?: Record<string, string | number>) => string;

function fmtSize(bytes?: number): string {
	if (!bytes) return "";
	const mb = bytes / (1024 * 1024);
	if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
	if (mb >= 1) return `${mb.toFixed(1)} MB`;
	return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function fmtWhen(ms?: number): string {
	if (!ms) return "";
	const d = new Date(ms);
	const p = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Inkast 整合 · 资料库 Tab(P5·读真实产物)。
 * 统一列出 录屏原档(userData/recordings) + 成片(引擎 output) + 拉片报告(output/analyses),
 * 都按路径读、不复制;点「打开」在访达定位。漏斗的资产沉淀层。
 * 录屏不再有「去成片」——录屏的剪辑/字幕/导出在「录制」Tab 收口,成片引擎只做文案→视频。
 */
export function LibraryPanel() {
	const t = useScopedT("editor");
	const [res, setRes] = useState<LibraryResult | null>(null);
	const [preview, setPreview] = useState<LibraryItem | null>(null);
	// 视频工作流桥接(POC):110 工作区可用时,录屏行显示「送进视频工作流」。
	const [flowOk, setFlowOk] = useState(false);
	const [sending, setSending] = useState<string | null>(null);

	const load = useCallback(async () => {
		if (!library) return;
		setRes(await library.list());
	}, []);

	useEffect(() => {
		load();
		window.electronAPI?.videoflow?.info().then((r) => setFlowOk(!!r?.ok));
	}, [load]);

	const open = (p: string) => library?.open(p);

	// 录屏 → 110 视频剪辑项目:建项目 + 复制素材 + 复制 Codex 启动提示词到剪贴板。
	const sendToFlow = useCallback(
		async (it: LibraryItem) => {
			const api = window.electronAPI?.videoflow;
			if (!api) return;
			setSending(it.path);
			const r = await api.sendRecording({
				path: it.path,
				title: it.name.replace(/\.[^.]+$/, ""),
			});
			setSending(null);
			if (!r.ok) {
				toast.error(r.error || t("library.flow.failed"));
				return;
			}
			if (r.prompt) navigator.clipboard?.writeText(r.prompt);
			toast.success(t("library.flow.done"), {
				duration: 10000,
				action: {
					label: t("library.flow.openProject"),
					onClick: () => {
						if (r.projectDir) api.openProject(r.projectDir);
					},
				},
			});
		},
		[t],
	);
	const d = res?.data;

	const sections: Array<{ key: string; icon: React.ReactNode; items: LibraryItem[] }> = [
		{ key: "recordings", icon: <Video className="h-4 w-4" />, items: d?.recordings ?? [] },
		{ key: "films", icon: <Clapperboard className="h-4 w-4" />, items: d?.films ?? [] },
		{ key: "analyses", icon: <FileText className="h-4 w-4" />, items: d?.analyses ?? [] },
	];

	return (
		<div className="flex h-full w-full flex-col overflow-hidden bg-[#0A0C0E]">
			<div className="flex shrink-0 items-center gap-3 border-b border-white/[0.07] bg-[#0C0F12] px-5 py-2.5">
				<span className="text-[13px] font-semibold text-slate-100">{t("library.title")}</span>
				<span className="flex-1" />
				<button
					type="button"
					onClick={load}
					className="rounded-md p-1 text-slate-500 hover:bg-white/[0.06] hover:text-slate-300"
					title={t("library.refresh")}
				>
					<RefreshCw className="h-3.5 w-3.5" />
				</button>
			</div>

			<div className="min-h-0 flex-1 overflow-auto p-5 custom-scrollbar">
				{!res ? (
					<p className="mt-8 text-center text-[12px] text-slate-600">…</p>
				) : !res.ok ? (
					<div className="mx-auto mt-10 max-w-lg space-y-3 text-center">
						<AlertTriangle className="mx-auto h-8 w-8 text-amber-400" />
						<h2 className="text-[14px] font-semibold text-slate-100">{t("library.errorTitle")}</h2>
						<p className="text-[12px] text-red-300">{res.error}</p>
					</div>
				) : (
					<div className="space-y-6">
						{sections.map((sec) => (
							<div key={sec.key}>
								<div className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-slate-300">
									<span className="text-[#3DC489]">{sec.icon}</span>
									{t(`library.sections.${sec.key}`)}
									<span className="text-[10px] font-normal text-slate-600">{sec.items.length}</span>
								</div>
								{sec.items.length === 0 ? (
									<p className="text-[11px] text-slate-600">{t("library.empty")}</p>
								) : (
									<div className="space-y-1.5">
										{sec.items.map((it) => (
											<div
												key={it.path}
												className="group flex w-full items-center gap-2.5 rounded-lg border border-white/[0.06] bg-[#15181C] px-3 py-2 transition-colors hover:bg-white/[0.04]"
											>
												<button
													type="button"
													onClick={() => setPreview(it)}
													className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
													title={t("library.previewTip")}
												>
													<Eye className="h-3.5 w-3.5 shrink-0 text-slate-500 group-hover:text-[#3DC489]" />
													<span className="min-w-0 flex-1 truncate text-[12px] text-slate-200">
														{it.name}
													</span>
												</button>
												<span className="shrink-0 text-[10.5px] text-slate-600">
													{fmtWhen(it.modifiedMs)}
												</span>
												{it.sizeBytes ? (
													<span className="shrink-0 text-[10.5px] text-slate-600">
														{fmtSize(it.sizeBytes)}
													</span>
												) : null}
												{it.kind === "recording" && flowOk && (
													<button
														type="button"
														onClick={() => sendToFlow(it)}
														disabled={sending === it.path}
														title={t("library.flow.send")}
														className="flex shrink-0 items-center gap-1 rounded-md border border-violet-500/40 bg-violet-500/[0.12] px-2 py-1 text-[10.5px] font-medium text-violet-200 transition-colors hover:bg-violet-500/[0.22] disabled:opacity-60"
													>
														{sending === it.path ? (
															<Loader2 className="h-3 w-3 animate-spin" />
														) : (
															<Wand2 className="h-3 w-3" />
														)}
														{t("library.flow.send")}
													</button>
												)}
												<button
													type="button"
													onClick={() => open(it.path)}
													title={t("library.openInFinder")}
													className="shrink-0 rounded p-1 text-slate-500 opacity-0 transition-opacity hover:text-slate-200 group-hover:opacity-100"
												>
													<FolderOpen className="h-3.5 w-3.5" />
												</button>
											</div>
										))}
									</div>
								)}
							</div>
						))}
					</div>
				)}
			</div>

			{preview && (
				<LibraryPreview
					item={preview}
					t={t}
					onClose={() => setPreview(null)}
					onOpen={open}
					flowOk={flowOk}
					sendingThis={sending === preview.path}
					onSendToFlow={() => sendToFlow(preview)}
				/>
			)}
		</div>
	);
}

const VIDEO_RE = /\.(mp4|mov|m4v|webm)$/i;

/** 站内预览抽屉:视频内联播放(经本地文件→blob),拉片报告读文本。复用资料库路径白名单。 */
function LibraryPreview({
	item,
	t,
	onClose,
	onOpen,
	flowOk,
	sendingThis,
	onSendToFlow,
}: {
	item: LibraryItem;
	t: T;
	onClose: () => void;
	onOpen: (p: string) => void;
	flowOk: boolean;
	sendingThis: boolean;
	onSendToFlow: () => void;
}) {
	const isVideo = item.kind !== "analysis" && VIDEO_RE.test(item.path);
	const [videoUrl, setVideoUrl] = useState<string | null>(null);
	const [text, setText] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let alive = true;
		let url: string | null = null;
		setLoading(true);
		setError(null);
		setText(null);
		setVideoUrl(null);
		(async () => {
			try {
				if (isVideo) {
					const { data } = await loadFileAsArrayBuffer(item.path);
					if (!alive) return;
					url = URL.createObjectURL(new Blob([data]));
					setVideoUrl(url);
				} else {
					const r = await library?.read(item.path);
					if (!alive) return;
					if (r?.ok) setText(r.data ?? "");
					else setError(r?.error || t("library.previewFailed"));
				}
			} catch (e) {
				if (alive) setError(e instanceof Error ? e.message : String(e));
			} finally {
				if (alive) setLoading(false);
			}
		})();
		return () => {
			alive = false;
			if (url) URL.revokeObjectURL(url);
		};
	}, [item.path, isVideo, t]);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	return (
		<div className="absolute inset-0 z-40 flex justify-end bg-black/50" onClick={onClose}>
			<div
				className={cn(
					"flex h-full flex-col border-l border-white/[0.1] bg-[#0C0F12] shadow-2xl",
					isVideo ? "w-[640px] max-w-[92%]" : "w-[520px] max-w-[90%]",
				)}
				onClick={(e) => e.stopPropagation()}
			>
				<div className="flex shrink-0 items-center gap-2 border-b border-white/[0.07] px-4 py-3">
					<span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-slate-100">
						{item.name}
					</span>
					{item.kind === "recording" && flowOk && (
						<button
							type="button"
							onClick={onSendToFlow}
							disabled={sendingThis}
							title={t("library.flow.send")}
							className="flex shrink-0 items-center gap-1 rounded-md border border-violet-500/40 bg-violet-500/[0.12] px-2.5 py-1 text-[11px] font-medium text-violet-200 transition-colors hover:bg-violet-500/[0.22] disabled:opacity-60"
						>
							{sendingThis ? (
								<Loader2 className="h-3.5 w-3.5 animate-spin" />
							) : (
								<Wand2 className="h-3.5 w-3.5" />
							)}
							{t("library.flow.send")}
						</button>
					)}
					<button
						type="button"
						onClick={() => onOpen(item.path)}
						title={t("library.openInFinder")}
						className="text-slate-500 hover:text-slate-200"
					>
						<FolderOpen className="h-4 w-4" />
					</button>
					<button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-200">
						<X className="h-4 w-4" />
					</button>
				</div>
				<div className="custom-scrollbar min-h-0 flex-1 overflow-auto p-4">
					{loading ? (
						<div className="flex items-center justify-center gap-2 py-10 text-[12px] text-slate-500">
							<Loader2 className="h-4 w-4 animate-spin" />
							{t("library.previewLoading")}
						</div>
					) : error ? (
						<p className="text-[12px] text-amber-300/90">{error}</p>
					) : isVideo && videoUrl ? (
						<video src={videoUrl} controls autoPlay className="w-full rounded-lg bg-black">
							<track kind="captions" />
						</video>
					) : (
						<pre className="whitespace-pre-wrap font-sans text-[12px] leading-relaxed text-slate-300">
							{text}
						</pre>
					)}
				</div>
			</div>
		</div>
	);
}

export default LibraryPanel;
