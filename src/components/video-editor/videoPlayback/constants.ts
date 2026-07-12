import type { ZoomFocus } from "../types";

export const DEFAULT_FOCUS: ZoomFocus = { cx: 0.5, cy: 0.5 };
export const TRANSITION_WINDOW_MS = 1015.05;
export const ZOOM_IN_TRANSITION_WINDOW_MS = TRANSITION_WINDOW_MS * 1.5;
export const MIN_DELTA = 0.0001;
export const VIEWPORT_SCALE = 0.8;
export const SMOOTHING_FACTOR = 0.12;
export const ZOOM_TRANSLATION_DEADZONE_PX = 1.25;
export const ZOOM_SCALE_DEADZONE = 0.002;
// 自动跟随(focusMode:"auto" 时镜头追随光标)的平滑系数。
// 这是指数平滑:每帧镜头朝目标移动 factor 比例 —— factor 越小 = 镜头越"懒"、追得越慢越稳。
// Inkast 调参(2026-06-16,负责人反馈"画面追焦/鼠标移动太快"):
//   max 0.16 → 0.12(大位移时的最快追随也更克制),min 0.045 → 0.038(贴近目标时更稳、不抖)。
//   这是更"慢而稳"的一档;若反过来觉得"跟不上/发糊",把这两个值调大即可。
//   预览与 MP4/GIF 导出共用同一组常量(见 VideoPlayback / frameRenderer),改这里两处都生效。
export const AUTO_FOLLOW_SMOOTHING_FACTOR = 0.038;
export const AUTO_FOLLOW_SMOOTHING_FACTOR_MAX = 0.12;
export const AUTO_FOLLOW_RAMP_DISTANCE = 0.28;
export const AUTO_FOLLOW_JITTER_DEADZONE = 0.006;
