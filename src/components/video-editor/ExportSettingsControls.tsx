import { Film, Image } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useScopedT } from "@/contexts/I18nContext";
import type { ExportFormat, ExportQuality, GifFrameRate, GifSizePreset } from "@/lib/exporter";
import { GIF_FRAME_RATES, GIF_SIZE_PRESETS } from "@/lib/exporter";
import { cn } from "@/lib/utils";
import { getTestId } from "@/utils/getTestId";

const MP4_EXPORT_SHORT_SIDES = {
	medium: 720,
	good: 1080,
} as const;

export interface ExportSettingsControlsProps {
	exportFormat: ExportFormat;
	onExportFormatChange: (format: ExportFormat) => void;
	exportQuality: ExportQuality;
	onExportQualityChange: (quality: ExportQuality) => void;
	gifFrameRate: GifFrameRate;
	onGifFrameRateChange: (rate: GifFrameRate) => void;
	gifLoop: boolean;
	onGifLoopChange: (loop: boolean) => void;
	gifSizePreset: GifSizePreset;
	onGifSizePresetChange: (preset: GifSizePreset) => void;
	gifOutputDimensions: { width: number; height: number };
	/** 已裁剪后的有效源尺寸(含短边),用于「源画质 / Upscale」提示;无视频时为 null。 */
	sourceDimensions: { width: number; height: number; shortSide: number } | null;
}

/**
 * Inkast 布局优化:导出格式 / 画质 / GIF 选项的配置控件。原本只存在于右侧设置栏的
 * 「导出」面板,现抽成独立组件、放进导出弹窗(ExportDialog),让导出入口收口到唯一一处
 * (顶栏绿色按钮 → 弹窗里选设置 → 导出)。逻辑与原面板完全一致。
 */
export function ExportSettingsControls({
	exportFormat,
	onExportFormatChange,
	exportQuality,
	onExportQualityChange,
	gifFrameRate,
	onGifFrameRateChange,
	gifLoop,
	onGifLoopChange,
	gifSizePreset,
	onGifSizePresetChange,
	gifOutputDimensions,
	sourceDimensions,
}: ExportSettingsControlsProps) {
	const t = useScopedT("settings");

	return (
		<>
			<div className="flex items-center gap-2 mb-3">
				<button
					type="button"
					data-testid={getTestId("mp4-format-button")}
					onClick={() => onExportFormatChange("mp4")}
					className={cn(
						"flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border transition-all text-xs font-medium",
						exportFormat === "mp4"
							? "bg-[#34B27B]/10 border-[#34B27B]/50 text-white"
							: "bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:text-slate-200",
					)}
				>
					<Film className="w-3.5 h-3.5" />
					{t("exportFormat.mp4")}
				</button>
				<button
					type="button"
					data-testid={getTestId("gif-format-button")}
					onClick={() => onExportFormatChange("gif")}
					className={cn(
						"flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border transition-all text-xs font-medium",
						exportFormat === "gif"
							? "bg-[#34B27B]/10 border-[#34B27B]/50 text-white"
							: "bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:text-slate-200",
					)}
				>
					<Image className="w-3.5 h-3.5" />
					{t("exportFormat.gif")}
				</button>
			</div>

			{exportFormat === "mp4" && (
				<div className="mb-3 space-y-1.5">
					{sourceDimensions && (
						<div className="flex items-center justify-between px-0.5 text-[10px] leading-none text-slate-500">
							<span>{t("exportQuality.title")}</span>
							<span>
								Source {sourceDimensions.width}x{sourceDimensions.height}
							</span>
						</div>
					)}
					<div className="bg-white/5 border border-white/5 p-0.5 w-full grid grid-cols-3 h-9 rounded-lg">
						<button
							type="button"
							onClick={() => onExportQualityChange("medium")}
							className={cn(
								"rounded-md transition-all text-[10px] font-medium flex flex-col items-center justify-center leading-none gap-0.5",
								exportQuality === "medium"
									? "bg-white text-black"
									: "text-slate-400 hover:text-slate-200",
							)}
						>
							<span>{t("exportQuality.low")}</span>
							{sourceDimensions && sourceDimensions.shortSide < MP4_EXPORT_SHORT_SIDES.medium && (
								<span
									className={cn(
										"text-[8px] font-medium",
										exportQuality === "medium" ? "text-black/55" : "text-amber-300/80",
									)}
								>
									Upscale
								</span>
							)}
						</button>
						<button
							type="button"
							onClick={() => onExportQualityChange("good")}
							className={cn(
								"rounded-md transition-all text-[10px] font-medium flex flex-col items-center justify-center leading-none gap-0.5",
								exportQuality === "good"
									? "bg-white text-black"
									: "text-slate-400 hover:text-slate-200",
							)}
						>
							<span>{t("exportQuality.medium")}</span>
							{sourceDimensions && sourceDimensions.shortSide < MP4_EXPORT_SHORT_SIDES.good && (
								<span
									className={cn(
										"text-[8px] font-medium",
										exportQuality === "good" ? "text-black/55" : "text-amber-300/80",
									)}
								>
									Upscale
								</span>
							)}
						</button>
						<button
							type="button"
							onClick={() => onExportQualityChange("source")}
							className={cn(
								"rounded-md transition-all text-[10px] font-medium flex flex-col items-center justify-center leading-none gap-0.5",
								exportQuality === "source"
									? "bg-white text-black"
									: "text-slate-400 hover:text-slate-200",
							)}
						>
							<span>{t("exportQuality.high")}</span>
							{sourceDimensions && (
								<span
									className={cn(
										"text-[8px] font-medium",
										exportQuality === "source" ? "text-black/55" : "text-slate-500",
									)}
								>
									{sourceDimensions.shortSide}p
								</span>
							)}
						</button>
					</div>
				</div>
			)}

			{exportFormat === "gif" && (
				<div className="mb-3 space-y-2">
					<div className="flex items-center gap-2">
						<div className="flex-1 bg-white/5 border border-white/5 p-0.5 grid grid-cols-4 h-7 rounded-lg">
							{GIF_FRAME_RATES.map((rate) => (
								<button
									type="button"
									key={rate.value}
									onClick={() => onGifFrameRateChange(rate.value)}
									className={cn(
										"rounded-md transition-all text-[10px] font-medium",
										gifFrameRate === rate.value
											? "bg-white text-black"
											: "text-slate-400 hover:text-slate-200",
									)}
								>
									{rate.value}
								</button>
							))}
						</div>
						<div className="flex-1 bg-white/5 border border-white/5 p-0.5 grid grid-cols-3 h-7 rounded-lg">
							{Object.entries(GIF_SIZE_PRESETS).map(([key, _preset]) => (
								<button
									type="button"
									key={key}
									data-testid={getTestId(`gif-size-button-${key}`)}
									onClick={() => onGifSizePresetChange(key as GifSizePreset)}
									className={cn(
										"rounded-md transition-all text-[10px] font-medium",
										gifSizePreset === key
											? "bg-white text-black"
											: "text-slate-400 hover:text-slate-200",
									)}
								>
									{key === "original" ? "Orig" : key.charAt(0).toUpperCase() + key.slice(1, 3)}
								</button>
							))}
						</div>
					</div>
					<div className="flex items-center justify-between">
						<span className="text-[10px] text-slate-500">
							{gifOutputDimensions.width} × {gifOutputDimensions.height}px
						</span>
						<div className="flex items-center gap-2">
							<span className="text-[10px] text-slate-400">{t("gifSettings.loop")}</span>
							<Switch
								checked={gifLoop}
								onCheckedChange={onGifLoopChange}
								className="data-[state=checked]:bg-[#34B27B] scale-75"
							/>
						</div>
					</div>
				</div>
			)}
		</>
	);
}

export default ExportSettingsControls;
