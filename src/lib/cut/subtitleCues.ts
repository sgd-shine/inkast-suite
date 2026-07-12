import type { SubtitleCue } from "@/components/video-editor/types";
import type { TranscriptWord } from "@/lib/asr/types";

// Inkast §4 Phase 3:把 whisper 的词级时间戳分组成字幕 cue。纯函数,便于单测。
// 分组规则:在长停顿处断句;一条 cue 超过 maxDurationMs 或 maxChars 也断;
// 句末标点(。!?…/.!?)优先断句。时间戳沿用源时间轴,导出/预览按源帧显示。

export interface BuildCuesOptions {
	/** 一条 cue 的最长时长。默认 5000ms。 */
	maxDurationMs?: number;
	/** 一条 cue 的最大"视觉长度"(CJK 按字算 1、连续拉丁/数字按每 2 字符算 1)。默认 42。 */
	maxChars?: number;
	/** 词间间隔 ≥ 此值视为停顿,强制断句。默认 600ms。 */
	pauseGapMs?: number;
}

const SENTENCE_END = /[。!?！？….!?]$/;
// CJK 统一表意文字 + CJK 标点 + 全角符号。
const CJK = /[　-鿿＀-￯]/;

function makeId(index: number): string {
	return `sub-${index}`;
}

/** 把连续词拼成可读文本:CJK 字符之间不加空格,其余用空格连接。 */
function joinWords(words: TranscriptWord[]): string {
	let out = "";
	for (const w of words) {
		const t = w.text.trim();
		if (!t) continue;
		if (out === "") {
			out = t;
			continue;
		}
		const prevChar = out[out.length - 1];
		const nextChar = t[0];
		// 中文与中文/标点之间不加空格;否则加一个空格。
		out += CJK.test(prevChar) || CJK.test(nextChar) ? t : ` ${t}`;
	}
	return out;
}

/**
 * 估算文本"视觉长度":CJK 字符算 1,连续拉丁/数字按每 2 字符算 1(英文一个字符≈半个汉字宽)。
 * 之前实现是一律 1:1,与文档承诺不符,导致英文字幕在 maxChars 处被切得过碎(review testqa F4)。
 */
function visualLength(words: TranscriptWord[]): number {
	let len = 0;
	let latinRun = 0;
	const flushLatin = () => {
		if (latinRun > 0) {
			len += Math.ceil(latinRun / 2);
			latinRun = 0;
		}
	};
	for (const w of words) {
		for (const ch of w.text.trim()) {
			if (CJK.test(ch)) {
				flushLatin();
				len += 1;
			} else {
				latinRun += 1;
			}
		}
	}
	flushLatin();
	return len;
}

export function buildSubtitleCues(
	words: TranscriptWord[],
	options: BuildCuesOptions = {},
): SubtitleCue[] {
	const maxDurationMs = options.maxDurationMs ?? 5000;
	const maxChars = options.maxChars ?? 42;
	const pauseGapMs = options.pauseGapMs ?? 600;

	const valid = words.filter(
		(w) =>
			w.text.trim().length > 0 &&
			Number.isFinite(w.startMs) &&
			Number.isFinite(w.endMs) &&
			w.endMs > w.startMs,
	);
	if (valid.length === 0) return [];

	const cues: SubtitleCue[] = [];
	let bucket: TranscriptWord[] = [];

	const flush = () => {
		if (bucket.length === 0) return;
		cues.push({
			id: makeId(cues.length),
			startMs: bucket[0].startMs,
			endMs: bucket[bucket.length - 1].endMs,
			text: joinWords(bucket),
		});
		bucket = [];
	};

	for (const w of valid) {
		const prev = bucket[bucket.length - 1];

		// 与上一词的间隔够大 → 先断句,再把当前词归入新 cue。
		if (prev && w.startMs - prev.endMs >= pauseGapMs) {
			flush();
		}

		// 若把当前词加进去会超时长/超字数,先把已有的断成一条,再开新 cue。
		if (bucket.length > 0) {
			const wouldDurationMs = w.endMs - bucket[0].startMs;
			// 用 visualLength 统一口径(含新词),而非 visualLength(bucket)+原始字符数(拉丁会偏大)。
			const wouldChars = visualLength([...bucket, w]);
			if (wouldDurationMs > maxDurationMs || wouldChars > maxChars) {
				flush();
			}
		}

		bucket.push(w);

		// 句末标点 → 立即断句。
		if (SENTENCE_END.test(w.text.trim())) {
			flush();
		}
	}
	flush();

	return cues;
}

/** 当前时间(源 ms)应显示的字幕,找不到返回 null。 */
export function activeCueAt(cues: SubtitleCue[], timeMs: number): SubtitleCue | null {
	for (const c of cues) {
		if (timeMs >= c.startMs && timeMs < c.endMs) return c;
	}
	return null;
}
