// 数字人 provider 适配器 —— 纯函数(无 node/网络依赖,可单测)。
// avatarManager 负责真正 fetch/轮询/下载;这里只把「配置 + 口播稿」映射成请求,以及把响应解析成
// { 任务 id / 状态 / 视频地址 }。HeyGen 内置(契约见 https://api.heygen.com,v2 generate + v1 status),
// 通用适配器按 GenericAvatarMapping 的 JSON 路径解析(适配国内/自建)。
import type { AvatarConfig, GenericAvatarMapping } from "../../src/lib/avatarTypes";

export interface AvatarHttpRequest {
	url: string;
	method: "GET" | "POST";
	headers: Record<string, string>;
	/** 已是对象;manager fetch 时 JSON.stringify。GET 无 body。 */
	body?: unknown;
}

export interface AvatarStatusParsed {
	status: "processing" | "done" | "failed";
	videoUrl?: string;
	error?: string;
}

const HEYGEN_BASE = "https://api.heygen.com";

/** 模板插值:{{key}} → vars[key](缺失留空)。 */
export function interpolate(template: string, vars: Record<string, string>): string {
	return template.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? "");
}

/** 点路径取值:extractByPath({a:{b:1}}, "a.b") → 1。任一段缺失→undefined。 */
export function extractByPath(obj: unknown, path: string): unknown {
	if (!path) return undefined;
	let cur: unknown = obj;
	for (const seg of path.split(".")) {
		if (cur == null || typeof cur !== "object") return undefined;
		cur = (cur as Record<string, unknown>)[seg];
	}
	return cur;
}

/** 配置自检:返回缺失项的人话提示(null=可用)。UI/manager 投料前调。 */
export function validateConfig(c: AvatarConfig): string | null {
	if (c.provider === "heygen") {
		if (!c.apiKey) return "缺少 HeyGen API Key(在数字人设置里填)。";
		if (!c.avatarId && !c.talkingPhotoId)
			return "缺少形象:填 HeyGen 的 avatar_id,或用照片生成的 talking_photo_id。";
		if (!c.voiceId) return "缺少音色 voice_id(HeyGen 后台或 /v2/voices 拿)。";
		return null;
	}
	// generic
	if (!c.generic?.submitUrl) return "通用适配器缺少提交地址(submitUrl)。";
	return null;
}

// ── HeyGen ──

export function buildHeyGenGenerate(c: AvatarConfig, script: string): AvatarHttpRequest {
	const character = c.talkingPhotoId
		? { type: "talking_photo", talking_photo_id: c.talkingPhotoId }
		: { type: "avatar", avatar_id: c.avatarId, avatar_style: "normal" };
	return {
		url: `${HEYGEN_BASE}/v2/video/generate`,
		method: "POST",
		headers: { "x-api-key": c.apiKey ?? "", "content-type": "application/json" },
		body: {
			video_inputs: [
				{ character, voice: { type: "text", input_text: script, voice_id: c.voiceId } },
			],
			dimension: { width: c.width || 1280, height: c.height || 720 },
		},
	};
}

/** 解析 generate 响应 → 远端任务 id。HeyGen v2:{ error, data:{ video_id } };容错若干形状。 */
export function parseHeyGenGenerate(json: unknown): {
	ok: boolean;
	remoteId?: string;
	error?: string;
} {
	const j = (json ?? {}) as Record<string, unknown>;
	const data = (j.data ?? {}) as Record<string, unknown>;
	const id = (data.video_id ?? j.video_id) as string | undefined;
	if (id) return { ok: true, remoteId: id };
	const err =
		(j.error as { message?: string } | string | undefined) &&
		(typeof j.error === "string" ? j.error : (j.error as { message?: string }).message);
	return { ok: false, error: err || (j.message as string) || "HeyGen 未返回 video_id" };
}

export function buildHeyGenStatus(c: AvatarConfig, remoteId: string): AvatarHttpRequest {
	return {
		url: `${HEYGEN_BASE}/v1/video_status.get?video_id=${encodeURIComponent(remoteId)}`,
		method: "GET",
		headers: { "x-api-key": c.apiKey ?? "" },
	};
}

/** 解析 status 响应。HeyGen:{ data:{ status, video_url, error } };status completed/failed/processing。 */
export function parseHeyGenStatus(json: unknown): AvatarStatusParsed {
	const j = (json ?? {}) as Record<string, unknown>;
	const data = (j.data ?? {}) as Record<string, unknown>;
	const status = String(data.status ?? "").toLowerCase();
	if (status === "completed" || status === "success" || status === "done") {
		const url = (data.video_url ?? data.video_url_caption) as string | undefined;
		return url
			? { status: "done", videoUrl: url }
			: { status: "failed", error: "已完成但无 video_url" };
	}
	if (status === "failed" || status === "error") {
		const e = data.error as { message?: string; detail?: string } | string | undefined;
		const msg = typeof e === "string" ? e : e?.message || e?.detail;
		return { status: "failed", error: msg || "HeyGen 生成失败" };
	}
	return { status: "processing" };
}

// ── 通用 HTTP 适配器 ──

function genericVars(c: AvatarConfig, script: string, jobId = ""): Record<string, string> {
	return {
		script,
		avatarId: c.avatarId ?? "",
		talkingPhotoId: c.talkingPhotoId ?? "",
		voiceId: c.voiceId ?? "",
		apiKey: c.apiKey ?? "",
		jobId,
	};
}

function mappedHeaders(headers: Record<string, string> | undefined, vars: Record<string, string>) {
	const out: Record<string, string> = {};
	for (const [k, v] of Object.entries(headers ?? {})) out[k] = interpolate(v, vars);
	return out;
}

export function buildGenericSubmit(c: AvatarConfig, script: string): AvatarHttpRequest {
	const m = c.generic as GenericAvatarMapping;
	const vars = genericVars(c, script);
	const method = m.submitMethod ?? "POST";
	const headers = mappedHeaders(m.headers, vars);
	let body: unknown;
	if (method === "POST" && m.bodyTemplate) {
		const filled = interpolate(m.bodyTemplate, {
			...vars,
			// 模板里 {{script}} 需安全嵌进 JSON 字符串 → 用 JSON.stringify 去引号注入。
			script: JSON.stringify(script).slice(1, -1),
		});
		body = JSON.parse(filled);
		if (!headers["content-type"] && !headers["Content-Type"])
			headers["content-type"] = "application/json";
	}
	return { url: interpolate(m.submitUrl, vars), method, headers, body };
}

export function parseGenericSubmit(
	json: unknown,
	m: GenericAvatarMapping,
): { ok: boolean; remoteId?: string; error?: string } {
	const id = m.jobIdPath ? extractByPath(json, m.jobIdPath) : undefined;
	if (id != null && id !== "") return { ok: true, remoteId: String(id) };
	// 无 jobIdPath:可能是单次返回视频地址(无轮询)。
	if (!m.jobIdPath && m.videoUrlPath && extractByPath(json, m.videoUrlPath))
		return { ok: true, remoteId: "" };
	return { ok: false, error: "通用适配器:按 jobIdPath 取不到任务 id(检查响应路径配置)。" };
}

/** 轮询请求;没配 statusUrl(单次返回)→ null。 */
export function buildGenericStatus(c: AvatarConfig, remoteId: string): AvatarHttpRequest | null {
	const m = c.generic as GenericAvatarMapping;
	if (!m.statusUrl) return null;
	const vars = genericVars(c, "", remoteId);
	return {
		url: interpolate(m.statusUrl, vars),
		method: m.statusMethod ?? "GET",
		headers: mappedHeaders(m.headers, vars),
	};
}

function splitValues(s: string | undefined): string[] {
	return (s ?? "")
		.split(",")
		.map((x) => x.trim().toLowerCase())
		.filter(Boolean);
}

export function parseGenericStatus(json: unknown, m: GenericAvatarMapping): AvatarStatusParsed {
	const videoUrl = m.videoUrlPath
		? (extractByPath(json, m.videoUrlPath) as string | undefined)
		: undefined;
	const statusRaw = m.statusPath
		? String(extractByPath(json, m.statusPath) ?? "").toLowerCase()
		: "";
	const done = splitValues(m.doneValues || "succeeded,success,completed,done,finished");
	const failed = splitValues(m.failedValues || "failed,error,fail");
	if (statusRaw && failed.includes(statusRaw))
		return { status: "failed", error: `状态:${statusRaw}` };
	if ((statusRaw && done.includes(statusRaw)) || (!m.statusPath && videoUrl)) {
		return videoUrl
			? { status: "done", videoUrl }
			: { status: "failed", error: "状态完成但取不到视频地址(videoUrlPath?)" };
	}
	return { status: "processing" };
}
