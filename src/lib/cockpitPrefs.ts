// 内容驾驶舱 · 偏好引擎(逐字移植自 内容驾驶舱_原型.html 的 PREF_* + prefDecision/prefList)。
// 纯逻辑,无 DOM;按用户风格/关注对选题与信源做 boost/normal/hide 过滤 + 打分排序。
// 持久化到 localStorage(沿用原型的 key,与原型互通)。

export type PrefState = "boost" | "normal" | "hide";

export interface CockpitPrefs {
	preset: string;
	groups: Record<string, PrefState>;
	channels: Record<string, PrefState>;
	platforms: Record<string, boolean>;
}

export interface PrefDef {
	key: string;
	label: string;
	terms: string[];
}

/** prefList 接受的最小项形状(卡片/信源条目都满足)。 */
export interface PrefItem {
	kind?: string;
	topic?: string;
	title?: string;
	title_zh?: string;
	src?: string;
	a?: string;
	plat?: string;
	when?: string;
	why?: string;
	fit?: string;
	body?: string[];
}

export const PREF_KEY = "cockpit-preferences-v1";

export const PREF_GROUPS: PrefDef[] = [
	{
		key: "ai",
		label: "AI模型",
		terms: [
			"AI工作流",
			"人工智能",
			"大模型",
			"model",
			"qwen",
			"glm",
			"grok",
			"openai",
			"deepmind",
			"meta ai",
			"mistral",
			"deepseek",
			"gemini",
			"llama",
		],
	},
	{
		key: "agents",
		label: "智能体",
		terms: [
			"智能体",
			"agent",
			"agents",
			"codex",
			"claude code",
			"workspace agents",
			"background agents",
			"handoff",
			"subagent",
		],
	},
	{
		key: "devtools",
		label: "开发工具",
		terms: [
			"开发者",
			"developer",
			"github",
			"api",
			"sdk",
			"cli",
			"webgl",
			"docs",
			"documentation",
			"code",
			"coding",
			"工具链",
		],
	},
	{
		key: "workflow",
		label: "工作流自动化",
		terms: [
			"工作流",
			"workflow",
			"automation",
			"自动化",
			"流程",
			"企业采用",
			"执行",
			"协作",
			"agentic",
		],
	},
	{
		key: "trade",
		label: "外贸",
		terms: [
			"外贸物流",
			"外贸",
			"贸易",
			"出口",
			"进口",
			"海关",
			"关税",
			"港口",
			"freight",
			"shipping",
			"customs",
			"trade",
			"container",
		],
	},
	{
		key: "crossborder",
		label: "跨境电商",
		terms: [
			"跨境电商",
			"跨境",
			"电商",
			"平台",
			"亚马逊",
			"tiktok",
			"shopify",
			"独立站",
			"阿里国际站",
			"选品",
			"小红书",
			"抖音",
			"种草",
		],
	},
	{
		key: "logistics",
		label: "物流供应链",
		terms: [
			"物流",
			"供应链",
			"船公司",
			"运价",
			"空运",
			"海运",
			"港口",
			"清关",
			"container",
			"freight",
			"shipping",
			"cma cgm",
			"loadstar",
			"freightwaves",
		],
	},
	{
		key: "global",
		label: "国际新闻",
		terms: [
			"国际",
			"美国",
			"欧洲",
			"中国",
			"地缘",
			"政府",
			"国家安全",
			"欧盟",
			"global",
			"us",
			"europe",
			"china",
		],
	},
	{
		key: "policy",
		label: "政策监管",
		terms: [
			"政策",
			"监管",
			"合规",
			"出口管制",
			"海关",
			"关税",
			"cbp",
			"ustr",
			"wto",
			"government",
			"policy",
			"regulation",
			"national security",
		],
	},
	{
		key: "tech",
		label: "科技产业",
		terms: [
			"科技",
			"芯片",
			"算力",
			"inference",
			"nvidia",
			"microsoft",
			"google",
			"compute",
			"gpu",
			"robotics",
			"confidential computing",
		],
	},
	{
		key: "opensource",
		label: "开源生态",
		terms: [
			"开源",
			"open source",
			"github",
			"huggingface",
			"weights",
			"repo",
			"repository",
			"license",
			"wasm",
			"pypi",
		],
	},
	{
		key: "multimodal",
		label: "多模态视频",
		terms: [
			"多模态",
			"视频",
			"图像",
			"image",
			"video",
			"youtube",
			"bilibili",
			"webgl",
			"gemini for science",
			"grok imagine",
		],
	},
	{
		key: "content",
		label: "内容/IP",
		terms: [
			"内容",
			"写作",
			"公众号",
			"短视频",
			"直播",
			"选题",
			"标题",
			"表达",
			"IP",
			"小红书",
			"抖音",
			"newsletter",
		],
	},
	{
		key: "market",
		label: "资本市场",
		terms: [
			"资本",
			"市场",
			"a股",
			"上市",
			"财报",
			"投资",
			"收购",
			"pricing",
			"earnings",
			"stock",
			"ipo",
		],
	},
	{
		key: "company",
		label: "企业案例",
		terms: [
			"公司",
			"企业",
			"案例",
			"组织",
			"团队",
			"微软",
			"github",
			"openai",
			"anthropic",
			"meta",
			"mistral",
			"nvidia",
			"xai",
		],
	},
	{
		key: "consumer",
		label: "消费趋势",
		terms: ["消费", "用户", "种草", "旅行", "美食", "美妆", "家庭", "生活方式", "小红书", "抖音"],
	},
	{
		key: "health",
		label: "健康消费",
		terms: [
			"健康消费",
			"健康",
			"保健",
			"营养",
			"美妆",
			"遮瑕",
			"献血",
			"美食",
			"馒头",
			"奶香",
			"美甲",
			"睡眠",
			"防晒",
		],
	},
	{
		key: "fitness",
		label: "运动健身",
		terms: [
			"运动",
			"健身",
			"训练",
			"体重",
			"跑步",
			"骑行",
			"机车",
			"营养补剂",
			"protein",
			"fitness",
		],
	},
];

export const PREF_PLATFORMS = ["YouTube", "抖音热榜", "小红书热榜", "X 热点"];

export const PREF_CHANNELS: PrefDef[] = [
	{
		key: "official",
		label: "官方公告",
		terms: [
			"Google DeepMind",
			"Meta AI",
			"Mistral AI",
			"DeepSeek",
			"Qwen Blog",
			"xAI",
			"Microsoft AI Blog",
			"Zhipu GLM Docs",
			"NVIDIA",
			"OpenAI",
			"Claude Docs",
			"CBP Trade",
			"官方",
			"docs.bigmodel.cn",
			"x.ai",
		],
	},
	{
		key: "developer",
		label: "开发者/开源",
		terms: [
			"GitHub Blog",
			"GitHub",
			"API",
			"SDK",
			"developer",
			"docs",
			"HuggingFace",
			"open source",
			"开源",
			"CLI",
			"PyPI",
		],
	},
	{
		key: "builder",
		label: "Builder/Newsletter",
		terms: [
			"Simon Willison",
			"Latent Space",
			"Import AI",
			"TLDR AI",
			"BestBlogs",
			"newsletter",
			"builder",
			"AINews",
		],
	},
	{
		key: "industry",
		label: "行业媒体",
		terms: ["The Loadstar", "FreightWaves", "AIHOT All", "行业媒体", "logistics", "freight"],
	},
	{
		key: "policy_org",
		label: "政策机构",
		terms: [
			"CBP Trade",
			"USTR",
			"WTO",
			"政府",
			"机构",
			"海关",
			"policy",
			"regulation",
			"export control",
			"出口管制",
		],
	},
	{
		key: "social",
		label: "社交热榜",
		terms: ["抖音热榜", "小红书热榜", "X 热点", "AIHOT All", "社交", "热榜", "twitter", "x.com"],
	},
	{
		key: "video",
		label: "视频",
		terms: ["YouTube", "B站", "bilibili", "video", "embed", "watch?v=", "视频"],
	},
	{
		key: "mp",
		label: "同行公众号",
		terms: ["AIHOT MP", "同行热文", "公众号", "微信", "mp", "爆文"],
	},
];

type PresetDef = {
	label: string;
	groups: Record<string, PrefState>;
	channels: Record<string, PrefState>;
	platforms: Record<string, boolean>;
};

const ALL_PLAT_ON = { YouTube: true, 抖音热榜: true, 小红书热榜: true, "X 热点": true };

export const PREF_PRESETS: Record<string, PresetDef> = {
	ai_trade: {
		label: "AI外贸",
		groups: {
			ai: "boost",
			agents: "boost",
			devtools: "boost",
			workflow: "boost",
			trade: "boost",
			crossborder: "boost",
			logistics: "boost",
			global: "boost",
			policy: "boost",
			tech: "boost",
			opensource: "normal",
			multimodal: "normal",
			content: "normal",
			market: "normal",
			company: "normal",
			consumer: "normal",
			health: "hide",
			fitness: "hide",
		},
		channels: {
			official: "boost",
			developer: "boost",
			builder: "normal",
			industry: "boost",
			policy_org: "boost",
			social: "normal",
			video: "normal",
			mp: "normal",
		},
		platforms: { ...ALL_PLAT_ON },
	},
	balanced: {
		label: "均衡",
		groups: {
			ai: "boost",
			agents: "normal",
			devtools: "normal",
			workflow: "normal",
			trade: "boost",
			crossborder: "normal",
			logistics: "normal",
			global: "normal",
			policy: "normal",
			tech: "boost",
			opensource: "normal",
			multimodal: "normal",
			content: "normal",
			market: "normal",
			company: "normal",
			consumer: "normal",
			health: "normal",
			fitness: "normal",
		},
		channels: {
			official: "boost",
			developer: "normal",
			builder: "normal",
			industry: "normal",
			policy_org: "normal",
			social: "normal",
			video: "normal",
			mp: "normal",
		},
		platforms: { ...ALL_PLAT_ON },
	},
	health: {
		label: "健康消费",
		groups: {
			ai: "normal",
			agents: "normal",
			devtools: "normal",
			workflow: "normal",
			trade: "normal",
			crossborder: "normal",
			logistics: "normal",
			global: "normal",
			policy: "normal",
			tech: "normal",
			opensource: "normal",
			multimodal: "normal",
			content: "normal",
			market: "normal",
			company: "normal",
			consumer: "boost",
			health: "boost",
			fitness: "boost",
		},
		channels: {
			official: "normal",
			developer: "normal",
			builder: "normal",
			industry: "normal",
			policy_org: "normal",
			social: "boost",
			video: "boost",
			mp: "normal",
		},
		platforms: { ...ALL_PLAT_ON },
	},
	tech_global: {
		label: "国际科技",
		groups: {
			ai: "boost",
			agents: "boost",
			devtools: "boost",
			workflow: "normal",
			trade: "normal",
			crossborder: "normal",
			logistics: "normal",
			global: "boost",
			policy: "boost",
			tech: "boost",
			opensource: "boost",
			multimodal: "normal",
			content: "normal",
			market: "normal",
			company: "normal",
			consumer: "normal",
			health: "hide",
			fitness: "hide",
		},
		channels: {
			official: "boost",
			developer: "boost",
			builder: "boost",
			industry: "normal",
			policy_org: "boost",
			social: "normal",
			video: "normal",
			mp: "normal",
		},
		platforms: { ...ALL_PLAT_ON },
	},
	content_ops: {
		label: "内容平台",
		groups: {
			ai: "boost",
			agents: "normal",
			devtools: "normal",
			workflow: "boost",
			trade: "normal",
			crossborder: "boost",
			logistics: "normal",
			global: "normal",
			policy: "normal",
			tech: "normal",
			opensource: "normal",
			multimodal: "boost",
			content: "boost",
			market: "normal",
			company: "normal",
			consumer: "boost",
			health: "normal",
			fitness: "normal",
		},
		channels: {
			official: "normal",
			developer: "normal",
			builder: "boost",
			industry: "normal",
			policy_org: "normal",
			social: "boost",
			video: "boost",
			mp: "boost",
		},
		platforms: { ...ALL_PLAT_ON },
	},
	crossborder: {
		label: "跨境电商",
		groups: {
			ai: "normal",
			agents: "normal",
			devtools: "normal",
			workflow: "boost",
			trade: "boost",
			crossborder: "boost",
			logistics: "boost",
			global: "normal",
			policy: "boost",
			tech: "normal",
			opensource: "normal",
			multimodal: "normal",
			content: "boost",
			market: "normal",
			company: "normal",
			consumer: "boost",
			health: "hide",
			fitness: "hide",
		},
		channels: {
			official: "normal",
			developer: "normal",
			builder: "normal",
			industry: "boost",
			policy_org: "boost",
			social: "boost",
			video: "normal",
			mp: "normal",
		},
		platforms: { ...ALL_PLAT_ON },
	},
	policy_risk: {
		label: "政策风险",
		groups: {
			ai: "normal",
			agents: "normal",
			devtools: "normal",
			workflow: "normal",
			trade: "boost",
			crossborder: "normal",
			logistics: "boost",
			global: "boost",
			policy: "boost",
			tech: "normal",
			opensource: "normal",
			multimodal: "normal",
			content: "normal",
			market: "normal",
			company: "normal",
			consumer: "normal",
			health: "hide",
			fitness: "hide",
		},
		channels: {
			official: "boost",
			developer: "normal",
			builder: "normal",
			industry: "boost",
			policy_org: "boost",
			social: "hide",
			video: "normal",
			mp: "normal",
		},
		platforms: { YouTube: true, 抖音热榜: false, 小红书热榜: false, "X 热点": true },
	},
	developer_tools: {
		label: "开发者工具",
		groups: {
			ai: "boost",
			agents: "boost",
			devtools: "boost",
			workflow: "boost",
			trade: "normal",
			crossborder: "normal",
			logistics: "normal",
			global: "normal",
			policy: "normal",
			tech: "boost",
			opensource: "boost",
			multimodal: "normal",
			content: "normal",
			market: "normal",
			company: "normal",
			consumer: "normal",
			health: "hide",
			fitness: "hide",
		},
		channels: {
			official: "boost",
			developer: "boost",
			builder: "boost",
			industry: "normal",
			policy_org: "normal",
			social: "normal",
			video: "boost",
			mp: "normal",
		},
		platforms: { ...ALL_PLAT_ON },
	},
};

function clone<T>(o: T): T {
	return JSON.parse(JSON.stringify(o));
}

export function normalizePrefs(p: Partial<CockpitPrefs> | null): CockpitPrefs {
	const base = clone(PREF_PRESETS.ai_trade);
	const next = p && typeof p === "object" ? p : {};
	const groups: Record<string, PrefState> = Object.assign({}, base.groups, next.groups || {});
	for (const g of PREF_GROUPS) {
		if (!["boost", "normal", "hide"].includes(groups[g.key])) groups[g.key] = "normal";
	}
	const channels: Record<string, PrefState> = Object.assign({}, base.channels, next.channels || {});
	for (const c of PREF_CHANNELS) {
		if (!["boost", "normal", "hide"].includes(channels[c.key])) channels[c.key] = "normal";
	}
	const platforms: Record<string, boolean> = Object.assign(
		{},
		base.platforms,
		next.platforms || {},
	);
	for (const name of PREF_PLATFORMS) {
		if (typeof platforms[name] !== "boolean") platforms[name] = true;
	}
	return { preset: next.preset || "ai_trade", groups, channels, platforms };
}

export function loadPrefs(): CockpitPrefs {
	try {
		return normalizePrefs(JSON.parse(localStorage.getItem(PREF_KEY) || "null"));
	} catch {
		return normalizePrefs(null);
	}
}

export function savePrefs(prefs: CockpitPrefs): void {
	try {
		localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
	} catch {
		/* ignore quota */
	}
}

function itemBlob(it: PrefItem): string {
	return [
		it.topic,
		it.title,
		it.title_zh,
		it.src,
		it.a,
		it.plat,
		it.when,
		it.why,
		it.fit,
		(it.body || []).join(" "),
	]
		.filter(Boolean)
		.join(" ")
		.toLowerCase();
}

function prefMatches(it: PrefItem, g: PrefDef): boolean {
	const blob = itemBlob(it);
	return g.terms.some((t) => blob.includes(String(t).toLowerCase()));
}

export function prefStateLabel(v: PrefState): string {
	return v === "boost" ? "优先" : v === "hide" ? "隐藏" : "正常";
}

function prefDecision(it: PrefItem, prefs: CockpitPrefs): { show: boolean; score: number } {
	if (it.kind === "seed") return { show: true, score: 99 };
	if (it.plat && prefs.platforms[it.plat] === false) return { show: false, score: -99 };
	let score = 0;
	let hit = false;
	for (const g of PREF_GROUPS) {
		if (!prefMatches(it, g)) continue;
		hit = true;
		const s = prefs.groups[g.key];
		if (s === "hide") return { show: false, score: -99 };
		if (s === "boost") score += 12;
	}
	for (const c of PREF_CHANNELS) {
		if (!prefMatches(it, c)) continue;
		hit = true;
		const s = prefs.channels[c.key];
		if (s === "hide") return { show: false, score: -99 };
		if (s === "boost") score += 8;
	}
	return { show: true, score: score + (hit ? 1 : 0) };
}

/** 按偏好过滤 + 打分排序(种子置顶)。 */
export function prefList<T extends PrefItem>(list: T[], prefs: CockpitPrefs): T[] {
	return list
		.map((it, i) => ({ it, d: prefDecision(it, prefs), order: i }))
		.filter((x) => x.d.show)
		.sort((a, b) => b.d.score - a.d.score || a.order - b.order)
		.map((x) => x.it);
}

export function prefSummary(prefs: CockpitPrefs): string {
	const on = PREF_GROUPS.filter((g) => prefs.groups[g.key] === "boost")
		.map((g) => g.label)
		.slice(0, 4)
		.join(" / ");
	const ch = PREF_CHANNELS.filter((c) => prefs.channels[c.key] === "boost")
		.map((c) => c.label)
		.slice(0, 2)
		.join(" / ");
	const off = PREF_GROUPS.filter((g) => prefs.groups[g.key] === "hide")
		.map((g) => g.label)
		.join(" / ");
	return `${on || "均衡"}${ch ? ` · ${ch}` : ""}${off ? ` · 隐藏 ${off}` : ""}`;
}

const CYCLE: PrefState[] = ["boost", "normal", "hide"];

export function setPreset(key: string): CockpitPrefs {
	const p = PREF_PRESETS[key] || PREF_PRESETS.ai_trade;
	return normalizePrefs({
		preset: key,
		groups: p.groups,
		channels: p.channels,
		platforms: p.platforms,
	});
}

export function cycleGroup(prefs: CockpitPrefs, key: string): CockpitPrefs {
	const cur = prefs.groups[key] || "normal";
	const groups = { ...prefs.groups, [key]: CYCLE[(CYCLE.indexOf(cur) + 1) % CYCLE.length] };
	return { ...prefs, groups, preset: "custom" };
}

export function cycleChannel(prefs: CockpitPrefs, key: string): CockpitPrefs {
	const cur = prefs.channels[key] || "normal";
	const channels = { ...prefs.channels, [key]: CYCLE[(CYCLE.indexOf(cur) + 1) % CYCLE.length] };
	return { ...prefs, channels, preset: "custom" };
}

export function togglePlatform(prefs: CockpitPrefs, name: string): CockpitPrefs {
	const platforms = { ...prefs.platforms, [name]: !prefs.platforms[name] };
	return { ...prefs, platforms, preset: "custom" };
}

// ---------- 选题流转(本地状态,vault 只读所以存 localStorage) ----------
export const FLOW = ["候选", "已选", "已灌观点", "已成稿", "已推草稿"];
const STATUS_KEY = "cockpit-status-v1";

export function loadStatuses(): Record<string, string> {
	try {
		return JSON.parse(localStorage.getItem(STATUS_KEY) || "{}");
	} catch {
		return {};
	}
}

export function saveStatus(map: Record<string, string>): void {
	try {
		localStorage.setItem(STATUS_KEY, JSON.stringify(map));
	} catch {
		/* ignore */
	}
}

export function nextStatus(cur: string): string {
	const i = FLOW.indexOf(cur);
	return FLOW[(i + 1) % FLOW.length];
}
