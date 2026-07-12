// 分析(拉片):ffmpeg 抽帧 + ffprobe 指纹 + Claude vision → 拉片报告 + 复现 SOP。
// 净新增(拉片 skill 是提示词不是代码,见 docs/INTEGRATION.md §7)。引擎 video-pipeline 本体不动:
// 这里在 Inkast 主进程内直接用系统 ffmpeg + 调 Anthropic API(fetch),输出落 output/analyses/<slug>/。
// 反假进度:阶段(probe/extract/analyze/write)都是真实步骤,无模拟。
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { App, BrowserWindow, IpcMain } from "electron";
import { dialog } from "electron";
import type {
	AnalyzeEngineInfo,
	AnalyzeFingerprint,
	AnalyzeJob,
	AnalyzePhase,
} from "../../src/lib/analyzeTypes";
import { resolvePipelineRoot } from "../jobs/engineConfig";
import { appConfiguredProviders } from "../keys/keyStore";
import { fetchDouyinVideo } from "../lib/douyin";
import { findBin } from "../lib/systemPath";
import { fetchVideo, installYtdlp, isDouyin, resolveYtdlp } from "../lib/ytdlp";

const VIDEO_EXTS = new Set([".mov", ".mp4", ".m4v", ".webm"]);
// 拉片抽帧:密采 + 高清(2026-06-21 重写,见反馈调查)。原来固定 12 帧 + 缩到 360px,长视频
// 段都配不上、字幕/版式全糊 → 模型只能脑补。改为按时长每 ~N 秒一帧、总帧封顶(控 token),
// 分辨率给到能看清字幕/大字卡。
const MAX_FRAMES = 48; // 总帧上限(控视觉 token / 上下文,Kimi-128k 与 Claude 都放得下)
const FRAME_WIDTH = 960; // 抽帧宽(不超过源宽);360→960 让字幕/HUD/版式可读
const TARGET_INTERVAL_SEC = 4; // 目标密度:约每 4 秒一帧(短片更密,长片自动拉大间隔到封顶)

// 拉片提示词:整合自社区拉片 skill 实践(hook-lab 的 Hook 分类+改写角度、viral-video-analyzer/
// video-breakdown 的逐段 AI 生成提示词、xhs-viral-decoder 的人设改写映射、原 video-pipeline 拉片
// skill 的六步/拉技术纪律)。核心升级:在「拉技术」之上补「拉内容」,并新增产出③二次创作素材包,
// 让拉片结果**能被直接拿去做二次创作**(可发布的钩子/标题、可投产的生成提示词、可填空的口播模板)。
const LAPIAN_PROMPT = `你是"视频拉片工程师 × 爆款内容策略师"。给你的是按时间均匀抽取的高清帧 + 技术指纹(可能附音轨逐字稿)。
交付三份产出:**①拉片报告**(怎么做的)+ **②复刻 SOP**(照着能拍同款)+ **③二次创作素材包**(可直接拿去做你自己的内容)。

核心信条:既"拉技术"(怎么做出来的,看一百遍也看不出,真正值钱),也"拉内容"(选题/钩子/结构/节奏/情绪怎么设计);
最终落点 = 让使用者能把拆解结果**直接用于二次创作**——产出③必须给到成品级、换个主题就能直接发/直接投产的素材,不是泛泛建议。

先判型(口播 / 教程 / 叙事Vlog / 产品展示 / 混剪,三选一或分段判),后续按类型侧重拆解重点。
纪律:把 事实/推断/不知道 划清楚,工具链拿不准就标"推断/不知道";只依据给到的帧/指纹/逐字稿,不臆造。
有逐字稿:台词/钩子/节奏据它分析,不要脑补;没有:相关项按纪律标"不知道"。

用 Markdown 严格按下面结构输出:

## 产出① 拉片报告
- **封面**:标题 ｜ 时长/段数/切点数 ｜ 判型(+依据) ｜ 一句话定性
- **一句话结论**:这片到底怎么做的 / 为什么能成,一句说死
- **Hook 拆解(前 3 秒)**:Hook 类型(好奇缺口 / 反差数据 / 大胆断言 / 提问 / 视觉冲击 / 打断预期 …)｜ Hook 文案(若可推断)｜ 强度评分 X/10 + 为什么能让人停下来
- **内容结构 + 情绪曲线**:按叙事结构分段(钩子→背景/痛点→展开/揭示→证据/示例→CTA),逐段标"作用"与情绪走向(起伏),指出转折点与易流失处
- **可复刻度评分 X/10**:分项 拍摄·图形层·节奏·工具链
- **关键发现 ×5**
- **配帧逐段表**(每段一行):时间码 | 代表帧 | 台词(若可推断) | 图形/版式/景别运镜 | 节奏卡点 | 该段作用
- **图形层部件清单 + 工具链推断**:逐条标 置信度 事实/推断/不知道(绝不编造看不到的工具链)

## 产出② 复刻 SOP(可执行,按片型调整)
- PHASE 0 口播逐字稿要点(结构:钩子→立信+承诺→抛问题→为什么→怎么做→CTA;标记哪句弹大字卡/撞色高亮/列表图)
- PHASE 1 实拍 · PHASE 2 图形层(Remotion / 剪映) · PHASE 3 剪辑 · PHASE 4 收尾
- 可抄要点 ×5

## 产出③ 二次创作素材包(★直接可用)
> 若使用者提供了「我的赛道/人设」(见用户消息),以下全部贴着该定位、口吻、句式生成;未提供则按本视频所在赛道做通用但可落地的版本。
- **可复用内容公式**:把这条的成功套路抽象成一句可复用公式(如「反共识断言 + 永远不是 X + 给出真因」),并给一段填空式结构模板
- **Hook 仿写 ×5**:套用上面的 Hook 类型,写 5 条**可直接发布**的新钩子(换成使用者赛道的话题),每条标 Hook 类型 + 适配平台(小红书/视频号/抖音)
- **改写标题 / 选题角度 ×8**(表格):原爆款点 → 改写角度 → **可直接用的标题**
- **逐段 AI 生成提示词**:挑 3~5 个关键段,每段给 ①画面生成 prompt(生图/生视频,可喂即梦/Kling/SD,含 主体+场景+光线+色彩+运镜)②文案仿写 prompt(指明 风格/句式/字数/情绪)
- **口播稿仿写模板**:一段可填空的口播骨架,使用者换主题即可成稿

二创质量自检(必须满足):产出③每条都"换个主题就能直接发/直接投产",不是空泛建议;不照搬原文,是迁移套路;有人设时口吻保持一致。`;

// findBin 已抽到 electron/lib/systemPath.ts。原本地实现有 bug:候选数组把裸名排第一 +
// `c === name` 第一轮就 return → 绝对路径分支永不命中,打包版(PATH 不含 homebrew)探测不到
// ffmpeg → hasFfmpeg=false → 拉片按钮一直禁用、"无法启动"。新版优先返回存在的绝对路径。

// 拉片要「看」帧 → 需视觉(多模态)模型。Claude 有;DeepSeek 的对话 API 是纯文本(无视觉)不能拉片;
// Kimi(Moonshot)有视觉模型且是 OpenAI 兼容接口 —— 无 Claude 时用它。供应商自动按可用密钥选,可用
// INKAST_ANALYZE_PROVIDER / INKAST_ANALYZE_MODEL / INKAST_ANALYZE_BASE_URL 覆盖。
export type AnalyzeProvider = "anthropic" | "moonshot";

function analyzeProvider(app: App): AnalyzeProvider {
	const explicit = process.env.INKAST_ANALYZE_PROVIDER?.toLowerCase();
	if (explicit === "moonshot" || explicit === "kimi") return "moonshot";
	if (explicit === "anthropic" || explicit === "claude") return "anthropic";
	// 关键:优先「用户在 App 里填过」的视觉供应商(keys.json),而不是终端 shell 继承的 stale env。
	// 否则 shell 里有旧 ANTHROPIC_API_KEY 时,即便用户填了 Kimi 也会被错误地走 Claude → 401。
	const configured = appConfiguredProviders(app);
	if (configured.includes("moonshot")) return "moonshot";
	if (configured.includes("anthropic")) return "anthropic";
	// 用户没在 App 里填视觉 key 时,才退回看 env(兼容纯命令行用法)。
	if (process.env.ANTHROPIC_API_KEY) return "anthropic";
	if (process.env.MOONSHOT_API_KEY) return "moonshot";
	return "anthropic"; // 都没配时按默认,start() 会如实报「缺 key」
}

function providerKey(p: AnalyzeProvider): string | undefined {
	return p === "anthropic" ? process.env.ANTHROPIC_API_KEY : process.env.MOONSHOT_API_KEY;
}

function analyzeModel(p: AnalyzeProvider): string {
	if (process.env.INKAST_ANALYZE_MODEL) return process.env.INKAST_ANALYZE_MODEL;
	// Kimi 视觉默认用大上下文版(12 帧 + 提示词够放);Claude 默认 Sonnet。
	return p === "moonshot" ? "moonshot-v1-128k-vision-preview" : "claude-sonnet-4-6";
}

function moonshotBaseUrl(): string {
	return process.env.INKAST_ANALYZE_BASE_URL || "https://api.moonshot.cn/v1";
}

function run(
	bin: string,
	args: string[],
	cwd?: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
	return new Promise((resolve) => {
		const child = spawn(bin, args, { cwd, env: { ...process.env } });
		let stdout = "";
		let stderr = "";
		child.stdout?.on("data", (d: Buffer) => {
			stdout += d.toString();
		});
		child.stderr?.on("data", (d: Buffer) => {
			stderr += d.toString();
		});
		child.on("error", (err) => resolve({ code: -1, stdout, stderr: stderr + String(err) }));
		child.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));
	});
}

export class AnalyzeService {
	app: App;
	getWindow: () => BrowserWindow | null;
	onReport?: (job: AnalyzeJob, report: string) => void;
	/** 终态(done/error)回调 —— 主线四·task 1:拉片完成/失败时系统通知 + Dock 角标。 */
	onTerminal?: (job: AnalyzeJob) => void;
	ffmpeg: string;
	ffprobe: string;
	running = false;

	constructor(
		app: App,
		getWindow: () => BrowserWindow | null,
		onReport?: (job: AnalyzeJob, report: string) => void,
		onTerminal?: (job: AnalyzeJob) => void,
	) {
		this.app = app;
		this.getWindow = getWindow;
		this.onReport = onReport;
		this.onTerminal = onTerminal;
		this.ffmpeg = findBin("ffmpeg");
		this.ffprobe = findBin("ffprobe");
	}

	private ffmpegOk = false;
	private hasFfmpeg(): boolean {
		// 真实探测(§5.2):跑 `ffmpeg -version` 看退出码,而非乐观放行裸名。
		// 命中一次即记住(避免每次 engineInfo 轮询都 spawnSync 阻塞主进程);未命中则继续探测,
		// 这样用户装好 ffmpeg 后刷新即转绿。
		if (this.ffmpegOk) return true;
		try {
			const r = spawnSync(this.ffmpeg, ["-version"], { stdio: "ignore", timeout: 4000 });
			this.ffmpegOk = r.status === 0;
			return this.ffmpegOk;
		} catch {
			return false;
		}
	}

	engineInfo(): AnalyzeEngineInfo {
		const provider = analyzeProvider(this.app);
		return {
			hasFfmpeg: this.hasFfmpeg(),
			hasKey: !!providerKey(provider),
			model: analyzeModel(provider),
			provider,
		};
	}

	private push(job: AnalyzeJob, phase: AnalyzePhase, note?: string) {
		job.phase = phase;
		job.note = note;
		const win = this.getWindow();
		if (win && !win.isDestroyed()) win.webContents.send("analyze:update", job);
		// 终态(完成/失败)→ 通知主进程做系统通知 + Dock 角标(主线四·task 1)。回调异常不影响分析。
		if (phase === "done" || phase === "error") {
			try {
				this.onTerminal?.(job);
			} catch {
				/* 通知回调异常静默 */
			}
		}
	}

	private analysesDir(): string {
		return path.join(resolvePipelineRoot(this.app), "output", "analyses");
	}

	async start(
		videoPath: string,
		title?: string,
		transcript?: string,
		persona?: string,
	): Promise<{ ok: boolean; job?: AnalyzeJob; error?: string }> {
		if (this.running) return { ok: false, error: "已有分析在进行,请稍候" };
		const abs = path.resolve(videoPath);
		if (!fs.existsSync(abs)) return { ok: false, error: `视频文件不存在: ${abs}` };
		if (!VIDEO_EXTS.has(path.extname(abs).toLowerCase()))
			return { ok: false, error: `不是支持的视频(.mp4/.mov/.m4v/.webm): ${abs}` };
		const provider = analyzeProvider(this.app);
		if (!providerKey(provider)) {
			return {
				ok: false,
				error:
					provider === "moonshot"
						? "缺少 Kimi(Moonshot)密钥。在顶栏 🔑 或本面板「配置密钥」填入后重试。"
						: "缺少视觉模型密钥(拉片要「看」帧)。填 Claude 或 Kimi 密钥后重试 —— DeepSeek 是纯文本,不能拉片。",
			};
		}

		const ts = Date.now();
		const slug = `lp-${ts}`;
		const outputDir = path.join(this.analysesDir(), slug);
		const job: AnalyzeJob = {
			id: `${ts}`,
			slug,
			videoPath: abs,
			title: title?.trim() || path.basename(abs),
			phase: "idle",
			outputDir,
			model: analyzeModel(provider),
			provider,
			startedMs: ts,
		};
		this.running = true;
		// key 在此一次性取定并透传整条链,避免 callVision/callMoonshot/callAnthropic 各自重读 env
		// (分析途中用户改/清密钥会导致 provider 与 key 不一致 → 误导性 401)。
		const apiKey = providerKey(provider) ?? "";
		// 异步跑,立即返回 job;进度走 analyze:update。transcript(渲染端 whisper 转的逐字稿)+
		// persona(使用者赛道/人设,产出③据它做贴身改写)透传给视觉调用。
		this.pipeline(job, apiKey, transcript, persona).finally(() => {
			this.running = false;
		});
		return { ok: true, job };
	}

	private async pipeline(job: AnalyzeJob, apiKey: string, transcript?: string, persona?: string) {
		try {
			fs.mkdirSync(path.join(job.outputDir as string, "frames"), { recursive: true });

			// 1) 指纹
			this.push(job, "probe", "ffprobe 读技术指纹…");
			job.fingerprint = await this.probe(job.videoPath);

			// 2) 抽帧(场景切点优先,不足则均匀采样)
			this.push(job, "extract", "ffmpeg 抽代表帧…");
			const frames = await this.extractFrames(job);
			job.frameCount = frames.length;
			if (frames.length === 0) throw new Error("没抽到任何帧(视频可能损坏或编码不支持)");

			// 3) 视觉模型拉片(Claude 或 Kimi,按可用密钥自动选)
			this.push(job, "analyze", `调视觉模型(${job.model})拉片分析…`);
			const report = await this.callVision(job, frames, apiKey, transcript, persona);

			// 4) 落盘
			this.push(job, "write", "写报告…");
			const reportPath = path.join(job.outputDir as string, "report.md");
			// 逐字稿:单独落盘 transcript.txt,并附在报告末尾(用户能在报告里直接看到,而非只喂给模型)。
			const tr = (transcript || "").trim();
			if (tr) {
				try {
					fs.writeFileSync(path.join(job.outputDir as string, "transcript.txt"), tr);
				} catch {
					/* 落盘失败不影响报告 */
				}
			}
			const fullReport = tr
				? `${report}\n\n---\n\n## 附:音轨逐字稿(whisper 转写,带时间戳)\n\n${tr}\n`
				: report;
			fs.writeFileSync(reportPath, fullReport);
			fs.writeFileSync(
				path.join(job.outputDir as string, "analysis.json"),
				JSON.stringify(
					{
						slug: job.slug,
						videoPath: job.videoPath,
						title: job.title,
						model: job.model,
						fingerprint: job.fingerprint,
						frameCount: job.frameCount,
						startedMs: job.startedMs,
						finishedMs: Date.now(),
					},
					null,
					2,
				),
			);
			job.reportPath = reportPath;
			job.report = fullReport;
			job.finishedMs = Date.now();
			// 互喂闭环:关键发现回喂选题池(§4)。用模型报告(不含逐字稿附录)解析。失败不影响产出。
			try {
				this.onReport?.(job, report);
			} catch {
				/* 互喂失败静默 */
			}
			this.push(job, "done", "完成");
		} catch (e) {
			job.error = e instanceof Error ? e.message : String(e);
			job.finishedMs = Date.now();
			this.push(job, "error", job.error);
		}
	}

	private async probe(video: string): Promise<AnalyzeFingerprint> {
		const { stdout } = await run(this.ffprobe, [
			"-v",
			"quiet",
			"-print_format",
			"json",
			"-show_format",
			"-show_streams",
			video,
		]);
		const j = JSON.parse(stdout || "{}");
		const v =
			(j.streams || []).find((s: { codec_type?: string }) => s.codec_type === "video") || {};
		const [num, den] = String(v.r_frame_rate || "0/1")
			.split("/")
			.map(Number);
		const fps = den ? num / den : 0;
		const durationSec = Number(j.format?.duration || v.duration || 0);
		const bitrate = Number(j.format?.bit_rate || 0);
		return {
			width: Number(v.width || 0),
			height: Number(v.height || 0),
			fps: Math.round(fps * 100) / 100,
			durationSec: Math.round(durationSec * 100) / 100,
			bitrateKbps: bitrate ? Math.round(bitrate / 1000) : undefined,
		};
	}

	private async extractFrames(job: AnalyzeJob): Promise<string[]> {
		const dir = path.join(job.outputDir as string, "frames");
		const pattern = path.join(dir, "f_%03d.jpg");
		const dur = job.fingerprint?.durationSec || 0;
		// 均匀密采:目标每 ~TARGET_INTERVAL_SEC 秒一帧,但总帧不超过 MAX_FRAMES。
		// 长视频自动把间隔拉大(dur/MAX_FRAMES)以封顶;时长未知时退回 1/4 fps。
		const interval =
			dur > 0 ? Math.max(TARGET_INTERVAL_SEC, dur / MAX_FRAMES) : TARGET_INTERVAL_SEC;
		const fpsExpr = dur > 0 ? `1/${interval}` : "1/4";
		// scale='min(W,iw)':-2 → 不放大超过源宽,高取偶数;-q:v 3 高 JPEG 质量(看清字幕/版式)。
		await run(this.ffmpeg, [
			"-i",
			job.videoPath,
			"-vf",
			`fps=${fpsExpr},scale='min(${FRAME_WIDTH},iw)':-2`,
			"-frames:v",
			String(MAX_FRAMES),
			"-q:v",
			"3",
			"-y",
			pattern,
		]);
		return this.listFrames(dir);
	}

	private listFrames(dir: string): string[] {
		try {
			return fs
				.readdirSync(dir)
				.filter((f) => f.endsWith(".jpg"))
				.sort()
				.map((f) => path.join(dir, f));
		} catch {
			return [];
		}
	}

	/** 按供应商分发:Claude(Anthropic)或 Kimi(Moonshot,OpenAI 兼容)。 */
	private async callVision(
		job: AnalyzeJob,
		frames: string[],
		apiKey: string,
		transcript?: string,
		persona?: string,
	): Promise<string> {
		// 用 job.provider(start 时定下),不再重新求值;key 透传,不重读 env → provider 与 key 始终一致。
		return job.provider === "moonshot"
			? this.callMoonshot(job, frames, apiKey, transcript, persona)
			: this.callAnthropic(job, frames, apiKey, transcript, persona);
	}

	private framePreamble(
		job: AnalyzeJob,
		frames: string[],
		transcript?: string,
		persona?: string,
	): string {
		const fp = job.fingerprint;
		const fpText = fp
			? `技术指纹:${fp.width}×${fp.height} · ${fp.fps}fps · ${fp.durationSec}s${fp.bitrateKbps ? ` · ${fp.bitrateKbps}kbps` : ""}`
			: "技术指纹:未知";
		// 逐字稿(渲染端 whisper 转写)是「拉内容/节奏」的真实依据:有就喂进去,让模型据实分析台词/卡点,
		// 不要凭画面脑补;没有就明确告知缺失,让模型按纪律标「不知道」而非编造。
		const t = (transcript || "").trim();
		const transcriptText = t
			? `\n\n音轨逐字稿(带时间戳,据此分析台词/节奏卡点,不要脑补;与画面冲突以逐字稿为准):\n${t}`
			: "\n\n(本次未提供音轨逐字稿:台词/口播相关分析请按纪律标「不知道」,不要编造。)";
		// 赛道/人设(使用者可选填):产出③的改写/仿写贴着它生成,使二创素材直接可用。
		const p = (persona || "").trim();
		const personaText = p
			? `\n\n使用者的赛道/账号人设:「${p}」。产出③(二次创作素材包)的全部钩子/标题/口播/提示词都要贴着这个定位、口吻、句式生成,换成该赛道能落地的话题,不要泛泛通用。`
			: "\n\n(使用者未提供赛道/人设:产出③按本视频所在赛道做通用但可落地的改写。)";
		return `视频标题:${job.title}\n${fpText}\n以下是 ${frames.length} 张按时间顺序均匀抽取的高清帧:${transcriptText}${personaText}`;
	}

	/** Kimi(Moonshot)视觉 —— OpenAI 兼容 /chat/completions,image_url 走 base64 data URI。 */
	private async callMoonshot(
		job: AnalyzeJob,
		frames: string[],
		apiKey: string,
		transcript?: string,
		persona?: string,
	): Promise<string> {
		const content: Array<Record<string, unknown>> = [
			{ type: "text", text: this.framePreamble(job, frames, transcript, persona) },
		];
		for (const f of frames) {
			const b64 = fs.readFileSync(f).toString("base64");
			content.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } });
		}
		content.push({
			type: "text",
			text: "请按上述结构输出完整的 Markdown 报告(拉片报告 + 复现 SOP)。",
		});

		const resp = await fetch(`${moonshotBaseUrl()}/chat/completions`, {
			method: "POST",
			headers: {
				authorization: `Bearer ${apiKey}`,
				"content-type": "application/json",
			},
			body: JSON.stringify({
				model: job.model,
				max_tokens: 8000,
				temperature: 0.3,
				messages: [
					{ role: "system", content: LAPIAN_PROMPT },
					{ role: "user", content },
				],
			}),
		});
		if (!resp.ok) {
			const errText = await resp.text().catch(() => "");
			throw new Error(`Kimi API ${resp.status}: ${errText.slice(0, 300)}`);
		}
		const data = (await resp.json()) as {
			choices?: Array<{ message?: { content?: string } }>;
		};
		const text = (data.choices?.[0]?.message?.content || "").trim();
		if (!text) throw new Error("Kimi 返回空内容(可能模型名不对或不支持视觉)");
		return text;
	}

	private async callAnthropic(
		job: AnalyzeJob,
		frames: string[],
		apiKey: string,
		transcript?: string,
		persona?: string,
	): Promise<string> {
		const content: Array<Record<string, unknown>> = [
			{ type: "text", text: this.framePreamble(job, frames, transcript, persona) },
		];
		frames.forEach((f, i) => {
			const b64 = fs.readFileSync(f).toString("base64");
			const block: Record<string, unknown> = {
				type: "image",
				source: { type: "base64", media_type: "image/jpeg", data: b64 },
			};
			// 缓存帧块(§7「缓存必开」):最后一帧打 cache_control,缓存「系统提示 + 全部帧」前缀;
			// 重拆同源(后续精修循环)近免费,显著降本。
			if (i === frames.length - 1) block.cache_control = { type: "ephemeral" };
			content.push(block);
		});
		content.push({
			type: "text",
			text: "请按上述结构输出完整的 Markdown 报告(拉片报告 + 复现 SOP)。",
		});

		const resp = await fetch("https://api.anthropic.com/v1/messages", {
			method: "POST",
			headers: {
				"x-api-key": apiKey,
				"anthropic-version": "2023-06-01",
				"content-type": "application/json",
			},
			body: JSON.stringify({
				model: job.model,
				max_tokens: 8000,
				// 大段静态拉片提示词放 system 并加 cache_control,跨视频命中缓存(降本,§7)。
				system: [{ type: "text", text: LAPIAN_PROMPT, cache_control: { type: "ephemeral" } }],
				messages: [{ role: "user", content }],
			}),
		});
		if (!resp.ok) {
			const errText = await resp.text().catch(() => "");
			throw new Error(`Claude API ${resp.status}: ${errText.slice(0, 300)}`);
		}
		const data = (await resp.json()) as { content?: Array<{ type: string; text?: string }> };
		const text = (data.content || [])
			.filter((b) => b.type === "text")
			.map((b) => b.text || "")
			.join("\n")
			.trim();
		if (!text) throw new Error("Claude 返回空内容");
		return text;
	}

	list(): AnalyzeJob[] {
		const dir = this.analysesDir();
		let names: string[];
		try {
			names = fs.readdirSync(dir);
		} catch {
			return [];
		}
		const jobs: AnalyzeJob[] = [];
		for (const name of names) {
			const meta = path.join(dir, name, "analysis.json");
			try {
				if (!fs.existsSync(meta)) continue;
				const m = JSON.parse(fs.readFileSync(meta, "utf8"));
				const reportPath = path.join(dir, name, "report.md");
				jobs.push({
					id: m.slug || name,
					slug: m.slug || name,
					videoPath: m.videoPath || "",
					title: m.title || name,
					phase: "done",
					fingerprint: m.fingerprint,
					frameCount: m.frameCount,
					outputDir: path.join(dir, name),
					reportPath: fs.existsSync(reportPath) ? reportPath : undefined,
					model: m.model,
					startedMs: m.startedMs,
					finishedMs: m.finishedMs,
				});
			} catch {
				/* 跳过坏的 */
			}
		}
		jobs.sort((a, b) => (b.finishedMs ?? 0) - (a.finishedMs ?? 0));
		return jobs;
	}

	readReport(slug: string): string {
		const p = path.join(this.analysesDir(), slug, "report.md");
		try {
			return fs.readFileSync(p, "utf8");
		} catch {
			return "";
		}
	}
}

export function registerAnalyzeHandlers(
	ipcMain: IpcMain,
	app: App,
	getWindow: () => BrowserWindow | null,
	onReport?: (job: AnalyzeJob, report: string) => void,
	onTerminal?: (job: AnalyzeJob) => void,
): void {
	const svc = new AnalyzeService(app, getWindow, onReport, onTerminal);
	ipcMain.handle("analyze:engineInfo", () => svc.engineInfo());
	ipcMain.handle(
		"analyze:start",
		(_e, payload: { videoPath: string; title?: string; transcript?: string; persona?: string }) =>
			svc.start(payload.videoPath, payload.title, payload.transcript, payload.persona),
	);
	ipcMain.handle("analyze:list", () => svc.list());
	ipcMain.handle("analyze:report", (_e, slug: string) => svc.readReport(slug));
	ipcMain.handle("analyze:pickVideo", async (): Promise<string | null> => {
		const r = await dialog.showOpenDialog({
			properties: ["openFile"],
			filters: [{ name: "Video", extensions: ["mp4", "mov", "m4v", "webm"] }],
		});
		return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0];
	});

	// ── 贴链接直接拆(Feature 1):yt-dlp 下载视频 → 走上面的拉片管线 ──
	ipcMain.handle("analyze:ytdlpInfo", () => resolveYtdlp(app));
	ipcMain.handle("analyze:ytdlpInstall", async (): Promise<{ ok: boolean; error?: string }> => {
		try {
			await installYtdlp(app, (pct) => {
				const win = getWindow();
				if (win && !win.isDestroyed()) win.webContents.send("analyze:ytdlpProgress", pct);
			});
			return { ok: true };
		} catch (e) {
			return { ok: false, error: e instanceof Error ? e.message : String(e) };
		}
	});
	ipcMain.handle(
		"analyze:fetchUrl",
		async (
			_e,
			url: string,
		): Promise<{ ok: boolean; filePath?: string; title?: string; error?: string }> => {
			const u = String(url || "").trim();
			const onProgress = (info: { stage: "probe" | "download"; pct: number }) => {
				const win = getWindow();
				if (win && !win.isDestroyed()) win.webContents.send("analyze:fetchProgress", info);
			};
			try {
				// 抖音走「公开分享页提取」(不需 yt-dlp;yt-dlp 的抖音 extractor 被反爬挡死);其余走 yt-dlp。
				const r = isDouyin(u)
					? await fetchDouyinVideo(app, u, onProgress)
					: await fetchVideo(app, u, onProgress);
				return { ok: true, filePath: r.filePath, title: r.title };
			} catch (e) {
				return { ok: false, error: e instanceof Error ? e.message : String(e) };
			}
		},
	);
}
