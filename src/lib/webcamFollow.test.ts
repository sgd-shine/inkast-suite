import { expect, test } from "vitest";
import type { WebcamPositionSample } from "./recordingSession";
import { resolveFollowPositionAt, resolveWebcamPositionAt } from "./webcamFollow";

const TL: WebcamPositionSample[] = [
	{ tMs: 0, cx: 0.1, cy: 0.1 },
	{ tMs: 1000, cx: 0.5, cy: 0.5 },
	{ tMs: 2000, cx: 0.9, cy: 0.3 },
];

test("resolveFollowPositionAt:端点钳制", () => {
	expect(resolveFollowPositionAt(TL, -100)).toEqual({ cx: 0.1, cy: 0.1 });
	expect(resolveFollowPositionAt(TL, 0)).toEqual({ cx: 0.1, cy: 0.1 });
	expect(resolveFollowPositionAt(TL, 5000)).toEqual({ cx: 0.9, cy: 0.3 });
});

test("resolveFollowPositionAt:区间线性插值", () => {
	const half = resolveFollowPositionAt(TL, 500); // 0/1000 区间中点
	expect(half?.cx).toBeCloseTo(0.3);
	expect(half?.cy).toBeCloseTo(0.3);
	const mid = resolveFollowPositionAt(TL, 1500);
	expect(mid?.cx).toBeCloseTo(0.7); // 0.5→0.9 中点
	expect(mid?.cy).toBeCloseTo(0.4); // 0.5→0.3 中点
});

test("resolveFollowPositionAt:空/单点", () => {
	expect(resolveFollowPositionAt([], 100)).toBeNull();
	expect(resolveFollowPositionAt(undefined, 100)).toBeNull();
	expect(resolveFollowPositionAt([{ tMs: 0, cx: 0.4, cy: 0.6 }], 999)).toEqual({
		cx: 0.4,
		cy: 0.6,
	});
});

test("resolveWebcamPositionAt:follow 用时间线", () => {
	const p = resolveWebcamPositionAt({ mode: "follow", timeline: TL, timeMs: 500 });
	expect(p?.cx).toBeCloseTo(0.3);
	expect(p?.cy).toBeCloseTo(0.3);
});

test("resolveWebcamPositionAt:fixed / 无时间线 → 静态位置(向后兼容)", () => {
	const stat = { cx: 0.8, cy: 0.8 };
	expect(resolveWebcamPositionAt({ mode: "fixed", staticPosition: stat, timeMs: 500 })).toEqual(
		stat,
	);
	expect(
		resolveWebcamPositionAt({ mode: "follow", timeline: [], staticPosition: stat, timeMs: 500 }),
	).toEqual(stat); // follow 但无样本 → 回退静态
	expect(resolveWebcamPositionAt({ staticPosition: stat, timeMs: 0 })).toEqual(stat);
	expect(resolveWebcamPositionAt({ timeMs: 0 })).toBeNull();
});
