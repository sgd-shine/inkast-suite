// 选题 = 可追踪项目(主线二)。把「vault 卡 + 选题池增量」收敛成项目视图的纯逻辑(可测、无依赖)。
// 一个选题一旦被跟进(状态推进过 / 写了观点 / 出过草稿或产物 / 有待办),就算一个「进行中的项目」,
// 聚合到驾驶舱「项目」子 Tab,显示进度与待办,点开回到该选题详情继续推进。
import type { CockpitCard } from "./cockpitTypes";
import type { PoolEntry, PoolTodo, TopicPool } from "./poolTypes";

/** 流程首项(候选)= 还没动过的默认态;判定「是否已跟进」时排除它。 */
const DEFAULT_STATUS = "候选";

export interface TopicProject {
	id: string;
	/** 完整卡对象,供项目视图点开后复用选题详情(无需二次查表)。 */
	card: CockpitCard;
	title: string;
	topic?: string;
	status: string;
	note: string;
	hasDraft: boolean;
	artifactCount: number;
	todoTotal: number;
	todoDone: number;
	/** 未完成的待办(供项目卡直接展示下一步)。 */
	pendingTodos: PoolTodo[];
	updatedAt: number;
}

/** 该选题是否已被跟进 → 进入可追踪项目视图。无增量时仅凭卡自带的非默认状态判断。 */
export function isTracked(entry: PoolEntry | undefined, status: string): boolean {
	if (status && status !== DEFAULT_STATUS) return true;
	if (!entry) return false;
	return (
		!!entry.note?.trim() ||
		!!entry.draft?.trim() ||
		(entry.artifacts?.length ?? 0) > 0 ||
		(entry.todos?.length ?? 0) > 0
	);
}

/** 把一张卡 + 其池增量收敛成项目摘要。 */
export function summarizeProject(
	card: CockpitCard,
	entry: PoolEntry | undefined,
	status: string,
): TopicProject {
	const todos = entry?.todos ?? [];
	return {
		id: card.id,
		card,
		title: card.title,
		topic: card.topic,
		status,
		note: entry?.note ?? "",
		hasDraft: !!entry?.draft?.trim(),
		artifactCount: entry?.artifacts?.length ?? 0,
		todoTotal: todos.length,
		todoDone: todos.filter((td) => td.done).length,
		pendingTodos: todos.filter((td) => !td.done),
		updatedAt: entry?.updatedAt ?? 0,
	};
}

/**
 * 聚合所有「已跟进」选题为项目列表。状态取池覆盖 > 卡自带 > 流程首项(与 resolveStatus 同口径)。
 * 排序:最近更新优先(updatedAt 倒序),无更新时间(纯卡自带状态)排其后。
 */
export function activeProjects(
	cards: CockpitCard[],
	pool: TopicPool | null,
	flow: string[],
): TopicProject[] {
	const out: TopicProject[] = [];
	for (const card of cards) {
		const entry = pool?.entries[card.id];
		const status = entry?.status ?? card.status ?? flow[0];
		if (!isTracked(entry, status)) continue;
		out.push(summarizeProject(card, entry, status));
	}
	return out.sort((a, b) => b.updatedAt - a.updatedAt);
}
