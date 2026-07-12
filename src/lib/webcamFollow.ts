// 摄像头位置「跟随」模式的按时间插值(纯函数,可测)。预览与导出都用它把头像放到当前时刻的位置。
// 设计:additive —— follow 且有时间线时按时间插值;否则(fixed / 旧录制无时间线)回退到静态 position。
import type { CameraPositionMode, WebcamPositionSample } from "./recordingSession";

export interface WebcamPos {
	cx: number;
	cy: number;
}

/** 在按 tMs 升序的位置序列里,取 timeMs 时刻的归一化中心(端点钳制 + 区间线性插值)。空→null。 */
export function resolveFollowPositionAt(
	timeline: readonly WebcamPositionSample[] | undefined,
	timeMs: number,
): WebcamPos | null {
	if (!timeline || timeline.length === 0) return null;
	if (timeline.length === 1 || timeMs <= timeline[0].tMs) {
		return { cx: timeline[0].cx, cy: timeline[0].cy };
	}
	const last = timeline[timeline.length - 1];
	if (timeMs >= last.tMs) return { cx: last.cx, cy: last.cy };
	for (let i = 1; i < timeline.length; i++) {
		const b = timeline[i];
		if (timeMs <= b.tMs) {
			const a = timeline[i - 1];
			const span = b.tMs - a.tMs;
			const f = span > 0 ? (timeMs - a.tMs) / span : 0;
			return { cx: a.cx + (b.cx - a.cx) * f, cy: a.cy + (b.cy - a.cy) * f };
		}
	}
	return { cx: last.cx, cy: last.cy };
}

/**
 * 解析某时刻该用的摄像头位置:
 * follow + 有时间线 → 按时间插值;否则 → 静态 position(fixed / 旧录制,行为与今天一致)。
 */
export function resolveWebcamPositionAt(opts: {
	mode?: CameraPositionMode | null;
	timeline?: readonly WebcamPositionSample[] | null;
	staticPosition?: WebcamPos | null;
	timeMs: number;
}): WebcamPos | null {
	if (opts.mode === "follow" && opts.timeline && opts.timeline.length > 0) {
		const p = resolveFollowPositionAt(opts.timeline, opts.timeMs);
		if (p) return p;
	}
	return opts.staticPosition ?? null;
}
