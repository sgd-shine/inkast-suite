// 内容驾驶舱:读 KnowledgePlanet 每日选题 JSON 给「驾驶舱」Tab。
// 决策(见 docs/INTEGRATION.md §8):按路径接 vault,不复制;Inkast 只读 + UI。
// 写 JSON 的 runtime(Codex,库外)不在 App 内。
import fs from "node:fs";
import path from "node:path";
import type { App } from "electron";
import type { CockpitData, CockpitTodayResult } from "../../src/lib/cockpitTypes";
import type { PathSetting } from "../../src/lib/settingsTypes";
import { atomicWriteFileSync } from "../lib/atomicWrite";

// 数据目录优先级:env INKAST_COCKPIT_DIR → userData/cockpit.json → 未配置(空,UI 引导选择)。
const DEFAULT_DIR = "";

/** 是否是可用的驾驶舱目录:存在且含至少一份 YYYY-MM-DD.json。 */
export function hasCockpit(dir: string): boolean {
	try {
		if (!fs.existsSync(dir)) return false;
		return fs.readdirSync(dir).some((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f));
	} catch {
		return false;
	}
}

export function resolveCockpitDir(app: App): string {
	const env = process.env.INKAST_COCKPIT_DIR;
	if (env && fs.existsSync(env)) return env;
	try {
		const cfgPath = path.join(app.getPath("userData"), "cockpit.json");
		const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8")) as { cockpitDir?: string };
		if (cfg.cockpitDir && fs.existsSync(cfg.cockpitDir)) return cfg.cockpitDir;
	} catch {
		/* 尚无配置 */
	}
	return DEFAULT_DIR;
}

export function saveCockpitDir(app: App, cockpitDir: string): void {
	const cfgPath = path.join(app.getPath("userData"), "cockpit.json");
	atomicWriteFileSync(cfgPath, JSON.stringify({ cockpitDir }, null, 2));
}

/** 驾驶舱目录当前状态(路径 + 是否有效 + 来源),给 App 内设置面板显示。 */
export function cockpitDirInfo(app: App): PathSetting {
	const env = process.env.INKAST_COCKPIT_DIR;
	if (env && fs.existsSync(env)) return { path: env, ok: hasCockpit(env), source: "env" };
	try {
		const cfgPath = path.join(app.getPath("userData"), "cockpit.json");
		const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8")) as { cockpitDir?: string };
		if (cfg.cockpitDir)
			return { path: cfg.cockpitDir, ok: hasCockpit(cfg.cockpitDir), source: "config" };
	} catch {
		/* 尚无配置 */
	}
	return { path: DEFAULT_DIR, ok: hasCockpit(DEFAULT_DIR), source: "default" };
}

/** 读最新一天的驾驶舱 JSON(文件名 YYYY-MM-DD.json,取字典序最大=最新)。 */
function readLatest(dir: string): CockpitTodayResult {
	if (!fs.existsSync(dir)) return { ok: false, dir, error: `驾驶舱数据目录不存在: ${dir}` };
	let files: string[];
	try {
		files = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f));
	} catch (e) {
		return { ok: false, dir, error: e instanceof Error ? e.message : String(e) };
	}
	if (files.length === 0) return { ok: false, dir, error: "没有每日驾驶舱 JSON(YYYY-MM-DD.json)" };
	files.sort();
	const latest = files[files.length - 1];
	try {
		const data = JSON.parse(fs.readFileSync(path.join(dir, latest), "utf8")) as CockpitData;
		// 防御:缺失数组归一化为空,避免渲染端崩。
		const norm: CockpitData = {
			day: data.day || latest.replace(".json", ""),
			cards: data.cards || [],
			radar: data.radar || [],
			hot: data.hot || [],
			social: data.social || [],
			mp: data.mp || [],
		};
		return { ok: true, dir, day: norm.day, data: norm };
	} catch (e) {
		return { ok: false, dir, error: e instanceof Error ? e.message : String(e) };
	}
}

import type { IpcMain } from "electron";

export function registerCockpitHandlers(ipcMain: IpcMain, app: App): void {
	ipcMain.handle("cockpit:today", (): CockpitTodayResult => readLatest(resolveCockpitDir(app)));
}
