import type { ZoomFocus } from "../types";
import { AUTO_FOLLOW_JITTER_DEADZONE } from "./constants";

/**
 * 自动跟随相机(focusMode:"auto" 时镜头追随光标)的运动模型。
 *
 * 2026-06-16 重写(负责人反馈:移动时跳屏 / 画面抖动)。改成 Screen-Studio 那种
 * **带速度状态的临界阻尼弹簧**,替换原先无速度的一阶指数平滑:
 *   - 临界阻尼(damping = 2√k)=> 无超调 => 不会过冲来回 => 消除"抖动";
 *   - 速度在帧间连续 => raw 目标突变(换焦点/遥测跳点)被吸收成平滑加减速 => 消除"跳屏";
 *   - 固定步长子积分 => 预览(60fps)与导出(任意 fps)手感一致、数值稳定;
 *   - 死区随放大倍数收紧 => 放大后屏幕上被放大的微抖也被抑制。
 *
 * 调手感只改一个值:`STIFFNESS`。越小越"懒"越稳(追得慢),越大越跟手(追得快)。
 * 预览与 MP4/GIF 导出共用本函数(见 VideoPlayback.tsx / frameRenderer.ts),改这里两端同步。
 */
export interface AutoFollowState {
	focus: ZoomFocus;
	/** 归一化坐标/秒,弹簧速度,需在帧间保留。 */
	vx: number;
	vy: number;
}

const FRAME_MS = 1000 / 60;
/** 单次最多积分多少帧:掉帧 / seek 时不会一步跳太远。 */
const MAX_STEP_FRAMES = 4;
// 刚度随"到目标距离"自适应:远/快 => 高刚度(贴紧光标,快速移动也丝滑、不橡皮筋拖尾);
// 近/慢 => 低刚度(轻柔落位、不抖)。始终临界阻尼(damping=2√k)=> 任何刚度都无超调。
// 调手感:MAX 越大,快速移动跟得越紧(越像 Screen Studio);MIN 越小,静止前越柔。
const STIFFNESS_MIN = 70;
const STIFFNESS_MAX = 320;
const STIFFNESS_RAMP_DISTANCE = 0.22;

function stiffnessForDistance(distance: number): number {
	const t = Math.min(1, distance / STIFFNESS_RAMP_DISTANCE);
	return STIFFNESS_MIN + (STIFFNESS_MAX - STIFFNESS_MIN) * t;
}

/** 半隐式欧拉单步积分一个临界阻尼弹簧分量。 */
function springStep(
	pos: number,
	vel: number,
	target: number,
	dt: number,
	stiffness: number,
): [number, number] {
	const damping = 2 * Math.sqrt(stiffness);
	const accel = stiffness * (target - pos) - damping * vel;
	const nextVel = vel + accel * dt;
	const nextPos = pos + nextVel * dt;
	return [nextPos, nextVel];
}

interface SmoothAutoFollowFocusParams {
	raw: ZoomFocus;
	/** 上一帧的运动状态;传 null = 首帧 / seek 后,直接落到 raw 不慢慢追。 */
	previous: AutoFollowState | null;
	deltaMs: number;
	/** 当前缩放倍数;放大时按比例收紧死区,抑制被放大的微抖。 */
	zoomScale?: number;
	deadzone?: number;
}

export function smoothAutoFollowFocus({
	raw,
	previous,
	deltaMs,
	zoomScale = 1,
	deadzone = AUTO_FOLLOW_JITTER_DEADZONE,
}: SmoothAutoFollowFocusParams): AutoFollowState {
	if (!previous) {
		return { focus: { cx: raw.cx, cy: raw.cy }, vx: 0, vy: 0 };
	}

	const effectiveDeadzone = deadzone * Math.max(1, zoomScale);
	const dx = raw.cx - previous.focus.cx;
	const dy = raw.cy - previous.focus.cy;
	const distance = Math.sqrt(dx * dx + dy * dy);

	// 死区内:镜头不动,并把残余速度衰减掉,彻底静止(否则会有亚像素漂移/微抖)。
	if (distance <= effectiveDeadzone) {
		return { focus: previous.focus, vx: previous.vx * 0.6, vy: previous.vy * 0.6 };
	}

	const stiffness = stiffnessForDistance(distance);
	const clampedDeltaMs = Math.min(deltaMs, FRAME_MS * MAX_STEP_FRAMES);
	const totalDt = clampedDeltaMs / 1000;
	const steps = Math.max(1, Math.ceil(clampedDeltaMs / FRAME_MS));
	const h = totalDt / steps;

	let cx = previous.focus.cx;
	let cy = previous.focus.cy;
	let vx = previous.vx;
	let vy = previous.vy;
	for (let i = 0; i < steps; i += 1) {
		[cx, vx] = springStep(cx, vx, raw.cx, h, stiffness);
		[cy, vy] = springStep(cy, vy, raw.cy, h, stiffness);
	}

	return { focus: { cx, cy }, vx, vy };
}
