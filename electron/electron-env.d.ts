/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
	interface ProcessEnv {
		/**
		 * The built directory structure
		 *
		 * ```tree
		 * ├─┬─┬ dist
		 * │ │ └── index.html
		 * │ │
		 * │ ├─┬ dist-electron
		 * │ │ ├── main.js
		 * │ │ └── preload.js
		 * │
		 * ```
		 */
		APP_ROOT: string;
		/** /dist/ or /public/ */
		VITE_PUBLIC: string;
	}
}

// Used in Renderer process, expose in `preload.ts`
interface Window {
	electronAPI: {
		invokeNativeBridge: <TData = unknown>(
			request: import("../src/native/contracts").NativeBridgeRequest,
		) => Promise<import("../src/native/contracts").NativeBridgeResponse<TData>>;
		getSources: (opts: Electron.SourcesOptions) => Promise<ProcessedDesktopSource[]>;
		switchToEditor: () => Promise<void>;
		switchToHud: () => Promise<void>;
		startNewRecording: () => Promise<{ success: boolean; error?: string }>;
		openSourceSelector: () => Promise<{
			opened: boolean;
			reason?: string;
			access?: {
				success: boolean;
				granted: boolean;
				status: string;
				error?: string;
			};
		}>;
		selectSource: (source: ProcessedDesktopSource) => Promise<ProcessedDesktopSource | null>;
		getSelectedSource: () => Promise<ProcessedDesktopSource | null>;
		requestCameraAccess: () => Promise<{
			success: boolean;
			granted: boolean;
			status: string;
			error?: string;
		}>;
		requestScreenAccess: () => Promise<{
			success: boolean;
			granted: boolean;
			status: string;
			error?: string;
		}>;
		requestNativeMacCursorAccess: () => Promise<{
			success: boolean;
			granted: boolean;
			status: string;
			error?: string;
		}>;
		assetBaseUrl: string;
		closeCameraOverlay?: () => void;
		resizeCameraOverlay?: (size: number) => void;
		updateCameraOverlaySettings?: (settings: { shape?: "circle" | "square" }) => void;
		getCameraOverlaySettings?: () => Promise<{
			shape: "circle" | "square";
			sizePx: number;
			displaySize: { width: number; height: number };
			recording: {
				maskShape: "circle" | "square";
				sizePreset: number;
				position?: { cx: number; cy: number };
			};
		}>;
		toggleCameraOverlay?: () => void;
		onCameraOverlayState?: (callback: (open: boolean) => void) => () => void;
		setCameraPositionMode?: (mode: "fixed" | "follow") => void;
		getCameraPositionMode?: () => Promise<"fixed" | "follow">;
		closePrompter?: () => void;
		togglePrompter?: () => void;
		onPrompterState?: (callback: (open: boolean) => void) => () => void;
		setPrompterScript?: (text: string) => void;
		getPrompterScript?: () => Promise<string>;
		onPrompterScript?: (callback: (text: string) => void) => () => void;
		storeRecordedVideo: (
			videoData: ArrayBuffer,
			fileName: string,
		) => Promise<{
			success: boolean;
			path?: string;
			session?: import("../src/lib/recordingSession").RecordingSession;
			message?: string;
			error?: string;
		}>;
		storeRecordedSession: (
			payload: import("../src/lib/recordingSession").StoreRecordedSessionInput,
		) => Promise<{
			success: boolean;
			path?: string;
			session?: import("../src/lib/recordingSession").RecordingSession;
			message?: string;
			error?: string;
		}>;
		openRecordingStream: (fileName: string) => Promise<{ success: boolean; error?: string }>;
		appendRecordingChunk: (
			fileName: string,
			chunk: ArrayBuffer,
		) => Promise<{ success: boolean; error?: string }>;
		closeRecordingStream: (fileName: string) => Promise<{ success: boolean; error?: string }>;
		finalizeRecordingStream: (
			fileName: string,
			durationMs?: number,
		) => Promise<{ success: boolean; streamed?: boolean; error?: string }>;
		getRecordedVideoPath: () => Promise<{
			success: boolean;
			path?: string;
			message?: string;
			error?: string;
		}>;
		setRecordingState: (
			recording: boolean,
			recordingId?: number,
			cursorCaptureMode?: import("../src/lib/recordingSession").CursorCaptureMode,
		) => Promise<void>;
		isNativeWindowsCaptureAvailable: () => Promise<{
			success: boolean;
			available: boolean;
			helperPath?: string;
			reason?: string;
			error?: string;
		}>;
		isNativeMacCaptureAvailable: () => Promise<{
			success: boolean;
			available: boolean;
			helperPath?: string;
			reason?: "unsupported-platform" | "missing-helper" | string;
			error?: string;
		}>;
		startNativeWindowsRecording: (
			request: import("../src/lib/nativeWindowsRecording").NativeWindowsRecordingRequest,
		) => Promise<import("../src/lib/nativeWindowsRecording").NativeWindowsRecordingStartResult>;
		stopNativeWindowsRecording: (discard?: boolean) => Promise<{
			success: boolean;
			path?: string;
			session?: import("../src/lib/recordingSession").RecordingSession;
			message?: string;
			discarded?: boolean;
			error?: string;
		}>;
		pauseNativeWindowsRecording: () => Promise<{
			success: boolean;
			error?: string;
		}>;
		resumeNativeWindowsRecording: () => Promise<{
			success: boolean;
			error?: string;
		}>;
		startNativeMacRecording: (
			request: import("../src/lib/nativeMacRecording").NativeMacRecordingRequest,
		) => Promise<import("../src/lib/nativeMacRecording").NativeMacRecordingStartResult>;
		pauseNativeMacRecording: () => Promise<{
			success: boolean;
			error?: string;
		}>;
		resumeNativeMacRecording: () => Promise<{
			success: boolean;
			error?: string;
		}>;
		stopNativeMacRecording: (discard?: boolean) => Promise<{
			success: boolean;
			path?: string;
			session?: import("../src/lib/recordingSession").RecordingSession;
			message?: string;
			discarded?: boolean;
			error?: string;
		}>;
		attachNativeMacWebcamRecording: (payload: {
			screenVideoPath: string;
			recordingId: number;
			webcam: import("../src/lib/recordingSession").RecordedVideoAssetInput;
			cursorCaptureMode?: import("../src/lib/recordingSession").CursorCaptureMode;
		}) => Promise<{
			success: boolean;
			path?: string;
			session?: import("../src/lib/recordingSession").RecordingSession;
			message?: string;
			error?: string;
		}>;
		discardCursorTelemetry: (recordingId: number) => Promise<void>;
		getCursorTelemetry: (videoPath?: string) => Promise<{
			success: boolean;
			samples: CursorTelemetryPoint[];
			clicks: number[];
			message?: string;
			error?: string;
		}>;
		onStopRecordingFromTray: (callback: () => void) => () => void;
		openExternalUrl: (url: string) => Promise<{ success: boolean; error?: string }>;
		pickExportSavePath: (
			fileName: string,
			exportFolder?: string,
		) => Promise<{
			success: boolean;
			path?: string;
			message?: string;
			canceled?: boolean;
			error?: string;
		}>;
		writeExportToPath: (
			videoData: ArrayBuffer,
			filePath: string,
		) => Promise<{
			success: boolean;
			path?: string;
			message?: string;
			error?: string;
		}>;
		openVideoFilePicker: () => Promise<{ success: boolean; path?: string; canceled?: boolean }>;
		setCurrentVideoPath: (path: string) => Promise<{ success: boolean }>;
		setCurrentRecordingSession: (
			session: import("../src/lib/recordingSession").RecordingSession | null,
		) => Promise<{
			success: boolean;
			session?: import("../src/lib/recordingSession").RecordingSession;
		}>;
		getCurrentVideoPath: () => Promise<{ success: boolean; path?: string }>;
		getCurrentRecordingSession: () => Promise<{
			success: boolean;
			session?: import("../src/lib/recordingSession").RecordingSession;
		}>;
		readBinaryFile: (filePath: string) => Promise<{
			success: boolean;
			data?: ArrayBuffer;
			path?: string;
			message?: string;
			error?: string;
		}>;
		preparePreviewAudioTrack: (filePath: string) => Promise<{
			success: boolean;
			path?: string | null;
			message?: string;
			error?: string;
		}>;
		clearCurrentVideoPath: () => Promise<{ success: boolean }>;
		saveProjectFile: (
			projectData: unknown,
			suggestedName?: string,
			existingProjectPath?: string,
		) => Promise<{
			success: boolean;
			path?: string;
			message?: string;
			canceled?: boolean;
			error?: string;
		}>;
		loadProjectFile: () => Promise<{
			success: boolean;
			path?: string;
			project?: unknown;
			message?: string;
			canceled?: boolean;
			error?: string;
		}>;
		loadCurrentProjectFile: () => Promise<{
			success: boolean;
			path?: string;
			project?: unknown;
			message?: string;
			canceled?: boolean;
			error?: string;
		}>;
		getPathForFile: (file: File) => string;
		loadProjectFileFromPath: (filePath: string) => Promise<{
			success: boolean;
			path?: string;
			project?: unknown;
			message?: string;
			canceled?: boolean;
			error?: string;
		}>;
		onMenuNewProject: (callback: () => void) => () => void;
		onMenuImportVideo: (callback: () => void) => () => void;
		onMenuLoadProject: (callback: () => void) => () => void;
		onMenuSaveProject: (callback: () => void) => () => void;
		onMenuSaveProjectAs: (callback: () => void) => () => void;
		getPlatform: () => Promise<string>;
		revealInFolder: (
			filePath: string,
		) => Promise<{ success: boolean; error?: string; message?: string }>;
		getShortcuts: () => Promise<Record<string, unknown> | null>;
		saveShortcuts: (shortcuts: unknown) => Promise<{ success: boolean; error?: string }>;
		updateGlobalShortcut: (binding: {
			key: string;
			ctrl?: boolean;
			shift?: boolean;
			alt?: boolean;
		}) => Promise<{ success: boolean }>;
		hudOverlayHide: () => void;
		hudOverlayClose: () => void;
		setHudOverlayIgnoreMouseEvents: (ignore: boolean) => void;
		moveHudOverlayBy: (deltaX: number, deltaY: number) => void;
		showCountdownOverlay: (value: number, runId: number) => Promise<void>;
		setCountdownOverlayValue: (value: number, runId: number) => Promise<void>;
		hideCountdownOverlay: (runId: number) => Promise<void>;
		onCountdownOverlayValue: (callback: (value: number | null) => void) => () => void;
		setMicrophoneExpanded: (expanded: boolean) => void;
		setHasUnsavedChanges: (hasChanges: boolean) => void;
		onRequestSaveBeforeClose: (callback: () => Promise<boolean> | boolean) => () => void;
		onRequestCloseConfirm: (callback: () => void) => () => void;
		sendCloseConfirmResponse: (choice: "save" | "discard" | "cancel") => void;
		setLocale: (locale: string) => Promise<void>;
		saveDiagnostic: (payload: {
			error: string;
			stack?: string;
			projectState: unknown;
			logs: string[];
		}) => Promise<{ success: boolean; path?: string; canceled?: boolean; error?: string }>;
		// Inkast — region recording (框选区域录制). Drag-select a region on the chosen
		// display; we still record the FULL display (方案 A), then apply the region as
		// the editor cropRegion so the exported video is cropped to it. openRegionSelector
		// opens the drag overlay and resolves with the normalized region (or null if
		// cancelled); the confirm path also stores it for the editor to pick up on load.
		openRegionSelector: (displayId: string) => Promise<CropRegion | null>;
		getSelectedRegion: () => Promise<CropRegion | null>;
		clearSelectedRegion: () => Promise<{ success: boolean }>;
		regionSelectorConfirm: (region: CropRegion) => void;
		regionSelectorCancel: () => void;
		// Inkast 整合 · 成片编排(video-factory 移植):JobManager IPC + 进度推送
		vf: {
			listJobs: () => Promise<VfResultT<VfJob[]>>;
			engineInfo: () => Promise<VfResultT<VfEngineInfo>>;
			submitJob: (input: VfSubmitInput) => Promise<VfResultT<VfJob>>;
			rerun: (id: string) => Promise<VfResultT<VfJob>>;
			cancel: (id: string) => Promise<VfResultT<VfJob>>;
			remove: (id: string) => Promise<VfResultT<VfJob[]>>;
			restoreJob: (job: VfJob) => Promise<VfResultT<VfJob[]>>;
			confirm: (id: string) => Promise<VfResultT<VfJob>>;
			confirmPreview: (id: string) => Promise<VfResultT<VfJob>>;
			replan: (id: string) => Promise<VfResultT<VfJob>>;
			savePlan: (id: string, plan: Partial<VfJobPlan>) => Promise<VfResultT<VfJob>>;
			jobLog: (id: string, lines?: number) => Promise<VfResultT<string>>;
			openPath: (p: string) => Promise<VfResultT<boolean>>;
			smoke: () => Promise<VfResultT<VfSmokeResult>>;
			getSlidesProvider: () => Promise<VfSlidesProvider>;
			setSlidesProvider: (provider: VfSlidesProvider) => Promise<{ ok: boolean }>;
			onJobUpdate: (callback: (job: VfJob) => void) => () => void;
		};
		// Inkast 整合 · 驾驶舱(只读 KnowledgePlanet 每日选题,按路径)
		cockpit: {
			today: () => Promise<VfCockpitResult>;
		};
		// Inkast 整合 · 驾驶舱「关注」(收藏想拉片的视频,一键去拉片)
		following: {
			list: () => Promise<VfFollowingResult<VfSavedVideo[]>>;
			add: (url: string) => Promise<VfFollowingResult<VfFollowingUpdateResult>>;
			addCreator: (input: VfCreatorTrackInput) => Promise<VfFollowingResult<VfFollowingUpdateResult>>;
			refresh: (id: string) => Promise<VfFollowingResult<VfFollowingUpdateResult>>;
			remove: (id: string) => Promise<VfFollowingResult<VfSavedVideo[]>>;
			clear: () => Promise<VfFollowingResult<VfSavedVideo[]>>;
		};
		// Inkast 整合 · 驾驶舱评论抓取(抖音视频公开评论,浏览器上下文 + 诚实降级)
		comments: {
			get: (videoUrl: string) => Promise<VfCommentsIpcResult<VfVideoComments | null>>;
			all: () => Promise<VfCommentsIpcResult<Record<string, VfVideoComments>>>;
			fetch: (
				videoUrl: string,
				limit?: number,
			) => Promise<VfCommentsIpcResult<VfCommentFetchResult>>;
			remove: (videoUrl: string) => Promise<VfCommentsIpcResult<Record<string, VfVideoComments>>>;
		};
		// Inkast 整合 · 本地选题池(vault 之上的增量层:状态流转 / 回填 / 拉片注入卡)
		pool: {
			get: () => Promise<VfTopicPool>;
			setStatus: (id: string, status: string) => Promise<VfTopicPool>;
			setNote: (id: string, note: string) => Promise<VfTopicPool>;
			setDraft: (id: string, draft: string) => Promise<VfTopicPool>;
			recordArtifact: (
				id: string,
				artifact: VfPoolArtifact,
				status?: string,
			) => Promise<VfTopicPool>;
			addTodo: (id: string, text: string) => Promise<VfTopicPool>;
			toggleTodo: (id: string, todoId: string) => Promise<VfTopicPool>;
			removeTodo: (id: string, todoId: string) => Promise<VfTopicPool>;
			addInjected: (card: VfCockpitCard, source: string) => Promise<VfTopicPool>;
			importLegacy: (statuses: Record<string, string>) => Promise<VfTopicPool>;
			onUpdate: (callback: (pool: VfTopicPool) => void) => () => void;
		};
		// Inkast 整合 · 资料库(录屏/成片/拉片报告)
		library: {
			list: () => Promise<VfLibraryResult>;
			open: (p: string) => Promise<{ ok: boolean; error?: string }>;
			read: (p: string) => Promise<{ ok: boolean; data?: string; error?: string }>;
		};
		// Inkast 整合 · 发布看板(只读扫 Publishing 文件系统 → 流水线分格)
		publishBoard: {
			list: () => Promise<VfPublishBoardResult>;
			open: (p: string) => Promise<VfPublishMut<true>>;
			read: (p: string) => Promise<VfPublishMut<string>>;
			write: (filePath: string, content: string) => Promise<VfPublishMut<true>>;
			trash: (paths: string[]) => Promise<VfPublishMut<true>>;
			rename: (filePath: string, newName: string) => Promise<VfPublishMut<string>>;
			move: (paths: string[], stage: VfPublishStage) => Promise<VfPublishMut<VfPublishMovePair[]>>;
			revertMove: (pairs: VfPublishMovePair[]) => Promise<VfPublishMut<true>>;
			openTrash: () => Promise<VfPublishMut<true>>;
			createDraft: (payload: {
				title: string;
				content: string;
				sourceCardId?: string;
				topicType?: string;
			}) => Promise<VfPublishMut<string>>;
		};
		// Inkast 整合 · 数字人(成片·云 API)
		avatar: {
			getConfig: () => Promise<VfAvatarResult<VfAvatarConfigPublic>>;
			setConfig: (
				partial: Partial<VfAvatarConfig>,
			) => Promise<VfAvatarResult<VfAvatarConfigPublic>>;
			submit: (input: {
				script: string;
				title?: string;
				sourceCardId?: string;
			}) => Promise<VfAvatarResult<VfAvatarJob>>;
			listJobs: () => Promise<VfAvatarResult<VfAvatarJob[]>>;
			remove: (id: string) => Promise<VfAvatarResult<VfAvatarJob[]>>;
			openOutput: (p: string) => Promise<VfAvatarResult<true>>;
			onJobUpdate: (callback: (job: VfAvatarJob) => void) => () => void;
		};
		// Inkast 整合 · 图文初稿生成
		article: {
			generate: (
				card: VfCockpitCard,
			) => Promise<{ ok: boolean; text?: string; provider?: string; error?: string }>;
		};
		// Inkast 整合 · LLM 密钥(safeStorage 加密)
		keys: {
			status: () => Promise<VfKeyStatus>;
			save: (provider: VfKeyProvider, key: string) => Promise<VfKeySaveResult>;
		};
		// Inkast 整合 · 分析(拉片)
		analyze: {
			engineInfo: () => Promise<VfAnalyzeEngineInfo>;
			start: (
				videoPath: string,
				title?: string,
				transcript?: string,
				persona?: string,
			) => Promise<{ ok: boolean; job?: VfAnalyzeJob; error?: string }>;
			list: () => Promise<VfAnalyzeJob[]>;
			report: (slug: string) => Promise<string>;
			pickVideo: () => Promise<string | null>;
			onUpdate: (callback: (job: VfAnalyzeJob) => void) => () => void;
			ytdlpInfo: () => Promise<{ ready: boolean; path: string | null; managed: boolean }>;
			ytdlpInstall: () => Promise<{ ok: boolean; error?: string }>;
			fetchUrl: (
				url: string,
			) => Promise<{ ok: boolean; filePath?: string; title?: string; error?: string }>;
			onYtdlpProgress: (callback: (pct: number) => void) => () => void;
			onFetchProgress: (
				callback: (info: { stage: "probe" | "download"; pct: number }) => void,
			) => () => void;
		};
		// Inkast 整合 · 外部路径设置(引擎/发布/驾驶舱路径在 App 内可改)
		settings: {
			get: () => Promise<VfAppSettings>;
			pickEngine: () => Promise<VfPickResult>;
			pickPublishing: () => Promise<VfPickResult>;
			pickCockpit: () => Promise<VfPickResult>;
			adoptEngine: () => Promise<VfPickResult>;
		};
		// Inkast 整合 · 导出备份(主线三:App 状态/配置 → 选定目录,不含媒体/密钥)
		backup: {
			export: () => Promise<VfBackupResult>;
		};
		// Inkast 整合 · 视频工作流桥接(POC:Inkast 录屏 → 110 视频剪辑项目)
		videoflow: {
			info: () => Promise<{ ok: boolean; root: string }>;
			sendRecording: (input: { path: string; title?: string }) => Promise<{
				ok: boolean;
				projectDir?: string;
				rawFileName?: string;
				prompt?: string;
				error?: string;
			}>;
			openProject: (dir: string) => Promise<{ ok: boolean }>;
		};
	};
}

type VfBackupResult = import("../src/lib/settingsTypes").BackupResult;

// Inkast 整合 · 成片编排共享类型(用 import() 形式,保持本文件为全局声明而非模块)
type VfJob = import("../src/lib/vfTypes").Job;
type VfCockpitResult = import("../src/lib/cockpitTypes").CockpitTodayResult;
type VfCockpitCard = import("../src/lib/cockpitTypes").CockpitCard;
type VfTopicPool = import("../src/lib/poolTypes").TopicPool;
type VfPoolArtifact = import("../src/lib/poolTypes").PoolArtifact;
type VfPublishBoardResult = import("../src/lib/publishBoard").PublishBoardResult;
type VfPublishMut<T> = import("../src/lib/publishBoard").PublishMut<T>;
type VfPublishStage = import("../src/lib/publishBoard").PublishStage;
type VfPublishMovePair = import("../src/lib/publishBoard").PublishMovePair;
type VfAvatarConfig = import("../src/lib/avatarTypes").AvatarConfig;
type VfAvatarConfigPublic = import("../src/lib/avatarTypes").AvatarConfigPublic;
type VfAvatarJob = import("../src/lib/avatarTypes").AvatarJob;
type VfAvatarResult<T> = import("../src/lib/avatarTypes").AvatarResult<T>;
type VfSavedVideo = import("../src/lib/followingTypes").SavedVideo;
type VfFollowingUpdateResult = import("../src/lib/followingTypes").FollowingUpdateResult;
type VfFollowingResult<T> = import("../src/lib/followingTypes").FollowingResult<T>;
type VfCreatorTrackInput = import("../src/lib/followingTypes").CreatorTrackInput;
type VfVideoComments = import("../src/lib/commentTypes").VideoComments;
type VfCommentFetchResult = import("../src/lib/commentTypes").CommentFetchResult;
type VfCommentsIpcResult<T> = import("../src/lib/commentTypes").CommentsIpcResult<T>;
type VfSlidesProvider = import("../src/lib/keyTypes").SlidesProvider;
type VfKeyStatus = import("../src/lib/keyTypes").KeyStatus;
type VfKeyProvider = import("../src/lib/keyTypes").KeyProvider;
type VfKeySaveResult = import("../src/lib/keyTypes").KeySaveResult;
type VfLibraryResult = import("../src/lib/libraryTypes").LibraryResult;
type VfAppSettings = import("../src/lib/settingsTypes").AppSettings;
type VfPickResult = import("../src/lib/settingsTypes").PickResult;
type VfAnalyzeEngineInfo = import("../src/lib/analyzeTypes").AnalyzeEngineInfo;
type VfAnalyzeJob = import("../src/lib/analyzeTypes").AnalyzeJob;
type VfResultT<T> = import("../src/lib/vfTypes").VfResult<T>;
type VfSubmitInput = import("../src/lib/vfTypes").SubmitInput;
type VfEngineInfo = import("../src/lib/vfTypes").EngineInfo;
type VfJobPlan = import("../src/lib/vfTypes").JobPlan;
type VfSmokeResult = import("../src/lib/vfTypes").SmokeResult;

interface CropRegion {
	x: number;
	y: number;
	width: number;
	height: number;
}

interface ProcessedDesktopSource {
	id: string;
	name: string;
	display_id: string;
	thumbnail: string | null;
	appIcon: string | null;
}

interface CursorTelemetryPoint {
	timeMs: number;
	cx: number;
	cy: number;
}
