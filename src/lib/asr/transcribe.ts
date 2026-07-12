import type { TranscriptWord } from "./types";

// Inkast §4 Phase 2:主线程侧的转写封装 —— 重采样到 16kHz 单声道(whisper 输入要求),
// 再把音频零拷贝转给 worker,收集进度 + 结果,把秒级时间戳换算成毫秒级 TranscriptWord。

const TARGET_SAMPLE_RATE = 16000;

/** 把任意采样率/声道的 AudioBuffer 重采样成 16kHz 单声道 Float32Array。 */
export async function resampleTo16kMono(audioBuffer: AudioBuffer): Promise<Float32Array> {
	const targetLength = Math.max(1, Math.ceil(audioBuffer.duration * TARGET_SAMPLE_RATE));
	const offline = new OfflineAudioContext(1, targetLength, TARGET_SAMPLE_RATE);
	const source = offline.createBufferSource();
	source.buffer = audioBuffer;
	source.connect(offline.destination);
	source.start();
	const rendered = await offline.startRendering();
	return rendered.getChannelData(0).slice();
}

export interface TranscribeOptions {
	/** whisper 语言提示(如 "chinese" / "english");省略则自动检测。 */
	language?: string | null;
	signal?: AbortSignal;
	onProgress?: (info: { stage: "download" | "transcribe"; progress: number }) => void;
}

interface WorkerOut {
	type: "progress" | "result" | "error";
	stage?: "download" | "transcribe";
	progress?: number;
	chunks?: Array<{ text: string; timestamp: [number, number | null] }>;
	message?: string;
}

/** 在 worker 里转写 16kHz 单声道音频,resolve 成词级时间戳数组。 */
export function transcribeAudio(
	audio16k: Float32Array,
	options: TranscribeOptions = {},
): Promise<TranscriptWord[]> {
	const { language, signal, onProgress } = options;
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(new DOMException("Aborted", "AbortError"));
			return;
		}

		const worker = new Worker(new URL("./whisperWorker.ts", import.meta.url), {
			type: "module",
		});

		const onAbort = () => {
			cleanup();
			reject(new DOMException("Aborted", "AbortError"));
		};
		const cleanup = () => {
			signal?.removeEventListener("abort", onAbort);
			worker.terminate();
		};
		signal?.addEventListener("abort", onAbort, { once: true });

		worker.onmessage = (e: MessageEvent<WorkerOut>) => {
			const msg = e.data;
			if (msg.type === "progress") {
				onProgress?.({ stage: msg.stage ?? "transcribe", progress: msg.progress ?? 0 });
			} else if (msg.type === "result") {
				cleanup();
				resolve(mapChunksToWords(msg.chunks ?? []));
			} else if (msg.type === "error") {
				cleanup();
				reject(new Error(msg.message ?? "Transcription failed"));
			}
		};

		worker.onerror = (e) => {
			cleanup();
			reject(new Error(e.message || "Transcription worker error"));
		};

		// 零拷贝转移音频缓冲区到 worker(调用方每次都新建,故安全)。
		worker.postMessage({ audio: audio16k, language: language ?? null }, [audio16k.buffer]);
	});
}

function mapChunksToWords(
	chunks: Array<{ text: string; timestamp: [number, number | null] }>,
): TranscriptWord[] {
	const words: TranscriptWord[] = [];
	for (const c of chunks) {
		const ts = c.timestamp;
		if (!ts || typeof ts[0] !== "number") continue;
		const startSec = ts[0];
		const endSec = typeof ts[1] === "number" ? ts[1] : startSec;
		words.push({
			text: c.text ?? "",
			startMs: Math.round(startSec * 1000),
			endMs: Math.round(endSec * 1000),
		});
	}
	return words;
}
