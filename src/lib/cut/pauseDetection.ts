// Inkast §4 Phase 1:能量法(VAD)长停顿检测。纯函数,便于单测。
// 思路:把音频按小窗(默认 20ms)算 RMS,用"噪声底 + 与人声电平的相对阈值"判静音,
// 连续静音超过 minPauseMs 即一段停顿;两端各留 paddingMs 的"留白"避免切进人声。
// 跨语言、无需 ASR,最稳、收益最大(文档 §4 Phase 1)。

export interface PauseSegment {
	/** 建议删除区间(已含留白收缩),毫秒,相对音频起点。 */
	startMs: number;
	endMs: number;
}

export interface DetectPausesOptions {
	/** 只有时长 ≥ 这个值的静音才算"长停顿"。默认 700ms。 */
	minPauseMs?: number;
	/** 每段停顿两端各保留多少 ms 的留白(避免切进人声/突兀)。默认 120ms。 */
	paddingMs?: number;
	/** RMS 计算窗口大小,默认 20ms。 */
	windowMs?: number;
	/**
	 * 阈值在 [噪声底, 人声电平] 之间的相对位置(0–1)。默认 0.15:
	 * 阈值 = 噪声底 + (人声电平 − 噪声底) × 0.15。越大越"激进"(更多被判停顿)。
	 */
	thresholdFraction?: number;
	/** 留白收缩后,停顿短于这个值就丢弃(避免切得太碎)。默认 200ms。 */
	minCutMs?: number;
}

const DEFAULTS: Required<DetectPausesOptions> = {
	minPauseMs: 700,
	paddingMs: 120,
	windowMs: 20,
	thresholdFraction: 0.15,
	minCutMs: 200,
};

function percentile(sorted: number[], p: number): number {
	if (sorted.length === 0) return 0;
	const idx = Math.max(0, Math.min(sorted.length - 1, Math.round(p * (sorted.length - 1))));
	return sorted[idx];
}

/**
 * 从单声道 PCM 样本检测长停顿。返回的是"建议删除区间"(已做两端留白收缩),按时间升序。
 */
export function detectPauses(
	samples: Float32Array,
	sampleRate: number,
	options?: DetectPausesOptions,
): PauseSegment[] {
	const opts = { ...DEFAULTS, ...options };
	if (!samples || samples.length === 0 || sampleRate <= 0) return [];

	const windowSize = Math.max(1, Math.round((sampleRate * opts.windowMs) / 1000));
	const numWindows = Math.floor(samples.length / windowSize);
	if (numWindows === 0) return [];

	// 每窗 RMS。
	const rms = new Float32Array(numWindows);
	for (let w = 0; w < numWindows; w++) {
		const base = w * windowSize;
		let sum = 0;
		for (let i = 0; i < windowSize; i++) {
			const s = samples[base + i];
			sum += s * s;
		}
		rms[w] = Math.sqrt(sum / windowSize);
	}

	// 自适应阈值:噪声底(10%分位)与人声电平(90%分位)。
	const sorted = Array.from(rms).sort((a, b) => a - b);
	const noiseFloor = percentile(sorted, 0.1);
	const speechLevel = percentile(sorted, 0.9);

	// 几乎没有人声(全静音或无音轨)→ 不建议删,交给上层处理。
	if (speechLevel <= 1e-4) return [];

	const threshold = Math.max(
		noiseFloor + (speechLevel - noiseFloor) * opts.thresholdFraction,
		noiseFloor * 1.5,
		1e-4,
	);

	const totalMs = (samples.length / sampleRate) * 1000;
	const pauses: PauseSegment[] = [];

	let runStart = -1; // 当前静音段起始窗
	const flush = (endWindowExclusive: number) => {
		if (runStart < 0) return;
		const rawStartMs = runStart * opts.windowMs;
		const rawEndMs = endWindowExclusive * opts.windowMs;
		runStart = -1;
		if (rawEndMs - rawStartMs < opts.minPauseMs) return;
		const cutStart = rawStartMs + opts.paddingMs;
		const cutEnd = rawEndMs - opts.paddingMs;
		if (cutEnd - cutStart < opts.minCutMs) return;
		pauses.push({
			startMs: Math.round(Math.max(0, cutStart)),
			endMs: Math.round(Math.min(totalMs, cutEnd)),
		});
	};

	for (let w = 0; w < numWindows; w++) {
		const silent = rms[w] < threshold;
		if (silent) {
			if (runStart < 0) runStart = w;
		} else {
			flush(w);
		}
	}
	flush(numWindows);

	return pauses.filter((p) => p.endMs > p.startMs);
}

/** 把多声道下混成单声道(平均),供 detectPauses 使用。 */
export function downmixToMono(channels: Float32Array[]): Float32Array {
	if (channels.length === 0) return new Float32Array(0);
	if (channels.length === 1) return channels[0];
	const len = channels[0].length;
	const out = new Float32Array(len);
	for (let c = 0; c < channels.length; c++) {
		const ch = channels[c];
		for (let i = 0; i < len; i++) out[i] += ch[i];
	}
	const inv = 1 / channels.length;
	for (let i = 0; i < len; i++) out[i] *= inv;
	return out;
}

/** 总可省时长(ms)。 */
export function totalPauseMs(pauses: PauseSegment[]): number {
	return pauses.reduce((acc, p) => acc + Math.max(0, p.endMs - p.startMs), 0);
}
