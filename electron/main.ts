import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	app,
	BrowserWindow,
	globalShortcut,
	ipcMain,
	Menu,
	nativeImage,
	session,
	systemPreferences,
	Tray,
} from "electron";
import type { SlidesProvider } from "../src/lib/keyTypes";
import { findingsToTopicCards } from "../src/lib/lapianFindings";
import { ShortcutBinding } from "../src/lib/shortcuts";
import type { Job } from "../src/lib/vfTypes";
import { registerAnalyzeHandlers } from "./analyze/analyzeService";
import { registerArticleHandlers } from "./article/articleService";
import { AvatarManager } from "./avatar/avatarManager";
import { registerAvatarHandlers } from "./avatar/registerAvatarHandlers";
import { registerBackupHandlers } from "./backup/backup";
import { registerCockpitHandlers } from "./cockpit/cockpit";
import { registerCommentsHandlers } from "./cockpit/comments";
import { registerFollowingHandlers } from "./cockpit/following";
import { registerTopicPoolHandlers, TopicPoolStore } from "./cockpit/topicPool";
import {
	loadAndRegisterGlobalShortcut,
	registerOpenAppShortcut,
	unregisterAllGlobalShortcuts,
} from "./globalShortcut";
import { mainT, setMainLocale } from "./i18n";
import {
	getSelectedDesktopSource,
	registerIpcHandlers,
	setSelectedRegionValue,
} from "./ipc/handlers";
import { resolvePipelineRoot } from "./jobs/engineConfig";
import { JobManager } from "./jobs/jobManager";
import { getSlidesProvider, saveSlidesProvider } from "./jobs/produceConfig";
import { registerJobHandlers } from "./jobs/registerJobHandlers";
import { loadKeysIntoEnv, registerKeyHandlers } from "./keys/keyStore";
import { clearAttention, notifyTaskAttention } from "./lib/notify";
import { registerLibraryHandlers } from "./library/library";
import { registerPublishBoardHandlers } from "./publish/publishBoard";
import { registerSettingsHandlers } from "./settings/settings";
import { registerVideoflowHandlers } from "./videoflow/videoflow";
import {
	clearDrawOverlay,
	closeRegionSelectorWindow,
	createCountdownOverlayWindow,
	createEditorWindow,
	createHudOverlayWindow,
	createRegionSelectorWindow,
	createSourceSelectorWindow,
	toggleCameraOverlayWindow,
	toggleDrawOverlayPassthrough,
	toggleDrawOverlayWindow,
	togglePrompterWindow,
} from "./windows";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Use Screen & System Audio Recording permissions instead of CoreAudio Tap API on macOS.
// CoreAudio Tap requires NSAudioCaptureUsageDescription in the parent app's Info.plist,
// which doesn't work when running from a terminal/IDE during development, makes my life easier
if (process.platform === "darwin") {
	app.commandLine.appendSwitch("disable-features", "MacCatapLoopbackAudioForScreenShare");
}

// Enable Wayland support for proper screen capture and window management
// on Wayland compositors (Hyprland, GNOME, KDE, etc.)
if (process.platform === "linux") {
	const isWayland =
		process.env.XDG_SESSION_TYPE === "wayland" || process.env.WAYLAND_DISPLAY !== undefined;
	if (isWayland) {
		app.commandLine.appendSwitch("ozone-platform", "wayland");
		// Enable WebRTCPipeWireCapturer for screen capture on Wayland
		app.commandLine.appendSwitch("enable-features", "WaylandWindowDrag,WebRTCPipeWireCapturer");
	}
}

export const RECORDINGS_DIR = path.join(app.getPath("userData"), "recordings");

async function ensureRecordingsDir() {
	try {
		await fs.mkdir(RECORDINGS_DIR, { recursive: true });
		console.log("RECORDINGS_DIR:", RECORDINGS_DIR);
		console.log("User Data Path:", app.getPath("userData"));
	} catch (error) {
		console.error("Failed to create recordings directory:", error);
	}
}

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, "..");

// Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
export const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
export const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
	? path.join(process.env.APP_ROOT, "public")
	: RENDERER_DIST;

// Window references
let mainWindow: BrowserWindow | null = null;
let sourceSelectorWindow: BrowserWindow | null = null;
let countdownOverlayWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let selectedSourceName = "";
const isMac = process.platform === "darwin";
const trayIconSize = isMac ? 16 : 24;

// Tray Icons
const defaultTrayIcon = getTrayIcon("openscreen.png", trayIconSize);
const recordingTrayIcon = getTrayIcon("rec-button.png", trayIconSize);

function createWindow() {
	mainWindow = createHudOverlayWindow();
}

function showMainWindow() {
	if (mainWindow && !mainWindow.isDestroyed()) {
		if (mainWindow.isMinimized()) {
			mainWindow.restore();
		}
		mainWindow.show();
		mainWindow.focus();
		return;
	}

	createWindow();
}

function isEditorWindow(window: BrowserWindow) {
	return window.webContents.getURL().includes("windowType=editor");
}

function sendEditorMenuAction(
	channel: "menu-load-project" | "menu-save-project" | "menu-save-project-as" | "menu-new-project",
) {
	let targetWindow = BrowserWindow.getFocusedWindow() ?? mainWindow;

	if (!targetWindow || targetWindow.isDestroyed() || !isEditorWindow(targetWindow)) {
		createEditorWindowWrapper();
		targetWindow = mainWindow;
		if (!targetWindow || targetWindow.isDestroyed()) return;

		targetWindow.webContents.once("did-finish-load", () => {
			if (!targetWindow || targetWindow.isDestroyed()) return;
			targetWindow.webContents.send(channel);
		});
		return;
	}

	targetWindow.webContents.send(channel);
}

function setupApplicationMenu() {
	const isMac = process.platform === "darwin";
	const template: Electron.MenuItemConstructorOptions[] = [];

	if (isMac) {
		template.push({
			label: app.name,
			submenu: [
				{
					role: "about",
					label: mainT("common", "actions.about") || "About Inkast",
				},
				{ type: "separator" },
				{
					role: "services",
					label: mainT("common", "actions.services") || "Services",
				},
				{ type: "separator" },
				{
					role: "hide",
					label: mainT("common", "actions.hide") || "Hide Inkast",
				},
				{
					role: "hideOthers",
					label: mainT("common", "actions.hideOthers") || "Hide Others",
				},
				{
					role: "unhide",
					label: mainT("common", "actions.unhide") || "Show All",
				},
				{ type: "separator" },
				{ role: "quit", label: mainT("common", "actions.quit") || "Quit" },
			],
		});
	}

	template.push(
		{
			label: mainT("common", "actions.file") || "File",
			submenu: [
				{
					label: mainT("dialogs", "unsavedChanges.newProject") || "New Project",
					accelerator: "CmdOrCtrl+N",
					click: () => sendEditorMenuAction("menu-new-project"),
				},
				{ type: "separator" as const },
				{
					label: mainT("dialogs", "unsavedChanges.loadProject") || "Load Project…",
					accelerator: "CmdOrCtrl+O",
					click: () => sendEditorMenuAction("menu-load-project"),
				},
				{
					label: mainT("dialogs", "unsavedChanges.saveProject") || "Save Project…",
					accelerator: "CmdOrCtrl+S",
					click: () => sendEditorMenuAction("menu-save-project"),
				},
				{
					label: mainT("dialogs", "unsavedChanges.saveProjectAs") || "Save Project As…",
					accelerator: "CmdOrCtrl+Shift+S",
					click: () => sendEditorMenuAction("menu-save-project-as"),
				},
				...(isMac
					? []
					: [
							{ type: "separator" as const },
							{
								role: "quit" as const,
								label: mainT("common", "actions.quit") || "Quit",
							},
						]),
			],
		},
		{
			label: mainT("common", "actions.edit") || "Edit",
			submenu: [
				{ role: "undo", label: mainT("common", "actions.undo") || "Undo" },
				{ role: "redo", label: mainT("common", "actions.redo") || "Redo" },
				{ type: "separator" },
				{ role: "cut", label: mainT("common", "actions.cut") || "Cut" },
				{ role: "copy", label: mainT("common", "actions.copy") || "Copy" },
				{ role: "paste", label: mainT("common", "actions.paste") || "Paste" },
				{
					role: "selectAll",
					label: mainT("common", "actions.selectAll") || "Select All",
				},
			],
		},
		{
			label: mainT("common", "actions.view") || "View",
			submenu: [
				{
					role: "reload",
					label: mainT("common", "actions.reload") || "Reload",
				},
				{
					role: "forceReload",
					label: mainT("common", "actions.forceReload") || "Force Reload",
				},
				{
					role: "toggleDevTools",
					label: mainT("common", "actions.toggleDevTools") || "Toggle Developer Tools",
				},
				{ type: "separator" },
				{
					role: "resetZoom",
					label: mainT("common", "actions.actualSize") || "Actual Size",
				},
				{
					role: "zoomIn",
					label: mainT("common", "actions.zoomIn") || "Zoom In",
				},
				{
					role: "zoomOut",
					label: mainT("common", "actions.zoomOut") || "Zoom Out",
				},
				{ type: "separator" },
				{
					role: "togglefullscreen",
					label: mainT("common", "actions.toggleFullScreen") || "Toggle Full Screen",
				},
			],
		},
		{
			label: mainT("common", "actions.window") || "Window",
			submenu: isMac
				? [
						{
							role: "minimize",
							label: mainT("common", "actions.minimize") || "Minimize",
						},
						{ role: "zoom" },
						{ type: "separator" },
						{ role: "front" },
					]
				: [
						{
							role: "minimize",
							label: mainT("common", "actions.minimize") || "Minimize",
						},
						{
							role: "close",
							label: mainT("common", "actions.close") || "Close",
						},
					],
		},
	);

	const menu = Menu.buildFromTemplate(template);
	Menu.setApplicationMenu(menu);
}

function createTray() {
	tray = new Tray(defaultTrayIcon);
	tray.on("click", () => {
		showMainWindow();
	});
	tray.on("double-click", () => {
		showMainWindow();
	});
}

function getTrayIcon(filename: string, size: number) {
	return nativeImage
		.createFromPath(path.join(process.env.VITE_PUBLIC || RENDERER_DIST, filename))
		.resize({
			width: size,
			height: size,
			quality: "best",
		});
}

function updateTrayMenu(recording: boolean = false) {
	if (!tray) return;
	const trayIcon = recording ? recordingTrayIcon : defaultTrayIcon;
	const trayToolTip = recording
		? mainT("common", "actions.recordingStatus", {
				source: selectedSourceName,
			}) || `Recording: ${selectedSourceName}`
		: "Inkast";
	const menuTemplate = recording
		? [
				{
					label: mainT("common", "actions.stopRecording") || "Stop Recording",
					click: () => {
						if (mainWindow && !mainWindow.isDestroyed()) {
							mainWindow.webContents.send("stop-recording-from-tray");
						}
					},
				},
			]
		: [
				{
					label: mainT("common", "actions.open") || "Open",
					click: () => {
						showMainWindow();
					},
				},
				{
					label: mainT("common", "actions.quit") || "Quit",
					click: () => {
						app.quit();
					},
				},
			];
	tray.setImage(trayIcon);
	tray.setToolTip(trayToolTip);
	tray.setContextMenu(Menu.buildFromTemplate(menuTemplate));
}

let editorHasUnsavedChanges = false;
let isForceClosing = false;
let isCloseConfirmInFlight = false;

ipcMain.on("set-has-unsaved-changes", (_, hasChanges: boolean) => {
	editorHasUnsavedChanges = hasChanges;
});

function forceCloseEditorWindow(windowToClose: BrowserWindow | null) {
	if (!windowToClose || windowToClose.isDestroyed()) return;

	isForceClosing = true;
	setImmediate(() => {
		try {
			if (!windowToClose.isDestroyed()) {
				windowToClose.close();
			}
		} finally {
			isForceClosing = false;
		}
	});
}

function createEditorWindowWrapper() {
	if (mainWindow) {
		isForceClosing = true;
		mainWindow.close();
		isForceClosing = false;
		mainWindow = null;
	}
	mainWindow = createEditorWindow();
	editorHasUnsavedChanges = false;

	mainWindow.on("close", (event) => {
		if (isForceClosing || !editorHasUnsavedChanges || isCloseConfirmInFlight) return;

		event.preventDefault();
		isCloseConfirmInFlight = true;

		const windowToClose = mainWindow;
		if (!windowToClose || windowToClose.isDestroyed()) return;

		// Ask renderer to show the custom in-app dialog
		windowToClose.webContents.send("request-close-confirm");

		ipcMain.once("close-confirm-response", (event, choice: "save" | "discard" | "cancel") => {
			if (event.sender.id !== windowToClose?.webContents.id) return;
			isCloseConfirmInFlight = false;
			if (!windowToClose || windowToClose.isDestroyed()) return;

			if (choice === "save") {
				// Tell renderer to save the project, then close when done
				windowToClose.webContents.send("request-save-before-close");
				ipcMain.once("save-before-close-done", (event, shouldClose: boolean) => {
					if (event.sender.id !== windowToClose?.webContents.id) return;
					if (!shouldClose) return;
					forceCloseEditorWindow(windowToClose);
				});
			} else if (choice === "discard") {
				forceCloseEditorWindow(windowToClose);
			}
			// "cancel": flag reset, window stays open
		});
	});
}

function createSourceSelectorWindowWrapper() {
	sourceSelectorWindow = createSourceSelectorWindow();
	sourceSelectorWindow.on("closed", () => {
		sourceSelectorWindow = null;
	});
	return sourceSelectorWindow;
}

function createCountdownOverlayWindowWrapper() {
	if (countdownOverlayWindow && !countdownOverlayWindow.isDestroyed()) {
		return countdownOverlayWindow;
	}

	countdownOverlayWindow = createCountdownOverlayWindow();
	countdownOverlayWindow.on("closed", () => {
		countdownOverlayWindow = null;
	});
	return countdownOverlayWindow;
}

// Closing every window quits the app entirely (tray icon goes too).
// The in-app "Return to Recorder" button covers the editor → HUD round-trip,
// so closing the last window is an explicit "I'm done" signal.
app.on("window-all-closed", () => {
	app.quit();
});

app.on("activate", () => {
	// On OS X it's common to re-create a window in the app when the
	// dock icon is clicked and there are no other windows open.
	const hasVisibleWindow = BrowserWindow.getAllWindows().some((window) => {
		if (window.isDestroyed() || !window.isVisible()) {
			return false;
		}

		const url = window.webContents.getURL();
		const isCountdownOverlayWindow = url.includes("windowType=countdown-overlay");
		return !isCountdownOverlayWindow;
	});
	if (!hasVisibleWindow) {
		showMainWindow();
	}
});

app.on("will-quit", () => {
	unregisterAllGlobalShortcuts();
});

// Register all IPC handlers when app is ready
app.whenReady().then(async () => {
	// Force the app into "regular" activation policy so the Dock icon appears.
	// The HUD overlay (transparent + frameless + skipTaskbar) is the first
	// window we open, and AppKit otherwise classifies us as an accessory app.
	if (process.platform === "darwin") {
		app.dock?.show();
	}

	// Allow microphone/media/screen permission checks
	session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
		const allowed = [
			"media",
			"audioCapture",
			"microphone",
			"videoCapture",
			"camera",
			"screen",
			"display-capture",
		];
		return allowed.includes(permission);
	});

	session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
		const allowed = [
			"media",
			"audioCapture",
			"microphone",
			"videoCapture",
			"camera",
			"screen",
			"display-capture",
		];
		callback(allowed.includes(permission));
	});

	session.defaultSession.setDisplayMediaRequestHandler(
		(request, callback) => {
			const source = getSelectedDesktopSource();
			if (!request.videoRequested || !source) {
				callback({});
				return;
			}

			callback({
				video: source,
				...(request.audioRequested && process.platform === "win32" ? { audio: "loopback" } : {}),
			});
		},
		{ useSystemPicker: false },
	);

	// Request microphone permission from macOS. Screen Recording is requested
	// lazily from the source-picker action so the system prompt is not hidden
	// behind Inkast's source selector window.
	if (process.platform === "darwin") {
		const micStatus = systemPreferences.getMediaAccessStatus("microphone");
		if (micStatus !== "granted") {
			// Inkast fix: request mic access WITHOUT awaiting. Awaiting here blocks
			// the rest of app.whenReady() — including createWindow() at the very end
			// — until the user answers the macOS prompt, so NO window appears until
			// then (observed as 0 renderer/GPU helpers). The recording flow checks
			// and requests mic permission again when needed, so this is safe.
			systemPreferences.askForMediaAccess("microphone").catch(() => undefined);
		}
	}

	// Listen for HUD overlay quit event (macOS only)
	ipcMain.on("hud-overlay-close", () => {
		app.quit();
	});
	ipcMain.handle("set-locale", (_, locale: string) => {
		setMainLocale(locale);
		setupApplicationMenu();
		updateTrayMenu();
	});

	ipcMain.handle("update-global-shortcut", (_, binding: ShortcutBinding) => {
		const success = registerOpenAppShortcut(binding, showMainWindow);
		return { success };
	});

	createTray();
	updateTrayMenu();
	setupApplicationMenu();
	// Ensure recordings directory exists
	await ensureRecordingsDir();

	function switchToHudWrapper() {
		if (mainWindow) {
			isForceClosing = true;
			mainWindow.close();
			isForceClosing = false;
			mainWindow = null;
		}
		showMainWindow();
	}

	registerIpcHandlers(
		createEditorWindowWrapper,
		createSourceSelectorWindowWrapper,
		createCountdownOverlayWindowWrapper,
		() => mainWindow,
		() => sourceSelectorWindow,
		() => countdownOverlayWindow,
		(recording: boolean, sourceName: string) => {
			selectedSourceName = sourceName;
			if (!tray) createTray();
			updateTrayMenu(recording);
			if (!recording) {
				showMainWindow();
			}
		},
		switchToHudWrapper,
	);

	// Inkast 整合 · 成片编排:JobManager(移植自 video-factory/lib/jobs.mjs)驻留主进程,
	// 真实进度经 IPC(vf:jobUpdate)推给「成片」Tab。引擎 video-pipeline 保持外部路径
	// (INKAST_PIPELINE_ROOT / userData engine.json / 开发默认),不 vendor。server.mjs 退役。
	// Inkast 整合 · LLM 密钥:启动解密 keys.json → 注入 process.env。务必在 JobManager(spawn 引擎)/
	// AnalyzeService(fetch Claude)初始化之前 —— 两者都读 process.env,放这里下游零改动。见真端到端交接 任务 A。
	loadKeysIntoEnv(app);
	registerKeyHandlers(ipcMain, app);

	// Inkast 整合 · 本地选题池(cockpit-pool):vault 当日卡之上的本地增量层(状态流转 / 成片·拉片回填 /
	// 拉片注入卡)。主进程持久化(userData/cockpit-pool.json),渲染经 pool:* IPC 读写;成片完成由
	// JobManager 回写「已成稿」+ 产物。vault 仍只读(cockpit.ts 不变),池只存增量。见 §6.2。
	const topicPool = new TopicPoolStore(path.join(app.getPath("userData"), "cockpit-pool.json"));

	const jobManager = new JobManager({
		pipelineRoot: resolvePipelineRoot(app),
		dataDir: path.join(app.getPath("userData"), "video-factory"),
		// 成片完成回填:done 且带 sourceCardId 的任务 → 选题置「已成稿」(§5.4)。
		// 产物只挂真正的成片视频(artifacts 里可能混中间件/字幕);找不到视频就只改状态、不挂空路径。
		onComplete: (job) => {
			if (job.status !== "done" || !job.sourceCardId) return;
			// publish-ready 模式引擎按平台 emit 多条成片;回写全部(recordArtifact 按 path 去重),
			// 而非只挂第一条(否则徽标固定指向某个平台变体,review funnel F2)。找不到视频只改状态。
			const films = job.artifacts.filter((a) => /\.(mp4|mov|m4v)$/i.test(a));
			if (films.length) {
				for (const film of films) {
					topicPool.recordArtifact(
						job.sourceCardId,
						{ kind: "film", path: film, jobId: job.id, at: Date.now() },
						"已成稿",
					);
				}
			} else {
				topicPool.setStatus(job.sourceCardId, "已成稿");
			}
		},
		// 成片供应商显式锁定(用户在成片页选):非 auto 时给引擎注入 SLIDES_PROVIDER。
		slidesProvider: () => getSlidesProvider(app),
	});
	registerJobHandlers(ipcMain, jobManager, () => mainWindow);

	// 主线四·task 1:长任务终态(完成/待确认/失败)→ 系统通知 + Dock 角标(窗口不在前台时)。
	// 用「上次状态」去重:JobManager 对同一 job 反复 emit("update")(每个 stage 一次),只在状态
	// 真正跨入终态那一次提醒。窗口在前台时 notify 内部自动跳过(应内 Tab 角标负责)。
	const lastJobStatus = new Map<string, string>();
	jobManager.on("update", (job: Job) => {
		const prev = lastJobStatus.get(job.id);
		lastJobStatus.set(job.id, job.status);
		if (prev === job.status) return;
		const title = job.title || job.slug;
		if (job.status === "done")
			notifyTaskAttention(() => mainWindow, {
				title: mainT("common", "notify.produceDoneTitle"),
				body: mainT("common", "notify.produceDoneBody", { title }),
			});
		else if (job.status === "awaiting-confirm" || job.status === "awaiting-preview")
			notifyTaskAttention(() => mainWindow, {
				title: mainT("common", "notify.produceAwaitTitle"),
				body: mainT("common", "notify.produceAwaitBody", { title }),
			});
		else if (job.status === "failed")
			notifyTaskAttention(() => mainWindow, {
				title: mainT("common", "notify.produceFailedTitle"),
				body: mainT("common", "notify.produceFailedBody", { title }),
			});
	});
	// 主窗口重新获得焦点 → 清零「待关注」角标(用户已回到 App,旧账作废)。
	app.on("browser-window-focus", (_e, win) => {
		if (!win.isDestroyed() && isEditorWindow(win)) clearAttention();
	});

	registerTopicPoolHandlers(ipcMain, topicPool, () => mainWindow);
	// 成片供应商:读/存(userData/produce.json),渲染下拉选。
	ipcMain.handle("vf:getSlidesProvider", () => getSlidesProvider(app));
	ipcMain.handle("vf:setSlidesProvider", (_e, provider: SlidesProvider) => {
		saveSlidesProvider(app, provider);
		return { ok: true };
	});

	// Inkast 整合 · 驾驶舱:只读 KnowledgePlanet 每日选题 JSON(按路径,不复制 vault)。
	registerCockpitHandlers(ipcMain, app);

	// Inkast 整合 · 驾驶舱「关注」(Phase 2):收藏想拉片的视频(YouTube 频道自动列/单条贴链接),一键去拉片。
	registerFollowingHandlers(ipcMain, app);
	registerCommentsHandlers(ipcMain, app);

	// Inkast 整合 · 外部路径设置(负责人定调:别靠散落路径):引擎/发布/驾驶舱三条路径在 App 内可改。
	// 引擎根改后热更已构造的 JobManager(发布/驾驶舱每次请求都重解析配置,自动生效)。
	registerSettingsHandlers(
		ipcMain,
		app,
		() => mainWindow,
		(root) => jobManager.setPipelineRoot(root),
	);

	// Inkast 整合 · 资料库:统一列出 录屏/成片/拉片报告(按路径只读)。
	registerLibraryHandlers(ipcMain, app);

	// Inkast 整合 · 发布看板(扫 Publishing + 文件管理 + 一键送草稿)。
	registerPublishBoardHandlers(ipcMain, app);

	// Inkast 整合 · 导出备份(主线三):把 App 状态/配置(userData JSON)拷到选定目录(不含媒体/密钥)。
	registerBackupHandlers(ipcMain, app, () => mainWindow);

	// Inkast 整合 · 视频工作流桥接(POC):Inkast 录屏 → 110 视频剪辑项目(建项目+复制素材+启动提示词)。
	registerVideoflowHandlers(ipcMain, app);

	// Inkast 整合 · 图文初稿生成(主线一·图文线):选题+我的观点 → LLM 改写公众号图文,不碰引擎。
	registerArticleHandlers(ipcMain, app);

	// Inkast 整合 · 数字人(成片·云 API):口播稿 + 已注册形象/音色 → 云(HeyGen 内置 / 通用 HTTP 适配器)
	// → MP4。Apple Silicon 本地跑不了开源口型模型,走成熟云;provider 适配器架构不锁死一家。
	const avatarManager = new AvatarManager(app);
	registerAvatarHandlers(ipcMain, avatarManager, () => mainWindow);

	// Inkast 整合 · 分析(拉片):ffmpeg 抽帧 + Claude vision,进度走 analyze:update。
	// 互喂闭环:报告写完→把「关键发现 ×5」回喂选题池成为新候选卡(§4),解析不到则不注入(不造假)。
	registerAnalyzeHandlers(
		ipcMain,
		app,
		() => mainWindow,
		(job, report) => {
			for (const card of findingsToTopicCards(report, job.slug, job.title)) {
				topicPool.addInjected(card, `拉片:${job.slug}`);
			}
		},
		// 主线四·task 1:拉片终态 → 系统通知 + Dock 角标(窗口不在前台时)。
		(job) => {
			const title = job.title || job.slug;
			if (job.phase === "done")
				notifyTaskAttention(() => mainWindow, {
					title: mainT("common", "notify.analyzeDoneTitle"),
					body: mainT("common", "notify.analyzeDoneBody", { title }),
				});
			else if (job.phase === "error")
				notifyTaskAttention(() => mainWindow, {
					title: mainT("common", "notify.analyzeFailedTitle"),
					body: mainT("common", "notify.analyzeFailedBody", { title }),
				});
		},
	);

	await loadAndRegisterGlobalShortcut(showMainWindow);

	// Inkast: ⌘⇧C toggles the live camera preview. The preview window is content
	// protected and excluded from screen capture; the final video uses the
	// independent webcam recording track so mouse-follow zoom cannot drag the
	// camera image out of frame.
	globalShortcut.register("CommandOrControl+Shift+C", () => {
		toggleCameraOverlayWindow();
	});
	// HUD webcam button → same toggle, so the button and ⌘⇧C coexist.
	ipcMain.on("toggle-camera-overlay", () => {
		toggleCameraOverlayWindow();
	});

	// Inkast: 框选区域录制 — open the drag-select overlay on the given display and
	// resolve with the normalized region (or null if cancelled). We still capture
	// the full display (方案 A); the editor applies this region as the crop on load.
	let pendingRegionResolve: ((region: CropRegion | null) => void) | null = null;
	ipcMain.handle("open-region-selector", (_event, displayId: string) => {
		return new Promise<CropRegion | null>((resolve) => {
			if (pendingRegionResolve) {
				pendingRegionResolve(null);
			}
			pendingRegionResolve = resolve;
			const win = createRegionSelectorWindow(displayId);
			win.on("closed", () => {
				if (pendingRegionResolve === resolve) {
					resolve(null);
					pendingRegionResolve = null;
				}
			});
		});
	});
	ipcMain.on("region-selector-confirm", (_event, region: CropRegion) => {
		setSelectedRegionValue(region);
		if (pendingRegionResolve) {
			pendingRegionResolve(region);
			pendingRegionResolve = null;
		}
		closeRegionSelectorWindow();
	});
	ipcMain.on("region-selector-cancel", () => {
		if (pendingRegionResolve) {
			pendingRegionResolve(null);
			pendingRegionResolve = null;
		}
		closeRegionSelectorWindow();
	});

	// Inkast: 边录边画 drawing overlay shortcuts.
	globalShortcut.register("CommandOrControl+Shift+D", () => {
		toggleDrawOverlayWindow();
	});
	globalShortcut.register("CommandOrControl+Shift+E", () => {
		toggleDrawOverlayPassthrough();
	});
	globalShortcut.register("CommandOrControl+Shift+X", () => {
		clearDrawOverlay();
	});
	// Inkast: ⌘⇧T toggles the content-protected teleprompter (visible to you, not recorded).
	globalShortcut.register("CommandOrControl+Shift+T", () => {
		togglePrompterWindow();
	});

	// Inkast 整合:启动即进 5-Tab 工作台(编辑器窗口 windowType=editor)。
	// 录屏器不再是首屏 —— 它降为「录制」Tab 空状态的「录制新视频」动作
	// (→ start-new-recording → switchToHud → HUD 录屏器 → 录完 → switchToEditor 回工作台)。
	// 注意:createWindow()(=HUD)保持不变,供 switchToHud/showMainWindow 复用,故"返回录屏"链路不破。
	createEditorWindowWrapper();
});
