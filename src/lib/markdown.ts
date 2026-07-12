// 轻量 Markdown 解析(纯函数,可测;渲染端 MarkdownView 据此构建 React 元素 —— 不走
// dangerouslySetInnerHTML,无 XSS 面)。覆盖拉片报告实际用到的子集:标题 / 列表 / 表格(GFM)/
// 代码块 / 引用 / 分隔线 / 段落,行内 **粗体**、`代码`、*斜体*。
//
// 取舍:不做完整 CommonMark(嵌套列表、引用内表格、行内链接图片等),报告结构受控、够用即止;
// 解析不出的复杂结构会安全降级为段落文本,绝不报错或注入。

export type InlineToken =
	| { type: "text"; text: string }
	| { type: "bold"; text: string }
	| { type: "italic"; text: string }
	| { type: "code"; text: string };

export type MdBlock =
	| { type: "heading"; level: number; text: string }
	| { type: "paragraph"; text: string }
	| { type: "list"; ordered: boolean; items: string[] }
	| { type: "table"; headers: string[]; rows: string[][] }
	| { type: "code"; text: string }
	| { type: "quote"; text: string }
	| { type: "hr" };

/** 行内解析:`代码`(最高优先,内部不再解析)> **粗体** > *斜体*;其余为纯文本。 */
export function parseInline(input: string): InlineToken[] {
	const text = input ?? "";
	const tokens: InlineToken[] = [];
	let buf = "";
	let i = 0;
	const flush = () => {
		if (buf) {
			tokens.push({ type: "text", text: buf });
			buf = "";
		}
	};
	while (i < text.length) {
		const ch = text[i];
		// 行内代码 `...`
		if (ch === "`") {
			const end = text.indexOf("`", i + 1);
			if (end > i) {
				flush();
				tokens.push({ type: "code", text: text.slice(i + 1, end) });
				i = end + 1;
				continue;
			}
		}
		// 粗体 **...**
		if (ch === "*" && text[i + 1] === "*") {
			const end = text.indexOf("**", i + 2);
			if (end > i + 1) {
				flush();
				tokens.push({ type: "bold", text: text.slice(i + 2, end) });
				i = end + 2;
				continue;
			}
		}
		// 斜体 *...*(单星,且不是 ** 起头)
		if (ch === "*" && text[i + 1] !== "*") {
			const end = text.indexOf("*", i + 1);
			if (end > i) {
				flush();
				tokens.push({ type: "italic", text: text.slice(i + 1, end) });
				i = end + 1;
				continue;
			}
		}
		buf += ch;
		i++;
	}
	flush();
	return tokens;
}

/** GFM 表格行 → 单元格(剥首尾 |,按 | 切,去空白)。 */
function splitTableRow(line: string): string[] {
	let s = line.trim();
	if (s.startsWith("|")) s = s.slice(1);
	if (s.endsWith("|")) s = s.slice(0, -1);
	return s.split("|").map((c) => c.trim());
}

/** 某行是否开启一个新块(段落聚合时遇到它就收尾,避免把标题/列表吞进段落)。 */
function isBlockStart(line: string): boolean {
	const t = line.trim();
	if (!t) return true;
	if (t.startsWith("```")) return true;
	if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) return true;
	if (/^#{1,6}\s+/.test(t)) return true;
	if (t.startsWith(">")) return true;
	if (/^[-*+]\s+/.test(t)) return true;
	if (/^\d+[.)]\s+/.test(t)) return true;
	return false;
}

/** Markdown → 块序列。 */
export function parseMarkdownBlocks(md: string): MdBlock[] {
	const lines = (md ?? "").replace(/\r\n/g, "\n").split("\n");
	const blocks: MdBlock[] = [];
	let i = 0;
	while (i < lines.length) {
		const line = lines[i];
		const trimmed = line.trim();
		if (!trimmed) {
			i++;
			continue;
		}
		// 围栏代码块 ```
		if (trimmed.startsWith("```")) {
			const body: string[] = [];
			i++;
			while (i < lines.length && !lines[i].trim().startsWith("```")) {
				body.push(lines[i]);
				i++;
			}
			i++; // 跳过收尾围栏
			blocks.push({ type: "code", text: body.join("\n") });
			continue;
		}
		// 分隔线 --- / *** / ___
		if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
			blocks.push({ type: "hr" });
			i++;
			continue;
		}
		// 标题 #..######
		const h = trimmed.match(/^(#{1,6})\s+(.*)$/);
		if (h) {
			blocks.push({ type: "heading", level: h[1].length, text: h[2].trim() });
			i++;
			continue;
		}
		// 表格:本行含 | 且下一行是分隔行(|---|---|)
		const next = i + 1 < lines.length ? lines[i + 1].trim() : "";
		if (
			trimmed.includes("|") &&
			next.includes("-") &&
			/^\|?[\s:|-]+\|?$/.test(next) &&
			next.replace(/[^|]/g, "").length >= 1
		) {
			const headers = splitTableRow(trimmed);
			i += 2; // 跳过表头 + 分隔行
			const rows: string[][] = [];
			while (i < lines.length && lines[i].trim().includes("|")) {
				rows.push(splitTableRow(lines[i]));
				i++;
			}
			blocks.push({ type: "table", headers, rows });
			continue;
		}
		// 引用 >
		if (trimmed.startsWith(">")) {
			const body: string[] = [];
			while (i < lines.length && lines[i].trim().startsWith(">")) {
				body.push(lines[i].trim().replace(/^>\s?/, ""));
				i++;
			}
			blocks.push({ type: "quote", text: body.join("\n") });
			continue;
		}
		// 无序列表 - / * / +
		if (/^[-*+]\s+/.test(trimmed)) {
			const items: string[] = [];
			while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
				items.push(lines[i].trim().replace(/^[-*+]\s+/, ""));
				i++;
			}
			blocks.push({ type: "list", ordered: false, items });
			continue;
		}
		// 有序列表 1. / 1)
		if (/^\d+[.)]\s+/.test(trimmed)) {
			const items: string[] = [];
			while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
				items.push(lines[i].trim().replace(/^\d+[.)]\s+/, ""));
				i++;
			}
			blocks.push({ type: "list", ordered: true, items });
			continue;
		}
		// 段落:聚合连续的普通行,直到空行或新块起头
		const para: string[] = [];
		while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) {
			para.push(lines[i].trim());
			i++;
		}
		blocks.push({ type: "paragraph", text: para.join("\n") });
	}
	return blocks;
}
