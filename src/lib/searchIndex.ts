// 全局检索(主线三)纯逻辑:把各数据源(选题/观点/拉片报告/录屏/成片/发布稿)归一成可搜文档,
// 做词项 AND 匹配 + 标题加权打分 + 片段提取。无依赖、可测;渲染端聚合 IPC 数据后调用,不读盘。

export type SearchKind = "topic" | "opinion" | "analysis" | "recording" | "film" | "publish";

export interface SearchDoc {
	kind: SearchKind;
	/** 稳定键(去重 + React key)。 */
	id: string;
	title: string;
	/** 附加可搜文本(角度/要点/摘要/观点正文/文件名等)。 */
	text: string;
	/** 行动引用:文件绝对路径,或选题 card.id。 */
	ref?: string;
}

export interface SearchHit extends SearchDoc {
	score: number;
}

/** 查询 → 词项(空白分隔、小写、去空)。中文无空格时整串即一个词项,做子串匹配。 */
export function queryTerms(q: string): string[] {
	return q.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * 单文档打分:所有词项都得命中(标题或正文)才计分(AND 语义);标题命中权重高于正文。
 * 返回 0 = 不匹配(被淘汰)。
 */
export function scoreDoc(doc: SearchDoc, terms: string[]): number {
	if (terms.length === 0) return 0;
	const title = doc.title.toLowerCase();
	const text = doc.text.toLowerCase();
	let score = 0;
	for (const term of terms) {
		const inTitle = title.includes(term);
		const inText = text.includes(term);
		if (!inTitle && !inText) return 0; // AND:有一个词项没命中即淘汰
		score += (inTitle ? 3 : 0) + (inText ? 1 : 0);
	}
	if (title === terms.join(" ")) score += 5; // 标题整串命中加成
	return score;
}

/** 检索 + 排序(分数倒序,同分按标题字典序)+ 限量。 */
export function searchDocs(docs: SearchDoc[], query: string, limit = 40): SearchHit[] {
	const terms = queryTerms(query);
	if (terms.length === 0) return [];
	const hits: SearchHit[] = [];
	for (const doc of docs) {
		const score = scoreDoc(doc, terms);
		if (score > 0) hits.push({ ...doc, score });
	}
	hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
	return hits.slice(0, limit);
}

/** 命中片段:取正文中首个命中词项周围一小段(给结果列表展示上下文)。 */
export function snippet(text: string, terms: string[], radius = 32): string {
	if (!text) return "";
	const lower = text.toLowerCase();
	let pos = -1;
	for (const term of terms) {
		const i = lower.indexOf(term);
		if (i >= 0) {
			pos = i;
			break;
		}
	}
	if (pos < 0) return text.slice(0, radius * 2).trim();
	const start = Math.max(0, pos - radius);
	const end = Math.min(text.length, pos + radius);
	return (start > 0 ? "…" : "") + text.slice(start, end).trim() + (end < text.length ? "…" : "");
}
