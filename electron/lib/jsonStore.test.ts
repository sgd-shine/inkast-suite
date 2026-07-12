import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { JsonStore } from "./jsonStore";

let dir: string;

beforeEach(() => {
	dir = fs.mkdtempSync(path.join(os.tmpdir(), "jsonstore-"));
});

afterEach(() => {
	fs.rmSync(dir, { recursive: true, force: true });
});

test("读不到文件时返回 fallback,不抛", () => {
	const s = new JsonStore<{ n: number }>(path.join(dir, "x.json"), { n: 7 });
	expect(s.get()).toEqual({ n: 7 });
});

test("set 落盘 + 重新构造能读回", () => {
	const file = path.join(dir, "nested", "deep", "x.json");
	const s = new JsonStore<{ n: number }>(file, { n: 0 });
	s.set({ n: 42 });
	expect(fs.existsSync(file)).toBe(true);
	const reopened = new JsonStore<{ n: number }>(file, { n: 0 });
	expect(reopened.get()).toEqual({ n: 42 });
});

test("update 读-改-写并返回新值", () => {
	const file = path.join(dir, "x.json");
	const s = new JsonStore<{ list: number[] }>(file, { list: [] });
	const out = s.update((cur) => ({ list: [...cur.list, 1] }));
	expect(out).toEqual({ list: [1] });
	expect(s.get()).toEqual({ list: [1] });
});

test("坏 JSON 回退 fallback,不崩", () => {
	const file = path.join(dir, "bad.json");
	fs.writeFileSync(file, "{ not json");
	const s = new JsonStore<{ ok: boolean }>(file, { ok: true });
	expect(s.get()).toEqual({ ok: true });
});
