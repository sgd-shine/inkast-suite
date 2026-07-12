import { describe, expect, it } from "vitest";
import { type AutoFollowState, smoothAutoFollowFocus } from "./autoFollowSmoothing";

const stateAt = (cx: number, cy: number): AutoFollowState => ({ focus: { cx, cy }, vx: 0, vy: 0 });

describe("smoothAutoFollowFocus", () => {
	it("snaps to raw on the first frame (no previous state)", () => {
		const smoothed = smoothAutoFollowFocus({
			raw: { cx: 0.3, cy: 0.7 },
			previous: null,
			deltaMs: 1000 / 60,
		});
		expect(smoothed.focus).toEqual({ cx: 0.3, cy: 0.7 });
		expect(smoothed.vx).toBe(0);
		expect(smoothed.vy).toBe(0);
	});

	it("holds the camera steady for cursor jitter inside the deadzone", () => {
		const previous = stateAt(0.5, 0.5);
		const smoothed = smoothAutoFollowFocus({
			raw: { cx: 0.503, cy: 0.502 },
			previous,
			deltaMs: 1000 / 60,
		});
		expect(smoothed.focus).toEqual(previous.focus);
	});

	it("eases toward intentional movement without snapping to it", () => {
		const smoothed = smoothAutoFollowFocus({
			raw: { cx: 0.8, cy: 0.5 },
			previous: stateAt(0.5, 0.5),
			deltaMs: 1000 / 60,
		});
		expect(smoothed.focus.cx).toBeGreaterThan(0.5);
		expect(smoothed.focus.cx).toBeLessThan(0.8);
		expect(smoothed.focus.cy).toBeCloseTo(0.5, 6);
	});

	it("advances further for a larger elapsed time (frame-rate independent)", () => {
		const previewStep = smoothAutoFollowFocus({
			raw: { cx: 0.8, cy: 0.5 },
			previous: stateAt(0.5, 0.5),
			deltaMs: 1000 / 60,
		});
		const exportStep = smoothAutoFollowFocus({
			raw: { cx: 0.8, cy: 0.5 },
			previous: stateAt(0.5, 0.5),
			deltaMs: 1000 / 30,
		});
		expect(exportStep.focus.cx).toBeGreaterThan(previewStep.focus.cx);
		expect(exportStep.focus.cx).toBeLessThan(0.8);
	});

	it("tightens the deadzone as zoom increases (suppresses magnified jitter)", () => {
		const previous = stateAt(0.5, 0.5);
		// A 0.01 move pans at 1x, but at 3x the deadzone (0.006*3=0.018) holds it steady.
		const smoothed = smoothAutoFollowFocus({
			raw: { cx: 0.51, cy: 0.5 },
			previous,
			deltaMs: 1000 / 60,
			zoomScale: 3,
		});
		expect(smoothed.focus).toEqual(previous.focus);
	});
});
