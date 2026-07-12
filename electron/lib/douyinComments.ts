// 抖音视频评论抓取 —— Inkast 内部用 Electron Chromium 浏览器上下文完成(页面自己算 a_bogus,
// 不在 Node 伪造签名),经 DevTools Protocol 读取页面实际发出的评论接口响应。与 probeDouyinUser 同思路。
//
// 铁律:用「内存会话」(partition 无 persist: 前缀)—— 窗口关闭即清,不落 cookie/token/session。
// 匿名/未登录常被风控挡 → 诚实降级(needs_login/blocked/no_public_data/needs_manual_refresh),绝不造假。
//
// 防挂死:抖音页可能加载不完/被风控重定向,导致 executeJavaScript 等内部 await 永不返回。
// 所有内部 await 都套硬超时,循环受总时限约束,函数保证在 ~timeoutMs 内 resolve 并清理隐藏窗口。
import { extractAwemeId } from "./douyin";
import {
	type CommentFetchStatus,
	type ParsedComment,
	parseDouyinCommentResponse,
} from "../../src/lib/commentTypes";

const DESKTOP_UA =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const COMMENT_API = "/aweme/v1/web/comment/list/";
const MAX_LIMIT = 500;
const SCROLL_JS =
	'(()=>{const el=document.scrollingElement||document.body;window.scrollTo(0,el.scrollHeight);const c=document.querySelector(\'[data-e2e="comment-list"]\')||document.querySelector(".comment-mainContent");if(c)c.scrollTop=c.scrollHeight;return el?el.scrollHeight:0;})()';

function delay(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

/** 把任意 promise 套硬超时:超时或出错都以 fallback resolve,绝不挂起调用方。 */
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
	return new Promise<T>((resolve) => {
		let settled = false;
		const timer = setTimeout(() => {
			if (!settled) {
				settled = true;
				resolve(fallback);
			}
		}, ms);
		p.then(
			(v) => {
				if (!settled) {
					settled = true;
					clearTimeout(timer);
					resolve(v);
				}
			},
			() => {
				if (!settled) {
					settled = true;
					clearTimeout(timer);
					resolve(fallback);
				}
			},
		);
	});
}

export interface FetchCommentsOptions {
	/** 目标条数上限(默认 200,封顶 500)。 */
	limit?: number;
	timeoutMs?: number;
}

export interface RawCommentFetch {
	status: CommentFetchStatus;
	message?: string;
	comments: ParsedComment[];
}

/**
 * 抓取单条抖音视频的公开评论。加载视频页 → 页面自身请求评论接口 → DevTools 捕获响应 → 解析。
 * 通过滚动触发分页,累计到 limit 或稳定无新增后停止。返回诚实状态,不抛错造假、不挂起。
 */
export async function fetchDouyinComments(
	videoUrl: string,
	opts: FetchCommentsOptions = {},
): Promise<RawCommentFetch> {
	const limit = Math.max(1, Math.min(opts.limit ?? 200, MAX_LIMIT));
	const timeoutMs = opts.timeoutMs ?? 25_000;
	const awemeId = extractAwemeId(videoUrl);
	const pageUrl = awemeId ? `https://www.douyin.com/video/${awemeId}` : videoUrl;

	const electron = await import("electron");
	await electron.app.whenReady();
	const win = new electron.BrowserWindow({
		width: 1280,
		height: 900,
		show: false,
		webPreferences: {
			backgroundThrottling: false,
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
			// 无 "persist:" 前缀 = 内存会话,窗口销毁即清,不落 cookie/session(合规铁律)。
			partition: "inkast-douyin-comments",
		},
	});
	win.webContents.setUserAgent(DESKTOP_UA);

	const byId = new Map<string, ParsedComment>();
	const requestIds = new Set<string>();
	const errors: string[] = [];
	let sawCommentResponse = false;
	let needsLogin = false;
	let blocked = false;
	const debuggerApi = win.webContents.debugger;
	let detached = false;

	const cleanup = () => {
		try {
			if (!detached && debuggerApi.isAttached()) {
				debuggerApi.detach();
				detached = true;
			}
		} catch {
			/* ignore */
		}
		try {
			if (!win.isDestroyed()) win.destroy();
		} catch {
			/* ignore */
		}
	};

	const onMessage = async (
		_event: unknown,
		method: string,
		params: Record<string, unknown>,
	) => {
		try {
			if (method === "Network.responseReceived") {
				const response = params.response as { url?: string } | undefined;
				const requestId = String(params.requestId || "");
				if (requestId && (response?.url || "").includes(COMMENT_API)) {
					requestIds.add(requestId);
				}
			}
			if (method === "Network.loadingFinished") {
				const requestId = String(params.requestId || "");
				if (!requestIds.has(requestId)) return;
				requestIds.delete(requestId);
				// 窗口已销毁/调试器已分离时不要再发命令,避免 "target closed while handling command"。
				if (detached || win.isDestroyed() || !debuggerApi.isAttached()) return;
				const res = (await withTimeout(
					debuggerApi.sendCommand("Network.getResponseBody", { requestId }),
					4000,
					{} as { body?: string; base64Encoded?: boolean },
				)) as { body?: string; base64Encoded?: boolean };
				const body = res.base64Encoded
					? Buffer.from(String(res.body || ""), "base64").toString("utf8")
					: String(res.body || "");
				const parsed = parseDouyinCommentResponse(body);
				if (!parsed) {
					if (body.trim() && /login|verify|captcha|需要登录|滑块|验证/i.test(body)) {
						needsLogin = true;
					}
					return;
				}
				sawCommentResponse = true;
				if (parsed.statusCode && parsed.statusCode !== 0) blocked = true;
				for (const c of parsed.comments) {
					if (!byId.has(c.commentId)) byId.set(c.commentId, c);
				}
			}
		} catch (e) {
			errors.push(e instanceof Error ? e.message : String(e));
		}
	};

	try {
		try {
			debuggerApi.attach("1.3");
		} catch (e) {
			errors.push(e instanceof Error ? e.message : String(e));
		}
		await withTimeout(debuggerApi.sendCommand("Network.enable"), 4000, undefined);
		debuggerApi.on("message", onMessage);

		void win.loadURL(pageUrl).catch((e) => {
			errors.push(e instanceof Error ? e.message : String(e));
		});

		const deadline = Date.now() + timeoutMs;
		let lastCount = 0;
		let stagnantRounds = 0;
		while (Date.now() < deadline) {
			if (byId.size >= limit) break;
			await delay(1200);
			// 触发评论区分页:滚动页面 + 评论容器到底。套硬超时,页面卡住也不会挂起循环。
			await withTimeout(
				win.isDestroyed()
					? Promise.resolve(0)
					: win.webContents.executeJavaScript(SCROLL_JS, true),
				2500,
				0,
			);
			if (byId.size === lastCount) {
				stagnantRounds += 1;
				if (sawCommentResponse && stagnantRounds >= 4) break;
			} else {
				stagnantRounds = 0;
				lastCount = byId.size;
			}
		}
		try {
			debuggerApi.removeListener("message", onMessage);
		} catch {
			/* ignore */
		}
	} catch (e) {
		errors.push(e instanceof Error ? e.message : String(e));
	} finally {
		cleanup();
	}

	const comments = [...byId.values()].slice(0, limit);
	console.log(
		`[comments] douyin fetch done: url=${pageUrl} got=${comments.length} sawResp=${sawCommentResponse} needsLogin=${needsLogin} blocked=${blocked} errors=${errors.length}`,
	);
	let status: CommentFetchStatus;
	let message: string | undefined;
	if (comments.length > 0) {
		status = "ok";
	} else if (needsLogin) {
		status = "needs_login";
		message =
			"抖音评论接口提示需要登录态;Inkast 不保存登录凭据。可点「打开视频页面」人工查看,或由 Computer Use 辅助。";
	} else if (blocked) {
		status = "blocked";
		message = "评论接口被风控拦截。可稍后重试,或点「打开视频页面」人工处理。";
	} else if (sawCommentResponse) {
		status = "no_public_data";
		message = "页面已加载但没有可解析的公开评论(可能评论被隐藏或为 0)。";
	} else {
		status = "needs_manual_refresh";
		message =
			errors.slice(-1)[0] || "未捕获到评论接口响应(加载超时或被拦)。点「打开视频页面」人工确认。";
	}
	return { status, message, comments };
}
