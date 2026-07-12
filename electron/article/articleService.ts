// 图文初稿生成(主线一·图文线):选题(含「我的观点」)→ 在 App 内直连 LLM 改写成公众号图文草稿。
// 不碰引擎 .venv;复用 keyStore 密钥 + 成片选定的供应商(produce.json)。失败如实回错。
import type { App, IpcMain } from "electron";
import { ARTICLE_SYSTEM, composeArticleInput } from "../../src/lib/articlePrompt";
import type { CockpitCard } from "../../src/lib/cockpitTypes";
import { getSlidesProvider } from "../jobs/produceConfig";
import { generateText } from "../lib/llmText";

export interface ArticleResult {
	ok: boolean;
	text?: string;
	provider?: string;
	error?: string;
}

export function registerArticleHandlers(ipcMain: IpcMain, app: App): void {
	ipcMain.handle("article:generate", async (_e, card: CockpitCard): Promise<ArticleResult> => {
		try {
			const input = composeArticleInput(card);
			if (!input) return { ok: false, error: "选题素材为空,无法生成图文" };
			// 复用成片选的供应商(用户已验证可用,如 DeepSeek);auto 时按可用 key 自动选。
			const { text, provider } = await generateText(app, ARTICLE_SYSTEM, input, {
				preferred: getSlidesProvider(app),
				maxTokens: 4000,
			});
			return { ok: true, text, provider };
		} catch (e) {
			return { ok: false, error: e instanceof Error ? e.message : String(e) };
		}
	});
}
