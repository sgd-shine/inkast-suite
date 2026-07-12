import { describe, expect, it } from "vitest";
import { normalizeRecordingSession } from "./recordingSession";

describe("normalizeRecordingSession", () => {
	it("preserves webcam shape and size settings captured from the live preview", () => {
		expect(
			normalizeRecordingSession({
				screenVideoPath: "/tmp/screen.webm",
				webcamVideoPath: "/tmp/webcam.webm",
				createdAt: 123,
				webcamSettings: {
					maskShape: "circle",
					sizePreset: 32,
				},
			}),
		).toMatchObject({
			webcamSettings: {
				maskShape: "circle",
				sizePreset: 32,
			},
		});
	});

	it("clamps invalid webcam size metadata instead of leaking it into the editor", () => {
		expect(
			normalizeRecordingSession({
				screenVideoPath: "/tmp/screen.webm",
				webcamVideoPath: "/tmp/webcam.webm",
				createdAt: 123,
				webcamSettings: {
					maskShape: "not-a-shape",
					sizePreset: 150,
				},
			})?.webcamSettings,
		).toEqual({
			sizePreset: 100,
		});
	});

	// follow 模式的 positionTimeline 是「录制元数据 → webcamFollow 逐帧插值」的入口;清洗有回归会
	// 让插值错位甚至 NaN,而 webcamFollow 测的是已干净数据,测不到上游脏数据(review testqa F5)。
	it("cleans the follow position timeline: drops bad samples, clamps range, sorts ascending", () => {
		const out = normalizeRecordingSession({
			screenVideoPath: "/tmp/screen.webm",
			webcamVideoPath: "/tmp/webcam.webm",
			createdAt: 123,
			webcamSettings: {
				cameraPositionMode: "follow",
				positionTimeline: [
					{ tMs: 500, cx: 0.5, cy: 0.5 },
					{ tMs: 0, cx: 1.5, cy: -0.2 }, // 越界 → clamp 到 1 / 0
					{ tMs: Number.NaN, cx: 0.3, cy: 0.3 }, // tMs 非有限 → 丢
					{ tMs: 200, cx: 0.4 }, // 缺 cy → 丢
					"garbage", // 非对象 → 丢
				],
			},
		})?.webcamSettings;
		expect(out?.cameraPositionMode).toBe("follow");
		expect(out?.positionTimeline).toEqual([
			{ tMs: 0, cx: 1, cy: 0 },
			{ tMs: 500, cx: 0.5, cy: 0.5 },
		]);
	});

	it("drops invalid cameraPositionMode and all-invalid timeline (follow falls back to static)", () => {
		const out = normalizeRecordingSession({
			screenVideoPath: "/tmp/screen.webm",
			webcamVideoPath: "/tmp/webcam.webm",
			createdAt: 123,
			webcamSettings: {
				cameraPositionMode: "sideways",
				positionTimeline: [{ tMs: "x" }, "junk"],
			},
		})?.webcamSettings;
		// 无任何合法字段 → webcamSettings 整体归 undefined(不把非法 mode/轨迹漏进编辑器)
		expect(out).toBeUndefined();
	});
});
