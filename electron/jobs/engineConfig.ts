// 解析 video-pipeline 引擎根目录。
// 决策(见 docs/INTEGRATION.md §6/R9):引擎保持"外部路径 + 配置",不 vendor(.venv 1.9GB/arm64-only/不可重定位)。
// 优先级:环境变量 INKAST_PIPELINE_ROOT → userData/engine.json → 开发默认猜测。
import fs from "node:fs";
import path from "node:path";
import type { App } from "electron";
import type { PathSetting } from "../../src/lib/settingsTypes";
import { atomicWriteFileSync } from "../lib/atomicWrite";

export function hasEngine(root: string): boolean {
	try {
		return fs.existsSync(path.join(root, "video.sh"));
	} catch {
		return false;
	}
}

export function resolvePipelineRoot(app: App): string {
	const env = process.env.INKAST_PIPELINE_ROOT;
	if (env && hasEngine(env)) return env;
	try {
		const cfgPath = path.join(app.getPath("userData"), "engine.json");
		const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8")) as { pipelineRoot?: string };
		if (cfg.pipelineRoot && hasEngine(cfg.pipelineRoot)) return cfg.pipelineRoot;
	} catch {
		/* 尚无配置 */
	}
	// 开发默认:Inkast-Suite 与 video-pipeline 同在 40_App实验室 下(30_桌面App ↔ 40_内部工具)。
	// 打包后此猜测通常不成立 —— 届时用 INKAST_PIPELINE_ROOT 或 engine.json 覆盖,engineInfo.ready 会如实反映。
	return path.resolve(app.getAppPath(), "../../40_内部工具/video-pipeline");
}

export function saveEngineRoot(app: App, pipelineRoot: string): void {
	const cfgPath = path.join(app.getPath("userData"), "engine.json");
	atomicWriteFileSync(cfgPath, JSON.stringify({ pipelineRoot }, null, 2));
}

/** App 专属引擎副本的固定位置(「采用」会把引擎冻结复制到这里,之后不再依赖外部开发树)。 */
export function managedEnginePath(app: App): string {
	return path.join(app.getPath("userData"), "engine");
}

/** 引擎根的当前状态(路径 + 是否有效 + 来源 + 是否 App 专属副本),给 App 内设置面板显示。 */
export function engineRootInfo(app: App): PathSetting {
	const managed = managedEnginePath(app);
	const stamp = (s: PathSetting): PathSetting => ({
		...s,
		managed: path.resolve(s.path) === path.resolve(managed),
	});
	const env = process.env.INKAST_PIPELINE_ROOT;
	if (env && hasEngine(env)) return stamp({ path: env, ok: true, source: "env" });
	try {
		const cfgPath = path.join(app.getPath("userData"), "engine.json");
		const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8")) as { pipelineRoot?: string };
		if (cfg.pipelineRoot)
			return stamp({ path: cfg.pipelineRoot, ok: hasEngine(cfg.pipelineRoot), source: "config" });
	} catch {
		/* 尚无配置 */
	}
	const fallback = path.resolve(app.getAppPath(), "../../40_内部工具/video-pipeline");
	return stamp({ path: fallback, ok: hasEngine(fallback), source: "default" });
}

// ── 发布看板数据根(§5.5/§6.3):KnowledgePlanet/Operations/Publishing,只读扫描 ──
// 优先级与引擎一致:环境变量 INKAST_PUBLISHING_DIR → userData/publishing.json → 未配置(空)。
const DEFAULT_PUBLISHING_DIR = "";

export function hasPublishing(root: string): boolean {
	try {
		if (!root) return false;
		// 哨兵:Publishing 下必有 Review/每日驾驶舱(vault)与 Published 两层。
		return (
			fs.existsSync(path.join(root, "Published")) ||
			fs.existsSync(path.join(root, "Review", "每日驾驶舱"))
		);
	} catch {
		return false;
	}
}

export function resolvePublishingRoot(app: App): string {
	const env = process.env.INKAST_PUBLISHING_DIR;
	if (env && hasPublishing(env)) return env;
	try {
		const cfgPath = path.join(app.getPath("userData"), "publishing.json");
		const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8")) as { publishingRoot?: string };
		if (cfg.publishingRoot && hasPublishing(cfg.publishingRoot)) return cfg.publishingRoot;
	} catch {
		/* 尚无配置 */
	}
	return DEFAULT_PUBLISHING_DIR;
}

export function savePublishingRoot(app: App, publishingRoot: string): void {
	const cfgPath = path.join(app.getPath("userData"), "publishing.json");
	atomicWriteFileSync(cfgPath, JSON.stringify({ publishingRoot }, null, 2));
}

/** 发布看板根的当前状态(路径 + 是否有效 + 来源)。 */
export function publishingRootInfo(app: App): PathSetting {
	const env = process.env.INKAST_PUBLISHING_DIR;
	if (env && hasPublishing(env)) return { path: env, ok: true, source: "env" };
	try {
		const cfgPath = path.join(app.getPath("userData"), "publishing.json");
		const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8")) as { publishingRoot?: string };
		if (cfg.publishingRoot)
			return { path: cfg.publishingRoot, ok: hasPublishing(cfg.publishingRoot), source: "config" };
	} catch {
		/* 尚无配置 */
	}
	return {
		path: DEFAULT_PUBLISHING_DIR,
		ok: hasPublishing(DEFAULT_PUBLISHING_DIR),
		source: "default",
	};
}
