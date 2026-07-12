// 分析(拉片)共享类型 —— 渲染/preload/主进程共用,无 node 依赖。

export type AnalyzePhase = "idle" | "probe" | "extract" | "analyze" | "write" | "done" | "error";

export interface AnalyzeFingerprint {
	width: number;
	height: number;
	fps: number;
	durationSec: number;
	bitrateKbps?: number;
}

export interface AnalyzeJob {
	id: string;
	slug: string;
	videoPath: string;
	title: string;
	phase: AnalyzePhase;
	note?: string;
	frameCount?: number;
	fingerprint?: AnalyzeFingerprint;
	outputDir?: string;
	reportPath?: string;
	report?: string;
	model?: string;
	// start() 时定下,整条调用链一致(避免分析途中改密钥导致 provider 二次求值不一致 → 发错供应商)。
	provider?: "anthropic" | "moonshot";
	error?: string;
	startedMs?: number;
	finishedMs?: number;
}

export interface AnalyzeEngineInfo {
	hasFfmpeg: boolean;
	hasKey: boolean;
	model: string;
	/** 当前视觉供应商:anthropic(Claude)/ moonshot(Kimi)。 */
	provider?: "anthropic" | "moonshot";
}

export interface AnalyzeResult<T> {
	ok: boolean;
	data?: T;
	error?: string;
}
