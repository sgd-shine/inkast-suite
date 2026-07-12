import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { AnalyzeEngineInfo, AnalyzeJob } from "../src/lib/analyzeTypes";
import type {
	AvatarConfig,
	AvatarConfigPublic,
	AvatarJob,
	AvatarResult,
} from "../src/lib/avatarTypes";
import type { CockpitCard, CockpitTodayResult } from "../src/lib/cockpitTypes";
import type {
	CommentFetchResult,
	CommentsIpcResult,
	VideoComments,
} from "../src/lib/commentTypes";
import type {
	CreatorTrackInput,
	FollowingResult,
	FollowingUpdateResult,
	SavedVideo,
} from "../src/lib/followingTypes";
import type { KeyProvider, KeySaveResult, KeyStatus, SlidesProvider } from "../src/lib/keyTypes";
import type { LibraryResult } from "../src/lib/libraryTypes";
import type { NativeMacRecordingRequest } from "../src/lib/nativeMacRecording";
import type { NativeWindowsRecordingRequest } from "../src/lib/nativeWindowsRecording";
import type { TopicPool } from "../src/lib/poolTypes";
import type {
	PublishBoardResult,
	PublishMovePair,
	PublishMut,
	PublishStage,
} from "../src/lib/publishBoard";
import type { RecordingSession, StoreRecordedSessionInput } from "../src/lib/recordingSession";
import type { AppSettings, BackupResult, PickResult } from "../src/lib/settingsTypes";
import type { ShortcutBinding } from "../src/lib/shortcuts";
import type {
	EngineInfo,
	Job,
	JobPlan,
	SmokeResult,
	SubmitInput,
	VfResult,
} from "../src/lib/vfTypes";
import { NATIVE_BRIDGE_CHANNEL, type NativeBridgeRequest } from "../src/native/contracts";

// Asset base URL is passed from the main process via webPreferences.additionalArguments
// (see windows.ts). Sandboxed preloads cannot import node:path / node:url, so we
// can't compute it here.
const ASSET_BASE_URL_ARG_PREFIX = "--asset-base-url=";
const assetBaseUrlArg = process.argv.find((arg) => arg.startsWith(ASSET_BASE_URL_ARG_PREFIX));
const assetBaseUrl = assetBaseUrlArg ? assetBaseUrlArg.slice(ASSET_BASE_URL_ARG_PREFIX.length) : "";

contextBridge.exposeInMainWorld("electronAPI", {
	assetBaseUrl,
	invokeNativeBridge: <TData>(request: NativeBridgeRequest) => {
		return ipcRenderer.invoke(NATIVE_BRIDGE_CHANNEL, request) as Promise<TData>;
	},
	hudOverlayHide: () => {
		ipcRenderer.send("hud-overlay-hide");
	},
	hudOverlayClose: () => {
		ipcRenderer.send("hud-overlay-close");
	},
	setHudOverlayIgnoreMouseEvents: (ignore: boolean) => {
		ipcRenderer.send("hud-overlay-ignore-mouse-events", ignore);
	},
	moveHudOverlayBy: (deltaX: number, deltaY: number) => {
		ipcRenderer.send("hud-overlay-move-by", deltaX, deltaY);
	},
	// Inkast live camera overlay
	closeCameraOverlay: () => {
		ipcRenderer.send("camera-overlay-close");
	},
	resizeCameraOverlay: (size: number) => {
		ipcRenderer.send("camera-overlay-resize-to", size);
	},
	updateCameraOverlaySettings: (settings: { shape?: "circle" | "square" }) => {
		ipcRenderer.send("camera-overlay-settings-update", settings);
	},
	getCameraOverlaySettings: () => {
		return ipcRenderer.invoke("get-camera-overlay-settings");
	},
	// Inkast draw overlay (边录边画)
	closeDrawOverlay: () => {
		ipcRenderer.send("draw-overlay-close");
	},
	setDrawOverlayPassthrough: (passthrough: boolean) => {
		ipcRenderer.send("draw-overlay-set-passthrough", passthrough);
	},
	onDrawOverlayMode: (callback: (mode: "draw" | "passthrough") => void) => {
		const listener = (_event: unknown, mode: "draw" | "passthrough") => callback(mode);
		ipcRenderer.on("draw-overlay-mode", listener);
		return () => ipcRenderer.removeListener("draw-overlay-mode", listener);
	},
	onDrawOverlayClear: (callback: () => void) => {
		const listener = () => callback();
		ipcRenderer.on("draw-overlay-clear", listener);
		return () => ipcRenderer.removeListener("draw-overlay-clear", listener);
	},
	// Inkast: HUD webcam button -> toggle the content-protected camera preview
	// (coexists with ⌘⇧C); the HUD syncs this state to webcam recording.
	toggleCameraOverlay: () => {
		ipcRenderer.send("toggle-camera-overlay");
	},
	setCameraPositionMode: (mode: "fixed" | "follow") => {
		ipcRenderer.send("set-camera-position-mode", mode);
	},
	getCameraPositionMode: (): Promise<"fixed" | "follow"> =>
		ipcRenderer.invoke("get-camera-position-mode"),
	onCameraOverlayState: (callback: (open: boolean) => void) => {
		const listener = (_event: unknown, open: boolean) => callback(open);
		ipcRenderer.on("camera-overlay-state", listener);
		return () => ipcRenderer.removeListener("camera-overlay-state", listener);
	},
	// Inkast prompter (提词窗,内容保护、不录入)
	closePrompter: () => {
		ipcRenderer.send("prompter-close");
	},
	togglePrompter: () => {
		ipcRenderer.send("prompter-toggle");
	},
	onPrompterState: (callback: (open: boolean) => void) => {
		const listener = (_event: unknown, open: boolean) => callback(open);
		ipcRenderer.on("prompter-state", listener);
		return () => ipcRenderer.removeListener("prompter-state", listener);
	},
	// 漏斗预填:驾驶舱「去录屏」把选题口播稿塞进提词窗(§5.1)。
	setPrompterScript: (text: string) => {
		ipcRenderer.send("prompter-set-script", text);
	},
	getPrompterScript: (): Promise<string> => ipcRenderer.invoke("prompter-get-script"),
	onPrompterScript: (callback: (text: string) => void) => {
		const listener = (_event: unknown, text: string) => callback(text);
		ipcRenderer.on("prompter-script", listener);
		return () => ipcRenderer.removeListener("prompter-script", listener);
	},
	// Inkast region recording (框选区域录制)
	openRegionSelector: (displayId: string) => {
		return ipcRenderer.invoke("open-region-selector", displayId);
	},
	getSelectedRegion: () => {
		return ipcRenderer.invoke("get-selected-region");
	},
	clearSelectedRegion: () => {
		return ipcRenderer.invoke("clear-selected-region");
	},
	regionSelectorConfirm: (region: CropRegion) => {
		ipcRenderer.send("region-selector-confirm", region);
	},
	regionSelectorCancel: () => {
		ipcRenderer.send("region-selector-cancel");
	},
	getSources: async (opts: Electron.SourcesOptions) => {
		return await ipcRenderer.invoke("get-sources", opts);
	},
	switchToEditor: () => {
		return ipcRenderer.invoke("switch-to-editor");
	},
	switchToHud: () => {
		return ipcRenderer.invoke("switch-to-hud");
	},
	startNewRecording: () => {
		return ipcRenderer.invoke("start-new-recording");
	},
	openSourceSelector: () => {
		return ipcRenderer.invoke("open-source-selector");
	},
	selectSource: (source: ProcessedDesktopSource) => {
		return ipcRenderer.invoke("select-source", source);
	},
	getSelectedSource: () => {
		return ipcRenderer.invoke("get-selected-source");
	},
	requestCameraAccess: () => {
		return ipcRenderer.invoke("request-camera-access");
	},
	requestScreenAccess: () => {
		return ipcRenderer.invoke("request-screen-access");
	},
	requestNativeMacCursorAccess: () => {
		return ipcRenderer.invoke("request-native-mac-cursor-access");
	},
	storeRecordedVideo: (videoData: ArrayBuffer, fileName: string) => {
		return ipcRenderer.invoke("store-recorded-video", videoData, fileName);
	},
	storeRecordedSession: (payload: StoreRecordedSessionInput) => {
		return ipcRenderer.invoke("store-recorded-session", payload);
	},
	openRecordingStream: (fileName: string) => {
		return ipcRenderer.invoke("open-recording-stream", fileName);
	},
	appendRecordingChunk: (fileName: string, chunk: ArrayBuffer) => {
		return ipcRenderer.invoke("append-recording-chunk", fileName, chunk);
	},
	closeRecordingStream: (fileName: string) => {
		return ipcRenderer.invoke("close-recording-stream", fileName);
	},
	finalizeRecordingStream: (fileName: string, durationMs?: number) => {
		return ipcRenderer.invoke("finalize-recording-stream", fileName, durationMs);
	},

	getRecordedVideoPath: () => {
		return ipcRenderer.invoke("get-recorded-video-path");
	},
	setRecordingState: (
		recording: boolean,
		recordingId?: number,
		cursorCaptureMode?: import("../src/lib/recordingSession").CursorCaptureMode,
	) => {
		return ipcRenderer.invoke("set-recording-state", recording, recordingId, cursorCaptureMode);
	},
	isNativeWindowsCaptureAvailable: () => {
		return ipcRenderer.invoke("is-native-windows-capture-available");
	},
	isNativeMacCaptureAvailable: () => {
		return ipcRenderer.invoke("is-native-mac-capture-available");
	},
	startNativeWindowsRecording: (request: NativeWindowsRecordingRequest) => {
		return ipcRenderer.invoke("start-native-windows-recording", request);
	},
	stopNativeWindowsRecording: (discard?: boolean) => {
		return ipcRenderer.invoke("stop-native-windows-recording", discard);
	},
	pauseNativeWindowsRecording: () => {
		return ipcRenderer.invoke("pause-native-windows-recording");
	},
	resumeNativeWindowsRecording: () => {
		return ipcRenderer.invoke("resume-native-windows-recording");
	},
	startNativeMacRecording: (request: NativeMacRecordingRequest) => {
		return ipcRenderer.invoke("start-native-mac-recording", request);
	},
	pauseNativeMacRecording: () => {
		return ipcRenderer.invoke("pause-native-mac-recording");
	},
	resumeNativeMacRecording: () => {
		return ipcRenderer.invoke("resume-native-mac-recording");
	},
	stopNativeMacRecording: (discard?: boolean) => {
		return ipcRenderer.invoke("stop-native-mac-recording", discard);
	},
	attachNativeMacWebcamRecording: (payload: {
		screenVideoPath: string;
		recordingId: number;
		webcam: { fileName: string; videoData: ArrayBuffer };
		cursorCaptureMode?: import("../src/lib/recordingSession").CursorCaptureMode;
	}) => {
		return ipcRenderer.invoke("attach-native-mac-webcam-recording", payload);
	},
	getCursorTelemetry: (videoPath?: string) => {
		return ipcRenderer.invoke("get-cursor-telemetry", videoPath);
	},
	discardCursorTelemetry: (recordingId: number) => {
		return ipcRenderer.invoke("discard-cursor-telemetry", recordingId);
	},
	onStopRecordingFromTray: (callback: () => void) => {
		const listener = () => callback();
		ipcRenderer.on("stop-recording-from-tray", listener);
		return () => ipcRenderer.removeListener("stop-recording-from-tray", listener);
	},
	openExternalUrl: (url: string) => {
		return ipcRenderer.invoke("open-external-url", url);
	},
	pickExportSavePath: (fileName: string, exportFolder?: string) => {
		return ipcRenderer.invoke("pick-export-save-path", fileName, exportFolder);
	},
	writeExportToPath: (videoData: ArrayBuffer, filePath: string) => {
		return ipcRenderer.invoke("write-export-to-path", videoData, filePath);
	},
	openVideoFilePicker: () => {
		return ipcRenderer.invoke("open-video-file-picker");
	},
	setCurrentVideoPath: (path: string) => {
		return ipcRenderer.invoke("set-current-video-path", path);
	},
	setCurrentRecordingSession: (session: RecordingSession | null) => {
		return ipcRenderer.invoke("set-current-recording-session", session);
	},
	getCurrentVideoPath: () => {
		return ipcRenderer.invoke("get-current-video-path");
	},
	getCurrentRecordingSession: () => {
		return ipcRenderer.invoke("get-current-recording-session");
	},
	readBinaryFile: (filePath: string) => {
		return ipcRenderer.invoke("read-binary-file", filePath);
	},
	preparePreviewAudioTrack: (filePath: string) => {
		return ipcRenderer.invoke("prepare-preview-audio-track", filePath);
	},
	clearCurrentVideoPath: () => {
		return ipcRenderer.invoke("clear-current-video-path");
	},
	saveProjectFile: (projectData: unknown, suggestedName?: string, existingProjectPath?: string) => {
		return ipcRenderer.invoke("save-project-file", projectData, suggestedName, existingProjectPath);
	},
	loadProjectFile: () => {
		return ipcRenderer.invoke("load-project-file");
	},
	loadProjectFileFromPath: (filePath: string) => {
		return ipcRenderer.invoke("load-project-file-from-path", filePath);
	},
	getPathForFile: (file: File) => {
		try {
			return webUtils.getPathForFile(file);
		} catch {
			return "";
		}
	},
	loadCurrentProjectFile: () => {
		return ipcRenderer.invoke("load-current-project-file");
	},
	onMenuNewProject: (callback: () => void) => {
		const listener = () => callback();
		ipcRenderer.on("menu-new-project", listener);
		return () => ipcRenderer.removeListener("menu-new-project", listener);
	},
	onMenuImportVideo: (callback: () => void) => {
		const listener = () => callback();
		ipcRenderer.on("menu-import-video", listener);
		return () => ipcRenderer.removeListener("menu-import-video", listener);
	},
	onMenuLoadProject: (callback: () => void) => {
		const listener = () => callback();
		ipcRenderer.on("menu-load-project", listener);
		return () => ipcRenderer.removeListener("menu-load-project", listener);
	},
	onMenuSaveProject: (callback: () => void) => {
		const listener = () => callback();
		ipcRenderer.on("menu-save-project", listener);
		return () => ipcRenderer.removeListener("menu-save-project", listener);
	},
	onMenuSaveProjectAs: (callback: () => void) => {
		const listener = () => callback();
		ipcRenderer.on("menu-save-project-as", listener);
		return () => ipcRenderer.removeListener("menu-save-project-as", listener);
	},
	getPlatform: () => {
		return ipcRenderer.invoke("get-platform");
	},
	revealInFolder: (filePath: string) => {
		return ipcRenderer.invoke("reveal-in-folder", filePath);
	},
	getShortcuts: () => {
		return ipcRenderer.invoke("get-shortcuts");
	},
	saveShortcuts: (shortcuts: unknown) => {
		return ipcRenderer.invoke("save-shortcuts", shortcuts);
	},
	updateGlobalShortcut: (binding: ShortcutBinding) => {
		return ipcRenderer.invoke("update-global-shortcut", binding);
	},
	setLocale: (locale: string) => {
		return ipcRenderer.invoke("set-locale", locale);
	},
	saveDiagnostic: (payload: {
		error: string;
		stack?: string;
		projectState: unknown;
		logs: string[];
	}) => {
		return ipcRenderer.invoke("save-diagnostic", payload);
	},
	setMicrophoneExpanded: (expanded: boolean) => {
		ipcRenderer.send("hud:setMicrophoneExpanded", expanded);
	},
	setHasUnsavedChanges: (hasChanges: boolean) => {
		ipcRenderer.send("set-has-unsaved-changes", hasChanges);
	},
	showCountdownOverlay: (value: number, runId: number) => {
		return ipcRenderer.invoke("countdown-overlay-show", value, runId);
	},
	setCountdownOverlayValue: (value: number, runId: number) => {
		return ipcRenderer.invoke("countdown-overlay-set-value", value, runId);
	},
	hideCountdownOverlay: (runId: number) => {
		return ipcRenderer.invoke("countdown-overlay-hide", runId);
	},
	onCountdownOverlayValue: (callback: (value: number | null) => void) => {
		const listener = (_event: unknown, value: number | null) => callback(value);
		ipcRenderer.on("countdown-overlay-value", listener);
		return () => ipcRenderer.removeListener("countdown-overlay-value", listener);
	},
	onRequestSaveBeforeClose: (callback: () => Promise<boolean> | boolean) => {
		const listener = async () => {
			try {
				const shouldClose = await callback();
				ipcRenderer.send("save-before-close-done", shouldClose);
			} catch {
				ipcRenderer.send("save-before-close-done", false);
			}
		};
		ipcRenderer.on("request-save-before-close", listener);
		return () => ipcRenderer.removeListener("request-save-before-close", listener);
	},
	onRequestCloseConfirm: (callback: () => void) => {
		const listener = () => callback();
		ipcRenderer.on("request-close-confirm", listener);
		return () => ipcRenderer.removeListener("request-close-confirm", listener);
	},
	sendCloseConfirmResponse: (choice: "save" | "discard" | "cancel") => {
		ipcRenderer.send("close-confirm-response", choice);
	},
	// Inkast 整合 · 成片编排(video-factory 移植):请求/响应 + 进度推送(onJobUpdate)。
	vf: {
		listJobs: (): Promise<VfResult<Job[]>> => ipcRenderer.invoke("vf:listJobs"),
		engineInfo: (): Promise<VfResult<EngineInfo>> => ipcRenderer.invoke("vf:engineInfo"),
		submitJob: (input: SubmitInput): Promise<VfResult<Job>> =>
			ipcRenderer.invoke("vf:submitJob", input),
		rerun: (id: string): Promise<VfResult<Job>> => ipcRenderer.invoke("vf:rerun", id),
		cancel: (id: string): Promise<VfResult<Job>> => ipcRenderer.invoke("vf:cancel", id),
		remove: (id: string): Promise<VfResult<Job[]>> => ipcRenderer.invoke("vf:remove", id),
		restoreJob: (job: Job): Promise<VfResult<Job[]>> => ipcRenderer.invoke("vf:restoreJob", job),
		confirm: (id: string): Promise<VfResult<Job>> => ipcRenderer.invoke("vf:confirm", id),
		confirmPreview: (id: string): Promise<VfResult<Job>> =>
			ipcRenderer.invoke("vf:confirmPreview", id),
		replan: (id: string): Promise<VfResult<Job>> => ipcRenderer.invoke("vf:replan", id),
		savePlan: (id: string, plan: Partial<JobPlan>): Promise<VfResult<Job>> =>
			ipcRenderer.invoke("vf:savePlan", { id, plan }),
		jobLog: (id: string, lines?: number): Promise<VfResult<string>> =>
			ipcRenderer.invoke("vf:jobLog", { id, lines }),
		openPath: (p: string): Promise<VfResult<boolean>> => ipcRenderer.invoke("vf:openPath", p),
		smoke: (): Promise<VfResult<SmokeResult>> => ipcRenderer.invoke("vf:smoke"),
		getSlidesProvider: (): Promise<SlidesProvider> => ipcRenderer.invoke("vf:getSlidesProvider"),
		setSlidesProvider: (provider: SlidesProvider): Promise<{ ok: boolean }> =>
			ipcRenderer.invoke("vf:setSlidesProvider", provider),
		onJobUpdate: (callback: (job: Job) => void) => {
			const listener = (_event: unknown, job: Job) => callback(job);
			ipcRenderer.on("vf:jobUpdate", listener);
			return () => ipcRenderer.removeListener("vf:jobUpdate", listener);
		},
	},
	// Inkast 整合 · 驾驶舱(只读 KnowledgePlanet 每日选题,按路径)。
	cockpit: {
		today: (): Promise<CockpitTodayResult> => ipcRenderer.invoke("cockpit:today"),
	},
	// Inkast 整合 · 驾驶舱「关注」(收藏想拉片的视频,YouTube 频道自动列/单条贴链接,一键去拉片)。
	following: {
		list: (): Promise<FollowingResult<SavedVideo[]>> => ipcRenderer.invoke("following:list"),
		add: (url: string): Promise<FollowingResult<FollowingUpdateResult>> =>
			ipcRenderer.invoke("following:add", url),
		addCreator: (input: CreatorTrackInput): Promise<FollowingResult<FollowingUpdateResult>> =>
			ipcRenderer.invoke("following:addCreator", input),
		refresh: (id: string): Promise<FollowingResult<FollowingUpdateResult>> =>
			ipcRenderer.invoke("following:refresh", id),
		remove: (id: string): Promise<FollowingResult<SavedVideo[]>> =>
			ipcRenderer.invoke("following:remove", id),
		clear: (): Promise<FollowingResult<SavedVideo[]>> => ipcRenderer.invoke("following:clear"),
	},
	// Inkast 整合 · 驾驶舱评论抓取(抖音视频公开评论,浏览器上下文抓取 + 诚实降级,不存凭据/不造假)。
	comments: {
		get: (videoUrl: string): Promise<CommentsIpcResult<VideoComments | null>> =>
			ipcRenderer.invoke("comments:get", videoUrl),
		all: (): Promise<CommentsIpcResult<Record<string, VideoComments>>> =>
			ipcRenderer.invoke("comments:all"),
		fetch: (videoUrl: string, limit?: number): Promise<CommentsIpcResult<CommentFetchResult>> =>
			ipcRenderer.invoke("comments:fetch", videoUrl, limit),
		remove: (videoUrl: string): Promise<CommentsIpcResult<Record<string, VideoComments>>> =>
			ipcRenderer.invoke("comments:remove", videoUrl),
	},
	// Inkast 整合 · 本地选题池(vault 之上的增量层:状态流转 / 回填 / 拉片注入卡)。
	pool: {
		get: (): Promise<TopicPool> => ipcRenderer.invoke("pool:get"),
		setStatus: (id: string, status: string): Promise<TopicPool> =>
			ipcRenderer.invoke("pool:setStatus", { id, status }),
		setNote: (id: string, note: string): Promise<TopicPool> =>
			ipcRenderer.invoke("pool:setNote", { id, note }),
		setDraft: (id: string, draft: string): Promise<TopicPool> =>
			ipcRenderer.invoke("pool:setDraft", { id, draft }),
		recordArtifact: (
			id: string,
			artifact: import("../src/lib/poolTypes").PoolArtifact,
			status?: string,
		): Promise<TopicPool> => ipcRenderer.invoke("pool:recordArtifact", { id, artifact, status }),
		addTodo: (id: string, text: string): Promise<TopicPool> =>
			ipcRenderer.invoke("pool:addTodo", { id, text }),
		toggleTodo: (id: string, todoId: string): Promise<TopicPool> =>
			ipcRenderer.invoke("pool:toggleTodo", { id, todoId }),
		removeTodo: (id: string, todoId: string): Promise<TopicPool> =>
			ipcRenderer.invoke("pool:removeTodo", { id, todoId }),
		addInjected: (card: CockpitCard, source: string): Promise<TopicPool> =>
			ipcRenderer.invoke("pool:addInjected", { card, source }),
		importLegacy: (statuses: Record<string, string>): Promise<TopicPool> =>
			ipcRenderer.invoke("pool:importLegacy", statuses),
		onUpdate: (callback: (pool: TopicPool) => void) => {
			const listener = (_event: unknown, pool: TopicPool) => callback(pool);
			ipcRenderer.on("pool:update", listener);
			return () => ipcRenderer.removeListener("pool:update", listener);
		},
	},
	// Inkast 整合 · 资料库(录屏/成片/拉片报告,按路径只读)。
	library: {
		list: (): Promise<LibraryResult> => ipcRenderer.invoke("library:list"),
		open: (p: string): Promise<{ ok: boolean; error?: string }> =>
			ipcRenderer.invoke("library:open", p),
		read: (p: string): Promise<{ ok: boolean; data?: string; error?: string }> =>
			ipcRenderer.invoke("library:read", p),
	},
	// Inkast 整合 · 发布看板(只读扫 Publishing 文件系统 → 流水线分格)。
	publishBoard: {
		list: (): Promise<PublishBoardResult> => ipcRenderer.invoke("publishBoard:list"),
		open: (p: string): Promise<PublishMut<true>> => ipcRenderer.invoke("publishBoard:open", p),
		read: (p: string): Promise<PublishMut<string>> => ipcRenderer.invoke("publishBoard:read", p),
		write: (filePath: string, content: string): Promise<PublishMut<true>> =>
			ipcRenderer.invoke("publishBoard:write", { path: filePath, content }),
		trash: (paths: string[]): Promise<PublishMut<true>> =>
			ipcRenderer.invoke("publishBoard:trash", paths),
		rename: (filePath: string, newName: string): Promise<PublishMut<string>> =>
			ipcRenderer.invoke("publishBoard:rename", { path: filePath, newName }),
		move: (paths: string[], stage: PublishStage): Promise<PublishMut<PublishMovePair[]>> =>
			ipcRenderer.invoke("publishBoard:move", { paths, stage }),
		revertMove: (pairs: PublishMovePair[]): Promise<PublishMut<true>> =>
			ipcRenderer.invoke("publishBoard:revertMove", pairs),
		openTrash: (): Promise<PublishMut<true>> => ipcRenderer.invoke("publishBoard:openTrash"),
		createDraft: (payload: {
			title: string;
			content: string;
			sourceCardId?: string;
			topicType?: string;
		}): Promise<PublishMut<string>> => ipcRenderer.invoke("publishBoard:createDraft", payload),
	},
	// Inkast 整合 · 数字人(成片·云 API):口播稿 → 云(HeyGen/通用适配器)→ MP4。
	avatar: {
		getConfig: (): Promise<AvatarResult<AvatarConfigPublic>> =>
			ipcRenderer.invoke("avatar:getConfig"),
		setConfig: (partial: Partial<AvatarConfig>): Promise<AvatarResult<AvatarConfigPublic>> =>
			ipcRenderer.invoke("avatar:setConfig", partial),
		submit: (input: {
			script: string;
			title?: string;
			sourceCardId?: string;
		}): Promise<AvatarResult<AvatarJob>> => ipcRenderer.invoke("avatar:submit", input),
		listJobs: (): Promise<AvatarResult<AvatarJob[]>> => ipcRenderer.invoke("avatar:listJobs"),
		remove: (id: string): Promise<AvatarResult<AvatarJob[]>> =>
			ipcRenderer.invoke("avatar:remove", id),
		openOutput: (p: string): Promise<AvatarResult<true>> =>
			ipcRenderer.invoke("avatar:openOutput", p),
		onJobUpdate: (callback: (job: AvatarJob) => void) => {
			const listener = (_event: unknown, job: AvatarJob) => callback(job);
			ipcRenderer.on("avatar:jobUpdate", listener);
			return () => ipcRenderer.removeListener("avatar:jobUpdate", listener);
		},
	},
	// Inkast 整合 · 图文初稿生成(选题+我的观点 → LLM 改写公众号图文,不碰引擎)。
	article: {
		generate: (
			card: CockpitCard,
		): Promise<{ ok: boolean; text?: string; provider?: string; error?: string }> =>
			ipcRenderer.invoke("article:generate", card),
	},
	// Inkast 整合 · LLM 密钥(safeStorage 加密,启动注入 process.env;不落明文不进 git)。
	keys: {
		status: (): Promise<KeyStatus> => ipcRenderer.invoke("keys:status"),
		save: (provider: KeyProvider, key: string): Promise<KeySaveResult> =>
			ipcRenderer.invoke("keys:save", { provider, key }),
	},
	// Inkast 整合 · 分析(拉片):ffmpeg 抽帧 + Claude vision。
	analyze: {
		engineInfo: (): Promise<AnalyzeEngineInfo> => ipcRenderer.invoke("analyze:engineInfo"),
		start: (
			videoPath: string,
			title?: string,
			transcript?: string,
			persona?: string,
		): Promise<{ ok: boolean; job?: AnalyzeJob; error?: string }> =>
			ipcRenderer.invoke("analyze:start", { videoPath, title, transcript, persona }),
		list: (): Promise<AnalyzeJob[]> => ipcRenderer.invoke("analyze:list"),
		report: (slug: string): Promise<string> => ipcRenderer.invoke("analyze:report", slug),
		pickVideo: (): Promise<string | null> => ipcRenderer.invoke("analyze:pickVideo"),
		onUpdate: (callback: (job: AnalyzeJob) => void) => {
			const listener = (_event: unknown, job: AnalyzeJob) => callback(job);
			ipcRenderer.on("analyze:update", listener);
			return () => ipcRenderer.removeListener("analyze:update", listener);
		},
		// 贴链接直接拆(Feature 1):yt-dlp 状态/安装 + 从链接拉取视频到本地(再走拉片)。
		ytdlpInfo: (): Promise<{ ready: boolean; path: string | null; managed: boolean }> =>
			ipcRenderer.invoke("analyze:ytdlpInfo"),
		ytdlpInstall: (): Promise<{ ok: boolean; error?: string }> =>
			ipcRenderer.invoke("analyze:ytdlpInstall"),
		fetchUrl: (
			url: string,
		): Promise<{ ok: boolean; filePath?: string; title?: string; error?: string }> =>
			ipcRenderer.invoke("analyze:fetchUrl", url),
		onYtdlpProgress: (callback: (pct: number) => void) => {
			const listener = (_event: unknown, pct: number) => callback(pct);
			ipcRenderer.on("analyze:ytdlpProgress", listener);
			return () => ipcRenderer.removeListener("analyze:ytdlpProgress", listener);
		},
		onFetchProgress: (callback: (info: { stage: "probe" | "download"; pct: number }) => void) => {
			const listener = (_event: unknown, info: { stage: "probe" | "download"; pct: number }) =>
				callback(info);
			ipcRenderer.on("analyze:fetchProgress", listener);
			return () => ipcRenderer.removeListener("analyze:fetchProgress", listener);
		},
	},
	// Inkast 整合 · 外部路径设置(引擎/发布/驾驶舱路径在 App 内可改,不必手改 userData JSON)。
	settings: {
		get: (): Promise<AppSettings> => ipcRenderer.invoke("settings:get"),
		pickEngine: (): Promise<PickResult> => ipcRenderer.invoke("settings:pickEngine"),
		pickPublishing: (): Promise<PickResult> => ipcRenderer.invoke("settings:pickPublishing"),
		pickCockpit: (): Promise<PickResult> => ipcRenderer.invoke("settings:pickCockpit"),
		adoptEngine: (): Promise<PickResult> => ipcRenderer.invoke("settings:adoptEngine"),
	},
	// Inkast 整合 · 导出备份(主线三):App 状态/配置 → 选定目录(不含媒体文件与密钥)。
	backup: {
		export: (): Promise<BackupResult> => ipcRenderer.invoke("backup:export"),
	},
	// Inkast 整合 · 视频工作流桥接(POC):Inkast 录屏 → 110 视频剪辑项目。
	videoflow: {
		info: (): Promise<{ ok: boolean; root: string }> => ipcRenderer.invoke("videoflow:info"),
		sendRecording: (input: {
			path: string;
			title?: string;
		}): Promise<{
			ok: boolean;
			projectDir?: string;
			rawFileName?: string;
			prompt?: string;
			error?: string;
		}> => ipcRenderer.invoke("videoflow:sendRecording", input),
		openProject: (dir: string): Promise<{ ok: boolean }> =>
			ipcRenderer.invoke("videoflow:openProject", dir),
	},
});
