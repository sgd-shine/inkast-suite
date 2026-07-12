import { describe, expect, it } from "vitest";
import type { TranscriptWord } from "@/lib/asr/types";
import type { FillerSegment } from "./fillerDetection";
import { fillerWordIndices, selectedWordsToSegments } from "./wordSelection";

function w(text: string, startMs: number, endMs: number): TranscriptWord {
	return { text, startMs, endMs };
}

const WORDS: TranscriptWord[] = [
	w("我们", 0, 400),
	w("嗯", 500, 800),
	w("开始", 900, 1300),
	w("呃", 3000, 3200),
	w("那个", 3250, 3500),
];

describe("fillerWordIndices", () => {
	it("returns empty when no fillers", () => {
		expect(fillerWordIndices(WORDS, [])).toEqual([]);
	});

	it("finds word indices overlapping filler segments", () => {
		const fillers: FillerSegment[] = [
			{ startMs: 440, endMs: 860, text: "嗯" },
			{ startMs: 2940, endMs: 3560, text: "呃 那个" },
		];
		expect(fillerWordIndices(WORDS, fillers)).toEqual([1, 3, 4]);
	});
});

describe("selectedWordsToSegments", () => {
	it("returns empty for empty selection", () => {
		expect(selectedWordsToSegments(WORDS, new Set())).toEqual([]);
	});

	it("converts a single selected word with padding", () => {
		const out = selectedWordsToSegments(WORDS, new Set([1]), { paddingMs: 60, mergeGapMs: 400 });
		expect(out).toEqual([{ startMs: 440, endMs: 860 }]);
	});

	it("merges adjacent selected words within the gap", () => {
		const out = selectedWordsToSegments(WORDS, new Set([3, 4]), { paddingMs: 0, mergeGapMs: 400 });
		expect(out).toEqual([{ startMs: 3000, endMs: 3500 }]);
	});

	it("does not merge selections separated by more than the gap", () => {
		const out = selectedWordsToSegments(WORDS, new Set([1, 3]), { paddingMs: 0, mergeGapMs: 400 });
		expect(out).toHaveLength(2);
	});

	it("sorts out-of-order selection and clamps padding at zero", () => {
		const out = selectedWordsToSegments(WORDS, new Set([2, 0]), { paddingMs: 100, mergeGapMs: 50 });
		expect(out[0].startMs).toBe(0); // 0-100 clamped
		expect(out).toHaveLength(2);
		expect(out[0].endMs).toBeLessThanOrEqual(out[1].startMs);
	});

	it("ignores out-of-range indices", () => {
		const out = selectedWordsToSegments(WORDS, new Set([99, 1]), { paddingMs: 0 });
		expect(out).toEqual([{ startMs: 500, endMs: 800 }]);
	});
});
