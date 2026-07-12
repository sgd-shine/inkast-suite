import { expect, test } from "vitest";
import type { CockpitPrefs, PrefItem } from "./cockpitPrefs";
import {
	cycleChannel,
	cycleGroup,
	FLOW,
	nextStatus,
	normalizePrefs,
	prefList,
	setPreset,
	togglePlatform,
} from "./cockpitPrefs";

// 偏好引擎是 src/lib 最大的纯逻辑文件,直接决定驾驶舱看到/排序什么,之前零测试(review testqa F2)。
// 这些规则被后续改动打乱时,UI 会静默给出错的可见性/排序而无人报警——这里把每条规则钉死。

test("normalizePrefs(null):回退到 ai_trade 预设,字段齐全", () => {
	const p = normalizePrefs(null);
	expect(p.preset).toBe("ai_trade");
	expect(p.groups.ai).toBe("boost"); // ai_trade 默认
	expect(p.groups.health).toBe("hide"); // ai_trade 默认隐藏健康
	expect(Object.values(p.platforms).every((v) => v === true)).toBe(true);
});

test("normalizePrefs:非法 state 归一为 normal,缺失平台补 true", () => {
	const p = normalizePrefs({
		groups: { ai: "bogus" },
		platforms: { YouTube: false },
	} as unknown as Partial<CockpitPrefs>);
	expect(p.groups.ai).toBe("normal"); // 非法值被归一
	expect(p.platforms.YouTube).toBe(false); // 合法布尔保留
	expect(p.platforms["抖音热榜"]).toBe(true); // 缺失的补 true
});

test("prefList:种子(seed)恒置顶", () => {
	const prefs = normalizePrefs(null);
	const items: PrefItem[] = [{ title: "普通条目 zzzqqq" }, { kind: "seed", title: "种子" }];
	const out = prefList(items, prefs);
	expect(out[0].title).toBe("种子");
});

test("prefList:命中 boost 组得分更高、排在中性条目前", () => {
	const prefs = normalizePrefs(null); // trade=boost
	const boostItem: PrefItem = { title: "外贸出口新政" }; // 命中 trade 组
	const neutral: PrefItem = { title: "zzzqqq 无关" };
	const out = prefList([neutral, boostItem], prefs);
	expect(out.map((x) => x.title)).toEqual(["外贸出口新政", "zzzqqq 无关"]);
});

test("prefList:命中 hide 组的条目被过滤掉", () => {
	const prefs = normalizePrefs(null); // health=hide
	const out = prefList([{ title: "健康保健营养品" }, { title: "外贸出口" }], prefs);
	expect(out.some((x) => x.title === "健康保健营养品")).toBe(false);
});

test("prefList:平台关闭后该平台条目被过滤", () => {
	const prefs = togglePlatform(normalizePrefs(null), "小红书热榜"); // 关掉小红书
	const out = prefList([{ title: "随便", plat: "小红书热榜" }], prefs);
	expect(out).toHaveLength(0);
});

test("prefList:同分按原顺序稳定排序", () => {
	const prefs = normalizePrefs(null);
	const out = prefList([{ title: "aaa中性" }, { title: "bbb中性" }], prefs);
	expect(out.map((x) => x.title)).toEqual(["aaa中性", "bbb中性"]);
});

test("cycleGroup:boost→normal→hide→boost 三态环,且 preset 变 custom", () => {
	let p = normalizePrefs(null); // ai=boost
	p = cycleGroup(p, "ai");
	expect(p.groups.ai).toBe("normal");
	expect(p.preset).toBe("custom");
	p = cycleGroup(p, "ai");
	expect(p.groups.ai).toBe("hide");
	p = cycleGroup(p, "ai");
	expect(p.groups.ai).toBe("boost");
});

test("cycleChannel:同样三态环 + preset custom", () => {
	const p = cycleChannel(normalizePrefs(null), "official"); // official=boost → normal
	expect(p.channels.official).toBe("normal");
	expect(p.preset).toBe("custom");
});

test("togglePlatform:翻转开关 + preset custom", () => {
	const p = togglePlatform(normalizePrefs(null), "YouTube");
	expect(p.platforms.YouTube).toBe(false);
	expect(p.preset).toBe("custom");
});

test("setPreset:套用预设的组/渠道/平台", () => {
	expect(setPreset("health").groups.health).toBe("boost");
	expect(setPreset("balanced").preset).toBe("balanced");
});

test("nextStatus:沿 FLOW 推进;终态回绕到候选(当前为循环语义)", () => {
	expect(nextStatus("候选")).toBe("已选");
	expect(nextStatus("已灌观点")).toBe("已成稿");
	// 终态「已推草稿」点一下回绕到「候选」——这是当前有意的循环语义。
	// 若将来要在终态停住(防漏斗倒流),改 nextStatus 并更新此断言。
	expect(nextStatus(FLOW[FLOW.length - 1])).toBe("候选");
	// 未知状态:indexOf 为 -1 → 落到 FLOW[0]
	expect(nextStatus("不存在的状态")).toBe("候选");
});
