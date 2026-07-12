import { useCallback, useRef, useState } from "react";

// 可拖拽调节的面板宽度(localStorage 持久化)。用于驾驶舱右详情、资料库预览等可调面板。
// side="left":拖拽手柄在面板左边缘(往左拖变宽,如右侧详情面板);"right":手柄在右边缘。
export function useResizableWidth(
	storageKey: string,
	def: number,
	min: number,
	max: number,
	side: "left" | "right" = "left",
): { width: number; onPointerDown: (e: React.PointerEvent) => void } {
	const [width, setWidth] = useState<number>(() => {
		if (typeof window === "undefined") return def;
		const saved = Number(localStorage.getItem(storageKey));
		return Number.isFinite(saved) && saved >= min && saved <= max ? saved : def;
	});
	const widthRef = useRef(width);
	widthRef.current = width;

	const onPointerDown = useCallback(
		(e: React.PointerEvent) => {
			e.preventDefault();
			const startX = e.clientX;
			const startW = widthRef.current;
			const onMove = (ev: PointerEvent) => {
				const delta = ev.clientX - startX;
				const next = Math.min(
					max,
					Math.max(min, side === "left" ? startW - delta : startW + delta),
				);
				setWidth(next);
			};
			const onUp = () => {
				window.removeEventListener("pointermove", onMove);
				window.removeEventListener("pointerup", onUp);
				try {
					localStorage.setItem(storageKey, String(Math.round(widthRef.current)));
				} catch {
					/* 配额满等忽略 */
				}
			};
			window.addEventListener("pointermove", onMove);
			window.addEventListener("pointerup", onUp);
		},
		[max, min, side, storageKey],
	);

	return { width, onPointerDown };
}
