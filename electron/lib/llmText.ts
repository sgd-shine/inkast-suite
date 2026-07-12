// 纯文本 LLM 调用(App 内直连 API,不走引擎 .venv)。用于图文初稿生成等"文本→文本"场景。
// 复用 keyStore 注入 process.env 的密钥;支持引擎同款 6 供应商(全是文本,无视觉限制)。
// 供应商/模型可用 INKAST_ARTICLE_PROVIDER / INKAST_ARTICLE_MODEL 覆盖。
import type { App } from "electron";
import type { KeyProvider } from "../../src/lib/keyTypes";
import { appConfiguredProviders } from "../keys/keyStore";

type ApiKind = "anthropic" | "openai"; // anthropic=/v1/messages;openai=OpenAI 兼容 /chat/completions

interface ProviderCfg {
	kind: ApiKind;
	base: string;
	model: string;
	envKey: string;
}

// 默认 base/model;model 拿不准时可被 INKAST_ARTICLE_MODEL 覆盖。OpenAI 兼容的几家走 /chat/completions。
const PROVIDERS: Record<KeyProvider, ProviderCfg> = {
	anthropic: {
		kind: "anthropic",
		base: "https://api.anthropic.com/v1/messages",
		model: "claude-sonnet-4-6",
		envKey: "ANTHROPIC_API_KEY",
	},
	moonshot: {
		kind: "openai",
		base: "https://api.moonshot.cn/v1/chat/completions",
		model: "moonshot-v1-32k",
		envKey: "MOONSHOT_API_KEY",
	},
	deepseek: {
		kind: "openai",
		base: "https://api.deepseek.com/chat/completions",
		model: "deepseek-chat",
		envKey: "DEEPSEEK_API_KEY",
	},
	qwen: {
		kind: "openai",
		base: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
		model: "qwen-plus",
		envKey: "DASHSCOPE_API_KEY",
	},
	glm: {
		kind: "openai",
		base: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
		model: "glm-4-flash",
		envKey: "ZHIPUAI_API_KEY",
	},
	openai: {
		kind: "openai",
		base: "https://api.openai.com/v1/chat/completions",
		model: "gpt-4o-mini",
		envKey: "OPENAI_API_KEY",
	},
};

const ORDER: KeyProvider[] = ["deepseek", "anthropic", "moonshot", "qwen", "glm", "openai"];

/** 选文本供应商:env 覆盖 → 用户在 App 配过的(优先 preferred,如成片选的)→ 任一有 key 的。 */
export function resolveTextProvider(app: App, preferred?: string): KeyProvider | null {
	const env = process.env.INKAST_ARTICLE_PROVIDER?.toLowerCase();
	if (env && env in PROVIDERS && process.env[PROVIDERS[env as KeyProvider].envKey])
		return env as KeyProvider;
	const configured = new Set(appConfiguredProviders(app));
	if (preferred && preferred !== "auto" && configured.has(preferred as KeyProvider))
		return preferred as KeyProvider;
	for (const p of ORDER) if (configured.has(p) || process.env[PROVIDERS[p].envKey]) return p;
	return null;
}

/** 调文本 LLM:resolve provider → 按 API 形状 fetch → 返回正文文本。无 key/出错抛带可读信息的 Error。 */
export async function generateText(
	app: App,
	system: string,
	user: string,
	opts: { preferred?: string; maxTokens?: number } = {},
): Promise<{ text: string; provider: KeyProvider; model: string }> {
	const provider = resolveTextProvider(app, opts.preferred);
	if (!provider)
		throw new Error("没有可用的 LLM 密钥。先在顶栏 🔑 配置 Claude/Kimi/DeepSeek 等任一密钥。");
	const cfg = PROVIDERS[provider];
	const model = process.env.INKAST_ARTICLE_MODEL || cfg.model;
	const apiKey = process.env[cfg.envKey];
	if (!apiKey) throw new Error(`缺少 ${provider} 密钥`);
	const maxTokens = opts.maxTokens ?? 4000;

	if (cfg.kind === "anthropic") {
		const resp = await fetch(cfg.base, {
			method: "POST",
			headers: {
				"x-api-key": apiKey,
				"anthropic-version": "2023-06-01",
				"content-type": "application/json",
			},
			body: JSON.stringify({
				model,
				max_tokens: maxTokens,
				system,
				messages: [{ role: "user", content: user }],
			}),
		});
		if (!resp.ok)
			throw new Error(`Claude API ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
		const data = (await resp.json()) as { content?: Array<{ type: string; text?: string }> };
		const text = (data.content || [])
			.filter((b) => b.type === "text")
			.map((b) => b.text || "")
			.join("\n")
			.trim();
		if (!text) throw new Error("Claude 返回空内容");
		return { text, provider, model };
	}

	// OpenAI 兼容
	const resp = await fetch(cfg.base, {
		method: "POST",
		headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
		body: JSON.stringify({
			model,
			max_tokens: maxTokens,
			temperature: 0.7,
			messages: [
				{ role: "system", content: system },
				{ role: "user", content: user },
			],
		}),
	});
	if (!resp.ok)
		throw new Error(`${provider} API ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
	const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
	const text = (data.choices?.[0]?.message?.content || "").trim();
	if (!text) throw new Error(`${provider} 返回空内容`);
	return { text, provider, model };
}
