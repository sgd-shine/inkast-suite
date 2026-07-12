import type { RowDefinition } from "dnd-timeline";
import { useRow } from "dnd-timeline";

interface RowProps extends RowDefinition {
	children: React.ReactNode;
	hint?: string;
	isEmpty?: boolean;
	background?: React.ReactNode;
	/** Inkast 界面对齐 Phase 1:左侧标签列的图标 + 名称(对齐 Demo .trk-h)。 */
	icon?: React.ReactNode;
	label?: string;
}

/**
 * A single horizontal lane in the timeline. Wraps the dnd-timeline `useRow`
 * hook. Layout (matches Demo `.trk`): a fixed left **label column** (icon +
 * name, width = TimelineContext `sidebarWidth`) followed by the lane content.
 * The optional `background` (e.g. `BackgroundWaveform`) and empty-state hint
 * live inside the lane so they never bleed under the label column.
 */
export default function Row({ id, children, hint, isEmpty, background, icon, label }: RowProps) {
	const { setNodeRef, setSidebarRef, rowWrapperStyle, rowStyle, rowSidebarStyle } = useRow({ id });

	return (
		<div
			className="border-b border-white/[0.055] relative"
			style={{ ...rowWrapperStyle, minHeight: 36 }}
		>
			{/* 左侧标签列(Demo .trk-h):图标 + 轨道名,固定宽度由 sidebarWidth 决定。 */}
			<div
				ref={setSidebarRef}
				style={rowSidebarStyle}
				className="items-center gap-1.5 px-2.5 border-r border-white/[0.07] bg-[#0C0F12] text-[10px] font-medium text-slate-400 select-none overflow-hidden"
			>
				{icon && <span className="flex shrink-0 text-slate-500">{icon}</span>}
				{label && <span className="truncate">{label}</span>}
			</div>
			{/* 轨道内容区(Demo .trk-b):背景波形 / 空状态提示 / 实际片段都在这里。
			    用 flex 让内部 setNodeRef(rowStyle flex:1)撑满高度,片段竖直定位才正确。 */}
			<div className="relative flex flex-1 overflow-hidden bg-[#0C0F12]">
				{background}
				{isEmpty && hint && (
					<div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-10">
						<span className="text-[11px] text-white/[0.12] font-medium">{hint}</span>
					</div>
				)}
				<div ref={setNodeRef} style={rowStyle}>
					{children}
				</div>
			</div>
		</div>
	);
}
