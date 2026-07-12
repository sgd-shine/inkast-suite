// 资料库:统一列出 录屏原档 + 成片 + 拉片报告(都按路径读,不复制)。
import fs from "node:fs";
import path from "node:path";
import { type App, type IpcMain, shell } from "electron";
import type { LibraryItem, LibraryKind, LibraryResult } from "../../src/lib/libraryTypes";
import { resolvePipelineRoot } from "../jobs/engineConfig";

const VIDEO_EXTS = new Set([".mp4", ".mov", ".m4v"]);

function recordingsDir(app: App): string {
	return path.join(app.getPath("userData"), "recordings");
}

/** 列目录下的视频文件(按修改时间倒序,限量)。 */
function listVideos(dir: string, kind: LibraryKind, limit = 60): LibraryItem[] {
	let names: string[];
	try {
		names = fs.readdirSync(dir);
	} catch {
		return [];
	}
	const items: LibraryItem[] = [];
	for (const name of names) {
		if (!VIDEO_EXTS.has(path.extname(name).toLowerCase())) continue;
		const abs = path.join(dir, name);
		try {
			const st = fs.statSync(abs);
			if (!st.isFile()) continue;
			items.push({ name, path: abs, kind, sizeBytes: st.size, modifiedMs: st.mtimeMs });
		} catch {
			/* 跳过读不到的 */
		}
	}
	items.sort((a, b) => (b.modifiedMs ?? 0) - (a.modifiedMs ?? 0));
	return items.slice(0, limit);
}

/** 列拉片报告:output/analyses/<slug>/ 每个目录一条。 */
function listAnalyses(outputDir: string, limit = 60): LibraryItem[] {
	const dir = path.join(outputDir, "analyses");
	let names: string[];
	try {
		names = fs.readdirSync(dir);
	} catch {
		return [];
	}
	const items: LibraryItem[] = [];
	for (const name of names) {
		const abs = path.join(dir, name);
		try {
			const st = fs.statSync(abs);
			if (!st.isDirectory()) continue;
			// 优先指向 report.md(若有),便于直接打开。
			const report = path.join(abs, "report.md");
			const target = fs.existsSync(report) ? report : abs;
			items.push({ name, path: target, kind: "analysis", modifiedMs: st.mtimeMs });
		} catch {
			/* 跳过 */
		}
	}
	items.sort((a, b) => (b.modifiedMs ?? 0) - (a.modifiedMs ?? 0));
	return items.slice(0, limit);
}

export function registerLibraryHandlers(ipcMain: IpcMain, app: App): void {
	ipcMain.handle("library:list", (): LibraryResult => {
		const recDir = recordingsDir(app);
		const outputDir = path.join(resolvePipelineRoot(app), "output");
		try {
			return {
				ok: true,
				recordingsDir: recDir,
				outputDir,
				data: {
					recordings: listVideos(recDir, "recording"),
					films: listVideos(outputDir, "film"),
					analyses: listAnalyses(outputDir),
				},
			};
		} catch (e) {
			return {
				ok: false,
				recordingsDir: recDir,
				outputDir,
				error: e instanceof Error ? e.message : String(e),
			};
		}
	});

	const within = (abs: string): boolean => {
		const recDir = path.resolve(recordingsDir(app));
		const outputDir = path.resolve(path.join(resolvePipelineRoot(app), "output"));
		const ok = (root: string) => abs === root || abs.startsWith(`${root}${path.sep}`);
		return ok(recDir) || ok(outputDir);
	};

	// 只允许打开 录屏目录 / 引擎 output 目录内的路径(白名单,按目录段边界,防 recordings-evil 前缀碰撞)。
	ipcMain.handle("library:open", (_e, p: string) => {
		const abs = path.resolve(p);
		if (!within(abs)) return { ok: false, error: "路径不在资料库目录内" };
		shell.showItemInFolder(abs);
		return { ok: true };
	});

	// 读文本文件(拉片报告 .md 站内预览用);白名单内、仅文本扩展名、限大小防误读大文件。
	ipcMain.handle(
		"library:read",
		(_e, p: string): { ok: boolean; data?: string; error?: string } => {
			const abs = path.resolve(p);
			if (!within(abs)) return { ok: false, error: "路径不在资料库目录内" };
			if (!/\.(md|txt|json|srt|html)$/i.test(abs))
				return { ok: false, error: "只支持预览文本文件" };
			try {
				const st = fs.statSync(abs);
				if (st.size > 2_000_000) return { ok: false, error: "文件过大,请在访达打开" };
				return { ok: true, data: fs.readFileSync(abs, "utf8") };
			} catch (e) {
				return { ok: false, error: e instanceof Error ? e.message : String(e) };
			}
		},
	);
}
