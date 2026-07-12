// App 内 LLM 密钥配置(见 docs/下一轮_真端到端打通 任务 A · INTEGRATION §12 D-keys)。
// safeStorage 加密落 userData/keys.json,启动解密注入 process.env(JobManager spawn 引擎 / AnalyzeService
// fetch 都读 process.env,故下游零改动)。不落明文、不进 git。
import fs from "node:fs";
import path from "node:path";
import type { App, IpcMain } from "electron";
import { safeStorage } from "electron";
import type { KeyProvider, KeySaveResult, KeyStatus } from "../../src/lib/keyTypes";
import { atomicWriteFileSync } from "../lib/atomicWrite";

// provider → env 变量名(与 video-pipeline/pipeline/slidedeck.py 的映射一致)。
const ENV_NAME: Record<KeyProvider, string> = {
	anthropic: "ANTHROPIC_API_KEY",
	moonshot: "MOONSHOT_API_KEY",
	deepseek: "DEEPSEEK_API_KEY",
	qwen: "DASHSCOPE_API_KEY",
	glm: "ZHIPUAI_API_KEY",
	openai: "OPENAI_API_KEY",
};
const PROVIDERS: KeyProvider[] = ["anthropic", "moonshot", "deepseek", "qwen", "glm", "openai"];

type KeyFile = Partial<Record<KeyProvider, string>>; // provider → base64 密文

function keysPath(app: App): string {
	return path.join(app.getPath("userData"), "keys.json");
}

function readFile(app: App): KeyFile {
	try {
		return JSON.parse(fs.readFileSync(keysPath(app), "utf8")) as KeyFile;
	} catch {
		return {};
	}
}

function writeFile(app: App, data: KeyFile): void {
	// 仅本人可读写(0600):虽是密文,仍按密钥文件收紧权限。原子写防写一半崩溃截断丢全部密钥。
	atomicWriteFileSync(keysPath(app), JSON.stringify(data, null, 1), { mode: 0o600 });
}

function decrypt(b64: string): string | null {
	try {
		if (!safeStorage.isEncryptionAvailable()) return null;
		return safeStorage.decryptString(Buffer.from(b64, "base64"));
	} catch (e) {
		// 解密失败(换机/Keychain 变动):静默丢该 key,但留诊断,避免「无声消失」难排查。
		console.warn("[keys] decrypt failed; key dropped:", e instanceof Error ? e.message : e);
		return null;
	}
}

/** 启动时解密 keys.json → 写入 process.env。务必在 JobManager/AnalyzeService 初始化之前调用。 */
export function loadKeysIntoEnv(app: App): void {
	const data = readFile(app);
	for (const p of PROVIDERS) {
		const b64 = data[p];
		if (!b64) continue;
		const plain = decrypt(b64);
		if (plain) process.env[ENV_NAME[p]] = plain;
	}
}

/** 用户在 App 内(经弹窗)配置过的供应商 —— 以 keys.json 为准,不含终端 shell 继承的 env。 */
export function appConfiguredProviders(app: App): KeyProvider[] {
	const data = readFile(app);
	return PROVIDERS.filter((p) => !!data[p]);
}

/**
 * 密钥状态:以 keys.json(用户在 App 里填的)为准,**不**把终端 shell 继承的 env 算作「已配置」。
 * 否则会出现「我没填 Claude,弹窗却显示已配置」(shell 里有 stale ANTHROPIC_API_KEY 时)。
 */
export function keyStatus(app: App): KeyStatus {
	let encryptionAvailable = false;
	try {
		encryptionAvailable = safeStorage.isEncryptionAvailable();
	} catch {
		encryptionAvailable = false;
	}
	const data = readFile(app);
	const status = { encryptionAvailable } as KeyStatus;
	for (const p of PROVIDERS) status[p] = !!data[p];
	return status;
}

/** 保存(空串=清除)。加密落盘 + 即时写 process.env,下游 spawn/fetch 立即可用。 */
export function saveKey(app: App, provider: KeyProvider, key: string): KeySaveResult {
	if (!PROVIDERS.includes(provider)) return { ok: false, error: `未知 provider: ${provider}` };
	const trimmed = String(key ?? "").trim();
	const data = readFile(app);
	if (!trimmed) {
		delete data[provider];
		delete process.env[ENV_NAME[provider]];
		writeFile(app, data);
		return { ok: true };
	}
	try {
		if (!safeStorage.isEncryptionAvailable()) {
			return { ok: false, error: "系统密钥库不可用,无法安全存储(macOS Keychain 未就绪)" };
		}
		data[provider] = safeStorage.encryptString(trimmed).toString("base64");
		writeFile(app, data);
		process.env[ENV_NAME[provider]] = trimmed;
		return { ok: true };
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : String(e) };
	}
}

export function registerKeyHandlers(ipcMain: IpcMain, app: App): void {
	ipcMain.handle("keys:status", (): KeyStatus => keyStatus(app));
	ipcMain.handle(
		"keys:save",
		(_e, { provider, key }: { provider: KeyProvider; key: string }): KeySaveResult =>
			saveKey(app, provider, key),
	);
}
