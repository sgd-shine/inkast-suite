// LLM 密钥配置共享类型(渲染/preload/主进程共用,无 node 依赖)。
// 密钥经 Electron safeStorage 加密落 userData/keys.json,启动解密注入 process.env;不落明文、不进 git。
// 引擎(video-pipeline slidedeck)+ 拉片支持的全部供应商。拉片视觉只用 anthropic/moonshot;
// 成片(SLIDES_PROVIDER)六个都行。各自对应的 env key 见 electron/keys/keyStore.ts。
export type KeyProvider = "anthropic" | "moonshot" | "deepseek" | "qwen" | "glm" | "openai";

export type KeyStatus = Record<KeyProvider, boolean> & {
	/** 系统密钥库(macOS Keychain)是否可用 —— 不可用则无法安全存储。 */
	encryptionAvailable: boolean;
};

/** 成片(翻页拆页)可锁定的供应商;"auto" = 不锁定,引擎按可用 key 自动选。 */
export type SlidesProvider = KeyProvider | "auto";

export interface KeySaveResult {
	ok: boolean;
	error?: string;
}
