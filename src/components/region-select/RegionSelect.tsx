import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";

// Region selector / 框选区域 (Inkast, Phase 3). A full-display transparent overlay
// shown BEFORE recording. The user drags a rectangle; on confirm we send the
// NORMALIZED region (0–1, relative to the display) to the main process via
// regionSelectorConfirm. The editor reads it on load and applies it as the crop, so
// the exported video is limited to that region — we still capture the whole display
// (方案 A). Esc cancels, Enter confirms. This overlay is not part of the recording.

const BRAND = "#34B27B";
const MIN_SIZE_PX = 12;

type Point = { x: number; y: number };
type Region = { x: number; y: number; width: number; height: number };

// Match the DrawOverlay/CameraOverlay pattern: access electronAPI through a narrow,
// optional shape so a missing preload can't crash the overlay.
type RegionApi = {
	regionSelectorConfirm?: (region: Region) => void;
	regionSelectorCancel?: () => void;
};
function getApi(): RegionApi | undefined {
	return (window as unknown as { electronAPI?: RegionApi }).electronAPI;
}

export function RegionSelect() {
	const [start, setStart] = useState<Point | null>(null);
	const [current, setCurrent] = useState<Point | null>(null);
	const [dragging, setDragging] = useState(false);
	const draggingRef = useRef(false);
	draggingRef.current = dragging;

	const rect =
		start && current
			? {
					left: Math.min(start.x, current.x),
					top: Math.min(start.y, current.y),
					width: Math.abs(current.x - start.x),
					height: Math.abs(current.y - start.y),
				}
			: null;
	const hasRect = !!rect && rect.width >= MIN_SIZE_PX && rect.height >= MIN_SIZE_PX;

	const confirm = useCallback(() => {
		const w = window.innerWidth;
		const h = window.innerHeight;
		if (!rect || w <= 0 || h <= 0) return;
		if (rect.width < MIN_SIZE_PX || rect.height < MIN_SIZE_PX) return;
		const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
		getApi()?.regionSelectorConfirm?.({
			x: clamp01(rect.left / w),
			y: clamp01(rect.top / h),
			width: clamp01(rect.width / w),
			height: clamp01(rect.height / h),
		});
	}, [rect]);

	const cancel = useCallback(() => {
		getApi()?.regionSelectorCancel?.();
	}, []);

	// Esc → cancel, Enter → confirm (when a usable rectangle exists).
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				cancel();
			} else if (e.key === "Enter") {
				e.preventDefault();
				confirm();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [cancel, confirm]);

	const onMouseDown = (e: React.MouseEvent) => {
		if (e.button !== 0) return;
		const p = { x: e.clientX, y: e.clientY };
		setStart(p);
		setCurrent(p);
		setDragging(true);
	};
	const onMouseMove = (e: React.MouseEvent) => {
		if (!draggingRef.current) return;
		setCurrent({ x: e.clientX, y: e.clientY });
	};
	const onMouseUp = () => setDragging(false);

	return (
		<div
			onMouseDown={onMouseDown}
			onMouseMove={onMouseMove}
			onMouseUp={onMouseUp}
			style={{
				position: "fixed",
				inset: 0,
				cursor: "crosshair",
				userSelect: "none",
				overflow: "hidden",
				// Light dim before the first drag so the screen + hint read well; once a
				// rectangle exists the box-shadow below provides the dim instead.
				background: rect ? "transparent" : "rgba(0,0,0,0.28)",
			}}
		>
			{rect && (
				<div
					style={{
						position: "absolute",
						left: rect.left,
						top: rect.top,
						width: rect.width,
						height: rect.height,
						border: `2px solid ${BRAND}`,
						boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)",
						boxSizing: "border-box",
						pointerEvents: "none",
					}}
				>
					<div
						style={{
							position: "absolute",
							top: rect.height > 30 ? 6 : -26,
							left: 6,
							padding: "2px 8px",
							borderRadius: 6,
							background: BRAND,
							color: "#fff",
							font: "12px -apple-system, system-ui",
							whiteSpace: "nowrap",
						}}
					>
						{Math.round(rect.width)} × {Math.round(rect.height)}
					</div>
				</div>
			)}

			{/* Hint (top center). */}
			<div
				style={{
					position: "fixed",
					top: 28,
					left: "50%",
					transform: "translateX(-50%)",
					padding: "8px 16px",
					borderRadius: 10,
					background: "rgba(12,13,16,0.82)",
					backdropFilter: "blur(8px)",
					color: "#fff",
					font: "13px -apple-system, system-ui",
					whiteSpace: "nowrap",
					pointerEvents: "none",
				}}
			>
				{hasRect
					? "Enter 确认录制此区域 · Esc 取消 · 可重新拖动框选"
					: "拖动鼠标框选要录制的区域 · Esc 取消"}
			</div>

			{/* Confirm / Cancel toolbar (bottom center), once a usable rect exists. */}
			{hasRect && !dragging && (
				<div
					style={{
						position: "fixed",
						bottom: 36,
						left: "50%",
						transform: "translateX(-50%)",
						display: "flex",
						gap: 10,
					}}
				>
					<button
						type="button"
						style={btn(false)}
						onMouseDown={(e) => e.stopPropagation()}
						onClick={cancel}
					>
						取消
					</button>
					<button
						type="button"
						style={btn(true)}
						onMouseDown={(e) => e.stopPropagation()}
						onClick={confirm}
					>
						✓ 录制此区域
					</button>
				</div>
			)}

			<style>{`html, body, #root { width: 100%; height: 100%; margin: 0; background: transparent !important; overflow: hidden; }`}</style>
		</div>
	);
}

function btn(primary: boolean): CSSProperties {
	return {
		height: 36,
		padding: "0 18px",
		borderRadius: 10,
		border: "none",
		cursor: "pointer",
		font: "600 13px -apple-system, system-ui",
		color: "#fff",
		background: primary ? BRAND : "rgba(255,255,255,0.16)",
	};
}
