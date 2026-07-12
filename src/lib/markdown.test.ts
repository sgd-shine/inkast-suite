import { describe, expect, it } from "vitest";
import { type MdBlock, parseInline, parseMarkdownBlocks } from "./markdown";

describe("parseInline", () => {
	it("plain text → single text token", () => {
		expect(parseInline("hello world")).toEqual([{ type: "text", text: "hello world" }]);
	});

	it("bold **...**", () => {
		expect(parseInline("a **b** c")).toEqual([
			{ type: "text", text: "a " },
			{ type: "bold", text: "b" },
			{ type: "text", text: " c" },
		]);
	});

	it("inline code takes precedence and is not re-parsed", () => {
		// 反引号里的 ** 不应被当成粗体。
		expect(parseInline("`**x**`")).toEqual([{ type: "code", text: "**x**" }]);
	});

	it("italic *...* but not ** (bold)", () => {
		expect(parseInline("*i* and **b**")).toEqual([
			{ type: "italic", text: "i" },
			{ type: "text", text: " and " },
			{ type: "bold", text: "b" },
		]);
	});

	it("unterminated markers stay literal", () => {
		expect(parseInline("a **b")).toEqual([{ type: "text", text: "a **b" }]);
		expect(parseInline("100% sure")).toEqual([{ type: "text", text: "100% sure" }]);
	});
});

describe("parseMarkdownBlocks", () => {
	it("headings keep level and strip hashes", () => {
		const b = parseMarkdownBlocks("## 产出① 拉片报告");
		expect(b).toEqual<MdBlock[]>([{ type: "heading", level: 2, text: "产出① 拉片报告" }]);
	});

	it("horizontal rule", () => {
		expect(parseMarkdownBlocks("---")).toEqual<MdBlock[]>([{ type: "hr" }]);
	});

	it("unordered list collects items and strips bullets", () => {
		const b = parseMarkdownBlocks("- 一\n- 二\n- 三");
		expect(b).toEqual<MdBlock[]>([{ type: "list", ordered: false, items: ["一", "二", "三"] }]);
	});

	it("ordered list", () => {
		const b = parseMarkdownBlocks("1. a\n2. b");
		expect(b).toEqual<MdBlock[]>([{ type: "list", ordered: true, items: ["a", "b"] }]);
	});

	it("GFM table parses headers + rows, ignores separator row", () => {
		const md = "| 时间码 | 作用 |\n| --- | --- |\n| 00:03 | 钩子 |\n| 00:10 | 立信 |";
		const b = parseMarkdownBlocks(md);
		expect(b).toEqual<MdBlock[]>([
			{
				type: "table",
				headers: ["时间码", "作用"],
				rows: [
					["00:03", "钩子"],
					["00:10", "立信"],
				],
			},
		]);
	});

	it("fenced code block keeps body verbatim", () => {
		const md = "```\nconst a = 1;\nconst b = 2;\n```";
		expect(parseMarkdownBlocks(md)).toEqual<MdBlock[]>([
			{ type: "code", text: "const a = 1;\nconst b = 2;" },
		]);
	});

	it("blockquote strips marker", () => {
		expect(parseMarkdownBlocks("> 引用一行\n> 第二行")).toEqual<MdBlock[]>([
			{ type: "quote", text: "引用一行\n第二行" },
		]);
	});

	it("paragraph stops at a new block (heading)", () => {
		const b = parseMarkdownBlocks("一段正文\n## 小标题");
		expect(b).toEqual<MdBlock[]>([
			{ type: "paragraph", text: "一段正文" },
			{ type: "heading", level: 2, text: "小标题" },
		]);
	});

	it("a pipe line without a separator row is a paragraph, not a table", () => {
		const b = parseMarkdownBlocks("a | b | c");
		expect(b).toEqual<MdBlock[]>([{ type: "paragraph", text: "a | b | c" }]);
	});

	it("mixed document keeps block order", () => {
		const md = "# 标题\n\n开场白。\n\n- 项一\n- 项二\n\n---\n\n收尾。";
		const types = parseMarkdownBlocks(md).map((x) => x.type);
		expect(types).toEqual(["heading", "paragraph", "list", "hr", "paragraph"]);
	});

	it("empty / whitespace input → no blocks", () => {
		expect(parseMarkdownBlocks("")).toEqual([]);
		expect(parseMarkdownBlocks("\n\n  \n")).toEqual([]);
	});
});
