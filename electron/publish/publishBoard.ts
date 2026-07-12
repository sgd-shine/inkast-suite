// 发布看板后端(§5.5/§6.3):扫描 Publishing 文件系统 → 分阶段看板 + 文件管理。
// 分类逻辑全在 src/lib/publishBoard.ts 的映射表里。文件管理(删/改/重命名/移动)是负责人
// 2026-06-20 定调从「只读监控」扩成可写;仍只碰 Publishing 目录内的稿件,不碰发布执行/外推。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { App, IpcMain } from "electron";
import { shell } from "electron";
import {
	buildBoard,
	isEditablePath,
	isValidRename,
	type PublishBoardResult,
	type PublishFile,
	type PublishMovePair,
	type PublishMut,
	type PublishStage,
	parseFrontmatter,
	STAGE_DIR,
	uncategorizedCount,
} from "../../src/lib/publishBoard";
import { resolvePublishingRoot } from "../jobs/engineConfig";
import { atomicWriteFileSync } from "../lib/atomicWrite";

const EDITABLE_MSG = "只支持编辑文本稿件(.md/.html/.txt/.json 等)";

/** 解析 p 的真实路径:向上找到第一个已存在的祖先,realpath 它(解析符号链接),再拼回下面尚不
 *  存在的路径段。这样即便路径中段是指向外部的符号链接也会被解析出来。
 *  导出供测试(锁住 symlink 逃逸防护,防重构退回裸 path.resolve)。 */
export function realpathNearest(p: string): string {
	let cur = path.resolve(p);
	const tail: string[] = [];
	while (!fs.existsSync(cur)) {
		tail.unshift(path.basename(cur));
		const parent = path.dirname(cur);
		if (parent === cur) return cur; // 到文件系统根仍不存在,原样返回
		cur = parent;
	}
	const real = fs.realpathSync(cur);
	return tail.length ? path.join(real, ...tail) : real;
}

/** 路径白名单:解析**真实路径**(防符号链接逃逸)后,必须等于 Publishing 根或在其下。返回真实路径。
 *  ⚠️ 用 realpath 而非裸 path.resolve —— 后者不解析符号链接;Publishing 内被外部自动化写入,若
 *  被植入指向外部的 symlink,write/trash/rename/move 会跟随它操作沙箱外文件(对抗审查实测复现的
 *  越权漏洞)。realpathNearest 把路径中段的 symlink 解析出来,越界即拦。 */
export function assertInside(root: string, p: string): string {
	const rootReal = realpathNearest(root);
	const real = realpathNearest(p);
	if (real !== rootReal && !real.startsWith(`${rootReal}${path.sep}`)) {
		throw new Error("路径不在发布目录内");
	}
	return real;
}

function wrap<T>(fn: () => T): PublishMut<T> {
	try {
		return { ok: true, data: fn() };
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : String(e) };
	}
}

// 只扫这几棵子树;assets/信源候选草稿 等噪音目录跳过,避免整库遍历。
const SCAN_DIRS = ["Drafts", "Review/发布准备", "Published"];
const SKIP_DIR_NAMES = new Set(["assets", "信源候选草稿", ".git", "node_modules"]);
const MAX_FILES = 3000;
const FRONTMATTER_EXT = /\.(md|mdx|markdown)$/i;

/** 读文件首部若干字节(frontmatter 在最前;不整文件加载,避免大 html 拖慢)。 */
function readHead(abs: string, bytes = 4096): string {
	try {
		const fd = fs.openSync(abs, "r");
		try {
			const buf = Buffer.alloc(bytes);
			const n = fs.readSync(fd, buf, 0, bytes, 0);
			return buf.subarray(0, n).toString("utf8");
		} finally {
			fs.closeSync(fd);
		}
	} catch {
		return "";
	}
}

function walk(absDir: string, root: string, out: PublishFile[]): void {
	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(absDir, { withFileTypes: true });
	} catch {
		return; // 目录不存在/无权限:静默跳过(缺目录降级为空,不崩)
	}
	for (const e of entries) {
		if (out.length >= MAX_FILES) return;
		if (e.name.startsWith(".")) continue;
		const abs = path.join(absDir, e.name);
		if (e.isDirectory()) {
			if (SKIP_DIR_NAMES.has(e.name)) continue;
			walk(abs, root, out);
		} else if (e.isFile()) {
			let mtimeMs: number;
			try {
				mtimeMs = fs.statSync(abs).mtimeMs;
			} catch {
				continue;
			}
			// .md 稿件读首部解析 frontmatter(摘要/栏目/题材/封面),让看板卡片能一眼区分。
			const meta = FRONTMATTER_EXT.test(e.name) ? parseFrontmatter(readHead(abs)) : undefined;
			out.push({
				path: abs,
				name: e.name,
				relDir: path.relative(root, absDir).split(path.sep).join("/"),
				modifiedMs: mtimeMs,
				meta: meta && Object.values(meta).some(Boolean) ? meta : undefined,
			});
		}
	}
}

export function scanPublishing(app: App, nowMs: number = Date.now()): PublishBoardResult {
	const root = resolvePublishingRoot(app);
	if (!fs.existsSync(root)) {
		return {
			ok: false,
			publishingDir: root,
			stages: [],
			uncategorizedCount: 0,
			error: `发布目录不存在: ${root}`,
		};
	}
	const files: PublishFile[] = [];
	for (const sub of SCAN_DIRS) walk(path.join(root, sub), root, files);
	const stages = buildBoard(files, nowMs);
	return { ok: true, publishingDir: root, stages, uncategorizedCount: uncategorizedCount(stages) };
}

export function registerPublishBoardHandlers(ipcMain: IpcMain, app: App): void {
	const root = () => path.resolve(resolvePublishingRoot(app));

	ipcMain.handle("publishBoard:list", (): PublishBoardResult => scanPublishing(app));

	ipcMain.handle(
		"publishBoard:open",
		(_e, p: string): PublishMut<true> =>
			wrap(() => {
				shell.showItemInFolder(assertInside(root(), p));
				return true;
			}),
	);

	// ── 文件管理(可写):所有路径过 assertInside 白名单,只动 Publishing 内稿件 ──

	// 读稿件内容(内置编辑器用)。仅文本扩展名。
	ipcMain.handle(
		"publishBoard:read",
		(_e, p: string): PublishMut<string> =>
			wrap(() => {
				const abs = assertInside(root(), p);
				if (!isEditablePath(abs)) throw new Error(EDITABLE_MSG);
				if (!fs.existsSync(abs)) throw new Error("文件不存在(可能已删/移动),请刷新看板");
				return fs.readFileSync(abs, "utf8");
			}),
	);

	// 写回稿件内容。原子写(临时文件 + rename),避免写一半崩坏原稿。
	ipcMain.handle(
		"publishBoard:write",
		(_e, payload: { path: string; content: string }): PublishMut<true> =>
			wrap(() => {
				const abs = assertInside(root(), payload.path);
				if (!isEditablePath(abs)) throw new Error(EDITABLE_MSG);
				if (!fs.existsSync(abs)) throw new Error("文件不存在(可能已删/移动),请刷新看板");
				// 原子写(临时文件 + rename),避免写一半崩坏原稿;失败自动清理临时文件。
				atomicWriteFileSync(abs, payload.content);
				return true;
			}),
	);

	// 删除 → 移废纸篓(可恢复)。多文件=一个稿的全部产物。trashItem 异步。
	ipcMain.handle("publishBoard:trash", async (_e, paths: string[]): Promise<PublishMut<true>> => {
		let done = 0;
		try {
			const r = root();
			for (const p of paths) {
				const abs = assertInside(r, p);
				if (fs.existsSync(abs)) await shell.trashItem(abs);
				done++;
			}
			return { ok: true, data: true };
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			// 中途失败:已删的不回滚(trash 无可靠还原 API),如实告知进度让用户手动收尾。
			return {
				ok: false,
				error:
					paths.length > 1
						? `已移入废纸篓 ${done}/${paths.length} 个,第 ${done + 1} 个失败: ${msg}`
						: msg,
			};
		}
	});

	// 重命名(只改 basename,不跨目录)。新名过 isValidRename(防 / 和 ..)。
	ipcMain.handle(
		"publishBoard:rename",
		(_e, payload: { path: string; newName: string }): PublishMut<string> =>
			wrap(() => {
				const r = root();
				const abs = assertInside(r, payload.path);
				if (!isValidRename(payload.newName)) throw new Error("文件名非法(不能含 / 或 ..)");
				if (!fs.existsSync(abs)) throw new Error("原文件不存在,请刷新看板");
				const target = assertInside(r, path.join(path.dirname(abs), payload.newName.trim()));
				if (fs.existsSync(target)) throw new Error("同名文件已存在");
				fs.renameSync(abs, target);
				return target;
			}),
	);

	// 移动到目标阶段目录(整个稿的全部产物一起移)。先全检冲突再移,避免移一半。
	// 返回「源→新位置」配对,供前端撤销(精确改回原位置,含子目录;见 PublishMovePair)。
	ipcMain.handle(
		"publishBoard:move",
		(_e, payload: { paths: string[]; stage: PublishStage }): PublishMut<PublishMovePair[]> =>
			wrap(() => {
				const r = root();
				const sub = STAGE_DIR[payload.stage];
				if (!sub) throw new Error("无效的目标阶段(只能移到 草稿/发布准备/已发布)");
				const destDir = assertInside(r, path.join(r, sub));
				const moves: Array<[string, string]> = [];
				const seen = new Set<string>();
				for (const p of payload.paths) {
					const abs = assertInside(r, p);
					if (!fs.existsSync(abs)) continue;
					const target = path.join(destDir, path.basename(abs));
					if (path.resolve(target) === abs) continue; // 已在目标目录
					// 文件系统已有 + 批内自冲突(两个同 basename 不同子目录的文件会算出同一 target,
					// 否则后者 renameSync 会无声覆盖前者 → 数据丢失)都要拦。
					if (fs.existsSync(target) || seen.has(target))
						throw new Error(`目标已有同名文件: ${path.basename(abs)}`);
					seen.add(target);
					moves.push([abs, target]);
				}
				fs.mkdirSync(destDir, { recursive: true });
				// 逐个移动;中途失败(如外部自动化在校验后删了源文件 → ENOENT)尽力回滚已移动的,
				// 避免同一稿的多个产物被拆散在两个阶段目录。回滚也失败时如实报半移动态让用户收尾。
				const moved: Array<[string, string]> = [];
				try {
					for (const [from, to] of moves) {
						fs.renameSync(from, to);
						moved.push([from, to]);
					}
				} catch (e) {
					for (const [from, to] of moved.reverse()) {
						try {
							fs.renameSync(to, from);
						} catch {
							/* 回滚失败:保持现状,下面如实告知 */
						}
					}
					const msg = e instanceof Error ? e.message : String(e);
					throw new Error(
						moves.length > 1
							? `移动失败(第 ${moved.length + 1}/${moves.length} 个),已尝试回滚已移动的文件: ${msg}`
							: msg,
					);
				}
				return moved.map(([from, to]) => ({ from, to }));
			}),
	);

	// 撤销移动(真撤销):把每个 to 改回 from —— 精确还原原位置(含子目录)。to 已不在则跳过,
	// from 已被占用则拦。中途失败回滚已撤销的,保持一致。路径两端都过白名单。
	ipcMain.handle(
		"publishBoard:revertMove",
		(_e, pairs: PublishMovePair[]): PublishMut<true> =>
			wrap(() => {
				const r = root();
				const ops: Array<[string, string]> = []; // [to(现位置), from(原位置)]
				for (const p of pairs || []) {
					const to = assertInside(r, p.to);
					const from = assertInside(r, p.from);
					if (!fs.existsSync(to)) continue; // 现位置已不在(用户又移走了),跳过
					if (fs.existsSync(from)) throw new Error(`原位置已被占用: ${path.basename(from)}`);
					ops.push([to, from]);
				}
				const undone: Array<[string, string]> = [];
				try {
					for (const [to, from] of ops) {
						fs.mkdirSync(path.dirname(from), { recursive: true });
						fs.renameSync(to, from);
						undone.push([to, from]);
					}
				} catch (e) {
					for (const [to, from] of undone.reverse()) {
						try {
							fs.renameSync(from, to);
						} catch {
							/* 回滚失败:保持现状 */
						}
					}
					throw new Error(`撤销移动失败: ${e instanceof Error ? e.message : String(e)}`);
				}
				return true;
			}),
	);

	// 打开系统废纸篓(删除→废纸篓后给的「打开废纸篓」链接用)。trashItem 无可靠还原 API,故不
	// 假装能撤销删除,只提供这个诚实的入口让用户自己从废纸篓恢复。当前仅 macOS(~/.Trash)。
	ipcMain.handle("publishBoard:openTrash", async (): Promise<PublishMut<true>> => {
		try {
			if (process.platform !== "darwin")
				return { ok: false, error: "本平台暂不支持直接打开废纸篓" };
			const err = await shell.openPath(path.join(os.homedir(), ".Trash"));
			if (err) return { ok: false, error: err };
			return { ok: true, data: true };
		} catch (e) {
			return { ok: false, error: e instanceof Error ? e.message : String(e) };
		}
	});

	// 一键送发布看板(主线一·图文线闭环):把图文草稿落成带 frontmatter 的 .md 写进 Drafts。
	// frontmatter 主动写 sourceCardId → 选题↔发布稿的稳定关联键就地建立(不靠事后模糊匹配)。
	ipcMain.handle(
		"publishBoard:createDraft",
		(
			_e,
			payload: { title: string; content: string; sourceCardId?: string; topicType?: string },
		): PublishMut<string> =>
			wrap(() => {
				const r = root();
				const draftsDir = assertInside(r, path.join(r, STAGE_DIR.draft as string));
				fs.mkdirSync(draftsDir, { recursive: true });
				const date = new Date().toISOString().slice(0, 10);
				const safe =
					(payload.title || "未命名")
						// biome-ignore lint/suspicious/noControlCharactersInRegex: 去掉文件名非法字符含控制符
						.replace(/[/\\:*?"<>| -]/g, "")
						.trim()
						.slice(0, 40) || "未命名";
				let file = path.join(draftsDir, `${date}_${safe}.md`);
				for (let n = 1; fs.existsSync(file); n++)
					file = path.join(draftsDir, `${date}_${safe}_${n}.md`);
				const abs = assertInside(r, file);
				// 摘要:正文首个非标题非空行,截断,给看板卡片显示。
				const digest = (payload.content || "")
					.split(/\r?\n/)
					.map((l) => l.trim())
					.find((l) => l && !l.startsWith("#") && !l.startsWith("---"))
					?.slice(0, 80);
				const fm = [
					"---",
					`title: ${JSON.stringify(payload.title || safe)}`,
					`date: ${date}`,
					digest ? `digest: ${JSON.stringify(digest)}` : "",
					payload.topicType ? `topic_type: ${JSON.stringify(payload.topicType)}` : "",
					payload.sourceCardId ? `sourceCardId: ${payload.sourceCardId}` : "",
					"source: inkast",
					"---",
					"",
				]
					.filter(Boolean)
					.join("\n");
				atomicWriteFileSync(abs, fm + (payload.content || ""));
				return abs;
			}),
	);
}
