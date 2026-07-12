import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useScopedT } from "@/contexts/I18nContext";
import type { OverlayClipRegion } from "./types";

// Inkast §3 Phase 2:选中视频叠加层时的右侧『画面』面板(位置/宽度/不透明度/居中/删除)。
// 复用 Phase 1 图片叠加的 overlay.* 文案与控件风格。

interface OverlayClipSettingsPanelProps {
	region: OverlayClipRegion;
	onPositionChange: (position: { x: number; y: number }) => void;
	onSizeChange: (size: { width: number; height: number }) => void;
	onOpacityChange: (opacity: number) => void;
	onDelete: () => void;
}

export function OverlayClipSettingsPanel({
	region,
	onPositionChange,
	onSizeChange,
	onOpacityChange,
	onDelete,
}: OverlayClipSettingsPanelProps) {
	const t = useScopedT("settings");
	const fileName = region.sourcePath.split(/[\\/]/).pop() ?? region.sourcePath;

	return (
		<div className="min-w-0 flex h-full flex-col overflow-y-auto custom-scrollbar p-4">
			<div className="mb-4">
				<span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
					{t("overlay.videoTitle")}
				</span>
				<div className="mt-1 truncate text-sm font-semibold text-slate-100" title={fileName}>
					{fileName}
				</div>
			</div>

			<div className="space-y-2.5">
				<div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
					{t("overlay.transform")}
				</div>
				<div className="grid grid-cols-3 gap-2">
					<div className="space-y-1">
						<span className="text-[10px] text-slate-500">{t("overlay.posX")}</span>
						<div className="flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1">
							<input
								type="number"
								value={Math.round(region.position.x)}
								onChange={(e) => {
									const w = region.size.width;
									const x = Math.max(0, Math.min(100 - w, Number(e.target.value) || 0));
									onPositionChange({ x, y: region.position.y });
								}}
								className="w-full bg-transparent text-right text-xs text-slate-200 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
							/>
							<span className="text-[10px] text-slate-500">%</span>
						</div>
					</div>
					<div className="space-y-1">
						<span className="text-[10px] text-slate-500">{t("overlay.posY")}</span>
						<div className="flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1">
							<input
								type="number"
								value={Math.round(region.position.y)}
								onChange={(e) => {
									const h = region.size.height;
									const y = Math.max(
										0,
										Math.min(Math.max(0, 100 - h), Number(e.target.value) || 0),
									);
									onPositionChange({ x: region.position.x, y });
								}}
								className="w-full bg-transparent text-right text-xs text-slate-200 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
							/>
							<span className="text-[10px] text-slate-500">%</span>
						</div>
					</div>
					<div className="space-y-1">
						<span className="text-[10px] text-slate-500">{t("overlay.width")}</span>
						<div className="flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1">
							<input
								type="number"
								value={Math.round(region.size.width)}
								onChange={(e) => {
									const oldW = region.size.width || 1;
									const newW = Math.max(5, Math.min(100, Number(e.target.value) || 0));
									const newH = Math.max(
										3,
										Math.min(100, (region.size.height || oldW) * (newW / oldW)),
									);
									onSizeChange({ width: newW, height: newH });
								}}
								className="w-full bg-transparent text-right text-xs text-slate-200 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
							/>
							<span className="text-[10px] text-slate-500">%</span>
						</div>
					</div>
				</div>
				<Button
					variant="outline"
					size="sm"
					onClick={() =>
						onPositionChange({
							x: 50 - region.size.width / 2,
							y: 50 - region.size.height / 2,
						})
					}
					className="h-7 w-full border-white/10 bg-white/5 text-xs text-slate-200 hover:bg-white/10"
				>
					{t("overlay.center")}
				</Button>
			</div>

			<div className="mt-4 space-y-1.5">
				<div className="flex items-center justify-between">
					<span className="text-[11px] text-slate-400">{t("overlay.opacity")}</span>
					<span className="text-[11px] tabular-nums text-slate-200">
						{Math.round((region.opacity ?? 1) * 100)}%
					</span>
				</div>
				<input
					type="range"
					min={10}
					max={100}
					value={Math.round((region.opacity ?? 1) * 100)}
					onChange={(e) => onOpacityChange(Number(e.target.value) / 100)}
					className="w-full accent-[#34B27B]"
				/>
			</div>

			<Button
				variant="outline"
				size="sm"
				onClick={onDelete}
				className="mt-5 h-8 w-full gap-1.5 border-red-500/30 bg-red-500/10 text-xs text-red-400 hover:bg-red-500/20"
			>
				<Trash2 className="h-3.5 w-3.5" />
				{t("overlay.deleteClip")}
			</Button>

			<p className="mt-3 text-[11px] leading-relaxed text-slate-500">{t("overlay.clipHint")}</p>
		</div>
	);
}
