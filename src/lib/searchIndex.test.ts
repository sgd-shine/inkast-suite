import { describe, expect, test } from "vitest";
import { queryTerms, type SearchDoc, scoreDoc, searchDocs, snippet } from "./searchIndex";

const doc = (over: Partial<SearchDoc>): SearchDoc => ({
	kind: "topic",
	id: "1",
	title: "",
	text: "",
	...over,
});

describe("queryTerms", () => {
	test("空白分隔 + 小写 + 去空", () => {
		expect(queryTerms("  AI 数字人  ")).toEqual(["ai", "数字人"]);
		expect(queryTerms("   ")).toEqual([]);
	});
});

describe("scoreDoc", () => {
	test("标题命中权重高于正文", () => {
		const inTitle = scoreDoc(doc({ title: "数字人", text: "" }), ["数字人"]);
		const inText = scoreDoc(doc({ title: "", text: "数字人" }), ["数字人"]);
		expect(inTitle).toBeGreaterThan(inText);
	});
	test("AND 语义:任一词项未命中即 0", () => {
		expect(scoreDoc(doc({ title: "数字人成片", text: "" }), ["数字人", "缺失"])).toBe(0);
		expect(scoreDoc(doc({ title: "数字人成片", text: "" }), ["数字人", "成片"])).toBeGreaterThan(0);
	});
	test("大小写不敏感", () => {
		expect(scoreDoc(doc({ title: "HeyGen Avatar" }), ["heygen"])).toBeGreaterThan(0);
	});
	test("空词项 = 0", () => {
		expect(scoreDoc(doc({ title: "x" }), [])).toBe(0);
	});
});

describe("searchDocs", () => {
	const docs = [
		doc({ id: "a", title: "数字人成片", text: "HeyGen 云 API" }),
		doc({ id: "b", title: "拉片报告", text: "数字人口播片段" }),
		doc({ id: "c", title: "无关", text: "录屏剪辑" }),
	];
	test("按分数倒序、淘汰不匹配、限量", () => {
		const r = searchDocs(docs, "数字人");
		expect(r.map((h) => h.id)).toEqual(["a", "b"]); // a 标题命中分更高
		expect(r.every((h) => h.score > 0)).toBe(true);
	});
	test("空查询返回空", () => {
		expect(searchDocs(docs, "  ")).toEqual([]);
	});
	test("limit 截断", () => {
		expect(searchDocs(docs, "数字人", 1)).toHaveLength(1);
	});
});

describe("snippet", () => {
	test("围绕首个命中词项取片段,带省略号", () => {
		const text = `${"x".repeat(50)}数字人${"y".repeat(50)}`;
		const s = snippet(text, ["数字人"], 10);
		expect(s).toContain("数字人");
		expect(s.startsWith("…")).toBe(true);
		expect(s.endsWith("…")).toBe(true);
	});
	test("无命中时取开头", () => {
		expect(snippet("abcdef", ["zzz"], 2)).toBe("abcd");
	});
	test("空文本空串", () => {
		expect(snippet("", ["x"])).toBe("");
	});
});
