import { normalizeCursorTelemetry } from "./timeline/zoomSuggestionUtils";
import type { CropRegion, CursorTelemetryPoint } from "./types";

export function buildZoomCursorTelemetry(
	cursorTelemetry: CursorTelemetryPoint[],
	totalMs: number,
	cropRegion?: CropRegion | null,
) {
	return normalizeCursorTelemetry(cursorTelemetry, totalMs, {
		cropRegion,
		dropOutsideCrop: true,
	});
}
