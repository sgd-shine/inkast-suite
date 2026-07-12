import {
	Captions,
	Eye,
	EyeOff,
	ListChecks,
	Loader2,
	MessageSquareText,
	Sparkles,
	Trash2,
	X,
} from "lucide-react";
import { useScopedT } from "@/contexts/I18nContext";
import { cn } from "@/lib/utils";

export type TranscriptionStatus =
	| "idle"
	| "preparing"
	| "transcribing"
	| "ready"
	| "error"
	| "no-audio";

export interface SmartCutPanelProps {
	/** 停顿(能量 VAD,进编辑器自动跑)。 */
	pauseReady: boolean;
	pauseAnalyzing: boolean;
	pauseCount: number;
	pauseSavableMs: number;
	onRemoveAllPauses: () => void;
	/** 废话 / 语气词(按需本地转写)。 */
	transcriptionStatus: TranscriptionStatus;
	transcriptionProgress: number;
	fillerCount: number;
	fillerSavableMs: number;
	onTranscribe: () => void;
	onRemoveFillers: () => void;
	onReviewFillers: () => void;
	/** 字幕(复用同一套转写)。 */
	subtitleCount: number;
	showSubtitles: boolean;
	onGenerateSubtitles: () => void;
	onToggleSubtitles: () => void;
	/** 关闭面板。 */
	onClose?: () => void;
}

function StatCard({
	dotClass,
	label,
	value,
	valueClass,
}: {
	dotClass: string;
	label: string;
	value: string;
	valueClass?: string;
}) {
	return (
		<div className="flex-1 rounded-[9px] border border-white/[0.07] bg-[#1B1F24] px-2.5 py-2">
			<div className="flex items-center gap-1.5 text-[10px] text-slate-500">
				<span className={cn("h-2 w-2 rounded-[2px]", dotClass)} />
				{label}
			</div>
			<div
				className={cn("mt-1 text-[17px] font-bold tabular-nums", valueClass ?? "text-slate-100")}
			>
				{value}
			</div>
		</div>
	);
}

/**
 * Inkast 界面对齐 Phase 2:智能粗剪侧面板(对齐 Inkast-智能粗剪-Demo.html)。
 * 把原来挤在时间线工具条下拉里的「删停顿 / 删废话 / 逐条复核 / 字幕」重新呈现成
 * 统计卡 + 分组操作的右侧面板。**所有逻辑都来自既有 handler,这里只是重新摆放。**
 */
export function SmartCutPanel({
	pauseReady,
	pauseAnalyzing,
	pauseCount,
	pauseSavableMs,
	onRemoveAllPauses,
	transcriptionStatus,
	transcriptionProgress,
	fillerCount,
	fillerSavableMs,
	onTranscribe,
	onRemoveFillers,
	onReviewFillers,
	subtitleCount,
	showSubtitles,
	onGenerateSubtitles,
	onToggleSubtitles,
	onClose,
}: SmartCutPanelProps) {
	const t = useScopedT("timeline");
	const savableSeconds = ((pauseSavableMs + fillerSavableMs) / 1000).toFixed(1);
	const transcribed = transcriptionStatus === "ready";

	return (
		<div className="flex h-full w-full flex-col bg-[#15181C] text-slate-200">
			{/* 头部 */}
			<div className="flex items-start justify-between gap-2 border-b border-white/[0.07] px-4 py-3">
				<div className="min-w-0">
					<h2 className="flex items-center gap-2 text-[14px] font-semibold">
						<Sparkles className="h-4 w-4 text-[#34B27B]" />
						{t("smartCut.button")}
						<span className="rounded-full border border-[#34B27B]/40 bg-[#34B27B]/[0.14] px-1.5 py-px text-[9.5px] text-[#3DC489]">
							{t("smartCut.localTag")}
						</span>
					</h2>
					<p className="mt-1 text-[11px] leading-relaxed text-slate-500">
						{t("smartCut.panelHint")}
					</p>
				</div>
				{onClose && (
					<button
						type="button"
						onClick={onClose}
						title={t("smartCut.close")}
						className="shrink-0 rounded-md p-1 text-slate-500 hover:bg-white/[0.07] hover:text-slate-200"
					>
						<X className="h-4 w-4" />
					</button>
				)}
			</div>

			{/* 统计卡 */}
			<div className="flex gap-2 border-b border-white/[0.07] px-4 py-3">
				<StatCard
					dotClass="bg-[#5AA0E6]"
					label={t("smartCut.statFillers")}
					value={transcribed ? String(fillerCount) : "—"}
				/>
				<StatCard
					dotClass="bg-[#E0A23C]"
					label={t("smartCut.statPauses")}
					value={String(pauseCount)}
				/>
				<StatCard
					dotClass="bg-[#34B27B]"
					label={t("smartCut.statSavable")}
					value={`${savableSeconds}s`}
					valueClass="text-[#3DC489]"
				/>
			</div>

			{/* 可滚动正文 */}
			<div className="flex-1 overflow-auto px-4 py-3 space-y-4 custom-scrollbar">
				{/* 停顿 */}
				<section>
					<div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
						<span className="h-2 w-2 rounded-[2px] bg-[#E0A23C]" />
						{t("smartCut.pauseSection")}
					</div>
					{pauseAnalyzing ? (
						<p className="flex items-center gap-2 text-[11px] text-slate-400">
							<Loader2 className="h-3.5 w-3.5 animate-spin" />
							{t("smartCut.analyzing")}
						</p>
					) : !pauseReady ? (
						<p className="text-[11px] text-slate-400">{t("smartCut.noAudio")}</p>
					) : pauseCount > 0 ? (
						<>
							<p className="text-[11px] leading-relaxed text-slate-300">
								{t("smartCut.pausesFound", { count: String(pauseCount) })}{" "}
								<span className="text-slate-500">
									· {t("smartCut.canSave", { seconds: (pauseSavableMs / 1000).toFixed(1) })}
								</span>
							</p>
							<button
								type="button"
								onClick={onRemoveAllPauses}
								className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-[#34B27B] px-3 py-2 text-[12px] font-semibold text-[#06140d] transition-colors hover:bg-[#3DC489]"
							>
								<Trash2 className="h-3.5 w-3.5" />
								{t("smartCut.removeAll")}
							</button>
						</>
					) : (
						<p className="text-[11px] text-slate-400">{t("smartCut.none")}</p>
					)}
				</section>

				{/* 废话 / 语气词 */}
				<section className="border-t border-white/[0.06] pt-4">
					<div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
						<span className="h-2 w-2 rounded-[2px] bg-[#5AA0E6]" />
						{t("smartCut.fillerSection")}
					</div>
					{transcriptionStatus === "idle" ? (
						<>
							<button
								type="button"
								onClick={onTranscribe}
								className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-[12px] font-medium text-slate-200 transition-colors hover:bg-white/[0.08]"
							>
								<MessageSquareText className="h-3.5 w-3.5 text-[#34B27B]" />
								{t("smartCut.transcribe")}
							</button>
							<p className="mt-2 text-[10.5px] leading-relaxed text-slate-600">
								{t("smartCut.transcribeHint")}
							</p>
						</>
					) : transcriptionStatus === "preparing" || transcriptionStatus === "transcribing" ? (
						<p className="flex items-center gap-2 text-[11px] text-slate-400">
							<Loader2 className="h-3.5 w-3.5 animate-spin" />
							{transcriptionStatus === "preparing"
								? t("smartCut.preparing")
								: `${t("smartCut.transcribing")} ${Math.round((transcriptionProgress ?? 0) * 100)}%`}
						</p>
					) : transcriptionStatus === "error" ? (
						<button
							type="button"
							onClick={onTranscribe}
							className="flex w-full items-center justify-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.08] px-3 py-2 text-[12px] font-medium text-amber-400 transition-colors hover:bg-amber-500/[0.14]"
						>
							<MessageSquareText className="h-3.5 w-3.5" />
							{t("smartCut.transcribeRetry")}
						</button>
					) : transcriptionStatus === "no-audio" ? (
						<p className="text-[11px] text-slate-400">{t("smartCut.noAudio")}</p>
					) : (
						// ready
						<div className="space-y-2">
							<p className="text-[11px] leading-relaxed text-slate-300">
								{fillerCount > 0
									? t("smartCut.fillersFound", { count: String(fillerCount) })
									: t("smartCut.noFillers")}
							</p>
							{fillerCount > 0 && (
								<button
									type="button"
									onClick={onRemoveFillers}
									className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#34B27B] px-3 py-2 text-[12px] font-semibold text-[#06140d] transition-colors hover:bg-[#3DC489]"
								>
									<Trash2 className="h-3.5 w-3.5" />
									{t("smartCut.removeFillers")}
								</button>
							)}
							<button
								type="button"
								onClick={onReviewFillers}
								className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-[12px] font-medium text-slate-200 transition-colors hover:bg-white/[0.08]"
							>
								<ListChecks className="h-3.5 w-3.5 text-slate-400" />
								{t("smartCut.reviewFillers")}
							</button>
						</div>
					)}
				</section>

				{/* 字幕 */}
				<section className="border-t border-white/[0.06] pt-4">
					<div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
						<Captions className="h-3 w-3 text-[#34B27B]" />
						{t("subtitles.section")}
					</div>
					{transcribed ? (
						<div className="space-y-2">
							<button
								type="button"
								onClick={onGenerateSubtitles}
								className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-[12px] font-medium text-slate-200 transition-colors hover:bg-white/[0.08]"
							>
								<Captions className="h-3.5 w-3.5 text-[#34B27B]" />
								{subtitleCount > 0 ? t("subtitles.regenerate") : t("subtitles.generate")}
							</button>
							{subtitleCount > 0 && (
								<button
									type="button"
									onClick={onToggleSubtitles}
									className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-[12px] font-medium text-slate-200 transition-colors hover:bg-white/[0.08]"
								>
									{showSubtitles ? (
										<EyeOff className="h-3.5 w-3.5 text-slate-400" />
									) : (
										<Eye className="h-3.5 w-3.5 text-slate-400" />
									)}
									{showSubtitles
										? t("subtitles.hide", { count: String(subtitleCount) })
										: t("subtitles.show", { count: String(subtitleCount) })}
								</button>
							)}
						</div>
					) : (
						<p className="text-[11px] text-slate-400">{t("subtitles.needTranscribe")}</p>
					)}
				</section>
			</div>

			{/* 脚注 */}
			<div className="border-t border-white/[0.07] px-4 py-2.5">
				<p className="text-[10px] leading-relaxed text-slate-600">{t("smartCut.hint")}</p>
			</div>
		</div>
	);
}

export default SmartCutPanel;
