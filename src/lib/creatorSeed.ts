// 抖音 AI 博主种子池(内置,随 App 打包 —— 不依赖外部磁盘路径,契合「整合为单一 App」铁律)。
// 数据来源:research/douyin-ai-creators/inkast-douyin-ai-creators-seed-20260701.json(2026-07-01 交接报告配套种子)。
// 只收录 AI 工具测评/教程/产品解读/工作流/观点类;短剧·情感·游戏等被剔除类目通过 excludeTags 过滤,不进默认主池。

export type TrackingTier = "core" | "secondary" | "reference" | "candidate";
export type VerificationStatus =
	| "confirmed_public"
	| "third_party_public"
	| "suspected"
	| "needs_manual_verify";

/** 一条内置博主种子(静态推荐层;是否已加入跟踪由 following.json 叠加,不写死在这里)。 */
export interface CreatorSource {
	creatorName: string;
	/** 抖音号;可为空 —— 为空时不可自动刷新,只能打开搜索页人工找。 */
	douyinId?: string;
	/** 主页或搜索页 URL(种子多为公开搜索页)。 */
	profileUrl: string;
	trackingTier: TrackingTier;
	category: string;
	tags: string[];
	verificationStatus: VerificationStatus;
	/** 是否默认进入驾驶舱主池(reference/电商参考为 false)。 */
	useInCockpit: boolean;
	/** 需人工复核最近内容(如可能混入被剔除题材);此类不做自动刷新。 */
	requiresManualReview: boolean;
	manualReviewReason?: string;
	referenceOnlyReason?: string;
}

/** 默认排除类目(短剧/情感/游戏等);命中即从默认主池隐藏。 */
export const DEFAULT_EXCLUDE_TAGS: readonly string[] = ["短剧", "漫剧", "剧场", "说剧", "情感", "恋爱", "亲情", "催泪", "游戏", "赛事"];

export const CREATOR_SEED: readonly CreatorSource[] = [
	{
		creatorName: "秋芝2046",
		douyinId: "32571643812",
		profileUrl: "https://www.douyin.com/search/%E7%A7%8B%E8%8A%9D2046",
		trackingTier: "core",
		category: "ai_tool_review",
		tags: ["AI工具", "产品测评", "教程", "横向评测", "工作流"],
		verificationStatus: "confirmed_public",
		useInCockpit: true,
		requiresManualReview: false,
	},
	{
		creatorName: "赛文乔伊",
		douyinId: "Joychoooow",
		profileUrl: "https://www.douyin.com/search/%E8%B5%9B%E6%96%87%E4%B9%94%E4%BC%8A%E7%9A%84%E4%BD%9C%E5%93%81",
		trackingTier: "core",
		category: "ai_product_explainer",
		tags: ["AI产品", "科技趋势", "产品体验", "科普"],
		verificationStatus: "confirmed_public",
		useInCockpit: true,
		requiresManualReview: false,
	},
	{
		creatorName: "朋克周",
		douyinId: "punkchou",
		profileUrl: "https://www.douyin.com/search/%E6%8A%96%E9%9F%B3%E6%9C%8B%E5%85%8B%E5%91%A8",
		trackingTier: "core",
		category: "ai_opinion",
		tags: ["AI观点", "趋势判断", "个人IP", "科技口播"],
		verificationStatus: "confirmed_public",
		useInCockpit: true,
		requiresManualReview: false,
	},
	{
		creatorName: "数字生命卡兹克",
		douyinId: "27040209150",
		profileUrl: "https://www.douyin.com/search/%E6%95%B0%E5%AD%97%E7%94%9F%E5%91%BD%E5%8D%A1%E5%85%B9%E5%85%8B",
		trackingTier: "core",
		category: "ai_workflow",
		tags: ["AI效率", "自动化", "Agent", "内容生产", "工作流"],
		verificationStatus: "confirmed_public",
		useInCockpit: true,
		requiresManualReview: false,
	},
	{
		creatorName: "老麦的工具库",
		douyinId: "1644039235",
		profileUrl: "https://www.douyin.com/search/%E8%80%81%E9%BA%A6ai%E5%B7%A5%E5%85%B7%E5%BA%93",
		trackingTier: "core",
		category: "ai_tool_library",
		tags: ["AI工具", "效率工具", "工具清单", "工具测评"],
		verificationStatus: "confirmed_public",
		useInCockpit: true,
		requiresManualReview: false,
	},
	{
		creatorName: "AI研究室-帆哥",
		douyinId: "347912654",
		profileUrl: "https://www.douyin.com/search/ai%E7%A0%94%E7%A9%B6%E5%AE%A4%E5%B8%86%E5%93%A5",
		trackingTier: "core",
		category: "ai_tutorial",
		tags: ["AI评测", "工具教程", "实操", "案例"],
		verificationStatus: "confirmed_public",
		useInCockpit: true,
		requiresManualReview: false,
	},
	{
		creatorName: "王宇辰（我和AI的一天）",
		douyinId: "woandai",
		profileUrl: "https://www.douyin.com/search/%E7%8E%8B%E5%AE%87%E8%BE%B0",
		trackingTier: "core",
		category: "ai_workflow",
		tags: ["AI使用场景", "工作流", "效率", "真实任务"],
		verificationStatus: "confirmed_public",
		useInCockpit: true,
		requiresManualReview: false,
	},
	{
		creatorName: "AI训练师大宇",
		douyinId: "aidayu000",
		profileUrl: "https://www.douyin.com/search/AI%E8%AE%AD%E7%BB%83%E5%B8%88%E5%A4%A7%E5%AE%87",
		trackingTier: "core",
		category: "ai_tutorial",
		tags: ["AI训练", "AIGC教程", "工具教程", "提示词"],
		verificationStatus: "confirmed_public",
		useInCockpit: true,
		requiresManualReview: false,
	},
	{
		creatorName: "AIGC自修室",
		douyinId: "Viamaker",
		profileUrl: "https://www.douyin.com/search/aigc%E8%87%AA%E4%BF%AE%E5%AE%A4",
		trackingTier: "core",
		category: "aigc_tutorial",
		tags: ["AIGC", "教程", "自学路径", "视频工具"],
		verificationStatus: "confirmed_public",
		useInCockpit: true,
		requiresManualReview: false,
	},
	{
		creatorName: "卡尔的AI沃茨",
		douyinId: "88851320170",
		profileUrl: "https://www.douyin.com/search/%E5%8D%A1%E5%B0%94%E7%9A%84AI%E6%B2%83%E8%8C%A8",
		trackingTier: "core",
		category: "ai_tutorial",
		tags: ["AI工具", "小白教程", "AI科技资讯", "Agent"],
		verificationStatus: "confirmed_public",
		useInCockpit: true,
		requiresManualReview: false,
	},
	{
		creatorName: "郭震AI频道",
		douyinId: "1055516139",
		profileUrl: "https://www.douyin.com/search/%E9%83%AD%E9%9C%87AI",
		trackingTier: "core",
		category: "ai_tutorial",
		tags: ["AI教程", "技术学习", "AI博士", "工具"],
		verificationStatus: "confirmed_public",
		useInCockpit: true,
		requiresManualReview: false,
	},
	{
		creatorName: "Super Winnie",
		douyinId: "55600015851",
		profileUrl: "https://www.douyin.com/search/Super%20Winnie",
		trackingTier: "core",
		category: "ai_tool_review",
		tags: ["AI工具", "AI趋势", "职场应用", "教程"],
		verificationStatus: "confirmed_public",
		useInCockpit: true,
		requiresManualReview: false,
	},
	{
		creatorName: "图灵的猫",
		douyinId: "turings_cat1995",
		profileUrl: "https://www.douyin.com/search/%E5%9B%BE%E7%81%B5%E7%9A%84%E7%8C%AB",
		trackingTier: "core",
		category: "ai_tool_review",
		tags: ["AI评测", "技术应用", "开发者", "工具"],
		verificationStatus: "third_party_public",
		useInCockpit: true,
		requiresManualReview: false,
	},
	{
		creatorName: "AI红发魔女",
		douyinId: "hongfamonvAI",
		profileUrl: "https://www.douyin.com/search/ai%E7%BA%A2%E5%8F%91%E9%AD%94%E5%A5%B3",
		trackingTier: "core",
		category: "ai_tutorial",
		tags: ["AI应用", "教程", "人设化表达"],
		verificationStatus: "confirmed_public",
		useInCockpit: true,
		requiresManualReview: false,
	},
	{
		creatorName: "陈生2.0",
		douyinId: "Chensheng_020",
		profileUrl: "https://www.douyin.com/search/%E9%99%88%E7%94%9F2.0",
		trackingTier: "core",
		category: "ai_business_tutorial",
		tags: ["AI商业实战", "设计", "教程", "AIGC"],
		verificationStatus: "confirmed_public",
		useInCockpit: true,
		requiresManualReview: false,
	},
	{
		creatorName: "未来设计师KiK",
		douyinId: "286146181",
		profileUrl: "https://www.douyin.com/search/%E6%9C%AA%E6%9D%A5%E8%AE%BE%E8%AE%A1%E5%B8%88kik",
		trackingTier: "core",
		category: "ai_design_workflow",
		tags: ["AI设计", "视频工具", "设计工作流", "教程"],
		verificationStatus: "confirmed_public",
		useInCockpit: true,
		requiresManualReview: false,
	},
	{
		creatorName: "AI研究社",
		douyinId: "184996996",
		profileUrl: "https://www.douyin.com/search/ai%E7%A0%94%E7%A9%B6%E7%A4%BE",
		trackingTier: "secondary",
		category: "ai_news_tools",
		tags: ["AI资讯", "工具集合", "科普"],
		verificationStatus: "confirmed_public",
		useInCockpit: true,
		requiresManualReview: false,
	},
	{
		creatorName: "Rico有三猫",
		douyinId: "84644440",
		profileUrl: "https://www.douyin.com/search/%E4%B8%89%E6%9C%89%E4%B8%89%E7%8C%AB",
		trackingTier: "secondary",
		category: "ai_light_tools",
		tags: ["AI工具", "轻量应用", "教程"],
		verificationStatus: "confirmed_public",
		useInCockpit: true,
		requiresManualReview: false,
	},
	{
		creatorName: "AIGC 十三",
		douyinId: "M_15800019960",
		profileUrl: "https://www.douyin.com/search/%E5%8D%81%E4%B8%89Ai",
		trackingTier: "secondary",
		category: "aigc_creation_tutorial",
		tags: ["AIGC", "AI视频", "制作流程", "教程"],
		verificationStatus: "confirmed_public",
		useInCockpit: true,
		requiresManualReview: true,
		manualReviewReason: "内容可能混入科幻故事向作品，需过滤非教程内容。",
	},
	{
		creatorName: "全明制作人",
		douyinId: "72798295463",
		profileUrl: "https://www.douyin.com/search/%E5%9B%BD%E6%98%8E%E5%88%B6%E4%BD%9C%E4%BA%BA",
		trackingTier: "secondary",
		category: "aigc_creation",
		tags: ["AI视频", "制作人", "AIGC"],
		verificationStatus: "suspected",
		useInCockpit: false,
		requiresManualReview: true,
		manualReviewReason: "账号近期内容可能偏AI虚构故事，不符合默认主池。",
	},
	{
		creatorName: "雪梨爆爆",
		douyinId: "275955549",
		profileUrl: "https://www.douyin.com/search/%E9%9B%AA%E6%A2%A8%E7%88%86%E7%88%86%E5%A5%B3%E8%A3%85",
		trackingTier: "reference",
		category: "ai_commerce_reference",
		tags: ["AI电商", "女装带货", "AIGC商品视频"],
		verificationStatus: "confirmed_public",
		useInCockpit: false,
		requiresManualReview: false,
		referenceOnlyReason: "用于学习低粉高GMV模型，不进入AI工具内容主池。",
	},
	{
		creatorName: "皖皖很想你",
		douyinId: "87259087153",
		profileUrl: "https://www.chanmama.com/open/authorRank/FOoMg2FUlje0N9RJZQeaKOBArhezvGV9.html",
		trackingTier: "reference",
		category: "ai_commerce_reference",
		tags: ["AI电商", "穿搭带货", "达人矩阵"],
		verificationStatus: "third_party_public",
		useInCockpit: false,
		requiresManualReview: false,
		referenceOnlyReason: "用于学习AI带货矩阵，不进入AI工具内容主池。",
	},
];

/** 待复核候选(仅名称,无稳定公开抖音号)—— 不自动导入、不自动刷新,只能打开搜索人工确认。 */
export const CANDIDATE_NAMES: readonly string[] = [
	"张咋啦",
	"袋鼠帝AI客栈 / AI袋鼠帝",
	"徐老师AI",
	"料到Ai",
	"瑞哥那",
	"苍何",
	"K姐研究社",
	"沃垠AI",
	"李继刚",
	"歸藏的AI工具箱",
	"宝玉AI",
	"赛博禅心",
	"特工宇宙",
	"小互AI / 互联网的那点事",
	"PromptCat-菩提猫",
	"AI产品黄叔",
	"哥飞",
	"小七好物",
];

// —— 纯函数(可测):筛选 / 排序 / 键 / 类目标签 ——

/** 跟踪优先级排序权重(core 最前)。 */
export const TIER_ORDER: Record<TrackingTier, number> = {
	core: 0,
	secondary: 1,
	reference: 2,
	candidate: 3,
};

/** 类目 → 中文展示标签(产品主打中英,标签本身为中文语域;缺失回退原 slug)。 */
export const CATEGORY_LABELS: Record<string, string> = {
	ai_tool_review: "AI 工具测评",
	ai_tool_library: "AI 工具库",
	ai_news_tools: "AI 资讯/工具",
	ai_light_tools: "AI 轻量工具",
	ai_tutorial: "AI 教程",
	aigc_tutorial: "AIGC 教程",
	aigc_creation_tutorial: "AIGC 创作教程",
	aigc_creation: "AIGC 创作",
	ai_workflow: "AI 工作流",
	ai_design_workflow: "AI + 设计工作流",
	ai_business_tutorial: "AI 商业实战",
	ai_product_explainer: "AI 产品解读",
	ai_opinion: "AI 观点/趋势",
	ai_commerce_reference: "AI 电商参考",
};

export function categoryLabel(category: string): string {
	return CATEGORY_LABELS[category] ?? category;
}

/** 稳定去重键:优先抖音号,否则用主页 URL(与 following.json 桥接时用同一键判「已跟踪」)。 */
export function creatorKey(c: Pick<CreatorSource, "douyinId" | "profileUrl">): string {
	return (c.douyinId && c.douyinId.trim()) || c.profileUrl.trim();
}

/** 命中被剔除类目?(标签与 excludeTags 有交集) */
export function isExcluded(
	c: Pick<CreatorSource, "tags">,
	excludeTags: readonly string[] = DEFAULT_EXCLUDE_TAGS,
): boolean {
	const set = new Set(excludeTags);
	return c.tags.some((t) => set.has(t));
}

/**
 * 能否自动刷新最近作品?种子多为公开「搜索页」而非用户主页(无 sec_uid),
 * 且需人工复核的账号不做自动刷新 —— 这类只能打开主页/搜索人工复制视频链接(诚实降级)。
 */
export function canAutoRefresh(c: CreatorSource): boolean {
	if (c.requiresManualReview) return false;
	return /\/user\//i.test(c.profileUrl);
}

export interface CreatorFilter {
	/** 跟踪优先级;"all" = 不限。 */
	tier?: TrackingTier | "all";
	/** 名称 / 抖音号 / 标签 / 类目 模糊匹配(小写包含)。 */
	query?: string;
	/** 隐藏被剔除类目(短剧/情感/游戏…),默认应为 true。 */
	hideExcluded?: boolean;
	excludeTags?: readonly string[];
}

function matchesQuery(c: CreatorSource, q: string): boolean {
	const hay = [
		c.creatorName,
		c.douyinId ?? "",
		c.category,
		categoryLabel(c.category),
		...c.tags,
	]
		.join(" ")
		.toLowerCase();
	return hay.includes(q);
}

/** 按筛选条件过滤 + 按 (优先级, 名称) 排序。纯函数。 */
export function filterCreators(
	creators: readonly CreatorSource[],
	filter: CreatorFilter = {},
): CreatorSource[] {
	const q = (filter.query ?? "").trim().toLowerCase();
	const excludeTags = filter.excludeTags ?? DEFAULT_EXCLUDE_TAGS;
	return creators
		.filter((c) => {
			if (filter.tier && filter.tier !== "all" && c.trackingTier !== filter.tier) return false;
			if (filter.hideExcluded && isExcluded(c, excludeTags)) return false;
			if (q && !matchesQuery(c, q)) return false;
			return true;
		})
		.sort((a, b) => {
			const t = TIER_ORDER[a.trackingTier] - TIER_ORDER[b.trackingTier];
			if (t !== 0) return t;
			return a.creatorName.localeCompare(b.creatorName, "zh-Hans-CN");
		});
}

/** 抖音搜索页 URL(候选账号只有名称时用它打开人工确认)。 */
export function douyinSearchUrl(name: string): string {
	return `https://www.douyin.com/search/${encodeURIComponent(name.trim())}`;
}
