import { describe, expect, it } from "vitest";
import { augmentedPath, findBin } from "./systemPath";

const has =
	(...present: string[]) =>
	(p: string) =>
		present.includes(p);

describe("findBin", () => {
	it("homebrew 存在时返回绝对路径(修复:不再总返回裸名)", () => {
		expect(findBin("ffmpeg", has("/opt/homebrew/bin/ffmpeg"))).toBe("/opt/homebrew/bin/ffmpeg");
	});

	it("homebrew 没有、/usr/local 有 → 返回 /usr/local", () => {
		expect(findBin("ffprobe", has("/usr/local/bin/ffprobe"))).toBe("/usr/local/bin/ffprobe");
	});

	it("都不存在时退回裸名靠 PATH", () => {
		expect(findBin("ffmpeg", () => false)).toBe("ffmpeg");
	});
});

// login 参数显式传 "" 隔离机器实际登录 shell PATH(否则结果随机器变)。
describe("augmentedPath", () => {
	it("把 homebrew/usr/local 前置到现有 PATH 前(打包版才找得到 ffmpeg)", () => {
		expect(augmentedPath("/usr/bin:/bin", "")).toBe(
			"/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
		);
	});

	it("去重:已含的目录不重复出现", () => {
		expect(augmentedPath("/opt/homebrew/bin:/sbin", "")).toBe(
			"/opt/homebrew/bin:/usr/local/bin:/usr/bin:/sbin",
		);
	});

	it("空 PATH 也至少给出三条标准目录", () => {
		expect(augmentedPath("", "")).toBe("/opt/homebrew/bin:/usr/local/bin:/usr/bin");
	});

	it("登录 shell PATH 前置,覆盖 node 版本管理器目录(.hermes/nvm,npx 在此)+ 去重", () => {
		expect(augmentedPath("/usr/bin", "/Users/x/.hermes/node/bin:/opt/homebrew/bin")).toBe(
			"/Users/x/.hermes/node/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin",
		);
	});
});
