import { expect, test } from "vitest";
import type { CockpitCard } from "./cockpitTypes";
import { composeTopicScript } from "./topicScript";

test("拼全字段口播稿:标题/角度/要点/自问", () => {
	const card: CockpitCard = {
		id: "c1",
		title: "AI 外贸选品",
		angle: "用智能体批量筛爆款",
		body: ["第一点", "第二点"],
		hooks: ["这条凭什么火?", "我能复刻吗?"],
	};
	const s = composeTopicScript(card);
	expect(s).toContain("AI 外贸选品");
	expect(s).toContain("用智能体批量筛爆款");
	expect(s).toContain("第一点\n第二点");
	expect(s).toContain("自问:");
	expect(s).toContain("· 这条凭什么火?");
});

test("缺字段自动跳过,不留空段", () => {
	expect(composeTopicScript({ id: "c", title: "只有标题" })).toBe("只有标题");
	expect(composeTopicScript({ id: "c", title: "", angle: "  " })).toBe("");
});

test("灌观点字段(opinion/bear/why/fit)随漏斗一起搬,不丢", () => {
	const card: CockpitCard = {
		id: "c2",
		title: "标题",
		angle: "角度",
		opinion: "我的核心判断",
		why: "因为窗口期到了",
		fit: "适合做空头视角",
		bear: "但有政策风险",
	};
	const s = composeTopicScript(card);
	expect(s).toContain("核心观点:\n我的核心判断");
	expect(s).toContain("为什么值得做:\n因为窗口期到了");
	expect(s).toContain("适配定位:\n适合做空头视角");
	expect(s).toContain("需要注意:\n但有政策风险");
	// 顺序:观点在角度之后、需要注意在自问之前
	expect(s.indexOf("角度")).toBeLessThan(s.indexOf("核心观点"));
});
