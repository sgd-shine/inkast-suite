// 本地选题池(cockpit-pool):vault 当日卡之上的本地增量层。主进程读写,IPC 暴露给渲染。
// 见 docs/下一阶段_执行交接 §6.2。vault 仍只读(cockpit.ts),这里只存增量,不碰 vault。
import { EventEmitter } from "node:events";
import type { BrowserWindow, IpcMain } from "electron";
import type { CockpitCard } from "../../src/lib/cockpitTypes";
import {
	EMPTY_POOL,
	type PoolArtifact,
	type PoolTodo,
	type TopicPool,
} from "../../src/lib/poolTypes";
import { JsonStore } from "../lib/jsonStore";

/** 变更后 emit "change"(新 pool),供 IPC 广播 pool:update 给渲染(成片回填/拉片注入实时可见)。 */
export class TopicPoolStore extends EventEmitter {
	private readonly store: JsonStore<TopicPool>;
	private now: () => number;
	/** 待办 id 单调序号(配合时钟保证同一毫秒内多次添加也不撞 id;测试时钟自增即天然唯一)。 */
	private todoSeq = 0;

	/** file: cockpit-pool.json 绝对路径。now: 可注入时钟(测试用)。 */
	constructor(file: string, now: () => number = Date.now) {
		super();
		this.store = new JsonStore<TopicPool>(file, {
			...EMPTY_POOL,
			entries: {},
			injected: [],
		});
		this.now = now;
	}

	private commit(next: TopicPool): TopicPool {
		const saved = this.store.set(next);
		this.emit("change", saved);
		return saved;
	}

	get(): TopicPool {
		return this.store.get();
	}

	/** 覆盖某卡的流转状态(用户点状态徽标循环 / 回填)。 */
	setStatus(id: string, status: string): TopicPool {
		const p = this.store.get();
		const prev = p.entries[id];
		return this.commit({
			...p,
			entries: { ...p.entries, [id]: { ...prev, id, status, updatedAt: this.now() } },
		});
	}

	/** 用户手写观点/看法(灌观点);保留已有字段,只更 note。 */
	setNote(id: string, note: string): TopicPool {
		const p = this.store.get();
		const prev = p.entries[id];
		return this.commit({
			...p,
			entries: { ...p.entries, [id]: { ...prev, id, note, updatedAt: this.now() } },
		});
	}

	/** 图文初稿(生成/编辑);保留已有字段,只更 draft。 */
	setDraft(id: string, draft: string): TopicPool {
		const p = this.store.get();
		const prev = p.entries[id];
		return this.commit({
			...p,
			entries: { ...p.entries, [id]: { ...prev, id, draft, updatedAt: this.now() } },
		});
	}

	/** 回填关联产物(成片完成 / 拉片报告);可同时覆盖状态(如成片完成→已成稿)。 */
	recordArtifact(id: string, artifact: PoolArtifact, status?: string): TopicPool {
		const p = this.store.get();
		const prev = p.entries[id];
		const artifacts = [
			...(prev?.artifacts ?? []).filter((a) => a.path !== artifact.path),
			artifact,
		];
		return this.commit({
			...p,
			entries: {
				...p.entries,
				[id]: { ...prev, id, status: status ?? prev?.status, artifacts, updatedAt: this.now() },
			},
		});
	}

	/** 选题待办:追加一条下一步行动(主线二);保留已有字段,只更 todos。空文本忽略。 */
	addTodo(id: string, text: string): TopicPool {
		const body = text.trim();
		const p = this.store.get();
		if (!body) return p;
		const prev = p.entries[id];
		const at = this.now();
		const todo: PoolTodo = {
			id: `td${at}_${this.todoSeq++}`,
			text: body,
			done: false,
			createdAt: at,
		};
		const todos = [...(prev?.todos ?? []), todo];
		return this.commit({
			...p,
			entries: { ...p.entries, [id]: { ...prev, id, todos, updatedAt: at } },
		});
	}

	/** 选题待办:勾选/取消勾选某条(done 切换,记录/清空 doneAt)。 */
	toggleTodo(id: string, todoId: string): TopicPool {
		const p = this.store.get();
		const prev = p.entries[id];
		const at = this.now();
		const todos = (prev?.todos ?? []).map((td) =>
			td.id === todoId ? { ...td, done: !td.done, doneAt: !td.done ? at : undefined } : td,
		);
		return this.commit({
			...p,
			entries: { ...p.entries, [id]: { ...prev, id, todos, updatedAt: at } },
		});
	}

	/** 选题待办:删除某条。 */
	removeTodo(id: string, todoId: string): TopicPool {
		const p = this.store.get();
		const prev = p.entries[id];
		const at = this.now();
		const todos = (prev?.todos ?? []).filter((td) => td.id !== todoId);
		return this.commit({
			...p,
			entries: { ...p.entries, [id]: { ...prev, id, todos, updatedAt: at } },
		});
	}

	/** 拉片关键发现喂入新卡;按 card.id 去重(已存在则用新 payload 覆盖,不重复追加)。 */
	addInjected(card: CockpitCard, source: string): TopicPool {
		const p = this.store.get();
		const rest = p.injected.filter((i) => i.card.id !== card.id);
		return this.commit({
			...p,
			injected: [...rest, { card, source, createdAt: this.now() }],
		});
	}

	/**
	 * 旧版 localStorage 流转状态一次性迁入:仅补「池里还没有」的卡,绝不覆盖已有增量(如成片回填),
	 * 并置 migratedLegacy 标记,之后不再迁移。原子(单次写),避免渲染端 N 次 IPC 串行写。
	 */
	importLegacy(statuses: Record<string, string>): TopicPool {
		const p = this.store.get();
		if (p.migratedLegacy) return p;
		const entries = { ...p.entries };
		for (const [id, status] of Object.entries(statuses)) {
			if (!entries[id] && status) entries[id] = { id, status, updatedAt: this.now() };
		}
		return this.commit({ ...p, entries, migratedLegacy: true });
	}
}

export function registerTopicPoolHandlers(
	ipcMain: IpcMain,
	pool: TopicPoolStore,
	getWindow: () => BrowserWindow | null,
): void {
	// 池任何变更(渲染改状态 / 主进程成片回填 / 拉片注入)→ 广播给渲染实时刷新。
	pool.on("change", (next: TopicPool) => {
		const win = getWindow();
		if (win && !win.isDestroyed()) win.webContents.send("pool:update", next);
	});
	ipcMain.handle("pool:get", (): TopicPool => pool.get());
	ipcMain.handle(
		"pool:setStatus",
		(_e, { id, status }: { id: string; status: string }): TopicPool => pool.setStatus(id, status),
	);
	ipcMain.handle(
		"pool:setNote",
		(_e, { id, note }: { id: string; note: string }): TopicPool => pool.setNote(id, note),
	);
	ipcMain.handle(
		"pool:setDraft",
		(_e, { id, draft }: { id: string; draft: string }): TopicPool => pool.setDraft(id, draft),
	);
	ipcMain.handle(
		"pool:recordArtifact",
		(
			_e,
			{ id, artifact, status }: { id: string; artifact: PoolArtifact; status?: string },
		): TopicPool => pool.recordArtifact(id, artifact, status),
	);
	ipcMain.handle(
		"pool:addTodo",
		(_e, { id, text }: { id: string; text: string }): TopicPool => pool.addTodo(id, text),
	);
	ipcMain.handle(
		"pool:toggleTodo",
		(_e, { id, todoId }: { id: string; todoId: string }): TopicPool => pool.toggleTodo(id, todoId),
	);
	ipcMain.handle(
		"pool:removeTodo",
		(_e, { id, todoId }: { id: string; todoId: string }): TopicPool => pool.removeTodo(id, todoId),
	);
	ipcMain.handle(
		"pool:addInjected",
		(_e, { card, source }: { card: CockpitCard; source: string }): TopicPool =>
			pool.addInjected(card, source),
	);
	ipcMain.handle(
		"pool:importLegacy",
		(_e, statuses: Record<string, string>): TopicPool => pool.importLegacy(statuses),
	);
}
