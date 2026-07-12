import type { CSSProperties } from "react";
import { activeCueAt } from "@/lib/cut/subtitleCues";
import type { SubtitleCue } from "./types";

// Inkast §4 Phase 3:预览里的字幕层。按当前(源)时间显示对应 cue,底部居中。
// 样式与导出端 frameRenderer.drawSubtitles 保持一致:字号≈画面高 4.5%,底边距≈7%,
// 深色药丸底 + 白色粗体字。导出走 canvas 复刻同比例,保证预览=成品。

interface SubtitleOverlayProps {
	cues: SubtitleCue[];
	currentTimeMs: number;
	show: boolean;
	containerWidth: number;
	containerHeight: number;
}

export function SubtitleOverlay({
	cues,
	currentTimeMs,
	show,
	containerHeight,
}: SubtitleOverlayProps) {
	if (!show || cues.length === 0 || containerHeight <= 0) return null;
	const cue = activeCueAt(cues, currentTimeMs);
	if (!cue) return null;

	const fontSize = Math.max(12, Math.round(containerHeight * 0.045));
	const bottom = Math.round(containerHeight * 0.07);
	const padY = Math.round(fontSize * 0.2);
	const padX = Math.round(fontSize * 0.55);

	const pill: CSSProperties = {
		maxWidth: "82%",
		fontSize,
		lineHeight: 1.35,
		color: "#ffffff",
		background: "rgba(0,0,0,0.55)",
		padding: `${padY}px ${padX}px`,
		borderRadius: Math.round(fontSize * 0.32),
		textAlign: "center",
		fontWeight: 600,
		textShadow: "0 1px 3px rgba(0,0,0,0.65)",
		whiteSpace: "pre-wrap",
		fontFamily: "-apple-system, system-ui, sans-serif",
	};

	return (
		<div
			className="pointer-events-none absolute inset-x-0 flex justify-center"
			style={{ bottom, zIndex: 25 }}
		>
			<span style={pill}>{cue.text}</span>
		</div>
	);
}
