import { describe, expect, test } from "vitest";
import type { CockpitCard } from "./cockpitTypes";
import type { PoolEntry, TopicPool } from "./poolTypes";
import { activeProjects, isTracked, summarizeProject } from "./topicProject";

const FLOW = ["候选", "已选", "已灌观点", "已成稿", "已推草稿"];
const card = (id: string, extra: Partial<CockpitCard> = {}): CockpitCard => ({
	id,
	title: `卡 ${id}`,
	...extra,
});
const entry = (e: Partial<PoolEntry>): PoolEntry => ({ id: "x", updatedAt: 0, ...e });

describe("isTracked", () => {
	test("默认候选 + 无增量 = 未跟进", () => {
		expect(isTracked(undefined, "候选")).toBe(false);
		expect(isTracked(entry({}), "候选")).toBe(false);
	});
	test("状态推进过即跟进", () => {
		expect(isTracked(undefined, "已选")).toBe(true);
	});
	test("写了观点 / 草稿 / 产物 / 待办 任一即跟进(即便仍是候选)", () => {
		expect(isTracked(entry({ note: "看法" }), "候选")).toBe(true);
		expect(isTracked(entry({ draft: "稿" }), "候选")).toBe(true);
		expect(isTracked(entry({ artifacts: [{ kind: "film", path: "/a.mp4", at: 1 }] }), "候选")).toBe(
			true,
		);
		expect(
			isTracked(entry({ todos: [{ id: "t1", text: "做", done: false, createdAt: 1 }] }), "候选"),
		).toBe(true);
	});
	test("空白观点不算跟进", () => {
		expect(isTracked(entry({ note: "   " }), "候选")).toBe(false);
	});
});

describe("summarizeProject", () => {
	test("汇总待办完成数 + 待办待办项 + 产物数", () => {
		const e = entry({
			note: "观点",
			draft: "稿",
			artifacts: [{ kind: "film", path: "/a.mp4", at: 1 }],
			todos: [
				{ id: "t1", text: "录屏", done: true, createdAt: 1 },
				{ id: "t2", text: "出图文", done: false, createdAt: 2 },
			],
			updatedAt: 99,
		});
		const p = summarizeProject(card("c1", { topic: "AI" }), e, "已成稿");
		expect(p).toMatchObject({
			id: "c1",
			title: "卡 c1",
			topic: "AI",
			status: "已成稿",
			note: "观点",
			hasDraft: true,
			artifactCount: 1,
			todoTotal: 2,
			todoDone: 1,
			updatedAt: 99,
		});
		expect(p.pendingTodos.map((td) => td.id)).toEqual(["t2"]);
	});
	test("无增量 = 空摘要", () => {
		const p = summarizeProject(card("c1"), undefined, "已选");
		expect(p).toMatchObject({ note: "", hasDraft: false, artifactCount: 0, todoTotal: 0 });
		expect(p.pendingTodos).toEqual([]);
	});
});

describe("activeProjects", () => {
	test("只收已跟进选题,按 updatedAt 倒序", () => {
		const cards = [card("c1"), card("c2"), card("c3")];
		const pool: TopicPool = {
			version: 1,
			entries: {
				c1: { id: "c1", status: "已选", updatedAt: 10 },
				c2: { id: "c2", note: "看法", updatedAt: 30 }, // 仍候选但有观点 → 跟进
				// c3 无增量、默认候选 → 不收
			},
			injected: [],
		};
		const r = activeProjects(cards, pool, FLOW);
		expect(r.map((p) => p.id)).toEqual(["c2", "c1"]);
	});
	test("空池返回空", () => {
		expect(activeProjects([card("c1")], null, FLOW)).toEqual([]);
	});
});
