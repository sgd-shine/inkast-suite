import {
	Film,
	Loader2,
	Megaphone,
	Quote,
	ScanSearch,
	Search,
	Sparkles,
	Video,
	X,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import {
	queryTerms,
	type SearchDoc,
	type SearchHit,
	type SearchKind,
	searchDocs,
	snippet,
} from "@/lib/searchIndex";

const KIND_ICON: Record<SearchKind, ReactNode> = {
	topic: <Sparkles className="h-3.5 w-3.5 text-[#3DC489]" />,
	opinion: <Quote className="h-3.5 w-3.5 text-sky-300" />,
	analysis: <ScanSearch className="h-3.5 w-3.5 text-violet-300" />,
	recording: <Video className="h-3.5 w-3.5 text-slate-300" />,
	film: <Film className="h-3.5 w-3.5 text-amber-300" />,
	publish: <Megaphone className="h-3.5 w-3.5 text-rose-300" />,
};

/**
 * 全局检索浮层(主线三):跨「选题 / 我的观点 / 拉片报告 / 录屏 / 成片 / 发布稿」一处搜。
 * 数据全部来自已暴露的只读 IPC(cockpit/pool/library/publishBoard),纯渲染端聚合 + 打分(searchIndex),
 * 不新增后端、不读盘。命中项:选题/观点 → 跳驾驶舱选中;报告/录屏/成片 → 访达打开;发布稿 → 访达打开。
 */
export function SearchOverlay({
	open,
	onClose,
	onJumpTopic,
}: {
	open: boolean;
	onClose: () => void;
	onJumpTopic: (cardId: string) => void;
}) {
	const t = useScopedT("editor");
	const [docs, setDocs] = useState<SearchDoc[]>([]);
	const [q, setQ] = useState("");
	const [loading, setLoading] = useState(false);

	const buildDocs = useCallback(async () => {
		const api = window.electronAPI;
		if (!api) return;
		setLoading(true);
		const [today, pool, lib, board] = await Promise.all([
			api.cockpit?.today(),
			api.pool?.get(),
			api.library?.list(),
			api.publishBoard?.list(),
		]);
		const out: SearchDoc[] = [];
		const titleById = new Map<string, string>();
		const cards = [...(today?.data?.cards ?? []), ...(pool?.injected ?? []).map((i) => i.card)];
		for (const c of cards) {
			titleById.set(c.id, c.title);
			const parts = [c.angle, ...(c.body ?? []), c.why, c.fit, c.bear, c.opinion, c.topic].filter(
				Boolean,
			) as string[];
			const e = pool?.entries?.[c.id];
			if (e?.note) parts.push(e.note);
			if (e?.draft) parts.push(e.draft);
			out.push({
				kind: "topic",
				id: `topic-${c.id}`,
				title: c.title,
				text: parts.join(" "),
				ref: c.id,
			});
		}
		// 我的观点(单列,便于「观点」直达);标题取所属选题标题,无则取观点首句。
		for (const [id, e] of Object.entries(pool?.entries ?? {})) {
			if (!e.note?.trim()) continue;
			out.push({
				kind: "opinion",
				id: `op-${id}`,
				title: titleById.get(id) ?? e.note.trim().slice(0, 20),
				text: e.note,
				ref: id,
			});
		}
		const data = lib?.data;
		for (const a of data?.analyses ?? [])
			out.push({ kind: "analysis", id: `an-${a.path}`, title: a.name, text: a.name, ref: a.path });
		for (const r of data?.recordings ?? [])
			out.push({
				kind: "recording",
				id: `rec-${r.path}`,
				title: r.name,
				text: r.name,
				ref: r.path,
			});
		for (const f of data?.films ?? [])
			out.push({ kind: "film", id: `film-${f.path}`, title: f.name, text: f.name, ref: f.path });
		for (const g of board?.stages ?? [])
			for (const it of g.items)
				out.push({
					kind: "publish",
					id: `pub-${it.primaryPath}`,
					title: it.title,
					text: it.meta?.summary ?? "",
					ref: it.primaryPath,
				});
		setDocs(out);
		setLoading(false);
	}, []);

	useEffect(() => {
		if (open) {
			setQ("");
			buildDocs();
		}
	}, [open, buildDocs]);

	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open, onClose]);

	const terms = useMemo(() => queryTerms(q), [q]);
	const hits = useMemo(() => searchDocs(docs, q, 60), [docs, q]);

	const act = useCallback(
		(hit: SearchHit) => {
			if (hit.kind === "topic" || hit.kind === "opinion") {
				if (hit.ref) onJumpTopic(hit.ref);
				onClose();
				return;
			}
			if (!hit.ref) return;
			if (hit.kind === "publish") window.electronAPI?.publishBoard?.open(hit.ref);
			else window.electronAPI?.library?.open(hit.ref);
		},
		[onJumpTopic, onClose],
	);

	if (!open) return null;

	return (
		<div
			className="absolute inset-0 z-[60] flex justify-center bg-black/60 p-6 pt-[12vh]"
			onClick={onClose}
		>
			<div
				className="flex max-h-[72vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-white/[0.1] bg-[#0C0F12] shadow-2xl"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="flex shrink-0 items-center gap-2 border-b border-white/[0.07] px-3.5 py-2.5">
					<Search className="h-4 w-4 shrink-0 text-slate-500" />
					<input
						value={q}
						onChange={(e) => setQ(e.target.value)}
						autoFocus
						placeholder={t("search.placeholder")}
						className="min-w-0 flex-1 bg-transparent text-[13px] text-slate-100 outline-none placeholder:text-slate-600"
					/>
					{loading && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-slate-500" />}
					<button
						type="button"
						onClick={onClose}
						className="shrink-0 text-slate-500 hover:text-slate-200"
						title={t("search.close")}
					>
						<X className="h-4 w-4" />
					</button>
				</div>
				<div className="min-h-0 flex-1 overflow-auto p-2 custom-scrollbar">
					{q.trim() === "" ? (
						<p className="mt-8 text-center text-[12px] text-slate-600">{t("search.hint")}</p>
					) : hits.length === 0 ? (
						<p className="mt-8 text-center text-[12px] text-slate-600">{t("search.noResults")}</p>
					) : (
						<ul className="space-y-1">
							{hits.map((hit) => {
								const snip = snippet(hit.text, terms);
								return (
									<li key={hit.id}>
										<button
											type="button"
											onClick={() => act(hit)}
											className="flex w-full items-start gap-2 rounded-lg border border-transparent px-2.5 py-2 text-left transition-colors hover:border-white/[0.08] hover:bg-white/[0.04]"
										>
											<span className="mt-0.5 shrink-0">{KIND_ICON[hit.kind]}</span>
											<span className="min-w-0 flex-1">
												<span className="flex items-center gap-1.5">
													<span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-slate-200">
														{hit.title}
													</span>
													<span className="shrink-0 rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[9.5px] font-medium text-slate-400">
														{t(`search.kind.${hit.kind}`)}
													</span>
												</span>
												{snip && (
													<span className="mt-0.5 line-clamp-1 block text-[11px] leading-relaxed text-slate-500">
														{snip}
													</span>
												)}
											</span>
										</button>
									</li>
								);
							})}
						</ul>
					)}
				</div>
				<div className="shrink-0 border-t border-white/[0.07] px-3.5 py-1.5 text-[10px] text-slate-600">
					{t("search.foot", { n: docs.length })}
				</div>
			</div>
		</div>
	);
}

export default SearchOverlay;
