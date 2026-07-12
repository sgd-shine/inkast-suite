// 任务管理器：排队、spawn video.sh、解析真实进度、落盘持久化。
// 移植自 video-factory/lib/jobs.mjs(逐行等价 + 补类型)。构造器已参数化 pipelineRoot/dataDir,
// 与服务器无耦合 —— SSE 在 registerJobHandlers.ts 里换成 Electron IPC,本文件不含任何 HTTP/IPC。
// 反假进度的核心:进度只来自 stageParser 解析的真实 stdout marker + run-report.json + 磁盘产物。
import { type ChildProcess, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import type {
	Job,
	JobMode,
	JobPhase,
	JobPlan,
	JobPlanPage,
	JobType,
	SubmitInput,
} from "../../src/lib/vfTypes";
import { atomicWriteFileSync } from "../lib/atomicWrite";
import { augmentedPath } from "../lib/systemPath";
import { labelForStage, parseLine } from "./stageParser";

const VIDEO_EXTS = new Set([".mov", ".mp4", ".m4v"]);

// 数据类型集中在 src/lib/vfTypes.ts(渲染/preload/主进程共用);这里再导出,本模块消费方仍可按原路径 import。
export type {
	Job,
	JobMode,
	JobPhase,
	JobPlan,
	JobPlanPage,
	JobStage,
	JobStatus,
	JobType,
	SubmitInput,
} from "../../src/lib/vfTypes";

/** buildArgs 等纯函数对入参很宽松(测试会传部分字段),用结构化子集类型。 */
type ArgJob = {
	slug: string;
	input: string;
	mode?: JobMode;
	type?: JobType;
	phase?: JobPhase;
	engineInput?: string | null;
};

export function makeSlug(date = new Date()): string {
	const p = (n: number) => String(n).padStart(2, "0");
	return `vf-${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

/** 根据投料构建 video.sh 参数。纯函数，可测试。 */
export function buildArgs(job: ArgJob): string[] {
	if (job.type === "slides") {
		// Gate B 预览阶段:用已确认的 script.json 渲轻量预览(still + 3s motion),不正式合成(详见 §5)。
		if (job.phase === "preview") return [job.slug, "--preview-pack"];
		if (job.phase === "render") return [job.slug, "--from", "voice", "--simple"];
		// plan 阶段：Claude 拆页后停下（确认点 A）；--overwrite-input 让"重新拆页"可重入
		return [
			job.slug,
			"--input",
			job.engineInput || job.input,
			"--slides-draft",
			"--simple",
			"--overwrite-input",
		];
	}
	const args = [job.slug, "--input", job.engineInput || job.input];
	if (job.mode === "publish-ready") args.push("--publish-ready");
	else args.push("--simple");
	return args;
}

/**
 * 长文案/多行文本不能直接进命令行：引擎会把它当路径做 Path.exists()，
 * 超过文件名字节上限(255B)会抛 "File name too long"。
 * 规则：含换行或 UTF-8 超过 180 字节 → 落盘成 .md 传路径（引擎按"文案文件"处理）。
 */
export function needsBriefFile(text: string): boolean {
	return text.includes("\n") || Buffer.byteLength(text, "utf8") > 180;
}

export function isVideoFile(p: string): boolean {
	return VIDEO_EXTS.has(path.extname(p).toLowerCase());
}

/**
 * 把失败日志里常见的 LLM 拆页错误翻译成「给人看、可操作」的提示。
 * 只在能确切识别时返回字符串，否则返回 null（调用方保留通用错误）。
 */
export function friendlyError(log: string): string | null {
	const t = String(log || "");
	if (/ANTHROPIC_API_KEY|DEEPSEEK_API_KEY|拆页需要\s*LLM|需要\s*LLM\s*key/i.test(t))
		return "缺少 LLM 密钥：点面板顶部黄条粘贴 DeepSeek 或 Claude 密钥（sk- 开头），保存后点「↻ 重跑」。";
	if (
		/HTTP Error 40[13]\b|Unauthorized|Forbidden|invalid[_ ]?api[_ ]?key|authentication_error|invalid x-api-key/i.test(
			t,
		)
	)
		return "LLM 密钥无效或被拒：确认粘贴的密钥完整正确（别漏字符/空格），重新保存后再「↻ 重跑」。";
	if (
		/HTTP Error 402\b|Payment Required|Insufficient Balance|insufficient_quota|余额不足|欠费/i.test(
			t,
		)
	)
		return "LLM 账户余额不足：到对应控制台（DeepSeek platform / Anthropic console）充值后再「↻ 重跑」。";
	if (/HTTP Error 429\b|rate[_ ]?limit|too many requests/i.test(t))
		return "LLM 调用被限流（429）：稍等十几秒再点「↻ 重跑」。";
	if (/HTTP Error 404\b|not found|model.*not.*exist|does not exist/i.test(t))
		return "拆页模型不可用（404）：该模型名在当前 API 不存在。换一个模型（如片场切到别家），或在 config.slides.model 填一个有效模型名后重跑。";
	if (/找不到\s*JSON|返回了空内容|JSONDecodeError|Expecting .*delimiter|找不到分镜/i.test(t))
		return "拆页模型输出无法解析成 JSON（K2.6 等推理模型常见：把答案放进 reasoning 或吐非法 JSON）。在片场把模型设为基础版 moonshot-v1-32k（或换 Qwen / DeepSeek）后重跑。";
	if (/Read timed out|TimeoutError|urlopen error timed out|timed out/i.test(t))
		return "拆页请求超时：模型响应太慢（K2.6 这类重模型常见）。重跑一次；仍超时就在片场换个更快的模型（如 Qwen / DeepSeek），或把材料改短一点。";
	return null;
}

export interface JobManagerOptions {
	pipelineRoot: string;
	dataDir: string;
	timeoutMs?: number;
	/** 任务终态(done/failed)回调 —— 用于成片完成回写选题池等漏斗联动(§5.4)。 */
	onComplete?: (job: Job) => void;
	/** 成片供应商锁定:返回 "auto" 或某 provider;非 auto 时给引擎 spawn 注入 SLIDES_PROVIDER。 */
	slidesProvider?: () => string | undefined;
}

export class JobManager extends EventEmitter {
	pipelineRoot: string;
	videoSh: string;
	dataDir: string;
	logDir: string;
	stateFile: string;
	timeoutMs: number;
	onComplete?: (job: Job) => void;
	slidesProvider?: () => string | undefined;
	jobs: Job[];
	running: Job | null;
	/** 正在跑的子进程句柄(用于「取消」时杀掉);非运行态为 null。 */
	private runningChild: ChildProcess | null = null;
	/** 用户主动取消的任务 id —— close 回调据此把状态判为「已取消」而非按退出码判 failed。 */
	#canceled = new Set<string>();
	/** 最近删除任务的日志缓存(按 id)——「撤销删除」时写回,无损还原。单会话内存,容量上限防泄漏。 */
	#removedLogs = new Map<string, string>();

	constructor({
		pipelineRoot,
		dataDir,
		timeoutMs = 45 * 60 * 1000,
		onComplete,
		slidesProvider,
	}: JobManagerOptions) {
		super();
		this.pipelineRoot = pipelineRoot;
		this.videoSh = path.join(pipelineRoot, "video.sh");
		this.dataDir = dataDir;
		this.logDir = path.join(dataDir, "logs");
		this.stateFile = path.join(dataDir, "jobs.json");
		this.timeoutMs = timeoutMs;
		this.onComplete = onComplete;
		this.slidesProvider = slidesProvider;
		this.jobs = [];
		this.running = null;
		fs.mkdirSync(this.logDir, { recursive: true });
		this.#load();
	}

	#load() {
		try {
			this.jobs = JSON.parse(fs.readFileSync(this.stateFile, "utf8")) as Job[];
			// 进程重启后，遗留的 running/queued 标记为 interrupted（诚实状态，不假装还在跑）
			for (const j of this.jobs) {
				if (j.status === "running" || j.status === "queued") {
					j.status = "interrupted";
					j.error = "编排器重启，任务中断；可重跑";
				}
			}
		} catch {
			this.jobs = [];
		}
	}

	#save() {
		atomicWriteFileSync(this.stateFile, JSON.stringify(this.jobs, null, 1));
	}

	#touch(job: Job) {
		this.#save();
		this.emit("update", job);
	}

	list(): Job[] {
		return [...this.jobs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	}

	get(id: string): Job | null {
		return this.jobs.find((j) => j.id === id) || null;
	}

	logTail(id: string, lines = 120): string {
		const file = path.join(this.logDir, `${id}.log`);
		try {
			const all = fs.readFileSync(file, "utf8").split("\n");
			return all.slice(-lines).join("\n");
		} catch {
			return "";
		}
	}

	/** 运行时改引擎根(App 内设置面板重选目录后调用),无需重启即生效。 */
	setPipelineRoot(root: string): void {
		this.pipelineRoot = root;
		this.videoSh = path.join(root, "video.sh");
	}

	engineReady(): boolean {
		try {
			fs.accessSync(this.videoSh, fs.constants.X_OK);
			return true;
		} catch {
			return false;
		}
	}

	/** 投料。type: "recording"|"idea"|"slides"；input: 文件绝对路径或想法/文案文字。 */
	submit({
		type,
		input,
		title = "",
		mode = "simple",
		sourceCardId,
		wantPreview,
	}: SubmitInput): Job {
		if (!["recording", "idea", "slides"].includes(type)) throw new Error(`未知投料类型: ${type}`);
		if (!["simple", "publish-ready"].includes(mode)) throw new Error(`未知模式: ${mode}`);
		const text = String(input || "").trim();
		if (!text) throw new Error("投料内容为空");
		if (type === "recording") {
			if (!fs.existsSync(text)) throw new Error(`录屏文件不存在: ${text}`);
			if (!isVideoFile(text)) throw new Error(`不是视频文件(.mov/.mp4/.m4v): ${text}`);
		}
		const job: Job = {
			id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
			slug: makeSlug(),
			title: title.trim() || (type === "recording" ? path.basename(text) : text.slice(0, 24)),
			type,
			input: text,
			mode,
			status: "queued",
			createdAt: new Date().toISOString(),
			startedAt: null,
			finishedAt: null,
			stages: [],
			variants: [],
			artifacts: [],
			exitCode: null,
			reportStatus: null,
			error: null,
			engineInput: null,
			phase: type === "slides" ? "plan" : null,
			plan: null,
			sourceCardId,
			// Gate B 只对 slides 有意义(idea/recording 无拆页→预览语义)。
			wantPreview: type === "slides" ? wantPreview !== false : false,
		};
		if ((type === "idea" || type === "slides") && needsBriefFile(text)) {
			const briefDir = path.join(this.dataDir, "briefs");
			fs.mkdirSync(briefDir, { recursive: true });
			const briefFile = path.join(briefDir, `${job.slug}.md`);
			fs.writeFileSync(briefFile, text.endsWith("\n") ? text : `${text}\n`);
			job.engineInput = briefFile;
		}
		this.jobs.push(job);
		this.#touch(job);
		this.#pump();
		return job;
	}

	rerun(id: string): Job {
		const old = this.get(id);
		if (!old) throw new Error("任务不存在");
		return this.submit({
			type: old.type,
			input: old.input,
			title: old.title,
			mode: old.mode,
			sourceCardId: old.sourceCardId,
			wantPreview: old.wantPreview,
		});
	}

	/** 取消/停止任务:运行中→杀子进程(close 回调据 #canceled 标 interrupted);排队中→直接标 interrupted。 */
	cancel(id: string): Job {
		const job = this.get(id);
		if (!job) throw new Error("任务不存在");
		if (this.running?.id === id && this.runningChild) {
			this.#canceled.add(id);
			this.runningChild.kill("SIGTERM");
			// 兜底:若 10s 还没退,强杀(close 回调会按 #canceled 标 interrupted)。
			setTimeout(() => this.runningChild?.kill("SIGKILL"), 10_000).unref?.();
			return job;
		}
		if (job.status === "queued") {
			job.status = "interrupted";
			job.error = "已手动取消;可重跑";
			this.#touch(job);
			return job;
		}
		throw new Error("任务不在可取消状态(只能取消排队中/运行中的)");
	}

	/** 从列表删除一条任务(连同日志)。不能删正在运行的——请先取消。
	 *  删前把日志读进内存缓存(供 restore 无损还原),再删文件。 */
	remove(id: string): Job[] {
		const job = this.get(id);
		if (!job) throw new Error("任务不存在");
		if (this.running?.id === id) throw new Error("任务正在运行,请先「取消」再删除");
		// 撤销删除:先缓存日志(还原时写回)。容量上限 FIFO 淘汰,防一直删不撤销时内存泄漏。
		try {
			const log = fs.readFileSync(path.join(this.logDir, `${job.id}.log`), "utf8");
			this.#removedLogs.set(id, log);
			if (this.#removedLogs.size > 30) {
				const oldest = this.#removedLogs.keys().next().value;
				if (oldest) this.#removedLogs.delete(oldest);
			}
		} catch {
			/* 无日志可缓存:仍可还原任务卡本身,只是日志看不到 */
		}
		this.jobs = this.jobs.filter((j) => j.id !== id);
		try {
			fs.rmSync(path.join(this.logDir, `${job.id}.log`), { force: true });
		} catch {
			/* 日志删除失败忽略 */
		}
		this.#save();
		return this.list();
	}

	/** 撤销删除(真撤销):把任务卡重新插回(日志若有缓存则写回磁盘)。任务对象由渲染端回传
	 *  (它持有刚删的 job),避免重建;已存在则幂等返回。不会重跑引擎,只还原列表项。 */
	restore(job: Job): Job[] {
		if (!job || !job.id) throw new Error("无效的任务");
		if (this.jobs.some((j) => j.id === job.id)) return this.list(); // 已在(重复还原)
		this.jobs.push(job);
		const log = this.#removedLogs.get(job.id);
		if (log != null) {
			try {
				fs.writeFileSync(path.join(this.logDir, `${job.id}.log`), log);
			} catch {
				/* 日志写回失败:任务卡仍还原,只是日志缺失 */
			}
			this.#removedLogs.delete(job.id);
		}
		this.#save();
		return this.list();
	}

	#pump() {
		if (this.running) return;
		const next = this.jobs.find((j) => j.status === "queued");
		if (!next) return;
		this.#run(next);
	}

	#run(job: Job) {
		this.running = job;
		job.status = "running";
		job.startedAt = new Date().toISOString();
		const logStream = fs.createWriteStream(path.join(this.logDir, `${job.id}.log`), { flags: "a" });
		// 日志流写失败(磁盘满 ENOSPC / 日志目录被删 / 权限变更 / fd 出错)会 emit 'error';
		// 无监听器时 Node 把它当未捕获异常抛 → 整个主进程崩溃,且发生在事件循环上、绕过下面
		// close 回调里精心写的防队列死锁 try/finally。降级为 console,绝不让日志故障崩 App。
		// (同 recordingStream.ts 对录制流的处理。)
		logStream.on("error", (e) => {
			console.error(`[jobManager] log stream ${job.id}:`, e instanceof Error ? e.message : e);
		});
		const args = buildArgs(job);
		logStream.write(`$ ./video.sh ${args.join(" ")}\n`);

		const env: NodeJS.ProcessEnv = { ...process.env };
		// 打包版 GUI app 的 PATH 不含 homebrew,而引擎内部大量用裸名 ffmpeg → 补全 PATH 才找得到。
		env.PATH = augmentedPath(env.PATH);
		// 成片供应商显式锁定:非 auto 时注入 SLIDES_PROVIDER,引擎据此选 LLM(否则它按可用 key 自动选)。
		const sp = this.slidesProvider?.();
		if (sp && sp !== "auto") env.SLIDES_PROVIDER = sp;
		const child = spawn("bash", [this.videoSh, ...args], {
			cwd: this.pipelineRoot,
			env,
			stdio: ["ignore", "pipe", "pipe"],
		});
		this.runningChild = child; // 供 cancel() 杀进程

		// 二级 SIGKILL 兜底定时器:超时发 SIGTERM 后若 10s 还没退,强杀。存句柄以便 child 正常退出时
		// 一并 clear,避免对已退出(且 pid 可能被复用)的进程再发一次 SIGKILL(review F4)。
		let killHard: ReturnType<typeof setTimeout> | null = null;
		const killTimer = setTimeout(() => {
			job.error = `超过 ${Math.round(this.timeoutMs / 60000)} 分钟超时，已终止`;
			child.kill("SIGTERM");
			killHard = setTimeout(() => child.kill("SIGKILL"), 10_000);
			killHard.unref?.();
		}, this.timeoutMs);
		killTimer.unref?.();
		const clearTimers = () => {
			clearTimeout(killTimer);
			if (killHard) clearTimeout(killHard);
		};

		const onLine = (line: string) => {
			logStream.write(`${line}\n`);
			const ev = parseLine(line);
			if (!ev) return;
			if (ev.kind === "stage") {
				job.stages.push({
					key: ev.key,
					label: labelForStage(ev.key),
					at: new Date().toISOString(),
				});
			} else if (ev.kind === "variant") {
				job.variants.push(`${ev.platform}/${ev.style}`);
			} else if (ev.kind === "artifact") {
				const abs = path.resolve(this.pipelineRoot, ev.path);
				if (!job.artifacts.includes(abs)) job.artifacts.push(abs);
			} else if (ev.kind === "success") {
				job.sawSuccess = true;
			}
			this.#touch(job);
		};

		if (child.stdout) readline.createInterface({ input: child.stdout }).on("line", onLine);
		if (child.stderr)
			readline
				.createInterface({ input: child.stderr })
				.on("line", (l: string) => logStream.write(`[err] ${l}\n`));

		child.on("close", (code) => {
			clearTimers();
			logStream.end(`\nEXIT=${code}\n`, () => {
				// 整体 try/finally:无论读 plan / 写盘(#touch)/回调是否抛,都在 finally 释放 running +
				// 推进队列。否则单个 job 的 writeFileSync 失败(磁盘满/权限)会卡住 this.running,
				// 后续排队任务永不启动 = 队列死锁。
				try {
					job.exitCode = code;
					job.finishedAt = new Date().toISOString();
					// 用户主动取消:不按退出码判 failed,标 interrupted(可重跑)。
					if (this.#canceled.has(job.id)) {
						this.#canceled.delete(job.id);
						job.status = "interrupted";
						job.error = "已手动取消;可重跑";
						this.#touch(job);
						return;
					}
					job.reportStatus = this.#readReportStatus(job.slug);
					const ok = code === 0 && (job.reportStatus ? job.reportStatus === "pass" : true);
					if (ok && job.type === "slides" && job.phase === "plan") {
						// 确认点 A：拆页完成，等用户检查/修改/确认后再合成
						job.plan = this.#readPlan(job.slug);
						job.status = job.plan ? "awaiting-confirm" : "failed";
						if (!job.plan) job.error = "拆页完成但读不到 script.json";
						this.#touch(job);
						return;
					}
					if (ok && job.type === "slides" && job.phase === "preview") {
						// Gate B：预览渲染完成,等用户看过预览(cover/motion)后确认再正式渲染
						this.#collectPreviewArtifacts(job);
						job.status = "awaiting-preview";
						if ((job.previewArtifacts?.length ?? 0) === 0)
							job.error = "预览渲染完成但找不到预览产物";
						this.#touch(job);
						return;
					}
					this.#collectArtifacts(job);
					job.status = ok ? "done" : "failed";
					if (!ok && !job.error) {
						// 仅在 job.error 未设时推断,避免已设的(如"45 分钟超时")被日志里偶现的 timed out
						// 关键词误覆盖成"换个更快模型"。先把 LLM 密钥/余额/限流错误翻人话,识别不了用退出码。
						const friendly = friendlyError(this.logTail(job.id, 200));
						job.error =
							friendly ??
							(job.reportStatus && job.reportStatus !== "pass"
								? `run-report 状态为 ${job.reportStatus}`
								: `引擎退出码 ${code}（看日志定位）`);
					}
					this.#touch(job);
					// 终态回调:成片完成回写选题池等漏斗联动(本体逻辑不变,仅外挂只读 job 的钩子)。
					try {
						this.onComplete?.(job);
					} catch {
						/* 回调异常不影响编排器 */
					}
				} catch (e) {
					// #touch 的原子写失败等异常:降级为日志,绝不让它从 stream 'finish' 回调里
					// 冒泡成未捕获异常崩主进程(finally 已保证队列不死锁,这里保证进程不崩)。
					console.error(`[jobManager] finalize ${job.id}:`, e instanceof Error ? e.message : e);
				} finally {
					this.running = null;
					this.runningChild = null;
					this.#pump();
				}
			});
		});

		child.on("error", (err: Error) => {
			clearTimers();
			job.status = "failed";
			job.error = `无法启动引擎: ${err.message}`;
			job.finishedAt = new Date().toISOString();
			this.running = null;
			this.runningChild = null;
			this.#touch(job);
			this.#pump();
		});

		this.#touch(job);
	}

	#scriptPath(slug: string): string {
		return path.join(this.pipelineRoot, "build", slug, "script.json");
	}

	#readPlan(slug: string): JobPlan | null {
		try {
			const s = JSON.parse(fs.readFileSync(this.#scriptPath(slug), "utf8"));
			return {
				title: s.title,
				deck: s.deck || {},
				pages: (s.scenes || []).map(
					(sc: Record<string, unknown>): JobPlanPage => ({
						id: sc.id as string,
						kicker: (sc.kicker as string) || "",
						heading: (sc.heading as string) || "",
						bullets: (sc.bullets as string[]) || [],
						narration: (sc.narration as string) || "",
						visual_hint: (sc.visual_hint as string) || "",
					}),
				),
			};
		} catch {
			return null;
		}
	}

	/** 确认点 A：用户改完文案后写回 script.json（要点弹出时刻退化为均匀分布）。 */
	savePlan(id: string, plan: Partial<JobPlan>): Job {
		const job = this.get(id);
		if (!job || job.status !== "awaiting-confirm") throw new Error("任务不在待确认状态");
		const file = this.#scriptPath(job.slug);
		let s: ReturnType<typeof JSON.parse>;
		try {
			s = JSON.parse(fs.readFileSync(file, "utf8"));
		} catch {
			throw new Error("读不到拆页文件(script.json 可能被删或损坏),请重新拆页再确认");
		}
		if (plan.title) s.title = String(plan.title).trim();
		const pages = plan.pages || [];
		s.scenes = (s.scenes || []).map((sc: Record<string, unknown>, i: number) => {
			const p = pages[i];
			if (!p) return sc;
			const bullets = (p.bullets || [])
				.map((b) => String(b).trim())
				.filter(Boolean)
				.slice(0, 3);
			const narration = String(p.narration || "").trim();
			if (!narration || !String(p.heading || "").trim())
				throw new Error(`第 ${i + 1} 页缺标题或口播词`);
			const edited =
				narration !== sc.narration || JSON.stringify(bullets) !== JSON.stringify(sc.bullets);
			return {
				...sc,
				kicker: String(p.kicker || "").trim(),
				heading: String(p.heading).trim(),
				bullets,
				narration,
				bullet_offsets: edited
					? bullets.map((_, k) => Number((k / Math.max(bullets.length, 1)).toFixed(4)))
					: sc.bullet_offsets,
			};
		});
		try {
			fs.writeFileSync(file, JSON.stringify(s, null, 2));
		} catch (e) {
			throw new Error(`保存拆页失败(磁盘满或权限):${e instanceof Error ? e.message : String(e)}`);
		}
		job.plan = this.#readPlan(job.slug);
		this.#touch(job);
		return job;
	}

	/** 确认点 A 通过：要预览(Gate B)→先渲预览;否则直接进配音→字幕→合成。 */
	confirm(id: string): Job {
		const job = this.get(id);
		if (!job || job.status !== "awaiting-confirm") throw new Error("任务不在待确认状态");
		if (job.wantPreview) {
			job.phase = "preview";
			job.previewArtifacts = undefined; // 旧预览作废,重渲后回填
		} else {
			job.phase = "render";
		}
		job.status = "queued";
		this.#touch(job);
		this.#pump();
		return job;
	}

	/** Gate B 通过:预览确认后进入正式渲染(配音→字幕→合成)。 */
	confirmPreview(id: string): Job {
		const job = this.get(id);
		if (!job || job.status !== "awaiting-preview") throw new Error("任务不在待预览确认状态");
		job.phase = "render";
		job.status = "queued";
		this.#touch(job);
		this.#pump();
		return job;
	}

	/** 重新拆页：再调一次 Claude（覆盖 script.json）。确认点 A 或 Gate B 预览态都可回退改稿。 */
	replan(id: string): Job {
		const job = this.get(id);
		if (!job || (job.status !== "awaiting-confirm" && job.status !== "awaiting-preview"))
			throw new Error("任务不在待确认/待预览状态");
		job.phase = "plan";
		job.status = "queued";
		job.plan = null;
		job.previewArtifacts = undefined;
		this.#touch(job);
		this.#pump();
		return job;
	}

	#readReportStatus(slug: string): string | null {
		try {
			const p = path.join(this.pipelineRoot, "build", slug, "run-report.json");
			return JSON.parse(fs.readFileSync(p, "utf8")).status ?? null;
		} catch {
			return null;
		}
	}

	/** Gate B：收集 output/previews/<slug>/ 下的预览产物(cover.png / motion-preview.mp4 等),cover/motion 排前。 */
	#collectPreviewArtifacts(job: Job) {
		const rank = (name: string): number =>
			name === "cover.png" ? 0 : name === "motion-preview.mp4" ? 1 : 2;
		try {
			const dir = path.join(this.pipelineRoot, "output", "previews", job.slug);
			const found = fs
				.readdirSync(dir)
				.filter((name) => {
					try {
						return fs.statSync(path.join(dir, name)).isFile();
					} catch {
						return false;
					}
				})
				.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
				.map((name) => path.join(dir, name));
			job.previewArtifacts = found;
		} catch {
			job.previewArtifacts = [];
		}
	}

	/** 兜底：扫描 output/ 下属于该 slug 且在任务开始后新生成的文件。 */
	#collectArtifacts(job: Job) {
		try {
			const outDir = path.join(this.pipelineRoot, "output");
			const started = new Date(job.startedAt as string).getTime();
			for (const name of fs.readdirSync(outDir)) {
				if (!name.startsWith(job.slug)) continue;
				const abs = path.join(outDir, name);
				const st = fs.statSync(abs);
				if (st.isFile() && st.mtimeMs >= started - 1000 && !job.artifacts.includes(abs)) {
					job.artifacts.push(abs);
				}
			}
		} catch {
			/* output 目录不存在时忽略 */
		}
	}
}
