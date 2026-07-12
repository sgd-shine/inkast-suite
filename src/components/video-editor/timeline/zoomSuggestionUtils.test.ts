import { describe, expect, it } from "vitest";
import {
	detectZoomDwellCandidates,
	getZoomSuggestionDurationMs,
	normalizeCursorTelemetry,
	selectZoomSuggestions,
} from "./zoomSuggestionUtils";

describe("zoomSuggestionUtils", () => {
	it("normalizes cursor telemetry into the selected crop region", () => {
		const samples = normalizeCursorTelemetry(
			[
				{ timeMs: 100, cx: 0.3, cy: 0.4 },
				{ timeMs: 200, cx: 0.7, cy: 0.75 },
				{ timeMs: 300, cx: 0.95, cy: 0.5 },
			],
			1000,
			{
				cropRegion: { x: 0.2, y: 0.25, width: 0.5, height: 0.5 },
				dropOutsideCrop: true,
			},
		);

		expect(samples).toEqual([
			{ timeMs: 100, cx: 0.2, cy: 0.3 },
			{ timeMs: 200, cx: 1, cy: 1 },
		]);
	});

	it("uses click interactions as strong zoom intent anchors", () => {
		const candidates = detectZoomDwellCandidates([
			{ timeMs: 0, cx: 0.2, cy: 0.2 },
			{ timeMs: 250, cx: 0.6, cy: 0.6, interactionType: "click" },
			{ timeMs: 500, cx: 0.9, cy: 0.9 },
		]);

		expect(candidates).toContainEqual(
			expect.objectContaining({
				centerTimeMs: 250,
				focus: { cx: 0.6, cy: 0.6 },
				kind: "interaction",
			}),
		);
	});

	it("does not turn a continuous pass across the screen into one averaged dwell", () => {
		const samples = Array.from({ length: 21 }, (_, index) => ({
			timeMs: index * 100,
			cx: 0.1 + index * 0.04,
			cy: 0.5,
		}));

		expect(detectZoomDwellCandidates(samples)).toEqual([]);
	});

	it("keeps automatic zoom suggestions short enough for cursor-follow", () => {
		const duration = getZoomSuggestionDurationMs(
			{
				centerTimeMs: 20_000,
				focus: { cx: 0.5, cy: 0.5 },
				strength: 12_000,
				kind: "dwell",
			},
			10 * 60 * 1000,
		);

		expect(duration).toBeLessThanOrEqual(2800);
		expect(duration).toBeGreaterThanOrEqual(1200);
	});

	it("spaces automatic zoom suggestions so repeated clicks do not over-segment the edit", () => {
		const totalMs = 60_000;
		const candidates = detectZoomDwellCandidates(
			Array.from({ length: 16 }, (_, index) => ({
				timeMs: 1000 + index * 2000,
				cx: index % 2 === 0 ? 0.42 : 0.58,
				cy: 0.5,
				interactionType: "click" as const,
			})),
		);

		const suggestions = selectZoomSuggestions(candidates, totalMs);

		expect(suggestions).toHaveLength(5);
		for (let index = 1; index < suggestions.length; index += 1) {
			expect(
				suggestions[index].centerTimeMs - suggestions[index - 1].centerTimeMs,
			).toBeGreaterThanOrEqual(4500);
		}
	});
});
