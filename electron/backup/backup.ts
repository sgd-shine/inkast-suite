// 导出备份(主线三):把 App 自有状态/配置(userData 内的 JSON)拷到用户选定目录。
// 范围:选题池(状态/观点/待办/草稿/产物回填)、关注、成片任务历史、成片供应商、数字人配置、
//       外部路径配置。**不含**媒体文件(录屏/成片/拉片报告在引擎/录屏目录,体量大、可重生成),
//       **不含**密钥 keys.json(含加密密钥,出于安全不导出)。
import fs from "node:fs";
import path from "node:path";
import { type App, type BrowserWindow, dialog, type IpcMain, shell } from "electron";
import type { BackupResult } from "../../src/lib/settingsTypes";

// userData 根下的状态/配置文件。
const ROOT_FILES = [
	"cockpit-pool.json", // 选题池:状态流转 / 观点 / 待办 / 图文草稿 / 产物回填 / 拉片注入卡
	"following.json", // 驾驶舱关注
	"produce.json", // 成片供应商
	"avatar.json", // 数字人配置(key 已 safeStorage 加密,这里是公开字段)
	"avatar-jobs.json", // 数字人任务
	"cockpit.json", // 驾驶舱目录配置
	"engine.json", // 引擎路径配置
	"publishing.json", // 发布目录配置
];
// userData 子目录下的文件:成片任务历史。
const NESTED_FILES = ["video-factory/jobs.json"];

function stamp(d: Date): string {
	const p = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function registerBackupHandlers(
	ipcMain: IpcMain,
	app: App,
	getWindow: () => BrowserWindow | null,
): void {
	ipcMain.handle("backup:export", async (): Promise<BackupResult> => {
		const win = getWindow();
		const opts = {
			title: "选择备份保存位置",
			properties: ["openDirectory" as const, "createDirectory" as const],
		};
		const picked = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
		if (picked.canceled || picked.filePaths.length === 0) return { ok: false, canceled: true };

		const userData = app.getPath("userData");
		const outDir = path.join(picked.filePaths[0], `Inkast-Backup-${stamp(new Date())}`);
		try {
			fs.mkdirSync(outDir, { recursive: true });
			const files: string[] = [];
			const skipped: string[] = [];
			for (const rel of [...ROOT_FILES, ...NESTED_FILES]) {
				const src = path.join(userData, rel);
				try {
					if (!fs.existsSync(src)) {
						skipped.push(rel);
						continue;
					}
					fs.copyFileSync(src, path.join(outDir, path.basename(rel)));
					files.push(path.basename(rel));
				} catch {
					skipped.push(rel);
				}
			}
			const manifest = {
				app: app.getName(),
				version: app.getVersion(),
				exportedAt: new Date().toISOString(),
				files,
				skipped,
				note: "Inkast App 状态/配置备份。不含媒体文件(录屏/成片/拉片报告)与密钥(keys.json)。",
			};
			fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
			shell.showItemInFolder(outDir);
			return { ok: true, dir: outDir, files, skipped };
		} catch (e) {
			return { ok: false, error: e instanceof Error ? e.message : String(e) };
		}
	});
}
