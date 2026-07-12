import type { StyledRenderRect } from "@/lib/compositeLayout";

export interface StageTransform {
	scale: number;
	x: number;
	y: number;
}

export interface HudProjectionOptions {
	stageSize: { width: number; height: number };
	safeMargin?: number;
}

const HUD_ZOOM_RESPONSE = 0.35;
const MIN_HUD_SCALE = 1;
const MAX_HUD_SCALE = 1.35;
const DEFAULT_SAFE_MARGIN_PX = 16;

function clamp(value: number, min: number, max: number) {
	return Math.max(min, Math.min(max, value));
}

function getZoomSyncedHudScale(zoomScale: number) {
	const safeZoomScale = Number.isFinite(zoomScale) && zoomScale > 0 ? zoomScale : 1;
	return clamp(1 + (safeZoomScale - 1) * HUD_ZOOM_RESPONSE, MIN_HUD_SCALE, MAX_HUD_SCALE);
}

export function projectHudRectForZoomState<T extends StyledRenderRect>(
	rect: T,
	transform: StageTransform,
	options: HudProjectionOptions,
): T {
	const hudScale = getZoomSyncedHudScale(transform.scale);
	const stageWidth = options.stageSize.width;
	const stageHeight = options.stageSize.height;
	const safeMargin = options.safeMargin ?? DEFAULT_SAFE_MARGIN_PX;

	if (stageWidth <= 0 || stageHeight <= 0) {
		return rect;
	}

	const width = rect.width * hudScale;
	const height = rect.height * hudScale;
	const centerX = rect.x + rect.width / 2;
	const centerY = rect.y + rect.height / 2;
	const maxX = Math.max(safeMargin, stageWidth - safeMargin - width);
	const maxY = Math.max(safeMargin, stageHeight - safeMargin - height);

	return {
		...rect,
		x: clamp(centerX - width / 2, safeMargin, maxX),
		y: clamp(centerY - height / 2, safeMargin, maxY),
		width,
		height,
		borderRadius: rect.borderRadius * hudScale,
	};
}

export function shouldSyncWebcamWithZoom(layoutPreset?: string | null) {
	return layoutPreset === "picture-in-picture";
}
