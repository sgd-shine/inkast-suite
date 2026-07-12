// 拉片报告「关键发现 ×5」→ 选题池注入卡(纯函数,可测)。
// 互喂闭环(§4 · §7):拉片报告关键发现回喂选题池成为新候选卡。解析失败就返回空,不编造。
import type { CockpitCard } from "./cockpitTypes";

// 关键发现段落的锚点 + 该到此为止的下游小节标题(拉片提示词里的固定结构词)。
const ANCHOR = /关键发现/;
const STOP_MARKERS = [
	"配帧",
	"图形层",
	"部件清单",
	"工具链",
	"产出②",
	"产出 ②",
	"复现",
	"PHASE",
	"可复刻度",
	"一句话结论",
	"封面",
	"SOP",
];

// 行首列表标记:- * + / 1. 1) / ①..⑩ / 1、。返回去掉标记后的内容(无标记返回 null)。
function stripListMarker(line: string): string | null {
	const m = line.match(/^\s*(?:[-*+]\s+|\d+[.)、]\s*|[①②③④⑤⑥⑦⑧⑨⑩]\s*)(.+)$/);
	return m ? m[1].trim() : null;
}

// 去掉 markdown 强调/反引号,压成干净一句。
function clean(text: string): string {
	return text
		.replace(/\*\*/g, "")
		.replace(/`/g, "")
		.replace(/^[:：]\s*/, "")
		.trim();
}

function isStop(line: string): boolean {
	if (/^#{1,6}\s/.test(line)) return true; // 新标题
	const bare = line.replace(/[-*+#\s]/g, "");
	return STOP_MARKERS.some((s) => bare.includes(s.replace(/\s/g, "")));
}

/** 从拉片报告 markdown 里抽出「关键发现」条目(最多 5 条)。抽不到→[]。 */
export function extractKeyFindings(report: string, max = 5): string[] {
	const lines = report.replace(/\r\n/g, "\n").split("\n");
	// 锚点 = 首个提到「关键发现」的行(可能是 **加粗** 列表项,也可能是 ### 标题)。
	const anchorIdx = lines.findIndex((l) => ANCHOR.test(l));
	if (anchorIdx < 0) return [];

	const found: string[] = [];

	// 锚点同行可能直接带第一条(如 "**关键发现 ×5**:xxx" 或 "- 关键发现:xxx")。
	const inlineAfter = clean(lines[anchorIdx].replace(/.*关键发现[^:：]*/, ""));
	if (inlineAfter && !/^[×x]?\s*\d*$/i.test(inlineAfter)) found.push(inlineAfter);

	let blanks = 0;
	for (let i = anchorIdx + 1; i < lines.length && found.length < max; i++) {
		const raw = lines[i];
		if (raw.trim() === "") {
			if (++blanks >= 2) break; // 连续空行=段落结束
			continue;
		}
		blanks = 0;
		const item = stripListMarker(raw);
		if (item === null) {
			// 非列表行:小节标题/加粗标签(配帧逐段表/图形层…)即停;否则忽略(可能是说明文字)。
			// 注意:只在「非列表行」上判停 —— 列表项正文里出现「图形层/工具链」等词是内容,不该停。
			if (isStop(raw)) break;
			continue;
		}
		const c = clean(item);
		if (c) found.push(c);
	}
	return found;
}

/** 关键发现 → 选题池注入卡(供 cockpit 当作新候选展示)。 */
export function findingsToTopicCards(
	report: string,
	slug: string,
	sourceTitle: string,
): CockpitCard[] {
	return extractKeyFindings(report).map((finding, i) => ({
		id: `${slug}-f${i}`,
		kind: "rec",
		lane: "today",
		topic: "拉片发现",
		title: finding.length > 38 ? `${finding.slice(0, 38)}…` : finding,
		angle: finding,
		why: `来自拉片报告:${sourceTitle}`,
		origin: `output/analyses/${slug}/report.md`,
		status: "候选",
	}));
}
