// 图文初稿生成的提示词与素材拼装(纯函数,可测;渲染/主进程共用,无 node 依赖)。
// 与 topicScript.ts(口播稿)区分:图文要段落论述,不要"自问/弹大字卡"那套视频术语。
import type { CockpitCard } from "./cockpitTypes";

export const ARTICLE_SYSTEM = `你是资深公众号主笔。基于给定的选题素材,写一篇可直接润色发布的公众号图文初稿(Markdown)。
要求:
① 以「我的观点」为核心论点贯穿全文,要有立场、有判断,不是中立综述;若没有「我的观点」,就以「角度」为主张。
② 结构:先给 2-3 个标题候选(列在最前,用「## 标题候选」起头);正文 = 抓人的开头钩子 → 立论 → 分点展开(结合要点/背景)→ 收尾升华 →(可选)一句金句。
③ 语言口语化、有网感,但论述扎实;长度约 800-1500 字。
④ 只用给到的素材与观点,不编造事实/数据/出处;拿不准的不写。
直接输出 Markdown 正文,不要解释你在做什么。`;

/** 选题卡 → 喂给写作模型的素材文本(灌观点的内容都带上)。 */
export function composeArticleInput(card: CockpitCard): string {
	const parts: string[] = [];
	const add = (label: string, v?: string) => {
		const s = (v ?? "").trim();
		if (s) parts.push(`【${label}】${s}`);
	};
	add("标题", card.title);
	add("角度", card.angle);
	const body = (card.body ?? []).map((b) => b.trim()).filter(Boolean);
	if (body.length) parts.push(`【要点】\n${body.map((b) => `- ${b}`).join("\n")}`);
	add("我的观点", card.opinion);
	add("为什么值得做", card.why);
	add("需要注意/反方", card.bear);
	add("适配定位", card.fit);
	const hooks = (card.hooks ?? []).map((h) => h.trim()).filter(Boolean);
	if (hooks.length) parts.push(`【可切入的问题】\n${hooks.map((h) => `- ${h}`).join("\n")}`);
	return parts.join("\n\n").trim();
}
