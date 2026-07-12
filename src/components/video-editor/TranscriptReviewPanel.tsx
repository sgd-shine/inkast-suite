import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useScopedT } from "@/contexts/I18nContext";
import type { TranscriptWord } from "@/lib/asr/types";
import type { FillerSegment } from "@/lib/cut/fillerDetection";
import {
	type CutSegment,
	fillerWordIndices,
	selectedWordsToSegments,
} from "@/lib/cut/wordSelection";

// Inkast §4 Phase 2 逐条复核面板:把转写文本逐词列出,语气词预选(红色删除线),
// 点词切换删/留,底部显示将删片段数 + 时长,应用 = 转成 TrimRegion(可撤销)。

interface TranscriptReviewPanelProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	words: TranscriptWord[];
	fillers: FillerSegment[];
	onApply: (segments: CutSegment[]) => void;
}

export function TranscriptReviewPanel({
	open,
	onOpenChange,
	words,
	fillers,
	onApply,
}: TranscriptReviewPanelProps) {
	const t = useScopedT("timeline");
	const [selected, setSelected] = useState<Set<number>>(() => new Set());

	const fillerIndices = useMemo(() => fillerWordIndices(words, fillers), [words, fillers]);
	const fillerSet = useMemo(() => new Set(fillerIndices), [fillerIndices]);

	// 每次打开(或词/语气词变化)时,预选所有语气词。
	useEffect(() => {
		if (!open) return;
		setSelected(new Set(fillerIndices));
	}, [open, fillerIndices]);

	const segments = useMemo(() => selectedWordsToSegments(words, selected), [words, selected]);
	const totalMs = segments.reduce((sum, s) => sum + (s.endMs - s.startMs), 0);

	const toggle = (index: number) =>
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(index)) next.delete(index);
			else next.add(index);
			return next;
		});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-2xl bg-[#0e0e11] border-white/10 text-slate-200">
				<DialogHeader>
					<DialogTitle className="text-slate-100">{t("review.title")}</DialogTitle>
				</DialogHeader>
				<p className="-mt-2 text-[11px] leading-relaxed text-slate-500">{t("review.hint")}</p>

				<div className="max-h-[46vh] overflow-y-auto rounded-lg border border-white/10 bg-black/30 p-4 text-[15px] leading-[2.1]">
					{words.length === 0 ? (
						<span className="text-sm text-slate-500">{t("review.empty")}</span>
					) : (
						words.map((word, index) => {
							const isSelected = selected.has(index);
							const isFiller = fillerSet.has(index);
							return (
								<span key={`${word.startMs}-${word.endMs}-${index}`}>
									<button
										type="button"
										onClick={() => toggle(index)}
										className={`rounded px-0.5 transition-colors ${
											isSelected
												? "bg-red-500/25 text-red-200 line-through decoration-red-400/70"
												: isFiller
													? "bg-amber-400/15 text-amber-200 hover:bg-amber-400/25"
													: "text-slate-200 hover:bg-white/10"
										}`}
									>
										{word.text.trim() || "·"}
									</button>{" "}
								</span>
							);
						})
					)}
				</div>

				<div className="flex items-center justify-between gap-2 pt-1">
					<div className="text-[11px] text-slate-400">
						{t("review.willCut", {
							count: String(segments.length),
							seconds: (totalMs / 1000).toFixed(1),
						})}
					</div>
					<div className="flex items-center gap-1.5">
						<Button
							variant="ghost"
							size="sm"
							className="h-7 text-[11px] text-slate-300 hover:bg-white/10"
							onClick={() => setSelected(new Set(fillerIndices))}
						>
							{t("review.selectFillers")}
						</Button>
						<Button
							variant="ghost"
							size="sm"
							className="h-7 text-[11px] text-slate-300 hover:bg-white/10"
							onClick={() => setSelected(new Set())}
						>
							{t("review.clear")}
						</Button>
					</div>
				</div>

				<DialogFooter>
					<Button
						variant="ghost"
						size="sm"
						onClick={() => onOpenChange(false)}
						className="h-8 text-slate-300 hover:bg-white/10"
					>
						{t("review.cancel")}
					</Button>
					<Button
						size="sm"
						disabled={segments.length === 0}
						onClick={() => {
							onApply(segments);
							onOpenChange(false);
						}}
						className="h-8 bg-[#34B27B] text-white hover:bg-[#2fa06f]"
					>
						{t("review.apply")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
