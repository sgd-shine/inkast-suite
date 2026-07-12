import { expect, test } from "vitest";
import { labelForStage, parseLine } from "./stageParser";

test("解析阶段标记", () => {
	expect(parseLine("=== [storyboard] ===")).toEqual({ kind: "stage", key: "storyboard" });
	expect(parseLine("  === [variants:publish] ===  ")).toEqual({
		kind: "stage",
		key: "variants:publish",
	});
});

test("解析变体行", () => {
	expect(parseLine("--- variant platform=douyin style=fast ---")).toEqual({
		kind: "variant",
		platform: "douyin",
		style: "fast",
	});
});

test("解析成片产物行", () => {
	expect(parseLine("  成片 -> output/示例.douyin.fast.mp4")).toEqual({
		kind: "artifact",
		path: "output/示例.douyin.fast.mp4",
	});
});

test("解析完成标记", () => {
	expect(parseLine("✅ 完成")).toEqual({ kind: "success" });
});

test("噪音行返回 null", () => {
	for (const l of ["Rendered 1/1", "Bundling 98%", "", "  配音完成", "EXIT=0"]) {
		expect(parseLine(l), `应忽略: ${l}`).toBeNull();
	}
});

test("阶段中文标签", () => {
	expect(labelForStage("storyboard")).toBe("文案分镜");
	expect(labelForStage("variants:publish")).toBe("平台变体 publish");
	expect(labelForStage("unknown-x")).toBe("unknown-x");
});
