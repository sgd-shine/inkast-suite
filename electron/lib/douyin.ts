// 抖音「公开分享链接视频提取」(负责人 2026-06-26 提供的合规路径;CodeX 已验证可行)。
// 不是去水印、不绕过登录/权限/DRM —— 只读公开 SSR 分享页暴露的(带水印)播放地址。
// yt-dlp 的抖音 extractor 被反爬挡死(网页接口要 a_bogus 签名),改走这条:
//   1) 解析 v.douyin.com 短链 → aweme_id
//   2) 移动端 UA 请求 iesdouyin SSR 分享页(?from_ssr=1)
//   3) 抽 <script>window._ROUTER_DATA=…</script> → JSON
//   4) loaderData[<page>].videoInfoRes.item_list[0].video.play_addr.url_list[0]
//   5) 移动端 UA + Referer 下载该地址(跟随 30x),落本地 → 走拉片管线
// 沙箱测不了抖音 CDN(网络限制),但提取这步已实测通过;下载是普通 GET。
import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import type { App } from "electron";

// 移动端 UA:iesdouyin SSR 分享页只对移动 UA 渲染 _ROUTER_DATA(PC UA 给反爬桩页)。
const MOBILE_UA =
	"Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1";
const REFERER = "https://www.iesdouyin.com/";
const DESKTOP_UA =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36";

export interface DouyinUserVideo {
	aweme_id: string;
	title: string;
	share_url: string;
}

export interface DouyinUserProfile {
	sec_uid?: string;
	nickname?: string;
	aweme_count?: number;
	follower_count?: number;
	following_count?: number;
	total_favorited?: number;
	signature?: string;
}

export interface DouyinUserProbeResult {
	sec_uid: string;
	profile?: DouyinUserProfile;
	videos: DouyinUserVideo[];
	errors: string[];
}

/** 从各种抖音链接形态里抽 aweme_id(纯函数,可测)。短链 v.douyin.com 需先 resolveAwemeId 解析。 */
export function extractAwemeId(url: string): string | null {
	const u = url || "";
	return (
		u.match(/\/video\/(\d+)/)?.[1] ?? // douyin.com/video/<id> · iesdouyin/share/video/<id>
		u.match(/[?&]modal_id=(\d+)/)?.[1] ?? // 搜索/弹窗页 ?modal_id=<id>
		u.match(/\/note\/(\d+)/)?.[1] ?? // 图文 note(无视频,后续会如实报错)
		null
	);
}

/** 从抖音博主主页 URL 或 sec_uid 字符串里抽 sec_uid。 */
export function extractDouyinSecUid(input: string): string | null {
	const raw = String(input || "").trim();
	if (!raw) return null;
	if (/^MS4wLjAB[A-Za-z0-9_-]+$/.test(raw)) return raw;
	try {
		const u = new URL(raw);
		const fromPath = u.pathname.match(/\/(?:user|share\/user)\/([^/?#]+)/)?.[1];
		if (fromPath) return decodeURIComponent(fromPath);
		const fromQuery = u.searchParams.get("sec_uid") || u.searchParams.get("sec_user_id");
		if (fromQuery) return fromQuery;
	} catch {
		/* 不是 URL */
	}
	return null;
}

/** 解析 SSR 分享页 HTML 里的 window._ROUTER_DATA → { 标题, 播放地址 }(纯函数,可测)。 */
export function parseRouterData(html: string): { title: string; playUrl: string } | null {
	const marker = "window._ROUTER_DATA";
	const i = html.indexOf(marker);
	if (i < 0) return null;
	const eq = html.indexOf("=", i);
	const end = html.indexOf("</script>", eq);
	if (eq < 0 || end < 0) return null;
	let data: Record<string, unknown>;
	try {
		data = JSON.parse(html.slice(eq + 1, end).trim());
	} catch {
		return null;
	}
	const ld = (data.loaderData ?? {}) as Record<
		string,
		{ videoInfoRes?: { item_list?: DouyinItem[] } }
	>;
	const pageKey = Object.keys(ld).find((k) => ld[k]?.videoInfoRes?.item_list?.length);
	const item = pageKey ? ld[pageKey].videoInfoRes?.item_list?.[0] : undefined;
	if (!item) return null;
	const playUrl = (item.video?.play_addr?.url_list ?? []).find(Boolean);
	if (!playUrl) return null;
	return {
		title: cleanDouyinTitle(item.desc).slice(0, 80),
		playUrl,
	};
}

interface DouyinItem {
	aweme_id?: string;
	desc?: string;
	author?: { sec_uid?: string };
	video?: { play_addr?: { url_list?: string[] } };
}

function cleanDouyinTitle(value: unknown): string {
	return (
		String(value || "抖音视频")
			.replace(/\s+/g, " ")
			.trim()
			.slice(0, 120) || "抖音视频"
	);
}

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function optionalNumber(value: unknown): number | undefined {
	const n = Number(value);
	return Number.isFinite(n) ? n : undefined;
}

/** 解析抖音作品接口 JSON,只取公开可分享链接字段(纯函数,可测)。 */
export function parseDouyinPostResponse(
	body: string,
	expectedSecUid?: string,
	limit = 18,
): DouyinUserVideo[] {
	let data: Record<string, unknown>;
	try {
		data = JSON.parse(body);
	} catch {
		return [];
	}
	const list = (
		Array.isArray(data.aweme_list)
			? data.aweme_list
			: Array.isArray(data.awemeList)
				? data.awemeList
				: []
	) as DouyinItem[];
	const out: DouyinUserVideo[] = [];
	const seen = new Set<string>();
	for (const item of list) {
		const id = String(item.aweme_id || "").trim();
		if (!/^\d{10,}$/.test(id) || seen.has(id)) continue;
		const itemSecUid = item.author?.sec_uid;
		if (expectedSecUid && itemSecUid && itemSecUid !== expectedSecUid) continue;
		seen.add(id);
		out.push({
			aweme_id: id,
			title: cleanDouyinTitle(item.desc),
			share_url: `https://www.douyin.com/video/${id}`,
		});
		if (out.length >= limit) break;
	}
	return out;
}

/** 解析抖音作者 profile 接口 JSON,用于关注源追踪作品数变化(纯函数,可测)。 */
export function parseDouyinProfileResponse(body: string): DouyinUserProfile | null {
	let data: Record<string, unknown>;
	try {
		data = JSON.parse(body);
	} catch {
		return null;
	}
	const user = asRecord(data.user ?? data.user_info ?? data.userInfo);
	if (!Object.keys(user).length) return null;
	const profile: DouyinUserProfile = {
		sec_uid: String(user.sec_uid ?? user.secUid ?? "").trim() || undefined,
		nickname: cleanDouyinTitle(user.nickname ?? user.name ?? "抖音博主"),
		aweme_count: optionalNumber(user.aweme_count ?? user.awemeCount),
		follower_count: optionalNumber(user.follower_count ?? user.followerCount),
		following_count: optionalNumber(user.following_count ?? user.followingCount),
		total_favorited: optionalNumber(user.total_favorited ?? user.totalFavorited),
		signature: String(user.signature ?? "").trim() || undefined,
	};
	if (
		!profile.sec_uid &&
		!profile.nickname &&
		profile.aweme_count === undefined &&
		profile.follower_count === undefined
	) {
		return null;
	}
	return profile;
}

/** GET 文本(跟随 30x),移动端 UA。用于取 SSR 分享页 / 解析短链。 */
function getText(url: string, redirects = 5): Promise<{ finalUrl: string; body: string }> {
	return new Promise((resolve, reject) => {
		const req = https.get(
			url,
			{ headers: { "User-Agent": MOBILE_UA, Referer: REFERER } },
			(res) => {
				const status = res.statusCode ?? 0;
				if (status >= 300 && status < 400 && res.headers.location) {
					res.resume();
					if (redirects <= 0) return reject(new Error("重定向过多"));
					resolve(getText(new URL(res.headers.location, url).toString(), redirects - 1));
					return;
				}
				let body = "";
				res.setEncoding("utf8");
				res.on("data", (c) => {
					body += c;
				});
				res.on("end", () => resolve({ finalUrl: url, body }));
			},
		);
		req.on("error", reject);
		req.setTimeout(20_000, () => req.destroy(new Error("请求超时")));
	});
}

/** 解析短链 / 各种形态 → aweme_id。先纯解析,拿不到再跟随短链跳转。 */
async function resolveAwemeId(url: string): Promise<string> {
	const direct = extractAwemeId(url);
	if (direct) return direct;
	// v.douyin.com 短链:跟随跳转,从落地 URL 抽 id。
	const { finalUrl } = await getText(url);
	const id = extractAwemeId(finalUrl);
	if (id) return id;
	throw new Error("无法从该抖音链接解析出视频 id(请用「分享」里的完整链接;图文帖无视频)。");
}

/** 下载播放地址到 dest(移动端 UA + Referer,跟随 30x),进度回调 0–100。 */
function download(
	url: string,
	dest: string,
	onProgress?: (pct: number) => void,
	redirects = 5,
): Promise<void> {
	return new Promise((resolve, reject) => {
		const req = https.get(
			url,
			{ headers: { "User-Agent": MOBILE_UA, Referer: REFERER } },
			(res) => {
				const status = res.statusCode ?? 0;
				if (status >= 300 && status < 400 && res.headers.location) {
					res.resume();
					if (redirects <= 0) return reject(new Error("下载重定向过多"));
					resolve(
						download(
							new URL(res.headers.location, url).toString(),
							dest,
							onProgress,
							redirects - 1,
						),
					);
					return;
				}
				if (status !== 200) {
					res.resume();
					return reject(new Error(`下载失败 HTTP ${status}`));
				}
				const total = Number(res.headers["content-length"] || 0);
				let got = 0;
				const tmp = `${dest}.downloading`;
				const out = fs.createWriteStream(tmp);
				res.on("data", (c) => {
					got += c.length;
					if (total > 0 && onProgress) onProgress(Math.min(100, (got / total) * 100));
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
			},
		);
		req.on("error", reject);
		req.setTimeout(120_000, () => req.destroy(new Error("下载超时")));
	});
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 博主主页 → profile + 最近公开视频列表。
 *
 * 这条路故意不在 Node 里伪造 a_bogus:用 Electron 的 Chromium 页面自己加载公开主页,
 * 再通过 DevTools Protocol 读取页面实际发出的 profile / 作品接口响应。作品列表常会被
 * 当前网络/登录/风控上下文挡住;profile 里的作品数通常仍可作为关注源追踪信号。
 */
export async function probeDouyinUser(
	secUidOrUrl: string,
	limit = 12,
	timeoutMs = 22_000,
): Promise<DouyinUserProbeResult> {
	const secUid = extractDouyinSecUid(secUidOrUrl);
	if (!secUid) throw new Error("无法识别抖音博主主页或 sec_uid。");

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
			partition: "persist:inkast-douyin",
		},
	});
	win.webContents.setUserAgent(DESKTOP_UA);

	const videos: DouyinUserVideo[] = [];
	const errors: string[] = [];
	const requestIds = new Map<string, "post" | "profile">();
	const debuggerApi = win.webContents.debugger;
	let profile: DouyinUserProfile | undefined;
	let sawPostResponse = false;
	let profileCapturedAt = 0;

	try {
		debuggerApi.attach("1.3");
		await debuggerApi.sendCommand("Network.enable");
		const onDebuggerMessage = async (
			_event: unknown,
			method: string,
			params: Record<string, unknown>,
		) => {
			try {
				if (method === "Network.responseReceived") {
					const response = params.response as { url?: string } | undefined;
					const requestId = String(params.requestId || "");
					const responseUrl = response?.url || "";
					if (!requestId) return;
					if (responseUrl.includes("/aweme/v1/web/aweme/post/")) {
						requestIds.set(requestId, "post");
					} else if (responseUrl.includes("/aweme/v1/web/user/profile/other/")) {
						requestIds.set(requestId, "profile");
					}
				}
				if (method === "Network.loadingFinished") {
					const requestId = String(params.requestId || "");
					const kind = requestIds.get(requestId);
					if (!kind) return;
					requestIds.delete(requestId);
					const res = (await debuggerApi.sendCommand("Network.getResponseBody", {
						requestId,
					})) as { body?: string; base64Encoded?: boolean };
					const body = res.base64Encoded
						? Buffer.from(String(res.body || ""), "base64").toString("utf8")
						: String(res.body || "");
					if (kind === "profile") {
						const parsed = parseDouyinProfileResponse(body);
						if (parsed) {
							profile = parsed;
							profileCapturedAt = Date.now();
						} else {
							errors.push("作者 profile 接口返回了不可解析响应。");
						}
					} else {
						sawPostResponse = true;
						if (!body.trim()) errors.push("作品接口返回空响应。");
						const parsed = parseDouyinPostResponse(body, secUid, limit);
						for (const v of parsed) {
							if (!videos.some((old) => old.aweme_id === v.aweme_id)) videos.push(v);
						}
					}
				}
			} catch (e) {
				errors.push(e instanceof Error ? e.message : String(e));
			}
		};
		debuggerApi.on("message", onDebuggerMessage);

		void win.loadURL(`https://www.douyin.com/user/${encodeURIComponent(secUid)}`).catch((e) => {
			errors.push(e instanceof Error ? e.message : String(e));
		});
		const deadline = Date.now() + timeoutMs;
		while (Date.now() < deadline) {
			if (videos.length >= Math.min(limit, 5)) break;
			if (profile && (sawPostResponse || Date.now() - profileCapturedAt > 2500)) break;
			await delay(500);
		}
		debuggerApi.removeListener("message", onDebuggerMessage);
	} finally {
		try {
			if (debuggerApi.isAttached()) debuggerApi.detach();
		} catch {
			/* ignore */
		}
		if (!win.isDestroyed()) win.destroy();
	}

	return { sec_uid: secUid, profile, videos: videos.slice(0, limit), errors };
}

/**
 * 博主主页 → 最近公开视频列表。
 *
 * 保持给调用方的旧语义:拿不到作品链接就抛错。关注源追踪请用 probeDouyinUser,
 * 因为它能在作品列表失败时仍返回 profile 计数。
 */
export async function listDouyinUserVideos(
	secUidOrUrl: string,
	limit = 12,
	timeoutMs = 35_000,
): Promise<DouyinUserVideo[]> {
	const result = await probeDouyinUser(secUidOrUrl, limit, timeoutMs);
	const videos = result.videos;
	if (videos.length) return videos.slice(0, limit);
	throw new Error(
		`抖音作品接口当前没有返回可解析作品${result.errors.length ? `:${result.errors.slice(-1)[0]}` : ""}。可能需要在 Inkast 的抖音浏览器会话中登录,或稍后重试。`,
	);
}

export interface FetchedVideo {
	filePath: string;
	title: string;
}

/** 探测分享页拿 { id, 标题, 播放地址 }(不下载)。供「收藏」取标题 / fetchDouyinVideo 复用。 */
export async function fetchDouyinShareInfo(
	url: string,
): Promise<{ id: string; title: string; playUrl: string }> {
	const id = await resolveAwemeId(url);
	const { body } = await getText(`https://www.iesdouyin.com/share/video/${id}/?from_ssr=1`);
	const parsed = parseRouterData(body);
	if (!parsed)
		throw new Error(
			"抖音分享页解析失败(可能是图文帖/已删/反爬变更)。换一条公开视频链接重试;或下到本地用「选择本地视频」。",
		);
	return { id, title: parsed.title, playUrl: parsed.playUrl };
}

/** 完整流程:抖音链接 → 本地 mp4 + 标题。失败抛人话错误。 */
export async function fetchDouyinVideo(
	app: App,
	url: string,
	onProgress?: (info: { stage: "probe" | "download"; pct: number }) => void,
): Promise<FetchedVideo> {
	onProgress?.({ stage: "probe", pct: 0 });
	const { id, title, playUrl } = await fetchDouyinShareInfo(url);
	const dir = path.join(app.getPath("userData"), "analyze-downloads", `dy-${id}-${Date.now()}`);
	fs.mkdirSync(dir, { recursive: true });
	const file = path.join(dir, "video.mp4");
	await download(playUrl, file, (pct) => onProgress?.({ stage: "download", pct }));
	const st = fs.statSync(file);
	if (st.size < 1024) throw new Error("下载的视频异常(过小);可能被限流,稍后重试。");
	return { filePath: file, title };
}
