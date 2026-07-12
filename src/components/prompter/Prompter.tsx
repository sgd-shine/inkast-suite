import { type CSSProperties, useEffect, useRef, useState } from "react";

// Teleprompter / 文案提示窗 (Inkast, Phase 3). The window is created with
// setContentProtection(true) in windows.ts (macOS NSWindowSharingNone), so it is
// visible to YOU on screen but NOT captured into the recording. Paste your
// script, adjust the font size, and auto-scroll while you talk. ⌘⇧T toggles it.

type PrompterApi = {
	closePrompter?: () => void;
	getPrompterScript?: () => Promise<string>;
	onPrompterScript?: (cb: (text: string) => void) => () => void;
};
function getApi(): PrompterApi | undefined {
	return (window as unknown as { electronAPI?: PrompterApi }).electronAPI;
}

// `-webkit-app-region` isn't in the standard CSSProperties type — cast locally.
const DRAG = { WebkitAppRegion: "drag" } as CSSProperties;
const NO_DRAG = { WebkitAppRegion: "no-drag" } as CSSProperties;

const ctrlBtn: CSSProperties = {
	...NO_DRAG,
	minWidth: 30,
	height: 28,
	padding: "0 8px",
	borderRadius: 8,
	border: "none",
	background: "rgba(255,255,255,0.12)",
	color: "#fff",
	fontSize: 13,
	cursor: "pointer",
};

export function Prompter() {
	const [text, setText] = useState("");
	const [fontSize, setFontSize] = useState(26);
	const [scrolling, setScrolling] = useState(false);
	const [speed, setSpeed] = useState(50); // px per second
	const taRef = useRef<HTMLTextAreaElement>(null);

	// 漏斗预填(§5.1):挂载时取驾驶舱「去录屏」暂存的口播稿;之后若再带选题来,实时替换。
	useEffect(() => {
		const api = getApi();
		api?.getPrompterScript?.().then((s) => {
			if (s) setText(s);
		});
		return api?.onPrompterScript?.((s) => {
			setText(s);
			setScrolling(false);
			if (taRef.current) taRef.current.scrollTop = 0;
		});
	}, []);

	// Auto-scroll the script while "scrolling" is on.
	useEffect(() => {
		if (!scrolling) return;
		let raf = 0;
		let last = 0;
		const step = (t: number) => {
			if (last) {
				const dt = (t - last) / 1000;
				const ta = taRef.current;
				if (ta) {
					ta.scrollTop += speed * dt;
					if (ta.scrollTop + ta.clientHeight >= ta.scrollHeight - 1) {
						setScrolling(false);
					}
				}
			}
			last = t;
			raf = requestAnimationFrame(step);
		};
		raf = requestAnimationFrame(step);
		return () => cancelAnimationFrame(raf);
	}, [scrolling, speed]);

	return (
		<div
			style={{
				...DRAG,
				position: "fixed",
				inset: 0,
				display: "flex",
				flexDirection: "column",
				background: "rgba(12,13,16,0.82)",
				backdropFilter: "blur(10px)",
				borderRadius: 14,
				border: "1px solid rgba(255,255,255,0.12)",
				overflow: "hidden",
				boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
			}}
		>
			{/* Title bar (draggable) + controls (no-drag). */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 8,
					padding: "8px 10px",
					borderBottom: "1px solid rgba(255,255,255,0.08)",
				}}
			>
				<span
					style={{
						color: "rgba(255,255,255,0.92)",
						font: "12px -apple-system, system-ui",
						whiteSpace: "nowrap",
					}}
				>
					👁 提词器 · 仅你可见,不录入
				</span>
				<div style={{ flex: 1 }} />
				<button
					type="button"
					style={ctrlBtn}
					title="字号 −"
					onClick={() => setFontSize((f) => Math.max(14, f - 2))}
				>
					A−
				</button>
				<button
					type="button"
					style={ctrlBtn}
					title="字号 +"
					onClick={() => setFontSize((f) => Math.min(64, f + 2))}
				>
					A+
				</button>
				<button
					type="button"
					style={{
						...ctrlBtn,
						background: scrolling ? "rgba(52,178,123,0.5)" : "rgba(255,255,255,0.12)",
					}}
					title="自动滚动 播放/暂停"
					onClick={() => setScrolling((s) => !s)}
				>
					{scrolling ? "⏸" : "▶"}
				</button>
				<input
					type="range"
					min={10}
					max={160}
					value={speed}
					onChange={(e) => setSpeed(Number(e.target.value))}
					title="滚动速度"
					style={{ ...NO_DRAG, width: 78 }}
				/>
				<button
					type="button"
					style={{ ...ctrlBtn, background: "rgba(255,80,80,0.22)" }}
					title="关闭 (⌘⇧T)"
					onClick={() => getApi()?.closePrompter?.()}
				>
					✕
				</button>
			</div>

			{/* Script (editable; paste your text here). */}
			<textarea
				ref={taRef}
				value={text}
				onChange={(e) => setText(e.target.value)}
				placeholder="在此粘贴/输入你的讲稿…&#10;只有你看得见,录屏时不会出现在视频里。"
				style={{
					...NO_DRAG,
					flex: 1,
					width: "100%",
					boxSizing: "border-box",
					resize: "none",
					border: "none",
					outline: "none",
					background: "transparent",
					color: "#fff",
					padding: "14px 18px",
					fontSize,
					lineHeight: 1.6,
					fontFamily: "-apple-system, system-ui, sans-serif",
				}}
			/>

			<style>{`html, body, #root { width: 100%; height: 100%; margin: 0; background: transparent !important; overflow: hidden; }
				::-webkit-scrollbar { width: 8px; } ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 4px; }
				input[type=range] { accent-color: #34b27b; }`}</style>
		</div>
	);
}
