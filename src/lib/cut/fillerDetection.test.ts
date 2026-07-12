import { describe, expect, it } from "vitest";
import type { TranscriptWord } from "@/lib/asr/types";
import { DEFAULT_FILLERS, detectFillers, totalFillerMs } from "./fillerDetection";

function w(text: string, startMs: number, endMs: number): TranscriptWord {
	return { text, startMs, endMs };
}

describe("detectFillers", () => {
	it("returns nothing for empty input", () => {
		expect(detectFillers([])).toEqual([]);
	});

	it("returns nothing when no fillers present", () => {
		const words = [w("我们", 0, 400), w("开始", 400, 800), w("吧", 800, 1000)];
		// 「吧」不在默认词表里(刻意保守),所以无命中。
		expect(detectFillers(words)).toEqual([]);
	});

	it("catches a standalone Chinese filler with padding", () => {
		const words = [w("我们", 0, 500), w("嗯", 1000, 1300), w("继续", 2000, 2400)];
		const out = detectFillers(words, { paddingMs: 60, mergeGapMs: 400 });
		expect(out).toHaveLength(1);
		expect(out[0].startMs).toBe(940);
		expect(out[0].endMs).toBe(1360);
	});

	it("matches whole word only, not substrings", () => {
		// 「然后我们」整段不等于「然后」,不该命中。
		const words = [w("然后我们", 0, 600), w("然后", 1000, 1300)];
		const out = detectFillers(words, { paddingMs: 0 });
		expect(out).toHaveLength(1);
		expect(out[0].startMs).toBe(1000);
		expect(out[0].endMs).toBe(1300);
	});

	it("merges adjacent fillers within the gap", () => {
		const words = [w("呃", 1000, 1200), w("那个", 1300, 1600)];
		const out = detectFillers(words, { paddingMs: 0, mergeGapMs: 400 });
		expect(out).toHaveLength(1);
		expect(out[0].startMs).toBe(1000);
		expect(out[0].endMs).toBe(1600);
		expect(out[0].text).toBe("呃 那个");
	});

	it("does not merge fillers separated by more than the gap", () => {
		const words = [w("呃", 1000, 1200), w("那个", 3000, 3300)];
		const out = detectFillers(words, { paddingMs: 0, mergeGapMs: 400 });
		expect(out).toHaveLength(2);
	});

	it("handles English fillers case-insensitively and strips punctuation", () => {
		const words = [w(" Um,", 500, 800), w(" hello", 800, 1200), w("UH.", 1500, 1700)];
		const out = detectFillers(words, { paddingMs: 0, mergeGapMs: 100 });
		expect(out.map((s) => [s.startMs, s.endMs])).toEqual([
			[500, 800],
			[1500, 1700],
		]);
	});

	it("ignores words with invalid/zero-length timestamps", () => {
		const words = [w("嗯", 100, 100), w("呃", Number.NaN, 500), w("额", 1000, 1300)];
		const out = detectFillers(words, { paddingMs: 0 });
		expect(out).toHaveLength(1);
		expect(out[0].startMs).toBe(1000);
	});

	it("clamps padding at zero and prevents overlap with previous segment", () => {
		const words = [w("嗯", 50, 200), w("呃", 5000, 5200)];
		const out = detectFillers(words, { paddingMs: 100, mergeGapMs: 400 });
		expect(out[0].startMs).toBe(0); // 50-100 clamped to 0
	});

	it("returns empty when lexicon is empty", () => {
		const words = [w("嗯", 0, 300)];
		expect(detectFillers(words, { fillers: [] })).toEqual([]);
	});

	it("totalFillerMs sums durations", () => {
		const segs = [
			{ startMs: 0, endMs: 300, text: "a" },
			{ startMs: 1000, endMs: 1500, text: "b" },
		];
		expect(totalFillerMs(segs)).toBe(800);
	});

	it("DEFAULT_FILLERS excludes risky meaningful words", () => {
		expect(DEFAULT_FILLERS).not.toContain("其实");
		expect(DEFAULT_FILLERS).not.toContain("对吧");
		expect(DEFAULT_FILLERS).toContain("嗯");
	});
});
