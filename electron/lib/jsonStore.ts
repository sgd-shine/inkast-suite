// 通用「落盘 JSON 状态」小工具 —— 抽自 jobManager 的 #load/#save 模式(读不到/坏了回退默认,不崩)。
// 主进程多处需要在 userData 下持久化 JSON(jobs / 选题池 / 配置),这里收成一处可测试的实现。
import fs from "node:fs";
import path from "node:path";
import { atomicWriteFileSync } from "./atomicWrite";

export class JsonStore<T> {
	private readonly file: string;
	private data: T;

	/** file: 绝对路径;fallback: 读不到/解析失败时的初始值(会被深用,调用方勿共享可变引用)。 */
	constructor(file: string, fallback: T) {
		this.file = file;
		fs.mkdirSync(path.dirname(file), { recursive: true });
		this.data = this.#load(fallback);
	}

	#load(fallback: T): T {
		try {
			return JSON.parse(fs.readFileSync(this.file, "utf8")) as T;
		} catch {
			return fallback;
		}
	}

	#save(): void {
		atomicWriteFileSync(this.file, JSON.stringify(this.data, null, 1));
	}

	get(): T {
		return this.data;
	}

	set(next: T): T {
		this.data = next;
		this.#save();
		return this.data;
	}

	/** 读-改-写一步到位;回调返回的新值落盘并成为当前值。 */
	update(fn: (cur: T) => T): T {
		this.data = fn(this.data);
		this.#save();
		return this.data;
	}
}
