// 数字人编排(薄):提交 → 轮询 → 下载 MP4。云 API provider 适配器(HeyGen 内置 + 通用 HTTP)。
// 反假进度:状态/视频地址全来自云端真实响应(适配器解析),无前端模拟。配置(含 API key)落
// userData/avatar.json(key 经 safeStorage 加密);任务落 userData/avatar-jobs.json(原子写)。
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { type App, safeStorage } from "electron";
import type {
	AvatarConfig,
	AvatarConfigPublic,
	AvatarJob,
	AvatarProviderKind,
} from "../../src/lib/avatarTypes";
import { atomicWriteFileSync } from "../lib/atomicWrite";
import {
	type AvatarHttpRequest,
	type AvatarStatusParsed,
	buildGenericStatus,
	buildGenericSubmit,
	buildHeyGenGenerate,
	buildHeyGenStatus,
	parseGenericStatus,
	parseGenericSubmit,
	parseHeyGenGenerate,
	parseHeyGenStatus,
	validateConfig,
} from "./avatarAdapter";

const POLL_INTERVAL_MS = 6000;
const POLL_TIMEOUT_MS = 12 * 60 * 1000; // 云端生成通常几分钟;封顶 12 分钟

export interface AvatarSubmitInput {
	script: string;
	title?: string;
	sourceCardId?: string;
}

export class AvatarManager extends EventEmitter {
	private configFile: string;
	private stateFile: string;
	private outputsDir: string;
	private config: AvatarConfig;
	private jobs: AvatarJob[];

	constructor(app: App) {
		super();
		const ud = app.getPath("userData");
		this.configFile = path.join(ud, "avatar.json");
		this.stateFile = path.join(ud, "avatar-jobs.json");
		this.outputsDir = path.join(ud, "avatar-outputs");
		fs.mkdirSync(this.outputsDir, { recursive: true });
		this.config = this.#loadConfig();
		this.jobs = this.#loadJobs();
	}

	// ── 配置 ──
	#loadConfig(): AvatarConfig {
		try {
			const raw = JSON.parse(fs.readFileSync(this.configFile, "utf8")) as AvatarConfig & {
				apiKeyEnc?: string;
			};
			let apiKey = raw.apiKey;
			if (raw.apiKeyEnc && safeStorage.isEncryptionAvailable()) {
				try {
					apiKey = safeStorage.decryptString(Buffer.from(raw.apiKeyEnc, "base64"));
				} catch {
					apiKey = undefined;
				}
			}
			return { ...raw, apiKey, apiKeyEnc: undefined } as AvatarConfig;
		} catch {
			return { provider: "heygen" };
		}
	}

	#saveConfig(): void {
		const { apiKey, ...rest } = this.config;
		const out: Record<string, unknown> = { ...rest };
		if (apiKey && safeStorage.isEncryptionAvailable()) {
			out.apiKeyEnc = safeStorage.encryptString(apiKey).toString("base64");
		} else if (apiKey) {
			out.apiKey = apiKey; // 加密不可用时明文兜底(0600)
		}
		atomicWriteFileSync(this.configFile, JSON.stringify(out, null, 1), { mode: 0o600 });
	}

	getConfigPublic(): AvatarConfigPublic {
		const { apiKey, ...rest } = this.config;
		return { ...rest, hasApiKey: !!apiKey };
	}

	setConfig(partial: Partial<AvatarConfig>): AvatarConfigPublic {
		// apiKey 为空字符串=不改(渲染端不回显 key,留空即保持);非空才覆盖。
		const next: AvatarConfig = { ...this.config, ...partial };
		if (partial.apiKey === undefined || partial.apiKey === "") next.apiKey = this.config.apiKey;
		this.config = next;
		this.#saveConfig();
		return this.getConfigPublic();
	}

	// ── 任务持久化 ──
	#loadJobs(): AvatarJob[] {
		try {
			const j = JSON.parse(fs.readFileSync(this.stateFile, "utf8")) as AvatarJob[];
			// 重启后遗留的在途任务标失败(诚实,不假装还在跑;云端任务可重提交)。
			for (const job of j) {
				if (job.status === "queued" || job.status === "submitting" || job.status === "processing") {
					job.status = "failed";
					job.error = "App 重启,数字人任务中断;可重新生成。";
				}
			}
			return j;
		} catch {
			return [];
		}
	}

	#saveJobs(): void {
		atomicWriteFileSync(this.stateFile, JSON.stringify(this.jobs, null, 1));
	}

	#touch(job: AvatarJob): void {
		this.#saveJobs();
		this.emit("update", job);
	}

	list(): AvatarJob[] {
		return [...this.jobs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	}

	get(id: string): AvatarJob | null {
		return this.jobs.find((j) => j.id === id) ?? null;
	}

	remove(id: string): AvatarJob[] {
		const job = this.get(id);
		this.jobs = this.jobs.filter((j) => j.id !== id);
		if (job?.videoPath) {
			try {
				fs.rmSync(job.videoPath, { force: true });
			} catch {
				/* 删产物失败忽略 */
			}
		}
		this.#saveJobs();
		return this.list();
	}

	// ── 提交 + 跑 ──
	submit(input: AvatarSubmitInput): AvatarJob {
		const script = String(input.script || "").trim();
		if (script.length < 10) throw new Error("口播稿太短(至少 10 字)。");
		const err = validateConfig(this.config);
		if (err) throw new Error(err);
		const job: AvatarJob = {
			id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
			title: input.title?.trim() || script.slice(0, 24),
			provider: this.config.provider,
			script,
			status: "queued",
			createdAt: new Date().toISOString(),
			sourceCardId: input.sourceCardId,
		};
		this.jobs.push(job);
		this.#touch(job);
		this.#run(job).catch((e) => this.#fail(job, e instanceof Error ? e.message : String(e)));
		return job;
	}

	#fail(job: AvatarJob, error: string): void {
		job.status = "failed";
		job.error = error;
		job.finishedAt = new Date().toISOString();
		this.#touch(job);
	}

	async #req(r: AvatarHttpRequest): Promise<unknown> {
		const resp = await fetch(r.url, {
			method: r.method,
			headers: r.headers,
			body: r.method === "POST" && r.body !== undefined ? JSON.stringify(r.body) : undefined,
		});
		const text = await resp.text();
		let json: unknown = {};
		try {
			json = text ? JSON.parse(text) : {};
		} catch {
			/* 非 JSON 响应:保留空对象,下面按状态码报错 */
		}
		if (!resp.ok) {
			const snippet = text.slice(0, 200);
			throw new Error(`API ${resp.status}: ${snippet || resp.statusText}`);
		}
		return json;
	}

	#buildSubmit(script: string): AvatarHttpRequest {
		return this.config.provider === "heygen"
			? buildHeyGenGenerate(this.config, script)
			: buildGenericSubmit(this.config, script);
	}

	#parseSubmit(json: unknown): { ok: boolean; remoteId?: string; error?: string } {
		return this.config.provider === "heygen"
			? parseHeyGenGenerate(json)
			: parseGenericSubmit(json, this.config.generic ?? { submitUrl: "" });
	}

	#buildStatus(remoteId: string): AvatarHttpRequest | null {
		return this.config.provider === "heygen"
			? buildHeyGenStatus(this.config, remoteId)
			: buildGenericStatus(this.config, remoteId);
	}

	#parseStatus(json: unknown): AvatarStatusParsed {
		return this.config.provider === "heygen"
			? parseHeyGenStatus(json)
			: parseGenericStatus(json, this.config.generic ?? { submitUrl: "" });
	}

	async #run(job: AvatarJob): Promise<void> {
		job.status = "submitting";
		job.message = "提交到数字人服务…";
		this.#touch(job);

		const submitRes = this.#parseSubmit(await this.#req(this.#buildSubmit(job.script)));
		if (!submitRes.ok) {
			this.#fail(job, submitRes.error || "提交失败");
			return;
		}
		job.remoteId = submitRes.remoteId;
		job.status = "processing";
		job.message = "云端生成中…";
		this.#touch(job);

		const statusReq = this.#buildStatus(submitRes.remoteId ?? "");
		// 当前仅支持 submit→poll→download 形态(HeyGen 必有轮询;通用适配器需配 statusUrl)。
		if (!statusReq) {
			this.#fail(job, "通用适配器未配置轮询地址(statusUrl);当前仅支持 submit→poll 形态。");
			return;
		}
		const started = Date.now();

		while (Date.now() - started < POLL_TIMEOUT_MS) {
			await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
			let parsed: AvatarStatusParsed;
			try {
				parsed = this.#parseStatus(await this.#req(statusReq));
			} catch (e) {
				// 单次轮询网络抖动不致命,继续重试到超时。
				job.message = `查询状态出错,重试中…(${e instanceof Error ? e.message : e})`;
				this.#touch(job);
				continue;
			}
			if (parsed.status === "failed") {
				this.#fail(job, parsed.error || "云端生成失败");
				return;
			}
			if (parsed.status === "done" && parsed.videoUrl) {
				job.message = "下载成片…";
				this.#touch(job);
				try {
					job.videoPath = await this.#download(parsed.videoUrl, job.id);
				} catch (e) {
					this.#fail(job, `成片下载失败:${e instanceof Error ? e.message : String(e)}`);
					return;
				}
				job.status = "done";
				job.message = undefined;
				job.finishedAt = new Date().toISOString();
				this.#touch(job);
				return;
			}
		}
		this.#fail(job, `超时(${Math.round(POLL_TIMEOUT_MS / 60000)} 分钟)未完成;可稍后重试。`);
	}

	async #download(url: string, jobId: string): Promise<string> {
		const resp = await fetch(url);
		if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
		const buf = Buffer.from(await resp.arrayBuffer());
		const file = path.join(this.outputsDir, `${jobId}.mp4`);
		fs.writeFileSync(file, buf);
		return file;
	}

	/** 供应商常量(渲染端下拉用)。 */
	static providers: AvatarProviderKind[] = ["heygen", "generic"];

	isOutputPath(p: string): boolean {
		const abs = path.resolve(p);
		return abs === this.outputsDir || abs.startsWith(this.outputsDir + path.sep);
	}
}
