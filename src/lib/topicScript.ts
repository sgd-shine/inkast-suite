// 把驾驶舱选题卡拼成一段口播稿/成片输入(纯函数,可测)。
// 用于漏斗预填(§5.1/§5.4):「去录屏」塞进提词窗、「去成片」当 idea 投料。
import type { CockpitCard } from "./cockpitTypes";

/**
 * 选题卡 → 可读口播稿,缺字段自动跳过。
 * 顺序:标题 / 角度 / 核心观点 / 要点 / 为什么 / 适配 / 需要注意 / 自问。
 * opinion/bear/why/fit 是「灌观点」工作流最核心的差异化内容(驾驶舱详情里已沉淀),
 * 必须随漏斗一起搬给提词器/成片引擎,否则下游只拿到标题+角度+要点=丢了观点。
 */
export function composeTopicScript(card: CockpitCard): string {
	const parts: string[] = [];
	if (card.title?.trim()) parts.push(card.title.trim());
	if (card.angle?.trim()) parts.push(card.angle.trim());
	if (card.opinion?.trim()) parts.push(`核心观点:\n${card.opinion.trim()}`);
	const body = (card.body ?? []).map((b) => b.trim()).filter(Boolean);
	if (body.length) parts.push(body.join("\n"));
	if (card.why?.trim()) parts.push(`为什么值得做:\n${card.why.trim()}`);
	if (card.fit?.trim()) parts.push(`适配定位:\n${card.fit.trim()}`);
	if (card.bear?.trim()) parts.push(`需要注意:\n${card.bear.trim()}`);
	const hooks = (card.hooks ?? []).map((h) => h.trim()).filter(Boolean);
	if (hooks.length) parts.push(`自问:\n${hooks.map((h) => `· ${h}`).join("\n")}`);
	return parts.join("\n\n").trim();
}
