// 数字人(云 API)共享类型 —— 渲染/preload/主进程共用,无 node 依赖。
// 方案:provider 适配器架构(负责人 2026-06-26 定:HeyGen 内置 + 通用 HTTP 适配器,不锁死一家)。
// 现实:高质量开源口型模型全是 NVIDIA CUDA,Apple Silicon Mac 本地跑不了 → 走成熟云 API。
// 口播稿(可来自拉片产出③/文案)+ 已注册的形象/音色 → 云 → MP4。

export type AvatarProviderKind = "heygen" | "generic";

/** 通用 HTTP 适配器映射(submit→poll→download 形态,JSON 路径可配,适配国内/自建/AIGCPanel)。 */
export interface GenericAvatarMapping {
	submitUrl: string;
	submitMethod?: "POST" | "GET";
	/** 额外请求头(鉴权等);Authorization 也可放这。 */
	headers?: Record<string, string>;
	/** 请求体模板(JSON 字符串),用 {{script}} / {{avatarId}} / {{voiceId}} 占位。 */
	bodyTemplate?: string;
	/** 响应里取「任务 id」的点路径(如 data.id)。 */
	jobIdPath?: string;
	/** 轮询 URL 模板,用 {{jobId}} 占位。 */
	statusUrl?: string;
	statusMethod?: "GET" | "POST";
	/** 轮询响应里取「状态」「视频地址」的点路径。 */
	statusPath?: string;
	videoUrlPath?: string;
	/** 状态判定:命中 done 视为完成、failed 视为失败(不区分大小写,逗号分隔多值)。 */
	doneValues?: string;
	failedValues?: string;
}

export interface AvatarConfig {
	provider: AvatarProviderKind;
	/** API key(safeStorage 加密落盘,不进 git;同 LLM 密钥处理)。 */
	apiKey?: string;
	/** HeyGen:形象 id(数字人)或 talking_photo_id(照片即生成,二选一)+ 音色 id。 */
	avatarId?: string;
	talkingPhotoId?: string;
	voiceId?: string;
	/** 输出分辨率(默认 1280×720)。 */
	width?: number;
	height?: number;
	/** 通用适配器映射(provider=generic 时用)。 */
	generic?: GenericAvatarMapping;
}

/** 不含密钥的可公开配置(回传渲染端用,key 只存不回显)。 */
export interface AvatarConfigPublic extends Omit<AvatarConfig, "apiKey"> {
	hasApiKey: boolean;
}

export type AvatarJobStatus = "queued" | "submitting" | "processing" | "done" | "failed";

export interface AvatarJob {
	id: string;
	title: string;
	provider: AvatarProviderKind;
	/** 口播稿(投料文本)。 */
	script: string;
	status: AvatarJobStatus;
	/** 进度提示(人话),非百分比(云端不一定给百分比)。 */
	message?: string;
	/** 供应商侧任务 id(提交后拿到)。 */
	remoteId?: string;
	/** 完成后落地的本地 mp4 绝对路径。 */
	videoPath?: string;
	error?: string;
	createdAt: string;
	finishedAt?: string;
	/** 漏斗溯源:发起本任务的驾驶舱选题 id(可选,完成回写)。 */
	sourceCardId?: string;
}

export interface AvatarResult<T> {
	ok: boolean;
	data?: T;
	error?: string;
}
