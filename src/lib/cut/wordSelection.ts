import type { TranscriptWord } from "@/lib/asr/types";
import type { FillerSegment } from "@/lib/cut/fillerDetection";

// Inkast §4 Phase 2 复核面板:把"选中的转写词"换成待删片段。纯函数,便于单测。
// 删除动作仍复用 TrimRegion(ripple + 导出剪掉),与一键删停顿/语气词同构。

export interface CutSegment {
	startMs: number;
	endMs: number;
}

/** 落在任一语气词片段内的词下标(用于打开复核面板时预选)。 */
export function fillerWordIndices(words: TranscriptWord[], fillers: FillerSegment[]): number[] {
	if (fillers.length === 0) return [];
	const result: number[] = [];
	for (let i = 0; i < words.length; i++) {
		const w = words[i];
		// 词与语气词片段有时间重叠即算命中。
		if (fillers.some((f) => w.startMs < f.endMs && w.endMs > f.startMs)) {
			result.push(i);
		}
	}
	return result;
}

export interface ToSegmentsOptions {
	/** 相邻选中词间隔 ≤ 此值则合并为一段。默认 400ms。 */
	mergeGapMs?: number;
	/** 每段前后各加的余量。默认 60ms。 */
	paddingMs?: number;
}

/** 把选中的词下标集合换成排序、合并、加余量、不重叠的待删片段。 */
export function selectedWordsToSegments(
	words: TranscriptWord[],
	selected: ReadonlySet<number>,
	options: ToSegmentsOptions = {},
): CutSegment[] {
	const mergeGapMs = options.mergeGapMs ?? 400;
	const paddingMs = options.paddingMs ?? 60;

	const picked = [...selected]
		.filter((i) => i >= 0 && i < words.length)
		.map((i) => words[i])
		.filter((w) => Number.isFinite(w.startMs) && Number.isFinite(w.endMs) && w.endMs > w.startMs)
		.sort((a, b) => a.startMs - b.startMs);
	if (picked.length === 0) return [];

	const merged: CutSegment[] = [];
	for (const w of picked) {
		const last = merged[merged.length - 1];
		if (last && w.startMs - last.endMs <= mergeGapMs) {
			last.endMs = Math.max(last.endMs, w.endMs);
		} else {
			merged.push({ startMs: w.startMs, endMs: w.endMs });
		}
	}

	for (let i = 0; i < merged.length; i++) {
		const seg = merged[i];
		seg.startMs = Math.max(0, seg.startMs - paddingMs);
		seg.endMs = seg.endMs + paddingMs;
		const prev = merged[i - 1];
		if (prev && seg.startMs < prev.endMs) {
			seg.startMs = prev.endMs;
		}
	}
	return merged;
}
