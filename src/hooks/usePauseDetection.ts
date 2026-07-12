import { useEffect, useState } from "react";
import { detectPauses, downmixToMono, type PauseSegment } from "@/lib/cut/pauseDetection";
import { loadFileAsArrayBuffer } from "@/lib/exporter/streamingDecoder";

// Inkast §4 Phase 1:解码录制音频 → 能量法检测长停顿。复用 useAudioPeaks 同一套
// 文件加载 + Web Audio 解码路径。失败/无音轨 → status "no-audio"(静默降级)。

let _ctx: AudioContext | null = null;
function getCtx(): AudioContext {
	if (!_ctx) _ctx = new AudioContext();
	return _ctx;
}

export type PauseDetectionStatus = "idle" | "loading" | "ready" | "no-audio";

export function usePauseDetection(videoUrl?: string): {
	pauses: PauseSegment[];
	status: PauseDetectionStatus;
} {
	const [pauses, setPauses] = useState<PauseSegment[]>([]);
	const [status, setStatus] = useState<PauseDetectionStatus>("idle");

	useEffect(() => {
		if (!videoUrl) {
			setPauses([]);
			setStatus("idle");
			return;
		}
		let cancelled = false;
		setStatus("loading");
		setPauses([]);

		(async () => {
			try {
				const { data } = await loadFileAsArrayBuffer(videoUrl);
				if (cancelled) return;
				const audio = await getCtx().decodeAudioData(data);
				if (cancelled) return;
				const channels: Float32Array[] = [];
				for (let c = 0; c < audio.numberOfChannels; c++) {
					channels.push(audio.getChannelData(c));
				}
				const mono = downmixToMono(channels);
				const result = detectPauses(mono, audio.sampleRate);
				if (cancelled) return;
				setPauses(result);
				setStatus("ready");
			} catch {
				if (!cancelled) {
					setPauses([]);
					setStatus("no-audio");
				}
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [videoUrl]);

	return { pauses, status };
}
