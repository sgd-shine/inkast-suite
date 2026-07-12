import { describe, expect, test } from "vitest";
import {
	indexRow,
	insertIndexRow,
	requirementsTemplate,
	slugForProject,
	startupPrompt,
	type VideoflowProjectInput,
} from "./videoflow";

const input = (over: Partial<VideoflowProjectInput> = {}): VideoflowProjectInput => ({
	title: "我的录屏",
	rawFileName: "rec.mp4",
	dateYmd: "20260627",
	createdAtText: "2026-06-27 12:00",
	...over,
});

describe("slugForProject", () => {
	test("英文标题折叠成 slug", () => {
		expect(slugForProject("20260627", "My Cool Demo!!")).toBe("20260627-my-cool-demo");
	});
	test("CJK 保留", () => {
		expect(slugForProject("20260627", "口播测试")).toBe("20260627-口播测试");
	});
	test("空标题回退 recording", () => {
		expect(slugForProject("20260627", "   ")).toBe("20260627-recording");
		expect(slugForProject("20260627", "!!!")).toBe("20260627-recording");
	});
	test("超长截断且不留尾连字符", () => {
		const s = slugForProject("20260627", "a".repeat(60));
		expect(s.length).toBeLessThanOrEqual(9 + 40);
		expect(s.endsWith("-")).toBe(false);
	});
});

describe("requirementsTemplate", () => {
	test("填入原始视频名 + 画幅 + 核心观点", () => {
		const md = requirementsTemplate(input({ coreIdea: "AI 工作流", orientation: "landscape" }));
		expect(md).toContain("raw/rec.mp4");
		expect(md).toContain("横屏 1280x720");
		expect(md).toContain("核心观点:AI 工作流");
		expect(md).toContain("[x] 只建项目");
	});
	test("默认竖屏", () => {
		expect(requirementsTemplate(input())).toContain("竖屏 1080x1920");
	});
});

describe("startupPrompt", () => {
	test("含项目目录 + 原始素材路径", () => {
		const p = startupPrompt("/x/projects/20260627-demo", input());
		expect(p).toContain("/x/projects/20260627-demo");
		expect(p).toContain("raw/rec.mp4");
	});
});

describe("insertIndexRow", () => {
	test("插在表头分隔行之后", () => {
		const idx = `# 视频项目索引

| Project | Status | Root | Notes |
| --- | --- | --- | --- |
| old | final | \`/x/old\` | 旧 |
`;
		const out = insertIndexRow(idx, indexRow("20260627-demo", "/x/demo", "新建"));
		const lines = out.split("\n");
		const sepIdx = lines.findIndex((l) => l.includes("---"));
		expect(lines[sepIdx + 1]).toContain("20260627-demo");
		expect(lines[sepIdx + 2]).toContain("old"); // 旧行仍在其后
	});
	test("无表格时降级追加,不丢原内容", () => {
		const out = insertIndexRow("# 索引\n没有表格", indexRow("s", "/r", "n"));
		expect(out).toContain("没有表格");
		expect(out).toContain("| s |");
	});
	test("note 里的竖线被转义不破表", () => {
		expect(indexRow("s", "/r", "a|b")).toContain("a/b");
	});
});
