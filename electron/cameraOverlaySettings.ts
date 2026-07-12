import type { CameraPositionMode, WebcamPositionSample } from "../src/lib/recordingSession";

export type CameraOverlayShape = "circle" | "square";

// Inkast: 录制时摄像头叠加窗的归一化中心位置(相对被录制显示器,0–1)。
// 让编辑器里的画中画落在"录制时拖到的位置",而不是固定右下角。
export type CameraOverlayPosition = { cx: number; cy: number };

export type CameraOverlayRecordingSettings = {
	maskShape: CameraOverlayShape;
	sizePreset: number;
	position?: CameraOverlayPosition;
	// fixed=成片用录制前位置;follow=用录制中位置时间线还原拖动轨迹(§摄像头位置模式)。
	cameraPositionMode?: CameraPositionMode;
	positionTimeline?: WebcamPositionSample[];
};

type Size = {
	width: number;
	height: number;
};

export type CameraOverlaySettingsSnapshot = {
	shape: CameraOverlayShape;
	sizePx: number;
	displaySize: Size;
	recording: CameraOverlayRecordingSettings;
};

const DEFAULT_SIZE_PX = 280;
const DEFAULT_DISPLAY_SIZE: Size = { width: 1920, height: 1080 };
const MIN_WEBCAM_SIZE_PRESET = 10;
// 上限 50→100:让录制前把摄像头叠加窗拖大后,成片里的摄像头也能足够大(原来封顶 ~37% 宽=太小)。
const MAX_WEBCAM_SIZE_PRESET = 100;

let currentShape: CameraOverlayShape = "circle";
let currentSizePx = DEFAULT_SIZE_PX;
let currentDisplaySize = DEFAULT_DISPLAY_SIZE;
let currentPosition: CameraOverlayPosition | null = null;

// ── 摄像头位置模式 + follow 采集 ──
// 录制前由 HUD 选 fixed/follow。fixed:成片用录制开始时的位置(忽略录制中拖动)。
// follow:录制中按时间采样位置 → 成片还原拖动轨迹。
let currentMode: CameraPositionMode = "fixed";
let recordingStartMs: number | null = null; // !=null 表示正在录制采集
let fixedStartPosition: CameraOverlayPosition | null = null; // fixed 模式:录制开始时的快照
let positionTimeline: WebcamPositionSample[] = [];
let lastSampleMs = -1;
const SAMPLE_MIN_GAP_MS = 33; // 采样节流上限约 30/s

export function setCameraPositionMode(mode: CameraPositionMode): void {
	currentMode = mode === "follow" ? "follow" : "fixed";
}

export function getCameraPositionMode(): CameraPositionMode {
	return currentMode;
}

/** 录制开始:快照 fixed 位置、清空并起头 follow 时间线。now 应≈屏幕视频 t=0。 */
export function beginCameraPositionCapture(now: number = Date.now()): void {
	recordingStartMs = now;
	fixedStartPosition = currentPosition ? { ...currentPosition } : null;
	positionTimeline = [];
	lastSampleMs = -1;
	if (currentPosition) {
		positionTimeline.push({ tMs: 0, cx: currentPosition.cx, cy: currentPosition.cy });
		lastSampleMs = 0;
	}
}

/** 录制结束:补一个末位采样,停止采集(保留时间线供保存读取)。 */
export function endCameraPositionCapture(now: number = Date.now()): void {
	if (recordingStartMs !== null && currentPosition) {
		positionTimeline.push({
			tMs: Math.max(0, now - recordingStartMs),
			cx: currentPosition.cx,
			cy: currentPosition.cy,
		});
	}
	recordingStartMs = null;
}

function maybeSamplePosition(pos: CameraOverlayPosition): void {
	if (recordingStartMs === null) return;
	const tMs = Math.max(0, Date.now() - recordingStartMs);
	if (lastSampleMs >= 0 && tMs - lastSampleMs < SAMPLE_MIN_GAP_MS) return; // 节流
	positionTimeline.push({ tMs, cx: pos.cx, cy: pos.cy });
	lastSampleMs = tMs;
}

// Inkast: windows.ts 注册一个"从实时叠加窗口刷新一次 size/position"的回调。
// 录制结束保存会话时先调用它,保证拿到的是"录制结束时"的窗口状态(录制过程中
// 拖动/缩放也算),而不是录制开始前的快照。避免对 windows.ts 的循环依赖。
let liveMetricsProvider: (() => void) | null = null;
let refreshingMetrics = false;

export function setCameraOverlayLiveMetricsProvider(provider: (() => void) | null): void {
	liveMetricsProvider = provider;
}

function isShape(value: unknown): value is CameraOverlayShape {
	return value === "circle" || value === "square";
}

function positiveFinite(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value));
}

function finiteNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clampSizePreset(sizePreset: number): number {
	return Math.max(MIN_WEBCAM_SIZE_PRESET, Math.min(MAX_WEBCAM_SIZE_PRESET, sizePreset));
}

export function resolveCameraOverlayRecordingSettings(input: {
	shape: unknown;
	sizePx: number;
	displaySize: Size;
}): CameraOverlayRecordingSettings {
	const referenceDim = Math.sqrt(input.displaySize.width * input.displaySize.height);
	const sizePreset = referenceDim > 0 ? Math.round((input.sizePx / referenceDim) * 100) : 25;

	return {
		maskShape: isShape(input.shape) ? input.shape : "circle",
		sizePreset: clampSizePreset(sizePreset),
	};
}

export function updateCameraOverlaySettings(update: {
	shape?: unknown;
	sizePx?: unknown;
	displaySize?: Partial<Size>;
	position?: { cx?: unknown; cy?: unknown };
}): CameraOverlaySettingsSnapshot {
	if (isShape(update.shape)) {
		currentShape = update.shape;
	}

	const nextSizePx = positiveFinite(update.sizePx);
	if (nextSizePx !== null) {
		currentSizePx = Math.round(nextSizePx);
	}

	const nextDisplayWidth = positiveFinite(update.displaySize?.width);
	const nextDisplayHeight = positiveFinite(update.displaySize?.height);
	if (nextDisplayWidth !== null && nextDisplayHeight !== null) {
		currentDisplaySize = {
			width: Math.round(nextDisplayWidth),
			height: Math.round(nextDisplayHeight),
		};
	}

	if (update.position) {
		const cx = finiteNumber(update.position.cx);
		const cy = finiteNumber(update.position.cy);
		if (cx !== null && cy !== null) {
			currentPosition = { cx: clamp01(cx), cy: clamp01(cy) };
			// follow:录制中每次位置变化采样进时间线(节流);fixed 也采但保存时只用快照。
			maybeSamplePosition(currentPosition);
		}
	}

	return getCameraOverlaySettingsSnapshot();
}

export function getCameraOverlayRecordingSettings(): CameraOverlayRecordingSettings {
	// 先从实时窗口刷新一次,确保拿到录制结束时的最终大小/位置。
	// refreshingMetrics 防重入:provider → syncMetrics → updateCameraOverlaySettings →
	// getCameraOverlaySettingsSnapshot → 又会调到这里,不加守卫会无限递归。
	if (!refreshingMetrics && liveMetricsProvider) {
		refreshingMetrics = true;
		try {
			liveMetricsProvider();
		} finally {
			refreshingMetrics = false;
		}
	}
	const base = resolveCameraOverlayRecordingSettings({
		shape: currentShape,
		sizePx: currentSizePx,
		displaySize: currentDisplaySize,
	});
	// fixed:成片用录制开始时的位置(忽略录制中拖动);follow:用当前位置兜底 + 时间线还原轨迹。
	const position =
		currentMode === "fixed" ? (fixedStartPosition ?? currentPosition) : currentPosition;
	const result: CameraOverlayRecordingSettings = {
		...base,
		cameraPositionMode: currentMode,
		...(position ? { position } : {}),
	};
	if (currentMode === "follow" && positionTimeline.length > 0) {
		result.positionTimeline = positionTimeline;
	}
	return result;
}

export function getCameraOverlaySettingsSnapshot(): CameraOverlaySettingsSnapshot {
	return {
		shape: currentShape,
		sizePx: currentSizePx,
		displaySize: currentDisplaySize,
		recording: getCameraOverlayRecordingSettings(),
	};
}
