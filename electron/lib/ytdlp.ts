// 贴链接直接拆(Feature 1):用 yt-dlp 从视频链接(抖音/YouTube 优先)下载到本地,再走现有拉片管线。
// 自包含原则(负责人定调「别靠手动装外部依赖」):优先用系统已装的 yt-dlp;没有则提供 App 内一键
// 下载官方 standalone 二进制到 userData/bin(同 whisper 模型「首次下载」模式,不进仓库、不污染 .app)。
//
// 现实注意:① arm64 macOS 跑「网上下来的未签名二进制」会被内核拒 → 下载后 ad-hoc 重签(codesign -s -)。
// ② yt-dlp 合流(bv+ba)要 ffmpeg → spawn 时用 augmentedPath 让它找得到 homebrew 的 ffmpeg。
// ③ 抖音常需浏览器 cookie → 探测/下载按 [无 → chrome → safari] 升级重试。
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import type { App } from "electron";
import { augmentedPath, findBin } from "./systemPath";

// 官方 standalone(PyInstaller,自带 Python,无需系统 Python)。"latest" 跟随最新版。
const YTDLP_MACOS_URL = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos";

export interface YtdlpInfo {
	ready: boolean;
	path: string | null;
	/** true=App 自下载到 userData 的副本;false=系统已装(brew/pip)。 */
	managed: boolean;
}

function managedPath(app: App): string {
	return path.join(app.getPath("userData"), "bin", "yt-dlp");
}

/** 解析可用的 yt-dlp:先 App 自管副本,再系统(homebrew/PATH);都没有→null。 */
export function resolveYtdlp(app: App): YtdlpInfo {
	const mp = managedPath(app);
	try {
		fs.accessSync(mp, fs.constants.X_OK);
		return { ready: true, path: mp, managed: true };
	} catch {
		/* 没有自管副本,看系统 */
	}
	// 在补全后的 PATH 目录里找绝对路径(打包版 GUI PATH 不含 homebrew)。
	for (const dir of augmentedPath().split(":")) {
		if (!dir) continue;
		const p = path.join(dir, "yt-dlp");
		try {
			fs.accessSync(p, fs.constants.X_OK);
			return { ready: true, path: p, managed: false };
		} catch {
			/* 继续找 */
		}
	}
	// 兜底:findBin 的标准目录(可能与上面重复,无害)。
	const fb = findBin("yt-dlp");
	if (fb !== "yt-dlp" && fs.existsSync(fb)) return { ready: true, path: fb, managed: false };
	return { ready: false, path: null, managed: false };
}

/** HTTPS 下载(跟随 30x 跳转),按 content-length 报百分比进度。 */
function downloadFile(
	url: string,
	dest: string,
	onProgress?: (pct: number) => void,
	redirectsLeft = 5,
): Promise<void> {
	return new Promise((resolve, reject) => {
		const req = https.get(url, { headers: { "User-Agent": "Inkast" } }, (res) => {
			const status = res.statusCode ?? 0;
			if (status >= 300 && status < 400 && res.headers.location) {
				res.resume();
				if (redirectsLeft <= 0) return reject(new Error("下载重定向过多"));
				const next = new URL(res.headers.location, url).toString();
				resolve(downloadFile(next, dest, onProgress, redirectsLeft - 1));
				return;
			}
			if (status !== 200) {
				res.resume();
				return reject(new Error(`下载失败 HTTP ${status}`));
			}
			const total = Number(res.headers["content-length"] || 0);
			let received = 0;
			const tmp = `${dest}.downloading`;
			const out = fs.createWriteStream(tmp);
			res.on("data", (chunk) => {
				received += chunk.length;
				if (total > 0 && onProgress) onProgress(Math.min(100, (received / total) * 100));
			});
			res.pipe(out);
			out.on("finish", () =>
				out.close(() => {
					try {
						fs.renameSync(tmp, dest);
						resolve();
					} catch (e) {
						reject(e);
					}
				}),
			);
			out.on("error", (e) => {
				try {
					fs.rmSync(tmp, { force: true });
				} catch {
					/* ignore */
				}
				reject(e);
			});
		});
		req.on("error", reject);
		req.setTimeout(120_000, () => req.destroy(new Error("下载超时")));
	});
}

/** App 内一键安装 yt-dlp:下载官方 macOS standalone → chmod → ad-hoc 重签 → 验证 --version。 */
export async function installYtdlp(
	app: App,
	onProgress?: (pct: number) => void,
): Promise<YtdlpInfo> {
	const dest = managedPath(app);
	fs.mkdirSync(path.dirname(dest), { recursive: true });
	await downloadFile(YTDLP_MACOS_URL, dest, onProgress);
	fs.chmodSync(dest, 0o755);
	// arm64 macOS 拒绝未签名二进制:ad-hoc 重签(best-effort,失败也继续验证)。
	try {
		spawnSync("codesign", ["--force", "--sign", "-", dest], { stdio: "ignore", timeout: 30_000 });
	} catch {
		/* codesign 不可用时忽略,下面 --version 会暴露能否运行 */
	}
	const r = spawnSync(dest, ["--version"], { encoding: "utf8", timeout: 20_000 });
	if (r.status !== 0) {
		throw new Error(
			`yt-dlp 安装后无法运行${r.stderr ? `:${String(r.stderr).slice(0, 200)}` : ""}。建议改用「brew install yt-dlp」。`,
		);
	}
	return { ready: true, path: dest, managed: true };
}

interface RunResult {
	code: number;
	stdout: string;
	stderr: string;
}

/** 跑 yt-dlp:env 用 augmentedPath(让它找到 ffmpeg)。onLine 逐行回调(解析下载进度)。 */
function runYtdlp(
	bin: string,
	args: string[],
	opts: { cwd?: string; timeoutMs?: number; onLine?: (line: string) => void } = {},
): Promise<RunResult> {
	return new Promise((resolve) => {
		let child: ChildProcess;
		try {
			child = spawn(bin, args, {
				cwd: opts.cwd,
				env: { ...process.env, PATH: augmentedPath() },
			});
		} catch (e) {
			resolve({ code: -1, stdout: "", stderr: e instanceof Error ? e.message : String(e) });
			return;
		}
		let stdout = "";
		let stderr = "";
		let buf = "";
		const killer = opts.timeoutMs ? setTimeout(() => child.kill("SIGKILL"), opts.timeoutMs) : null;
		killer?.unref?.();
		child.stdout?.on("data", (d: Buffer) => {
			const s = d.toString();
			stdout += s;
			if (opts.onLine) {
				buf += s;
				const lines = buf.split("\n");
				buf = lines.pop() ?? "";
				for (const l of lines) opts.onLine(l);
			}
		});
		child.stderr?.on("data", (d: Buffer) => {
			stderr += d.toString();
		});
		child.on("error", (err) => {
			if (killer) clearTimeout(killer);
			resolve({ code: -1, stdout, stderr: stderr + String(err) });
		});
		child.on("close", (code) => {
			if (killer) clearTimeout(killer);
			resolve({ code: code ?? -1, stdout, stderr });
		});
	});
}

// 抖音常需浏览器 cookie,YouTube 一般不需要 → 按 [无 → chrome → safari] 升级重试。
const COOKIE_MODES: string[][] = [
	[],
	["--cookies-from-browser", "chrome"],
	["--cookies-from-browser", "safari"],
];

export interface FetchedVideo {
	filePath: string;
	title: string;
	uploader?: string;
}

export function isDouyin(url: string): boolean {
	return /douyin\.com|iesdouyin\.com/i.test(url);
}

/**
 * 规范化视频链接,提高 yt-dlp 识别率:
 * - 抖音搜索/弹窗页(/search/...?modal_id=<id> 或任意带 modal_id)→ https://www.douyin.com/video/<id>
 *   (yt-dlp 不认搜索页,会报 Unsupported URL;真实视频 id 在 modal_id 里)。
 * 其余链接原样返回(yt-dlp 自己处理 youtube watch/shorts、v.douyin 短链等)。
 */
export function normalizeVideoUrl(url: string): string {
	const u = (url || "").trim();
	try {
		const parsed = new URL(u);
		if (isDouyin(u)) {
			const modal = parsed.searchParams.get("modal_id");
			if (modal && /^\d+$/.test(modal)) return `https://www.douyin.com/video/${modal}`;
		}
	} catch {
		/* 非标准 URL(可能是分享文案),原样交给 yt-dlp / 下面的报错处理 */
	}
	return u;
}

// 抖音 PC 网页 API 需要浏览器执行 JS 算出的 a_bogus 签名,服务端工具(yt-dlp/curl)拿到的是空响应
// → yt-dlp 报「Fresh cookies needed」(实为反爬,非登录问题)。这是平台级限制,换 cookie/UA/impersonate
// 都无解(已实测)。给用户诚实可操作的提示,而不是误导成「请登录」。
const DOUYIN_BLOCKED_MSG =
	"抖音反爬限制:yt-dlp 目前无法直接拉取抖音视频(它的网页接口需要浏览器级 a_bogus 签名,换 cookie/UA 都无解)。建议:① 先用 YouTube 链接试拉片;② 或把抖音视频下到本地后用「选择本地视频」;③ 抖音「浏览器内抓取」需单独开发(已反馈负责人)。";

/** 探测链接(--dump-json 不下载),返回首个能取到元数据的 cookie 方案 + 标题/作者。全失败→抛错。 */
async function probe(
	bin: string,
	url: string,
): Promise<{ cookieArgs: string[]; title: string; uploader?: string }> {
	let lastErr = "";
	// 抖音已实测被反爬全线挡死:只试一次(chrome cookie)避免 3 轮空等,失败给诚实提示。
	const modes = isDouyin(url) ? [["--cookies-from-browser", "chrome"]] : COOKIE_MODES;
	for (const cookieArgs of modes) {
		const r = await runYtdlp(
			bin,
			[...cookieArgs, "--dump-single-json", "--no-warnings", "--no-playlist", url],
			{ timeoutMs: 60_000 },
		);
		if (r.code === 0 && r.stdout.trim()) {
			try {
				const j = JSON.parse(r.stdout.trim().split("\n").pop() ?? "{}");
				return {
					cookieArgs,
					title: String(j.title || j.id || "未命名"),
					uploader: j.uploader || j.channel || undefined,
				};
			} catch {
				/* 解析失败,继续下个 cookie 方案 */
			}
		}
		lastErr = r.stderr.slice(-300) || `退出码 ${r.code}`;
	}
	throw new Error(friendlyFetchError(lastErr, url));
}

function friendlyFetchError(err: string, url: string): string {
	const t = err || "";
	// 抖音反爬(Fresh cookies / 空响应)——给平台级诚实提示,不再误导成「请登录」。
	if (isDouyin(url) || /Fresh cookies|\[Douyin\]/i.test(t)) return DOUYIN_BLOCKED_MSG;
	if (/Unsupported URL|no suitable|not a valid URL/i.test(t))
		return `拉取失败:不支持的链接或 yt-dlp 无法识别(${url.slice(0, 60)}…)。请用视频「分享」里的完整链接。`;
	if (/HTTP Error 40[13]|sign in|login required|private|members-only/i.test(t))
		return "拉取失败:该视频需要登录/会员或非公开。请换一条公开链接,或在 Chrome 里登录后重试。";
	if (/HTTP Error 404|not exist|removed|unavailable/i.test(t))
		return "拉取失败:视频不存在或已被删除/设为私密。";
	if (/timed out|timeout/i.test(t)) return "拉取超时:网络慢或被限流,稍后重试。";
	// 其余:暴露 yt-dlp 真实报错尾部(不再静默吞掉,便于定位)。
	return `拉取失败:${t.slice(0, 200)}`;
}

/**
 * 从链接下载视频到 userData/analyze-downloads/<ts>/,返回本地路径 + 标题。
 * 先 probe 选 cookie 方案 + 取标题,再下载;下载进度经 onProgress 回调(0–100)。
 */
export async function fetchVideo(
	app: App,
	url: string,
	onProgress?: (info: { stage: "probe" | "download"; pct: number }) => void,
): Promise<FetchedVideo> {
	const info = resolveYtdlp(app);
	if (!info.ready || !info.path)
		throw new Error("未安装 yt-dlp(拉链接需要)。点「安装拆解组件」或 brew install yt-dlp。");
	const bin = info.path;
	const target = normalizeVideoUrl(url);

	onProgress?.({ stage: "probe", pct: 0 });
	const { cookieArgs, title, uploader } = await probe(bin, target);

	const dir = path.join(app.getPath("userData"), "analyze-downloads", String(Date.now()));
	fs.mkdirSync(dir, { recursive: true });
	const outTpl = path.join(dir, "video.%(ext)s");
	const r = await runYtdlp(
		bin,
		[
			...cookieArgs,
			"-f",
			"bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b",
			"--no-playlist",
			"--merge-output-format",
			"mp4",
			"--no-part",
			"--newline",
			"-o",
			outTpl,
			target,
		],
		{
			timeoutMs: 300_000,
			onLine: (line) => {
				// yt-dlp: "[download]  42.3% of ~10.00MiB at ..." → 取百分比。
				const m = /\[download\]\s+([\d.]+)%/.exec(line);
				if (m && onProgress) onProgress({ stage: "download", pct: Number(m[1]) });
			},
		},
	);
	if (r.code !== 0)
		throw new Error(friendlyFetchError(r.stderr.slice(-400) || `退出码 ${r.code}`, target));

	// 找产出文件(merge 后通常是 video.mp4;兜底扫目录第一个视频文件)。
	const VIDEO_EXT = new Set([".mp4", ".mov", ".m4v", ".webm", ".mkv"]);
	const files = fs
		.readdirSync(dir)
		.filter((f) => VIDEO_EXT.has(path.extname(f).toLowerCase()))
		.map((f) => path.join(dir, f));
	if (files.length === 0) throw new Error("下载完成但找不到视频文件(格式不支持?)");
	return { filePath: files[0], title, uploader };
}

/** 单条视频取标题(--dump-single-json,不下载)。供「收藏」加卡片。失败抛人话错误。 */
export async function ytdlpProbeTitle(app: App, url: string): Promise<string> {
	const info = resolveYtdlp(app);
	if (!info.ready || !info.path) throw new Error("未安装 yt-dlp(点拉片面板「安装拆解组件」)。");
	const { title } = await probe(info.path, normalizeVideoUrl(url));
	return title;
}

export interface ChannelVideo {
	id: string;
	title: string;
	url: string;
	uploader?: string;
}

/**
 * 列出博主主页/频道的最近视频(--flat-playlist,不下载)。供驾驶舱「关注博主」快速浏览 + 复制链接。
 * 失败抛人话错误。limit 控制条数。
 */
export async function listChannelVideos(
	app: App,
	url: string,
	limit = 15,
): Promise<ChannelVideo[]> {
	const info = resolveYtdlp(app);
	if (!info.ready || !info.path) throw new Error("未安装 yt-dlp。");
	const bin = info.path;
	let lastErr = "";
	for (const cookieArgs of COOKIE_MODES) {
		const r = await runYtdlp(
			bin,
			[
				...cookieArgs,
				"--flat-playlist",
				"--dump-json",
				"--no-warnings",
				"--playlist-end",
				String(limit),
				url,
			],
			{ timeoutMs: 90_000 },
		);
		if (r.code === 0 && r.stdout.trim()) {
			const out: ChannelVideo[] = [];
			for (const line of r.stdout.split("\n")) {
				const s = line.trim();
				if (!s) continue;
				try {
					const j = JSON.parse(s);
					const vid = j.url || j.id;
					if (!vid) continue;
					out.push({
						id: String(j.id || vid),
						title: String(j.title || j.id || "未命名"),
						// flat-playlist 的 url 可能是相对/纯 id,优先用 webpage_url。
						url: String(j.webpage_url || j.url || vid),
						uploader: j.uploader || j.channel || undefined,
					});
				} catch {
					/* 跳过坏行 */
				}
			}
			if (out.length) return out;
		}
		lastErr = r.stderr.slice(-300) || `退出码 ${r.code}`;
	}
	throw new Error(friendlyFetchError(lastErr, url));
}
