import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { BrowserWindow, ipcMain, screen } from "electron";
import {
	getCameraOverlaySettingsSnapshot,
	getCameraPositionMode,
	setCameraOverlayLiveMetricsProvider,
	setCameraPositionMode,
	updateCameraOverlaySettings,
} from "./cameraOverlaySettings";
import { protectCameraPreviewFromScreenCapture } from "./captureProtection";
import { getSelectedDesktopSource } from "./ipc/handlers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const APP_ROOT = path.join(__dirname, "..");
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const RENDERER_DIST = path.join(APP_ROOT, "dist");
const HEADLESS = process.env["HEADLESS"] === "true";

// Asset base URL for renderer (wallpapers, etc.). Packaged: extraResources copies
// public/wallpapers -> resources/wallpapers. Unpackaged: <appRoot>/public/.
const ASSET_BASE_DIR = process.defaultApp
	? path.join(__dirname, "..", "public")
	: process.resourcesPath;
const ASSET_BASE_URL_ARG = `--asset-base-url=${pathToFileURL(`${ASSET_BASE_DIR}${path.sep}`).toString()}`;

let hudOverlayWindow: BrowserWindow | null = null;

ipcMain.on("hud-overlay-hide", () => {
	if (hudOverlayWindow && !hudOverlayWindow.isDestroyed()) {
		hudOverlayWindow.minimize();
	}
});

ipcMain.on("hud-overlay-ignore-mouse-events", (_event, ignore: boolean) => {
	if (hudOverlayWindow && !hudOverlayWindow.isDestroyed()) {
		hudOverlayWindow.setIgnoreMouseEvents(ignore, { forward: true });
	}
});

ipcMain.on("hud-overlay-move-by", (_event, deltaX: number, deltaY: number) => {
	if (
		!hudOverlayWindow ||
		hudOverlayWindow.isDestroyed() ||
		!Number.isFinite(deltaX) ||
		!Number.isFinite(deltaY)
	) {
		return;
	}

	const [x, y] = hudOverlayWindow.getPosition();
	hudOverlayWindow.setPosition(Math.round(x + deltaX), Math.round(y + deltaY), false);
});

/**
 * Creates the always-on-top HUD overlay window centred at the bottom of the
 * primary display. The window is frameless, transparent, and follows the user
 * across macOS Spaces so it is never lost when switching virtual desktops.
 */
export function createHudOverlayWindow(): BrowserWindow {
	const primaryDisplay = screen.getPrimaryDisplay();
	const { workArea } = primaryDisplay;

	const windowWidth = 600;
	const windowHeight = 160;

	const x = Math.floor(workArea.x + (workArea.width - windowWidth) / 2);
	const y = Math.floor(workArea.y + workArea.height - windowHeight - 5);

	const win = new BrowserWindow({
		width: windowWidth,
		height: windowHeight,
		minWidth: 600,
		maxWidth: 600,
		minHeight: 160,
		maxHeight: 160,
		x: x,
		y: y,
		frame: false,
		transparent: true,
		resizable: false,
		alwaysOnTop: true,
		skipTaskbar: true,
		hasShadow: false,
		show: false, // shown via ready-to-show to avoid black rectangle flash
		webPreferences: {
			preload: path.join(__dirname, "preload.mjs"),
			additionalArguments: [ASSET_BASE_URL_ARG],
			nodeIntegration: false,
			contextIsolation: true,
			backgroundThrottling: false,
		},
	});
	win.setIgnoreMouseEvents(true, { forward: true });

	// Follow the user across macOS Spaces (virtual desktops).
	// Without this the HUD stays pinned to the Space it was first opened on.
	if (process.platform === "darwin") {
		win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
	}

	// Show only once content is painted — prevents the black rectangle flash
	// that appears when a transparent window is shown before its first paint.
	win.once("ready-to-show", () => {
		if (!HEADLESS) win.show();
	});

	win.webContents.on("did-finish-load", () => {
		win?.webContents.send("main-process-message", new Date().toLocaleString());
	});

	hudOverlayWindow = win;

	win.on("closed", () => {
		if (hudOverlayWindow === win) {
			hudOverlayWindow = null;
		}
	});

	if (VITE_DEV_SERVER_URL) {
		win.loadURL(VITE_DEV_SERVER_URL + "?windowType=hud-overlay");
	} else {
		win.loadFile(path.join(RENDERER_DIST, "index.html"), {
			query: { windowType: "hud-overlay" },
		});
	}

	return win;
}

/**
 * Creates the main editor window. Starts maximised with a hidden title bar on
 * macOS. This window is not always-on-top and appears in the taskbar/dock.
 */
export function createEditorWindow(): BrowserWindow {
	const isMac = process.platform === "darwin";

	const win = new BrowserWindow({
		width: 1200,
		height: 800,
		minWidth: 800,
		minHeight: 600,
		...(isMac && {
			titleBarStyle: "hiddenInset",
			trafficLightPosition: { x: 12, y: 12 },
		}),
		transparent: false,
		resizable: true,
		alwaysOnTop: false,
		skipTaskbar: false,
		title: "Inkast",
		backgroundColor: "#09090b",
		show: false, // shown via ready-to-show to avoid white flash on first load
		webPreferences: {
			preload: path.join(__dirname, "preload.mjs"),
			additionalArguments: [ASSET_BASE_URL_ARG],
			nodeIntegration: false,
			contextIsolation: true,
			webSecurity: false,
			backgroundThrottling: false,
		},
	});

	// Maximize the window by default
	win.maximize();

	// Show only once content is painted — prevents white flash on cold Vite start.
	win.once("ready-to-show", () => {
		if (!HEADLESS) win.show();
	});

	// Inject dark background before any React paint so the sub-titlebar area
	// never flashes white even on the very first cold Vite load.
	win.webContents.on("dom-ready", () => {
		win.webContents.insertCSS("html, body, #root { background: #09090b !important; }").catch(() => {
			// Best-effort cosmetic; ignore if the page is mid-teardown.
		});
	});

	win.webContents.on("did-finish-load", () => {
		win?.webContents.send("main-process-message", new Date().toLocaleString());
	});

	if (VITE_DEV_SERVER_URL) {
		win.loadURL(VITE_DEV_SERVER_URL + "?windowType=editor");
	} else {
		win.loadFile(path.join(RENDERER_DIST, "index.html"), {
			query: { windowType: "editor" },
		});
	}

	return win;
}

/**
 * Creates the floating source-selector window used to pick a screen or window
 * to record. Frameless, transparent, and follows the user across macOS Spaces.
 */
export function createSourceSelectorWindow(): BrowserWindow {
	const { width, height } = screen.getPrimaryDisplay().workAreaSize;

	const win = new BrowserWindow({
		width: 620,
		height: 420,
		minHeight: 350,
		maxHeight: 500,
		x: Math.round((width - 620) / 2),
		y: Math.round((height - 420) / 2),
		frame: false,
		resizable: false,
		alwaysOnTop: true,
		transparent: true,
		backgroundColor: "#00000000",
		webPreferences: {
			preload: path.join(__dirname, "preload.mjs"),
			additionalArguments: [ASSET_BASE_URL_ARG],
			nodeIntegration: false,
			contextIsolation: true,
		},
	});

	// Follow the user across macOS Spaces so the selector appears on the
	// active desktop regardless of where the HUD was originally opened.
	if (process.platform === "darwin") {
		win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
	}

	if (VITE_DEV_SERVER_URL) {
		win.loadURL(VITE_DEV_SERVER_URL + "?windowType=source-selector");
	} else {
		win.loadFile(path.join(RENDERER_DIST, "index.html"), {
			query: { windowType: "source-selector" },
		});
	}

	return win;
}

/**
 * Creates a centered transparent countdown overlay window that sits above the
 * HUD while recording pre-roll is running.
 */
export function createCountdownOverlayWindow(): BrowserWindow {
	const { workArea } = screen.getPrimaryDisplay();
	const overlayWidth = 420;
	const overlayHeight = 260;

	const win = new BrowserWindow({
		width: overlayWidth,
		height: overlayHeight,
		minWidth: overlayWidth,
		maxWidth: overlayWidth,
		minHeight: overlayHeight,
		maxHeight: overlayHeight,
		x: Math.round(workArea.x + (workArea.width - overlayWidth) / 2),
		y: Math.round(workArea.y + (workArea.height - overlayHeight) / 2),
		frame: false,
		resizable: false,
		alwaysOnTop: true,
		skipTaskbar: true,
		focusable: false,
		transparent: true,
		backgroundColor: "#00000000",
		hasShadow: false,
		show: false,
		webPreferences: {
			preload: path.join(__dirname, "preload.mjs"),
			additionalArguments: [ASSET_BASE_URL_ARG],
			nodeIntegration: false,
			contextIsolation: true,
			backgroundThrottling: false,
		},
	});

	win.setIgnoreMouseEvents(true);

	if (process.platform === "darwin") {
		win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
	}

	if (VITE_DEV_SERVER_URL) {
		win.loadURL(VITE_DEV_SERVER_URL + "?windowType=countdown-overlay");
	} else {
		win.loadFile(path.join(RENDERER_DIST, "index.html"), {
			query: { windowType: "countdown-overlay" },
		});
	}

	return win;
}

// ───────────────────────────── Camera overlay (Inkast) ─────────────────────────────
// 实时摄像头预览窗:透明、置顶、无边框的小窗,显示本机摄像头画面。
// - 整窗 `-webkit-app-region: drag` → 可直接拖动定位。
// - 右下角手柄 → `camera-overlay-resize-to` → 主进程改 setBounds(保持正方形)。
// - shape/size 写入 cameraOverlaySettings,录制保存时映射到独立 webcam track。
// 该窗口 content-protected,只做预览,不会被屏幕捕获本体录进去。
let cameraOverlayWindow: BrowserWindow | null = null;

const CAMERA_OVERLAY_MIN = 140;
// 上限 720→1200:让录制前能把摄像头预览窗拖得更大,映射出的成片摄像头也更大(配合预设上限 50→100)。
const CAMERA_OVERLAY_MAX = 1200;

ipcMain.on("camera-overlay-close", () => {
	if (cameraOverlayWindow && !cameraOverlayWindow.isDestroyed()) {
		cameraOverlayWindow.close();
	}
});

ipcMain.on("camera-overlay-settings-update", (_event, update: { shape?: unknown }) => {
	updateCameraOverlaySettings(update);
});

// 摄像头位置模式(录制前 HUD 二选一:fixed 固定 / follow 跟随)。
ipcMain.on("set-camera-position-mode", (_event, mode: unknown) => {
	if (mode === "fixed" || mode === "follow") setCameraPositionMode(mode);
});
ipcMain.handle("get-camera-position-mode", () => getCameraPositionMode());

ipcMain.handle("get-camera-overlay-settings", () => {
	return getCameraOverlaySettingsSnapshot();
});

function syncCameraOverlayWindowMetrics(win: BrowserWindow): void {
	const bounds = win.getBounds();
	const display = screen.getDisplayMatching(bounds);
	updateCameraOverlaySettings({
		sizePx: bounds.width,
		displaySize: {
			width: display.bounds.width,
			height: display.bounds.height,
		},
		// Inkast: 记录叠加窗中心相对该显示器的归一化位置 → 录制后编辑器把画中画放到这。
		position: {
			cx: (bounds.x + bounds.width / 2 - display.bounds.x) / display.bounds.width,
			cy: (bounds.y + bounds.height / 2 - display.bounds.y) / display.bounds.height,
		},
	});
}

// Inkast: 让"保存录制会话时读取叠加设置"先从实时窗口刷新一次 size/position。
// 这样即使录制过程中的 move/resize 事件没把状态同步上,保存时也会按窗口的最终
// 实际位置/大小算 —— 解决"录制中调整不被成品记录、只用录制前状态"的问题。
setCameraOverlayLiveMetricsProvider(() => {
	if (cameraOverlayWindow && !cameraOverlayWindow.isDestroyed()) {
		syncCameraOverlayWindowMetrics(cameraOverlayWindow);
	}
});

// Square resize driven by the renderer's corner handle. Keeps the top-left
// corner fixed so the window grows toward the handle (bottom-right).
ipcMain.on("camera-overlay-resize-to", (_event, size: number) => {
	if (!cameraOverlayWindow || cameraOverlayWindow.isDestroyed() || !Number.isFinite(size)) {
		return;
	}
	const clamped = Math.round(Math.max(CAMERA_OVERLAY_MIN, Math.min(CAMERA_OVERLAY_MAX, size)));
	const [x, y] = cameraOverlayWindow.getPosition();
	cameraOverlayWindow.setBounds({ x, y, width: clamped, height: clamped });
	syncCameraOverlayWindowMetrics(cameraOverlayWindow);
});

// Inkast: keep the HUD webcam button icon in sync with the overlay's open state,
// whether it's toggled by the button or by the ⌘⇧C global shortcut.
function broadcastCameraOverlayState(open: boolean): void {
	for (const w of BrowserWindow.getAllWindows()) {
		if (!w.isDestroyed()) w.webContents.send("camera-overlay-state", open);
	}
}

export function createCameraOverlayWindow(): BrowserWindow {
	// Open on the screen being recorded (same as the draw canvas), not always primary.
	const targetDisplay = getOverlayTargetDisplay();
	const { workArea, bounds } = targetDisplay;
	const remembered = getCameraOverlaySettingsSnapshot();
	const size = Math.round(
		Math.max(CAMERA_OVERLAY_MIN, Math.min(CAMERA_OVERLAY_MAX, remembered.sizePx)),
	);
	updateCameraOverlaySettings({
		sizePx: size,
		displaySize: { width: bounds.width, height: bounds.height },
	});
	const margin = 24;
	// Default position: bottom-right, sitting above where the HUD lives.
	const x = Math.floor(workArea.x + workArea.width - size - margin);
	const y = Math.floor(workArea.y + workArea.height - size - margin - 180);
	// Inkast: 记录默认位置(归一化),这样即使用户不拖动,编辑器也精确对齐录制时的位置。
	updateCameraOverlaySettings({
		position: {
			cx: (x + size / 2 - bounds.x) / bounds.width,
			cy: (y + size / 2 - bounds.y) / bounds.height,
		},
	});

	const win = new BrowserWindow({
		width: size,
		height: size,
		x: x,
		y: y,
		frame: false,
		transparent: true,
		resizable: false, // custom corner-handle resize via IPC (avoids edge/drag conflicts)
		alwaysOnTop: true,
		skipTaskbar: true,
		hasShadow: false,
		show: false, // shown on ready-to-show to avoid a transparent-window black flash
		webPreferences: {
			preload: path.join(__dirname, "preload.mjs"),
			additionalArguments: [ASSET_BASE_URL_ARG],
			nodeIntegration: false,
			contextIsolation: true,
			backgroundThrottling: false,
		},
	});

	// Preview-only: the exported webcam layer comes from the independent webcam
	// recording track. Keeping this window out of screen capture prevents mouse
	// zoom/pan from dragging a baked-in camera image off canvas.
	protectCameraPreviewFromScreenCapture(win);

	if (process.platform === "darwin") {
		win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
	}
	win.on("move", () => syncCameraOverlayWindowMetrics(win));

	win.once("ready-to-show", () => {
		if (!HEADLESS) win.show();
		broadcastCameraOverlayState(true);
	});

	cameraOverlayWindow = win;
	win.on("closed", () => {
		if (cameraOverlayWindow === win) cameraOverlayWindow = null;
		broadcastCameraOverlayState(false);
	});

	if (VITE_DEV_SERVER_URL) {
		win.loadURL(VITE_DEV_SERVER_URL + "?windowType=camera-overlay");
	} else {
		win.loadFile(path.join(RENDERER_DIST, "index.html"), {
			query: { windowType: "camera-overlay" },
		});
	}

	return win;
}

/** Toggle the live camera overlay on/off (bound to a global shortcut; HUD button later). */
export function toggleCameraOverlayWindow(): void {
	if (cameraOverlayWindow && !cameraOverlayWindow.isDestroyed()) {
		cameraOverlayWindow.close();
	} else {
		createCameraOverlayWindow();
	}
}

// ───────────────────────────── Draw overlay (Inkast · 边录边画核心) ─────────────────────────────
// 全屏透明置顶的 Excalidraw 画布:边录屏边画箭头/框/字做讲解,笔迹被整屏捕获录进视频(方案 A)。
// 两种模式:
//   • 绘制模式  → 窗口接收鼠标,在画布上画(setIgnoreMouseEvents false)
//   • 穿透模式  → 鼠标穿透到下面的 App,笔迹仍可见(setIgnoreMouseEvents true,{forward})
// 全局快捷键:⌘⇧D 开关画布 · ⌘⇧E 绘制⇄穿透 · ⌘⇧X 清屏。
let drawOverlayWindow: BrowserWindow | null = null;
let drawOverlayPassthrough = false;

ipcMain.on("draw-overlay-close", () => {
	if (drawOverlayWindow && !drawOverlayWindow.isDestroyed()) {
		drawOverlayWindow.close();
	}
});

// Renderer can also request a mode (e.g. a future on-canvas button).
ipcMain.on("draw-overlay-set-passthrough", (_event, passthrough: boolean) => {
	setDrawOverlayPassthrough(Boolean(passthrough));
});

function setDrawOverlayPassthrough(passthrough: boolean): void {
	if (!drawOverlayWindow || drawOverlayWindow.isDestroyed()) return;
	drawOverlayPassthrough = passthrough;
	drawOverlayWindow.setIgnoreMouseEvents(passthrough, { forward: true });
	drawOverlayWindow.webContents.send("draw-overlay-mode", passthrough ? "passthrough" : "draw");
}

/**
 * The display an overlay should cover: the screen currently being recorded (so
 * "边录边画" works on whichever monitor you capture), else the screen under the
 * cursor, else the primary display. Fixes the bug where the canvas always opened
 * on the primary screen regardless of which display was being recorded.
 */
function getOverlayTargetDisplay() {
	const recordedDisplayId = getSelectedDesktopSource()?.display_id;
	if (recordedDisplayId) {
		const match = screen.getAllDisplays().find((d) => String(d.id) === String(recordedDisplayId));
		if (match) return match;
	}
	try {
		return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
	} catch {
		return screen.getPrimaryDisplay();
	}
}

export function createDrawOverlayWindow(): BrowserWindow {
	const { workArea } = getOverlayTargetDisplay();

	const win = new BrowserWindow({
		x: workArea.x,
		y: workArea.y,
		width: workArea.width,
		height: workArea.height,
		frame: false,
		transparent: true,
		resizable: false,
		alwaysOnTop: true,
		skipTaskbar: true,
		hasShadow: false,
		show: false,
		webPreferences: {
			preload: path.join(__dirname, "preload.mjs"),
			additionalArguments: [ASSET_BASE_URL_ARG],
			nodeIntegration: false,
			contextIsolation: true,
			backgroundThrottling: false,
		},
	});

	// Start in draw mode (interactive). ⌘⇧E flips to passthrough.
	drawOverlayPassthrough = false;
	win.setIgnoreMouseEvents(false);

	if (process.platform === "darwin") {
		win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
	}

	win.once("ready-to-show", () => {
		if (!HEADLESS) win.show();
	});

	drawOverlayWindow = win;
	win.on("closed", () => {
		if (drawOverlayWindow === win) drawOverlayWindow = null;
	});

	if (VITE_DEV_SERVER_URL) {
		win.loadURL(VITE_DEV_SERVER_URL + "?windowType=draw-overlay");
	} else {
		win.loadFile(path.join(RENDERER_DIST, "index.html"), {
			query: { windowType: "draw-overlay" },
		});
	}

	return win;
}

/** ⌘⇧D — toggle the drawing canvas on/off. */
export function toggleDrawOverlayWindow(): void {
	if (drawOverlayWindow && !drawOverlayWindow.isDestroyed()) {
		drawOverlayWindow.close();
	} else {
		createDrawOverlayWindow();
	}
}

/** ⌘⇧E — flip between draw and click-through (passthrough) modes. */
export function toggleDrawOverlayPassthrough(): void {
	if (!drawOverlayWindow || drawOverlayWindow.isDestroyed()) return;
	setDrawOverlayPassthrough(!drawOverlayPassthrough);
}

/** ⌘⇧X — clear all strokes on the canvas. */
export function clearDrawOverlay(): void {
	if (drawOverlayWindow && !drawOverlayWindow.isDestroyed()) {
		drawOverlayWindow.webContents.send("draw-overlay-clear");
	}
}

// ───────────────────────────── Region selector / 框选区域 (Inkast · Phase 3) ─────────────────────────────
// A full-display transparent overlay shown BEFORE recording so the user can drag a
// rectangle. It posts the normalized region back via "region-selector-confirm"; main.ts
// stores it and the editor applies it as the crop on load. We still capture the whole
// display (方案 A) — this overlay only defines the crop, and it is not in the recording.
let regionSelectorWindow: BrowserWindow | null = null;

export function createRegionSelectorWindow(displayId: string): BrowserWindow {
	const display =
		screen.getAllDisplays().find((d) => String(d.id) === String(displayId)) ??
		screen.getPrimaryDisplay();
	// Full bounds (not workArea) so the overlay's coordinates line up 1:1 with the
	// full-display capture — the menu-bar strip is part of both.
	const { bounds } = display;

	const win = new BrowserWindow({
		x: bounds.x,
		y: bounds.y,
		width: bounds.width,
		height: bounds.height,
		frame: false,
		transparent: true,
		resizable: false,
		movable: false,
		fullscreenable: false,
		alwaysOnTop: true,
		skipTaskbar: true,
		hasShadow: false,
		show: false,
		webPreferences: {
			preload: path.join(__dirname, "preload.mjs"),
			additionalArguments: [ASSET_BASE_URL_ARG],
			nodeIntegration: false,
			contextIsolation: true,
			backgroundThrottling: false,
		},
	});

	win.setAlwaysOnTop(true, "screen-saver");
	if (process.platform === "darwin") {
		win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
	}

	win.once("ready-to-show", () => {
		if (!HEADLESS) {
			win.show();
			win.focus();
		}
	});

	regionSelectorWindow = win;
	win.on("closed", () => {
		if (regionSelectorWindow === win) regionSelectorWindow = null;
	});

	if (VITE_DEV_SERVER_URL) {
		win.loadURL(VITE_DEV_SERVER_URL + "?windowType=region-selector");
	} else {
		win.loadFile(path.join(RENDERER_DIST, "index.html"), {
			query: { windowType: "region-selector" },
		});
	}

	return win;
}

export function closeRegionSelectorWindow(): void {
	if (regionSelectorWindow && !regionSelectorWindow.isDestroyed()) {
		regionSelectorWindow.close();
	}
	regionSelectorWindow = null;
}

// ───────────────────────────── Prompter / 提词窗 (Inkast · Phase 3) ─────────────────────────────
// Content-protected teleprompter: visible to the user, but setContentProtection(true)
// (macOS NSWindowSharingNone) keeps it OUT of the screen recording. ⌘⇧T toggles it.
let prompterWindow: BrowserWindow | null = null;
// 漏斗预填(§5.1):驾驶舱选题「去录屏」时把口播稿暂存这里;提词窗 mounted 主动来取,
// 已开则直接推送。提词窗内容保护、不进录屏,所以预填的稿子也只有用户可见。
let pendingPrompterScript = "";

// Keep the HUD prompter button icon in sync with the prompter's open state,
// whether it's toggled by the button, the ✕, or the ⌘⇧T global shortcut.
function broadcastPrompterState(open: boolean): void {
	for (const w of BrowserWindow.getAllWindows()) {
		if (!w.isDestroyed()) w.webContents.send("prompter-state", open);
	}
}

ipcMain.on("prompter-close", () => {
	if (prompterWindow && !prompterWindow.isDestroyed()) {
		prompterWindow.close();
	}
});

ipcMain.on("prompter-toggle", () => {
	togglePrompterWindow();
});

// 漏斗预填:渲染端把选题口播稿塞进提词窗(没开就开,已开就立即更新)。
ipcMain.on("prompter-set-script", (_e, text: unknown) => {
	setPrompterScript(typeof text === "string" ? text : "");
});
// 提词窗 mounted 时来取暂存稿(避免开窗时机竞态)。
ipcMain.handle("prompter-get-script", () => pendingPrompterScript);

export function createPrompterWindow(): BrowserWindow {
	const { workArea } = getOverlayTargetDisplay();
	const width = 540;
	const height = 360;

	const win = new BrowserWindow({
		width,
		height,
		x: Math.floor(workArea.x + workArea.width - width - 32),
		y: Math.floor(workArea.y + 80),
		frame: false,
		transparent: true,
		resizable: true,
		alwaysOnTop: true,
		skipTaskbar: true,
		hasShadow: false,
		show: false,
		webPreferences: {
			preload: path.join(__dirname, "preload.mjs"),
			additionalArguments: [ASSET_BASE_URL_ARG],
			nodeIntegration: false,
			contextIsolation: true,
			backgroundThrottling: false,
		},
	});

	// The whole point: visible to the user, excluded from screen capture.
	win.setContentProtection(true);

	if (process.platform === "darwin") {
		win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
	}

	win.once("ready-to-show", () => {
		if (!HEADLESS) win.show();
	});

	prompterWindow = win;
	broadcastPrompterState(true);
	win.on("closed", () => {
		if (prompterWindow === win) prompterWindow = null;
		broadcastPrompterState(false);
	});

	if (VITE_DEV_SERVER_URL) {
		win.loadURL(`${VITE_DEV_SERVER_URL}?windowType=prompter`);
	} else {
		win.loadFile(path.join(RENDERER_DIST, "index.html"), {
			query: { windowType: "prompter" },
		});
	}

	return win;
}

/** ⌘⇧T — toggle the content-protected teleprompter. */
export function togglePrompterWindow(): void {
	if (prompterWindow && !prompterWindow.isDestroyed()) {
		prompterWindow.close();
	} else {
		createPrompterWindow();
	}
}

/** 漏斗预填:把选题口播稿装进提词窗(§5.1)。未开则开窗,已开则立即推送并聚焦。 */
export function setPrompterScript(text: string): void {
	pendingPrompterScript = text;
	if (prompterWindow && !prompterWindow.isDestroyed()) {
		prompterWindow.webContents.send("prompter-script", text);
		if (!HEADLESS) {
			prompterWindow.show();
			prompterWindow.focus();
		}
	} else {
		createPrompterWindow(); // 提词窗 mounted 后会主动来取 pendingPrompterScript
	}
}
