import { CheckCircle2, KeyRound, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useScopedT } from "@/contexts/I18nContext";
import type { KeyProvider, KeyStatus } from "@/lib/keyTypes";

const keys = typeof window !== "undefined" ? window.electronAPI?.keys : undefined;

/**
 * Inkast 整合 · LLM 密钥配置弹窗(真端到端 任务 A)。
 * 填 Claude / DeepSeek 密钥 → safeStorage 加密落 userData/keys.json(不落明文、不进 git),
 * 即时注入 process.env(成片 spawn 引擎 / 分析 fetch 立即可用),重启仍在。
 */
// label/placeholder 是品牌名与示例格式,不翻译;用途(use)走 i18n(keys.use.<id>)。
const PROVIDERS: { id: KeyProvider; label: string; placeholder: string }[] = [
	{ id: "anthropic", label: "Claude (Anthropic)", placeholder: "sk-ant-…" },
	{ id: "moonshot", label: "Kimi (Moonshot)", placeholder: "sk-…" },
	{ id: "deepseek", label: "DeepSeek", placeholder: "sk-…" },
	{ id: "qwen", label: "通义千问 (DashScope)", placeholder: "sk-…" },
	{ id: "glm", label: "智谱 GLM", placeholder: "…" },
	{ id: "openai", label: "OpenAI", placeholder: "sk-…" },
];

const EMPTY_DRAFTS: Record<KeyProvider, string> = {
	anthropic: "",
	moonshot: "",
	deepseek: "",
	qwen: "",
	glm: "",
	openai: "",
};

export function KeyDialog({
	open,
	onOpenChange,
	onSaved,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	onSaved?: (status: KeyStatus) => void;
}) {
	const t = useScopedT("editor");
	const [status, setStatus] = useState<KeyStatus | null>(null);
	const [drafts, setDrafts] = useState<Record<KeyProvider, string>>(EMPTY_DRAFTS);
	const [savingId, setSavingId] = useState<KeyProvider | null>(null);
	const [error, setError] = useState<string | null>(null);

	const refresh = useCallback(async () => {
		if (!keys) return;
		setStatus(await keys.status());
	}, []);

	useEffect(() => {
		if (open) {
			setError(null);
			setDrafts(EMPTY_DRAFTS);
			refresh();
		}
	}, [open, refresh]);

	const save = useCallback(
		async (provider: KeyProvider) => {
			if (!keys) return;
			setSavingId(provider);
			setError(null);
			const res = await keys.save(provider, drafts[provider]);
			setSavingId(null);
			if (!res.ok) {
				setError(res.error || t("keys.saveFailed"));
				return;
			}
			setDrafts((d) => ({ ...d, [provider]: "" }));
			const next = await keys.status();
			setStatus(next);
			onSaved?.(next);
		},
		[drafts, onSaved, t],
	);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md border-white/10 bg-[#0C0F12] text-slate-200">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2 text-[15px] text-slate-100">
						<KeyRound className="h-4 w-4 text-[#3DC489]" />
						{t("keys.title")}
					</DialogTitle>
					<DialogDescription className="text-[12px] text-slate-500">
						{t("keys.desc")}
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					{PROVIDERS.map((p) => {
						const set = status?.[p.id];
						return (
							<div key={p.id} className="space-y-1.5">
								<div className="flex items-center gap-2">
									<span className="text-[12px] font-medium text-slate-300">{p.label}</span>
									<span className="text-[10px] text-slate-500">{t(`keys.use.${p.id}`)}</span>
									{set && (
										<span className="flex items-center gap-1 text-[10.5px] font-medium text-[#3DC489]">
											<CheckCircle2 className="h-3 w-3" />
											{t("keys.configured")}
										</span>
									)}
								</div>
								<div className="flex gap-2">
									<input
										type="password"
										value={drafts[p.id]}
										onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
										placeholder={set ? t("keys.replacePlaceholder") : p.placeholder}
										className="min-w-0 flex-1 rounded-lg border border-white/[0.1] bg-[#15181C] px-3 py-2 text-[12px] text-slate-200 outline-none placeholder:text-slate-600 focus:border-[#34B27B]/40"
									/>
									<button
										type="button"
										onClick={() => save(p.id)}
										disabled={savingId === p.id || !drafts[p.id].trim()}
										className="flex items-center gap-1.5 rounded-lg bg-[#34B27B] px-3 py-2 text-[12px] font-semibold text-[#06140d] transition-colors hover:bg-[#34B27B]/90 disabled:cursor-not-allowed disabled:opacity-40"
									>
										{savingId === p.id ? (
											<Loader2 className="h-3.5 w-3.5 animate-spin" />
										) : (
											t("keys.save")
										)}
									</button>
								</div>
							</div>
						);
					})}

					{status && !status.encryptionAvailable && (
						<p className="rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
							{t("keys.noEncryption")}
						</p>
					)}
					{error && (
						<p className="rounded-lg bg-red-500/10 px-3 py-2 text-[11px] text-red-300">{error}</p>
					)}
					<p className="text-[10.5px] leading-relaxed text-slate-600">{t("keys.note")}</p>
				</div>
			</DialogContent>
		</Dialog>
	);
}

export default KeyDialog;
