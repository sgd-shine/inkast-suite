import { describe, expect, it } from "vitest";
import type { TranscriptWord } from "@/lib/asr/types";
import { activeCueAt, buildSubtitleCues } from "./subtitleCues";

function w(text: string, startMs: number, endMs: number): TranscriptWord {
	return { text, startMs, endMs };
}

describe("buildSubtitleCues", () => {
	it("returns nothing for empty input", () => {
		expect(buildSubtitleCues([])).toEqual([]);
	});

	it("groups continuous words into one cue", () => {
		const words = [w("你好", 0, 400), w("世界", 400, 900)];
		const cues = buildSubtitleCues(words);
		expect(cues).toHaveLength(1);
		expect(cues[0]).toMatchObject({ startMs: 0, endMs: 900, text: "你好世界" });
	});

	it("breaks at a long pause", () => {
		const words = [w("第一句", 0, 800), w("第二句", 2000, 2800)];
		const cues = buildSubtitleCues(words, { pauseGapMs: 600 });
		expect(cues).toHaveLength(2);
		expect(cues[0].text).toBe("第一句");
		expect(cues[1].text).toBe("第二句");
	});

	it("breaks at sentence-ending punctuation", () => {
		const words = [w("好的。", 0, 500), w("继续", 600, 900)];
		const cues = buildSubtitleCues(words, { pauseGapMs: 5000 });
		expect(cues).toHaveLength(2);
	});

	it("breaks when exceeding max duration", () => {
		const words = [w("一", 0, 2000), w("二", 2000, 4000), w("三", 4000, 6000)];
		const cues = buildSubtitleCues(words, { maxDurationMs: 5000, maxChars: 999, pauseGapMs: 9999 });
		expect(cues.length).toBeGreaterThanOrEqual(2);
	});

	it("breaks when exceeding max chars", () => {
		const words = Array.from({ length: 10 }, (_, i) => w("字", i * 100, i * 100 + 90));
		const cues = buildSubtitleCues(words, { maxChars: 4, maxDurationMs: 99999, pauseGapMs: 9999 });
		expect(cues.length).toBeGreaterThanOrEqual(2);
	});

	it("folds latin length (~2 chars = 1) so English isn't cut too early", () => {
		// 17 个拉丁字符,折半后视觉长度 ceil(17/2)=9 ≤ 10 → 不该断;若回退成 1:1(17>10)会断成 2 条。
		const words = [w("alpha", 0, 300), w("bravo", 300, 600), w("charlie", 600, 900)];
		const cues = buildSubtitleCues(words, {
			maxChars: 10,
			maxDurationMs: 999999,
			pauseGapMs: 999999,
		});
		expect(cues).toHaveLength(1);
	});

	it("joins latin words with spaces but CJK without", () => {
		const cjk = buildSubtitleCues([w("我们", 0, 300), w("开始", 300, 600)]);
		expect(cjk[0].text).toBe("我们开始");
		const latin = buildSubtitleCues([w("hello", 0, 300), w("world", 300, 600)]);
		expect(latin[0].text).toBe("hello world");
	});

	it("ignores blank / zero-length words", () => {
		const words = [w("  ", 0, 300), w("嗯", 100, 100), w("正文", 1000, 1400)];
		const cues = buildSubtitleCues(words);
		expect(cues).toHaveLength(1);
		expect(cues[0].text).toBe("正文");
	});

	it("assigns unique ids", () => {
		const words = [w("a", 0, 100), w("b", 2000, 2100), w("c", 4000, 4100)];
		const cues = buildSubtitleCues(words, { pauseGapMs: 500 });
		const ids = new Set(cues.map((c) => c.id));
		expect(ids.size).toBe(cues.length);
	});
});

describe("activeCueAt", () => {
	const cues = buildSubtitleCues([w("一", 0, 1000), w("二", 2000, 3000)], { pauseGapMs: 500 });

	it("finds the cue covering a time", () => {
		expect(activeCueAt(cues, 500)?.text).toBe("一");
		expect(activeCueAt(cues, 2500)?.text).toBe("二");
	});

	it("returns null in a gap or past the end", () => {
		expect(activeCueAt(cues, 1500)).toBeNull();
		expect(activeCueAt(cues, 9999)).toBeNull();
	});

	it("is end-exclusive", () => {
		expect(activeCueAt(cues, 1000)).toBeNull();
	});
});
