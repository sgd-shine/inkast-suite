import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";
import { assertInside } from "./publishBoard";

// 路径白名单(assertInside / realpathNearest)是历史踩坑「symlink 逃逸→用 realpath 修」的安全核心,
// 主进程侧之前零测试(review testqa F3)。这里用真临时目录 + 真 symlink 锁住防护,防重构悄悄退回
// 裸 path.resolve(那样植入指向外部的 symlink 就能写/删沙箱外文件)。

let root: string;
let outside: string;

beforeAll(() => {
	// realpath 一下:macOS 的 /tmp 本身是指向 /private/tmp 的 symlink,先解析避免根路径自身比对失配。
	const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "pubboard-")));
	root = path.join(base, "Publishing");
	outside = path.join(base, "outside");
	fs.mkdirSync(path.join(root, "Drafts"), { recursive: true });
	fs.mkdirSync(outside, { recursive: true });
	fs.writeFileSync(path.join(outside, "secret.md"), "外部机密");
});

afterAll(() => {
	fs.rmSync(path.dirname(root), { recursive: true, force: true });
});

test("根内的正常路径:放行,返回真实路径", () => {
	const p = path.join(root, "Drafts", "a.md");
	expect(assertInside(root, p)).toBe(p);
});

test("../ 越界到根外:拦截", () => {
	expect(() => assertInside(root, path.join(root, "..", "outside", "secret.md"))).toThrow(
		"路径不在发布目录内",
	);
});

test("symlink 逃逸:根内放一个指向外部目录的 symlink,穿过它的路径被拦", () => {
	const link = path.join(root, "Drafts", "escape");
	fs.symlinkSync(outside, link); // Drafts/escape → 外部目录
	// 裸 path.resolve 会以为 root/Drafts/escape/secret.md 在根内;realpathNearest 解析 symlink 后发现在外部。
	expect(() => assertInside(root, path.join(link, "secret.md"))).toThrow("路径不在发布目录内");
});

test("前缀同名兄弟目录不能绕过(Publishing-secrets)", () => {
	const sibling = `${root}-secrets`;
	fs.mkdirSync(sibling, { recursive: true });
	expect(() => assertInside(root, path.join(sibling, "x.md"))).toThrow("路径不在发布目录内");
});
