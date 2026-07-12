export interface ProjectMedia {
	screenVideoPath: string;
	webcamVideoPath?: string;
	cursorCaptureMode?: CursorCaptureMode;
	webcamSettings?: RecordingWebcamSettings;
}

export type CursorCaptureMode = "editable-overlay" | "system";
export type RecordingWebcamMaskShape = "rectangle" | "circle" | "square" | "rounded";

// 摄像头位置模式(录制前二选一):
//   fixed  = 固定:成片全程用「录制前设定的位置」,录制中拖动不算数。
//   follow = 跟随:成片还原「录制中拖动的轨迹」(头像随时间移动)。
export type CameraPositionMode = "fixed" | "follow";

/** follow 模式的位置采样:tMs 相对录制开始;cx/cy 归一化中心(0–1,相对被录显示器)。 */
export interface WebcamPositionSample {
	tMs: number;
	cx: number;
	cy: number;
}

export interface RecordingWebcamSettings {
	maskShape?: RecordingWebcamMaskShape;
	sizePreset?: number;
	// Inkast: 录制时摄像头叠加窗的归一化中心(相对被录显示器,0–1)。编辑器用它把
	// 画中画放到"录制时拖到的位置",而非固定右下角。fixed 模式=录制前位置;无 timeline 时回退到它。
	position?: { cx: number; cy: number };
	/** 位置模式;缺省按 fixed(向后兼容旧录制)。 */
	cameraPositionMode?: CameraPositionMode;
	/** follow 模式:录制中位置时间序列(按 tMs 升序)。fixed 模式为空/不填。 */
	positionTimeline?: WebcamPositionSample[];
}

export interface RecordingSession extends ProjectMedia {
	createdAt: number;
}

export interface RecordedVideoAssetInput {
	fileName: string;
	videoData: ArrayBuffer;
}

export interface StoreRecordedSessionInput {
	screen: RecordedVideoAssetInput;
	webcam?: RecordedVideoAssetInput;
	createdAt?: number;
	cursorCaptureMode?: CursorCaptureMode;
	webcamSettings?: RecordingWebcamSettings;
	/**
	 * Recording wall-clock duration in milliseconds. Used by the main process
	 * to patch the WebM Duration header on streamed recordings, since the
	 * renderer no longer holds the bytes. Browser MediaRecorder writes WebM
	 * with no/zero duration; without this patch, the editor's seek bar and
	 * timeline break for any recording that took the streaming path.
	 */
	durationMs?: number;
}

export function normalizeCursorCaptureMode(value: unknown): CursorCaptureMode | undefined {
	return value === "editable-overlay" || value === "system" ? value : undefined;
}

function normalizePath(value: unknown): string | undefined {
	if (typeof value !== "string") {
		return undefined;
	}

	const trimmed = value.trim();
	return trimmed ? trimmed : undefined;
}

function normalizeWebcamMaskShape(value: unknown): RecordingWebcamMaskShape | undefined {
	return value === "rectangle" || value === "circle" || value === "square" || value === "rounded"
		? value
		: undefined;
}

function normalizeWebcamSizePreset(value: unknown): number | undefined {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return undefined;
	}

	// 上限 50→100(摄像头可做大);旧工程预设 ≤50 解析结果不变(向后兼容)。
	return Math.max(10, Math.min(100, Math.round(value)));
}

function normalizeWebcamPosition(value: unknown): { cx: number; cy: number } | undefined {
	if (!value || typeof value !== "object") {
		return undefined;
	}
	const raw = value as { cx?: unknown; cy?: unknown };
	if (
		typeof raw.cx !== "number" ||
		!Number.isFinite(raw.cx) ||
		typeof raw.cy !== "number" ||
		!Number.isFinite(raw.cy)
	) {
		return undefined;
	}
	const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
	return { cx: clamp01(raw.cx), cy: clamp01(raw.cy) };
}

function normalizeCameraPositionMode(value: unknown): CameraPositionMode | undefined {
	return value === "fixed" || value === "follow" ? value : undefined;
}

function normalizePositionTimeline(value: unknown): WebcamPositionSample[] | undefined {
	if (!Array.isArray(value)) {
		return undefined;
	}
	const out: WebcamPositionSample[] = [];
	for (const s of value) {
		if (!s || typeof s !== "object") continue;
		const r = s as { tMs?: unknown };
		if (typeof r.tMs !== "number" || !Number.isFinite(r.tMs)) continue;
		const pos = normalizeWebcamPosition(s);
		if (!pos) continue;
		out.push({ tMs: Math.max(0, r.tMs), cx: pos.cx, cy: pos.cy });
	}
	if (out.length === 0) return undefined;
	out.sort((a, b) => a.tMs - b.tMs);
	return out;
}

function normalizeWebcamSettings(value: unknown): RecordingWebcamSettings | undefined {
	if (!value || typeof value !== "object") {
		return undefined;
	}

	const raw = value as Partial<RecordingWebcamSettings>;
	const maskShape = normalizeWebcamMaskShape(raw.maskShape);
	const sizePreset = normalizeWebcamSizePreset(raw.sizePreset);
	const position = normalizeWebcamPosition(raw.position);
	const cameraPositionMode = normalizeCameraPositionMode(raw.cameraPositionMode);
	const positionTimeline = normalizePositionTimeline(raw.positionTimeline);
	const normalized: RecordingWebcamSettings = {
		...(maskShape ? { maskShape } : {}),
		...(sizePreset !== undefined ? { sizePreset } : {}),
		...(position ? { position } : {}),
		...(cameraPositionMode ? { cameraPositionMode } : {}),
		...(positionTimeline ? { positionTimeline } : {}),
	};

	return Object.keys(normalized).length > 0 ? normalized : undefined;
}

export function normalizeProjectMedia(candidate: unknown): ProjectMedia | null {
	if (!candidate || typeof candidate !== "object") {
		return null;
	}

	const raw = candidate as Partial<ProjectMedia>;
	const screenVideoPath = normalizePath(raw.screenVideoPath);

	if (!screenVideoPath) {
		return null;
	}

	const webcamVideoPath = normalizePath(raw.webcamVideoPath);
	const cursorCaptureMode = normalizeCursorCaptureMode(raw.cursorCaptureMode);
	const webcamSettings = webcamVideoPath ? normalizeWebcamSettings(raw.webcamSettings) : undefined;

	return {
		screenVideoPath,
		...(webcamVideoPath ? { webcamVideoPath } : {}),
		...(cursorCaptureMode ? { cursorCaptureMode } : {}),
		...(webcamSettings ? { webcamSettings } : {}),
	};
}

export function normalizeRecordingSession(candidate: unknown): RecordingSession | null {
	if (!candidate || typeof candidate !== "object") {
		return null;
	}

	const raw = candidate as Partial<RecordingSession>;
	const media = normalizeProjectMedia(raw);
	if (!media) {
		return null;
	}

	return {
		...media,
		createdAt:
			typeof raw.createdAt === "number" && Number.isFinite(raw.createdAt)
				? raw.createdAt
				: Date.now(),
	};
}
