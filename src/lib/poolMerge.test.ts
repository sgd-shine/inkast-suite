import { expect, test } from "vitest";
import type { CockpitCard } from "./cockpitTypes";
import { artifactsFor, injectedCards, injectedSourceFor, resolveStatus } from "./poolMerge";
import type { TopicPool } from "./poolTypes";

const FLOW = ["候选", "已选", "已灌观点", "已成稿", "已推草稿"];
const card = (id: string, status?: string): CockpitCard => ({ id, title: id, status });

const pool: TopicPool = {
	version: 1,
	entries: {
		c1: { id: "c1", status: "已选", updatedAt: 1 },
		c2: { id: "c2", artifacts: [{ kind: "film", path: "/o/a.mp4", at: 1 }], updatedAt: 1 },
	},
	injected: [{ card: card("inj1"), source: "拉片:lp-1", createdAt: 1 }],
};

test("resolveStatus:池覆盖 > vault 自带 > 候选", () => {
	expect(resolveStatus(card("c1", "候选"), pool, FLOW)).toBe("已选"); // 池覆盖
	expect(resolveStatus(card("c2", "已灌观点"), pool, FLOW)).toBe("已灌观点"); // 无池状态→vault
	expect(resolveStatus(card("c3"), pool, FLOW)).toBe("候选"); // 都没有→首项
	expect(resolveStatus(card("c3"), null, FLOW)).toBe("候选"); // 无池
});

test("injectedCards 取注入卡列表", () => {
	expect(injectedCards(pool).map((c) => c.id)).toEqual(["inj1"]);
	expect(injectedCards(null)).toEqual([]);
});

test("artifactsFor 取回填产物", () => {
	expect(artifactsFor("c2", pool).map((a) => a.path)).toEqual(["/o/a.mp4"]);
	expect(artifactsFor("c1", pool)).toEqual([]);
	expect(artifactsFor("c2", null)).toEqual([]);
});

test("injectedSourceFor 标注注入来源", () => {
	expect(injectedSourceFor("inj1", pool)).toBe("拉片:lp-1");
	expect(injectedSourceFor("c1", pool)).toBeUndefined();
});
