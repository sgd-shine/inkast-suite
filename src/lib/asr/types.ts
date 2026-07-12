// Inkast §4 Phase 2:本地 ASR 转写的共享类型。

/** 一个转写词(whisper word-level timestamp),时间戳为相对媒体起点的毫秒。 */
export interface TranscriptWord {
	text: string;
	startMs: number;
	endMs: number;
}
