import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { type CSSProperties, useEffect, useRef, useState } from "react";

// 边录边画 drawing overlay (Inkast · Phase 1 core / 方案 A).
// Full-screen transparent Excalidraw canvas on an always-on-top window. Strokes
// are drawn live and captured by display recording. The main process flips the
// window between draw (interactive) and passthrough (click-through) modes via
// ⌘⇧E; ⌘⇧X clears; ⌘⇧D toggles the whole overlay.

type ExcalidrawApi = { updateScene: (scene: { elements?: readonly unknown[] }) => void } | null;

type Bridge = {
	onDrawOverlayMode?: (cb: (m: "draw" | "passthrough") => void) => () => void;
	onDrawOverlayClear?: (cb: () => void) => () => void;
};
function getBridge(): Bridge | undefined {
	return (window as unknown as { electronAPI?: Bridge }).electronAPI;
}

const pillStyle: CSSProperties = {
	position: "fixed",
	bottom: 14,
	left: "50%",
	transform: "translateX(-50%)",
	background: "rgba(0,0,0,0.72)",
	color: "#fff",
	padding: "6px 14px",
	borderRadius: 999,
	font: "12px -apple-system, system-ui, sans-serif",
	whiteSpace: "nowrap",
	pointerEvents: "none",
	transition: "opacity .3s",
	zIndex: 10,
};

export function DrawOverlay() {
	const apiRef = useRef<ExcalidrawApi>(null);
	const [mode, setMode] = useState<"draw" | "passthrough">("draw");
	const [pillVisible, setPillVisible] = useState(true);

	useEffect(() => {
		const b = getBridge();
		const offMode = b?.onDrawOverlayMode?.((m) => setMode(m));
		const offClear = b?.onDrawOverlayClear?.(() => apiRef.current?.updateScene({ elements: [] }));
		return () => {
			offMode?.();
			offClear?.();
		};
	}, []);

	// Flash the mode pill on each change, then fade it so it stays out of the recording.
	useEffect(() => {
		setPillVisible(true);
		const t = setTimeout(() => setPillVisible(false), 2500);
		return () => clearTimeout(t);
	}, [mode]);

	return (
		<div style={{ position: "fixed", inset: 0, background: "transparent" }}>
			<Excalidraw
				excalidrawAPI={(api) => {
					apiRef.current = api as unknown as ExcalidrawApi;
				}}
				initialData={{
					appState: {
						viewBackgroundColor: "transparent",
						currentItemStrokeColor: "#ff3b30",
						currentItemStrokeWidth: 2,
					},
				}}
				UIOptions={{
					canvasActions: {
						loadScene: false,
						saveToActiveFile: false,
						saveAsImage: false,
						export: false,
						toggleTheme: false,
						changeViewBackgroundColor: false,
					},
				}}
			/>
			<div style={{ ...pillStyle, opacity: pillVisible ? 1 : 0 }}>
				{mode === "draw"
					? "✏️ 绘制中 · ⌘⇧E 穿透 · ⌘⇧X 清屏 · ⌘⇧D 收起"
					: "🖱 穿透中(可操作下方 App) · ⌘⇧E 回到绘制"}
			</div>
			<style>{`
				html, body, #root { margin: 0; width: 100%; height: 100%; background: transparent !important; overflow: hidden; }
				/* Transparent canvas so the desktop/recording shows through; keep the
				   Excalidraw toolbar/panels (their own backgrounds) visible. */
				.excalidraw { background: transparent !important; --island-bg-color: rgba(255,255,255,0.96); }
			`}</style>
		</div>
	);
}
