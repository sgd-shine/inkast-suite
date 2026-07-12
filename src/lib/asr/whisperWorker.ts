import { env, pipeline } from "@huggingface/transformers";

// Inkast §4 Phase 2:本地 whisper 转写,在 Web Worker 里跑(不阻塞 UI、无原生 helper)。
// 模型首次从 HuggingFace Hub 下载并缓存(Cache API),之后离线可用。
// webSecurity 已为 false → 渲染进程可跨源拉取模型 + ORT 的 wasm 后端。

env.allowLocalModels = false;
env.useBrowserCache = true;

// ⚠️ 必须用 *_timestamped 变体:普通 whisper-base 的 ONNX 没导出 cross-attentions,
// `return_timestamps:"word"`(词级时间戳)会必崩
// ("Model outputs must contain cross attentions to extract timestamps")。
// _timestamped 变体专门带了 attention 输出,词级时间戳才能用。
// (Node 离线复现确认:base→崩、base_timestamped→出 15 个词级 chunk。)
const MODEL_ID = "onnx-community/whisper-base_timestamped";

interface InMessage {
	audio: Float32Array;
	language?: string | null;
}

type OutMessage =
	| { type: "progress"; stage: "download" | "transcribe"; progress: number }
	| {
			type: "result";
			chunks: Array<{ text: string; timestamp: [number, number | null] }>;
	  }
	| { type: "error"; message: string };

function post(msg: OutMessage) {
	(self as unknown as Worker).postMessage(msg);
}

// biome-ignore lint/suspicious/noExplicitAny: transformers.js pipeline 回调/输出无精确公开类型
type Transcriber = (audio: Float32Array, options: Record<string, unknown>) => Promise<any>;

// biome-ignore lint/suspicious/noExplicitAny: progress 回调载荷无公开类型
const onProgress = (p: any) => {
	if (p?.status === "progress" && typeof p.progress === "number") {
		post({
			type: "progress",
			stage: "download",
			progress: Math.max(0, Math.min(1, p.progress / 100)),
		});
	}
};

// 加载模型 + 跑一次推理。整段都包进同一个 device 尝试里 —— 这样 WebGPU 不只在
// "加载"阶段失败时回退 WASM,**推理**阶段失败也能回退(原实现只 catch 了加载,
// WebGPU 加载成功但推理报错时会直接挂掉、不回退,是转写失败的一个隐藏原因)。
async function runOnce(
	device: "webgpu" | "wasm",
	dtype: "fp32" | "q8",
	audio: Float32Array,
	language?: string | null,
	// biome-ignore lint/suspicious/noExplicitAny: pipeline 输出无公开类型
): Promise<any> {
	const transcriber = (await pipeline("automatic-speech-recognition", MODEL_ID, {
		device,
		dtype,
		progress_callback: onProgress,
	})) as unknown as Transcriber;
	post({ type: "progress", stage: "transcribe", progress: 0 });
	return transcriber(audio, {
		return_timestamps: "word",
		chunk_length_s: 30,
		stride_length_s: 5,
		language: language ?? undefined,
		task: "transcribe",
	});
}

self.onmessage = async (event: MessageEvent<InMessage>) => {
	const { audio, language } = event.data;
	let webgpuErr: string | null = null;
	try {
		// 优先 WebGPU(快),失败(常见:Worker 里无 navigator.gpu、或 GPU 推理报错)
		// 则回退 WASM(稳)。音频缓冲区已转移进 worker,两次尝试可复用同一份。
		// biome-ignore lint/suspicious/noExplicitAny: pipeline 输出无公开类型
		let output: any;
		try {
			output = await runOnce("webgpu", "fp32", audio, language);
		} catch (gpuErr) {
			webgpuErr = gpuErr instanceof Error ? gpuErr.message : String(gpuErr);
			output = await runOnce("wasm", "q8", audio, language);
		}
		const single = Array.isArray(output) ? output[0] : output;
		const chunks = (single?.chunks ?? []) as Array<{
			text: string;
			timestamp: [number, number | null];
		}>;
		post({ type: "result", chunks });
	} catch (err) {
		// 两条路径都失败 → 把 WebGPU 与 WASM 的错误都带上,方便定位
		// (网络拉模型失败 / wasm 后端初始化失败 / 推理报错 等)。
		const wasmErr = err instanceof Error ? err.message : String(err);
		const message = webgpuErr ? `webgpu: ${webgpuErr} | wasm: ${wasmErr}` : `wasm: ${wasmErr}`;
		post({ type: "error", message });
	}
};
