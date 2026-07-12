import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import type { CockpitCard } from "../../src/lib/cockpitTypes";
import { TopicPoolStore } from "./topicPool";

let dir: string;
let file: string;
let clock: number;
const tick = () => ++clock;

beforeEach(() => {
	dir = fs.mkdtempSync(path.join(os.tmpdir(), "pool-"));
	file = path.join(dir, "cockpit-pool.json");
	clock = 1000;
});

afterEach(() => {
	fs.rmSync(dir, { recursive: true, force: true });
});

const card = (id: string): CockpitCard => ({ id, title: `卡 ${id}` });

test("空池初始形状", () => {
	const pool = new TopicPoolStore(file, tick);
	expect(pool.get()).toEqual({ version: 1, entries: {}, injected: [], migratedLegacy: false });
});

test("change 事件在每次变更后 emit 最新 pool", () => {
	const pool = new TopicPoolStore(file, tick);
	let last: unknown = null;
	pool.on("change", (p) => {
		last = p;
	});
	pool.setStatus("c1", "已选");
	expect((last as { entries: Record<string, { status: string }> }).entries.c1.status).toBe("已选");
});

test("setNote 存观点;后续 setStatus / recordArtifact 不丢 note(灌观点不被状态变更清掉)", () => {
	const pool = new TopicPoolStore(file, tick);
	pool.setNote("c1", "我的看法");
	expect(pool.get().entries.c1.note).toBe("我的看法");
	// 改状态后 note 仍在
	pool.setStatus("c1", "已灌观点");
	expect(pool.get().entries.c1).toMatchObject({ note: "我的看法", status: "已灌观点" });
	// 回填产物后 note 仍在
	pool.recordArtifact("c1", { kind: "film", path: "/x.mp4", at: 1 }, "已成稿");
	expect(pool.get().entries.c1).toMatchObject({ note: "我的看法", status: "已成稿" });
});

test("importLegacy 只补池里没有的卡,不覆盖已有回填,且只迁一次", () => {
	const pool = new TopicPoolStore(file, tick);
	pool.recordArtifact("c1", { kind: "film", path: "/o/a.mp4", at: 1 }, "已成稿"); // 已有增量
	pool.importLegacy({ c1: "已选", c2: "候选" }); // c1 不该被覆盖,c2 补入
	expect(pool.get().entries.c1.status).toBe("已成稿"); // 回填保住
	expect(pool.get().entries.c2.status).toBe("候选");
	expect(pool.get().migratedLegacy).toBe(true);
	// 二次迁移空操作(即便给新值也不动)
	pool.importLegacy({ c2: "已选", c3: "候选" });
	expect(pool.get().entries.c2.status).toBe("候选");
	expect(pool.get().entries.c3).toBeUndefined();
});

test("setStatus 覆盖状态并落盘", () => {
	const pool = new TopicPoolStore(file, tick);
	pool.setStatus("c1", "已选");
	expect(pool.get().entries.c1.status).toBe("已选");
	// 重新构造 → 持久化生效
	const reopened = new TopicPoolStore(file, tick);
	expect(reopened.get().entries.c1.status).toBe("已选");
});

test("recordArtifact 追加产物 + 可同时改状态;同路径去重", () => {
	const pool = new TopicPoolStore(file, tick);
	pool.recordArtifact("c1", { kind: "film", path: "/out/a.mp4", at: 1 }, "已成稿");
	pool.recordArtifact("c1", { kind: "film", path: "/out/a.mp4", at: 2 }); // 同路径,替换不重复
	pool.recordArtifact("c1", { kind: "film", path: "/out/b.mp4", at: 3 });
	const e = pool.get().entries.c1;
	expect(e.status).toBe("已成稿");
	expect(e.artifacts?.map((a) => a.path)).toEqual(["/out/a.mp4", "/out/b.mp4"]);
});

test("recordArtifact 不传 status 时保留已有状态", () => {
	const pool = new TopicPoolStore(file, tick);
	pool.setStatus("c1", "已选");
	pool.recordArtifact("c1", { kind: "film", path: "/out/a.mp4", at: 1 });
	expect(pool.get().entries.c1.status).toBe("已选");
});

test("addTodo 追加待办(id 唯一、含 createdAt、未完成);空文本忽略", () => {
	const pool = new TopicPoolStore(file, tick);
	pool.addTodo("c1", "录屏");
	pool.addTodo("c1", "  出图文  "); // trim
	pool.addTodo("c1", "   "); // 空白忽略
	const todos = pool.get().entries.c1.todos ?? [];
	expect(todos.map((t) => t.text)).toEqual(["录屏", "出图文"]);
	expect(todos[0].done).toBe(false);
	expect(typeof todos[0].createdAt).toBe("number");
	// id 唯一
	expect(new Set(todos.map((t) => t.id)).size).toBe(2);
});

test("toggleTodo 切换完成态并记录/清空 doneAt", () => {
	const pool = new TopicPoolStore(file, tick);
	pool.addTodo("c1", "录屏");
	const id = pool.get().entries.c1.todos?.[0].id as string;
	pool.toggleTodo("c1", id);
	expect(pool.get().entries.c1.todos?.[0]).toMatchObject({ done: true });
	expect(typeof pool.get().entries.c1.todos?.[0].doneAt).toBe("number");
	pool.toggleTodo("c1", id);
	expect(pool.get().entries.c1.todos?.[0].done).toBe(false);
	expect(pool.get().entries.c1.todos?.[0].doneAt).toBeUndefined();
});

test("removeTodo 删除指定待办", () => {
	const pool = new TopicPoolStore(file, tick);
	pool.addTodo("c1", "a");
	pool.addTodo("c1", "b");
	const first = pool.get().entries.c1.todos?.[0].id as string;
	pool.removeTodo("c1", first);
	expect(pool.get().entries.c1.todos?.map((t) => t.text)).toEqual(["b"]);
});

test("待办与观点/状态互不清掉(字段保留)", () => {
	const pool = new TopicPoolStore(file, tick);
	pool.setNote("c1", "我的看法");
	pool.addTodo("c1", "录屏");
	pool.setStatus("c1", "已选");
	const e = pool.get().entries.c1;
	expect(e.note).toBe("我的看法");
	expect(e.status).toBe("已选");
	expect(e.todos?.map((t) => t.text)).toEqual(["录屏"]);
});

test("addInjected 追加新卡,按 id 去重覆盖", () => {
	const pool = new TopicPoolStore(file, tick);
	pool.addInjected(card("inj1"), "拉片:lp-1");
	pool.addInjected(card("inj2"), "拉片:lp-1");
	pool.addInjected({ ...card("inj1"), title: "改名" }, "拉片:lp-2"); // 同 id → 覆盖
	const inj = pool.get().injected;
	expect(inj).toHaveLength(2);
	expect(inj.find((i) => i.card.id === "inj1")?.card.title).toBe("改名");
	expect(inj.find((i) => i.card.id === "inj1")?.source).toBe("拉片:lp-2");
});
