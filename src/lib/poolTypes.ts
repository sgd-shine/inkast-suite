// 本地选题池(cockpit-pool)共享类型 —— 渲染/preload/主进程共用,无 node 依赖。
//
// 设计(见 docs/下一阶段_执行交接 §6.2):
//   vault 当日驾驶舱 JSON 只读(electron/cockpit/cockpit.ts),选题池是叠加在它之上的「本地增量层」。
//   展示 = vault 当日卡 ∪ 选题池。池只存增量,vault 刷新不丢本地状态:
//     · entries[card.id] —— 用户改的流转状态 / 成片·拉片回填的关联产物(覆盖/补充 vault 卡)
//     · injected[]       —— 拉片报告关键发现喂入的新卡(vault 没有,池自带完整 payload)
//   硬理由:流转/回填要被主进程(JobManager / AnalyzeService)读写,渲染私有的 localStorage 做不到。
import type { CockpitCard } from "./cockpitTypes";

export type PoolArtifactKind = "film" | "analysis" | "recording" | "publish";

/** 回填到某选题上的关联产物(成片 mp4 / 拉片报告目录 / 录屏原档)。 */
export interface PoolArtifact {
	kind: PoolArtifactKind;
	path: string;
	jobId?: string;
	at: number;
}

/** 选题待办项(主线二:把选题当可追踪项目,带下一步行动清单)。id 由主进程生成。 */
export interface PoolTodo {
	id: string;
	text: string;
	done: boolean;
	createdAt: number;
	/** 勾选完成的时刻;取消勾选后清空。 */
	doneAt?: number;
}

/** 池对某张卡(vault 卡或注入卡)的增量覆盖,按 card.id 对齐。 */
export interface PoolEntry {
	id: string;
	/** 用户覆盖的流转状态(优先于 vault card.status)。 */
	status?: string;
	/** 用户手写的观点/看法(灌观点):vault 只读,这里承载;流转时作为 opinion 进口播稿。 */
	note?: string;
	/** 图文初稿(LLM 生成 + 用户编辑);送发布看板时落 Publishing/Drafts。 */
	draft?: string;
	/** 成片/拉片回填的关联产物。 */
	artifacts?: PoolArtifact[];
	/** 选题作为可追踪项目的下一步行动清单(主线二)。 */
	todos?: PoolTodo[];
	updatedAt: number;
}

/** 拉片报告等喂入的新卡 —— vault 不含,池自带完整卡 payload + 来源标注。 */
export interface PoolInjectedCard {
	card: CockpitCard;
	/** 来源,如 "拉片:lp-1718800000000"。 */
	source: string;
	createdAt: number;
}

export interface TopicPool {
	version: number;
	/** 按 card.id 索引的增量覆盖。 */
	entries: Record<string, PoolEntry>;
	/** 注入的新卡(拉片互喂等)。 */
	injected: PoolInjectedCard[];
	/** 旧版 localStorage 流转状态是否已一次性迁入(防重复迁移覆盖回填)。 */
	migratedLegacy?: boolean;
}

export const EMPTY_POOL: TopicPool = {
	version: 1,
	entries: {},
	injected: [],
	migratedLegacy: false,
};
