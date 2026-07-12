import {
	AlertTriangle,
	Archive,
	CheckCircle2,
	FolderOpen,
	HardDriveDownload,
	Loader2,
	Settings2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useScopedT } from "@/contexts/I18nContext";
import type { AppSettings, PickResult } from "@/lib/settingsTypes";

const settings = typeof window !== "undefined" ? window.electronAPI?.settings : undefined;

/**
 * Inkast 整合 · 外部路径设置弹窗(负责人定调:别靠路径指向散落文件、文件被移就坏)。
 * 引擎(video-pipeline)/ 发布目录 / 驾驶舱选题目录三条外部路径在这里查看+重选;选目录后落
 * userData 配置并即时生效(引擎热更 JobManager)。把「文件被改就坏」降为「UI 里点一下重选」。
 */
type RowKey = "engine" | "publishing" | "cockpit";

export function SettingsDialog({
	open,
	onOpenChange,
	onChanged,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	/** 任一路径变更后回调(供外层刷新对应面板)。 */
	onChanged?: (key: RowKey) => void;
}) {
	const t = useScopedT("editor");
	const [data, setData] = useState<AppSettings | null>(null);
	const [pickingKey, setPickingKey] = useState<RowKey | null>(null);
	const [adopting, setAdopting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	// 导出备份(主线三)。
	const [backingUp, setBackingUp] = useState(false);
	const [backupMsg, setBackupMsg] = useState<string | null>(null);

	const refresh = useCallback(async () => {
		if (!settings) return;
		setData(await settings.get());
	}, []);

	useEffect(() => {
		if (open) {
			setError(null);
			refresh();
		}
	}, [open, refresh]);

	const pick = useCallback(
		async (key: RowKey, fn: () => Promise<PickResult>) => {
			setPickingKey(key);
			setError(null);
			const res = await fn();
			setPickingKey(null);
			if (res.canceled) return;
			if (!res.ok) {
				setError(res.error || t("settings.pickFailed"));
				return;
			}
			await refresh();
			onChanged?.(key);
		},
		[refresh, onChanged, t],
	);

	const adopt = useCallback(async () => {
		if (!settings) return;
		setAdopting(true);
		setError(null);
		const res = await settings.adoptEngine();
		setAdopting(false);
		if (!res.ok) {
			setError(res.error || t("settings.adoptFailed"));
			return;
		}
		await refresh();
		onChanged?.("engine");
	}, [refresh, onChanged, t]);

	const exportBackup = useCallback(async () => {
		const api = window.electronAPI?.backup;
		if (!api) return;
		setBackingUp(true);
		setError(null);
		setBackupMsg(null);
		const res = await api.export();
		setBackingUp(false);
		if (res.canceled) return;
		if (!res.ok) {
			setError(res.error || t("settings.backup.failed"));
			return;
		}
		setBackupMsg(t("settings.backup.done", { n: res.files?.length ?? 0 }));
	}, [t]);

	const rows: { key: RowKey; label: string; pickFn: () => Promise<PickResult> }[] = settings
		? [
				{ key: "engine", label: t("settings.engine"), pickFn: settings.pickEngine },
				{ key: "publishing", label: t("settings.publishing"), pickFn: settings.pickPublishing },
				{ key: "cockpit", label: t("settings.cockpit"), pickFn: settings.pickCockpit },
			]
		: [];

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-lg border-white/10 bg-[#0C0F12] text-slate-200">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2 text-[15px] text-slate-100">
						<Settings2 className="h-4 w-4 text-[#3DC489]" />
						{t("settings.title")}
					</DialogTitle>
					<DialogDescription className="text-[12px] text-slate-500">
						{t("settings.desc")}
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-3">
					{rows.map((row) => {
						const info = data?.[row.key];
						return (
							<div
								key={row.key}
								className="space-y-1.5 rounded-lg border border-white/[0.07] bg-[#15181C] p-3"
							>
								<div className="flex items-center gap-2">
									<span className="text-[12px] font-medium text-slate-300">{row.label}</span>
									{info &&
										(info.ok ? (
											<span className="flex items-center gap-1 text-[10.5px] font-medium text-[#3DC489]">
												<CheckCircle2 className="h-3 w-3" />
												{t("settings.ok")}
											</span>
										) : (
											<span className="flex items-center gap-1 text-[10.5px] font-medium text-red-300">
												<AlertTriangle className="h-3 w-3" />
												{t("settings.missing")}
											</span>
										))}
									{info?.source === "env" && (
										<span className="text-[10px] text-amber-300/80">
											{t("settings.envOverride")}
										</span>
									)}
									{row.key === "engine" && info?.managed && (
										<span className="flex items-center gap-1 rounded-full bg-[#34B27B]/[0.14] px-1.5 py-0.5 text-[10px] font-medium text-[#3DC489]">
											<HardDriveDownload className="h-3 w-3" />
											{t("settings.managed")}
										</span>
									)}
								</div>
								<p className="break-all font-mono text-[10.5px] text-slate-500">
									{info?.path ?? "…"}
								</p>
								<div className="flex flex-wrap items-center gap-2">
									<button
										type="button"
										onClick={() => pick(row.key, row.pickFn)}
										disabled={pickingKey === row.key || adopting}
										className="flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.04] px-2.5 py-1.5 text-[11.5px] font-medium text-slate-200 transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
									>
										{pickingKey === row.key ? (
											<Loader2 className="h-3.5 w-3.5 animate-spin" />
										) : (
											<FolderOpen className="h-3.5 w-3.5" />
										)}
										{t("settings.choose")}
									</button>
									{row.key === "engine" && (
										<button
											type="button"
											onClick={adopt}
											disabled={adopting || !info?.ok || info?.managed}
											title={t("settings.adoptHint")}
											className="flex items-center gap-1.5 rounded-lg border border-[#34B27B]/40 bg-[#34B27B]/[0.12] px-2.5 py-1.5 text-[11.5px] font-medium text-[#3DC489] transition-colors hover:bg-[#34B27B]/[0.2] disabled:cursor-not-allowed disabled:opacity-40"
										>
											{adopting ? (
												<Loader2 className="h-3.5 w-3.5 animate-spin" />
											) : (
												<HardDriveDownload className="h-3.5 w-3.5" />
											)}
											{adopting ? t("settings.adopting") : t("settings.adopt")}
										</button>
									)}
								</div>
								{row.key === "engine" && (
									<p className="text-[10px] leading-relaxed text-slate-600">
										{t("settings.adoptHint")}
									</p>
								)}
							</div>
						);
					})}

					{/* 导出备份(主线三):App 状态/配置 → 选定目录(不含媒体文件与密钥)。 */}
					<div className="space-y-1.5 rounded-lg border border-white/[0.07] bg-[#15181C] p-3">
						<div className="flex items-center gap-2">
							<Archive className="h-3.5 w-3.5 text-[#3DC489]" />
							<span className="text-[12px] font-medium text-slate-300">
								{t("settings.backup.title")}
							</span>
						</div>
						<p className="text-[10.5px] leading-relaxed text-slate-600">
							{t("settings.backup.desc")}
						</p>
						<div className="flex flex-wrap items-center gap-2">
							<button
								type="button"
								onClick={exportBackup}
								disabled={backingUp}
								className="flex items-center gap-1.5 rounded-lg border border-[#34B27B]/40 bg-[#34B27B]/[0.12] px-2.5 py-1.5 text-[11.5px] font-medium text-[#3DC489] transition-colors hover:bg-[#34B27B]/[0.2] disabled:cursor-not-allowed disabled:opacity-40"
							>
								{backingUp ? (
									<Loader2 className="h-3.5 w-3.5 animate-spin" />
								) : (
									<Archive className="h-3.5 w-3.5" />
								)}
								{t("settings.backup.export")}
							</button>
							{backupMsg && <span className="text-[10.5px] text-[#3DC489]">{backupMsg}</span>}
						</div>
					</div>

					{error && (
						<p className="rounded-lg bg-red-500/10 px-3 py-2 text-[11px] text-red-300">{error}</p>
					)}
					<p className="text-[10.5px] leading-relaxed text-slate-600">{t("settings.note")}</p>
				</div>
			</DialogContent>
		</Dialog>
	);
}

export default SettingsDialog;
