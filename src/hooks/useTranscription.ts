import { useCallback, useEffect, useRef, useState } from "react";
import { resampleTo16kMono, transcribeAudio } from "@/lib/asr/transcribe";
import type { TranscriptWord } from "@/lib/asr/types";
import { detectFillers, type FillerSegment } from "@/lib/cut/fillerDetection";
import { loadFileAsArrayBuffer } from "@/lib/exporter/streamingDecoder";

// Inkast §4 Phase 2:按需(用户点「识别废话」才跑)的本地转写 hook。转写昂贵
// (首次下模型 + WASM 推理),所以不在进编辑器时自动跑 —— 与停顿检测不同。
// 复用 usePauseDetection 同一套文件加载 + Web Audio 解码路径。

let _ctx: AudioContext | null = null;
function getCtx(): AudioContext {
	if (!_ctx) _ctx = new AudioContext();
	return _ctx;
}

export type TranscriptionStatus =
	| "idle"
	| "preparing"
	| "transcribing"
	| "ready"
	| "error"
	| "no-audio";

export interface UseTranscription {
	status: TranscriptionStatus;
	/** 0..1;下载/转写阶段的粗略进度。 */
	progress: number;
	words: TranscriptWord[];
	fillers: FillerSegment[];
	/** 转写失败时的真实错误信息(来自 worker:webgpu/wasm 各自的报错);否则 null。 */
	error: string | null;
	/** 触发一次转写(若已在跑则忽略)。 */
	transcribe: () => void;
	reset: () => void;
}

export function useTranscription(videoUrl?: string, language?: string): UseTranscription {
	const [status, setStatus] = useState<TranscriptionStatus>("idle");
	const [progress, setProgress] = useState(0);
	const [words, setWords] = useState<TranscriptWord[]>([]);
	const [fillers, setFillers] = useState<FillerSegment[]>([]);
	const [error, setError] = useState<string | null>(null);
	const abortRef = useRef<AbortController | null>(null);

	// 切换源 → 取消进行中的任务并清空。videoUrl 是有意的重置触发依赖
	// (effect 体内不直接引用它,故 Biome 误报"多余依赖")。
	// biome-ignore lint/correctness/useExhaustiveDependencies: videoUrl 作为换源重置触发器
	useEffect(() => {
		abortRef.current?.abort();
		abortRef.current = null;
		setStatus("idle");
		setProgress(0);
		setWords([]);
		setFillers([]);
		setError(null);
	}, [videoUrl]);

	// 卸载时取消。
	useEffect(() => () => abortRef.current?.abort(), []);

	const transcribe = useCallback(() => {
		if (!videoUrl) return;
		if (abortRef.current) return; // 已在跑
		const controller = new AbortController();
		abortRef.current = controller;
		setStatus("preparing");
		setProgress(0);
		setError(null);

		(async () => {
			// 显式记录是否进入"转写"阶段:据此区分「无音轨(解码失败)」与「转写失败」,
			// 不再靠 setStatus 的 prev 推断(竞态下不可靠)。
			let reachedTranscribe = false;
			try {
				const { data } = await loadFileAsArrayBuffer(videoUrl);
				if (controller.signal.aborted) return;
				const audio = await getCtx().decodeAudioData(data);
				if (controller.signal.aborted) return;
				const mono16k = await resampleTo16kMono(audio);
				if (controller.signal.aborted) return;
				reachedTranscribe = true;
				setStatus("transcribing");
				const w = await transcribeAudio(mono16k, {
					language,
					signal: controller.signal,
					onProgress: (info) => setProgress(info.progress),
				});
				if (controller.signal.aborted) return;
				setWords(w);
				setFillers(detectFillers(w));
				setStatus("ready");
			} catch (err) {
				if (err instanceof DOMException && err.name === "AbortError") return;
				const message = err instanceof Error ? err.message : String(err);
				if (reachedTranscribe) {
					// 转写阶段失败:把 worker 的真实错误打到控制台并暴露给 UI
					//(原实现把错误吞了,负责人只看到"转写失败"无从定位)。
					console.error("[Inkast] 转写失败:", message, err);
					setError(message);
					setStatus("error");
				} else {
					// 解码失败 → 多半是没有音轨。
					console.warn("[Inkast] 音频解码失败(可能无音轨):", message);
					setStatus("no-audio");
				}
			} finally {
				if (abortRef.current === controller) abortRef.current = null;
			}
		})();
	}, [videoUrl, language]);

	const reset = useCallback(() => {
		abortRef.current?.abort();
		abortRef.current = null;
		setStatus("idle");
		setProgress(0);
		setWords([]);
		setFillers([]);
		setError(null);
	}, []);

	return { status, progress, words, fillers, error, transcribe, reset };
}
