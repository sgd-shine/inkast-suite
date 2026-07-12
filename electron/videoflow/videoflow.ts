// Inkast → 110 视频剪辑项目「桥接」后端(POC,主线:录屏→后期成片)。
// 把一条 Inkast 录屏原片送进 110 工作流:在 <110>/projects/<slug>/ 建项目骨架、复制素材、
// 写 requirements/README、登记 PROJECT_INDEX.md、回传 Codex 启动提示词。
// 不碰 video-pipeline 引擎;只读 Inkast 录屏、写 110 工作区(外部目录,路径可配)。
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { type App, type IpcMain, shell } from "electron";
import {
	indexRow,
	insertIndexRow,
	PROJECT_SUBDIRS,
	readmeTemplate,
	requirementsTemplate,
	slugForProject,
	startupPrompt,
	type VideoflowProjectInput,
} from "../../src/lib/videoflow";
import { atomicWriteFileSync } from "../lib/atomicWrite";

const DEFAULT_ROOT = "";
const VIDEO_EXTS = new Set([".mp4", ".mov", ".m4v", ".webm"]);

/** 解析视频工作流工作区根:env INKAST_VIDEOFLOW_DIR → userData/videoflow.json → 未配置(空)。 */
function resolveRoot(app?: App): string {
	const env = process.env.INKAST_VIDEOFLOW_DIR;
	if (env && fs.existsSync(env)) return env;
	if (app) {
		try {
			const cfgPath = path.join(app.getPath("userData"), "videoflow.json");
			const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8")) as { videoflowRoot?: string };
			if (cfg.videoflowRoot && fs.existsSync(cfg.videoflowRoot)) return cfg.videoflowRoot;
		} catch {
			/* 尚无配置 */
		}
	}
	return DEFAULT_ROOT;
}

/** 工作区是否可用:存在且含 projects/(110 固定结构)。 */
function rootOk(root: string): boolean {
	try {
		return fs.existsSync(root) && fs.statSync(root).isDirectory();
	} catch {
		return false;
	}
}

function ymd(d: Date): string {
	const p = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}
function clock(d: Date): string {
	const p = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 唯一项目目录:slug 撞了就 -2/-3…(不覆盖已有项目)。 */
function uniqueProjectDir(projectsDir: string, slug: string): { dir: string; finalSlug: string } {
	let finalSlug = slug;
	let n = 2;
	while (fs.existsSync(path.join(projectsDir, finalSlug))) {
		finalSlug = `${slug}-${n++}`;
	}
	return { dir: path.join(projectsDir, finalSlug), finalSlug };
}

export interface VideoflowSendResult {
	ok: boolean;
	projectDir?: string;
	rawFileName?: string;
	prompt?: string;
	error?: string;
}

export function registerVideoflowHandlers(ipcMain: IpcMain, app: App): void {
	ipcMain.handle("videoflow:info", (): { ok: boolean; root: string } => {
		const root = resolveRoot(app);
		return { ok: rootOk(root), root };
	});

	ipcMain.handle(
		"videoflow:sendRecording",
		async (
			_e,
			{ path: src, title }: { path: string; title?: string },
		): Promise<VideoflowSendResult> => {
			try {
				const root = resolveRoot(app);
				if (!rootOk(root))
					return { ok: false, error: `找不到视频工作区:${root}(可设 INKAST_VIDEOFLOW_DIR)` };
				const abs = path.resolve(src);
				if (!fs.existsSync(abs)) return { ok: false, error: "录屏文件不存在" };
				if (!VIDEO_EXTS.has(path.extname(abs).toLowerCase()))
					return { ok: false, error: "不是支持的视频文件(.mp4/.mov/.m4v/.webm)" };

				const projectsDir = path.join(root, "projects");
				fs.mkdirSync(projectsDir, { recursive: true });

				const now = new Date();
				const niceTitle = (title?.trim() || path.basename(abs, path.extname(abs))).slice(0, 60);
				const slug = slugForProject(ymd(now), niceTitle);
				const { dir: projectDir, finalSlug } = uniqueProjectDir(projectsDir, slug);

				// 建子目录骨架。
				for (const sub of PROJECT_SUBDIRS) {
					fs.mkdirSync(path.join(projectDir, sub), { recursive: true });
				}

				// 复制录屏到 raw/(append-only:同名加时间戳,不覆盖)。
				let rawName = path.basename(abs);
				if (fs.existsSync(path.join(projectDir, "raw", rawName))) {
					rawName = `${path.basename(abs, path.extname(abs))}-${Date.now()}${path.extname(abs)}`;
				}
				await fsp.copyFile(abs, path.join(projectDir, "raw", rawName));

				const input: VideoflowProjectInput = {
					title: niceTitle,
					rawFileName: rawName,
					dateYmd: ymd(now),
					createdAtText: clock(now),
				};
				atomicWriteFileSync(
					path.join(projectDir, "notes", "requirements.md"),
					requirementsTemplate(input),
				);
				atomicWriteFileSync(path.join(projectDir, "README.md"), readmeTemplate(input));

				// 登记 PROJECT_INDEX.md(best-effort:失败不影响建项目)。
				try {
					const indexPath = path.join(root, "PROJECT_INDEX.md");
					const prev = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, "utf8") : "";
					const row = indexRow(finalSlug, projectDir, `Inkast 录屏送入,等待基础剪辑(${niceTitle})`);
					atomicWriteFileSync(indexPath, insertIndexRow(prev || "# 视频项目索引\n", row));
				} catch {
					/* 索引更新失败忽略 */
				}

				return {
					ok: true,
					projectDir,
					rawFileName: rawName,
					prompt: startupPrompt(projectDir, input),
				};
			} catch (e) {
				return { ok: false, error: e instanceof Error ? e.message : String(e) };
			}
		},
	);

	// 在访达打开项目目录(送入后一键定位)。
	ipcMain.handle("videoflow:openProject", (_e, dir: string): { ok: boolean } => {
		const root = resolveRoot(app);
		const abs = path.resolve(dir);
		// 白名单:只允许打开工作区内的目录。
		if (abs === root || abs.startsWith(`${root}${path.sep}`)) {
			shell.openPath(abs);
			return { ok: true };
		}
		return { ok: false };
	});
}
