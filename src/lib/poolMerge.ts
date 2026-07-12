// 选题池 × vault 当日卡的合并(纯函数,渲染端用)。展示 = vault 卡 ∪ 注入卡,状态/产物取池的增量覆盖。
// vault 只读;池(主进程 cockpit-pool)提供状态覆盖、回填产物、拉片注入卡。
import type { CockpitCard } from "./cockpitTypes";
import type { PoolArtifact, PoolTodo, TopicPool } from "./poolTypes";

/** 拉片等喂入的注入卡(转成 CockpitCard 列表,供与 vault 卡一同过滤/排序/渲染)。 */
export function injectedCards(pool: TopicPool | null): CockpitCard[] {
	return pool ? pool.injected.map((i) => i.card) : [];
}

/** 某卡的有效状态:池覆盖 > vault 卡自带 > 流程首项(候选)。 */
export function resolveStatus(card: CockpitCard, pool: TopicPool | null, flow: string[]): string {
	return pool?.entries[card.id]?.status ?? card.status ?? flow[0];
}

/** 某卡回填的关联产物(成片/拉片)。 */
export function artifactsFor(id: string, pool: TopicPool | null): PoolArtifact[] {
	return pool?.entries[id]?.artifacts ?? [];
}

/** 用户手写在某卡上的观点/看法(灌观点);无则空串。 */
export function resolveNote(id: string, pool: TopicPool | null): string {
	return pool?.entries[id]?.note ?? "";
}

/** 某卡的图文草稿(生成/编辑后存池);无则空串。 */
export function resolveDraft(id: string, pool: TopicPool | null): string {
	return pool?.entries[id]?.draft ?? "";
}

/** 某卡的待办清单(主线二:可追踪项目);无则空数组。 */
export function resolveTodos(id: string, pool: TopicPool | null): PoolTodo[] {
	return pool?.entries[id]?.todos ?? [];
}

/** 若该卡是拉片注入卡,返回其来源标注;否则 undefined。 */
export function injectedSourceFor(id: string, pool: TopicPool | null): string | undefined {
	return pool?.injected.find((i) => i.card.id === id)?.source;
}
