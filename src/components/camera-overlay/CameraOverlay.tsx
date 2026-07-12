import { type CSSProperties, useEffect, useRef, useState } from "react";

// Live camera preview (Inkast). A transparent, always-on-top window showing the
// local webcam for the presenter. The Electron window is content-protected so it
// stays out of screen capture; the editor/export webcam layer comes from the
// independent webcam recording track. Drag the window to move it
// (-webkit-app-region: drag); drag the bottom-right grip to resize. Controls
// appear for a few seconds on open and whenever you hover, then fade.

type CameraOverlayApi = {
	closeCameraOverlay?: () => void;
	resizeCameraOverlay?: (size: number) => void;
	updateCameraOverlaySettings?: (settings: { shape?: "circle" | "square" }) => void;
	getCameraOverlaySettings?: () => Promise<{
		shape: "circle" | "square";
		sizePx: number;
		displaySize: { width: number; height: number };
		recording: { maskShape: "circle" | "square"; sizePreset: number };
	}>;
};
function getApi(): CameraOverlayApi | undefined {
	return (window as unknown as { electronAPI?: CameraOverlayApi }).electronAPI;
}

// `-webkit-app-region` isn't in the standard CSSProperties type — cast locally.
const DRAG = { WebkitAppRegion: "drag" } as CSSProperties;
const NO_DRAG = { WebkitAppRegion: "no-drag" } as CSSProperties;

const btnStyle: CSSProperties = {
	...NO_DRAG,
	width: 30,
	height: 30,
	borderRadius: 15,
	border: "none",
	background: "rgba(0,0,0,0.62)",
	color: "#fff",
	fontSize: 15,
	lineHeight: "30px",
	textAlign: "center",
	cursor: "pointer",
	padding: 0,
};

export function CameraOverlay() {
	const videoRef = useRef<HTMLVideoElement>(null);
	const [shape, setShape] = useState<"circle" | "square">("circle");
	const [mirror, setMirror] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [hovered, setHovered] = useState(false);
	// Controls are shown on open (discoverable) then fade; hovering brings them back.
	const [introVisible, setIntroVisible] = useState(true);

	useEffect(() => {
		const t = setTimeout(() => setIntroVisible(false), 5000);
		return () => clearTimeout(t);
	}, []);

	useEffect(() => {
		let cancelled = false;
		getApi()
			?.getCameraOverlaySettings?.()
			.then((settings) => {
				if (!cancelled) {
					setShape(settings.shape);
				}
			})
			.catch(() => {
				// Best-effort state restore; the live preview still works with defaults.
			});
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		let stream: MediaStream | null = null;
		let cancelled = false;
		navigator.mediaDevices
			.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
			.then((s) => {
				if (cancelled) {
					s.getTracks().forEach((t) => t.stop());
					return;
				}
				stream = s;
				if (videoRef.current) videoRef.current.srcObject = s;
			})
			.catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
		return () => {
			cancelled = true;
			stream?.getTracks().forEach((t) => t.stop());
		};
	}, []);

	// Bottom-right grip → resize the square window via IPC (top-left stays put).
	const onResizePointerDown = (e: React.PointerEvent) => {
		e.preventDefault();
		e.stopPropagation();
		const startX = e.screenX;
		const startSize = window.innerWidth;
		const api = getApi();
		const onMove = (ev: PointerEvent) =>
			api?.resizeCameraOverlay?.(startSize + (ev.screenX - startX));
		const onUp = () => {
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", onUp);
		};
		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", onUp);
	};

	const radius = shape === "circle" ? "50%" : "18px";
	const showControls = hovered || introVisible;
	const fade: CSSProperties = { opacity: showControls ? 1 : 0, transition: "opacity .18s" };

	return (
		<div
			style={{ position: "fixed", inset: 0, ...DRAG }}
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
		>
			{/* Masked webcam fills the window; corners stay transparent. */}
			<div
				style={{
					position: "absolute",
					inset: 0,
					borderRadius: radius,
					overflow: "hidden",
					border: "3px solid rgba(255,255,255,0.92)",
					boxShadow: "0 8px 28px rgba(0,0,0,0.38)",
					background: "#0b0b0d",
				}}
			>
				{error ? (
					<div
						style={{
							...NO_DRAG,
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							height: "100%",
							padding: 14,
							textAlign: "center",
							color: "#fff",
							font: "12px -apple-system, system-ui, sans-serif",
							lineHeight: 1.5,
						}}
					>
						摄像头打不开:{error}。请在「系统设置 › 隐私与安全性 › 摄像头」允许 Inkast。
					</div>
				) : (
					<video
						ref={videoRef}
						autoPlay
						muted
						playsInline
						style={{
							width: "100%",
							height: "100%",
							objectFit: "cover",
							transform: mirror ? "scaleX(-1)" : "none",
						}}
					/>
				)}
			</div>

			{/* Top controls: 圆/方 · 镜像 · 关闭 */}
			<div
				style={{
					...NO_DRAG,
					...fade,
					position: "absolute",
					top: 8,
					left: 0,
					right: 0,
					display: "flex",
					justifyContent: "center",
					gap: 8,
					pointerEvents: showControls ? "auto" : "none",
				}}
			>
				<button
					type="button"
					title="圆形 / 方形"
					style={btnStyle}
					onClick={() =>
						setShape((s) => {
							const next = s === "circle" ? "square" : "circle";
							getApi()?.updateCameraOverlaySettings?.({ shape: next });
							return next;
						})
					}
				>
					{shape === "circle" ? "▢" : "◯"}
				</button>
				<button type="button" title="镜像" style={btnStyle} onClick={() => setMirror((m) => !m)}>
					⇋
				</button>
				<button
					type="button"
					title="关闭 (⌘⇧C)"
					style={btnStyle}
					onClick={() => getApi()?.closeCameraOverlay?.()}
				>
					✕
				</button>
			</div>

			{/* Interaction hint (fades with the controls). */}
			<div
				style={{
					...fade,
					position: "absolute",
					bottom: 9,
					left: 0,
					right: 0,
					textAlign: "center",
					color: "rgba(255,255,255,0.9)",
					font: "11px -apple-system, system-ui, sans-serif",
					textShadow: "0 1px 3px rgba(0,0,0,0.65)",
					pointerEvents: "none",
				}}
			>
				拖窗移动 · 拖右下角缩放
			</div>

			{/* Clearly-visible resize grip (bottom-right). Stays faintly visible so it's discoverable. */}
			<div
				onPointerDown={onResizePointerDown}
				title="拖动缩放"
				style={{
					...NO_DRAG,
					position: "absolute",
					right: 0,
					bottom: 0,
					width: 30,
					height: 30,
					cursor: "nwse-resize",
					opacity: showControls ? 1 : 0.45,
					transition: "opacity .18s",
				}}
			>
				<div
					style={{
						position: "absolute",
						right: 5,
						bottom: 5,
						width: 12,
						height: 12,
						borderRight: "3px solid rgba(255,255,255,0.95)",
						borderBottom: "3px solid rgba(255,255,255,0.95)",
						borderBottomRightRadius: 3,
					}}
				/>
			</div>

			<style>{`html, body, #root { width: 100%; height: 100%; margin: 0; background: transparent !important; overflow: hidden; }`}</style>
		</div>
	);
}
