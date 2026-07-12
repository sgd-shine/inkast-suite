import { describe, expect, it } from "vitest";
import { buildZoomCursorTelemetry } from "./zoomCursorTelemetry";

describe("buildZoomCursorTelemetry", () => {
	it("drops crop-outside samples so auto-follow does not chase crop edges", () => {
		const samples = buildZoomCursorTelemetry(
			[
				{ timeMs: 0, cx: 0.2, cy: 0.5 },
				{ timeMs: 100, cx: 0.35, cy: 0.5 },
				{ timeMs: 200, cx: 0.5, cy: 0.5 },
				{ timeMs: 300, cx: 0.9, cy: 0.5 },
			],
			1000,
			{ x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
		);

		expect(samples).toEqual([
			{ timeMs: 100, cx: 0.2, cy: 0.5 },
			{ timeMs: 200, cx: 0.5, cy: 0.5 },
		]);
	});
});
