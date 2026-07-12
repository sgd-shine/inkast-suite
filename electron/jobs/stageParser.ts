// 阶段解析器：把 video-pipeline 的 stdout 行解析成结构化事件。
// 这是进度显示的唯一事实来源——绝不维护"演出来"的状态。
// 移植自 video-factory/lib/stageParser.mjs(逐行等价 + 补类型),5 条正则即与引擎的全部契约。

export const STAGE_LABELS: Record<string, string> = {
	slides: "拆页(Claude)",
	storyboard: "文案分镜",
	voice: "配音",
	screencast: "录屏剪辑",
	subtitles: "字幕",
	compose: "合成",
	"preview-pack": "预览渲染",
	"publish-pack": "发布包",
	"publish-summary": "发布总览",
	delivery: "交付目录",
	"export-delivery": "素材库导出",
	acceptance: "验收",
	"reference-compare": "参考对照",
};

export function labelForStage(key: string): string {
	if (key.startsWith("variants:")) return `平台变体 ${key.split(":")[1]}`;
	return STAGE_LABELS[key] || key;
}

export type StageEvent =
	| { kind: "stage"; key: string }
	| { kind: "variant"; platform: string; style: string }
	| { kind: "artifact"; path: string }
	| { kind: "success" };

/** 解析单行 stdout。引擎 marker 见 video-pipeline/pipeline/run.py:538,541,597,651。 */
export function parseLine(line: string): StageEvent | null {
	const t = String(line).trim();
	if (!t) return null;

	let m = t.match(/^===\s*\[([^\]]+)\]\s*===$/);
	if (m) return { kind: "stage", key: m[1] };

	m = t.match(/^---\s*variant\s+platform=(\S+)\s+style=(\S+)\s*---$/);
	if (m) return { kind: "variant", platform: m[1], style: m[2] };

	m = t.match(/^成片\s*->\s*(\S+)$/);
	if (m) return { kind: "artifact", path: m[1] };

	if (t === "✅ 完成") return { kind: "success" };
	return null;
}
