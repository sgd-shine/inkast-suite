import type { Span } from "dnd-timeline";
import {
	Bug,
	Check,
	ChevronDown,
	Download,
	FileDown,
	FolderOpen,
	HelpCircle,
	ImagePlus,
	Languages,
	RectangleHorizontal,
	Save,
	Star,
	Video,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { toast } from "sonner";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n, useScopedT } from "@/contexts/I18nContext";
import { useShortcuts } from "@/contexts/ShortcutsContext";
import { INITIAL_EDITOR_STATE, useEditorHistory } from "@/hooks/useEditorHistory";
import { usePauseDetection } from "@/hooks/usePauseDetection";
import { useTranscription } from "@/hooks/useTranscription";
import { type Locale } from "@/i18n/config";
import { getAvailableLocales, getLocaleName } from "@/i18n/loader";
import { localeToWhisperLanguage } from "@/lib/asr/language";
import { hasNativeCursorRecordingData } from "@/lib/cursor/nativeCursor";
import { buildSubtitleCues } from "@/lib/cut/subtitleCues";
import {
	calculateEffectiveSourceDimensions,
	calculateMp4ExportSettings,
	calculateOutputDimensions,
	type ExportFormat,
	type ExportProgress,
	type ExportQuality,
	type ExportSettings,
	GIF_SIZE_PRESETS,
	GifExporter,
	type GifFrameRate,
	type GifSizePreset,
	VideoExporter,
} from "@/lib/exporter";
import { computeFrameStepTime } from "@/lib/frameStep";
import type { CursorCaptureMode, ProjectMedia } from "@/lib/recordingSession";
import { matchesShortcut } from "@/lib/shortcuts";
import {
	getExportFolder,
	loadUserPreferences,
	parentDirectoryOf,
	saveUserPreferences,
} from "@/lib/userPreferences";
import { BackgroundLoadError } from "@/lib/wallpaper";
import { nativeBridgeClient, useCursorRecordingData, useCursorTelemetry } from "@/native";
import type { NativePlatform } from "@/native/contracts";
import {
	ASPECT_RATIOS,
	type AspectRatio,
	getAspectRatioLabel,
	getAspectRatioValue,
	getNativeAspectRatioValue,
	isPortraitAspectRatio,
} from "@/utils/aspectRatioUtils";
import { getTestId } from "@/utils/getTestId";
import { EditorEmptyState } from "./EditorEmptyState";
import { ExportDialog } from "./ExportDialog";
import {
	DEFAULT_CURSOR_SETTINGS,
	DEFAULT_EXPORT_SETTINGS,
	DEFAULT_GIF_SETTINGS,
	DEFAULT_SOURCE_DIMENSIONS,
} from "./editorDefaults";
import { MediaPanel, type MediaTab } from "./MediaPanel";
import PlaybackControls from "./PlaybackControls";
import {
	createProjectData,
	createProjectSnapshot,
	deriveNextId,
	fromFileUrl,
	hasProjectUnsavedChanges,
	normalizeProjectEditor,
	resolveProjectMedia,
	toFileUrl,
	validateProjectData,
} from "./projectPersistence";
import { createInitialEditorStateFromRecordingSession } from "./recordingSessionEditorState";
import { SettingsPanel } from "./SettingsPanel";
import { TranscriptReviewPanel } from "./TranscriptReviewPanel";
import TimelineEditor from "./timeline/TimelineEditor";
import {
	type AnnotationRegion,
	type BlurData,
	clampFocusToDepth,
	DEFAULT_ANNOTATION_OPACITY,
	DEFAULT_ANNOTATION_POSITION,
	DEFAULT_ANNOTATION_SIZE,
	DEFAULT_ANNOTATION_STYLE,
	DEFAULT_BLUR_DATA,
	DEFAULT_FIGURE_DATA,
	DEFAULT_OVERLAY_CLIP_DURATION_MS,
	DEFAULT_OVERLAY_CLIP_SIZE,
	DEFAULT_PLAYBACK_SPEED,
	DEFAULT_ZOOM_DEPTH,
	type FigureData,
	type OverlayClipRegion,
	type PlaybackSpeed,
	type Rotation3DPreset,
	type SpeedRegion,
	type TrimRegion,
	ZOOM_DEPTH_SCALES,
	type ZoomDepth,
	type ZoomFocus,
	type ZoomFocusMode,
	type ZoomRegion,
} from "./types";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog";
import VideoPlayback, { VideoPlaybackRef } from "./VideoPlayback";
import { buildZoomCursorTelemetry } from "./zoomCursorTelemetry";

function isClickInteractionType(interactionType: string | null | undefined) {
	return (
		interactionType === "click" ||
		interactionType === "double-click" ||
		interactionType === "right-click" ||
		interactionType === "middle-click"
	);
}

interface ExportDiagnostics {
	formatLabel: "GIF" | "Video";
	reason?: string;
	sourcePath?: string | null;
	width?: number;
	height?: number;
	frameRate?: number;
	codec?: string;
	bitrate?: number;
}

function getFileNameForDiagnostics(filePath?: string | null) {
	if (!filePath) return "unknown";

	try {
		const url = new URL(filePath);
		if (url.protocol === "file:") {
			return decodeURIComponent(url.pathname).split(/[\\/]/).pop() || filePath;
		}
	} catch {
		// Treat non-URL values as filesystem paths.
	}

	return filePath.split(/[\\/]/).pop() || filePath;
}

function buildExportDiagnosticMessage(diagnostics: ExportDiagnostics) {
	const details = [
		diagnostics.reason ? `Reason: ${diagnostics.reason}` : null,
		`Source: ${getFileNameForDiagnostics(diagnostics.sourcePath)}`,
		diagnostics.width && diagnostics.height
			? `Output: ${diagnostics.width}x${diagnostics.height}${
					diagnostics.frameRate ? ` @ ${diagnostics.frameRate} fps` : ""
				}`
			: null,
		diagnostics.codec ? `Codec: ${diagnostics.codec}` : null,
		diagnostics.bitrate ? `Bitrate: ${Math.round(diagnostics.bitrate / 1_000_000)} Mbps` : null,
		`VideoEncoder: ${"VideoEncoder" in window ? "available" : "unavailable"}`,
	].filter(Boolean);

	return `${diagnostics.formatLabel} export failed\n${details.join("\n")}`;
}

function buildSaveDiagnosticMessage(formatLabel: "GIF" | "Video", reason?: string) {
	return `${formatLabel} export save failed${reason ? `\nReason: ${reason}` : ""}`;
}

// Inkast §3: 外部拖入是否携带文件(用来区分"拖图片进来"与内部 pointer 拖动)。
function dragHasFile(event: React.DragEvent): boolean {
	return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

// Inkast §3 Phase 2:用一个临时 video 元素探测叠加视频时长(用于裁剪/clamp)。
function probeVideoDurationMs(url: string): Promise<number> {
	return new Promise((resolve) => {
		const probe = document.createElement("video");
		probe.preload = "metadata";
		probe.muted = true;
		probe.onloadedmetadata = () => {
			const ms = Number.isFinite(probe.duration) ? Math.round(probe.duration * 1000) : 0;
			probe.removeAttribute("src");
			probe.load();
			resolve(ms);
		};
		probe.onerror = () => resolve(0);
		probe.src = url;
	});
}

export default function VideoEditor({ embedded = false }: { embedded?: boolean } = {}) {
	const {
		state: editorState,
		pushState,
		updateState,
		commitState,
		undo,
		redo,
		resetState,
	} = useEditorHistory(INITIAL_EDITOR_STATE);

	const {
		zoomRegions,
		trimRegions,
		speedRegions,
		annotationRegions,
		overlayClipRegions,
		subtitleCues,
		showSubtitles,
		cropRegion,
		wallpaper,
		shadowIntensity,
		showBlur,
		showTrimWaveform,
		motionBlurAmount,
		borderRadius,
		padding,
		aspectRatio,
		webcamLayoutPreset,
		webcamMaskShape,
		webcamSizePreset,
		webcamPosition,
		webcamPositionMode,
		webcamPositionTimeline,
	} = editorState;

	// ── Non-undoable state
	const [videoPath, setVideoPath] = useState<string | null>(null);
	const [videoSourcePath, setVideoSourcePath] = useState<string | null>(null);
	const [webcamVideoPath, setWebcamVideoPath] = useState<string | null>(null);
	const [webcamVideoSourcePath, setWebcamVideoSourcePath] = useState<string | null>(null);
	const [currentProjectPath, setCurrentProjectPath] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [isPlaying, setIsPlaying] = useState(false);
	const [currentTime, setCurrentTime] = useState(0);
	const [duration, setDuration] = useState(0);
	const currentTimeRef = useRef(currentTime);
	currentTimeRef.current = currentTime;
	const durationRef = useRef(duration);
	durationRef.current = duration;
	const [selectedZoomId, setSelectedZoomId] = useState<string | null>(null);
	const [isPreviewingZoom, setIsPreviewingZoom] = useState(false);
	const [selectedTrimId, setSelectedTrimId] = useState<string | null>(null);
	const [selectedSpeedId, setSelectedSpeedId] = useState<string | null>(null);
	const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
	const [selectedBlurId, setSelectedBlurId] = useState<string | null>(null);
	const [selectedOverlayClipId, setSelectedOverlayClipId] = useState<string | null>(null);
	const [isExporting, setIsExporting] = useState(false);
	const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
	const [exportError, setExportError] = useState<string | null>(null);
	const [showExportDialog, setShowExportDialog] = useState(false);
	const [showNewRecordingDialog, setShowNewRecordingDialog] = useState(false);
	const [exportQuality, setExportQuality] = useState<ExportQuality>(
		DEFAULT_EXPORT_SETTINGS.quality,
	);
	const [exportFormat, setExportFormat] = useState<ExportFormat>(DEFAULT_EXPORT_SETTINGS.format);
	const [gifFrameRate, setGifFrameRate] = useState<GifFrameRate>(DEFAULT_GIF_SETTINGS.frameRate);
	const [gifLoop, setGifLoop] = useState(DEFAULT_GIF_SETTINGS.loop);
	const [gifSizePreset, setGifSizePreset] = useState<GifSizePreset>(
		DEFAULT_GIF_SETTINGS.sizePreset,
	);
	const [exportedFilePath, setExportedFilePath] = useState<string | null>(null);
	const [lastSavedSnapshot, setLastSavedSnapshot] = useState<string | null>(null);
	const [unsavedExport, setUnsavedExport] = useState<{
		arrayBuffer: ArrayBuffer;
		fileName: string;
		format: string;
	} | null>(null);
	const [isFullscreen, setIsFullscreen] = useState(false);
	const [showCloseConfirmDialog, setShowCloseConfirmDialog] = useState(false);
	// Unsaved-changes confirmation for New Project / Load Project actions.
	// (The window-close flow uses showCloseConfirmDialog above.)
	const [confirmDialogVariant, setConfirmDialogVariant] = useState<
		"newProject" | "loadProject" | null
	>(null);
	const playerContainerRef = useRef<HTMLDivElement | null>(null);
	const cursorTelemetrySourcePath = videoSourcePath ?? (videoPath ? fromFileUrl(videoPath) : null);
	const { samples: cursorTelemetry, error: cursorTelemetryError } =
		useCursorTelemetry(cursorTelemetrySourcePath);
	// Inkast §4 Phase 1:进编辑器后自动检测长停顿(能量 VAD),供「智能粗剪」横幅。
	const { pauses: detectedPauses, status: pauseStatus } = usePauseDetection(videoPath ?? undefined);
	const { locale, setLocale, t: rawT } = useI18n();
	// Inkast §4:按界面语言给 whisper 语言提示(zh→chinese),否则它默认英语 → 中文出乱码。
	const {
		status: transcriptionStatus,
		progress: transcriptionProgress,
		words: detectedWords,
		fillers: detectedFillers,
		error: transcriptionError,
		transcribe: runTranscription,
	} = useTranscription(videoPath ?? undefined, localeToWhisperLanguage(locale));
	const lastToastedTranscriptionError = useRef<string | null>(null);
	const [reviewOpen, setReviewOpen] = useState(false);
	// Inkast 界面对齐 Phase 3:左侧媒体面板的功能 Tab(媒体 / 智能)。
	const [mediaTab, setMediaTab] = useState<MediaTab>("media");
	const { data: cursorRecordingData, error: cursorRecordingDataError } =
		useCursorRecordingData(cursorTelemetrySourcePath);
	const cursorClickTimestamps = useMemo<number[]>(() => {
		const recordingClicks =
			cursorRecordingData?.samples
				.filter((sample) => isClickInteractionType(sample.interactionType))
				.map((sample) => sample.timeMs) ?? [];
		if (recordingClicks.length > 0) {
			return recordingClicks;
		}

		return cursorTelemetry
			.filter((sample) => isClickInteractionType(sample.interactionType))
			.map((sample) => sample.timeMs);
	}, [cursorRecordingData, cursorTelemetry]);
	const zoomCursorTelemetry = useMemo(() => {
		const totalMs = Math.max(
			duration > 0 ? Math.round(duration * 1000) : 0,
			...cursorTelemetry.map((sample) => sample.timeMs),
		);
		return buildZoomCursorTelemetry(cursorTelemetry, totalMs, cropRegion);
	}, [cursorTelemetry, duration, cropRegion]);

	// Cursor & motion blur visual settings (non-undoable preferences)
	const [showCursor, setShowCursor] = useState(DEFAULT_CURSOR_SETTINGS.show);
	const [cursorSize, setCursorSize] = useState(DEFAULT_CURSOR_SETTINGS.size);
	const [cursorSmoothing, setCursorSmoothing] = useState(DEFAULT_CURSOR_SETTINGS.smoothing);
	const [cursorMotionBlur, setCursorMotionBlur] = useState(DEFAULT_CURSOR_SETTINGS.motionBlur);
	const [cursorClickBounce, setCursorClickBounce] = useState(DEFAULT_CURSOR_SETTINGS.clickBounce);
	const [cursorClipToBounds, setCursorClipToBounds] = useState(
		DEFAULT_CURSOR_SETTINGS.clipToBounds,
	);
	const [nativePlatform, setNativePlatform] = useState<NativePlatform | null>(null);
	const [recordingCursorCaptureMode, setRecordingCursorCaptureMode] =
		useState<CursorCaptureMode | null>(null);

	const videoPlaybackRef = useRef<VideoPlaybackRef>(null);

	const nextZoomIdRef = useRef(1);
	const nextTrimIdRef = useRef(1);
	const nextSpeedIdRef = useRef(1);

	const { shortcuts, isMac } = useShortcuts();
	// Native Windows recordings include captured cursor assets. Native macOS
	// recordings hide the system cursor in ScreenCaptureKit and use telemetry
	// samples with OpenScreen's default arrow asset for the editable overlay.
	const hasEditableCursorRecording =
		recordingCursorCaptureMode === "editable-overlay" &&
		// macOS 现在走 getDisplayMedia/getUserMedia(FORCE_GET_DISPLAY_MEDIA_ON_MAC),cursor:"never" 仅 win32 生效,
		// 系统光标已被烙进视频。再叠加平滑光标 = 双光标/重影(且叠加层用默认箭头、不随状态变形,快移时尤其明显)。
		// 故 mac 不启用叠加层,直接用录像里那个真·光标。将来若 mac 改回原生(SCK 无光标)采集,把 darwin 加回这里。
		nativePlatform === "win32" &&
		hasNativeCursorRecordingData(cursorRecordingData);
	const effectiveShowCursor = showCursor && hasEditableCursorRecording;
	const showCursorSettings = hasEditableCursorRecording;
	const t = useScopedT("editor");
	const ts = useScopedT("settings");
	const tTimeline = useScopedT("timeline");
	const availableLocales = getAvailableLocales();

	// Inkast §4:转写失败时把 worker 的真实错误 toast 出来(打包版没 DevTools 也能看到),
	// 便于定位是网络拉模型失败还是 WebGPU/WASM 推理报错。ref 去重避免重复弹。
	useEffect(() => {
		if (transcriptionStatus === "error" && transcriptionError) {
			if (lastToastedTranscriptionError.current !== transcriptionError) {
				lastToastedTranscriptionError.current = transcriptionError;
				toast.error(t("errors.transcriptionFailed", { error: transcriptionError }));
			}
		} else if (transcriptionStatus !== "error") {
			lastToastedTranscriptionError.current = null;
		}
	}, [transcriptionStatus, transcriptionError, t]);

	const nextAnnotationIdRef = useRef(1);
	const nextAnnotationZIndexRef = useRef(1);
	const nextOverlayClipIdRef = useRef(1);
	const exporterRef = useRef<VideoExporter | null>(null);
	// Inkast §3: 隐藏的图片选择 input,「插入图片」按钮触发它。
	const imageOverlayInputRef = useRef<HTMLInputElement>(null);

	const annotationOnlyRegions = useMemo(
		() => annotationRegions.filter((region) => region.type !== "blur"),
		[annotationRegions],
	);
	const blurRegions = useMemo(
		() => annotationRegions.filter((region) => region.type === "blur"),
		[annotationRegions],
	);

	const currentProjectMedia = useMemo<ProjectMedia | null>(() => {
		const screenVideoPath = videoSourcePath ?? (videoPath ? fromFileUrl(videoPath) : null);
		if (!screenVideoPath) {
			return null;
		}

		const webcamSourcePath =
			webcamVideoSourcePath ?? (webcamVideoPath ? fromFileUrl(webcamVideoPath) : null);
		return {
			screenVideoPath,
			...(webcamSourcePath ? { webcamVideoPath: webcamSourcePath } : {}),
			...(recordingCursorCaptureMode ? { cursorCaptureMode: recordingCursorCaptureMode } : {}),
		};
	}, [
		videoPath,
		videoSourcePath,
		webcamVideoPath,
		webcamVideoSourcePath,
		recordingCursorCaptureMode,
	]);

	const applyLoadedProject = useCallback(
		async (candidate: unknown, path?: string | null) => {
			if (!validateProjectData(candidate)) {
				return false;
			}

			const project = candidate;
			const projectMedia = resolveProjectMedia(project);
			if (!projectMedia) {
				return false;
			}
			const sourcePath = projectMedia.screenVideoPath;
			const webcamSourcePath = projectMedia.webcamVideoPath ?? null;
			const projectCursorCaptureMode = projectMedia.cursorCaptureMode ?? null;
			const normalizedEditor = normalizeProjectEditor(project.editor);
			const inferredDurationMs = Math.max(
				0,
				...normalizedEditor.zoomRegions.map((region) => region.endMs),
				...normalizedEditor.trimRegions.map((region) => region.endMs),
				...normalizedEditor.speedRegions.map((region) => region.endMs),
				...normalizedEditor.annotationRegions.map((region) => region.endMs),
			);

			try {
				videoPlaybackRef.current?.pause();
			} catch {
				// no-op
			}
			setIsPlaying(false);
			setCurrentTime(0);
			setDuration(inferredDurationMs > 0 ? inferredDurationMs / 1000 : 0);

			setError(null);
			setVideoSourcePath(sourcePath);
			setVideoPath(toFileUrl(sourcePath));
			setWebcamVideoSourcePath(webcamSourcePath);
			setWebcamVideoPath(webcamSourcePath ? toFileUrl(webcamSourcePath) : null);
			setRecordingCursorCaptureMode(projectCursorCaptureMode);
			setCurrentProjectPath(path ?? null);

			pushState({
				wallpaper: normalizedEditor.wallpaper,
				shadowIntensity: normalizedEditor.shadowIntensity,
				showBlur: normalizedEditor.showBlur,
				showTrimWaveform: normalizedEditor.showTrimWaveform,
				motionBlurAmount: normalizedEditor.motionBlurAmount,
				borderRadius: normalizedEditor.borderRadius,
				padding: normalizedEditor.padding,
				cropRegion: normalizedEditor.cropRegion,
				zoomRegions: normalizedEditor.zoomRegions,
				trimRegions: normalizedEditor.trimRegions,
				speedRegions: normalizedEditor.speedRegions,
				annotationRegions: normalizedEditor.annotationRegions,
				overlayClipRegions: normalizedEditor.overlayClipRegions,
				subtitleCues: normalizedEditor.subtitleCues,
				showSubtitles: normalizedEditor.showSubtitles,
				aspectRatio: normalizedEditor.aspectRatio,
				webcamLayoutPreset: normalizedEditor.webcamLayoutPreset,
				webcamMaskShape: normalizedEditor.webcamMaskShape,
				webcamSizePreset: normalizedEditor.webcamSizePreset,
				webcamPosition: normalizedEditor.webcamPosition,
				webcamPositionMode: normalizedEditor.webcamPositionMode,
				webcamPositionTimeline: normalizedEditor.webcamPositionTimeline,
			});
			setExportQuality(normalizedEditor.exportQuality);
			setExportFormat(normalizedEditor.exportFormat);
			setGifFrameRate(normalizedEditor.gifFrameRate);
			setGifLoop(normalizedEditor.gifLoop);
			setGifSizePreset(normalizedEditor.gifSizePreset);

			setSelectedZoomId(null);
			setSelectedTrimId(null);
			setSelectedSpeedId(null);
			setSelectedAnnotationId(null);
			setSelectedBlurId(null);

			nextZoomIdRef.current = deriveNextId(
				"zoom",
				normalizedEditor.zoomRegions.map((region) => region.id),
			);
			nextTrimIdRef.current = deriveNextId(
				"trim",
				normalizedEditor.trimRegions.map((region) => region.id),
			);
			nextSpeedIdRef.current = deriveNextId(
				"speed",
				normalizedEditor.speedRegions.map((region) => region.id),
			);
			nextAnnotationIdRef.current = deriveNextId(
				"annotation",
				normalizedEditor.annotationRegions.map((region) => region.id),
			);
			nextAnnotationZIndexRef.current =
				normalizedEditor.annotationRegions.reduce(
					(max, region) => Math.max(max, region.zIndex),
					0,
				) + 1;

			setLastSavedSnapshot(
				createProjectSnapshot(
					{
						screenVideoPath: sourcePath,
						...(webcamSourcePath ? { webcamVideoPath: webcamSourcePath } : {}),
						...(projectCursorCaptureMode ? { cursorCaptureMode: projectCursorCaptureMode } : {}),
					},
					normalizedEditor,
				),
			);
			return true;
		},
		[pushState],
	);

	const currentProjectSnapshot = useMemo(() => {
		if (!currentProjectMedia) {
			return null;
		}
		return createProjectSnapshot(currentProjectMedia, {
			wallpaper,
			shadowIntensity,
			showBlur,
			showTrimWaveform,
			motionBlurAmount,
			borderRadius,
			padding,
			cropRegion,
			zoomRegions,
			trimRegions,
			speedRegions,
			annotationRegions,
			overlayClipRegions,
			subtitleCues,
			showSubtitles,
			aspectRatio,
			webcamLayoutPreset,
			webcamMaskShape,
			webcamSizePreset,
			webcamPosition,
			exportQuality,
			exportFormat,
			gifFrameRate,
			gifLoop,
			gifSizePreset,
		});
	}, [
		currentProjectMedia,
		wallpaper,
		shadowIntensity,
		showBlur,
		showTrimWaveform,
		motionBlurAmount,
		borderRadius,
		padding,
		cropRegion,
		zoomRegions,
		trimRegions,
		speedRegions,
		annotationRegions,
		overlayClipRegions,
		subtitleCues,
		showSubtitles,
		aspectRatio,
		webcamLayoutPreset,
		webcamMaskShape,
		webcamSizePreset,
		webcamPosition,
		exportQuality,
		exportFormat,
		gifFrameRate,
		gifLoop,
		gifSizePreset,
	]);

	const hasUnsavedChanges = hasProjectUnsavedChanges(currentProjectSnapshot, lastSavedSnapshot);

	useEffect(() => {
		async function loadInitialData() {
			try {
				const currentProjectResult = await nativeBridgeClient.project.loadCurrentProjectFile();
				if (currentProjectResult.success && currentProjectResult.project) {
					const restored = await applyLoadedProject(
						currentProjectResult.project,
						currentProjectResult.path ?? null,
					);
					if (restored) {
						return;
					}
				}

				const currentSessionResult = await window.electronAPI.getCurrentRecordingSession();
				if (currentSessionResult.success && currentSessionResult.session) {
					const session = currentSessionResult.session;
					const sourcePath = fromFileUrl(session.screenVideoPath);
					const webcamSourcePath = session.webcamVideoPath
						? fromFileUrl(session.webcamVideoPath)
						: null;
					setVideoSourcePath(sourcePath);
					setVideoPath(toFileUrl(sourcePath));
					setWebcamVideoSourcePath(webcamSourcePath);
					setWebcamVideoPath(webcamSourcePath ? toFileUrl(webcamSourcePath) : null);
					setRecordingCursorCaptureMode(session.cursorCaptureMode ?? null);
					// Inkast: if the user drag-selected a region before recording, crop to it. We
					// always capture the full display; aspectRatio "native" + padding 0 makes the
					// output fill cleanly with no letterbox. Undo (Cmd+Z) reverts to the full frame.
					const selectedRegion = await window.electronAPI.getSelectedRegion().catch(() => null);
					const initialEditorState = createInitialEditorStateFromRecordingSession(
						session,
						selectedRegion,
					);
					pushState(initialEditorState);
					setCurrentProjectPath(null);
					setLastSavedSnapshot(
						createProjectSnapshot(
							{
								screenVideoPath: sourcePath,
								...(webcamSourcePath ? { webcamVideoPath: webcamSourcePath } : {}),
								...(session.cursorCaptureMode
									? { cursorCaptureMode: session.cursorCaptureMode }
									: {}),
							},
							initialEditorState,
						),
					);
					return;
				}

				const result = await nativeBridgeClient.project.getCurrentVideoPath();
				if (result.success && result.path) {
					setVideoSourcePath(result.path);
					setVideoPath(toFileUrl(result.path));
					setRecordingCursorCaptureMode(null);
					setCurrentProjectPath(null);
					setLastSavedSnapshot(
						createProjectSnapshot({ screenVideoPath: result.path }, INITIAL_EDITOR_STATE),
					);
				}
				// No video/project/session — leave videoPath null so the
				// EditorEmptyState dashboard renders instead of an error screen.
			} catch (err) {
				setError("Error loading video: " + String(err));
			} finally {
				setLoading(false);
			}
		}

		loadInitialData();
	}, [applyLoadedProject, pushState]);

	// Track whether user preferences have been loaded to avoid
	// overwriting saved prefs with defaults on the first render
	const [prefsHydrated, setPrefsHydrated] = useState(false);

	// Load persisted user preferences on mount (intentionally runs once)
	useEffect(() => {
		const prefs = loadUserPreferences();
		updateState({
			padding: prefs.padding,
			aspectRatio: prefs.aspectRatio,
		});
		setExportQuality(prefs.exportQuality);
		setExportFormat(prefs.exportFormat);
		setPrefsHydrated(true);
	}, [updateState]);

	// Auto-save user preferences when settings change
	useEffect(() => {
		if (!prefsHydrated) return;
		saveUserPreferences({ padding, aspectRatio, exportQuality, exportFormat });
	}, [prefsHydrated, padding, aspectRatio, exportQuality, exportFormat]);

	const saveProject = useCallback(
		async (forceSaveAs: boolean) => {
			if (!videoPath) {
				toast.error(t("errors.noVideoLoaded"));
				return false;
			}

			if (!currentProjectMedia) {
				toast.error(t("errors.unableToDetermineSourcePath"));
				return false;
			}

			const editorState = {
				wallpaper,
				shadowIntensity,
				showBlur,
				showTrimWaveform,
				motionBlurAmount,
				borderRadius,
				padding,
				cropRegion,
				zoomRegions,
				trimRegions,
				speedRegions,
				annotationRegions,
				overlayClipRegions,
				subtitleCues,
				showSubtitles,
				aspectRatio,
				webcamLayoutPreset,
				webcamMaskShape,
				webcamSizePreset,
				webcamPosition,
				exportQuality,
				exportFormat,
				gifFrameRate,
				gifLoop,
				gifSizePreset,
			};
			const projectData = createProjectData(currentProjectMedia, editorState);

			const fileNameBase =
				currentProjectMedia.screenVideoPath
					.split(/[\\/]/)
					.pop()
					?.replace(/\.[^.]+$/, "") || `project-${Date.now()}`;
			// Match the normalization path used by `currentProjectSnapshot` so the
			// post-save baseline compares equal and `hasUnsavedChanges` clears.
			const projectSnapshot = createProjectSnapshot(currentProjectMedia, editorState);
			const result = await nativeBridgeClient.project.saveProjectFile(
				projectData,
				fileNameBase,
				forceSaveAs ? undefined : (currentProjectPath ?? undefined),
			);

			if (result.canceled) {
				toast.info(t("project.saveCanceled"));
				return false;
			}

			if (!result.success) {
				toast.error(result.message || t("project.failedToSave"));
				return false;
			}

			if (result.path) {
				setCurrentProjectPath(result.path);
			}
			setLastSavedSnapshot(projectSnapshot);

			toast.success(t("project.savedTo", { path: result.path ?? "" }));
			return true;
		},
		[
			currentProjectMedia,
			currentProjectPath,
			wallpaper,
			shadowIntensity,
			showBlur,
			showTrimWaveform,
			motionBlurAmount,
			borderRadius,
			padding,
			cropRegion,
			zoomRegions,
			trimRegions,
			speedRegions,
			annotationRegions,
			aspectRatio,
			webcamLayoutPreset,
			webcamMaskShape,
			webcamPosition,
			exportQuality,
			exportFormat,
			gifFrameRate,
			gifLoop,
			gifSizePreset,
			videoPath,
			t,
			webcamSizePreset,
			overlayClipRegions,
			subtitleCues,
			showSubtitles,
		],
	);

	useEffect(() => {
		window.electronAPI.setHasUnsavedChanges(hasUnsavedChanges);
	}, [hasUnsavedChanges]);

	useEffect(() => {
		const cleanup = window.electronAPI.onRequestSaveBeforeClose(async () => {
			return saveProject(false);
		});
		return () => cleanup();
	}, [saveProject]);

	useEffect(() => {
		const cleanup = window.electronAPI.onRequestCloseConfirm(() => {
			setShowCloseConfirmDialog(true);
		});
		return () => cleanup();
	}, []);

	const handleCloseConfirmSave = useCallback(() => {
		setShowCloseConfirmDialog(false);
		window.electronAPI.sendCloseConfirmResponse("save");
	}, []);

	const handleCloseConfirmDiscard = useCallback(() => {
		setShowCloseConfirmDialog(false);
		window.electronAPI.sendCloseConfirmResponse("discard");
	}, []);

	const handleCloseConfirmCancel = useCallback(() => {
		setShowCloseConfirmDialog(false);
		window.electronAPI.sendCloseConfirmResponse("cancel");
	}, []);

	const handleSaveProject = useCallback(async () => {
		await saveProject(false);
	}, [saveProject]);

	const handleSaveProjectAs = useCallback(async () => {
		await saveProject(true);
	}, [saveProject]);

	const handleNewRecordingConfirm = useCallback(async () => {
		const result = await window.electronAPI.startNewRecording();
		if (result.success) {
			setShowNewRecordingDialog(false);
		} else {
			console.error("Failed to start new recording:", result.error);
			setError("Failed to start new recording: " + (result.error || "Unknown error"));
		}
	}, []);

	const doLoadProject = useCallback(async () => {
		const result = await nativeBridgeClient.project.loadProjectFile();

		if (result.canceled) {
			return;
		}

		if (!result.success) {
			toast.error(result.message || t("project.failedToLoad"));
			return;
		}

		const restored = await applyLoadedProject(result.project, result.path ?? null);
		if (!restored) {
			toast.error(t("project.invalidFormat"));
			return;
		}

		toast.success(t("project.loadedFrom", { path: result.path ?? "" }));
	}, [applyLoadedProject, t]);

	const handleLoadProject = useCallback(async () => {
		if (hasUnsavedChanges) {
			setConfirmDialogVariant("loadProject");
			return;
		}
		await doLoadProject();
	}, [hasUnsavedChanges, doLoadProject]);

	const handleLoadProjectConfirmSave = useCallback(async () => {
		setConfirmDialogVariant(null);
		const saved = await saveProject(false);
		if (saved) {
			await doLoadProject();
		}
	}, [saveProject, doLoadProject]);

	const handleLoadProjectConfirmDiscard = useCallback(async () => {
		setConfirmDialogVariant(null);
		await doLoadProject();
	}, [doLoadProject]);

	// New Project: clear all media/project/editor state back to the empty
	// Studio dashboard. Prompts to save first when there are unsaved changes.
	const doNewProject = useCallback(async () => {
		await nativeBridgeClient.project.clearCurrentVideoPath();
		setVideoPath(null);
		setVideoSourcePath(null);
		setWebcamVideoPath(null);
		setWebcamVideoSourcePath(null);
		setCurrentProjectPath(null);
		setLastSavedSnapshot(null);
		// Reset undoable editor state + undo/redo history to a clean slate.
		resetState();
		// Reset non-undoable selection state.
		setSelectedZoomId(null);
		setSelectedTrimId(null);
		setSelectedSpeedId(null);
		setSelectedAnnotationId(null);
		setSelectedBlurId(null);
		// Reset playback.
		setCurrentTime(0);
		setIsPlaying(false);
		// Reset cursor preferences to defaults.
		setShowCursor(DEFAULT_CURSOR_SETTINGS.show);
		setCursorSize(DEFAULT_CURSOR_SETTINGS.size);
		setCursorSmoothing(DEFAULT_CURSOR_SETTINGS.smoothing);
		setCursorMotionBlur(DEFAULT_CURSOR_SETTINGS.motionBlur);
		setCursorClickBounce(DEFAULT_CURSOR_SETTINGS.clickBounce);
		setCursorClipToBounds(DEFAULT_CURSOR_SETTINGS.clipToBounds);
		// Reset region ID counters.
		nextZoomIdRef.current = 1;
		nextTrimIdRef.current = 1;
		nextSpeedIdRef.current = 1;
		nextAnnotationIdRef.current = 1;
		nextAnnotationZIndexRef.current = 1;
	}, [resetState]);

	const handleNewProject = useCallback(async () => {
		if (hasUnsavedChanges) {
			setConfirmDialogVariant("newProject");
			return;
		}
		await doNewProject();
	}, [hasUnsavedChanges, doNewProject]);

	const handleNewProjectConfirmSave = useCallback(async () => {
		setConfirmDialogVariant(null);
		const saved = await saveProject(false);
		if (saved) {
			await doNewProject();
		}
	}, [saveProject, doNewProject]);

	const handleNewProjectConfirmDiscard = useCallback(async () => {
		setConfirmDialogVariant(null);
		await doNewProject();
	}, [doNewProject]);

	useEffect(() => {
		const removeNewProjectListener = window.electronAPI.onMenuNewProject(handleNewProject);
		const removeLoadListener = window.electronAPI.onMenuLoadProject(handleLoadProject);
		const removeSaveListener = window.electronAPI.onMenuSaveProject(handleSaveProject);
		const removeSaveAsListener = window.electronAPI.onMenuSaveProjectAs(handleSaveProjectAs);

		return () => {
			removeNewProjectListener?.();
			removeLoadListener?.();
			removeSaveListener?.();
			removeSaveAsListener?.();
		};
	}, [handleNewProject, handleLoadProject, handleSaveProject, handleSaveProjectAs]);

	useEffect(() => {
		let canceled = false;
		nativeBridgeClient.system
			.getPlatform()
			.then((platform) => {
				if (!canceled) {
					setNativePlatform(platform);
				}
			})
			.catch((error) => {
				console.warn("Unable to resolve native platform for cursor settings:", error);
				if (!canceled) {
					setNativePlatform(null);
				}
			});

		return () => {
			canceled = true;
		};
	}, []);

	useEffect(() => {
		if (cursorTelemetryError) {
			console.warn("Unable to load cursor telemetry:", cursorTelemetryError);
		}
	}, [cursorTelemetryError]);

	useEffect(() => {
		if (cursorRecordingDataError) {
			console.warn("Unable to load cursor recording data:", cursorRecordingDataError);
		}
	}, [cursorRecordingDataError]);

	function togglePlayPause() {
		const playback = videoPlaybackRef.current;
		const video = playback?.video;
		if (!playback || !video) return;

		if (isPlaying) {
			playback.pause();
		} else {
			playback.play().catch((err) => console.error("Video play failed:", err));
		}
	}

	const toggleFullscreen = useCallback(() => {
		setIsFullscreen((prev) => !prev);
	}, []);

	useEffect(() => {
		if (!isFullscreen) return;
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				setIsFullscreen(false);
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isFullscreen]);

	function handleSeek(time: number) {
		const video = videoPlaybackRef.current?.video;
		if (!video) return;
		video.currentTime = time;
	}

	const handleSelectZoom = useCallback((id: string | null) => {
		setSelectedZoomId(id);
		if (id) {
			setSelectedTrimId(null);
			setSelectedSpeedId(null);
			setSelectedAnnotationId(null);
			setSelectedBlurId(null);
			setSelectedOverlayClipId(null);
		}
	}, []);

	const handleSelectTrim = useCallback((id: string | null) => {
		setSelectedTrimId(id);
		if (id) {
			setSelectedZoomId(null);
			setSelectedSpeedId(null);
			setSelectedAnnotationId(null);
			setSelectedBlurId(null);
			setSelectedOverlayClipId(null);
		}
	}, []);

	const handleSelectAnnotation = useCallback((id: string | null) => {
		setSelectedAnnotationId(id);
		if (id) {
			setSelectedZoomId(null);
			setSelectedTrimId(null);
			setSelectedSpeedId(null);
			setSelectedBlurId(null);
			setSelectedOverlayClipId(null);
		}
	}, []);

	const handleSelectBlur = useCallback((id: string | null) => {
		setSelectedBlurId(id);
		if (id) {
			setSelectedZoomId(null);
			setSelectedTrimId(null);
			setSelectedAnnotationId(null);
			setSelectedSpeedId(null);
			setSelectedOverlayClipId(null);
		}
	}, []);

	const handleZoomAdded = useCallback(
		(span: Span) => {
			const id = `zoom-${nextZoomIdRef.current++}`;
			const newRegion: ZoomRegion = {
				id,
				startMs: Math.round(span.start),
				endMs: Math.round(span.end),
				depth: DEFAULT_ZOOM_DEPTH,
				customScale: ZOOM_DEPTH_SCALES[DEFAULT_ZOOM_DEPTH],
				focus: { cx: 0.5, cy: 0.5 },
			};
			pushState((prev) => ({ zoomRegions: [...prev.zoomRegions, newRegion] }));
			setSelectedZoomId(id);
			setSelectedTrimId(null);
			setSelectedSpeedId(null);
			setSelectedAnnotationId(null);
			setSelectedBlurId(null);
		},
		[pushState],
	);

	const handleZoomSuggested = useCallback(
		(span: Span, focus: ZoomFocus) => {
			const id = `zoom-${nextZoomIdRef.current++}`;
			const newRegion: ZoomRegion = {
				id,
				startMs: Math.round(span.start),
				endMs: Math.round(span.end),
				depth: DEFAULT_ZOOM_DEPTH,
				customScale: ZOOM_DEPTH_SCALES[DEFAULT_ZOOM_DEPTH],
				focus: clampFocusToDepth(focus, DEFAULT_ZOOM_DEPTH),
				focusMode: "auto",
			};
			// Bulk suggest must not steal selection — keeping a zoom selected hides
			// the export panel (SettingsPanel gates it on !hasTimelineSelection),
			// trapping users who just want to export after auto-zoom.
			pushState((prev) => ({ zoomRegions: [...prev.zoomRegions, newRegion] }));
		},
		[pushState],
	);

	const handleTrimAdded = useCallback(
		(span: Span) => {
			const id = `trim-${nextTrimIdRef.current++}`;
			const newRegion: TrimRegion = {
				id,
				startMs: Math.round(span.start),
				endMs: Math.round(span.end),
			};
			pushState((prev) => ({ trimRegions: [...prev.trimRegions, newRegion] }));
			setSelectedTrimId(id);
			setSelectedZoomId(null);
			setSelectedSpeedId(null);
			setSelectedAnnotationId(null);
			setSelectedBlurId(null);
		},
		[pushState],
	);

	// Inkast §4 Phase 1:一键删除全部检测到的停顿 —— 转成 TrimRegion(复用现有 ripple
	// 删除 + 导出剪掉),一次 pushState = 一步撤销。删完隐藏横幅。
	const handleRemoveAllPauses = useCallback(() => {
		if (detectedPauses.length === 0) return;
		const newTrims: TrimRegion[] = detectedPauses.map((p) => ({
			id: `trim-${nextTrimIdRef.current++}`,
			startMs: p.startMs,
			endMs: p.endMs,
		}));
		pushState((prev) => ({ trimRegions: [...prev.trimRegions, ...newTrims] }));
		toast.success(t("smartCut.removed", { count: String(newTrims.length) }));
	}, [detectedPauses, pushState, t]);

	// Inkast §4 Phase 2:一键删除转写出来的语气词/废话 —— 同样转成 TrimRegion。
	// 跳过已被现有 trim 完整覆盖的片段(避免和停顿删除重复叠加)。
	const handleRemoveFillers = useCallback(() => {
		if (detectedFillers.length === 0) return;
		pushState((prev) => {
			const existing = prev.trimRegions;
			const covered = (s: number, e: number) =>
				existing.some((tr) => tr.startMs <= s && tr.endMs >= e);
			const newTrims: TrimRegion[] = detectedFillers
				.filter((f) => !covered(f.startMs, f.endMs))
				.map((f) => ({
					id: `trim-${nextTrimIdRef.current++}`,
					startMs: f.startMs,
					endMs: f.endMs,
				}));
			if (newTrims.length === 0) return {};
			return { trimRegions: [...existing, ...newTrims] };
		});
		toast.success(t("smartCut.fillersRemoved", { count: String(detectedFillers.length) }));
	}, [detectedFillers, pushState, t]);

	// Inkast §4 Phase 2 复核面板「应用删除」:把用户在转写里勾选合并出的片段转成 TrimRegion。
	const handleApplyReviewCuts = useCallback(
		(segments: { startMs: number; endMs: number }[]) => {
			if (segments.length === 0) return;
			pushState((prev) => {
				const existing = prev.trimRegions;
				const covered = (s: number, e: number) =>
					existing.some((tr) => tr.startMs <= s && tr.endMs >= e);
				const newTrims: TrimRegion[] = segments
					.filter((g) => !covered(g.startMs, g.endMs))
					.map((g) => ({
						id: `trim-${nextTrimIdRef.current++}`,
						startMs: g.startMs,
						endMs: g.endMs,
					}));
				if (newTrims.length === 0) return {};
				return { trimRegions: [...existing, ...newTrims] };
			});
			toast.success(t("smartCut.reviewApplied", { count: String(segments.length) }));
		},
		[pushState, t],
	);

	// Inkast §4 Phase 3:从转写词生成字幕 cue,并打开字幕显示(可撤销;源时间轴坐标)。
	const handleGenerateSubtitles = useCallback(() => {
		if (detectedWords.length === 0) return;
		const cues = buildSubtitleCues(detectedWords);
		pushState({ subtitleCues: cues, showSubtitles: cues.length > 0 });
		toast.success(t("subtitles.generated", { count: String(cues.length) }));
	}, [detectedWords, pushState, t]);

	const handleToggleSubtitles = useCallback(() => {
		pushState((prev) => ({ showSubtitles: !prev.showSubtitles }));
	}, [pushState]);

	const handleZoomSpanChange = useCallback(
		(id: string, span: Span) => {
			pushState((prev) => ({
				zoomRegions: prev.zoomRegions.map((region) =>
					region.id === id
						? {
								...region,
								startMs: Math.round(span.start),
								endMs: Math.round(span.end),
							}
						: region,
				),
			}));
		},
		[pushState],
	);

	const handleTrimSpanChange = useCallback(
		(id: string, span: Span) => {
			pushState((prev) => ({
				trimRegions: prev.trimRegions.map((region) =>
					region.id === id
						? {
								...region,
								startMs: Math.round(span.start),
								endMs: Math.round(span.end),
							}
						: region,
				),
			}));
		},
		[pushState],
	);

	// Focus drag: updateState for live preview, commitState on pointer-up
	const handleZoomFocusChange = useCallback(
		(id: string, focus: ZoomFocus) => {
			updateState((prev) => ({
				zoomRegions: prev.zoomRegions.map((region) =>
					region.id === id ? { ...region, focus: clampFocusToDepth(focus, region.depth) } : region,
				),
			}));
		},
		[updateState],
	);

	const handleZoomDepthChange = useCallback(
		(depth: ZoomDepth) => {
			if (!selectedZoomId) return;
			pushState((prev) => ({
				zoomRegions: prev.zoomRegions.map((region) =>
					region.id === selectedZoomId
						? {
								...region,
								depth,
								customScale: ZOOM_DEPTH_SCALES[depth],
								focus: clampFocusToDepth(region.focus, depth),
							}
						: region,
				),
			}));
		},
		[selectedZoomId, pushState],
	);

	const handleZoomCustomScaleChange = useCallback(
		(scale: number) => {
			if (!selectedZoomId) return;
			const rounded = Math.round(scale * 100) / 100;
			if (!Number.isFinite(rounded)) return;
			updateState((prev) => ({
				zoomRegions: prev.zoomRegions.map((region) =>
					region.id === selectedZoomId ? { ...region, customScale: rounded } : region,
				),
			}));
		},
		[selectedZoomId, updateState],
	);

	const handleZoomCustomScaleCommit = useCallback(() => {
		commitState();
	}, [commitState]);

	const handleZoomFocusModeChange = useCallback(
		(focusMode: ZoomFocusMode) => {
			if (!selectedZoomId) return;
			pushState((prev) => ({
				zoomRegions: prev.zoomRegions.map((region) =>
					region.id === selectedZoomId ? { ...region, focusMode } : region,
				),
			}));
		},
		[selectedZoomId, pushState],
	);

	const handleZoomDelete = useCallback(
		(id: string) => {
			pushState((prev) => ({
				zoomRegions: prev.zoomRegions.filter((r) => r.id !== id),
			}));
			if (selectedZoomId === id) {
				setSelectedZoomId(null);
			}
		},
		[selectedZoomId, pushState],
	);

	const handleZoomRotationPresetChange = useCallback(
		(preset: Rotation3DPreset | null) => {
			if (!selectedZoomId) return;
			pushState((prev) => ({
				zoomRegions: prev.zoomRegions.map((region) => {
					if (region.id !== selectedZoomId) return region;
					if (preset === null) {
						const { rotationPreset: _p, ...rest } = region;
						return rest;
					}
					return { ...region, rotationPreset: preset };
				}),
			}));
		},
		[selectedZoomId, pushState],
	);

	const handleTrimDelete = useCallback(
		(id: string) => {
			pushState((prev) => ({
				trimRegions: prev.trimRegions.filter((r) => r.id !== id),
			}));
			if (selectedTrimId === id) {
				setSelectedTrimId(null);
			}
		},
		[selectedTrimId, pushState],
	);

	const handleSelectSpeed = useCallback((id: string | null) => {
		setSelectedSpeedId(id);
		if (id) {
			setSelectedZoomId(null);
			setSelectedTrimId(null);
			setSelectedAnnotationId(null);
			setSelectedBlurId(null);
			setSelectedOverlayClipId(null);
		}
	}, []);

	// Inkast §2: Inspector 固定标题区 —— 清除当前时间线片段选择(「← 返回全局」)。
	const handleClearTimelineSelection = useCallback(() => {
		setSelectedZoomId(null);
		setSelectedTrimId(null);
		setSelectedSpeedId(null);
	}, []);

	// 选中片段的友好名(与底部时间线一致:用同样的序号 + i18n,如「放大 1」)。
	const selectedRegionLabel = useMemo<string | null>(() => {
		if (selectedZoomId) {
			const index = zoomRegions.findIndex((region) => region.id === selectedZoomId);
			if (index >= 0) return tTimeline("labels.zoomItem", { index: String(index + 1) });
		}
		if (selectedTrimId) {
			const index = trimRegions.findIndex((region) => region.id === selectedTrimId);
			if (index >= 0) return tTimeline("labels.trimItem", { index: String(index + 1) });
		}
		if (selectedSpeedId) {
			const index = speedRegions.findIndex((region) => region.id === selectedSpeedId);
			if (index >= 0) return tTimeline("labels.speedItem", { index: String(index + 1) });
		}
		return null;
	}, [
		selectedZoomId,
		selectedTrimId,
		selectedSpeedId,
		zoomRegions,
		trimRegions,
		speedRegions,
		tTimeline,
	]);

	const handleSpeedAdded = useCallback(
		(span: Span) => {
			const id = `speed-${nextSpeedIdRef.current++}`;
			const newRegion: SpeedRegion = {
				id,
				startMs: Math.round(span.start),
				endMs: Math.round(span.end),
				speed: DEFAULT_PLAYBACK_SPEED,
			};
			pushState((prev) => ({
				speedRegions: [...prev.speedRegions, newRegion],
			}));
			setSelectedSpeedId(id);
			setSelectedZoomId(null);
			setSelectedTrimId(null);
			setSelectedAnnotationId(null);
			setSelectedBlurId(null);
		},
		[pushState],
	);

	const handleSpeedSpanChange = useCallback(
		(id: string, span: Span) => {
			pushState((prev) => ({
				speedRegions: prev.speedRegions.map((region) =>
					region.id === id
						? {
								...region,
								startMs: Math.round(span.start),
								endMs: Math.round(span.end),
							}
						: region,
				),
			}));
		},
		[pushState],
	);

	const handleSpeedDelete = useCallback(
		(id: string) => {
			pushState((prev) => ({
				speedRegions: prev.speedRegions.filter((region) => region.id !== id),
			}));
			if (selectedSpeedId === id) {
				setSelectedSpeedId(null);
			}
		},
		[selectedSpeedId, pushState],
	);

	const handleSpeedChange = useCallback(
		(speed: PlaybackSpeed) => {
			if (!selectedSpeedId) return;
			pushState((prev) => ({
				speedRegions: prev.speedRegions.map((region) =>
					region.id === selectedSpeedId ? { ...region, speed } : region,
				),
			}));
		},
		[selectedSpeedId, pushState],
	);

	const handleAnnotationAdded = useCallback(
		(span: Span) => {
			const id = `annotation-${nextAnnotationIdRef.current++}`;
			const zIndex = nextAnnotationZIndexRef.current++;
			const newRegion: AnnotationRegion = {
				id,
				startMs: Math.round(span.start),
				endMs: Math.round(span.end),
				type: "text",
				content: "Enter text...",
				position: { ...DEFAULT_ANNOTATION_POSITION },
				size: { ...DEFAULT_ANNOTATION_SIZE },
				style: { ...DEFAULT_ANNOTATION_STYLE },
				zIndex,
			};
			pushState((prev) => ({
				annotationRegions: [...prev.annotationRegions, newRegion],
			}));
			setSelectedAnnotationId(id);
			setSelectedZoomId(null);
			setSelectedTrimId(null);
			setSelectedSpeedId(null);
			setSelectedBlurId(null);
		},
		[pushState],
	);

	const handleBlurAdded = useCallback(
		(span: Span) => {
			const id = `annotation-${nextAnnotationIdRef.current++}`;
			const zIndex = nextAnnotationZIndexRef.current++;
			const newRegion: AnnotationRegion = {
				id,
				startMs: Math.round(span.start),
				endMs: Math.round(span.end),
				type: "blur",
				content: "",
				position: { ...DEFAULT_ANNOTATION_POSITION },
				size: { ...DEFAULT_ANNOTATION_SIZE },
				style: { ...DEFAULT_ANNOTATION_STYLE },
				zIndex,
				blurData: { ...DEFAULT_BLUR_DATA },
			};
			pushState((prev) => ({
				annotationRegions: [...prev.annotationRegions, newRegion],
			}));
			setSelectedBlurId(id);
			setSelectedAnnotationId(null);
			setSelectedZoomId(null);
			setSelectedTrimId(null);
			setSelectedSpeedId(null);
		},
		[pushState],
	);

	const handleAnnotationSpanChange = useCallback(
		(id: string, span: Span) => {
			pushState((prev) => ({
				annotationRegions: prev.annotationRegions.map((region) =>
					region.id === id
						? {
								...region,
								startMs: Math.round(span.start),
								endMs: Math.round(span.end),
							}
						: region,
				),
			}));
		},
		[pushState],
	);

	const handleAnnotationDuplicate = useCallback(
		(id: string) => {
			const duplicateId = `annotation-${nextAnnotationIdRef.current++}`;
			const duplicateZIndex = nextAnnotationZIndexRef.current++;
			pushState((prev) => {
				const source = prev.annotationRegions.find((region) => region.id === id);
				if (!source) return {};

				const duplicate: AnnotationRegion = {
					...source,
					id: duplicateId,
					zIndex: duplicateZIndex,
					position: { x: source.position.x + 4, y: source.position.y + 4 },
					size: { ...source.size },
					style: { ...source.style },
					figureData: source.figureData ? { ...source.figureData } : undefined,
				};

				return { annotationRegions: [...prev.annotationRegions, duplicate] };
			});
			setSelectedAnnotationId(duplicateId);
			setSelectedZoomId(null);
			setSelectedTrimId(null);
			setSelectedSpeedId(null);
			setSelectedBlurId(null);
		},
		[pushState],
	);

	const handleAnnotationDelete = useCallback(
		(id: string) => {
			pushState((prev) => ({
				annotationRegions: prev.annotationRegions.filter((r) => r.id !== id),
			}));
			if (selectedAnnotationId === id) {
				setSelectedAnnotationId(null);
			}
			if (selectedBlurId === id) {
				setSelectedBlurId(null);
			}
		},
		[selectedAnnotationId, selectedBlurId, pushState],
	);

	const handleAnnotationContentChange = useCallback(
		(id: string, content: string) => {
			pushState((prev) => ({
				annotationRegions: prev.annotationRegions.map((region) => {
					if (region.id !== id) return region;
					if (region.type === "text") {
						return { ...region, content, textContent: content };
					} else if (region.type === "image") {
						return { ...region, content, imageContent: content };
					}
					return { ...region, content };
				}),
			}));
		},
		[pushState],
	);

	const handleAnnotationTypeChange = useCallback(
		(id: string, type: AnnotationRegion["type"]) => {
			pushState((prev) => ({
				annotationRegions: prev.annotationRegions.map((region) => {
					if (region.id !== id) return region;
					const updatedRegion = { ...region, type };
					if (type === "text") {
						updatedRegion.content = region.textContent || "Enter text...";
					} else if (type === "image") {
						updatedRegion.content = region.imageContent || "";
					} else if (type === "figure") {
						updatedRegion.content = "";
						if (!region.figureData) {
							updatedRegion.figureData = { ...DEFAULT_FIGURE_DATA };
						}
					} else if (type === "blur") {
						updatedRegion.content = "";
						if (!region.blurData) {
							updatedRegion.blurData = { ...DEFAULT_BLUR_DATA };
						}
					}
					return updatedRegion;
				}),
			}));

			if (type === "blur" && selectedAnnotationId === id) {
				setSelectedAnnotationId(null);
				setSelectedBlurId(id);
				setSelectedSpeedId(null);
			} else if (type !== "blur" && selectedBlurId === id) {
				setSelectedBlurId(null);
				setSelectedAnnotationId(id);
			}
		},
		[pushState, selectedAnnotationId, selectedBlurId],
	);

	const handleAnnotationStyleChange = useCallback(
		(id: string, style: Partial<AnnotationRegion["style"]>) => {
			pushState((prev) => ({
				annotationRegions: prev.annotationRegions.map((region) =>
					region.id === id ? { ...region, style: { ...region.style, ...style } } : region,
				),
			}));
		},
		[pushState],
	);

	const handleAnnotationFigureDataChange = useCallback(
		(id: string, figureData: FigureData) => {
			pushState((prev) => ({
				annotationRegions: prev.annotationRegions.map((region) =>
					region.id === id ? { ...region, figureData } : region,
				),
			}));
		},
		[pushState],
	);

	const handleBlurDataPreviewChange = useCallback(
		(id: string, blurData: BlurData) => {
			updateState((prev) => ({
				annotationRegions: prev.annotationRegions.map((region) =>
					region.id === id
						? {
								...region,
								blurData,
								// Freehand drawing area is the full video surface.
								...(blurData.shape === "freehand"
									? {
											position: { x: 0, y: 0 },
											size: { width: 100, height: 100 },
										}
									: {}),
							}
						: region,
				),
			}));
		},
		[updateState],
	);

	const handleBlurDataPanelChange = useCallback(
		(id: string, blurData: BlurData) => {
			pushState((prev) => ({
				annotationRegions: prev.annotationRegions.map((region) =>
					region.id === id
						? {
								...region,
								blurData,
								...(blurData.shape === "freehand"
									? {
											position: { x: 0, y: 0 },
											size: { width: 100, height: 100 },
										}
									: {}),
							}
						: region,
				),
			}));
		},
		[pushState],
	);

	const handleAnnotationPositionChange = useCallback(
		(id: string, position: { x: number; y: number }) => {
			pushState((prev) => ({
				annotationRegions: prev.annotationRegions.map((region) =>
					region.id === id ? { ...region, position } : region,
				),
			}));
		},
		[pushState],
	);

	const handleAnnotationSizeChange = useCallback(
		(id: string, size: { width: number; height: number }) => {
			pushState((prev) => ({
				annotationRegions: prev.annotationRegions.map((region) =>
					region.id === id ? { ...region, size } : region,
				),
			}));
		},
		[pushState],
	);

	// Inkast §3 图片叠加:不透明度(0–1)。
	const handleAnnotationOpacityChange = useCallback(
		(id: string, opacity: number) => {
			const clamped = Math.max(0, Math.min(1, opacity));
			pushState((prev) => ({
				annotationRegions: prev.annotationRegions.map((region) =>
					region.id === id ? { ...region, opacity: clamped } : region,
				),
			}));
		},
		[pushState],
	);

	// Inkast §3 图片叠加:在播放头插入一张图片作为画中画叠加层(复用 annotation image 管线:
	// 预览可拖动/缩放、导出经 annotationRenderer 合成)。默认时长 5s,画面居中。
	const handleInsertImageOverlay = useCallback(
		(dataUrl: string) => {
			if (!dataUrl.startsWith("data:image")) return;
			const id = `annotation-${nextAnnotationIdRef.current++}`;
			const zIndex = nextAnnotationZIndexRef.current++;
			const totalMs = Math.max(0, Math.round(durationRef.current * 1000));
			const OVERLAY_DEFAULT_MS = 5000;
			let startMs = Math.max(0, Math.round(currentTimeRef.current * 1000));
			let endMs = startMs + OVERLAY_DEFAULT_MS;
			if (totalMs > 0) {
				endMs = Math.min(endMs, totalMs);
				if (endMs - startMs < 500) {
					startMs = Math.max(0, endMs - OVERLAY_DEFAULT_MS);
				}
			}
			const size = { ...DEFAULT_ANNOTATION_SIZE };
			const position = { x: 50 - size.width / 2, y: 50 - size.height / 2 };
			const newRegion: AnnotationRegion = {
				id,
				startMs,
				endMs,
				type: "image",
				content: dataUrl,
				imageContent: dataUrl,
				position,
				size,
				style: { ...DEFAULT_ANNOTATION_STYLE },
				zIndex,
				opacity: DEFAULT_ANNOTATION_OPACITY,
			};
			pushState((prev) => ({
				annotationRegions: [...prev.annotationRegions, newRegion],
			}));
			setSelectedAnnotationId(id);
			setSelectedZoomId(null);
			setSelectedTrimId(null);
			setSelectedSpeedId(null);
			setSelectedBlurId(null);
		},
		[pushState],
	);

	// Inkast §3:读取一个图片文件 → 插入为叠加层(「插入图片」按钮和拖入预览共用)。
	const readImageFileAsOverlay = useCallback(
		(file: File | null | undefined) => {
			if (!file) return;
			const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
			if (!validTypes.includes(file.type)) {
				toast.error(t("overlay.invalidImageType"), {
					description: t("overlay.imageFormatsOnly"),
				});
				return;
			}
			const reader = new FileReader();
			reader.onload = (e) => {
				const dataUrl = e.target?.result as string;
				if (dataUrl) handleInsertImageOverlay(dataUrl);
			};
			reader.onerror = () => toast.error(t("overlay.failedImageUpload"));
			reader.readAsDataURL(file);
		},
		[handleInsertImageOverlay, t],
	);

	const handleImageOverlayFileChange = useCallback(
		(event: React.ChangeEvent<HTMLInputElement>) => {
			const file = event.target.files?.[0];
			event.target.value = "";
			readImageFileAsOverlay(file);
		},
		[readImageFileAsOverlay],
	);

	const triggerInsertImageOverlay = useCallback(() => {
		imageOverlayInputRef.current?.click();
	}, []);

	// Inkast §3:把图片直接拖进编辑器预览即插入为叠加层(外部文件拖放,不影响内部
	// 区域/叠加框的鼠标拖动 —— 那些用 pointer 事件,不带 dataTransfer "Files")。
	const [isImageDropActive, setIsImageDropActive] = useState(false);

	const handleOverlayDragOver = useCallback((event: React.DragEvent) => {
		if (!dragHasFile(event)) return;
		event.preventDefault();
		event.dataTransfer.dropEffect = "copy";
		setIsImageDropActive(true);
	}, []);

	const handleOverlayDragLeave = useCallback((event: React.DragEvent) => {
		if (event.currentTarget.contains(event.relatedTarget as Node)) return;
		setIsImageDropActive(false);
	}, []);

	const clearOverlaySelectionsExcept = useCallback((keep: "clip" | null) => {
		setSelectedZoomId(null);
		setSelectedTrimId(null);
		setSelectedSpeedId(null);
		setSelectedAnnotationId(null);
		setSelectedBlurId(null);
		if (keep !== "clip") setSelectedOverlayClipId(null);
	}, []);

	// Inkast §3 Phase 2:在播放头插入一段视频作为画中画叠加层。
	const insertVideoOverlayFromPath = useCallback(
		async (sourcePath: string) => {
			if (!sourcePath) return;
			const url = toFileUrl(sourcePath);
			const sourceDurationMs = await probeVideoDurationMs(url);
			const id = `overlay-${nextOverlayClipIdRef.current++}`;
			const zIndex = nextAnnotationZIndexRef.current++;
			const totalMs = Math.max(0, Math.round(durationRef.current * 1000));
			const clipLen =
				sourceDurationMs > 0
					? Math.min(DEFAULT_OVERLAY_CLIP_DURATION_MS, sourceDurationMs)
					: DEFAULT_OVERLAY_CLIP_DURATION_MS;
			let startMs = Math.max(0, Math.round(currentTimeRef.current * 1000));
			let endMs = startMs + clipLen;
			if (totalMs > 0) {
				endMs = Math.min(endMs, totalMs);
				if (endMs - startMs < 500) startMs = Math.max(0, endMs - clipLen);
			}
			const size = { ...DEFAULT_OVERLAY_CLIP_SIZE };
			const position = { x: 50 - size.width / 2, y: 50 - size.height / 2 };
			const region: OverlayClipRegion = {
				id,
				startMs,
				endMs,
				sourcePath,
				sourceStartMs: 0,
				...(sourceDurationMs > 0 ? { sourceDurationMs } : {}),
				position,
				size,
				opacity: 1,
				zIndex,
				muted: true,
			};
			pushState((prev) => ({ overlayClipRegions: [...prev.overlayClipRegions, region] }));
			setSelectedOverlayClipId(id);
			clearOverlaySelectionsExcept("clip");
		},
		[pushState, clearOverlaySelectionsExcept],
	);

	const triggerInsertVideoOverlay = useCallback(async () => {
		const result = await window.electronAPI.openVideoFilePicker();
		if (result.canceled || !result.success || !result.path) return;
		await insertVideoOverlayFromPath(result.path);
	}, [insertVideoOverlayFromPath]);

	const handleOverlayDrop = useCallback(
		(event: React.DragEvent) => {
			if (!dragHasFile(event)) return;
			event.preventDefault();
			setIsImageDropActive(false);
			const files = Array.from(event.dataTransfer.files);
			const imageFile = files.find((f) => f.type.startsWith("image/"));
			if (imageFile) {
				readImageFileAsOverlay(imageFile);
				return;
			}
			const videoFile = files.find((f) => f.type.startsWith("video/"));
			if (videoFile) {
				try {
					const filePath = window.electronAPI.getPathForFile(videoFile);
					if (filePath) void insertVideoOverlayFromPath(filePath);
				} catch {
					toast.error(t("overlay.failedVideoLoad"));
				}
			}
		},
		[readImageFileAsOverlay, insertVideoOverlayFromPath, t],
	);

	// Inkast §3 Phase 2:视频叠加层的选中/移动/缩放/不透明度/时间区间/删除。
	const handleSelectOverlayClip = useCallback(
		(id: string | null) => {
			setSelectedOverlayClipId(id);
			if (id) clearOverlaySelectionsExcept("clip");
		},
		[clearOverlaySelectionsExcept],
	);

	const handleOverlayClipPositionChange = useCallback(
		(id: string, position: { x: number; y: number }) => {
			pushState((prev) => ({
				overlayClipRegions: prev.overlayClipRegions.map((r) =>
					r.id === id ? { ...r, position } : r,
				),
			}));
		},
		[pushState],
	);

	const handleOverlayClipSizeChange = useCallback(
		(id: string, size: { width: number; height: number }) => {
			pushState((prev) => ({
				overlayClipRegions: prev.overlayClipRegions.map((r) => (r.id === id ? { ...r, size } : r)),
			}));
		},
		[pushState],
	);

	const handleOverlayClipOpacityChange = useCallback(
		(id: string, opacity: number) => {
			const clamped = Math.max(0, Math.min(1, opacity));
			pushState((prev) => ({
				overlayClipRegions: prev.overlayClipRegions.map((r) =>
					r.id === id ? { ...r, opacity: clamped } : r,
				),
			}));
		},
		[pushState],
	);

	const handleOverlayClipSpanChange = useCallback(
		(id: string, span: Span) => {
			pushState((prev) => ({
				overlayClipRegions: prev.overlayClipRegions.map((r) =>
					r.id === id ? { ...r, startMs: Math.round(span.start), endMs: Math.round(span.end) } : r,
				),
			}));
		},
		[pushState],
	);

	const handleOverlayClipDelete = useCallback(
		(id: string) => {
			pushState((prev) => ({
				overlayClipRegions: prev.overlayClipRegions.filter((r) => r.id !== id),
			}));
			setSelectedOverlayClipId((prev) => (prev === id ? null : prev));
		},
		[pushState],
	);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			const mod = e.ctrlKey || e.metaKey;
			const key = e.key.toLowerCase();

			if (mod && key === "z" && !e.shiftKey) {
				e.preventDefault();
				e.stopPropagation();
				undo();
				return;
			}
			if (mod && (key === "y" || (key === "z" && e.shiftKey))) {
				e.preventDefault();
				e.stopPropagation();
				redo();
				return;
			}

			// Frame-step navigation (arrow keys, no modifiers)
			if (
				(e.key === "ArrowLeft" || e.key === "ArrowRight") &&
				!e.ctrlKey &&
				!e.metaKey &&
				!e.shiftKey &&
				!e.altKey
			) {
				const target = e.target;
				if (
					target instanceof HTMLInputElement ||
					target instanceof HTMLTextAreaElement ||
					target instanceof HTMLSelectElement ||
					(target instanceof HTMLElement &&
						(target.isContentEditable ||
							target.closest('[role="separator"], [role="slider"], [role="spinbutton"]')))
				) {
					return;
				}
				e.preventDefault();
				const video = videoPlaybackRef.current?.video;
				if (!video) {
					return;
				}
				const direction = e.key === "ArrowLeft" ? "backward" : "forward";
				const newTime = computeFrameStepTime(
					video.currentTime,
					Number.isFinite(video.duration) ? video.duration : durationRef.current,
					direction,
				);
				video.currentTime = newTime;
				return;
			}

			const isInput =
				e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;

			if (e.key === "Tab" && !isInput) {
				e.preventDefault();
			}

			if (matchesShortcut(e, shortcuts.playPause, isMac)) {
				// Allow space only in inputs/textareas
				if (isInput) {
					return;
				}
				e.preventDefault();
				const playback = videoPlaybackRef.current;
				if (playback?.video) {
					playback.video.paused ? playback.play().catch(console.error) : playback.pause();
				}
			}
		};

		window.addEventListener("keydown", handleKeyDown, { capture: true });
		return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
	}, [undo, redo, shortcuts, isMac]);

	useEffect(() => {
		if (selectedZoomId && !zoomRegions.some((region) => region.id === selectedZoomId)) {
			setSelectedZoomId(null);
		}
	}, [selectedZoomId, zoomRegions]);

	useEffect(() => {
		if (selectedTrimId && !trimRegions.some((region) => region.id === selectedTrimId)) {
			setSelectedTrimId(null);
		}
	}, [selectedTrimId, trimRegions]);

	useEffect(() => {
		if (
			selectedAnnotationId &&
			!annotationOnlyRegions.some((region) => region.id === selectedAnnotationId)
		) {
			setSelectedAnnotationId(null);
		}
		if (selectedBlurId && !blurRegions.some((region) => region.id === selectedBlurId)) {
			setSelectedBlurId(null);
		}
	}, [selectedAnnotationId, selectedBlurId, annotationOnlyRegions, blurRegions]);

	useEffect(() => {
		if (selectedSpeedId && !speedRegions.some((region) => region.id === selectedSpeedId)) {
			setSelectedSpeedId(null);
		}
	}, [selectedSpeedId, speedRegions]);

	const handleShowExportedFile = useCallback(async (filePath: string) => {
		try {
			const result = await window.electronAPI.revealInFolder(filePath);
			if (!result.success) {
				const errorMessage = result.error || result.message || "Failed to reveal item in folder.";
				console.error("Failed to reveal in folder:", errorMessage);
				toast.error(errorMessage);
			}
		} catch (error) {
			const errorMessage = String(error);
			console.error("Error calling revealInFolder IPC:", errorMessage);
			toast.error(`Error revealing in folder: ${errorMessage}`);
		}
	}, []);

	const handleExportSaved = useCallback(
		(formatLabel: "GIF" | "Video", filePath: string) => {
			setExportedFilePath(filePath);
			const folder = parentDirectoryOf(filePath);
			if (folder) {
				saveUserPreferences({ exportFolder: folder });
			}
			toast.success(
				t("export.exportedSuccessfully", {
					format: formatLabel,
				}),
				{
					description: filePath,
					action: {
						label: rawT("common.actions.showInFolder"),
						onClick: () => {
							void handleShowExportedFile(filePath);
						},
					},
				},
			);
		},
		[handleShowExportedFile, t, rawT],
	);

	const handleSaveUnsavedExport = useCallback(async () => {
		if (!unsavedExport) return;
		try {
			const pickResult = await window.electronAPI.pickExportSavePath(
				unsavedExport.fileName,
				getExportFolder(),
			);
			if (pickResult.canceled || !pickResult.success || !pickResult.path) {
				toast.info("Export canceled");
				return;
			}
			const saveResult = await window.electronAPI.writeExportToPath(
				unsavedExport.arrayBuffer,
				pickResult.path,
			);
			if (saveResult.success && saveResult.path) {
				setUnsavedExport(null);
				setShowExportDialog(false);
				setExportProgress(null);
				handleExportSaved(unsavedExport.format === "gif" ? "GIF" : "Video", saveResult.path);
			} else {
				toast.error(
					buildSaveDiagnosticMessage(
						unsavedExport.format === "gif" ? "GIF" : "Video",
						saveResult.message || "Failed to save export",
					),
				);
			}
		} catch (error) {
			console.error("Error saving unsaved export:", error);
			toast.error(
				buildSaveDiagnosticMessage(
					unsavedExport.format === "gif" ? "GIF" : "Video",
					error instanceof Error ? error.message : "Failed to save exported video",
				),
			);
		}
	}, [unsavedExport, handleExportSaved]);

	const handleExport = useCallback(
		async (settings: ExportSettings) => {
			if (!videoPath) {
				toast.error("No video loaded");
				return;
			}

			const video = videoPlaybackRef.current?.video;
			if (!video) {
				toast.error("Video not ready");
				return;
			}

			// Ask the user where to save BEFORE starting the export. This avoids the
			// post-export save dialog getting hidden behind other windows after a
			// long-running export.
			const isGifFormat = settings.format === "gif";
			const targetFileName = `export-${Date.now()}.${isGifFormat ? "gif" : "mp4"}`;
			const pickResult = await window.electronAPI.pickExportSavePath(
				targetFileName,
				getExportFolder(),
			);
			if (pickResult.canceled || !pickResult.success || !pickResult.path) {
				setShowExportDialog(false);
				return;
			}
			const targetPath = pickResult.path;

			setIsExporting(true);
			setExportProgress(null);
			setExportError(null);
			setExportedFilePath(null);

			// 写默认位置失败时,保留导出结果让用户手动选保存位置;此时弹窗不自动关闭。
			let needsManualSave = false;

			try {
				const wasPlaying = isPlaying;
				if (wasPlaying) {
					videoPlaybackRef.current?.pause();
				}

				const sourceWidth = video.videoWidth || DEFAULT_SOURCE_DIMENSIONS.width;
				const sourceHeight = video.videoHeight || DEFAULT_SOURCE_DIMENSIONS.height;
				const effectiveSourceDimensions = calculateEffectiveSourceDimensions(
					sourceWidth,
					sourceHeight,
					cropRegion,
				);
				const aspectRatioValue =
					aspectRatio === "native"
						? getNativeAspectRatioValue(sourceWidth, sourceHeight, cropRegion)
						: getAspectRatioValue(aspectRatio);

				// Get preview CONTAINER dimensions for scaling
				const playbackRef = videoPlaybackRef.current;
				const containerElement = playbackRef?.containerRef?.current;
				const previewWidth = containerElement?.clientWidth || DEFAULT_SOURCE_DIMENSIONS.width;
				const previewHeight = containerElement?.clientHeight || DEFAULT_SOURCE_DIMENSIONS.height;

				if (settings.format === "gif" && settings.gifConfig) {
					// GIF Export
					const gifExporter = new GifExporter({
						videoUrl: videoPath,
						webcamVideoUrl: webcamVideoPath || undefined,
						width: settings.gifConfig.width,
						height: settings.gifConfig.height,
						frameRate: settings.gifConfig.frameRate,
						loop: settings.gifConfig.loop,
						sizePreset: settings.gifConfig.sizePreset,
						wallpaper,
						zoomRegions,
						trimRegions,
						speedRegions,
						showShadow: shadowIntensity > 0,
						shadowIntensity,
						showBlur,
						motionBlurAmount,
						borderRadius,
						padding,
						videoPadding: padding,
						cropRegion,
						cursorRecordingData,
						cursorScale: effectiveShowCursor ? cursorSize : 0,
						cursorSmoothing,
						cursorMotionBlur,
						cursorClickBounce,
						cursorClipToBounds,
						annotationRegions,
						overlayClipRegions,
						subtitleCues,
						showSubtitles,
						webcamLayoutPreset,
						webcamMaskShape,
						webcamSizePreset,
						webcamPosition,
						webcamPositionMode,
						webcamPositionTimeline,
						previewWidth,
						previewHeight,
						cursorTelemetry,
						zoomCursorTelemetry,
						cursorClickTimestamps,
						onProgress: (progress: ExportProgress) => {
							setExportProgress(progress);
						},
					});

					exporterRef.current = gifExporter as unknown as VideoExporter;
					const result = await gifExporter.export();

					if (result.success && result.blob) {
						const arrayBuffer = await result.blob.arrayBuffer();

						if (result.warnings) {
							for (const warning of result.warnings) {
								toast.warning(warning);
							}
						}

						const saveResult = await window.electronAPI.writeExportToPath(arrayBuffer, targetPath);

						if (saveResult.success && saveResult.path) {
							setUnsavedExport(null);
							handleExportSaved("GIF", saveResult.path);
						} else {
							setUnsavedExport({ arrayBuffer, fileName: targetFileName, format: "gif" });
							needsManualSave = true;
							const message = buildSaveDiagnosticMessage(
								"GIF",
								saveResult.message || "Failed to save GIF",
							);
							setExportError(message);
							toast.error(message);
						}
					} else {
						const message = buildExportDiagnosticMessage({
							formatLabel: "GIF",
							reason: result.error || "GIF export failed",
							sourcePath: videoSourcePath ?? videoPath,
							width: settings.gifConfig.width,
							height: settings.gifConfig.height,
							frameRate: settings.gifConfig.frameRate,
						});
						setExportError(message);
						toast.error(message);
					}
				} else {
					// MP4 Export
					const quality = settings.quality || exportQuality;
					const {
						width: exportWidth,
						height: exportHeight,
						bitrate,
					} = calculateMp4ExportSettings({
						quality,
						sourceWidth: effectiveSourceDimensions.width,
						sourceHeight: effectiveSourceDimensions.height,
						aspectRatioValue,
					});

					const exporter = new VideoExporter({
						videoUrl: videoPath,
						webcamVideoUrl: webcamVideoPath || undefined,
						width: exportWidth,
						height: exportHeight,
						frameRate: 60,
						bitrate,
						codec: "avc1.640033",
						wallpaper,
						zoomRegions,
						trimRegions,
						speedRegions,
						showShadow: shadowIntensity > 0,
						shadowIntensity,
						showBlur,
						motionBlurAmount,
						borderRadius,
						padding,
						cropRegion,
						cursorRecordingData,
						cursorScale: effectiveShowCursor ? cursorSize : 0,
						cursorSmoothing,
						cursorMotionBlur,
						cursorClickBounce,
						cursorClipToBounds,
						annotationRegions,
						overlayClipRegions,
						subtitleCues,
						showSubtitles,
						webcamLayoutPreset,
						webcamMaskShape,
						webcamSizePreset,
						webcamPosition,
						webcamPositionMode,
						webcamPositionTimeline,
						previewWidth,
						previewHeight,
						cursorTelemetry,
						zoomCursorTelemetry,
						cursorClickTimestamps,
						onProgress: (progress: ExportProgress) => {
							setExportProgress(progress);
						},
					});

					exporterRef.current = exporter;
					const result = await exporter.export();

					if (result.success && result.blob) {
						const arrayBuffer = await result.blob.arrayBuffer();

						if (result.warnings) {
							for (const warning of result.warnings) {
								toast.warning(warning);
							}
						}

						const saveResult = await window.electronAPI.writeExportToPath(arrayBuffer, targetPath);

						if (saveResult.success && saveResult.path) {
							setUnsavedExport(null);
							handleExportSaved("Video", saveResult.path);
						} else {
							setUnsavedExport({ arrayBuffer, fileName: targetFileName, format: "mp4" });
							needsManualSave = true;
							const message = buildSaveDiagnosticMessage(
								"Video",
								saveResult.message || "Failed to save video",
							);
							setExportError(message);
							toast.error(message);
						}
					} else {
						const message = buildExportDiagnosticMessage({
							formatLabel: "Video",
							reason: result.error || "Export failed",
							sourcePath: videoSourcePath ?? videoPath,
							width: exportWidth,
							height: exportHeight,
							frameRate: 60,
							codec: "avc1.640033",
							bitrate,
						});
						setExportError(message);
						toast.error(message);
					}
				}

				if (wasPlaying) {
					videoPlaybackRef.current?.play();
				}
			} catch (error) {
				console.error("Export error:", error);
				if (error instanceof BackgroundLoadError) {
					const message = t("errors.exportBackgroundLoadFailed", { url: error.displayUrl });
					setExportError(message);
					toast.error(message);
				} else {
					const errorMessage = error instanceof Error ? error.message : "Unknown error";
					const message = buildExportDiagnosticMessage({
						formatLabel: settings.format === "gif" ? "GIF" : "Video",
						reason: errorMessage,
						sourcePath: videoSourcePath ?? videoPath,
					});
					setExportError(message);
					toast.error(t("errors.exportFailedWithError", { error: message }));
				}
			} finally {
				setIsExporting(false);
				exporterRef.current = null;
				// Reset dialog state to ensure it can be opened again on next export
				// This fixes the bug where second export doesn't show save dialog.
				// Inkast 布局优化:写默认位置失败时保留弹窗,展示「选择保存位置」兜底按钮。
				if (!needsManualSave) {
					setShowExportDialog(false);
					setExportProgress(null);
				}
			}
		},
		[
			videoPath,
			videoSourcePath,
			webcamVideoPath,
			wallpaper,
			zoomRegions,
			trimRegions,
			speedRegions,
			shadowIntensity,
			showBlur,
			motionBlurAmount,
			borderRadius,
			padding,
			cropRegion,
			cursorRecordingData,
			annotationRegions,
			isPlaying,
			aspectRatio,
			webcamLayoutPreset,
			webcamMaskShape,
			webcamSizePreset,
			webcamPosition,
			webcamPositionMode,
			webcamPositionTimeline,
			exportQuality,
			handleExportSaved,
			cursorTelemetry,
			zoomCursorTelemetry,
			cursorClickTimestamps,
			effectiveShowCursor,
			cursorSize,
			cursorSmoothing,
			cursorMotionBlur,
			cursorClickBounce,
			cursorClipToBounds,
			t,
			overlayClipRegions,
			subtitleCues,
			showSubtitles,
		],
	);

	// Inkast 布局优化:绿色「导出」按钮只负责打开弹窗(进入配置相位),不再立即导出。
	// 格式/画质在弹窗里选,点弹窗内「导出」才真正开始(见 handleStartExport)。
	const handleOpenExportDialog = useCallback(() => {
		if (!videoPath) {
			toast.error("No video loaded");
			return;
		}
		setExportError(null);
		setExportedFilePath(null);
		setUnsavedExport(null);
		setExportProgress(null);
		setShowExportDialog(true);
	}, [videoPath]);

	// 弹窗内「导出」按钮:用当前(弹窗里选好的)格式/画质构建设置并开始导出。
	const handleStartExport = useCallback(() => {
		if (!videoPath) {
			toast.error("No video loaded");
			return;
		}

		const video = videoPlaybackRef.current?.video;
		if (!video) {
			toast.error("Video not ready");
			return;
		}

		// Build export settings from current state
		const sourceWidth = video.videoWidth || DEFAULT_SOURCE_DIMENSIONS.width;
		const sourceHeight = video.videoHeight || DEFAULT_SOURCE_DIMENSIONS.height;
		const effectiveSourceDimensions = calculateEffectiveSourceDimensions(
			sourceWidth,
			sourceHeight,
			cropRegion,
		);
		const aspectRatioValue =
			aspectRatio === "native"
				? getNativeAspectRatioValue(sourceWidth, sourceHeight, cropRegion)
				: getAspectRatioValue(aspectRatio);
		const gifDimensions = calculateOutputDimensions(
			effectiveSourceDimensions.width,
			effectiveSourceDimensions.height,
			gifSizePreset,
			GIF_SIZE_PRESETS,
			aspectRatioValue,
		);

		const settings: ExportSettings = {
			format: exportFormat,
			quality: exportFormat === "mp4" ? exportQuality : undefined,
			gifConfig:
				exportFormat === "gif"
					? {
							frameRate: gifFrameRate,
							loop: gifLoop,
							sizePreset: gifSizePreset,
							width: gifDimensions.width,
							height: gifDimensions.height,
						}
					: undefined,
		};

		setExportError(null);
		setExportedFilePath(null);

		// Start export immediately
		handleExport(settings);
	}, [
		videoPath,
		exportFormat,
		exportQuality,
		gifFrameRate,
		gifLoop,
		gifSizePreset,
		aspectRatio,
		cropRegion,
		handleExport,
	]);

	// Inkast 界面对齐 Phase 0:比例切换从时间线工具条搬到标题栏,逻辑不变
	// (切换比例时,若当前画版式与新比例方向冲突,回落到画中画)。
	const handleAspectRatioChange = useCallback(
		(ar: AspectRatio) => {
			pushState({
				aspectRatio: ar,
				webcamLayoutPreset:
					(isPortraitAspectRatio(ar) && webcamLayoutPreset === "dual-frame") ||
					(!isPortraitAspectRatio(ar) && webcamLayoutPreset === "vertical-stack")
						? "picture-in-picture"
						: webcamLayoutPreset,
			});
		},
		[pushState, webcamLayoutPreset],
	);

	const handleCancelExport = useCallback(() => {
		if (exporterRef.current) {
			exporterRef.current.cancel();
			toast.info("Export canceled");
			setShowExportDialog(false);
			setIsExporting(false);
			setExportProgress(null);
			setExportError(null);
			setExportedFilePath(null);
		}
	}, []);

	const handleSaveDiagnostic = useCallback(async () => {
		const result = await window.electronAPI.saveDiagnostic({
			error: exportError ?? "Manual diagnostic export",
			projectState: editorState,
			logs: [],
		});
		if (result.success) {
			toast.success("Diagnostic file saved");
		} else if (!result.canceled) {
			toast.error("Failed to save diagnostic file");
		}
	}, [exportError, editorState]);

	if (loading) {
		return (
			<div
				className={`flex items-center justify-center ${embedded ? "h-full" : "h-screen"} bg-background`}
			>
				<div className="text-foreground">{t("loadingVideo")}</div>
			</div>
		);
	}
	if (error) {
		return (
			<div
				className={`flex items-center justify-center ${embedded ? "h-full" : "h-screen"} bg-background`}
			>
				<div className="flex flex-col items-center gap-3">
					<div className="text-destructive">{error}</div>
					<button
						type="button"
						onClick={handleLoadProject}
						className="px-3 py-1.5 rounded-md bg-[#34B27B] text-white text-sm hover:bg-[#34B27B]/90"
					>
						{ts("project.load")}
					</button>
				</div>
			</div>
		);
	}

	// Inkast 布局优化:导出弹窗(配置相位)需要的源尺寸 / GIF 输出尺寸。原本在右侧设置栏算,
	// 现随弹窗一起渲染(弹窗打开时视频已加载;依赖的格式/尺寸 state 变更会触发重渲染)。
	const exportVideoEl = videoPlaybackRef.current?.video;
	const exportSourceDimensions =
		exportVideoEl && exportVideoEl.videoWidth > 0 && exportVideoEl.videoHeight > 0
			? (() => {
					const dims = calculateEffectiveSourceDimensions(
						exportVideoEl.videoWidth,
						exportVideoEl.videoHeight,
						cropRegion,
					);
					return { ...dims, shortSide: Math.min(dims.width, dims.height) };
				})()
			: null;
	const exportEffectiveSource = calculateEffectiveSourceDimensions(
		exportVideoEl?.videoWidth || DEFAULT_SOURCE_DIMENSIONS.width,
		exportVideoEl?.videoHeight || DEFAULT_SOURCE_DIMENSIONS.height,
		cropRegion,
	);
	const exportGifOutputDimensions = calculateOutputDimensions(
		exportEffectiveSource.width,
		exportEffectiveSource.height,
		gifSizePreset,
		GIF_SIZE_PRESETS,
		aspectRatio === "native"
			? getNativeAspectRatioValue(
					exportVideoEl?.videoWidth || DEFAULT_SOURCE_DIMENSIONS.width,
					exportVideoEl?.videoHeight || DEFAULT_SOURCE_DIMENSIONS.height,
					cropRegion,
				)
			: getAspectRatioValue(aspectRatio),
	);

	return (
		<div
			className={`flex flex-col ${embedded ? "h-full" : "h-screen"} bg-[#0A0C0E] text-slate-200 overflow-hidden selection:bg-[#34B27B]/30`}
		>
			<Dialog open={showNewRecordingDialog} onOpenChange={setShowNewRecordingDialog}>
				<DialogContent
					className="sm:max-w-[425px]"
					style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
				>
					<DialogHeader>
						<DialogTitle>{t("newRecording.title")}</DialogTitle>
						<DialogDescription>{t("newRecording.description")}</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<button
							type="button"
							onClick={() => setShowNewRecordingDialog(false)}
							className="px-4 py-2 rounded-md bg-white/10 text-white hover:bg-white/20 text-sm font-medium transition-colors"
						>
							{t("newRecording.cancel")}
						</button>
						<button
							type="button"
							onClick={handleNewRecordingConfirm}
							className="px-4 py-2 rounded-md bg-[#34B27B] text-white hover:bg-[#34B27B]/90 text-sm font-medium transition-colors"
						>
							{t("newRecording.confirm")}
						</button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<div
				className={`h-11 flex-shrink-0 backdrop-blur-xl border-b border-white/[0.07] flex items-center justify-between px-5 z-50 ${
					embedded
						? "bg-[#0C0F12]" // 嵌入:作为编辑器工具条(比外壳顶栏浅一档,不再像第二条窗口标题栏)
						: "bg-[#070809]/85 shadow-[0_1px_0_rgba(255,255,255,0.03)]"
				}`}
				style={{ WebkitAppRegion: embedded ? "no-drag" : "drag" } as React.CSSProperties}
			>
				{/* Inkast: 整条 titlebar 可拖动窗口;只有下面这些控件标 no-drag。
				    (之前左侧 flex-1 容器整块 no-drag,把整条标题栏盖成不可拖,故几乎拖不动窗口。) */}
				<div className="flex-1 flex items-center gap-1">
					{/* 嵌入工作台时,语言切换由外壳顶栏统一提供 —— 这里不再重复(双标题栏去重,§2)。 */}
					{!embedded && (
						<div
							className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-white/50 hover:text-white/90 hover:bg-white/[0.08] transition-all duration-150 ${isMac ? "ml-14" : "ml-2"}`}
							style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
						>
							<Languages size={14} />
							<select
								value={locale}
								onChange={(e) => setLocale(e.target.value as Locale)}
								className="bg-transparent text-[11px] font-medium outline-none cursor-pointer appearance-none pr-1"
								style={{ color: "inherit" }}
							>
								{availableLocales.map((loc) => (
									<option key={loc} value={loc} className="bg-[#0A0C0E] text-white">
										{getLocaleName(loc)}
									</option>
								))}
							</select>
						</div>
					)}
					<button
						type="button"
						onClick={() => setShowNewRecordingDialog(true)}
						className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-white/50 hover:text-white/90 hover:bg-white/[0.08] transition-all duration-150 text-[11px] font-medium"
						style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
					>
						<Video size={14} />
						{t("newRecording.title")}
					</button>
					<button
						type="button"
						onClick={handleLoadProject}
						className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-white/50 hover:text-white/90 hover:bg-white/[0.08] transition-all duration-150 text-[11px] font-medium"
						style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
					>
						<FolderOpen size={14} />
						{ts("project.load")}
					</button>
					<button
						type="button"
						onClick={handleSaveProject}
						className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-white/50 hover:text-white/90 hover:bg-white/[0.08] transition-all duration-150 text-[11px] font-medium"
						style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
					>
						<Save size={14} />
						{ts("project.save")}
					</button>
				</div>
				{/* Inkast 界面对齐 Phase 0:标题栏右侧(对齐 Demo .tb-right)=
				    帮助菜单 + 比例下拉 + 绿色「导出」按钮。比例/导出仅在有视频时出现。
				    帮助菜单仍收纳低频项(报告错误 / 保存诊断 / GitHub 加星)。 */}
				<div
					className="flex items-center gap-2"
					style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
				>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<button
								type="button"
								className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-white/50 hover:text-white/90 hover:bg-white/[0.08] transition-all duration-150 text-[11px] font-medium outline-none"
							>
								<HelpCircle size={14} />
								{ts("support.help")}
							</button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-52">
							<DropdownMenuItem
								onClick={() =>
									window.electronAPI?.openExternalUrl(
										"https://github.com/siddharthvaddem/openscreen/issues/new/choose",
									)
								}
							>
								<Bug className="w-3.5 h-3.5 text-[#34B27B]" />
								{ts("support.reportBug")}
							</DropdownMenuItem>
							<DropdownMenuItem onClick={handleSaveDiagnostic}>
								<FileDown className="w-3.5 h-3.5 text-slate-400" />
								{ts("support.saveDiagnostics")}
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={() =>
									window.electronAPI?.openExternalUrl(
										"https://github.com/siddharthvaddem/openscreen",
									)
								}
							>
								<Star className="w-3.5 h-3.5 text-yellow-400" />
								{ts("support.starOnGithub")}
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>

					{/* 比例下拉(Demo .ratio):从时间线工具条搬来,handler = handleAspectRatioChange。 */}
					{videoPath && (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<button
									type="button"
									title={t("aspectRatio")}
									className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/[0.07] bg-[#1B1F24] hover:bg-[#22272D] text-[11px] font-medium text-slate-300 hover:text-white transition-all duration-150 outline-none"
								>
									<RectangleHorizontal size={13} className="opacity-70" />
									<span className="tabular-nums">{getAspectRatioLabel(aspectRatio)}</span>
									<ChevronDown size={12} className="opacity-70" />
								</button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="bg-[#1B1F24] border-white/10">
								{ASPECT_RATIOS.map((ratio) => (
									<DropdownMenuItem
										key={ratio}
										onClick={() => handleAspectRatioChange(ratio)}
										className="text-slate-300 hover:text-white focus:bg-white/10 cursor-pointer flex items-center justify-between gap-3"
									>
										<span className="tabular-nums">{getAspectRatioLabel(ratio)}</span>
										{aspectRatio === ratio && <Check className="w-3 h-3 text-[#34B27B]" />}
									</DropdownMenuItem>
								))}
							</DropdownMenuContent>
						</DropdownMenu>
					)}

					{/* 绿色「导出」按钮(Demo .exp):墨色字 #06140d;复用 handleOpenExportDialog。 */}
					{videoPath && (
						<button
							type="button"
							data-testid={getTestId("export-button")}
							onClick={handleOpenExportDialog}
							className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#34B27B] hover:bg-[#3DC489] text-[#06140d] text-[12px] font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#34B27B]/50"
						>
							<Download size={13} />
							{t("export.button")}
						</button>
					)}
				</div>
			</div>

			{/* Inkast §3: 隐藏的图片选择 input(「插入图片」叠加层用)。 */}
			<input
				ref={imageOverlayInputRef}
				type="file"
				accept=".jpg,.jpeg,.png,.gif,.webp,image/*"
				onChange={handleImageOverlayFileChange}
				className="hidden"
			/>

			{/* Empty state — shown when no video is loaded */}
			{!videoPath && (
				<div className="flex-1 min-h-0 relative">
					<EditorEmptyState
						onRecordNew={handleNewRecordingConfirm}
						onVideoImported={(path) => {
							setVideoPath(toFileUrl(path));
							setVideoSourcePath(path);
							setWebcamVideoPath(null);
							setWebcamVideoSourcePath(null);
						}}
						onProjectOpened={async (project, path) => {
							const restored = await applyLoadedProject(project, path);
							if (!restored) {
								toast.error(t("project.invalidFormat"));
							}
						}}
					/>
				</div>
			)}

			{videoPath && (
				<div
					className="editor-workspace flex-1 min-h-0 relative"
					onDragOver={handleOverlayDragOver}
					onDragLeave={handleOverlayDragLeave}
					onDrop={handleOverlayDrop}
				>
					{/* Inkast §3: 拖入图片提示层 */}
					{isImageDropActive && (
						<div className="pointer-events-none absolute inset-0 z-[60] flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-[#34B27B] bg-[#34B27B]/10 backdrop-blur-[1px]">
							<ImagePlus className="h-10 w-10 text-[#34B27B]" />
							<p className="text-base font-semibold text-[#34B27B]">{t("overlay.dropHint")}</p>
						</div>
					)}
					<PanelGroup direction="vertical" className="gap-3 min-h-0">
						{/* Top section: preview and contextual settings */}
						<Panel defaultSize={67} maxSize={76} minSize={46} className="min-h-[300px]">
							<div className="editor-main-deck h-full min-h-0">
								{/* Inkast 界面对齐 Phase 3:左侧媒体面板(顶部 Tab 媒体/智能)。 */}
								<div className="editor-media-zone min-w-0 h-full">
									<MediaPanel
										activeTab={mediaTab}
										onTabChange={setMediaTab}
										sourceName={videoSourcePath?.split(/[\\/]/).pop()}
										hasWebcam={Boolean(webcamVideoPath)}
										overlayCount={overlayClipRegions.length}
										onInsertImage={triggerInsertImageOverlay}
										onInsertVideo={triggerInsertVideoOverlay}
										smartCut={{
											pauseReady: pauseStatus === "ready",
											pauseAnalyzing: pauseStatus === "loading",
											pauseCount: detectedPauses.length,
											pauseSavableMs: detectedPauses.reduce((a, p) => a + (p.endMs - p.startMs), 0),
											onRemoveAllPauses: handleRemoveAllPauses,
											transcriptionStatus,
											transcriptionProgress,
											fillerCount: detectedFillers.length,
											fillerSavableMs: detectedFillers.reduce(
												(a, f) => a + (f.endMs - f.startMs),
												0,
											),
											onTranscribe: runTranscription,
											onRemoveFillers: handleRemoveFillers,
											onReviewFillers: () => setReviewOpen(true),
											subtitleCount: subtitleCues.length,
											showSubtitles,
											onGenerateSubtitles: handleGenerateSubtitles,
											onToggleSubtitles: handleToggleSubtitles,
										}}
									/>
								</div>
								<div className="editor-preview-zone min-w-0 h-full">
									<div
										ref={playerContainerRef}
										className={
											isFullscreen
												? "fixed inset-0 z-[99999] w-full h-full flex flex-col items-center justify-center bg-[#0A0C0E]"
												: "editor-preview-panel w-full h-full flex flex-col items-center justify-center overflow-hidden relative"
										}
									>
										{/* Video preview */}
										<div className="w-full min-h-0 flex justify-center items-center flex-auto px-4 pt-4">
											<div
												className="relative flex justify-center items-center w-auto h-full max-w-full box-border"
												style={{
													aspectRatio:
														aspectRatio === "native"
															? getNativeAspectRatioValue(
																	videoPlaybackRef.current?.video?.videoWidth ||
																		DEFAULT_SOURCE_DIMENSIONS.width,
																	videoPlaybackRef.current?.video?.videoHeight ||
																		DEFAULT_SOURCE_DIMENSIONS.height,
																	cropRegion,
																)
															: getAspectRatioValue(aspectRatio),
												}}
											>
												<VideoPlayback
													key={`${videoPath || "no-video"}:${webcamVideoPath || "no-webcam"}`}
													aspectRatio={aspectRatio}
													ref={videoPlaybackRef}
													videoPath={videoPath || ""}
													webcamVideoPath={webcamVideoPath || undefined}
													webcamLayoutPreset={webcamLayoutPreset}
													webcamMaskShape={webcamMaskShape}
													webcamSizePreset={webcamSizePreset}
													webcamPosition={webcamPosition}
													webcamPositionMode={webcamPositionMode}
													webcamPositionTimeline={webcamPositionTimeline}
													onWebcamPositionChange={(pos) => updateState({ webcamPosition: pos })}
													onWebcamPositionDragEnd={commitState}
													onDurationChange={setDuration}
													onTimeUpdate={setCurrentTime}
													currentTime={currentTime}
													onPlayStateChange={setIsPlaying}
													onError={setError}
													wallpaper={wallpaper}
													zoomRegions={zoomRegions}
													selectedZoomId={selectedZoomId}
													onSelectZoom={handleSelectZoom}
													onZoomFocusChange={handleZoomFocusChange}
													onZoomFocusDragEnd={commitState}
													isPlaying={isPlaying}
													showShadow={shadowIntensity > 0}
													shadowIntensity={shadowIntensity}
													showBlur={showBlur}
													motionBlurAmount={motionBlurAmount}
													borderRadius={borderRadius}
													padding={padding}
													cropRegion={cropRegion}
													cursorRecordingData={cursorRecordingData}
													trimRegions={trimRegions}
													speedRegions={speedRegions}
													annotationRegions={annotationOnlyRegions}
													selectedAnnotationId={selectedAnnotationId}
													onSelectAnnotation={handleSelectAnnotation}
													onAnnotationPositionChange={handleAnnotationPositionChange}
													onAnnotationSizeChange={handleAnnotationSizeChange}
													overlayClipRegions={overlayClipRegions}
													subtitleCues={subtitleCues}
													showSubtitles={showSubtitles}
													selectedOverlayClipId={selectedOverlayClipId}
													onSelectOverlayClip={handleSelectOverlayClip}
													onOverlayClipPositionChange={handleOverlayClipPositionChange}
													onOverlayClipSizeChange={handleOverlayClipSizeChange}
													blurRegions={blurRegions}
													selectedBlurId={selectedBlurId}
													onSelectBlur={handleSelectBlur}
													onBlurPositionChange={handleAnnotationPositionChange}
													onBlurSizeChange={handleAnnotationSizeChange}
													onBlurDataChange={handleBlurDataPreviewChange}
													onBlurDataCommit={commitState}
													cursorTelemetry={cursorTelemetry}
													zoomCursorTelemetry={zoomCursorTelemetry}
													cursorClickTimestamps={cursorClickTimestamps}
													showCursor={effectiveShowCursor}
													cursorSize={cursorSize}
													cursorSmoothing={cursorSmoothing}
													cursorMotionBlur={cursorMotionBlur}
													cursorClickBounce={cursorClickBounce}
													cursorClipToBounds={cursorClipToBounds}
													isPreviewingZoom={isPreviewingZoom}
												/>
											</div>
										</div>
										{/* Playback controls */}
										<div className="w-full flex justify-center items-center h-14 flex-shrink-0 px-4 py-2">
											<div className="w-full max-w-[760px]">
												<PlaybackControls
													isPlaying={isPlaying}
													currentTime={currentTime}
													duration={duration}
													isFullscreen={isFullscreen}
													onToggleFullscreen={toggleFullscreen}
													onTogglePlayPause={togglePlayPause}
													onSeek={handleSeek}
												/>
											</div>
										</div>
									</div>
								</div>

								<div className="editor-settings-rail min-w-0 h-full">
									<SettingsPanel
										selected={wallpaper}
										onWallpaperChange={(w) => pushState({ wallpaper: w })}
										selectedZoomDepth={
											selectedZoomId
												? zoomRegions.find((z) => z.id === selectedZoomId)?.depth
												: null
										}
										onZoomDepthChange={(depth) => selectedZoomId && handleZoomDepthChange(depth)}
										selectedZoomCustomScale={
											selectedZoomId
												? (zoomRegions.find((z) => z.id === selectedZoomId)?.customScale ?? null)
												: null
										}
										onZoomCustomScaleChange={handleZoomCustomScaleChange}
										onZoomCustomScaleCommit={handleZoomCustomScaleCommit}
										onZoomPreviewStart={() => setIsPreviewingZoom(true)}
										onZoomPreviewEnd={() => setIsPreviewingZoom(false)}
										selectedZoomFocusMode={
											selectedZoomId
												? (zoomRegions.find((z) => z.id === selectedZoomId)?.focusMode ?? "manual")
												: null
										}
										onZoomFocusModeChange={(mode) =>
											selectedZoomId && handleZoomFocusModeChange(mode)
										}
										selectedZoomFocus={
											selectedZoomId
												? (zoomRegions.find((z) => z.id === selectedZoomId)?.focus ?? null)
												: null
										}
										onZoomFocusCoordinateChange={(focus) =>
											selectedZoomId && handleZoomFocusChange(selectedZoomId, focus)
										}
										onZoomFocusCoordinateCommit={commitState}
										hasCursorTelemetry={cursorTelemetry.length > 0}
										selectedRegionLabel={selectedRegionLabel}
										onClearTimelineSelection={handleClearTimelineSelection}
										selectedZoomId={selectedZoomId}
										onZoomDelete={handleZoomDelete}
										selectedZoomRotationPreset={
											selectedZoomId
												? (zoomRegions.find((z) => z.id === selectedZoomId)?.rotationPreset ?? null)
												: null
										}
										onZoomRotationPresetChange={handleZoomRotationPresetChange}
										selectedTrimId={selectedTrimId}
										onTrimDelete={handleTrimDelete}
										shadowIntensity={shadowIntensity}
										onShadowChange={(v) => updateState({ shadowIntensity: v })}
										onShadowCommit={commitState}
										showBlur={showBlur}
										onBlurChange={(v) => pushState({ showBlur: v })}
										motionBlurAmount={motionBlurAmount}
										onMotionBlurChange={(v) => updateState({ motionBlurAmount: v })}
										onMotionBlurCommit={commitState}
										borderRadius={borderRadius}
										onBorderRadiusChange={(v) => updateState({ borderRadius: v })}
										onBorderRadiusCommit={commitState}
										padding={padding}
										onPaddingChange={(v) => updateState({ padding: v })}
										onPaddingCommit={commitState}
										cropRegion={cropRegion}
										onCropChange={(r) => pushState({ cropRegion: r })}
										aspectRatio={aspectRatio}
										hasWebcam={Boolean(webcamVideoPath)}
										webcamLayoutPreset={webcamLayoutPreset}
										onWebcamLayoutPresetChange={(preset) =>
											pushState({
												webcamLayoutPreset: preset,
												webcamPosition: preset === "picture-in-picture" ? webcamPosition : null,
											})
										}
										webcamMaskShape={webcamMaskShape}
										onWebcamMaskShapeChange={(shape) => pushState({ webcamMaskShape: shape })}
										webcamSizePreset={webcamSizePreset}
										onWebcamSizePresetChange={(v) => updateState({ webcamSizePreset: v })}
										onWebcamSizePresetCommit={commitState}
										videoElement={videoPlaybackRef.current?.video || null}
										selectedAnnotationId={selectedAnnotationId}
										annotationRegions={annotationOnlyRegions}
										onAnnotationContentChange={handleAnnotationContentChange}
										onAnnotationTypeChange={handleAnnotationTypeChange}
										onAnnotationStyleChange={handleAnnotationStyleChange}
										onAnnotationFigureDataChange={handleAnnotationFigureDataChange}
										onAnnotationDuplicate={handleAnnotationDuplicate}
										onAnnotationDelete={handleAnnotationDelete}
										onAnnotationPositionChange={handleAnnotationPositionChange}
										onAnnotationSizeChange={handleAnnotationSizeChange}
										onAnnotationOpacityChange={handleAnnotationOpacityChange}
										selectedOverlayClip={
											overlayClipRegions.find((r) => r.id === selectedOverlayClipId) ?? null
										}
										onOverlayClipPositionChange={handleOverlayClipPositionChange}
										onOverlayClipSizeChange={handleOverlayClipSizeChange}
										onOverlayClipOpacityChange={handleOverlayClipOpacityChange}
										onOverlayClipDelete={handleOverlayClipDelete}
										selectedBlurId={selectedBlurId}
										blurRegions={blurRegions}
										onBlurDataChange={handleBlurDataPanelChange}
										onBlurDataCommit={commitState}
										onBlurDelete={handleAnnotationDelete}
										selectedSpeedId={selectedSpeedId}
										selectedSpeedValue={
											selectedSpeedId
												? (speedRegions.find((r) => r.id === selectedSpeedId)?.speed ?? null)
												: null
										}
										onSpeedChange={handleSpeedChange}
										onSpeedDelete={handleSpeedDelete}
										showCursor={showCursor}
										onShowCursorChange={setShowCursor}
										cursorSize={cursorSize}
										onCursorSizeChange={setCursorSize}
										cursorSmoothing={cursorSmoothing}
										onCursorSmoothingChange={setCursorSmoothing}
										cursorMotionBlur={cursorMotionBlur}
										onCursorMotionBlurChange={setCursorMotionBlur}
										cursorClickBounce={cursorClickBounce}
										onCursorClickBounceChange={setCursorClickBounce}
										cursorClipToBounds={cursorClipToBounds}
										onCursorClipToBoundsChange={setCursorClipToBounds}
										hasCursorData={
											cursorTelemetry.length > 0 ||
											hasNativeCursorRecordingData(cursorRecordingData)
										}
										showCursorSettings={showCursorSettings}
									/>
								</div>
							</div>
						</Panel>

						<PanelResizeHandle className="editor-resize-handle group">
							<div className="w-10 h-1 bg-white/20 rounded-full transition-colors group-hover:bg-[#34B27B]/70"></div>
						</PanelResizeHandle>

						{/* Full-width timeline */}
						<Panel defaultSize={33} maxSize={54} minSize={24} className="min-h-[210px]">
							<div className="editor-timeline-panel h-full overflow-hidden flex flex-col">
								<TimelineEditor
									videoDuration={duration}
									currentTime={currentTime}
									onSeek={handleSeek}
									cursorTelemetry={cursorTelemetry}
									cropRegion={cropRegion}
									zoomRegions={zoomRegions}
									onZoomAdded={handleZoomAdded}
									onZoomSuggested={handleZoomSuggested}
									onZoomSpanChange={handleZoomSpanChange}
									onZoomDelete={handleZoomDelete}
									selectedZoomId={selectedZoomId}
									onSelectZoom={handleSelectZoom}
									trimRegions={trimRegions}
									onTrimAdded={handleTrimAdded}
									onTrimSpanChange={handleTrimSpanChange}
									onTrimDelete={handleTrimDelete}
									selectedTrimId={selectedTrimId}
									onSelectTrim={handleSelectTrim}
									speedRegions={speedRegions}
									onSpeedAdded={handleSpeedAdded}
									onSpeedSpanChange={handleSpeedSpanChange}
									onSpeedDelete={handleSpeedDelete}
									selectedSpeedId={selectedSpeedId}
									onSelectSpeed={handleSelectSpeed}
									annotationRegions={annotationOnlyRegions}
									onAnnotationAdded={handleAnnotationAdded}
									onAnnotationSpanChange={handleAnnotationSpanChange}
									onAnnotationDelete={handleAnnotationDelete}
									selectedAnnotationId={selectedAnnotationId}
									onSelectAnnotation={handleSelectAnnotation}
									onInsertImageOverlay={triggerInsertImageOverlay}
									onInsertVideoOverlay={triggerInsertVideoOverlay}
									overlayClipRegions={overlayClipRegions}
									selectedOverlayClipId={selectedOverlayClipId}
									onSelectOverlayClip={handleSelectOverlayClip}
									onOverlayClipSpanChange={handleOverlayClipSpanChange}
									blurRegions={blurRegions}
									onBlurAdded={handleBlurAdded}
									onBlurSpanChange={handleAnnotationSpanChange}
									onBlurDelete={handleAnnotationDelete}
									selectedBlurId={selectedBlurId}
									onSelectBlur={handleSelectBlur}
									videoUrl={videoPath ?? undefined}
									showTrimWaveform={showTrimWaveform}
									onTrimWaveformChange={(v) => pushState({ showTrimWaveform: v })}
								/>
							</div>
						</Panel>
					</PanelGroup>
				</div>
			)}

			<ExportDialog
				isOpen={showExportDialog}
				onClose={() => setShowExportDialog(false)}
				progress={exportProgress}
				isExporting={isExporting}
				error={exportError}
				onCancel={handleCancelExport}
				exportFormat={exportFormat}
				exportedFilePath={exportedFilePath || undefined}
				onShowInFolder={
					exportedFilePath ? () => void handleShowExportedFile(exportedFilePath) : undefined
				}
				canExport={Boolean(videoPath)}
				onStartExport={handleStartExport}
				hasUnsavedExport={Boolean(unsavedExport)}
				onSaveUnsavedExport={handleSaveUnsavedExport}
				settingsControls={{
					exportFormat,
					onExportFormatChange: setExportFormat,
					exportQuality,
					onExportQualityChange: setExportQuality,
					gifFrameRate,
					onGifFrameRateChange: setGifFrameRate,
					gifLoop,
					onGifLoopChange: setGifLoop,
					gifSizePreset,
					onGifSizePresetChange: setGifSizePreset,
					gifOutputDimensions: exportGifOutputDimensions,
					sourceDimensions: exportSourceDimensions,
				}}
			/>

			<TranscriptReviewPanel
				open={reviewOpen}
				onOpenChange={setReviewOpen}
				words={detectedWords}
				fillers={detectedFillers}
				onApply={handleApplyReviewCuts}
			/>

			<UnsavedChangesDialog
				isOpen={showCloseConfirmDialog}
				onSaveAndClose={handleCloseConfirmSave}
				onDiscardAndClose={handleCloseConfirmDiscard}
				onCancel={handleCloseConfirmCancel}
			/>

			<UnsavedChangesDialog
				isOpen={confirmDialogVariant !== null}
				variant={confirmDialogVariant ?? "newProject"}
				onSaveAndClose={
					confirmDialogVariant === "loadProject"
						? handleLoadProjectConfirmSave
						: handleNewProjectConfirmSave
				}
				onDiscardAndClose={
					confirmDialogVariant === "loadProject"
						? handleLoadProjectConfirmDiscard
						: handleNewProjectConfirmDiscard
				}
				onCancel={() => setConfirmDialogVariant(null)}
			/>
		</div>
	);
}
