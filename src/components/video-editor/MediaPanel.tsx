import { FileVideo, ImagePlus, Sparkles, Video, Webcam } from "lucide-react";
import { useScopedT } from "@/contexts/I18nContext";
import { cn } from "@/lib/utils";
import { SmartCutPanel, type SmartCutPanelProps } from "./SmartCutPanel";

export type MediaTab = "media" | "smart";

interface MediaPanelProps {
	activeTab: MediaTab;
	onTabChange: (tab: MediaTab) => void;
	/** 媒体库:当前工程里的素材概览。 */
	sourceName?: string;
	hasWebcam: boolean;
	overlayCount: number;
	onInsertImage?: () => void;
	onInsertVideo?: () => void;
	/** 智能 Tab 内嵌智能粗剪面板(逻辑全复用)。 */
	smartCut: Omit<SmartCutPanelProps, "onClose">;
}

function AssetTile({ icon, label }: { icon: React.ReactNode; label: string }) {
	return (
		<div className="flex items-center gap-2.5 rounded-lg border border-white/[0.06] bg-[#1B1F24] px-3 py-2.5">
			<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#22272D] text-[#3DC489]">
				{icon}
			</div>
			<span className="min-w-0 flex-1 truncate text-[12px] text-slate-200">{label}</span>
		</div>
	);
}

/**
 * Inkast 界面对齐 Phase 3:编辑器左侧面板(对齐 Demo 三栏的素材库 + 顶部功能 Tab)。
 * 顶部 Tab 在「媒体 / 智能」之间切换:
 *  - 媒体 = 列出当前素材 + 「插入图片 / 插入视频」(复用既有叠加插入能力,也可拖进预览)。
 *  - 智能 = 内嵌 Phase 2 的 SmartCutPanel(删停顿 / 删废话 / 字幕)。
 * 文本(标注)、调节(背景/外观)仍在右侧 Inspector —— 那些已有且工作良好,不挪动以降风险。
 */
export function MediaPanel({
	activeTab,
	onTabChange,
	sourceName,
	hasWebcam,
	overlayCount,
	onInsertImage,
	onInsertVideo,
	smartCut,
}: MediaPanelProps) {
	const t = useScopedT("editor");

	const tabs: Array<{ id: MediaTab; label: string; icon: React.ReactNode }> = [
		{ id: "media", label: t("media.tabMedia"), icon: <Video className="h-3.5 w-3.5" /> },
		{ id: "smart", label: t("media.tabSmart"), icon: <Sparkles className="h-3.5 w-3.5" /> },
	];

	return (
		<div className="editor-media-panel flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-white/[0.06] bg-[#15181C]">
			{/* 顶部功能 Tab 条 */}
			<div className="flex shrink-0 items-center gap-1 border-b border-white/[0.07] px-2 py-1.5">
				{tabs.map((tab) => (
					<button
						key={tab.id}
						type="button"
						onClick={() => onTabChange(tab.id)}
						className={cn(
							"flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors",
							activeTab === tab.id
								? tab.id === "smart"
									? "bg-[#34B27B]/[0.14] text-[#3DC489]"
									: "bg-white/[0.08] text-slate-100"
								: "text-slate-400 hover:bg-white/[0.05] hover:text-slate-200",
						)}
					>
						{tab.icon}
						{tab.label}
					</button>
				))}
			</div>

			{activeTab === "smart" ? (
				<div className="min-h-0 flex-1">
					<SmartCutPanel {...smartCut} />
				</div>
			) : (
				<div className="flex min-h-0 flex-1 flex-col overflow-auto custom-scrollbar p-3">
					{/* 插入动作 */}
					<div className="flex gap-2">
						<button
							type="button"
							onClick={onInsertImage}
							disabled={!onInsertImage}
							className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.04] px-2.5 py-2 text-[11.5px] font-medium text-slate-200 transition-colors hover:bg-white/[0.08] disabled:opacity-40"
						>
							<ImagePlus className="h-3.5 w-3.5" />
							{t("media.insertImage")}
						</button>
						<button
							type="button"
							onClick={onInsertVideo}
							disabled={!onInsertVideo}
							className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.04] px-2.5 py-2 text-[11.5px] font-medium text-slate-200 transition-colors hover:bg-white/[0.08] disabled:opacity-40"
						>
							<FileVideo className="h-3.5 w-3.5" />
							{t("media.insertVideo")}
						</button>
					</div>

					{/* 素材列表 */}
					<div className="mt-4 mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
						{t("media.sectionAssets")}
					</div>
					<div className="space-y-2">
						<AssetTile
							icon={<Video className="h-4 w-4" />}
							label={sourceName || t("media.mainVideo")}
						/>
						{hasWebcam && (
							<AssetTile icon={<Webcam className="h-4 w-4" />} label={t("media.webcam")} />
						)}
						{overlayCount > 0 && (
							<AssetTile
								icon={<ImagePlus className="h-4 w-4" />}
								label={t("media.overlays", { count: String(overlayCount) })}
							/>
						)}
					</div>

					<p className="mt-4 text-[10.5px] leading-relaxed text-slate-600">{t("media.dragHint")}</p>
				</div>
			)}
		</div>
	);
}

export default MediaPanel;
