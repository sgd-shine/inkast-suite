import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

// 打包版(launchd 启动的 GUI app)的 PATH 极简(通常 /usr/bin:/bin:/usr/sbin:/sbin):
// 既不含 homebrew(/opt/homebrew/bin,ffmpeg 在此),也不含 node 版本管理器目录
// (.hermes / nvm / volta …,npx 在此)。而引擎(video-pipeline)内部裸名调 ffmpeg / npx /
// afconvert / say → 打包版 FileNotFound。dev(终端起的 Electron)继承完整 shell PATH,
// 所以本地测不出、只炸打包版。这里集中处理:① findBin 找绝对路径 ② augmentedPath 补全 PATH。
const EXTRA_BIN_DIRS = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"] as const;

/**
 * 找系统可执行文件的绝对路径(homebrew → /usr/local → /usr 顺序),找不到才退回裸名靠 PATH。
 * 用绝对路径调用即可不依赖子进程的 PATH(解决打包版探测/调用 ffmpeg 失败)。
 */
export function findBin(name: string, exists: (p: string) => boolean = existsSync): string {
	for (const dir of EXTRA_BIN_DIRS) {
		const p = `${dir}/${name}`;
		try {
			if (exists(p)) return p;
		} catch {
			/* ignore */
		}
	}
	return name; // 都没有 → 裸名,靠子进程的 PATH(dev 下可用)
}

// 登录 shell 的完整 PATH。打包版 GUI app 不继承它,必须主动取 —— 这样无论 node/npx 装在
// homebrew / .hermes / nvm / volta 哪里,引擎子进程都找得到。取一次缓存;跑用户自己的登录
// shell(加载其 rc),5s 超时,失败兜底空(退回下面的 EXTRA_BIN_DIRS)。
let cachedLoginPath: string | null = null;
function loginShellPath(): string {
	if (cachedLoginPath !== null) return cachedLoginPath;
	cachedLoginPath = "";
	try {
		const shell = process.env.SHELL || "/bin/zsh";
		// 用 marker 包裹再提取 —— 交互式登录 shell 的 rc(.zshrc/.zprofile)常往 stdout 打杂项
		// (如 "Restored session: …",还含时间戳的 ':'),不隔离会污染按 ':' 切分的 PATH。
		const out = execSync(`'${shell}' -ilc 'printf "__INKPATH__%s__INKEND__" "$PATH"'`, {
			timeout: 5000,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		});
		const m = /__INKPATH__([\s\S]*?)__INKEND__/.exec(out || "");
		cachedLoginPath = m ? m[1] : "";
	} catch {
		cachedLoginPath = "";
	}
	return cachedLoginPath;
}

/**
 * 给要 spawn 的子进程(引擎 / smoke 自检)拼补全的 PATH:登录 shell 完整 PATH(覆盖 node 各种
 * 装法) + 标准目录 + 现有 PATH,前置去重。`login` 可注入(测试用),默认取登录 shell。
 */
export function augmentedPath(
	base: string | undefined = process.env.PATH,
	login: string = loginShellPath(),
): string {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const seg of [login, EXTRA_BIN_DIRS.join(":"), base ?? ""]) {
		for (const d of seg.split(":")) {
			if (d && !seen.has(d)) {
				seen.add(d);
				out.push(d);
			}
		}
	}
	return out.join(":");
}
