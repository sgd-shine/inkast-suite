import {
	AlertTriangle,
	ChevronDown,
	ChevronRight,
	Clock,
	FolderInput,
	FolderOpen,
	Loader2,
	Pencil,
	RefreshCw,
	Save,
	Trash2,
	Type,
	X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useScopedT } from "@/contexts/I18nContext";
import {
	isEditablePath,
	isValidRename,
	MOVABLE_STAGES,
	type PublishBoardResult,
	type PublishItem,
	type PublishMovePair,
	type PublishMut,
	type PublishStage,
	STAGE_ORDER,
} from "@/lib/publishBoard";
import { cn } from "@/lib/utils";

const board = typeof window !== "undefined" ? window.electronAPI?.publishBoard : undefined;

/**
 * Inkast 整合 · 发布看板。扫 KnowledgePlanet/Operations/Publishing 文件系统,把图文稿按
 * 发布流水线分格 + 计数 + 停太久告警;并支持稿件文件管理(编辑/重命名/阶段间移动/删除→废纸篓)。
 * 分类规则在 src/lib/publishBoard.ts 的单一映射表;写操作全过主进程路径白名单,只动 Publishing 内。
 */
const STAGE_TONE: Record<PublishStage, string> = {
	candidate: "text-slate-300 border-white/[0.12]",
	draft: "text-sky-300 border-sky-500/30",
	ready: "text-amber-300 border-amber-500/30",
	published: "text-[#3DC489] border-[#34B27B]/30",
	uncategorized: "text-red-300 border-red-500/40",
};

const STAGE_DOT: Record<PublishStage, string> = {
	candidate: "bg-slate-400",
	draft: "bg-sky-400",
	ready: "bg-amber-400",
	published: "bg-[#34B27B]",
	uncategorized: "bg-red-400",
};

type T = (key: string, vars?: Record<string, string | number>) => string;
type ActionKind = "edit" | "rename" | "move" | "delete";

function baseName(p: string): string {
	return p.split("/").pop() ?? p;
}

const DAY_MS = 86_400_000;
/** 距上次修改的天数(整数)。用于"停留 N 天"显示与排序,比布尔 stale 更细。 */
function daysSince(modifiedMs: number, now: number): number {
	return Math.max(0, Math.floor((now - modifiedMs) / DAY_MS));
}

/** 列内二级分组:按相对目录末段(如 Drafts/场景拆解 → 场景拆解)。治理一列上百篇的密度爆炸。 */
function groupByRelDir(items: PublishItem[]): { label: string; items: PublishItem[] }[] {
	const map = new Map<string, PublishItem[]>();
	for (const it of items) {
		const label = it.relDir.split("/").slice(1).join("/") || it.relDir || "·";
		const arr = map.get(label) ?? [];
		arr.push(it);
		map.set(label, arr);
	}
	// 组按"组内最新修改"降序,让最近活跃的题材排在上面。
	return [...map.entries()]
		.map(([label, list]) => ({ label, items: list }))
		.sort(
			(a, b) =>
				Math.max(...b.items.map((i) => i.modifiedMs)) -
				Math.max(...a.items.map((i) => i.modifiedMs)),
		);
}

export function PublishPanel() {
	const t = useScopedT("editor");
	const [res, setRes] = useState<PublishBoardResult | null>(null);
	const [loading, setLoading] = useState(false);
	const [action, setAction] = useState<{ kind: ActionKind; item: PublishItem } | null>(null);
	const [preview, setPreview] = useState<PublishItem | null>(null);
	// 折叠的二级分组(key = `${stage}/${label}`);默认展开。
	const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
	// 批量选择(按 item.key);非空时显示批量操作条。
	const [selected, setSelected] = useState<Set<string>>(() => new Set());
	const [batchBusy, setBatchBusy] = useState(false);
	const [batchError, setBatchError] = useState<string | null>(null);
	// "现在"用于算停留天数;每次渲染取一次足够(看板是手动刷新的)。
	const now = Date.now();

	const load = useCallback(async () => {
		if (!board) return;
		setLoading(true);
		setRes(await board.list());
		setLoading(false);
	}, []);

	useEffect(() => {
		load();
	}, [load]);

	const total = useMemo(() => (res?.stages ?? []).reduce((n, s) => n + s.count, 0), [res]);
	// 全库停太久总数(跨阶段汇总,供总览一眼看全局)。
	const staleTotal = useMemo(
		() => (res?.stages ?? []).reduce((n, s) => n + s.items.filter((i) => i.stale).length, 0),
		[res],
	);
	// 总览板块用的轻量统计(随渲染算,够便宜)。
	const stageCount = (st: PublishStage) => res?.stages.find((s) => s.stage === st)?.count ?? 0;
	const weekPublished = (res?.stages.find((s) => s.stage === "published")?.items ?? []).filter(
		(i) => i.modifiedMs >= now - 7 * DAY_MS,
	).length;
	const maxStaleDays = (res?.stages ?? [])
		.filter((s) => s.stage !== "published" && s.stage !== "uncategorized")
		.flatMap((s) => s.items)
		.reduce((mx, i) => Math.max(mx, daysSince(i.modifiedMs, now)), 0);
	const toggleGroup = useCallback((gkey: string) => {
		setCollapsed((prev) => {
			const next = new Set(prev);
			next.has(gkey) ? next.delete(gkey) : next.add(gkey);
			return next;
		});
	}, []);
	const toggleSelect = useCallback((key: string) => {
		setSelected((prev) => {
			const next = new Set(prev);
			next.has(key) ? next.delete(key) : next.add(key);
			return next;
		});
	}, []);
	const clearSelection = useCallback(() => setSelected(new Set()), []);

	// 选中项的全部产物路径(批量 move/trash 用;后端 IPC 已接受数组)。
	const selectedFiles = useMemo(() => {
		const files: string[] = [];
		for (const s of res?.stages ?? [])
			for (const it of s.items) if (selected.has(it.key)) files.push(...it.files);
		return files;
	}, [res, selected]);

	// 移动后的撤销条:真撤销 —— 把文件精确移回原位置(含子目录)。8s 给足反应时间。
	const showMoveUndo = useCallback(
		(pairs: PublishMovePair[]) => {
			if (!pairs.length) return;
			toast(t("publish.undo.moved", { n: pairs.length }), {
				duration: 8000,
				action: {
					label: t("publish.undo.undo"),
					onClick: async () => {
						const r = await board?.revertMove(pairs);
						if (r && !r.ok) toast.error(r.error || t("publish.actions.failed"));
						load();
					},
				},
			});
		},
		[t, load],
	);
	// 删除(→废纸篓)后的提示条:trashItem 无可靠还原 API,不假装能撤销,只给「打开废纸篓」让用户自己恢复(诚实)。
	const showTrashUndo = useCallback(() => {
		toast(t("publish.undo.trashed"), {
			duration: 8000,
			action: {
				label: t("publish.undo.openTrash"),
				onClick: async () => {
					const r = await board?.openTrash();
					if (r && !r.ok) toast.error(r.error || t("publish.actions.failed"));
				},
			},
		});
	}, [t]);

	const runBatch = useCallback(
		async <T,>(
			fn: () => Promise<PublishMut<T>> | undefined,
		): Promise<PublishMut<T> | undefined> => {
			setBatchBusy(true);
			setBatchError(null);
			const r = await fn();
			setBatchBusy(false);
			if (r && !r.ok) {
				setBatchError(r.error || t("publish.actions.failed"));
				return undefined;
			}
			clearSelection();
			load();
			return r ?? undefined;
		},
		[clearSelection, load, t],
	);

	return (
		<div className="flex h-full w-full flex-col overflow-hidden bg-[#0A0C0E]">
			{/* 头部 */}
			<div className="flex shrink-0 items-center gap-3 border-b border-white/[0.07] bg-[#0C0F12] px-5 py-2.5">
				<span className="text-[13px] font-semibold text-slate-100">{t("publish.title")}</span>
				{res?.ok && (
					<span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] font-medium text-slate-300">
						{t("publish.total", { n: total })}
					</span>
				)}
				{res?.ok && res.uncategorizedCount > 0 && (
					<span className="flex items-center gap-1 rounded-full bg-red-500/[0.12] px-2 py-0.5 text-[11px] font-medium text-red-300">
						<AlertTriangle className="h-3 w-3" />
						{t("publish.uncategorizedWarn", { n: res.uncategorizedCount })}
					</span>
				)}
				{res?.ok && staleTotal > 0 && (
					<span className="flex items-center gap-1 rounded-full bg-amber-500/[0.12] px-2 py-0.5 text-[11px] font-medium text-amber-300">
						<Clock className="h-3 w-3" />
						{t("publish.staleTotal", { n: staleTotal })}
					</span>
				)}
				<span className="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-600">
					{res?.publishingDir}
				</span>
				<button
					type="button"
					onClick={load}
					disabled={loading}
					className="rounded-md p-1 text-slate-500 hover:bg-white/[0.06] hover:text-slate-300 disabled:opacity-40"
					title={t("publish.refresh")}
				>
					<RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
				</button>
			</div>

			{/* 总览板块:发布流水线漏斗 + 本周发布 + 最久停留(一眼看全局健康)。 */}
			{res?.ok && total > 0 && (
				<div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-white/[0.05] bg-[#0A0C0E] px-5 py-1.5 text-[11px]">
					{(["candidate", "draft", "ready", "published"] as PublishStage[]).map((st, i) => (
						<span key={st} className="flex items-center gap-1">
							{i > 0 && <span className="mr-1 text-slate-700">→</span>}
							<span className={cn("h-1.5 w-1.5 rounded-full", STAGE_DOT[st])} />
							<span className="text-slate-400">{t(`publish.stages.${st}`)}</span>
							<span className="font-semibold text-slate-200">{stageCount(st)}</span>
						</span>
					))}
					<span className="flex-1" />
					<span className="text-slate-500">
						{t("publish.overview.weekPublished", { n: weekPublished })}
					</span>
					{maxStaleDays > 0 && (
						<span className="text-amber-400/80">
							{t("publish.overview.oldest", { n: maxStaleDays })}
						</span>
					)}
				</div>
			)}

			{/* 批量操作条:有选中项时出现。移动到阶段 / 删除→废纸篓 / 取消选择。后端 IPC 已接受数组。 */}
			{selected.size > 0 && (
				<div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[#34B27B]/20 bg-[#34B27B]/[0.06] px-5 py-2 text-[11.5px]">
					<span className="font-medium text-[#3DC489]">
						{t("publish.batch.selected", { n: selected.size })}
					</span>
					<span className="text-slate-500">{t("publish.batch.moveTo")}</span>
					{MOVABLE_STAGES.map((st) => (
						<button
							key={st}
							type="button"
							disabled={batchBusy}
							onClick={async () => {
								const r = await runBatch(() => board?.move(selectedFiles, st));
								if (r?.ok && "data" in r && Array.isArray(r.data)) showMoveUndo(r.data);
							}}
							className="rounded-md border border-white/[0.12] bg-white/[0.04] px-2 py-1 font-medium text-slate-200 transition-colors hover:bg-white/[0.1] disabled:opacity-40"
						>
							{t(`publish.stages.${st}`)}
						</button>
					))}
					<button
						type="button"
						disabled={batchBusy}
						onClick={async () => {
							const r = await runBatch(() => board?.trash(selectedFiles));
							if (r?.ok) showTrashUndo();
						}}
						className="flex items-center gap-1 rounded-md border border-red-500/30 bg-red-500/[0.08] px-2 py-1 font-medium text-red-300 transition-colors hover:bg-red-500/[0.16] disabled:opacity-40"
					>
						<Trash2 className="h-3 w-3" />
						{t("publish.batch.delete")}
					</button>
					<span className="flex-1" />
					{batchError && <span className="text-red-300">{batchError}</span>}
					{batchBusy && <Loader2 className="h-3.5 w-3.5 animate-spin text-[#3DC489]" />}
					<button
						type="button"
						onClick={clearSelection}
						className="text-slate-400 hover:text-slate-200"
					>
						{t("publish.batch.clear")}
					</button>
				</div>
			)}

			{/* 内容 */}
			<div className="min-h-0 flex-1 overflow-hidden p-4">
				{!res ? (
					<div className="flex h-full gap-3 overflow-hidden">
						{STAGE_ORDER.slice(0, 4).map((s) => (
							<div
								key={s}
								className="flex min-w-[248px] flex-1 flex-col gap-1.5 rounded-xl border border-white/[0.06] bg-[#0C0F12] p-2"
							>
								{Array.from({ length: 4 }, (_, i) => (
									<div
										key={`${s}-sk-${i}`}
										className="h-14 animate-pulse rounded-lg bg-white/[0.04]"
									/>
								))}
							</div>
						))}
					</div>
				) : !res.ok ? (
					<div className="mx-auto mt-10 max-w-lg space-y-3 text-center">
						<AlertTriangle className="mx-auto h-8 w-8 text-amber-400" />
						<h2 className="text-[14px] font-semibold text-slate-100">{t("publish.errorTitle")}</h2>
						<p className="text-[12px] text-red-300">{res.error}</p>
						<p className="font-mono text-[11px] text-slate-600">{res.publishingDir}</p>
						<p className="text-[11px] leading-relaxed text-slate-500">{t("publish.dirHint")}</p>
						{window.electronAPI?.settings && (
							<button
								type="button"
								onClick={async () => {
									const r = await window.electronAPI?.settings?.pickPublishing();
									if (r?.ok) load();
								}}
								className="mx-auto flex items-center gap-1.5 rounded-lg border border-[#34B27B]/40 bg-[#34B27B]/[0.12] px-3 py-1.5 text-[11.5px] font-medium text-[#3DC489] transition-colors hover:bg-[#34B27B]/[0.2]"
							>
								<FolderOpen className="h-3.5 w-3.5" />
								{t("settings.choose")}
							</button>
						)}
					</div>
				) : (
					<div className="flex h-full gap-3 overflow-x-auto custom-scrollbar">
						{STAGE_ORDER.map((stage) => {
							const group = res.stages.find((g) => g.stage === stage);
							const count = group?.count ?? 0;
							// 未分类为空时不占列(没有"未分类"是正常态)。
							if (stage === "uncategorized" && count === 0) return null;
							const groups = group ? groupByRelDir(group.items) : [];
							// 单一分组时不显示分组头(避免冗余);多分组时用可折叠的二级分组治理密度。
							const showGroups = groups.length > 1;
							return (
								<div
									key={stage}
									className="flex min-w-[248px] flex-1 flex-col overflow-hidden rounded-xl border border-white/[0.06] bg-[#0C0F12]"
								>
									<div
										className={cn("flex items-center gap-2 border-b px-3 py-2", STAGE_TONE[stage])}
									>
										<span className={cn("h-2 w-2 rounded-full", STAGE_DOT[stage])} />
										<span className="text-[12px] font-semibold">
											{t(`publish.stages.${stage}`)}
										</span>
										<span className="ml-auto text-[11px] font-medium opacity-80">{count}</span>
									</div>
									<div className="min-h-0 flex-1 space-y-1.5 overflow-auto p-2 custom-scrollbar">
										{count === 0 ? (
											<div className="mt-6 flex flex-col items-center gap-1.5 text-center text-slate-600">
												<FolderOpen className="h-5 w-5 opacity-40" />
												<p className="text-[11px]">{t("publish.stageEmpty")}</p>
											</div>
										) : showGroups ? (
											groups.map((g) => {
												const gkey = `${stage}/${g.label}`;
												const open = !collapsed.has(gkey);
												return (
													<div key={gkey}>
														<button
															type="button"
															onClick={() => toggleGroup(gkey)}
															className="flex w-full items-center gap-1 rounded px-1 py-1 text-left text-[10.5px] font-medium text-slate-400 hover:bg-white/[0.04]"
														>
															{open ? (
																<ChevronDown className="h-3 w-3 shrink-0" />
															) : (
																<ChevronRight className="h-3 w-3 shrink-0" />
															)}
															<span className="min-w-0 flex-1 truncate">{g.label}</span>
															<span className="text-slate-600">{g.items.length}</span>
														</button>
														{open && (
															<div className="space-y-1.5 pb-1">
																{g.items.map((it) => (
																	<ItemRow
																		key={it.key}
																		item={it}
																		t={t}
																		now={now}
																		selected={selected.has(it.key)}
																		onToggleSelect={() => toggleSelect(it.key)}
																		onAction={(kind) => setAction({ kind, item: it })}
																		onPreview={() => setPreview(it)}
																	/>
																))}
															</div>
														)}
													</div>
												);
											})
										) : (
											group?.items.map((it) => (
												<ItemRow
													key={it.key}
													item={it}
													t={t}
													now={now}
													selected={selected.has(it.key)}
													onToggleSelect={() => toggleSelect(it.key)}
													onAction={(kind) => setAction({ kind, item: it })}
													onPreview={() => setPreview(it)}
												/>
											))
										)}
									</div>
								</div>
							);
						})}
					</div>
				)}
			</div>

			{preview && <PreviewDrawer item={preview} t={t} onClose={() => setPreview(null)} />}

			{action && (
				<FileActionModal
					kind={action.kind}
					item={action.item}
					t={t}
					onClose={() => setAction(null)}
					onDone={() => {
						setAction(null);
						load();
					}}
					onMoved={showMoveUndo}
					onTrashed={showTrashUndo}
				/>
			)}
		</div>
	);
}

function ItemRow({
	item,
	t,
	now,
	selected,
	onToggleSelect,
	onAction,
	onPreview,
}: {
	item: PublishItem;
	t: T;
	now: number;
	selected: boolean;
	onToggleSelect: () => void;
	onAction: (kind: ActionKind) => void;
	onPreview: () => void;
}) {
	const editable = isEditablePath(item.primaryPath);
	const iconBtn =
		"rounded p-1 text-slate-500 transition-colors hover:bg-white/[0.08] hover:text-slate-200 disabled:opacity-30 disabled:hover:bg-transparent";
	const days = daysSince(item.modifiedMs, now);
	const tags = item.meta?.tags?.slice(0, 2) ?? [];
	return (
		<div
			className={cn(
				"group flex flex-col gap-1 rounded-lg border bg-[#15181C] px-2.5 py-2",
				selected ? "border-[#34B27B]/50 bg-[#34B27B]/[0.06]" : "border-white/[0.05]",
			)}
		>
			<div className="flex w-full items-start gap-1.5">
				{/* 批量选择复选框:选中或 hover 时显示,避免常态杂乱。 */}
				<input
					type="checkbox"
					checked={selected}
					onChange={onToggleSelect}
					aria-label="select"
					className={cn(
						"mt-0.5 shrink-0 accent-[#34B27B] transition-opacity",
						selected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
					)}
				/>
				<button
					type="button"
					onClick={onPreview}
					title={t("publish.previewTip")}
					className="flex min-w-0 flex-1 items-start gap-1.5 text-left"
				>
					{item.stale && (
						<Clock className="mt-0.5 h-3 w-3 shrink-0 text-amber-400" aria-label="stale" />
					)}
					<span className="min-w-0 flex-1 break-words text-[11.5px] font-medium leading-snug text-slate-200">
						{item.title}
					</span>
				</button>
			</div>
			{item.meta?.summary && (
				<p className="line-clamp-2 text-[10.5px] leading-snug text-slate-500">
					{item.meta.summary}
				</p>
			)}
			{(item.meta?.topicType || item.meta?.section || tags.length > 0) && (
				<div className="flex flex-wrap items-center gap-1">
					{item.meta?.topicType && (
						<span className="rounded bg-[#34B27B]/[0.14] px-1.5 py-0.5 text-[9.5px] font-medium text-[#3DC489]">
							{item.meta.topicType}
						</span>
					)}
					{item.meta?.section && (
						<span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[9.5px] text-slate-400">
							{item.meta.section}
						</span>
					)}
					{tags.map((tag) => (
						<span key={tag} className="text-[9.5px] text-slate-600">
							#{tag}
						</span>
					))}
				</div>
			)}
			<div className="flex items-center gap-2 text-[10px] text-slate-500">
				{item.date && <span>{item.date}</span>}
				{item.files.length > 1 && (
					<span className="rounded bg-white/[0.06] px-1 py-0.5">×{item.files.length}</span>
				)}
				{item.stale && (
					<span className={cn(days >= 30 ? "text-red-400/90" : "text-amber-400/80")}>
						{t("publish.staleDays", { n: days })}
					</span>
				)}
				{/* 操作区:hover 显示。编辑/重命名/移动/删除。 */}
				<div className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
					<button
						type="button"
						className={iconBtn}
						title={editable ? t("publish.actions.edit") : t("publish.actions.notEditable")}
						disabled={!editable}
						onClick={() => onAction("edit")}
					>
						<Pencil className="h-3 w-3" />
					</button>
					<button
						type="button"
						className={iconBtn}
						title={t("publish.actions.rename")}
						onClick={() => onAction("rename")}
					>
						<Type className="h-3 w-3" />
					</button>
					<button
						type="button"
						className={iconBtn}
						title={t("publish.actions.move")}
						onClick={() => onAction("move")}
					>
						<FolderInput className="h-3 w-3" />
					</button>
					<button
						type="button"
						className={cn(iconBtn, "hover:text-red-300")}
						title={t("publish.actions.delete")}
						onClick={() => onAction("delete")}
					>
						<Trash2 className="h-3 w-3" />
					</button>
					<button
						type="button"
						className={iconBtn}
						title={t("publish.open")}
						onClick={() => board?.open(item.primaryPath)}
					>
						<FolderOpen className="h-3 w-3" />
					</button>
				</div>
			</div>
		</div>
	);
}

function FileActionModal({
	kind,
	item,
	t,
	onClose,
	onDone,
	onMoved,
	onTrashed,
}: {
	kind: ActionKind;
	item: PublishItem;
	t: T;
	onClose: () => void;
	onDone: () => void;
	onMoved?: (pairs: PublishMovePair[]) => void;
	onTrashed?: () => void;
}) {
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [content, setContent] = useState<string | null>(null);
	const [newName, setNewName] = useState(() => baseName(item.primaryPath));

	// 编辑:打开即读 primaryPath 内容。
	useEffect(() => {
		if (kind !== "edit" || !board) return;
		let alive = true;
		board.read(item.primaryPath).then((r) => {
			if (!alive) return;
			if (r.ok) setContent(r.data);
			else setError(r.error);
		});
		return () => {
			alive = false;
		};
	}, [kind, item.primaryPath]);

	// Escape 关闭:挂 window 而非 backdrop div —— delete/move 弹窗内无可聚焦元素,键盘事件
	// 到不了 backdrop;挂 window 对四类弹窗都生效(对抗审查发现 backdrop onKeyDown 对 delete/move 失效)。
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	const run = useCallback(
		async (
			fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>,
		): Promise<{ ok: boolean; error?: string; data?: unknown }> => {
			setBusy(true);
			setError(null);
			const r = await fn();
			setBusy(false);
			if (r.ok) onDone();
			else setError(r.error || t("publish.actions.failed"));
			return r;
		},
		[onDone, t],
	);

	const titleMap: Record<ActionKind, string> = {
		edit: t("publish.actions.editTitle"),
		rename: t("publish.actions.renameTitle"),
		move: t("publish.actions.moveTitle"),
		delete: t("publish.actions.deleteTitle"),
	};

	return (
		<div
			className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
			onClick={onClose}
		>
			<div
				className={cn(
					"flex max-h-full w-full flex-col overflow-hidden rounded-xl border border-white/[0.1] bg-[#0C0F12] shadow-2xl",
					kind === "edit" ? "max-w-3xl" : "max-w-md",
				)}
				onClick={(e) => e.stopPropagation()}
			>
				<div className="flex shrink-0 items-center gap-2 border-b border-white/[0.07] px-4 py-3">
					<span className="text-[13px] font-semibold text-slate-100">{titleMap[kind]}</span>
					<span className="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-500">
						{baseName(item.primaryPath)}
					</span>
					<button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-200">
						<X className="h-4 w-4" />
					</button>
				</div>

				<div className="min-h-0 flex-1 overflow-auto p-4">
					{kind === "edit" &&
						// 三态:有内容→textarea;读取失败(content 仍 null + error)→不渲染编辑框(下方有错误条),
						// 避免把"读失败"伪装成"空文件"诱导用户输入;否则→加载态。
						(content !== null ? (
							<textarea
								value={content}
								onChange={(e) => setContent(e.target.value)}
								spellCheck={false}
								className="h-[55vh] w-full resize-none rounded-lg border border-white/[0.1] bg-[#15181C] p-3 font-mono text-[12px] leading-relaxed text-slate-200 outline-none focus:border-[#34B27B]/40"
							/>
						) : error ? null : (
							<div className="flex items-center justify-center gap-2 py-8 text-[12px] text-slate-500">
								<Loader2 className="h-4 w-4 animate-spin" />
								{t("publish.actions.loading")}
							</div>
						))}

					{kind === "rename" && (
						<div className="space-y-2">
							<p className="text-[12px] text-slate-400">{t("publish.actions.renameHint")}</p>
							<input
								value={newName}
								onChange={(e) => setNewName(e.target.value)}
								className="w-full rounded-lg border border-white/[0.1] bg-[#15181C] px-3 py-2 text-[12px] text-slate-200 outline-none focus:border-[#34B27B]/40"
							/>
						</div>
					)}

					{kind === "move" && (
						<div className="space-y-2">
							<p className="text-[12px] text-slate-400">{t("publish.actions.moveHint")}</p>
							<div className="flex flex-col gap-1.5">
								{MOVABLE_STAGES.filter((s) => s !== item.stage).map((s) => (
									<button
										key={s}
										type="button"
										disabled={busy}
										onClick={async () => {
											const r = await run(
												() => board?.move(item.files, s) ?? Promise.resolve({ ok: false }),
											);
											if (r.ok && Array.isArray(r.data)) onMoved?.(r.data as PublishMovePair[]);
										}}
										className="flex items-center gap-2 rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-left text-[12px] text-slate-200 transition-colors hover:bg-white/[0.08] disabled:opacity-40"
									>
										<FolderInput className="h-3.5 w-3.5 text-[#3DC489]" />
										{t(`publish.stages.${s}`)}
									</button>
								))}
							</div>
						</div>
					)}

					{kind === "delete" && (
						<div className="space-y-2">
							<p className="text-[12px] leading-relaxed text-slate-300">
								{t("publish.actions.deleteConfirm", { n: item.files.length })}
							</p>
							<p className="text-[11px] text-slate-500">{t("publish.actions.deleteToTrash")}</p>
						</div>
					)}

					{error && (
						<div className="mt-3 flex items-start gap-1.5 rounded-lg bg-red-500/10 px-3 py-2 text-[11px] text-red-300">
							<AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
							<span>{error}</span>
						</div>
					)}
				</div>

				{/* 底部操作(move 在上面列表里直接触发,这里只放 edit/rename/delete 的确认) */}
				{kind !== "move" && (
					<div className="flex shrink-0 items-center justify-end gap-2 border-t border-white/[0.07] px-4 py-3">
						<button
							type="button"
							onClick={onClose}
							className="rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-[11.5px] font-medium text-slate-300 transition-colors hover:bg-white/[0.08]"
						>
							{t("publish.actions.cancel")}
						</button>
						{kind === "edit" && (
							<button
								type="button"
								disabled={busy || content === null}
								onClick={() =>
									run(
										() =>
											board?.write(item.primaryPath, content ?? "") ??
											Promise.resolve({ ok: false }),
									)
								}
								className="flex items-center gap-1.5 rounded-lg bg-[#34B27B] px-3 py-1.5 text-[11.5px] font-semibold text-[#06140d] transition-colors hover:bg-[#34B27B]/90 disabled:opacity-40"
							>
								{busy ? (
									<Loader2 className="h-3.5 w-3.5 animate-spin" />
								) : (
									<Save className="h-3.5 w-3.5" />
								)}
								{t("publish.actions.save")}
							</button>
						)}
						{kind === "rename" && (
							<button
								type="button"
								disabled={busy || !isValidRename(newName)}
								onClick={() =>
									run(
										() =>
											board?.rename(item.primaryPath, newName.trim()) ??
											Promise.resolve({ ok: false }),
									)
								}
								className="rounded-lg bg-[#34B27B] px-3 py-1.5 text-[11.5px] font-semibold text-[#06140d] transition-colors hover:bg-[#34B27B]/90 disabled:opacity-40"
							>
								{t("publish.actions.confirm")}
							</button>
						)}
						{kind === "delete" && (
							<button
								type="button"
								disabled={busy}
								onClick={async () => {
									const r = await run(
										() => board?.trash(item.files) ?? Promise.resolve({ ok: false }),
									);
									if (r.ok) onTrashed?.();
								}}
								className="flex items-center gap-1.5 rounded-lg bg-red-500/90 px-3 py-1.5 text-[11.5px] font-semibold text-white transition-colors hover:bg-red-500 disabled:opacity-40"
							>
								{busy ? (
									<Loader2 className="h-3.5 w-3.5 animate-spin" />
								) : (
									<Trash2 className="h-3.5 w-3.5" />
								)}
								{t("publish.actions.delete")}
							</button>
						)}
					</div>
				)}
			</div>
		</div>
	);
}

/** 站内只读预览抽屉:点卡片在右侧看一眼正文,不打断监控流(复用后端 publishBoard:read)。 */
function PreviewDrawer({ item, t, onClose }: { item: PublishItem; t: T; onClose: () => void }) {
	const [content, setContent] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let alive = true;
		setContent(null);
		setError(null);
		if (!isEditablePath(item.primaryPath)) {
			setError(t("publish.previewBinary"));
			return;
		}
		board?.read(item.primaryPath).then((r) => {
			if (!alive) return;
			if (r.ok) setContent(r.data);
			else setError(r.error || t("publish.previewFailed"));
		});
		return () => {
			alive = false;
		};
	}, [item.primaryPath, t]);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	return (
		<div className="absolute inset-0 z-40 flex justify-end bg-black/50" onClick={onClose}>
			<div
				className="flex h-full w-[460px] max-w-[88%] flex-col border-l border-white/[0.1] bg-[#0C0F12] shadow-2xl"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="flex shrink-0 items-center gap-2 border-b border-white/[0.07] px-4 py-3">
					<span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-slate-100">
						{item.title}
					</span>
					<button
						type="button"
						onClick={() => board?.open(item.primaryPath)}
						title={t("publish.open")}
						className="text-slate-500 hover:text-slate-200"
					>
						<FolderOpen className="h-4 w-4" />
					</button>
					<button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-200">
						<X className="h-4 w-4" />
					</button>
				</div>
				<div className="custom-scrollbar min-h-0 flex-1 overflow-auto p-4">
					{content !== null ? (
						<pre className="whitespace-pre-wrap font-sans text-[12px] leading-relaxed text-slate-300">
							{content}
						</pre>
					) : error ? (
						<p className="text-[12px] text-amber-300/90">{error}</p>
					) : (
						<div className="flex items-center justify-center gap-2 py-8 text-[12px] text-slate-500">
							<Loader2 className="h-4 w-4 animate-spin" />
							{t("publish.actions.loading")}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

export default PublishPanel;
