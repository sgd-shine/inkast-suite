import { useEffect, useRef } from "react";
import { Rnd } from "react-rnd";
import { cn } from "@/lib/utils";
import { toFileUrl } from "./projectPersistence";
import type { OverlayClipRegion } from "./types";

// Inkast §3 Phase 2:视频片段叠加层(预览)。每个在当前时间内的叠加片段渲染成一个
// 定位的 <video>,currentTime 跟随主播放头(sourceStartMs + 已播时长),播放/暂停与主
// 视频同步。选中后可拖动 + 右下角缩放(react-rnd,与图片叠加同手感)。
// 渲染在 VideoPlayback 的画面坐标系内,所以跟随缩放/变换。

interface OverlayClipItemProps {
	region: OverlayClipRegion;
	containerWidth: number;
	containerHeight: number;
	currentTimeMs: number;
	isPlaying: boolean;
	isSelected: boolean;
	onSelect: (id: string) => void;
	onPositionChange: (id: string, position: { x: number; y: number }) => void;
	onSizeChange: (id: string, size: { width: number; height: number }) => void;
}

function OverlayClipItem({
	region,
	containerWidth,
	containerHeight,
	currentTimeMs,
	isPlaying,
	isSelected,
	onSelect,
	onPositionChange,
	onSizeChange,
}: OverlayClipItemProps) {
	const videoRef = useRef<HTMLVideoElement>(null);
	const isDraggingRef = useRef(false);

	const url = toFileUrl(region.sourcePath);
	const desiredSourceSec = Math.max(
		0,
		(region.sourceStartMs + (currentTimeMs - region.startMs)) / 1000,
	);

	// 跟随播放头校准 currentTime(漂移超过阈值才 seek,避免抖动)。
	useEffect(() => {
		const v = videoRef.current;
		if (!v) return;
		if (Math.abs(v.currentTime - desiredSourceSec) > 0.08) {
			try {
				v.currentTime = desiredSourceSec;
			} catch {
				// seeking before metadata ready — ignored, retried on next tick.
			}
		}
	}, [desiredSourceSec]);

	// 播放 / 暂停与主视频同步。
	useEffect(() => {
		const v = videoRef.current;
		if (!v) return;
		if (isPlaying) {
			v.play().catch(() => undefined);
		} else {
			v.pause();
		}
	}, [isPlaying]);

	const x = (region.position.x / 100) * containerWidth;
	const y = (region.position.y / 100) * containerHeight;
	const width = (region.size.width / 100) * containerWidth;
	const height = (region.size.height / 100) * containerHeight;

	return (
		<Rnd
			position={{ x, y }}
			size={{ width, height }}
			bounds="parent"
			enableResizing={isSelected && !isPlaying}
			disableDragging={!isSelected || isPlaying}
			onDragStart={() => {
				isDraggingRef.current = true;
			}}
			onDragStop={(_e, d) => {
				onPositionChange(region.id, {
					x: (d.x / containerWidth) * 100,
					y: (d.y / containerHeight) * 100,
				});
				setTimeout(() => {
					isDraggingRef.current = false;
				}, 80);
			}}
			onResizeStop={(_e, _dir, ref, _delta, position) => {
				onPositionChange(region.id, {
					x: (position.x / containerWidth) * 100,
					y: (position.y / containerHeight) * 100,
				});
				onSizeChange(region.id, {
					width: (ref.offsetWidth / containerWidth) * 100,
					height: (ref.offsetHeight / containerHeight) * 100,
				});
			}}
			onClick={() => {
				if (isDraggingRef.current) return;
				onSelect(region.id);
			}}
			className={cn(
				"overflow-hidden rounded-md",
				isSelected
					? "ring-2 ring-[#34B27B] ring-offset-1 ring-offset-transparent"
					: "ring-1 ring-white/25",
				isPlaying ? "" : "cursor-move",
			)}
			style={{ opacity: region.opacity ?? 1, zIndex: 20 + region.zIndex }}
		>
			<video
				ref={videoRef}
				src={url}
				muted={region.muted}
				playsInline
				preload="auto"
				draggable={false}
				className="pointer-events-none h-full w-full object-cover"
			/>
		</Rnd>
	);
}

interface OverlayClipLayerProps {
	regions: OverlayClipRegion[];
	containerWidth: number;
	containerHeight: number;
	currentTimeMs: number;
	isPlaying: boolean;
	selectedId: string | null;
	onSelect: (id: string) => void;
	onPositionChange: (id: string, position: { x: number; y: number }) => void;
	onSizeChange: (id: string, size: { width: number; height: number }) => void;
}

export function OverlayClipLayer({
	regions,
	containerWidth,
	containerHeight,
	currentTimeMs,
	isPlaying,
	selectedId,
	onSelect,
	onPositionChange,
	onSizeChange,
}: OverlayClipLayerProps) {
	const active = regions
		.filter((r) => currentTimeMs >= r.startMs && currentTimeMs < r.endMs)
		.sort((a, b) => a.zIndex - b.zIndex);

	if (active.length === 0) return null;

	return (
		<>
			{active.map((region) => (
				<OverlayClipItem
					key={`${region.id}-${containerWidth}-${containerHeight}`}
					region={region}
					containerWidth={containerWidth}
					containerHeight={containerHeight}
					currentTimeMs={currentTimeMs}
					isPlaying={isPlaying}
					isSelected={region.id === selectedId}
					onSelect={onSelect}
					onPositionChange={onPositionChange}
					onSizeChange={onSizeChange}
				/>
			))}
		</>
	);
}
