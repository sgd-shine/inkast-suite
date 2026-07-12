import type { TranscriptWord } from "@/lib/asr/types";

// Inkast §4 Phase 2:从 whisper 转写词里挑出语气词/口头禅("废话"),输出待删片段。
// 纯函数,无副作用 —— 与 pauseDetection 一样,删除动作复用 TrimRegion(ripple + 导出剪掉)。
//
// 设计取舍:只做"整词精确匹配"(归一化后整段等于词表项),不做子串包含 —— 这样
// "然后我们" 不会被误删,只有独立成词的 "然后" 才命中。中文 whisper 的词级时间戳本身
// 偏碎,准确度有限;负责人已认可"识别不完美但可手工调整",所以词表保持可配置。

export interface FillerSegment {
	startMs: number;
	endMs: number;
	/** 命中的语气词文本(合并后用空格连接,仅用于展示)。 */
	text: string;
}

export interface DetectFillersOptions {
	/** 自定义词表;默认 DEFAULT_FILLERS。 */
	fillers?: Iterable<string>;
	/** 相邻语气词间隔 ≤ 此值则合并为一段。默认 400ms。 */
	mergeGapMs?: number;
	/** 每段前后各加的余量。默认 60ms。 */
	paddingMs?: number;
}

// 偏保守的默认词表:清晰的迟疑音 + demo 文档点名的常见口头禅。刻意不含
// 「其实/反正/对吧/呢/吧」等高频但常有实义的词,避免误删正文。
export const DEFAULT_FILLERS: readonly string[] = [
	// 中文迟疑音 / 口头禅
	"嗯",
	"呃",
	"额",
	"啊",
	"唉",
	"呣",
	"欸",
	"诶",
	"哦",
	"噢",
	"那个",
	"这个",
	"就是",
	"然后",
	// English fillers
	"um",
	"uh",
	"uhm",
	"erm",
	"er",
	"hmm",
	"mhm",
];

/** 归一化:去首尾空白 + 标点,英文转小写。中文字符保留。 */
function normalize(text: string): string {
	return text
		.toLowerCase()
		.replace(/^[\s\p{P}]+/u, "")
		.replace(/[\s\p{P}]+$/u, "");
}

/**
 * 扫描转写词,返回排序、不重叠的待删语气词片段。
 * - 整词精确匹配(归一化后整段 === 词表项)。
 * - 相邻命中(间隔 ≤ mergeGapMs)合并为一段。
 * - 每段加 paddingMs 余量,clamp 到 ≥0 且不与前一段重叠。
 */
export function detectFillers(
	words: TranscriptWord[],
	options: DetectFillersOptions = {},
): FillerSegment[] {
	const mergeGapMs = options.mergeGapMs ?? 400;
	const paddingMs = options.paddingMs ?? 60;

	const lexicon = new Set<string>();
	for (const f of options.fillers ?? DEFAULT_FILLERS) {
		const n = normalize(f);
		if (n) lexicon.add(n);
	}
	if (lexicon.size === 0) return [];

	// 1) 命中词
	const hits: FillerSegment[] = [];
	for (const w of words) {
		if (!Number.isFinite(w.startMs) || !Number.isFinite(w.endMs)) continue;
		if (w.endMs <= w.startMs) continue;
		const n = normalize(w.text);
		if (n && lexicon.has(n)) {
			hits.push({ startMs: w.startMs, endMs: w.endMs, text: n });
		}
	}
	if (hits.length === 0) return [];

	// 2) 排序 + 合并相邻
	hits.sort((a, b) => a.startMs - b.startMs);
	const merged: FillerSegment[] = [];
	for (const h of hits) {
		const last = merged[merged.length - 1];
		if (last && h.startMs - last.endMs <= mergeGapMs) {
			last.endMs = Math.max(last.endMs, h.endMs);
			last.text = `${last.text} ${h.text}`;
		} else {
			merged.push({ ...h });
		}
	}

	// 3) 加余量,clamp ≥0 且不与前段重叠
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

/** 待删语气词总时长(ms)。 */
export function totalFillerMs(segments: FillerSegment[]): number {
	return segments.reduce((sum, s) => sum + Math.max(0, s.endMs - s.startMs), 0);
}
