import { describe, expect, it } from "vitest";
import { projectHudRectForZoomState } from "./webcamZoomSync";

describe("projectHudRectForZoomState", () => {
	it("syncs PiP webcam scale without applying cursor-follow pan", () => {
		const rect = projectHudRectForZoomState(
			{ x: 100, y: 50, width: 200, height: 120, borderRadius: 16 },
			{ scale: 1.8, x: -320, y: -180 },
			{ stageSize: { width: 1280, height: 720 }, safeMargin: 16 },
		);

		expect(rect.x).toBeCloseTo(72);
		expect(rect.y).toBeCloseTo(33.2);
		expect(rect.width).toBeCloseTo(256);
		expect(rect.height).toBeCloseTo(153.6);
		expect(rect.borderRadius).toBeCloseTo(20.48);
	});

	it("clamps the webcam HUD inside the final canvas", () => {
		const rect = projectHudRectForZoomState(
			{ x: 1100, y: 620, width: 220, height: 140, borderRadius: 20 },
			{ scale: 5, x: -900, y: -600 },
			{ stageSize: { width: 1280, height: 720 }, safeMargin: 16 },
		);

		expect(rect.x).toBeCloseTo(967);
		expect(rect.y).toBeCloseTo(515);
		expect(rect.width).toBeCloseTo(297);
		expect(rect.height).toBeCloseTo(189);
	});
});
