// App 内「外部路径设置」后端(负责人定调:别靠散落路径、文件被移就坏)。
// 把引擎/发布/驾驶舱三条外部路径做成 App 内可改:settings:get 报当前路径+是否有效+来源,
// settings:pick* 弹原生选目录 → 校验 → 落 userData 配置 → 即时生效(引擎热更 JobManager,
// 发布/驾驶舱每次请求都重解析配置故自动生效)。这样路径失效时 UI 里点一下重选,不必手改 JSON。
import fs from "node:fs";
import path from "node:path";
import type { App, BrowserWindow, IpcMain } from "electron";
import { dialog } from "electron";
import type { AppSettings, PickResult } from "../../src/lib/settingsTypes";
import { cockpitDirInfo, hasCockpit, saveCockpitDir } from "../cockpit/cockpit";
import {
	engineRootInfo,
	hasEngine,
	hasPublishing,
	managedEnginePath,
	publishingRootInfo,
	resolvePipelineRoot,
	saveEngineRoot,
	savePublishingRoot,
} from "../jobs/engineConfig";

// 「采用」时不复制的目录:build/output/input 是工作产物(会重建)、.git 是版本库、缓存噪音。
// .venv 与 remotion/node_modules 必须复制(引擎用相对 .venv/bin/python + 外部 uv Python + npx,
// 拷贝后软链仍指向外部 uv Python 故可用;详见 settings 设计说明)。
const ADOPT_EXCLUDE = new Set(["build", "output", "input", ".git"]);

export function registerSettingsHandlers(
	ipcMain: IpcMain,
	app: App,
	getWindow: () => BrowserWindow | null,
	/** 引擎根变更回调:让已构造的 JobManager 热更 pipelineRoot(否则要重启才生效)。 */
	onEngineRootChanged?: (root: string) => void,
): void {
	ipcMain.handle(
		"settings:get",
		(): AppSettings => ({
			engine: engineRootInfo(app),
			publishing: publishingRootInfo(app),
			cockpit: cockpitDirInfo(app),
		}),
	);

	async function pickDir(title: string): Promise<string | null> {
		const win = getWindow();
		const opts = { title, properties: ["openDirectory" as const] };
		const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
		return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0];
	}

	ipcMain.handle("settings:pickEngine", async (): Promise<PickResult> => {
		const dir = await pickDir("选择 video-pipeline 引擎目录(含 video.sh)");
		if (!dir) return { ok: false, canceled: true };
		if (!hasEngine(dir)) return { ok: false, error: "该目录里没有 video.sh,不是引擎根目录" };
		saveEngineRoot(app, dir);
		onEngineRootChanged?.(dir);
		return { ok: true, path: dir };
	});

	ipcMain.handle("settings:pickPublishing", async (): Promise<PickResult> => {
		const dir = await pickDir("选择发布目录(含 Published 或 Review/每日驾驶舱)");
		if (!dir) return { ok: false, canceled: true };
		if (!hasPublishing(dir))
			return { ok: false, error: "该目录里没有 Published / Review/每日驾驶舱,不是发布根目录" };
		savePublishingRoot(app, dir);
		return { ok: true, path: dir };
	});

	ipcMain.handle("settings:pickCockpit", async (): Promise<PickResult> => {
		const dir = await pickDir("选择驾驶舱目录(含 YYYY-MM-DD.json 每日选题)");
		if (!dir) return { ok: false, canceled: true };
		if (!hasCockpit(dir))
			return { ok: false, error: "该目录里没有每日选题(YYYY-MM-DD.json),不是驾驶舱目录" };
		saveCockpitDir(app, dir);
		return { ok: true, path: dir };
	});

	// 「采用为 App 专属副本」:把当前配置的引擎冻结复制到 userData/engine,之后 App 只用这份,
	// 用户改/移/删开发树都不影响(负责人定调 A:引擎去路径依赖)。复制保留软链(.venv/bin/python
	// 指向外部 uv Python,拷贝后仍有效),不复制 build/output/input/.git。原子:复制到 .adopting →
	// 校验 → 删旧 → rename。失败清理临时目录、不动现有引擎。
	ipcMain.handle("settings:adoptEngine", async (): Promise<PickResult> => {
		const src = resolvePipelineRoot(app);
		const dest = managedEnginePath(app);
		if (!hasEngine(src))
			return { ok: false, error: "当前引擎路径无效;请先「选择目录」指向可用引擎,再采用" };
		if (path.resolve(src) === path.resolve(dest))
			return {
				ok: false,
				error: "当前已是 App 专属副本;如需更新,先「选择目录」指向新引擎再采用",
			};
		const tmp = `${dest}.adopting`;
		try {
			await fs.promises.rm(tmp, { recursive: true, force: true });
			await fs.promises.cp(src, tmp, {
				recursive: true,
				dereference: false, // 保留软链:.venv/bin/python → 外部 uv Python(拷贝后仍有效)
				filter: (s) => {
					const rel = path.relative(src, s);
					if (!rel) return true; // 根目录本身
					if (ADOPT_EXCLUDE.has(rel.split(path.sep)[0])) return false;
					return path.basename(s) !== ".DS_Store";
				},
			});
			// 校验:video.sh 在 + .venv/bin/python 软链能解析(existsSync 跟随软链=外部 uv Python 还在)。
			if (!hasEngine(tmp) || !fs.existsSync(path.join(tmp, ".venv", "bin", "python")))
				throw new Error("复制后校验失败(缺 video.sh 或 .venv 的 python 软链失效)");
			await fs.promises.rm(dest, { recursive: true, force: true });
			await fs.promises.rename(tmp, dest);
			saveEngineRoot(app, dest);
			onEngineRootChanged?.(dest);
			return { ok: true, path: dest };
		} catch (e) {
			await fs.promises.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
			return { ok: false, error: e instanceof Error ? e.message : String(e) };
		}
	});
}
