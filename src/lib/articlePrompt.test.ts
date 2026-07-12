import { expect, test } from "vitest";
import { composeArticleInput } from "./articlePrompt";
import type { CockpitCard } from "./cockpitTypes";

test("composeArticleInput:带上灌观点字段(我的观点/反方/为什么),缺字段跳过", () => {
	const card: CockpitCard = {
		id: "c1",
		title: "AI 外贸选品",
		angle: "用智能体批量筛爆款",
		body: ["第一点", "  ", "第二点"],
		opinion: "我认为这是窗口期",
		bear: "但有平台政策风险",
		why: "因为流量在转移",
	};
	const s = composeArticleInput(card);
	expect(s).toContain("【标题】AI 外贸选品");
	expect(s).toContain("【我的观点】我认为这是窗口期");
	expect(s).toContain("【需要注意/反方】但有平台政策风险");
	expect(s).toContain("- 第一点");
	expect(s).toContain("- 第二点");
	expect(s).not.toContain("【适配定位】"); // 缺字段不出现
});

test("composeArticleInput:全空返回空串", () => {
	expect(composeArticleInput({ id: "c", title: "" })).toBe("");
});
