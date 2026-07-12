import { type EditorState, INITIAL_EDITOR_STATE } from "@/hooks/useEditorHistory";
import type { RecordingSession, WebcamPositionSample } from "@/lib/recordingSession";
import type { CropRegion, WebcamMaskShape } from "./types";

function isWebcamMaskShape(value: unknown): value is WebcamMaskShape {
	return value === "rectangle" || value === "circle" || value === "square" || value === "rounded";
}

function normalizeWebcamSizePreset(value: unknown): number | null {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return null;
	}

	// 上限 50→100,与 compositeLayout/cameraOverlaySettings 一致(摄像头可做大);旧工程预设 ≤50 不变。
	return Math.max(10, Math.min(100, Math.round(value)));
}

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value));
}

// Inkast: 把"录制时叠加窗相对显示器的归一化中心"换算成编辑器画中画位置。
// 整屏录制时直接用;框选区域录制时再换算到裁剪区域内。超出 [0,1] 的会被 clamp。
function resolveWebcamPositionFromSession(
	position: { cx: number; cy: number } | undefined,
	selectedRegion: CropRegion | null | undefined,
): { cx: number; cy: number } | null {
	if (!position || !Number.isFinite(position.cx) || !Number.isFinite(position.cy)) {
		return null;
	}
	if (hasMeaningfulCropRegion(selectedRegion)) {
		return {
			cx: clamp01((position.cx - selectedRegion.x) / selectedRegion.width),
			cy: clamp01((position.cy - selectedRegion.y) / selectedRegion.height),
		};
	}
	return { cx: clamp01(position.cx), cy: clamp01(position.cy) };
}

function hasMeaningfulCropRegion(region: CropRegion | null | undefined): region is CropRegion {
	return Boolean(
		region &&
			(region.width < 0.999 || region.height < 0.999 || region.x > 0.001 || region.y > 0.001),
	);
}

export function createInitialEditorStateFromRecordingSession(
	session: RecordingSession,
	selectedRegion?: CropRegion | null,
): EditorState {
	const webcamSettings = session.webcamVideoPath ? session.webcamSettings : undefined;
	const maskShape = isWebcamMaskShape(webcamSettings?.maskShape)
		? webcamSettings.maskShape
		: INITIAL_EDITOR_STATE.webcamMaskShape;
	const sizePreset =
		normalizeWebcamSizePreset(webcamSettings?.sizePreset) ?? INITIAL_EDITOR_STATE.webcamSizePreset;
	const webcamPosition =
		resolveWebcamPositionFromSession(webcamSettings?.position, selectedRegion) ??
		INITIAL_EDITOR_STATE.webcamPosition;

	// follow 模式:把时间线每个采样按同样的裁剪换算映射进编辑器坐标。
	const cameraPositionMode = webcamSettings?.cameraPositionMode ?? "fixed";
	const webcamPositionTimeline: WebcamPositionSample[] = (webcamSettings?.positionTimeline ?? [])
		.map((s) => {
			const p = resolveWebcamPositionFromSession({ cx: s.cx, cy: s.cy }, selectedRegion);
			return p ? { tMs: s.tMs, cx: p.cx, cy: p.cy } : null;
		})
		.filter((s): s is WebcamPositionSample => s !== null);

	return {
		...INITIAL_EDITOR_STATE,
		...(hasMeaningfulCropRegion(selectedRegion)
			? { cropRegion: selectedRegion, aspectRatio: "native" as const }
			: {}),
		webcamMaskShape: maskShape,
		webcamSizePreset: sizePreset,
		webcamPosition,
		webcamPositionMode: cameraPositionMode,
		...(webcamPositionTimeline.length > 0 ? { webcamPositionTimeline } : {}),
	};
}
