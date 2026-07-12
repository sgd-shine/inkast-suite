// 内容驾驶舱共享类型 —— 渲染/preload/主进程共用,无 node 依赖。
// 字段对应 KnowledgePlanet 每日驾驶舱 JSON(Operations/Publishing/Review/每日驾驶舱/<date>.json)。
// Inkast 只读 + 展示,数据真源留在 vault(按路径接,不复制)。

export interface CockpitRelated {
	type?: string;
	t?: string;
	url?: string;
}

export interface CockpitMedia {
	image?: string;
	alt?: string;
	related?: CockpitRelated[];
}

export interface CockpitCard {
	id: string;
	lane?: string;
	concept?: boolean;
	kind?: string; // seed | rec
	topic?: string;
	heat?: number;
	score?: string | number;
	src?: string;
	when?: string;
	title: string;
	angle?: string;
	body?: string[];
	why?: string;
	fit?: string;
	bear?: string;
	url?: string;
	origin?: string;
	hooks?: string[];
	status?: string;
	opinion?: string;
	media?: CockpitMedia;
	plat?: string;
}

export interface CockpitFeedItem {
	tier?: string;
	topic?: string;
	when?: string;
	src?: string;
	heat?: number;
	title: string;
	title_zh?: string;
	body?: string[];
	url?: string;
	hook?: string;
	media?: CockpitMedia;
	plat?: string;
	a?: string;
}

export interface CockpitData {
	day: string;
	cards: CockpitCard[];
	radar: CockpitFeedItem[];
	hot: CockpitFeedItem[];
	social: CockpitFeedItem[];
	mp: CockpitFeedItem[];
}

export interface CockpitTodayResult {
	ok: boolean;
	dir: string; // 数据目录(按路径接 vault,不复制)
	day?: string; // 实际命中的日期
	data?: CockpitData;
	error?: string;
}
